// Calcula frete via Nuvemshop. Retorna lista de opções normalizadas.
const NS_API = "https://api.tiendanube.com/v1";
const UA = "Douramor Agente IA (contato@douramor.com.br)";

export type OpcaoFrete = { nome: string; preco: number; prazo_dias: number | null; chega?: string | null };

export function extrairCep(texto: string): string | null {
  const m = texto.match(/\b(\d{5})-?(\d{3})\b/);
  return m ? `${m[1]}${m[2]}` : null;
}

export function detectaIntencaoFrete(texto: string): boolean {
  const t = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  // "prazo" sozinho dava falso-positivo ("prazo da garantia/troca") — exige contexto de entrega.
  return /(frete|entrega|envio|chega(r)?(\s+em)?|prazo\s+(de\s+)?(entrega|envio)|prazo\s+(pra|para)\s+chegar|quanto.*(?:mandar|enviar|frete|entreg)|sedex|pac\b|correios|transportadora|cep|demora\s+(pra|para)\s+chegar|dias\s+(uteis|pra))/.test(t);
}

type Conn = { store_id: string; access_token: string; dominio_loja?: string | null };

// ─── Cache de conexão NS (evita SELECT por request) ───────────────────────────
let _connCache: { conn: Conn; expira: number } | null = null;
const CONN_TTL_MS = 5 * 60 * 1000; // 5 minutos

export async function carregarConexaoNS(supabase: any): Promise<Conn | null> {
  const agora = Date.now();
  if (_connCache && agora < _connCache.expira) return _connCache.conn;
  const { data } = await supabase
    .from("nuvemshop_connections")
    .select("store_id, access_token, dominio_loja")
    .order("atualizado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  _connCache = { conn: data, expira: agora + CONN_TTL_MS };
  return data;
}

type Item = { variant_id?: string | null; product_id?: string | null; quantity: number; product_url?: string | null };

function lojaBase(conn: Conn, productUrl?: string | null): string | null {
  const raw = conn.dominio_loja || productUrl || null;
  if (!raw) return null;
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withScheme);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

// Resolve variant_id para um único item. Adiciona timeout de 8s.
async function resolverVariantId(conn: Conn, item: Item): Promise<string | null> {
  if (item.variant_id) return String(item.variant_id);
  if (!item.product_id) return null;
  const url = `${NS_API}/${conn.store_id}/products/${item.product_id}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Authentication: `bearer ${conn.access_token}`,
        "User-Agent": UA,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) return null;
    const product = await res.json().catch(() => null);
    const variant = product?.variants?.[0]?.id;
    return variant != null ? String(variant) : null;
  } finally {
    clearTimeout(timer);
  }
}

// Resolve variant_id para todos os itens de uma vez.
async function resolverVariantIds(conn: Conn, itens: Item[]): Promise<(string | null)[]> {
  return Promise.all(itens.map((item) => resolverVariantId(conn, item)));
}

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`${name}="([^"]*)"`, "i");
  return tag.match(re)?.[1]?.trim() ?? null;
}

function parsePreco(value: string | null): number {
  if (!value) return 0;
  const clean = value.replace(/\s/g, "").replace(/R\$/i, "").replace(/\./g, "").replace(",", ".");
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}

function parseOpcoesDoHtml(html: string): OpcaoFrete[] {
  const inputs = html.match(/<input[^>]+class="[^"]*js-shipping-method[^"]*"[^>]*>/gi) ?? [];
  if (inputs.length === 0) {
    console.warn("[frete-ns-storefront] HTML sem inputs js-shipping-method — template pode ter mudado");
  }
  const opcoes = inputs.map((tag) => {
    const nomeRaw = attr(tag, "data-name") ?? "Frete";
    const dataCost = attr(tag, "data-cost");
    const dataPrice = attr(tag, "data-price");
    // Usa data-cost (custo real da transportadora) como fonte principal.
    // data-price pode ser 0 por promoção de frete grátis e não reflete o valor real.
    const preco = dataCost != null ? parsePreco(dataCost) : (dataPrice != null ? Number(dataPrice) || 0 : 0);
    // Extrai o nome curto (antes do " - Chega") e a estimativa de entrega
    const dashIdx = nomeRaw.indexOf(" - Chega");
    const nome = (dashIdx > -1 ? nomeRaw.slice(0, dashIdx) : nomeRaw).replace(/\s+/g, " ").trim();
    const chegaStr = dashIdx > -1 ? nomeRaw.slice(dashIdx + 3).trim() : null; // "Chega entre..."
    return { nome, preco, prazo_dias: null as number | null, chega: chegaStr };
  }).filter((o) => o.preco >= 0 && o.nome.length > 0);
  const seen = new Set<string>();
  return opcoes.filter((o) => {
    const key = `${o.nome}-${o.preco}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Cache de frete em memória por (cep + variant_ids) ────────────────────────
type FreteCache = { resultado: { ok: true; opcoes: OpcaoFrete[] }; expira: number };
const _freteCache = new Map<string, FreteCache>();
const FRETE_TTL_MS = 10 * 60 * 1000; // 10 minutos

function freteChave(cep: string, variantIds: (string | null)[]): string {
  return `${cep.replace(/\D/g, "")}:${variantIds.filter(Boolean).join(",")}`;
}

function fetchComTimeout(url: string, init: RequestInit, timeoutMs = 9000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export async function calcularFreteNuvemshop(params: {
  conn: Conn;
  cep: string;
  itens: Item[];
}): Promise<{ ok: true; opcoes: OpcaoFrete[] } | { ok: false; erro: string }> {
  const { conn, cep, itens } = params;
  if (!itens.length) return { ok: false, erro: "Sem itens para cotação." };

  try {
    // Resolve variant_id para TODOS os itens (não só o primeiro)
    const variantIds = await resolverVariantIds(conn, itens);
    const primeiroVariantId = variantIds[0];
    if (!primeiroVariantId) return { ok: false, erro: "Produto sem variante Nuvemshop para cotação." };

    // Verifica cache antes de chamar a API
    const chaveCache = freteChave(cep, variantIds);
    const agora = Date.now();
    const cached = _freteCache.get(chaveCache);
    if (cached && agora < cached.expira) {
      return cached.resultado;
    }

    // Usa a API Admin primeiro — retorna valores REAIS da transportadora sem aplicar promoções.
    // O storefront /frete/ aplica regras de frete grátis e retorna R$0, o que é enganoso quando
    // o cliente ainda não atingiu o valor mínimo para a promoção.
    const adminUrl = `${NS_API}/${conn.store_id}/orders/shipping_quote`;
    const adminBody = {
      // Cada item usa seu próprio variant_id resolvido (não o do primeiro para todos)
      items: itens.map((item, idx) => ({
        variant_id: Number(variantIds[idx] ?? primeiroVariantId),
        quantity: item.quantity,
      })),
      shipping_address: { zipcode: cep.replace(/\D/g, "") },
    };
    const adminRes = await fetchComTimeout(adminUrl, {
      method: "POST",
      headers: {
        Authentication: `bearer ${conn.access_token}`,
        "User-Agent": UA,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(adminBody),
    });
    const adminTxt = await adminRes.text();
    if (adminRes.ok) {
      let adminJson: any;
      try { adminJson = JSON.parse(adminTxt); } catch { adminJson = null; }
      if (adminJson) {
        // API Admin retorna objeto (nunca array direto), priorizar rates > shipping_options > options
        const lista: any[] = Array.isArray(adminJson)
          ? adminJson
          : (adminJson?.rates?.length ? adminJson.rates
            : adminJson?.shipping_options?.length ? adminJson.shipping_options
            : adminJson?.options?.length ? adminJson.options
            : []);
        const opcoes: OpcaoFrete[] = lista.map((r: any) => ({
          nome: String(r.name ?? r.shipping_name ?? r.title ?? r.carrier ?? "Frete"),
          // Null-check explícito: r.price === 0 (frete grátis) é válido; usa cost/amount só se price ausente
          preco: r.price != null ? Number(r.price) : (r.cost != null ? Number(r.cost) : Number(r.amount ?? 0)),
          prazo_dias: r.delivery_time != null ? Number(r.delivery_time) : r.days != null ? Number(r.days) : null,
          chega: null,
        })).filter((o) => o.preco >= 0 && o.nome.length > 0);
        if (opcoes.length) {
          opcoes.sort((a, b) => a.preco - b.preco);
          const resultado = { ok: true as const, opcoes: opcoes.slice(0, 4) };
          _freteCache.set(chaveCache, { resultado, expira: agora + FRETE_TTL_MS });
          return resultado;
        }
      }
      console.error("[frete-ns-admin] sem opções", adminTxt.slice(0, 400));
    } else {
      console.error("[frete-ns-admin] status", adminRes.status, adminTxt.slice(0, 400));
    }

    // Fallback: storefront /frete/ (retorna preço promocional, mas é melhor que nada)
    const base = lojaBase(conn, itens[0].product_url);
    if (!base) {
      console.warn("[frete-ns-storefront] lojaBase retornou null — dominio_loja ausente e product_url ausente");
    }
    const baseUrl = base ?? "https://www.douramor.com.br";
    const form = new URLSearchParams({
      cep: cep.replace(/\D/g, ""),
      variant_id: primeiroVariantId,
      quantity: String(Math.max(1, itens[0].quantity || 1)),
      originShippingCalculation: "productDetail",
    });
    const storefrontRes = await fetchComTimeout(`${baseUrl}/frete/`, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        Referer: itens[0].product_url || baseUrl,
      },
      body: form.toString(),
    });
    const storefrontTxt = await storefrontRes.text();
    if (storefrontRes.ok) {
      let payload: any = null;
      try { payload = JSON.parse(storefrontTxt); } catch { payload = null; }
      if (payload?.success && payload?.html) {
        const opcoesStorefront = parseOpcoesDoHtml(String(payload.html));
        if (opcoesStorefront.length) {
          opcoesStorefront.sort((a, b) => a.preco - b.preco);
          const resultado = { ok: true as const, opcoes: opcoesStorefront.slice(0, 4) };
          _freteCache.set(chaveCache, { resultado, expira: agora + FRETE_TTL_MS });
          return resultado;
        }
      }
    }

    return { ok: false, erro: "Não foi possível calcular o frete." };
  } catch (e: any) {
    console.error("[frete-ns] exception", e);
    // Sanitiza mensagem de erro — não expõe URLs internas, tokens ou detalhes de rede
    const msg = e?.name === "AbortError"
      ? "Tempo limite excedido ao consultar frete."
      : "Erro ao consultar frete. Tente novamente.";
    return { ok: false, erro: msg };
  }
}

// Busca um produto AO VIVO na Nuvemshop (fonte mais correta de preço/estoque/foto/link)
// para o momento de mostrar o produto ao cliente. Retorna null se falhar — o chamador
// usa os dados sincronizados do banco como fallback (cliente nunca fica sem o card).
function pickLangNS(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as Record<string, string | undefined>;
    return o.pt ?? o.es ?? o.en ?? Object.values(o)[0] ?? null;
  }
  return null;
}

export async function buscarProdutoNuvemshopLive(
  conn: Conn,
  productId: string | number,
): Promise<{ nome: string | null; preco: number | null; url: string | null; foto: string | null; estoque: number | null } | null> {
  try {
    const res = await fetchComTimeout(
      `${NS_API}/${conn.store_id}/products/${productId}`,
      { headers: { Authentication: `bearer ${conn.access_token}`, "User-Agent": UA, "Content-Type": "application/json" } },
      7000,
    );
    if (!res.ok) return null;
    const p: any = await res.json().catch(() => null);
    if (!p) return null;
    const variant = p.variants?.[0];
    return {
      nome: pickLangNS(p.name),
      preco: variant?.price != null ? Number(variant.price) : null,
      url: p.permalink ?? p.canonical_url ?? null,
      foto: p.images?.[0]?.src ?? null,
      estoque: variant?.stock == null ? null : Number(variant.stock),
    };
  } catch {
    return null;
  }
}

export function formatarOpcoes(opcoes: OpcaoFrete[]): string {
  return opcoes.map((o) => {
    const valor = o.preco === 0 ? "GRÁTIS" : `R$ ${o.preco.toFixed(2).replace(".", ",")}`;
    const prazo = o.prazo_dias != null ? ` (~${o.prazo_dias} dias úteis)` : "";
    return `- ${o.nome}: ${valor}${prazo}`;
  }).join("\n");
}

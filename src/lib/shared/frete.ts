// Calcula frete via Nuvemshop. Retorna lista de opções normalizadas.
const NS_API = "https://api.tiendanube.com/v1";
const UA = "Douramor Agente IA (contato@douramor.com.br)";

export type OpcaoFrete = { nome: string; preco: number; prazo_dias: number | null; chega?: string | null };

export function extrairCep(texto: string): string | null {
  const m = texto.match(/\b(\d{5})-?(\d{3})\b/);
  return m ? `${m[1]}${m[2]}` : null;
}

export function detectaIntencaoFrete(texto: string): boolean {
  const t = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /(frete|entrega|envio|chega(r)?(\s+em)?|prazo|quanto.*(?:mandar|enviar|frete|entreg)|sedex|pac\b|correios|transportadora|cep|demora\s+(pra|para)\s+chegar|dias\s+(uteis|pra))/.test(t);
}

type Conn = { store_id: string; access_token: string; dominio_loja?: string | null };

export async function carregarConexaoNS(supabase: any): Promise<Conn | null> {
  const { data } = await supabase
    .from("nuvemshop_connections")
    .select("store_id, access_token, dominio_loja")
    .order("atualizado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
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

async function resolverVariantId(conn: Conn, item: Item): Promise<string | null> {
  if (item.variant_id) return String(item.variant_id);
  if (!item.product_id) return null;
  const url = `${NS_API}/${conn.store_id}/products/${item.product_id}`;
  const res = await fetch(url, {
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
  }).filter((o) => o.nome && o.preco >= 0);
  const seen = new Set<string>();
  return opcoes.filter((o) => {
    const key = `${o.nome}-${o.preco}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function calcularFreteNuvemshop(params: {
  conn: Conn;
  cep: string;
  itens: Item[];
}): Promise<{ ok: true; opcoes: OpcaoFrete[] } | { ok: false; erro: string }> {
  const { conn, cep, itens } = params;
  if (!itens.length) return { ok: false, erro: "Sem itens para cotação." };

  try {
    const variantId = await resolverVariantId(conn, itens[0]);
    if (!variantId) return { ok: false, erro: "Produto sem variante Nuvemshop para cotação." };

    // A Nuvemshop não expõe cotação como endpoint da API Admin da loja; o próprio storefront usa /frete/.
    // Chamamos o mesmo endpoint público da loja, com variant_id + CEP, e extraímos as opções retornadas.
    const base = lojaBase(conn, itens[0].product_url) ?? "https://www.douramor.com.br";
    const form = new URLSearchParams({
      cep: cep.replace(/\D/g, ""),
      variant_id: variantId,
      quantity: String(Math.max(1, itens[0].quantity || 1)),
      originShippingCalculation: "productDetail",
    });

    const storefrontRes = await fetch(`${base}/frete/`, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        Referer: itens[0].product_url || base,
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
          return { ok: true, opcoes: opcoesStorefront.slice(0, 4) };
        }
      }
      console.error("[frete-ns-storefront] sem opções", storefrontTxt.slice(0, 400));
    } else {
      console.error("[frete-ns-storefront] status", storefrontRes.status, storefrontTxt.slice(0, 400));
    }

    const url = `${NS_API}/${conn.store_id}/orders/shipping_quote`;
    const body = {
      items: itens.map((i) => ({ variant_id: Number(i.variant_id ?? variantId), quantity: i.quantity })),
      shipping_address: { zipcode: cep.replace(/\D/g, "") },
    };
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authentication: `bearer ${conn.access_token}`,
        "User-Agent": UA,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const txt = await res.text();
    if (!res.ok) {
      console.error("[frete-ns] status", res.status, txt.slice(0, 400));
      return { ok: false, erro: `Nuvemshop ${res.status}: ${txt.slice(0, 200)}` };
    }
    let json: any;
    try { json = JSON.parse(txt); } catch { return { ok: false, erro: "Resposta inválida da Nuvemshop." }; }

    // Resposta pode vir em formatos: array direto, ou { rates: [...] }, ou { shipping_options: [...] }
    const lista: any[] = Array.isArray(json) ? json
      : (json?.rates ?? json?.shipping_options ?? json?.options ?? []);

    const opcoes: OpcaoFrete[] = lista.map((r: any) => ({
      nome: String(r.name ?? r.shipping_name ?? r.title ?? r.carrier ?? "Frete"),
      preco: Number(r.price ?? r.cost ?? r.amount ?? 0),
      prazo_dias: r.delivery_time != null ? Number(r.delivery_time)
        : r.days != null ? Number(r.days)
        : r.min_delivery_date && r.max_delivery_date ? null
        : null,
    })).filter((o) => o.preco >= 0 && o.nome);

    if (!opcoes.length) return { ok: false, erro: "Nenhuma opção de frete retornada." };
    // Ordena do mais barato pro mais caro
    opcoes.sort((a, b) => a.preco - b.preco);
    return { ok: true, opcoes: opcoes.slice(0, 4) };
  } catch (e) {
    console.error("[frete-ns] exception", e);
    return { ok: false, erro: (e as Error).message };
  }
}

export function formatarOpcoes(opcoes: OpcaoFrete[]): string {
  return opcoes.map((o) => {
    const valor = o.preco === 0 ? "GRÁTIS" : `R$ ${o.preco.toFixed(2).replace(".", ",")}`;
    const prazo = o.prazo_dias != null ? ` (~${o.prazo_dias} dias úteis)` : "";
    return `- ${o.nome}: ${valor}${prazo}`;
  }).join("\n");
}

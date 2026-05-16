// Calcula frete via API Nuvemshop. Retorna lista de opções normalizadas.
const NS_API = "https://api.tiendanube.com/v1";
const UA = "Douramor Agente IA (contato@douramor.com.br)";

export type OpcaoFrete = { nome: string; preco: number; prazo_dias: number | null };

export function extrairCep(texto: string): string | null {
  const m = texto.match(/\b(\d{5})-?(\d{3})\b/);
  return m ? `${m[1]}${m[2]}` : null;
}

export function detectaIntencaoFrete(texto: string): boolean {
  const t = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /(frete|entrega|envio|chega(r)?\s+em|prazo|quanto.*(?:mandar|enviar)|cep)/.test(t);
}

type Conn = { store_id: string; access_token: string };

export async function carregarConexaoNS(supabase: any): Promise<Conn | null> {
  const { data } = await supabase
    .from("nuvemshop_connections")
    .select("store_id, access_token")
    .order("atualizado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

type Item = { variant_id: string; quantity: number };

export async function calcularFreteNuvemshop(params: {
  conn: Conn;
  cep: string;
  itens: Item[];
}): Promise<{ ok: true; opcoes: OpcaoFrete[] } | { ok: false; erro: string }> {
  const { conn, cep, itens } = params;
  if (!itens.length) return { ok: false, erro: "Sem itens para cotação." };

  const url = `${NS_API}/${conn.store_id}/orders/shipping_quote`;
  const body = {
    items: itens.map((i) => ({ variant_id: Number(i.variant_id), quantity: i.quantity })),
    shipping_address: { zipcode: cep.replace(/\D/g, "") },
  };

  try {
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

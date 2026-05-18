// Webhook Nuvemshop → sincroniza produtos e pedidos em tempo real
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const NS_BASE = "https://api.nuvemshop.com.br/v1";

type Payload = {
  store_id?: number | string;
  event?: string;
  id?: number | string;
};

function mapCategoria(nome: string): string {
  const n = nome.toLowerCase();
  if (/brinco|argola|ear/.test(n)) return "brinco";
  if (/colar|corrente|gargantilha|cord[aã]o/.test(n)) return "colar";
  if (/anel|alian[çc]a|solit[aá]rio/.test(n)) return "anel";
  if (/pulseira|bracelete/.test(n)) return "pulseira";
  if (/conjunto|kit/.test(n)) return "conjunto";
  if (/tornozeleira/.test(n)) return "pulseira";
  if (/piercing/.test(n)) return "piercing";
  return "outro";
}

async function nsFetch(storeId: string, token: string, path: string) {
  const r = await fetch(`${NS_BASE}/${storeId}${path}`, {
    headers: {
      Authentication: `bearer ${token}`,
      "User-Agent": "Douramor Agente IA (suporte@douramor.com)",
      "Content-Type": "application/json",
    },
  });
  if (!r.ok) throw new Error(`NS ${r.status} ${path}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function syncProduto(supabase: any, storeId: string, token: string, productId: string | number) {
  const p = await nsFetch(storeId, token, `/products/${productId}`);
  const nome = p.name?.pt ?? p.name?.["pt-BR"] ?? p.name?.es ?? (typeof p.name === "string" ? p.name : "") ?? `Produto ${productId}`;
  const descricao = p.description?.pt ?? p.description?.["pt-BR"] ?? (typeof p.description === "string" ? p.description : "") ?? "";
  const variants: any[] = p.variants ?? [];
  const v0 = variants[0] ?? {};
  const preco = Number(v0.promotional_price ?? v0.price ?? 0);
  const estoque = variants.reduce((s, v) => s + Number(v.stock ?? 0), 0);
  const ativo = p.published !== false;
  const imagem = p.images?.[0]?.src ?? null;
  const url_produto = p.canonical_url ?? p.permalink ?? null;
  const status = !ativo ? "inativo" : estoque <= 0 ? "esgotado" : "disponivel";

  const { data: existing } = await supabase.from("produtos").select("id").eq("nuvemshop_product_id", String(productId)).maybeSingle();
  const row: any = {
    nuvemshop_product_id: String(productId),
    nome,
    descricao,
    preco,
    quantidade_estoque: estoque,
    status,
    categoria: mapCategoria(nome),
    url_foto: imagem,
    url_produto,
    sincronizado_em: new Date().toISOString(),
  };
  if (existing?.id) {
    await supabase.from("produtos").update(row).eq("id", existing.id);
  } else {
    await supabase.from("produtos").insert(row);
  }
}

async function deleteProduto(supabase: any, productId: string | number) {
  await supabase.from("produtos").update({ status: "inativo" }).eq("nuvemshop_product_id", String(productId));
}

async function syncPedido(supabase: any, storeId: string, token: string, orderId: string | number) {
  const o = await nsFetch(storeId, token, `/orders/${orderId}`);
  const nomeCli = [o.customer?.name, o.customer?.last_name].filter(Boolean).join(" ").trim() || null;
  const contato = (o.customer?.phone ?? o.customer?.email ?? "").replace(/\D/g, "") || `nshop:${o.customer?.id ?? orderId}`;

  let cliId: string | null = null;
  if (contato) {
    const { data: cli } = await supabase.from("clientes").select("id").eq("contato", contato).maybeSingle();
    if (cli) cliId = cli.id;
    else {
      const { data: novo } = await supabase.from("clientes").insert({ contato, nome: nomeCli, canal_origem: "outro" }).select("id").single();
      cliId = novo?.id ?? null;
    }
  }

  const produtosSnap = (o.products ?? []).map((it: any) => ({
    nome: it.name,
    qtd: it.quantity,
    preco: Number(it.price),
    nuvemshop_product_id: String(it.product_id),
  }));
  const ids: string[] = [];
  for (const it of o.products ?? []) {
    const { data: p } = await supabase.from("produtos").select("id").eq("nuvemshop_product_id", String(it.product_id)).maybeSingle();
    if (p?.id) ids.push(p.id);
  }

  const statusMap: Record<string, string> = {
    open: "novo",
    pending: "novo",
    paid: "confirmado",
    authorized: "confirmado",
    cancelled: "cancelado",
    closed: "entregue",
    shipped: "enviado",
  };
  const status = statusMap[o.status] ?? statusMap[o.payment_status] ?? "novo";

  const row: any = {
    nuvemshop_order_id: String(orderId),
    cliente_id: cliId,
    canal: "outro",
    produtos_ids: ids,
    produtos_snapshot: produtosSnap,
    valor_subtotal: Number(o.subtotal ?? 0),
    valor_total: Number(o.total ?? 0),
    status,
    endereco_entrega: o.shipping_address ? `${o.shipping_address.address ?? ""}, ${o.shipping_address.city ?? ""} - ${o.shipping_address.province ?? ""}` : null,
    atualizado_em: new Date().toISOString(),
  };

  const { data: existing } = await supabase.from("pedidos")
    .select("id")
    .eq("nuvemshop_order_id", String(orderId))
    .maybeSingle();

  if (existing?.id) {
    await supabase.from("pedidos").update({ status, atualizado_em: row.atualizado_em }).eq("id", existing.id);
  } else {
    await supabase.from("pedidos").insert(row);
  }

  if (cliId) {
    const { count } = await supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("cliente_id", cliId);
    await supabase.from("clientes").update({ total_pedidos: count ?? undefined, temperatura_lead: "quente" }).eq("id", cliId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  // Responde rápido pra evitar timeout; processa em background
  const body = await req.text();
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const respond = () => new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });

  const task = (async () => {
    try {
      const payload: Payload = JSON.parse(body);
      console.log("[ns-webhook]", payload.event, payload.id);
      const storeId = String(payload.store_id ?? "");
      const { data: conn } = await supabase.from("nuvemshop_connections").select("access_token, store_id").eq("store_id", storeId).maybeSingle();
      if (!conn) {
        console.warn("[ns-webhook] conexão não encontrada:", storeId);
        return;
      }
      const token = conn.access_token;
      const evt = payload.event ?? "";

      if (evt.startsWith("product/") && payload.id) {
        if (evt === "product/deleted") await deleteProduto(supabase, payload.id);
        else await syncProduto(supabase, storeId, token, payload.id);
      } else if (evt.startsWith("order/") && payload.id) {
        await syncPedido(supabase, storeId, token, payload.id);
      }

      await supabase.from("nuvemshop_connections").update({
        ultimo_webhook_em: new Date().toISOString(),
        ultimo_webhook_evento: evt,
        ultimo_webhook_status: "ok",
      }).eq("store_id", storeId);
    } catch (e) {
      console.error("[ns-webhook] erro:", e);
      try {
        const payload: Payload = JSON.parse(body);
        await supabase.from("nuvemshop_connections").update({
          ultimo_webhook_em: new Date().toISOString(),
          ultimo_webhook_evento: payload.event ?? "?",
          ultimo_webhook_status: `erro: ${(e as Error).message}`.slice(0, 200),
        }).eq("store_id", String(payload.store_id ?? ""));
      } catch {}
    }
  })();

  // @ts-ignore EdgeRuntime do Supabase
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(task);
  else await task;

  return respond();
});

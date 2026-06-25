// Cron de pós-venda: 7 dias após pedido "entregue", envia mensagem de avaliação + recomendação.
// Também extrai preferências do cliente das conversas recentes via IA.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const STEVO_URL = "https://smv2-4.stevo.chat/send/text";
const LINK_AVALIACAO_BASE = "https://douramor-semijoias.vercel.app/avaliar";

async function enviarPosVenda() {
  const limite = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: pedidos } = await supabaseAdmin
    .from("pedidos")
    .select("id, numero, cliente_id, produtos_snapshot, atualizado_em")
    .eq("status", "entregue")
    .is("pos_venda_enviado_em", null)
    .lte("atualizado_em", limite)
    .limit(20);

  const enviados: any[] = [];
  for (const p of pedidos ?? []) {
    if (!p.cliente_id) continue;
    const { data: cliente } = await supabaseAdmin
      .from("clientes")
      .select("nome, contato, canal_origem")
      .eq("id", p.cliente_id)
      .maybeSingle();
    if (!cliente || cliente.canal_origem !== "whatsapp" || !cliente.contato) continue;

    const primeiroNome = (cliente.nome ?? "").trim().split(/\s+/)[0] || "tudo bem";
    const itens = Array.isArray(p.produtos_snapshot)
      ? (p.produtos_snapshot as any[]).map((s) => s?.nome).filter(Boolean).slice(0, 2).join(" e ")
      : "";
    const categoriaLink = "https://douramor-semijoias.vercel.app/produtos";
    const msg = `Oi ${primeiroNome}! 😊 Sua encomenda${itens ? ` (${itens})` : ""} chegou bem? Adoraríamos saber o que achou!\n\nDeixe sua avaliação aqui: ${LINK_AVALIACAO_BASE}/${p.id}\n\nE aproveita — separamos novidades que combinam com o que você comprou: ${categoriaLink} 💛`;

    const send = await fetch(STEVO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: process.env.STEVO_API_KEY ?? "" },
      body: JSON.stringify({ number: cliente.contato, text: msg }),
    });
    if (send.ok) {
      await supabaseAdmin.from("pedidos").update({ pos_venda_enviado_em: new Date().toISOString() }).eq("id", p.id);
      enviados.push({ pedido: p.numero, ok: true });
    } else {
      enviados.push({ pedido: p.numero, erro: await send.text() });
    }
  }
  return enviados;
}

async function extrairPreferencias() {
  // Pega conversas finalizadas (última msg há > 24h) sem preferencias ainda salvas
  const limite = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: conversas } = await supabaseAdmin
    .from("conversas")
    .select("id, cliente_id, ultima_mensagem_em")
    .eq("canal", "whatsapp")
    .lt("ultima_mensagem_em", limite)
    .not("cliente_id", "is", null)
    .order("ultima_mensagem_em", { ascending: false })
    .limit(15);

  const processadas: any[] = [];
  for (const c of conversas ?? []) {
    const { data: cliente } = await supabaseAdmin
      .from("clientes")
      .select("id, preferencias")
      .eq("id", c.cliente_id!)
      .maybeSingle();
    if (!cliente) continue;
    // Não sobrescreve se já tem
    if (cliente.preferencias && cliente.preferencias.length > 20) continue;

    const { data: msgs } = await supabaseAdmin
      .from("mensagens")
      .select("papel, conteudo")
      .eq("conversa_id", c.id)
      .order("criado_em", { ascending: true })
      .limit(30);
    if (!msgs?.length) continue;

    const transcript = msgs.map((m) => `${m.papel}: ${m.conteudo}`).join("\n");
    const prompt = `Extraia das mensagens abaixo as PREFERÊNCIAS desta cliente em formato curto (1-2 linhas, separadas por vírgula): categoria preferida (brinco/colar/anel/pulseira/conjunto), faixa de preço aproximada, gênero (feminino/masculino), estilo (clássico/moderno/delicado/statement). Se algo não estiver claro, omita.

Mensagens:
${transcript}

Responda APENAS com as preferências, sem rodeios. Exemplo: "Brincos delicados, faixa até R$ 150, estilo clássico, feminino".`;

    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!aiResp.ok) continue;
    const ai = await aiResp.json();
    const pref = (ai.content?.[0]?.text ?? "").trim();
    if (pref && pref.length > 10 && pref.length < 300) {
      await supabaseAdmin.from("clientes").update({ preferencias: pref }).eq("id", cliente.id);
      processadas.push({ cliente: cliente.id, pref });
    }
  }
  return processadas;
}

async function run() {
  const [pv, prefs] = await Promise.all([
    enviarPosVenda().catch((e) => ({ erro: (e as Error).message })),
    extrairPreferencias().catch((e) => ({ erro: (e as Error).message })),
  ]);
  return { pos_venda: pv, preferencias: prefs };
}

export const Route = createFileRoute("/api/public/pos-venda-cron")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const secret = process.env.CRON_SECRET;
        if (secret) {
          const provided = request.headers.get("x-cron-secret") ?? new URL(request.url).searchParams.get("secret");
          if (provided !== secret) return new Response("Unauthorized", { status: 401 });
        }
        try {
          const result = await run();
          console.log("[pos-venda-cron]", JSON.stringify(result).slice(0, 1000));
          return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
        } catch (e) {
          console.error("[pos-venda-cron] error", e);
          return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
      },
      GET: async ({ request }: { request: Request }) => {
        const secret = process.env.CRON_SECRET;
        if (secret) {
          const provided = request.headers.get("x-cron-secret") ?? new URL(request.url).searchParams.get("secret");
          if (provided !== secret) return new Response("Unauthorized", { status: 401 });
        }
        const result = await run();
        return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
      },
    },
  },
});

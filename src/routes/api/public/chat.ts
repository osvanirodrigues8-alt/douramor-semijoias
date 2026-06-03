import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildSystemPrompt } from "@/lib/shared/prompt";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function handleChat(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const { sessao_token, canal = "site", message, contato } = await request.json();
    if (!sessao_token || !message) {
      return new Response(JSON.stringify({ error: "sessao_token e message são obrigatórios" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const [{ data: cfg }, { data: cfgAg }] = await Promise.all([
      supabaseAdmin.from("configuracoes").select("*").order("atualizado_em", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("configuracoes_agente").select("*").order("atualizado_em", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (!cfg) throw new Error("Configurações não encontradas");

    const [{ data: produtos }, { data: cupons }, { data: faqs }] = await Promise.all([
      supabaseAdmin.from("produtos").select("nome,categoria,preco,descricao,quantidade_estoque,status,url_produto,url_foto").eq("status", "disponivel").limit(40),
      supabaseAdmin.from("cupons").select("codigo,tipo_desconto,valor_desconto,validade").eq("ativo", true),
      supabaseAdmin.from("faqs").select("pergunta,resposta,categoria,ordem").eq("ativo", true).order("ordem", { ascending: true }),
    ]);

    let cliente_id: string | null = null;
    if (contato) {
      const { data: existing } = await supabaseAdmin.from("clientes").select("id").eq("contato", contato).maybeSingle();
      if (existing) cliente_id = existing.id;
      else {
        const { data: novo } = await supabaseAdmin.from("clientes").insert({ contato, canal_origem: canal }).select("id").single();
        cliente_id = novo?.id ?? null;
      }
    }

    let { data: conversa } = await supabaseAdmin.from("conversas").select("*").eq("sessao_token", sessao_token).maybeSingle();
    if (!conversa) {
      const { data: nova } = await supabaseAdmin.from("conversas").insert({ sessao_token, canal, cliente_id }).select("*").single();
      conversa = nova!;
    } else if (cliente_id && !conversa.cliente_id) {
      await supabaseAdmin.from("conversas").update({ cliente_id }).eq("id", conversa.id);
    }

    await supabaseAdmin.from("mensagens").insert({ conversa_id: conversa.id, papel: "user", conteudo: message });

    const { data: hist } = await supabaseAdmin.from("mensagens").select("papel, conteudo").eq("conversa_id", conversa.id).order("criado_em", { ascending: true }).limit(40);

    const systemPrompt = buildSystemPrompt({ cfg, cfgAg, produtos: produtos ?? [], cupons: cupons ?? [], faqs: faqs ?? [], canal: canal === "whatsapp" ? "whatsapp" : "site" });

    const userMessages = (hist ?? []).map((m: any) => ({ role: m.papel, content: m.conteudo }));

    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.modelo_ia ?? "claude-haiku-4-5-20251001", max_tokens: 1024, system: systemPrompt, messages: userMessages }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("AI error:", aiResp.status, txt);
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Limite de requisições atingido, tente novamente em instantes." }), { status: 429, headers: { ...cors, "Content-Type": "application/json" } });
      throw new Error(`AI erro ${aiResp.status}`);
    }
    const ai = await aiResp.json();
    const reply = ai.content?.[0]?.text ?? "Desculpe, não consegui responder agora.";

    await supabaseAdmin.from("mensagens").insert({ conversa_id: conversa.id, papel: "assistant", conteudo: reply });

    return new Response(JSON.stringify({ reply, conversa_id: conversa.id }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[chat]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
}

export const Route = createFileRoute("/api/public/chat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => handleChat(request),
      OPTIONS: async () => new Response(null, { headers: cors }),
    },
  },
});

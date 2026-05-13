import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildSystemPrompt } from "../_shared/prompt.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { sessao_token, canal = "site", message, contato } = await req.json();
    if (!sessao_token || !message) {
      return new Response(JSON.stringify({ error: "sessao_token e message são obrigatórios" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Load configuracoes
    const { data: cfg } = await supabase.from("configuracoes").select("*").limit(1).maybeSingle();
    if (!cfg) throw new Error("Configurações não encontradas");

    // Load catálogo (resumo)
    const { data: produtos } = await supabase.from("produtos").select("nome,categoria,preco,descricao,quantidade_estoque,status").eq("status", "disponivel").limit(40);
    const { data: cupons } = await supabase.from("cupons").select("codigo,tipo_desconto,valor_desconto,validade").eq("ativo", true);
    const { data: faqs } = await supabase.from("faqs").select("pergunta,resposta,categoria,ordem").eq("ativo", true).order("ordem", { ascending: true });

    // Find or create cliente by contato (optional)
    let cliente_id: string | null = null;
    if (contato) {
      const { data: existing } = await supabase.from("clientes").select("id").eq("contato", contato).maybeSingle();
      if (existing) cliente_id = existing.id;
      else {
        const { data: novo } = await supabase.from("clientes").insert({ contato, canal_origem: canal }).select("id").single();
        cliente_id = novo?.id ?? null;
      }
    }

    // Find or create conversa
    let { data: conversa } = await supabase.from("conversas").select("*").eq("sessao_token", sessao_token).maybeSingle();
    if (!conversa) {
      const { data: nova } = await supabase.from("conversas").insert({ sessao_token, canal, cliente_id }).select("*").single();
      conversa = nova!;
    } else if (cliente_id && !conversa.cliente_id) {
      await supabase.from("conversas").update({ cliente_id }).eq("id", conversa.id);
    }

    // Persist user message
    await supabase.from("mensagens").insert({ conversa_id: conversa.id, papel: "user", conteudo: message });

    // Load history
    const { data: hist } = await supabase.from("mensagens").select("papel, conteudo").eq("conversa_id", conversa.id).order("criado_em", { ascending: true }).limit(40);

    const systemPrompt = buildSystemPrompt({ cfg, produtos: produtos ?? [], cupons: cupons ?? [], faqs: faqs ?? [], canal: canal === "whatsapp" ? "whatsapp" : "site" });

    const messages = [
      { role: "system", content: systemPrompt },
      ...(hist ?? []).map((m: any) => ({ role: m.papel, content: m.conteudo })),
    ];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: cfg.modelo_ia ?? "google/gemini-2.5-flash", messages }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("AI error:", aiResp.status, txt);
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Limite de requisições atingido, tente novamente em instantes." }), { status: 429, headers: { ...cors, "Content-Type": "application/json" } });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos no painel Lovable." }), { status: 402, headers: { ...cors, "Content-Type": "application/json" } });
      throw new Error(`AI gateway erro ${aiResp.status}`);
    }
    const ai = await aiResp.json();
    const reply = ai.choices?.[0]?.message?.content ?? "Desculpe, não consegui responder agora.";

    await supabase.from("mensagens").insert({ conversa_id: conversa.id, papel: "assistant", conteudo: reply });

    return new Response(JSON.stringify({ reply, conversa_id: conversa.id }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});

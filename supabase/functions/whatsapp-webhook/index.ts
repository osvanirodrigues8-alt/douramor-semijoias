// Webhook que recebe mensagens da Stevo (Evolution API) e responde via IA + envia de volta no WhatsApp.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const STEVO_URL = "https://sm-urso.stevo.chat/send/text";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const payload = await req.json().catch(() => ({}));
    console.log("[stevo-webhook] payload:", JSON.stringify(payload).slice(0, 2000));

    // A Stevo pode enviar no formato Evolution (key/message) ou Go WhatsApp (Info/Message).
    const data = payload?.data ?? payload;
    const key = data?.key ?? {};
    const info = data?.Info ?? data?.info ?? {};
    const message = data?.message ?? data?.Message ?? {};
    const fromMe = key?.fromMe === true || info?.IsFromMe === true;
    const remoteJid: string | undefined = key?.remoteJid ?? data?.remoteJid ?? info?.Chat ?? info?.Sender;
    const pushName: string | undefined = data?.pushName ?? data?.notifyName ?? info?.PushName;

    const text: string | undefined =
      message?.conversation ??
      message?.extendedTextMessage?.text ??
      message?.text ??
      data?.text ??
      payload?.message;

    if (fromMe || !remoteJid || !text) {
      console.log("[stevo-webhook] ignored", JSON.stringify({ fromMe, remoteJid, hasText: Boolean(text) }));
      return new Response(JSON.stringify({ ok: true, ignored: true, reason: fromMe ? "fromMe" : !remoteJid ? "no jid" : "no text" }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Número limpo (sem @s.whatsapp.net e sem grupos)
    if (remoteJid.includes("@g.us") || info?.IsGroup === true) {
      return new Response(JSON.stringify({ ok: true, ignored: "group" }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    const numero = remoteJid.replace(/@.*/, "").replace(/\D/g, "");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Carrega configurações
    const { data: cfg } = await supabase.from("configuracoes").select("*").limit(1).maybeSingle();
    if (!cfg) throw new Error("Configurações não encontradas");

    // Cliente
    let cliente_id: string | null = null;
    const { data: existing } = await supabase.from("clientes").select("id").eq("contato", numero).maybeSingle();
    if (existing) cliente_id = existing.id;
    else {
      const { data: novo } = await supabase.from("clientes").insert({ contato: numero, canal_origem: "whatsapp", nome: pushName ?? null }).select("id").single();
      cliente_id = novo?.id ?? null;
    }

    // Conversa por sessão = jid
    const sessao_token = `wa:${remoteJid}`;
    let { data: conversa } = await supabase.from("conversas").select("*").eq("sessao_token", sessao_token).maybeSingle();
    if (!conversa) {
      const { data: nova } = await supabase.from("conversas").insert({ sessao_token, canal: "whatsapp", cliente_id }).select("*").single();
      conversa = nova!;
    }

    await supabase.from("mensagens").insert({ conversa_id: conversa.id, papel: "user", conteudo: text });

    // Catálogo + cupons
    const { data: produtos } = await supabase.from("produtos").select("nome,categoria,preco,descricao,quantidade_estoque,status").eq("status", "disponivel").limit(40);
    const { data: cupons } = await supabase.from("cupons").select("codigo,tipo_desconto,valor_desconto,validade").eq("ativo", true);
    const { data: hist } = await supabase.from("mensagens").select("papel, conteudo").eq("conversa_id", conversa.id).order("criado_em", { ascending: true }).limit(40);

    const systemPrompt = `Você é ${cfg.nome_agente}, atendente virtual da loja "${cfg.nome_loja}".
Tom: ${cfg.tom_padrao}. ${cfg.descricao_loja ?? ""}
${cfg.diferenciais_loja ? `Diferenciais: ${cfg.diferenciais_loja}.` : ""}
Horário: ${cfg.horario_atendimento_inicio} às ${cfg.horario_atendimento_fim}.
Pagamento: ${(cfg.formas_pagamento_ativas ?? []).join(", ")}.
${cfg.parcelamento_ativo ? `Parcelamos até ${cfg.max_parcelas}x acima de R$ ${cfg.valor_minimo_parcelamento}.` : ""}
Taxa entrega: R$ ${cfg.taxa_entrega}. ${cfg.area_cobertura_entrega ?? ""}
Limite desconto: ${cfg.limite_desconto_negociacao}%.
${cfg.whatsapp_humano ? `Atendimento humano: ${cfg.whatsapp_humano}.` : ""}

CATÁLOGO:
${(produtos ?? []).map((p: any) => `- ${p.nome} (${p.categoria}) — R$ ${p.preco} — estoque: ${p.quantidade_estoque}${p.descricao ? ` — ${p.descricao}` : ""}`).join("\n") || "Vazio."}
${cupons?.length ? `\nCUPONS: ${cupons.map((c: any) => `${c.codigo} (${c.tipo_desconto === "percentual" ? c.valor_desconto + "%" : "R$ " + c.valor_desconto})`).join(", ")}` : ""}

Responda em português, breve, acolhedora, sem inventar dados fora desta configuração. Use *negrito* WhatsApp e emojis com moderação.`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...(hist ?? []).map((m: any) => ({ role: m.papel, content: m.conteudo })),
    ];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.modelo_ia ?? "google/gemini-2.5-flash", messages }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("AI error", aiResp.status, txt);
      throw new Error(`AI ${aiResp.status}`);
    }
    const ai = await aiResp.json();
    const reply: string = ai.choices?.[0]?.message?.content ?? "Desculpe, não consegui responder agora.";

    await supabase.from("mensagens").insert({ conversa_id: conversa.id, papel: "assistant", conteudo: reply });

    // Envia de volta no WhatsApp via Stevo
    const sendResp = await fetch(STEVO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: Deno.env.get("STEVO_API_KEY") ?? "" },
      body: JSON.stringify({ number: numero, text: reply }),
    });
    const sendTxt = await sendResp.text();
    console.log("[stevo-send]", sendResp.status, sendTxt.slice(0, 500));

    return new Response(JSON.stringify({ ok: true, sent: sendResp.ok }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[stevo-webhook] error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});

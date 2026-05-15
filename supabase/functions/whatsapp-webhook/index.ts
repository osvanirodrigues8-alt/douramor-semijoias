// Webhook que recebe mensagens da Stevo (Evolution API) e responde via IA + envia de volta no WhatsApp.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildSystemPrompt } from "../_shared/prompt.ts";

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

    // Catálogo: busca produtos relevantes pela mensagem do usuário + amostra geral
    const stop = new Set(["para","sobre","tem","tens","temos","voce","você","vocês","quero","queria","gostaria","linha","produto","produtos","com","sem","uma","umas","uns","dos","das","tudo","bem","oque","que","qual","quais","como","onde","quando","quanto","alguma","algum","mais","menos","aqui","tudo","obrigado","obrigada","oi","ola","olá"]);
    const lowText = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const generoFiltro: "masculino" | "feminino" | "unissex" | null =
      /\b(masculin|homem|homens|menino|namorado|marido|esposo|pai|filho)\b/.test(lowText) ? "masculino" :
      /\b(feminin|mulher|mulheres|menina|namorada|esposa|mae|mãe|filha)\b/.test(lowText) ? "feminino" : null;
    const keywords = (text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]{4,}/g) ?? [])
      .filter((w) => !stop.has(w))
      .slice(0, 6);

    let produtos: any[] = [];
    if (keywords.length) {
      const orFilter = keywords.flatMap((k) => [`nome.ilike.%${k}%`, `descricao.ilike.%${k}%`]).join(",");
      const { data: matched } = await supabase
        .from("produtos")
        .select("nome,categoria,preco,descricao,quantidade_estoque,status,url_produto,url_foto")
        .eq("status", "disponivel")
        .or(orFilter)
        .limit(40);
      produtos = matched ?? [];
    }
    if (produtos.length < 40) {
      const { data: extra } = await supabase
        .from("produtos")
        .select("nome,categoria,preco,descricao,quantidade_estoque,status,url_produto,url_foto")
        .eq("status", "disponivel")
        .order("atualizado_em", { ascending: false })
        .limit(40 - produtos.length);
      const seen = new Set(produtos.map((p) => p.nome));
      for (const p of extra ?? []) if (!seen.has(p.nome)) produtos.push(p);
    }
    const { data: cupons } = await supabase.from("cupons").select("codigo,tipo_desconto,valor_desconto,validade").eq("ativo", true);
    const { data: faqs } = await supabase.from("faqs").select("pergunta,resposta,categoria,ordem").eq("ativo", true).order("ordem", { ascending: true });
    const { data: hist } = await supabase.from("mensagens").select("papel, conteudo").eq("conversa_id", conversa.id).order("criado_em", { ascending: true }).limit(40);

    const systemPrompt = buildSystemPrompt({ cfg, produtos: produtos ?? [], cupons: cupons ?? [], faqs: faqs ?? [], canal: "whatsapp" });

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
      throw new Error(`AI ${aiResp.status}: ${txt.slice(0, 300)}`);
    }
    const ai = await aiResp.json();
    const choice = ai.choices?.[0];
    let reply: string = (choice?.message?.content ?? "").trim();
    if (!reply) {
      console.error("[stevo-webhook] AI empty reply", JSON.stringify({ finish: choice?.finish_reason, usage: ai.usage, raw: ai }).slice(0, 2000));
      reply = "Desculpe, tive um problema técnico agora. Pode repetir, por favor? 💛";
    }

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

// Webhook Stevo → Juliana (IA humanizada). Detecta ativo/receptivo, busca produtos, escala humano, atualiza perfil.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildSystemPrompt,
  expandirComSinonimos,
  detectarFaixaPreco,
  detectarPedidoHumano,
  detectarIntencaoCompra,
  detectarTipoConversa,
  detectarTemperatura,
  transcreverAudio,
  descreverImagem,
  extrairKeywordsDeDescricao,
} from "../_shared/prompt.ts";
import { executarFluxo } from "../_shared/fluxo-engine.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const STEVO_URL = "https://sm-urso.stevo.chat/send/text";
const MSG_HUMANO = "Um momento! Vou chamar alguém da nossa equipe pra te ajudar pessoalmente 🙏";

const MSG_AUDIO_FAIL = "Oi! Não consegui ouvir bem o seu áudio 😅 Pode me escrever o que você precisa?";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const payload = await req.json().catch(() => ({}));
    console.log("[stevo-webhook] payload:", JSON.stringify(payload).slice(0, 1500));

    const data = payload?.data ?? payload;
    const key = data?.key ?? {};
    const info = data?.Info ?? data?.info ?? {};
    const message = data?.message ?? data?.Message ?? {};
    const fromMe = key?.fromMe === true || info?.IsFromMe === true;
    const remoteJid: string | undefined = key?.remoteJid ?? data?.remoteJid ?? info?.Chat ?? info?.Sender;
    const pushName: string | undefined = data?.pushName ?? data?.notifyName ?? info?.PushName;
    let text: string | undefined =
      message?.conversation ?? message?.extendedTextMessage?.text ?? message?.text ?? data?.text ?? payload?.message;

    // === Mídia: áudio / imagem ===
    const audioUrl: string | undefined =
      message?.audioMessage?.url ?? data?.audioMessage?.url ?? data?.audio?.url ?? data?.mediaUrl?.audio;
    const imageUrl: string | undefined =
      message?.imageMessage?.url ?? data?.imageMessage?.url ?? data?.image?.url ?? data?.mediaUrl?.image;
    const legendaImg: string | undefined =
      message?.imageMessage?.caption ?? data?.imageMessage?.caption ?? data?.caption;

    let midiaTipo: "audio" | "image" | null = null;
    let midiaUrl: string | null = null;
    let midiaTranscricao: string | null = null;
    let descricaoMidia: string | null = null;

    const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

    if (!text && audioUrl) {
      midiaTipo = "audio"; midiaUrl = audioUrl;
      const tr = await transcreverAudio(audioUrl, LOVABLE_KEY);
      if (tr) { text = tr; midiaTranscricao = tr; }
    }
    if (!text && imageUrl) {
      midiaTipo = "image"; midiaUrl = imageUrl;
      const desc = await descreverImagem(imageUrl, LOVABLE_KEY);
      midiaTranscricao = desc;
      descricaoMidia = desc;
      text = legendaImg || `[imagem: ${desc ?? "joia"}]`;
    }

    if (!remoteJid) {
      return new Response(JSON.stringify({ ok: true, ignored: "no jid" }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (remoteJid.includes("@g.us") || info?.IsGroup === true) {
      return new Response(JSON.stringify({ ok: true, ignored: "group" }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    const numero = remoteJid.replace(/@.*/, "").replace(/\D/g, "");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ===== Mensagem enviada pelo HUMANO (fromMe) → registra como assistant para a Juliana ler depois =====
    if (fromMe) {
      if (!text) return new Response(JSON.stringify({ ok: true, ignored: "fromMe sem texto" }), { headers: { ...cors, "Content-Type": "application/json" } });
      const sessao_token = `wa:${remoteJid}`;
      let { data: conv } = await supabase.from("conversas").select("id, cliente_id").eq("sessao_token", sessao_token).maybeSingle();
      if (!conv) {
        // tenta achar/criar cliente
        const { data: existing } = await supabase.from("clientes").select("id").eq("contato", numero).maybeSingle();
        const cliId = existing?.id ?? (await supabase.from("clientes").insert({ contato: numero, canal_origem: "whatsapp" }).select("id").single()).data?.id;
        const { data: nova } = await supabase.from("conversas").insert({ sessao_token, canal: "whatsapp", cliente_id: cliId, tipo_conversa: "receptivo" }).select("id, cliente_id").single();
        conv = nova!;
      }

      const { data: ultimaAssistente } = await supabase
        .from("mensagens")
        .select("conteudo")
        .eq("conversa_id", conv.id)
        .eq("papel", "assistant")
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (String(ultimaAssistente?.conteudo ?? "").trim() === text.trim()) {
        return new Response(JSON.stringify({ ok: true, ignored: "eco da mensagem enviada pelo sistema" }), { headers: { ...cors, "Content-Type": "application/json" } });
      }

      await supabase.from("mensagens").insert({ conversa_id: conv.id, papel: "assistant", conteudo: text });
      // Pausa IA: humano está atendendo manualmente
      await supabase.from("conversas").update({
        precisa_humano: true,
        motivo_humano: "Atendimento humano manual",
        humano_em: new Date().toISOString(),
      }).eq("id", conv.id);
      return new Response(JSON.stringify({ ok: true, registrado: "humano" }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Áudio que falhou em transcrever
    if (!text && midiaTipo === "audio") {
      await fetch(STEVO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: Deno.env.get("STEVO_API_KEY") ?? "" },
        body: JSON.stringify({ number: numero, text: MSG_AUDIO_FAIL }),
      });
      return new Response(JSON.stringify({ ok: true, audio_fail: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (!text) {
      return new Response(JSON.stringify({ ok: true, ignored: "sem texto" }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const [{ data: cfg }, { data: cfgAg }] = await Promise.all([
      supabase.from("configuracoes").select("*").limit(1).maybeSingle(),
      supabase.from("configuracoes_agente").select("*").limit(1).maybeSingle(),
    ]);
    if (!cfg) throw new Error("Configurações não encontradas");

    // === Cliente ===
    let cliente: any = null;
    const { data: existing } = await supabase.from("clientes").select("*").eq("contato", numero).maybeSingle();
    if (existing) {
      cliente = existing;
      if (!cliente.nome && pushName) {
        await supabase.from("clientes").update({ nome: pushName }).eq("id", cliente.id);
        cliente.nome = pushName;
      }
    } else {
      const { data: novo } = await supabase.from("clientes").insert({ contato: numero, canal_origem: "whatsapp", nome: pushName ?? null }).select("*").single();
      cliente = novo;
    }

    // === Conversa ===
    const sessao_token = `wa:${remoteJid}`;
    let { data: conversa } = await supabase.from("conversas").select("*").eq("sessao_token", sessao_token).maybeSingle();
    if (!conversa) {
      const { data: nova } = await supabase.from("conversas").insert({ sessao_token, canal: "whatsapp", cliente_id: cliente?.id }).select("*").single();
      conversa = nova!;
    }

    await supabase.from("mensagens").insert({
      conversa_id: conversa.id, papel: "user", conteudo: text,
      midia_tipo: midiaTipo, midia_url: midiaUrl, midia_transcricao: midiaTranscricao,
    });

    // Cliente respondeu → reset cadência follow-up + atualiza data_ultimo_contato
    await supabase.from("clientes").update({ data_ultimo_contato: new Date().toISOString() }).eq("id", cliente.id);
    await supabase.from("conversas").update({
      fups_enviados_hoje: 0,
      dia_followup_atual: 0,
      proximo_followup_em: null,
      data_inicio_followup: null,
    }).eq("id", conversa.id);

    // Se conversa estava pausada para humano, mantém pausada (humano resolve)
    if (conversa.precisa_humano === true) {
      console.log("[webhook] conversa pausada para humano — não responder");
      return new Response(JSON.stringify({ ok: true, pausada_humano: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // === Gatilho de humano por palavra ===
    const palavrasExtras = (cfgAg?.palavras_chave_humano ?? []) as string[];
    const pedidoHumano = detectarPedidoHumano(text, palavrasExtras);
    if (pedidoHumano.sim) {
      await supabase.from("conversas").update({
        precisa_humano: true, motivo_humano: pedidoHumano.motivo, humano_em: new Date().toISOString(),
      }).eq("id", conversa.id);
      await supabase.from("mensagens").insert({ conversa_id: conversa.id, papel: "assistant", conteudo: MSG_HUMANO });
      await fetch(STEVO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: Deno.env.get("STEVO_API_KEY") ?? "" },
        body: JSON.stringify({ number: numero, text: MSG_HUMANO }),
      });
      return new Response(JSON.stringify({ ok: true, humano: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const intencaoCompra = detectarIntencaoCompra(text);
    if (intencaoCompra) {
      await supabase.from("conversas").update({ intencao_compra_em: new Date().toISOString() }).eq("id", conversa.id);
    }

    // === ENGINE DE FLUXO VISUAL — tenta executar fluxo ativo antes da IA livre ===
    const fluxoVariaveis = ((conversa.contexto as any)?.fluxo?.variaveis ?? {}) as Record<string, any>;
    const fluxoResult = await executarFluxo({
      supabase, conversa, cliente, cfg, cfgAg,
      mensagemUsuario: text, canal: "whatsapp",
      hist: [], variaveis: fluxoVariaveis, lovableKey: LOVABLE_KEY,
    });
    if (fluxoResult.handled) {
      const replyFluxo = fluxoResult.reply ?? MSG_HUMANO;
      const update: any = {};
      if (fluxoResult.escalar) {
        update.precisa_humano = true;
        update.motivo_humano = fluxoResult.motivoEscalar ?? "fluxo escalou";
        update.humano_em = new Date().toISOString();
      }
      if (Object.keys(update).length) await supabase.from("conversas").update(update).eq("id", conversa.id);
      await supabase.from("mensagens").insert({ conversa_id: conversa.id, papel: "assistant", conteudo: replyFluxo });
      const sendResp = await fetch(STEVO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: Deno.env.get("STEVO_API_KEY") ?? "" },
        body: JSON.stringify({ number: numero, text: replyFluxo }),
      });
      return new Response(JSON.stringify({ ok: true, fluxo: true, sent: sendResp.ok, escalar: fluxoResult.escalar }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    // Se fluxo passou para "msg_ia", a instrução fica em variaveis.__ia_instrucao__
    const instrucaoExtraFluxo: string | undefined = fluxoVariaveis.__ia_instrucao__;


    // === Busca inteligente de produtos ===
    const stop = new Set(["para","sobre","tem","tens","temos","voce","você","vocês","quero","queria","gostaria","linha","produto","produtos","com","sem","uma","umas","uns","dos","das","tudo","bem","oque","que","qual","quais","como","onde","quando","quanto","alguma","algum","mais","menos","aqui","obrigado","obrigada","oi","ola","olá","reais","preco","preço"]);
    const lowText = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const generoFiltro: "masculino" | "feminino" | "unissex" | null =
      /\b(masculin|homem|homens|menino|namorado|marido|esposo|pai|filho)\b/.test(lowText) ? "masculino" :
      /\b(feminin|mulher|mulheres|menina|namorada|esposa|mae|mãe|filha)\b/.test(lowText) ? "feminino" : null;

    const baseKeywords = (lowText.match(/[a-z0-9]{4,}/g) ?? []).filter((w) => !stop.has(w)).slice(0, 8);
    // Se veio imagem, mistura keywords da descrição
    if (descricaoMidia) {
      const ex = extrairKeywordsDeDescricao(descricaoMidia);
      for (const k of ex.keywords) baseKeywords.push(k);
    }
    const keywords = expandirComSinonimos(baseKeywords);
    const { max: precoMax, baratoPrimeiro } = detectarFaixaPreco(text);

    const { data: pedidosRecentes } = await supabase.from("pedidos").select("produtos_ids").order("criado_em", { ascending: false }).limit(200);
    const contagemVendas = new Map<string, number>();
    for (const p of pedidosRecentes ?? []) for (const id of (p.produtos_ids ?? []) as string[]) contagemVendas.set(id, (contagemVendas.get(id) ?? 0) + 1);

    const destaqueIds = new Set<string>((cfgAg?.produtos_destaque_ids ?? []) as string[]);
    const jaMostrados: string[] = Array.isArray(conversa.produtos_mostrados) ? conversa.produtos_mostrados : [];

    let produtos: any[] = [];
    if (keywords.length) {
      const orFilter = keywords.flatMap((k) => [`nome.ilike.%${k}%`, `descricao.ilike.%${k}%`]).join(",");
      let qy = supabase.from("produtos").select("id,nome,categoria,genero,preco,descricao,quantidade_estoque,status,url_produto,url_foto").eq("status", "disponivel").or(orFilter).limit(60);
      if (generoFiltro) qy = qy.in("genero", [generoFiltro, "unissex"]);
      if (precoMax) qy = qy.lte("preco", precoMax);
      const { data: matched } = await qy;
      produtos = matched ?? [];
    }
    if (produtos.length < 30) {
      let qy = supabase.from("produtos").select("id,nome,categoria,genero,preco,descricao,quantidade_estoque,status,url_produto,url_foto").eq("status", "disponivel").order("atualizado_em", { ascending: false }).limit(40);
      if (generoFiltro) qy = qy.in("genero", [generoFiltro, "unissex"]);
      if (precoMax) qy = qy.lte("preco", precoMax);
      const { data: extra } = await qy;
      const seen = new Set(produtos.map((p) => p.id));
      for (const p of extra ?? []) if (!seen.has(p.id)) produtos.push(p);
    }

    // Ordena: destaque > mais vendido > preço
    produtos.sort((a, b) => {
      const da = destaqueIds.has(a.id) ? 1 : 0;
      const db = destaqueIds.has(b.id) ? 1 : 0;
      if (db !== da) return db - da;
      const va = contagemVendas.get(a.id) ?? 0;
      const vb = contagemVendas.get(b.id) ?? 0;
      if (vb !== va) return vb - va;
      return baratoPrimeiro ? Number(a.preco) - Number(b.preco) : Number(a.preco) - Number(b.preco);
    });

    const produtosParaPrompt = produtos.slice(0, 30);

    const [{ data: cupons }, { data: faqs }, { data: hist }] = await Promise.all([
      supabase.from("cupons").select("codigo,tipo_desconto,valor_desconto,validade").eq("ativo", true),
      supabase.from("faqs").select("pergunta,resposta,categoria,ordem").eq("ativo", true).order("ordem", { ascending: true }),
      supabase.from("mensagens").select("papel, conteudo, criado_em").eq("conversa_id", conversa.id).order("criado_em", { ascending: true }).limit(50),
    ]);

    const tipoConv = (conversa.tipo_conversa as "ativo" | "receptivo" | undefined) ?? detectarTipoConversa(hist ?? []);
    if (!conversa.tipo_conversa || conversa.tipo_conversa !== tipoConv) {
      await supabase.from("conversas").update({ tipo_conversa: tipoConv }).eq("id", conversa.id);
    }
    const temp = detectarTemperatura(hist ?? []);

    // === Cupom de negociação: pode oferecer? ===
    const cupomCfgAtivo = cfgAg?.cupom_negociacao_ativo !== false;
    const cupomReuso = cfgAg?.cupom_permite_reuso === true;
    const cupomTentMin = Number(cfgAg?.cupom_tentativas_antes ?? 1);
    const userMsgs = (hist ?? []).filter((m: any) => m.papel === "user").length;
    const assistantMsgs = (hist ?? []).filter((m: any) => m.papel === "assistant").length;
    const objecaoPreco = /\b(caro|car[ií]ssim|or[çc]ament|n[aã]o\s+posso|sem\s+grana|desconto|abaix|baix|melhor\s+pre[çc]o)\b/i.test(text);
    const jaUsouCupom = cliente?.cupom_negociacao_usado === true;
    const jaOferecido = !!cliente?.cupom_negociacao_oferecido_em;
    const podeOferecerCupom = cupomCfgAtivo
      && objecaoPreco
      && userMsgs >= 2
      && assistantMsgs >= cupomTentMin
      && (!jaOferecido || cupomReuso)
      && (!jaUsouCupom || cupomReuso);

    const systemPrompt = buildSystemPrompt({
      cfg, cfgAg, produtos: produtosParaPrompt, cupons: cupons ?? [], faqs: faqs ?? [], canal: "whatsapp",
      cliente, produtosJaMostrados: jaMostrados, tipoConversa: tipoConv, temperatura: temp,
      podeOferecerCupom, descricaoMidia, instrucaoFluxo: instrucaoExtraFluxo,
    });

    const messages = [
      { role: "system", content: systemPrompt },
      ...(hist ?? []).map((m: any) => ({ role: m.papel, content: m.conteudo })),
    ];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openai/gpt-5-mini", messages }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("AI error", aiResp.status, txt);
      throw new Error(`AI ${aiResp.status}: ${txt.slice(0, 300)}`);
    }
    const ai = await aiResp.json();
    let reply: string = (ai.choices?.[0]?.message?.content ?? "").trim();
    if (!reply) reply = MSG_HUMANO;

    // === Detecta tag [ESCALAR] ===
    let marcarHumano = false;
    let motivoEscalar: string | null = null;
    if (/\[ESCALAR\]/i.test(reply)) {
      marcarHumano = true;
      motivoEscalar = "Juliana decidiu escalar";
      reply = reply.replace(/\[ESCALAR\]/gi, "").trim();
    }

    // === Atualiza produtos_mostrados + cliente.produtos_vistos ===
    const novosMostrados = new Set(jaMostrados);
    const novosVistosIds = new Set<string>((cliente.produtos_vistos ?? []) as string[]);
    const replyLower = reply.toLowerCase();
    for (const p of produtos) {
      const hit = (p.nome && replyLower.includes(String(p.nome).toLowerCase())) || (p.url_produto && reply.includes(p.url_produto));
      if (hit) {
        novosMostrados.add(p.nome);
        novosVistosIds.add(p.id);
      }
    }
    const adicionouAlgum = novosMostrados.size > jaMostrados.length;
    const tentativasMax = Number(cfgAg?.tentativas_antes_escalar ?? 2);
    const novaTentativaSemResultado = adicionouAlgum ? 0 : (conversa.tentativas_sem_resultado ?? 0) + 1;
    if (!adicionouAlgum && novaTentativaSemResultado >= tentativasMax) {
      marcarHumano = true;
      motivoEscalar = motivoEscalar ?? "Juliana não encontrou produto adequado";
      reply = MSG_HUMANO;
    }

    // Intenção de compra: adiciona produtos mencionados ao produtos_interesse
    const novosInteresseIds = new Set<string>((cliente.produtos_interesse ?? []) as string[]);
    if (intencaoCompra) for (const id of novosVistosIds) novosInteresseIds.add(id);

    await Promise.all([
      supabase.from("conversas").update({
        produtos_mostrados: Array.from(novosMostrados),
        tentativas_sem_resultado: novaTentativaSemResultado,
        ...(marcarHumano ? { precisa_humano: true, motivo_humano: motivoEscalar, humano_em: new Date().toISOString() } : {}),
      }).eq("id", conversa.id),
      supabase.from("clientes").update({
        produtos_vistos: Array.from(novosVistosIds),
        produtos_interesse: Array.from(novosInteresseIds),
        temperatura_lead: temp,
        ...(podeOferecerCupom && new RegExp(`\\b${(cfgAg?.cupom_negociacao_codigo ?? "JULIANA10")}\\b`, "i").test(reply)
          ? { cupom_negociacao_oferecido_em: new Date().toISOString() } : {}),
      }).eq("id", cliente.id),
      supabase.from("mensagens").insert({ conversa_id: conversa.id, papel: "assistant", conteudo: reply }),
    ]);

    const sendResp = await fetch(STEVO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: Deno.env.get("STEVO_API_KEY") ?? "" },
      body: JSON.stringify({ number: numero, text: reply }),
    });
    console.log("[stevo-send]", sendResp.status);

    return new Response(JSON.stringify({ ok: true, sent: sendResp.ok, humano: marcarHumano, tipo: tipoConv, temp }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[stevo-webhook] error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});

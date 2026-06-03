// WhatsApp webhook — migrado de Supabase Edge Function para Vercel/Node.js
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
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
} from "@/lib/shared/prompt";
import { executarFluxo } from "@/lib/shared/fluxo-engine";
import { extrairCep, detectaIntencaoFrete, carregarConexaoNS, calcularFreteNuvemshop, type OpcaoFrete } from "@/lib/shared/frete";

const STEVO_URL = "https://smv2-4.stevo.chat/send/text";
const MSG_HUMANO = "Um momento! Vou chamar alguém da nossa equipe pra te ajudar pessoalmente 🙏";
const MSG_AUDIO_FAIL = "Oi! Não consegui ouvir bem o seu áudio 😅 Pode me escrever o que você precisa?";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function separarMensagens(reply: string): string[] {
  const lines = reply.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const urlCount = (reply.match(/https?:\/\/\S+/g) ?? []).length;
  if (urlCount <= 1) return [reply.trim()].filter(Boolean);
  const blocos: string[] = [];
  let atual: string[] = [];
  let temUrl = false;
  for (const line of lines) {
    if (temUrl && /https?:\/\/\S+/.test(line)) {
      blocos.push(atual.join("\n"));
      atual = [line];
    } else {
      atual.push(line);
    }
    if (/https?:\/\/\S+/.test(line)) temUrl = true;
  }
  if (atual.length) blocos.push(atual.join("\n"));
  return blocos.map((b) => b.trim()).filter(Boolean).slice(0, 6);
}

async function enviarTexto(numero: string, text: string, stevoKey: string) {
  return fetch(STEVO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: stevoKey },
    body: JSON.stringify({ number: numero, text }),
  });
}

async function handleWebhook(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });

  const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (webhookSecret) {
    const url = new URL(request.url);
    const provided = request.headers.get("x-webhook-secret") ?? url.searchParams.get("secret");
    if (provided !== webhookSecret) return new Response("Unauthorized", { status: 401, headers: cors });
  }

  try {
    const payload = await request.json().catch(() => ({}));
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

    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? "";

    if (!text && audioUrl) {
      midiaTipo = "audio"; midiaUrl = audioUrl;
      const tr = await transcreverAudio(audioUrl, ANTHROPIC_KEY);
      if (tr) { text = tr; midiaTranscricao = tr; }
    }
    if (!text && imageUrl) {
      midiaTipo = "image"; midiaUrl = imageUrl;
      const desc = await descreverImagem(imageUrl, ANTHROPIC_KEY);
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

    if (fromMe) {
      if (!text) return new Response(JSON.stringify({ ok: true, ignored: "fromMe sem texto" }), { headers: { ...cors, "Content-Type": "application/json" } });
      const sessao_token = `wa:${remoteJid}`;
      let { data: conv } = await supabaseAdmin.from("conversas").select("id, cliente_id").eq("sessao_token", sessao_token).maybeSingle();
      if (!conv) {
        const { data: existing } = await supabaseAdmin.from("clientes").select("id").eq("contato", numero).maybeSingle();
        const cliId = existing?.id ?? (await supabaseAdmin.from("clientes").insert({ contato: numero, canal_origem: "whatsapp" }).select("id").single()).data?.id;
        const { data: nova } = await supabaseAdmin.from("conversas").insert({ sessao_token, canal: "whatsapp", cliente_id: cliId, tipo_conversa: "receptivo" }).select("id, cliente_id").single();
        conv = nova!;
      }
      const { data: ultimaAssistente } = await supabaseAdmin.from("mensagens").select("conteudo").eq("conversa_id", conv.id).eq("papel", "assistant").order("criado_em", { ascending: false }).limit(1).maybeSingle();
      if (String(ultimaAssistente?.conteudo ?? "").trim() === text.trim()) {
        return new Response(JSON.stringify({ ok: true, ignored: "eco" }), { headers: { ...cors, "Content-Type": "application/json" } });
      }
      await supabaseAdmin.from("mensagens").insert({ conversa_id: conv.id, papel: "assistant", conteudo: text });
      await supabaseAdmin.from("conversas").update({ precisa_humano: true, motivo_humano: "Atendimento humano manual", humano_em: new Date().toISOString() }).eq("id", conv.id);
      return new Response(JSON.stringify({ ok: true, registrado: "humano" }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (!text && midiaTipo === "audio") {
      await fetch(STEVO_URL, { method: "POST", headers: { "Content-Type": "application/json", apikey: process.env.STEVO_API_KEY ?? "" }, body: JSON.stringify({ number: numero, text: MSG_AUDIO_FAIL }) });
      return new Response(JSON.stringify({ ok: true, audio_fail: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (!text) return new Response(JSON.stringify({ ok: true, ignored: "sem texto" }), { headers: { ...cors, "Content-Type": "application/json" } });

    const [{ data: cfg }, { data: cfgAg }] = await Promise.all([
      supabaseAdmin.from("configuracoes").select("*").limit(1).maybeSingle(),
      supabaseAdmin.from("configuracoes_agente").select("*").limit(1).maybeSingle(),
    ]);
    if (!cfg) throw new Error("Configurações não encontradas");

    let cliente: any = null;
    const { data: existing } = await supabaseAdmin.from("clientes").select("*").eq("contato", numero).maybeSingle();
    if (existing) {
      cliente = existing;
      if (!cliente.nome && pushName) {
        await supabaseAdmin.from("clientes").update({ nome: pushName }).eq("id", cliente.id);
        cliente.nome = pushName;
      }
    } else {
      const { data: novo } = await supabaseAdmin.from("clientes").insert({ contato: numero, canal_origem: "whatsapp", nome: pushName ?? null }).select("*").single();
      cliente = novo;
    }

    const sessao_token = `wa:${remoteJid}`;
    let { data: conversa } = await supabaseAdmin.from("conversas").select("*").eq("sessao_token", sessao_token).maybeSingle();
    if (!conversa) {
      const { data: nova } = await supabaseAdmin.from("conversas").insert({ sessao_token, canal: "whatsapp", cliente_id: cliente?.id }).select("*").single();
      conversa = nova!;
    }

    await supabaseAdmin.from("mensagens").insert({ conversa_id: conversa.id, papel: "user", conteudo: text, midia_tipo: midiaTipo, midia_url: midiaUrl, midia_transcricao: midiaTranscricao });

    await supabaseAdmin.from("clientes").update({ data_ultimo_contato: new Date().toISOString() }).eq("id", cliente.id);
    await supabaseAdmin.from("conversas").update({ fups_enviados_hoje: 0, dia_followup_atual: 0, proximo_followup_em: null, data_inicio_followup: null }).eq("id", conversa.id);

    if (conversa.precisa_humano === true) {
      return new Response(JSON.stringify({ ok: true, pausada_humano: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const palavrasExtras = (cfgAg?.palavras_chave_humano ?? []) as string[];
    const pedidoHumano = detectarPedidoHumano(text, palavrasExtras);
    if (pedidoHumano.sim) {
      await supabaseAdmin.from("conversas").update({ precisa_humano: true, motivo_humano: pedidoHumano.motivo, humano_em: new Date().toISOString() }).eq("id", conversa.id);
      await supabaseAdmin.from("mensagens").insert({ conversa_id: conversa.id, papel: "assistant", conteudo: MSG_HUMANO });
      await fetch(STEVO_URL, { method: "POST", headers: { "Content-Type": "application/json", apikey: process.env.STEVO_API_KEY ?? "" }, body: JSON.stringify({ number: numero, text: MSG_HUMANO }) });
      return new Response(JSON.stringify({ ok: true, humano: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const intencaoCompra = detectarIntencaoCompra(text);
    if (intencaoCompra) await supabaseAdmin.from("conversas").update({ intencao_compra_em: new Date().toISOString() }).eq("id", conversa.id);

    const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: hist } = await supabaseAdmin.from("mensagens").select("papel, conteudo, criado_em").eq("conversa_id", conversa.id).gte("criado_em", seteDiasAtras).order("criado_em", { ascending: true }).limit(50);

    const fluxoVariaveis = ((conversa.contexto as any)?.fluxo?.variaveis ?? {}) as Record<string, any>;
    const fluxoResult = await executarFluxo({
      supabase: supabaseAdmin as any, conversa, cliente, cfg, cfgAg,
      mensagemUsuario: text, canal: "whatsapp",
      hist: hist ?? [], variaveis: fluxoVariaveis, aiKey: ANTHROPIC_KEY,
    });
    if (fluxoResult.handled) {
      const replyFluxo = fluxoResult.reply ?? MSG_HUMANO;
      const update: any = {};
      if (fluxoResult.escalar) { update.precisa_humano = true; update.motivo_humano = fluxoResult.motivoEscalar ?? "fluxo escalou"; update.humano_em = new Date().toISOString(); }
      if (Object.keys(update).length) await supabaseAdmin.from("conversas").update(update).eq("id", conversa.id);
      await supabaseAdmin.from("mensagens").insert({ conversa_id: conversa.id, papel: "assistant", conteudo: replyFluxo });
      const sendResp = await fetch(STEVO_URL, { method: "POST", headers: { "Content-Type": "application/json", apikey: process.env.STEVO_API_KEY ?? "" }, body: JSON.stringify({ number: numero, text: replyFluxo }) });
      return new Response(JSON.stringify({ ok: true, fluxo: true, sent: sendResp.ok }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    const instrucaoExtraFluxo: string | undefined = ((conversa.contexto as any)?.fluxo?.variaveis as any)?.__ia_instrucao__ ?? fluxoVariaveis.__ia_instrucao__;

    const stop = new Set(["para","sobre","tem","tens","temos","voce","você","vocês","quero","queria","gostaria","linha","produto","produtos","com","sem","uma","umas","uns","dos","das","tudo","bem","oque","que","qual","quais","como","onde","quando","quanto","alguma","algum","mais","menos","aqui","obrigado","obrigada","oi","ola","olá","reais","preco","preço"]);
    const lowText = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const generoFiltro: "masculino" | "feminino" | "unissex" | null =
      /\b(masculin|homem|homens|menino|namorado|marido|esposo|pai|filho)\b/.test(lowText) ? "masculino" :
      /\b(feminin|mulher|mulheres|menina|namorada|esposa|mae|mãe|filha)\b/.test(lowText) ? "feminino" : null;

    // Normaliza plural simples: remove 's' final para melhor matching (ex: "braceletes" → "bracelete")
    const normalizarPlural = (w: string) => w.replace(/([aeiou])s$/, "$1").replace(/es$/, "e").replace(/s$/, "");
    const rawKeywords = (lowText.match(/[a-z0-9]{4,}/g) ?? []).filter((w) => !stop.has(w)).slice(0, 8);
    const baseKeywords = Array.from(new Set(rawKeywords.flatMap((w) => [w, normalizarPlural(w)])));
    if (descricaoMidia) {
      const ex = extrairKeywordsDeDescricao(descricaoMidia);
      for (const k of ex.keywords) baseKeywords.push(k);
    }
    const keywords = expandirComSinonimos(baseKeywords);
    const { max: precoMax, baratoPrimeiro } = detectarFaixaPreco(text);
    const buscaProdutoSolicitada = intencaoCompra || !!precoMax || descricaoMidia != null ||
      /\b(anel|alian[çc]a|colar|corrente|cord[aã]o|brinco|argola|pulseira|bracelete|tornozeleira|piercing|joia|semi\s*joia|semijoia|presente|cat[aá]logo|modelo|op[cç][aã]o|op[cç][oõ]es|mostra|mostrar|ver\s+mais|dourad|prat|rose|masculin|feminin)\b/i.test(lowText);

    const { data: pedidosRecentes } = await supabaseAdmin.from("pedidos").select("produtos_ids").order("criado_em", { ascending: false }).limit(200);
    const contagemVendas = new Map<string, number>();
    for (const p of pedidosRecentes ?? []) for (const id of (p.produtos_ids ?? []) as string[]) contagemVendas.set(id, (contagemVendas.get(id) ?? 0) + 1);

    const destaqueIds = new Set<string>((cfgAg?.produtos_destaque_ids ?? []) as string[]);
    const jaMostrados: string[] = Array.isArray(conversa.produtos_mostrados) ? conversa.produtos_mostrados : [];

    let produtos: any[] = [];
    if (keywords.length) {
      const orFilter = keywords.flatMap((k) => [`nome.ilike.%${k}%`, `descricao.ilike.%${k}%`]).join(",");
      let qy = supabaseAdmin.from("produtos").select("id,nome,categoria,genero,preco,descricao,quantidade_estoque,status,url_produto,url_foto,nuvemshop_product_id,nuvemshop_variant_id").eq("status", "disponivel").or(orFilter).limit(60);
      if (generoFiltro) qy = (qy as any).in("genero", [generoFiltro, "unissex"]);
      if (precoMax) qy = (qy as any).lte("preco", precoMax);
      const { data: matched } = await qy;
      produtos = matched ?? [];
    }
    // Fallback geral só quando NÃO há keywords de categoria específica (evita misturar óculos/relógio com braceletes)
    const temKeywordCategoria = keywords.some((k) =>
      /^(anel|alian[çc]a|colar|corrente|cord[aã]o|brinco|argola|pulseira|bracelete|tornozeleira|piercing|conjunto|kit|trio|choker|gargantilha)$/.test(k)
    );
    if (produtos.length < 30 && !temKeywordCategoria) {
      let qy = supabaseAdmin.from("produtos").select("id,nome,categoria,genero,preco,descricao,quantidade_estoque,status,url_produto,url_foto,nuvemshop_product_id,nuvemshop_variant_id").eq("status", "disponivel").order("atualizado_em", { ascending: false }).limit(40);
      if (generoFiltro) qy = (qy as any).in("genero", [generoFiltro, "unissex"]);
      if (precoMax) qy = (qy as any).lte("preco", precoMax);
      const { data: extra } = await qy;
      const seen = new Set(produtos.map((p) => p.id));
      for (const p of extra ?? []) if (!seen.has(p.id)) produtos.push(p);
    }

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

    const [{ data: cupons }, { data: faqs }] = await Promise.all([
      supabaseAdmin.from("cupons").select("codigo,tipo_desconto,valor_desconto,validade").eq("ativo", true),
      supabaseAdmin.from("faqs").select("pergunta,resposta,categoria,ordem").eq("ativo", true).order("ordem", { ascending: true }),
    ]);

    const tipoConv = (conversa.tipo_conversa as "ativo" | "receptivo" | undefined) ?? detectarTipoConversa(hist ?? []);
    if (!conversa.tipo_conversa || conversa.tipo_conversa !== tipoConv) {
      await supabaseAdmin.from("conversas").update({ tipo_conversa: tipoConv }).eq("id", conversa.id);
    }
    const temp = detectarTemperatura(hist ?? []);

    const cupomCfgAtivo = cfgAg?.cupom_negociacao_ativo !== false;
    const cupomReuso = cfgAg?.cupom_permite_reuso === true;
    const cupomTentMin = Number(cfgAg?.cupom_tentativas_antes ?? 1);
    const userMsgs = (hist ?? []).filter((m: any) => m.papel === "user").length;
    const assistantMsgs = (hist ?? []).filter((m: any) => m.papel === "assistant").length;
    const objecaoPreco = /\b(caro|car[ií]ssim|or[çc]ament|n[aã]o\s+posso|sem\s+grana|desconto|abaix|baix|melhor\s+pre[çc]o)\b/i.test(text);
    const jaOferecido = !!cliente?.cupom_negociacao_oferecido_em;
    const jaUsouCupom = cliente?.cupom_negociacao_usado === true;
    const podeOferecerCupom = cupomCfgAtivo && objecaoPreco && userMsgs >= 2 && assistantMsgs >= cupomTentMin && (!jaOferecido || cupomReuso) && (!jaUsouCupom || cupomReuso);

    let cotacaoFrete: { cep: string; opcoes: OpcaoFrete[] } | null = null;
    let freteFalhou = false;
    let pediuFretemasSemCep = false;
    const freteModo = cfgAg?.frete_modo ?? "nuvemshop";
    const cepNaMsg = extrairCep(text);
    const cepSalvo = (cliente?.cep as string | undefined) ?? ((conversa.contexto as any)?.cep as string | undefined) ?? null;
    const cepUsar = cepNaMsg ?? cepSalvo;
    const querFrete = detectaIntencaoFrete(text) || !!cepNaMsg;

    if (freteModo === "nuvemshop" && querFrete) {
      if (!cepUsar) {
        pediuFretemasSemCep = true;
      } else {
        const taxaFallback = Number(cfg?.taxa_entrega ?? 0);
        const opcaoFallback: OpcaoFrete[] = [{ nome: taxaFallback === 0 ? "Frete Grátis" : "Entrega Padrão", preco: taxaFallback, prazo_dias: null }];
        const conn = await carregarConexaoNS(supabaseAdmin as any);
        if (!conn) {
          cotacaoFrete = { cep: cepUsar, opcoes: opcaoFallback };
        } else {
          const candidatos = produtos.filter((p) => p.nuvemshop_variant_id || p.nuvemshop_product_id).slice(0, 1);
          if (!candidatos.length) {
            cotacaoFrete = { cep: cepUsar, opcoes: opcaoFallback };
          } else {
            const r = await calcularFreteNuvemshop({ conn, cep: cepUsar, itens: candidatos.map((p) => ({ variant_id: p.nuvemshop_variant_id, product_id: p.nuvemshop_product_id, product_url: p.url_produto, quantity: 1 })) });
            if (r.ok) {
              cotacaoFrete = { cep: cepUsar, opcoes: r.opcoes };
              if (cepNaMsg) {
                await Promise.all([
                  supabaseAdmin.from("clientes").update({ cep: cepUsar }).eq("id", cliente.id),
                  supabaseAdmin.from("conversas").update({ contexto: { ...(conversa.contexto ?? {}), cep: cepUsar } }).eq("id", conversa.id),
                ]);
              }
            } else {
              cotacaoFrete = { cep: cepUsar, opcoes: opcaoFallback };
            }
          }
        }
      }
    }

    const systemPrompt = buildSystemPrompt({
      cfg, cfgAg, produtos: produtosParaPrompt, cupons: cupons ?? [], faqs: faqs ?? [], canal: "whatsapp",
      cliente, produtosJaMostrados: jaMostrados, tipoConversa: tipoConv, temperatura: temp,
      podeOferecerCupom, descricaoMidia, instrucaoFluxo: instrucaoExtraFluxo,
      cotacaoFrete, freteFalhou, pediuFretemasSemCep,
    });

    const userMessages = (hist ?? []).filter((m: any) => m.papel === "user" || m.papel === "assistant").map((m: any) => ({ role: m.papel, content: m.conteudo }));

    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.modelo_ia ?? "claude-haiku-4-5-20251001", max_tokens: 1024, system: systemPrompt, messages: userMessages }),
    });

    if (!aiResp.ok) throw new Error(`AI ${aiResp.status}`);
    const ai = await aiResp.json();
    let reply: string = (ai.content?.[0]?.text ?? "").trim();
    if (!reply) reply = MSG_HUMANO;

    let marcarHumano = false;
    let motivoEscalar: string | null = null;
    if (/\[ESCALAR\]/i.test(reply)) {
      marcarHumano = true;
      motivoEscalar = "Juliana decidiu escalar";
      reply = reply.replace(/\[ESCALAR\]/gi, "").trim();
    }

    const novosMostrados = new Set(jaMostrados);
    const novosVistosIds = new Set<string>((cliente.produtos_vistos ?? []) as string[]);
    const replyLower = reply.toLowerCase();
    for (const p of produtos) {
      const hit = (p.nome && replyLower.includes(String(p.nome).toLowerCase())) || (p.url_produto && reply.includes(p.url_produto));
      if (hit) { novosMostrados.add(p.nome); novosVistosIds.add(p.id); }
    }
    const adicionouAlgum = novosMostrados.size > jaMostrados.length;
    const tentativasMax = Number(cfgAg?.tentativas_antes_escalar ?? 10);
    const novaTentativaSemResultado = adicionouAlgum ? 0 : buscaProdutoSolicitada ? (conversa.tentativas_sem_resultado ?? 0) + 1 : 0;
    if (buscaProdutoSolicitada && !adicionouAlgum && novaTentativaSemResultado >= tentativasMax) {
      marcarHumano = true;
      motivoEscalar = motivoEscalar ?? "Juliana não encontrou produto adequado";
      reply = MSG_HUMANO;
    }

    const novosInteresseIds = new Set<string>((cliente.produtos_interesse ?? []) as string[]);
    if (intencaoCompra) for (const id of novosVistosIds) novosInteresseIds.add(id);

    await Promise.all([
      supabaseAdmin.from("conversas").update({
        produtos_mostrados: Array.from(novosMostrados),
        tentativas_sem_resultado: novaTentativaSemResultado,
        ...(marcarHumano ? { precisa_humano: true, motivo_humano: motivoEscalar, humano_em: new Date().toISOString() } : {}),
      }).eq("id", conversa.id),
      supabaseAdmin.from("clientes").update({
        produtos_vistos: Array.from(novosVistosIds),
        produtos_interesse: Array.from(novosInteresseIds),
        temperatura_lead: temp,
        ...(podeOferecerCupom && new RegExp(`\\b${(cfgAg?.cupom_negociacao_codigo ?? "JULIANA10")}\\b`, "i").test(reply) ? { cupom_negociacao_oferecido_em: new Date().toISOString() } : {}),
      }).eq("id", cliente.id),
      supabaseAdmin.from("mensagens").insert({ conversa_id: conversa.id, papel: "assistant", conteudo: reply }),
    ]);

    const stevoKey = process.env.STEVO_API_KEY ?? "";
    const blocosEnvio = separarMensagens(reply);
    for (const bloco of blocosEnvio) {
      const resp = await enviarTexto(numero, bloco, stevoKey);
      console.log("[stevo-send]", resp.status);
    }

    const fotosEnviadasAnt: string[] = Array.isArray((conversa as any).fotos_enviadas) ? (conversa as any).fotos_enviadas : [];
    const enviadasSet = new Set(fotosEnviadasAnt);
    const produtosMencionados = produtos.filter((p) => p.url_foto && novosVistosIds.has(p.id) && !enviadasSet.has(p.id)).slice(0, 3);
    for (const p of produtosMencionados) {
      try {
        const imgResp = await fetch("https://smv2-4.stevo.chat/send/media", {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: stevoKey },
          body: JSON.stringify({ number: numero, type: "image", url: p.url_foto, caption: `${p.nome} — R$ ${Number(p.preco).toFixed(2).replace(".", ",")}${p.url_produto ? `\n${p.url_produto}` : ""}` }),
        });
        if (imgResp.ok) enviadasSet.add(p.id);
      } catch (err) { console.error("[stevo-img-fail]", p.id, err); }
    }
    if (produtosMencionados.length) await supabaseAdmin.from("conversas").update({ fotos_enviadas: Array.from(enviadasSet) }).eq("id", conversa.id);

    return new Response(JSON.stringify({ ok: true, blocos: blocosEnvio.length, fotos: produtosMencionados.length, humano: marcarHumano }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[whatsapp-webhook] error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
}

export const Route = createFileRoute("/api/public/whatsapp-webhook")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => handleWebhook(request),
      GET: async ({ request }: { request: Request }) => handleWebhook(request),
      OPTIONS: async () => new Response(null, { headers: cors }),
    },
  },
});

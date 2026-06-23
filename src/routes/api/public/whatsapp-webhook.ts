// WhatsApp webhook — migrado de Supabase Edge Function para Vercel/Node.js
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildSystemPrompt,
  expandirComSinonimos,
  detectarFaixaPreco,
  detectarIntencaoCompra,
  detectarTipoConversa,
  detectarTemperatura,
  transcreverAudio,
  transcreverAudioBase64,
  descreverImagem,
  extrairKeywordsDeDescricao,
} from "@/lib/shared/prompt";
import crypto from "node:crypto";
import { executarFluxo } from "@/lib/shared/fluxo-engine";
import { extrairCep, detectaIntencaoFrete, carregarConexaoNS, calcularFreteNuvemshop, type OpcaoFrete } from "@/lib/shared/frete";
import { detectarProblemasConversa, registrarFeedback } from "@/lib/shared/auditoria";

const STEVO_URL = "https://smv2-4.stevo.chat/send/text";
const MSG_HUMANO = "Deixa eu verificar isso aqui com mais calma pra você — um momento 💛";
const MSG_AUDIO_FAIL = "Oi! Não consegui ouvir bem o seu áudio 😅 Pode me escrever o que você precisa?";
const TENTATIVAS_ESCALAR_DEFAULT = 5;

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
    signal: AbortSignal.timeout(8000),
  }).catch((e) => ({ ok: false, status: 0, _err: e })) as Promise<any>;
}

// Envia áudio pelo /send/media (o Stevo NÃO tem /send/audio e só aceita URL, não base64).
// A URL aponta para /api/public/voz, que gera o áudio (ElevenLabs) quando o Stevo a busca.
// O chamador faz fallback para texto se isto falhar — o cliente nunca fica sem resposta.
async function enviarAudioMedia(numero: string, url: string, stevoKey: string) {
  return fetch("https://smv2-4.stevo.chat/send/media", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: stevoKey },
    body: JSON.stringify({ number: numero, type: "audio", url, filename: "audio.mp3" }),
    signal: AbortSignal.timeout(15000),
  }).catch((e) => ({ ok: false, status: 0, _err: e })) as Promise<any>;
}

// Rate-limit por número: máx 30 mensagens em 60s — proteção contra flood
const rateLimitMap = new Map<string, number[]>();
function verificarRateLimit(numero: string): boolean {
  const agora = Date.now();
  const janela = 60_000;
  const max = 30;
  const timestamps = (rateLimitMap.get(numero) ?? []).filter(t => agora - t < janela);
  timestamps.push(agora);
  rateLimitMap.set(numero, timestamps);
  return timestamps.length > max;
}

// Mascarar PII (CPF, cartão) antes de passar para a IA
function mascararPII(texto: string): string {
  return texto
    .replace(/\b\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[-\.\s]?\d{2}\b/g, "[CPF ocultado]")
    .replace(/\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g, "[cartão ocultado]");
}

async function handleWebhook(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });

  // Validar STEVO_API_KEY no início
  const stevoKey = process.env.STEVO_API_KEY;
  if (!stevoKey) {
    console.error("[webhook] STEVO_API_KEY não configurada");
    return new Response(JSON.stringify({ error: "misconfigured" }), { status: 500, headers: cors });
  }

  const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (webhookSecret) {
    const url = new URL(request.url);
    const provided = request.headers.get("x-webhook-secret") ?? url.searchParams.get("secret");
    if (provided !== webhookSecret) return new Response("Unauthorized", { status: 401, headers: cors });
  }

  try {
    const payload = await request.json().catch(() => ({}));
    console.log("[stevo-webhook] payload:", JSON.stringify(payload).slice(0, 1200));

    const data = payload?.data ?? payload;
    const key = data?.key ?? {};
    const info = data?.Info ?? data?.info ?? {};
    const message = data?.message ?? data?.Message ?? {};
    const fromMe = key?.fromMe === true || info?.IsFromMe === true;

    // JID bruto — pode ser LID (@lid) quando vem de anúncio Meta
    const remoteJidRaw: string | undefined = key?.remoteJid ?? data?.remoteJid ?? info?.Chat ?? info?.Sender;

    // Se for LID (@lid), usar SenderAlt/RecipientAlt que contém o número real (@s.whatsapp.net)
    const remoteJidReal: string | undefined =
      remoteJidRaw?.includes("@lid")
        ? (info?.SenderAlt ?? info?.RecipientAlt ?? data?.JIDAlt ?? remoteJidRaw)
        : remoteJidRaw;

    const remoteJid: string | undefined = remoteJidReal ?? remoteJidRaw;
    if (remoteJidRaw?.includes("@lid") && remoteJidReal && remoteJidReal !== remoteJidRaw) {
      console.log("[lid-fix] LID detectado:", remoteJidRaw, "→ número real:", remoteJidReal);
    }

    const pushNameRaw: string | undefined = data?.pushName ?? data?.notifyName ?? info?.PushName;
    // Validar pushName: ignorar se for muito longo (> 60 chars) ou parecer mensagem (tem pontuação excessiva)
    const pushName: string | undefined = (pushNameRaw && pushNameRaw.length <= 60 && !/[!?]{2,}/.test(pushNameRaw) && pushNameRaw.split(" ").length <= 6)
      ? pushNameRaw.trim() : undefined;

    // Extrair e limpar texto
    let text: string | undefined =
      message?.conversation ?? message?.extendedTextMessage?.text ?? message?.text ?? data?.text ?? payload?.message;
    if (text) text = text.trim().slice(0, 4096);

    // Extrair mensagem citada (quando o cliente arrasta e responde a uma mensagem anterior)
    const contextInfo = message?.extendedTextMessage?.contextInfo ?? message?.contextInfo ?? data?.contextInfo ?? {};
    const quotedMsg = contextInfo?.quotedMessage;
    const quotedText: string | undefined =
      quotedMsg?.conversation ?? quotedMsg?.extendedTextMessage?.text ?? quotedMsg?.imageMessage?.caption;
    const quotedUrl = quotedText ? (quotedText.match(/https?:\/\/\S+/) ?? [])[0] : undefined;

    const imageUrl: string | undefined =
      message?.imageMessage?.url ?? data?.imageMessage?.url ?? data?.image?.url ?? data?.mediaUrl?.image;
    const legendaImg: string | undefined =
      message?.imageMessage?.caption ?? data?.imageMessage?.caption ?? data?.caption;

    let midiaTipo: "audio" | "image" | null = null;
    let midiaUrl: string | null = null;
    let midiaTranscricao: string | null = null;
    let descricaoMidia: string | null = null;

    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? "";

    // Áudio: transcreve via Groq Whisper; se falhar, pede para escrever
    // IMPORTANTE: não usar data?.url ou data?.mediaUrl genérico — capturaria URLs de produto em ecos
    const isAudioType = !!(
      message?.audioMessage || data?.audioMessage ||
      info?.MediaType === "ptt" || info?.MediaType === "audio" ||
      data?.type === "ptt" || data?.type === "audio"
    );
    const audioUrl: string | undefined = isAudioType
      ? (message?.audioMessage?.url ??
         message?.audioMessage?.mediaUrl ??
         info?.audioMessage?.url ??
         info?.audioMessage?.mediaUrl ??
         data?.audioMessage?.url ??
         data?.audioMessage?.mediaUrl ??
         data?.audio?.url ??
         data?.audio?.mediaUrl ??
         data?.mediaUrl?.audio)
      : undefined;
    // audioBase64 só é considerado se isAudioType=true — evita tratar base64 de imagens/docs como áudio
    const audioBase64: string | undefined = isAudioType
      ? (data?.base64 ??
         message?.base64 ??
         data?.audioMessage?.base64 ??
         message?.audioMessage?.base64 ??
         info?.base64)
      : undefined;
    const audioMimetype: string =
      message?.audioMessage?.mimetype ??
      data?.audioMessage?.mimetype ??
      info?.mimetype ??
      "audio/ogg; codecs=opus";
    const isAudio = isAudioType && !!(audioUrl || audioBase64 || isAudioType);

    if (isAudio) {
      console.log("[audio-detect] audioUrl:", audioUrl, "| base64:", audioBase64 ? `${audioBase64.length}chars` : "none", "| mimetype:", audioMimetype, "| isAudio:", isAudio);
    }

    if (!text && isAudio) {
      midiaTipo = "audio";
      midiaUrl = audioUrl ?? null;
      let tr: string | null = null;

      if (audioBase64) {
        console.log("[audio] usando base64, tamanho:", audioBase64.length);
        tr = await transcreverAudioBase64(audioBase64, audioMimetype, ANTHROPIC_KEY);
      } else if (audioUrl) {
        // Tenta baixar com autenticação do Stevo se necessário
        tr = await transcreverAudio(audioUrl, ANTHROPIC_KEY, stevoKey);
      }

      if (tr) {
        text = tr;
        midiaTranscricao = tr;
        console.log("[audio-transcrito]", tr.slice(0, 80));
      } else {
        console.warn("[audio] falha na transcrição — audioUrl:", audioUrl, "base64:", !!audioBase64);
        let convExiste: { id: string } | null = null;
        if (remoteJid) {
          const numAudio = remoteJid.replace(/@.*/, "").replace(/\D/g, "");
          const sessaoAudio = `wa:${numAudio}`;
          // Evitar enviar MSG_AUDIO_FAIL múltiplas vezes — busca no banco E salva antes de enviar
          const cincoMinAtras = new Date(Date.now() - 300_000).toISOString();
          const { data: conv } = await supabaseAdmin.from("conversas").select("id").eq("sessao_token", sessaoAudio).maybeSingle();
          convExiste = conv;
          const { data: audioFailRecente } = convExiste ? await supabaseAdmin.from("mensagens")
            .select("id").eq("conversa_id", convExiste.id).eq("papel", "assistant")
            .eq("conteudo", MSG_AUDIO_FAIL).gte("criado_em", cincoMinAtras).limit(1).maybeSingle() : { data: null };
          if (!audioFailRecente) {
            // Salva no banco ANTES de enviar — garante deduplicação mesmo em retries paralelos
            if (convExiste) {
              await supabaseAdmin.from("mensagens").insert({ conversa_id: convExiste.id, papel: "assistant", conteudo: MSG_AUDIO_FAIL });
            }
            await enviarTexto(numAudio, MSG_AUDIO_FAIL, stevoKey);
          } else {
            console.log("[audio] MSG_AUDIO_FAIL suprimida — já enviada nos últimos 5min");
          }
        }
        // Registrar falha de áudio para auditoria (conversa pode não existir ainda neste ponto)
        if (convExiste?.id) {
          registrarFeedback(supabaseAdmin, {
            conversaId: convExiste.id,
            tipo: "auto_timeout",
            severidade: "baixa",
            descricao: "Transcrição de áudio falhou — cliente recebeu pedido para escrever",
          }).catch(() => {});
        }
        return new Response(JSON.stringify({ ok: true, audio_fail: true }), { headers: { ...cors, "Content-Type": "application/json" } });
      }
    }

    if (!text && imageUrl) {
      midiaTipo = "image"; midiaUrl = imageUrl;
      const desc = await descreverImagem(imageUrl, ANTHROPIC_KEY);
      midiaTranscricao = desc;
      descricaoMidia = desc;
      text = legendaImg?.trim() || `[imagem: ${desc ?? "joia"}]`;
    }

    if (!remoteJid) {
      return new Response(JSON.stringify({ ok: true, ignored: "no jid" }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (remoteJid.includes("@g.us") || info?.IsGroup === true) {
      return new Response(JSON.stringify({ ok: true, ignored: "group" }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Normalizar número e sessao_token pelo número (não pelo JID completo — evita fragmentação por dispositivo)
    const numero = remoteJid.replace(/@.*/, "").replace(/\D/g, "");
    const sessao_token = `wa:${numero}`;

    // Rate-limit: bloquear flood de mensagens
    if (!fromMe && verificarRateLimit(numero)) {
      console.warn("[rate-limit] número bloqueado por excesso de mensagens:", numero);
      return new Response(JSON.stringify({ ok: true, ignored: "rate_limit" }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (fromMe) {
      if (!text) return new Response(JSON.stringify({ ok: true, ignored: "fromMe sem texto" }), { headers: { ...cors, "Content-Type": "application/json" } });

      // Buscar conversa existente
      const { data: conv } = await supabaseAdmin.from("conversas").select("id, precisa_humano").eq("sessao_token", sessao_token).maybeSingle();
      if (!conv) return new Response(JSON.stringify({ ok: true, ignored: "fromMe sem conversa" }), { headers: { ...cors, "Content-Type": "application/json" } });

      // Verificar eco: o Stevo devolve as mensagens enviadas pela PRÓPRIA Juliana como fromMe.
      // Comparação NORMALIZADA (sem emoji/pontuação/espaço) e por continência, porque o eco volta
      // com formatação levemente diferente. Um falso "humano manual" CONGELA o bot — então aqui
      // erramos para o lado de detectar eco (viés seguro: a Juliana sempre volta a responder).
      const normEco = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
      const tresMinAtras = new Date(Date.now() - 180000).toISOString();
      const { data: recentes } = await supabaseAdmin.from("mensagens")
        .select("conteudo")
        .eq("conversa_id", conv.id)
        .eq("papel", "assistant")
        .gte("criado_em", tresMinAtras);
      const alvo = normEco(text!);
      const isEco = !!alvo && (recentes ?? []).some((m: any) => {
        const a = normEco(String(m.conteudo ?? ""));
        if (!a) return false;
        if (a === alvo) return true;
        const menor = Math.min(a.length, alvo.length);
        return menor >= 10 && (a.includes(alvo) || alvo.includes(a)); // eco pode ser um bloco da resposta
      });
      if (isEco) return new Response(JSON.stringify({ ok: true, ignored: "eco" }), { headers: { ...cors, "Content-Type": "application/json" } });

      // Registrar mensagem do atendente humano
      await supabaseAdmin.from("mensagens").insert({ conversa_id: conv.id, papel: "assistant", conteudo: text });
      // Só pausar o bot se ainda não estava pausado (evita sobrescrever humano_em original)
      if (!conv.precisa_humano) {
        await supabaseAdmin.from("conversas").update({ precisa_humano: true, motivo_humano: "Atendimento humano manual", humano_em: new Date().toISOString() }).eq("id", conv.id);
      }
      return new Response(JSON.stringify({ ok: true, registrado: "humano" }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // IDEMPOTÊNCIA: verificar se o messageId já foi processado antes de iniciar qualquer lógica
    const messageId: string | undefined = key?.id;
    if (messageId) {
      const { data: msgExistente } = await (supabaseAdmin.from("mensagens") as any)
        .select("id").eq("stevo_message_id", messageId).limit(1).maybeSingle();
      if (msgExistente) {
        console.log("[idempotencia] messageId já processado:", messageId);
        return new Response(JSON.stringify({ ok: true, ignored: "duplicate_message_id" }), { headers: { ...cors, "Content-Type": "application/json" } });
      }
    }

    if (!text) return new Response(JSON.stringify({ ok: true, ignored: "sem texto" }), { headers: { ...cors, "Content-Type": "application/json" } });

    // Carregar configurações — sempre a row mais recente
    const [{ data: cfg }, { data: cfgAg }] = await Promise.all([
      supabaseAdmin.from("configuracoes").select("*").order("atualizado_em", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("configuracoes_agente").select("*").order("atualizado_em", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (!cfg) throw new Error("Configurações não encontradas");

    // Upsert cliente — evita race condition e duplicatas
    const { data: clienteUpsert, error: errUpsert } = await supabaseAdmin.from("clientes")
      .upsert({ contato: numero, canal_origem: "whatsapp", ...(pushName ? { nome: pushName } : {}) }, { onConflict: "contato", ignoreDuplicates: false })
      .select("*").maybeSingle();
    if (errUpsert) console.error("[cliente upsert]", errUpsert.message);
    // Re-buscar para garantir todos os campos (cep, preferencias, etc.)
    const { data: clienteCompleto } = await supabaseAdmin.from("clientes").select("*").eq("contato", numero).maybeSingle();
    let cliente: any = clienteCompleto ?? clienteUpsert;
    // Se ainda não existe (raro), cria
    if (!cliente) {
      const { data: novoCliente } = await supabaseAdmin.from("clientes")
        .insert({ contato: numero, canal_origem: "whatsapp", ...(pushName ? { nome: pushName } : {}) })
        .select("*").maybeSingle();
      cliente = novoCliente;
    }
    if (cliente && !cliente.nome && pushName) {
      await supabaseAdmin.from("clientes").update({ nome: pushName }).eq("id", cliente.id);
      cliente.nome = pushName;
    }

    // Upsert conversa — evita race condition por mensagens paralelas
    // Primeiro tenta encontrar pelo token normalizado
    let { data: conversa } = await supabaseAdmin.from("conversas").select("*").eq("sessao_token", sessao_token).maybeSingle();

    // Migração: tenta formatos antigos (com @s.whatsapp.net)
    if (!conversa) {
      const tokensAntigos = [`wa:${numero}@s.whatsapp.net`, `wa:${remoteJid}`].filter(t => t !== sessao_token);
      for (const tok of tokensAntigos) {
        const { data: antiga } = await supabaseAdmin.from("conversas").select("*").eq("sessao_token", tok).maybeSingle();
        if (antiga) {
          await supabaseAdmin.from("conversas").update({ sessao_token }).eq("id", antiga.id);
          conversa = { ...antiga, sessao_token };
          break;
        }
      }
    }

    // Se ainda não existe, cria via upsert atômico para evitar race condition entre mensagens paralelas
    if (!conversa) {
      const { data: nova, error: errConv } = await supabaseAdmin.from("conversas")
        .upsert({ sessao_token, canal: "whatsapp", cliente_id: cliente?.id, tipo_conversa: "receptivo" }, { onConflict: "sessao_token", ignoreDuplicates: false })
        .select("*").maybeSingle();
      if (errConv) console.error("[conversas upsert]", errConv.message);
      // Se upsert retornou vazio (concurrent insert ganhou a race), buscar o registro criado pelo outro processo
      conversa = nova ?? (await supabaseAdmin.from("conversas").select("*").eq("sessao_token", sessao_token).maybeSingle()).data;
    }
    if (!conversa) throw new Error("Falha ao criar/encontrar conversa");

    // --- BUSCAR HISTÓRICO ANTES DE INSERIR MENSAGEM DO USUÁRIO ---
    const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: histRaw } = await supabaseAdmin.from("mensagens")
      .select("papel, conteudo, criado_em")
      .eq("conversa_id", conversa.id)
      .gte("criado_em", seteDiasAtras)
      .order("criado_em", { ascending: true })
      .limit(50);
    // Garantir ao menos as últimas 10 mensagens independente de data
    // O fallback complementa o hist existente em vez de substituí-lo
    let hist = histRaw ?? [];
    if (hist.length < 10) {
      const { data: recent } = await supabaseAdmin.from("mensagens")
        .select("papel, conteudo, criado_em")
        .eq("conversa_id", conversa.id)
        .order("criado_em", { ascending: false })
        .limit(10);
      const recentOrdenado = (recent ?? []).reverse();
      // Mesclar: adicionar mensagens do fallback que não estão já no hist (por criado_em)
      const histTimestamps = new Set(hist.map((m: any) => m.criado_em));
      const extras = recentOrdenado.filter((m: any) => !histTimestamps.has(m.criado_em));
      hist = [...extras, ...hist].sort((a: any, b: any) => a.criado_em < b.criado_em ? -1 : 1).slice(-10);
    }

    // Agora inserir a mensagem do usuário (com stevo_message_id para idempotência em retries futuros)
    const baseMsgUser = { conversa_id: conversa.id, papel: "user", conteudo: text, midia_tipo: midiaTipo, midia_url: midiaUrl, midia_transcricao: midiaTranscricao };
    const { error: errMsgUser } = await supabaseAdmin.from("mensagens").insert({ ...baseMsgUser, ...(messageId ? { stevo_message_id: messageId } : {}) } as any);
    if (errMsgUser) {
      // Resiliência: se a coluna stevo_message_id ainda não existir no banco, salvar sem ela
      // (garante que a mensagem do usuário NUNCA seja perdida, mesmo antes da migration rodar)
      console.error("[mensagens insert user]", errMsgUser);
      const { error: errRetry } = await supabaseAdmin.from("mensagens").insert(baseMsgUser as any);
      if (errRetry) console.error("[mensagens insert user retry]", errRetry);
    }

    if (cliente?.id) await supabaseAdmin.from("clientes").update({ data_ultimo_contato: new Date().toISOString() }).eq("id", cliente.id);
    await supabaseAdmin.from("conversas").update({ fups_enviados_hoje: 0, dia_followup_atual: 0, proximo_followup_em: null, data_inicio_followup: null }).eq("id", conversa.id);

    if (conversa.precisa_humano === true) {
      return new Response(JSON.stringify({ ok: true, pausada_humano: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // REGRA DE NEGÓCIO: a Juliana NUNCA passa para humano automaticamente.
    // Mesmo que o cliente peça "falar com atendente", ela responde sozinha
    // (o prompt instrui a contornar dizendo que vai verificar com a equipe).
    // A pausa por humano só acontece via ação manual (owner respondendo no fromMe).

    const intencaoCompra = detectarIntencaoCompra(text);
    if (intencaoCompra) await supabaseAdmin.from("conversas").update({ intencao_compra_em: new Date().toISOString() }).eq("id", conversa.id);

    const fluxoVariaveis = ((conversa.contexto as any)?.fluxo?.variaveis ?? {}) as Record<string, any>;
    const fluxoResult = await executarFluxo({
      supabase: supabaseAdmin as any, conversa, cliente, cfg, cfgAg,
      mensagemUsuario: text, canal: "whatsapp",
      hist, variaveis: fluxoVariaveis, aiKey: ANTHROPIC_KEY,
    });
    if (fluxoResult.handled) {
      const replyFluxo = fluxoResult.reply ?? MSG_HUMANO;
      const update: any = {};
      if (fluxoResult.escalar) { update.precisa_humano = true; update.motivo_humano = fluxoResult.motivoEscalar ?? "fluxo escalou"; update.humano_em = new Date().toISOString(); }
      if (Object.keys(update).length) await supabaseAdmin.from("conversas").update(update).eq("id", conversa.id);
      await supabaseAdmin.from("mensagens").insert({ conversa_id: conversa.id, papel: "assistant", conteudo: replyFluxo });
      const sendResp = await enviarTexto(numero, replyFluxo, stevoKey);
      return new Response(JSON.stringify({ ok: true, fluxo: true, sent: sendResp.ok }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    const instrucaoExtraFluxo: string | undefined = ((conversa.contexto as any)?.fluxo?.variaveis as any)?.__ia_instrucao__ ?? fluxoVariaveis.__ia_instrucao__;

    // Extração de keywords com normalização de plural
    const stop = new Set(["para","sobre","tem","tens","temos","voce","você","vocês","quero","queria","gostaria","linha","produto","produtos","com","sem","uma","umas","uns","dos","das","tudo","bem","oque","que","qual","quais","como","onde","quando","quanto","alguma","algum","mais","menos","aqui","obrigado","obrigada","oi","ola","olá","reais","preco","preço"]);
    const lowText = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const generoFiltro: "masculino" | "feminino" | "unissex" | null =
      /\b(masculin|homem|homens|menino|namorado|marido|esposo|pai|filho)\b/.test(lowText) ? "masculino" :
      /\b(feminin|mulher|mulheres|menina|namorada|esposa|mae|mãe|filha)\b/.test(lowText) ? "feminino" : null;

    // Dicionário de plurais conhecidos de semi joias
    const pluraisJoias: Record<string, string> = {
      braceletes: "bracelete", aneis: "anel", brincos: "brinco", colares: "colar",
      correntes: "corrente", pulseiras: "pulseira", tornozeleiras: "tornozeleira",
      aliancas: "alianca", alianças: "aliança", conjuntos: "conjunto", piercings: "piercing",
      argolas: "argola", gargantilhas: "gargantilha", chokers: "choker",
    };
    const normalizarPlural = (w: string): string => pluraisJoias[w] ?? (w.length > 5 ? w.replace(/([aeiou])s$/, "$1") : w);
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

    // Pedidos recentes (últimos 30 dias para não fazer full table scan)
    const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: pedidosRecentes } = await supabaseAdmin.from("pedidos").select("produtos_ids").gte("criado_em", trintaDiasAtras).order("criado_em", { ascending: false }).limit(200);
    const contagemVendas = new Map<string, number>();
    for (const p of pedidosRecentes ?? []) for (const id of (p.produtos_ids ?? []) as string[]) contagemVendas.set(id, (contagemVendas.get(id) ?? 0) + 1);

    const destaqueIds = new Set<string>((cfgAg?.produtos_destaque_ids ?? []) as string[]);
    const jaMostrados: string[] = Array.isArray(conversa.produtos_mostrados) ? (conversa.produtos_mostrados as string[]) : [];

    // Detectar categoria específica pedida (para priorizar e informar a IA)
    const categoriaMap: Record<string, string> = {
      anel: "anel", alianca: "anel", aliança: "anel",
      colar: "colar", corrente: "colar", cordao: "colar", gargantilha: "colar", choker: "colar",
      brinco: "brinco", argola: "brinco", earcuff: "brinco",
      pulseira: "pulseira", bracelete: "bracelete", pulseirinha: "pulseira",
      tornozeleira: "tornozeleira",
      piercing: "piercing",
      conjunto: "conjunto", kit: "conjunto",
    };
    const categoriasPedidas = Array.from(new Set(
      baseKeywords.flatMap((k) => categoriaMap[k] ? [categoriaMap[k]] : [])
    ));
    const categoriaPrincipal = categoriasPedidas[0] ?? null;

    // Categorias que NÃO são semi joias — nunca aparecem no fallback
    const categoriasExcluidas = ["outro"];

    let produtos: any[] = [];
    const selectProdutos = "id,nome,categoria,genero,preco,descricao,quantidade_estoque,status,url_produto,url_foto,nuvemshop_product_id,nuvemshop_variant_id";

    if (keywords.length) {
      // 1. Busca prioritária: por categoria exata (quando detectada)
      if (categoriaPrincipal) {
        let qyCat = (supabaseAdmin.from("produtos") as any).select(selectProdutos)
          .eq("status", "disponivel")
          .eq("categoria", categoriaPrincipal)
          .not("categoria", "in", `(${categoriasExcluidas.join(",")})`)
          .limit(40);
        if (generoFiltro) qyCat = qyCat.in("genero", [generoFiltro, "unissex"]);
        if (precoMax) qyCat = qyCat.lte("preco", precoMax);
        const { data: catMatch } = await qyCat;
        produtos = catMatch ?? [];

        // Fallback: se poucos resultados com filtro de gênero, busca sem filtro
        if (produtos.length < 5 && generoFiltro) {
          let qyCatSemGenero = (supabaseAdmin.from("produtos") as any).select(selectProdutos)
            .eq("status", "disponivel")
            .eq("categoria", categoriaPrincipal)
            .not("categoria", "in", `(${categoriasExcluidas.join(",")})`)
            .limit(40);
          if (precoMax) qyCatSemGenero = qyCatSemGenero.lte("preco", precoMax);
          const { data: semGenero } = await qyCatSemGenero;
          if ((semGenero?.length ?? 0) > produtos.length) produtos = semGenero ?? [];
        }
      }

      // 2. Se ainda tem espaço, complementa com busca por nome/descrição
      if (produtos.length < 30) {
        const orFilter = keywords.flatMap((k) => [`nome.ilike.%${k}%`, `descricao.ilike.%${k}%`]).join(",");
        let qy = supabaseAdmin.from("produtos").select(selectProdutos)
          .eq("status", "disponivel")
          .or(orFilter)
          .not("categoria", "in", `(${categoriasExcluidas.join(",")})`)
          .limit(60);
        if (generoFiltro) qy = (qy as any).in("genero", [generoFiltro, "unissex"]);
        if (precoMax) qy = (qy as any).lte("preco", precoMax);
        const { data: matched } = await qy;
        const seen = new Set(produtos.map((p) => p.id));
        for (const p of matched ?? []) if (!seen.has(p.id)) produtos.push(p);

        // Fallback: se ainda poucos resultados com filtro de gênero, busca sem filtro
        if (produtos.length < 5 && generoFiltro) {
          let qySemGenero = supabaseAdmin.from("produtos").select(selectProdutos)
            .eq("status", "disponivel")
            .or(orFilter)
            .not("categoria", "in", `(${categoriasExcluidas.join(",")})`)
            .limit(30);
          if (precoMax) qySemGenero = (qySemGenero as any).lte("preco", precoMax);
          const { data: matchedSemGenero } = await qySemGenero;
          const seenFallback = new Set(produtos.map((p) => p.id));
          for (const p of matchedSemGenero ?? []) if (!seenFallback.has(p.id)) produtos.push(p);
        }
      }
    }

    // Fallback geral só quando NÃO há categoria específica pedida — nunca inclui relógio/óculos
    const temKeywordCategoria = categoriaPrincipal !== null || keywords.some((k) =>
      /^(anel|alianca|colar|corrente|cordao|brinco|argola|pulseira|bracelete|tornozeleira|piercing|conjunto|kit|trio|choker|gargantilha)$/.test(k)
    );
    if (produtos.length < 20 && !temKeywordCategoria) {
      let qy = supabaseAdmin.from("produtos").select(selectProdutos)
        .eq("status", "disponivel")
        .not("categoria", "in", `(${categoriasExcluidas.join(",")})`)
        .order("atualizado_em", { ascending: false })
        .limit(40);
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
      // Corrigido: baratoPrimeiro inverte a ordem corretamente
      return baratoPrimeiro ? Number(a.preco) - Number(b.preco) : Number(b.preco) - Number(a.preco);
    });

    // Filtrar produtos sem URL e excluir categorias não-semi joias antes de passar ao prompt
    const produtosParaPrompt = produtos
      .filter((p) => (p.url_produto || p.url_foto) && !["outro"].includes(p.categoria))
      .slice(0, 30);

    const [{ data: cupons }, { data: faqs }] = await Promise.all([
      supabaseAdmin.from("cupons").select("codigo,tipo_desconto,valor_desconto,validade").eq("ativo", true),
      supabaseAdmin.from("faqs").select("pergunta,resposta,categoria,ordem").eq("ativo", true).order("ordem", { ascending: true }),
    ]);

    const tipoConv = (conversa.tipo_conversa as "ativo" | "receptivo" | undefined) ?? detectarTipoConversa(hist);
    if (!conversa.tipo_conversa) {
      await supabaseAdmin.from("conversas").update({ tipo_conversa: tipoConv }).eq("id", conversa.id);
    }
    const temp = detectarTemperatura(hist);

    const cupomCfgAtivo = cfgAg?.cupom_negociacao_ativo !== false;
    const cupomReuso = cfgAg?.cupom_permite_reuso === true;
    const cupomTentMin = Number(cfgAg?.cupom_tentativas_antes ?? 1);
    const userMsgs = hist.filter((m: any) => m.papel === "user").length;
    const assistantMsgs = hist.filter((m: any) => m.papel === "assistant").length;
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

    // Salvar CEP sempre que informado pelo cliente, independente do resultado do frete
    if (cepNaMsg && cliente?.id) {
      await supabaseAdmin.from("clientes").update({ cep: cepNaMsg }).eq("id", cliente.id);
    }

    if (freteModo === "nuvemshop" && querFrete) {
      if (!cepUsar) {
        pediuFretemasSemCep = true;
      } else {
        const taxaFallback = Number(cfg?.taxa_entrega ?? 0);
        const opcaoFallback: OpcaoFrete[] = [{ nome: taxaFallback === 0 ? "Frete Grátis" : "Entrega Padrão", preco: taxaFallback, prazo_dias: null }];
        const conn = await carregarConexaoNS(supabaseAdmin as any);
        if (!conn) {
          cotacaoFrete = { cep: cepUsar, opcoes: opcaoFallback };
          freteFalhou = true;
        } else {
          // Usa produto abaixo de R$200 para cálculo — produtos acima ativam promoção de frete grátis
          // e retornam R$0, mesmo que o pedido do cliente seja menor que o mínimo da promoção.
          let candidatos = produtos.filter((p) => (p.nuvemshop_variant_id || p.nuvemshop_product_id) && Number(p.preco) < 200).slice(0, 1);
          if (!candidatos.length) {
            const { data: prodBarato } = await supabaseAdmin.from("produtos")
              .select("nuvemshop_variant_id,nuvemshop_product_id,url_produto,preco")
              .not("nuvemshop_variant_id", "is", null)
              .eq("status", "disponivel")
              .lt("preco", 200)
              .order("preco", { ascending: true })
              .limit(1).maybeSingle();
            if (prodBarato) candidatos = [prodBarato];
          }
          // Último fallback: qualquer produto com variant_id
          if (!candidatos.length) {
            const { data: qualquerProd } = await supabaseAdmin.from("produtos")
              .select("nuvemshop_variant_id,nuvemshop_product_id,url_produto")
              .not("nuvemshop_variant_id", "is", null)
              .eq("status", "disponivel")
              .limit(1).maybeSingle();
            if (qualquerProd) candidatos = [qualquerProd];
          }
          if (!candidatos.length) {
            cotacaoFrete = { cep: cepUsar, opcoes: opcaoFallback };
            freteFalhou = true;
          } else {
            const r = await calcularFreteNuvemshop({ conn, cep: cepUsar, itens: candidatos.map((p) => ({ variant_id: p.nuvemshop_variant_id, product_id: p.nuvemshop_product_id, product_url: p.url_produto, quantity: 1 })) });
            if (r.ok) {
              cotacaoFrete = { cep: cepUsar, opcoes: r.opcoes };
              if (cepNaMsg) {
                await Promise.all([
                  supabaseAdmin.from("clientes").update({ cep: cepUsar }).eq("id", cliente.id),
                  supabaseAdmin.from("conversas").update({ contexto: { ...(typeof conversa.contexto === "object" && conversa.contexto !== null ? conversa.contexto : {}), cep: cepUsar } }).eq("id", conversa.id),
                ]);
              }
            } else {
              cotacaoFrete = { cep: cepUsar, opcoes: opcaoFallback };
              freteFalhou = true;
            }
          }
        }
      }
    }

    const tentativasMax = Number(cfgAg?.tentativas_antes_escalar ?? TENTATIVAS_ESCALAR_DEFAULT);

    const systemPrompt = buildSystemPrompt({
      cfg, cfgAg, produtos: produtosParaPrompt, cupons: cupons ?? [], faqs: faqs ?? [], canal: "whatsapp",
      cliente, produtosJaMostrados: jaMostrados, tipoConversa: tipoConv, temperatura: temp,
      podeOferecerCupom, descricaoMidia, instrucaoFluxo: instrucaoExtraFluxo,
      cotacaoFrete, freteFalhou, pediuFretemasSemCep, tentativasEscalar: tentativasMax,
      cepRecebidoAgora: !!cepNaMsg, categoriaPedida: categoriaPrincipal,
      mensagemCitada: quotedText, urlCitada: quotedUrl,
    });

    // Montar histórico para a IA — a mensagem atual do usuário é adicionada SEPARADAMENTE (não está no hist)
    // hist foi buscado ANTES do insert da mensagem atual, mas em retries o hist pode já conter a mensagem atual
    const historicoMessages = hist
      .filter((m: any) => m.papel === "user" || m.papel === "assistant")
      .map((m: any) => ({ role: m.papel as "user" | "assistant", content: String(m.conteudo ?? "") }));

    // Remover a última mensagem do histórico se for duplicata da mensagem atual (cenário de retry)
    const ultimaMsgHist = historicoMessages[historicoMessages.length - 1];
    const histSemDuplicata = (ultimaMsgHist?.role === "user" && ultimaMsgHist?.content.trim() === text.trim())
      ? historicoMessages.slice(0, -1)
      : historicoMessages;

    // Mascarar PII e garantir que o array termina com a msg do usuário atual
    const rawMessages = [
      ...histSemDuplicata.map((m: any) => ({ ...m, content: mascararPII(m.content) })),
      { role: "user" as const, content: mascararPII(text) },
    ];

    // Mesclar mensagens consecutivas do mesmo papel (Anthropic rejeita 400 se houver)
    // Pode ocorrer quando o Stevo retenta e insere msg duplicada no banco
    const messagesParaIA = rawMessages.reduce((acc: { role: "user" | "assistant"; content: string }[], m) => {
      if (acc.length > 0 && acc[acc.length - 1].role === m.role) {
        acc[acc.length - 1].content += "\n" + m.content;
      } else {
        acc.push({ role: m.role, content: m.content });
      }
      return acc;
    }, []);

    // Chamar Anthropic com timeout de 25s
    const ac = new AbortController();
    const aiTimer = setTimeout(() => ac.abort(), 25000);
    let aiResp: Response;
    try {
      aiResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({ model: cfg.modelo_ia ?? "claude-haiku-4-5-20251001", max_tokens: 1024, system: systemPrompt, messages: messagesParaIA }),
        signal: ac.signal,
      });
    } catch (e: any) {
      if (e.name === "AbortError") {
        console.error("[webhook] Anthropic timeout");
        const msgTimeout = "Deixa eu ver isso com mais calma e te respondo em instantes 💛";
        await supabaseAdmin.from("mensagens").insert({ conversa_id: conversa.id, papel: "assistant", conteudo: msgTimeout });
        await enviarTexto(numero, msgTimeout, stevoKey);
        return new Response(JSON.stringify({ ok: true, timeout: true }), { headers: { ...cors, "Content-Type": "application/json" } });
      }
      throw e;
    } finally {
      clearTimeout(aiTimer);
    }

    if (!aiResp.ok) {
      // Erro da IA: NÃO retornar 500 (faria o Stevo retentar e duplicar mensagens →
      // loop cascata que já derrubou o bot uma vez). Envia mensagem de espera e
      // retorna 200 para encerrar a entrega sem retry.
      const errBody = await aiResp.text().catch(() => "");
      console.error("[webhook] Anthropic error", aiResp.status, errBody.slice(0, 300));
      const msgErro = "Deixa eu verificar isso aqui com calma e já te respondo 💛";
      await supabaseAdmin.from("mensagens").insert({ conversa_id: conversa.id, papel: "assistant", conteudo: msgErro });
      await enviarTexto(numero, msgErro, stevoKey);
      return new Response(JSON.stringify({ ok: true, ai_error: aiResp.status }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    const ai = await aiResp.json();
    let reply: string = (ai.content?.[0]?.text ?? "").trim();

    // IA retornou vazio — tenta resposta genérica sem congelar a conversa
    if (!reply) {
      reply = "Oi! Tudo bem? Como posso te ajudar hoje? 💛";
    }

    // [ESCALAR] e [ESCALAR_ATACADO]: apenas remove a tag do texto — não pausa a IA nem seta precisa_humano
    // A Juliana resolve tudo sozinha; transferência para humano só acontece via ação manual no painel
    reply = reply.replace(/\[ESCALAR_ATACADO\]/gi, "").replace(/\[ESCALAR\]/gi, "").trim();
    const marcarHumano = false;

    // ─── Controle de follow-up por tags invisíveis emitidas pela IA ───────────
    // [COMPROU] = cliente confirmou compra; [PARAR] = pediu pra não insistir;
    // [AGENDAR:N] = pediu retorno em N dias. Remove as tags e ajusta o follow-up
    // reusando campos existentes (dia_followup_atual alto = cron para; proximo_followup_em = data do retorno).
    const tagComprou = /\[COMPROU\]/i.test(reply);
    const tagParar = /\[PARAR\]/i.test(reply);
    const tagAgendar = reply.match(/\[AGENDAR:\s*(\d{1,3})\]/i);
    reply = reply.replace(/\[COMPROU\]/gi, "").replace(/\[PARAR\]/gi, "").replace(/\[AGENDAR:\s*\d{1,3}\]/gi, "").trim();
    const fupUpdate: Record<string, any> = {};
    if (tagComprou || tagParar) {
      fupUpdate.dia_followup_atual = 999; // encerra o ciclo de follow-up desta conversa
      fupUpdate.proximo_followup_em = null;
      fupUpdate.fups_enviados_hoje = 0;
      if (tagComprou) fupUpdate.intencao_compra_em = new Date().toISOString();
      console.log("[follow-up]", tagComprou ? "cliente comprou — follow-up encerrado" : "cliente pediu parar — follow-up encerrado");
    } else if (tagAgendar) {
      const n = Math.min(60, Math.max(1, Number(tagAgendar[1])));
      const d = new Date(); d.setDate(d.getDate() + n); d.setHours(8, 0, 0, 0);
      fupUpdate.proximo_followup_em = d.toISOString();
      fupUpdate.fups_enviados_hoje = 0;
      console.log("[follow-up] retorno agendado para", n, "dia(s) — próximo follow-up em", d.toISOString());
    }

    const novosMostrados = new Set(jaMostrados);
    const novosVistosIds = new Set<string>((cliente.produtos_vistos ?? []) as string[]);
    const replyLower = reply.toLowerCase();
    for (const p of produtos) {
      const hit = (p.nome && replyLower.includes(String(p.nome).toLowerCase())) || (p.url_produto && reply.includes(p.url_produto));
      if (hit) { novosMostrados.add(p.nome); novosVistosIds.add(p.id); }
    }
    // Contador de tentativas sem produto — apenas para rastreio, sem escalar automaticamente
    const novaTentativaSemResultado = (buscaProdutoSolicitada && produtos.length > 0) ? 0 : buscaProdutoSolicitada ? (conversa.tentativas_sem_resultado ?? 0) + 1 : conversa.tentativas_sem_resultado ?? 0;

    const novosInteresseIds = new Set<string>((cliente.produtos_interesse ?? []) as string[]);
    if (intencaoCompra) for (const id of novosVistosIds) novosInteresseIds.add(id);

    // Inserir mensagem assistente separado dos updates de metadados (capturando o id p/ áudio)
    const { data: msgAssRow, error: errMsgAss } = await supabaseAdmin.from("mensagens").insert({ conversa_id: conversa.id, papel: "assistant", conteudo: reply }).select("id").maybeSingle();
    if (errMsgAss) console.error("[mensagens insert assistant]", errMsgAss);
    const msgAssistId: string | null = (msgAssRow as any)?.id ?? null;

    // ─── Auditoria automática (nunca derruba o fluxo principal) ─────────────
    try {
      await detectarProblemasConversa({
        supabase: supabaseAdmin,
        conversaId: conversa.id,
        hist,
        textoUsuario: text,
        respostaIA: reply,
        mensagemId: null,
        marcarHumano,
      });
    } catch (auditErr) {
      console.error("[auditoria-auto]", (auditErr as Error).message);
    }
    // ────────────────────────────────────────────────────────────────────────

    // Updates de metadados (best-effort)
    await Promise.all([
      supabaseAdmin.from("conversas").update({
        produtos_mostrados: Array.from(novosMostrados),
        tentativas_sem_resultado: novaTentativaSemResultado,
        ...fupUpdate,
      }).eq("id", conversa.id).then(({ error }) => { if (error) console.error("[conversas update]", error); }),
      supabaseAdmin.from("clientes").update({
        produtos_vistos: Array.from(novosVistosIds),
        produtos_interesse: Array.from(novosInteresseIds),
        temperatura_lead: temp,
        ...(podeOferecerCupom && new RegExp(`\\b${(cfgAg?.cupom_negociacao_codigo ?? "JULIANA10")}\\b`, "i").test(reply) ? { cupom_negociacao_oferecido_em: new Date().toISOString() } : {}),
      }).eq("id", cliente.id).then(({ error }) => { if (error) console.error("[clientes update]", error); }),
    ]);

    // Delay humanizador antes de enviar (simula tempo de digitação)
    const delayMs = 10000;
    await new Promise((r) => setTimeout(r, delayMs));

    // ÁUDIO: a Juliana responde por voz nas mensagens conversacionais (sem link, curtas).
    // Link/preço e respostas longas continuam em texto. O Stevo busca a URL /api/public/voz,
    // que gera o áudio na hora. Falha no envio cai para texto — cliente nunca fica sem resposta.
    const replyTemLink = /https?:\/\/\S+/.test(reply);
    const audioHabilitado = !!process.env.ELEVENLABS_API_KEY && !!process.env.ELEVENLABS_VOICE_ID;
    const querAudio = audioHabilitado && !replyTemLink && reply.length <= 700;
    let audioEnviado = false;
    if (querAudio && msgAssistId) {
      const sec = process.env.WHATSAPP_WEBHOOK_SECRET || process.env.STEVO_API_KEY || "";
      const token = crypto.createHmac("sha256", sec).update(msgAssistId).digest("hex").slice(0, 24);
      const vozUrl = `https://douramor-semijoias.vercel.app/api/public/voz?id=${msgAssistId}&t=${token}`;
      const respAudio = await enviarAudioMedia(numero, vozUrl, stevoKey);
      if (respAudio.ok) { audioEnviado = true; console.log("[stevo-audio] enviado via /send/media"); }
      else console.error("[stevo-audio] /send/media falhou", respAudio.status, "— caindo para texto");
    }

    // Enviar blocos com delay entre mensagens e verificação de falha (pulado quando já foi por voz)
    const blocosEnvio = audioEnviado ? [] : separarMensagens(reply);
    for (let i = 0; i < blocosEnvio.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 800));
      const resp = await enviarTexto(numero, blocosEnvio[i], stevoKey);
      if (!resp.ok) console.error("[stevo-send]", resp.status, blocosEnvio[i].slice(0, 60));
      else console.log("[stevo-send]", resp.status);
    }

    // Enviar fotos de produtos mencionados
    const fotosEnviadasAnt: string[] = Array.isArray((conversa as any).fotos_enviadas) ? (conversa as any).fotos_enviadas : [];
    const enviadasSet = new Set(fotosEnviadasAnt);
    const produtosMencionados = produtos.filter((p) => p.url_foto && novosVistosIds.has(p.id) && !enviadasSet.has(p.id)).slice(0, 3);
    for (const p of produtosMencionados) {
      await new Promise((r) => setTimeout(r, 300));
      try {
        const imgResp = await fetch("https://smv2-4.stevo.chat/send/media", {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: stevoKey },
          body: JSON.stringify({ number: numero, type: "image", url: p.url_foto, caption: `${p.nome} — R$ ${Number(p.preco).toFixed(2).replace(".", ",")}${p.url_produto ? `\n${p.url_produto}` : ""}` }),
          signal: AbortSignal.timeout(8000),
        });
        if (imgResp.ok) enviadasSet.add(p.id);
        else console.error("[stevo-img-fail]", p.id, imgResp.status);
      } catch (err) { console.error("[stevo-img-fail]", p.id, err); }
    }
    if (produtosMencionados.length) await supabaseAdmin.from("conversas").update({ fotos_enviadas: Array.from(enviadasSet) }).eq("id", conversa.id);

    return new Response(JSON.stringify({ ok: true, blocos: blocosEnvio.length, audio: audioEnviado, fotos: produtosMencionados.length, humano: marcarHumano }), { headers: { ...cors, "Content-Type": "application/json" } });
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

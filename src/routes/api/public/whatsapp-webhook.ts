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
    console.log("[stevo-webhook] payload:", JSON.stringify(payload).slice(0, 800));

    const data = payload?.data ?? payload;
    const key = data?.key ?? {};
    const info = data?.Info ?? data?.info ?? {};
    const message = data?.message ?? data?.Message ?? {};
    const fromMe = key?.fromMe === true || info?.IsFromMe === true;
    const remoteJid: string | undefined = key?.remoteJid ?? data?.remoteJid ?? info?.Chat ?? info?.Sender;
    const pushName: string | undefined = data?.pushName ?? data?.notifyName ?? info?.PushName;

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
    const audioUrl: string | undefined =
      message?.audioMessage?.url ?? data?.audioMessage?.url ?? data?.audio?.url ?? data?.mediaUrl?.audio;
    if (!text && audioUrl) {
      midiaTipo = "audio"; midiaUrl = audioUrl;
      const tr = await transcreverAudio(audioUrl, ANTHROPIC_KEY);
      if (tr) {
        text = tr;
        midiaTranscricao = tr;
        console.log("[audio-transcrito]", tr.slice(0, 80));
      } else {
        // Groq não disponível ou falhou — pede para escrever
        if (remoteJid) {
          const numAudio = remoteJid.replace(/@.*/, "").replace(/\D/g, "");
          await enviarTexto(numAudio, MSG_AUDIO_FAIL, stevoKey);
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

    if (fromMe) {
      if (!text) return new Response(JSON.stringify({ ok: true, ignored: "fromMe sem texto" }), { headers: { ...cors, "Content-Type": "application/json" } });

      // Buscar conversa existente
      const { data: conv } = await supabaseAdmin.from("conversas").select("id, precisa_humano").eq("sessao_token", sessao_token).maybeSingle();
      if (!conv) return new Response(JSON.stringify({ ok: true, ignored: "fromMe sem conversa" }), { headers: { ...cors, "Content-Type": "application/json" } });

      // Verificar eco: texto já existe como mensagem da IA nos últimos 60s
      const umMinutoAtras = new Date(Date.now() - 60000).toISOString();
      const { data: recentes } = await supabaseAdmin.from("mensagens")
        .select("conteudo")
        .eq("conversa_id", conv.id)
        .eq("papel", "assistant")
        .gte("criado_em", umMinutoAtras);
      const isEco = (recentes ?? []).some((m: any) => String(m.conteudo ?? "").trim() === text!.trim());
      if (isEco) return new Response(JSON.stringify({ ok: true, ignored: "eco" }), { headers: { ...cors, "Content-Type": "application/json" } });

      // Registrar mensagem do atendente humano
      await supabaseAdmin.from("mensagens").insert({ conversa_id: conv.id, papel: "assistant", conteudo: text });
      // Só pausar o bot se ainda não estava pausado (evita sobrescrever humano_em original)
      if (!conv.precisa_humano) {
        await supabaseAdmin.from("conversas").update({ precisa_humano: true, motivo_humano: "Atendimento humano manual", humano_em: new Date().toISOString() }).eq("id", conv.id);
      }
      return new Response(JSON.stringify({ ok: true, registrado: "humano" }), { headers: { ...cors, "Content-Type": "application/json" } });
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

    // Se ainda não existe, cria
    if (!conversa) {
      const { data: nova } = await supabaseAdmin.from("conversas")
        .insert({ sessao_token, canal: "whatsapp", cliente_id: cliente?.id, tipo_conversa: "receptivo" })
        .select("*").maybeSingle();
      conversa = nova;
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
    let hist = histRaw ?? [];
    if (hist.length < 10) {
      const { data: recent } = await supabaseAdmin.from("mensagens")
        .select("papel, conteudo, criado_em")
        .eq("conversa_id", conversa.id)
        .order("criado_em", { ascending: false })
        .limit(10);
      hist = (recent ?? []).reverse();
    }

    // Agora inserir a mensagem do usuário
    const { error: errMsgUser } = await supabaseAdmin.from("mensagens").insert({ conversa_id: conversa.id, papel: "user", conteudo: text, midia_tipo: midiaTipo, midia_url: midiaUrl, midia_transcricao: midiaTranscricao });
    if (errMsgUser) console.error("[mensagens insert user]", errMsgUser);

    if (cliente?.id) await supabaseAdmin.from("clientes").update({ data_ultimo_contato: new Date().toISOString() }).eq("id", cliente.id);
    await supabaseAdmin.from("conversas").update({ fups_enviados_hoje: 0, dia_followup_atual: 0, proximo_followup_em: null, data_inicio_followup: null }).eq("id", conversa.id);

    if (conversa.precisa_humano === true) {
      return new Response(JSON.stringify({ ok: true, pausada_humano: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Detecção de pedido humano com word boundary nas palavras extras
    const palavrasExtras = (cfgAg?.palavras_chave_humano ?? []) as string[];
    const pedidoHumano = detectarPedidoHumano(text, palavrasExtras);
    if (pedidoHumano.sim) {
      await supabaseAdmin.from("conversas").update({ precisa_humano: true, motivo_humano: pedidoHumano.motivo, humano_em: new Date().toISOString() }).eq("id", conversa.id);
      const { error: errEsc } = await supabaseAdmin.from("mensagens").insert({ conversa_id: conversa.id, papel: "assistant", conteudo: MSG_HUMANO });
      if (errEsc) console.error("[mensagens insert escalar]", errEsc);
      const resp = await enviarTexto(numero, MSG_HUMANO, stevoKey);
      if (!resp.ok) console.error("[stevo-send escalar]", resp.status);
      return new Response(JSON.stringify({ ok: true, humano: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

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
    const jaMostrados: string[] = Array.isArray(conversa.produtos_mostrados) ? conversa.produtos_mostrados : [];

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
    const categoriasExcluidas = ["relogio", "oculos", "outro"];

    let produtos: any[] = [];
    const selectProdutos = "id,nome,categoria,genero,preco,descricao,quantidade_estoque,status,url_produto,url_foto,nuvemshop_product_id,nuvemshop_variant_id";

    if (keywords.length) {
      // 1. Busca prioritária: por categoria exata (quando detectada)
      if (categoriaPrincipal) {
        let qyCat = supabaseAdmin.from("produtos").select(selectProdutos)
          .eq("status", "disponivel")
          .eq("categoria", categoriaPrincipal)
          .not("categoria", "in", `(${categoriasExcluidas.join(",")})`)
          .limit(40);
        if (generoFiltro) qyCat = (qyCat as any).in("genero", [generoFiltro, "unissex"]);
        if (precoMax) qyCat = (qyCat as any).lte("preco", precoMax);
        const { data: catMatch } = await qyCat;
        produtos = catMatch ?? [];
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
      .filter((p) => (p.url_produto || p.url_foto) && !["relogio", "oculos", "outro"].includes(p.categoria))
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
          // Tenta usar produto da busca atual; se não houver, busca qualquer produto com variant_id
          let candidatos = produtos.filter((p) => p.nuvemshop_variant_id || p.nuvemshop_product_id).slice(0, 1);
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
    const historicoMessages = hist
      .filter((m: any) => m.papel === "user" || m.papel === "assistant")
      .map((m: any) => ({ role: m.papel as "user" | "assistant", content: String(m.conteudo ?? "") }));

    // Garantir que o array termina com a msg do usuário atual (não duplicada)
    const messagesParaIA = [...historicoMessages, { role: "user" as const, content: text }];

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
        await supabaseAdmin.from("mensagens").insert({ conversa_id: conversa.id, papel: "assistant", conteudo: MSG_HUMANO });
        await supabaseAdmin.from("conversas").update({ precisa_humano: true, motivo_humano: "Timeout da IA", humano_em: new Date().toISOString() }).eq("id", conversa.id);
        await enviarTexto(numero, MSG_HUMANO, stevoKey);
        return new Response(JSON.stringify({ ok: true, timeout: true }), { headers: { ...cors, "Content-Type": "application/json" } });
      }
      throw e;
    } finally {
      clearTimeout(aiTimer);
    }

    if (!aiResp.ok) throw new Error(`AI ${aiResp.status}`);
    const ai = await aiResp.json();
    let reply: string = (ai.content?.[0]?.text ?? "").trim();

    // IA retornou vazio — escalar para humano
    if (!reply) {
      await supabaseAdmin.from("mensagens").insert({ conversa_id: conversa.id, papel: "assistant", conteudo: MSG_HUMANO });
      await supabaseAdmin.from("conversas").update({ precisa_humano: true, motivo_humano: "IA retornou resposta vazia", humano_em: new Date().toISOString() }).eq("id", conversa.id);
      await enviarTexto(numero, MSG_HUMANO, stevoKey);
      return new Response(JSON.stringify({ ok: true, ia_vazia: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

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
    // Resetar tentativas quando produtos foram encontrados no banco (mesmo se já mostrados)
    const novaTentativaSemResultado = (buscaProdutoSolicitada && produtos.length > 0) ? 0 : buscaProdutoSolicitada ? (conversa.tentativas_sem_resultado ?? 0) + 1 : conversa.tentativas_sem_resultado ?? 0;
    if (buscaProdutoSolicitada && !adicionouAlgum && novaTentativaSemResultado >= tentativasMax) {
      marcarHumano = true;
      motivoEscalar = motivoEscalar ?? "Juliana não encontrou produto adequado";
      reply = MSG_HUMANO;
    }

    const novosInteresseIds = new Set<string>((cliente.produtos_interesse ?? []) as string[]);
    if (intencaoCompra) for (const id of novosVistosIds) novosInteresseIds.add(id);

    // Inserir mensagem assistente separado dos updates de metadados
    const { error: errMsgAss } = await supabaseAdmin.from("mensagens").insert({ conversa_id: conversa.id, papel: "assistant", conteudo: reply });
    if (errMsgAss) console.error("[mensagens insert assistant]", errMsgAss);

    // Updates de metadados (best-effort)
    await Promise.all([
      supabaseAdmin.from("conversas").update({
        produtos_mostrados: Array.from(novosMostrados),
        tentativas_sem_resultado: novaTentativaSemResultado,
        ...(marcarHumano ? { precisa_humano: true, motivo_humano: motivoEscalar, humano_em: new Date().toISOString() } : {}),
      }).eq("id", conversa.id).then(({ error }) => { if (error) console.error("[conversas update]", error); }),
      supabaseAdmin.from("clientes").update({
        produtos_vistos: Array.from(novosVistosIds),
        produtos_interesse: Array.from(novosInteresseIds),
        temperatura_lead: temp,
        ...(podeOferecerCupom && new RegExp(`\\b${(cfgAg?.cupom_negociacao_codigo ?? "JULIANA10")}\\b`, "i").test(reply) ? { cupom_negociacao_oferecido_em: new Date().toISOString() } : {}),
      }).eq("id", cliente.id).then(({ error }) => { if (error) console.error("[clientes update]", error); }),
    ]);

    // Enviar blocos com delay entre mensagens e verificação de falha
    const blocosEnvio = separarMensagens(reply);
    for (let i = 0; i < blocosEnvio.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 400));
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

// Shared system-prompt builder + helpers para Juliana — consultora de vendas humana da Douramor Semi Joias.

type Cfg = any;
type CfgAg = any;

export type TipoConversa = "ativo" | "receptivo";
export type Temperatura = "quente" | "morno" | "frio" | "inativo";

export function buildSystemPrompt(opts: {
  cfg: Cfg;
  cfgAg: CfgAg;
  produtos: any[];
  cupons: any[];
  faqs: any[];
  canal: "site" | "whatsapp";
  cliente?: {
    nome?: string | null;
    preferencias?: string | null;
    total_pedidos?: number | null;
    categoria_favorita?: string | null;
    estilo_preferido?: string | null;
    budget_aproximado?: number | null;
    genero_interesse?: string | null;
    temperatura_lead?: string | null;
    cupom_negociacao_usado?: boolean | null;
  } | null;
  produtosJaMostrados?: string[];
  tipoConversa?: TipoConversa;
  temperatura?: Temperatura;
  modoFollowup?: 1 | 2 | 3 | null;
  podeOferecerCupom?: boolean;
  descricaoMidia?: string | null;
  instrucaoFluxo?: string | null;
  cotacaoFrete?: { cep: string; opcoes: { nome: string; preco: number; prazo_dias: number | null }[] } | null;
  freteFalhou?: boolean;
  pediuFretemasSemCep?: boolean;
}) {
  const { cfg, cfgAg, produtos, cupons, faqs, canal, cliente, produtosJaMostrados, tipoConversa, temperatura, modoFollowup, podeOferecerCupom, descricaoMidia, instrucaoFluxo, cotacaoFrete, freteFalhou, pediuFretemasSemCep } = opts;

  const nomeAgente = cfgAg?.nome_agente ?? cfg?.nome_agente ?? "Juliana";
  const tom = cfgAg?.tom ?? cfg?.tom_padrao ?? "informal";
  const usoEmoji = cfgAg?.uso_emoji ?? cfg?.uso_emoji ?? "moderado";
  const tamanhoResp = cfg?.tamanho_resposta ?? "media";
  const assinatura = cfgAg?.assinatura ?? cfg?.assinatura ?? "";
  const fraseAbertura = cfgAg?.frase_abertura ?? cfg?.saudacao_whatsapp ?? cfg?.mensagem_boas_vindas ?? "";
  const freteModoCfg = cfgAg?.frete_modo ?? "nuvemshop";
  const freteModo = freteModoCfg;
  const contextoLojaRaw = cfgAg?.contexto_loja ?? cfg?.descricao_loja ?? "";
  const contextoLoja = freteModoCfg === "nuvemshop"
    ? String(contextoLojaRaw).replace(/frete\s+gr[aá]tis[^,.]*/gi, "frete calculado por CEP")
    : contextoLojaRaw;
  const diferenciais = cfg?.diferenciais_loja ?? "";
  const personalidade = cfg?.personalidade ?? "";
  const promptExtra = cfgAg?.prompt_extra ?? "";
  const maxProd = cfgAg?.max_produtos_apresentacao ?? 3;
  const estoqueBaixo = cfgAg?.estoque_baixo_threshold ?? 5;
  const promoTxt = cfgAg?.promocao_ativa_texto;
  const promoValidade = cfgAg?.promocao_ativa_validade;
  const palavrasProibidas = (cfg?.palavras_proibidas ?? "").toString().trim();
  const topicosProibidos = (cfg?.topicos_proibidos ?? "").toString().trim();
  const politicaDesconto = (cfg?.politica_desconto ?? "").toString().trim();
  const quandoTransferir = (cfg?.quando_transferir_humano ?? "").toString().trim();
  const regrasExtras = (cfg?.regras_extras ?? "").toString().trim();
  const limiteDescNeg = Number(cfg?.limite_desconto_negociacao ?? 10);

  const emojiInstr = {
    nenhum: "Não use emojis.",
    moderado: "Use emojis com MUITA moderação: 💛 ✨ 💍 — no máximo 1 por mensagem, só quando agregar calor real.",
    muito: "Pode usar emojis com mais liberdade, mas sem virar exagero (máx 2 por mensagem).",
  }[usoEmoji as "nenhum" | "moderado" | "muito"] ?? "";

  const tamanhoInstr = {
    curta: "Respostas BEM curtas: 1-2 frases por mensagem.",
    media: "Respostas curtas a médias: máximo 3 parágrafos curtos por mensagem.",
    longa: "Pode dar respostas um pouco mais elaboradas, mas ainda quebrando em parágrafos curtos.",
  }[tamanhoResp as "curta" | "media" | "longa"] ?? "Respostas curtas a médias: máximo 3 parágrafos curtos.";

  const horInicio = String(cfgAg?.horario_inicio ?? cfg?.horario_atendimento_inicio ?? "08:00").slice(0, 5);
  const horFim = String(cfgAg?.horario_fim ?? cfg?.horario_atendimento_fim ?? "22:00").slice(0, 5);

  const primeiroNome = (cliente?.nome ?? "").trim().split(/\s+/)[0] ?? "";
  const recorrente = (cliente?.total_pedidos ?? 0) > 0;

  const blocos: string[] = [];

  blocos.push(`# QUEM VOCÊ É
Você é ${nomeAgente}, consultora de vendas da Douramor Semi Joias. Trabalha há um tempo na loja, conhece cada peça de cor.
${contextoLoja ? contextoLoja + "\n" : ""}${diferenciais ? `Diferenciais da loja: ${diferenciais}\n` : ""}${personalidade ? `Sua personalidade: ${personalidade}` : ""}

REGRA ABSOLUTA — VOCÊ É 100% HUMANA. NUNCA, EM NENHUMA HIPÓTESE, revele ser IA, bot, robô, assistente virtual, automação, GPT, modelo de linguagem ou qualquer termo técnico.
Se a cliente perguntar diretamente ("você é IA?", "é robô?", "é automático?", "é bot?"), responda com naturalidade e leveza, variando entre:
- "Haha, IA? Que nada! Sou humana sim 😄 Trabalho aqui na Douramor há um tempinho já."
- "Imagina! Sou a ${nomeAgente} mesmo, atendo aqui na Douramor. Me conta, posso te ajudar com o quê?"
- "Kkkk não, sou pessoa de verdade viu! Tô aqui pra te ajudar a achar a peça certa."
Depois siga a conversa normalmente — sem ficar repetindo que é humana.`);

  blocos.push(`# JEITO DE FALAR (linguagem natural humana)
- Tom: ${tom}. Idioma: pt-BR brasileiro.
- ${tamanhoInstr}
- ${emojiInstr}
- Use expressões NATURAIS de quem está digitando no WhatsApp
- Quebra a resposta em até 3 parágrafos CURTOS — nunca um bloco gigante.
- Uma pergunta por vez. NUNCA mande lista de perguntas.
- ${assinatura ? `Pode assinar com "${assinatura}" quando fechar a conversa.` : "Não precisa assinar mensagem por mensagem."}
${fraseAbertura && tipoConversa === "ativo" ? `- Se for a PRIMEIRÍSSIMA mensagem da conversa, abra próxima de: "${fraseAbertura}"` : ""}

# FORMATAÇÃO (CRÍTICO)
- NUNCA use markdown: nada de **, ##, ---, listas com - no estilo técnico.
- Pode usar *texto* (1 asterisco) para negrito do WhatsApp, com MODERAÇÃO (1-2 por mensagem no máx).
- Links sempre limpos, texto puro: https://...
- Sem títulos, sem bullets formais. Escreva como humano escreve no zap.`);

  blocos.push(`# INTELIGÊNCIA EMOCIONAL — leia a cliente
Adapte sua energia ao estado emocional dela:
- Cliente ANIMADA → faça MATCH da energia
- Cliente OBJETIVA → seja direta e concisa
- Cliente HESITANTE → seja ACOLHEDORA, faça perguntas que ajudem a clarear
- Cliente FRUSTRADA → RECONHEÇA o sentimento ANTES de tentar resolver
- Cliente COMPARANDO PREÇO → valorize qualidade, garantia, durabilidade`);

  blocos.push(`# MEMÓRIA — use o histórico da conversa
- LEIA o histórico completo antes de responder. NUNCA repita pergunta já respondida.
- Mantenha mentalmente o perfil dela: NOME, ESTILO, OCASIÃO, ORÇAMENTO, PRA QUEM.`);

  if (tipoConversa === "receptivo") {
    blocos.push(`# CONTEXTO — CONVERSA RECEPTIVA
Continue NATURALMENTE de onde a conversa parou. NUNCA se reapresente. NUNCA mencione troca de atendente.`);
  } else {
    blocos.push(`# CONTEXTO — CONVERSA ATIVA
Seja INVESTIGATIVA antes de oferecer. Construa rapport ANTES de mostrar produto (1-2 trocas). Faça diagnóstico completo com naturalidade — uma pergunta por mensagem.`);
  }

  if (cliente) {
    const fichaLinhas = [
      primeiroNome ? `Nome: ${primeiroNome} — use com naturalidade, NÃO repita em toda mensagem.` : "Nome: ainda não sabe — descubra naturalmente.",
      recorrente ? `JÁ É CLIENTE RECORRENTE — ${cliente.total_pedidos} pedido(s) anteriores.` : "Primeira interação.",
      cliente.categoria_favorita ? `Categoria favorita: ${cliente.categoria_favorita}` : "",
      cliente.estilo_preferido ? `Estilo preferido: ${cliente.estilo_preferido}` : "",
      cliente.budget_aproximado ? `Budget aproximado: R$ ${cliente.budget_aproximado}` : "",
      cliente.preferencias ? `Preferências: ${cliente.preferencias}` : "",
      temperatura ? `Temperatura do lead: ${temperatura.toUpperCase()}` : "",
      cliente.cupom_negociacao_usado ? "⚠️ Cliente JÁ USOU o cupom — NÃO oferecer de novo." : "",
    ].filter(Boolean);
    blocos.push(`# FICHA DA CLIENTE\n${fichaLinhas.join("\n")}`);
  }

  blocos.push(`# DIAGNÓSTICO — DESCUBRA ANTES DE OFERECER
Nas primeiras mensagens (UMA pergunta por vez):
1. É pra ela ou presente?
2. Qual ocasião?
3. Preferência de material? (dourado / prateado / rose)
4. Faixa de orçamento?
Se a ficha já tem essa info, USE — não repergunte.`);

  blocos.push(`# APRESENTAÇÃO DE PRODUTO (máx ${maxProd} por vez)
Formato humano — NUNCA lista técnica:
- Nome + 1 frase de venda contextual + Preço + Link limpo
Use SOMENTE produtos do CATÁLOGO. NUNCA invente.
Se estoque ≤ ${estoqueBaixo}: mencione "só sobraram pouquinhas".`);

  blocos.push(`# FECHAMENTO EM 4 ETAPAS
ETAPA 1 — INTERESSE: apresente a opção + "O que achou?"
ETAPA 2 — CONSIDERANDO: use urgência real (estoque baixo) ou prova social
ETAPA 3 — OBJEÇÃO DE PREÇO: ofereça parcelamento ou valorize qualidade. NÃO dê desconto ainda.
ETAPA 4 — ÚLTIMO RECURSO: só agora ofereça o cupom (se autorizado)
NUNCA pergunte "quer comprar?". Use perguntas de alternativa.`);

  blocos.push(`# RITMO conforme TEMPERATURA (${(temperatura ?? "morno").toUpperCase()})
- 🔥 QUENTE: vai DIRETO pro fechamento
- 🌡️ MORNO: nutre, mostra 2-3 opções
- ❄️ FRIO: leve, foca em conexão
- 💤 INATIVO: UMA mensagem com ângulo novo e parar`);

  if (produtosJaMostrados && produtosJaMostrados.length) {
    blocos.push(`# PRODUTOS JÁ APRESENTADOS — NÃO REPITA\n${produtosJaMostrados.map((n) => `- ${n}`).join("\n")}`);
  }

  if (modoFollowup) {
    const angulo = {
      1: 'TOM 1 — DIRETO: retoma a peça vista, com leveza.',
      2: 'TOM 2 — ÂNGULO NOVO: traz info diferente — tendência, peça parecida, prova social.',
      3: 'TOM 3 — ESCASSEZ ou OFERTA: urgência real ou simplifica próximo passo.',
    }[modoFollowup];
    blocos.push(`# MODO FOLLOW-UP (tentativa ${modoFollowup})
${angulo}
UMA mensagem CURTA (1-2 frases máx). Não soe automática.`);
  }

  blocos.push(`# REGRAS DE NEGÓCIO
Horário: ${horInicio} às ${horFim}.
Pagamento: ${(cfg?.formas_pagamento_ativas ?? []).join(", ") || "PIX, cartão, link de pagamento"}.
${cfg?.parcelamento_ativo ? `Parcelamento em até ${cfg.max_parcelas}x sem juros acima de R$ ${cfg.valor_minimo_parcelamento}.` : ""}
Entrega: ${freteModo === "nuvemshop" ? "frete calculado pelo CEP" : Number(cfg?.taxa_entrega ?? 0) === 0 ? "FRETE GRÁTIS" : `R$ ${cfg.taxa_entrega}`}.
${politicaDesconto ? `Desconto: ${politicaDesconto}` : `Limite máx desconto: ${limiteDescNeg}%.`}
${regrasExtras ? `Outras regras: ${regrasExtras}` : ""}`);

  if (cotacaoFrete && cotacaoFrete.opcoes?.length) {
    const linhas = cotacaoFrete.opcoes.map((o) => {
      const v = o.preco === 0 ? "GRÁTIS" : `R$ ${o.preco.toFixed(2).replace(".", ",")}`;
      const p = o.prazo_dias != null ? ` (~${o.prazo_dias} dias úteis)` : "";
      return `- ${o.nome}: ${v}${p}`;
    }).join("\n");
    blocos.push(`# COTAÇÃO DE FRETE — CEP ${cotacaoFrete.cep}\n${linhas}\nUse ESSES valores reais. Apresente em 1-2 frases naturais.`);
  } else if (pediuFretemasSemCep) {
    blocos.push(`# FRETE — PRECISA DO CEP\nPeça o CEP de forma direta e simpática.`);
  } else if (freteFalhou) {
    blocos.push(`# FRETE — FALHA\nDiga que vai confirmar e adicione [ESCALAR] no fim.`);
  } else if (freteModo === "gratis" || (freteModo !== "nuvemshop" && Number(cfg?.taxa_entrega ?? 0) === 0)) {
    blocos.push(`# FRETE\nFrete GRÁTIS pra todo o Brasil.`);
  } else if (freteModo === "manual") {
    blocos.push(`# FRETE\nFrete fixo R$ ${cfg?.taxa_entrega ?? 0}.`);
  } else {
    blocos.push(`# FRETE\nQuando perguntarem, peça o CEP: "Me passa seu CEP que já calculo pra você 💛".`);
  }

  if (palavrasProibidas || topicosProibidos) {
    blocos.push(`# PROIBIÇÕES\n${palavrasProibidas ? `Palavras proibidas: ${palavrasProibidas}` : ""}\n${topicosProibidos ? `Tópicos proibidos: ${topicosProibidos}` : ""}`);
  }

  if (promoTxt) {
    blocos.push(`# PROMOÇÃO ATIVA\n${promoTxt}${promoValidade ? ` (válido até ${promoValidade})` : ""}`);
  }

  if (faqs?.length) {
    blocos.push(`# FAQ\n${faqs.map((f) => `P: ${f.pergunta}\nR: ${f.resposta}`).join("\n\n")}`);
  }

  blocos.push(`# CATÁLOGO DISPONÍVEL (use SOMENTE estes produtos — NUNCA invente)
${(produtos ?? []).map((p) => `- ${p.nome} (${p.categoria}${p.genero ? `, ${p.genero}` : ""}) — R$ ${p.preco} — estoque: ${p.quantidade_estoque}${p.url_produto ? ` — ${p.url_produto}` : ""}${p.descricao ? ` — ${String(p.descricao).slice(0, 120)}` : ""}`).join("\n") || "Catálogo vazio no momento."}`);

  if (cupons?.length) {
    blocos.push(`# CUPONS PÚBLICOS ATIVOS\n${cupons.map((c) => `- ${c.codigo}: ${c.tipo_desconto === "percentual" ? c.valor_desconto + "%" : "R$ " + c.valor_desconto}${c.validade ? ` (até ${c.validade})` : ""}`).join("\n")}`);
  }

  const cupomCodigo = cfgAg?.cupom_negociacao_codigo ?? "JULIANA10";
  const cupomPct = Number(cfgAg?.cupom_negociacao_percentual ?? 10);
  const cupomAtivo = cfgAg?.cupom_negociacao_ativo !== false;
  const clienteJaUsou = cliente?.cupom_negociacao_usado === true;
  if (cupomAtivo) {
    if (clienteJaUsou) {
      blocos.push(`# CUPOM — BLOQUEADO\nEsta cliente JÁ USOU o cupom ${cupomCodigo}. NUNCA ofereça de novo.`);
    } else if (podeOferecerCupom) {
      blocos.push(`# CUPOM — AUTORIZADO AGORA (último recurso)\nOfereça com naturalidade: "usa o cupom *${cupomCodigo}* e ganha ${cupomPct}% 💛". Apenas UMA vez.`);
    } else {
      blocos.push(`# CUPOM — PROIBIDO oferecer agora\nNUNCA mencione cupom antes da etapa 4 do fechamento.`);
    }
  }

  blocos.push(`# ESCALAR PARA HUMANO — apenas nestes casos:
- Cliente pede explicitamente falar com humano
- Reclamação real ou problema com pedido
- Você tentou ${cfgAg?.tentativas_antes_escalar ?? 2}x sem encontrar produto adequado
${quandoTransferir ? `- ${quandoTransferir}` : ""}
Quando escalar: responda naturalmente e adicione [ESCALAR] no FIM.`);

  if (promptExtra) blocos.push(`# INSTRUÇÕES EXTRAS\n${promptExtra}`);

  if (descricaoMidia) {
    blocos.push(`# MÍDIA RECEBIDA\n${descricaoMidia}\nResponda considerando a mídia naturalmente.`);
  }

  blocos.push(`# DIRETRIZES FINAIS
1. VOCÊ É HUMANA. Nunca admita ser IA/bot.
2. NUNCA invente produtos, preços, prazos ou cupons.
3. SEM MARKDOWN. Apenas texto natural + *negrito* WhatsApp moderado.
4. Máximo 3 parágrafos curtos por mensagem.
5. UMA pergunta por vez.
6. LEIA o histórico, USE a memória, NÃO repita.
7. FECHAMENTO em etapas — não pule.
8. CUPOM só quando autorizado, UMA vez.
9. ESCALAR só quando precisar, com [ESCALAR] no fim.`);

  if (instrucaoFluxo && instrucaoFluxo.trim()) {
    blocos.push(`# INSTRUÇÃO ATIVA DO FLUXO (prioridade máxima)\n${instrucaoFluxo.trim()}`);
  }

  return blocos.filter(Boolean).join("\n\n");
}

// ============ Helpers compartilhados ============

export const SINONIMOS: Record<string, string[]> = {
  corrente: ["colar", "correntinha", "cordão", "cordao", "gargantilha"],
  colar: ["corrente", "correntinha", "cordão", "cordao", "gargantilha"],
  cordao: ["colar", "corrente"],
  argola: ["brinco", "argolinha"],
  brinco: ["argola", "argolinha", "ear", "earcuff"],
  alianca: ["anel", "aliança"],
  anel: ["alianca", "aliança", "solitário", "solitario"],
  pulseira: ["bracelete", "pulseirinha"],
  pulseirinha: ["pulseira", "bracelete"],
  bracelete: ["pulseira"],
  tornozeleira: ["pulseira de pé"],
  piercing: ["pirsing"],
  conjunto: ["kit", "trio"],
};

export function expandirComSinonimos(palavras: string[]): string[] {
  const out = new Set<string>(palavras);
  for (const w of palavras) {
    const norm = w.normalize("NFD").replace(/[̀-ͯ]/g, "");
    for (const [k, vs] of Object.entries(SINONIMOS)) {
      if (k === norm || vs.includes(norm) || vs.includes(w)) {
        out.add(k);
        for (const v of vs) out.add(v);
      }
    }
  }
  return Array.from(out);
}

export function detectarFaixaPreco(texto: string): { max?: number; baratoPrimeiro?: boolean } {
  const t = texto.toLowerCase();
  const baratoPrimeiro = /\b(mais\s+barat|barato|econom|em\s+conta|baixo\s+pre)/.test(t);
  const matchAte = t.match(/(?:at[eé]|m[aá]ximo|no\s+m[aá]ximo|abaixo\s+de|menos\s+de|em\s+torno\s+de|por\s+volta\s+de)\s+(?:r?\$?\s*)?(\d{2,4})/);
  const matchReais = t.match(/(\d{2,4})\s*(?:reais|r\$)/);
  const max = matchAte ? Number(matchAte[1]) : matchReais ? Number(matchReais[1]) : undefined;
  return { max, baratoPrimeiro };
}

export function detectarPedidoHumano(texto: string, palavrasExtras: string[] = []): { sim: boolean; motivo?: string } {
  const t = texto.toLowerCase();
  if (/\b(falar\s+com\s+(uma\s+)?(pessoa|humano|atendente|gerente|vendedor|responsável|responsavel)|atendimento\s+humano|quero\s+humano|chama\s+(algu[eé]m|uma\s+pessoa))\b/.test(t)) {
    return { sim: true, motivo: "Cliente pediu atendimento humano" };
  }
  if (/\b(reclama[çc][aã]o|insatisfeit|p[eé]ssimo|horr[ií]vel|fraude|enganad|n[aã]o\s+chegou|quebrad|defeito|devolver|reembolso|estorno|cancelar\s+pedido)\b/.test(t)) {
    return { sim: true, motivo: "Possível reclamação" };
  }
  for (const p of palavrasExtras) {
    if (p && t.includes(p.toLowerCase())) return { sim: true, motivo: `Palavra-chave: ${p}` };
  }
  return { sim: false };
}

export function detectarIntencaoCompra(texto: string): boolean {
  const t = texto.toLowerCase();
  return /\b(quero|vou\s+levar|vou\s+comprar|fechar\s+pedido|como\s+(pago|fa[çc]o\s+(o\s+)?pedido|compr)|aceita\s+(cart[aã]o|pix|boleto)|finalizar|comprar\s+agora|pode\s+separar)\b/.test(t);
}

export function detectarTipoConversa(historico: { papel: string }[]): TipoConversa {
  const idxPrimeiraUser = historico.findIndex((m) => m.papel === "user");
  if (idxPrimeiraUser === -1) return "ativo";
  const houveAssistantAntes = historico.slice(0, idxPrimeiraUser).some((m) => m.papel === "assistant");
  return houveAssistantAntes ? "receptivo" : "ativo";
}

export function detectarTemperatura(historico: { papel: string; conteudo: string; criado_em?: string }[]): Temperatura {
  if (!historico.length) return "morno";
  const ultUser = [...historico].reverse().find((m) => m.papel === "user");
  if (!ultUser) return "morno";
  const t = (ultUser.conteudo ?? "").toLowerCase();
  if (detectarIntencaoCompra(t) || /\b(quanto|preço|preco|link|comprar|pagar|disponivel|disponível)\b/.test(t)) return "quente";
  const dt = ultUser.criado_em ? Date.now() - new Date(ultUser.criado_em).getTime() : 0;
  if (dt > 7 * 86400_000) return "inativo";
  if (dt > 2 * 86400_000) return "frio";
  return "morno";
}

export function calcularProximoFollowup(
  cfgAg: any,
  fupsHoje: number,
  diaAtual: number,
  agora = new Date(),
): { proximo: Date | null; novoDia: number; resetar: boolean } {
  const max = cfgAg?.max_fups_dia ?? 3;
  const diasTotal = cfgAg?.dias_total ?? 7;
  const h1 = Number(cfgAg?.fup1_horas ?? 3);
  const h2 = Number(cfgAg?.fup2_horas ?? 5);
  const h3 = Number(cfgAg?.fup3_horas ?? 4);
  const [hi] = String(cfgAg?.horario_inicio ?? "08:00").split(":").map(Number);

  if (diaAtual >= diasTotal) return { proximo: null, novoDia: diaAtual, resetar: true };

  if (fupsHoje >= max) {
    const d = new Date(agora);
    d.setDate(d.getDate() + 1);
    d.setHours(hi, 0, 0, 0);
    return { proximo: d, novoDia: diaAtual + 1, resetar: false };
  }

  const horas = fupsHoje === 0 ? h1 : fupsHoje === 1 ? h2 : h3;
  return { proximo: new Date(agora.getTime() + horas * 3600_000), novoDia: diaAtual, resetar: false };
}

export function dentroDoHorario(cfgAg: any, agora = new Date()): boolean {
  try {
    const timeStr = agora.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });
    const [hStr, mStr] = timeStr.split(":");
    const hh = parseInt(hStr) * 60 + parseInt(mStr);
    const [hi, mi] = String(cfgAg?.horario_inicio ?? "08:00").split(":").map(Number);
    const [hf, mf] = String(cfgAg?.horario_fim ?? "22:00").split(":").map(Number);
    return hh >= hi * 60 + mi && hh <= hf * 60 + mf;
  } catch {
    return true;
  }
}

// Transcrição de áudio via Anthropic (Claude suporta audio nativo)
export async function transcreverAudio(url: string, apiKey: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const buffer = await r.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const contentType = r.headers.get("content-type") ?? "audio/ogg";

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Transcreva exatamente o que foi falado neste áudio, em pt-BR. Apenas a transcrição, sem comentários." },
            { type: "document", source: { type: "base64", media_type: contentType, data: base64 } },
          ],
        }],
      }),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    return (j.content?.[0]?.text ?? "").trim() || null;
  } catch (e) {
    console.error("transcreverAudio fail", e);
    return null;
  }
}

// Descrição de imagem via Anthropic Vision
export async function descreverImagem(url: string, apiKey: string): Promise<string | null> {
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Descreva esta imagem de joia/semijoia em pt-BR para uma vendedora identificar peças parecidas. Diga: TIPO (brinco/colar/anel/pulseira/etc), COR (dourado/prateado/rose), ESTILO (delicado/clássico/moderno/ousado), DETALHES (pedras, formato, tamanho). Máx 3 frases." },
            { type: "image", source: { type: "url", url } },
          ],
        }],
      }),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    return (j.content?.[0]?.text ?? "").trim() || null;
  } catch (e) {
    console.error("descreverImagem fail", e);
    return null;
  }
}

export function extrairKeywordsDeDescricao(desc: string): { keywords: string[]; categoria: string | null } {
  const t = desc.toLowerCase();
  const kw = new Set<string>();
  const cats: Array<[RegExp, string]> = [
    [/brinco|argola|ear/, "brinco"],
    [/colar|corrente|gargantilha|cord[aã]o/, "colar"],
    [/anel|alian[çc]a/, "anel"],
    [/pulseira|bracelete/, "pulseira"],
    [/conjunto|kit/, "conjunto"],
    [/piercing/, "piercing"],
  ];
  let cat: string | null = null;
  for (const [re, c] of cats) if (re.test(t)) { kw.add(c); cat = cat ?? c; }
  for (const w of ["dourado", "prateado", "rose", "delicado", "moderno", "clássico", "classico", "pedra", "zircônia", "zirconia", "pérola", "perola"]) {
    if (t.includes(w)) kw.add(w.normalize("NFD").replace(/[̀-ͯ]/g, ""));
  }
  return { keywords: Array.from(kw), categoria: cat };
}

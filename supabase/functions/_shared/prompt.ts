// Shared system-prompt builder for chat + whatsapp-webhook
// Dora: consultora de vendas consultiva da Douramor Semi Joias

export function buildSystemPrompt(opts: {
  cfg: any;
  produtos: any[];
  cupons: any[];
  faqs: any[];
  canal: "site" | "whatsapp";
  cliente?: { nome?: string | null; preferencias?: string | null; total_pedidos?: number | null } | null;
  produtosJaMostrados?: string[]; // nomes dos produtos já apresentados nesta conversa
}) {
  const { cfg, produtos, cupons, faqs, canal, cliente, produtosJaMostrados } = opts;

  const tamanho = {
    curta: "Respostas bem curtas (1-2 frases).",
    media: "Respostas de 2-4 frases, claras e diretas.",
    longa: "Pode dar respostas mais longas e detalhadas quando necessário.",
  }[cfg.tamanho_resposta as "curta" | "media" | "longa"] ?? "";

  const emoji = {
    nenhum: "Não use emojis.",
    moderado: "Use emojis com moderação (no máximo 1 por resposta).",
    muito: "Pode usar emojis livremente para deixar a conversa simpática.",
  }[cfg.uso_emoji as "nenhum" | "moderado" | "muito"] ?? "";

  const saudacao = canal === "whatsapp" ? cfg.saudacao_whatsapp : cfg.saudacao_site;

  const dentroHorario = (() => {
    try {
      const now = new Date();
      const hh = now.getHours() * 60 + now.getMinutes();
      const [hi, mi] = String(cfg.horario_atendimento_inicio ?? "00:00").split(":").map(Number);
      const [hf, mf] = String(cfg.horario_atendimento_fim ?? "23:59").split(":").map(Number);
      const ini = hi * 60 + mi, fim = hf * 60 + mf;
      return hh >= ini && hh <= fim;
    } catch { return true; }
  })();

  const primeiroNome = (cliente?.nome ?? "").trim().split(/\s+/)[0] ?? "";
  const recorrente = (cliente?.total_pedidos ?? 0) > 0;

  const blocos: string[] = [];

  blocos.push(`# IDENTIDADE
Você é ${cfg.nome_agente}, consultora de vendas da loja "${cfg.nome_loja}".
${cfg.descricao_loja ? `Sobre a loja: ${cfg.descricao_loja}` : ""}
${cfg.diferenciais_loja ? `Diferenciais: ${cfg.diferenciais_loja}` : ""}
${cfg.personalidade ? `Personalidade: ${cfg.personalidade}` : ""}`);

  if (cliente) {
    blocos.push(`# FICHA DA CLIENTE NESTA CONVERSA
${primeiroNome ? `Nome: ${primeiroNome} (chame por esse nome, naturalmente, sem repetir em toda frase)` : "Nome: ainda não informado"}
${recorrente ? `CLIENTE RECORRENTE — já fez ${cliente?.total_pedidos} pedido(s). Reconheça com carinho ("que bom te ver de novo!").` : "Primeira interação — capriche no acolhimento."}
${cliente?.preferencias ? `Preferências salvas: ${cliente.preferencias} — use isso para filtrar as sugestões.` : ""}`);
  }

  blocos.push(`# ESTILO
Tom: ${cfg.tom_padrao}. Idioma: ${cfg.idioma ?? "pt-BR"}.
${tamanho} ${emoji}
${cfg.assinatura ? `Assine sempre como: ${cfg.assinatura}` : ""}
${saudacao ? `Saudação inicial sugerida: "${saudacao}"` : ""}`);

  blocos.push(`# ROTEIRO DE VENDAS CONSULTIVO (siga sempre)
1. **Descoberta** — Na primeira mensagem (ou se ainda não souber), pergunte:
   - "É para você ou de presente? 💛"
   - "Qual a ocasião? (uso no dia a dia, formatura, casamento, aniversário, presente especial...)"
   - Se a cliente mencionar faixa de preço, anote mentalmente e respeite.
2. **Apresentação** — Mostre NO MÁXIMO 3 produtos por vez, no formato:
   *Nome da peça* — R$ XX,XX
   _Descrição curta (1 linha)_
   🔗 link
3. **Combinação** — Sempre que recomendar uma peça, ofereça uma peça que combine (brinco → colar/pulseira; anel → pulseira; colar → brinco). Só sugira algo do catálogo real.
4. **Urgência sutil** — Se um produto sugerido tiver estoque ≤ 5, mencione: "Só temos poucas unidades dessa, viu? 👀"
5. **CTA final** — SEMPRE encerre a apresentação de produtos com:
   "Clique no link para ver mais fotos e comprar com frete grátis 💛"
6. **Intenção de compra** — Se a cliente disser "quero", "vou levar", "como pago", "aceita cartão", "como faço pedido", "fechar pedido" ou similar, responda com o link direto do(s) produto(s) e:
   "Acesse o link, adicione ao carrinho e finalize com cartão, PIX ou boleto. Entregamos para todo o Brasil com frete grátis! 🚚"
7. **Sem repetição** — NUNCA sugira novamente produtos que já apareceram nesta conversa (lista abaixo). Se esgotou as opções da categoria pedida, diga:
   "Esses são todos os [categoria] que temos no momento. Posso te mostrar algo parecido?"
8. **Quando NÃO souber** — Se não encontrar produto adequado ou a cliente fizer reclamação/pedir humano, responda APENAS:
   "Vou chamar nossa equipe para te ajudar pessoalmente! Um momento 🙏"
   e nada mais.`);

  if (produtosJaMostrados && produtosJaMostrados.length) {
    blocos.push(`# PRODUTOS JÁ APRESENTADOS NESTA CONVERSA (NÃO REPETIR)
${produtosJaMostrados.map((n) => `- ${n}`).join("\n")}`);
  }

  blocos.push(`# REGRAS DE NEGÓCIO
Horário: ${cfg.horario_atendimento_inicio} às ${cfg.horario_atendimento_fim} (${dentroHorario ? "atendendo agora" : "FORA do horário"}).
${!dentroHorario && cfg.mensagem_fora_horario ? `Quando fora do horário: ${cfg.mensagem_fora_horario}` : ""}
Pagamento: ${(cfg.formas_pagamento_ativas ?? []).join(", ")}.
${cfg.parcelamento_ativo ? `Parcelamos em até ${cfg.max_parcelas}x acima de R$ ${cfg.valor_minimo_parcelamento}.` : ""}
Taxa de entrega: R$ ${cfg.taxa_entrega}. ${cfg.area_cobertura_entrega ?? ""}
Limite de desconto: ${cfg.limite_desconto_negociacao}%.
${cfg.politica_desconto ? `Política de desconto: ${cfg.politica_desconto}` : ""}
${cfg.quando_transferir_humano ? `Transferir para humano quando: ${cfg.quando_transferir_humano}` : ""}
${cfg.whatsapp_humano ? `Atendimento humano: ${cfg.whatsapp_humano}.` : ""}
${cfg.regras_extras ? `Regras adicionais: ${cfg.regras_extras}` : ""}`);

  if (cfg.topicos_proibidos || cfg.palavras_proibidas) {
    blocos.push(`# RESTRIÇÕES
${cfg.topicos_proibidos ? `Não fale sobre: ${cfg.topicos_proibidos}` : ""}
${cfg.palavras_proibidas ? `Nunca use as palavras/expressões: ${cfg.palavras_proibidas}` : ""}`);
  }

  if (faqs?.length) {
    blocos.push(`# BASE DE CONHECIMENTO (FAQ)
${faqs.map((f) => `P: ${f.pergunta}\nR: ${f.resposta}`).join("\n\n")}`);
  }

  blocos.push(`# CATÁLOGO DISPONÍVEL (ordem: mais vendidos / menor preço primeiro)
${(produtos ?? []).map((p) => `- ${p.nome} (${p.categoria}${p.genero ? `, ${p.genero}` : ""}) — R$ ${p.preco} — estoque: ${p.quantidade_estoque}${p.url_produto ? ` — link: ${p.url_produto}` : ""}${p.descricao ? ` — ${p.descricao}` : ""}`).join("\n") || "Vazio."}

Use SOMENTE links e produtos desta lista — nunca invente. Quando a pessoa pedir gênero (masculino/feminino), recomende apenas itens do gênero certo (ou unissex).`);

  if (cupons?.length) {
    blocos.push(`# CUPONS ATIVOS
${cupons.map((c) => `- ${c.codigo}: ${c.tipo_desconto === "percentual" ? c.valor_desconto + "%" : "R$ " + c.valor_desconto}${c.validade ? ` (até ${c.validade})` : ""}`).join("\n")}`);
  }

  blocos.push(`# DIRETRIZES GERAIS
- Nunca invente produtos, preços, prazos ou políticas.
- Se não souber, transfira para humano (mensagem exata acima).
- Use *negrito* no estilo WhatsApp quando útil.
- Sempre responda em português do Brasil, simpática mas direta.`);

  return blocos.filter(Boolean).join("\n\n");
}

// ============ Helpers compartilhados ============

// Sinônimos comuns de joias para expandir buscas
export const SINONIMOS: Record<string, string[]> = {
  corrente: ["colar", "correntinha", "cordão", "cordao"],
  colar: ["corrente", "correntinha", "cordão", "cordao", "gargantilha"],
  argola: ["brinco", "argolinha"],
  brinco: ["argola", "argolinha", "ear", "earcuff"],
  alianca: ["anel", "aliança"],
  anel: ["alianca", "aliança", "solitário", "solitario"],
  pulseira: ["bracelete", "pulseirinha"],
  bracelete: ["pulseira"],
  tornozeleira: ["pulseira de pé"],
  piercing: ["pirsing"],
  conjunto: ["kit", "trio"],
};

export function expandirComSinonimos(palavras: string[]): string[] {
  const out = new Set<string>(palavras);
  for (const w of palavras) {
    const norm = w.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const [k, vs] of Object.entries(SINONIMOS)) {
      if (k === norm || vs.includes(norm) || vs.includes(w)) {
        out.add(k);
        for (const v of vs) out.add(v);
      }
    }
  }
  return Array.from(out);
}

// Detecta faixa de preço mencionada (ex: "até 100", "máximo 150", "mais barato")
export function detectarFaixaPreco(texto: string): { max?: number; baratoPrimeiro?: boolean } {
  const t = texto.toLowerCase();
  const baratoPrimeiro = /\b(mais\s+barat|barato|econom|em\s+conta|baixo\s+pre)/.test(t);
  const matchAte = t.match(/(?:at[eé]|m[aá]ximo|no\s+m[aá]ximo|abaixo\s+de|menos\s+de)\s+(?:r?\$?\s*)?(\d{2,4})/);
  const matchReais = t.match(/(\d{2,4})\s*(?:reais|r\$)/);
  const max = matchAte ? Number(matchAte[1]) : matchReais ? Number(matchReais[1]) : undefined;
  return { max, baratoPrimeiro };
}

// Detecta gatilho de transferência humana
export function detectarPedidoHumano(texto: string): { sim: boolean; motivo?: string } {
  const t = texto.toLowerCase();
  if (/\b(falar\s+com\s+(uma\s+)?(pessoa|humano|atendente|gerente|vendedor)|atendimento\s+humano|quero\s+humano|chama\s+(algu[eé]m|uma\s+pessoa))\b/.test(t)) {
    return { sim: true, motivo: "Cliente pediu atendimento humano" };
  }
  if (/\b(reclama[çc][aã]o|insatisfeit|p[eé]ssimo|horr[ií]vel|fraude|enganad|n[aã]o\s+chegou|quebrad|defeito|devolver|reembolso|estorno|cancelar\s+pedido)\b/.test(t)) {
    return { sim: true, motivo: "Possível reclamação" };
  }
  return { sim: false };
}

// Detecta intenção de compra
export function detectarIntencaoCompra(texto: string): boolean {
  const t = texto.toLowerCase();
  return /\b(quero|vou\s+levar|vou\s+comprar|fechar\s+pedido|como\s+(pago|fa[çc]o\s+(o\s+)?pedido|compr)|aceita\s+(cart[aã]o|pix|boleto)|finalizar|comprar\s+agora|pode\s+separar)\b/.test(t);
}

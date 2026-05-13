// Shared system-prompt builder for chat + whatsapp-webhook
export function buildSystemPrompt(opts: {
  cfg: any;
  produtos: any[];
  cupons: any[];
  faqs: any[];
  canal: "site" | "whatsapp";
}) {
  const { cfg, produtos, cupons, faqs, canal } = opts;

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

  const blocos: string[] = [];

  blocos.push(`# IDENTIDADE
Você é ${cfg.nome_agente}, atendente virtual da loja "${cfg.nome_loja}".
${cfg.descricao_loja ? `Sobre a loja: ${cfg.descricao_loja}` : ""}
${cfg.diferenciais_loja ? `Diferenciais: ${cfg.diferenciais_loja}` : ""}
${cfg.personalidade ? `Personalidade: ${cfg.personalidade}` : ""}`);

  blocos.push(`# ESTILO
Tom: ${cfg.tom_padrao}. Idioma: ${cfg.idioma ?? "pt-BR"}.
${tamanho} ${emoji}
${cfg.assinatura ? `Assine sempre como: ${cfg.assinatura}` : ""}
${saudacao ? `Saudação inicial sugerida: "${saudacao}"` : ""}`);

  blocos.push(`# REGRAS DE NEGÓCIO
Horário: ${cfg.horario_atendimento_inicio} às ${cfg.horario_atendimento_fim} (${dentroHorario ? "estamos atendendo agora" : "FORA do horário"}).
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

  blocos.push(`# CATÁLOGO
${(produtos ?? []).map((p) => `- ${p.nome} (${p.categoria}) — R$ ${p.preco} — estoque: ${p.quantidade_estoque}${p.descricao ? ` — ${p.descricao}` : ""}`).join("\n") || "Vazio."}`);

  if (cupons?.length) {
    blocos.push(`# CUPONS ATIVOS
${cupons.map((c) => `- ${c.codigo}: ${c.tipo_desconto === "percentual" ? c.valor_desconto + "%" : "R$ " + c.valor_desconto}${c.validade ? ` (até ${c.validade})` : ""}`).join("\n")}`);
  }

  blocos.push(`# DIRETRIZES GERAIS
- Nunca invente produtos, preços, prazos ou políticas fora destas instruções.
- Se não souber, diga que vai verificar com o atendimento humano.
- Use *negrito* no estilo WhatsApp quando útil.
- Para fechar pedido, colete: produto(s), forma de pagamento, entrega/retirada e endereço se entrega.`);

  return blocos.filter(Boolean).join("\n\n");
}

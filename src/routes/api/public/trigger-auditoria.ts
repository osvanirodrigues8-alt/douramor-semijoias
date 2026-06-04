// Disparo manual de auditoria — chamado pelo botão "Analisar agora" no painel /melhorias
// Analisa as últimas 50 conversas sem filtro de tempo mínimo (diferente do cron horário)
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const apiKey = () => (process.env.ANTHROPIC_API_KEY ?? "").replace(/^﻿/, "").trim();

async function processAuditoriaManual(): Promise<object> {
  const resultados: any[] = [];
  const agora = new Date();
  const tresHorasAtras = new Date(agora.getTime() - 3 * 3600_000).toISOString();
  const quatroHorasAtras = new Date(agora.getTime() - 4 * 3600_000).toISOString();

  // Busca conversas com atividade nas últimas 48h
  const quarentaOitoHorasAtras = new Date(agora.getTime() - 48 * 3600_000).toISOString();

  const { data: conversas } = await supabaseAdmin
    .from("conversas")
    .select("id, cliente_id, precisa_humano, sessao_token")
    .eq("canal", "whatsapp")
    .gte("ultima_mensagem_em", quarentaOitoHorasAtras)
    .order("ultima_mensagem_em", { ascending: false })
    .limit(50);

  if (!conversas?.length) return { ok: true, processadas: 0, motivo: "sem conversas recentes" };

  // Não filtrar por "já revisada" — é análise manual completa
  // Mas evitar duplicar análise da mesma conversa nas últimas 3h
  const { data: recentes } = await supabaseAdmin
    .from("feedback_ia" as any)
    .select("conversa_id")
    .eq("tipo", "auto_revisao_ia")
    .gte("criado_em", tresHorasAtras);

  const idsRecentes = new Set((recentes ?? []).map((r: any) => r.conversa_id));
  const elegiveis = (conversas as any[]).filter((c) => !idsRecentes.has(c.id));

  for (const conv of elegiveis) {
    try {
      const { data: mensagens } = await supabaseAdmin
        .from("mensagens")
        .select("id, papel, conteudo, criado_em, midia_tipo")
        .eq("conversa_id", conv.id)
        .order("criado_em", { ascending: false })
        .limit(20);

      const hist = ((mensagens ?? []) as any[]).reverse();
      if (hist.length < 2) { resultados.push({ conv: conv.id, skip: "poucas msgs" }); continue; }

      const ultimaMsg = hist[hist.length - 1];

      // Detectar abandono
      if (ultimaMsg?.papel === "assistant" && ultimaMsg?.criado_em < quatroHorasAtras) {
        await (supabaseAdmin as any).from("feedback_ia").insert({
          conversa_id: conv.id,
          mensagem_id: ultimaMsg.id,
          tipo: "auto_abandono",
          severidade: "media",
          descricao: "Cliente não respondeu por 4h+ após mensagem da IA",
          contexto_conversa: { mensagens: hist.slice(-4).map((m: any) => ({ papel: m.papel, conteudo: m.conteudo.slice(0, 200) })) },
          status: "pendente",
        });
        resultados.push({ conv: conv.id, tipo: "abandono" });
        continue;
      }

      if (ultimaMsg?.papel !== "assistant") {
        resultados.push({ conv: conv.id, skip: "ultima msg nao e assistant" });
        continue;
      }

      const transcricao = hist
        .map((m: any) => `[${m.papel === "user" ? "Cliente" : "Juliana"}]: ${m.conteudo.slice(0, 400)}`)
        .join("\n");

      const rubrica = `Você é auditor de qualidade de uma loja de semi joias premium chamada Douramor.
Analise a conversa abaixo com critério rigoroso. Responda APENAS com JSON válido (sem markdown):
{
  "nota": <1 a 10>,
  "problema": "<descrição clara e específica do problema principal, ou null se não houver>",
  "sugestao": "<sugestão concreta e acionável de melhoria, ex: 'Adicionar ao prompt que a Juliana deve oferecer cupom quando cliente mencionar preço alto', ou null>",
  "categoria": "<tom|precisao|oportunidade|profissionalismo|sem_problema>"
}

Critérios de avaliação:
- Tom (0-2.5pt): Calorosa, empática, profissional? Linguagem adequada para semi joias premium?
- Precisão (0-2.5pt): Informações corretas? Não inventou produtos/preços/prazos?
- Oportunidade (0-2.5pt): Aproveitou chance de venda? Fez cross-sell? Criou urgência?
- Profissionalismo (0-2.5pt): Respostas claras, sem erros, sem repetições desnecessárias?

Seja criterioso — notas 8+ só para conversas verdadeiramente boas.

Conversa:
${transcricao.slice(0, 4000)}`;

      const aiResp = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: { "x-api-key": apiKey(), "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 600,
          messages: [{ role: "user", content: rubrica }],
        }),
        signal: AbortSignal.timeout(25000),
      });

      if (!aiResp.ok) { resultados.push({ conv: conv.id, erro: `anthropic ${aiResp.status}` }); continue; }

      const ai = await aiResp.json();
      const rawJson = (ai.content?.[0]?.text ?? "").trim();

      let parsed: any;
      try { parsed = JSON.parse(rawJson); } catch { resultados.push({ conv: conv.id, erro: "json_parse" }); continue; }

      const nota = Math.min(10, Math.max(1, Number(parsed.nota ?? 5)));

      await (supabaseAdmin as any).from("feedback_ia").insert({
        conversa_id: conv.id,
        tipo: "auto_revisao_ia",
        severidade: nota >= 8 ? "baixa" : nota >= 6 ? "media" : nota >= 4 ? "alta" : "critica",
        descricao: parsed.problema ?? `Revisão manual — nota ${nota}/10`,
        contexto_conversa: {
          mensagens: hist.slice(-8).map((m: any) => ({ papel: m.papel, conteudo: m.conteudo.slice(0, 300) })),
          categoria: parsed.categoria,
        },
        sugestao_correcao: parsed.sugestao ?? null,
        status: nota >= 7 ? "descartado" : "pendente",
        nota_ia: nota,
      });

      resultados.push({ conv: conv.id, nota, problema: !!parsed.problema });
    } catch (e) {
      console.error("[trigger-auditoria]", conv.id, (e as Error).message);
      resultados.push({ conv: conv.id, erro: (e as Error).message.slice(0, 80) });
    }
  }

  const comProblema = resultados.filter((r) => r.problema).length;
  const semProblema = resultados.filter((r) => r.nota >= 7 && !r.erro && !r.skip).length;

  return {
    ok: true,
    analisadas: resultados.filter((r) => !r.skip).length,
    comProblema,
    semProblema,
    erros: resultados.filter((r) => r.erro).length,
  };
}

async function handleRequest(request: Request): Promise<Response> {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  try {
    const resultado = await processAuditoriaManual();
    return new Response(JSON.stringify(resultado), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[trigger-auditoria] fatal", e);
    return new Response(JSON.stringify({ ok: false, erro: (e as Error).message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/public/trigger-auditoria")({
  // @ts-ignore
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => handleRequest(request),
      OPTIONS: async ({ request }: { request: Request }) => handleRequest(request),
    },
  },
});

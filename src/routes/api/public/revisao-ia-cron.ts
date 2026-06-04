// Cron de revisão IA — audita conversas finalizadas a cada hora
// Usa Claude Haiku para avaliar tom, precisão, oportunidade e profissionalismo
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const groqKey = () => (process.env.ANTHROPIC_API_KEY ?? "").replace(/^﻿/, "").trim();

async function processRevisaoIA(): Promise<object> {
  const resultados: any[] = [];

  const agora = new Date();
  const umHoraAtras = new Date(agora.getTime() - 3600_000).toISOString();
  const duasHorasAtras = new Date(agora.getTime() - 7200_000).toISOString();
  const quatroHorasAtras = new Date(agora.getTime() - 4 * 3600_000).toISOString();

  // Busca conversas WhatsApp sem escalonamento humano com alguma atividade
  const { data: conversas, error: errConv } = await supabaseAdmin
    .from("conversas")
    .select("id, cliente_id, precisa_humano")
    .eq("canal", "whatsapp")
    .eq("precisa_humano", false)
    .lt("criado_em", umHoraAtras)
    .limit(30);

  if (errConv || !conversas?.length) {
    return { ok: true, processadas: 0, motivo: errConv?.message ?? "sem conversas elegiveis" };
  }

  // Filtrar conversas já revisadas nas últimas 2h
  const { data: jaRevisadas } = await supabaseAdmin
    .from("feedback_ia")
    .select("conversa_id")
    .eq("tipo", "auto_revisao_ia")
    .gte("criado_em", duasHorasAtras);

  const idsRevisados = new Set((jaRevisadas ?? []).map((r: any) => r.conversa_id));
  const elegiveis = (conversas as any[]).filter((c) => !idsRevisados.has(c.id)).slice(0, 20);

  for (const conv of elegiveis) {
    try {
      // Últimas 10 mensagens
      const { data: mensagens } = await supabaseAdmin
        .from("mensagens")
        .select("id, papel, conteudo, criado_em")
        .eq("conversa_id", conv.id)
        .order("criado_em", { ascending: false })
        .limit(10);

      const hist = ((mensagens ?? []) as any[]).reverse();
      if (hist.length < 2) { resultados.push({ conv: conv.id, skip: "sem historico" }); continue; }

      const ultimaMsg = hist[hist.length - 1];

      // Detectar abandono (IA enviou último, cliente sumiu por 4h+)
      if (ultimaMsg?.papel === "assistant" && ultimaMsg?.criado_em < quatroHorasAtras) {
        await supabaseAdmin.from("feedback_ia").insert({
          conversa_id: conv.id,
          mensagem_id: ultimaMsg.id,
          tipo: "auto_abandono",
          severidade: "media",
          descricao: "Cliente não respondeu por 4h+ após mensagem da IA",
          contexto_conversa: {
            mensagens: hist.slice(-4).map((m: any) => ({ papel: m.papel, conteudo: m.conteudo.slice(0, 200) })),
          },
          status: "pendente",
        });
        resultados.push({ conv: conv.id, tipo: "abandono" });
        continue;
      }

      // Só revisar se última msg foi do assistant
      if (ultimaMsg?.papel !== "assistant") {
        resultados.push({ conv: conv.id, skip: "ultima msg nao e assistant" });
        continue;
      }

      // Montar transcrição
      const transcricao = hist
        .map((m: any) => `[${m.papel === "user" ? "Cliente" : "Juliana"}]: ${m.conteudo.slice(0, 400)}`)
        .join("\n");

      const rubrica = `Você é auditor de qualidade de uma loja de semi joias premium.
Analise a conversa abaixo e responda APENAS com JSON válido (sem markdown, sem texto fora do JSON):
{
  "nota": <número de 1 a 10>,
  "problema": "<descrição do principal problema se nota < 7, ou null>",
  "sugestao": "<sugestão de melhoria concreta e acionável se nota < 7, ou null>",
  "categoria": "<tom|precisao|oportunidade|profissionalismo|sem_problema>"
}

Rubrica de avaliação (cada dimensão vale até 2.5 pontos):
- Tom: Juliana foi empática, calorosa, profissional? Linguagem adequada para venda de semi joias?
- Precisão: Informações corretas sobre produtos, preços, frete, prazos?
- Oportunidade: Aproveitou chance de venda? Ofereceu produto relevante?
- Profissionalismo: Sem erros graves de ortografia, respostas claras e objetivas?

Conversa:
${transcricao.slice(0, 3000)}`;

      const aiResp = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "x-api-key": groqKey(),
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 512,
          messages: [{ role: "user", content: rubrica }],
        }),
        signal: AbortSignal.timeout(20000),
      });

      if (!aiResp.ok) {
        resultados.push({ conv: conv.id, erro: `anthropic ${aiResp.status}` });
        continue;
      }

      const ai = await aiResp.json();
      const rawJson = (ai.content?.[0]?.text ?? "").trim();

      let parsed: any;
      try { parsed = JSON.parse(rawJson); } catch {
        resultados.push({ conv: conv.id, erro: "json_parse_fail" });
        continue;
      }

      const nota = Math.min(10, Math.max(1, Number(parsed.nota ?? 5)));

      await supabaseAdmin.from("feedback_ia").insert({
        conversa_id: conv.id,
        tipo: "auto_revisao_ia",
        severidade: nota >= 8 ? "baixa" : nota >= 6 ? "media" : nota >= 4 ? "alta" : "critica",
        descricao: parsed.problema ?? `Revisão automática — nota ${nota}/10`,
        contexto_conversa: {
          mensagens: hist.slice(-6).map((m: any) => ({ papel: m.papel, conteudo: m.conteudo.slice(0, 300) })),
          categoria: parsed.categoria,
        },
        sugestao_correcao: parsed.sugestao ?? null,
        status: nota >= 7 ? "descartado" : "pendente",
        nota_ia: nota,
      });

      resultados.push({ conv: conv.id, nota, tipo: "revisao_ia" });
    } catch (e) {
      console.error("[revisao-ia-cron]", conv.id, (e as Error).message);
      resultados.push({ conv: conv.id, erro: (e as Error).message.slice(0, 100) });
    }
  }

  return { ok: true, processadas: resultados.length, resultados };
}

async function handleCronRequest(request: Request): Promise<Response> {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(request.url);
    const provided = request.headers.get("x-cron-secret") ?? url.searchParams.get("secret");
    if (provided !== secret) return new Response("Unauthorized", { status: 401, headers: cors });
  }

  try {
    const result = await processRevisaoIA();
    return new Response(JSON.stringify(result), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[revisao-ia-cron] fatal", e);
    return new Response(JSON.stringify({ ok: false, erro: (e as Error).message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/public/revisao-ia-cron")({
  // @ts-ignore
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => handleCronRequest(request),
      GET: async ({ request }: { request: Request }) => handleCronRequest(request),
    },
  },
});

// Auditoria manual profissional — análise detalhada de conversas das últimas 48h
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const apiKey = () => (process.env.ANTHROPIC_API_KEY ?? "").replace(/^﻿/, "").trim();

const RUBRICA_PROFISSIONAL = `Você é um especialista em vendas consultivas para o segmento de semi joias premium.
Sua tarefa é auditar a conversa abaixo e identificar com PRECISÃO o que pode ser melhorado.

Analise os seguintes aspectos:

1. **ABORDAGEM DE VENDAS**
   - A Juliana identificou a necessidade real do cliente?
   - Fez perguntas para entender o perfil (presente para quem? ocasião? faixa de preço?)?
   - Criou desejo pelo produto ou apenas descreveu?
   - Usou gatilhos de urgência ou escassez quando apropriado?

2. **TRATAMENTO DE OBJEÇÕES**
   - Cliente demonstrou resistência (preço, prazo, indecisão)?
   - A Juliana rebateu adequadamente ou cedeu fácil?
   - Ofereceu alternativas quando o produto não agradou?

3. **CONDUÇÃO AO FECHAMENTO**
   - Tentou fechar a venda ativamente?
   - Ofereceu facilidade de pagamento quando adequado?
   - Fez cross-sell / upsell de forma natural?

4. **QUALIDADE DO ATENDIMENTO**
   - Tom adequado para a marca (caloroso, feminino, sem exageros)?
   - Respostas claras e objetivas?
   - Alguma informação incorreta sobre produto, frete ou prazo?
   - Ficou em loop ou repetiu a mesma coisa?

5. **OPORTUNIDADES PERDIDAS**
   - Cliente deu sinal de interesse e a Juliana não aproveitou?
   - Houve momento em que devia ter perguntado o CEP/forma de pagamento e não perguntou?
   - Deixou o cliente sem resposta clara?

Responda SOMENTE com JSON válido, sem markdown, sem texto fora do JSON:
{
  "nota": <número de 1.0 a 10.0 com uma casa decimal>,
  "resumo_executivo": "<2-3 frases resumindo o desempenho geral da conversa>",
  "pontos_fortes": ["<ponto forte 1>", "<ponto forte 2>"],
  "problemas": [
    {
      "categoria": "<abordagem|objecao|fechamento|qualidade|oportunidade>",
      "gravidade": "<critica|alta|media|baixa>",
      "descricao": "<descrição específica do problema, com exemplo da conversa se possível>",
      "sugestao": "<ação concreta para corrigir, ex: adicionar ao prompt que...>"
    }
  ],
  "desfecho": "<vendeu|quase_vendeu|cliente_sumiu|escalou_humano|sem_interesse|inconclusivo>",
  "categoria_principal": "<tom|precisao|fechamento|oportunidade|sem_problema>"
}

Seja rigoroso. Nota 8+ apenas para conversas exemplares. Se encontrou problema real, descreva com um trecho da conversa como evidência.`;

async function processAuditoriaManual(): Promise<object> {
  const resultados: any[] = [];
  const agora = new Date();
  const seisHorasAtras = new Date(agora.getTime() - 6 * 3600_000).toISOString();
  const quarentaOitoHorasAtras = new Date(agora.getTime() - 48 * 3600_000).toISOString();

  // Busca conversas com atividade nas últimas 48h
  const { data: conversas } = await supabaseAdmin
    .from("conversas")
    .select("id, cliente_id, precisa_humano, sessao_token, ultima_mensagem_em")
    .eq("canal", "whatsapp")
    .gte("ultima_mensagem_em", quarentaOitoHorasAtras)
    .order("ultima_mensagem_em", { ascending: false })
    .limit(50);

  if (!conversas?.length) return { ok: true, processadas: 0, motivo: "sem conversas recentes" };

  // Evitar re-análise das últimas 6h (mas não mais que isso — manual deve ser completo)
  const { data: recentes } = await (supabaseAdmin as any)
    .from("feedback_ia")
    .select("conversa_id")
    .eq("tipo", "auto_revisao_ia")
    .gte("criado_em", seisHorasAtras);

  const idsRecentes = new Set((recentes ?? []).map((r: any) => r.conversa_id));
  const elegiveis = (conversas as any[]).filter((c) => !idsRecentes.has(c.id));

  for (const conv of elegiveis) {
    try {
      // Buscar mais mensagens para análise profunda
      const { data: mensagens } = await supabaseAdmin
        .from("mensagens")
        .select("id, papel, conteudo, criado_em, midia_tipo, midia_transcricao")
        .eq("conversa_id", conv.id)
        .order("criado_em", { ascending: false })
        .limit(30);

      const hist = ((mensagens ?? []) as any[]).reverse();
      if (hist.length < 3) { resultados.push({ conv: conv.id, skip: "poucas msgs" }); continue; }

      // Montar transcrição enriquecida (inclui transcrições de áudio)
      const transcricao = hist.map((m: any) => {
        const quem = m.papel === "user" ? "CLIENTE" : "JULIANA";
        const hora = new Date(m.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        let conteudo = m.conteudo ?? "";
        if (m.midia_tipo === "audio" && m.midia_transcricao) {
          conteudo = `[áudio transcrito]: ${m.midia_transcricao}`;
        } else if (m.midia_tipo === "image") {
          conteudo = `[imagem enviada]`;
        }
        return `[${hora}] ${quem}: ${conteudo.slice(0, 500)}`;
      }).join("\n");

      const prompt = `${RUBRICA_PROFISSIONAL}\n\n---\nCONVERSA:\n${transcricao.slice(0, 5000)}`;

      const aiResp = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey(),
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",  // Sonnet para análise mais profunda
          max_tokens: 1500,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(40000),
      });

      if (!aiResp.ok) {
        console.error("[trigger-auditoria] anthropic error", aiResp.status, await aiResp.text().catch(() => ""));
        resultados.push({ conv: conv.id, erro: `anthropic ${aiResp.status}` });
        continue;
      }

      const ai = await aiResp.json();
      const rawJson = (ai.content?.[0]?.text ?? "").trim();

      let parsed: any;
      try {
        // Remover possíveis blocos de código markdown
        const clean = rawJson.replace(/^```json?\n?/i, "").replace(/```$/m, "").trim();
        parsed = JSON.parse(clean);
      } catch {
        console.error("[trigger-auditoria] json parse fail:", rawJson.slice(0, 200));
        resultados.push({ conv: conv.id, erro: "json_parse" });
        continue;
      }

      const nota = Math.min(10, Math.max(1, Number(parsed.nota ?? 5)));
      const problemas: any[] = parsed.problemas ?? [];
      const temProblema = problemas.length > 0 && nota < 8;

      // Severidade geral baseada na nota
      const sevGeral = nota >= 8 ? "baixa" : nota >= 6 ? "media" : nota >= 4 ? "alta" : "critica";

      // Salvar 1 feedback geral da conversa com o resumo executivo
      await (supabaseAdmin as any).from("feedback_ia").insert({
        conversa_id: conv.id,
        tipo: "auto_revisao_ia",
        severidade: sevGeral,
        descricao: parsed.resumo_executivo ?? `Nota ${nota}/10 — ${parsed.categoria_principal ?? "revisão geral"}`,
        contexto_conversa: {
          mensagens: hist.slice(-8).map((m: any) => ({
            papel: m.papel,
            conteudo: (m.midia_transcricao || m.conteudo)?.slice(0, 300),
            criado_em: m.criado_em,
          })),
          desfecho: parsed.desfecho,
          pontos_fortes: parsed.pontos_fortes ?? [],
          categoria: parsed.categoria_principal,
        },
        sugestao_correcao: problemas.length > 0
          ? problemas.map((p: any) => `[${p.categoria?.toUpperCase()}] ${p.descricao} → ${p.sugestao}`).join("\n\n")
          : null,
        status: nota >= 7 ? "descartado" : "pendente",
        nota_ia: nota,
      });

      // Salvar feedbacks individuais para cada problema crítico/alto
      for (const prob of problemas.filter((p: any) => p.gravidade === "critica" || p.gravidade === "alta")) {
        await (supabaseAdmin as any).from("feedback_ia").insert({
          conversa_id: conv.id,
          tipo: "auto_revisao_ia",
          severidade: prob.gravidade,
          descricao: `[${(prob.categoria ?? "").toUpperCase()}] ${prob.descricao}`,
          contexto_conversa: {
            mensagens: hist.slice(-6).map((m: any) => ({
              papel: m.papel,
              conteudo: (m.midia_transcricao || m.conteudo)?.slice(0, 300),
            })),
            categoria: prob.categoria,
          },
          sugestao_correcao: prob.sugestao ?? null,
          status: "pendente",
          nota_ia: nota,
        });
      }

      resultados.push({
        conv: conv.id,
        nota,
        problemas: problemas.length,
        desfecho: parsed.desfecho,
      });
    } catch (e) {
      console.error("[trigger-auditoria]", conv.id, (e as Error).message);
      resultados.push({ conv: conv.id, erro: (e as Error).message.slice(0, 80) });
    }
  }

  const analisadas = resultados.filter((r) => !r.skip && !r.erro).length;
  const comProblema = resultados.filter((r) => (r.problemas ?? 0) > 0).length;
  const notaMedia = resultados.filter((r) => r.nota).length
    ? (resultados.filter((r) => r.nota).reduce((s, r) => s + r.nota, 0) / resultados.filter((r) => r.nota).length).toFixed(1)
    : null;

  return { ok: true, analisadas, comProblema, notaMedia, erros: resultados.filter((r) => r.erro).length };
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
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
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

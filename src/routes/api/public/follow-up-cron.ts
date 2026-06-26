// Cron de follow-up: cadência 3×/dia × 7 dias, com ângulos diferentes por tentativa.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildSystemPrompt,
  calcularProximoFollowup,
  dentroDoHorario,
  detectarTemperatura,
  normalizarMensagensIA,
  callAnthropicMessages,
} from "@/lib/shared/prompt";

const STEVO_URL = "https://smv2-4.stevo.chat/send/text";

// ---------- auth helper ----------
async function handleCronRequest(request: Request, label: string): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = request.headers.get("x-cron-secret") ?? new URL(request.url).searchParams.get("secret");
    // Vercel Cron envia o secret como "Authorization: Bearer ${CRON_SECRET}".
    const bearerOk = request.headers.get("authorization") === `Bearer ${secret}`;
    if (!bearerOk && provided !== secret) return new Response("Unauthorized", { status: 401 });
  }
  try {
    const limit = Math.max(1, Math.min(50, Number(new URL(request.url).searchParams.get("limit") ?? 50)));
    const result = await processFollowUps(limit);
    console.log(`[${label}]`, JSON.stringify(result).slice(0, 1000));
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error(`[${label}] error`, e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

async function processFollowUps(maxToProcess = 50) {
  const [{ data: cfg }, { data: cfgAg }] = await Promise.all([
    supabaseAdmin.from("configuracoes").select("*").order("atualizado_em", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("configuracoes_agente").select("*").order("atualizado_em", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!cfg || !cfgAg) return { ok: true, skipped: "config não encontrada" };
  // Correção PROBLEMA 2: verificar ambos os nomes possíveis do campo
  if ((cfgAg as any).followup_ativo === false || (cfgAg as any).follow_up_ativo === false) return { ok: true, skipped: "follow-up desativado" };
  // Correção PROBLEMA 2: verificar também na tabela configuracoes
  if ((cfg as any).follow_up_ativo === false || (cfg as any).followup_ativo === false) return { ok: true, skipped: "follow-up desativado (configuracoes)" };
  if (cfgAg.respeitar_horario && !dentroDoHorario(cfgAg)) return { ok: true, skipped: "fora do horário" };

  const agora = new Date().toISOString();
  const hoje = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  // Elegíveis: conversas whatsapp, última msg assistant, ainda dentro do ciclo de dias, com proximo_followup_em vencido (ou sem agendamento ainda)
  const diasTotal = Number(cfgAg.dias_total ?? 10);
  const limiteInicial = new Date(Date.now() - Number(cfgAg.fup1_horas ?? 3) * 3600_000).toISOString();
  // Correção PROBLEMA 2 (conversa ativa): exigir que a última msg tenha pelo menos 2h de silêncio
  const limite2h = new Date(Date.now() - 2 * 3600_000).toISOString();

  const { data: conversas } = await supabaseAdmin
    .from("conversas")
    .select("id, sessao_token, cliente_id, ultima_mensagem_em, fups_enviados_hoje, dia_followup_atual, proximo_followup_em, data_inicio_followup, produtos_mostrados, precisa_humano, tipo_conversa")
    .eq("canal", "whatsapp")
    .eq("ultima_mensagem_papel", "assistant")
    .eq("precisa_humano", false)
    .lt("dia_followup_atual", diasTotal)
    .lt("ultima_mensagem_em", limiteInicial)
    .limit(50);

  // Correção PROBLEMA 2: filtrar conversas com mensagem do usuário nas últimas 2h
  // (buscar a msg mais recente de cada conversa e checar se é do usuário e recente)
  // Também aplicar limite de 2h sobre ultima_mensagem_em independente do papel
  const conversasFiltradas = (conversas ?? []).filter((c) => !c.ultima_mensagem_em || c.ultima_mensagem_em < limite2h);

  const elegiveis = conversasFiltradas.filter((c) => !c.proximo_followup_em || c.proximo_followup_em <= agora);
  if (!elegiveis.length) return { ok: true, processadas: 0 };
  // Limita quantos processa por chamada (o disparo pausado chama com limit=1 p/ não bloquear o WhatsApp).
  const lote = elegiveis.slice(0, maxToProcess);

  const [{ data: produtosTodos }, { data: cupons }, { data: faqs }] = await Promise.all([
    supabaseAdmin.from("produtos").select("id,nome,categoria,genero,preco,descricao,quantidade_estoque,status,url_produto").eq("status", "disponivel").limit(60),
    supabaseAdmin.from("cupons").select("codigo,tipo_desconto,valor_desconto,validade").eq("ativo", true),
    supabaseAdmin.from("faqs").select("pergunta,resposta,categoria,ordem").eq("ativo", true).order("ordem"),
  ]);

  const resultados: any[] = [];

  for (const [i, conv] of lote.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1500)); // espaçamento entre envios na mesma chamada
    try {
      const [{ data: histRaw }, { data: cliente }] = await Promise.all([
        // Correção PROBLEMA 6: pegar as ÚLTIMAS 30 mensagens (desc) e inverter para ordem cronológica
        supabaseAdmin.from("mensagens").select("papel, conteudo, criado_em").eq("conversa_id", conv.id).order("criado_em", { ascending: false }).limit(30),
        conv.cliente_id
          ? supabaseAdmin.from("clientes").select("*").eq("id", conv.cliente_id).maybeSingle()
          : Promise.resolve({ data: null as any }),
      ]);

      // Correção PROBLEMA 6: inverter para ordem cronológica ascendente
      const hist = (histRaw ?? []).reverse();

      // Correção PROBLEMA 1 (race condition): verificar se cliente respondeu após a query inicial
      const ultimaMsgHist = hist.length > 0 ? hist[hist.length - 1] : null;
      if (ultimaMsgHist && ultimaMsgHist.papel === "user") {
        resultados.push({ conv: conv.id, skipped: "cliente respondeu (race condition)" });
        continue;
      }

      // Correção PROBLEMA 1: verificar diretamente no banco se última msg é do usuário
      const { data: convAtual } = await supabaseAdmin
        .from("conversas")
        .select("ultima_mensagem_papel, precisa_humano")
        .eq("id", conv.id)
        .single();
      if (convAtual?.ultima_mensagem_papel !== "assistant" || convAtual?.precisa_humano === true) {
        resultados.push({ conv: conv.id, skipped: "cliente respondeu ou humano assumiu (re-verificação)" });
        continue;
      }

      // Correção: zerar fups_enviados_hoje se o proximo_followup_em era de um dia anterior
      const proximoFollowupDia = conv.proximo_followup_em ? conv.proximo_followup_em.slice(0, 10) : null;
      const fupsHoje = (proximoFollowupDia && proximoFollowupDia < hoje) ? 0 : (conv.fups_enviados_hoje ?? 0);
      const diaAtual = conv.dia_followup_atual ?? 0;
      const numeroTentativa = (Math.min(3, fupsHoje + 1)) as 1 | 2 | 3;

      // Identifica produtos em foco (links na conversa do assistente)
      const textoAssistant = (hist ?? []).filter((m: any) => m.papel === "assistant").map((m: any) => m.conteudo).join("\n");
      const linksMencionados = new Set((textoAssistant.match(/https?:\/\/[^\s)]+/g) ?? []).map((u) => u.replace(/[.,;)]+$/, "")));
      const produtosEmFoco = (produtosTodos ?? []).filter((p) => p.url_produto && linksMencionados.has(p.url_produto)).slice(0, 5);
      const produtosParaPrompt = produtosEmFoco.length ? produtosEmFoco : (produtosTodos ?? []).slice(0, 20);

      const temp = detectarTemperatura(hist ?? []);

      const systemPrompt = buildSystemPrompt({
        cfg, cfgAg,
        produtos: produtosParaPrompt,
        cupons: cupons ?? [], faqs: faqs ?? [],
        canal: "whatsapp",
        cliente,
        produtosJaMostrados: (Array.isArray(conv.produtos_mostrados) ? conv.produtos_mostrados : []).map((x: any) => String(x)).filter(Boolean),
        tipoConversa: (conv.tipo_conversa as any) ?? "ativo",
        temperatura: temp,
        modoFollowup: numeroTentativa,
      });

      const userMessages = normalizarMensagensIA([
        ...(hist ?? []).map((m: any) => ({ role: m.papel as "user" | "assistant", content: m.conteudo })),
        { role: "user" as const, content: "(sem resposta)" },
      ]);

      const aiResp = await callAnthropicMessages({
        apiKey: process.env.ANTHROPIC_API_KEY ?? "",
        model: cfg.modelo_ia,
        system: systemPrompt,
        messages: userMessages,
        maxTokens: 1024,
        temperature: 0.4,
      });
      if (!aiResp.ok) {
        resultados.push({ conv: conv.id, erro: `AI ${aiResp.status}` });
        continue;
      }
      const ai = await aiResp.json();
      const replyRaw: string = (ai.content?.[0]?.text ?? "").trim();
      if (!replyRaw) { resultados.push({ conv: conv.id, erro: "AI vazio" }); continue; }

      // REGRA DE NEGÓCIO: Juliana nunca transfere para humano — apenas remove a tag
      const reply = replyRaw.replace(/\[ESCALAR_ATACADO\]/gi, "").replace(/\[ESCALAR\]/gi, "").trim();
      if (!reply) { resultados.push({ conv: conv.id, erro: "AI vazio após limpar tags" }); continue; }

      const numero = String(conv.sessao_token).replace(/^wa:/, "").replace(/@.*/, "").replace(/\D/g, "");

      const novosFupsHoje = fupsHoje + 1;
      const { proximo, novoDia, resetar } = calcularProximoFollowup(cfgAg, novosFupsHoje, diaAtual);

      // Correção: atualizar proximo_followup_em imediatamente antes de enviar via Stevo
      // para evitar reprocessamento duplo caso o insert de mensagem falhe após envio
      if (resetar) {
        if (conv.cliente_id) {
          await supabaseAdmin.from("clientes").update({ temperatura_lead: "inativo" }).eq("id", conv.cliente_id);
        }
        await supabaseAdmin.from("conversas").update({
          fups_enviados_hoje: novosFupsHoje,
          dia_followup_atual: novoDia,
          proximo_followup_em: null,
          ultima_mensagem_papel: "assistant",
        }).eq("id", conv.id);
      } else {
        await supabaseAdmin.from("conversas").update({
          fups_enviados_hoje: novoDia !== diaAtual ? 0 : novosFupsHoje,
          dia_followup_atual: novoDia,
          proximo_followup_em: proximo?.toISOString() ?? null,
          data_inicio_followup: conv.data_inicio_followup ?? new Date().toISOString().slice(0, 10),
          ultima_mensagem_papel: "assistant",
        }).eq("id", conv.id);
      }

      const sendResp = await fetch(STEVO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: process.env.STEVO_API_KEY ?? "" },
        body: JSON.stringify({ number: numero, text: reply }),
      });
      if (!sendResp.ok) { resultados.push({ conv: conv.id, erro: `Stevo ${sendResp.status}` }); continue; }

      await supabaseAdmin.from("mensagens").insert({ conversa_id: conv.id, papel: "assistant", conteudo: reply });

      resultados.push({ conv: conv.id, ok: true, tentativa: numeroTentativa, dia: diaAtual });
    } catch (e) {
      resultados.push({ conv: conv.id, erro: (e as Error).message });
    }
  }

  return { ok: true, processadas: resultados.length, resultados };
}

export const Route = createFileRoute("/api/public/follow-up-cron")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => handleCronRequest(request, "follow-up-cron POST"),
      GET: async ({ request }: { request: Request }) => handleCronRequest(request, "follow-up-cron GET"),
    },
  },
});

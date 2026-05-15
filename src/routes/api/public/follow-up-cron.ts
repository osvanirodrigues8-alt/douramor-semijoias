// Cron de follow-up: cadência 3×/dia × 7 dias, com ângulos diferentes por tentativa.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildSystemPrompt,
  calcularProximoFollowup,
  dentroDoHorario,
  detectarTemperatura,
} from "../../../../supabase/functions/_shared/prompt";

const STEVO_URL = "https://sm-urso.stevo.chat/send/text";

async function processFollowUps() {
  const [{ data: cfg }, { data: cfgAg }] = await Promise.all([
    supabaseAdmin.from("configuracoes").select("*").limit(1).maybeSingle(),
    supabaseAdmin.from("configuracoes_agente").select("*").limit(1).maybeSingle(),
  ]);
  if (!cfg || !cfgAg) return { ok: true, skipped: "config não encontrada" };
  if (cfgAg.followup_ativo === false) return { ok: true, skipped: "follow-up desativado" };
  if (cfgAg.respeitar_horario && !dentroDoHorario(cfgAg)) return { ok: true, skipped: "fora do horário" };

  const agora = new Date().toISOString();

  // Elegíveis: conversas whatsapp, última msg assistant, ainda dentro do ciclo de dias, com proximo_followup_em vencido (ou sem agendamento ainda)
  const diasTotal = Number(cfgAg.dias_total ?? 7);
  const limiteInicial = new Date(Date.now() - Number(cfgAg.fup1_horas ?? 3) * 3600_000).toISOString();

  const { data: conversas } = await supabaseAdmin
    .from("conversas")
    .select("id, sessao_token, cliente_id, ultima_mensagem_em, fups_enviados_hoje, dia_followup_atual, proximo_followup_em, data_inicio_followup, produtos_mostrados, precisa_humano, tipo_conversa")
    .eq("canal", "whatsapp")
    .eq("ultima_mensagem_papel", "assistant")
    .eq("precisa_humano", false)
    .lt("dia_followup_atual", diasTotal)
    .lt("ultima_mensagem_em", limiteInicial)
    .limit(50);

  const elegiveis = (conversas ?? []).filter((c) => !c.proximo_followup_em || c.proximo_followup_em <= agora);
  if (!elegiveis.length) return { ok: true, processadas: 0 };

  const [{ data: produtosTodos }, { data: cupons }, { data: faqs }] = await Promise.all([
    supabaseAdmin.from("produtos").select("id,nome,categoria,genero,preco,descricao,quantidade_estoque,status,url_produto").eq("status", "disponivel").limit(60),
    supabaseAdmin.from("cupons").select("codigo,tipo_desconto,valor_desconto,validade").eq("ativo", true),
    supabaseAdmin.from("faqs").select("pergunta,resposta,categoria,ordem").eq("ativo", true).order("ordem"),
  ]);

  const resultados: any[] = [];

  for (const conv of elegiveis) {
    try {
      const [{ data: hist }, { data: cliente }] = await Promise.all([
        supabaseAdmin.from("mensagens").select("papel, conteudo, criado_em").eq("conversa_id", conv.id).order("criado_em", { ascending: true }).limit(30),
        conv.cliente_id
          ? supabaseAdmin.from("clientes").select("*").eq("id", conv.cliente_id).maybeSingle()
          : Promise.resolve({ data: null as any }),
      ]);

      const fupsHoje = conv.fups_enviados_hoje ?? 0;
      const diaAtual = conv.dia_followup_atual ?? 0;
      const numeroTentativa = (fupsHoje + 1) as 1 | 2 | 3;

      // Identifica produtos em foco (links/nomes na conversa)
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

      const messages = [
        { role: "system", content: systemPrompt },
        ...(hist ?? []).map((m: any) => ({ role: m.papel, content: m.conteudo })),
        { role: "user", content: "(sem resposta)" }, // placeholder para a IA gerar a próxima fala
      ];

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: cfg.modelo_ia ?? "google/gemini-2.5-flash", messages }),
      });
      if (!aiResp.ok) {
        resultados.push({ conv: conv.id, erro: `AI ${aiResp.status}` });
        continue;
      }
      const ai = await aiResp.json();
      let reply: string = (ai.choices?.[0]?.message?.content ?? "").trim();
      if (!reply) { resultados.push({ conv: conv.id, erro: "AI vazio" }); continue; }
      reply = reply.replace(/\[ESCALAR\]/gi, "").trim();

      const numero = String(conv.sessao_token).replace(/^wa:/, "").replace(/@.*/, "").replace(/\D/g, "");
      const sendResp = await fetch(STEVO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: process.env.STEVO_API_KEY ?? "" },
        body: JSON.stringify({ number: numero, text: reply }),
      });
      if (!sendResp.ok) { resultados.push({ conv: conv.id, erro: `Stevo ${sendResp.status}` }); continue; }

      await supabaseAdmin.from("mensagens").insert({ conversa_id: conv.id, papel: "assistant", conteudo: reply });

      const novosFupsHoje = fupsHoje + 1;
      const { proximo, novoDia, resetar } = calcularProximoFollowup(cfgAg, novosFupsHoje, diaAtual);

      if (resetar) {
        // Atingiu o limite de dias: marca como inativo
        if (conv.cliente_id) {
          await supabaseAdmin.from("clientes").update({ temperatura_lead: "inativo" }).eq("id", conv.cliente_id);
        }
        await supabaseAdmin.from("conversas").update({
          fups_enviados_hoje: novosFupsHoje,
          dia_followup_atual: novoDia,
          proximo_followup_em: null,
        }).eq("id", conv.id);
      } else {
        await supabaseAdmin.from("conversas").update({
          fups_enviados_hoje: novoDia !== diaAtual ? 0 : novosFupsHoje,
          dia_followup_atual: novoDia,
          proximo_followup_em: proximo?.toISOString() ?? null,
          data_inicio_followup: conv.data_inicio_followup ?? new Date().toISOString().slice(0, 10),
        }).eq("id", conv.id);
      }

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
      POST: async () => {
        try {
          const result = await processFollowUps();
          console.log("[follow-up-cron]", JSON.stringify(result).slice(0, 1000));
          return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
        } catch (e) {
          console.error("[follow-up-cron] error", e);
          return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
      },
      GET: async () => {
        try {
          const result = await processFollowUps();
          return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
        } catch (e) {
          return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
      },
    },
  },
});

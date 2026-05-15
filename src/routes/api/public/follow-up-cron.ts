import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildSystemPrompt } from "../../../../supabase/functions/_shared/prompt";

const STEVO_URL = "https://sm-urso.stevo.chat/send/text";

async function processFollowUps() {
  const { data: cfg } = await supabaseAdmin.from("configuracoes").select("*").limit(1).maybeSingle();
  if (!cfg || !cfg.follow_up_ativo) {
    return { ok: true, skipped: "follow-up desativado" };
  }

  // Janela de horário
  if (cfg.follow_up_respeitar_horario) {
    const now = new Date();
    // Horário de São Paulo (UTC-3) — usa offset fixo
    const spOffset = -3 * 60;
    const local = new Date(now.getTime() + (spOffset - now.getTimezoneOffset()) * 60000);
    const hh = local.getHours() * 60 + local.getMinutes();
    const [hi, mi] = String(cfg.horario_atendimento_inicio ?? "09:00").split(":").map(Number);
    const [hf, mf] = String(cfg.horario_atendimento_fim ?? "18:00").split(":").map(Number);
    if (hh < hi * 60 + mi || hh > hf * 60 + mf) {
      return { ok: true, skipped: "fora do horário" };
    }
  }

  const horas = Number(cfg.follow_up_horas ?? 24);
  const intervaloHoras = Number(cfg.follow_up_intervalo_horas ?? 24);
  const maxTentativas = Number(cfg.follow_up_max_tentativas ?? 1);

  const limite = new Date(Date.now() - horas * 3600_000).toISOString();
  const limiteRetry = new Date(Date.now() - intervaloHoras * 3600_000).toISOString();

  // Conversas elegíveis: WhatsApp, última msg do assistente, parada há ≥ horas, dentro do limite de tentativas
  const { data: conversas, error } = await supabaseAdmin
    .from("conversas")
    .select("id, sessao_token, cliente_id, ultima_mensagem_em, follow_up_enviado_em, follow_up_count")
    .eq("canal", "whatsapp")
    .eq("ultima_mensagem_papel", "assistant")
    .lt("ultima_mensagem_em", limite)
    .lt("follow_up_count", maxTentativas)
    .limit(50);

  if (error) throw error;

  const elegiveis = (conversas ?? []).filter(
    (c) => !c.follow_up_enviado_em || c.follow_up_enviado_em < limiteRetry,
  );

  if (elegiveis.length === 0) {
    return { ok: true, processadas: 0 };
  }

  const [{ data: produtosTodos }, { data: cupons }, { data: faqs }] = await Promise.all([
    supabaseAdmin
      .from("produtos")
      .select("nome,categoria,genero,preco,descricao,quantidade_estoque,status,url_produto")
      .eq("status", "disponivel")
      .limit(60),
    supabaseAdmin.from("cupons").select("codigo,tipo_desconto,valor_desconto,validade").eq("ativo", true),
    supabaseAdmin.from("faqs").select("pergunta,resposta,categoria,ordem").eq("ativo", true).order("ordem"),
  ]);

  const resultados: any[] = [];

  for (const conv of elegiveis) {
    try {
      const { data: hist } = await supabaseAdmin
        .from("mensagens")
        .select("papel, conteudo, criado_em")
        .eq("conversa_id", conv.id)
        .order("criado_em", { ascending: true })
        .limit(30);

      const ultimaUser = [...(hist ?? [])].reverse().find((m) => m.papel === "user");
      const tentativaN = (conv.follow_up_count ?? 0) + 1;

      const systemPrompt = buildSystemPrompt({
        cfg,
        produtos: produtosTodos ?? [],
        cupons: cupons ?? [],
        faqs: faqs ?? [],
        canal: "whatsapp",
      });

      const instrucao = `# TAREFA DE FOLLOW-UP
Esta é a tentativa ${tentativaN} de retomar uma conversa parada há aproximadamente ${horas} horas no WhatsApp.
A cliente não respondeu sua última mensagem. Escreva UMA mensagem curta (máx. 3 frases), no tom da loja, que:
1. Retome o assunto exato da conversa (produto, dúvida, pedido — olhe o histórico).
2. Cite com carinho o que ela estava vendo, se aplicável.
3. Pergunte se ela ainda tem interesse / se quer continuar / oferece ajuda concreta.
4. Se houver link de produto pertinente já mencionado, inclua novamente em uma linha separada.

NÃO repita literalmente a frase: "${cfg.follow_up_mensagem}". Use-a só como referência de tom.
NÃO se desculpe excessivamente. NÃO invente produtos.
${ultimaUser ? `Última pergunta dela: "${ultimaUser.conteudo}"` : ""}`;

      const messages = [
        { role: "system", content: systemPrompt },
        ...(hist ?? []).map((m) => ({ role: m.papel, content: m.conteudo })),
        { role: "system", content: instrucao },
      ];

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: cfg.modelo_ia ?? "google/gemini-2.5-flash", messages }),
      });
      if (!aiResp.ok) {
        const txt = await aiResp.text();
        resultados.push({ conv: conv.id, erro: `AI ${aiResp.status}: ${txt.slice(0, 200)}` });
        continue;
      }
      const ai = await aiResp.json();
      const reply: string = (ai.choices?.[0]?.message?.content ?? "").trim();
      if (!reply) {
        resultados.push({ conv: conv.id, erro: "AI vazio" });
        continue;
      }

      const numero = String(conv.sessao_token).replace(/^wa:/, "").replace(/@.*/, "").replace(/\D/g, "");
      const sendResp = await fetch(STEVO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: process.env.STEVO_API_KEY ?? "" },
        body: JSON.stringify({ number: numero, text: reply }),
      });

      if (!sendResp.ok) {
        const t = await sendResp.text();
        resultados.push({ conv: conv.id, erro: `Stevo ${sendResp.status}: ${t.slice(0, 200)}` });
        continue;
      }

      // Grava mensagem (trigger atualizará ultima_mensagem_*)
      await supabaseAdmin.from("mensagens").insert({
        conversa_id: conv.id,
        papel: "assistant",
        conteudo: reply,
      });

      // Marca follow-up enviado (após o trigger, refletimos o disparo)
      await supabaseAdmin
        .from("conversas")
        .update({
          follow_up_enviado_em: new Date().toISOString(),
          follow_up_count: tentativaN,
        })
        .eq("id", conv.id);

      resultados.push({ conv: conv.id, ok: true, tentativa: tentativaN });
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
          return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          console.error("[follow-up-cron] error", e);
          return new Response(JSON.stringify({ error: (e as Error).message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
      GET: async () => {
        try {
          const result = await processFollowUps();
          return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: (e as Error).message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});

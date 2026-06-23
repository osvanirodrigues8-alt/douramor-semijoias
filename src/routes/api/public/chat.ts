import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildSystemPrompt, normalizarMensagensIA, mascararPII, callAnthropicMessages } from "@/lib/shared/prompt";
import { extrairCep, detectaIntencaoFrete, carregarConexaoNS, calcularFreteNuvemshop, type OpcaoFrete } from "@/lib/shared/frete";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function handleChat(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const { sessao_token, canal = "site", message, contato } = await request.json();
    if (!sessao_token || !message) {
      return new Response(JSON.stringify({ error: "sessao_token e message são obrigatórios" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const [{ data: cfg }, { data: cfgAg }] = await Promise.all([
      supabaseAdmin.from("configuracoes").select("*").order("atualizado_em", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("configuracoes_agente").select("*").order("atualizado_em", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (!cfg) throw new Error("Configurações não encontradas");

    const [{ data: produtos }, { data: cupons }, { data: faqs }] = await Promise.all([
      supabaseAdmin.from("produtos").select("id,nome,categoria,genero,preco,descricao,quantidade_estoque,status,url_produto,url_foto,nuvemshop_variant_id,nuvemshop_product_id").eq("status", "disponivel").not("categoria", "in", "(outro)").limit(40),
      supabaseAdmin.from("cupons").select("codigo,tipo_desconto,valor_desconto,validade").eq("ativo", true),
      supabaseAdmin.from("faqs").select("pergunta,resposta,categoria,ordem").eq("ativo", true).order("ordem", { ascending: true }),
    ]);

    let cliente_id: string | null = null;
    let cliente: any = null;
    if (contato) {
      const { data: existing } = await supabaseAdmin.from("clientes").select("*").eq("contato", contato).maybeSingle();
      if (existing) { cliente = existing; cliente_id = existing.id; }
      else {
        const { data: novo } = await supabaseAdmin.from("clientes").insert({ contato, canal_origem: canal }).select("*").single();
        cliente = novo; cliente_id = novo?.id ?? null;
      }
    }

    let { data: conversa } = await supabaseAdmin.from("conversas").select("*").eq("sessao_token", sessao_token).maybeSingle();
    if (!conversa) {
      const { data: nova } = await supabaseAdmin.from("conversas").insert({ sessao_token, canal, cliente_id }).select("*").single();
      conversa = nova!;
    } else if (cliente_id && !conversa.cliente_id) {
      await supabaseAdmin.from("conversas").update({ cliente_id }).eq("id", conversa.id);
    }

    // Conversa pausada por humano
    if (conversa.precisa_humano) {
      return new Response(JSON.stringify({ reply: "Um momento! Nossa equipe já está ciente e vai te responder em breve 💛", pausada: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // REGRA DE NEGÓCIO: a Juliana NUNCA passa para humano automaticamente.
    // Mesmo que o cliente peça atendente, ela responde sozinha (o prompt instrui
    // a contornar). Pausa só via ação manual no painel.

    await supabaseAdmin.from("mensagens").insert({ conversa_id: conversa.id, papel: "user", conteudo: message });
    const { data: hist } = await supabaseAdmin.from("mensagens").select("papel, conteudo").eq("conversa_id", conversa.id).order("criado_em", { ascending: true }).limit(40);

    // Cálculo de frete
    let cotacaoFrete: { cep: string; opcoes: OpcaoFrete[] } | null = null;
    let freteFalhou = false;
    let pediuFretemasSemCep = false;
    const freteModo = cfgAg?.frete_modo ?? "nuvemshop";
    const cepNaMsg = extrairCep(message);
    const cepSalvo = (cliente?.cep as string | undefined) ?? ((conversa.contexto as any)?.cep as string | undefined) ?? null;
    const cepUsar = cepNaMsg ?? cepSalvo;
    const querFrete = detectaIntencaoFrete(message) || !!cepNaMsg;

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
          let candidatos = (produtos ?? []).filter((p: any) => (p.nuvemshop_variant_id || p.nuvemshop_product_id) && Number(p.preco) < 200).slice(0, 1);
          if (!candidatos.length) {
            const { data: prodBarato } = await supabaseAdmin.from("produtos").select("nuvemshop_variant_id,nuvemshop_product_id,url_produto,preco").not("nuvemshop_variant_id", "is", null).eq("status", "disponivel").lt("preco", 200).order("preco", { ascending: true }).limit(1).maybeSingle();
            if (prodBarato) candidatos = [prodBarato];
          }
          if (!candidatos.length) {
            const { data: qualquerProd } = await supabaseAdmin.from("produtos").select("nuvemshop_variant_id,nuvemshop_product_id,url_produto").not("nuvemshop_variant_id", "is", null).eq("status", "disponivel").limit(1).maybeSingle();
            if (qualquerProd) candidatos = [qualquerProd];
          }
          if (!candidatos.length) {
            cotacaoFrete = { cep: cepUsar, opcoes: opcaoFallback };
            freteFalhou = true;
          } else {
            const r = await calcularFreteNuvemshop({ conn, cep: cepUsar, itens: candidatos.map((p: any) => ({ variant_id: p.nuvemshop_variant_id, product_id: p.nuvemshop_product_id, product_url: p.url_produto, quantity: 1 })) });
            if (r.ok) {
              cotacaoFrete = { cep: cepUsar, opcoes: r.opcoes };
              if (cepNaMsg && conversa.id) {
                await supabaseAdmin.from("conversas").update({ contexto: { ...(typeof conversa.contexto === "object" && conversa.contexto !== null ? conversa.contexto : {}), cep: cepUsar } }).eq("id", conversa.id);
              }
            } else {
              cotacaoFrete = { cep: cepUsar, opcoes: opcaoFallback };
              freteFalhou = true;
            }
          }
        }
      }
    }

    const systemPrompt = buildSystemPrompt({
      cfg, cfgAg,
      produtos: (produtos ?? []).filter((p: any) => p.url_produto || p.url_foto),
      cupons: cupons ?? [], faqs: faqs ?? [],
      canal: canal === "whatsapp" ? "whatsapp" : "site",
      cliente,
      cotacaoFrete, freteFalhou, pediuFretemasSemCep,
    });

    const userMessages = normalizarMensagensIA(
      (hist ?? []).map((m: any) => ({ role: m.papel as "user" | "assistant", content: mascararPII(m.conteudo) })),
    );

    const aiResp = await callAnthropicMessages({
      apiKey: process.env.ANTHROPIC_API_KEY ?? "",
      model: cfg.modelo_ia,
      system: systemPrompt,
      messages: userMessages,
      maxTokens: 1024,
      temperature: 0.4,
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("AI error:", aiResp.status, txt);
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Limite de requisições atingido, tente novamente em instantes." }), { status: 429, headers: { ...cors, "Content-Type": "application/json" } });
      throw new Error(`AI erro ${aiResp.status}`);
    }
    const ai = await aiResp.json();
    let reply: string = (ai.content?.[0]?.text ?? "Desculpe, não consegui responder agora.").trim();

    // [ESCALAR]: apenas remove a tag — Juliana resolve tudo, nunca transfere para humano
    reply = reply.replace(/\[ESCALAR_ATACADO\]/gi, "").replace(/\[ESCALAR\]/gi, "").trim();
    if (!reply) reply = "Oi! Tudo bem? Como posso te ajudar hoje? 💛";

    await supabaseAdmin.from("mensagens").insert({ conversa_id: conversa.id, papel: "assistant", conteudo: reply });

    return new Response(JSON.stringify({ reply, conversa_id: conversa.id, escalado: false }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[chat]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
}

export const Route = createFileRoute("/api/public/chat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => handleChat(request),
      OPTIONS: async () => new Response(null, { headers: cors }),
    },
  },
});

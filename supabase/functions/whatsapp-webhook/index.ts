// Webhook que recebe mensagens da Stevo (Evolution API) e responde via IA + envia de volta no WhatsApp.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildSystemPrompt,
  expandirComSinonimos,
  detectarFaixaPreco,
  detectarPedidoHumano,
  detectarIntencaoCompra,
} from "../_shared/prompt.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const STEVO_URL = "https://sm-urso.stevo.chat/send/text";
const MSG_HUMANO = "Vou chamar nossa equipe para te ajudar pessoalmente! Um momento 🙏";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const payload = await req.json().catch(() => ({}));
    console.log("[stevo-webhook] payload:", JSON.stringify(payload).slice(0, 2000));

    const data = payload?.data ?? payload;
    const key = data?.key ?? {};
    const info = data?.Info ?? data?.info ?? {};
    const message = data?.message ?? data?.Message ?? {};
    const fromMe = key?.fromMe === true || info?.IsFromMe === true;
    const remoteJid: string | undefined = key?.remoteJid ?? data?.remoteJid ?? info?.Chat ?? info?.Sender;
    const pushName: string | undefined = data?.pushName ?? data?.notifyName ?? info?.PushName;

    const text: string | undefined =
      message?.conversation ??
      message?.extendedTextMessage?.text ??
      message?.text ??
      data?.text ??
      payload?.message;

    if (fromMe || !remoteJid || !text) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (remoteJid.includes("@g.us") || info?.IsGroup === true) {
      return new Response(JSON.stringify({ ok: true, ignored: "group" }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    const numero = remoteJid.replace(/@.*/, "").replace(/\D/g, "");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: cfg } = await supabase.from("configuracoes").select("*").limit(1).maybeSingle();
    if (!cfg) throw new Error("Configurações não encontradas");

    // Cliente
    let cliente: any = null;
    const { data: existing } = await supabase.from("clientes").select("*").eq("contato", numero).maybeSingle();
    if (existing) {
      cliente = existing;
      if (!cliente.nome && pushName) {
        await supabase.from("clientes").update({ nome: pushName }).eq("id", cliente.id);
        cliente.nome = pushName;
      }
    } else {
      const { data: novo } = await supabase.from("clientes").insert({ contato: numero, canal_origem: "whatsapp", nome: pushName ?? null }).select("*").single();
      cliente = novo;
    }

    // Conversa
    const sessao_token = `wa:${remoteJid}`;
    let { data: conversa } = await supabase.from("conversas").select("*").eq("sessao_token", sessao_token).maybeSingle();
    if (!conversa) {
      const { data: nova } = await supabase.from("conversas").insert({ sessao_token, canal: "whatsapp", cliente_id: cliente?.id }).select("*").single();
      conversa = nova!;
    }

    await supabase.from("mensagens").insert({ conversa_id: conversa.id, papel: "user", conteudo: text });

    // ====== DETECÇÃO DE GATILHOS ANTES DA IA ======
    const pedidoHumano = detectarPedidoHumano(text);
    const intencaoCompra = detectarIntencaoCompra(text);

    if (pedidoHumano.sim) {
      await supabase.from("conversas").update({
        precisa_humano: true,
        motivo_humano: pedidoHumano.motivo,
        humano_em: new Date().toISOString(),
      }).eq("id", conversa.id);
      await supabase.from("mensagens").insert({ conversa_id: conversa.id, papel: "assistant", conteudo: MSG_HUMANO });
      await fetch(STEVO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: Deno.env.get("STEVO_API_KEY") ?? "" },
        body: JSON.stringify({ number: numero, text: MSG_HUMANO }),
      });
      return new Response(JSON.stringify({ ok: true, humano: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (intencaoCompra) {
      await supabase.from("conversas").update({ intencao_compra_em: new Date().toISOString() }).eq("id", conversa.id);
    }

    // ====== BUSCA INTELIGENTE DE PRODUTOS ======
    const stop = new Set(["para","sobre","tem","tens","temos","voce","você","vocês","quero","queria","gostaria","linha","produto","produtos","com","sem","uma","umas","uns","dos","das","tudo","bem","oque","que","qual","quais","como","onde","quando","quanto","alguma","algum","mais","menos","aqui","obrigado","obrigada","oi","ola","olá","reais","preco","preço"]);
    const lowText = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const generoFiltro: "masculino" | "feminino" | "unissex" | null =
      /\b(masculin|homem|homens|menino|namorado|marido|esposo|pai|filho)\b/.test(lowText) ? "masculino" :
      /\b(feminin|mulher|mulheres|menina|namorada|esposa|mae|mãe|filha)\b/.test(lowText) ? "feminino" : null;

    const baseKeywords = (lowText.match(/[a-z0-9]{4,}/g) ?? []).filter((w) => !stop.has(w)).slice(0, 8);
    const keywords = expandirComSinonimos(baseKeywords);
    const { max: precoMax, baratoPrimeiro } = detectarFaixaPreco(text);

    // Calcular ranking de vendas (top vendidos)
    const { data: pedidosRecentes } = await supabase
      .from("pedidos")
      .select("produtos_ids")
      .order("criado_em", { ascending: false })
      .limit(200);
    const contagemVendas = new Map<string, number>();
    for (const p of pedidosRecentes ?? []) {
      for (const id of (p.produtos_ids ?? []) as string[]) {
        contagemVendas.set(id, (contagemVendas.get(id) ?? 0) + 1);
      }
    }

    // Produtos já mostrados nesta conversa (para excluir)
    const jaMostrados: string[] = Array.isArray(conversa.produtos_mostrados) ? conversa.produtos_mostrados : [];

    let produtos: any[] = [];
    if (keywords.length) {
      const orFilter = keywords.flatMap((k) => [`nome.ilike.%${k}%`, `descricao.ilike.%${k}%`]).join(",");
      let qy = supabase
        .from("produtos")
        .select("id,nome,categoria,genero,preco,descricao,quantidade_estoque,status,url_produto,url_foto")
        .eq("status", "disponivel")
        .or(orFilter)
        .limit(60);
      if (generoFiltro) qy = qy.in("genero", [generoFiltro, "unissex"]);
      if (precoMax) qy = qy.lte("preco", precoMax);
      const { data: matched } = await qy;
      produtos = matched ?? [];
    }
    if (produtos.length < 30) {
      let qy = supabase
        .from("produtos")
        .select("id,nome,categoria,genero,preco,descricao,quantidade_estoque,status,url_produto,url_foto")
        .eq("status", "disponivel")
        .order("atualizado_em", { ascending: false })
        .limit(40);
      if (generoFiltro) qy = qy.in("genero", [generoFiltro, "unissex"]);
      if (precoMax) qy = qy.lte("preco", precoMax);
      const { data: extra } = await qy;
      const seen = new Set(produtos.map((p) => p.id));
      for (const p of extra ?? []) if (!seen.has(p.id)) produtos.push(p);
    }

    // Ordenar: mais vendidos primeiro; depois (se cliente pediu barato) menor preço; senão alfabético
    produtos.sort((a, b) => {
      const va = contagemVendas.get(a.id) ?? 0;
      const vb = contagemVendas.get(b.id) ?? 0;
      if (vb !== va) return vb - va;
      if (baratoPrimeiro) return Number(a.preco) - Number(b.preco);
      return Number(a.preco) - Number(b.preco);
    });

    // Marcar visualmente quais já foram mostrados (mantém no contexto da IA via "jaMostrados" no prompt)
    const produtosParaPrompt = produtos.slice(0, 40);

    const { data: cupons } = await supabase.from("cupons").select("codigo,tipo_desconto,valor_desconto,validade").eq("ativo", true);
    const { data: faqs } = await supabase.from("faqs").select("pergunta,resposta,categoria,ordem").eq("ativo", true).order("ordem", { ascending: true });
    const { data: hist } = await supabase.from("mensagens").select("papel, conteudo").eq("conversa_id", conversa.id).order("criado_em", { ascending: true }).limit(40);

    const systemPrompt = buildSystemPrompt({
      cfg,
      produtos: produtosParaPrompt,
      cupons: cupons ?? [],
      faqs: faqs ?? [],
      canal: "whatsapp",
      cliente,
      produtosJaMostrados: jaMostrados,
    });

    const extraNota = intencaoCompra
      ? "\n\n# CONTEXTO ADICIONAL\nA cliente JÁ DEMONSTROU INTENÇÃO DE COMPRA. Foque em enviar link do produto + instruções: \"Acesse o link, adicione ao carrinho e finalize com cartão, PIX ou boleto. Entregamos para todo o Brasil com frete grátis! 🚚\""
      : "";

    const messages = [
      { role: "system", content: systemPrompt + extraNota },
      ...(hist ?? []).map((m: any) => ({ role: m.papel, content: m.conteudo })),
    ];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.modelo_ia ?? "google/gemini-2.5-flash", messages }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("AI error", aiResp.status, txt);
      throw new Error(`AI ${aiResp.status}: ${txt.slice(0, 300)}`);
    }
    const ai = await aiResp.json();
    const choice = ai.choices?.[0];
    let reply: string = (choice?.message?.content ?? "").trim();
    if (!reply) {
      reply = MSG_HUMANO;
    }

    // ====== ATUALIZAR PRODUTOS_MOSTRADOS E TENTATIVAS_SEM_RESULTADO ======
    const novosMostrados = new Set(jaMostrados);
    const replyLower = reply.toLowerCase();
    for (const p of produtos) {
      if (p.nome && replyLower.includes(String(p.nome).toLowerCase())) novosMostrados.add(p.nome);
      if (p.url_produto && reply.includes(p.url_produto)) novosMostrados.add(p.nome);
    }
    const adicionouAlgum = novosMostrados.size > jaMostrados.length;
    const novaTentativaSemResultado = adicionouAlgum ? 0 : (conversa.tentativas_sem_resultado ?? 0) + 1;

    // Se 2 tentativas seguidas sem encontrar produto, força fallback humano
    let replyFinal = reply;
    let marcarHumano = false;
    if (!adicionouAlgum && novaTentativaSemResultado >= 2 && /^[\s\S]{0,400}$/.test(reply)) {
      replyFinal = MSG_HUMANO;
      marcarHumano = true;
    }
    // Se a IA já entregou a mensagem de transferência, marca humano também
    if (reply.includes("equipe para te ajudar pessoalmente")) marcarHumano = true;

    await supabase.from("conversas").update({
      produtos_mostrados: Array.from(novosMostrados),
      tentativas_sem_resultado: novaTentativaSemResultado,
      ...(marcarHumano ? {
        precisa_humano: true,
        motivo_humano: marcarHumano ? (pedidoHumano.motivo ?? "Dora sem opção adequada") : null,
        humano_em: new Date().toISOString(),
      } : {}),
    }).eq("id", conversa.id);

    await supabase.from("mensagens").insert({ conversa_id: conversa.id, papel: "assistant", conteudo: replyFinal });

    const sendResp = await fetch(STEVO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: Deno.env.get("STEVO_API_KEY") ?? "" },
      body: JSON.stringify({ number: numero, text: replyFinal }),
    });
    const sendTxt = await sendResp.text();
    console.log("[stevo-send]", sendResp.status, sendTxt.slice(0, 500));

    return new Response(JSON.stringify({ ok: true, sent: sendResp.ok, humano: marcarHumano }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[stevo-webhook] error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});

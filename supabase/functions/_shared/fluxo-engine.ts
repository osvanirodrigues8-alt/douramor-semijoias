// Engine de execução de fluxos visuais (React Flow).
// Lê o fluxo ativo, encontra o nó atual em conversas.contexto.fluxo,
// executa nós sequencialmente até precisar enviar mensagem / aguardar resposta / encerrar.
//
// Retorna { handled, reply?, escalar?, motivoEscalar? } — se handled=false,
// o webhook segue com o comportamento padrão da Juliana (LLM livre).

// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type Node = { id: string; type?: string; data: { tipo: string; label?: string; config?: Record<string, any> } };
type Edge = { id?: string; source: string; target: string; sourceHandle?: string | null };
type FluxoData = { nodes: Node[]; edges: Edge[] };

type Ctx = {
  supabase: SupabaseClient;
  conversa: any;
  cliente: any;
  cfg: any;
  cfgAg: any;
  mensagemUsuario: string;
  canal: "whatsapp" | "site" | "instagram";
  hist: { papel: string; conteudo: string }[];
  variaveis: Record<string, any>;
  lovableKey: string;
};

export type FluxoResult = {
  handled: boolean;
  reply?: string;
  escalar?: boolean;
  motivoEscalar?: string | null;
  encerrar?: boolean;
};

function nextNodeFrom(edges: Edge[], fromId: string, handle = "out"): string | null {
  const e = edges.find((x) => x.source === fromId && (x.sourceHandle ?? "out") === handle);
  return e?.target ?? null;
}

function renderTemplate(tpl: string, ctx: Ctx): string {
  if (!tpl) return "";
  return tpl
    .replace(/\{\{\s*cliente\.([a-z_]+)\s*\}\}/gi, (_, k) => String(ctx.cliente?.[k] ?? ""))
    .replace(/\{\{\s*ultima_mensagem\s*\}\}/gi, ctx.mensagemUsuario ?? "")
    .replace(/\{\{\s*var\.([a-z0-9_]+)\s*\}\}/gi, (_, k) => String(ctx.variaveis[k] ?? ""))
    .replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, k) => String(ctx.variaveis[k] ?? ctx.cliente?.[k] ?? ""));
}

function compararCondicao(operador: string, valorVar: any, valorRef: string): boolean {
  const a = String(valorVar ?? "").toLowerCase().trim();
  const b = String(valorRef ?? "").toLowerCase().trim();
  switch (operador) {
    case "igual": return a === b;
    case "contem": return a.includes(b);
    case "maior": return Number(valorVar) > Number(valorRef);
    case "menor": return Number(valorVar) < Number(valorRef);
    case "vazio": return a === "" || a === "null" || a === "undefined";
    case "regex": try { return new RegExp(valorRef, "i").test(String(valorVar ?? "")); } catch { return false; }
    default: return false;
  }
}

async function logExec(ctx: Ctx, fluxoId: string, no: Node, resultado: any) {
  try {
    await ctx.supabase.from("fluxos_nos_log").insert({
      fluxo_id: fluxoId,
      conversa_id: ctx.conversa.id,
      no_id: no.id,
      no_tipo: no.data?.tipo ?? "?",
      resultado: resultado ?? {},
    });
  } catch (e) {
    console.error("[fluxo-engine] log falhou", e);
  }
}

async function executarNo(
  ctx: Ctx,
  fluxoId: string,
  data: FluxoData,
  node: Node,
): Promise<{ proxId: string | null; reply?: string; escalar?: boolean; motivo?: string; aguardar?: { variavel?: string; timeoutHoras?: number } | null; encerrar?: boolean }> {
  const cfg = node.data?.config ?? {};
  const tipo = node.data?.tipo;
  switch (tipo) {
    case "gatilho_inicio":
    case "gatilho_palavra":
      return { proxId: nextNodeFrom(data.edges, node.id) };

    case "msg_texto": {
      const reply = renderTemplate(String(cfg.texto ?? ""), ctx);
      return { proxId: nextNodeFrom(data.edges, node.id), reply };
    }

    case "msg_ia": {
      // Sinaliza ao caller que deve gerar resposta via LLM (a engine para aqui e devolve handled=false?
      // Em vez disso, retornamos uma "instrucao" especial — o webhook usa para enriquecer o prompt.
      ctx.variaveis.__ia_instrucao__ = String(cfg.instrucao ?? "");
      return { proxId: nextNodeFrom(data.edges, node.id), reply: "__USE_LLM__" };
    }

    case "msg_produto": {
      const cat = String(cfg.categoria ?? "").trim();
      const gen = String(cfg.genero ?? "todos");
      const precoMax = Number(cfg.preco_max ?? 0);
      const qtd = Math.max(1, Math.min(10, Number(cfg.quantidade ?? 3)));
      let q = ctx.supabase.from("produtos").select("id,nome,preco,url_produto").eq("status", "disponivel").limit(qtd);
      if (cat) q = q.ilike("categoria", `%${cat}%`);
      if (gen !== "todos") q = q.in("genero", [gen, "unissex"]);
      if (precoMax > 0) q = q.lte("preco", precoMax);
      const { data: prods } = await q;
      const linhas = (prods ?? []).map((p: any) =>
        `• ${p.nome} — R$ ${Number(p.preco).toFixed(2).replace(".", ",")}${p.url_produto ? `\n  ${p.url_produto}` : ""}`
      );
      const reply = linhas.length ? `Olha o que separei pra você:\n\n${linhas.join("\n\n")}` : "Deixa eu olhar com mais calma e te trago opções já já 💛";
      return { proxId: nextNodeFrom(data.edges, node.id), reply };
    }

    case "capturar_resposta": {
      // Salva a mensagem que dispara na próxima vez? Não — pausa aqui esperando o user responder.
      const variavel = String(cfg.variavel ?? "resposta");
      const timeoutHoras = Number(cfg.timeout_horas ?? 24);
      return { proxId: null, aguardar: { variavel, timeoutHoras } };
    }

    case "capturar_dados": {
      const reply = renderTemplate(String(cfg.pergunta ?? "Como posso te chamar?"), ctx);
      const campo = String(cfg.campo ?? "nome");
      return { proxId: null, reply, aguardar: { variavel: `__cliente_${campo}__` } };
    }

    case "condicao": {
      const variavel = String(cfg.variavel ?? "");
      const operador = String(cfg.operador ?? "contem");
      const valorRef = String(cfg.valor ?? "");
      const path = variavel.split(".");
      let val: any = ctx.variaveis[path[0]] ?? ctx.cliente?.[path[0]];
      for (let i = 1; i < path.length && val != null; i++) val = val?.[path[i]];
      const ok = compararCondicao(operador, val, valorRef);
      return { proxId: nextNodeFrom(data.edges, node.id, ok ? "sim" : "nao") };
    }

    case "aguardar": {
      // Em engine síncrona do webhook, "aguardar tempo" agenda para depois.
      // Simplificação: registra no contexto e segue (não bloqueia o webhook).
      // TODO: agendar via cron/follow_ups.
      return { proxId: nextNodeFrom(data.edges, node.id) };
    }

    case "ia_classificar": {
      const cats = String(cfg.categorias ?? "compra,duvida,reclamacao,saudacao").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      const promptCls = `Classifique a mensagem do cliente em UMA das categorias: ${cats.join(", ")}, ou "outro" se nenhuma servir. Responda SÓ a palavra.\n\nMensagem: "${ctx.mensagemUsuario}"`;
      let cat = "outro";
      try {
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${ctx.lovableKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "openai/gpt-5-nano", messages: [{ role: "user", content: promptCls }] }),
        });
        const j = await r.json();
        const txt = String(j?.choices?.[0]?.message?.content ?? "").toLowerCase().trim();
        cat = cats.find((c) => txt.includes(c)) ?? "outro";
      } catch (e) { console.error("[ia_classificar]", e); }
      ctx.variaveis.__intencao__ = cat;
      return { proxId: nextNodeFrom(data.edges, node.id, cat) ?? nextNodeFrom(data.edges, node.id, "outro") };
    }

    case "atualizar_cliente": {
      const campo = String(cfg.campo ?? "");
      const valor = renderTemplate(String(cfg.valor ?? ""), ctx);
      if (campo) {
        await ctx.supabase.from("clientes").update({ [campo]: valor }).eq("id", ctx.cliente.id);
        ctx.cliente[campo] = valor;
      }
      return { proxId: nextNodeFrom(data.edges, node.id) };
    }

    case "oferecer_cupom": {
      const codigo = ctx.cfgAg?.cupom_negociacao_codigo ?? "JULIANA10";
      const pct = ctx.cfgAg?.cupom_negociacao_percentual ?? 10;
      const ativo = ctx.cfgAg?.cupom_negociacao_ativo !== false;
      const reuso = ctx.cfgAg?.cupom_permite_reuso === true;
      const jaUsou = ctx.cliente?.cupom_negociacao_usado === true;
      const podeOferecer = cfg.forcar === true || (ativo && (!jaUsou || reuso));
      if (!podeOferecer) return { proxId: nextNodeFrom(data.edges, node.id, "negado") };
      const reply = `Vou abrir uma exceção: usa o cupom *${codigo}* e leva ${pct}% off 💛 Te ajudo a fechar?`;
      await ctx.supabase.from("clientes").update({ cupom_negociacao_oferecido_em: new Date().toISOString() }).eq("id", ctx.cliente.id);
      return { proxId: nextNodeFrom(data.edges, node.id, "ofertado"), reply };
    }

    case "webhook": {
      const url = String(cfg.url ?? "");
      const metodo = String(cfg.metodo ?? "POST");
      let body: any = undefined;
      try { body = cfg.body ? JSON.parse(renderTemplate(String(cfg.body), ctx)) : undefined; } catch {}
      try {
        const r = await fetch(url, {
          method: metodo,
          headers: { "Content-Type": "application/json" },
          body: metodo === "GET" ? undefined : JSON.stringify(body ?? {}),
        });
        return { proxId: nextNodeFrom(data.edges, node.id, r.ok ? "sucesso" : "erro") };
      } catch {
        return { proxId: nextNodeFrom(data.edges, node.id, "erro") };
      }
    }

    case "escalar_humano": {
      const motivo = String(cfg.motivo ?? "fluxo escalou");
      const reply = renderTemplate(String(cfg.mensagem ?? "Deixa eu chamar minha colega que entende mais desse assunto, tá? Um segundo!"), ctx);
      return { proxId: null, reply, escalar: true, motivo };
    }

    case "encerrar": {
      const reply = cfg.mensagem_final ? renderTemplate(String(cfg.mensagem_final), ctx) : undefined;
      return { proxId: null, reply, encerrar: true };
    }

    default:
      console.warn("[fluxo-engine] tipo desconhecido", tipo);
      return { proxId: nextNodeFrom(data.edges, node.id) };
  }
}

function escolherNoInicial(data: FluxoData, ctx: Ctx): Node | null {
  const inicios = data.nodes.filter((n) => n.data?.tipo === "gatilho_inicio");
  const palavras = data.nodes.filter((n) => n.data?.tipo === "gatilho_palavra");
  const txt = ctx.mensagemUsuario.toLowerCase();
  for (const p of palavras) {
    const raw = String(p.data?.config?.palavras ?? "");
    const ks = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (ks.some((k) => txt.includes(k))) return p;
  }
  // gatilho_inicio: filtra por canal
  for (const i of inicios) {
    const canalCfg = String(i.data?.config?.canais ?? "todos");
    if (canalCfg === "todos" || canalCfg === ctx.canal) return i;
  }
  return inicios[0] ?? palavras[0] ?? null;
}

export async function executarFluxo(ctx: Ctx): Promise<FluxoResult> {
  // 1. Acha fluxo ativo para o canal
  const { data: fluxos } = await ctx.supabase
    .from("fluxos").select("id,canal,versao_atual")
    .eq("ativo", true)
    .in("canal", [ctx.canal, "todos"])
    .order("atualizado_em", { ascending: false }).limit(1);
  const fluxo = fluxos?.[0];
  if (!fluxo) return { handled: false };

  const { data: versao } = await ctx.supabase
    .from("fluxos_versoes").select("dados")
    .eq("fluxo_id", fluxo.id).eq("versao", fluxo.versao_atual).maybeSingle();
  const data = (versao?.dados as unknown as FluxoData) ?? null;
  if (!data || !data.nodes?.length) return { handled: false };

  // 2. Estado do fluxo na conversa
  const contexto = (ctx.conversa.contexto ?? {}) as any;
  const estado = contexto.fluxo ?? null;
  let atualId: string | null = estado?.no_atual ?? null;
  const aguardando = estado?.aguardando as { variavel?: string } | null | undefined;

  // Se estava aguardando resposta → salva a mensagem na variável e avança
  if (atualId && aguardando) {
    const varName = aguardando.variavel ?? "resposta";
    if (varName.startsWith("__cliente_")) {
      const campo = varName.replace("__cliente_", "").replace("__", "");
      await ctx.supabase.from("clientes").update({ [campo]: ctx.mensagemUsuario }).eq("id", ctx.cliente.id);
      ctx.cliente[campo] = ctx.mensagemUsuario;
    } else {
      ctx.variaveis[varName] = ctx.mensagemUsuario;
    }
    atualId = nextNodeFrom(data.edges, atualId);
  } else if (!atualId) {
    // Primeira execução nesta conversa → escolhe nó de gatilho
    const inicial = escolherNoInicial(data, ctx);
    if (!inicial) return { handled: false };
    atualId = inicial.id;
  }

  // 3. Roda nós até parar (mensagem / aguardar / encerrar / escalar)
  let reply: string | undefined;
  let escalar = false;
  let motivoEscalar: string | null = null;
  let encerrar = false;
  let novoAguardando: any = null;
  let safety = 50;

  while (atualId && safety-- > 0) {
    const node = data.nodes.find((n) => n.id === atualId);
    if (!node) break;
    const r = await executarNo(ctx, fluxo.id, data, node);
    await logExec(ctx, fluxo.id, node, { proxId: r.proxId, reply: !!r.reply });

    if (r.reply && r.reply !== "__USE_LLM__") {
      reply = reply ? `${reply}\n\n${r.reply}` : r.reply;
    }
    if (r.reply === "__USE_LLM__") {
      // Sinaliza ao webhook: prepara o estado e devolve handled=false para a Juliana responder com instrução extra.
      atualId = r.proxId;
      await persistirEstado(ctx, fluxo.id, atualId, null);
      return { handled: false };
    }
    if (r.escalar) { escalar = true; motivoEscalar = r.motivo ?? null; }
    if (r.encerrar) { encerrar = true; }
    if (r.aguardar) { novoAguardando = r.aguardar; }

    if (r.aguardar || r.escalar || r.encerrar) {
      atualId = r.proxId ?? atualId;
      break;
    }
    atualId = r.proxId;
    if (reply && !r.proxId) break; // entregou mensagem sem próximo
  }

  await persistirEstado(ctx, fluxo.id, encerrar ? null : atualId, novoAguardando);
  return { handled: !!reply || escalar || encerrar, reply, escalar, motivoEscalar, encerrar };
}

async function persistirEstado(ctx: Ctx, fluxoId: string, noAtual: string | null, aguardando: any) {
  const contexto = (ctx.conversa.contexto ?? {}) as any;
  contexto.fluxo = noAtual ? { fluxo_id: fluxoId, no_atual: noAtual, aguardando, variaveis: ctx.variaveis } : null;
  await ctx.supabase.from("conversas").update({ contexto }).eq("id", ctx.conversa.id);
}

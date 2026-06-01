// Engine de execução de fluxos visuais (React Flow) — suporta 45+ tipos de nós.
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

function getVar(ctx: Ctx, expr: string): any {
  if (!expr) return undefined;
  const path = expr.replace(/^var\./, "").replace(/^cliente\./, "cliente.").split(".");
  if (path[0] === "cliente") {
    let v: any = ctx.cliente;
    for (let i = 1; i < path.length && v != null; i++) v = v?.[path[i]];
    return v;
  }
  return ctx.variaveis[path[0]] ?? ctx.cliente?.[path[0]];
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
    case "diferente": return a !== b;
    case "contem": return a.includes(b);
    case "nao_contem": return !a.includes(b);
    case "maior": return Number(valorVar) > Number(valorRef);
    case "menor": return Number(valorVar) < Number(valorRef);
    case "vazio": return a === "" || a === "null" || a === "undefined";
    case "preenchido": return a !== "" && a !== "null" && a !== "undefined";
    case "regex": try { return new RegExp(valorRef, "i").test(String(valorVar ?? "")); } catch { return false; }
    default: return false;
  }
}

function hashStr(s: string): number {
  let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function validaCPF(cpf: string): boolean {
  const c = cpf.replace(/\D/g, "");
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(c[i]) * (10 - i);
  let d1 = (s * 10) % 11; if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(c[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(c[i]) * (11 - i);
  let d2 = (s * 10) % 11; if (d2 === 10) d2 = 0;
  return d2 === parseInt(c[10]);
}

async function logExec(ctx: Ctx, fluxoId: string, no: Node, resultado: any) {
  try {
    await ctx.supabase.from("fluxos_nos_log").insert({
      fluxo_id: fluxoId, conversa_id: ctx.conversa.id,
      no_id: no.id, no_tipo: no.data?.tipo ?? "?", resultado: resultado ?? {},
    });
  } catch (e) { console.error("[fluxo-engine] log falhou", e); }
}

async function executarNo(
  ctx: Ctx, fluxoId: string, data: FluxoData, node: Node,
): Promise<{ proxId: string | null; reply?: string; escalar?: boolean; motivo?: string; aguardar?: { variavel?: string; timeoutHoras?: number } | null; encerrar?: boolean; pausar?: boolean }> {
  const cfg = node.data?.config ?? {};
  const tipo = node.data?.tipo;
  switch (tipo) {
    // === GATILHOS ===
    case "gatilho_inicio":
    case "gatilho_palavra":
    case "gatilho_evento":
    case "gatilho_intencao":
      return { proxId: nextNodeFrom(data.edges, node.id) };

    // === MENSAGENS ===
    case "msg_texto":
      return { proxId: nextNodeFrom(data.edges, node.id), reply: renderTemplate(String(cfg.texto ?? ""), ctx) };

    case "msg_ia":
      ctx.variaveis.__ia_instrucao__ = String(cfg.instrucao ?? "");
      return { proxId: nextNodeFrom(data.edges, node.id), reply: "__USE_LLM__" };

    case "msg_imagem": {
      const url = renderTemplate(String(cfg.url ?? ""), ctx);
      const leg = renderTemplate(String(cfg.legenda ?? ""), ctx);
      return { proxId: nextNodeFrom(data.edges, node.id), reply: `${leg}${leg ? "\n" : ""}${url}`.trim() };
    }
    case "msg_audio":
    case "msg_documento": {
      const url = renderTemplate(String(cfg.url ?? ""), ctx);
      return { proxId: nextNodeFrom(data.edges, node.id), reply: url };
    }
    case "msg_localizacao": {
      const end = renderTemplate(String(cfg.endereco ?? ""), ctx);
      const lat = cfg.latitude, lng = cfg.longitude;
      const maps = lat && lng ? `\nhttps://maps.google.com/?q=${lat},${lng}` : "";
      return { proxId: nextNodeFrom(data.edges, node.id), reply: `📍 ${end}${maps}` };
    }
    case "msg_typing":
      return { proxId: nextNodeFrom(data.edges, node.id) };

    case "msg_botoes": {
      const txt = renderTemplate(String(cfg.texto ?? ""), ctx);
      const btns = [cfg.btn1, cfg.btn2, cfg.btn3].filter(Boolean);
      const reply = `${txt}\n\n${btns.map((b: string, i: number) => `${i + 1}. ${b}`).join("\n")}`;
      return { proxId: null, reply, aguardar: { variavel: "__botao__" } };
    }
    case "msg_lista": {
      const tit = renderTemplate(String(cfg.titulo ?? ""), ctx);
      const ops = String(cfg.opcoes ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
      const reply = `${tit}\n\n${ops.map((o, i) => `${i + 1}. ${o}`).join("\n")}`;
      return { proxId: null, reply, aguardar: { variavel: "__opcao__" } };
    }

    case "msg_produto": {
      const cat = String(cfg.categoria ?? "").trim();
      const gen = String(cfg.genero ?? "todos");
      const precoMax = Number(cfg.preco_max ?? 0);
      const qtd = Math.max(1, Math.min(10, Number(cfg.quantidade ?? 3)));
      const ordem = String(cfg.ordem ?? "destaque");
      let q = ctx.supabase.from("produtos").select("id,nome,preco,url_produto").eq("status", "disponivel").limit(qtd);
      if (cat) q = q.ilike("categoria", `%${cat}%`);
      if (gen !== "todos") q = q.in("genero", [gen, "unissex"]);
      if (precoMax > 0) q = q.lte("preco", precoMax);
      if (ordem === "preco_asc") q = q.order("preco", { ascending: true });
      else if (ordem === "preco_desc") q = q.order("preco", { ascending: false });
      else if (ordem === "novidade") q = q.order("criado_em", { ascending: false });
      const { data: prods } = await q;
      if (!prods?.length) return { proxId: nextNodeFrom(data.edges, node.id, "vazio") };
      const linhas = prods.map((p: any) => `• ${p.nome} — R$ ${Number(p.preco).toFixed(2).replace(".", ",")}${p.url_produto ? `\n  ${p.url_produto}` : ""}`);
      return { proxId: nextNodeFrom(data.edges, node.id, "out"), reply: `Olha o que separei pra você:\n\n${linhas.join("\n\n")}` };
    }

    // === CAPTURA ===
    case "capturar_resposta": {
      const variavel = String(cfg.variavel ?? "resposta");
      const timeoutHoras = Number(cfg.timeout_horas ?? 24);
      return { proxId: null, aguardar: { variavel, timeoutHoras } };
    }
    case "capturar_dados": {
      const reply = renderTemplate(String(cfg.pergunta ?? "Como posso te chamar?"), ctx);
      const campo = String(cfg.campo ?? "nome");
      return { proxId: null, reply, aguardar: { variavel: `__cliente_${campo}__` } };
    }
    case "capturar_cep": {
      const reply = renderTemplate(String(cfg.pergunta ?? "Me passa seu CEP?"), ctx);
      return { proxId: null, reply, aguardar: { variavel: "__cep__" } };
    }
    case "capturar_cpf": {
      const reply = renderTemplate(String(cfg.pergunta ?? "Me passa seu CPF?"), ctx);
      return { proxId: null, reply, aguardar: { variavel: "__cpf__" } };
    }
    case "capturar_midia": {
      const reply = renderTemplate(String(cfg.pergunta ?? "Pode me mandar?"), ctx);
      return { proxId: null, reply, aguardar: { variavel: "midia_url" } };
    }

    // === LÓGICA ===
    case "condicao": {
      const val = getVar(ctx, String(cfg.variavel ?? ""));
      const ok = compararCondicao(String(cfg.operador ?? "contem"), val, String(cfg.valor ?? ""));
      return { proxId: nextNodeFrom(data.edges, node.id, ok ? "sim" : "nao") };
    }
    case "condicao_multipla": {
      const modo = String(cfg.modo ?? "e");
      let regras: any[] = [];
      try { regras = typeof cfg.regras === "string" ? JSON.parse(cfg.regras) : (cfg.regras ?? []); } catch {}
      const resultados = regras.map((r: any) => compararCondicao(r.op, getVar(ctx, r.var), r.val));
      const ok = modo === "ou" ? resultados.some(Boolean) : resultados.every(Boolean);
      return { proxId: nextNodeFrom(data.edges, node.id, ok ? "sim" : "nao") };
    }
    case "switch": {
      const val = String(getVar(ctx, String(cfg.variavel ?? "")) ?? "").toLowerCase().trim();
      for (let i = 1; i <= 5; i++) {
        const caso = String(cfg[`caso${i}`] ?? "").toLowerCase().trim();
        if (caso && val === caso) return { proxId: nextNodeFrom(data.edges, node.id, `c${i}`) };
      }
      return { proxId: nextNodeFrom(data.edges, node.id, "default") };
    }
    case "aguardar":
      return { proxId: nextNodeFrom(data.edges, node.id) };

    case "random_ab": {
      const pa = Number(cfg.porcentagem_a ?? 50);
      const seed = hashStr(`${ctx.cliente?.id ?? ""}-${node.id}`) % 100;
      return { proxId: nextNodeFrom(data.edges, node.id, seed < pa ? "a" : "b") };
    }
    case "calculadora": {
      const expr = renderTemplate(String(cfg.expressao ?? "0"), ctx);
      let val = 0;
      try {
        if (/^[\d+\-*/().\s]+$/.test(expr)) val = Function(`"use strict";return (${expr})`)();
      } catch {}
      const dest = String(cfg.variavel_destino ?? "resultado");
      ctx.variaveis[dest] = val;
      return { proxId: nextNodeFrom(data.edges, node.id) };
    }
    case "verificar_horario": {
      const ini = String(ctx.cfg?.horario_atendimento_inicio ?? "09:00").slice(0, 5);
      const fim = String(ctx.cfg?.horario_atendimento_fim ?? "18:00").slice(0, 5);
      const now = new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });
      const ok = now >= ini && now <= fim;
      return { proxId: nextNodeFrom(data.edges, node.id, ok ? "sim" : "nao") };
    }
    case "verificar_dia": {
      const dias = String(cfg.dias ?? "1,2,3,4,5").split(",").map((s) => Number(s.trim()));
      const diaSP = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })).getDay();
      const ok = dias.includes(diaSP);
      return { proxId: nextNodeFrom(data.edges, node.id, ok ? "sim" : "nao") };
    }
    case "contador": {
      const v = String(cfg.variavel ?? "contador");
      const op = String(cfg.operacao ?? "incrementar");
      const cur = Number(ctx.variaveis[v] ?? 0);
      if (op === "incrementar") ctx.variaveis[v] = cur + 1;
      else if (op === "decrementar") ctx.variaveis[v] = cur - 1;
      else if (op === "set") ctx.variaveis[v] = Number(cfg.valor ?? 0);
      else if (op === "reset") ctx.variaveis[v] = 0;
      return { proxId: nextNodeFrom(data.edges, node.id) };
    }
    case "loop": {
      const max = Number(cfg.max_iteracoes ?? 5);
      const k = `__loop_${node.id}__`;
      const n = Number(ctx.variaveis[k] ?? 0) + 1;
      ctx.variaveis[k] = n;
      if (n > max) return { proxId: nextNodeFrom(data.edges, node.id, "fim") };
      const dest = String(cfg.no_destino ?? "");
      return { proxId: dest || nextNodeFrom(data.edges, node.id, "continuar") };
    }

    // === IA ===
    case "ia_classificar": {
      const cats = String(cfg.categorias ?? "compra,duvida,reclamacao,saudacao").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      let cat = "outro";
      try {
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST", headers: { Authorization: `Bearer ${ctx.lovableKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "google/gemini-2.5-flash-lite", messages: [{ role: "user", content: `Classifique em UMA categoria: ${cats.join(", ")}, ou "outro". Responda SÓ a palavra.\n\n"${ctx.mensagemUsuario}"` }] }),
        });
        const j = await r.json();
        const txt = String(j?.choices?.[0]?.message?.content ?? "").toLowerCase().trim();
        cat = cats.find((c) => txt.includes(c)) ?? "outro";
      } catch (e) { console.error("[ia_classificar]", e); }
      ctx.variaveis.__intencao__ = cat;
      return { proxId: nextNodeFrom(data.edges, node.id, cat) ?? nextNodeFrom(data.edges, node.id, "outro") };
    }
    case "ia_extrair": {
      const campos = String(cfg.campos ?? "produto,cor,tamanho").split(",").map((s) => s.trim()).filter(Boolean);
      try {
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST", headers: { Authorization: `Bearer ${ctx.lovableKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{ role: "user", content: `Extraia do texto os campos ${campos.join(", ")}. Responda JSON. Campos não encontrados = null.\n\n"${ctx.mensagemUsuario}"` }],
            response_format: { type: "json_object" },
          }),
        });
        const j = await r.json();
        const raw = String(j?.choices?.[0]?.message?.content ?? "{}");
        const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
        const obj = JSON.parse(stripped || "{}");
        let achou = false;
        for (const c of campos) if (obj[c] != null) { ctx.variaveis[c] = obj[c]; achou = true; }
        return { proxId: nextNodeFrom(data.edges, node.id, achou ? "out" : "vazio") };
      } catch { return { proxId: nextNodeFrom(data.edges, node.id, "vazio") }; }
    }
    case "ia_sentimento": {
      let sent = "neutro";
      try {
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST", headers: { Authorization: `Bearer ${ctx.lovableKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "google/gemini-2.5-flash-lite", messages: [{ role: "user", content: `Classifique o sentimento (positivo, neutro, negativo). Só a palavra.\n\n"${ctx.mensagemUsuario}"` }] }),
        });
        const j = await r.json();
        const t = String(j?.choices?.[0]?.message?.content ?? "").toLowerCase();
        sent = ["positivo", "negativo", "neutro"].find((s) => t.includes(s)) ?? "neutro";
      } catch {}
      ctx.variaveis.__sentimento__ = sent;
      return { proxId: nextNodeFrom(data.edges, node.id, sent) };
    }
    case "ia_resumir": {
      const v = String(cfg.variavel ?? "resumo");
      const hist = ctx.hist.map((m) => `${m.papel}: ${m.conteudo}`).join("\n");
      try {
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST", headers: { Authorization: `Bearer ${ctx.lovableKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: [{ role: "user", content: `Resuma a conversa em até 3 linhas:\n\n${hist}` }] }),
        });
        const j = await r.json();
        ctx.variaveis[v] = String(j?.choices?.[0]?.message?.content ?? "").trim();
      } catch {}
      return { proxId: nextNodeFrom(data.edges, node.id) };
    }
    case "ia_traduzir": {
      const txt = renderTemplate(String(cfg.texto ?? "{{ultima_mensagem}}"), ctx);
      const idi = String(cfg.idioma ?? "en");
      const v = String(cfg.variavel ?? "traducao");
      try {
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST", headers: { Authorization: `Bearer ${ctx.lovableKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "google/gemini-2.5-flash-lite", messages: [{ role: "user", content: `Traduza para ${idi}. Só o texto:\n\n${txt}` }] }),
        });
        const j = await r.json();
        ctx.variaveis[v] = String(j?.choices?.[0]?.message?.content ?? "").trim();
      } catch {}
      return { proxId: nextNodeFrom(data.edges, node.id) };
    }

    // === DADOS / CRM ===
    case "atualizar_cliente": {
      const campo = String(cfg.campo ?? "");
      const valor = renderTemplate(String(cfg.valor ?? ""), ctx);
      if (campo) {
        await ctx.supabase.from("clientes").update({ [campo]: valor }).eq("id", ctx.cliente.id);
        ctx.cliente[campo] = valor;
      }
      return { proxId: nextNodeFrom(data.edges, node.id) };
    }
    case "consultar_produto": {
      const termo = renderTemplate(String(cfg.termo ?? ""), ctx);
      const pref = String(cfg.variavel ?? "produto");
      const { data: p } = await ctx.supabase.from("produtos").select("id,nome,preco,url_produto,quantidade_estoque").or(`nome.ilike.%${termo}%,descricao.ilike.%${termo}%`).limit(1).maybeSingle();
      if (!p) return { proxId: nextNodeFrom(data.edges, node.id, "nao_encontrado") };
      ctx.variaveis[`${pref}_nome`] = p.nome;
      ctx.variaveis[`${pref}_preco`] = p.preco;
      ctx.variaveis[`${pref}_url`] = p.url_produto;
      ctx.variaveis[`${pref}_estoque`] = p.quantidade_estoque;
      return { proxId: nextNodeFrom(data.edges, node.id, "out") };
    }
    case "consultar_pedido": {
      const num = Number(renderTemplate(String(cfg.numero ?? ""), ctx));
      if (!num) return { proxId: nextNodeFrom(data.edges, node.id, "nao_encontrado") };
      const { data: p } = await ctx.supabase.from("pedidos").select("numero,status,valor_total").eq("numero", num).maybeSingle();
      if (!p) return { proxId: nextNodeFrom(data.edges, node.id, "nao_encontrado") };
      ctx.variaveis.pedido_status = p.status;
      ctx.variaveis.pedido_valor = p.valor_total;
      return { proxId: nextNodeFrom(data.edges, node.id, "out") };
    }
    case "registrar_funil": {
      const etapa = String(cfg.etapa ?? "descoberta");
      try {
        await ctx.supabase.from("funil_conversas").insert({
          cliente_id: ctx.cliente.id, canal: ctx.canal, etapa_iniciada: etapa, converteu: etapa === "compra",
        });
      } catch (e) { console.error("[registrar_funil]", e); }
      return { proxId: nextNodeFrom(data.edges, node.id) };
    }
    case "set_variavel": {
      const n = String(cfg.nome ?? "");
      if (n) ctx.variaveis[n] = renderTemplate(String(cfg.valor ?? ""), ctx);
      return { proxId: nextNodeFrom(data.edges, node.id) };
    }

    // === VENDAS ===
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
    case "aplicar_cupom": {
      const cod = renderTemplate(String(cfg.codigo ?? ""), ctx).toUpperCase().trim();
      if (!cod) return { proxId: nextNodeFrom(data.edges, node.id, "invalido") };
      const { data: c } = await ctx.supabase.from("cupons").select("*").eq("codigo", cod).eq("ativo", true).maybeSingle();
      if (!c) return { proxId: nextNodeFrom(data.edges, node.id, "invalido") };
      if (c.limite_usos != null && (c.usos_realizados ?? 0) >= c.limite_usos) {
        return { proxId: nextNodeFrom(data.edges, node.id, "invalido") };
      }
      ctx.variaveis.cupom_codigo = c.codigo;
      ctx.variaveis.cupom_desconto = c.valor_desconto;
      ctx.variaveis.cupom_tipo = c.tipo_desconto;
      await ctx.supabase.from("cupons").update({ usos_realizados: (c.usos_realizados ?? 0) + 1 }).eq("id", c.id);
      return { proxId: nextNodeFrom(data.edges, node.id, "valido") };
    }
    case "calcular_frete": {
      const v = String(cfg.variavel ?? "frete");
      const taxa = Number(ctx.cfg?.taxa_entrega ?? 0);
      ctx.variaveis[v] = taxa;
      return { proxId: nextNodeFrom(data.edges, node.id), reply: taxa > 0 ? `Frete: R$ ${taxa.toFixed(2).replace(".", ",")}` : "Frete grátis 🎉" };
    }
    case "criar_pedido": {
      const fp = String(cfg.forma_pagamento ?? "pix");
      const prods = (ctx.conversa.produtos_mostrados ?? []) as any[];
      try {
        const { data: ped } = await ctx.supabase.from("pedidos").insert({
          cliente_id: ctx.cliente.id, canal: ctx.canal, forma_pagamento: fp,
          produtos_ids: prods.map((p) => p.id).filter(Boolean),
          produtos_snapshot: prods, valor_subtotal: prods.reduce((s, p) => s + Number(p.preco ?? 0), 0),
          valor_total: prods.reduce((s, p) => s + Number(p.preco ?? 0), 0),
        }).select("numero").single();
        ctx.variaveis.pedido_numero = ped?.numero;
        return { proxId: nextNodeFrom(data.edges, node.id, "ok"), reply: `Pedido #${ped?.numero} criado! 🎉` };
      } catch (e) { console.error("[criar_pedido]", e); return { proxId: nextNodeFrom(data.edges, node.id, "erro") }; }
    }
    case "link_pagamento": {
      const m = String(cfg.metodo ?? "pix");
      return { proxId: nextNodeFrom(data.edges, node.id), reply: m === "pix" ? "Chave PIX será enviada em instantes 💛" : "Vou te enviar o link de pagamento 💛" };
    }
    case "solicitar_avaliacao": {
      const msg = renderTemplate(String(cfg.mensagem ?? "De 1 a 5, que nota você dá?"), ctx);
      return { proxId: null, reply: msg, aguardar: { variavel: "avaliacao_nota" } };
    }

    // === INTEGRAÇÃO ===
    case "webhook": {
      const url = renderTemplate(String(cfg.url ?? ""), ctx);
      const metodo = String(cfg.metodo ?? "POST");
      let headers: Record<string, string> = { "Content-Type": "application/json" };
      try { if (cfg.headers) headers = { ...headers, ...JSON.parse(renderTemplate(String(cfg.headers), ctx)) }; } catch {}
      let body: any = undefined;
      try { body = cfg.body ? JSON.parse(renderTemplate(String(cfg.body), ctx)) : undefined; } catch {}
      try {
        const r = await fetch(url, { method: metodo, headers, body: metodo === "GET" ? undefined : JSON.stringify(body ?? {}) });
        if (cfg.mapear) {
          try { const j = await r.json(); ctx.variaveis[String(cfg.mapear)] = j; } catch {}
        }
        return { proxId: nextNodeFrom(data.edges, node.id, r.ok ? "sucesso" : "erro") };
      } catch { return { proxId: nextNodeFrom(data.edges, node.id, "erro") }; }
    }
    case "enviar_email": {
      // Sem provedor configurado — apenas loga.
      console.log("[enviar_email]", { para: renderTemplate(String(cfg.para ?? ""), ctx), assunto: renderTemplate(String(cfg.assunto ?? ""), ctx) });
      return { proxId: nextNodeFrom(data.edges, node.id) };
    }
    case "agendar_followup": {
      const h = Number(cfg.horas ?? 24);
      const msg = renderTemplate(String(cfg.mensagem ?? ""), ctx);
      try {
        await ctx.supabase.from("follow_ups").insert({
          cliente_id: ctx.cliente.id, canal: ctx.canal, mensagem: msg,
          agendado_para: new Date(Date.now() + h * 3600 * 1000).toISOString(),
        });
      } catch (e) { console.error("[agendar_followup]", e); }
      return { proxId: nextNodeFrom(data.edges, node.id) };
    }
    case "sub_fluxo":
      // Simplificação: apenas continua. (Sub-fluxo completo exigiria stack.)
      return { proxId: nextNodeFrom(data.edges, node.id) };

    // === CONTROLE ===
    case "escalar_humano": {
      const motivo = String(cfg.motivo ?? "fluxo escalou");
      const reply = renderTemplate(String(cfg.mensagem ?? "Deixa eu chamar minha colega 💛"), ctx);
      return { proxId: null, reply, escalar: true, motivo };
    }
    case "pausar_fluxo":
      return { proxId: null, pausar: true };
    case "encerrar": {
      const reply = cfg.mensagem_final ? renderTemplate(String(cfg.mensagem_final), ctx) : undefined;
      return { proxId: null, reply, encerrar: true };
    }
    case "goto": {
      const dest = String(cfg.no_destino ?? "");
      return { proxId: dest || null };
    }

    case "comentario":
      return { proxId: nextNodeFrom(data.edges, node.id) };

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
  for (const i of inicios) {
    const canalCfg = String(i.data?.config?.canais ?? "todos");
    if (canalCfg === "todos" || canalCfg === ctx.canal) return i;
  }
  return inicios[0] ?? palavras[0] ?? null;
}

async function processarAguardando(ctx: Ctx, varName: string) {
  const msg = ctx.mensagemUsuario;
  if (varName.startsWith("__cliente_")) {
    const campo = varName.replace("__cliente_", "").replace("__", "");
    await ctx.supabase.from("clientes").update({ [campo]: msg }).eq("id", ctx.cliente.id);
    ctx.cliente[campo] = msg;
    if (campo === "email") {
      ctx.variaveis.__campo_valido__ = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msg);
    } else if (campo === "telefone" || campo === "fone" || campo === "phone") {
      ctx.variaveis.__campo_valido__ = msg.replace(/\D/g, "").length >= 10;
    } else {
      ctx.variaveis.__campo_valido__ = msg.trim().length > 0;
    }
  } else if (varName === "__cep__") {
    const cep = msg.replace(/\D/g, "");
    if (cep.length === 8) {
      ctx.variaveis.cep = cep;
      try {
        const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const j = await r.json();
        if (!j.erro) {
          ctx.variaveis.endereco_logradouro = j.logradouro;
          ctx.variaveis.endereco_bairro = j.bairro;
          ctx.variaveis.endereco_cidade = j.localidade;
          ctx.variaveis.endereco_uf = j.uf;
          ctx.variaveis.__cep_valido__ = true;
        } else ctx.variaveis.__cep_valido__ = false;
      } catch { ctx.variaveis.__cep_valido__ = false; }
    } else ctx.variaveis.__cep_valido__ = false;
  } else if (varName === "__cpf__") {
    const cpf = msg.replace(/\D/g, "");
    ctx.variaveis.cpf = cpf;
    ctx.variaveis.__cpf_valido__ = validaCPF(cpf);
  } else if (varName === "__botao__" || varName === "__opcao__") {
    const n = parseInt(msg.replace(/\D/g, "")) || 0;
    ctx.variaveis[varName.replace(/__/g, "")] = n;
  } else {
    ctx.variaveis[varName] = msg;
  }
}

function proxAposAguardo(data: FluxoData, nodeId: string, varName: string, ctx: Ctx): string | null {
  // Para nós com múltiplas saídas que dependem do que foi capturado
  const node = data.nodes.find((n) => n.id === nodeId);
  const tipo = node?.data?.tipo;
  if (tipo === "capturar_cep") {
    const cepValido = ctx.variaveis.__cep_valido__ === true;
    return nextNodeFrom(data.edges, nodeId, cepValido ? "out" : "invalido");
  }
  if (tipo === "capturar_cpf") {
    const cpfValido = ctx.variaveis.__cpf_valido__ === true;
    return nextNodeFrom(data.edges, nodeId, cpfValido ? "out" : "invalido");
  }
  if (tipo === "capturar_dados") {
    const valido = ctx.variaveis.__campo_valido__ !== false;
    return nextNodeFrom(data.edges, nodeId, valido ? "out" : "invalido");
  }
  if (tipo === "msg_botoes") {
    const cfgNode = node?.data?.config ?? {};
    const btns = ([cfgNode.btn1, cfgNode.btn2, cfgNode.btn3].filter(Boolean)) as string[];
    const msgLower = ctx.mensagemUsuario.toLowerCase().trim();
    const textIdx = btns.findIndex((b) => b.toLowerCase().trim() === msgLower);
    const n = Number(ctx.variaveis["botao"] ?? ctx.variaveis[varName.replace(/__/g, "")] ?? 1);
    const idx = textIdx >= 0 ? textIdx + 1 : (n || 1);
    return nextNodeFrom(data.edges, nodeId, `btn${idx}`);
  }
  if (tipo === "msg_lista") {
    const cfgNode = node?.data?.config ?? {};
    const ops = String(cfgNode.opcoes ?? "").split("\n").map((s: string) => s.trim()).filter(Boolean);
    const msgLower = ctx.mensagemUsuario.toLowerCase().trim();
    const textIdx = ops.findIndex((o: string) => o.toLowerCase().trim() === msgLower);
    const n = Number(ctx.variaveis["opcao"] ?? ctx.variaveis[varName.replace(/__/g, "")] ?? 0);
    const idx = textIdx >= 0 ? textIdx + 1 : n;
    return nextNodeFrom(data.edges, nodeId, idx >= 1 && idx <= 9 ? `op${idx}` : "outro");
  }
  return nextNodeFrom(data.edges, nodeId, "out");
}

export async function executarFluxo(ctx: Ctx): Promise<FluxoResult> {
  // Lê estado salvo antes de buscar o fluxo — para usar o fluxo_id correto ao retomar
  const contexto = (ctx.conversa.contexto ?? {}) as any;
  const estado = contexto.fluxo ?? null;

  // Usa o fluxo salvo na conversa (ao retomar) ou o fluxo ativo mais recente
  let fluxo: any = null;
  if (estado?.fluxo_id) {
    const { data: f } = await ctx.supabase.from("fluxos").select("id,canal,versao_atual").eq("id", estado.fluxo_id).maybeSingle();
    if (f) fluxo = f;
  }
  if (!fluxo) {
    const { data: fluxos } = await ctx.supabase
      .from("fluxos").select("id,canal,versao_atual")
      .eq("ativo", true).in("canal", [ctx.canal, "todos"])
      .order("atualizado_em", { ascending: false }).limit(1);
    fluxo = fluxos?.[0] ?? null;
  }
  if (!fluxo) return { handled: false };

  const { data: versao } = await ctx.supabase
    .from("fluxos_versoes").select("dados")
    .eq("fluxo_id", fluxo.id).eq("versao", fluxo.versao_atual).maybeSingle();
  const data = (versao?.dados as unknown as FluxoData) ?? null;
  if (!data || !data.nodes?.length) return { handled: false };

  let atualId: string | null = estado?.no_atual ?? null;
  const aguardando = estado?.aguardando as { variavel?: string } | null | undefined;
  if (estado?.variaveis) ctx.variaveis = { ...estado.variaveis, ...ctx.variaveis };

  if (atualId && aguardando) {
    const varName = aguardando.variavel ?? "resposta";
    await processarAguardando(ctx, varName);
    atualId = proxAposAguardo(data, atualId, varName, ctx);
  } else if (!atualId) {
    const inicial = escolherNoInicial(data, ctx);
    if (!inicial) return { handled: false };
    // gatilho_inicio só dispara no 1º contato — ctx.hist inclui a mensagem atual
    if (inicial.data?.tipo === "gatilho_inicio" && ctx.hist.length > 1) return { handled: false };
    atualId = inicial.id;
  }

  let reply: string | undefined;
  let escalar = false, motivoEscalar: string | null = null, encerrar = false, pausar = false;
  let novoAguardando: any = null;
  let safety = 50;

  while (atualId && safety-- > 0) {
    const node = data.nodes.find((n) => n.id === atualId);
    if (!node) break;
    const r = await executarNo(ctx, fluxo.id, data, node);
    await logExec(ctx, fluxo.id, node, { proxId: r.proxId, reply: !!r.reply });

    if (r.reply && r.reply !== "__USE_LLM__") reply = reply ? `${reply}\n\n${r.reply}` : r.reply;
    if (r.reply === "__USE_LLM__") {
      atualId = r.proxId;
      await persistirEstado(ctx, fluxo.id, atualId, null);
      return { handled: false };
    }
    if (r.escalar) { escalar = true; motivoEscalar = r.motivo ?? null; }
    if (r.encerrar) encerrar = true;
    if (r.pausar) pausar = true;
    if (r.aguardar) novoAguardando = r.aguardar;

    if (r.aguardar || r.escalar || r.encerrar || r.pausar) {
      atualId = r.proxId ?? atualId;
      break;
    }
    atualId = r.proxId;
    if (reply && !r.proxId) break;
  }

  if (pausar) {
    await persistirEstado(ctx, fluxo.id, null, null);
    return { handled: false };
  }
  await persistirEstado(ctx, fluxo.id, encerrar ? null : atualId, novoAguardando);
  return { handled: !!reply || escalar || encerrar, reply, escalar, motivoEscalar, encerrar };
}

async function persistirEstado(ctx: Ctx, fluxoId: string, noAtual: string | null, aguardando: any) {
  const contexto = (ctx.conversa.contexto ?? {}) as any;
  contexto.fluxo = noAtual ? { fluxo_id: fluxoId, no_atual: noAtual, aguardando, variaveis: ctx.variaveis } : null;
  ctx.conversa.contexto = contexto;
  await ctx.supabase.from("conversas").update({ contexto }).eq("id", ctx.conversa.id);
}

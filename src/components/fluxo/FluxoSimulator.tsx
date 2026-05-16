// Simulador robusto de ponta-a-ponta: executa o fluxo em memória sem afetar o banco.
// Recursos: passo-a-passo ou automático, trace com timestamps, variáveis editáveis,
// validação prévia, cenários de gatilho (início, palavra-chave, evento, intenção),
// destaque dos nós executados no canvas, export do trace em JSON.
import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Send, RotateCcw, Download, Play, StepForward, Pause,
  AlertTriangle, CheckCircle2, XCircle, Trash2, Plus, Zap,
} from "lucide-react";
import type { Edge, Node } from "@xyflow/react";
import { NODE_DEF_BY_TYPE } from "./node-types";
import { validarFluxo } from "./utils/validacao";
import { toast } from "sonner";

type Papel = "user" | "bot" | "sys" | "trace";
type Msg = { papel: Papel; texto: string; nodeId?: string; ts: number };
type TraceEntry = { nodeId: string; tipo: string; label: string; saida?: string; ts: number };
type Vars = Record<string, any>;

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  nodes: Node[];
  edges: Edge[];
  onHighlight?: (executedIds: string[], currentId: string | null) => void;
};

const CLIENTE_BASE: Vars = {
  "cliente.nome": "Maria Teste",
  "cliente.contato": "+5511999999999",
  "cliente.temperatura_lead": "morno",
  "cliente.categoria_favorita": "anel",
  "cliente.budget_aproximado": 300,
};

function nextNode(edges: Edge[], from: string, handle = "out"): string | null {
  return edges.find((e) => e.source === from && (e.sourceHandle ?? "out") === handle)?.target ?? null;
}

function render(tpl: string, vars: Vars): string {
  if (!tpl) return "";
  return String(tpl)
    .replace(/\{\{\s*cliente\.([a-z_]+)\s*\}\}/gi, (_, k) => String(vars[`cliente.${k}`] ?? `[cliente.${k}]`))
    .replace(/\{\{\s*ultima_mensagem\s*\}\}/gi, String(vars.__ultima__ ?? ""))
    .replace(/\{\{\s*var\.([a-z0-9_]+)\s*\}\}/gi, (_, k) => String(vars[`var.${k}`] ?? `{{var.${k}}}`));
}

function resolveVar(name: string, vars: Vars): any {
  if (!name) return "";
  if (name.startsWith("{{")) return render(name, vars);
  if (vars[name] !== undefined) return vars[name];
  if (vars[`var.${name}`] !== undefined) return vars[`var.${name}`];
  return "";
}

function compare(a: any, op: string, b: any): boolean {
  const sa = String(a ?? "").toLowerCase();
  const sb = String(b ?? "").toLowerCase();
  switch (op) {
    case "igual": return sa === sb;
    case "diferente": return sa !== sb;
    case "contem": return sa.includes(sb);
    case "nao_contem": return !sa.includes(sb);
    case "maior": return Number(a) > Number(b);
    case "menor": return Number(a) < Number(b);
    case "vazio": return !sa;
    case "preenchido": return !!sa;
    case "regex": try { return new RegExp(b).test(String(a ?? "")); } catch { return false; }
    default: return false;
  }
}

function validarCPF(cpf: string): boolean {
  const s = cpf.replace(/\D/g, "");
  if (s.length !== 11 || /^(\d)\1+$/.test(s)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(s[i]) * (10 - i);
  let r = (soma * 10) % 11; if (r === 10) r = 0;
  if (r !== parseInt(s[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(s[i]) * (11 - i);
  r = (soma * 10) % 11; if (r === 10) r = 0;
  return r === parseInt(s[10]);
}

export function FluxoSimulator({ open, onOpenChange, nodes, edges, onHighlight }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [trace, setTrace] = useState<TraceEntry[]>([]);
  const [vars, setVars] = useState<Vars>({ ...CLIENTE_BASE, __ultima__: "" });
  const [atual, setAtual] = useState<string | null>(null);
  const [aguardando, setAguardando] = useState<{ variavel?: string; tipo?: string } | null>(null);
  const [input, setInput] = useState("");
  const [modo, setModo] = useState<"auto" | "passo">("auto");
  const [gatilho, setGatilho] = useState<string>("gatilho_inicio");
  const [pausado, setPausado] = useState(false);
  const [aba, setAba] = useState("chat");
  const filaRef = useRef<{ cur: string | null; vars: Vars } | null>(null);

  const problemas = useMemo(() => validarFluxo(nodes, edges), [nodes, edges]);
  const erros = problemas.filter((p) => p.tipo === "erro");
  const alertas = problemas.filter((p) => p.tipo === "alerta");

  // Highlight no canvas
  useEffect(() => {
    if (!onHighlight) return;
    const ids = Array.from(new Set(trace.map((t) => t.nodeId)));
    onHighlight(ids, atual);
  }, [trace, atual, onHighlight]);

  const reset = () => {
    setMsgs([]); setTrace([]); setAtual(null); setAguardando(null); setPausado(false);
    setVars({ ...CLIENTE_BASE, __ultima__: "" });
    filaRef.current = null;
    onHighlight?.([], null);
  };

  const acharGatilho = (tipo: string): string | null => {
    const n = nodes.find((nn) => (nn.data as any)?.tipo === tipo);
    if (n) return n.id;
    if (tipo === "gatilho_inicio") return nodes[0]?.id ?? null;
    return null;
  };

  const log = (entry: TraceEntry) => setTrace((t) => [...t, entry]);
  const pushMsg = (m: Omit<Msg, "ts">) => setMsgs((ms) => [...ms, { ...m, ts: Date.now() }]);

  const executar = (startId: string | null, mensagemUser?: string, varsBase?: Vars) => {
    let cur = startId;
    const novoVars: Vars = { ...(varsBase ?? vars), __ultima__: mensagemUser ?? (varsBase ?? vars).__ultima__ };

    // Se estava aguardando, grava a resposta e avança
    if (aguardando && mensagemUser !== undefined && cur) {
      const variavel = aguardando.variavel ?? "resposta";
      let saida: string = "out";

      // validações específicas
      if (aguardando.tipo === "capturar_cep") {
        const cep = mensagemUser.replace(/\D/g, "");
        if (cep.length !== 8) saida = "invalido";
        else {
          novoVars["var.cep"] = cep;
          novoVars["var.endereco"] = `[ViaCEP simulado] Rua Exemplo, ${cep.slice(0, 5)}-${cep.slice(5)}`;
        }
      } else if (aguardando.tipo === "capturar_cpf") {
        if (!validarCPF(mensagemUser)) saida = "invalido";
        else novoVars["var.cpf"] = mensagemUser;
      } else if (aguardando.tipo === "capturar_dados") {
        novoVars[`var.${variavel}`] = mensagemUser;
        novoVars[`cliente.${variavel}`] = mensagemUser;
      } else if (aguardando.tipo === "msg_botoes") {
        novoVars["var.botao_escolhido"] = mensagemUser;
        const node = nodes.find((n) => n.id === cur);
        const cfg = (node?.data as any)?.config ?? {};
        if (mensagemUser === cfg.btn1) saida = "btn1";
        else if (mensagemUser === cfg.btn2) saida = "btn2";
        else if (mensagemUser === cfg.btn3) saida = "btn3";
      } else if (aguardando.tipo === "msg_lista") {
        novoVars["var.opcao_escolhida"] = mensagemUser;
        const n = parseInt(mensagemUser);
        saida = n >= 1 && n <= 4 ? `op${n}` : "outro";
      } else {
        novoVars[`var.${variavel}`] = mensagemUser;
      }

      cur = nextNode(edges, cur, saida);
      setAguardando(null);
    }

    rodarLoop(cur, novoVars);
  };

  const rodarLoop = (start: string | null, varsLocal: Vars) => {
    let cur = start;
    const v = { ...varsLocal };
    let safety = 50;

    while (cur && safety-- > 0) {
      if (modo === "passo" && filaRef.current === null) {
        // primeira execução do passo já avança um nó
      }

      const node = nodes.find((n) => n.id === cur);
      if (!node) break;
      const tipo = (node.data as any).tipo;
      const cfg = (node.data as any).config ?? {};
      const def = NODE_DEF_BY_TYPE[tipo];
      const label = def?.label ?? tipo;

      const traceBase: Omit<TraceEntry, "ts"> = { nodeId: node.id, tipo, label };
      let proximo: string | null = null;
      let saidaUsada = "out";
      let parar = false;

      switch (tipo) {
        case "gatilho_inicio":
        case "gatilho_palavra":
        case "gatilho_evento":
        case "gatilho_intencao":
          proximo = nextNode(edges, cur); break;

        case "msg_texto":
          pushMsg({ papel: "bot", texto: render(cfg.texto, v), nodeId: cur });
          proximo = nextNode(edges, cur); break;
        case "msg_ia":
          pushMsg({ papel: "bot", texto: `🤖 [IA livre — ${cfg.instrucao || "responde no contexto"}]`, nodeId: cur });
          proximo = nextNode(edges, cur); break;
        case "msg_imagem":
          pushMsg({ papel: "bot", texto: `🖼️ ${cfg.url || "[sem url]"}\n${render(cfg.legenda || "", v)}`, nodeId: cur });
          proximo = nextNode(edges, cur); break;
        case "msg_audio":
          pushMsg({ papel: "bot", texto: `🔊 [áudio: ${cfg.url || "(sem url)"}]`, nodeId: cur });
          proximo = nextNode(edges, cur); break;
        case "msg_documento":
          pushMsg({ papel: "bot", texto: `📎 ${cfg.nome_arquivo || "documento"} → ${cfg.url}`, nodeId: cur });
          proximo = nextNode(edges, cur); break;
        case "msg_localizacao":
          pushMsg({ papel: "bot", texto: `📍 ${render(cfg.endereco || "", v)}`, nodeId: cur });
          proximo = nextNode(edges, cur); break;
        case "msg_produto":
          pushMsg({ papel: "bot", texto: `📦 [Catálogo: ${cfg.categoria || "todos"} • ${cfg.genero || "todos"} • até R$${cfg.preco_max || "?"} • top ${cfg.quantidade || 3}]`, nodeId: cur });
          proximo = nextNode(edges, cur); break;
        case "msg_typing":
          pushMsg({ papel: "sys", texto: `⌨️ digitando ${cfg.segundos || 2}s…` });
          proximo = nextNode(edges, cur); break;

        case "msg_botoes":
          pushMsg({
            papel: "bot",
            texto: `${render(cfg.texto || "", v)}\n${[cfg.btn1, cfg.btn2, cfg.btn3].filter(Boolean).map((b) => `[ ${b} ]`).join(" ")}`,
            nodeId: cur,
          });
          setAtual(cur); setAguardando({ tipo: "msg_botoes", variavel: "botao_escolhido" });
          log({ ...traceBase, saida: "(aguardando botão)", ts: Date.now() });
          setVars(v); parar = true; break;
        case "msg_lista":
          pushMsg({
            papel: "bot",
            texto: `${render(cfg.titulo || "Escolha:", v)}\n${String(cfg.opcoes || "").split("\n").filter(Boolean).map((o, i) => `${i + 1}. ${o}`).join("\n")}`,
            nodeId: cur,
          });
          setAtual(cur); setAguardando({ tipo: "msg_lista", variavel: "opcao_escolhida" });
          log({ ...traceBase, saida: "(aguardando opção)", ts: Date.now() });
          setVars(v); parar = true; break;

        case "capturar_resposta":
          setAtual(cur); setAguardando({ tipo, variavel: cfg.variavel || "resposta" });
          pushMsg({ papel: "sys", texto: `⏸️ Aguardando resposta → var.${cfg.variavel || "resposta"}` });
          log({ ...traceBase, saida: "(aguardando)", ts: Date.now() });
          setVars(v); parar = true; break;
        case "capturar_dados":
        case "capturar_cep":
        case "capturar_cpf":
        case "capturar_midia":
          pushMsg({ papel: "bot", texto: render(cfg.pergunta || "?", v), nodeId: cur });
          setAtual(cur); setAguardando({ tipo, variavel: cfg.campo || (tipo === "capturar_cep" ? "cep" : tipo === "capturar_cpf" ? "cpf" : "dado") });
          log({ ...traceBase, saida: "(aguardando)", ts: Date.now() });
          setVars(v); parar = true; break;

        case "condicao": {
          const valVar = resolveVar(cfg.variavel, v);
          const ok = compare(valVar, cfg.operador || "contem", cfg.valor);
          saidaUsada = ok ? "sim" : "nao";
          pushMsg({ papel: "trace", texto: `🔀 ${cfg.variavel} (${String(valVar)}) ${cfg.operador} "${cfg.valor}" → ${ok ? "SIM" : "NÃO"}` });
          proximo = nextNode(edges, cur, saidaUsada); break;
        }
        case "condicao_multipla": {
          let regras: any[] = [];
          try { regras = JSON.parse(cfg.regras || "[]"); } catch { /* noop */ }
          const resultados = regras.map((r) => compare(resolveVar(r.var, v), r.op, r.val));
          const ok = cfg.modo === "ou" ? resultados.some(Boolean) : resultados.every(Boolean);
          saidaUsada = ok ? "sim" : "nao";
          pushMsg({ papel: "trace", texto: `🔀 ${cfg.modo === "ou" ? "OU" : "E"} de ${regras.length} regra(s) → ${ok ? "SIM" : "NÃO"}` });
          proximo = nextNode(edges, cur, saidaUsada); break;
        }
        case "switch": {
          const valVar = String(resolveVar(cfg.variavel, v));
          const casos = [cfg.caso1, cfg.caso2, cfg.caso3, cfg.caso4, cfg.caso5];
          const idx = casos.findIndex((c) => c && String(c) === valVar);
          saidaUsada = idx >= 0 ? `c${idx + 1}` : "default";
          pushMsg({ papel: "trace", texto: `🔀 switch(${cfg.variavel}=${valVar}) → ${saidaUsada}` });
          proximo = nextNode(edges, cur, saidaUsada); break;
        }
        case "aguardar":
          pushMsg({ papel: "sys", texto: `⏱️ Aguardar ${cfg.quantidade} ${cfg.unidade} (pulado na simulação)` });
          proximo = nextNode(edges, cur); break;
        case "random_ab": {
          const pa = Number(cfg.porcentagem_a ?? 50);
          const hash = String(v["cliente.contato"] || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
          const ok = (hash % 100) < pa;
          saidaUsada = ok ? "a" : "b";
          pushMsg({ papel: "trace", texto: `🎲 A/B (${pa}% A) → ${saidaUsada.toUpperCase()}` });
          proximo = nextNode(edges, cur, saidaUsada); break;
        }
        case "calculadora": {
          const expr = render(cfg.expressao || "0", v);
          let res: any = 0;
          try { res = Function(`"use strict"; return (${expr.replace(/[^\d+\-*/.() ]/g, "")})`)(); } catch { res = "ERR"; }
          if (cfg.variavel_destino) v[`var.${cfg.variavel_destino}`] = res;
          pushMsg({ papel: "trace", texto: `🧮 ${cfg.variavel_destino} = ${expr} = ${res}` });
          proximo = nextNode(edges, cur); break;
        }
        case "verificar_horario": {
          const h = new Date().getHours();
          const ok = h >= 9 && h < 18;
          saidaUsada = ok ? "sim" : "nao";
          pushMsg({ papel: "trace", texto: `🕐 Horário atual ${h}h → ${ok ? "dentro" : "fora"}` });
          proximo = nextNode(edges, cur, saidaUsada); break;
        }
        case "verificar_dia": {
          const d = new Date().getDay();
          const dias = String(cfg.dias || "").split(",").map((s) => parseInt(s.trim()));
          const ok = dias.includes(d);
          saidaUsada = ok ? "sim" : "nao";
          pushMsg({ papel: "trace", texto: `📅 Dia ${d} → ${ok ? "ativo" : "fora"}` });
          proximo = nextNode(edges, cur, saidaUsada); break;
        }
        case "contador": {
          const key = `var.${cfg.variavel}`;
          const atualV = Number(v[key] || 0);
          if (cfg.operacao === "incrementar") v[key] = atualV + 1;
          else if (cfg.operacao === "decrementar") v[key] = atualV - 1;
          else if (cfg.operacao === "set") v[key] = Number(cfg.valor || 0);
          else if (cfg.operacao === "reset") v[key] = 0;
          pushMsg({ papel: "trace", texto: `🔢 ${cfg.variavel} = ${v[key]}` });
          proximo = nextNode(edges, cur); break;
        }
        case "loop": {
          const key = `__loop_${node.id}`;
          const it = Number(v[key] || 0) + 1;
          v[key] = it;
          const max = Number(cfg.max_iteracoes || 5);
          if (it >= max) {
            saidaUsada = "fim";
            pushMsg({ papel: "trace", texto: `🔁 Loop atingiu ${max} iterações → fim` });
            proximo = nextNode(edges, cur, "fim");
          } else {
            pushMsg({ papel: "trace", texto: `🔁 Loop iteração ${it}/${max}` });
            proximo = cfg.no_destino || nextNode(edges, cur, "continuar");
            saidaUsada = "continuar";
          }
          break;
        }
        case "set_variavel":
          if (cfg.nome) v[`var.${cfg.nome}`] = render(cfg.valor || "", v);
          pushMsg({ papel: "trace", texto: `📝 var.${cfg.nome} = ${v[`var.${cfg.nome}`]}` });
          proximo = nextNode(edges, cur); break;
        case "ia_classificar": {
          const cats = String(cfg.categorias || "").split(",").map((s) => s.trim()).filter(Boolean);
          const msg = String(v.__ultima__ || "").toLowerCase();
          const hit = cats.find((c) => msg.includes(c.toLowerCase())) ?? cats[0] ?? "outro";
          saidaUsada = hit;
          pushMsg({ papel: "trace", texto: `🧠 Classificação → ${hit}` });
          proximo = nextNode(edges, cur, saidaUsada); break;
        }
        case "ia_extrair":
        case "ia_sentimento":
        case "ia_resumir":
        case "ia_traduzir":
        case "ia_imagem":
          pushMsg({ papel: "trace", texto: `🧠 ${label} (simulado)` });
          if (cfg.variavel) v[`var.${cfg.variavel}`] = "[valor IA simulado]";
          proximo = nextNode(edges, cur); break;
        case "consultar_produto":
        case "consultar_pedido":
        case "criar_pedido":
        case "atualizar_pedido":
        case "calcular_frete":
        case "link_pagamento":
          pushMsg({ papel: "trace", texto: `🗄️ ${label} (simulado)` });
          if (cfg.variavel) v[`var.${cfg.variavel}`] = `[${tipo}]`;
          proximo = nextNode(edges, cur); break;
        case "oferecer_cupom":
          pushMsg({ papel: "bot", texto: `🎟️ Cupom oferecido: ${cfg.codigo || "JULIANA10"} (${cfg.percentual || 10}% OFF)`, nodeId: cur });
          proximo = nextNode(edges, cur, "ofertado"); break;
        case "tag_cliente":
          pushMsg({ papel: "trace", texto: `🏷️ Tag: ${cfg.tag || "(sem tag)"}` });
          proximo = nextNode(edges, cur); break;
        case "webhook":
        case "enviar_email":
        case "agendar_followup":
        case "executar_fluxo":
          pushMsg({ papel: "trace", texto: `🔌 ${label} (simulado)` });
          proximo = nextNode(edges, cur); break;
        case "escalar_humano":
          pushMsg({ papel: "bot", texto: render(cfg.mensagem || "Vou te transferir agora.", v), nodeId: cur });
          pushMsg({ papel: "sys", texto: "👤 Escalado para humano — fim da simulação." });
          log({ ...traceBase, saida: "fim", ts: Date.now() });
          setAtual(null); setVars(v); parar = true; break;
        case "encerrar":
          if (cfg.mensagem_final) pushMsg({ papel: "bot", texto: render(cfg.mensagem_final, v), nodeId: cur });
          pushMsg({ papel: "sys", texto: "🏁 Fluxo encerrado." });
          log({ ...traceBase, saida: "fim", ts: Date.now() });
          setAtual(null); setVars(v); parar = true; break;
        case "pausar_fluxo":
          pushMsg({ papel: "sys", texto: "⏸️ Fluxo pausado — IA livre assume." });
          log({ ...traceBase, saida: "pausa", ts: Date.now() });
          setAtual(null); setVars(v); parar = true; break;
        case "comentario":
          proximo = nextNode(edges, cur); break;
        default:
          pushMsg({ papel: "trace", texto: `▶️ ${label} (sem simulação dedicada)` });
          proximo = nextNode(edges, cur); break;
      }

      log({ ...traceBase, saida: saidaUsada, ts: Date.now() });
      if (parar) return;
      cur = proximo;

      if (modo === "passo" && cur) {
        setAtual(cur); setVars(v);
        filaRef.current = { cur, vars: v };
        return;
      }
    }

    if (safety <= 0) pushMsg({ papel: "sys", texto: "⚠️ Limite de 50 nós atingido (possível loop infinito)." });
    setAtual(cur);
    setVars(v);
  };

  const iniciar = () => {
    reset();
    const id = acharGatilho(gatilho);
    if (!id) { toast.error("Nenhum nó de gatilho encontrado"); return; }
    pushMsg({ papel: "sys", texto: `▶️ Iniciando simulação a partir de ${NODE_DEF_BY_TYPE[gatilho]?.label ?? gatilho}` });
    setTimeout(() => executar(id, undefined, { ...CLIENTE_BASE, __ultima__: "" }), 50);
  };

  const proximoPasso = () => {
    if (!filaRef.current) return;
    const { cur, vars: v } = filaRef.current;
    filaRef.current = null;
    rodarLoop(cur, v);
  };

  const onSend = () => {
    if (!input.trim()) return;
    const txt = input;
    pushMsg({ papel: "user", texto: txt });
    setInput("");
    if (!atual && !aguardando) {
      const id = acharGatilho(gatilho);
      if (id) executar(id, txt);
    } else {
      executar(atual, txt);
    }
  };

  const exportTrace = () => {
    const blob = new Blob([JSON.stringify({ trace, vars, msgs }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `simulacao-fluxo-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const atualizarVar = (k: string, val: string) => setVars((vs) => ({ ...vs, [k]: val }));
  const removerVar = (k: string) => setVars((vs) => { const n = { ...vs }; delete n[k]; return n; });
  const adicionarVar = () => {
    const k = prompt("Nome da variável (ex: var.ocasiao):");
    if (!k) return;
    setVars((vs) => ({ ...vs, [k]: "" }));
  };

  const gatilhos = nodes
    .filter((n) => String((n.data as any)?.tipo || "").startsWith("gatilho_"))
    .map((n) => ({ id: n.id, tipo: (n.data as any).tipo }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] flex flex-col p-0 gap-0">
        <SheetHeader className="p-3 border-b">
          <SheetTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Zap className="size-4 text-amber-500" /> Simulador end-to-end
            </span>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={exportTrace} title="Exportar trace">
                <Download className="size-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={reset} title="Reiniciar">
                <RotateCcw className="size-3.5" />
              </Button>
            </div>
          </SheetTitle>
        </SheetHeader>

        {/* Controles superiores */}
        <div className="p-3 border-b space-y-2 bg-muted/30">
          {(erros.length > 0 || alertas.length > 0) && (
            <div className="flex gap-1 flex-wrap">
              {erros.length > 0 && (
                <Badge variant="destructive" className="gap-1 text-[10px]">
                  <XCircle className="size-3" /> {erros.length} erro(s)
                </Badge>
              )}
              {alertas.length > 0 && (
                <Badge variant="secondary" className="gap-1 text-[10px] bg-amber-100 text-amber-900 dark:bg-amber-900/40">
                  <AlertTriangle className="size-3" /> {alertas.length} alerta(s)
                </Badge>
              )}
              {erros.length === 0 && alertas.length === 0 && (
                <Badge variant="secondary" className="gap-1 text-[10px] bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40">
                  <CheckCircle2 className="size-3" /> Fluxo válido
                </Badge>
              )}
            </div>
          )}
          <div className="flex gap-2 items-center">
            <Select value={gatilho} onValueChange={setGatilho}>
              <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Gatilho" /></SelectTrigger>
              <SelectContent>
                {gatilhos.length === 0 && <SelectItem value="gatilho_inicio">Início (primeiro nó)</SelectItem>}
                {gatilhos.map((g) => (
                  <SelectItem key={g.id} value={g.tipo}>{NODE_DEF_BY_TYPE[g.tipo]?.label ?? g.tipo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={modo} onValueChange={(v: any) => setModo(v)}>
              <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automático</SelectItem>
                <SelectItem value="passo">Passo-a-passo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-8 flex-1" onClick={iniciar}>
              <Play className="size-3.5 mr-1" /> Iniciar
            </Button>
            {modo === "passo" && filaRef.current && (
              <Button size="sm" variant="outline" className="h-8" onClick={proximoPasso}>
                <StepForward className="size-3.5 mr-1" /> Próximo
              </Button>
            )}
          </div>
        </div>

        <Tabs value={aba} onValueChange={setAba} className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-3 mt-2 grid grid-cols-3 h-8">
            <TabsTrigger value="chat" className="text-xs">Chat</TabsTrigger>
            <TabsTrigger value="trace" className="text-xs">Trace ({trace.length})</TabsTrigger>
            <TabsTrigger value="vars" className="text-xs">Variáveis</TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="flex-1 min-h-0 flex flex-col mt-2">
            <ScrollArea className="flex-1 px-3">
              <div className="space-y-2 pb-3">
                {msgs.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    Clique <strong>Iniciar</strong> ou digite uma mensagem para começar.
                  </p>
                )}
                {msgs.map((m, i) => (
                  <div
                    key={i}
                    className={`text-xs rounded-lg px-3 py-2 whitespace-pre-wrap ${
                      m.papel === "user"
                        ? "ml-8 bg-primary text-primary-foreground"
                        : m.papel === "bot"
                        ? "mr-8 bg-muted"
                        : m.papel === "trace"
                        ? "text-[10px] text-muted-foreground italic border-l-2 border-violet-300 pl-2 bg-violet-50/30 dark:bg-violet-950/20"
                        : "text-center text-muted-foreground text-[10px]"
                    }`}
                  >
                    {m.texto}
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="p-3 border-t flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSend()}
                placeholder={
                  aguardando
                    ? `Resposta esperada (${aguardando.tipo === "capturar_cep" ? "CEP" : aguardando.tipo === "capturar_cpf" ? "CPF" : aguardando.variavel})…`
                    : "Digite uma mensagem do cliente…"
                }
                className="h-8 text-xs"
              />
              <Button size="icon" className="h-8 w-8" onClick={onSend}>
                <Send className="size-3.5" />
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="trace" className="flex-1 min-h-0 mt-2">
            <ScrollArea className="h-full px-3">
              <div className="space-y-1 pb-3">
                {trace.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">Nenhum nó executado ainda.</p>
                )}
                {trace.map((t, i) => (
                  <div key={i} className="text-[11px] flex items-start gap-2 border-l-2 border-violet-400 pl-2 py-1">
                    <Badge variant="outline" className="font-mono text-[9px] shrink-0">{i + 1}</Badge>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{t.label}</div>
                      <div className="text-muted-foreground text-[10px] font-mono truncate">
                        {t.nodeId} {t.saida && `→ ${t.saida}`}
                      </div>
                    </div>
                    <span className="text-[9px] text-muted-foreground shrink-0">
                      {new Date(t.ts).toLocaleTimeString("pt-BR", { hour12: false })}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="vars" className="flex-1 min-h-0 mt-2">
            <ScrollArea className="h-full px-3">
              <div className="space-y-2 pb-3">
                <Button size="sm" variant="outline" className="w-full h-7" onClick={adicionarVar}>
                  <Plus className="size-3 mr-1" /> Adicionar variável
                </Button>
                <Separator />
                {Object.entries(vars)
                  .filter(([k]) => !k.startsWith("__"))
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([k, v]) => (
                    <div key={k} className="flex items-center gap-1">
                      <Badge variant="outline" className="font-mono text-[10px] shrink-0 max-w-[140px] truncate">{k}</Badge>
                      <Textarea
                        value={String(v ?? "")}
                        onChange={(e) => atualizarVar(k, e.target.value)}
                        className="h-7 min-h-7 text-[11px] py-1 resize-none"
                        rows={1}
                      />
                      <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => removerVar(k)}>
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

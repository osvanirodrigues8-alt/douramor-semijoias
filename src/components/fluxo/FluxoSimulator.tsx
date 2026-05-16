// Simulador embutido: roda o fluxo em memória (sem afetar banco) e marca nós executados.
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Send, RotateCcw } from "lucide-react";
import type { Edge, Node } from "@xyflow/react";
import { NODE_DEF_BY_TYPE } from "./node-types";

type Msg = { papel: "user" | "bot" | "sys"; texto: string; nodeId?: string };

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  nodes: Node[];
  edges: Edge[];
};

function nextNode(edges: Edge[], from: string, handle = "out"): string | null {
  return edges.find((e) => e.source === from && (e.sourceHandle ?? "out") === handle)?.target ?? null;
}

function render(tpl: string, vars: Record<string, any>): string {
  if (!tpl) return "";
  return tpl
    .replace(/\{\{\s*cliente\.([a-z_]+)\s*\}\}/gi, (_, k) => String(vars[`cliente.${k}`] ?? "[cliente]"))
    .replace(/\{\{\s*ultima_mensagem\s*\}\}/gi, String(vars.__ultima__ ?? ""))
    .replace(/\{\{\s*var\.([a-z0-9_]+)\s*\}\}/gi, (_, k) => String(vars[`var.${k}`] ?? `{{${k}}}`));
}

export function FluxoSimulator({ open, onOpenChange, nodes, edges }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [vars, setVars] = useState<Record<string, any>>({ "cliente.nome": "Cliente Teste", __ultima__: "" });
  const [atual, setAtual] = useState<string | null>(null);
  const [aguardando, setAguardando] = useState<{ variavel?: string } | null>(null);
  const [input, setInput] = useState("");

  const reset = () => {
    setMsgs([]); setAtual(null); setAguardando(null); setVars({ "cliente.nome": "Cliente Teste" });
  };

  const inicial = () => {
    const inicio = nodes.find((n) => (n.data as any)?.tipo === "gatilho_inicio");
    return inicio?.id ?? nodes[0]?.id ?? null;
  };

  const executar = (startId: string | null, mensagemUser?: string) => {
    let cur = startId;
    const novoVars: Record<string, any> = { ...vars, __ultima__: mensagemUser ?? vars.__ultima__ };
    if (aguardando && mensagemUser !== undefined) {
      novoVars[`var.${aguardando.variavel ?? "resposta"}`] = mensagemUser;
      cur = cur ? nextNode(edges, cur) : null;
      setAguardando(null);
    }

    const novasMsgs: Msg[] = [];
    let safety = 30;
    while (cur && safety-- > 0) {
      const node = nodes.find((n) => n.id === cur);
      if (!node) break;
      const tipo = (node.data as any).tipo;
      const cfg = (node.data as any).config ?? {};
      const def = NODE_DEF_BY_TYPE[tipo];

      switch (tipo) {
        case "gatilho_inicio": case "gatilho_palavra": case "gatilho_evento": case "gatilho_intencao":
          cur = nextNode(edges, cur); break;
        case "msg_texto":
          novasMsgs.push({ papel: "bot", texto: render(String(cfg.texto ?? ""), novoVars), nodeId: node.id });
          cur = nextNode(edges, cur); break;
        case "msg_ia":
          novasMsgs.push({ papel: "bot", texto: `🤖 [IA livre — instrução: ${cfg.instrucao || "(nenhuma)"}]`, nodeId: node.id });
          cur = nextNode(edges, cur); break;
        case "msg_produto":
          novasMsgs.push({ papel: "bot", texto: `📦 [Mostrar produtos: ${cfg.categoria || "todos"}]`, nodeId: node.id });
          cur = nextNode(edges, cur); break;
        case "msg_imagem":
          novasMsgs.push({ papel: "bot", texto: `🖼️ ${cfg.url}\n${render(String(cfg.legenda ?? ""), novoVars)}`, nodeId: node.id });
          cur = nextNode(edges, cur); break;
        case "msg_botoes":
          novasMsgs.push({ papel: "bot", texto: `${render(String(cfg.texto ?? ""), novoVars)}\n[${[cfg.btn1, cfg.btn2, cfg.btn3].filter(Boolean).join("] [")}]`, nodeId: node.id });
          setAtual(cur); setAguardando({ variavel: "botao_escolhido" });
          setMsgs((m) => [...m, ...novasMsgs]); setVars(novoVars);
          return;
        case "capturar_resposta":
          setAtual(cur); setAguardando({ variavel: String(cfg.variavel ?? "resposta") });
          setMsgs((m) => [...m, ...novasMsgs, { papel: "sys", texto: `⏸️ Aguardando: ${cfg.variavel}` }]);
          setVars(novoVars);
          return;
        case "capturar_dados": case "capturar_cep": case "capturar_cpf":
          novasMsgs.push({ papel: "bot", texto: render(String(cfg.pergunta ?? "?"), novoVars), nodeId: node.id });
          setAtual(cur); setAguardando({ variavel: cfg.campo ?? "dado" });
          setMsgs((m) => [...m, ...novasMsgs]); setVars(novoVars);
          return;
        case "condicao": {
          const v = novoVars[`var.${cfg.variavel}`] ?? novoVars[cfg.variavel] ?? "";
          const ok = String(v).toLowerCase().includes(String(cfg.valor ?? "").toLowerCase());
          novasMsgs.push({ papel: "sys", texto: `🔀 Condição "${cfg.variavel}" → ${ok ? "SIM" : "NÃO"}` });
          cur = nextNode(edges, cur, ok ? "sim" : "nao"); break;
        }
        case "aguardar":
          novasMsgs.push({ papel: "sys", texto: `⏱️ Aguardar ${cfg.quantidade} ${cfg.unidade}` });
          cur = nextNode(edges, cur); break;
        case "set_variavel":
          if (cfg.nome) novoVars[`var.${cfg.nome}`] = render(String(cfg.valor ?? ""), novoVars);
          novasMsgs.push({ papel: "sys", texto: `📝 ${cfg.nome} = ${cfg.valor}` });
          cur = nextNode(edges, cur); break;
        case "oferecer_cupom":
          novasMsgs.push({ papel: "bot", texto: "🎟️ [Oferecer cupom JULIANA10]", nodeId: node.id });
          cur = nextNode(edges, cur, "ofertado"); break;
        case "escalar_humano":
          novasMsgs.push({ papel: "bot", texto: render(String(cfg.mensagem ?? ""), novoVars), nodeId: node.id });
          novasMsgs.push({ papel: "sys", texto: "👤 Conversa escalada para humano" });
          setAtual(null); setMsgs((m) => [...m, ...novasMsgs]); setVars(novoVars);
          return;
        case "encerrar":
          if (cfg.mensagem_final) novasMsgs.push({ papel: "bot", texto: render(String(cfg.mensagem_final), novoVars), nodeId: node.id });
          novasMsgs.push({ papel: "sys", texto: "🏁 Fluxo encerrado" });
          setAtual(null); setMsgs((m) => [...m, ...novasMsgs]); setVars(novoVars);
          return;
        case "pausar_fluxo":
          novasMsgs.push({ papel: "sys", texto: "⏸️ Fluxo pausado — IA livre assume" });
          setAtual(null); setMsgs((m) => [...m, ...novasMsgs]); setVars(novoVars);
          return;
        case "comentario": case "msg_typing":
          cur = nextNode(edges, cur); break;
        default:
          novasMsgs.push({ papel: "sys", texto: `▶️ ${def?.label ?? tipo} (simulado)` });
          cur = nextNode(edges, cur); break;
      }
    }
    setAtual(cur);
    setMsgs((m) => [...m, ...novasMsgs]);
    setVars(novoVars);
  };

  const onSend = () => {
    if (!input.trim()) return;
    setMsgs((m) => [...m, { papel: "user", texto: input }]);
    const txt = input;
    setInput("");
    if (atual === null && !aguardando) executar(inicial(), txt);
    else executar(atual, txt);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] flex flex-col p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center justify-between">
            Simulador
            <Button size="sm" variant="ghost" onClick={reset}>
              <RotateCcw className="size-4 mr-1" /> Reiniciar
            </Button>
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-2">
            {msgs.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">
                Digite uma mensagem para iniciar a simulação.
              </p>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`text-xs ${
                m.papel === "user" ? "ml-8 bg-primary text-primary-foreground" :
                m.papel === "bot" ? "mr-8 bg-muted" :
                "text-center text-muted-foreground"
              } rounded-lg px-3 py-2 whitespace-pre-wrap`}>
                {m.texto}
              </div>
            ))}
          </div>
          {Object.keys(vars).length > 1 && (
            <div className="mt-4 pt-3 border-t space-y-1">
              <p className="text-[10px] uppercase text-muted-foreground">Variáveis</p>
              {Object.entries(vars).filter(([k]) => !k.startsWith("__")).map(([k, v]) => (
                <div key={k} className="flex gap-1 text-[10px]">
                  <Badge variant="outline" className="font-mono">{k}</Badge>
                  <span className="text-foreground/80 truncate">{String(v)}</span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="p-4 border-t flex gap-2">
          <Input
            value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSend()}
            placeholder={aguardando ? `Resposta para ${aguardando.variavel}…` : "Digite uma mensagem…"}
          />
          <Button size="icon" onClick={onSend}><Send className="size-4" /></Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

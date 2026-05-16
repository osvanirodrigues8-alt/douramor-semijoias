// Validação visual do fluxo: nós órfãos, sem saída, ciclos suspeitos.
import type { Edge, Node } from "@xyflow/react";
import { NODE_DEF_BY_TYPE } from "../node-types";

export type ProblemaNo = { nodeId: string; tipo: "erro" | "alerta"; mensagem: string };

export function validarFluxo(nodes: Node[], edges: Edge[]): ProblemaNo[] {
  const problemas: ProblemaNo[] = [];
  const outgoing = new Map<string, Edge[]>();
  const incoming = new Map<string, Edge[]>();
  edges.forEach((e) => {
    (outgoing.get(e.source) ?? outgoing.set(e.source, []).get(e.source))!.push(e);
    (incoming.get(e.target) ?? incoming.set(e.target, []).get(e.target))!.push(e);
  });

  for (const n of nodes) {
    const def = NODE_DEF_BY_TYPE[(n.data as any)?.tipo];
    if (!def) {
      problemas.push({ nodeId: n.id, tipo: "erro", mensagem: "Tipo de nó desconhecido" });
      continue;
    }
    if (def.categoria === "visual") continue;

    const outs = outgoing.get(n.id) ?? [];
    const ins = incoming.get(n.id) ?? [];

    if (def.inputs > 0 && ins.length === 0) {
      problemas.push({ nodeId: n.id, tipo: "alerta", mensagem: "Nenhuma entrada conectada" });
    }
    if (def.outputs.length > 0 && outs.length === 0) {
      problemas.push({ nodeId: n.id, tipo: "erro", mensagem: "Sem saída — fluxo morre aqui" });
    }
    // saídas obrigatórias específicas: condições precisam dos dois lados
    if ((n.data as any)?.tipo === "condicao" || (n.data as any)?.tipo === "condicao_multipla") {
      const handles = new Set(outs.map((e) => e.sourceHandle ?? "out"));
      if (!handles.has("sim") || !handles.has("nao")) {
        problemas.push({ nodeId: n.id, tipo: "alerta", mensagem: "Conecte ambos os ramos (Sim/Não)" });
      }
    }
  }
  return problemas;
}

export function variaveisDisponiveis(nodes: Node[]): string[] {
  const set = new Set<string>([
    "cliente.nome", "cliente.contato", "cliente.temperatura_lead",
    "cliente.categoria_favorita", "cliente.budget_aproximado",
    "ultima_mensagem",
  ]);
  for (const n of nodes) {
    const tipo = (n.data as any)?.tipo;
    const cfg = (n.data as any)?.config ?? {};
    if (tipo === "capturar_resposta" && cfg.variavel) set.add(`var.${cfg.variavel}`);
    if (tipo === "set_variavel" && cfg.nome) set.add(`var.${cfg.nome}`);
    if (tipo === "calculadora" && cfg.variavel_destino) set.add(`var.${cfg.variavel_destino}`);
    if (tipo === "calcular_frete" && cfg.variavel) set.add(`var.${cfg.variavel}`);
    if (tipo === "ia_resumir" && cfg.variavel) set.add(`var.${cfg.variavel}`);
    if (tipo === "ia_traduzir" && cfg.variavel) set.add(`var.${cfg.variavel}`);
    if (tipo === "consultar_produto" && cfg.variavel) {
      set.add(`var.${cfg.variavel}_nome`);
      set.add(`var.${cfg.variavel}_preco`);
    }
    if (tipo === "ia_extrair" && cfg.campos) {
      String(cfg.campos).split(",").forEach((c) => set.add(`var.${c.trim()}`));
    }
  }
  return Array.from(set).sort();
}

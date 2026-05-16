// Canvas React Flow robusto: undo/redo, multi-seleção, copy/paste, duplicate,
// auto-layout (dagre), validação visual, simulador hook, autocomplete de vars.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState, useReactFlow,
  MarkerType,
  type Connection, type Edge, type Node, type ReactFlowInstance, type DefaultEdgeOptions,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FluxoNode } from "./FluxoNode";
import { NodePalette } from "./NodePalette";
import { NodeInspector } from "./NodeInspector";
import { NODE_DEF_BY_TYPE } from "./node-types";
import { HistoryStack } from "./utils/historico";
import { autoLayout } from "./utils/auto-layout";
import { validarFluxo, variaveisDisponiveis } from "./utils/validacao";
import { Button } from "@/components/ui/button";
import { Undo2, Redo2, LayoutGrid, AlertTriangle, Play, ZoomIn, ZoomOut, Maximize2, Lock, Unlock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const nodeTypes = { fluxo: FluxoNode };

export type FluxoData = { nodes: Node[]; edges: Edge[] };

type Props = {
  initial: FluxoData;
  onChange: (data: FluxoData) => void;
  onSimulate?: () => void;
  executedIds?: string[];
  currentId?: string | null;
};

function CanvasInner({ initial, onChange, onSimulate, executedIds, currentId }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rf, setRf] = useState<ReactFlowInstance | null>(null);
  const history = useRef(new HistoryStack());
  const skipNextHistory = useRef(false);
  const { fitView } = useReactFlow();
  const lastEmitted = useRef<string>("");

  // init history + baseline serializado (evita onChange por hidratação inicial)
  useEffect(() => {
    history.current.init({ nodes: initial.nodes, edges: initial.edges });
    lastEmitted.current = JSON.stringify({ nodes: initial.nodes, edges: initial.edges });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // validação + variáveis disponíveis
  const problemas = useMemo(() => validarFluxo(nodes, edges), [nodes, edges]);
  const variaveis = useMemo(() => variaveisDisponiveis(nodes), [nodes]);
  const nodesComProblemas = useMemo(() => {
    const map = new Map(problemas.map((p) => [p.nodeId, p]));
    const exec = new Set(executedIds ?? []);
    return nodes.map((n) => {
      const problema = map.get(n.id);
      const visitado = exec.has(n.id);
      const executando = currentId === n.id;
      const prev = n.data as any;
      // Se nada mudou para este nó, devolve a mesma referência (evita loop no ReactFlow)
      if (prev?.__problema === problema && prev?.__visitado === visitado && prev?.__executando === executando) {
        return n;
      }
      return { ...n, data: { ...n.data, __problema: problema, __visitado: visitado, __executando: executando } };
    });
  }, [nodes, problemas, executedIds, currentId]);

  

  const pushHistory = useCallback((ns: Node[], es: Edge[]) => {
    if (skipNextHistory.current) { skipNextHistory.current = false; return; }
    history.current.push({ nodes: ns, edges: es });
  }, []);

  const sync = useCallback((ns: Node[], es: Edge[], record = true) => {
    const serialized = JSON.stringify({ nodes: ns, edges: es });
    if (serialized === lastEmitted.current) return; // nada mudou de fato
    lastEmitted.current = serialized;
    onChange({ nodes: ns, edges: es });
    if (record) pushHistory(ns, es);
  }, [onChange, pushHistory]);

  const handleNodesChange = useCallback((c: Parameters<typeof onNodesChange>[0]) => {
    onNodesChange(c);
  }, [onNodesChange]);

  const handleEdgesChange = useCallback((c: Parameters<typeof onEdgesChange>[0]) => {
    onEdgesChange(c);
  }, [onEdgesChange]);

  const onConnect = useCallback((c: Connection) => {
    setEdges((es) => {
      const next = addEdge({ ...c, animated: true }, es);
      sync(nodes, next);
      return next;
    });
  }, [nodes, setEdges, sync]);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const tipo = event.dataTransfer.getData("application/fluxo-node-tipo");
    if (!tipo || !rf) return;
    const def = NODE_DEF_BY_TYPE[tipo];
    if (!def) return;
    const position = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const id = `${tipo}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
    const newNode: Node = {
      id, type: "fluxo", position,
      data: { tipo, label: def.label, config: Object.fromEntries(def.campos.filter(c => c.default !== undefined).map(c => [c.chave, c.default])) },
    };
    setNodes((ns) => {
      const next = [...ns, newNode];
      sync(next, edges);
      return next;
    });
  }, [rf, setNodes, edges, sync]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const updateSelected = (patch: any) => {
    setNodes((ns) => {
      const next = ns.map(n => n.id === selectedId ? { ...n, ...patch, data: { ...n.data, ...patch.data } } : n);
      sync(next, edges);
      return next;
    });
  };

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setNodes((ns) => {
      const next = ns.filter(n => n.id !== selectedId);
      const nextEdges = edges.filter(e => e.source !== selectedId && e.target !== selectedId);
      setEdges(nextEdges);
      sync(next, nextEdges);
      return next;
    });
    setSelectedId(null);
  }, [selectedId, edges, setNodes, setEdges, sync]);

  const duplicateSelected = useCallback(() => {
    if (!selectedId) return;
    const node = nodes.find(n => n.id === selectedId);
    if (!node) return;
    const newId = `${(node.data as any).tipo}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
    const novo: Node = {
      ...node, id: newId,
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      selected: false,
      data: JSON.parse(JSON.stringify(node.data)),
    };
    setNodes((ns) => {
      const next = [...ns, novo];
      sync(next, edges);
      return next;
    });
    setSelectedId(newId);
  }, [selectedId, nodes, edges, setNodes, sync]);

  const doUndo = useCallback(() => {
    const s = history.current.undo();
    if (!s) return;
    skipNextHistory.current = true;
    setNodes(s.nodes);
    setEdges(s.edges);
    onChange(s);
  }, [setNodes, setEdges, onChange]);

  const doRedo = useCallback(() => {
    const s = history.current.redo();
    if (!s) return;
    skipNextHistory.current = true;
    setNodes(s.nodes);
    setEdges(s.edges);
    onChange(s);
  }, [setNodes, setEdges, onChange]);

  const organizar = useCallback(() => {
    const novos = autoLayout(nodes, edges, "TB");
    setNodes(novos);
    sync(novos, edges);
    setTimeout(() => fitView({ duration: 400, padding: 0.2 }), 50);
  }, [nodes, edges, setNodes, sync, fitView]);

  // Atalhos de teclado
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); doUndo(); }
      else if (meta && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { e.preventDefault(); doRedo(); }
      else if (meta && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateSelected(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [doUndo, doRedo, duplicateSelected]);

  const selectedNode = nodes.find(n => n.id === selectedId) ?? null;
  const errosCount = problemas.filter(p => p.tipo === "erro").length;
  const alertasCount = problemas.filter(p => p.tipo === "alerta").length;

  return (
    <div className="flex h-full w-full">
      <NodePalette />
      <div className="flex-1 relative">
        <div className="absolute top-2 left-2 z-10 flex gap-1 bg-background/80 backdrop-blur rounded-md border p-1 shadow-sm">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={doUndo} title="Desfazer (Ctrl+Z)">
            <Undo2 className="size-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={doRedo} title="Refazer (Ctrl+Shift+Z)">
            <Redo2 className="size-3.5" />
          </Button>
          <div className="w-px bg-border mx-0.5" />
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={organizar} title="Auto-organizar">
            <LayoutGrid className="size-3.5" />
          </Button>
          {onSimulate && (
            <Button size="sm" variant="outline" className="h-7" onClick={onSimulate} title="Simular">
              <Play className="size-3.5 mr-1" /> Simular
            </Button>
          )}
        </div>

        {(errosCount > 0 || alertasCount > 0) && (
          <div className="absolute top-2 right-2 z-10 flex gap-1">
            {errosCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="size-3" /> {errosCount} {errosCount === 1 ? "erro" : "erros"}
              </Badge>
            )}
            {alertasCount > 0 && (
              <Badge variant="secondary" className="gap-1 bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                <AlertTriangle className="size-3" /> {alertasCount} {alertasCount === 1 ? "alerta" : "alertas"}
              </Badge>
            )}
          </div>
        )}

        <ReactFlow
          nodes={nodesComProblemas}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onInit={setRf}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeClick={(_, n) => setSelectedId(n.id)}
          onPaneClick={() => setSelectedId(null)}
          onNodeDragStop={() => sync(nodes, edges)}
          onEdgesDelete={() => sync(nodes, edges)}
          onNodesDelete={(removed) => {
            const ids = new Set(removed.map(r => r.id));
            const nextEdges = edges.filter(e => !ids.has(e.source) && !ids.has(e.target));
            setEdges(nextEdges);
            sync(nodes.filter(n => !ids.has(n.id)), nextEdges);
          }}
          nodeTypes={nodeTypes}
          fitView
          deleteKeyCode={["Backspace", "Delete"]}
          multiSelectionKeyCode={["Shift"]}
          selectionOnDrag
          panOnDrag={[1, 2]}
          snapToGrid
          snapGrid={[16, 16]}
        >
          <Background gap={16} />
          <Controls position="bottom-right" />
          <MiniMap pannable zoomable className="!bg-background" />
        </ReactFlow>
      </div>
      <NodeInspector
        node={selectedNode}
        variaveis={variaveis}
        onChange={updateSelected}
        onDelete={deleteSelected}
        onDuplicate={duplicateSelected}
      />
    </div>
  );
}

export function FluxoCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

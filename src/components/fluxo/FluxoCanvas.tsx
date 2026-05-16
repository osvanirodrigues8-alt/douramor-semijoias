// Canvas React Flow com drag-drop da paleta e gestão de seleção.
import { useCallback, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FluxoNode } from "./FluxoNode";
import { NodePalette } from "./NodePalette";
import { NodeInspector } from "./NodeInspector";
import { NODE_DEF_BY_TYPE } from "./node-types";

const nodeTypes = { fluxo: FluxoNode };

export type FluxoData = {
  nodes: Node[];
  edges: Edge[];
};

type Props = {
  initial: FluxoData;
  onChange: (data: FluxoData) => void;
};

function CanvasInner({ initial, onChange }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const [rf, setRf] = useState<ReactFlowInstance | null>(null);

  const sync = useCallback((ns: Node[], es: Edge[]) => onChange({ nodes: ns, edges: es }), [onChange]);

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
    const id = `${tipo}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newNode: Node = {
      id,
      type: "fluxo",
      position,
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

  const deleteSelected = () => {
    if (!selectedId) return;
    setNodes((ns) => {
      const next = ns.filter(n => n.id !== selectedId);
      const nextEdges = edges.filter(e => e.source !== selectedId && e.target !== selectedId);
      setEdges(nextEdges);
      sync(next, nextEdges);
      return next;
    });
    setSelectedId(null);
  };

  const selectedNode = nodes.find(n => n.id === selectedId) ?? null;

  return (
    <div className="flex h-full w-full">
      <NodePalette />
      <div className="flex-1 relative" ref={wrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={(c) => { onNodesChange(c); setTimeout(() => sync(nodes, edges), 0); }}
          onEdgesChange={(c) => { onEdgesChange(c); setTimeout(() => sync(nodes, edges), 0); }}
          onConnect={onConnect}
          onInit={setRf}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeClick={(_, n) => setSelectedId(n.id)}
          onPaneClick={() => setSelectedId(null)}
          nodeTypes={nodeTypes}
          fitView
          deleteKeyCode={["Backspace", "Delete"]}
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
      <NodeInspector node={selectedNode} onChange={updateSelected} onDelete={deleteSelected} />
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

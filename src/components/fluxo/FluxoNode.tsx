// Nó visual com badge de validação + estado de execução (simulador).
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NODE_DEF_BY_TYPE } from "./node-types";
import { cn } from "@/lib/utils";
import { AlertTriangle, AlertCircle, Play } from "lucide-react";

export function FluxoNode({ data, selected }: NodeProps) {
  const tipo = (data as any).tipo as string;
  const def = NODE_DEF_BY_TYPE[tipo];
  if (!def) return <div className="bg-destructive text-destructive-foreground p-2 rounded text-xs">? {tipo}</div>;

  const config = (data as any).config ?? {};
  const label = (data as any).label || def.label;
  const problema: { tipo: "erro" | "alerta"; mensagem: string } | undefined = (data as any).__problema;
  const executando: boolean = (data as any).__executando;
  const visitado: boolean = (data as any).__visitado;

  // Comentário tem visual diferente
  if (tipo === "comentario") {
    return (
      <div className={cn(
        "rounded-md border-2 border-dashed border-zinc-400 bg-yellow-50 dark:bg-yellow-950/30 p-3 min-w-[200px] max-w-[280px] text-xs",
        selected && "ring-2 ring-primary",
      )}>
        <p className="text-foreground/80 whitespace-pre-wrap">{config.texto || "Anotação"}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border-2 shadow-sm min-w-[210px] max-w-[280px] text-xs relative transition",
        def.bg, def.cor,
        selected && "ring-2 ring-primary ring-offset-2",
        executando && "ring-2 ring-violet-500 ring-offset-2 animate-pulse",
        visitado && !executando && "opacity-90",
      )}
    >
      {problema && (
        <div className={cn(
          "absolute -top-2 -right-2 rounded-full p-0.5 shadow",
          problema.tipo === "erro" ? "bg-destructive text-destructive-foreground" : "bg-amber-500 text-white",
        )} title={problema.mensagem}>
          {problema.tipo === "erro"
            ? <AlertCircle className="size-3.5" />
            : <AlertTriangle className="size-3.5" />}
        </div>
      )}
      {executando && (
        <div className="absolute -top-2 -left-2 rounded-full p-0.5 bg-violet-500 text-white shadow">
          <Play className="size-3.5" />
        </div>
      )}

      {def.inputs > 0 && (
        <Handle type="target" position={Position.Top} className="!bg-foreground !w-3 !h-3" />
      )}

      <div className="px-3 py-2 border-b border-current/10">
        <p className="font-semibold text-foreground truncate">{label}</p>
        <p className="text-[10px] text-muted-foreground capitalize">{def.categoria}</p>
      </div>

      {Object.keys(config).length > 0 && (
        <div className="px-3 py-2 space-y-0.5">
          {Object.entries(config).slice(0, 3).map(([k, v]) => v ? (
            <div key={k} className="flex gap-1 text-[10px]">
              <span className="text-muted-foreground shrink-0">{k}:</span>
              <span className="truncate text-foreground/90">{String(v).slice(0, 40)}</span>
            </div>
          ) : null)}
        </div>
      )}

      <div className="relative h-7">
        {def.outputs.map((out, i) => {
          const total = def.outputs.length;
          const left = total === 1 ? "50%" : `${((i + 1) / (total + 1)) * 100}%`;
          return (
            <div key={out.id} style={{ position: "absolute", left, transform: "translateX(-50%)", bottom: 0 }}>
              {out.label && (
                <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground whitespace-nowrap">
                  {out.label}
                </span>
              )}
              <Handle
                type="source" position={Position.Bottom} id={out.id}
                style={{ position: "relative", left: 0, transform: "none" }}
                className="!bg-foreground !w-3 !h-3"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Componente customizado de nó renderizado dentro do React Flow.
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NODE_DEF_BY_TYPE } from "./node-types";
import { cn } from "@/lib/utils";

export function FluxoNode({ data, selected }: NodeProps) {
  const tipo = (data as any).tipo as string;
  const def = NODE_DEF_BY_TYPE[tipo];
  if (!def) return <div className="bg-destructive p-2 rounded">Nó desconhecido: {tipo}</div>;

  const config = (data as any).config ?? {};
  const label = (data as any).label || def.label;

  return (
    <div
      className={cn(
        "rounded-lg border-2 shadow-sm min-w-[200px] max-w-[260px] text-xs",
        def.bg,
        def.cor,
        selected && "ring-2 ring-primary ring-offset-2"
      )}
    >
      {def.inputs > 0 && (
        <Handle type="target" position={Position.Top} className="!bg-foreground" />
      )}

      <div className="px-3 py-2 border-b border-current/10">
        <p className="font-semibold text-foreground truncate">{label}</p>
        <p className="text-[10px] text-muted-foreground capitalize">{def.categoria}</p>
      </div>

      {Object.keys(config).length > 0 && (
        <div className="px-3 py-2 space-y-1">
          {Object.entries(config).slice(0, 3).map(([k, v]) => (
            <div key={k} className="flex gap-1 text-[10px]">
              <span className="text-muted-foreground">{k}:</span>
              <span className="truncate text-foreground">{String(v).slice(0, 40)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="relative h-6">
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
                type="source"
                position={Position.Bottom}
                id={out.id}
                style={{ position: "relative", left: 0, transform: "none" }}
                className="!bg-foreground"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

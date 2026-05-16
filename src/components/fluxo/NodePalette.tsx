// Painel lateral esquerdo: paleta de nós arrastáveis.
import { NODE_DEFS, CATEGORIAS } from "./node-types";
import { ScrollArea } from "@/components/ui/scroll-area";

export function NodePalette() {
  const onDragStart = (e: React.DragEvent, tipo: string) => {
    e.dataTransfer.setData("application/fluxo-node-tipo", tipo);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <ScrollArea className="h-full w-56 border-r bg-muted/30">
      <div className="p-3 space-y-4">
        {CATEGORIAS.map((cat) => {
          const nodes = NODE_DEFS.filter((n) => n.categoria === cat.chave);
          if (nodes.length === 0) return null;
          return (
            <div key={cat.chave}>
              <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1.5 ${cat.cor}`}>{cat.label}</p>
              <div className="space-y-1">
                {nodes.map((n) => (
                  <div
                    key={n.tipo}
                    draggable
                    onDragStart={(e) => onDragStart(e, n.tipo)}
                    className="px-2 py-1.5 rounded border bg-background text-xs cursor-grab hover:border-primary hover:shadow-sm transition"
                    title={n.descricao}
                  >
                    {n.label}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

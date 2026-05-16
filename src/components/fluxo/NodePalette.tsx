// Paleta de nós com busca + categorias colapsáveis.
import { useMemo, useState } from "react";
import { NODE_DEFS, CATEGORIAS } from "./node-types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Search, ChevronDown, ChevronRight } from "lucide-react";

export function NodePalette() {
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const onDragStart = (e: React.DragEvent, tipo: string) => {
    e.dataTransfer.setData("application/fluxo-node-tipo", tipo);
    e.dataTransfer.effectAllowed = "move";
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return NODE_DEFS;
    return NODE_DEFS.filter((n) =>
      n.label.toLowerCase().includes(s) ||
      n.tipo.toLowerCase().includes(s) ||
      n.descricao.toLowerCase().includes(s));
  }, [q]);

  return (
    <div className="h-full w-60 border-r bg-muted/30 flex flex-col">
      <div className="p-2 border-b">
        <div className="relative">
          <Search className="size-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar nó…"
            className="pl-7 h-8 text-xs"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-3">
          {CATEGORIAS.map((cat) => {
            const nodes = filtered.filter((n) => n.categoria === cat.chave);
            if (nodes.length === 0) return null;
            const isCollapsed = collapsed.has(cat.chave) && !q;
            return (
              <div key={cat.chave}>
                <button
                  onClick={() => {
                    const ns = new Set(collapsed);
                    if (ns.has(cat.chave)) ns.delete(cat.chave); else ns.add(cat.chave);
                    setCollapsed(ns);
                  }}
                  className={`w-full flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold mb-1 ${cat.cor}`}
                >
                  {isCollapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
                  {cat.label}
                  <span className="ml-auto text-muted-foreground font-normal">{nodes.length}</span>
                </button>
                {!isCollapsed && (
                  <div className="space-y-1">
                    {nodes.map((n) => (
                      <div
                        key={n.tipo}
                        draggable
                        onDragStart={(e) => onDragStart(e, n.tipo)}
                        className="px-2 py-1.5 rounded border bg-background text-xs cursor-grab hover:border-primary hover:shadow-sm transition active:cursor-grabbing"
                        title={n.descricao}
                      >
                        {n.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

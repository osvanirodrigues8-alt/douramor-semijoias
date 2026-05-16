// Painel lateral direito: editor de propriedades do nó selecionado.
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { NODE_DEF_BY_TYPE } from "./node-types";
import { ScrollArea } from "@/components/ui/scroll-area";

type Props = {
  node: any;
  onChange: (patch: any) => void;
  onDelete: () => void;
};

export function NodeInspector({ node, onChange, onDelete }: Props) {
  if (!node) {
    return (
      <div className="w-72 border-l bg-muted/30 p-4 text-xs text-muted-foreground">
        Selecione um nó para editar.
      </div>
    );
  }
  const tipo = node.data?.tipo;
  const def = NODE_DEF_BY_TYPE[tipo];
  if (!def) return <div className="w-72 border-l p-4">Tipo desconhecido</div>;

  const config = node.data?.config ?? {};

  const setConfig = (k: string, v: any) =>
    onChange({ data: { ...node.data, config: { ...config, [k]: v } } });

  const setLabel = (v: string) => onChange({ data: { ...node.data, label: v } });

  return (
    <ScrollArea className="h-full w-72 border-l bg-muted/30">
      <div className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">{def.categoria}</p>
            <h3 className="text-sm font-semibold">{def.label}</h3>
          </div>
          <Button size="icon" variant="ghost" onClick={onDelete}><Trash2 className="size-4 text-destructive" /></Button>
        </div>
        <p className="text-xs text-muted-foreground">{def.descricao}</p>

        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase">Nome do nó</Label>
          <Input value={node.data?.label ?? ""} onChange={(e) => setLabel(e.target.value)} placeholder={def.label} />
        </div>

        <div className="border-t pt-3 space-y-3">
          {def.campos.map((c) => {
            const value = config[c.chave] ?? c.default ?? "";
            return (
              <div key={c.chave} className="space-y-1.5">
                <Label className="text-[10px] uppercase">{c.label}</Label>
                {c.tipo === "text" && (
                  <Input value={value} placeholder={c.placeholder} onChange={(e) => setConfig(c.chave, e.target.value)} />
                )}
                {c.tipo === "textarea" && (
                  <Textarea rows={3} value={value} placeholder={c.placeholder} onChange={(e) => setConfig(c.chave, e.target.value)} />
                )}
                {c.tipo === "number" && (
                  <Input type="number" value={value} onChange={(e) => setConfig(c.chave, Number(e.target.value))} />
                )}
                {c.tipo === "boolean" && (
                  <div className="flex items-center gap-2">
                    <Switch checked={!!value} onCheckedChange={(v) => setConfig(c.chave, v)} />
                    <span className="text-xs text-muted-foreground">{value ? "Sim" : "Não"}</span>
                  </div>
                )}
                {c.tipo === "select" && c.opcoes && (
                  <Select value={String(value)} onValueChange={(v) => setConfig(c.chave, v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {c.opcoes.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {c.tipo === "keywords" && (
                  <Input value={value} placeholder="palavra1, palavra2" onChange={(e) => setConfig(c.chave, e.target.value)} />
                )}
                {c.hint && <p className="text-[10px] text-muted-foreground">{c.hint}</p>}
              </div>
            );
          })}
        </div>

        <div className="border-t pt-3 text-[10px] text-muted-foreground space-y-1">
          <p><strong>ID:</strong> {node.id}</p>
          <p><strong>Saídas:</strong> {def.outputs.map((o) => o.label ?? o.id).join(" / ") || "—"}</p>
        </div>
      </div>
    </ScrollArea>
  );
}

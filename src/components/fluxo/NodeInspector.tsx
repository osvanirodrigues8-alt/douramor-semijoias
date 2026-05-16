// Inspector com autocomplete de variáveis ({{...}}) nos campos marcados como vars.
import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2, Copy } from "lucide-react";
import { NODE_DEF_BY_TYPE } from "./node-types";
import { ScrollArea } from "@/components/ui/scroll-area";

type Props = {
  node: any;
  variaveis: string[];
  onChange: (patch: any) => void;
  onDelete: () => void;
  onDuplicate: () => void;
};

export function NodeInspector({ node, variaveis, onChange, onDelete, onDuplicate }: Props) {
  if (!node) {
    return (
      <div className="w-72 border-l bg-muted/30 p-4 text-xs text-muted-foreground space-y-2">
        <p>Selecione um nó para editar suas propriedades.</p>
        <p className="text-[10px]">Atalhos: <kbd>Ctrl+Z</kbd> desfazer · <kbd>Ctrl+D</kbd> duplicar · <kbd>Del</kbd> remover</p>
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
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" onClick={onDuplicate} title="Duplicar (Ctrl+D)">
              <Copy className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={onDelete} title="Remover (Del)">
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
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
                  c.vars
                    ? <VarInput value={String(value)} variaveis={variaveis} onChange={(v) => setConfig(c.chave, v)} placeholder={c.placeholder} />
                    : <Input value={value} placeholder={c.placeholder} onChange={(e) => setConfig(c.chave, e.target.value)} />
                )}
                {c.tipo === "textarea" && (
                  c.vars
                    ? <VarTextarea value={String(value)} variaveis={variaveis} onChange={(v) => setConfig(c.chave, v)} placeholder={c.placeholder} />
                    : <Textarea rows={3} value={value} placeholder={c.placeholder} onChange={(e) => setConfig(c.chave, e.target.value)} />
                )}
                {c.tipo === "json" && (
                  <Textarea rows={4} value={value} placeholder={c.placeholder} onChange={(e) => setConfig(c.chave, e.target.value)} className="font-mono text-[11px]" />
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
                {c.tipo === "node-ref" && (
                  <Input value={value} placeholder="ID do nó" onChange={(e) => setConfig(c.chave, e.target.value)} />
                )}
                {c.hint && <p className="text-[10px] text-muted-foreground">{c.hint}</p>}
              </div>
            );
          })}
        </div>

        <div className="border-t pt-3 text-[10px] text-muted-foreground space-y-1">
          <p><strong>ID:</strong> <code className="text-[10px]">{node.id}</code></p>
          <p><strong>Saídas:</strong> {def.outputs.map((o) => o.label ?? o.id).join(" / ") || "—"}</p>
        </div>
      </div>
    </ScrollArea>
  );
}

// ============== Inputs com autocomplete de {{variáveis}} ==============

function useAutocomplete(value: string, variaveis: string[]) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState(0);

  const handleChange = (newValue: string, caret: number) => {
    const before = newValue.slice(0, caret);
    const m = before.match(/\{\{\s*([\w\.]*)$/);
    if (m) {
      setQuery(m[1] ?? "");
      setPos(caret - (m[1]?.length ?? 0));
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const sugestoes = variaveis.filter((v) => v.toLowerCase().includes(query.toLowerCase())).slice(0, 8);

  const insert = (v: string, current: string, onChange: (s: string) => void) => {
    const before = current.slice(0, pos);
    const afterStart = current.slice(pos).search(/[^\w\.]/);
    const after = afterStart === -1 ? "" : current.slice(pos + afterStart);
    onChange(`${before}${v} }}${after}`);
    setOpen(false);
  };

  return { open, sugestoes, handleChange, insert };
}

function VarInput({ value, variaveis, onChange, placeholder }: { value: string; variaveis: string[]; onChange: (v: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const ac = useAutocomplete(value, variaveis);
  return (
    <div className="relative">
      <Input ref={ref} value={value} placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); ac.handleChange(e.target.value, e.target.selectionStart ?? 0); }} />
      {ac.open && ac.sugestoes.length > 0 && (
        <SugestoesBox itens={ac.sugestoes} onPick={(v) => ac.insert(v, value, onChange)} />
      )}
    </div>
  );
}

function VarTextarea({ value, variaveis, onChange, placeholder }: { value: string; variaveis: string[]; onChange: (v: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const ac = useAutocomplete(value, variaveis);
  return (
    <div className="relative">
      <Textarea ref={ref} rows={3} value={value} placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); ac.handleChange(e.target.value, e.target.selectionStart ?? 0); }} />
      {ac.open && ac.sugestoes.length > 0 && (
        <SugestoesBox itens={ac.sugestoes} onPick={(v) => ac.insert(v, value, onChange)} />
      )}
    </div>
  );
}

function SugestoesBox({ itens, onPick }: { itens: string[]; onPick: (v: string) => void }) {
  return (
    <div className="absolute z-50 top-full left-0 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-48 overflow-auto">
      {itens.map((v) => (
        <button
          key={v} type="button" onMouseDown={(e) => { e.preventDefault(); onPick(v); }}
          className="block w-full text-left px-2 py-1 text-[11px] hover:bg-accent font-mono"
        >
          {v}
        </button>
      ))}
    </div>
  );
}

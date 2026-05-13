import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Upload, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/produtos")({ component: Produtos });

const CATS = ["anel","colar","brinco","pulseira","conjunto","outro"];

function Produtos() {
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [q, setQ] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data } = await supabase.from("produtos").select("*").order("criado_em", { ascending: false });
    setItems(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const filtered = items.filter((i) => i.nome.toLowerCase().includes(q.toLowerCase()));

  const remove = async (id: string) => {
    if (!confirm("Excluir produto?")) return;
    const { error } = await supabase.from("produtos").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Excluído"); load(); }
  };

  const importCSV = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    const header = lines.shift()!.split(",").map((h) => h.trim().toLowerCase());
    const rows = lines.map((l) => {
      const cols = l.split(",");
      const r: any = {};
      header.forEach((h, i) => (r[h] = cols[i]?.trim()));
      return {
        nome: r.nome,
        descricao: r.descricao || null,
        preco: Number(r.preco || 0),
        categoria: CATS.includes(r.categoria) ? r.categoria : "outro",
        quantidade_estoque: Number(r.quantidade_estoque || r.estoque || 0),
        url_foto: r.url_foto || r.foto || null,
      };
    }).filter((r) => r.nome);
    const { error } = await supabase.from("produtos").insert(rows);
    if (error) toast.error(error.message); else { toast.success(`${rows.length} produtos importados`); load(); }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Catálogo</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Produtos</h1>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => e.target.files?.[0] && importCSV(e.target.files[0])} />
          <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="size-4 mr-2" />Importar CSV</Button>
          <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="size-4 mr-2" />Novo produto</Button>
        </div>
      </header>

      <Card className="p-4">
        <Input placeholder="Buscar produto…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground border-b">
            <tr><th className="p-3">Nome</th><th className="p-3">Categoria</th><th className="p-3">Preço</th><th className="p-3">Estoque</th><th className="p-3">Status</th><th className="p-3 w-24"></th></tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-accent/30">
                <td className="p-3 font-medium">{p.nome}</td>
                <td className="p-3 capitalize">{p.categoria}</td>
                <td className="p-3">R$ {Number(p.preco).toFixed(2)}</td>
                <td className="p-3">{p.quantidade_estoque}</td>
                <td className="p-3"><Badge variant={p.status==="disponivel"?"default":p.status==="esgotado"?"destructive":"secondary"} className="capitalize">{p.status}</Badge></td>
                <td className="p-3 flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}><Pencil className="size-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(p.id)}><Trash2 className="size-4" /></Button>
                </td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={6} className="p-12 text-center text-muted-foreground">Nenhum produto.</td></tr>}
          </tbody>
        </table>
      </Card>

      <ProdutoDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={load} />
    </div>
  );
}

function ProdutoDialog({ open, onOpenChange, editing, onSaved }: any) {
  const [form, setForm] = useState<any>({ nome: "", descricao: "", preco: 0, categoria: "outro", quantidade_estoque: 0, url_foto: "", status: "disponivel" });

  useEffect(() => {
    setForm(editing ?? { nome: "", descricao: "", preco: 0, categoria: "outro", quantidade_estoque: 0, url_foto: "", status: "disponivel" });
  }, [editing, open]);

  const save = async () => {
    if (!form.nome) return toast.error("Nome obrigatório");
    const payload = { ...form, preco: Number(form.preco), quantidade_estoque: Number(form.quantidade_estoque) };
    const { error } = editing
      ? await supabase.from("produtos").update(payload).eq("id", editing.id)
      : await supabase.from("produtos").insert(payload);
    if (error) toast.error(error.message);
    else { toast.success("Salvo"); onOpenChange(false); onSaved(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome</Label><Input value={form.nome} onChange={(e)=>setForm({...form, nome:e.target.value})} /></div>
          <div><Label>Descrição</Label><Textarea value={form.descricao ?? ""} onChange={(e)=>setForm({...form, descricao:e.target.value})} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Categoria</Label>
              <Select value={form.categoria} onValueChange={(v)=>setForm({...form, categoria:v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATS.map(c=><SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Status</Label>
              <Select value={form.status} onValueChange={(v)=>setForm({...form, status:v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="disponivel">Disponível</SelectItem>
                  <SelectItem value="esgotado">Esgotado</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Preço (R$)</Label><Input type="number" step="0.01" value={form.preco} onChange={(e)=>setForm({...form, preco:e.target.value})} /></div>
            <div><Label>Estoque</Label><Input type="number" value={form.quantidade_estoque} onChange={(e)=>setForm({...form, quantidade_estoque:e.target.value})} /></div>
          </div>
          <div><Label>URL da foto</Label><Input value={form.url_foto ?? ""} onChange={(e)=>setForm({...form, url_foto:e.target.value})} /></div>
        </div>
        <DialogFooter><Button onClick={save}>Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

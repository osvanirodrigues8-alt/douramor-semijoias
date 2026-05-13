import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/cupons")({ component: Cupons });

function Cupons() {
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ codigo: "", tipo_desconto: "percentual", valor_desconto: 10, validade: "", limite_usos: null, ativo: true });

  const load = async () => {
    const { data } = await supabase.from("cupons").select("*").order("criado_em",{ascending:false});
    setItems(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.codigo) return toast.error("Código obrigatório");
    const payload = { ...form, valor_desconto: Number(form.valor_desconto), limite_usos: form.limite_usos ? Number(form.limite_usos) : null, validade: form.validade || null };
    const { error } = await supabase.from("cupons").insert(payload);
    if (error) toast.error(error.message); else { toast.success("Cupom criado"); setOpen(false); load(); }
  };
  const remove = async (id: string) => {
    if (!confirm("Excluir cupom?")) return;
    await supabase.from("cupons").delete().eq("id", id); load();
  };
  const toggle = async (c: any) => { await supabase.from("cupons").update({ ativo: !c.ativo }).eq("id", c.id); load(); };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div><p className="text-xs text-muted-foreground">Marketing</p><h1 className="text-2xl font-semibold tracking-tight mt-1">Cupons</h1></div>
        <Button onClick={()=>setOpen(true)}><Plus className="size-4 mr-2" />Novo cupom</Button>
      </header>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground border-b">
            <tr><th className="p-3">Código</th><th className="p-3">Desconto</th><th className="p-3">Validade</th><th className="p-3">Usos</th><th className="p-3">Status</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="p-3 font-mono">{c.codigo}</td>
                <td className="p-3">{c.tipo_desconto === "percentual" ? `${c.valor_desconto}%` : `R$ ${c.valor_desconto}`}</td>
                <td className="p-3">{c.validade ?? "—"}</td>
                <td className="p-3">{c.usos_realizados}{c.limite_usos ? ` / ${c.limite_usos}` : ""}</td>
                <td className="p-3"><Switch checked={c.ativo} onCheckedChange={()=>toggle(c)} /></td>
                <td className="p-3"><Button size="icon" variant="ghost" onClick={()=>remove(c.id)}><Trash2 className="size-4" /></Button></td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={6} className="p-12 text-center text-muted-foreground">Nenhum cupom.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo cupom</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Código</Label><Input value={form.codigo} onChange={(e)=>setForm({...form, codigo:e.target.value.toUpperCase()})} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Tipo</Label>
                <Select value={form.tipo_desconto} onValueChange={(v)=>setForm({...form,tipo_desconto:v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentual">Percentual</SelectItem>
                    <SelectItem value="valor_fixo">Valor fixo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Valor</Label><Input type="number" value={form.valor_desconto} onChange={(e)=>setForm({...form,valor_desconto:e.target.value})} /></div>
              <div><Label>Validade</Label><Input type="date" value={form.validade} onChange={(e)=>setForm({...form,validade:e.target.value})} /></div>
              <div><Label>Limite de usos</Label><Input type="number" value={form.limite_usos ?? ""} onChange={(e)=>setForm({...form,limite_usos:e.target.value})} /></div>
            </div>
          </div>
          <DialogFooter><Button onClick={save}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

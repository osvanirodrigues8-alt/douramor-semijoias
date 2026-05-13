import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/pedidos")({ component: Pedidos });

const STATUS = ["novo","confirmado","em_preparo","enviado","entregue","cancelado"];

function Pedidos() {
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>("todos");
  const [sel, setSel] = useState<any | null>(null);

  const load = async () => {
    const { data } = await supabase.from("pedidos").select("*, clientes(nome,contato)").order("criado_em",{ascending:false}).limit(200);
    setItems(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("pedidos").update({ status }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Status atualizado"); load(); }
  };

  const filtered = filter === "todos" ? items : items.filter((p) => p.status === filter);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div><p className="text-xs text-muted-foreground">Vendas</p><h1 className="text-2xl font-semibold tracking-tight mt-1">Pedidos</h1></div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {STATUS.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace("_"," ")}</SelectItem>)}
          </SelectContent>
        </Select>
      </header>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground border-b">
            <tr><th className="p-3">Nº</th><th className="p-3">Cliente</th><th className="p-3">Canal</th><th className="p-3">Total</th><th className="p-3">Status</th><th className="p-3">Data</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-accent/30 cursor-pointer" onClick={() => setSel(p)}>
                <td className="p-3 font-mono text-xs">#{p.numero}</td>
                <td className="p-3">{p.clientes?.nome ?? "—"}</td>
                <td className="p-3 capitalize">{p.canal}</td>
                <td className="p-3">R$ {Number(p.valor_total).toFixed(2)}</td>
                <td className="p-3"><Badge variant="secondary" className="capitalize">{p.status.replace("_"," ")}</Badge></td>
                <td className="p-3 text-muted-foreground">{new Date(p.criado_em).toLocaleString("pt-BR")}</td>
                <td className="p-3" onClick={(e)=>e.stopPropagation()}>
                  <Select value={p.status} onValueChange={(v) => updateStatus(p.id, v)}>
                    <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUS.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace("_"," ")}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={7} className="p-12 text-center text-muted-foreground">Sem pedidos.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Dialog open={!!sel} onOpenChange={(o)=>!o && setSel(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Pedido #{sel?.numero}</DialogTitle></DialogHeader>
          {sel && (
            <div className="space-y-3 text-sm">
              <Row k="Cliente" v={sel.clientes?.nome ?? "—"} />
              <Row k="Contato" v={sel.clientes?.contato ?? "—"} />
              <Row k="Canal" v={sel.canal} />
              <Row k="Forma de pagamento" v={sel.forma_pagamento ?? "—"} />
              <Row k="Parcelas" v={sel.parcelas ?? 1} />
              <Row k="Entrega" v={sel.tipo_entrega ?? "—"} />
              <Row k="Endereço" v={sel.endereco_entrega ?? "—"} />
              <Row k="Subtotal" v={`R$ ${Number(sel.valor_subtotal).toFixed(2)}`} />
              <Row k="Desconto cupom" v={`R$ ${Number(sel.desconto_cupom).toFixed(2)}`} />
              <Row k="Desconto negociação" v={`R$ ${Number(sel.desconto_negociacao).toFixed(2)}`} />
              <Row k="Total" v={`R$ ${Number(sel.valor_total).toFixed(2)}`} />
              <div>
                <p className="text-xs uppercase text-muted-foreground mb-1">Itens</p>
                <Card className="p-3 text-xs space-y-1">
                  {(sel.produtos_snapshot ?? []).map((it: any, i: number) => (
                    <div key={i} className="flex justify-between"><span>{it.nome} × {it.qtd ?? 1}</span><span>R$ {Number(it.preco ?? 0).toFixed(2)}</span></div>
                  ))}
                  {!(sel.produtos_snapshot ?? []).length && <span className="text-muted-foreground">Sem snapshot</span>}
                </Card>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ k, v }: { k: string; v: any }) {
  return <div className="flex justify-between border-b pb-1.5"><span className="text-muted-foreground">{k}</span><span className="capitalize">{String(v)}</span></div>;
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/agendamentos")({ component: Agendamentos });

const ST = ["pendente","confirmado","cancelado"];

function Agendamentos() {
  const [items, setItems] = useState<any[]>([]);
  const load = async () => {
    const { data } = await supabase.from("agendamentos").select("*, clientes(nome,contato)").order("data_hora",{ascending:true});
    setItems(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const upd = async (id: string, status: string) => {
    const { error } = await supabase.from("agendamentos").update({ status }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Atualizado"); load(); }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <header><p className="text-xs text-muted-foreground">Atendimento</p><h1 className="text-2xl font-semibold tracking-tight mt-1">Agendamentos</h1></header>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground border-b">
            <tr><th className="p-3">Data/Hora</th><th className="p-3">Cliente</th><th className="p-3">Tipo</th><th className="p-3">Canal</th><th className="p-3">Obs.</th><th className="p-3">Status</th></tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className="border-b last:border-0">
                <td className="p-3">{new Date(a.data_hora).toLocaleString("pt-BR")}</td>
                <td className="p-3">{a.clientes?.nome ?? "—"}<div className="text-xs text-muted-foreground">{a.clientes?.contato}</div></td>
                <td className="p-3 capitalize">{a.tipo}</td>
                <td className="p-3"><Badge variant="secondary" className="capitalize">{a.canal}</Badge></td>
                <td className="p-3 text-xs text-muted-foreground max-w-xs truncate">{a.observacao ?? "—"}</td>
                <td className="p-3">
                  <Select value={a.status} onValueChange={(v)=>upd(a.id, v)}>
                    <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>{ST.map((s)=><SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={6} className="p-12 text-center text-muted-foreground">Nenhum agendamento.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

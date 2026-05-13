import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/clientes")({ component: Clientes });

function Clientes() {
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    supabase.from("clientes").select("*").order("criado_em",{ascending:false}).then(({ data }) => setItems(data ?? []));
  }, []);

  const f = items.filter((i) => (i.nome ?? "").toLowerCase().includes(q.toLowerCase()) || (i.contato ?? "").includes(q));

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <header><p className="text-xs text-muted-foreground">CRM</p><h1 className="text-2xl font-semibold tracking-tight mt-1">Clientes</h1></header>
      <Card className="p-4"><Input placeholder="Buscar por nome ou contato…" value={q} onChange={(e)=>setQ(e.target.value)} className="max-w-sm" /></Card>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground border-b">
            <tr><th className="p-3">Nome</th><th className="p-3">Contato</th><th className="p-3">Canal origem</th><th className="p-3">Pedidos</th><th className="p-3">Preferências</th></tr>
          </thead>
          <tbody>
            {f.map((c) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-accent/30">
                <td className="p-3 font-medium">{c.nome ?? "—"}</td>
                <td className="p-3">{c.contato}</td>
                <td className="p-3"><Badge variant="secondary" className="capitalize">{c.canal_origem}</Badge></td>
                <td className="p-3">{c.total_pedidos}</td>
                <td className="p-3 text-muted-foreground text-xs max-w-xs truncate">{c.preferencias ?? "—"}</td>
              </tr>
            ))}
            {!f.length && <tr><td colSpan={5} className="p-12 text-center text-muted-foreground">Nenhum cliente.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

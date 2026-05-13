import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_app/dashboard")({ component: Dashboard });

function Dashboard() {
  const [stats, setStats] = useState({ pedidosHoje: 0, pendentes: 0, agendamentosHoje: 0, estoqueBaixo: 0 });

  useEffect(() => {
    (async () => {
      const today = new Date(); today.setHours(0,0,0,0);
      const [a, b, c, d] = await Promise.all([
        supabase.from("pedidos").select("id", { count: "exact", head: true }).gte("criado_em", today.toISOString()),
        supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "novo"),
        supabase.from("agendamentos").select("id", { count: "exact", head: true }).gte("data_hora", today.toISOString()),
        supabase.from("produtos").select("id", { count: "exact", head: true }).lte("quantidade_estoque", 5),
      ]);
      setStats({
        pedidosHoje: a.count ?? 0,
        pendentes: b.count ?? 0,
        agendamentosHoje: c.count ?? 0,
        estoqueBaixo: d.count ?? 0,
      });
    })();
  }, []);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Visão geral</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Dashboard</h1>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Stat label="Pedidos hoje" value={stats.pedidosHoje} />
        <Stat label="Pendentes" value={stats.pendentes} hint="Aguardando confirmação" />
        <Stat label="Agendamentos hoje" value={stats.agendamentosHoje} />
        <Stat label="Estoque baixo" value={stats.estoqueBaixo} hint="≤ 5 unidades" />
      </div>

      <Card className="p-8 text-center text-sm text-muted-foreground">
        Bem-vinda ao Douramor Semi Joias 💛 — comece cadastrando produtos e configurando o agente.
      </Card>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card className="p-5 space-y-3">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
    </Card>
  );
}

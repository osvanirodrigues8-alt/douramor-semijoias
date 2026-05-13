import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

export const Route = createFileRoute("/_app/relatorios")({ component: Relatorios });

const COLORS = ["var(--brand)","var(--brand-dark)","var(--success)","var(--warning)","var(--destructive)"];

function Relatorios() {
  const [vendas, setVendas] = useState<any[]>([]);
  const [canais, setCanais] = useState<any[]>([]);
  const [funil, setFunil] = useState<any[]>([]);
  const [topProd, setTopProd] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const since = new Date(); since.setDate(since.getDate() - 30);
      const { data: pedidos } = await supabase.from("pedidos").select("criado_em, canal, valor_total, produtos_snapshot").gte("criado_em", since.toISOString());

      const byDay: Record<string, number> = {};
      const byCanal: Record<string, number> = {};
      const byProd: Record<string, number> = {};
      (pedidos ?? []).forEach((p: any) => {
        const d = new Date(p.criado_em).toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit" });
        byDay[d] = (byDay[d] ?? 0) + Number(p.valor_total);
        byCanal[p.canal] = (byCanal[p.canal] ?? 0) + 1;
        (p.produtos_snapshot ?? []).forEach((it: any) => { byProd[it.nome ?? "?"] = (byProd[it.nome ?? "?"] ?? 0) + (it.qtd ?? 1); });
      });
      setVendas(Object.entries(byDay).map(([dia,total]) => ({ dia, total })));
      setCanais(Object.entries(byCanal).map(([name,value]) => ({ name, value })));
      setTopProd(Object.entries(byProd).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([nome, qtd]) => ({ nome, qtd })));

      const { data: f } = await supabase.from("funil_conversas").select("etapa_iniciada, converteu").gte("criado_em", since.toISOString());
      const etapas: Record<string, { iniciou: number; converteu: number }> = {};
      (f ?? []).forEach((r: any) => {
        etapas[r.etapa_iniciada] = etapas[r.etapa_iniciada] ?? { iniciou: 0, converteu: 0 };
        etapas[r.etapa_iniciada].iniciou++;
        if (r.converteu) etapas[r.etapa_iniciada].converteu++;
      });
      setFunil(Object.entries(etapas).map(([etapa, v]) => ({ etapa, ...v })));
    })();
  }, []);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <header><p className="text-xs text-muted-foreground">Insights · últimos 30 dias</p><h1 className="text-2xl font-semibold tracking-tight mt-1">Relatórios</h1></header>

      <Card className="p-5">
        <h2 className="text-sm font-medium mb-4">Vendas por dia (R$)</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={vendas}><XAxis dataKey="dia" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Bar dataKey="total" fill="var(--brand)" radius={4} /></BarChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="text-sm font-medium mb-4">Pedidos por canal</h2>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart><Pie data={canais} dataKey="value" nameKey="name" outerRadius={80} label>{canais.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}</Pie><Legend /></PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-medium mb-4">Top 5 produtos</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={topProd} layout="vertical"><XAxis type="number" fontSize={11} /><YAxis type="category" dataKey="nome" width={100} fontSize={11} /><Tooltip /><Bar dataKey="qtd" fill="var(--brand-dark)" radius={4} /></BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-medium mb-4">Funil de conversão por etapa</h2>
        <div className="space-y-3">
          {funil.map((e) => {
            const taxa = e.iniciou ? Math.round((e.converteu / e.iniciou) * 100) : 0;
            return (
              <div key={e.etapa} className="space-y-1">
                <div className="flex justify-between text-sm"><span className="capitalize font-medium">{e.etapa}</span><span className="text-muted-foreground">{e.converteu}/{e.iniciou} · {taxa}%</span></div>
                <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-brand" style={{width:`${taxa}%`}} /></div>
              </div>
            );
          })}
          {!funil.length && <p className="text-sm text-muted-foreground text-center py-6">Sem dados de funil ainda.</p>}
        </div>
      </Card>
    </div>
  );
}

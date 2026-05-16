import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

export const Route = createFileRoute("/_app/relatorios")({ component: Relatorios });

const TEMP_COLORS: Record<string, string> = {
  quente: "#ef4444",
  morno: "#f59e0b",
  frio: "#3b82f6",
  inativo: "#9ca3af",
};
const PIE_COLORS = ["var(--brand)", "var(--brand-dark)", "var(--success)", "var(--warning)", "var(--destructive)"];

type Periodo = "hoje" | "7d" | "30d";

function startOfDay(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function periodoStart(p: Periodo): Date {
  if (p === "hoje") return startOfDay();
  const d = startOfDay(); d.setDate(d.getDate() - (p === "7d" ? 7 : 30)); return d;
}

function Relatorios() {
  const [periodo, setPeriodo] = useState<Periodo>("30d");

  // KPIs
  const [convHoje, setConvHoje] = useState(0);
  const [taxaConv, setTaxaConv] = useState(0);
  const [receitaWa, setReceitaWa] = useState(0);
  const [fupsHoje, setFupsHoje] = useState(0);
  const [leadsQuentes, setLeadsQuentes] = useState(0);

  // Charts
  const [vendas, setVendas] = useState<any[]>([]);
  const [canais, setCanais] = useState<any[]>([]);
  const [porHora, setPorHora] = useState<any[]>([]);
  const [porDia, setPorDia] = useState<any[]>([]);
  const [topProdutos, setTopProdutos] = useState<any[]>([]);
  const [temperaturas, setTemperaturas] = useState<any[]>([]);

  const since = useMemo(() => periodoStart(periodo).toISOString(), [periodo]);

  useEffect(() => {
    (async () => {
      const hojeISO = startOfDay().toISOString();

      // ----- KPIs -----
      const { count: nConvHoje } = await supabase
        .from("conversas").select("id", { count: "exact", head: true })
        .gte("criado_em", hojeISO);
      setConvHoje(nConvHoje ?? 0);

      const since30 = periodoStart("30d").toISOString();
      const { data: conv30 } = await supabase
        .from("conversas").select("id, cliente_id, criado_em").gte("criado_em", since30);
      const { data: ped30 } = await supabase
        .from("pedidos").select("cliente_id, canal, valor_total, criado_em, produtos_ids").gte("criado_em", since30);

      const clientesComPedido = new Set((ped30 ?? []).map((p: any) => p.cliente_id).filter(Boolean));
      const clientesConv = new Set((conv30 ?? []).map((c: any) => c.cliente_id).filter(Boolean));
      const converteram = [...clientesConv].filter((c) => clientesComPedido.has(c)).length;
      setTaxaConv(clientesConv.size ? Math.round((converteram / clientesConv.size) * 100) : 0);

      const receita = (ped30 ?? [])
        .filter((p: any) => p.canal === "whatsapp")
        .reduce((s: number, p: any) => s + Number(p.valor_total ?? 0), 0);
      setReceitaWa(receita);

      const { count: nFups } = await supabase
        .from("conversas").select("id", { count: "exact", head: true })
        .gte("follow_up_enviado_em", hojeISO);
      setFupsHoje(nFups ?? 0);

      const { count: nQuentes } = await supabase
        .from("clientes").select("id", { count: "exact", head: true })
        .eq("temperatura_lead", "quente");
      setLeadsQuentes(nQuentes ?? 0);

      // ----- Temperatura (sempre snapshot atual) -----
      const { data: tempData } = await supabase.from("clientes").select("temperatura_lead");
      const tempMap: Record<string, number> = {};
      (tempData ?? []).forEach((c: any) => { tempMap[c.temperatura_lead ?? "morno"] = (tempMap[c.temperatura_lead ?? "morno"] ?? 0) + 1; });
      setTemperaturas(Object.entries(tempMap).map(([name, value]) => ({ name, value })));
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const { data: pedidos } = await supabase
        .from("pedidos").select("criado_em, canal, valor_total, produtos_snapshot, produtos_ids")
        .gte("criado_em", since);

      const byDay: Record<string, number> = {};
      const byCanal: Record<string, number> = {};
      (pedidos ?? []).forEach((p: any) => {
        const d = new Date(p.criado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        byDay[d] = (byDay[d] ?? 0) + Number(p.valor_total);
        byCanal[p.canal] = (byCanal[p.canal] ?? 0) + 1;
      });
      setVendas(Object.entries(byDay).map(([dia, total]) => ({ dia, total })));
      setCanais(Object.entries(byCanal).map(([name, value]) => ({ name, value })));

      // Conversas no período
      const { data: conversas } = await supabase
        .from("conversas").select("id, cliente_id, criado_em, produtos_mostrados").gte("criado_em", since);

      // Por hora e por dia da semana
      const horas: Record<number, number> = {};
      const dias: Record<number, number> = {};
      for (let i = 0; i < 24; i++) horas[i] = 0;
      for (let i = 0; i < 7; i++) dias[i] = 0;
      (conversas ?? []).forEach((c: any) => {
        const dt = new Date(c.criado_em);
        horas[dt.getHours()]++;
        dias[dt.getDay()]++;
      });
      setPorHora(Object.entries(horas).map(([h, qtd]) => ({ hora: `${h}h`, qtd })));
      const nomes = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
      setPorDia(Object.entries(dias).map(([d, qtd]) => ({ dia: nomes[Number(d)], qtd })));

      // Top produtos: apresentado vs convertido
      const apresentados: Record<string, { nome: string; apresentado: number; convertido: number }> = {};
      const conversasPorCliente: Record<string, string[]> = {};
      (conversas ?? []).forEach((c: any) => {
        const ids = Array.isArray(c.produtos_mostrados) ? c.produtos_mostrados : [];
        ids.forEach((it: any) => {
          const id = typeof it === "string" ? it : it?.id;
          const nome = typeof it === "object" ? (it?.nome ?? id) : id;
          if (!id) return;
          apresentados[id] = apresentados[id] ?? { nome, apresentado: 0, convertido: 0 };
          apresentados[id].apresentado++;
        });
        if (c.cliente_id) conversasPorCliente[c.cliente_id] = [...(conversasPorCliente[c.cliente_id] ?? []), ...ids.map((it: any) => typeof it === "string" ? it : it?.id).filter(Boolean)];
      });
      (pedidos ?? []).forEach((p: any) => {
        const mostradosCliente = conversasPorCliente[p.cliente_id] ?? [];
        (p.produtos_ids ?? []).forEach((pid: string) => {
          if (mostradosCliente.includes(pid) && apresentados[pid]) apresentados[pid].convertido++;
        });
      });
      // Resolver nomes faltantes
      const semNome = Object.entries(apresentados).filter(([_, v]) => !v.nome || v.nome === _).map(([k]) => k);
      if (semNome.length) {
        const { data: prods } = await supabase.from("produtos").select("id, nome").in("id", semNome);
        (prods ?? []).forEach((p: any) => { if (apresentados[p.id]) apresentados[p.id].nome = p.nome; });
      }
      setTopProdutos(
        Object.values(apresentados)
          .sort((a, b) => b.apresentado - a.apresentado)
          .slice(0, 10)
          .map((r) => ({ ...r, taxa: r.apresentado ? Math.round((r.convertido / r.apresentado) * 100) : 0 }))
      );
    })();
  }, [since]);

  const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-muted-foreground">Insights</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Relatórios</h1>
        </div>
        <div className="flex gap-1 bg-muted rounded-md p-1">
          {(["hoje", "7d", "30d"] as Periodo[]).map((p) => (
            <Button key={p} size="sm" variant={periodo === p ? "default" : "ghost"} onClick={() => setPeriodo(p)} className="h-7 px-3 text-xs">
              {p === "hoje" ? "Hoje" : p === "7d" ? "7 dias" : "30 dias"}
            </Button>
          ))}
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPI label="Conversas Hoje" value={String(convHoje)} />
        <KPI label="Taxa de Conversão" value={`${taxaConv}%`} hint="últimos 30 dias" />
        <KPI label="Receita via WhatsApp" value={fmtBRL(receitaWa)} hint="últimos 30 dias" />
        <KPI label="Follow-ups Enviados" value={String(fupsHoje)} hint="hoje" />
        <KPI label="Leads Quentes" value={String(leadsQuentes)} hint="ativos agora" />
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-medium mb-4">Vendas por dia (R$)</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={vendas}><XAxis dataKey="dia" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Bar dataKey="total" fill="var(--brand)" radius={4} /></BarChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="text-sm font-medium mb-4">Conversas por hora do dia</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={porHora}><XAxis dataKey="hora" fontSize={10} interval={1} /><YAxis fontSize={11} /><Tooltip /><Bar dataKey="qtd" fill="var(--brand)" radius={4} /></BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5">
          <h2 className="text-sm font-medium mb-4">Conversas por dia da semana</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={porDia}><XAxis dataKey="dia" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Bar dataKey="qtd" fill="var(--brand-dark)" radius={4} /></BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="text-sm font-medium mb-4">Pedidos por canal</h2>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart><Pie data={canais} dataKey="value" nameKey="name" outerRadius={80} label>{canais.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}</Pie><Legend /></PieChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5">
          <h2 className="text-sm font-medium mb-4">Temperatura dos leads</h2>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={temperaturas} dataKey="value" nameKey="name" outerRadius={80} label>
                {temperaturas.map((t, i) => <Cell key={i} fill={TEMP_COLORS[t.name] ?? PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-medium mb-4">Produtos: apresentados vs convertidos</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2 font-medium">Produto</th>
                <th className="text-right py-2 font-medium">Apresentado</th>
                <th className="text-right py-2 font-medium">Gerou venda</th>
                <th className="text-right py-2 font-medium">Taxa</th>
              </tr>
            </thead>
            <tbody>
              {topProdutos.map((p, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2">{p.nome}</td>
                  <td className="py-2 text-right">{p.apresentado}</td>
                  <td className="py-2 text-right">{p.convertido}</td>
                  <td className="py-2 text-right font-medium">{p.taxa}%</td>
                </tr>
              ))}
              {!topProdutos.length && (
                <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">Sem dados no período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function KPI({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tracking-tight mt-1">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">{hint}</p>}
    </Card>
  );
}

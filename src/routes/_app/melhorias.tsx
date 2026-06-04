import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Bot, CheckCircle, Clock, MessageSquare, XCircle, Star, Sparkles, Loader2, ScanSearch } from "lucide-react";

export const Route = createFileRoute("/_app/melhorias")({ component: Melhorias });

type FeedbackIA = {
  id: string;
  conversa_id: string;
  mensagem_id: string | null;
  tipo: "auto_repeticao" | "auto_abandono" | "auto_escalonamento_rapido" | "auto_negacao" | "auto_revisao_ia" | "auto_timeout" | "manual";
  severidade: "baixa" | "media" | "alta" | "critica";
  descricao: string;
  contexto_conversa: any;
  sugestao_correcao: string | null;
  status: "pendente" | "revisando" | "corrigido" | "descartado";
  nota_ia: number | null;
  criado_em: string;
  resolvido_em: string | null;
};

type AuditoriaPrompt = {
  id: string;
  feedback_id: string | null;
  tipo_mudanca: string;
  descricao: string;
  valor_antes: string | null;
  valor_depois: string | null;
  aplicado_em: string;
  revertido_em: string | null;
};

const db = supabase as any;

const SEV_LABEL: Record<string, string> = { critica: "Crítica", alta: "Alta", media: "Média", baixa: "Baixa" };
const SEV_COLOR: Record<string, string> = {
  critica: "bg-red-600 text-white",
  alta: "bg-orange-500 text-white",
  media: "bg-yellow-500 text-black",
  baixa: "bg-green-600 text-white",
};
const SEV_BORDER: Record<string, string> = {
  critica: "#dc2626",
  alta: "#f97316",
  media: "#eab308",
  baixa: "#16a34a",
};
const TIPO_LABEL: Record<string, string> = {
  auto_repeticao: "Repetição",
  auto_abandono: "Abandono",
  auto_escalonamento_rapido: "Escal. Rápido",
  auto_negacao: "Negação",
  auto_revisao_ia: "Revisão IA",
  auto_timeout: "Timeout/Áudio",
  manual: "Manual",
};

function dataRelativa(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `há ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function Melhorias() {
  const [feedbacks, setFeedbacks] = useState<FeedbackIA[]>([]);
  const [historico, setHistorico] = useState<AuditoriaPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [aplicando, setAplicando] = useState<string | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [ultimaAnalise, setUltimaAnalise] = useState<{ analisadas: number; comProblema: number; notaMedia?: string } | null>(null);

  const [filtroStatus, setFiltroStatus] = useState("pendente");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroSev, setFiltroSev] = useState("todos");
  const [filtroPeriodo, setFiltroPeriodo] = useState("7d");

  const periodoInicio = () => {
    const d = new Date();
    if (filtroPeriodo === "hoje") { d.setHours(0, 0, 0, 0); return d.toISOString(); }
    if (filtroPeriodo === "7d") d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 30);
    return d.toISOString();
  };

  const loadFeedbacks = async () => {
    setLoading(true);
    let q = db.from("feedback_ia").select("*").gte("criado_em", periodoInicio()).order("criado_em", { ascending: false }).limit(100);
    if (filtroStatus !== "todos") q = q.eq("status", filtroStatus);
    if (filtroTipo === "auto") q = q.neq("tipo", "manual");
    if (filtroTipo === "manual") q = q.eq("tipo", "manual");
    if (filtroSev !== "todos") q = q.eq("severidade", filtroSev);
    const { data } = await q;
    setFeedbacks((data ?? []) as FeedbackIA[]);
    setLoading(false);
  };

  const loadHistorico = async () => {
    const { data } = await db.from("auditoria_prompt").select("*").order("aplicado_em", { ascending: false }).limit(50);
    setHistorico((data ?? []) as AuditoriaPrompt[]);
  };

  useEffect(() => {
    loadFeedbacks();
    loadHistorico();
    const ch = supabase
      .channel("melhorias-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "feedback_ia" }, () => {
        loadFeedbacks();
        loadHistorico();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [filtroStatus, filtroTipo, filtroSev, filtroPeriodo]);

  const aplicarCorrecao = async (fb: FeedbackIA) => {
    setAplicando(fb.id);
    await db.from("feedback_ia").update({ status: "corrigido", resolvido_em: new Date().toISOString() }).eq("id", fb.id);
    await db.from("auditoria_prompt").insert({
      feedback_id: fb.id,
      tipo_mudanca: "manual",
      descricao: `Correção aplicada: ${fb.descricao.slice(0, 200)}`,
      valor_antes: null,
      valor_depois: fb.sugestao_correcao,
    });
    setAplicando(null);
    loadFeedbacks();
    loadHistorico();
  };

  const analisarAgora = async () => {
    setAnalisando(true);
    setUltimaAnalise(null);
    try {
      const res = await fetch("/api/public/trigger-auditoria", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setUltimaAnalise({ analisadas: data.analisadas ?? 0, comProblema: data.comProblema ?? 0, notaMedia: data.notaMedia });
      }
    } catch {
      // silencioso — resultados aparecem via Realtime
    }
    setAnalisando(false);
    loadFeedbacks();
  };

  const descartar = async (fb: FeedbackIA) => {
    await db.from("feedback_ia").update({ status: "descartado", resolvido_em: new Date().toISOString() }).eq("id", fb.id);
    loadFeedbacks();
  };

  const pendentes = feedbacks.filter((f) => f.status === "pendente").length;
  const corrigidos = feedbacks.filter((f) => f.status === "corrigido").length;
  const notasIA = feedbacks.filter((f) => f.nota_ia !== null).map((f) => f.nota_ia as number);
  const notaMedia = notasIA.length ? (notasIA.reduce((a, b) => a + b, 0) / notasIA.length).toFixed(1) : "—";
  const auditadas = new Set(feedbacks.filter((f) => f.tipo === "auto_revisao_ia").map((f) => f.conversa_id)).size;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-yellow-500" />
            Melhorias da IA
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Auditoria contínua da Juliana — detecte e corrija problemas com um clique
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            onClick={analisarAgora}
            disabled={analisando}
            className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
          >
            {analisando
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Analisando conversas...</>
              : <><ScanSearch className="h-4 w-4" /> Analisar conversas agora</>}
          </Button>
          {ultimaAnalise && !analisando && (
            <p className="text-xs text-muted-foreground">
              ✓ {ultimaAnalise.analisadas} analisadas
              {ultimaAnalise.notaMedia ? ` · nota média ${ultimaAnalise.notaMedia}/10` : ""}
              {ultimaAnalise.comProblema > 0
                ? ` · ${ultimaAnalise.comProblema} com problema(s)`
                : " · nenhum problema crítico"}
            </p>
          )}
          {analisando && (
            <p className="text-xs text-muted-foreground animate-pulse">
              Claude Sonnet analisando conversas das últimas 48h...
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-1"><Clock className="h-4 w-4 text-orange-500" /><span className="text-sm text-muted-foreground">Pendentes</span></div>
          <p className="text-3xl font-bold">{pendentes}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-1"><CheckCircle className="h-4 w-4 text-green-500" /><span className="text-sm text-muted-foreground">Corrigidos</span></div>
          <p className="text-3xl font-bold">{corrigidos}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-1"><Star className="h-4 w-4 text-yellow-500" /><span className="text-sm text-muted-foreground">Nota média</span></div>
          <p className="text-3xl font-bold">{notaMedia}<span className="text-sm text-muted-foreground">/10</span></p>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-1"><Bot className="h-4 w-4 text-blue-500" /><span className="text-sm text-muted-foreground">Auditadas</span></div>
          <p className="text-3xl font-bold">{auditadas}</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="feedbacks">
        <TabsList>
          <TabsTrigger value="feedbacks">Feedbacks</TabsTrigger>
          <TabsTrigger value="historico">Histórico de Correções</TabsTrigger>
        </TabsList>

        <TabsContent value="feedbacks" className="space-y-4 mt-4">
          <div className="flex flex-wrap gap-2">
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendente">Pendentes</SelectItem>
                <SelectItem value="corrigido">Corrigidos</SelectItem>
                <SelectItem value="descartado">Descartados</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos tipos</SelectItem>
                <SelectItem value="auto">Automático</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroSev} onValueChange={setFiltroSev}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Severidade</SelectItem>
                <SelectItem value="critica">Crítica</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="baixa">Baixa</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroPeriodo} onValueChange={setFiltroPeriodo}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="7d">7 dias</SelectItem>
                <SelectItem value="30d">30 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <p className="text-muted-foreground text-sm py-8 text-center">Carregando...</p>
          ) : feedbacks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Bot className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum feedback para os filtros selecionados</p>
              <p className="text-xs mt-1">A auditoria automática roda a cada hora</p>
            </div>
          ) : (
            <div className="space-y-3">
              {feedbacks.map((fb) => (
                <Card key={fb.id} className="border-l-4" style={{ borderLeftColor: SEV_BORDER[fb.severidade] }}>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">{TIPO_LABEL[fb.tipo] ?? fb.tipo}</Badge>
                        <Badge className={`text-xs ${SEV_COLOR[fb.severidade]}`}>{SEV_LABEL[fb.severidade]}</Badge>
                        {fb.nota_ia !== null && (
                          <Badge variant="outline" className="text-xs"><Star className="h-3 w-3 mr-1" />{fb.nota_ia}/10</Badge>
                        )}
                        {fb.status === "corrigido" && <Badge className="text-xs bg-green-600 text-white">Corrigido</Badge>}
                        {fb.status === "descartado" && <Badge className="text-xs bg-gray-400 text-white">Descartado</Badge>}
                      </div>
                      <span className="text-xs text-muted-foreground">{dataRelativa(fb.criado_em)}</span>
                    </div>

                    <p className="text-sm font-medium flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-orange-500 shrink-0" />
                      {fb.descricao}
                    </p>

                    {fb.contexto_conversa?.mensagens?.length > 0 && (
                      <div className="bg-muted/50 rounded p-2 space-y-1">
                        {(fb.contexto_conversa.mensagens as any[]).slice(-3).map((m: any, i: number) => (
                          <p key={i} className="text-xs">
                            <span className={`font-semibold ${m.papel === "user" ? "text-blue-600" : "text-green-600"}`}>
                              {m.papel === "user" ? "Cliente" : "Juliana"}:
                            </span>{" "}
                            {m.conteudo?.slice(0, 150)}
                          </p>
                        ))}
                      </div>
                    )}

                    {fb.sugestao_correcao && (
                      <div className="bg-blue-50 dark:bg-blue-950/30 rounded p-2">
                        <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">💡 Sugestão de correção:</p>
                        <p className="text-xs text-blue-800 dark:text-blue-300">{fb.sugestao_correcao}</p>
                      </div>
                    )}

                    {fb.status === "pendente" && (
                      <div className="flex gap-2 flex-wrap">
                        <Button size="sm" className="text-xs bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => aplicarCorrecao(fb)} disabled={aplicando === fb.id}>
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {aplicando === fb.id ? "Aplicando..." : "Aplicar correção"}
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs" onClick={() => descartar(fb)}>
                          <XCircle className="h-3 w-3 mr-1" />Descartar
                        </Button>
                        <Button size="sm" variant="ghost" className="text-xs" asChild>
                          <a href="/atendimento" target="_blank" rel="noopener noreferrer">
                            <MessageSquare className="h-3 w-3 mr-1" />Ver conversa
                          </a>
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          {historico.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhuma correção registrada ainda</p>
          ) : (
            <div className="space-y-2">
              {historico.map((h) => (
                <Card key={h.id}>
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 flex-1 min-w-0">
                        <p className="text-sm font-medium">{h.descricao}</p>
                        {h.valor_depois && (
                          <p className="text-xs text-muted-foreground bg-muted/50 rounded p-1">{h.valor_depois.slice(0, 200)}</p>
                        )}
                        <Badge variant="outline" className="text-xs">{h.tipo_mudanca}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{dataRelativa(h.aplicado_em)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

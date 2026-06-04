import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import React from "react";
import {
  Bot, MessageCircle, Send, User, Volume2, ImageIcon,
  Phone, ChevronLeft, Info, AlertTriangle, Search, Loader2
} from "lucide-react";

export const Route = createFileRoute("/_app/atendimento")({ component: AtendimentoHumano });

// ─── Tipos ───────────────────────────────────────────────────────────────────

type ClienteInfo = {
  nome: string | null;
  contato: string;
  temperatura_lead: string;
  total_pedidos: number;
  produtos_interesse: string[];
  preferencias: string | null;
  criado_em: string;
  data_ultimo_contato: string | null;
  budget_aproximado: number | null;
};

type Conversa = {
  id: string;
  sessao_token: string;
  canal: string;
  precisa_humano: boolean;
  motivo_humano: string | null;
  humano_em: string | null;
  criado_em: string;
  cliente_id: string | null;
  ultima_mensagem_em: string;
  ultima_mensagem_papel: string | null;
  contexto: Record<string, any> | null;
  cliente: ClienteInfo | null;
};

type Mensagem = {
  id: string;
  conversa_id: string;
  conteudo: string;
  papel: string;
  criado_em: string;
  midia_tipo: string | null;
  midia_url: string | null;
  midia_transcricao: string | null;
};

// ─── Utilitários ─────────────────────────────────────────────────────────────

function horaRelativa(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (h < 48) return "ontem";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function labelData(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return "Hoje";
  if (d.toDateString() === ontem.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function iniciais(nome: string | null, contato: string): string {
  if (nome) return nome.split(" ").slice(0, 2).map((p) => p[0] ?? "").join("").toUpperCase();
  return contato.slice(-2);
}

function tempConfig(temp: string) {
  if (temp === "quente") return { emoji: "🔴", label: "Quente", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" };
  if (temp === "morno") return { emoji: "🟡", label: "Morno", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" };
  if (temp === "frio") return { emoji: "🔵", label: "Frio", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" };
  return { emoji: "⚪", label: "Inativo", cls: "bg-gray-100 text-gray-500" };
}

function numero(sessao_token: string): string {
  return String(sessao_token ?? "").replace(/^wa:/, "").replace(/@.*/, "");
}

const QUICK_REPLIES = [
  "Olá! Em que posso ajudar? 😊",
  "Um momento, vou verificar para você!",
  "Muito obrigada pelo contato! 💛",
  "Pode me dar mais detalhes?",
  "Vou passar para nossa equipe 🙏",
  "Entendido! Vou resolver isso agora 🙌",
];

// ─── Componente principal ────────────────────────────────────────────────────

function AtendimentoHumano() {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [conversaAtiva, setConversaAtiva] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "aguardando" | "bot">("todos");
  const [loadingLista, setLoadingLista] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [inputTexto, setInputTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [textoNota, setTextoNota] = useState("");
  const [salvandoNota, setSalvandoNota] = useState(false);
  const [colunaMobile, setColunaMobile] = useState<"lista" | "chat" | "info">("lista");
  const scrollRef = useRef<HTMLDivElement>(null);

  const convAtiva = conversas.find((c) => c.id === conversaAtiva) ?? null;

  // ─── Carregar conversas ────────────────────────────────────────────────────

  const loadConversas = async () => {
    setLoadingLista(true);
    const { data } = await supabase
      .from("conversas")
      .select(`id, sessao_token, canal, precisa_humano, motivo_humano, humano_em,
               criado_em, cliente_id, ultima_mensagem_em, ultima_mensagem_papel, contexto,
               cliente:clientes(nome, contato, temperatura_lead, total_pedidos,
                 produtos_interesse, preferencias, criado_em, data_ultimo_contato, budget_aproximado)`)
      .in("canal", ["whatsapp", "site"])
      .order("ultima_mensagem_em", { ascending: false, nullsFirst: false });

    setConversas((data ?? []).map((c: any) => ({
      ...c,
      cliente: Array.isArray(c.cliente) ? (c.cliente[0] ?? null) : (c.cliente ?? null),
    })) as Conversa[]);
    setLoadingLista(false);
  };

  // ─── Carregar mensagens ───────────────────────────────────────────────────

  const loadMensagens = async (convId: string) => {
    setLoadingMsgs(true);
    const { data } = await supabase
      .from("mensagens")
      .select("id, conversa_id, conteudo, papel, criado_em, midia_tipo, midia_url, midia_transcricao")
      .eq("conversa_id", convId)
      .order("criado_em", { ascending: true })
      .limit(200);
    setMensagens((data ?? []) as Mensagem[]);
    setLoadingMsgs(false);
  };

  // ─── Auto-scroll ──────────────────────────────────────────────────────────

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens.length]);

  // ─── Realtime: lista de conversas ─────────────────────────────────────────

  useEffect(() => {
    loadConversas();
    const ch = supabase
      .channel("atendimento-conversas")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversas" }, (payload) => {
        if (payload.eventType === "UPDATE") {
          setConversas((prev) =>
            prev
              .map((c) => c.id === (payload.new as any).id ? { ...c, ...(payload.new as any) } : c)
              .sort((a, b) => new Date(b.ultima_mensagem_em).getTime() - new Date(a.ultima_mensagem_em).getTime())
          );
        } else {
          loadConversas();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // ─── Realtime: mensagens da conversa ativa ────────────────────────────────

  useEffect(() => {
    if (!conversaAtiva) return;
    loadMensagens(conversaAtiva);
    const conv = conversas.find((c) => c.id === conversaAtiva);
    setTextoNota((conv?.contexto as any)?.notas_humano ?? "");

    const ch = supabase
      .channel(`mensagens-${conversaAtiva}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "mensagens",
        filter: `conversa_id=eq.${conversaAtiva}`,
      }, (payload) => {
        setMensagens((prev) => {
          if (prev.some((m) => m.id === (payload.new as any).id)) return prev;
          return [...prev, payload.new as Mensagem];
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversaAtiva]);

  // ─── Toggle IA ────────────────────────────────────────────────────────────

  const toggleIA = async (conv: Conversa) => {
    setToggling(conv.id);
    const novoValor = !conv.precisa_humano;
    const update = novoValor
      ? { precisa_humano: true, motivo_humano: "Pausado manualmente", humano_em: new Date().toISOString() }
      : { precisa_humano: false, motivo_humano: null as string | null, humano_em: null as string | null };
    const { error } = await supabase.from("conversas").update(update).eq("id", conv.id);
    if (error) toast.error(error.message);
    else toast.success(novoValor ? "IA pausada — você assumiu o atendimento" : "IA reativada");
    setToggling(null);
  };

  // ─── Enviar mensagem ──────────────────────────────────────────────────────

  const handleEnviar = async (texto?: string) => {
    const msg = (texto ?? inputTexto).trim();
    if (!msg || !conversaAtiva || enviando) return;
    setEnviando(true);
    if (!texto) setInputTexto("");
    const res = await fetch("/api/public/enviar-mensagem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversa_id: conversaAtiva, texto: msg }),
    });
    if (!res.ok) toast.error("Erro ao enviar mensagem");
    setEnviando(false);
  };

  // ─── Salvar nota ──────────────────────────────────────────────────────────

  const salvarNota = async () => {
    if (!conversaAtiva) return;
    setSalvandoNota(true);
    const contextoAtual = (convAtiva?.contexto as Record<string, any>) ?? {};
    await supabase.from("conversas").update({ contexto: { ...contextoAtual, notas_humano: textoNota } }).eq("id", conversaAtiva);
    setSalvandoNota(false);
    toast.success("Nota salva");
  };

  // ─── Reportar erro ────────────────────────────────────────────────────────

  const reportarErro = (convId: string) => {
    const desc = window.prompt("Descreva o problema com esta conversa:");
    if (desc?.trim()) {
      (supabase as any).from("feedback_ia").insert({ conversa_id: convId, tipo: "manual", severidade: "media", descricao: desc.trim(), status: "pendente" })
        .then(() => toast.success("Erro reportado! Veja em Melhorias IA."));
    }
  };

  // ─── Filtros ──────────────────────────────────────────────────────────────

  const filtrados = conversas.filter((c) => {
    const matchFiltro = filtro === "aguardando" ? c.precisa_humano : filtro === "bot" ? !c.precisa_humano : true;
    const nomeOuNum = (c.cliente?.nome ?? "").toLowerCase() + (c.cliente?.contato ?? numero(c.sessao_token)).toLowerCase();
    const matchBusca = !busca || nomeOuNum.includes(busca.toLowerCase());
    return matchFiltro && matchBusca;
  });

  const totalAguardando = conversas.filter((c) => c.precisa_humano).length;

  // ─── Separadores de data ─────────────────────────────────────────────────

  function renderMensagens() {
    const items: React.ReactNode[] = [];
    let ultimaData = "";
    for (const m of mensagens) {
      const dataLabel = labelData(m.criado_em);
      if (dataLabel !== ultimaData) {
        ultimaData = dataLabel;
        items.push(
          <div key={`sep-${m.id}`} className="flex items-center justify-center my-2">
            <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-3 py-0.5">{dataLabel}</span>
          </div>
        );
      }
      const isUser = m.papel === "user";
      items.push(
        <div key={m.id} className={`flex ${isUser ? "justify-start" : "justify-end"} mb-1`}>
          <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm
            ${isUser
              ? "bg-muted text-foreground rounded-bl-sm"
              : "bg-green-600 text-white rounded-br-sm"}`}>
            {m.midia_tipo === "audio" && (
              <div className="flex items-center gap-1 mb-1 opacity-75">
                <Volume2 className="h-3 w-3" />
                <span className="text-[10px]">Áudio transcrito</span>
              </div>
            )}
            {m.midia_tipo === "image" && (
              <div className="flex items-center gap-1 mb-1 opacity-75">
                <ImageIcon className="h-3 w-3" />
                <span className="text-[10px]">Imagem</span>
              </div>
            )}
            <p className={`whitespace-pre-wrap break-words ${m.midia_tipo === "audio" ? "italic" : ""}`}>
              {m.conteudo}
            </p>
            <p className={`text-[10px] mt-0.5 text-right ${isUser ? "text-muted-foreground" : "text-green-200"}`}>
              {new Date(m.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </div>
      );
    }
    return items;
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">

      {/* ── Coluna 1: Lista ─────────────────────────────────────────────── */}
      <div className={`w-80 shrink-0 border-r flex flex-col bg-background
        ${colunaMobile !== "lista" ? "hidden md:flex" : "flex"}`}>

        {/* Header lista */}
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="font-semibold text-sm">Conversas</h1>
            {totalAguardando > 0 && (
              <Badge variant="destructive" className="text-xs">{totalAguardando} aguardando</Badge>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-7 h-8 text-xs"
            />
          </div>
          <div className="flex gap-1">
            {(["todos", "aguardando", "bot"] as const).map((f) => (
              <Button key={f} size="sm" variant={filtro === f ? "default" : "ghost"}
                className="text-xs h-6 px-2 flex-1"
                onClick={() => setFiltro(f)}>
                {f === "todos" && "Todas"}
                {f === "aguardando" && "Humano"}
                {f === "bot" && "IA"}
              </Button>
            ))}
          </div>
        </div>

        {/* Lista */}
        <ScrollArea className="flex-1">
          {loadingLista ? (
            <div className="p-4 text-center text-xs text-muted-foreground">Carregando...</div>
          ) : filtrados.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">Nenhuma conversa 💛</div>
          ) : (
            filtrados.map((c) => {
              const cli = c.cliente;
              const num = numero(c.sessao_token);
              const nome = cli?.nome ?? "Cliente";
              const temp = tempConfig(cli?.temperatura_lead ?? "inativo");
              const ativo = conversaAtiva === c.id;

              return (
                <div
                  key={c.id}
                  onClick={() => { setConversaAtiva(c.id); setColunaMobile("chat"); }}
                  className={`flex items-center gap-2 p-3 cursor-pointer border-b hover:bg-muted/50 transition-colors
                    ${ativo ? "bg-muted" : ""}`}
                >
                  {/* Avatar */}
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                    ${c.precisa_humano ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                    {iniciais(cli?.nome ?? null, num)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium truncate">{nome}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
                        {horaRelativa(c.ultima_mensagem_em)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[10px]">{temp.emoji}</span>
                      {c.precisa_humano ? (
                        <span className="text-[10px] text-orange-600 font-medium">Aguardando humano</span>
                      ) : (
                        <span className="text-[10px] text-green-600 flex items-center gap-0.5">
                          <Bot className="h-2.5 w-2.5" /> IA ativa
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </ScrollArea>
      </div>

      {/* ── Coluna 2: Chat ───────────────────────────────────────────────── */}
      <div className={`flex-1 flex flex-col min-w-0
        ${colunaMobile === "lista" || colunaMobile === "info" ? "hidden md:flex" : "flex"}`}>

        {!convAtiva ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2">
              <MessageCircle className="h-12 w-12 mx-auto opacity-20" />
              <p className="text-sm">Selecione uma conversa</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header chat */}
            <div className="border-b p-3 flex items-center gap-3 shrink-0 bg-background">
              <Button variant="ghost" size="icon" className="h-7 w-7 md:hidden"
                onClick={() => setColunaMobile("lista")}>
                <ChevronLeft className="h-4 w-4" />
              </Button>

              {/* Avatar */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                ${convAtiva.precisa_humano ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                {iniciais(convAtiva.cliente?.nome ?? null, numero(convAtiva.sessao_token))}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {convAtiva.cliente?.nome ?? "Cliente"}
                </p>
                <p className="text-xs text-muted-foreground">{numero(convAtiva.sessao_token)}</p>
              </div>

              {/* Temperatura */}
              {convAtiva.cliente && (
                <Badge className={`text-[10px] hidden sm:flex ${tempConfig(convAtiva.cliente.temperatura_lead).cls}`}>
                  {tempConfig(convAtiva.cliente.temperatura_lead).emoji} {tempConfig(convAtiva.cliente.temperatura_lead).label}
                </Badge>
              )}

              {/* Toggle IA */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground hidden sm:block">
                  {convAtiva.precisa_humano ? "IA pausada" : "IA ativa"}
                </span>
                <Switch
                  checked={!convAtiva.precisa_humano}
                  disabled={toggling === convAtiva.id}
                  onCheckedChange={() => toggleIA(convAtiva)}
                />
              </div>

              {/* WhatsApp externo */}
              <a href={`https://wa.me/${numero(convAtiva.sessao_token)}`} target="_blank" rel="noreferrer">
                <Button variant="outline" size="icon" className="h-7 w-7">
                  <Phone className="h-3.5 w-3.5" />
                </Button>
              </a>

              {/* Botão info (mobile) */}
              <Button variant="ghost" size="icon" className="h-7 w-7 lg:hidden"
                onClick={() => setColunaMobile("info")}>
                <Info className="h-4 w-4" />
              </Button>

              {/* Reportar erro */}
              <Button variant="ghost" size="icon" className="h-7 w-7 text-orange-500 hover:text-orange-700"
                title="Reportar erro da IA"
                onClick={() => reportarErro(convAtiva.id)}>
                <AlertTriangle className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Mensagens */}
            <ScrollArea className="flex-1 px-4 py-2">
              {loadingMsgs ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : mensagens.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-8">
                  Nenhuma mensagem ainda
                </p>
              ) : (
                <>
                  {renderMensagens()}
                  <div ref={scrollRef} />
                </>
              )}
            </ScrollArea>

            {/* Respostas rápidas */}
            <div className="px-3 pt-2 flex gap-1.5 flex-wrap border-t bg-background">
              {QUICK_REPLIES.map((r) => (
                <button
                  key={r}
                  onClick={() => handleEnviar(r)}
                  disabled={enviando}
                  className="text-[10px] bg-muted hover:bg-muted/80 rounded-full px-2.5 py-1 transition-colors disabled:opacity-50"
                >
                  {r}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="p-3 border-t bg-background flex gap-2 items-end shrink-0">
              {convAtiva.precisa_humano ? null : (
                <p className="text-[10px] text-muted-foreground absolute bottom-16 left-1/2 -translate-x-1/2 bg-background/90 px-2 py-0.5 rounded-full border pointer-events-none hidden">
                  Pause a IA para enviar mensagens
                </p>
              )}
              <Textarea
                placeholder={convAtiva.precisa_humano ? "Digite sua mensagem..." : "IA ativa — você pode enviar mesmo assim"}
                value={inputTexto}
                onChange={(e) => setInputTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEnviar(); }
                }}
                className="resize-none min-h-[40px] max-h-[120px] text-sm"
                rows={1}
              />
              <Button
                onClick={() => handleEnviar()}
                disabled={!inputTexto.trim() || enviando}
                className="bg-green-600 hover:bg-green-700 text-white shrink-0 h-10 w-10 p-0"
                size="icon"
              >
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </>
        )}
      </div>

      {/* ── Coluna 3: Info do cliente ────────────────────────────────────── */}
      <div className={`w-72 shrink-0 border-l flex flex-col bg-background
        ${colunaMobile !== "info" ? "hidden lg:flex" : "flex"}`}>

        {colunaMobile === "info" && (
          <div className="p-2 border-b">
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setColunaMobile("chat")}>
              <ChevronLeft className="h-3.5 w-3.5" /> Voltar ao chat
            </Button>
          </div>
        )}

        {!convAtiva ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
            Selecione uma conversa
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">

              {/* Avatar + Nome */}
              <div className="flex flex-col items-center text-center gap-2 pt-2">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold
                  ${convAtiva.precisa_humano ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                  {convAtiva.cliente
                    ? iniciais(convAtiva.cliente.nome, convAtiva.cliente.contato)
                    : <User className="h-7 w-7" />}
                </div>
                <div>
                  <p className="font-semibold text-sm">{convAtiva.cliente?.nome ?? "Cliente"}</p>
                  <a href={`https://wa.me/${numero(convAtiva.sessao_token)}`} target="_blank" rel="noreferrer"
                    className="text-xs text-blue-600 hover:underline flex items-center justify-center gap-1">
                    <Phone className="h-3 w-3" />
                    {convAtiva.cliente?.contato ?? numero(convAtiva.sessao_token)}
                  </a>
                </div>
                {convAtiva.cliente && (
                  <Badge className={`text-xs ${tempConfig(convAtiva.cliente.temperatura_lead).cls}`}>
                    {tempConfig(convAtiva.cliente.temperatura_lead).emoji} {tempConfig(convAtiva.cliente.temperatura_lead).label}
                  </Badge>
                )}
              </div>

              <hr />

              {/* Dados */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Informações</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cliente desde</span>
                    <span>{convAtiva.cliente ? new Date(convAtiva.cliente.criado_em).toLocaleDateString("pt-BR") : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Último contato</span>
                    <span>{convAtiva.cliente?.data_ultimo_contato ? horaRelativa(convAtiva.cliente.data_ultimo_contato) : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total pedidos</span>
                    <span className="font-medium">{convAtiva.cliente?.total_pedidos ?? 0}</span>
                  </div>
                  {convAtiva.cliente?.budget_aproximado ? (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Budget aprox.</span>
                      <span>R$ {convAtiva.cliente.budget_aproximado}</span>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Interesses */}
              {(convAtiva.cliente?.produtos_interesse?.length ?? 0) > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Interesses</p>
                  <div className="flex flex-wrap gap-1">
                    {convAtiva.cliente!.produtos_interesse.slice(0, 6).map((p, i) => (
                      <Badge key={i} variant="outline" className="text-[10px]">{p}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Preferências */}
              {convAtiva.cliente?.preferencias && (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Preferências (IA)</p>
                  <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">{convAtiva.cliente.preferencias}</p>
                </div>
              )}

              <hr />

              {/* Notas internas */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  📝 Notas internas
                </p>
                <p className="text-[10px] text-muted-foreground">Visível apenas para você, nunca enviado ao cliente.</p>
                <Textarea
                  value={textoNota}
                  onChange={(e) => setTextoNota(e.target.value)}
                  placeholder="Ex: cliente difícil, aguardando pagamento, prefere boleto..."
                  className="text-xs resize-none"
                  rows={4}
                />
                <Button
                  size="sm"
                  className="w-full text-xs"
                  onClick={salvarNota}
                  disabled={salvandoNota}
                >
                  {salvandoNota ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Salvar nota
                </Button>
              </div>
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { AlertCircle, Bot, MessageCircle, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_app/atendimento")({ component: AtendimentoHumano });

type Conversa = {
  id: string;
  sessao_token: string;
  canal: string;
  precisa_humano: boolean;
  motivo_humano: string | null;
  humano_em: string | null;
  criado_em: string;
  cliente_id: string | null;
  cliente?: { nome: string | null; contato: string | null } | null;
};

function AtendimentoHumano() {
  const [items, setItems] = useState<Conversa[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<"todos" | "aguardando" | "bot">("todos");
  const [toggling, setToggling] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("conversas")
      .select("id, sessao_token, canal, precisa_humano, motivo_humano, humano_em, criado_em, cliente_id")
      .in("canal", ["whatsapp", "site"])
      .order("humano_em", { ascending: false, nullsFirst: false });

    const enriched = await Promise.all(
      (data ?? []).map(async (c) => {
        if (!c.cliente_id) return { ...c, cliente: null };
        const { data: cli } = await supabase.from("clientes").select("nome, contato").eq("id", c.cliente_id).maybeSingle();
        return { ...c, cliente: cli };
      })
    );
    setItems(enriched as Conversa[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("conversas-atendimento")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversas" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const toggleIA = async (conv: Conversa) => {
    setToggling(conv.id);
    const novoValor = !conv.precisa_humano;
    const update = novoValor
      ? { precisa_humano: true, motivo_humano: "Pausado manualmente", humano_em: new Date().toISOString() }
      : { precisa_humano: false, motivo_humano: null, humano_em: null };

    const { error } = await supabase.from("conversas").update(update).eq("id", conv.id);
    if (error) toast.error(error.message);
    else toast.success(novoValor ? "IA pausada — você assumiu o atendimento" : "IA reativada para esta conversa");
    setToggling(null);
    load();
  };

  const filtrados = items.filter((c) => {
    if (filtro === "aguardando") return c.precisa_humano;
    if (filtro === "bot") return !c.precisa_humano;
    return true;
  });

  const totalAguardando = items.filter((c) => c.precisa_humano).length;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Atendimento</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1 flex items-center gap-2">
            <MessageCircle className="size-5" /> Conversas
          </h1>
        </div>
        <Button variant="ghost" size="sm" onClick={load} className="gap-2">
          <RefreshCw className="size-4" /> Atualizar
        </Button>
      </header>

      {/* Filtros */}
      <div className="flex gap-2">
        {(["todos", "aguardando", "bot"] as const).map((f) => (
          <Button key={f} size="sm" variant={filtro === f ? "default" : "outline"} onClick={() => setFiltro(f)}>
            {f === "todos" && "Todas"}
            {f === "aguardando" && <>Aguardando humano {totalAguardando > 0 && <Badge variant="destructive" className="ml-1">{totalAguardando}</Badge>}</>}
            {f === "bot" && "IA ativa"}
          </Button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-12">Carregando...</p>
      ) : filtrados.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          Nenhuma conversa aqui ainda 💛
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtrados.map((c) => {
            const numero = String(c.sessao_token ?? "").replace(/^wa:/, "").replace(/@.*/, "");
            const waLink = `https://wa.me/${numero}`;
            const iaAtiva = !c.precisa_humano;

            return (
              <Card key={c.id} className="p-5 flex items-center justify-between gap-4">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {c.precisa_humano ? (
                      <Badge variant="destructive">Aguardando humano</Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1"><Bot className="size-3" /> IA ativa</Badge>
                    )}
                    <span className="font-medium">{c.cliente?.nome ?? "Cliente"}</span>
                    <span className="text-xs text-muted-foreground">{c.cliente?.contato ?? numero}</span>
                  </div>
                  {c.motivo_humano && (
                    <p className="text-sm text-muted-foreground truncate">{c.motivo_humano}</p>
                  )}
                  {c.humano_em && (
                    <p className="text-[10px] text-muted-foreground">
                      Desde {new Date(c.humano_em).toLocaleString("pt-BR")}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {/* Toggle IA */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{iaAtiva ? "IA ligada" : "IA pausada"}</span>
                    <Switch
                      checked={iaAtiva}
                      disabled={toggling === c.id}
                      onCheckedChange={() => toggleIA(c)}
                    />
                  </div>

                  {c.canal === "whatsapp" && (
                    <a href={waLink} target="_blank" rel="noreferrer">
                      <Button variant="outline" size="sm" className="gap-2">
                        <MessageCircle className="size-4" /> WhatsApp
                      </Button>
                    </a>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs text-orange-500 hover:text-orange-700 hover:bg-orange-50"
                    onClick={() => {
                      const desc = window.prompt("Descreva o problema com esta conversa:");
                      if (desc?.trim()) {
                        supabase.from("feedback_ia").insert({
                          conversa_id: c.id,
                          tipo: "manual",
                          severidade: "media",
                          descricao: desc.trim(),
                          status: "pendente",
                        }).then(() => alert("Erro reportado! Veja em Melhorias IA."));
                      }
                    }}
                  >
                    ⚑ Reportar erro
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Legenda */}
      <p className="text-xs text-muted-foreground text-center">
        <AlertCircle className="inline size-3 mr-1" />
        Ao pausar a IA, você assume o atendimento pelo WhatsApp. Ao religar, a Juliana volta a responder automaticamente.
      </p>
    </div>
  );
}

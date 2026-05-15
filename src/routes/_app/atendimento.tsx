import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/_app/atendimento")({ component: AtendimentoHumano });

function AtendimentoHumano() {
  const [items, setItems] = useState<any[]>([]);

  const load = async () => {
    const { data } = await supabase
      .from("conversas")
      .select("id, sessao_token, motivo_humano, humano_em, cliente_id, ultima_mensagem_em")
      .eq("precisa_humano", true)
      .order("humano_em", { ascending: false });
    const enriched = await Promise.all(
      (data ?? []).map(async (c) => {
        if (!c.cliente_id) return { ...c, cliente: null };
        const { data: cli } = await supabase.from("clientes").select("nome, contato").eq("id", c.cliente_id).maybeSingle();
        return { ...c, cliente: cli };
      })
    );
    setItems(enriched);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("conversas-humano")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversas" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const resolver = async (id: string) => {
    const { error } = await supabase.from("conversas").update({ precisa_humano: false, motivo_humano: null }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Marcado como atendido"); load(); }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <header>
        <p className="text-xs text-muted-foreground">Atendimento</p>
        <h1 className="text-2xl font-semibold tracking-tight mt-1 flex items-center gap-2">
          <AlertCircle className="size-5 text-destructive" /> Clientes aguardando humano
        </h1>
      </header>

      {!items.length && (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          <CheckCircle2 className="size-8 mx-auto mb-3 text-emerald-500" />
          Nenhum cliente aguardando agora 💛
        </Card>
      )}

      <div className="grid gap-3">
        {items.map((c) => {
          const numero = String(c.sessao_token ?? "").replace(/^wa:/, "").replace(/@.*/, "");
          const waLink = `https://wa.me/${numero}`;
          return (
            <Card key={c.id} className="p-5 flex items-center justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">Aguardando</Badge>
                  <span className="font-medium">{c.cliente?.nome ?? "Cliente"}</span>
                  <span className="text-xs text-muted-foreground">{c.cliente?.contato ?? numero}</span>
                </div>
                <p className="text-sm text-muted-foreground truncate">{c.motivo_humano ?? "Solicitação de atendimento"}</p>
                <p className="text-[10px] text-muted-foreground">
                  Desde {c.humano_em ? new Date(c.humano_em).toLocaleString("pt-BR") : "—"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a href={waLink} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm" className="gap-2"><MessageCircle className="size-4" /> Abrir WhatsApp</Button>
                </a>
                <Button size="sm" onClick={() => resolver(c.id)} className="gap-2">
                  <CheckCircle2 className="size-4" /> Resolvido
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

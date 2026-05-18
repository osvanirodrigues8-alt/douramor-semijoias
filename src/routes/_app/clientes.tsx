import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

export const Route = createFileRoute("/_app/clientes")({ component: Clientes });

function HistoricoConversa({ clienteId, nome }: { clienteId: string; nome: string }) {
  const [conversas, setConversas] = useState<any[]>([]);
  const [convAtiva, setConvAtiva] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabase
      .from("conversas")
      .select("id, canal, tipo_conversa, criado_em, ultima_mensagem_em")
      .eq("cliente_id", clienteId)
      .order("ultima_mensagem_em", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setConversas(data ?? []);
        if (data?.length) setConvAtiva(data[0].id);
        setLoading(false);
      });
  }, [clienteId]);

  useEffect(() => {
    if (!convAtiva) return;
    supabase
      .from("mensagens")
      .select("papel, conteudo, criado_em")
      .eq("conversa_id", convAtiva)
      .order("criado_em", { ascending: true })
      .limit(100)
      .then(({ data }) => setMensagens(data ?? []));
  }, [convAtiva]);

  if (loading) return <p className="text-sm text-muted-foreground p-4">Carregando…</p>;
  if (!conversas.length) return <p className="text-sm text-muted-foreground p-4">Nenhuma conversa registrada.</p>;

  return (
    <div className="flex h-full gap-3">
      <div className="w-44 shrink-0 border-r pr-3 space-y-1">
        {conversas.map((c) => (
          <button
            key={c.id}
            onClick={() => setConvAtiva(c.id)}
            className={`w-full text-left rounded-md px-2 py-1.5 text-xs transition-colors ${convAtiva === c.id ? "bg-accent font-medium" : "hover:bg-accent/50"}`}
          >
            <span className="capitalize">{c.canal}</span>
            <span className="block text-muted-foreground truncate">
              {c.ultima_mensagem_em ? new Date(c.ultima_mensagem_em).toLocaleDateString("pt-BR") : "—"}
            </span>
          </button>
        ))}
      </div>
      <ScrollArea className="flex-1 h-[480px]">
        <div className="space-y-2 pr-2">
          {mensagens.map((m, i) => (
            <div key={i} className={`flex ${m.papel === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  m.papel === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-muted rounded-bl-sm"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.conteudo}</p>
                <p className={`text-[10px] mt-1 ${m.papel === "user" ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                  {new Date(m.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function Clientes() {
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [drawerCliente, setDrawerCliente] = useState<any | null>(null);

  useEffect(() => {
    supabase.from("clientes").select("*").order("criado_em", { ascending: false }).then(({ data }) => setItems(data ?? []));
  }, []);

  const f = items.filter((i) => (i.nome ?? "").toLowerCase().includes(q.toLowerCase()) || (i.contato ?? "").includes(q));

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <header>
        <p className="text-xs text-muted-foreground">CRM</p>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">Clientes</h1>
      </header>
      <Card className="p-4">
        <Input placeholder="Buscar por nome ou contato…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      </Card>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground border-b">
            <tr>
              <th className="p-3">Nome</th>
              <th className="p-3">Contato</th>
              <th className="p-3">Canal origem</th>
              <th className="p-3">Pedidos</th>
              <th className="p-3">Preferências</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {f.map((c) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-accent/30">
                <td className="p-3 font-medium">{c.nome ?? "—"}</td>
                <td className="p-3">{c.contato}</td>
                <td className="p-3">
                  <Badge variant="secondary" className="capitalize">{c.canal_origem}</Badge>
                </td>
                <td className="p-3">{c.total_pedidos}</td>
                <td className="p-3 text-muted-foreground text-xs max-w-xs truncate">{c.preferencias ?? "—"}</td>
                <td className="p-3">
                  <Button size="sm" variant="ghost" onClick={() => setDrawerCliente(c)}>
                    Histórico
                  </Button>
                </td>
              </tr>
            ))}
            {!f.length && (
              <tr>
                <td colSpan={6} className="p-12 text-center text-muted-foreground">Nenhum cliente.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Sheet open={!!drawerCliente} onOpenChange={(o) => !o && setDrawerCliente(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col">
          <SheetHeader>
            <SheetTitle>Histórico — {drawerCliente?.nome ?? drawerCliente?.contato}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 mt-4 overflow-hidden">
            {drawerCliente && (
              <HistoricoConversa clienteId={drawerCliente.id} nome={drawerCliente.nome ?? ""} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

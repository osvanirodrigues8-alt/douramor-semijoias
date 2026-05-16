import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Workflow, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/fluxos")({ component: FluxosList });

type Fluxo = {
  id: string;
  nome: string;
  descricao: string | null;
  canal: "site" | "whatsapp" | "instagram" | "todos";
  ativo: boolean;
  versao_atual: number;
  atualizado_em: string;
};

function FluxosList() {
  const [fluxos, setFluxos] = useState<Fluxo[]>([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("fluxos").select("*").order("atualizado_em", { ascending: false });
    if (error) toast.error(error.message);
    setFluxos((data ?? []) as Fluxo[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    const { data, error } = await supabase
      .from("fluxos")
      .insert({ nome: "Novo fluxo", canal: "todos" })
      .select()
      .single();
    if (error) return toast.error(error.message);
    await supabase.from("fluxos_versoes").insert({
      fluxo_id: data.id,
      versao: 1,
      dados: { nodes: [], edges: [] },
    });
    nav({ to: "/fluxos/$id", params: { id: data.id } });
  };

  const toggleAtivo = async (f: Fluxo, ativo: boolean) => {
    const { error } = await supabase.from("fluxos").update({ ativo }).eq("id", f.id);
    if (error) return toast.error(error.message);
    setFluxos((xs) => xs.map((x) => (x.id === f.id ? { ...x, ativo } : x)));
  };

  const remove = async (f: Fluxo) => {
    if (!confirm(`Excluir o fluxo "${f.nome}"?`)) return;
    const { error } = await supabase.from("fluxos").delete().eq("id", f.id);
    if (error) return toast.error(error.message);
    setFluxos((xs) => xs.filter((x) => x.id !== f.id));
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Agente</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Fluxos de conversa</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Desenhe fluxos visuais arrastando nós: mensagens, condições, IA, capturas, integrações.
            Cada canal pode usar um fluxo diferente.
          </p>
        </div>
        <Button onClick={create}><Plus className="size-4 mr-2" /> Novo fluxo</Button>
      </header>

      {loading ? (
        <Card className="p-6 text-sm text-muted-foreground">Carregando…</Card>
      ) : fluxos.length === 0 ? (
        <Card className="p-12 text-center space-y-3">
          <Workflow className="size-10 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Você ainda não tem fluxos. Crie o primeiro!</p>
          <Button onClick={create}><Plus className="size-4 mr-2" /> Criar fluxo</Button>
        </Card>
      ) : (
        <div className="grid gap-3">
          {fluxos.map((f) => (
            <Card key={f.id} className="p-4 flex items-center gap-4">
              <Workflow className="size-5 text-muted-foreground" />
              <Link to="/fluxos/$id" params={{ id: f.id }} className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate">{f.nome}</p>
                  <Badge variant="outline" className="text-[10px] capitalize">{f.canal}</Badge>
                  <Badge variant="secondary" className="text-[10px]">v{f.versao_atual}</Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">{f.descricao || "Sem descrição"}</p>
              </Link>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{f.ativo ? "Ativo" : "Rascunho"}</span>
                <Switch checked={f.ativo} onCheckedChange={(v) => toggleAtivo(f, v)} />
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(f)}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

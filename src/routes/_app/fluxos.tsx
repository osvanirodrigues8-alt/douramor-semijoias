import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, Workflow, Trash2, Sparkles, FileText } from "lucide-react";
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

type Template = {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  dados: { nodes: any[]; edges: any[] };
};

function FluxosList() {
  const [fluxos, setFluxos] = useState<Fluxo[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  const load = async () => {
    setLoading(true);
    const [{ data: fs, error }, { data: ts }] = await Promise.all([
      supabase.from("fluxos").select("*").order("atualizado_em", { ascending: false }),
      supabase.from("fluxos_templates").select("*").order("criado_em", { ascending: true }),
    ]);
    if (error) toast.error(error.message);
    setFluxos((fs ?? []) as Fluxo[]);
    setTemplates((ts ?? []) as unknown as Template[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const criar = async (nome: string, dados: { nodes: any[]; edges: any[] }) => {
    const { data, error } = await supabase
      .from("fluxos")
      .insert({ nome, canal: "todos" })
      .select()
      .single();
    if (error) return toast.error(error.message);
    await supabase.from("fluxos_versoes").insert({
      fluxo_id: data.id, versao: 1, dados: dados as any,
    });
    setOpen(false);
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
        <Button onClick={() => setOpen(true)}><Plus className="size-4 mr-2" /> Novo fluxo</Button>
      </header>

      {loading ? (
        <Card className="p-6 text-sm text-muted-foreground">Carregando…</Card>
      ) : fluxos.length === 0 ? (
        <Card className="p-12 text-center space-y-3">
          <Workflow className="size-10 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Você ainda não tem fluxos. Comece por um template!</p>
          <Button onClick={() => setOpen(true)}><Plus className="size-4 mr-2" /> Criar fluxo</Button>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Criar novo fluxo</DialogTitle>
            <DialogDescription>Comece em branco ou use um template pronto.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <button
              onClick={() => criar("Novo fluxo", { nodes: [], edges: [] })}
              className="text-left p-4 rounded-lg border hover:bg-muted/50 transition flex items-start gap-3"
            >
              <FileText className="size-5 mt-0.5 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">Em branco</p>
                <p className="text-xs text-muted-foreground">Comece do zero, arrastando os nós que precisar.</p>
              </div>
            </button>
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => criar(t.nome, t.dados)}
                className="text-left p-4 rounded-lg border hover:bg-muted/50 transition flex items-start gap-3"
              >
                <Sparkles className="size-5 mt-0.5 text-primary" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{t.nome}</p>
                    {t.categoria && <Badge variant="outline" className="text-[10px] capitalize">{t.categoria}</Badge>}
                    <Badge variant="secondary" className="text-[10px]">{t.dados?.nodes?.length ?? 0} nós</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{t.descricao}</p>
                </div>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

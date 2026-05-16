import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, FileDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FluxoCanvas, type FluxoData } from "@/components/fluxo/FluxoCanvas";
import { FluxoSimulator } from "@/components/fluxo/FluxoSimulator";

export const Route = createFileRoute("/_app/fluxos_/$id")({ component: FluxoEditor });

const emptyFluxoData = (): FluxoData => ({ nodes: [], edges: [] });

const normalizeFluxoData = (value: unknown): FluxoData => {
  const parsed = value as Partial<FluxoData> | null | undefined;
  return {
    nodes: Array.isArray(parsed?.nodes) ? parsed.nodes : [],
    edges: Array.isArray(parsed?.edges) ? parsed.edges : [],
  };
};

function FluxoEditor() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const [fluxo, setFluxo] = useState<any>(null);
  const [versao, setVersao] = useState<any>(null);
  const [initialData, setInitialData] = useState<FluxoData | null>(null);
  const [data, setData] = useState<FluxoData>({ nodes: [], edges: [] });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [execIds, setExecIds] = useState<string[]>([]);
  const [curId, setCurId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: f } = await supabase.from("fluxos").select("*").eq("id", id).maybeSingle();
    if (!f) { toast.error("Fluxo não encontrado"); nav({ to: "/fluxos" }); return; }
    setFluxo(f);
    const { data: v } = await supabase
      .from("fluxos_versoes")
      .select("*")
      .eq("fluxo_id", id)
      .eq("versao", f.versao_atual)
      .maybeSingle();
    if (v) {
      const loadedData = normalizeFluxoData(v.dados);
      setVersao(v);
      setInitialData(loadedData);
      setData(loadedData);
    } else {
      const loadedData = emptyFluxoData();
      // cria versão se não existir
      const { data: nv } = await supabase
        .from("fluxos_versoes")
        .insert({ fluxo_id: id, versao: f.versao_atual, dados: loadedData as any })
        .select()
        .single();
      setVersao(nv);
      setInitialData(loadedData);
      setData(loadedData);
    }
  }, [id, nav]);

  useEffect(() => { load(); }, [load]);

  const handleChange = useCallback((d: FluxoData) => {
    setData(d);
    setDirty(true);
  }, []);

  const save = async () => {
    if (!fluxo || !versao) return;
    setSaving(true);
    const { error: e1 } = await supabase
      .from("fluxos_versoes")
      .update({ dados: data as any })
      .eq("id", versao.id);
    const { error: e2 } = await supabase
      .from("fluxos")
      .update({ nome: fluxo.nome, descricao: fluxo.descricao, canal: fluxo.canal })
      .eq("id", fluxo.id);
    setSaving(false);
    if (e1 || e2) return toast.error((e1 ?? e2)!.message);
    setDirty(false);
    toast.success("Fluxo salvo");
  };

  const publish = async () => {
    await save();
    const { error } = await supabase
      .from("fluxos_versoes")
      .update({ publicado_em: new Date().toISOString() })
      .eq("id", versao.id);
    if (error) return toast.error(error.message);
    await supabase.from("fluxos").update({ ativo: true }).eq("id", fluxo.id);
    toast.success("Fluxo publicado e ativo");
    setFluxo({ ...fluxo, ativo: true });
  };

  if (!fluxo || !versao || !initialData) {
    return <div className="h-screen grid place-items-center"><Loader2 className="size-5 animate-spin" /></div>;
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b px-4 py-3 flex items-center gap-3 bg-background">
        <Link to="/fluxos"><Button size="icon" variant="ghost"><ArrowLeft className="size-4" /></Button></Link>
        <Input
          className="max-w-xs font-medium"
          value={fluxo.nome}
          onChange={(e) => { setFluxo({ ...fluxo, nome: e.target.value }); setDirty(true); }}
        />
        <Select value={fluxo.canal} onValueChange={(v) => { setFluxo({ ...fluxo, canal: v }); setDirty(true); }}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os canais</SelectItem>
            <SelectItem value="site">Site</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={fluxo.ativo}
            onCheckedChange={async (v) => {
              await supabase.from("fluxos").update({ ativo: v }).eq("id", fluxo.id);
              setFluxo({ ...fluxo, ativo: v });
            }}
          />
          {fluxo.ativo ? "Ativo" : "Rascunho"}
        </div>
        <div className="flex-1" />
        {dirty && <span className="text-[11px] text-amber-600">Alterações não salvas</span>}
        <Button size="sm" variant="outline" onClick={save} disabled={saving}>
          <Save className="size-4 mr-1.5" /> Salvar
        </Button>
        <Button size="sm" onClick={publish} disabled={saving}>
          <FileDown className="size-4 mr-1.5" /> Publicar
        </Button>
      </header>
      <div className="flex-1 min-h-0">
        <FluxoCanvas
          key={versao.id}
          initial={initialData}
          onChange={handleChange}
          onSimulate={() => setSimOpen(true)}
          executedIds={execIds}
          currentId={curId}
        />
      </div>
      <FluxoSimulator
        open={simOpen}
        onOpenChange={setSimOpen}
        nodes={data.nodes}
        edges={data.edges}
        onHighlight={(ids, cur) => { setExecIds(ids); setCurId(cur); }}
      />
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Play, Pause, Loader2, Megaphone, Video, Upload, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/anuncios")({ component: Anuncios });

type Campanha = {
  id: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | "ARCHIVED";
  objective: string;
  daily_budget?: string;
};

type Metricas = { impressions?: string; clicks?: string; spend?: string };

async function apiJson(acao: string, body?: object) {
  const res = await fetch("/api/public/meta-ads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acao, ...body }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function listar() {
  const res = await fetch("/api/public/meta-ads?acao=listar");
  const data = await res.json();
  return (data.data ?? []) as Campanha[];
}

async function buscarMetricas(id: string): Promise<Metricas> {
  const res = await fetch(`/api/public/meta-ads?acao=metricas&id=${id}`);
  const data = await res.json();
  return data.data?.[0] ?? {};
}

function statusBadge(s: Campanha["status"]) {
  if (s === "ACTIVE") return <Badge className="bg-green-100 text-green-700 border-green-200">Ativo</Badge>;
  if (s === "PAUSED") return <Badge variant="secondary">Pausado</Badge>;
  return <Badge variant="outline">Arquivado</Badge>;
}

// Etapas do wizard de criação de anúncio de vídeo
type Etapa = "campanha" | "video" | "texto" | "publicando" | "pronto";

function Anuncios() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [metricas, setMetricas] = useState<Record<string, Metricas>>({});
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [openWizard, setOpenWizard] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>("campanha");
  const fileRef = useRef<HTMLInputElement>(null);

  // Estado do wizard
  const [nomeCampanha, setNomeCampanha] = useState("Semi Joias Douramor — WhatsApp");
  const [orcamento, setOrcamento] = useState("20");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [legenda, setLegenda] = useState(
    "✨ Semi joias banhadas a ouro 18k com garantia de 1 ano.\nParcele em até 12x sem juros. Frete grátis para todo o Brasil!\n\nClique e fale com a gente agora 💛"
  );
  const [progresso, setProgresso] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [adSetId, setAdSetId] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const cs = await listar();
      setCampanhas(cs);
      const mx: Record<string, Metricas> = {};
      await Promise.all(cs.map(async (c) => { mx[c.id] = await buscarMetricas(c.id); }));
      setMetricas(mx);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao carregar campanhas");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleStatus = async (c: Campanha) => {
    setToggling(c.id);
    try {
      await apiJson(c.status === "ACTIVE" ? "pausar" : "ativar", { id: c.id });
      toast.success(c.status === "ACTIVE" ? "Campanha pausada" : "Campanha ativada");
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setToggling(null); }
  };

  const abrirWizard = () => {
    setEtapa("campanha");
    setNomeCampanha("Semi Joias Douramor — WhatsApp");
    setOrcamento("20");
    setVideoFile(null);
    setLegenda("✨ Semi joias banhadas a ouro 18k com garantia de 1 ano.\nParcele em até 12x sem juros. Frete grátis para todo o Brasil!\n\nClique e fale com a gente agora 💛");
    setProgresso("");
    setCampaignId("");
    setAdSetId("");
    setOpenWizard(true);
  };

  const criarCampanhaEAdSet = async () => {
    if (!nomeCampanha) return toast.error("Informe o nome da campanha");
    setEtapa("video");
    try {
      const camp = await apiJson("criar_campanha", { nome: nomeCampanha });
      setCampaignId(camp.id);
      const adset = await apiJson("criar_adset", {
        campaignId: camp.id,
        nome: `Conjunto — ${nomeCampanha}`,
        orcamento: Number(orcamento),
      });
      setAdSetId(adset.id);
    } catch (e: any) {
      toast.error(e.message);
      setEtapa("campanha");
    }
  };

  const publicarAnuncio = async () => {
    if (!videoFile) return toast.error("Selecione o vídeo");
    if (!legenda) return toast.error("Informe a legenda");
    if (!adSetId) return toast.error("Conjunto de anúncios não criado ainda");

    setEtapa("publicando");

    try {
      setProgresso("Enviando vídeo para o Meta... (pode levar até 1 minuto)");
      const form = new FormData();
      form.append("video", videoFile);
      form.append("nome", nomeCampanha);
      form.append("legenda", legenda);
      form.append("adSetId", adSetId);

      const res = await fetch("/api/public/meta-ads", { method: "POST", body: form });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setEtapa("pronto");
      await load();
    } catch (e: any) {
      toast.error(e.message);
      setEtapa("texto");
    }
  };

  const fmt = (v?: string) => v ? Number(v).toLocaleString("pt-BR") : "—";
  const fmtBRL = (v?: string) => v ? `R$ ${Number(v).toFixed(2).replace(".", ",")}` : "—";

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Marketing</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Anúncios Meta</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Campanhas Click-to-WhatsApp — os cliques vão direto para a Juliana</p>
        </div>
        <Button onClick={abrirWizard}><Plus className="size-4 mr-2" />Novo anúncio</Button>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="size-4 animate-spin" />Carregando campanhas…
        </div>
      ) : campanhas.length === 0 ? (
        <Card className="py-20 text-center text-muted-foreground">
          <Megaphone className="size-8 mx-auto mb-3 opacity-30" />
          <p>Nenhuma campanha ainda.</p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {campanhas.map((c) => {
            const m = metricas[c.id] ?? {};
            const orç = c.daily_budget ? `R$ ${(Number(c.daily_budget) / 100).toFixed(2).replace(".", ",")}` : "—";
            return (
              <Card key={c.id}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        {statusBadge(c.status)}
                        <h3 className="font-medium text-sm">{c.name}</h3>
                      </div>
                      <p className="text-xs text-muted-foreground">Orçamento diário: {orç} · ID: {c.id}</p>
                    </div>
                    <Button size="sm" variant="outline" disabled={toggling === c.id} onClick={() => toggleStatus(c)}>
                      {toggling === c.id
                        ? <Loader2 className="size-3 animate-spin mr-1" />
                        : c.status === "ACTIVE" ? <Pause className="size-3 mr-1" /> : <Play className="size-3 mr-1" />}
                      {c.status === "ACTIVE" ? "Pausar" : "Ativar"}
                    </Button>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    {[["Impressões", fmt(m.impressions)], ["Cliques", fmt(m.clicks)], ["Gasto (30d)", fmtBRL(m.spend)]].map(([l, v]) => (
                      <div key={l} className="bg-muted/40 rounded-lg p-3 text-center">
                        <p className="text-xs text-muted-foreground">{l}</p>
                        <p className="text-lg font-semibold mt-0.5">{v}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Wizard de criação */}
      <Dialog open={openWizard} onOpenChange={(v) => { if (!v && etapa !== "publicando") setOpenWizard(false); }}>
        <DialogContent className="max-w-lg">

          {/* Etapa 1 — Nome e orçamento */}
          {etapa === "campanha" && (
            <>
              <DialogHeader><DialogTitle>Novo anúncio de vídeo — Etapa 1 de 3</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nome da campanha</Label>
                  <Input value={nomeCampanha} onChange={(e) => setNomeCampanha(e.target.value)} />
                </div>
                <div>
                  <Label>Orçamento diário (R$)</Label>
                  <Input type="number" min="10" value={orcamento} onChange={(e) => setOrcamento(e.target.value)} />
                  <p className="text-xs text-muted-foreground mt-1">Público automático: mulheres 18–50 anos, Brasil, interesse em joias.</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenWizard(false)}>Cancelar</Button>
                <Button onClick={criarCampanhaEAdSet}>Próximo →</Button>
              </DialogFooter>
            </>
          )}

          {/* Etapa 2 — Vídeo */}
          {etapa === "video" && (
            <>
              <DialogHeader><DialogTitle>Novo anúncio de vídeo — Etapa 2 de 3</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div
                  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
                  />
                  {videoFile ? (
                    <div className="flex flex-col items-center gap-2">
                      <Video className="size-8 text-green-600" />
                      <p className="text-sm font-medium">{videoFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(videoFile.size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Upload className="size-8 opacity-40" />
                      <p className="text-sm">Clique para selecionar o vídeo</p>
                      <p className="text-xs">MP4, MOV ou AVI · Recomendado: vertical 9:16</p>
                    </div>
                  )}
                </div>
                {!adSetId && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <Loader2 className="size-3 animate-spin" />Criando campanha no Meta…
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEtapa("campanha")}>← Voltar</Button>
                <Button onClick={() => setEtapa("texto")} disabled={!videoFile || !adSetId}>Próximo →</Button>
              </DialogFooter>
            </>
          )}

          {/* Etapa 3 — Legenda */}
          {etapa === "texto" && (
            <>
              <DialogHeader><DialogTitle>Novo anúncio de vídeo — Etapa 3 de 3</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Legenda do anúncio</Label>
                  <Textarea rows={5} value={legenda} onChange={(e) => setLegenda(e.target.value)} />
                  <p className="text-xs text-muted-foreground mt-1">Aparece abaixo do vídeo. O botão "Enviar mensagem" abre direto na Juliana.</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3 text-xs space-y-1">
                  <p className="font-medium">Resumo do anúncio</p>
                  <p>📹 Vídeo: <span className="font-mono">{videoFile?.name}</span></p>
                  <p>💰 Orçamento: R$ {orcamento}/dia</p>
                  <p>📱 Destino: WhatsApp (31) 97206-7284</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEtapa("video")}>← Voltar</Button>
                <Button onClick={publicarAnuncio}>
                  <Upload className="size-4 mr-2" />Criar anúncio
                </Button>
              </DialogFooter>
            </>
          )}

          {/* Etapa publicando */}
          {etapa === "publicando" && (
            <>
              <DialogHeader><DialogTitle>Enviando para o Meta…</DialogTitle></DialogHeader>
              <div className="py-8 flex flex-col items-center gap-4 text-center">
                <Loader2 className="size-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">{progresso || "Processando vídeo e criando anúncio…"}</p>
                <p className="text-xs text-muted-foreground">Não feche essa janela. Pode levar até 1 minuto.</p>
              </div>
            </>
          )}

          {/* Etapa pronto */}
          {etapa === "pronto" && (
            <>
              <DialogHeader><DialogTitle>Anúncio criado!</DialogTitle></DialogHeader>
              <div className="py-8 flex flex-col items-center gap-4 text-center">
                <CheckCircle2 className="size-12 text-green-600" />
                <div>
                  <p className="font-medium">Tudo certo!</p>
                  <p className="text-sm text-muted-foreground mt-1">O anúncio foi criado como <strong>pausado</strong>. Clique em "Ativar" na lista quando quiser publicar.</p>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => setOpenWizard(false)}>Fechar</Button>
              </DialogFooter>
            </>
          )}

        </DialogContent>
      </Dialog>
    </div>
  );
}

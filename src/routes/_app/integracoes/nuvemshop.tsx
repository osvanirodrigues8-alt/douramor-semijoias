import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle2, XCircle, ExternalLink, Trash2, RefreshCw, Loader2 } from "lucide-react";
import { syncProdutosNuvemshop } from "@/lib/nuvemshop.functions";

export const Route = createFileRoute("/_app/integracoes/nuvemshop")({
  component: NuvemshopIntegracao,
});

const APP_ID = "31852";
const INSTALL_URL = `https://www.nuvemshop.com.br/apps/${APP_ID}/authorize`;

type Connection = {
  id: string;
  store_id: string;
  nome_loja: string | null;
  dominio_loja: string | null;
  scope: string | null;
  criado_em: string;
  atualizado_em: string;
  ultimo_webhook_em: string | null;
  ultimo_webhook_evento: string | null;
  ultimo_webhook_status: string | null;
};

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/nuvemshop-webhook`;

function NuvemshopIntegracao() {
  const [conn, setConn] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const syncFn = useServerFn(syncProdutosNuvemshop);

  async function handleSync() {
    setSyncing(true);
    try {
      const r = await syncFn();
      if (r.mensagem) {
        toast.warning(r.mensagem);
      } else {
        toast.success(
          `${r.total} produtos sincronizados (${r.criados} novos, ${r.atualizados} atualizados${r.erros ? `, ${r.erros} erros` : ""})`
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao sincronizar");
    } finally {
      setSyncing(false);
    }
  }

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("nuvemshop_connections")
      .select("id, store_id, nome_loja, dominio_loja, scope, criado_em, atualizado_em")
      .order("atualizado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) toast.error(error.message);
    setConn(data as Connection | null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function disconnect() {
    if (!conn) return;
    if (!confirm("Tem certeza que deseja desconectar esta loja?")) return;
    const { error } = await supabase.from("nuvemshop_connections").delete().eq("id", conn.id);
    if (error) return toast.error(error.message);
    toast.success("Loja desconectada");
    load();
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Integração Nuvemshop</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Conecte sua loja Nuvemshop para sincronizar produtos e pedidos.
        </p>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!loading && conn && (
        <Card className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="size-5 text-green-600 mt-0.5" />
            <div className="flex-1">
              <h2 className="font-medium">Loja conectada</h2>
              <p className="text-sm text-muted-foreground">
                A integração está ativa e funcionando.
              </p>
            </div>
          </div>

          <div className="grid gap-3 pt-2">
            <Field label="Nome da loja" value={conn.nome_loja ?? "—"} />
            <Field label="Store ID" value={conn.store_id} />
            <Field label="Domínio" value={conn.dominio_loja ?? "—"} />
            <Field label="Permissões (scope)" value={conn.scope ?? "—"} />
            <Field
              label="Conectada em"
              value={new Date(conn.criado_em).toLocaleString("pt-BR")}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => window.open(INSTALL_URL, "_blank")}>
              <ExternalLink className="size-4 mr-2" />
              Reinstalar
            </Button>
            <Button variant="destructive" onClick={disconnect}>
              <Trash2 className="size-4 mr-2" />
              Desconectar
            </Button>
          </div>
        </Card>
      )}

      {conn && (
        <Card className="p-6 space-y-4 mt-6">
          <div>
            <h2 className="font-medium">Sincronização de produtos</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Importa todos os produtos da Nuvemshop para o catálogo. A sincronização automática roda a cada 6 horas.
            </p>
          </div>
          <Button onClick={handleSync} disabled={syncing}>
            {syncing ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="size-4 mr-2" />
            )}
            {syncing ? "Sincronizando..." : "Sincronizar agora"}
          </Button>
        </Card>
      )}

      {!loading && !conn && (
        <Card className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <XCircle className="size-5 text-muted-foreground mt-0.5" />
            <div className="flex-1">
              <h2 className="font-medium">Nenhuma loja conectada</h2>
              <p className="text-sm text-muted-foreground">
                Instale o aplicativo Douramor Agente IA na sua loja Nuvemshop para começar.
              </p>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
            <p className="font-medium">Como conectar:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Clique no botão abaixo</li>
              <li>Faça login na sua loja Nuvemshop</li>
              <li>Autorize o aplicativo</li>
              <li>Você será redirecionado de volta com a loja conectada</li>
            </ol>
          </div>

          <Button onClick={() => window.open(INSTALL_URL, "_blank")} className="w-full">
            <ExternalLink className="size-4 mr-2" />
            Instalar aplicativo na minha loja
          </Button>

          <Button variant="ghost" size="sm" onClick={load} className="w-full">
            Já instalei, atualizar
          </Button>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} readOnly className="font-mono text-xs" />
    </div>
  );
}

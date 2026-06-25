import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/configuracoes")({ component: Configuracoes });

const MODELOS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  "claude-opus-4-8",
];

const FORMAS = ["pix", "cartao", "link"];

function Configuracoes() {
  const [cfg, setCfg] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("configuracoes").select("*").order("atualizado_em", { ascending: false }).limit(1).maybeSingle().then(async ({ data }) => {
      if (data) { setCfg(data); return; }
      // Nenhum registro — cria padrão
      const { data: created } = await supabase.from("configuracoes").insert({}).select().maybeSingle();
      setCfg(created ?? {});
    });
  }, []);

  if (!cfg) return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;

  const set = (k: string, v: any) => setCfg({ ...cfg, [k]: v });

  const save = async () => {
    setSaving(true);
    const { id, atualizado_em, ...rest } = cfg;
    // Sempre bumpar atualizado_em: o bot lê a config mais recente (order by atualizado_em).
    const payload = { ...rest, atualizado_em: new Date().toISOString() };
    const { error } = id
      ? await supabase.from("configuracoes").update(payload).eq("id", id)
      : await supabase.from("configuracoes").insert(payload);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Configurações salvas");
  };

  const toggleForma = (f: string) => {
    const arr: string[] = cfg.formas_pagamento_ativas ?? [];
    set("formas_pagamento_ativas", arr.includes(f) ? arr.filter((x) => x !== f) : [...arr, f]);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Painel</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Configurações</h1>
        </div>
        <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar alterações"}</Button>
      </header>

      <Tabs defaultValue="identidade" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="identidade">Identidade</TabsTrigger>
          <TabsTrigger value="comportamento">Comportamento</TabsTrigger>
          <TabsTrigger value="pagamento">Pagamento</TabsTrigger>
          <TabsTrigger value="atendimento">Atendimento</TabsTrigger>
          <TabsTrigger value="integracoes">Integrações</TabsTrigger>
        </TabsList>

        <TabsContent value="identidade">
          <Card className="p-6 space-y-4">
            <Field label="Nome da loja"><Input value={cfg.nome_loja ?? ""} onChange={(e) => set("nome_loja", e.target.value)} /></Field>
            <Field label="Descrição da loja"><Textarea rows={3} value={cfg.descricao_loja ?? ""} onChange={(e) => set("descricao_loja", e.target.value)} /></Field>
            <Field label="Diferenciais"><Textarea rows={3} value={cfg.diferenciais_loja ?? ""} onChange={(e) => set("diferenciais_loja", e.target.value)} /></Field>
          </Card>
        </TabsContent>

        <TabsContent value="comportamento">
          <Card className="p-6 space-y-4">
            <Field label="Nome do agente"><Input value={cfg.nome_agente ?? ""} onChange={(e) => set("nome_agente", e.target.value)} /></Field>
            <Field label="Tom padrão">
              <Select value={cfg.tom_padrao} onValueChange={(v) => set("tom_padrao", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="formal">Formal</SelectItem>
                  <SelectItem value="semiformal">Semiformal</SelectItem>
                  <SelectItem value="descontraido">Descontraído</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Mensagem de boas-vindas"><Textarea rows={3} value={cfg.mensagem_boas_vindas ?? ""} onChange={(e) => set("mensagem_boas_vindas", e.target.value)} /></Field>
            <Field label="Modelo de IA">
              <Select value={cfg.modelo_ia} onValueChange={(v) => set("modelo_ia", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODELOS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Enviar foto do catálogo"><Switch checked={cfg.enviar_foto_catalogo} onCheckedChange={(v) => set("enviar_foto_catalogo", v)} /></Field>
              <Field label="Limite desconto negociação (%)"><Input type="number" value={cfg.limite_desconto_negociacao} onChange={(e) => set("limite_desconto_negociacao", Number(e.target.value))} /></Field>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="pagamento">
          <Card className="p-6 space-y-4">
            <Field label="Formas de pagamento ativas">
              <div className="flex flex-wrap gap-3">
                {FORMAS.map((f) => (
                  <label key={f} className="flex items-center gap-2 text-sm capitalize cursor-pointer">
                    <Switch checked={(cfg.formas_pagamento_ativas ?? []).includes(f)} onCheckedChange={() => toggleForma(f)} />
                    {f}
                  </label>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Parcelamento ativo"><Switch checked={cfg.parcelamento_ativo} onCheckedChange={(v) => set("parcelamento_ativo", v)} /></Field>
              <Field label="Máx. parcelas"><Input type="number" value={cfg.max_parcelas} onChange={(e) => set("max_parcelas", Number(e.target.value))} /></Field>
              <Field label="Valor mínimo p/ parcelar (R$)"><Input type="number" value={cfg.valor_minimo_parcelamento} onChange={(e) => set("valor_minimo_parcelamento", Number(e.target.value))} /></Field>
              <Field label="Taxa de entrega (R$)"><Input type="number" value={cfg.taxa_entrega} onChange={(e) => set("taxa_entrega", Number(e.target.value))} /></Field>
            </div>
            <Field label="Área de cobertura"><Textarea rows={2} value={cfg.area_cobertura_entrega ?? ""} onChange={(e) => set("area_cobertura_entrega", e.target.value)} /></Field>
          </Card>
        </TabsContent>

        <TabsContent value="atendimento">
          <Card className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Início atendimento"><Input type="time" value={cfg.horario_atendimento_inicio?.slice(0,5) ?? ""} onChange={(e) => set("horario_atendimento_inicio", e.target.value + ":00")} /></Field>
              <Field label="Fim atendimento"><Input type="time" value={cfg.horario_atendimento_fim?.slice(0,5) ?? ""} onChange={(e) => set("horario_atendimento_fim", e.target.value + ":00")} /></Field>
            </div>
            <Field label="WhatsApp humano (transferência)"><Input value={cfg.whatsapp_humano ?? ""} placeholder="+55 11..." onChange={(e) => set("whatsapp_humano", e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Follow-up ativo"><Switch checked={cfg.follow_up_ativo} onCheckedChange={(v) => set("follow_up_ativo", v)} /></Field>
              <Field label="Disparar após (horas sem resposta)"><Input type="number" value={cfg.follow_up_horas} onChange={(e) => set("follow_up_horas", Number(e.target.value))} /></Field>
              <Field label="Máx. tentativas de follow-up"><Input type="number" min={1} value={cfg.follow_up_max_tentativas ?? 1} onChange={(e) => set("follow_up_max_tentativas", Number(e.target.value))} /></Field>
              <Field label="Intervalo entre tentativas (horas)"><Input type="number" min={1} value={cfg.follow_up_intervalo_horas ?? 24} onChange={(e) => set("follow_up_intervalo_horas", Number(e.target.value))} /></Field>
              <Field label="Respeitar horário de atendimento"><Switch checked={cfg.follow_up_respeitar_horario ?? true} onCheckedChange={(v) => set("follow_up_respeitar_horario", v)} /></Field>
            </div>
            <Field label="Mensagem de follow-up (referência de tom — a IA reescreve com base no histórico)"><Textarea rows={3} value={cfg.follow_up_mensagem ?? ""} onChange={(e) => set("follow_up_mensagem", e.target.value)} /></Field>
          </Card>
        </TabsContent>

        <TabsContent value="integracoes">
          <Card className="p-6 space-y-4">
            <p className="text-xs text-muted-foreground">Tokens são armazenados no banco com RLS — apenas administradores acessam.</p>
            <Field label="URL WhatsApp API"><Input value={cfg.url_whatsapp_api ?? ""} onChange={(e) => set("url_whatsapp_api", e.target.value)} /></Field>
            <Field label="Token WhatsApp API"><Input type="password" value={cfg.token_whatsapp_api ?? ""} onChange={(e) => set("token_whatsapp_api", e.target.value)} /></Field>
            <Field label="Token Instagram"><Input type="password" value={cfg.token_instagram ?? ""} onChange={(e) => set("token_instagram", e.target.value)} /></Field>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

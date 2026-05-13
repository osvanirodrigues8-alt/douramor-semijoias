import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Bot, User, Save } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/agente")({ component: Agente });

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const MODELOS = [
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash-lite",
  "openai/gpt-5-mini",
  "openai/gpt-5",
  "openai/gpt-5-nano",
];

function Agente() {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [token] = useState(() => "test-" + Math.random().toString(36).slice(2));
  const endRef = useRef<HTMLDivElement>(null);

  const [cfg, setCfg] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("configuracoes").select("*").limit(1).maybeSingle().then(({ data }) => setCfg(data));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const setField = (k: string, v: any) => setCfg({ ...cfg, [k]: v });

  const saveCfg = async () => {
    if (!cfg) return;
    setSaving(true);
    const { id, atualizado_em, ...rest } = cfg;
    const { data, error } = await supabase.from("configuracoes").update({ ...rest, atualizado_em: new Date().toISOString() }).eq("id", id).select();
    setSaving(false);
    if (error) return toast.error(error.message);
    if (!data || data.length === 0) return toast.error("Sem permissão para salvar. Faça login com uma conta de administrador.");
    toast.success("Informações da empresa atualizadas — a IA já está usando.");
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ sessao_token: token, canal: "site", message: text }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", content: data.reply ?? data.error ?? "(sem resposta)" }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: "Erro: " + e.message }]);
    } finally {
      setLoading(false);
    }
  };

  const embedCode = `<script src="${typeof window !== "undefined" ? window.location.origin : ""}/widget.js" data-supabase-url="${SUPABASE_URL}" data-supabase-key="${SUPABASE_KEY}"></script>`;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <header>
        <p className="text-xs text-muted-foreground">Agente</p>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">Agente IA</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Personalize as informações da empresa — a IA usa esses dados em todos os canais (site e WhatsApp).
        </p>
      </header>

      <Card className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Informações da empresa</h2>
          <Button onClick={saveCfg} disabled={saving || !cfg} size="sm">
            <Save className="size-4 mr-2" />
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>

        {!cfg ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nome da loja">
                <Input value={cfg.nome_loja ?? ""} onChange={(e) => setField("nome_loja", e.target.value)} />
              </Field>
              <Field label="Nome do agente">
                <Input value={cfg.nome_agente ?? ""} onChange={(e) => setField("nome_agente", e.target.value)} />
              </Field>
            </div>

            <Field label="Descrição da loja (o que vocês fazem, história, missão)">
              <Textarea
                rows={3}
                placeholder="Ex.: Loja de semi joias banhadas a ouro 18k, atuando há 10 anos em BH…"
                value={cfg.descricao_loja ?? ""}
                onChange={(e) => setField("descricao_loja", e.target.value)}
              />
            </Field>

            <Field label="Diferenciais (garantias, qualidade, atendimento)">
              <Textarea
                rows={3}
                placeholder="Ex.: Garantia de 1 ano contra oxidação, troca grátis em 7 dias…"
                value={cfg.diferenciais_loja ?? ""}
                onChange={(e) => setField("diferenciais_loja", e.target.value)}
              />
            </Field>

            <Field label="Mensagem de boas-vindas">
              <Textarea
                rows={2}
                value={cfg.mensagem_boas_vindas ?? ""}
                onChange={(e) => setField("mensagem_boas_vindas", e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Tom de voz">
                <Select value={cfg.tom_padrao} onValueChange={(v) => setField("tom_padrao", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="formal">Formal</SelectItem>
                    <SelectItem value="semiformal">Semiformal</SelectItem>
                    <SelectItem value="descontraido">Descontraído</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Modelo de IA">
                <Select value={cfg.modelo_ia} onValueChange={(v) => setField("modelo_ia", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODELOS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Horário de atendimento — início">
                <Input
                  type="time"
                  value={cfg.horario_atendimento_inicio?.slice(0, 5) ?? ""}
                  onChange={(e) => setField("horario_atendimento_inicio", e.target.value + ":00")}
                />
              </Field>
              <Field label="Horário de atendimento — fim">
                <Input
                  type="time"
                  value={cfg.horario_atendimento_fim?.slice(0, 5) ?? ""}
                  onChange={(e) => setField("horario_atendimento_fim", e.target.value + ":00")}
                />
              </Field>
            </div>

            <Field label="WhatsApp para atendimento humano (transferência)">
              <Input
                placeholder="+55 31 9..."
                value={cfg.whatsapp_humano ?? ""}
                onChange={(e) => setField("whatsapp_humano", e.target.value)}
              />
            </Field>
          </div>
        )}
      </Card>

      <Card className="flex flex-col h-[60vh]">
        <div className="px-5 py-3 border-b">
          <h2 className="text-sm font-medium">Testar agente</h2>
          <p className="text-xs text-muted-foreground">Envie uma mensagem para testar com as informações acima.</p>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!messages.length && <p className="text-sm text-muted-foreground text-center mt-20">Comece uma conversa…</p>}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
              {m.role !== "user" && <div className="size-8 rounded-full bg-brand/20 grid place-items-center shrink-0"><Bot className="size-4 text-brand-dark" /></div>}
              <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${m.role === "user" ? "bg-brand text-brand-foreground" : "bg-muted"}`}>
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
              {m.role === "user" && <div className="size-8 rounded-full bg-muted grid place-items-center shrink-0"><User className="size-4" /></div>}
            </div>
          ))}
          {loading && <p className="text-xs text-muted-foreground">Digitando…</p>}
          <div ref={endRef} />
        </div>
        <div className="border-t p-3 flex gap-2">
          <Input placeholder="Diga algo…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} disabled={loading} />
          <Button onClick={send} disabled={loading}><Send className="size-4" /></Button>
        </div>
      </Card>

      <Card className="p-5 space-y-2">
        <h2 className="text-sm font-medium">Embedar no seu site</h2>
        <p className="text-xs text-muted-foreground">Cole o snippet abaixo antes do fechamento da tag &lt;/body&gt;.</p>
        <pre className="text-[11px] bg-muted p-3 rounded-md overflow-x-auto">{embedCode}</pre>
      </Card>
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

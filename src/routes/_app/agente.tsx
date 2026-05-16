import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Send, Bot, User, Save, Plus, Trash2 } from "lucide-react";
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

type Faq = { id: string; pergunta: string; resposta: string; categoria: string | null; ativo: boolean; ordem: number };

function Agente() {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [token] = useState(() => "test-" + Math.random().toString(36).slice(2));
  const endRef = useRef<HTMLDivElement>(null);

  const [cfg, setCfg] = useState<any>(null);
  const [cfgAg, setCfgAg] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [faqs, setFaqs] = useState<Faq[]>([]);

  useEffect(() => {
    supabase.from("configuracoes").select("*").limit(1).maybeSingle().then(({ data }) => setCfg(data));
    supabase.from("configuracoes_agente").select("*").limit(1).maybeSingle().then(({ data }) => setCfgAg(data));
    loadFaqs();
  }, []);

  const setFieldAg = (k: string, v: any) => setCfgAg({ ...cfgAg, [k]: v });

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const loadFaqs = async () => {
    const { data } = await supabase.from("faqs").select("*").order("ordem", { ascending: true });
    setFaqs((data ?? []) as Faq[]);
  };

  const setField = (k: string, v: any) => setCfg({ ...cfg, [k]: v });

  const saveCfg = async () => {
    if (!cfg) return;
    setSaving(true);
    const { id, atualizado_em, ...rest } = cfg;
    const { data, error } = await supabase.from("configuracoes").update({ ...rest, atualizado_em: new Date().toISOString() }).eq("id", id).select();
    if (cfgAg) {
      const { id: agId, atualizado_em: _a, criado_em: _c, ...restAg } = cfgAg;
      await supabase.from("configuracoes_agente").update({ ...restAg, atualizado_em: new Date().toISOString() }).eq("id", agId);
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    if (!data || data.length === 0) return toast.error("Sem permissão para salvar.");
    toast.success("Configurações salvas — a IA já está usando.");
  };

  const addFaq = async () => {
    const { data, error } = await supabase.from("faqs").insert({ pergunta: "Nova pergunta", resposta: "Resposta…", ordem: faqs.length }).select().single();
    if (error) return toast.error(error.message);
    setFaqs([...faqs, data as Faq]);
  };
  const updateFaq = async (id: string, patch: Partial<Faq>) => {
    setFaqs(faqs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };
  const persistFaq = async (f: Faq) => {
    const { error } = await supabase.from("faqs").update({ pergunta: f.pergunta, resposta: f.resposta, categoria: f.categoria, ativo: f.ativo, ordem: f.ordem }).eq("id", f.id);
    if (error) toast.error(error.message);
    else toast.success("FAQ salvo.");
  };
  const deleteFaq = async (id: string) => {
    if (!confirm("Excluir esta pergunta?")) return;
    const { error } = await supabase.from("faqs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setFaqs(faqs.filter((f) => f.id !== id));
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
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Agente</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Agente IA</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure personalidade, regras de negócio, FAQs e fluxos automáticos. A IA usa tudo no site e no WhatsApp.
          </p>
        </div>
        <Button onClick={saveCfg} disabled={saving || !cfg} size="sm">
          <Save className="size-4 mr-2" />
          {saving ? "Salvando…" : "Salvar configurações"}
        </Button>
      </header>

      {!cfg ? (
        <Card className="p-6"><p className="text-sm text-muted-foreground">Carregando…</p></Card>
      ) : (
        <Tabs defaultValue="identidade" className="w-full">
          <TabsList className="grid grid-cols-6 w-full">
            <TabsTrigger value="identidade">Identidade</TabsTrigger>
            <TabsTrigger value="personalidade">Personalidade</TabsTrigger>
            <TabsTrigger value="regras">Regras</TabsTrigger>
            <TabsTrigger value="cupom">Cupom</TabsTrigger>
            <TabsTrigger value="faq">FAQ</TabsTrigger>
            <TabsTrigger value="fluxos">Fluxos</TabsTrigger>
          </TabsList>

          {/* IDENTIDADE */}
          <TabsContent value="identidade">
            <Card className="p-6 grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Nome da loja"><Input value={cfg.nome_loja ?? ""} onChange={(e) => setField("nome_loja", e.target.value)} /></Field>
                <Field label="Nome do agente"><Input value={cfg.nome_agente ?? ""} onChange={(e) => setField("nome_agente", e.target.value)} /></Field>
              </div>
              <Field label="Descrição da loja (história, missão, o que vende)">
                <Textarea rows={3} value={cfg.descricao_loja ?? ""} onChange={(e) => setField("descricao_loja", e.target.value)} />
              </Field>
              <Field label="Diferenciais (garantias, qualidade, atendimento)">
                <Textarea rows={3} value={cfg.diferenciais_loja ?? ""} onChange={(e) => setField("diferenciais_loja", e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Idioma"><Input value={cfg.idioma ?? ""} onChange={(e) => setField("idioma", e.target.value)} placeholder="pt-BR" /></Field>
                <Field label="Modelo de IA">
                  <Select value={cfg.modelo_ia} onValueChange={(v) => setField("modelo_ia", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MODELOS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
            </Card>
          </TabsContent>

          {/* PERSONALIDADE */}
          <TabsContent value="personalidade">
            <Card className="p-6 grid gap-4">
              <Field label="Personalidade do agente (jeito de ser, vocabulário, atitude)">
                <Textarea rows={3} placeholder="Ex.: Atenciosa, calorosa, usa expressões mineiras, chama o cliente de 'querida'…" value={cfg.personalidade ?? ""} onChange={(e) => setField("personalidade", e.target.value)} />
              </Field>
              <div className="grid grid-cols-3 gap-4">
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
                <Field label="Tamanho da resposta">
                  <Select value={cfg.tamanho_resposta} onValueChange={(v) => setField("tamanho_resposta", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="curta">Curta (1-2 frases)</SelectItem>
                      <SelectItem value="media">Média (2-4 frases)</SelectItem>
                      <SelectItem value="longa">Longa</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Uso de emojis">
                  <Select value={cfg.uso_emoji} onValueChange={(v) => setField("uso_emoji", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhum">Nenhum</SelectItem>
                      <SelectItem value="moderado">Moderado</SelectItem>
                      <SelectItem value="muito">Bastante</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Assinatura final (opcional)">
                <Input placeholder="Ex.: Vera Lucia | JoiaBot" value={cfg.assinatura ?? ""} onChange={(e) => setField("assinatura", e.target.value)} />
              </Field>
              <Field label="Palavras / expressões PROIBIDAS">
                <Textarea rows={2} placeholder="Ex.: 'mano', 'velho', gírias muito informais…" value={cfg.palavras_proibidas ?? ""} onChange={(e) => setField("palavras_proibidas", e.target.value)} />
              </Field>
              <Field label="Tópicos PROIBIDOS (não falar sobre)">
                <Textarea rows={2} placeholder="Ex.: política, religião, concorrentes…" value={cfg.topicos_proibidos ?? ""} onChange={(e) => setField("topicos_proibidos", e.target.value)} />
              </Field>
            </Card>
          </TabsContent>

          {/* REGRAS */}
          <TabsContent value="regras">
            <Card className="p-6 grid gap-4">
              <Field label="Política de desconto (quando, quanto, condições)">
                <Textarea rows={3} placeholder="Ex.: até 5% para compras à vista no Pix; 10% só com aprovação humana…" value={cfg.politica_desconto ?? ""} onChange={(e) => setField("politica_desconto", e.target.value)} />
              </Field>
              <Field label="Quando transferir para humano">
                <Textarea rows={3} placeholder="Ex.: cliente irritado, pedidos acima de R$ 1000, troca/devolução, dúvida não respondida na FAQ…" value={cfg.quando_transferir_humano ?? ""} onChange={(e) => setField("quando_transferir_humano", e.target.value)} />
              </Field>
              <Field label="WhatsApp do humano (transferência)">
                <Input placeholder="+55 31 9..." value={cfg.whatsapp_humano ?? ""} onChange={(e) => setField("whatsapp_humano", e.target.value)} />
              </Field>
              <Field label="Regras adicionais (qualquer coisa que a IA precise seguir)">
                <Textarea rows={4} placeholder="Ex.: nunca prometa entrega no mesmo dia; sempre confirme endereço antes de fechar pedido…" value={cfg.regras_extras ?? ""} onChange={(e) => setField("regras_extras", e.target.value)} />
              </Field>
            </Card>
          </TabsContent>

          {/* FAQ */}
          <TabsContent value="faq">
            <Card className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium">Base de conhecimento</h3>
                  <p className="text-xs text-muted-foreground">Cadastre perguntas e respostas que a IA pode usar (troca, entrega, garantia, prazos…).</p>
                </div>
                <Button size="sm" variant="outline" onClick={addFaq}><Plus className="size-4 mr-1" /> Adicionar</Button>
              </div>

              {faqs.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma pergunta cadastrada ainda.</p>}

              <div className="space-y-3">
                {faqs.map((f) => (
                  <div key={f.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex gap-2 items-center">
                      <Input className="flex-1" placeholder="Pergunta" value={f.pergunta} onChange={(e) => updateFaq(f.id, { pergunta: e.target.value })} />
                      <Input className="w-40" placeholder="Categoria (opcional)" value={f.categoria ?? ""} onChange={(e) => updateFaq(f.id, { categoria: e.target.value })} />
                      <div className="flex items-center gap-2">
                        <Switch checked={f.ativo} onCheckedChange={(v) => updateFaq(f.id, { ativo: v })} />
                        <span className="text-xs text-muted-foreground">Ativa</span>
                      </div>
                    </div>
                    <Textarea rows={2} placeholder="Resposta" value={f.resposta} onChange={(e) => updateFaq(f.id, { resposta: e.target.value })} />
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => deleteFaq(f.id)}><Trash2 className="size-4 text-destructive" /></Button>
                      <Button size="sm" onClick={() => persistFaq(f)}>Salvar</Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          {/* FLUXOS */}
          <TabsContent value="fluxos">
            <Card className="p-6 grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Saudação inicial — site">
                  <Textarea rows={2} value={cfg.saudacao_site ?? ""} onChange={(e) => setField("saudacao_site", e.target.value)} placeholder="Olá! Bem-vinda ao site 💛" />
                </Field>
                <Field label="Saudação inicial — WhatsApp">
                  <Textarea rows={2} value={cfg.saudacao_whatsapp ?? ""} onChange={(e) => setField("saudacao_whatsapp", e.target.value)} placeholder="Oi! Vi que você chamou aqui no Whats…" />
                </Field>
              </div>
              <Field label="Mensagem de boas-vindas geral (legado)">
                <Textarea rows={2} value={cfg.mensagem_boas_vindas ?? ""} onChange={(e) => setField("mensagem_boas_vindas", e.target.value)} />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Horário — início">
                  <Input type="time" value={cfg.horario_atendimento_inicio?.slice(0, 5) ?? ""} onChange={(e) => setField("horario_atendimento_inicio", e.target.value + ":00")} />
                </Field>
                <Field label="Horário — fim">
                  <Input type="time" value={cfg.horario_atendimento_fim?.slice(0, 5) ?? ""} onChange={(e) => setField("horario_atendimento_fim", e.target.value + ":00")} />
                </Field>
              </div>

              <div className="flex items-center gap-3">
                <Switch checked={cfg.responder_fora_horario} onCheckedChange={(v) => setField("responder_fora_horario", v)} />
                <span className="text-sm">Responder automaticamente fora do horário</span>
              </div>
              <Field label="Mensagem fora do horário">
                <Textarea rows={2} placeholder="Ex.: Olá! Nosso atendimento humano é das 9h às 18h. Posso adiantar algo por aqui?" value={cfg.mensagem_fora_horario ?? ""} onChange={(e) => setField("mensagem_fora_horario", e.target.value)} />
              </Field>

              <div className="border-t pt-4 space-y-3">
                <h4 className="text-sm font-medium">Follow-up (carrinho abandonado)</h4>
                <div className="flex items-center gap-3">
                  <Switch checked={cfg.follow_up_ativo} onCheckedChange={(v) => setField("follow_up_ativo", v)} />
                  <span className="text-sm">Ativar follow-up</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Disparar após (horas)">
                    <Input type="number" value={cfg.follow_up_horas ?? 24} onChange={(e) => setField("follow_up_horas", Number(e.target.value))} />
                  </Field>
                </div>
                <Field label="Mensagem de follow-up">
                  <Textarea rows={2} value={cfg.follow_up_mensagem ?? ""} onChange={(e) => setField("follow_up_mensagem", e.target.value)} />
                </Field>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <Card className="flex flex-col h-[60vh]">
        <div className="px-5 py-3 border-b">
          <h2 className="text-sm font-medium">Testar agente</h2>
          <p className="text-xs text-muted-foreground">Salve as configurações antes de testar.</p>
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

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Bot, User } from "lucide-react";
import ReactMarkdown from "react-markdown";

export const Route = createFileRoute("/_app/agente")({ component: Agente });

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function Agente() {
  const [messages, setMessages] = useState<{role:string;content:string}[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [token] = useState(() => "test-" + Math.random().toString(36).slice(2));
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput(""); setLoading(true);
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
    } finally { setLoading(false); }
  };

  const embedCode = `<script src="${typeof window!=="undefined"?window.location.origin:""}/widget.js" data-supabase-url="${SUPABASE_URL}" data-supabase-key="${SUPABASE_KEY}"></script>`;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <header><p className="text-xs text-muted-foreground">Agente</p><h1 className="text-2xl font-semibold tracking-tight mt-1">Teste do Agente IA</h1></header>

      <Card className="flex flex-col h-[60vh]">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!messages.length && <p className="text-sm text-muted-foreground text-center mt-20">Envie uma mensagem para testar o agente com sua configuração e catálogo atuais.</p>}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role==="user"?"justify-end":""}`}>
              {m.role!=="user" && <div className="size-8 rounded-full bg-brand/20 grid place-items-center shrink-0"><Bot className="size-4 text-brand-dark" /></div>}
              <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${m.role==="user"?"bg-brand text-brand-foreground":"bg-muted"}`}>
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
              {m.role==="user" && <div className="size-8 rounded-full bg-muted grid place-items-center shrink-0"><User className="size-4" /></div>}
            </div>
          ))}
          {loading && <p className="text-xs text-muted-foreground">Digitando…</p>}
          <div ref={endRef} />
        </div>
        <div className="border-t p-3 flex gap-2">
          <Input placeholder="Diga algo…" value={input} onChange={(e)=>setInput(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&send()} disabled={loading} />
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

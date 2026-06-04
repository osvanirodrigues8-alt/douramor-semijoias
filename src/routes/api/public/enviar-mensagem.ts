// Proxy seguro para envio de mensagem manual pelo painel de Atendimento
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const STEVO_URL = "https://smv2-4.stevo.chat/send/text";

async function handleEnviar(request: Request): Promise<Response> {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  let body: { conversa_id?: string; texto?: string };
  try { body = await request.json(); } catch { return new Response("Bad JSON", { status: 400, headers: cors }); }

  const { conversa_id, texto } = body ?? {};
  if (!conversa_id || !texto?.trim()) {
    return new Response(JSON.stringify({ error: "conversa_id e texto são obrigatórios" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  // Buscar conversa
  const { data: conv, error: errConv } = await supabaseAdmin
    .from("conversas")
    .select("id, sessao_token, canal")
    .eq("id", conversa_id)
    .maybeSingle();

  if (errConv || !conv) {
    return new Response(JSON.stringify({ error: "Conversa não encontrada" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
  }

  // Extrair número
  const numero = String(conv.sessao_token ?? "").replace(/^wa:/, "").replace(/@.*/, "").replace(/\D/g, "");
  if (!numero || conv.canal !== "whatsapp") {
    return new Response(JSON.stringify({ error: "Conversa não é WhatsApp ou número inválido" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  // Enviar via Stevo
  const stevoKey = process.env.STEVO_API_KEY ?? "";
  if (!stevoKey) {
    return new Response(JSON.stringify({ error: "STEVO_API_KEY não configurada" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const stevoResp = await fetch(STEVO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: stevoKey },
    body: JSON.stringify({ number: numero, text: texto.trim() }),
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);

  if (!stevoResp?.ok) {
    console.error("[enviar-mensagem] Stevo error", stevoResp?.status);
    return new Response(JSON.stringify({ error: "Falha ao enviar pelo WhatsApp" }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const agora = new Date().toISOString();

  // Salvar mensagem no banco
  const { data: msg } = await supabaseAdmin
    .from("mensagens")
    .insert({ conversa_id, conteudo: texto.trim(), papel: "assistant", criado_em: agora })
    .select("id")
    .maybeSingle();

  // Atualizar ultima_mensagem_em na conversa
  await supabaseAdmin
    .from("conversas")
    .update({ ultima_mensagem_em: agora, ultima_mensagem_papel: "assistant" })
    .eq("id", conversa_id);

  return new Response(JSON.stringify({ ok: true, mensagem_id: msg?.id }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/enviar-mensagem")({
  // @ts-ignore
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => handleEnviar(request),
      OPTIONS: async ({ request }: { request: Request }) => handleEnviar(request),
    },
  },
});

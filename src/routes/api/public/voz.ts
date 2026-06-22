// Endpoint que gera e serve a nota de voz da Juliana (ElevenLabs) on-demand.
// O webhook manda a URL deste endpoint para o Stevo (/send/media type audio); quando o Stevo
// busca a URL, geramos o áudio na hora a partir do texto da mensagem assistente salva no banco.
// Não armazena nada. Protegido por token HMAC (id da mensagem assinado) para evitar abuso/custo.
import { createFileRoute } from "@tanstack/react-router";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { gerarAudioElevenLabsBytes } from "@/lib/shared/prompt";

async function handleVoz(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const token = url.searchParams.get("t") ?? "";
  if (!id || !token) return new Response("missing params", { status: 400 });

  // Valida o token HMAC (mesmo segredo do webhook). Segredo nunca aparece na URL.
  const sec = process.env.WHATSAPP_WEBHOOK_SECRET || process.env.STEVO_API_KEY || "";
  const esperado = crypto.createHmac("sha256", sec).update(id).digest("hex").slice(0, 24);
  if (token !== esperado) return new Response("forbidden", { status: 403 });

  const { data: msg } = await supabaseAdmin
    .from("mensagens")
    .select("conteudo, papel")
    .eq("id", id)
    .maybeSingle();
  if (!msg || msg.papel !== "assistant") return new Response("not found", { status: 404 });

  const audio = await gerarAudioElevenLabsBytes(String(msg.conteudo ?? ""));
  if (!audio) return new Response("tts unavailable", { status: 502 });

  return new Response(audio.buffer as any, {
    status: 200,
    headers: {
      "Content-Type": audio.mime,
      "Content-Length": String(audio.buffer.length),
      "Cache-Control": "public, max-age=86400",
    },
  });
}

export const Route = createFileRoute("/api/public/voz")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => handleVoz(request),
      POST: async ({ request }: { request: Request }) => handleVoz(request),
    },
  },
});

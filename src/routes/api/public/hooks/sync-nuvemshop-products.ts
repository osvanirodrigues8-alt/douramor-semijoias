import { createFileRoute } from "@tanstack/react-router";
import { syncNuvemshopProducts } from "@/lib/nuvemshop-sync.server";

function isAuthorized(request: Request): boolean {
  // 1. Vercel cron: envia Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth === `Bearer ${cronSecret}`) return true;
  }
  // 2. Chamada manual via painel: envia apikey no header
  const apiKey = request.headers.get("apikey");
  const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (expected && apiKey === expected) return true;
  // 3. Se não há CRON_SECRET configurado, permite (ambiente de dev / cron sem secret)
  if (!cronSecret && !expected) return true;
  return false;
}

async function handleSync(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const result = await syncNuvemshopProducts();
    console.log("[sync-produtos]", result);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("sync-nuvemshop-products error:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/public/hooks/sync-nuvemshop-products")({
  server: {
    handlers: {
      GET: async ({ request }) => handleSync(request),
      POST: async ({ request }) => handleSync(request),
    },
  },
});

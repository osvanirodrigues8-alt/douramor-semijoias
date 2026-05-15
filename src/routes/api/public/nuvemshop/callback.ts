import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function html(title: string, body: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#faf8f5;color:#1a1a1a;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px}
.card{background:#fff;border:1px solid #e8e4dd;border-radius:12px;padding:32px;max-width:480px;width:100%;box-shadow:0 4px 12px rgba(0,0,0,.04)}
h1{margin:0 0 12px;font-size:20px}
p{margin:0 0 8px;color:#555;font-size:14px;line-height:1.5}
a{color:#c9a84c;text-decoration:none;font-weight:500}
.ok{color:#0d7a5f}.err{color:#c44569}
</style></head><body><div class="card">${body}</div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export const Route = createFileRoute("/api/public/nuvemshop/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");

        if (!code) {
          return html(
            "Erro",
            `<h1 class="err">❌ Código ausente</h1><p>A Nuvemshop não enviou o parâmetro <code>code</code>.</p>`,
            400
          );
        }

        const clientId = process.env.NUVEMSHOP_CLIENT_ID;
        const clientSecret = process.env.NUVEMSHOP_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          return html(
            "Erro de configuração",
            `<h1 class="err">❌ Credenciais ausentes</h1><p>NUVEMSHOP_CLIENT_ID ou NUVEMSHOP_CLIENT_SECRET não configurados.</p>`,
            500
          );
        }

        try {
          // Troca code pelo access_token
          const tokenRes = await fetch("https://www.tiendanube.com/apps/authorize/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client_id: clientId,
              client_secret: clientSecret,
              grant_type: "authorization_code",
              code,
            }),
          });

          const tokenData = await tokenRes.json();
          if (!tokenRes.ok || !tokenData.access_token) {
            console.error("Nuvemshop token exchange failed:", tokenRes.status, tokenData);
            return html(
              "Erro",
              `<h1 class="err">❌ Falha ao obter token</h1><p>${escapeHtml(JSON.stringify(tokenData))}</p>`,
              502
            );
          }

          const storeId = String(tokenData.user_id);
          const accessToken = tokenData.access_token as string;
          const scope = (tokenData.scope as string) ?? null;

          // Busca informações da loja
          let nomeLoja: string | null = null;
          let dominioLoja: string | null = null;
          try {
            const storeRes = await fetch(`https://api.tiendanube.com/v1/${storeId}/store`, {
              headers: {
                Authentication: `bearer ${accessToken}`,
                "User-Agent": "Douramor Agente IA (contato@douramor.com.br)",
              },
            });
            if (storeRes.ok) {
              const storeData = await storeRes.json();
              nomeLoja =
                typeof storeData.name === "string"
                  ? storeData.name
                  : storeData.name?.pt ?? storeData.name?.es ?? null;
              dominioLoja = storeData.url ?? storeData.original_domain ?? null;
            }
          } catch (e) {
            console.warn("Falha ao buscar info da loja:", e);
          }

          // Salva (upsert por store_id)
          const { error: dbError } = await supabaseAdmin
            .from("nuvemshop_connections")
            .upsert(
              {
                store_id: storeId,
                access_token: accessToken,
                scope,
                nome_loja: nomeLoja,
                dominio_loja: dominioLoja,
                atualizado_em: new Date().toISOString(),
              },
              { onConflict: "store_id" }
            );

          if (dbError) {
            console.error("DB error:", dbError);
            return html(
              "Erro",
              `<h1 class="err">❌ Erro ao salvar conexão</h1><p>${escapeHtml(dbError.message)}</p>`,
              500
            );
          }

          return html(
            "Loja conectada",
            `<h1 class="ok">✅ Loja conectada com sucesso!</h1>
<p><strong>${escapeHtml(nomeLoja ?? "Loja")}</strong></p>
<p>Store ID: <code>${escapeHtml(storeId)}</code></p>
${dominioLoja ? `<p>Domínio: ${escapeHtml(dominioLoja)}</p>` : ""}
<p style="margin-top:20px"><a href="https://douramor-semijoias.lovable.app/integracoes/nuvemshop">Voltar ao painel →</a></p>`
          );
        } catch (e) {
          console.error("Callback error:", e);
          return html(
            "Erro",
            `<h1 class="err">❌ Erro inesperado</h1><p>${escapeHtml(e instanceof Error ? e.message : String(e))}</p>`,
            500
          );
        }
      },
    },
  },
});

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

import { createFileRoute } from "@tanstack/react-router";
import {
  criarCampanhaWhatsApp,
  criarAdSetWhatsApp,
  criarAnuncioClickWhatsApp,
  criarAnuncioVideoWhatsApp,
  uploadVideoMeta,
  aguardarVideoProcessado,
  listarCampanhas,
  ativarCampanha,
  pausarCampanha,
  buscarMetricasCampanha,
} from "../../../lib/meta-ads";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function handleGet(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const acao = url.searchParams.get("acao");
    const id = url.searchParams.get("id");

    if (acao === "listar") return json(await listarCampanhas());
    if (acao === "metricas" && id) return json(await buscarMetricasCampanha(id));
    return json({ error: "Ação não reconhecida" }, 400);
  } catch (e) {
    console.error("[meta-ads GET]", e);
    return json({ error: (e as Error).message }, 500);
  }
}

async function handlePost(request: Request): Promise<Response> {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    // Upload de vídeo — multipart
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("video") as File | null;
      const nome = (form.get("nome") as string) ?? "Anuncio Douramor";
      const legenda = (form.get("legenda") as string) ?? "";
      const adSetId = (form.get("adSetId") as string) ?? "";

      if (!file) return json({ error: "Arquivo de vídeo obrigatório" }, 400);
      if (!adSetId) return json({ error: "adSetId obrigatório" }, 400);

      const buffer = await file.arrayBuffer();
      const videoId = await uploadVideoMeta(buffer, file.name);
      await aguardarVideoProcessado(videoId);
      const anuncio = await criarAnuncioVideoWhatsApp(adSetId, nome, videoId, legenda);
      return json({ ok: true, videoId, anuncio });
    }

    const body = await request.json() as {
      acao: string;
      nome?: string;
      campaignId?: string;
      adSetId?: string;
      imagemUrl?: string;
      legenda?: string;
      orcamento?: number;
      id?: string;
    };

    switch (body.acao) {
      case "criar_campanha":
        return json(await criarCampanhaWhatsApp(body.nome ?? "Campanha Douramor"));

      case "criar_adset": {
        if (!body.campaignId) return json({ error: "campaignId obrigatório" }, 400);
        return json(await criarAdSetWhatsApp(
          body.campaignId,
          body.nome ?? "Conjunto Douramor",
          (body.orcamento ?? 20) * 100
        ));
      }

      case "criar_anuncio": {
        if (!body.adSetId || !body.imagemUrl || !body.legenda)
          return json({ error: "adSetId, imagemUrl e legenda são obrigatórios" }, 400);
        return json(await criarAnuncioClickWhatsApp(
          body.adSetId, body.nome ?? "Anúncio Douramor", body.imagemUrl, body.legenda
        ));
      }

      case "ativar":
        if (!body.id) return json({ error: "id obrigatório" }, 400);
        return json(await ativarCampanha(body.id));

      case "pausar":
        if (!body.id) return json({ error: "id obrigatório" }, 400);
        return json(await pausarCampanha(body.id));

      default:
        return json({ error: "Ação não reconhecida" }, 400);
    }
  } catch (e) {
    console.error("[meta-ads POST]", e);
    return json({ error: (e as Error).message }, 500);
  }
}

export const Route = createFileRoute("/api/public/meta-ads")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => handleGet(request),
      POST: async ({ request }: { request: Request }) => handlePost(request),
    },
  },
});

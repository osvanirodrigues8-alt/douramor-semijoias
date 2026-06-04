const META_API_VERSION = 'v19.0';
const BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

function getConfig() {
  return {
    token: (process.env.META_ACCESS_TOKEN ?? '').trim(),
    adAccountId: (process.env.META_AD_ACCOUNT_ID ?? '').trim(),
    pageId: (process.env.META_PAGE_ID ?? '').trim(),
    whatsappNumber: (process.env.META_WHATSAPP_NUMBER ?? '').trim(),
  };
}

async function metaRequest<T = unknown>(
  endpoint: string,
  method: 'GET' | 'POST' | 'DELETE' = 'GET',
  body?: Record<string, unknown>
): Promise<T> {
  const { token } = getConfig();
  const sep = endpoint.includes('?') ? '&' : '?';
  const url = `${BASE_URL}/${endpoint}${method === 'GET' ? `${sep}access_token=${token}` : ''}`;

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify({ ...body, access_token: token }) : undefined,
  });

  const data = await res.json() as T & { error?: { message: string } };
  if ((data as { error?: { message: string } }).error) {
    throw new Error(`Meta API: ${(data as { error: { message: string } }).error.message}`);
  }
  return data;
}

// --- Campanhas ---

export async function criarCampanhaWhatsApp(nome: string) {
  const { adAccountId } = getConfig();
  return metaRequest(`${adAccountId}/campaigns`, 'POST', {
    name: nome,
    objective: 'OUTCOME_ENGAGEMENT',
    status: 'PAUSED',
    special_ad_categories: [],
  });
}

export async function listarCampanhas() {
  const { adAccountId } = getConfig();
  return metaRequest(`${adAccountId}/campaigns?fields=id,name,status,objective,daily_budget`);
}

export async function pausarCampanha(campaignId: string) {
  return metaRequest(`${campaignId}`, 'POST', { status: 'PAUSED' });
}

export async function ativarCampanha(campaignId: string) {
  return metaRequest(`${campaignId}`, 'POST', { status: 'ACTIVE' });
}

// --- Conjuntos de Anúncios ---

export async function criarAdSetWhatsApp(
  campaignId: string,
  nome: string,
  orcamentoDiarioCentavos: number,
  publico: {
    idadeMin?: number;
    idadeMax?: number;
    generos?: number[]; // 1=masc, 2=fem
    estadosBR?: string[]; // ex: ['MG', 'SP']
  } = {}
) {
  const { adAccountId } = getConfig();

  const targeting: Record<string, unknown> = {
    geo_locations: {
      countries: ['BR'],
      ...(publico.estadosBR?.length
        ? { regions: publico.estadosBR.map((r) => ({ key: r })) }
        : {}),
    },
    age_min: publico.idadeMin ?? 18,
    age_max: publico.idadeMax ?? 50,
    ...(publico.generos ? { genders: publico.generos } : { genders: [2] }),
    interests: [
      { id: '6003148363195', name: 'Jewelry' },
      { id: '6003195716168', name: 'Fashion accessories' },
      { id: '6003397425735', name: 'Online shopping' },
    ],
  };

  return metaRequest(`${adAccountId}/adsets`, 'POST', {
    name: nome,
    campaign_id: campaignId,
    daily_budget: orcamentoDiarioCentavos,
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'CONVERSATIONS',
    destination_type: 'WHATSAPP',
    targeting,
    status: 'PAUSED',
  });
}

// --- Anúncios ---

export async function criarAnuncioClickWhatsApp(
  adSetId: string,
  nome: string,
  imagemUrl: string,
  legenda: string,
  mensagemPreenchida = 'Olá! Vi o anúncio de vocês e quero saber mais sobre as semi joias 💛'
) {
  const { adAccountId, pageId, whatsappNumber } = getConfig();

  const criativo = await metaRequest<{ id: string }>(`${adAccountId}/adcreatives`, 'POST', {
    name: `Criativo — ${nome}`,
    object_story_spec: {
      page_id: pageId,
      link_data: {
        message: legenda,
        picture: imagemUrl,
        call_to_action: {
          type: 'WHATSAPP_MESSAGE',
          value: {
            app_destination: 'WHATSAPP',
            whatsapp_phone_number: whatsappNumber,
            whatsapp_prefilled_message: mensagemPreenchida,
          },
        },
      },
    },
    degrees_of_freedom_spec: {
      creative_features_spec: {
        standard_enhancements: { enroll_status: 'OPT_OUT' },
      },
    },
  });

  return metaRequest(`${adAccountId}/ads`, 'POST', {
    name: nome,
    adset_id: adSetId,
    creative: { creative_id: criativo.id },
    status: 'PAUSED',
  });
}

// --- Upload de Vídeo ---

export async function uploadVideoMeta(
  videoBuffer: ArrayBuffer,
  nomeArquivo: string
): Promise<string> {
  const { token, adAccountId } = getConfig();

  const form = new FormData();
  form.append('access_token', token);
  form.append('name', nomeArquivo);
  form.append('source', new Blob([videoBuffer], { type: 'video/mp4' }), nomeArquivo);

  const res = await fetch(`${BASE_URL}/${adAccountId}/advideos`, {
    method: 'POST',
    body: form,
  });

  const data = await res.json() as { id?: string; error?: { message: string } };
  if (data.error) throw new Error(`Meta API: ${data.error.message}`);
  if (!data.id) throw new Error('Upload de vídeo não retornou ID');
  return data.id;
}

export async function aguardarVideoProcessado(videoId: string, tentativas = 12): Promise<void> {
  const { token } = getConfig();
  for (let i = 0; i < tentativas; i++) {
    const res = await fetch(
      `${BASE_URL}/${videoId}?fields=status&access_token=${token}`
    );
    const data = await res.json() as { status?: { processing_progress?: number; video_status?: string } };
    const status = data.status?.video_status;
    if (status === 'ready') return;
    if (status === 'error') throw new Error('Vídeo rejeitado pelo Meta');
    await new Promise((r) => setTimeout(r, 5000)); // aguarda 5s entre verificações
  }
  throw new Error('Timeout: vídeo demorou mais de 1 minuto para processar');
}

export async function criarAnuncioVideoWhatsApp(
  adSetId: string,
  nome: string,
  videoId: string,
  legenda: string,
  mensagemPreenchida = 'Olá! Vi o anúncio de vocês e quero saber mais sobre as semi joias 💛'
) {
  const { adAccountId, pageId, whatsappNumber } = getConfig();

  const criativo = await metaRequest<{ id: string }>(`${adAccountId}/adcreatives`, 'POST', {
    name: `Criativo Vídeo — ${nome}`,
    object_story_spec: {
      page_id: pageId,
      video_data: {
        video_id: videoId,
        message: legenda,
        call_to_action: {
          type: 'WHATSAPP_MESSAGE',
          value: {
            app_destination: 'WHATSAPP',
            whatsapp_phone_number: whatsappNumber,
            whatsapp_prefilled_message: mensagemPreenchida,
          },
        },
      },
    },
    degrees_of_freedom_spec: {
      creative_features_spec: {
        standard_enhancements: { enroll_status: 'OPT_OUT' },
      },
    },
  });

  return metaRequest(`${adAccountId}/ads`, 'POST', {
    name: nome,
    adset_id: adSetId,
    creative: { creative_id: criativo.id },
    status: 'PAUSED',
  });
}

// --- Métricas ---

export async function buscarMetricasCampanha(campaignId: string) {
  return metaRequest(
    `${campaignId}/insights?fields=impressions,clicks,spend,actions&date_preset=last_30d`
  );
}

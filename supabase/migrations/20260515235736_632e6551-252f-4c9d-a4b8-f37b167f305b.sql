
ALTER TABLE public.configuracoes_agente
  ADD COLUMN IF NOT EXISTS cupom_negociacao_codigo text DEFAULT 'JULIANA10',
  ADD COLUMN IF NOT EXISTS cupom_negociacao_percentual numeric DEFAULT 10,
  ADD COLUMN IF NOT EXISTS cupom_negociacao_ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cupom_tentativas_antes integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cupom_permite_reuso boolean NOT NULL DEFAULT false;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS cupom_negociacao_oferecido_em timestamptz,
  ADD COLUMN IF NOT EXISTS cupom_negociacao_usado boolean NOT NULL DEFAULT false;

ALTER TABLE public.mensagens
  ADD COLUMN IF NOT EXISTS midia_tipo text,
  ADD COLUMN IF NOT EXISTS midia_url text,
  ADD COLUMN IF NOT EXISTS midia_transcricao text;

ALTER TABLE public.nuvemshop_connections
  ADD COLUMN IF NOT EXISTS ultimo_webhook_em timestamptz,
  ADD COLUMN IF NOT EXISTS ultimo_webhook_evento text,
  ADD COLUMN IF NOT EXISTS ultimo_webhook_status text;

CREATE INDEX IF NOT EXISTS idx_produtos_nuvemshop_product_id ON public.produtos(nuvemshop_product_id);

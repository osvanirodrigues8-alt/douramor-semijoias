ALTER TYPE public.canal ADD VALUE IF NOT EXISTS 'outro';

ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS nuvemshop_order_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS pedidos_nuvemshop_order_id_key ON public.pedidos(nuvemshop_order_id) WHERE nuvemshop_order_id IS NOT NULL;
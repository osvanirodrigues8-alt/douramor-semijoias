
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS nuvemshop_variant_id text,
  ADD COLUMN IF NOT EXISTS peso_gramas integer NOT NULL DEFAULT 200;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS cep text;

ALTER TABLE public.configuracoes_agente
  ADD COLUMN IF NOT EXISTS frete_modo text NOT NULL DEFAULT 'nuvemshop',
  ADD COLUMN IF NOT EXISTS frete_peso_padrao_g integer NOT NULL DEFAULT 200;

DROP INDEX IF EXISTS public.produtos_nuvemshop_product_id_key;
ALTER TABLE public.produtos
  ADD CONSTRAINT produtos_nuvemshop_product_id_key UNIQUE (nuvemshop_product_id);
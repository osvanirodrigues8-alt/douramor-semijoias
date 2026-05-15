
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS nuvemshop_product_id text,
  ADD COLUMN IF NOT EXISTS sincronizado_em timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS produtos_nuvemshop_product_id_key
  ON public.produtos (nuvemshop_product_id)
  WHERE nuvemshop_product_id IS NOT NULL;

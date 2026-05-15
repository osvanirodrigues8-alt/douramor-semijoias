CREATE TABLE public.nuvemshop_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL UNIQUE,
  access_token text NOT NULL,
  scope text,
  nome_loja text,
  dominio_loja text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nuvemshop_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff reads nuvemshop_connections"
  ON public.nuvemshop_connections FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Admins manage nuvemshop_connections"
  ON public.nuvemshop_connections FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
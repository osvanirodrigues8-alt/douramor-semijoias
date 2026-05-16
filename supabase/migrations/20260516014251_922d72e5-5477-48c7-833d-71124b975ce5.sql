
CREATE TYPE public.fluxo_canal AS ENUM ('site','whatsapp','instagram','todos');

CREATE TABLE public.fluxos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  canal fluxo_canal NOT NULL DEFAULT 'todos',
  ativo boolean NOT NULL DEFAULT false,
  versao_atual integer NOT NULL DEFAULT 1,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.fluxos_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fluxo_id uuid NOT NULL REFERENCES public.fluxos(id) ON DELETE CASCADE,
  versao integer NOT NULL,
  dados jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  publicado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fluxo_id, versao)
);

CREATE TABLE public.fluxos_nos_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid,
  fluxo_id uuid,
  no_id text NOT NULL,
  no_tipo text NOT NULL,
  resultado jsonb NOT NULL DEFAULT '{}'::jsonb,
  executado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fluxos_nos_log_conversa ON public.fluxos_nos_log(conversa_id);

CREATE TABLE public.fluxos_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  categoria text,
  dados jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fluxos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fluxos_versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fluxos_nos_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fluxos_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff reads fluxos" ON public.fluxos FOR SELECT USING (is_staff(auth.uid()));
CREATE POLICY "Admins manage fluxos" ON public.fluxos FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "Staff reads fluxos_versoes" ON public.fluxos_versoes FOR SELECT USING (is_staff(auth.uid()));
CREATE POLICY "Admins manage fluxos_versoes" ON public.fluxos_versoes FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "Staff reads fluxos_nos_log" ON public.fluxos_nos_log FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "Staff reads fluxos_templates" ON public.fluxos_templates FOR SELECT USING (is_staff(auth.uid()));
CREATE POLICY "Admins manage fluxos_templates" ON public.fluxos_templates FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_fluxos_touch BEFORE UPDATE ON public.fluxos
  FOR EACH ROW EXECUTE FUNCTION public.touch_pedido();

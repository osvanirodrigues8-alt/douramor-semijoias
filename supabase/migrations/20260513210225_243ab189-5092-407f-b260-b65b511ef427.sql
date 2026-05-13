ALTER TABLE public.configuracoes
  ADD COLUMN IF NOT EXISTS personalidade text,
  ADD COLUMN IF NOT EXISTS uso_emoji text NOT NULL DEFAULT 'moderado',
  ADD COLUMN IF NOT EXISTS tamanho_resposta text NOT NULL DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS idioma text NOT NULL DEFAULT 'pt-BR',
  ADD COLUMN IF NOT EXISTS assinatura text,
  ADD COLUMN IF NOT EXISTS palavras_proibidas text,
  ADD COLUMN IF NOT EXISTS topicos_proibidos text,
  ADD COLUMN IF NOT EXISTS politica_desconto text,
  ADD COLUMN IF NOT EXISTS quando_transferir_humano text,
  ADD COLUMN IF NOT EXISTS regras_extras text,
  ADD COLUMN IF NOT EXISTS saudacao_site text,
  ADD COLUMN IF NOT EXISTS saudacao_whatsapp text,
  ADD COLUMN IF NOT EXISTS mensagem_fora_horario text,
  ADD COLUMN IF NOT EXISTS responder_fora_horario boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pergunta text NOT NULL,
  resposta text NOT NULL,
  categoria text,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff reads faqs" ON public.faqs FOR SELECT USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins manage faqs" ON public.faqs FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_faqs_touch BEFORE UPDATE ON public.faqs FOR EACH ROW EXECUTE FUNCTION public.touch_pedido();
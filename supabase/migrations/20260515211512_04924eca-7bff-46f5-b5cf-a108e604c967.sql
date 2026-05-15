
-- Adiciona colunas para controle de follow-up automático
ALTER TABLE public.conversas
  ADD COLUMN IF NOT EXISTS ultima_mensagem_em timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ultima_mensagem_papel text,
  ADD COLUMN IF NOT EXISTS follow_up_enviado_em timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_count int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_conversas_followup
  ON public.conversas (canal, ultima_mensagem_em)
  WHERE ultima_mensagem_papel = 'assistant';

-- Backfill com base nas mensagens existentes
UPDATE public.conversas c
SET ultima_mensagem_em = sub.criado_em,
    ultima_mensagem_papel = sub.papel
FROM (
  SELECT DISTINCT ON (conversa_id) conversa_id, criado_em, papel
  FROM public.mensagens
  ORDER BY conversa_id, criado_em DESC
) sub
WHERE c.id = sub.conversa_id;

-- Trigger: mantém ultima_mensagem_em e zera follow-up quando o cliente responde
CREATE OR REPLACE FUNCTION public.touch_conversa_on_mensagem()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversas
  SET ultima_mensagem_em = NEW.criado_em,
      ultima_mensagem_papel = NEW.papel,
      atualizado_em = now(),
      follow_up_enviado_em = CASE WHEN NEW.papel = 'user' THEN NULL ELSE follow_up_enviado_em END,
      follow_up_count = CASE WHEN NEW.papel = 'user' THEN 0 ELSE follow_up_count END
  WHERE id = NEW.conversa_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_conversa_on_mensagem ON public.mensagens;
CREATE TRIGGER trg_touch_conversa_on_mensagem
AFTER INSERT ON public.mensagens
FOR EACH ROW EXECUTE FUNCTION public.touch_conversa_on_mensagem();

-- Novos campos de configuração
ALTER TABLE public.configuracoes
  ADD COLUMN IF NOT EXISTS follow_up_max_tentativas int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS follow_up_intervalo_horas int NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS follow_up_respeitar_horario boolean NOT NULL DEFAULT true;

-- Habilita extensões necessárias para o cron
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

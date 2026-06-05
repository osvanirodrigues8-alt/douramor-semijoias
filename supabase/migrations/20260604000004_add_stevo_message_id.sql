-- Adiciona coluna stevo_message_id à tabela mensagens para idempotência de webhook
-- O webhook do Stevo pode reenviar a mesma mensagem (retry); essa coluna evita processar 2x.
-- Idempotente: pode rodar múltiplas vezes sem erro.

ALTER TABLE public.mensagens
  ADD COLUMN IF NOT EXISTS stevo_message_id TEXT;

-- Índice para a busca de idempotência (lookup por message_id)
CREATE INDEX IF NOT EXISTS idx_mensagens_stevo_message_id
  ON public.mensagens(stevo_message_id)
  WHERE stevo_message_id IS NOT NULL;

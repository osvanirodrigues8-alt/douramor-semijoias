-- Idempotência exatamente-uma-vez para webhook do Stevo.
--
-- PROBLEMA: o índice atual (idx_mensagens_stevo_message_id) NÃO é único. Dois webhooks
-- concorrentes com o mesmo message_id passam ambos na verificação read-then-write do webhook
-- (nenhum enxerga o insert do outro ainda) e processam a mensagem 2x. Isso é a causa-raiz das
-- respostas duplicadas — os remendos anti-dup por conteúdo+tempo só mascaram.
--
-- SOLUÇÃO: índice UNIQUE. O segundo insert com o mesmo stevo_message_id falha com violação de
-- unicidade; a execução que perdeu a corrida apenas desiste (graceful). Dedup no nível do banco.
--
-- SEGURO/NÃO-DESTRUTIVO: antes de criar o índice único, limpamos ids DUPLICADOS pré-existentes
-- (mantemos a mensagem mais antiga com o id; as cópias mais novas têm o id zerado para NULL —
-- a LINHA da mensagem é preservada, só o id de rastreio do duplicata é removido). NULLs múltiplos
-- são permitidos em índice único, então isso não conflita. Idempotente: pode rodar de novo.

-- 1) Zerar stevo_message_id das cópias duplicadas (preserva a linha mais antiga de cada id)
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY stevo_message_id ORDER BY criado_em ASC, id ASC) AS rn
  FROM public.mensagens
  WHERE stevo_message_id IS NOT NULL
)
UPDATE public.mensagens m
SET stevo_message_id = NULL
FROM ranked r
WHERE m.id = r.id AND r.rn > 1;

-- 2) Trocar o índice não-único pelo índice único parcial (ignora NULLs)
DROP INDEX IF EXISTS idx_mensagens_stevo_message_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mensagens_stevo_message_id_unique
  ON public.mensagens(stevo_message_id)
  WHERE stevo_message_id IS NOT NULL;

-- Reverte modelo_ia para Haiku enquanto investigamos o ID correto do Sonnet
-- claude-sonnet-4-6 estava retornando erro 400 da API Anthropic
UPDATE public.configuracoes
SET modelo_ia = 'claude-haiku-4-5-20251001'
WHERE modelo_ia = 'claude-sonnet-4-6' OR modelo_ia IS NULL;

-- Atualiza modelo de IA de Haiku para Sonnet 4.6 em todas as configurações
-- Sonnet é significativamente mais inteligente e segue instruções complexas com mais precisão
UPDATE public.configuracoes
SET modelo_ia = 'claude-sonnet-4-6'
WHERE modelo_ia = 'claude-haiku-4-5-20251001' OR modelo_ia IS NULL;

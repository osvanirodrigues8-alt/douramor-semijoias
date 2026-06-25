-- Define o tom da Juliana como FORMAL (decisão do dono, 2026-06-23).
-- O prompt agora prioriza configuracoes.tom_padrao; setamos ambas as colunas para
-- evitar conflito com o default antigo de configuracoes_agente.tom ('informal').
UPDATE public.configuracoes SET tom_padrao = 'formal', atualizado_em = now();
UPDATE public.configuracoes_agente SET tom = 'formal', atualizado_em = now();


CREATE TYPE produto_genero AS ENUM ('masculino', 'feminino', 'unissex');

ALTER TABLE public.produtos
  ADD COLUMN genero produto_genero NOT NULL DEFAULT 'feminino';

CREATE INDEX idx_produtos_genero ON public.produtos(genero);

-- Função auxiliar local (no schema public) para normalizar nome
-- Remove acentos comuns sem depender de unaccent
-- Usaremos diretamente translate() inline no UPDATE.

UPDATE public.produtos
SET genero = 'masculino'
WHERE lower(translate(nome,
  'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
  'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
)) ~ '(masculin|menino|escapular|bracelete|cruz egipc|grumet|cadeado|piastrine|sao jorge|sao bento|padre pio|pingente jesus|pingente de jesus|cordao masc|corrente masc|kit masculin)';

UPDATE public.produtos
SET genero = 'feminino'
WHERE lower(translate(nome,
  'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
  'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
)) ~ '(feminin|menina)';

UPDATE public.produtos
SET genero = 'unissex'
WHERE categoria = 'oculos'
   OR lower(nome) ~ '\b(unissex|infantil)\b';

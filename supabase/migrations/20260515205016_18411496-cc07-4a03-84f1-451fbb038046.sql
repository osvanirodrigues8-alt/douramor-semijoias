
UPDATE public.produtos SET categoria = CASE
  WHEN nome ILIKE 'kit%' OR nome ILIKE '%conjunto%' THEN 'conjunto'::produto_categoria
  WHEN nome ILIKE 'rel_gio%' OR nome ILIKE 'relogio%' OR nome ILIKE 'rel%gios%' THEN 'relogio'::produto_categoria
  WHEN nome ILIKE '_culos%' OR nome ILIKE 'oculos%' THEN 'oculos'::produto_categoria
  WHEN nome ILIKE 'bracelete%' THEN 'bracelete'::produto_categoria
  WHEN nome ILIKE 'escapul_rio%' OR nome ILIKE 'escapulario%' OR nome ILIKE 'escapul%rios%' THEN 'escapulario'::produto_categoria
  WHEN nome ILIKE 'tornozeleira%' THEN 'tornozeleira'::produto_categoria
  WHEN nome ILIKE 'brinco%' THEN 'brinco'::produto_categoria
  WHEN nome ILIKE 'anel%' OR nome ILIKE 'aneis%' OR nome ILIKE 'an_is%' THEN 'anel'::produto_categoria
  WHEN nome ILIKE 'pulseira%' THEN 'pulseira'::produto_categoria
  WHEN nome ILIKE 'colar%'
    OR nome ILIKE 'gargantilha%'
    OR nome ILIKE 'corrente%'
    OR nome ILIKE 'choker%'
    OR nome ILIKE 'cord_o%'
    OR nome ILIKE 'cordao%'
    THEN 'colar'::produto_categoria
  ELSE 'outro'::produto_categoria
END;

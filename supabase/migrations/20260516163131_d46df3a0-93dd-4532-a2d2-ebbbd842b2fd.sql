UPDATE public.fluxos_versoes
SET dados = jsonb_set(
  dados,
  '{edges}',
  (dados->'edges') || '[
    {"id":"e_fix_n11","source":"n11","target":"n8","sourceHandle":"out"},
    {"id":"e_fix_n12","source":"n12","target":"n8","sourceHandle":"out"},
    {"id":"e_fix_n34","source":"n34","target":"n8","sourceHandle":"out"},
    {"id":"e_fix_n36","source":"n36","target":"n8","sourceHandle":"out"}
  ]'::jsonb
)
WHERE fluxo_id = 'b77e604f-e0d0-424d-bead-5fe958c143af';
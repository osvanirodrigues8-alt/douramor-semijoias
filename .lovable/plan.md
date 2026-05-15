## Problema

Os 919 erros vieram todos com:
```
code: 42P10
message: there is no unique or exclusion constraint matching the ON CONFLICT specification
```

Causa: a migração criou um **índice único parcial** (`WHERE nuvemshop_product_id IS NOT NULL`). PostgREST/`upsert(..., onConflict: 'nuvemshop_product_id')` exige uma **UNIQUE constraint real** (ou índice único *não* parcial). Índices parciais não satisfazem `ON CONFLICT`.

## Correção

Migração curta:

1. `DROP INDEX IF EXISTS public.produtos_nuvemshop_product_id_key;`
2. `ALTER TABLE public.produtos ADD CONSTRAINT produtos_nuvemshop_product_id_key UNIQUE (nuvemshop_product_id);`

Postgres trata múltiplos `NULL` como distintos em UNIQUE por padrão, então produtos cadastrados manualmente (sem `nuvemshop_product_id`) continuam coexistindo sem conflito.

Nada precisa mudar no código TypeScript — o `upsert` em `nuvemshop-sync.server.ts` já usa `onConflict: "nuvemshop_product_id"`.

## Depois da migração

Você clica **Sincronizar agora** de novo e os 919 produtos entram (criados na primeira vez, atualizados nas próximas).

## Arquivos

- **nova migração** — drop do índice parcial + add UNIQUE constraint

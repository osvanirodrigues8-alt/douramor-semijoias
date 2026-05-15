
## Objetivo

Importar todos os produtos da loja Nuvemshop conectada para a tabela `produtos`, mantendo-os sincronizados via:
- Botão **"Sincronizar agora"** na página `/integracoes/nuvemshop`
- **Cron a cada 6h** (pg_cron + pg_net)

## 1. Migração de banco

Adicionar à tabela `produtos`:
- `nuvemshop_product_id text unique` — chave para `upsert` (evita duplicar a cada sync)
- `sincronizado_em timestamptz` — última vez que veio da Nuvemshop
- Índice em `nuvemshop_product_id`

Nada é removido. Produtos cadastrados manualmente (sem `nuvemshop_product_id`) continuam intactos.

## 2. Função de sincronização (compartilhada)

Criar `src/lib/nuvemshop-sync.server.ts` com `syncNuvemshopProducts()` que:
1. Lê `nuvemshop_connections` (mais recente) via `supabaseAdmin`
2. Pagina `GET https://api.tiendanube.com/v1/{store_id}/products?per_page=200&page=N` até esgotar
   - Header: `Authentication: bearer {access_token}`, `User-Agent: Douramor Agente IA`
3. Para cada produto, mapeia:
   - `nome` ← `name.pt | name.es | name`
   - `descricao` ← `description.pt` (strip HTML simples)
   - `preco` ← `variants[0].price` (numérico)
   - `quantidade_estoque` ← soma de `variants[].stock` (null = ilimitado → 9999)
   - `url_foto` ← `images[0].src`
   - `categoria` ← `'outro'` (enum atual não mapeia 1:1; mantém produtos categorizáveis manualmente)
   - `status` ← `'inativo'` se Nuvemshop `published=false`, senão deixa o trigger `sync_produto_status` decidir
4. `upsert` em lotes por `nuvemshop_product_id`
5. Retorna `{ total, criados, atualizados, erros }`

## 3. Server function (botão manual)

`src/lib/nuvemshop.functions.ts`:
```ts
export const syncProdutosNuvemshop = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async () => syncNuvemshopProducts());
```

Apenas staff/admin (RLS já cobre — middleware garante usuário autenticado, e a leitura/escrita usa `supabaseAdmin`).

## 4. Rota pública para cron

`src/routes/api/public/hooks/sync-nuvemshop-products.ts` (POST):
- Valida header `apikey` = `SUPABASE_PUBLISHABLE_KEY`
- Chama `syncNuvemshopProducts()`
- Retorna JSON com contadores

## 5. UI — Botão "Sincronizar agora"

Em `src/routes/_app/integracoes/nuvemshop.tsx` (apenas quando há conexão):
- Card novo "Sincronização de produtos"
- Botão **Sincronizar agora** com loading spinner
- Mostra resultado da última sync via toast: `"42 produtos sincronizados (3 novos, 39 atualizados)"`
- Texto: *"Sincronização automática roda a cada 6 horas."*

## 6. Cron job (pg_cron)

```sql
select cron.schedule(
  'sync-nuvemshop-products',
  '0 */6 * * *',
  $$ select net.http_post(
    url := 'https://douramor-semijoias.lovable.app/api/public/hooks/sync-nuvemshop-products',
    headers := '{"Content-Type":"application/json","apikey":"<ANON_KEY>"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);
```

Inserido via tool `supabase--insert` (não migration, contém URL/chave do projeto).

## Arquivos criados/editados

- **migration**: alter `produtos` (+ 2 colunas + índice)
- **novo** `src/lib/nuvemshop-sync.server.ts` — lógica compartilhada
- **novo** `src/lib/nuvemshop.functions.ts` — serverFn
- **novo** `src/routes/api/public/hooks/sync-nuvemshop-products.ts` — endpoint cron
- **edit** `src/routes/_app/integracoes/nuvemshop.tsx` — card + botão
- **insert** SQL `cron.schedule(...)`

## Fora do escopo (próximas iterações)

- Sincronização de pedidos / clientes
- Webhooks Nuvemshop (`product/updated`, `product/deleted`) para tempo real
- Mapeamento de categorias Nuvemshop → enum `produto_categoria`
- Imagens adicionais (hoje só a primeira)

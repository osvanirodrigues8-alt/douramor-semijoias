## Objetivo
Fazer a Juliana calcular frete real consultando a API da Nuvemshop, em vez de prometer "vou calcular" ou dizer frete grátis.

## Como vai funcionar (fluxo do cliente)

1. Cliente pergunta: *"quanto fica o frete pro 01310-000?"* ou *"quanto custa o frete?"*.
2. Se já veio o CEP na mensagem → calcula direto.
3. Se não veio → Juliana pede: *"Me passa seu CEP que já calculo pra você 💛"*.
4. Cliente responde com CEP → sistema chama API Nuvemshop, devolve as opções de frete com prazo e valor.
5. Juliana responde algo natural tipo: *"Pra esse CEP fica R$ 18,50 pelos Correios (chega em 5 dias úteis), ou R$ 35,00 expresso (2 dias). Qual prefere?"*

## Mudanças técnicas

### 1. Detecção de CEP no webhook
- Em `supabase/functions/whatsapp-webhook/index.ts`, antes de chamar a IA, rodar regex `\b\d{5}-?\d{3}\b` na mensagem.
- Detectar intenção de frete por palavras-chave: `frete`, `entrega`, `chega em`, `quanto custa pra mandar`, `cep`.

### 2. Nova função compartilhada `calcularFreteNuvemshop`
Arquivo novo: `supabase/functions/_shared/frete.ts`.
- Lê `nuvemshop_connections` (já existe) → pega `store_id` e `access_token`.
- Determina os produtos a cotar: prioriza os que estão em `conversa.produtos_mostrados` ou `cliente.produtos_interesse`. Se vazio, usa 1 produto genérico com peso/dimensão padrão.
- Busca em `produtos` os IDs com `nuvemshop_product_id` (precisamos garantir que sync salva variant_id + peso — verificar).
- Chama `POST https://api.tiendanube.com/v1/{store_id}/orders/shipping_quote` (endpoint público da Nuvemshop para cotação) com:
  ```json
  {
    "items": [{ "variant_id": ..., "quantity": 1 }],
    "destination": { "zipcode": "01310000" }
  }
  ```
- Retorna lista normalizada: `[{ nome, preco, prazo_dias }]`.

### 3. Memória do CEP na conversa
- Salvar CEP em `conversas.contexto.cep` (campo jsonb já existe) para não pedir de novo na mesma conversa.
- Também salvar em `clientes.cep` (adicionar coluna nova via migration).

### 4. Injeção do resultado no prompt da IA
- Em `_shared/prompt.ts`, novo bloco `# COTAÇÃO DE FRETE (acabou de ser calculada)` que entra só quando o webhook acabou de cotar.
- Reescrever a regra atual de "FRETE GRÁTIS" — só aparece se config `taxa_entrega = 0` E não tiver Nuvemshop conectada. Caso contrário, instruir: *"Use os valores reais cotados abaixo. Se ainda não tem CEP, peça."*

### 5. Configuração
Em `configuracoes_agente` adicionar duas colunas:
- `frete_modo` (`nuvemshop` | `gratis` | `manual`) — default `nuvemshop` se Nuvemshop conectada.
- `frete_peso_padrao_g` (int, default 200) — fallback quando produto não tem peso cadastrado.

### 6. UI de configuração
Em `src/routes/_app/agente.tsx`, adicionar seção "Frete" com:
- Toggle modo (Nuvemshop / Grátis / Manual).
- Campo peso padrão.
- Status: "✅ Nuvemshop conectada" ou aviso pedindo conectar.

### 7. Tratamento de erro
Se a API Nuvemshop falhar ou produto não tiver `variant_id`/peso:
- Logar em `fluxos_nos_log` (reaproveita tabela) ou novo log.
- Juliana responde: *"Tive um probleminha pra puxar o valor agora. Vou chamar minha colega pra te ajudar com isso, tá?"* + `[ESCALAR]`.

## Validação
Depois de implementar:
1. Mandar "quanto fica frete pra 01310-000?" no WhatsApp.
2. Conferir log de `whatsapp-webhook` mostrando chamada Nuvemshop + resposta.
3. Conferir que a resposta da Juliana traz valor + prazo reais.

## Pendência aberta
Preciso confirmar com você: **o sync atual da Nuvemshop salva o `variant_id` e o peso de cada produto?** Se não salvar, a primeira parte da implementação será ajustar o sync pra puxar esses campos — sem eles a cotação não funciona.
## Objetivo

Tornar a mensagem de follow-up muito mais personalizada usando **tudo** que sabemos sobre a cliente: nome, produto que ela estava vendo, pedidos anteriores e preferências salvas. O tom continua o mesmo entre tentativas (sem variação por tentativa).

## O que muda no endpoint `/api/public/follow-up-cron`

Hoje ele já carrega o histórico das últimas 30 mensagens da conversa. Vou expandir o contexto enviado à IA para incluir um bloco "FICHA DA CLIENTE" antes da instrução de follow-up:

### 1. Dados da cliente

Para cada conversa elegível, buscar em paralelo:
- `clientes.nome`, `clientes.preferencias`, `clientes.total_pedidos`, `clientes.canal_origem`
- Últimos 3 pedidos: `pedidos` filtrados por `cliente_id`, com `produtos_snapshot`, `valor_total`, `status`, `criado_em` — para entender histórico de compra (recorrente, ticket médio, o que costuma comprar).

### 2. Detecção do produto em foco

Varrer as últimas mensagens do histórico procurando:
- **Links de produto** que a Dora enviou (regex `https?://[^\s]+` cruzado com `produtos.url_produto` na base) → identifica exatamente quais peças ela estava olhando.
- Nomes de produto mencionados no texto da IA cruzados com a tabela `produtos`.

Resultado: lista de até 3 produtos "em foco" com nome, preço, link e foto, anexada ao prompt para a IA citar de volta.

### 3. Prompt enriquecido

A instrução de follow-up enviada à IA passa a ser algo como:

```
# FICHA DA CLIENTE
Nome: Carla (use no início da mensagem se houver nome)
Origem: WhatsApp
Pedidos anteriores: 2 (último: colar dourado, R$ 189, há 14 dias, status entregue)
Preferências salvas: gosta de peças douradas, tamanho médio

# PRODUTOS QUE ELA ESTAVA VENDO NESTA CONVERSA
- Relógio Feminino Dourado X — R$ 249 — https://...
- Bracelete Y — R$ 89 — https://...

# TAREFA DE FOLLOW-UP
Esta conversa parou há ~24h. Escreva UMA mensagem curta retomando o assunto.
- Comece chamando pelo nome se disponível.
- Cite o(s) produto(s) acima com carinho.
- Se for cliente recorrente, reconheça ("que bom te ver de novo!").
- Se há preferências, alinhe a recomendação a elas.
- Reenvie o link em linha separada.
- Não invente produtos. Não repita literalmente a frase-base. Não se desculpe.
```

A frase-base de `cfg.follow_up_mensagem` continua sendo passada apenas como referência de tom.

### 4. Sem mudanças em UI ou banco

Não preciso de migration nem de novos campos — todos os dados já existem (`clientes`, `pedidos`, `produtos`, `mensagens`). A configuração de "manter estilo único entre tentativas" é simplesmente o comportamento atual (não passamos as mensagens de follow-up anteriores como exemplo a evitar).

## Arquivos alterados

- `src/routes/api/public/follow-up-cron.ts` — adicionar fetch de cliente + pedidos, função `extrairProdutosEmFoco(hist, produtosBase)` e expandir o `instrucao` enviado à IA.

Sem mudanças em outros arquivos.

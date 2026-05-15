## Objetivo

Criar um follow-up inteligente: depois de X horas (configurável) sem resposta do cliente no WhatsApp, a Dora envia uma mensagem retomando exatamente o ponto onde a conversa parou (ex: "vimos que você estava olhando o relógio X, ainda quer fechar?"), usando a IA com o histórico da conversa.

## Como vai funcionar

1. A cada 15 minutos, um cron job roda no banco e chama um endpoint público `/api/public/follow-up-cron`.
2. O endpoint busca todas as conversas de WhatsApp onde:
   - A última mensagem foi do **cliente** (ou da IA, dependendo da regra escolhida).
   - Já se passou pelo menos `follow_up_horas` (configurado em Configurações) desde a última mensagem.
   - Ainda não foi enviado follow-up para essa "rodada" (controlado por uma nova coluna em `conversas`).
   - `follow_up_ativo = true` nas configurações.
3. Para cada conversa elegível, o endpoint:
   - Carrega o histórico das últimas mensagens.
   - Pede para a IA (mesmo modelo do atendimento) gerar uma mensagem curta retomando o assunto exato em que pararam, no tom da loja, usando `follow_up_mensagem` como referência de estilo.
   - Envia via Stevo (WhatsApp), grava como mensagem `assistant` na conversa, e marca o follow-up como enviado.
4. Quando o cliente responder de volta, o marcador é resetado e o ciclo pode repetir.

## Mudanças técnicas

### 1. Banco de dados (migration)

Adicionar à tabela `conversas`:
- `follow_up_enviado_em timestamptz` — quando o último follow-up foi disparado.
- `follow_up_count int default 0` — quantos follow-ups já foram feitos nesta "rodada".
- `ultima_mensagem_em timestamptz` — atualizado por trigger sempre que entra mensagem nova; serve de base para o cron e evita varrer `mensagens` toda hora.
- Trigger em `mensagens` que atualiza `conversas.ultima_mensagem_em`, e zera `follow_up_enviado_em`/`follow_up_count` quando chega mensagem do `user` (cliente respondeu → reinicia ciclo).

Adicionar à tabela `configuracoes`:
- `follow_up_max_tentativas int default 1` — quantos follow-ups disparar antes de desistir.
- `follow_up_intervalo_tentativas_horas int default 24` — intervalo entre tentativas extras.

Habilitar `pg_cron` e agendar:
```sql
select cron.schedule('follow-up-whatsapp', '*/15 * * * *',
  $$ select net.http_post(url:='https://project--6be2b527-...lovable.app/api/public/follow-up-cron',
       headers:='{"x-cron-secret":"<secret>"}'::jsonb) $$);
```

### 2. Endpoint `src/routes/api/public/follow-up-cron.ts` (novo)

- `POST` (ou `GET`), valida header `x-cron-secret` contra `process.env.FOLLOW_UP_CRON_SECRET`.
- Usa `supabaseAdmin`.
- Query: conversas de canal `whatsapp` onde
  `ultima_mensagem_em < now() - cfg.follow_up_horas * interval '1 hour'`
  e (`follow_up_enviado_em is null` ou tentativas < max E intervalo extra cumprido).
- Para cada conversa, busca últimas ~20 mensagens, monta prompt curto:
  > "Você está retomando uma conversa parada há X horas. Resuma para a cliente onde paramos e convide-a a continuar, no tom da loja. Última mensagem dela: '...'. Mensagem-base: '<follow_up_mensagem>'. Não invente produtos."
- Chama Lovable AI Gateway, envia via Stevo, grava em `mensagens`, atualiza `conversas.follow_up_enviado_em` e incrementa `follow_up_count`.
- Loga resultado por conversa para debug em `supabase--edge_function_logs` equivalente (worker logs).

### 3. Configurações UI (`src/routes/_app/configuracoes.tsx`)

Na aba **Atendimento**, adicionar dois campos novos ao lado dos existentes:
- "Máx. tentativas de follow-up" (number).
- "Intervalo entre tentativas (horas)" (number).

Sem mudanças visuais de design — só estende o grid existente.

### 4. Segredo

Adicionar `FOLLOW_UP_CRON_SECRET` via `secrets--add_secret` antes de criar o cron.

## Pontos a confirmar antes de implementar

1. **Quando disparar?** Apenas quando o **cliente** ficou sem responder à Dora (ela mandou a última mensagem), ou também quando a **Dora** ficou sem responder ao cliente? O caso clássico de carrinho abandonado é o primeiro.
2. **Quantas tentativas?** Uma só (24h depois) ou uma sequência (ex: 24h, 72h, 7 dias)?
3. **Janela de horário:** respeitar o `horario_atendimento_inicio/fim` da loja (não enviar follow-up às 3h da manhã)? Recomendo sim.

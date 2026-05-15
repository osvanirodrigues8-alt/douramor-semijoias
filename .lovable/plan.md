# Reestruturação completa: Dora → Juliana

Vou refazer o sistema de IA de vendas em um único ciclo de implementação. O escopo é grande, então abaixo está o plano consolidado — sem mudar nada do que você pediu, só organizando a ordem de execução.

## 1. Banco de dados (1 migration)

**Nova tabela `configuracoes_agente`** — substitui a configuração espalhada hoje em `configuracoes` para tudo que diz respeito à Juliana. Vou manter `configuracoes` para o resto (loja, pagamento, entrega) e ler ambas no prompt.

Campos:
- **Identidade**: `nome_agente` (default "Juliana"), `tom`, `frase_abertura`, `assinatura`, `uso_emoji`, `prompt_extra` (texto livre), `contexto_loja` (texto livre).
- **Follow-up**: `fup1_horas` (3), `fup2_horas` (5), `fup3_horas` (4), `max_fups_dia` (3), `dias_total` (7), `horario_inicio` (08:00), `horario_fim` (22:00), `respeitar_horario` (bool).
- **Vendas**: `max_produtos_apresentacao` (3), `estoque_baixo_threshold` (5), `produtos_destaque_ids` (uuid[]), `promocao_ativa_texto`, `promocao_ativa_validade`.
- **Escalamento**: `palavras_chave_humano` (text[]), `tentativas_antes_escalar` (2), `responsavel_nome`, `responsavel_numero`.
- **Pós-venda**: `dias_avaliacao` (7), `dias_reativacao` (30), `auto_avaliacao_ativa`, `auto_aniversario_ativa`, `auto_reativacao_ativa`, `auto_datas_comerciais_ativa`.

**Alterações em tabelas existentes**:
- `conversas`: + `tipo_conversa` ('ativo'|'receptivo'), + `dia_followup_atual` (int), + `fups_enviados_hoje` (int), + `proximo_followup_em` (timestamptz), + `data_inicio_followup` (date).
- `clientes`: + `categoria_favorita`, + `estilo_preferido`, + `budget_aproximado` (numeric), + `genero_interesse`, + `produtos_vistos` (uuid[]), + `produtos_interesse` (uuid[]), + `produtos_comprados` (uuid[]), + `temperatura_lead` ('quente'|'morno'|'frio'|'inativo'), + `data_aniversario` (date), + `motivo_nao_fechamento`, + `data_ultimo_contato`.

RLS: mesmo padrão de staff/admin das tabelas existentes.

## 2. Prompt e lógica de IA (`supabase/functions/_shared/prompt.ts`)

Reescrita completa do `buildSystemPrompt`:
- Identidade Juliana (humana, nunca admite ser IA — instrução explícita com exemplo do "você é robô?").
- Estilo: frases curtas, 1 pergunta por vez, reticências/"hm"/"olha" ocasional, emojis moderados (💛 ✨ 💍).
- **Tipo de conversa** injetado: se receptivo, instrução para LER o histórico e CONTINUAR de onde parou (proibido reapresentar).
- **Roteiro de diagnóstico** (uso/ocasião/metal/estilo/preço) — uma pergunta por mensagem, na ordem natural.
- **Apresentação**: máx N produtos (config), formato humano com argumento de venda real, link sempre.
- **Fechamento por alternativa** (nunca "quer comprar?"): exemplos concretos no prompt.
- **Cross-sell condicional**.
- **Objeções**: bloco com cada objeção e o padrão "valida → responde".
- **Temperatura do lead** + instruções de comportamento por temperatura.
- **Escalamento**: gatilhos + mensagem exata + flag `[ESCALAR]` ao fim quando decidir escalar.
- **Restrições**: nunca inventar, nunca admitir IA, nunca repetir produto já mostrado.

Helpers expandidos:
- `SINONIMOS` (já existe, vou ampliar: cordão→colar, aliança→anel, etc.).
- `detectarTemperatura(historico)` → quente/morno/frio.
- `detectarTipoConversa(historico)` → ativo/receptivo (presença de mensagem assistant antes da 1ª user).
- `extrairPerfilCliente(historico)` via IA secundária (chamada no pós-conversa).

## 3. Webhook (`supabase/functions/whatsapp-webhook/index.ts`)

- Detecta tipo_conversa na 1ª mensagem e grava em `conversas`.
- Busca produtos com: sinônimos + filtro preço/gênero/categoria + destaque primeiro + anti-repetição via `produtos_mostrados`.
- Salva produtos apresentados em `produtos_mostrados` (conversa) e `produtos_vistos` (cliente).
- Detecta `[ESCALAR]` na resposta → marca `precisa_humano=true`, salva motivo, remove tag da mensagem antes de enviar.
- Atualiza `temperatura_lead` e `data_ultimo_contato` do cliente.
- Detecta intenção de compra → marca `intencao_compra_em` + adiciona a `produtos_interesse`.
- Ao detectar resposta do cliente: zera `fups_enviados_hoje`, `dia_followup_atual`, `data_inicio_followup`.

## 4. Cron de follow-up (`src/routes/api/public/follow-up-cron.ts`)

Reescrita para a cadência 3×/dia × 7 dias:
- Considera `proximo_followup_em` em vez de janela simples de horas.
- Lê config dinâmica de `configuracoes_agente`.
- Calcula próximo gatilho: fup1 → fup2 (após fup1_horas) → fup3 (após fup2_horas) → próximo dia 08:00.
- Cada follow-up recebe instrução de ÂNGULO diferente no prompt (1: retomar contexto; 2: nova info/prova social; 3: direto/urgência real).
- Respeita horário de atendimento.
- Após 7 dias sem resposta: marca `temperatura_lead='inativo'` e para os follow-ups.
- Continua usando ficha do cliente (já implementado) + produtos em foco.

## 5. Cron de reativação mensal (novo: `src/routes/api/public/reativacao-cron.ts`)

- Roda 1×/dia, busca clientes com `temperatura_lead='inativo'` e último contato > 30 dias.
- Envia mensagem de reativação com novidades da `categoria_favorita`.
- Toggle pelo `auto_reativacao_ativa`.

## 6. Pós-venda (`src/routes/api/public/pos-venda-cron.ts`)

Expandir o que já existe:
- D+7 entregue → avaliação + novidades (já existe, vou ler config dinâmica).
- Aniversário → mensagem + cupom (novo bloco; usa `data_aniversario`).
- Datas comerciais → bloco com datas fixas (10/05, 12/06, 25/12) disparando mensagem proativa para base com `total_pedidos>0`.
- Extração de perfil pós-conversa → expande para preencher todos os novos campos (`estilo_preferido`, `budget_aproximado`, etc.).

## 7. Painel `/agente` (`src/routes/_app/agente.tsx`)

Reescrita completa da página existente, com tabs/accordion para cada seção do PARTE 8:
- Identidade · Follow-up · Vendas · Escalamento · Pós-venda · Prompt Avançado.
- Salva em `configuracoes_agente` (upsert single-row).
- Multi-select de produtos em destaque (lista de `produtos`).
- Lista editável de palavras-chave (chips).
- Toggles individuais para cada automação pós-venda.

## 8. Painel `/atendimento`

Pequenos ajustes:
- Mostra `motivo_humano` em destaque.
- Botão "Devolver para Juliana" → seta `precisa_humano=false`.
- Badge vermelho com contador no sidebar (já existe via realtime).

## 9. Agendar crons (após deploy)

Via `supabase--insert`:
- `follow-up-cron`: a cada 30min.
- `reativacao-cron`: 1×/dia às 10:00.
- `pos-venda-cron`: a cada 6h (já existe, manter).

## Arquivos tocados

**Criados**: migration · `reativacao-cron.ts`.
**Reescritos**: `_shared/prompt.ts` · `whatsapp-webhook/index.ts` · `follow-up-cron.ts` · `_app/agente.tsx` · `pos-venda-cron.ts`.
**Pequenas edições**: `_app/atendimento.tsx`.

## Compatibilidade

A tabela antiga `configuracoes` continua existindo (campos de loja/pagamento/entrega seguem usados). Os campos duplicados (nome_agente, horários, follow-up) passam a ser lidos de `configuracoes_agente` com fallback para `configuracoes` enquanto migro — depois posso limpar.

## O que NÃO está no escopo deste plano

- Reescrever a UI inteira do sistema (só `/agente` e ajustes mínimos em `/atendimento`).
- Trocar provedor de WhatsApp (segue Stevo/Evolution).
- Mudar modelo de IA (segue `cfg.modelo_ia`, default gemini-2.5-flash).

Confirma que posso seguir com tudo nesta ordem?

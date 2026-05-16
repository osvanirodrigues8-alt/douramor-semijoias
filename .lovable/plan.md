## Visão geral

Construir um **Construtor Visual de Fluxos** dentro de `/agente`, estilo Typebot/ManyChat, onde você desenha o comportamento da Juliana arrastando nós em um canvas. Cada nó representa uma ação (mensagem, pergunta, condição, integração, etc.) e as conexões definem o caminho da conversa.

A edge function do WhatsApp e do site executam o fluxo em tempo real: leem o nó atual da conversa, avaliam condições, executam ações e salvam o próximo nó em `conversas.contexto.no_atual`.

```text
[Entrada] → [Mensagem] → [Pergunta] → [Condição]──sim──→ [Mostrar produto] → [Fechar venda]
                                          │
                                          └─não──→ [Oferecer cupom] → [Escalar humano]
```

## Canvas visual

- Biblioteca: **React Flow** (`@xyflow/react`) — drag-and-drop, zoom, pan, minimapa, conexões com curvas
- Painel lateral esquerdo: paleta de nós agrupados por categoria
- Painel lateral direito: editor de propriedades do nó selecionado
- Topo: nome do fluxo, status (ativo/rascunho), botão "Testar", "Publicar", "Versões"
- Suporte a múltiplos fluxos (ex: "Fluxo padrão", "Fluxo Black Friday", "Fluxo reativação")
- Cada canal (site, WhatsApp, Instagram) pode usar um fluxo diferente

## Catálogo de nós (40+ tipos)

### 1. Gatilhos (início)
- Nova conversa (site / WhatsApp / Instagram)
- Palavra-chave detectada
- Carrinho abandonado
- Aniversário do cliente
- Inatividade X dias
- Pedido entregue (pós-venda)
- Webhook externo

### 2. Mensagens
- Texto simples (com variáveis: `{{nome}}`, `{{ultimo_produto}}`)
- Texto com variações aleatórias (a IA escolhe uma)
- Mensagem gerada por IA (prompt customizado + contexto)
- Imagem / vídeo / áudio / documento
- Lista de produtos (filtros: categoria, gênero, preço)
- Card de produto único
- Carrossel de produtos
- Botões de resposta rápida
- Menu numerado
- Localização / contato

### 3. Capturas (perguntas)
- Pergunta aberta (salva em variável)
- Pergunta com opções
- Capturar nome, email, telefone, CPF, endereço, data
- Capturar foto/áudio (com transcrição IA)
- Validação (regex, tipo, obrigatório)

### 4. Lógica
- Condição (if/else) com operadores: igual, contém, maior, menor, regex, vazio
- Múltiplas ramificações (switch)
- Aleatório (A/B test com pesos)
- Aguardar X segundos/minutos/horas/dias
- Aguardar resposta do cliente (com timeout)
- Loop / repetir até

### 5. Dados do cliente
- Atualizar campo do cliente (temperatura, preferências, budget, estilo)
- Adicionar tag
- Remover tag
- Marcar produto visto / comprado / interesse
- Incrementar contador

### 6. Vendas
- Mostrar catálogo filtrado
- Oferecer cupom (com regras: tentativas, reuso)
- Calcular parcelamento
- Criar pedido (status novo)
- Atualizar status do pedido
- Enviar link de pagamento

### 7. IA
- Classificar intenção (compra / dúvida / reclamação / saudação)
- Detectar sentimento (positivo / neutro / negativo / irritado)
- Resumir conversa
- Gerar resposta livre (com persona Juliana)
- Recomendar produtos (baseado em histórico)
- Extrair entidades (data, valor, produto)

### 8. Integrações
- Buscar/atualizar produto na Nuvemshop
- Criar/atualizar contato no CRM
- Disparar webhook HTTP (POST/GET)
- Enviar email
- Agendar follow-up
- Notificar humano (WhatsApp/email)

### 9. Controle de fluxo
- Ir para outro nó
- Chamar sub-fluxo (reutilizar blocos)
- Encerrar conversa
- Transferir para humano (com motivo)
- Pular para fluxo diferente

## Sistema de variáveis

- **Variáveis do sistema** (read-only): `{{cliente.nome}}`, `{{cliente.temperatura}}`, `{{conversa.canal}}`, `{{ultima_mensagem}}`, `{{data_hoje}}`, `{{hora_atual}}`, `{{config.nome_agente}}`
- **Variáveis do fluxo** (criadas pelos nós de captura): `{{ocasiao}}`, `{{budget}}`, etc.
- **Expressões**: `{{cliente.total_pedidos > 0 ? "de novo" : "pela primeira vez"}}`

## Editor de propriedades do nó

Cada tipo de nó tem seu próprio painel:
- Label (nome interno)
- Campos específicos do tipo
- Validações
- Tratamento de erro (ir pra nó X se falhar)
- Delay antes de executar
- Logs / observabilidade

## Testes e debug

- Botão "Testar fluxo" → abre simulador de chat lateral
- Modo step-by-step (avançar nó por nó)
- Highlight do nó atual no canvas durante execução
- Log de execução por conversa (ver caminho que cada cliente percorreu)
- Histórico de versões com rollback

## Templates prontos

Biblioteca de fluxos pré-montados que você pode importar e adaptar:
- Vendedora consultiva (atual da Juliana)
- Recuperação de carrinho
- Pós-venda + avaliação
- Aniversariante
- Reativação 30 dias
- FAQ guiado
- Agendamento

## Estrutura técnica

### Banco (5 novas tabelas)

| tabela | campos principais |
|---|---|
| `fluxos` | id, nome, descricao, canal, ativo, versao_atual, criado_em |
| `fluxos_versoes` | id, fluxo_id, versao, dados_json (nós + conexões), publicado_em |
| `fluxos_nos_log` | id, conversa_id, no_id, executado_em, resultado_json |
| `fluxos_variaveis` | id, fluxo_id, nome, tipo, valor_padrao |
| `fluxos_templates` | id, nome, descricao, dados_json |

Acrescentar em `conversas.contexto`: `{ fluxo_id, no_atual, variaveis: {...} }`

### Frontend
- `src/routes/_app/agente.fluxos.tsx` — lista de fluxos
- `src/routes/_app/agente.fluxos.$id.tsx` — editor canvas
- `src/components/fluxo/` — canvas, paleta, painel-propriedades, simulador
- Dependência nova: `@xyflow/react`

### Engine de execução (edge function)
- Novo módulo `supabase/functions/_shared/fluxo-engine.ts`
- Função `executarFluxo(conversaId, mensagemUsuario)` que:
  1. Carrega fluxo ativo do canal
  2. Lê `no_atual` do contexto da conversa
  3. Avalia condições e executa ação do nó
  4. Salva próximo nó e variáveis
  5. Loga execução
- Integrar em `whatsapp-webhook` e `chat`

### Server functions
- `src/lib/fluxos.functions.ts` — CRUD de fluxos, versões, templates, testes

## Escopo realista — entrega em fases

Construir tudo isso de uma vez é arriscado e pesado. Proponho 3 fases:

**Fase 1 (este plano)** — fundação utilizável:
- Canvas com React Flow
- 15 tipos de nós essenciais: gatilho, texto, IA, pergunta, condição, atualizar cliente, mostrar produto, cupom, escalar humano, aguardar, webhook, ir para nó, encerrar, sub-fluxo, classificar intenção
- 1 fluxo ativo por canal
- Engine de execução integrada
- Simulador de teste
- 3 templates iniciais

**Fase 2** — expansão:
- Demais 25 tipos de nós
- Múltiplas versões + rollback
- A/B testing
- Logs visuais de execução

**Fase 3** — avançado:
- Sub-fluxos reutilizáveis
- Marketplace de templates
- Métricas por nó (conversão, drop-off)
- Importar/exportar fluxos em JSON

## Decisão necessária

Confirme antes de eu começar:

1. **OK começar pela Fase 1** (15 nós + canvas + engine)? Ou quer realmente os 40+ nós de cara (vai levar várias rodadas de implementação)?
2. **Mantém a Juliana atual rodando em paralelo** até o fluxo novo estar pronto? (recomendo SIM)
3. **Um fluxo por canal** está OK? (ou precisa de múltiplos fluxos ativos com regras de seleção?)

# Construtor de Fluxos — Versão Robusta

Vou transformar o editor atual em um construtor de nível profissional (estilo ManyChat / n8n), mantendo a UX drag-and-drop já existente.

## 1. Novos tipos de nós (25+)

### Mensagens
- **Enviar imagem** — URL ou foto de produto
- **Enviar áudio** — URL de áudio (TTS opcional)
- **Enviar documento** — PDF/catálogo
- **Botões de resposta rápida** — até 3 opções, cada uma é uma saída
- **Lista de opções** — menu numerado (1, 2, 3…)
- **Localização** — envia mapa/endereço da loja
- **Carrossel de produtos** — múltiplos produtos navegáveis

### Captura
- **Capturar CEP** (com validação + lookup ViaCEP)
- **Capturar CPF** (com validação)
- **Capturar foto/áudio** do cliente
- **Capturar escolha de botão** (vinculado ao nó de botões)

### Lógica avançada
- **Condição múltipla (E/OU)** — combina várias condições
- **Switch / Roteador** — múltiplas saídas baseadas no valor de uma variável
- **Loop / Repetir** — itera até condição
- **Random / A/B** — divide fluxo em % para testes
- **Calculadora** — operações matemáticas em variáveis (ex: total + frete)
- **Verificar horário** — Sim/Não baseado em horário comercial
- **Verificar dia da semana**
- **Contador** — incrementa variável

### IA
- **Extrair entidades** — extrai produto/cor/tamanho da mensagem
- **Sentimento** — positivo / neutro / negativo
- **Resumir conversa** — gera resumo para humano
- **Gerar imagem** (Lovable AI)

### Dados / CRM
- **Consultar produto** — busca por nome/SKU
- **Consultar pedido** — por número
- **Criar pedido** — gera pedido com produtos no contexto
- **Atualizar pedido** — muda status
- **Adicionar tag** ao cliente
- **Registrar evento no funil**

### Vendas
- **Calcular frete** (baseado em CEP + taxa configurada)
- **Gerar link de pagamento** (PIX/cartão)
- **Aplicar cupom** (valida e calcula desconto)
- **Solicitar avaliação** (pós-venda)

### Integração
- **Webhook avançado** — headers customizados, mapeamento de resposta para variáveis
- **Enviar email** (transacional)
- **Disparar fluxo de outro fluxo** (sub-fluxos)
- **Agendar follow-up** programático

### Controle
- **Marcar tag na conversa** (para filtros)
- **Pausar fluxo** (deixa Juliana livre)
- **Goto / Pular para nó** (loops controlados)
- **Comentário / Nota** (só visual, não executa)

## 2. Melhorias no Editor

- **Undo / Redo** (Ctrl+Z / Ctrl+Shift+Z) com histórico de 50 passos
- **Copiar / colar nós** (Ctrl+C / Ctrl+V)
- **Duplicar nó** (Ctrl+D)
- **Multi-seleção** com Shift+click + mover em grupo
- **Agrupar nós** em "frames" coloridos com rótulo
- **Auto-layout** (botão "organizar" — usa dagre para reorganizar)
- **Busca de nós** no canvas (Ctrl+K)
- **Minimapa interativo** já presente, adicionar busca dentro dele
- **Snap to grid** + alinhamento automático
- **Validação visual** — nós sem conexão de saída ficam com borda vermelha + ícone de aviso
- **Detector de loops infinitos** — alerta antes de publicar
- **Variáveis globais do fluxo** — painel separado para definir variáveis iniciais
- **Autocomplete de variáveis** nos campos textarea (`{{` abre dropdown com vars disponíveis)

## 3. Simulador embutido

Painel lateral ou modal:
- Inicia conversa simulada
- Mostra qual nó está executando em tempo real (nó pisca no canvas)
- Permite digitar respostas simuladas
- Exibe variáveis acumuladas
- Sem afetar banco real

## 4. Versionamento & Histórico

- Cada "Publicar" cria nova versão (já existe estrutura)
- Lista de versões com diff visual
- Botão "Restaurar versão"
- Comparar versões lado a lado

## 5. Analytics por nó

- Aproveitar `fluxos_nos_log` que já existe
- Painel mostra: quantas vezes cada nó executou, % de queda em cada bifurcação, tempo médio
- Heatmap sobreposto no canvas (nós mais quentes ficam destacados)

## 6. Templates expandidos

Adicionar 7+ templates prontos:
- Recuperação de carrinho abandonado
- Qualificação de lead com pontuação
- Pós-venda + NPS
- Aniversário do cliente
- Reativação 30/60/90 dias
- Atendimento técnico (suporte)
- Black Friday / Promoção sazonal

## 7. Engine — atualizações

Atualizar `supabase/functions/_shared/fluxo-engine.ts` para suportar todos os novos nós, incluindo:
- Lookup ViaCEP no nó de CEP
- Operações matemáticas no nó Calculadora
- Loop com proteção contra infinito (max 50 iterações)
- Sub-fluxos com stack de retorno
- A/B com hash determinístico por cliente

## Detalhes técnicos

```text
src/components/fluxo/
├── node-types.ts          (expandir de 15 → 45+ nós)
├── FluxoCanvas.tsx        (undo/redo, multi-seleção, atalhos)
├── FluxoNode.tsx          (badges de validação, animação de execução)
├── NodePalette.tsx        (busca + categorias colapsáveis)
├── NodeInspector.tsx      (autocomplete de variáveis)
├── FluxoSimulator.tsx     [NOVO] — painel de simulação
├── FluxoAnalytics.tsx     [NOVO] — overlay de métricas
├── FluxoVariaveis.tsx     [NOVO] — gestão de vars globais
├── FluxoHistorico.tsx     [NOVO] — versões + diff
└── utils/
    ├── auto-layout.ts     [NOVO] — dagre
    ├── validacao.ts       [NOVO] — detecta loops, nós órfãos
    └── historico.ts       [NOVO] — undo/redo stack

supabase/functions/_shared/
├── fluxo-engine.ts        (suporte aos 30+ novos tipos)
└── fluxo-handlers/        [NOVO] — um arquivo por categoria
    ├── mensagens.ts
    ├── logica.ts
    ├── ia.ts
    ├── dados.ts
    ├── vendas.ts
    └── integracao.ts
```

Sem mudanças de schema no banco — as tabelas atuais (`fluxos`, `fluxos_versoes`, `fluxos_nos_log`, `fluxos_templates`) já comportam tudo isso via JSONB.

## Escopo / entrega

É bastante coisa. Posso entregar tudo de uma vez (resposta grande) ou em fases. Recomendo:

- **Fase A (já vou começar):** novos nós + undo/redo + busca + autocomplete de variáveis + auto-layout + validação visual + simulador básico
- **Fase B:** analytics por nó + sub-fluxos + variáveis globais + templates novos
- **Fase C:** versionamento com diff + heatmap + grupos visuais

Confirma se quer **tudo na fase A já** ou se prefere que eu inclua mais coisas da B/C no primeiro envio?

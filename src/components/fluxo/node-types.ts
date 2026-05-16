// Definições completas dos nós do construtor de fluxos (Fase A — 45+ tipos).
// Cada nó: chave, label, categoria, cor, descrição, schema de campos, inputs, outputs.

export type CampoTipo =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "boolean"
  | "keywords"
  | "node-ref"
  | "json"
  | "color";

export type CampoDef = {
  chave: string;
  label: string;
  tipo: CampoTipo;
  placeholder?: string;
  opcoes?: { value: string; label: string }[];
  default?: any;
  hint?: string;
  vars?: boolean; // habilita autocomplete de variáveis {{}} no campo
};

export type NodeDef = {
  tipo: string;
  label: string;
  categoria:
    | "gatilho"
    | "mensagem"
    | "captura"
    | "logica"
    | "ia"
    | "dados"
    | "vendas"
    | "integracao"
    | "controle"
    | "visual";
  cor: string;
  bg: string;
  descricao: string;
  campos: CampoDef[];
  inputs: number;
  outputs: { id: string; label?: string }[];
  icone?: string;
};

export const NODE_DEFS: NodeDef[] = [
  // ============ GATILHOS ============
  {
    tipo: "gatilho_inicio", label: "Início da conversa", categoria: "gatilho",
    cor: "border-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30",
    descricao: "Entra quando o cliente inicia uma conversa.",
    campos: [
      { chave: "canais", label: "Canais", tipo: "select", default: "todos", opcoes: [
        { value: "todos", label: "Todos" }, { value: "site", label: "Site" },
        { value: "whatsapp", label: "WhatsApp" }, { value: "instagram", label: "Instagram" }] },
    ],
    inputs: 0, outputs: [{ id: "out" }],
  },
  {
    tipo: "gatilho_palavra", label: "Palavra-chave", categoria: "gatilho",
    cor: "border-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30",
    descricao: "Dispara quando a mensagem contém qualquer palavra listada.",
    campos: [{ chave: "palavras", label: "Palavras", tipo: "keywords", hint: "Separe por vírgula" }],
    inputs: 0, outputs: [{ id: "out" }],
  },
  {
    tipo: "gatilho_evento", label: "Evento do sistema", categoria: "gatilho",
    cor: "border-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30",
    descricao: "Dispara a partir de eventos (pedido criado, abandono, aniversário).",
    campos: [{ chave: "evento", label: "Evento", tipo: "select", default: "pedido_criado", opcoes: [
      { value: "pedido_criado", label: "Pedido criado" },
      { value: "pedido_pago", label: "Pedido pago" },
      { value: "abandono_carrinho", label: "Abandono de carrinho" },
      { value: "aniversario", label: "Aniversário do cliente" },
      { value: "lead_inativo", label: "Lead inativo (30 dias)" }] }],
    inputs: 0, outputs: [{ id: "out" }],
  },
  {
    tipo: "gatilho_intencao", label: "Intenção detectada", categoria: "gatilho",
    cor: "border-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30",
    descricao: "Dispara quando a IA detecta uma intenção específica.",
    campos: [{ chave: "intencao", label: "Intenção", tipo: "select", default: "compra", opcoes: [
      { value: "compra", label: "Compra" }, { value: "duvida", label: "Dúvida" },
      { value: "reclamacao", label: "Reclamação" }, { value: "objecao_preco", label: "Objeção (preço)" }] }],
    inputs: 0, outputs: [{ id: "out" }],
  },

  // ============ MENSAGENS ============
  {
    tipo: "msg_texto", label: "Enviar texto", categoria: "mensagem",
    cor: "border-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30",
    descricao: "Envia mensagem de texto. Suporta {{variaveis}}.",
    campos: [{ chave: "texto", label: "Mensagem", tipo: "textarea", vars: true, placeholder: "Oi {{cliente.nome}}!" }],
    inputs: 1, outputs: [{ id: "out" }],
  },
  {
    tipo: "msg_ia", label: "Resposta da IA (Juliana)", categoria: "mensagem",
    cor: "border-violet-500", bg: "bg-violet-50 dark:bg-violet-950/30",
    descricao: "Deixa a Juliana responder com base no contexto + instrução adicional.",
    campos: [{ chave: "instrucao", label: "Instrução adicional", tipo: "textarea", vars: true,
      placeholder: "Foque em peças de prata abaixo de R$200." }],
    inputs: 1, outputs: [{ id: "out" }],
  },
  {
    tipo: "msg_imagem", label: "Enviar imagem", categoria: "mensagem",
    cor: "border-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30",
    descricao: "Envia uma imagem por URL com legenda opcional.",
    campos: [
      { chave: "url", label: "URL da imagem", tipo: "text", vars: true, placeholder: "https://..." },
      { chave: "legenda", label: "Legenda", tipo: "textarea", vars: true }],
    inputs: 1, outputs: [{ id: "out" }],
  },
  {
    tipo: "msg_audio", label: "Enviar áudio", categoria: "mensagem",
    cor: "border-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30",
    descricao: "Envia áudio por URL.",
    campos: [{ chave: "url", label: "URL do áudio", tipo: "text", vars: true }],
    inputs: 1, outputs: [{ id: "out" }],
  },
  {
    tipo: "msg_documento", label: "Enviar documento", categoria: "mensagem",
    cor: "border-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30",
    descricao: "Envia PDF/documento por URL.",
    campos: [
      { chave: "url", label: "URL", tipo: "text", vars: true },
      { chave: "nome_arquivo", label: "Nome do arquivo", tipo: "text", vars: true }],
    inputs: 1, outputs: [{ id: "out" }],
  },
  {
    tipo: "msg_localizacao", label: "Enviar localização", categoria: "mensagem",
    cor: "border-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30",
    descricao: "Envia endereço da loja física ou ponto de retirada.",
    campos: [
      { chave: "endereco", label: "Endereço completo", tipo: "textarea", vars: true },
      { chave: "latitude", label: "Latitude", tipo: "text" },
      { chave: "longitude", label: "Longitude", tipo: "text" }],
    inputs: 1, outputs: [{ id: "out" }],
  },
  {
    tipo: "msg_botoes", label: "Botões de resposta rápida", categoria: "mensagem",
    cor: "border-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30",
    descricao: "Mostra até 3 botões. Cada um vira uma saída separada.",
    campos: [
      { chave: "texto", label: "Pergunta", tipo: "textarea", vars: true },
      { chave: "btn1", label: "Botão 1", tipo: "text", default: "Sim" },
      { chave: "btn2", label: "Botão 2", tipo: "text", default: "Não" },
      { chave: "btn3", label: "Botão 3 (opcional)", tipo: "text" }],
    inputs: 1, outputs: [
      { id: "btn1", label: "Botão 1" }, { id: "btn2", label: "Botão 2" },
      { id: "btn3", label: "Botão 3" }, { id: "timeout", label: "Timeout" }],
  },
  {
    tipo: "msg_lista", label: "Menu de opções", categoria: "mensagem",
    cor: "border-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30",
    descricao: "Menu numerado com até 8 opções.",
    campos: [
      { chave: "titulo", label: "Título", tipo: "text", vars: true },
      { chave: "opcoes", label: "Opções (uma por linha)", tipo: "textarea",
        hint: "Cada linha vira uma saída." }],
    inputs: 1, outputs: [
      { id: "op1", label: "1" }, { id: "op2", label: "2" }, { id: "op3", label: "3" },
      { id: "op4", label: "4" }, { id: "outro", label: "Outro" }],
  },
  {
    tipo: "msg_produto", label: "Mostrar produtos", categoria: "mensagem",
    cor: "border-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30",
    descricao: "Busca e apresenta produtos filtrando por categoria/gênero/preço.",
    campos: [
      { chave: "categoria", label: "Categoria", tipo: "text", placeholder: "anel, colar..." },
      { chave: "genero", label: "Gênero", tipo: "select", default: "todos", opcoes: [
        { value: "todos", label: "Todos" }, { value: "feminino", label: "Feminino" }, { value: "masculino", label: "Masculino" }] },
      { chave: "preco_max", label: "Preço máximo (R$)", tipo: "number" },
      { chave: "quantidade", label: "Quantos mostrar", tipo: "number", default: 3 },
      { chave: "ordem", label: "Ordenar por", tipo: "select", default: "destaque", opcoes: [
        { value: "destaque", label: "Destaque" }, { value: "preco_asc", label: "Menor preço" },
        { value: "preco_desc", label: "Maior preço" }, { value: "novidade", label: "Novidades" }] }],
    inputs: 1, outputs: [{ id: "out", label: "OK" }, { id: "vazio", label: "Sem resultado" }],
  },
  {
    tipo: "msg_typing", label: "Indicador digitando…", categoria: "mensagem",
    cor: "border-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30",
    descricao: "Mostra 'digitando…' por X segundos antes da próxima mensagem.",
    campos: [{ chave: "segundos", label: "Segundos", tipo: "number", default: 2 }],
    inputs: 1, outputs: [{ id: "out" }],
  },

  // ============ CAPTURA ============
  {
    tipo: "capturar_resposta", label: "Aguardar resposta", categoria: "captura",
    cor: "border-amber-500", bg: "bg-amber-50 dark:bg-amber-950/30",
    descricao: "Pausa o fluxo e salva a resposta numa variável.",
    campos: [
      { chave: "variavel", label: "Salvar em variável", tipo: "text", placeholder: "ocasiao" },
      { chave: "timeout_horas", label: "Timeout (horas)", tipo: "number", default: 24 }],
    inputs: 1, outputs: [{ id: "out", label: "Respondeu" }, { id: "timeout", label: "Timeout" }],
  },
  {
    tipo: "capturar_dados", label: "Capturar dado do cliente", categoria: "captura",
    cor: "border-amber-500", bg: "bg-amber-50 dark:bg-amber-950/30",
    descricao: "Pergunta um dado e valida automaticamente.",
    campos: [
      { chave: "campo", label: "Campo", tipo: "select", default: "nome", opcoes: [
        { value: "nome", label: "Nome" }, { value: "email", label: "Email" },
        { value: "telefone", label: "Telefone" }, { value: "data_aniversario", label: "Aniversário" }] },
      { chave: "pergunta", label: "Pergunta", tipo: "textarea", vars: true }],
    inputs: 1, outputs: [{ id: "out", label: "OK" }, { id: "invalido", label: "Inválido" }],
  },
  {
    tipo: "capturar_cep", label: "Capturar CEP", categoria: "captura",
    cor: "border-amber-500", bg: "bg-amber-50 dark:bg-amber-950/30",
    descricao: "Pergunta o CEP, valida e busca o endereço no ViaCEP.",
    campos: [{ chave: "pergunta", label: "Pergunta", tipo: "textarea", vars: true,
      default: "Me passa seu CEP pra eu calcular o frete?" }],
    inputs: 1, outputs: [{ id: "out", label: "Válido" }, { id: "invalido", label: "Inválido" }],
  },
  {
    tipo: "capturar_cpf", label: "Capturar CPF", categoria: "captura",
    cor: "border-amber-500", bg: "bg-amber-50 dark:bg-amber-950/30",
    descricao: "Pergunta CPF e valida o dígito verificador.",
    campos: [{ chave: "pergunta", label: "Pergunta", tipo: "textarea", vars: true,
      default: "Pra emitir a nota, me passa seu CPF?" }],
    inputs: 1, outputs: [{ id: "out", label: "Válido" }, { id: "invalido", label: "Inválido" }],
  },
  {
    tipo: "capturar_midia", label: "Capturar foto/áudio", categoria: "captura",
    cor: "border-amber-500", bg: "bg-amber-50 dark:bg-amber-950/30",
    descricao: "Aguarda o cliente enviar uma mídia.",
    campos: [
      { chave: "tipo_midia", label: "Tipo", tipo: "select", default: "imagem", opcoes: [
        { value: "imagem", label: "Imagem" }, { value: "audio", label: "Áudio" },
        { value: "qualquer", label: "Qualquer" }] },
      { chave: "pergunta", label: "Pergunta", tipo: "textarea", vars: true }],
    inputs: 1, outputs: [{ id: "out" }],
  },

  // ============ LÓGICA ============
  {
    tipo: "condicao", label: "Condição (Se)", categoria: "logica",
    cor: "border-rose-500", bg: "bg-rose-50 dark:bg-rose-950/30",
    descricao: "Avalia uma variável e ramifica em Sim/Não.",
    campos: [
      { chave: "variavel", label: "Variável", tipo: "text", vars: true,
        placeholder: "cliente.temperatura_lead ou var.ocasiao" },
      { chave: "operador", label: "Operador", tipo: "select", default: "contem", opcoes: [
        { value: "igual", label: "Igual a" }, { value: "diferente", label: "Diferente de" },
        { value: "contem", label: "Contém" }, { value: "nao_contem", label: "Não contém" },
        { value: "maior", label: "Maior que" }, { value: "menor", label: "Menor que" },
        { value: "vazio", label: "Está vazio" }, { value: "preenchido", label: "Está preenchido" },
        { value: "regex", label: "Bate regex" }] },
      { chave: "valor", label: "Valor", tipo: "text", vars: true }],
    inputs: 1, outputs: [{ id: "sim", label: "Sim" }, { id: "nao", label: "Não" }],
  },
  {
    tipo: "condicao_multipla", label: "Condição múltipla (E/OU)", categoria: "logica",
    cor: "border-rose-500", bg: "bg-rose-50 dark:bg-rose-950/30",
    descricao: "Combina várias condições com E/OU.",
    campos: [
      { chave: "modo", label: "Modo", tipo: "select", default: "e", opcoes: [
        { value: "e", label: "Todas (E)" }, { value: "ou", label: "Qualquer (OU)" }] },
      { chave: "regras", label: "Regras (JSON)", tipo: "json",
        default: '[{"var":"cliente.temperatura_lead","op":"igual","val":"quente"}]',
        hint: 'Lista: [{"var":"x","op":"igual","val":"y"}]' }],
    inputs: 1, outputs: [{ id: "sim", label: "Sim" }, { id: "nao", label: "Não" }],
  },
  {
    tipo: "switch", label: "Switch (roteador)", categoria: "logica",
    cor: "border-rose-500", bg: "bg-rose-50 dark:bg-rose-950/30",
    descricao: "Roteia por valor de uma variável (até 5 caminhos).",
    campos: [
      { chave: "variavel", label: "Variável", tipo: "text", vars: true },
      { chave: "caso1", label: "Caso 1", tipo: "text" },
      { chave: "caso2", label: "Caso 2", tipo: "text" },
      { chave: "caso3", label: "Caso 3", tipo: "text" },
      { chave: "caso4", label: "Caso 4", tipo: "text" },
      { chave: "caso5", label: "Caso 5", tipo: "text" }],
    inputs: 1, outputs: [
      { id: "c1", label: "1" }, { id: "c2", label: "2" }, { id: "c3", label: "3" },
      { id: "c4", label: "4" }, { id: "c5", label: "5" }, { id: "default", label: "Padrão" }],
  },
  {
    tipo: "aguardar", label: "Aguardar tempo", categoria: "logica",
    cor: "border-rose-500", bg: "bg-rose-50 dark:bg-rose-950/30",
    descricao: "Pausa o fluxo por um período.",
    campos: [
      { chave: "quantidade", label: "Quantidade", tipo: "number", default: 1 },
      { chave: "unidade", label: "Unidade", tipo: "select", default: "minutos", opcoes: [
        { value: "segundos", label: "Segundos" }, { value: "minutos", label: "Minutos" },
        { value: "horas", label: "Horas" }, { value: "dias", label: "Dias" }] }],
    inputs: 1, outputs: [{ id: "out" }],
  },
  {
    tipo: "random_ab", label: "Random / A/B Test", categoria: "logica",
    cor: "border-rose-500", bg: "bg-rose-50 dark:bg-rose-950/30",
    descricao: "Divide o fluxo aleatoriamente em duas saídas (determinístico por cliente).",
    campos: [{ chave: "porcentagem_a", label: "% para caminho A", tipo: "number", default: 50 }],
    inputs: 1, outputs: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
  },
  {
    tipo: "calculadora", label: "Calculadora", categoria: "logica",
    cor: "border-rose-500", bg: "bg-rose-50 dark:bg-rose-950/30",
    descricao: "Executa operação matemática e salva em variável.",
    campos: [
      { chave: "variavel_destino", label: "Salvar em", tipo: "text", placeholder: "total" },
      { chave: "expressao", label: "Expressão", tipo: "text", vars: true,
        placeholder: "{{var.subtotal}} + {{var.frete}}" }],
    inputs: 1, outputs: [{ id: "out" }],
  },
  {
    tipo: "verificar_horario", label: "Verificar horário comercial", categoria: "logica",
    cor: "border-rose-500", bg: "bg-rose-50 dark:bg-rose-950/30",
    descricao: "Sim se estamos dentro do horário comercial configurado.",
    campos: [],
    inputs: 1, outputs: [{ id: "sim", label: "Dentro" }, { id: "nao", label: "Fora" }],
  },
  {
    tipo: "verificar_dia", label: "Verificar dia da semana", categoria: "logica",
    cor: "border-rose-500", bg: "bg-rose-50 dark:bg-rose-950/30",
    descricao: "Ramifica por dia(s) da semana selecionado(s).",
    campos: [{ chave: "dias", label: "Dias (0-6, vírgula)", tipo: "text",
      hint: "0=Dom, 6=Sáb. Ex: 1,2,3,4,5", default: "1,2,3,4,5" }],
    inputs: 1, outputs: [{ id: "sim", label: "Dia ativo" }, { id: "nao", label: "Outro dia" }],
  },
  {
    tipo: "contador", label: "Contador", categoria: "logica",
    cor: "border-rose-500", bg: "bg-rose-50 dark:bg-rose-950/30",
    descricao: "Incrementa/decrementa uma variável numérica.",
    campos: [
      { chave: "variavel", label: "Variável", tipo: "text" },
      { chave: "operacao", label: "Operação", tipo: "select", default: "incrementar", opcoes: [
        { value: "incrementar", label: "+1" }, { value: "decrementar", label: "-1" },
        { value: "set", label: "Definir valor" }, { value: "reset", label: "Zerar" }] },
      { chave: "valor", label: "Valor (se Definir)", tipo: "number" }],
    inputs: 1, outputs: [{ id: "out" }],
  },
  {
    tipo: "loop", label: "Loop (repetir)", categoria: "logica",
    cor: "border-rose-500", bg: "bg-rose-50 dark:bg-rose-950/30",
    descricao: "Volta para um nó anterior até atingir limite ou condição.",
    campos: [
      { chave: "max_iteracoes", label: "Máximo de voltas", tipo: "number", default: 5 },
      { chave: "no_destino", label: "ID do nó destino", tipo: "node-ref" }],
    inputs: 1, outputs: [{ id: "continuar", label: "Voltar" }, { id: "fim", label: "Fim" }],
  },

  // ============ IA ============
  {
    tipo: "ia_classificar", label: "Classificar intenção", categoria: "ia",
    cor: "border-violet-500", bg: "bg-violet-50 dark:bg-violet-950/30",
    descricao: "IA classifica a última mensagem em categorias customizadas.",
    campos: [{ chave: "categorias", label: "Categorias", tipo: "keywords",
      default: "compra,duvida,reclamacao,saudacao" }],
    inputs: 1, outputs: [
      { id: "compra", label: "Compra" }, { id: "duvida", label: "Dúvida" },
      { id: "reclamacao", label: "Reclamação" }, { id: "saudacao", label: "Saudação" },
      { id: "outro", label: "Outro" }],
  },
  {
    tipo: "ia_extrair", label: "Extrair entidades", categoria: "ia",
    cor: "border-violet-500", bg: "bg-violet-50 dark:bg-violet-950/30",
    descricao: "Extrai dados estruturados (produto, cor, tamanho, etc) e salva em variáveis.",
    campos: [{ chave: "campos", label: "Campos a extrair", tipo: "keywords",
      default: "produto,cor,tamanho", hint: "Cada campo vira uma var.X" }],
    inputs: 1, outputs: [{ id: "out", label: "OK" }, { id: "vazio", label: "Nada extraído" }],
  },
  {
    tipo: "ia_sentimento", label: "Análise de sentimento", categoria: "ia",
    cor: "border-violet-500", bg: "bg-violet-50 dark:bg-violet-950/30",
    descricao: "Classifica o tom da última mensagem.",
    campos: [],
    inputs: 1, outputs: [
      { id: "positivo", label: "Positivo" }, { id: "neutro", label: "Neutro" },
      { id: "negativo", label: "Negativo" }],
  },
  {
    tipo: "ia_resumir", label: "Resumir conversa", categoria: "ia",
    cor: "border-violet-500", bg: "bg-violet-50 dark:bg-violet-950/30",
    descricao: "Gera resumo da conversa e salva em variável (útil antes de escalar).",
    campos: [{ chave: "variavel", label: "Salvar em", tipo: "text", default: "resumo" }],
    inputs: 1, outputs: [{ id: "out" }],
  },
  {
    tipo: "ia_traduzir", label: "Traduzir", categoria: "ia",
    cor: "border-violet-500", bg: "bg-violet-50 dark:bg-violet-950/30",
    descricao: "Traduz texto/última mensagem para o idioma alvo.",
    campos: [
      { chave: "texto", label: "Texto", tipo: "textarea", vars: true,
        placeholder: "{{ultima_mensagem}}" },
      { chave: "idioma", label: "Idioma alvo", tipo: "text", default: "en" },
      { chave: "variavel", label: "Salvar em", tipo: "text", default: "traducao" }],
    inputs: 1, outputs: [{ id: "out" }],
  },

  // ============ DADOS / CRM ============
  {
    tipo: "atualizar_cliente", label: "Atualizar campo do cliente", categoria: "dados",
    cor: "border-cyan-500", bg: "bg-cyan-50 dark:bg-cyan-950/30",
    descricao: "Salva ou atualiza informação no cadastro do cliente.",
    campos: [
      { chave: "campo", label: "Campo", tipo: "select", default: "temperatura_lead", opcoes: [
        { value: "temperatura_lead", label: "Temperatura" },
        { value: "categoria_favorita", label: "Categoria favorita" },
        { value: "estilo_preferido", label: "Estilo preferido" },
        { value: "budget_aproximado", label: "Budget" },
        { value: "genero_interesse", label: "Gênero de interesse" },
        { value: "preferencias", label: "Preferências (livre)" }] },
      { chave: "valor", label: "Valor", tipo: "text", vars: true }],
    inputs: 1, outputs: [{ id: "out" }],
  },
  {
    tipo: "consultar_produto", label: "Consultar produto", categoria: "dados",
    cor: "border-cyan-500", bg: "bg-cyan-50 dark:bg-cyan-950/30",
    descricao: "Busca produto por nome/categoria e salva info em variáveis.",
    campos: [
      { chave: "termo", label: "Termo de busca", tipo: "text", vars: true },
      { chave: "variavel", label: "Salvar em (prefixo)", tipo: "text", default: "produto" }],
    inputs: 1, outputs: [{ id: "out", label: "Encontrado" }, { id: "nao_encontrado", label: "Não achou" }],
  },
  {
    tipo: "consultar_pedido", label: "Consultar pedido", categoria: "dados",
    cor: "border-cyan-500", bg: "bg-cyan-50 dark:bg-cyan-950/30",
    descricao: "Busca pedido por número e salva status nas variáveis.",
    campos: [{ chave: "numero", label: "Nº do pedido", tipo: "text", vars: true }],
    inputs: 1, outputs: [{ id: "out", label: "OK" }, { id: "nao_encontrado", label: "Não achou" }],
  },
  {
    tipo: "registrar_funil", label: "Registrar etapa no funil", categoria: "dados",
    cor: "border-cyan-500", bg: "bg-cyan-50 dark:bg-cyan-950/30",
    descricao: "Marca etapa do funil de conversão.",
    campos: [{ chave: "etapa", label: "Etapa", tipo: "select", default: "descoberta", opcoes: [
      { value: "descoberta", label: "Descoberta" }, { value: "interesse", label: "Interesse" },
      { value: "consideracao", label: "Consideração" }, { value: "compra", label: "Compra" },
      { value: "pos_venda", label: "Pós-venda" }] }],
    inputs: 1, outputs: [{ id: "out" }],
  },
  {
    tipo: "set_variavel", label: "Definir variável", categoria: "dados",
    cor: "border-cyan-500", bg: "bg-cyan-50 dark:bg-cyan-950/30",
    descricao: "Cria/atualiza uma variável do fluxo.",
    campos: [
      { chave: "nome", label: "Nome", tipo: "text", placeholder: "minha_var" },
      { chave: "valor", label: "Valor", tipo: "text", vars: true }],
    inputs: 1, outputs: [{ id: "out" }],
  },

  // ============ VENDAS ============
  {
    tipo: "oferecer_cupom", label: "Oferecer cupom", categoria: "vendas",
    cor: "border-yellow-500", bg: "bg-yellow-50 dark:bg-yellow-950/30",
    descricao: "Oferece o cupom de negociação respeitando regras configuradas.",
    campos: [{ chave: "forcar", label: "Forçar mesmo se já usou", tipo: "boolean", default: false }],
    inputs: 1, outputs: [{ id: "ofertado", label: "Ofertado" }, { id: "negado", label: "Negado" }],
  },
  {
    tipo: "aplicar_cupom", label: "Aplicar cupom", categoria: "vendas",
    cor: "border-yellow-500", bg: "bg-yellow-50 dark:bg-yellow-950/30",
    descricao: "Valida cupom informado e calcula desconto.",
    campos: [{ chave: "codigo", label: "Código (ou variável)", tipo: "text", vars: true }],
    inputs: 1, outputs: [{ id: "valido", label: "Válido" }, { id: "invalido", label: "Inválido" }],
  },
  {
    tipo: "calcular_frete", label: "Calcular frete", categoria: "vendas",
    cor: "border-yellow-500", bg: "bg-yellow-50 dark:bg-yellow-950/30",
    descricao: "Calcula frete a partir do CEP do cliente (var.cep).",
    campos: [{ chave: "variavel", label: "Salvar em", tipo: "text", default: "frete" }],
    inputs: 1, outputs: [{ id: "out" }],
  },
  {
    tipo: "criar_pedido", label: "Criar pedido", categoria: "vendas",
    cor: "border-yellow-500", bg: "bg-yellow-50 dark:bg-yellow-950/30",
    descricao: "Gera pedido com produtos já apresentados na conversa.",
    campos: [
      { chave: "forma_pagamento", label: "Forma de pagamento", tipo: "select", default: "pix", opcoes: [
        { value: "pix", label: "PIX" }, { value: "link", label: "Link de pagamento" },
        { value: "entrega", label: "Pagar na entrega" }] }],
    inputs: 1, outputs: [{ id: "ok", label: "Criado" }, { id: "erro", label: "Erro" }],
  },
  {
    tipo: "link_pagamento", label: "Gerar link de pagamento", categoria: "vendas",
    cor: "border-yellow-500", bg: "bg-yellow-50 dark:bg-yellow-950/30",
    descricao: "Gera link PIX ou de checkout e envia para o cliente.",
    campos: [{ chave: "metodo", label: "Método", tipo: "select", default: "pix", opcoes: [
      { value: "pix", label: "PIX" }, { value: "cartao", label: "Cartão" }] }],
    inputs: 1, outputs: [{ id: "out" }],
  },
  {
    tipo: "solicitar_avaliacao", label: "Solicitar avaliação", categoria: "vendas",
    cor: "border-yellow-500", bg: "bg-yellow-50 dark:bg-yellow-950/30",
    descricao: "Pede nota de 1-5 e comentário do cliente.",
    campos: [{ chave: "mensagem", label: "Mensagem", tipo: "textarea", vars: true,
      default: "De 1 a 5, que nota você dá pra sua experiência?" }],
    inputs: 1, outputs: [{ id: "out" }],
  },

  // ============ INTEGRAÇÃO ============
  {
    tipo: "webhook", label: "Disparar webhook", categoria: "integracao",
    cor: "border-slate-500", bg: "bg-slate-50 dark:bg-slate-950/30",
    descricao: "Chamada HTTP para sistema externo.",
    campos: [
      { chave: "url", label: "URL", tipo: "text", vars: true, placeholder: "https://..." },
      { chave: "metodo", label: "Método", tipo: "select", default: "POST", opcoes: [
        { value: "GET", label: "GET" }, { value: "POST", label: "POST" },
        { value: "PUT", label: "PUT" }, { value: "DELETE", label: "DELETE" }] },
      { chave: "headers", label: "Headers (JSON)", tipo: "json", vars: true,
        placeholder: '{"Authorization":"Bearer ..."}' },
      { chave: "body", label: "Body (JSON)", tipo: "json", vars: true },
      { chave: "mapear", label: "Mapear resposta p/ var", tipo: "text",
        placeholder: "var_destino", hint: "Salva o JSON retornado nessa variável." }],
    inputs: 1, outputs: [{ id: "sucesso", label: "200-299" }, { id: "erro", label: "Erro" }],
  },
  {
    tipo: "enviar_email", label: "Enviar email", categoria: "integracao",
    cor: "border-slate-500", bg: "bg-slate-50 dark:bg-slate-950/30",
    descricao: "Envia email transacional.",
    campos: [
      { chave: "para", label: "Para", tipo: "text", vars: true,
        default: "{{cliente.contato}}" },
      { chave: "assunto", label: "Assunto", tipo: "text", vars: true },
      { chave: "corpo", label: "Corpo (HTML)", tipo: "textarea", vars: true }],
    inputs: 1, outputs: [{ id: "out" }, { id: "erro", label: "Erro" }],
  },
  {
    tipo: "agendar_followup", label: "Agendar follow-up", categoria: "integracao",
    cor: "border-slate-500", bg: "bg-slate-50 dark:bg-slate-950/30",
    descricao: "Programa envio de mensagem para o futuro.",
    campos: [
      { chave: "horas", label: "Em quantas horas", tipo: "number", default: 24 },
      { chave: "mensagem", label: "Mensagem", tipo: "textarea", vars: true }],
    inputs: 1, outputs: [{ id: "out" }],
  },
  {
    tipo: "sub_fluxo", label: "Disparar sub-fluxo", categoria: "integracao",
    cor: "border-slate-500", bg: "bg-slate-50 dark:bg-slate-950/30",
    descricao: "Executa outro fluxo e retorna ao caller.",
    campos: [{ chave: "fluxo_id", label: "ID do fluxo", tipo: "text" }],
    inputs: 1, outputs: [{ id: "out" }],
  },

  // ============ CONTROLE ============
  {
    tipo: "escalar_humano", label: "Transferir p/ humano", categoria: "controle",
    cor: "border-orange-500", bg: "bg-orange-50 dark:bg-orange-950/30",
    descricao: "Marca conversa como precisa de humano e envia mensagem de transição.",
    campos: [
      { chave: "motivo", label: "Motivo", tipo: "text" },
      { chave: "mensagem", label: "Mensagem", tipo: "textarea", vars: true,
        default: "Deixa eu chamar minha colega que entende mais desse assunto, tá? Um segundo!" }],
    inputs: 1, outputs: [],
  },
  {
    tipo: "pausar_fluxo", label: "Pausar fluxo (IA livre)", categoria: "controle",
    cor: "border-orange-500", bg: "bg-orange-50 dark:bg-orange-950/30",
    descricao: "Sai do fluxo e devolve a conversa para a Juliana responder livremente.",
    campos: [],
    inputs: 1, outputs: [],
  },
  {
    tipo: "encerrar", label: "Encerrar conversa", categoria: "controle",
    cor: "border-orange-500", bg: "bg-orange-50 dark:bg-orange-950/30",
    descricao: "Encerra o fluxo. Nova mensagem reinicia.",
    campos: [{ chave: "mensagem_final", label: "Despedida", tipo: "textarea", vars: true }],
    inputs: 1, outputs: [],
  },
  {
    tipo: "goto", label: "Pular para nó", categoria: "controle",
    cor: "border-orange-500", bg: "bg-orange-50 dark:bg-orange-950/30",
    descricao: "Vai diretamente para outro nó (use com moderação).",
    campos: [{ chave: "no_destino", label: "ID do nó destino", tipo: "node-ref" }],
    inputs: 1, outputs: [],
  },

  // ============ VISUAL ============
  {
    tipo: "comentario", label: "Comentário / Nota", categoria: "visual",
    cor: "border-zinc-400", bg: "bg-zinc-50 dark:bg-zinc-900/50",
    descricao: "Bloco de anotação (não executa nada).",
    campos: [{ chave: "texto", label: "Anotação", tipo: "textarea" }],
    inputs: 0, outputs: [],
  },
];

export const NODE_DEF_BY_TYPE: Record<string, NodeDef> = Object.fromEntries(
  NODE_DEFS.map((d) => [d.tipo, d]),
);

export const CATEGORIAS = [
  { chave: "gatilho",    label: "Gatilhos",     cor: "text-emerald-600" },
  { chave: "mensagem",   label: "Mensagens",    cor: "text-blue-600" },
  { chave: "captura",    label: "Capturar",     cor: "text-amber-600" },
  { chave: "logica",     label: "Lógica",       cor: "text-rose-600" },
  { chave: "ia",         label: "IA",           cor: "text-violet-600" },
  { chave: "dados",      label: "Dados / CRM",  cor: "text-cyan-600" },
  { chave: "vendas",     label: "Vendas",       cor: "text-yellow-600" },
  { chave: "integracao", label: "Integração",   cor: "text-slate-600" },
  { chave: "controle",   label: "Controle",     cor: "text-orange-600" },
  { chave: "visual",     label: "Visual",       cor: "text-zinc-500" },
] as const;

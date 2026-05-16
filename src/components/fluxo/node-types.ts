// Definições dos 15 tipos de nós da Fase 1 do construtor de fluxos.
// Cada tipo tem: chave, label, categoria, cor, ícone (lucide), schema de campos.

export type CampoTipo = "text" | "textarea" | "number" | "select" | "boolean" | "keywords" | "node-ref";

export type CampoDef = {
  chave: string;
  label: string;
  tipo: CampoTipo;
  placeholder?: string;
  opcoes?: { value: string; label: string }[];
  multiline?: boolean;
  default?: any;
  hint?: string;
};

export type NodeDef = {
  tipo: string;
  label: string;
  categoria: "gatilho" | "mensagem" | "captura" | "logica" | "ia" | "dados" | "vendas" | "integracao" | "controle";
  cor: string;          // classe Tailwind para a borda do nó
  bg: string;           // classe Tailwind para o fundo
  descricao: string;
  campos: CampoDef[];
  inputs: number;       // 0 = sem entrada (gatilho)
  outputs: { id: string; label?: string }[]; // múltiplos handles
};

export const NODE_DEFS: NodeDef[] = [
  // ===== GATILHOS =====
  {
    tipo: "gatilho_inicio",
    label: "Início",
    categoria: "gatilho",
    cor: "border-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    descricao: "Ponto de entrada quando o cliente inicia a conversa.",
    campos: [
      { chave: "canais", label: "Canais", tipo: "select", default: "todos", opcoes: [
        { value: "todos", label: "Todos" },
        { value: "site", label: "Apenas Site" },
        { value: "whatsapp", label: "Apenas WhatsApp" },
        { value: "instagram", label: "Apenas Instagram" },
      ]},
    ],
    inputs: 0,
    outputs: [{ id: "out" }],
  },
  {
    tipo: "gatilho_palavra",
    label: "Palavra-chave",
    categoria: "gatilho",
    cor: "border-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    descricao: "Entra no fluxo quando a mensagem do cliente contém uma das palavras.",
    campos: [
      { chave: "palavras", label: "Palavras-chave", tipo: "keywords", hint: "Separe por vírgula" },
    ],
    inputs: 0,
    outputs: [{ id: "out" }],
  },

  // ===== MENSAGENS =====
  {
    tipo: "msg_texto",
    label: "Enviar mensagem",
    categoria: "mensagem",
    cor: "border-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    descricao: "Envia um texto fixo. Suporta variáveis: {{cliente.nome}}, {{ultima_mensagem}}.",
    campos: [
      { chave: "texto", label: "Texto", tipo: "textarea", placeholder: "Oi {{cliente.nome}}, tudo bem?" },
    ],
    inputs: 1,
    outputs: [{ id: "out" }],
  },
  {
    tipo: "msg_ia",
    label: "Resposta por IA",
    categoria: "mensagem",
    cor: "border-violet-500",
    bg: "bg-violet-50 dark:bg-violet-950/30",
    descricao: "Deixa a Juliana (LLM) responder usando todo o contexto da conversa + instrução extra.",
    campos: [
      { chave: "instrucao", label: "Instrução adicional", tipo: "textarea", placeholder: "Foque em apresentar peças de prata abaixo de R$200." },
    ],
    inputs: 1,
    outputs: [{ id: "out" }],
  },
  {
    tipo: "msg_produto",
    label: "Mostrar produtos",
    categoria: "mensagem",
    cor: "border-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    descricao: "Mostra produtos do catálogo filtrando por categoria/gênero/preço.",
    campos: [
      { chave: "categoria", label: "Categoria", tipo: "text", placeholder: "anel, colar, brinco..." },
      { chave: "genero", label: "Gênero", tipo: "select", default: "todos", opcoes: [
        { value: "todos", label: "Todos" }, { value: "feminino", label: "Feminino" }, { value: "masculino", label: "Masculino" },
      ]},
      { chave: "preco_max", label: "Preço máximo (R$)", tipo: "number" },
      { chave: "quantidade", label: "Quantos mostrar", tipo: "number", default: 3 },
    ],
    inputs: 1,
    outputs: [{ id: "out" }],
  },

  // ===== CAPTURA =====
  {
    tipo: "capturar_resposta",
    label: "Aguardar resposta",
    categoria: "captura",
    cor: "border-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    descricao: "Pausa o fluxo até o cliente responder. Salva o texto em uma variável.",
    campos: [
      { chave: "variavel", label: "Salvar em variável", tipo: "text", placeholder: "resposta_ocasiao" },
      { chave: "timeout_horas", label: "Timeout (horas)", tipo: "number", default: 24 },
    ],
    inputs: 1,
    outputs: [
      { id: "out", label: "Respondeu" },
      { id: "timeout", label: "Timeout" },
    ],
  },
  {
    tipo: "capturar_dados",
    label: "Capturar dado do cliente",
    categoria: "captura",
    cor: "border-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    descricao: "Pergunta um dado específico (nome, email, telefone) e valida.",
    campos: [
      { chave: "campo", label: "Campo", tipo: "select", default: "nome", opcoes: [
        { value: "nome", label: "Nome" }, { value: "email", label: "Email" },
        { value: "telefone", label: "Telefone" }, { value: "data_aniversario", label: "Aniversário" },
      ]},
      { chave: "pergunta", label: "Pergunta", tipo: "textarea", placeholder: "Como posso te chamar?" },
    ],
    inputs: 1,
    outputs: [{ id: "out" }],
  },

  // ===== LÓGICA =====
  {
    tipo: "condicao",
    label: "Condição (Se)",
    categoria: "logica",
    cor: "border-rose-500",
    bg: "bg-rose-50 dark:bg-rose-950/30",
    descricao: "Avalia uma condição e ramifica em Sim/Não.",
    campos: [
      { chave: "variavel", label: "Variável", tipo: "text", placeholder: "cliente.temperatura ou resposta_ocasiao" },
      { chave: "operador", label: "Operador", tipo: "select", default: "contem", opcoes: [
        { value: "igual", label: "Igual a" },
        { value: "contem", label: "Contém" },
        { value: "maior", label: "Maior que" },
        { value: "menor", label: "Menor que" },
        { value: "vazio", label: "Está vazio" },
        { value: "regex", label: "Bate regex" },
      ]},
      { chave: "valor", label: "Valor", tipo: "text" },
    ],
    inputs: 1,
    outputs: [
      { id: "sim", label: "Sim" },
      { id: "nao", label: "Não" },
    ],
  },
  {
    tipo: "aguardar",
    label: "Aguardar tempo",
    categoria: "logica",
    cor: "border-rose-500",
    bg: "bg-rose-50 dark:bg-rose-950/30",
    descricao: "Pausa o fluxo por um período antes de continuar.",
    campos: [
      { chave: "quantidade", label: "Quantidade", tipo: "number", default: 1 },
      { chave: "unidade", label: "Unidade", tipo: "select", default: "minutos", opcoes: [
        { value: "segundos", label: "Segundos" }, { value: "minutos", label: "Minutos" },
        { value: "horas", label: "Horas" }, { value: "dias", label: "Dias" },
      ]},
    ],
    inputs: 1,
    outputs: [{ id: "out" }],
  },

  // ===== IA =====
  {
    tipo: "ia_classificar",
    label: "Classificar intenção",
    categoria: "ia",
    cor: "border-violet-500",
    bg: "bg-violet-50 dark:bg-violet-950/30",
    descricao: "Usa IA para classificar a intenção da última mensagem do cliente.",
    campos: [
      { chave: "categorias", label: "Categorias", tipo: "keywords", default: "compra,duvida,reclamacao,saudacao",
        hint: "Cada categoria vira uma saída" },
    ],
    inputs: 1,
    outputs: [
      { id: "compra", label: "Compra" },
      { id: "duvida", label: "Dúvida" },
      { id: "reclamacao", label: "Reclamação" },
      { id: "saudacao", label: "Saudação" },
      { id: "outro", label: "Outro" },
    ],
  },

  // ===== DADOS =====
  {
    tipo: "atualizar_cliente",
    label: "Atualizar cliente",
    categoria: "dados",
    cor: "border-cyan-500",
    bg: "bg-cyan-50 dark:bg-cyan-950/30",
    descricao: "Salva ou atualiza informação no cadastro do cliente.",
    campos: [
      { chave: "campo", label: "Campo", tipo: "select", default: "temperatura_lead", opcoes: [
        { value: "temperatura_lead", label: "Temperatura" },
        { value: "categoria_favorita", label: "Categoria favorita" },
        { value: "estilo_preferido", label: "Estilo preferido" },
        { value: "budget_aproximado", label: "Budget" },
        { value: "genero_interesse", label: "Gênero de interesse" },
        { value: "preferencias", label: "Preferências (livre)" },
      ]},
      { chave: "valor", label: "Valor (pode usar variáveis)", tipo: "text" },
    ],
    inputs: 1,
    outputs: [{ id: "out" }],
  },

  // ===== VENDAS =====
  {
    tipo: "oferecer_cupom",
    label: "Oferecer cupom",
    categoria: "vendas",
    cor: "border-yellow-500",
    bg: "bg-yellow-50 dark:bg-yellow-950/30",
    descricao: "Oferece o cupom de negociação respeitando as regras configuradas (reuso, tentativas).",
    campos: [
      { chave: "forcar", label: "Forçar mesmo se já usou", tipo: "boolean", default: false },
    ],
    inputs: 1,
    outputs: [
      { id: "ofertado", label: "Ofertado" },
      { id: "negado", label: "Não ofertado" },
    ],
  },

  // ===== INTEGRAÇÃO =====
  {
    tipo: "webhook",
    label: "Disparar webhook",
    categoria: "integracao",
    cor: "border-slate-500",
    bg: "bg-slate-50 dark:bg-slate-950/30",
    descricao: "Faz uma chamada HTTP para um sistema externo.",
    campos: [
      { chave: "url", label: "URL", tipo: "text", placeholder: "https://..." },
      { chave: "metodo", label: "Método", tipo: "select", default: "POST", opcoes: [
        { value: "GET", label: "GET" }, { value: "POST", label: "POST" },
      ]},
      { chave: "body", label: "Body (JSON)", tipo: "textarea" },
    ],
    inputs: 1,
    outputs: [
      { id: "sucesso", label: "Sucesso" },
      { id: "erro", label: "Erro" },
    ],
  },

  // ===== CONTROLE =====
  {
    tipo: "escalar_humano",
    label: "Transferir p/ humano",
    categoria: "controle",
    cor: "border-orange-500",
    bg: "bg-orange-50 dark:bg-orange-950/30",
    descricao: "Marca a conversa como precisa de humano e envia mensagem de transição.",
    campos: [
      { chave: "motivo", label: "Motivo", tipo: "text", placeholder: "reclamação, dúvida técnica..." },
      { chave: "mensagem", label: "Mensagem de transição", tipo: "textarea",
        default: "Deixa eu chamar minha colega que entende mais desse assunto, tá? Um segundo!" },
    ],
    inputs: 1,
    outputs: [],
  },
  {
    tipo: "encerrar",
    label: "Encerrar conversa",
    categoria: "controle",
    cor: "border-orange-500",
    bg: "bg-orange-50 dark:bg-orange-950/30",
    descricao: "Encerra o fluxo. O cliente pode reiniciar enviando nova mensagem.",
    campos: [
      { chave: "mensagem_final", label: "Mensagem de despedida", tipo: "textarea" },
    ],
    inputs: 1,
    outputs: [],
  },
];

export const NODE_DEF_BY_TYPE: Record<string, NodeDef> = Object.fromEntries(
  NODE_DEFS.map((d) => [d.tipo, d])
);

export const CATEGORIAS = [
  { chave: "gatilho", label: "Gatilhos", cor: "text-emerald-600" },
  { chave: "mensagem", label: "Mensagens", cor: "text-blue-600" },
  { chave: "captura", label: "Capturar", cor: "text-amber-600" },
  { chave: "logica", label: "Lógica", cor: "text-rose-600" },
  { chave: "ia", label: "IA", cor: "text-violet-600" },
  { chave: "dados", label: "Dados", cor: "text-cyan-600" },
  { chave: "vendas", label: "Vendas", cor: "text-yellow-600" },
  { chave: "integracao", label: "Integração", cor: "text-slate-600" },
  { chave: "controle", label: "Controle", cor: "text-orange-600" },
] as const;

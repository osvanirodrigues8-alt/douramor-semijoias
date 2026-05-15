
-- ============ configuracoes_agente ============
CREATE TABLE IF NOT EXISTS public.configuracoes_agente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identidade
  nome_agente text NOT NULL DEFAULT 'Juliana',
  tom text NOT NULL DEFAULT 'informal',
  frase_abertura text DEFAULT 'Oi! 💛 Aqui é a Juliana da Douramor Semi Joias. Me conta, o que você está buscando?',
  assinatura text,
  uso_emoji text NOT NULL DEFAULT 'moderado',
  prompt_extra text,
  contexto_loja text DEFAULT 'Douramor Semi Joias — peças com banho de ouro 18k e prata 925. Frete grátis para todo o Brasil, troca em até 7 dias, garantia de 6 meses contra oxidação.',
  -- Follow-up
  fup1_horas numeric NOT NULL DEFAULT 3,
  fup2_horas numeric NOT NULL DEFAULT 5,
  fup3_horas numeric NOT NULL DEFAULT 4,
  max_fups_dia int NOT NULL DEFAULT 3,
  dias_total int NOT NULL DEFAULT 7,
  horario_inicio time NOT NULL DEFAULT '08:00',
  horario_fim time NOT NULL DEFAULT '22:00',
  respeitar_horario boolean NOT NULL DEFAULT true,
  followup_ativo boolean NOT NULL DEFAULT true,
  -- Vendas
  max_produtos_apresentacao int NOT NULL DEFAULT 3,
  estoque_baixo_threshold int NOT NULL DEFAULT 5,
  produtos_destaque_ids uuid[] NOT NULL DEFAULT '{}',
  promocao_ativa_texto text,
  promocao_ativa_validade date,
  -- Escalamento
  palavras_chave_humano text[] NOT NULL DEFAULT ARRAY['humano','atendente','pessoa','responsável','gerente','reclamação','reclamacao'],
  tentativas_antes_escalar int NOT NULL DEFAULT 2,
  responsavel_nome text,
  responsavel_numero text,
  -- Pós-venda
  dias_avaliacao int NOT NULL DEFAULT 7,
  dias_reativacao int NOT NULL DEFAULT 30,
  auto_avaliacao_ativa boolean NOT NULL DEFAULT true,
  auto_aniversario_ativa boolean NOT NULL DEFAULT true,
  auto_reativacao_ativa boolean NOT NULL DEFAULT true,
  auto_datas_comerciais_ativa boolean NOT NULL DEFAULT true,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.configuracoes_agente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff reads configuracoes_agente"
  ON public.configuracoes_agente FOR SELECT
  USING (is_staff(auth.uid()));

CREATE POLICY "Admins manage configuracoes_agente"
  ON public.configuracoes_agente FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff updates configuracoes_agente"
  ON public.configuracoes_agente FOR UPDATE
  USING (is_staff(auth.uid()))
  WITH CHECK (is_staff(auth.uid()));

-- Seed única linha
INSERT INTO public.configuracoes_agente (id) VALUES (gen_random_uuid());

-- ============ conversas: cadência de follow-up ============
ALTER TABLE public.conversas
  ADD COLUMN IF NOT EXISTS tipo_conversa text NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS dia_followup_atual int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fups_enviados_hoje int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proximo_followup_em timestamptz,
  ADD COLUMN IF NOT EXISTS data_inicio_followup date;

-- ============ clientes: perfil evolutivo ============
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS categoria_favorita text,
  ADD COLUMN IF NOT EXISTS estilo_preferido text,
  ADD COLUMN IF NOT EXISTS budget_aproximado numeric,
  ADD COLUMN IF NOT EXISTS genero_interesse text,
  ADD COLUMN IF NOT EXISTS produtos_vistos uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS produtos_interesse uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS produtos_comprados uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS temperatura_lead text NOT NULL DEFAULT 'morno',
  ADD COLUMN IF NOT EXISTS data_aniversario date,
  ADD COLUMN IF NOT EXISTS motivo_nao_fechamento text,
  ADD COLUMN IF NOT EXISTS data_ultimo_contato timestamptz;

-- Índice para reativação e follow-up
CREATE INDEX IF NOT EXISTS idx_clientes_temperatura ON public.clientes(temperatura_lead, data_ultimo_contato);
CREATE INDEX IF NOT EXISTS idx_conversas_followup ON public.conversas(proximo_followup_em) WHERE proximo_followup_em IS NOT NULL;

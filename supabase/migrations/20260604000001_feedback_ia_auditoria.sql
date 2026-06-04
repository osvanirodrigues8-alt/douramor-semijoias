-- Sistema de Auditoria e Aprendizado Contínuo — IA Juliana
-- Tabelas: feedback_ia, auditoria_prompt

-- ============================================================
-- TABELA: feedback_ia
-- ============================================================
CREATE TABLE public.feedback_ia (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id       UUID NOT NULL REFERENCES public.conversas(id) ON DELETE CASCADE,
  mensagem_id       UUID REFERENCES public.mensagens(id) ON DELETE SET NULL,
  tipo              TEXT NOT NULL CHECK (tipo IN (
                      'auto_repeticao','auto_abandono','auto_escalonamento_rapido',
                      'auto_negacao','auto_revisao_ia','auto_timeout','manual')),
  severidade        TEXT NOT NULL DEFAULT 'media' CHECK (severidade IN ('baixa','media','alta','critica')),
  descricao         TEXT NOT NULL,
  contexto_conversa JSONB,
  sugestao_correcao TEXT,
  status            TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','revisando','corrigido','descartado')),
  nota_ia           NUMERIC(3,1) CHECK (nota_ia BETWEEN 1 AND 10),
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolvido_em      TIMESTAMPTZ
);

CREATE INDEX idx_feedback_ia_conversa ON public.feedback_ia(conversa_id);
CREATE INDEX idx_feedback_ia_status   ON public.feedback_ia(status);
CREATE INDEX idx_feedback_ia_tipo     ON public.feedback_ia(tipo);
CREATE INDEX idx_feedback_ia_criado   ON public.feedback_ia(criado_em DESC);

-- ============================================================
-- TABELA: auditoria_prompt (imutável — nunca deletar linhas)
-- ============================================================
CREATE TABLE public.auditoria_prompt (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id   UUID REFERENCES public.feedback_ia(id) ON DELETE SET NULL,
  tipo_mudanca  TEXT NOT NULL CHECK (tipo_mudanca IN ('prompt','configuracao','faq','personalidade','manual')),
  descricao     TEXT NOT NULL,
  valor_antes   TEXT,
  valor_depois  TEXT,
  aplicado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revertido_em  TIMESTAMPTZ
);

CREATE INDEX idx_auditoria_feedback ON public.auditoria_prompt(feedback_id);
CREATE INDEX idx_auditoria_aplicado ON public.auditoria_prompt(aplicado_em DESC);

-- ============================================================
-- RLS — authenticated pode ler/escrever
-- (service_role bypassa automaticamente via supabaseAdmin)
-- ============================================================
ALTER TABLE public.feedback_ia      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_prompt ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_feedback"  ON public.feedback_ia     FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_feedback"  ON public.feedback_ia     FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_feedback"  ON public.feedback_ia     FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_select_auditoria" ON public.auditoria_prompt FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_auditoria" ON public.auditoria_prompt FOR INSERT TO authenticated WITH CHECK (true);


ALTER TABLE public.conversas
  ADD COLUMN IF NOT EXISTS produtos_mostrados jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS precisa_humano boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_humano text,
  ADD COLUMN IF NOT EXISTS humano_em timestamptz,
  ADD COLUMN IF NOT EXISTS tentativas_sem_resultado integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intencao_compra_em timestamptz;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS pos_venda_enviado_em timestamptz;

ALTER PUBLICATION supabase_realtime ADD TABLE public.conversas;
ALTER TABLE public.conversas REPLICA IDENTITY FULL;

DO $$ BEGIN
  CREATE POLICY "Staff updates conversas" ON public.conversas FOR UPDATE USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Staff inserts mensagens" ON public.mensagens FOR INSERT WITH CHECK (is_staff(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

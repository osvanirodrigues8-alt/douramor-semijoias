-- Seed default config row + allow admin insert
INSERT INTO public.configuracoes (id) SELECT gen_random_uuid() WHERE NOT EXISTS (SELECT 1 FROM public.configuracoes);

CREATE POLICY "Admins insert configuracoes" ON public.configuracoes FOR INSERT TO public WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow public (anonymous widget visitors) to write conversas/mensagens via service role only.
-- For agente edge function, we'll use service role, so no public policies needed.

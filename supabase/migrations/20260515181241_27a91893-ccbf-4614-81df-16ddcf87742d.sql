INSERT INTO public.user_roles (user_id, role)
VALUES ('609911b5-5f0f-4b6e-9ba6-bfd94af04e35', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

DROP POLICY IF EXISTS "Admins manage produtos" ON public.produtos;

CREATE POLICY "Staff insert produtos"
ON public.produtos
FOR INSERT
WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff update produtos"
ON public.produtos
FOR UPDATE
USING (is_staff(auth.uid()))
WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Admins delete produtos"
ON public.produtos
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- 1. Fix is_staff to require specific roles
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::app_role, 'atendente'::app_role)
  );
$$;

-- 2. Restrict UPDATE on configuracoes to admins only (was staff)
DROP POLICY IF EXISTS "Staff updates configuracoes" ON public.configuracoes;
CREATE POLICY "Admins update configuracoes"
ON public.configuracoes
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. Revoke EXECUTE on SECURITY DEFINER functions from authenticated/anon/public.
-- RLS policies execute as the postgres role, so they still work.
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 4. Realtime channel authorization — restrict realtime.messages to staff
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can receive realtime" ON realtime.messages;
CREATE POLICY "Staff can receive realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (public.is_staff(auth.uid()));

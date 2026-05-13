DROP POLICY IF EXISTS "Admins manage faqs" ON public.faqs;
CREATE POLICY "Staff manage faqs" ON public.faqs FOR ALL USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
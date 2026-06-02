-- 1. Convert check_is_admin to SECURITY INVOKER
ALTER FUNCTION public.check_is_admin(user_id uuid) SECURITY INVOKER;

-- 2. Restrict completion_history SELECT policy to authenticated users
-- This prevents anonymous users from calling check_is_admin (which would trigger permission denied on profiles since profiles SELECT is authenticated-only)
DROP POLICY IF EXISTS "Completion history is viewable by everyone" ON public.completion_history;
CREATE POLICY "Completion history is viewable by everyone" ON public.completion_history 
  FOR SELECT TO authenticated 
  USING ((select auth.uid()) = user_id OR public.check_is_admin((select auth.uid())));

-- 3. Restrict submissions SELECT policy to authenticated users
DROP POLICY IF EXISTS "Submissions are viewable by everyone" ON public.submissions;
CREATE POLICY "Submissions are viewable by everyone" ON public.submissions 
  FOR SELECT TO authenticated 
  USING ((select auth.uid()) = user_id OR public.check_is_admin((select auth.uid())));

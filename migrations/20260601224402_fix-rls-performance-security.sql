-- 1. Tighten check_is_admin security definer function
REVOKE EXECUTE ON FUNCTION public.check_is_admin(user_id uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.check_is_admin(user_id uuid) TO authenticated;
ALTER FUNCTION public.check_is_admin(user_id uuid) SET search_path = '';

-- 2. Tighten public.completion_history RLS select policy (owner-only + admin check with subquery)
DROP POLICY IF EXISTS "Completion history is viewable by everyone" ON public.completion_history;
CREATE POLICY "Completion history is viewable by everyone" ON public.completion_history 
  FOR SELECT USING ((select auth.uid()) = user_id OR public.check_is_admin((select auth.uid())));

-- 3. Tighten public.submissions RLS select policy (owner-only + admin check with subquery)
DROP POLICY IF EXISTS "Submissions are viewable by everyone" ON public.submissions;
CREATE POLICY "Submissions are viewable by everyone" ON public.submissions 
  FOR SELECT USING ((select auth.uid()) = user_id OR public.check_is_admin((select auth.uid())));

-- 4. Restrict public.profiles SELECT to authenticated users (leaderboard visibility for builders)
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles 
  FOR SELECT TO authenticated USING (true);

-- 5. Fix performance warnings (auth.uid() wrapped in subqueries) on public.completion_history
DROP POLICY IF EXISTS "Admins can delete any completion" ON public.completion_history;
CREATE POLICY "Admins can delete any completion" ON public.completion_history 
  FOR DELETE USING (public.check_is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Users can insert their own completions" ON public.completion_history;
CREATE POLICY "Users can insert their own completions" ON public.completion_history 
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- 6. Fix performance warnings (auth.uid() wrapped in subqueries) on public.profiles
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles 
  FOR INSERT WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update their own profile OR admins can update any profile" ON public.profiles;
CREATE POLICY "Users can update their own profile OR admins can update any profile" ON public.profiles 
  FOR UPDATE 
  USING ((select auth.uid()) = id OR public.check_is_admin((select auth.uid())))
  WITH CHECK ((select auth.uid()) = id OR public.check_is_admin((select auth.uid())));

-- 7. Fix performance warnings (auth.uid() wrapped in subqueries) on public.submissions
DROP POLICY IF EXISTS "Admins can delete any submission" ON public.submissions;
CREATE POLICY "Admins can delete any submission" ON public.submissions 
  FOR DELETE USING (public.check_is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Users can insert their own submissions" ON public.submissions;
CREATE POLICY "Users can insert their own submissions" ON public.submissions 
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

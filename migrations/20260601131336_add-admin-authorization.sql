-- Alter profiles to add is_admin
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- Create security definer function to avoid RLS policy recursion
CREATE OR REPLACE FUNCTION public.check_is_admin(user_id uuid)
RETURNS boolean SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles WHERE id = user_id AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql;

-- Update RLS policies on profiles
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile OR admins can update any profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR public.check_is_admin(auth.uid()))
  WITH CHECK (auth.uid() = id OR public.check_is_admin(auth.uid()));

-- Update RLS policies on submissions
DROP POLICY IF EXISTS "Admins can delete any submission" ON public.submissions;
CREATE POLICY "Admins can delete any submission"
  ON public.submissions FOR DELETE
  USING (public.check_is_admin(auth.uid()));

-- Update RLS policies on completion_history
DROP POLICY IF EXISTS "Admins can delete any completion" ON public.completion_history;
CREATE POLICY "Admins can delete any completion"
  ON public.completion_history FOR DELETE
  USING (public.check_is_admin(auth.uid()));

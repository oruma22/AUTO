-- Alter profiles table to add the required fields
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS streak_count integer DEFAULT 0 CHECK (streak_count >= 0),
  ADD COLUMN IF NOT EXISTS last_completed_date date,
  ADD COLUMN IF NOT EXISTS streak_health numeric DEFAULT 0.0 CHECK (streak_health >= 0.0 AND streak_health <= 100.0);

-- Create completion_history table
CREATE TABLE public.completion_history (
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  completed_date date NOT NULL,
  challenge_id text,
  PRIMARY KEY (user_id, completed_date)
);

-- Enable RLS
ALTER TABLE public.completion_history ENABLE ROW LEVEL SECURITY;

-- Policies for completion_history
CREATE POLICY "Completion history is viewable by everyone" ON public.completion_history FOR SELECT USING (true);
CREATE POLICY "Users can insert their own completions" ON public.completion_history FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  streak integer DEFAULT 0 CHECK (streak >= 0),
  consistency numeric DEFAULT 0.0 CHECK (consistency >= 0.0 AND consistency <= 1.0),
  health numeric DEFAULT 0.0 CHECK (health >= 0.0 AND health <= 1.0),
  challenge_title text DEFAULT 'Build an n8n webhook listener for GitHub issues',
  completed boolean DEFAULT false,
  updated_at timestamp with time zone DEFAULT now()
);

-- Create submissions table
CREATE TABLE public.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date text NOT NULL,
  note text NOT NULL,
  github_link text,
  loom_link text,
  challenge_title text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Submissions policies
CREATE POLICY "Submissions are viewable by everyone" ON public.submissions FOR SELECT USING (true);
CREATE POLICY "Users can insert their own submissions" ON public.submissions FOR INSERT WITH CHECK (auth.uid() = user_id);

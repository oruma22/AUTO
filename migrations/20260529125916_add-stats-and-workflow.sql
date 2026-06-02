-- Alter completion_history to add github_url and created_at
ALTER TABLE public.completion_history
  ADD COLUMN IF NOT EXISTS github_url text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

-- Alter submissions to add workflow_breakdown
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS workflow_breakdown jsonb;

-- Alter profiles to add stats fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS executions_per_hour numeric DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS last_calculated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS velocity_change numeric DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS velocity_this_week integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS velocity_last_week integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS velocity_trend text DEFAULT 'steady';

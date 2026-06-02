-- Add validation fields to public.submissions table
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS validation_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS validation_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS validation_signals jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS validation_method text DEFAULT 'rules',
  ADD COLUMN IF NOT EXISTS validated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS validator_feedback text;

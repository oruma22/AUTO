-- Add missing_elements column to submissions table
ALTER TABLE public.submissions 
  ADD COLUMN IF NOT EXISTS missing_elements jsonb DEFAULT '[]'::jsonb;

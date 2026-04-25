-- v1.0.1: Test evolution column
-- Created: 2026-03-14

ALTER TABLE public.system_info ADD COLUMN IF NOT EXISTS testing_evolution BOOLEAN DEFAULT false;

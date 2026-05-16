-- v1.0.9 - Profile permission flags used by update/admin gates.
-- Adds block metadata expected by central-proxy and admin user controls.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS signup_source TEXT;

UPDATE public.profiles
SET is_blocked = false
WHERE is_blocked IS NULL;

NOTIFY pgrst, 'reload schema';

INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
VALUES ('1.0.9', 'Profile permission flags for update/admin gates', true, 0)
ON CONFLICT (version) DO UPDATE SET
  description = EXCLUDED.description,
  success = EXCLUDED.success,
  execution_time_ms = EXCLUDED.execution_time_ms,
  executed_at = timezone('utc'::text, now()),
  error_log = NULL;

DO $$
DECLARE
  target_id UUID;
BEGIN
  SELECT id INTO target_id FROM public.system_info LIMIT 1;

  IF target_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'system_info'
      AND column_name = 'updated_at'
  ) THEN
    UPDATE public.system_info
    SET db_version = '1.0.9', updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.9'
    WHERE id = target_id;
  END IF;
END $$;

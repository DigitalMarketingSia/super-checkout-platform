-- v1.0.12 - Operational update hardening.
-- Keeps update history service-role only and aligned with approved migrations.

DROP POLICY IF EXISTS "Authenticated users can manage system update logs" ON public.system_updates_log;

ALTER TABLE public.system_updates_log ENABLE ROW LEVEL SECURITY;

INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
VALUES ('1.0.12', 'Operational update hardening', true, 0)
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
    SET db_version = '1.0.12', updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.12'
    WHERE id = target_id;
  END IF;
END $$;

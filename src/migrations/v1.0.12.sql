-- v1.0.12 - Operational update hardening.
-- Keeps update history service-role only and aligned with approved migrations.

DROP POLICY IF EXISTS "Authenticated users can manage system update logs" ON public.system_updates_log;

ALTER TABLE public.system_updates_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS max_instances INTEGER DEFAULT 1;

UPDATE public.licenses
SET max_instances = COALESCE(max_instances, 1)
WHERE max_instances IS NULL;

ALTER TABLE public.gateways
  ADD COLUMN IF NOT EXISTS credentials JSONB DEFAULT '{}'::jsonb;

UPDATE public.gateways
SET credentials = COALESCE(credentials, '{}'::jsonb)
WHERE credentials IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'gateways'
      AND column_name = 'public_key'
  ) THEN
    UPDATE public.gateways
    SET credentials = COALESCE(credentials, '{}'::jsonb)
      || jsonb_strip_nulls(
        jsonb_build_object(
          'public_key', public_key,
          'private_key', private_key,
          'webhook_secret', webhook_secret
        )
      )
    WHERE COALESCE(credentials, '{}'::jsonb) = '{}'::jsonb;
  END IF;
END $$;

ALTER TABLE public.system_updates_log
  ADD COLUMN IF NOT EXISTS action TEXT;

ALTER TABLE public.system_updates_log
  ADD COLUMN IF NOT EXISTS message TEXT;

ALTER TABLE public.system_updates_log
  ADD COLUMN IF NOT EXISTS files_affected JSONB;

UPDATE public.system_updates_log
SET action = COALESCE(action, 'sync')
WHERE action IS NULL;

ALTER TABLE public.system_updates_log
  ALTER COLUMN action SET DEFAULT 'sync';

ALTER TABLE public.system_updates_log
  ALTER COLUMN action SET NOT NULL;

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

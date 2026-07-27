-- v1.0.35 - Add versioned HMAC signatures for outbound customer webhooks.
-- Webhooks saved before this release have no mode, so they explicitly remain
-- legacy until their owner selects HMAC in the dashboard. Fresh installs use
-- HMAC-SHA256 by default and never transmit the configured secret.

DO $$
BEGIN
  IF to_regclass('public.webhooks') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.webhooks
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS headers JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS secret TEXT,
    ADD COLUMN IF NOT EXISTS signature_mode TEXT;

  UPDATE public.webhooks
  SET signature_mode = CASE
    WHEN signature_mode = 'hmac_sha256' THEN 'hmac_sha256'
    ELSE 'legacy'
  END;

  ALTER TABLE public.webhooks
    ALTER COLUMN signature_mode SET DEFAULT 'hmac_sha256',
    ALTER COLUMN signature_mode SET NOT NULL;

  ALTER TABLE public.webhooks
    DROP CONSTRAINT IF EXISTS webhooks_signature_mode_check;

  ALTER TABLE public.webhooks
    ADD CONSTRAINT webhooks_signature_mode_check
    CHECK (signature_mode IN ('legacy', 'hmac_sha256'));
END $$;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'schema_migrations'
  ) THEN
    INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
    VALUES ('1.0.35', 'Add versioned HMAC signatures for outgoing webhooks', true, 0)
    ON CONFLICT (version) DO UPDATE SET
      description = EXCLUDED.description,
      success = EXCLUDED.success,
      execution_time_ms = EXCLUDED.execution_time_ms,
      executed_at = timezone('utc'::text, now()),
      error_log = NULL;
  END IF;
END $$;

DO $$
DECLARE
  target_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'system_info'
  ) THEN
    RETURN;
  END IF;

  SELECT id INTO target_id FROM public.system_info LIMIT 1;

  IF target_id IS NULL THEN
    INSERT INTO public.system_info(db_version, updated_at)
    VALUES ('1.0.35', timezone('utc'::text, now()));
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'system_info'
      AND column_name = 'last_update_at'
  ) THEN
    UPDATE public.system_info
    SET db_version = '1.0.35',
        updated_at = timezone('utc'::text, now()),
        last_update_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.35',
        updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  END IF;
END $$;

-- v1.0.26 - Repair legacy checkout routing columns used by status polling/webhooks.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'checkouts'
  ) THEN
    ALTER TABLE public.checkouts
      ADD COLUMN IF NOT EXISTS backup_gateway_id UUID;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'checkouts'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'checkouts_backup_gateway_id_fkey'
  ) THEN
    ALTER TABLE public.checkouts
      ADD CONSTRAINT checkouts_backup_gateway_id_fkey
      FOREIGN KEY (backup_gateway_id)
      REFERENCES public.gateways(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'system_info'
  ) THEN
    ALTER TABLE public.system_info
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'system_info'
        AND column_name = 'last_update_at'
    ) THEN
      UPDATE public.system_info
      SET updated_at = COALESCE(updated_at, last_update_at, timezone('utc'::text, now()))
      WHERE updated_at IS NULL;
    ELSE
      UPDATE public.system_info
      SET updated_at = COALESCE(updated_at, timezone('utc'::text, now()))
      WHERE updated_at IS NULL;
    END IF;
  END IF;
END $$;

GRANT SELECT ON public.checkouts TO anon, authenticated, service_role;

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
    VALUES ('1.0.26', 'Repair legacy checkout backup gateway column and system timestamp drift', true, 0)
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
    VALUES ('1.0.26', timezone('utc'::text, now()));
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
    SET db_version = '1.0.26',
        updated_at = timezone('utc'::text, now()),
        last_update_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.26',
        updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  END IF;
END $$;

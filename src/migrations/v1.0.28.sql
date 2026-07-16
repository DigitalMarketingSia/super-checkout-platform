-- v1.0.28 - Track the last approved migration applied in system_info for safer update diagnostics.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'system_info'
  ) THEN
    ALTER TABLE public.system_info
      ADD COLUMN IF NOT EXISTS last_applied_migration_version TEXT,
      ADD COLUMN IF NOT EXISTS last_applied_migration_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
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
    UPDATE public.system_info
    SET last_applied_migration_version = COALESCE(NULLIF(BTRIM(last_applied_migration_version), ''), db_version, '1.0.28'),
        last_applied_migration_at = COALESCE(last_applied_migration_at, updated_at, last_update_at, timezone('utc'::text, now()))
    WHERE last_applied_migration_version IS NULL
       OR NULLIF(BTRIM(last_applied_migration_version), '') IS NULL
       OR last_applied_migration_at IS NULL;
  END IF;
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
    VALUES ('1.0.28', 'Track last applied approved migration metadata in system_info for safer diagnostics', true, 0)
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
  applied_at TIMESTAMP WITH TIME ZONE := timezone('utc'::text, now());
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
    INSERT INTO public.system_info(
      db_version,
      updated_at,
      last_update_at,
      last_applied_migration_version,
      last_applied_migration_at
    )
    VALUES (
      '1.0.28',
      applied_at,
      applied_at,
      '1.0.28',
      applied_at
    );
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
    SET db_version = '1.0.28',
        updated_at = applied_at,
        last_update_at = applied_at,
        last_applied_migration_version = '1.0.28',
        last_applied_migration_at = applied_at
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.28',
        updated_at = applied_at,
        last_applied_migration_version = '1.0.28',
        last_applied_migration_at = applied_at
    WHERE id = target_id;
  END IF;
END $$;

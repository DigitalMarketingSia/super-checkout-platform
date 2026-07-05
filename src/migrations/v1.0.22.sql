-- v1.0.22 - Add payments retention policy for terminal payment artifact minimization.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'data_retention_policies'
  ) THEN
    INSERT INTO public.data_retention_policies(table_name, retention_days, run_mode, active, notes)
    VALUES
      ('payments', 30, 'anonymize', true, 'Pagamentos em status terminal devem remover QR Code PIX, URLs de ticket e payloads verbosos do provedor apos a janela operacional.')
    ON CONFLICT (table_name) DO UPDATE SET
      retention_days = EXCLUDED.retention_days,
      run_mode = EXCLUDED.run_mode,
      active = EXCLUDED.active,
      notes = EXCLUDED.notes,
      updated_at = timezone('utc'::text, now());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'schema_migrations'
  ) THEN
    INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
    VALUES ('1.0.22', 'Add payments retention policy for terminal payment artifact minimization', true, 0)
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
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'system_info'
      AND column_name = 'updated_at'
  ) THEN
    UPDATE public.system_info
    SET db_version = '1.0.22', updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.22'
    WHERE id = target_id;
  END IF;
END $$;

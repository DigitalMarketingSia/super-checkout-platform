-- v1.0.25 - Repair installation-aware setup check for legacy UUID profile columns.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS installation_id TEXT;

CREATE OR REPLACE FUNCTION public.is_setup_required()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE role IN ('admin', 'owner', 'master_admin')
    LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_setup_required(target_installation_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_installation_id TEXT := NULLIF(BTRIM(target_installation_id), '');
BEGIN
  IF normalized_installation_id IS NULL THEN
    RETURN public.is_setup_required();
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE role IN ('admin', 'owner', 'master_admin')
      AND (
        installation_id::text = normalized_installation_id
        OR installation_id IS NULL
        OR NULLIF(BTRIM(installation_id::text), '') IS NULL
      )
    LIMIT 1
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_setup_required() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_setup_required(TEXT) TO anon, authenticated, service_role;

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
    VALUES ('1.0.25', 'Repair setup bootstrap check for legacy UUID installation ids', true, 0)
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
    SET db_version = '1.0.25', updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.25'
    WHERE id = target_id;
  END IF;
END $$;

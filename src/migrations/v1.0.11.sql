-- v1.0.11 - Approved migration executor hardening.
-- Moves future runtime migrations away from authenticated legacy exec_sql.

CREATE OR REPLACE FUNCTION public.apply_approved_migration(sql_query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  EXECUTE sql_query;
  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'code', SQLSTATE
    );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_approved_migration(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_approved_migration(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_approved_migration(TEXT) TO service_role;

DO $$
BEGIN
  IF to_regprocedure('public.exec_sql(text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.exec_sql(TEXT) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.exec_sql(TEXT) FROM anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.exec_sql(TEXT) TO service_role;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
VALUES ('1.0.11', 'Approved migration executor hardening', true, 0)
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
    SET db_version = '1.0.11', updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.11'
    WHERE id = target_id;
  END IF;
END $$;

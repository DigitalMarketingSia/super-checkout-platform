-- v1.0.45 - Keep local account plan mirrors server-controlled.
-- Commercial entitlements are resolved by the Central control plane. A
-- browser must never be able to promote its own local account and satisfy a
-- catalog RLS check by changing `accounts.plan_type`.

DROP POLICY IF EXISTS "Users can insert own account" ON public.accounts;
DROP POLICY IF EXISTS "Users can update own account" ON public.accounts;

CREATE POLICY "Users can insert own free account" ON public.accounts
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = owner_user_id
  AND LOWER(COALESCE(plan_type, 'free')) = 'free'
  AND LOWER(COALESCE(status, 'active')) = 'active'
);

COMMENT ON TABLE public.accounts IS
  'Local business account mirror. Commercial plan_type and status are server-controlled from the Central entitlement source.';

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
    VALUES ('1.0.45', 'Keep local account plan mirrors server-controlled', true, 0)
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
  IF to_regclass('public.system_info') IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO target_id FROM public.system_info LIMIT 1;
  IF target_id IS NULL THEN
    INSERT INTO public.system_info(db_version, updated_at, last_applied_migration_version, last_applied_migration_at)
    VALUES ('1.0.45', timezone('utc'::text, now()), '1.0.45', timezone('utc'::text, now()));
    RETURN;
  END IF;

  UPDATE public.system_info
  SET db_version = '1.0.45',
      updated_at = timezone('utc'::text, now()),
      last_update_at = timezone('utc'::text, now()),
      last_applied_migration_version = '1.0.45',
      last_applied_migration_at = timezone('utc'::text, now())
  WHERE id = target_id;
END $$;

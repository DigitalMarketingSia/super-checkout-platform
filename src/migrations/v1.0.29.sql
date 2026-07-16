-- v1.0.29 - Supabase hardening for legacy policy drift, internal RPC exposure, and linter follow-up.

CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
DECLARE
  ext RECORD;
  has_net_references BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosrc ~ '\mnet\.'
  ) INTO has_net_references;

  FOR ext IN
    SELECT e.extname, n.nspname AS current_schema
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname IN ('pg_net', 'moddatetime')
  LOOP
    IF ext.current_schema = 'extensions' THEN
      CONTINUE;
    END IF;

    IF ext.extname = 'pg_net' AND has_net_references THEN
      RAISE NOTICE 'Skipping pg_net schema move because public functions still reference net.*';
      CONTINUE;
    END IF;

    BEGIN
      EXECUTE format('ALTER EXTENSION %I SET SCHEMA extensions', ext.extname);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Could not move extension % to extensions: %', ext.extname, SQLERRM;
    END;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'DROP VIEW IF EXISTS public.admin_members_view';
  EXECUTE $view$
    CREATE VIEW public.admin_members_view
    WITH (security_invoker = true)
    AS
    SELECT
      p.id AS user_id,
      p.email,
      p.full_name,
      p.status,
      p.last_seen_at,
      p.created_at AS joined_at,
      (SELECT COUNT(*) FROM public.access_grants ag WHERE ag.user_id = p.id AND ag.status = 'active') AS active_products_count,
      (SELECT COUNT(*) FROM public.orders o WHERE o.customer_user_id = p.id) AS orders_count
    FROM public.profiles p
    WHERE EXISTS (
      SELECT 1
      FROM public.profiles admin_profile
      WHERE admin_profile.id = auth.uid()
        AND admin_profile.role IN ('admin', 'owner', 'master_admin')
    ) OR auth.role() = 'service_role'
  $view$;

  EXECUTE 'REVOKE ALL ON public.admin_members_view FROM PUBLIC, anon';
  EXECUTE 'GRANT SELECT ON public.admin_members_view TO authenticated, service_role';
END $$;

COMMENT ON VIEW public.admin_members_view IS
  'Admin-only member projection. Uses security_invoker and an explicit admin gate to avoid leaking rows to authenticated non-admin users.';

COMMENT ON VIEW public.public_gateways IS
  'Intentional sanitized gateway projection for public checkout use. SECURITY DEFINER is accepted here so anon never needs direct SELECT on public.gateways.';

DO $$
DECLARE
  target_table TEXT;
  pol RECORD;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['system_info', 'system_config', 'email_templates', 'system_email_templates']
  LOOP
    IF to_regclass('public.' || target_table) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);

    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = target_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, target_table);
    END LOOP;
  END LOOP;

  IF to_regclass('public.system_info') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY "Admins can read system info" ON public.system_info FOR SELECT TO authenticated USING (public.is_admin())';
    EXECUTE 'CREATE POLICY "Admins can insert system info" ON public.system_info FOR INSERT TO authenticated WITH CHECK (public.is_admin())';
    EXECUTE 'CREATE POLICY "Admins can update system info" ON public.system_info FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())';
  END IF;

  IF to_regclass('public.system_config') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY "Admins can read system config" ON public.system_config FOR SELECT TO authenticated USING (public.is_admin())';
    EXECUTE 'CREATE POLICY "Admins can insert system config" ON public.system_config FOR INSERT TO authenticated WITH CHECK (public.is_admin())';
    EXECUTE 'CREATE POLICY "Admins can update system config" ON public.system_config FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())';
    EXECUTE 'CREATE POLICY "Admins can delete system config" ON public.system_config FOR DELETE TO authenticated USING (public.is_admin())';
  END IF;

  IF to_regclass('public.email_templates') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY "Admins can read email templates" ON public.email_templates FOR SELECT TO authenticated USING (public.is_admin())';
    EXECUTE 'CREATE POLICY "Admins can insert email templates" ON public.email_templates FOR INSERT TO authenticated WITH CHECK (public.is_admin())';
    EXECUTE 'CREATE POLICY "Admins can update email templates" ON public.email_templates FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())';
    EXECUTE 'CREATE POLICY "Admins can delete email templates" ON public.email_templates FOR DELETE TO authenticated USING (public.is_admin())';
  END IF;

  IF to_regclass('public.system_email_templates') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY "Admins can read system email templates" ON public.system_email_templates FOR SELECT TO authenticated USING (public.is_admin())';
    EXECUTE 'CREATE POLICY "Admins can insert system email templates" ON public.system_email_templates FOR INSERT TO authenticated WITH CHECK (public.is_admin())';
    EXECUTE 'CREATE POLICY "Admins can update system email templates" ON public.system_email_templates FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())';
    EXECUTE 'CREATE POLICY "Admins can delete system email templates" ON public.system_email_templates FOR DELETE TO authenticated USING (public.is_admin())';
  END IF;
END $$;

DO $$
DECLARE
  fn RECORD;
  target_function_names TEXT[] := ARRAY[
    'is_admin',
    'handle_updated_at',
    'delete_test_user_by_email',
    'get_member_area_members',
    'get_area_members_enriched',
    'is_setup_required',
    'handle_new_order_access',
    'handle_new_user',
    'trigger_process_event',
    'cron_retry_app_events',
    'check_schema_integrity',
    'enforce_active_license',
    'simulate_payment',
    'check_user_installation'
  ];
BEGIN
  FOR fn IN
    SELECT
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(target_function_names)
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public',
      fn.nspname,
      fn.proname,
      fn.identity_args
    );
  END LOOP;
END $$;

DO $$
DECLARE
  fn RECORD;
  internal_function_names TEXT[] := ARRAY[
    'check_schema_integrity',
    'cron_retry_app_events',
    'enforce_active_license',
    'handle_new_user',
    'handle_new_order_access',
    'trigger_process_event',
    'check_user_installation',
    'delete_test_user_by_email',
    'simulate_payment'
  ];
  authenticated_rpc_names TEXT[] := ARRAY[
    'get_member_area_members',
    'get_area_members_enriched'
  ];
BEGIN
  FOR fn IN
    SELECT
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(internal_function_names || authenticated_rpc_names)
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
      fn.nspname,
      fn.proname,
      fn.identity_args
    );

    IF fn.proname = ANY(authenticated_rpc_names) THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role',
        fn.nspname,
        fn.proname,
        fn.identity_args
      );
    ELSE
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role',
        fn.nspname,
        fn.proname,
        fn.identity_args
      );
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'is_setup_required'
  LOOP
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO anon, authenticated, service_role',
      fn.nspname,
      fn.proname,
      fn.identity_args
    );
  END LOOP;
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
    VALUES ('1.0.29', 'Supabase hardening for legacy policy drift, internal RPC exposure, and linter follow-up', true, 0)
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
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'system_info'
        AND column_name = 'last_applied_migration_version'
    ) THEN
      INSERT INTO public.system_info(
        db_version,
        updated_at,
        last_applied_migration_version,
        last_applied_migration_at
      )
      VALUES (
        '1.0.29',
        timezone('utc'::text, now()),
        '1.0.29',
        timezone('utc'::text, now())
      );
    ELSE
      INSERT INTO public.system_info(db_version, updated_at)
      VALUES ('1.0.29', timezone('utc'::text, now()));
    END IF;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'system_info'
      AND column_name = 'last_update_at'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'system_info'
        AND column_name = 'last_applied_migration_version'
    ) THEN
      UPDATE public.system_info
      SET db_version = '1.0.29',
          updated_at = timezone('utc'::text, now()),
          last_update_at = timezone('utc'::text, now()),
          last_applied_migration_version = '1.0.29',
          last_applied_migration_at = timezone('utc'::text, now())
      WHERE id = target_id;
    ELSE
      UPDATE public.system_info
      SET db_version = '1.0.29',
          updated_at = timezone('utc'::text, now()),
          last_update_at = timezone('utc'::text, now())
      WHERE id = target_id;
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'system_info'
        AND column_name = 'last_applied_migration_version'
    ) THEN
      UPDATE public.system_info
      SET db_version = '1.0.29',
          updated_at = timezone('utc'::text, now()),
          last_applied_migration_version = '1.0.29',
          last_applied_migration_at = timezone('utc'::text, now())
      WHERE id = target_id;
    ELSE
      UPDATE public.system_info
      SET db_version = '1.0.29',
          updated_at = timezone('utc'::text, now())
      WHERE id = target_id;
    END IF;
  END IF;
END $$;

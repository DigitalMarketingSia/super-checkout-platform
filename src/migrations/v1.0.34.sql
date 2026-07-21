-- v1.0.34 - Harden payment operational data and prevent raw webhook payload retention.
-- This migration is idempotent and preserves public checkout access only through
-- the deliberately sanitized public.public_gateways projection.

DO $$
DECLARE
  has_raw_data BOOLEAN;
BEGIN
  IF to_regclass('public.gateways') IS NOT NULL THEN
    ALTER TABLE public.gateways ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can manage their own gateways" ON public.gateways;
    DROP POLICY IF EXISTS "Users can create gateways" ON public.gateways;
    DROP POLICY IF EXISTS "Admins can manage all gateways" ON public.gateways;

    CREATE POLICY "Users can manage their own gateways"
    ON public.gateways
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

    CREATE POLICY "Admins can manage all gateways"
    ON public.gateways
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

    REVOKE ALL ON public.gateways FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.gateways TO authenticated;
    GRANT ALL ON public.gateways TO service_role;
  END IF;

  IF to_regclass('public.webhook_logs') IS NOT NULL THEN
    ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'webhook_logs'
        AND column_name = 'raw_data'
    ) INTO has_raw_data;

    -- Previous versions could retain complete provider notifications here.
    -- The metadata in payload is sufficient for support and reconciliation.
    IF has_raw_data THEN
      EXECUTE 'UPDATE public.webhook_logs SET raw_data = NULL WHERE raw_data IS NOT NULL';
    END IF;

    DROP POLICY IF EXISTS "Users can view own webhook logs" ON public.webhook_logs;
    DROP POLICY IF EXISTS "Admins can view all webhook logs" ON public.webhook_logs;

    -- Provider inbound events have no customer-owned webhook_id. They are
    -- deliberately restricted to system administrators instead of every user.
    CREATE POLICY "Users can view own outbound webhook logs"
    ON public.webhook_logs
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.webhooks w
        WHERE w.id = webhook_logs.webhook_id
          AND w.user_id = auth.uid()
      )
    );

    CREATE POLICY "Admins can view all webhook logs"
    ON public.webhook_logs
    FOR SELECT TO authenticated
    USING (public.is_admin());

    REVOKE ALL ON public.webhook_logs FROM anon;
    GRANT SELECT ON public.webhook_logs TO authenticated;
    GRANT ALL ON public.webhook_logs TO service_role;
  END IF;

  IF to_regclass('public.customer_payment_profiles') IS NOT NULL THEN
    ALTER TABLE public.customer_payment_profiles ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can manage their own customer payment profiles" ON public.customer_payment_profiles;
    DROP POLICY IF EXISTS "Admins can view all customer payment profiles" ON public.customer_payment_profiles;

    CREATE POLICY "Users can manage their own customer payment profiles"
    ON public.customer_payment_profiles
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

    CREATE POLICY "Admins can view all customer payment profiles"
    ON public.customer_payment_profiles
    FOR SELECT TO authenticated
    USING (public.is_admin());

    REVOKE ALL ON public.customer_payment_profiles FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_payment_profiles TO authenticated;
    GRANT ALL ON public.customer_payment_profiles TO service_role;
  END IF;
END $$;

-- Explicitly retain the public checkout contract without exposing credentials,
-- webhook secrets or arbitrary gateway configuration.
CREATE OR REPLACE VIEW public.public_gateways
AS
SELECT
  id,
  name,
  provider,
  public_key,
  active,
  is_active,
  jsonb_strip_nulls(
    jsonb_build_object(
      'demo', COALESCE(config, '{}'::jsonb)->'demo',
      'environment', COALESCE(config, '{}'::jsonb)->'environment',
      'env', COALESCE(config, '{}'::jsonb)->'env',
      'max_installments', COALESCE(config, '{}'::jsonb)->'max_installments',
      'maxInstallments', COALESCE(config, '{}'::jsonb)->'maxInstallments',
      'min_installment_value', COALESCE(config, '{}'::jsonb)->'min_installment_value',
      'minInstallmentValue', COALESCE(config, '{}'::jsonb)->'minInstallmentValue',
      'interest_rate', COALESCE(config, '{}'::jsonb)->'interest_rate',
      'interestRate', COALESCE(config, '{}'::jsonb)->'interestRate'
    )
  ) AS config
FROM public.gateways
WHERE COALESCE(active, true) = true
  AND COALESCE(is_active, true) = true;

ALTER VIEW public.public_gateways SET (security_invoker = false);
REVOKE ALL ON public.public_gateways FROM PUBLIC;
GRANT SELECT ON public.public_gateways TO anon, authenticated, service_role;

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
    VALUES ('1.0.34', 'Harden payment operational data and redact webhook payloads', true, 0)
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
    VALUES ('1.0.34', timezone('utc'::text, now()));
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
    SET db_version = '1.0.34',
        updated_at = timezone('utc'::text, now()),
        last_update_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.34',
        updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  END IF;
END $$;

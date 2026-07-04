-- v1.0.20 - Sanitize public gateway projection and purge legacy OAuth metadata from gateways.config.

DO $$
BEGIN
  ALTER TABLE public.gateways
    ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb;
END $$;

UPDATE public.gateways
SET config = (
  COALESCE(config, '{}'::jsonb)
    - 'access_token'
    - 'refresh_token'
    - 'oauth_access_token'
    - 'oauth_refresh_token'
    - 'oauth_expires_in'
    - 'oauth_expires_at'
    - 'oauth_account_id'
    - 'connected_via_oauth'
    - 'oauth_scope'
    - 'oauth_token_type'
    - 'oauth_status'
    - 'oauth_last_refresh_attempt_at'
    - 'oauth_last_refresh_status'
    - 'oauth_last_refresh_source'
    - 'oauth_last_refresh_error'
    - 'oauth_last_refresh_error_code'
    - 'oauth_reconnect_required_at'
    - 'oauth_last_connected_at'
    - 'oauth_last_token_source'
    - 'oauth_last_disconnected_at'
    - 'client_secret'
    - 'authorization_token'
    - 'integrator_token'
)
WHERE config IS NOT NULL
  AND (
    config ? 'access_token'
    OR config ? 'refresh_token'
    OR config ? 'oauth_access_token'
    OR config ? 'oauth_refresh_token'
    OR config ? 'oauth_expires_in'
    OR config ? 'oauth_expires_at'
    OR config ? 'oauth_account_id'
    OR config ? 'connected_via_oauth'
    OR config ? 'oauth_scope'
    OR config ? 'oauth_token_type'
    OR config ? 'oauth_status'
    OR config ? 'oauth_last_refresh_attempt_at'
    OR config ? 'oauth_last_refresh_status'
    OR config ? 'oauth_last_refresh_source'
    OR config ? 'oauth_last_refresh_error'
    OR config ? 'oauth_last_refresh_error_code'
    OR config ? 'oauth_reconnect_required_at'
    OR config ? 'oauth_last_connected_at'
    OR config ? 'oauth_last_token_source'
    OR config ? 'oauth_last_disconnected_at'
    OR config ? 'client_secret'
    OR config ? 'authorization_token'
    OR config ? 'integrator_token'
  );

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

GRANT SELECT ON public.public_gateways TO anon, authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'schema_migrations'
  ) THEN
    INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
    VALUES ('1.0.20', 'Sanitize public gateway config and purge legacy OAuth metadata from gateway config', true, 0)
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
    SET db_version = '1.0.20', updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.20'
    WHERE id = target_id;
  END IF;
END $$;

-- v1.0.38 - Require a fresh, one-time TOTP approval before destructive
-- Central installation actions. The browser receives only an opaque approval;
-- the database stores only its SHA-256 hash.

CREATE TABLE IF NOT EXISTS public.sensitive_action_grants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  actor_fingerprint TEXT NOT NULL CHECK (actor_fingerprint ~ '^[a-f0-9]{64}$'),
  purpose TEXT NOT NULL CHECK (purpose IN ('installation_reset', 'installation_revoke')),
  issued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  consumed_at TIMESTAMP WITH TIME ZONE,
  consumed_by_endpoint TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT sensitive_action_grants_expiry_check CHECK (expires_at > issued_at)
);

CREATE INDEX IF NOT EXISTS idx_sensitive_action_grants_pending_expiry
  ON public.sensitive_action_grants(expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE public.sensitive_action_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sensitive_action_grants FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sensitive_action_grants TO service_role;

DROP POLICY IF EXISTS "Service role can manage sensitive action grants" ON public.sensitive_action_grants;
CREATE POLICY "Service role can manage sensitive action grants"
  ON public.sensitive_action_grants
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- PostgreSQL does not allow CREATE OR REPLACE to change a function return
-- type. Installations created by an earlier canonical schema have this
-- signature returning BOOLEAN, while the security contract below returns the
-- explicit TEXT outcomes consumed/rejected/expired/replayed.
DROP FUNCTION IF EXISTS public.consume_sensitive_action_grant(TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.consume_sensitive_action_grant(
  p_token_hash TEXT,
  p_actor_fingerprint TEXT,
  p_purpose TEXT,
  p_endpoint TEXT,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  grant_id UUID;
  outcome TEXT;
BEGIN
  SELECT id INTO grant_id
  FROM public.sensitive_action_grants
  WHERE token_hash = p_token_hash
    AND actor_fingerprint = p_actor_fingerprint
    AND purpose = p_purpose
    AND consumed_at IS NULL
    AND expires_at > timezone('utc'::text, now())
  FOR UPDATE;

  IF grant_id IS NULL THEN
    SELECT CASE
      WHEN EXISTS (
        SELECT 1 FROM public.sensitive_action_grants
        WHERE token_hash = p_token_hash
          AND actor_fingerprint = p_actor_fingerprint
          AND purpose = p_purpose
          AND consumed_at IS NULL
          AND expires_at <= timezone('utc'::text, now())
      ) THEN 'expired'
      WHEN EXISTS (
        SELECT 1 FROM public.sensitive_action_grants
        WHERE token_hash = p_token_hash
          AND actor_fingerprint = p_actor_fingerprint
          AND purpose = p_purpose
          AND consumed_at IS NOT NULL
      ) THEN 'replayed'
      ELSE 'rejected'
    END INTO outcome;

    INSERT INTO public.security_events(event_type, severity, ip_address, metadata)
    VALUES (
      CASE WHEN outcome = 'expired' THEN 'sensitive_action_approval_expired' ELSE 'sensitive_action_approval_rejected' END,
      'WARNING',
      NULLIF(left(coalesce(p_ip_address, ''), 120), ''),
      jsonb_build_object(
        'purpose', p_purpose,
        'endpoint', left(coalesce(p_endpoint, ''), 120),
        'actor_fingerprint', p_actor_fingerprint,
        'outcome', outcome,
        'source', 'central_proxy'
      )
    );
    RETURN outcome;
  END IF;

  UPDATE public.sensitive_action_grants
  SET consumed_at = timezone('utc'::text, now()),
      consumed_by_endpoint = left(coalesce(p_endpoint, ''), 120)
  WHERE id = grant_id;

  INSERT INTO public.security_events(event_type, severity, ip_address, metadata)
  VALUES (
    'sensitive_action_approval_consumed',
    'WARNING',
    NULLIF(left(coalesce(p_ip_address, ''), 120), ''),
    jsonb_build_object(
      'purpose', p_purpose,
      'endpoint', left(coalesce(p_endpoint, ''), 120),
      'actor_fingerprint', p_actor_fingerprint,
      'source', 'central_proxy'
    )
  );

  RETURN 'consumed';
END;
$$;

REVOKE ALL ON FUNCTION public.consume_sensitive_action_grant(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_sensitive_action_grant(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

COMMENT ON TABLE public.sensitive_action_grants IS
  'One-time, five-minute approvals after Central Portal TOTP. Raw approval values are never persisted.';

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
    VALUES ('1.0.38', 'Require fresh TOTP approval for destructive installation actions', true, 0)
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
    INSERT INTO public.system_info(db_version, updated_at)
    VALUES ('1.0.38', timezone('utc'::text, now()));
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'system_info' AND column_name = 'last_update_at'
  ) THEN
    UPDATE public.system_info
    SET db_version = '1.0.38', updated_at = timezone('utc'::text, now()), last_update_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.38', updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  END IF;
END $$;

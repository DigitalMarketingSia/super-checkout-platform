-- v1.0.37 - Record rejected first-admin bootstrap attempts in the security audit trail.
--
-- This migration is additive and idempotent. The endpoint intentionally records
-- only safe metadata (reason, IP, user agent and identifier fingerprints), never
-- a bootstrap token, password or raw setup payload.

CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL', 'FATAL')),
  ip_address TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_security_events_ip_created
  ON public.security_events(ip_address, created_at);

CREATE INDEX IF NOT EXISTS idx_security_events_type_severity
  ON public.security_events(event_type, severity);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Apenas service_role pode inserir na security_events" ON public.security_events;
DROP POLICY IF EXISTS "Administradores podem ler security_events" ON public.security_events;
DROP POLICY IF EXISTS "Admins can view security events" ON public.security_events;
DROP POLICY IF EXISTS "Service role can manage security events" ON public.security_events;

REVOKE ALL ON public.security_events FROM anon, authenticated;
GRANT SELECT ON public.security_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_events TO service_role;

CREATE POLICY "Admins can view security events"
  ON public.security_events
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Service role can manage security events"
  ON public.security_events
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.security_events IS
  'Dedicated security telemetry. Bootstrap rejection events retain only safe correlation metadata.';

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
    VALUES ('1.0.37', 'Record rejected first-admin bootstrap attempts in security events', true, 0)
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
    VALUES ('1.0.37', timezone('utc'::text, now()));
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
    SET db_version = '1.0.37',
        updated_at = timezone('utc'::text, now()),
        last_update_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.37',
        updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  END IF;
END $$;

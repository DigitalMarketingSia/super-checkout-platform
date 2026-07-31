-- v1.0.39 - Best-effort Supabase Free keepalive for self-hosted installations.
-- The public RPC accepts no input and can only touch this private singleton row.
-- It never reads or writes checkout, account, member, order or payment data.

CREATE TABLE IF NOT EXISTS public.system_keepalive (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  source TEXT NOT NULL DEFAULT 'github_actions',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.system_keepalive
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'github_actions',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now());

ALTER TABLE public.system_keepalive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_keepalive FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_keepalive TO service_role;

DROP POLICY IF EXISTS "Service role can manage system keepalive" ON public.system_keepalive;
CREATE POLICY "Service role can manage system keepalive"
  ON public.system_keepalive
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.super_checkout_keepalive()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.system_keepalive (id, last_seen_at, source)
  VALUES (true, timezone('utc'::text, now()), 'github_actions')
  ON CONFLICT (id) DO UPDATE
  SET last_seen_at = EXCLUDED.last_seen_at,
      source = EXCLUDED.source
  WHERE public.system_keepalive.last_seen_at < EXCLUDED.last_seen_at - INTERVAL '12 hours';

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.super_checkout_keepalive() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_checkout_keepalive() TO anon, service_role;

COMMENT ON TABLE public.system_keepalive IS
  'Private singleton touched by the optional GitHub Actions keepalive. It contains no business or user data.';

COMMENT ON FUNCTION public.super_checkout_keepalive() IS
  'Safe no-argument heartbeat. Anonymous callers can touch only the private singleton at most once per 12 hours.';

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
    VALUES ('1.0.39', 'Add optional GitHub Actions Supabase keepalive heartbeat', true, 0)
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
    VALUES ('1.0.39', timezone('utc'::text, now()));
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'system_info' AND column_name = 'last_update_at'
  ) THEN
    UPDATE public.system_info
    SET db_version = '1.0.39', updated_at = timezone('utc'::text, now()), last_update_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.39', updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  END IF;
END $$;

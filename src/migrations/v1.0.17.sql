-- v1.0.17 - LGPD privacy operations center, retention policies and DSAR workflow.

CREATE TABLE IF NOT EXISTS public.privacy_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  subject_email TEXT NOT NULL,
  subject_name TEXT,
  subject_phone TEXT,
  subject_document TEXT,
  request_channel TEXT NOT NULL DEFAULT 'admin_panel',
  notes TEXT,
  resolution_notes TEXT,
  fulfilled_at TIMESTAMP WITH TIME ZONE,
  requested_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$
BEGIN
  ALTER TABLE public.privacy_requests
    ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE;
  ALTER TABLE public.privacy_requests
    ADD COLUMN IF NOT EXISTS request_type TEXT;
  ALTER TABLE public.privacy_requests
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open';
  ALTER TABLE public.privacy_requests
    ADD COLUMN IF NOT EXISTS subject_email TEXT;
  ALTER TABLE public.privacy_requests
    ADD COLUMN IF NOT EXISTS subject_name TEXT;
  ALTER TABLE public.privacy_requests
    ADD COLUMN IF NOT EXISTS subject_phone TEXT;
  ALTER TABLE public.privacy_requests
    ADD COLUMN IF NOT EXISTS subject_document TEXT;
  ALTER TABLE public.privacy_requests
    ADD COLUMN IF NOT EXISTS request_channel TEXT DEFAULT 'admin_panel';
  ALTER TABLE public.privacy_requests
    ADD COLUMN IF NOT EXISTS notes TEXT;
  ALTER TABLE public.privacy_requests
    ADD COLUMN IF NOT EXISTS resolution_notes TEXT;
  ALTER TABLE public.privacy_requests
    ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMP WITH TIME ZONE;
  ALTER TABLE public.privacy_requests
    ADD COLUMN IF NOT EXISTS requested_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  ALTER TABLE public.privacy_requests
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
  ALTER TABLE public.privacy_requests
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
  ALTER TABLE public.privacy_requests
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
END $$;

UPDATE public.privacy_requests
SET status = COALESCE(NULLIF(BTRIM(status), ''), 'open'),
    request_channel = COALESCE(NULLIF(BTRIM(request_channel), ''), 'admin_panel'),
    metadata = COALESCE(metadata, '{}'::jsonb),
    created_at = COALESCE(created_at, timezone('utc'::text, now())),
    updated_at = COALESCE(updated_at, timezone('utc'::text, now()))
WHERE COALESCE(NULLIF(BTRIM(status), ''), '') = ''
   OR COALESCE(NULLIF(BTRIM(request_channel), ''), '') = ''
   OR metadata IS NULL
   OR created_at IS NULL
   OR updated_at IS NULL;

ALTER TABLE public.privacy_requests ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE public.privacy_requests ALTER COLUMN request_type SET NOT NULL;
ALTER TABLE public.privacy_requests ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.privacy_requests ALTER COLUMN subject_email SET NOT NULL;
ALTER TABLE public.privacy_requests ALTER COLUMN request_channel SET NOT NULL;
ALTER TABLE public.privacy_requests ALTER COLUMN metadata SET NOT NULL;
ALTER TABLE public.privacy_requests ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.privacy_requests ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'privacy_requests_request_type_check'
  ) THEN
    ALTER TABLE public.privacy_requests
      ADD CONSTRAINT privacy_requests_request_type_check
      CHECK (request_type IN ('access', 'correction', 'deletion', 'anonymization', 'objection', 'portability', 'revocation'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'privacy_requests_status_check'
  ) THEN
    ALTER TABLE public.privacy_requests
      ADD CONSTRAINT privacy_requests_status_check
      CHECK (status IN ('open', 'in_review', 'fulfilled', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_privacy_requests_account_created_at
ON public.privacy_requests(account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_subject_email
ON public.privacy_requests(LOWER(subject_email));

CREATE TABLE IF NOT EXISTS public.data_retention_policies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name TEXT NOT NULL UNIQUE,
  retention_days INTEGER NOT NULL,
  run_mode TEXT NOT NULL DEFAULT 'delete',
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$
BEGIN
  ALTER TABLE public.data_retention_policies
    ADD COLUMN IF NOT EXISTS table_name TEXT;
  ALTER TABLE public.data_retention_policies
    ADD COLUMN IF NOT EXISTS retention_days INTEGER;
  ALTER TABLE public.data_retention_policies
    ADD COLUMN IF NOT EXISTS run_mode TEXT DEFAULT 'delete';
  ALTER TABLE public.data_retention_policies
    ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
  ALTER TABLE public.data_retention_policies
    ADD COLUMN IF NOT EXISTS notes TEXT;
  ALTER TABLE public.data_retention_policies
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
  ALTER TABLE public.data_retention_policies
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
END $$;

UPDATE public.data_retention_policies
SET run_mode = COALESCE(NULLIF(BTRIM(run_mode), ''), 'delete'),
    active = COALESCE(active, true),
    created_at = COALESCE(created_at, timezone('utc'::text, now())),
    updated_at = COALESCE(updated_at, timezone('utc'::text, now()))
WHERE COALESCE(NULLIF(BTRIM(run_mode), ''), '') = ''
   OR active IS NULL
   OR created_at IS NULL
   OR updated_at IS NULL;

ALTER TABLE public.data_retention_policies ALTER COLUMN table_name SET NOT NULL;
ALTER TABLE public.data_retention_policies ALTER COLUMN retention_days SET NOT NULL;
ALTER TABLE public.data_retention_policies ALTER COLUMN run_mode SET NOT NULL;
ALTER TABLE public.data_retention_policies ALTER COLUMN active SET NOT NULL;
ALTER TABLE public.data_retention_policies ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.data_retention_policies ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'data_retention_policies_retention_days_check'
  ) THEN
    ALTER TABLE public.data_retention_policies
      ADD CONSTRAINT data_retention_policies_retention_days_check
      CHECK (retention_days > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'data_retention_policies_run_mode_check'
  ) THEN
    ALTER TABLE public.data_retention_policies
      ADD CONSTRAINT data_retention_policies_run_mode_check
      CHECK (run_mode IN ('delete', 'anonymize'));
  END IF;
END $$;

INSERT INTO public.data_retention_policies (table_name, retention_days, run_mode, active, notes)
VALUES
  ('webhook_logs', 90, 'delete', true, 'Payloads tecnicos de webhook nao devem permanecer identificaveis por prazo indefinido.'),
  ('activity_logs', 180, 'delete', true, 'Historico operacional de membros deve ser reavaliado periodicamente.'),
  ('validation_logs', 180, 'delete', true, 'Logs de validacao de licenca devem expirar apos uso operacional razoavel.'),
  ('two_factor_challenges', 30, 'delete', true, 'Desafios MFA expiram rapidamente e nao exigem retencao longa.'),
  ('security_events', 365, 'delete', true, 'Eventos de seguranca podem permanecer por janela maior para investigacao.'),
  ('system_updates_log', 365, 'delete', true, 'Trilha operacional de updates deve permanecer por prazo controlado.')
ON CONFLICT (table_name) DO UPDATE SET
  retention_days = EXCLUDED.retention_days,
  run_mode = EXCLUDED.run_mode,
  active = EXCLUDED.active,
  notes = EXCLUDED.notes,
  updated_at = timezone('utc'::text, now());

CREATE TABLE IF NOT EXISTS public.data_retention_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  policy_id UUID REFERENCES public.data_retention_policies(id) ON DELETE SET NULL,
  table_name TEXT NOT NULL,
  rows_affected INTEGER NOT NULL DEFAULT 0,
  cutoff_at TIMESTAMP WITH TIME ZONE,
  run_mode TEXT NOT NULL DEFAULT 'delete',
  triggered_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$
BEGIN
  ALTER TABLE public.data_retention_runs
    ADD COLUMN IF NOT EXISTS policy_id UUID REFERENCES public.data_retention_policies(id) ON DELETE SET NULL;
  ALTER TABLE public.data_retention_runs
    ADD COLUMN IF NOT EXISTS table_name TEXT;
  ALTER TABLE public.data_retention_runs
    ADD COLUMN IF NOT EXISTS rows_affected INTEGER DEFAULT 0;
  ALTER TABLE public.data_retention_runs
    ADD COLUMN IF NOT EXISTS cutoff_at TIMESTAMP WITH TIME ZONE;
  ALTER TABLE public.data_retention_runs
    ADD COLUMN IF NOT EXISTS run_mode TEXT DEFAULT 'delete';
  ALTER TABLE public.data_retention_runs
    ADD COLUMN IF NOT EXISTS triggered_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  ALTER TABLE public.data_retention_runs
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
  ALTER TABLE public.data_retention_runs
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
END $$;

UPDATE public.data_retention_runs
SET rows_affected = COALESCE(rows_affected, 0),
    run_mode = COALESCE(NULLIF(BTRIM(run_mode), ''), 'delete'),
    metadata = COALESCE(metadata, '{}'::jsonb),
    created_at = COALESCE(created_at, timezone('utc'::text, now()))
WHERE rows_affected IS NULL
   OR COALESCE(NULLIF(BTRIM(run_mode), ''), '') = ''
   OR metadata IS NULL
   OR created_at IS NULL;

ALTER TABLE public.data_retention_runs ALTER COLUMN table_name SET NOT NULL;
ALTER TABLE public.data_retention_runs ALTER COLUMN rows_affected SET NOT NULL;
ALTER TABLE public.data_retention_runs ALTER COLUMN run_mode SET NOT NULL;
ALTER TABLE public.data_retention_runs ALTER COLUMN metadata SET NOT NULL;
ALTER TABLE public.data_retention_runs ALTER COLUMN created_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'data_retention_runs_rows_affected_check'
  ) THEN
    ALTER TABLE public.data_retention_runs
      ADD CONSTRAINT data_retention_runs_rows_affected_check
      CHECK (rows_affected >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'data_retention_runs_run_mode_check'
  ) THEN
    ALTER TABLE public.data_retention_runs
      ADD CONSTRAINT data_retention_runs_run_mode_check
      CHECK (run_mode IN ('delete', 'anonymize'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_data_retention_runs_table_created_at
ON public.data_retention_runs(table_name, created_at DESC);

ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_retention_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view privacy requests for owned accounts" ON public.privacy_requests;
CREATE POLICY "Users can view privacy requests for owned accounts"
ON public.privacy_requests
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.accounts a
    WHERE a.id = privacy_requests.account_id
      AND a.owner_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can insert privacy requests for owned accounts" ON public.privacy_requests;
CREATE POLICY "Users can insert privacy requests for owned accounts"
ON public.privacy_requests
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.accounts a
    WHERE a.id = privacy_requests.account_id
      AND a.owner_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update privacy requests for owned accounts" ON public.privacy_requests;
CREATE POLICY "Users can update privacy requests for owned accounts"
ON public.privacy_requests
FOR UPDATE TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.accounts a
    WHERE a.id = privacy_requests.account_id
      AND a.owner_user_id = auth.uid()
  )
)
WITH CHECK (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.accounts a
    WHERE a.id = privacy_requests.account_id
      AND a.owner_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins can manage data retention policies" ON public.data_retention_policies;
CREATE POLICY "Admins can manage data retention policies"
ON public.data_retention_policies
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can view data retention runs" ON public.data_retention_runs;
CREATE POLICY "Admins can view data retention runs"
ON public.data_retention_runs
FOR SELECT TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert data retention runs" ON public.data_retention_runs;
CREATE POLICY "Admins can insert data retention runs"
ON public.data_retention_runs
FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS update_privacy_requests_updated_at ON public.privacy_requests;
CREATE TRIGGER update_privacy_requests_updated_at
  BEFORE UPDATE ON public.privacy_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS update_data_retention_policies_updated_at ON public.data_retention_policies;
CREATE TRIGGER update_data_retention_policies_updated_at
  BEFORE UPDATE ON public.data_retention_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
VALUES ('1.0.17', 'LGPD privacy requests, retention policies and cleanup audit trail', true, 0)
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
    SET db_version = '1.0.17', updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.17'
    WHERE id = target_id;
  END IF;
END $$;

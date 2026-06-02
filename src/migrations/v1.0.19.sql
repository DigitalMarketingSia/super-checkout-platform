-- v1.0.19 - Platform legal acceptance evidence for institutional account flows.

CREATE TABLE IF NOT EXISTS public.platform_legal_acceptances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  surface TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  privacy_version TEXT NOT NULL,
  terms_url TEXT,
  privacy_url TEXT,
  channel_email TEXT NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$
BEGIN
  ALTER TABLE public.platform_legal_acceptances
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  ALTER TABLE public.platform_legal_acceptances
    ADD COLUMN IF NOT EXISTS email TEXT;
  ALTER TABLE public.platform_legal_acceptances
    ADD COLUMN IF NOT EXISTS surface TEXT;
  ALTER TABLE public.platform_legal_acceptances
    ADD COLUMN IF NOT EXISTS terms_version TEXT;
  ALTER TABLE public.platform_legal_acceptances
    ADD COLUMN IF NOT EXISTS privacy_version TEXT;
  ALTER TABLE public.platform_legal_acceptances
    ADD COLUMN IF NOT EXISTS terms_url TEXT;
  ALTER TABLE public.platform_legal_acceptances
    ADD COLUMN IF NOT EXISTS privacy_url TEXT;
  ALTER TABLE public.platform_legal_acceptances
    ADD COLUMN IF NOT EXISTS channel_email TEXT;
  ALTER TABLE public.platform_legal_acceptances
    ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP WITH TIME ZONE;
  ALTER TABLE public.platform_legal_acceptances
    ADD COLUMN IF NOT EXISTS ip_address TEXT;
  ALTER TABLE public.platform_legal_acceptances
    ADD COLUMN IF NOT EXISTS user_agent TEXT;
  ALTER TABLE public.platform_legal_acceptances
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
  ALTER TABLE public.platform_legal_acceptances
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
  ALTER TABLE public.platform_legal_acceptances
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
END $$;

UPDATE public.platform_legal_acceptances
SET email = LOWER(BTRIM(email)),
    surface = COALESCE(NULLIF(BTRIM(surface), ''), 'register'),
    terms_version = COALESCE(NULLIF(BTRIM(terms_version), ''), 'platform-core-2026.06.01-v1'),
    privacy_version = COALESCE(NULLIF(BTRIM(privacy_version), ''), 'platform-core-2026.06.01-v1'),
    channel_email = COALESCE(NULLIF(LOWER(BTRIM(channel_email)), ''), 'suporte@supercheckout.app'),
    accepted_at = COALESCE(accepted_at, created_at, timezone('utc'::text, now())),
    metadata = COALESCE(metadata, '{}'::jsonb),
    created_at = COALESCE(created_at, timezone('utc'::text, now())),
    updated_at = COALESCE(updated_at, timezone('utc'::text, now()))
WHERE COALESCE(NULLIF(BTRIM(email), ''), '') = ''
   OR COALESCE(NULLIF(BTRIM(surface), ''), '') = ''
   OR COALESCE(NULLIF(BTRIM(terms_version), ''), '') = ''
   OR COALESCE(NULLIF(BTRIM(privacy_version), ''), '') = ''
   OR COALESCE(NULLIF(BTRIM(channel_email), ''), '') = ''
   OR accepted_at IS NULL
   OR metadata IS NULL
   OR created_at IS NULL
   OR updated_at IS NULL;

ALTER TABLE public.platform_legal_acceptances ALTER COLUMN email SET NOT NULL;
ALTER TABLE public.platform_legal_acceptances ALTER COLUMN surface SET NOT NULL;
ALTER TABLE public.platform_legal_acceptances ALTER COLUMN terms_version SET NOT NULL;
ALTER TABLE public.platform_legal_acceptances ALTER COLUMN privacy_version SET NOT NULL;
ALTER TABLE public.platform_legal_acceptances ALTER COLUMN channel_email SET NOT NULL;
ALTER TABLE public.platform_legal_acceptances ALTER COLUMN accepted_at SET NOT NULL;
ALTER TABLE public.platform_legal_acceptances ALTER COLUMN metadata SET NOT NULL;
ALTER TABLE public.platform_legal_acceptances ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.platform_legal_acceptances ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'platform_legal_acceptances_surface_check'
  ) THEN
    ALTER TABLE public.platform_legal_acceptances
      ADD CONSTRAINT platform_legal_acceptances_surface_check
      CHECK (surface IN ('register', 'activation_portal', 'generate_license_gate'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_legal_acceptances_email_surface_version
ON public.platform_legal_acceptances(email, surface, terms_version, privacy_version);

CREATE INDEX IF NOT EXISTS idx_platform_legal_acceptances_user_accepted
ON public.platform_legal_acceptances(user_id, accepted_at DESC);

ALTER TABLE public.platform_legal_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own platform legal acceptances" ON public.platform_legal_acceptances;
CREATE POLICY "Users can view own platform legal acceptances"
ON public.platform_legal_acceptances
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR user_id = auth.uid()
);

DROP POLICY IF EXISTS "Admins can manage platform legal acceptances" ON public.platform_legal_acceptances;
CREATE POLICY "Admins can manage platform legal acceptances"
ON public.platform_legal_acceptances
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Some isolated Supabase projects do not have the shared helper yet.
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_platform_legal_acceptances_updated_at ON public.platform_legal_acceptances;
CREATE TRIGGER update_platform_legal_acceptances_updated_at
  BEFORE UPDATE ON public.platform_legal_acceptances
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'schema_migrations'
  ) THEN
    INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
    VALUES ('1.0.19', 'Platform legal acceptance evidence for registration and activation surfaces', true, 0)
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
    SET db_version = '1.0.19', updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.19'
    WHERE id = target_id;
  END IF;
END $$;

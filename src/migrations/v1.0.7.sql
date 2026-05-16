-- v1.0.7 - Server-side two-factor login challenges.
-- Stores pending 2FA login sessions server-side and exposes only an opaque
-- challenge token to the browser.

CREATE TABLE IF NOT EXISTS public.two_factor_challenges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target TEXT NOT NULL DEFAULT 'local',
  session_payload_encrypted TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verifying', 'verified', 'failed', 'expired')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  last_failed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_two_factor_challenges_user_status
  ON public.two_factor_challenges(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_two_factor_challenges_expires_at
  ON public.two_factor_challenges(expires_at)
  WHERE status IN ('pending', 'verifying');

ALTER TABLE public.two_factor_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages two factor challenges" ON public.two_factor_challenges;
CREATE POLICY "Service role manages two factor challenges"
  ON public.two_factor_challenges
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.two_factor_challenges FROM anon;
REVOKE ALL ON public.two_factor_challenges FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.two_factor_challenges TO service_role;

COMMENT ON TABLE public.two_factor_challenges IS 'Opaque, server-side, single-use challenges for 2FA login.';
COMMENT ON COLUMN public.two_factor_challenges.token_hash IS 'SHA-256 hash of the opaque challenge token sent to the client.';
COMMENT ON COLUMN public.two_factor_challenges.session_payload_encrypted IS 'Encrypted Supabase session payload released only after valid TOTP.';

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
    SET db_version = '1.0.7', updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.7'
    WHERE id = target_id;
  END IF;
END $$;

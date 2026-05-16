-- ==========================================
-- Migration 017: Server-side 2FA Login Challenges
-- Date: 2026-05-14
-- Description: Moves login challenge state out of the browser into a
-- server-side, single-use table protected from anon/authenticated clients.
-- ==========================================

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

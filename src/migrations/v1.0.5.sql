-- v1.0.5 - Webhook tables and public gateway RLS support.
-- Adds the operational webhook configuration/log tables expected by the admin UI
-- and keeps public gateway reads constrained to non-secret fields through RLS/view.

CREATE TABLE IF NOT EXISTS public.webhooks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT[] DEFAULT ARRAY[]::TEXT[],
  active BOOLEAN DEFAULT true,
  method TEXT DEFAULT 'POST',
  last_fired_at TIMESTAMP WITH TIME ZONE,
  last_status INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id UUID REFERENCES public.webhooks(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  response_status INTEGER DEFAULT 0,
  response_body TEXT,
  duration_ms INTEGER DEFAULT 0,
  direction TEXT DEFAULT 'inbound',
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
  ALTER TABLE public.webhooks ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  ALTER TABLE public.webhooks ADD COLUMN IF NOT EXISTS name TEXT;
  ALTER TABLE public.webhooks ADD COLUMN IF NOT EXISTS url TEXT;
  ALTER TABLE public.webhooks ADD COLUMN IF NOT EXISTS events TEXT[] DEFAULT ARRAY[]::TEXT[];
  ALTER TABLE public.webhooks ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
  ALTER TABLE public.webhooks ADD COLUMN IF NOT EXISTS method TEXT DEFAULT 'POST';
  ALTER TABLE public.webhooks ADD COLUMN IF NOT EXISTS last_fired_at TIMESTAMP WITH TIME ZONE;
  ALTER TABLE public.webhooks ADD COLUMN IF NOT EXISTS last_status INTEGER;
  ALTER TABLE public.webhooks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

  ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS webhook_id UUID REFERENCES public.webhooks(id) ON DELETE SET NULL;
  ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS event TEXT;
  ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb;
  ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS response_status INTEGER DEFAULT 0;
  ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS response_body TEXT;
  ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS duration_ms INTEGER DEFAULT 0;
  ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'inbound';
  ALTER TABLE public.webhook_logs ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT false;
END $$;

ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Admins can manage all webhooks" ON public.webhooks;
DROP POLICY IF EXISTS "Users can view own webhook logs" ON public.webhook_logs;
DROP POLICY IF EXISTS "Admins can view all webhook logs" ON public.webhook_logs;

CREATE POLICY "Users can manage their own webhooks"
ON public.webhooks
FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all webhooks"
ON public.webhooks
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Users can view own webhook logs"
ON public.webhook_logs
FOR SELECT TO authenticated
USING (
  webhook_id IS NULL
  OR EXISTS (
    SELECT 1 FROM public.webhooks w
    WHERE w.id = webhook_logs.webhook_id
      AND w.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can view all webhook logs"
ON public.webhook_logs
FOR SELECT TO authenticated
USING (public.is_admin());

CREATE OR REPLACE VIEW public.public_gateways
WITH (security_invoker = true)
AS
SELECT
  id,
  name,
  provider,
  public_key,
  active,
  is_active,
  config
FROM public.gateways
WHERE COALESCE(active, true) = true
  AND COALESCE(is_active, true) = true;

GRANT SELECT ON public.public_gateways TO anon, authenticated;

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
    SET db_version = '1.0.5', updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.5'
    WHERE id = target_id;
  END IF;
END $$;

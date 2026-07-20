-- v1.0.32 - Add push subscription infrastructure for admin PWA.

CREATE TABLE IF NOT EXISTS public.push_notification_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  installation_id UUID,
  enabled BOOLEAN NOT NULL DEFAULT true,
  sale_approved BOOLEAN NOT NULL DEFAULT true,
  payment_failed BOOLEAN NOT NULL DEFAULT true,
  lead_captured BOOLEAN NOT NULL DEFAULT false,
  system_alerts BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id)
);

DO $$
BEGIN
  ALTER TABLE public.push_notification_preferences
    ADD COLUMN IF NOT EXISTS installation_id UUID;
  ALTER TABLE public.push_notification_preferences
    ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true;
  ALTER TABLE public.push_notification_preferences
    ADD COLUMN IF NOT EXISTS sale_approved BOOLEAN DEFAULT true;
  ALTER TABLE public.push_notification_preferences
    ADD COLUMN IF NOT EXISTS payment_failed BOOLEAN DEFAULT true;
  ALTER TABLE public.push_notification_preferences
    ADD COLUMN IF NOT EXISTS lead_captured BOOLEAN DEFAULT false;
  ALTER TABLE public.push_notification_preferences
    ADD COLUMN IF NOT EXISTS system_alerts BOOLEAN DEFAULT true;
  ALTER TABLE public.push_notification_preferences
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
  ALTER TABLE public.push_notification_preferences
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
END $$;

UPDATE public.push_notification_preferences
SET enabled = COALESCE(enabled, true),
    sale_approved = COALESCE(sale_approved, true),
    payment_failed = COALESCE(payment_failed, true),
    lead_captured = COALESCE(lead_captured, false),
    system_alerts = COALESCE(system_alerts, true),
    created_at = COALESCE(created_at, timezone('utc'::text, now())),
    updated_at = COALESCE(updated_at, timezone('utc'::text, now()))
WHERE enabled IS NULL
   OR sale_approved IS NULL
   OR payment_failed IS NULL
   OR lead_captured IS NULL
   OR system_alerts IS NULL
   OR created_at IS NULL
   OR updated_at IS NULL;

ALTER TABLE public.push_notification_preferences ALTER COLUMN enabled SET NOT NULL;
ALTER TABLE public.push_notification_preferences ALTER COLUMN sale_approved SET NOT NULL;
ALTER TABLE public.push_notification_preferences ALTER COLUMN payment_failed SET NOT NULL;
ALTER TABLE public.push_notification_preferences ALTER COLUMN lead_captured SET NOT NULL;
ALTER TABLE public.push_notification_preferences ALTER COLUMN system_alerts SET NOT NULL;
ALTER TABLE public.push_notification_preferences ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.push_notification_preferences ALTER COLUMN updated_at SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  installation_id UUID,
  surface_key TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  subscription_json JSONB NOT NULL,
  p256dh_key TEXT,
  auth_key TEXT,
  permission_state TEXT NOT NULL DEFAULT 'granted',
  device_label TEXT,
  user_agent TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  revoked_at TIMESTAMP WITH TIME ZONE,
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$
BEGIN
  ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS installation_id UUID;
  ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS surface_key TEXT;
  ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS endpoint TEXT;
  ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS subscription_json JSONB DEFAULT '{}'::jsonb;
  ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS p256dh_key TEXT;
  ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS auth_key TEXT;
  ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS permission_state TEXT DEFAULT 'granted';
  ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS device_label TEXT;
  ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS user_agent TEXT;
  ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
  ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP WITH TIME ZONE;
  ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
  ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
  ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
END $$;

UPDATE public.push_subscriptions
SET subscription_json = COALESCE(subscription_json, '{}'::jsonb),
    permission_state = COALESCE(NULLIF(BTRIM(permission_state), ''), 'granted'),
    is_active = COALESCE(is_active, true),
    last_seen_at = COALESCE(last_seen_at, timezone('utc'::text, now())),
    created_at = COALESCE(created_at, timezone('utc'::text, now())),
    updated_at = COALESCE(updated_at, timezone('utc'::text, now()))
WHERE subscription_json IS NULL
   OR permission_state IS NULL
   OR permission_state = ''
   OR is_active IS NULL
   OR last_seen_at IS NULL
   OR created_at IS NULL
   OR updated_at IS NULL;

ALTER TABLE public.push_subscriptions ALTER COLUMN surface_key SET NOT NULL;
ALTER TABLE public.push_subscriptions ALTER COLUMN endpoint SET NOT NULL;
ALTER TABLE public.push_subscriptions ALTER COLUMN subscription_json SET NOT NULL;
ALTER TABLE public.push_subscriptions ALTER COLUMN permission_state SET NOT NULL;
ALTER TABLE public.push_subscriptions ALTER COLUMN is_active SET NOT NULL;
ALTER TABLE public.push_subscriptions ALTER COLUMN last_seen_at SET NOT NULL;
ALTER TABLE public.push_subscriptions ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.push_subscriptions ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'push_subscriptions_surface_key_check'
  ) THEN
    ALTER TABLE public.push_subscriptions
      ADD CONSTRAINT push_subscriptions_surface_key_check
      CHECK (surface_key IN ('admin', 'portal'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'push_subscriptions_permission_state_check'
  ) THEN
    ALTER TABLE public.push_subscriptions
      ADD CONSTRAINT push_subscriptions_permission_state_check
      CHECK (permission_state IN ('default', 'granted', 'denied', 'revoked'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_push_notification_preferences_user
ON public.push_notification_preferences(user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_surface
ON public.push_subscriptions(user_id, surface_key, is_active);

ALTER TABLE public.push_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own push notification preferences" ON public.push_notification_preferences;
CREATE POLICY "Users can view own push notification preferences"
ON public.push_notification_preferences
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own push notification preferences" ON public.push_notification_preferences;
CREATE POLICY "Users can manage own push notification preferences"
ON public.push_notification_preferences
FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all push notification preferences" ON public.push_notification_preferences;
CREATE POLICY "Admins can view all push notification preferences"
ON public.push_notification_preferences
FOR SELECT TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Users can view own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can view own push subscriptions"
ON public.push_subscriptions
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can manage own push subscriptions"
ON public.push_subscriptions
FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Admins can view all push subscriptions"
ON public.push_subscriptions
FOR SELECT TO authenticated
USING (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_notification_preferences TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated, service_role;

DROP TRIGGER IF EXISTS update_push_notification_preferences_updated_at ON public.push_notification_preferences;
CREATE TRIGGER update_push_notification_preferences_updated_at
  BEFORE UPDATE ON public.push_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS update_push_subscriptions_updated_at ON public.push_subscriptions;
CREATE TRIGGER update_push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

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
    VALUES ('1.0.32', 'Add push subscription infrastructure for admin PWA', true, 0)
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
    VALUES ('1.0.32', timezone('utc'::text, now()));
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
    SET db_version = '1.0.32',
        updated_at = timezone('utc'::text, now()),
        last_update_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.32',
        updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  END IF;
END $$;

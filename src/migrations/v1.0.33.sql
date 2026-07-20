-- v1.0.33 - Add PWA push diagnostics telemetry and device reset support.

DO $$
BEGIN
  ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS last_test_sent_at TIMESTAMP WITH TIME ZONE;
  ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS last_push_received_at TIMESTAMP WITH TIME ZONE;
  ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS last_push_clicked_at TIMESTAMP WITH TIME ZONE;
  ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS last_delivery_state TEXT;
  ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS last_delivery_tag TEXT;
  ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS last_delivery_title TEXT;
  ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS last_delivery_body TEXT;
  ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS last_delivery_error TEXT;
  ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS last_delivery_sw_version TEXT;
END $$;

UPDATE public.push_subscriptions
SET last_delivery_state = COALESCE(
      NULLIF(BTRIM(last_delivery_state), ''),
      CASE
        WHEN is_active = true AND permission_state = 'granted' THEN 'registered'
        WHEN permission_state = 'revoked' OR is_active = false THEN 'revoked'
        ELSE NULL
      END
    )
WHERE last_delivery_state IS NULL
   OR last_delivery_state = '';

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_last_test_sent_at
ON public.push_subscriptions(last_test_sent_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_last_push_received_at
ON public.push_subscriptions(last_push_received_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_last_push_clicked_at
ON public.push_subscriptions(last_push_clicked_at DESC NULLS LAST);

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
    VALUES ('1.0.33', 'Add PWA push diagnostics telemetry and device reset support', true, 0)
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
    VALUES ('1.0.33', timezone('utc'::text, now()));
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
    SET db_version = '1.0.33',
        updated_at = timezone('utc'::text, now()),
        last_update_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.33',
        updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  END IF;
END $$;

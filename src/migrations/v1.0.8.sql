-- v1.0.8 - Installer schema compatibility for current admin/member flows.
-- Adds columns used by login telemetry and member area branding/settings.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.member_areas
  ADD COLUMN IF NOT EXISTS layout_mode TEXT DEFAULT 'content',
  ADD COLUMN IF NOT EXISTS card_style TEXT DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS banner_title TEXT,
  ADD COLUMN IF NOT EXISTS banner_description TEXT,
  ADD COLUMN IF NOT EXISTS banner_button_text TEXT,
  ADD COLUMN IF NOT EXISTS banner_button_link TEXT,
  ADD COLUMN IF NOT EXISTS sidebar_config JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS custom_links JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS faqs JSONB DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';

INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
VALUES ('1.0.8', 'Installer schema compatibility for login telemetry and member areas', true, 0)
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
    SET db_version = '1.0.8', updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.8'
    WHERE id = target_id;
  END IF;
END $$;

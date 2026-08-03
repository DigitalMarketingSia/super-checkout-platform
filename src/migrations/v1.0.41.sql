-- v1.0.41 - Formalize platform email template metadata and owner-only access.
-- This migration is intentionally owner_manual because it changes RLS policies
-- and the SECURITY DEFINER authorization function used by the control plane.

DO $$
BEGIN
  IF to_regclass('public.system_email_templates') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.system_email_templates
    ADD COLUMN IF NOT EXISTS template_key TEXT,
    ADD COLUMN IF NOT EXISTS audience TEXT DEFAULT 'beneficiary',
    ADD COLUMN IF NOT EXISTS template_version INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS sender_profile TEXT DEFAULT 'platform',
    ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'pt',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

  UPDATE public.system_email_templates
  SET template_key = event_type
  WHERE NULLIF(BTRIM(template_key), '') IS NULL;

  UPDATE public.system_email_templates
  SET audience = COALESCE(NULLIF(BTRIM(audience), ''), 'beneficiary'),
      template_version = COALESCE(template_version, 1),
      sender_profile = COALESCE(NULLIF(BTRIM(sender_profile), ''), 'platform'),
      language = COALESCE(NULLIF(BTRIM(language), ''), 'pt'),
      updated_at = COALESCE(updated_at, timezone('utc'::text, now()));

  ALTER TABLE public.system_email_templates
    ALTER COLUMN audience SET DEFAULT 'beneficiary',
    ALTER COLUMN template_version SET DEFAULT 1,
    ALTER COLUMN sender_profile SET DEFAULT 'platform',
    ALTER COLUMN language SET DEFAULT 'pt',
    ALTER COLUMN updated_at SET DEFAULT timezone('utc'::text, now());

  -- Legacy installs may still have a one-column unique constraint. The
  -- canonical contract is one immutable key per language.
  ALTER TABLE public.system_email_templates DROP CONSTRAINT IF EXISTS uq_system_event_type;
  ALTER TABLE public.system_email_templates DROP CONSTRAINT IF EXISTS system_email_templates_event_type_key;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_system_email_templates_template_key_language
  ON public.system_email_templates(template_key, language)
  WHERE template_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_system_email_templates_event_type_language
  ON public.system_email_templates(event_type, language);

CREATE OR REPLACE FUNCTION public.sync_system_email_template_key()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NULLIF(BTRIM(OLD.template_key), '') IS NOT NULL
    AND NULLIF(BTRIM(NEW.template_key), '') IS DISTINCT FROM NULLIF(BTRIM(OLD.template_key), '') THEN
    RAISE EXCEPTION 'system email template_key is immutable';
  END IF;

  IF NULLIF(BTRIM(NEW.template_key), '') IS NULL THEN
    NEW.template_key := NEW.event_type;
  END IF;
  NEW.audience := COALESCE(NULLIF(BTRIM(NEW.audience), ''), 'beneficiary');
  NEW.template_version := COALESCE(NEW.template_version, 1);
  NEW.sender_profile := COALESCE(NULLIF(BTRIM(NEW.sender_profile), ''), 'platform');
  NEW.language := COALESCE(NULLIF(BTRIM(NEW.language), ''), 'pt');
  NEW.updated_at := timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_system_email_template_metadata ON public.system_email_templates;
CREATE TRIGGER sync_system_email_template_metadata
  BEFORE INSERT OR UPDATE ON public.system_email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_system_email_template_key();

CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'master_admin'
      AND COALESCE(is_blocked, false) = false
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_owner() TO authenticated, service_role;

DO $$
DECLARE
  policy_record RECORD;
BEGIN
  IF to_regclass('public.system_email_templates') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.system_email_templates ENABLE ROW LEVEL SECURITY;

  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'system_email_templates'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.system_email_templates', policy_record.policyname);
  END LOOP;

  EXECUTE 'CREATE POLICY "Platform owners can read system email templates" ON public.system_email_templates FOR SELECT TO authenticated USING (public.is_platform_owner())';
  EXECUTE 'CREATE POLICY "Platform owners can insert system email templates" ON public.system_email_templates FOR INSERT TO authenticated WITH CHECK (public.is_platform_owner())';
  EXECUTE 'CREATE POLICY "Platform owners can update system email templates" ON public.system_email_templates FOR UPDATE TO authenticated USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner())';
  EXECUTE 'CREATE POLICY "Platform owners can delete system email templates" ON public.system_email_templates FOR DELETE TO authenticated USING (public.is_platform_owner())';
END $$;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
    VALUES ('1.0.41', 'Formalize platform email template metadata and owner-only RLS', true, 0)
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
    VALUES ('1.0.41', timezone('utc'::text, now()));
    RETURN;
  END IF;

  UPDATE public.system_info
  SET db_version = '1.0.41',
      updated_at = timezone('utc'::text, now()),
      last_update_at = timezone('utc'::text, now())
  WHERE id = target_id;
END $$;

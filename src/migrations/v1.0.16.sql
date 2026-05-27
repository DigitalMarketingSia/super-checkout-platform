-- v1.0.16 - LGPD consent tracking foundation and legal document version metadata.

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS privacy_policy_version TEXT,
  ADD COLUMN IF NOT EXISTS privacy_policy_published_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS terms_of_purchase_version TEXT,
  ADD COLUMN IF NOT EXISTS terms_of_purchase_published_at TIMESTAMP WITH TIME ZONE;

UPDATE public.business_settings
SET privacy_policy_published_at = COALESCE(privacy_policy_published_at, updated_at, timezone('utc'::text, now()))
WHERE COALESCE(NULLIF(BTRIM(privacy_policy), ''), '') <> ''
  AND privacy_policy_published_at IS NULL;

UPDATE public.business_settings
SET terms_of_purchase_published_at = COALESCE(terms_of_purchase_published_at, updated_at, timezone('utc'::text, now()))
WHERE COALESCE(NULLIF(BTRIM(terms_of_purchase), ''), '') <> ''
  AND terms_of_purchase_published_at IS NULL;

UPDATE public.business_settings
SET privacy_policy_version = CONCAT(
    'privacy-',
    TO_CHAR(COALESCE(privacy_policy_published_at, updated_at, timezone('utc'::text, now())), 'YYYY.MM.DD')
)
WHERE COALESCE(NULLIF(BTRIM(privacy_policy), ''), '') <> ''
  AND COALESCE(NULLIF(BTRIM(privacy_policy_version), ''), '') = '';

UPDATE public.business_settings
SET terms_of_purchase_version = CONCAT(
    'terms-',
    TO_CHAR(COALESCE(terms_of_purchase_published_at, updated_at, timezone('utc'::text, now())), 'YYYY.MM.DD')
)
WHERE COALESCE(NULLIF(BTRIM(terms_of_purchase), ''), '') <> ''
  AND COALESCE(NULLIF(BTRIM(terms_of_purchase_version), ''), '') = '';

CREATE TABLE IF NOT EXISTS public.consent_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  checkout_id UUID NOT NULL REFERENCES public.checkouts(id) ON DELETE CASCADE,
  visitor_key TEXT NOT NULL,
  source_surface TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  necessary BOOLEAN NOT NULL DEFAULT true,
  analytics BOOLEAN NOT NULL DEFAULT false,
  marketing BOOLEAN NOT NULL DEFAULT false,
  revoked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$
BEGIN
  ALTER TABLE public.consent_preferences
    ADD COLUMN IF NOT EXISTS checkout_id UUID REFERENCES public.checkouts(id) ON DELETE CASCADE;
  ALTER TABLE public.consent_preferences
    ADD COLUMN IF NOT EXISTS visitor_key TEXT;
  ALTER TABLE public.consent_preferences
    ADD COLUMN IF NOT EXISTS source_surface TEXT;
  ALTER TABLE public.consent_preferences
    ADD COLUMN IF NOT EXISTS consent_version TEXT;
  ALTER TABLE public.consent_preferences
    ADD COLUMN IF NOT EXISTS necessary BOOLEAN DEFAULT true;
  ALTER TABLE public.consent_preferences
    ADD COLUMN IF NOT EXISTS analytics BOOLEAN DEFAULT false;
  ALTER TABLE public.consent_preferences
    ADD COLUMN IF NOT EXISTS marketing BOOLEAN DEFAULT false;
  ALTER TABLE public.consent_preferences
    ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP WITH TIME ZONE;
  ALTER TABLE public.consent_preferences
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
  ALTER TABLE public.consent_preferences
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
END $$;

UPDATE public.consent_preferences
SET visitor_key = COALESCE(NULLIF(BTRIM(visitor_key), ''), CONCAT('legacy-', id::text)),
    source_surface = COALESCE(NULLIF(BTRIM(source_surface), ''), 'public_checkout'),
    consent_version = COALESCE(NULLIF(BTRIM(consent_version), ''), 'lgpd-consent-2026.05'),
    necessary = COALESCE(necessary, true),
    analytics = COALESCE(analytics, false),
    marketing = COALESCE(marketing, false),
    created_at = COALESCE(created_at, timezone('utc'::text, now())),
    updated_at = COALESCE(updated_at, timezone('utc'::text, now()));

ALTER TABLE public.consent_preferences ALTER COLUMN checkout_id SET NOT NULL;
ALTER TABLE public.consent_preferences ALTER COLUMN visitor_key SET NOT NULL;
ALTER TABLE public.consent_preferences ALTER COLUMN source_surface SET NOT NULL;
ALTER TABLE public.consent_preferences ALTER COLUMN consent_version SET NOT NULL;
ALTER TABLE public.consent_preferences ALTER COLUMN necessary SET NOT NULL;
ALTER TABLE public.consent_preferences ALTER COLUMN analytics SET NOT NULL;
ALTER TABLE public.consent_preferences ALTER COLUMN marketing SET NOT NULL;
ALTER TABLE public.consent_preferences ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.consent_preferences ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'consent_preferences_source_surface_check'
  ) THEN
    ALTER TABLE public.consent_preferences
      ADD CONSTRAINT consent_preferences_source_surface_check
      CHECK (source_surface IN ('public_checkout', 'thank_you'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_consent_preferences_checkout_visitor
ON public.consent_preferences(checkout_id, visitor_key);

ALTER TABLE public.consent_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view consent preferences for owned checkouts" ON public.consent_preferences;
CREATE POLICY "Users can view consent preferences for owned checkouts"
ON public.consent_preferences
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.checkouts c
    WHERE c.id = consent_preferences.checkout_id
      AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins can view all consent preferences" ON public.consent_preferences;
CREATE POLICY "Admins can view all consent preferences"
ON public.consent_preferences
FOR SELECT TO authenticated
USING (public.is_admin());

DROP TRIGGER IF EXISTS update_consent_preferences_updated_at ON public.consent_preferences;
CREATE TRIGGER update_consent_preferences_updated_at
  BEFORE UPDATE ON public.consent_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

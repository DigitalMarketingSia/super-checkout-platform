-- ==========================================
-- 0. SYSTEM BOOTSTRAP (Essential for tracking)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.system_info(
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    db_version TEXT NOT NULL DEFAULT '1.0.19',
    last_update_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    github_installation_id TEXT,
    github_repository TEXT,
    testing_evolution BOOLEAN DEFAULT false
);

INSERT INTO public.system_info (db_version) 
SELECT '1.0.19' WHERE NOT EXISTS (SELECT 1 FROM public.system_info);

DO $$
BEGIN
    ALTER TABLE public.system_info ADD COLUMN IF NOT EXISTS github_installation_id TEXT;
    ALTER TABLE public.system_info ADD COLUMN IF NOT EXISTS github_repository TEXT;
    ALTER TABLE public.system_info ADD COLUMN IF NOT EXISTS testing_evolution BOOLEAN DEFAULT false;
END $$;

CREATE TABLE IF NOT EXISTS public.schema_migrations(
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    version TEXT NOT NULL UNIQUE,
    description TEXT,
    success BOOLEAN NOT NULL,
    execution_time_ms INTEGER,
    error_log TEXT,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.system_features(
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    feature_key TEXT UNIQUE NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.system_updates_log(
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    files_affected JSONB,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.system_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_updates_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage system update logs" ON public.system_updates_log;

CREATE TABLE IF NOT EXISTS public.system_email_templates(
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type TEXT NOT NULL,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    html_body TEXT NOT NULL,
    active BOOLEAN DEFAULT true,
    language TEXT DEFAULT 'pt',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(event_type, language)
);

-- ==========================================
-- 1. EXTENSIONS & CONFIGURATION
-- ==========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1.1 Bootstrap helper functions required by early policies on fresh installs.
-- `public.is_admin()` starts as a safe stub because `public.profiles`
-- is only created later in this schema.
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 2. CORE TABLES (Idempotent Creation)
-- ==========================================

-- 2.1 Domains
CREATE TABLE IF NOT EXISTS domains(
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    domain TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'pending_verification',
    type TEXT DEFAULT 'cname',
    usage TEXT DEFAULT 'checkout',
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    ALTER TABLE domains ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
    ALTER TABLE domains ADD COLUMN IF NOT EXISTS usage TEXT DEFAULT 'checkout';
    ALTER TABLE domains ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'cname';
    ALTER TABLE domains ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE domains ADD COLUMN IF NOT EXISTS checkout_id UUID;
EXCEPTION
    WHEN duplicate_column THEN RAISE NOTICE 'Column already exists in domains.';
END $$;

-- 2.1.1 App Config (SECURITY HARDENING - INSTALLATION ID)
CREATE TABLE IF NOT EXISTS app_config(
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- RLS FOR DOMAINS (ALLOW PUBLIC READ FOR LICENSE GUARD)
ALTER TABLE domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access for domains" ON domains FOR SELECT USING (true);
CREATE POLICY "Admin can manage domains" ON domains USING (auth.role() = 'authenticated');

-- 2.1.2 Grants (Explicitly ensure anon can read - CRITICAL FIX)
GRANT SELECT ON public.domains TO anon;
GRANT SELECT ON public.domains TO authenticated;
GRANT ALL ON public.domains TO service_role;

-- RLS FOR APP CONFIG (READ ONLY PUBLIC FOR LICENSE GUARD)
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read app_config" ON app_config FOR SELECT USING (true);
CREATE POLICY "Admin manage app_config" ON app_config USING (auth.role() = 'authenticated');

-- 2.1.2 Accounts / Business Settings (Self-hosted business identity)
CREATE TABLE IF NOT EXISTS public.accounts(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_type TEXT NOT NULL DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'active',
    trust_score INTEGER NOT NULL DEFAULT 50,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_owner_user_id
ON public.accounts(owner_user_id);

CREATE TABLE IF NOT EXISTS public.business_settings(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    business_name TEXT,
    legal_name TEXT,
    legal_responsible_email TEXT,
    support_email TEXT,
    support_whatsapp TEXT,
    sender_name TEXT,
    sender_email TEXT,
    logo_url TEXT,
    primary_color TEXT DEFAULT '#007bff',
    privacy_policy TEXT,
    privacy_policy_version TEXT,
    privacy_policy_published_at TIMESTAMP WITH TIME ZONE,
    terms_of_purchase TEXT,
    terms_of_purchase_version TEXT,
    terms_of_purchase_published_at TIMESTAMP WITH TIME ZONE,
    show_legal_footer BOOLEAN DEFAULT true,
    compliance_status TEXT NOT NULL DEFAULT 'pending',
    is_ready_to_sell BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS legal_name TEXT;
    ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS legal_responsible_email TEXT;
    ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS support_email TEXT;
    ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS support_whatsapp TEXT;
    ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS sender_name TEXT;
    ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS sender_email TEXT;
    ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS logo_url TEXT;
    ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#007bff';
    ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS privacy_policy TEXT;
    ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS privacy_policy_version TEXT;
    ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS privacy_policy_published_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS terms_of_purchase TEXT;
    ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS terms_of_purchase_version TEXT;
    ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS terms_of_purchase_published_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS show_legal_footer BOOLEAN DEFAULT true;
    ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS compliance_status TEXT DEFAULT 'pending';
    ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS is_ready_to_sell BOOLEAN DEFAULT false;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_business_settings_account_id
ON public.business_settings(account_id);

CREATE TABLE IF NOT EXISTS public.business_legal_document_versions(
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    document_key TEXT NOT NULL,
    version TEXT NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE NOT NULL,
    source TEXT NOT NULL DEFAULT 'custom',
    template_content TEXT,
    rendered_content TEXT NOT NULL,
    content_sha256 TEXT GENERATED ALWAYS AS (encode(digest(COALESCE(rendered_content, ''), 'sha256'), 'hex')) STORED,
    legal_name TEXT,
    legal_contact TEXT,
    support_email TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    ALTER TABLE public.business_legal_document_versions ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE;
    ALTER TABLE public.business_legal_document_versions ADD COLUMN IF NOT EXISTS document_key TEXT;
    ALTER TABLE public.business_legal_document_versions ADD COLUMN IF NOT EXISTS version TEXT;
    ALTER TABLE public.business_legal_document_versions ADD COLUMN IF NOT EXISTS published_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE public.business_legal_document_versions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'custom';
    ALTER TABLE public.business_legal_document_versions ADD COLUMN IF NOT EXISTS template_content TEXT;
    ALTER TABLE public.business_legal_document_versions ADD COLUMN IF NOT EXISTS rendered_content TEXT;
    ALTER TABLE public.business_legal_document_versions ADD COLUMN IF NOT EXISTS content_sha256 TEXT GENERATED ALWAYS AS (encode(digest(COALESCE(rendered_content, ''), 'sha256'), 'hex')) STORED;
    ALTER TABLE public.business_legal_document_versions ADD COLUMN IF NOT EXISTS legal_name TEXT;
    ALTER TABLE public.business_legal_document_versions ADD COLUMN IF NOT EXISTS legal_contact TEXT;
    ALTER TABLE public.business_legal_document_versions ADD COLUMN IF NOT EXISTS support_email TEXT;
    ALTER TABLE public.business_legal_document_versions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE public.business_legal_document_versions ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    ALTER TABLE public.business_legal_document_versions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
    ALTER TABLE public.business_legal_document_versions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
END $$;

UPDATE public.business_legal_document_versions
SET document_key = COALESCE(NULLIF(BTRIM(document_key), ''), 'privacy_policy'),
    version = COALESCE(NULLIF(BTRIM(version), ''), CONCAT('legacy-', TO_CHAR(COALESCE(created_at, timezone('utc'::text, now())), 'YYYY.MM.DD.HH24MI'))),
    published_at = COALESCE(published_at, created_at, timezone('utc'::text, now())),
    source = COALESCE(
        NULLIF(BTRIM(source), ''),
        CASE
            WHEN COALESCE(NULLIF(BTRIM(template_content), ''), '') = '' THEN 'default'
            ELSE 'custom'
        END
    ),
    rendered_content = COALESCE(NULLIF(rendered_content, ''), COALESCE(template_content, 'Documento legal indisponivel.')),
    legal_name = COALESCE(NULLIF(BTRIM(legal_name), ''), 'Este vendedor'),
    legal_contact = COALESCE(NULLIF(BTRIM(legal_contact), ''), NULLIF(BTRIM(support_email), ''), 'nao informado'),
    support_email = COALESCE(NULLIF(BTRIM(support_email), ''), 'nao informado'),
    metadata = COALESCE(metadata, '{}'::jsonb),
    created_at = COALESCE(created_at, timezone('utc'::text, now())),
    updated_at = COALESCE(updated_at, timezone('utc'::text, now()))
WHERE COALESCE(NULLIF(BTRIM(document_key), ''), '') = ''
   OR COALESCE(NULLIF(BTRIM(version), ''), '') = ''
   OR published_at IS NULL
   OR COALESCE(NULLIF(BTRIM(source), ''), '') = ''
   OR COALESCE(NULLIF(rendered_content, ''), '') = ''
   OR COALESCE(NULLIF(BTRIM(legal_name), ''), '') = ''
   OR COALESCE(NULLIF(BTRIM(legal_contact), ''), '') = ''
   OR COALESCE(NULLIF(BTRIM(support_email), ''), '') = ''
   OR metadata IS NULL
   OR created_at IS NULL
   OR updated_at IS NULL;

ALTER TABLE public.business_legal_document_versions ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE public.business_legal_document_versions ALTER COLUMN document_key SET NOT NULL;
ALTER TABLE public.business_legal_document_versions ALTER COLUMN version SET NOT NULL;
ALTER TABLE public.business_legal_document_versions ALTER COLUMN published_at SET NOT NULL;
ALTER TABLE public.business_legal_document_versions ALTER COLUMN source SET NOT NULL;
ALTER TABLE public.business_legal_document_versions ALTER COLUMN rendered_content SET NOT NULL;
ALTER TABLE public.business_legal_document_versions ALTER COLUMN metadata SET NOT NULL;
ALTER TABLE public.business_legal_document_versions ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.business_legal_document_versions ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_legal_document_versions_document_key_check') THEN
        ALTER TABLE public.business_legal_document_versions
        ADD CONSTRAINT business_legal_document_versions_document_key_check
        CHECK (document_key IN ('privacy_policy', 'terms_of_purchase'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_legal_document_versions_source_check') THEN
        ALTER TABLE public.business_legal_document_versions
        ADD CONSTRAINT business_legal_document_versions_source_check
        CHECK (source IN ('custom', 'default'));
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_business_legal_document_versions_snapshot
ON public.business_legal_document_versions(account_id, document_key, content_sha256);

CREATE INDEX IF NOT EXISTS idx_business_legal_document_versions_account_published
ON public.business_legal_document_versions(account_id, document_key, published_at DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.consent_preferences(
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    checkout_id UUID NOT NULL,
    visitor_key TEXT NOT NULL,
    source_surface TEXT NOT NULL CHECK (source_surface IN ('public_checkout', 'thank_you')),
    consent_version TEXT NOT NULL,
    necessary BOOLEAN NOT NULL DEFAULT true,
    analytics BOOLEAN NOT NULL DEFAULT false,
    marketing BOOLEAN NOT NULL DEFAULT false,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    ALTER TABLE public.consent_preferences ADD COLUMN IF NOT EXISTS checkout_id UUID;
    ALTER TABLE public.consent_preferences ADD COLUMN IF NOT EXISTS visitor_key TEXT;
    ALTER TABLE public.consent_preferences ADD COLUMN IF NOT EXISTS source_surface TEXT;
    ALTER TABLE public.consent_preferences ADD COLUMN IF NOT EXISTS consent_version TEXT;
    ALTER TABLE public.consent_preferences ADD COLUMN IF NOT EXISTS necessary BOOLEAN DEFAULT true;
    ALTER TABLE public.consent_preferences ADD COLUMN IF NOT EXISTS analytics BOOLEAN DEFAULT false;
    ALTER TABLE public.consent_preferences ADD COLUMN IF NOT EXISTS marketing BOOLEAN DEFAULT false;
    ALTER TABLE public.consent_preferences ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE public.consent_preferences ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
    ALTER TABLE public.consent_preferences ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_consent_preferences_checkout_visitor
ON public.consent_preferences(checkout_id, visitor_key);

-- 2.2 Member Areas
CREATE TABLE IF NOT EXISTS member_areas(
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id UUID REFERENCES auth.users(id) NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    domain_id UUID REFERENCES domains(id),
    logo_url TEXT,
    favicon_url TEXT,
    primary_color TEXT DEFAULT '#E50914',
    banner_url TEXT,
    banner_title TEXT,
    banner_description TEXT,
    banner_button_text TEXT,
    banner_button_link TEXT,
    login_image_url TEXT,
    allow_free_signup BOOLEAN DEFAULT TRUE,
    layout_mode TEXT DEFAULT 'content',
    card_style TEXT DEFAULT 'standard',
    sidebar_config JSONB DEFAULT '[]'::jsonb,
    custom_links JSONB DEFAULT '[]'::jsonb,
    faqs JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    ALTER TABLE member_areas ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES domains(id);
    ALTER TABLE member_areas ADD COLUMN IF NOT EXISTS favicon_url TEXT;
    ALTER TABLE member_areas ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#E50914';
    ALTER TABLE member_areas ADD COLUMN IF NOT EXISTS banner_url TEXT;
    ALTER TABLE member_areas ADD COLUMN IF NOT EXISTS banner_title TEXT;
    ALTER TABLE member_areas ADD COLUMN IF NOT EXISTS banner_description TEXT;
    ALTER TABLE member_areas ADD COLUMN IF NOT EXISTS banner_button_text TEXT;
    ALTER TABLE member_areas ADD COLUMN IF NOT EXISTS banner_button_link TEXT;
    ALTER TABLE member_areas ADD COLUMN IF NOT EXISTS login_image_url TEXT;
    ALTER TABLE member_areas ADD COLUMN IF NOT EXISTS allow_free_signup BOOLEAN DEFAULT TRUE;
    ALTER TABLE member_areas ADD COLUMN IF NOT EXISTS layout_mode TEXT DEFAULT 'content';
    ALTER TABLE member_areas ADD COLUMN IF NOT EXISTS card_style TEXT DEFAULT 'standard';
    ALTER TABLE member_areas ADD COLUMN IF NOT EXISTS sidebar_config JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE member_areas ADD COLUMN IF NOT EXISTS custom_links JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE member_areas ADD COLUMN IF NOT EXISTS faqs JSONB DEFAULT '[]'::jsonb;
END $$;

-- 2.3 Products
CREATE TABLE IF NOT EXISTS products(
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    currency TEXT DEFAULT 'BRL',
    image_url TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    ALTER TABLE products ADD COLUMN IF NOT EXISTS price_real DECIMAL(10, 2);
    ALTER TABLE products ADD COLUMN IF NOT EXISTS price_fake DECIMAL(10, 2);
    ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS redirect_link TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS is_order_bump BOOLEAN DEFAULT false;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS is_upsell BOOLEAN DEFAULT false;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS visible_in_member_area BOOLEAN DEFAULT true;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS for_sale BOOLEAN DEFAULT true;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS member_area_action TEXT DEFAULT 'none';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS member_area_checkout_id UUID;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'BRL';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS member_area_id UUID;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS saas_plan_slug TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_file_path TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_file_name TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_file_mime_type TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_file_size_bytes BIGINT;
END $$;

UPDATE public.products
SET member_area_action = 'none'
WHERE member_area_action IS NOT NULL
  AND member_area_action NOT IN ('none', 'checkout', 'sales_page', 'file');

ALTER TABLE public.products
    DROP CONSTRAINT IF EXISTS products_member_area_action_check;

ALTER TABLE public.products
    ADD CONSTRAINT products_member_area_action_check
    CHECK (
        member_area_action IS NULL
        OR member_area_action IN ('none', 'checkout', 'sales_page', 'file')
    );

-- 2.4 Gateways (Essential for checkout)
CREATE TABLE IF NOT EXISTS gateways(
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    name TEXT,
    provider TEXT NOT NULL,
    credentials JSONB DEFAULT '{}'::jsonb,
    config JSONB DEFAULT '{}'::jsonb,
    active BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    public_key TEXT,
    private_key TEXT,
    webhook_secret TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    ALTER TABLE gateways ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE gateways ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    ALTER TABLE gateways ADD COLUMN IF NOT EXISTS public_key TEXT;
    ALTER TABLE gateways ADD COLUMN IF NOT EXISTS private_key TEXT;
    ALTER TABLE gateways ADD COLUMN IF NOT EXISTS webhook_secret TEXT;
END $$;

CREATE OR REPLACE VIEW public.public_gateways
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

-- 2.4.1 Webhooks
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

-- 2.5 Checkouts
CREATE TABLE IF NOT EXISTS checkouts(
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    product_id UUID REFERENCES products(id) NOT NULL,
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    theme JSONB DEFAULT '{}'::jsonb,
    settings JSONB DEFAULT '{}'::jsonb,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS offer_id UUID;
    ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS gateway_id UUID REFERENCES gateways(id);
    ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES domains(id);
    ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS order_bump_ids JSONB;
    ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS upsell_product_id UUID;
    ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS custom_url_slug TEXT;
    ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS config JSONB;
END $$;

DO $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'consent_preferences_checkout_id_fk') THEN
        ALTER TABLE public.consent_preferences
        ADD CONSTRAINT consent_preferences_checkout_id_fk
        FOREIGN KEY(checkout_id)
        REFERENCES public.checkouts(id)
        ON DELETE CASCADE;
    END IF;
END $$;

-- 2.5.1 Funnels
CREATE TABLE IF NOT EXISTS funnels (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    state JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Setup RLS for Funnels
ALTER TABLE public.funnels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own funnels" 
ON public.funnels FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own funnels" 
ON public.funnels FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own funnels" 
ON public.funnels FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own funnels" 
ON public.funnels FOR DELETE 
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_funnels_updated_at
    BEFORE UPDATE ON public.funnels
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Fix FK for products AFTER checkouts exists
DO $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'products_member_area_checkout_fk') THEN
        ALTER TABLE products
        ADD CONSTRAINT products_member_area_checkout_fk
        FOREIGN KEY(member_area_checkout_id)
        REFERENCES checkouts(id)
        ON DELETE SET NULL;
    END IF;
END $$;

-- 2.6 Tracks (BEFORE contents because contents references member_areas)
CREATE TABLE IF NOT EXISTS tracks(
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    member_area_id UUID REFERENCES member_areas(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN('products', 'contents', 'modules', 'lessons')),
    position INTEGER NOT NULL DEFAULT 0,
    is_visible BOOLEAN DEFAULT true,
    card_style TEXT DEFAULT 'horizontal',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2.7 Contents (MUST BE BEFORE modules, lessons, product_contents, access_grants)
CREATE TABLE IF NOT EXISTS contents(
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    member_area_id UUID REFERENCES member_areas(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    type TEXT DEFAULT 'course',
    author_id UUID REFERENCES auth.users(id),
    position INTEGER NOT NULL DEFAULT 0,
    is_visible BOOLEAN DEFAULT true,
    is_published BOOLEAN DEFAULT true,
    is_free BOOLEAN DEFAULT false,
    card_style TEXT DEFAULT 'horizontal',
    modules_layout TEXT DEFAULT 'horizontal',
    image_vertical_url TEXT,
    image_horizontal_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2.8 Modules (AFTER contents)
CREATE TABLE IF NOT EXISTS modules(
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    content_id UUID REFERENCES contents(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    is_published BOOLEAN DEFAULT true,
    image_vertical_url TEXT,
    image_horizontal_url TEXT,
    is_free BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    ALTER TABLE modules ADD COLUMN IF NOT EXISTS image_vertical_url TEXT;
    ALTER TABLE modules ADD COLUMN IF NOT EXISTS image_horizontal_url TEXT;
    ALTER TABLE modules ADD COLUMN IF NOT EXISTS is_free BOOLEAN DEFAULT false;
    ALTER TABLE modules ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;
    ALTER TABLE modules ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true;
    -- Force default to true for existing tables
    ALTER TABLE modules ALTER COLUMN is_published SET DEFAULT true;
END $$;

-- 2.9 Lessons (AFTER modules)
CREATE TABLE IF NOT EXISTS lessons(
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    module_id UUID REFERENCES modules(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    content_type TEXT,
    video_url TEXT,
    content_text TEXT,
    file_url TEXT,
    order_index INTEGER DEFAULT 0,
    duration INTEGER,
    is_free BOOLEAN DEFAULT false,
    image_url TEXT,
    gallery JSONB,
    content_order JSONB DEFAULT '["video", "text", "file", "gallery"]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    ALTER TABLE lessons ADD COLUMN IF NOT EXISTS video_url TEXT;
    ALTER TABLE lessons ADD COLUMN IF NOT EXISTS duration INTEGER;
    ALTER TABLE lessons ADD COLUMN IF NOT EXISTS image_url TEXT;
    ALTER TABLE lessons ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;
    ALTER TABLE lessons ADD COLUMN IF NOT EXISTS content_type TEXT;
    ALTER TABLE lessons ADD COLUMN IF NOT EXISTS content_text TEXT;
    ALTER TABLE lessons ADD COLUMN IF NOT EXISTS file_url TEXT;
    ALTER TABLE lessons ADD COLUMN IF NOT EXISTS is_free BOOLEAN DEFAULT false;
    ALTER TABLE lessons ADD COLUMN IF NOT EXISTS gallery JSONB;
    ALTER TABLE lessons ADD COLUMN IF NOT EXISTS content_order JSONB DEFAULT '["video", "text", "file", "gallery"]'::jsonb;
    ALTER TABLE lessons ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true;
    -- Force default to true for existing tables
    ALTER TABLE lessons ALTER COLUMN is_published SET DEFAULT true;
END $$;

-- 2.10 Track Items (AFTER tracks)
CREATE TABLE IF NOT EXISTS track_items(
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    track_id UUID REFERENCES tracks(id) ON DELETE CASCADE NOT NULL,
    item_id UUID NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2.11 Product Contents (AFTER products AND contents)
CREATE TABLE IF NOT EXISTS product_contents(
    product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
    content_id UUID REFERENCES contents(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY(product_id, content_id)
);

-- 2.12 Orders
CREATE TABLE IF NOT EXISTS orders(
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    checkout_id UUID REFERENCES checkouts(id),
    customer_email TEXT NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    customer_document TEXT,
    total DECIMAL(10, 2) NOT NULL,
    status TEXT NOT NULL,
    payment_method TEXT,
    payment_id TEXT,
    metadata JSONB,
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_user_id UUID REFERENCES auth.users(id);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_cpf TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS offer_id UUID;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_id TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS utm_source TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS utm_medium TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS items JSONB;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS total DECIMAL(10, 2);
END $$;

-- 2.13 Payments
CREATE TABLE IF NOT EXISTS payments(
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID REFERENCES orders(id) NOT NULL,
    gateway_id UUID REFERENCES gateways(id) NOT NULL,
    status TEXT NOT NULL,
    transaction_id TEXT,
    raw_response JSONB,
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2.13.1 Customer Payment Profiles
CREATE TABLE IF NOT EXISTS public.customer_payment_profiles(
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    gateway_id UUID REFERENCES public.gateways(id) NOT NULL,
    gateway_name TEXT NOT NULL CHECK (gateway_name IN ('mercado_pago', 'stripe', 'pix')),
    customer_user_id UUID REFERENCES auth.users(id),
    customer_email TEXT NOT NULL,
    customer_name TEXT,
    payment_method_type TEXT NOT NULL CHECK (payment_method_type IN ('credit_card', 'pix', 'boleto', 'apple_pay', 'google_pay')),
    gateway_customer_id TEXT NOT NULL DEFAULT '',
    gateway_payment_method_id TEXT NOT NULL DEFAULT '',
    card_brand TEXT,
    card_last4 TEXT NOT NULL DEFAULT '',
    card_exp_month INTEGER,
    card_exp_year INTEGER,
    wallet_type TEXT CHECK (wallet_type IS NULL OR wallet_type IN ('apple_pay', 'google_pay')),
    issuer_id TEXT,
    reusable BOOLEAN NOT NULL DEFAULT false,
    requires_reauthentication BOOLEAN NOT NULL DEFAULT true,
    consent_scope TEXT NOT NULL DEFAULT 'post_purchase_upsell',
    consent_captured_at TIMESTAMP WITH TIME ZONE,
    first_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    last_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$
BEGIN
    ALTER TABLE public.customer_payment_profiles ADD COLUMN IF NOT EXISTS gateway_name TEXT;
    ALTER TABLE public.customer_payment_profiles ADD COLUMN IF NOT EXISTS customer_user_id UUID REFERENCES auth.users(id);
    ALTER TABLE public.customer_payment_profiles ADD COLUMN IF NOT EXISTS customer_email TEXT;
    ALTER TABLE public.customer_payment_profiles ADD COLUMN IF NOT EXISTS customer_name TEXT;
    ALTER TABLE public.customer_payment_profiles ADD COLUMN IF NOT EXISTS payment_method_type TEXT;
    ALTER TABLE public.customer_payment_profiles ADD COLUMN IF NOT EXISTS gateway_customer_id TEXT DEFAULT '';
    ALTER TABLE public.customer_payment_profiles ADD COLUMN IF NOT EXISTS gateway_payment_method_id TEXT DEFAULT '';
    ALTER TABLE public.customer_payment_profiles ADD COLUMN IF NOT EXISTS card_brand TEXT;
    ALTER TABLE public.customer_payment_profiles ADD COLUMN IF NOT EXISTS card_last4 TEXT DEFAULT '';
    ALTER TABLE public.customer_payment_profiles ADD COLUMN IF NOT EXISTS card_exp_month INTEGER;
    ALTER TABLE public.customer_payment_profiles ADD COLUMN IF NOT EXISTS card_exp_year INTEGER;
    ALTER TABLE public.customer_payment_profiles ADD COLUMN IF NOT EXISTS wallet_type TEXT;
    ALTER TABLE public.customer_payment_profiles ADD COLUMN IF NOT EXISTS issuer_id TEXT;
    ALTER TABLE public.customer_payment_profiles ADD COLUMN IF NOT EXISTS reusable BOOLEAN DEFAULT false;
    ALTER TABLE public.customer_payment_profiles ADD COLUMN IF NOT EXISTS requires_reauthentication BOOLEAN DEFAULT true;
    ALTER TABLE public.customer_payment_profiles ADD COLUMN IF NOT EXISTS consent_scope TEXT DEFAULT 'post_purchase_upsell';
    ALTER TABLE public.customer_payment_profiles ADD COLUMN IF NOT EXISTS consent_captured_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE public.customer_payment_profiles ADD COLUMN IF NOT EXISTS first_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;
    ALTER TABLE public.customer_payment_profiles ADD COLUMN IF NOT EXISTS last_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;
    ALTER TABLE public.customer_payment_profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
    ALTER TABLE public.customer_payment_profiles ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE public.customer_payment_profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
    ALTER TABLE public.customer_payment_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
END $$;

UPDATE public.customer_payment_profiles
SET gateway_customer_id = COALESCE(gateway_customer_id, ''),
    gateway_payment_method_id = COALESCE(gateway_payment_method_id, ''),
    card_last4 = COALESCE(card_last4, ''),
    customer_email = COALESCE(customer_email, ''),
    consent_scope = COALESCE(NULLIF(consent_scope, ''), 'post_purchase_upsell'),
    metadata = COALESCE(metadata, '{}'::jsonb),
    reusable = COALESCE(reusable, false),
    requires_reauthentication = COALESCE(requires_reauthentication, true),
    last_seen_at = COALESCE(last_seen_at, timezone('utc'::text, now())),
    created_at = COALESCE(created_at, timezone('utc'::text, now())),
    updated_at = COALESCE(updated_at, timezone('utc'::text, now()))
WHERE gateway_customer_id IS NULL
   OR gateway_payment_method_id IS NULL
   OR card_last4 IS NULL
   OR customer_email IS NULL
   OR consent_scope IS NULL
   OR metadata IS NULL
   OR reusable IS NULL
   OR requires_reauthentication IS NULL
   OR last_seen_at IS NULL
   OR created_at IS NULL
   OR updated_at IS NULL;

ALTER TABLE public.customer_payment_profiles ALTER COLUMN gateway_customer_id SET NOT NULL;
ALTER TABLE public.customer_payment_profiles ALTER COLUMN gateway_payment_method_id SET NOT NULL;
ALTER TABLE public.customer_payment_profiles ALTER COLUMN card_last4 SET NOT NULL;
ALTER TABLE public.customer_payment_profiles ALTER COLUMN customer_email SET NOT NULL;
ALTER TABLE public.customer_payment_profiles ALTER COLUMN payment_method_type SET NOT NULL;
ALTER TABLE public.customer_payment_profiles ALTER COLUMN gateway_name SET NOT NULL;
ALTER TABLE public.customer_payment_profiles ALTER COLUMN reusable SET NOT NULL;
ALTER TABLE public.customer_payment_profiles ALTER COLUMN requires_reauthentication SET NOT NULL;
ALTER TABLE public.customer_payment_profiles ALTER COLUMN consent_scope SET NOT NULL;
ALTER TABLE public.customer_payment_profiles ALTER COLUMN metadata SET NOT NULL;
ALTER TABLE public.customer_payment_profiles ALTER COLUMN last_seen_at SET NOT NULL;
ALTER TABLE public.customer_payment_profiles ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.customer_payment_profiles ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.customer_payment_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own customer payment profiles" ON public.customer_payment_profiles;
DROP POLICY IF EXISTS "Admins can view all customer payment profiles" ON public.customer_payment_profiles;
CREATE POLICY "Users can manage their own customer payment profiles" ON public.customer_payment_profiles FOR ALL USING(auth.uid() = user_id) WITH CHECK(auth.uid() = user_id);
CREATE POLICY "Admins can view all customer payment profiles" ON public.customer_payment_profiles FOR SELECT USING(public.is_admin());
CREATE UNIQUE INDEX IF NOT EXISTS customer_payment_profiles_unique_method
ON public.customer_payment_profiles(user_id, gateway_id, customer_email, gateway_customer_id, gateway_payment_method_id, payment_method_type, card_last4);
DROP TRIGGER IF EXISTS update_customer_payment_profiles_updated_at ON public.customer_payment_profiles;
CREATE TRIGGER update_customer_payment_profiles_updated_at
    BEFORE UPDATE ON public.customer_payment_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.consent_preferences ALTER COLUMN checkout_id SET NOT NULL;
ALTER TABLE public.consent_preferences ALTER COLUMN visitor_key SET NOT NULL;
ALTER TABLE public.consent_preferences ALTER COLUMN source_surface SET NOT NULL;
ALTER TABLE public.consent_preferences ALTER COLUMN consent_version SET NOT NULL;
ALTER TABLE public.consent_preferences ALTER COLUMN necessary SET NOT NULL;
ALTER TABLE public.consent_preferences ALTER COLUMN analytics SET NOT NULL;
ALTER TABLE public.consent_preferences ALTER COLUMN marketing SET NOT NULL;
ALTER TABLE public.consent_preferences ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.consent_preferences ALTER COLUMN updated_at SET NOT NULL;

DROP TRIGGER IF EXISTS update_consent_preferences_updated_at ON public.consent_preferences;
CREATE TRIGGER update_consent_preferences_updated_at
    BEFORE UPDATE ON public.consent_preferences
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS update_business_legal_document_versions_updated_at ON public.business_legal_document_versions;
CREATE TRIGGER update_business_legal_document_versions_updated_at
    BEFORE UPDATE ON public.business_legal_document_versions
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 2.14 Access Grants (AFTER contents AND products)
CREATE TABLE IF NOT EXISTS access_grants(
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    content_id UUID REFERENCES contents(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'active',
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_subscription BOOLEAN DEFAULT false,
    subscription_provider_id TEXT,
    subscription_status TEXT DEFAULT 'active',
    UNIQUE(user_id, content_id),
    UNIQUE(user_id, product_id)
);

DO $$
BEGIN
    ALTER TABLE access_grants ADD COLUMN IF NOT EXISTS is_subscription BOOLEAN DEFAULT false;
    ALTER TABLE access_grants ADD COLUMN IF NOT EXISTS subscription_provider_id TEXT;
    ALTER TABLE access_grants ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';
END $$;

-- 2.15 Licenses (Installer logic)
CREATE TABLE IF NOT EXISTS licenses(
    key UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_email TEXT NOT NULL,
    client_name TEXT,
    status TEXT DEFAULT 'active',
    allowed_domain TEXT,
    plan TEXT DEFAULT 'lifetime',
    max_instances INTEGER DEFAULT 1,
    owner_id UUID,
    account_id UUID REFERENCES public.accounts(id),
    activated_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    ALTER TABLE licenses ADD COLUMN IF NOT EXISTS owner_id UUID;
    ALTER TABLE licenses ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id);
    ALTER TABLE licenses ADD COLUMN IF NOT EXISTS max_instances INTEGER DEFAULT 1;
    ALTER TABLE licenses ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE licenses ADD COLUMN IF NOT EXISTS allowed_domain TEXT;
    ALTER TABLE licenses ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'lifetime';
END $$;

CREATE TABLE IF NOT EXISTS validation_logs(
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    license_key UUID REFERENCES licenses(key),
    ip_address TEXT,
    domain TEXT,
    user_agent TEXT,
    valid BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2.16 Installations (Agency/Multi-Tenant License Logic)
CREATE TABLE IF NOT EXISTS installations(
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    license_key UUID REFERENCES licenses(key),
    account_id UUID REFERENCES public.accounts(id),
    installation_id TEXT NOT NULL,
    name TEXT DEFAULT 'Minha Loja',
    domain TEXT,
    status TEXT DEFAULT 'active',
    plan_override TEXT DEFAULT 'free',
    installed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_check_in TIMESTAMP WITH TIME ZONE,
    metadata JSONB,
    UNIQUE(license_key, installation_id)
);

DO $$
BEGIN
    ALTER TABLE installations ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id);
    ALTER TABLE installations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
    ALTER TABLE installations ADD COLUMN IF NOT EXISTS name TEXT DEFAULT 'Minha Loja';
    ALTER TABLE installations ADD COLUMN IF NOT EXISTS plan_override TEXT DEFAULT 'free';
    ALTER TABLE installations ADD COLUMN IF NOT EXISTS last_check_in TIMESTAMP WITH TIME ZONE;
    ALTER TABLE installations ADD COLUMN IF NOT EXISTS metadata JSONB;
END $$;

CREATE TABLE IF NOT EXISTS public.system_events(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    installation_id UUID REFERENCES public.installations(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==========================================
-- 3. MEMBER MANAGEMENT
-- ==========================================
CREATE TABLE IF NOT EXISTS public.profiles(
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL PRIMARY KEY,
    full_name TEXT,
    email TEXT,
    avatar_url TEXT,
    status TEXT DEFAULT 'active',
    role TEXT DEFAULT 'member',
    installation_id TEXT,
    central_user_id UUID,
    last_seen_at TIMESTAMP WITH TIME ZONE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    is_blocked BOOLEAN DEFAULT false,
    blocked_at TIMESTAMP WITH TIME ZONE,
    signup_source TEXT,
    totp_secret_encrypted TEXT,
    totp_enabled BOOLEAN DEFAULT FALSE,
    totp_verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS central_user_id UUID;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS installation_id TEXT;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_source TEXT;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS totp_secret_encrypted TEXT;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS totp_verified_at TIMESTAMP WITH TIME ZONE;
    UPDATE public.profiles SET is_blocked = false WHERE is_blocked IS NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.platform_legal_acceptances(
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    ALTER TABLE public.platform_legal_acceptances ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    ALTER TABLE public.platform_legal_acceptances ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE public.platform_legal_acceptances ADD COLUMN IF NOT EXISTS surface TEXT;
    ALTER TABLE public.platform_legal_acceptances ADD COLUMN IF NOT EXISTS terms_version TEXT;
    ALTER TABLE public.platform_legal_acceptances ADD COLUMN IF NOT EXISTS privacy_version TEXT;
    ALTER TABLE public.platform_legal_acceptances ADD COLUMN IF NOT EXISTS terms_url TEXT;
    ALTER TABLE public.platform_legal_acceptances ADD COLUMN IF NOT EXISTS privacy_url TEXT;
    ALTER TABLE public.platform_legal_acceptances ADD COLUMN IF NOT EXISTS channel_email TEXT;
    ALTER TABLE public.platform_legal_acceptances ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE public.platform_legal_acceptances ADD COLUMN IF NOT EXISTS ip_address TEXT;
    ALTER TABLE public.platform_legal_acceptances ADD COLUMN IF NOT EXISTS user_agent TEXT;
    ALTER TABLE public.platform_legal_acceptances ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE public.platform_legal_acceptances ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
    ALTER TABLE public.platform_legal_acceptances ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
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
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_legal_acceptances_surface_check') THEN
        ALTER TABLE public.platform_legal_acceptances
        ADD CONSTRAINT platform_legal_acceptances_surface_check
        CHECK (surface IN ('register', 'activation_portal', 'generate_license_gate'));
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_legal_acceptances_email_surface_version
ON public.platform_legal_acceptances(email, surface, terms_version, privacy_version);

CREATE INDEX IF NOT EXISTS idx_platform_legal_acceptances_user_accepted
ON public.platform_legal_acceptances(user_id, accepted_at DESC);

DROP TRIGGER IF EXISTS update_platform_legal_acceptances_updated_at ON public.platform_legal_acceptances;
CREATE TRIGGER update_platform_legal_acceptances_updated_at
    BEFORE UPDATE ON public.platform_legal_acceptances
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.two_factor_challenges(
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

CREATE TABLE IF NOT EXISTS public.member_notes(
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    author_id UUID REFERENCES auth.users(id) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.member_tags(
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    tag TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, tag)
);

CREATE TABLE IF NOT EXISTS public.activity_logs(
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    event TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.integrations(
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    active BOOLEAN DEFAULT true,
    config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, name)
);

-- 3.1 Email Templates
CREATE TABLE IF NOT EXISTS public.email_templates(
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type TEXT NOT NULL,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    html_body TEXT NOT NULL,
    active BOOLEAN DEFAULT true,
    language TEXT DEFAULT 'pt',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(event_type, language)
);

DO $$
BEGIN
    ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'pt';
    ALTER TABLE public.email_templates DROP CONSTRAINT IF EXISTS email_templates_event_type_key;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS email_templates_event_type_language_key
ON public.email_templates(event_type, language);

-- Seed Data (Default Post-Purchase Templates)
INSERT INTO public.email_templates (event_type, language, name, subject, html_body)
VALUES
('ORDER_COMPLETED', 'pt', 'Pedido Aprovado', 'Seu pedido {{order_id}} foi aprovado', $html$
  <div style="background:#f3f4f6;padding:28px 12px;font-family:Arial,sans-serif;color:#111827;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
      <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;">Compra aprovada</h1>
      <p style="margin:0 0 12px;color:#374151;">Ola, {{customer_name}}.</p>
      <p style="margin:0 0 12px;color:#374151;">Seu pagamento foi confirmado e o pedido <strong>{{order_id}}</strong> esta aprovado.</p>
      <p style="margin:0 0 20px;color:#374151;">Itens da compra: <strong>{{product_names}}</strong>.</p>
      <p style="margin:0;color:#6b7280;font-size:13px;">Atenciosamente,<br/>Equipe {{business_name}}</p>
    </div>
  </div>
$html$),
('ORDER_DIRECT_DELIVERY', 'pt', 'Entrega Direta', 'Seus materiais estao disponiveis', $html$
  <div style="background:#f3f4f6;padding:28px 12px;font-family:Arial,sans-serif;color:#111827;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
      <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;">Seus materiais estao disponiveis</h1>
      <p style="margin:0 0 12px;color:#374151;">Ola, {{customer_name}}.</p>
      <p style="margin:0 0 20px;color:#374151;">A compra do pedido <strong>{{order_id}}</strong> foi aprovada. Acesse seus materiais abaixo.</p>
      {{deliverables_html}}
      <p style="margin:28px 0 0;color:#6b7280;font-size:13px;">Atenciosamente,<br/>Equipe {{business_name}}</p>
    </div>
  </div>
$html$),
('ORDER_MEMBER_ACCESS', 'pt', 'Acesso a Area de Membros', 'Seu acesso foi liberado', $html$
  <div style="background:#f3f4f6;padding:28px 12px;font-family:Arial,sans-serif;color:#111827;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
      <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;">Seu acesso foi liberado</h1>
      <p style="margin:0 0 12px;color:#374151;">Ola, {{customer_name}}.</p>
      <p style="margin:0 0 20px;color:#374151;">A compra do pedido <strong>{{order_id}}</strong> foi aprovada. Entre na area liberada abaixo.</p>
      {{deliverables_html}}
      <p style="margin:28px 0 0;color:#6b7280;font-size:13px;">Atenciosamente,<br/>Equipe {{business_name}}</p>
    </div>
  </div>
$html$)
ON CONFLICT (event_type, language) DO NOTHING;

-- ==========================================
-- 4. VIEWS & FUNCTIONS
-- ==========================================

-- 4.1 Replace bootstrap admin helper now that public.profiles already exists.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4.2 Handle New User
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  is_first_user BOOLEAN;
  v_full_name TEXT;
  v_role TEXT;
  v_central_id UUID;
  v_account_id UUID;
BEGIN
  SELECT NOT EXISTS(SELECT 1 FROM public.profiles) INTO is_first_user;
  
  -- Flexible name retrieval
  v_full_name := NULLIF(BTRIM(COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    NEW.raw_user_meta_data ->> 'customer_name',
    NEW.raw_user_meta_data ->> 'display_name'
  )), '');

  v_central_id := (NEW.raw_user_meta_data ->> 'central_user_id')::UUID;
  v_role := CASE
    WHEN is_first_user THEN 'admin'
    ELSE COALESCE(NEW.raw_user_meta_data ->> 'role', 'member')
  END;

  INSERT INTO public.profiles(id, email, full_name, role, installation_id, central_user_id)
  VALUES(
    NEW.id,
    NEW.email,
    v_full_name,
    v_role,
    NEW.raw_user_meta_data ->> 'installation_id',
    v_central_id
  )
  ON CONFLICT(id) DO UPDATE SET
    full_name = COALESCE(NULLIF(BTRIM(public.profiles.full_name), ''), EXCLUDED.full_name),
    installation_id = COALESCE(EXCLUDED.installation_id, public.profiles.installation_id),
    central_user_id = COALESCE(EXCLUDED.central_user_id, public.profiles.central_user_id);

  IF v_role IN ('admin', 'owner') THEN
    INSERT INTO public.accounts(owner_user_id, plan_type, status, trust_score)
    VALUES(NEW.id, 'free', 'active', 50)
    ON CONFLICT(owner_user_id) DO UPDATE SET updated_at = timezone('utc'::text, now())
    RETURNING id INTO v_account_id;

    IF v_account_id IS NULL THEN
      SELECT id INTO v_account_id FROM public.accounts WHERE owner_user_id = NEW.id LIMIT 1;
    END IF;

    IF v_account_id IS NOT NULL THEN
      INSERT INTO public.business_settings(account_id, support_email, sender_email, sender_name)
      VALUES(v_account_id, NEW.email, NEW.email, COALESCE(v_full_name, NEW.email))
      ON CONFLICT(account_id) DO NOTHING;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4.3 Check if Setup is Required
CREATE OR REPLACE FUNCTION public.is_setup_required()
RETURNS BOOLEAN AS $$
DECLARE
  admin_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO admin_count FROM public.profiles WHERE role = 'admin';
  RETURN admin_count = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.is_setup_required() TO anon;
GRANT EXECUTE ON FUNCTION public.is_setup_required() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_setup_required() TO service_role;

-- 4.3.1 Approved Runtime Migration Executor
CREATE OR REPLACE FUNCTION public.apply_approved_migration(sql_query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  EXECUTE sql_query;
  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'code', SQLSTATE
    );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_approved_migration(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_approved_migration(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_approved_migration(TEXT) TO service_role;

DO $$
BEGIN
  IF to_regprocedure('public.exec_sql(text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.exec_sql(TEXT) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.exec_sql(TEXT) FROM anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.exec_sql(TEXT) TO service_role;
  END IF;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4.4 Handle Order Access
CREATE OR REPLACE FUNCTION handle_new_order_access()
RETURNS TRIGGER AS $$
DECLARE
  v_product_id UUID;
  v_user_id UUID;
  v_content_record RECORD;
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
    SELECT product_id INTO v_product_id FROM checkouts WHERE id = NEW.checkout_id;
    SELECT id INTO v_user_id FROM auth.users WHERE email = NEW.customer_email;

    IF v_product_id IS NOT NULL AND v_user_id IS NOT NULL THEN
      FOR v_content_record IN 
        SELECT content_id FROM product_contents WHERE product_id = v_product_id
      LOOP
        INSERT INTO access_grants(user_id, content_id, product_id, granted_at, status)
        VALUES(v_user_id, v_content_record.content_id, NULL, NOW(), 'active')
        ON CONFLICT(user_id, content_id) 
        DO UPDATE SET status = 'active', granted_at = NOW();
      END LOOP;
      
      INSERT INTO access_grants(user_id, product_id, granted_at, status)
      VALUES(v_user_id, v_product_id, NOW(), 'active')
      ON CONFLICT(user_id, product_id)
      DO UPDATE SET status = 'active', granted_at = NOW();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_order_paid_grant_access ON orders;
CREATE TRIGGER on_order_paid_grant_access
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_order_access();

-- 4.5 Get Member Area Members
CREATE OR REPLACE FUNCTION get_member_area_members(area_id uuid)
RETURNS TABLE(
    user_id uuid,
    email text,
    name text,
    joined_at timestamptz,
    status text
)
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    u.id as user_id,
    u.email::text,
    COALESCE((u.raw_user_meta_data ->> 'name')::text, 'Sem nome') as name,
    MIN(ag.granted_at) as joined_at,
    ag.status::text
  FROM access_grants ag
  JOIN auth.users u ON ag.user_id = u.id
  JOIN contents c ON ag.content_id = c.id
  WHERE c.member_area_id = area_id
  GROUP BY u.id, u.email, u.raw_user_meta_data, ag.status;
END;
$$ LANGUAGE plpgsql;

-- 4.5.1 Get Enriched Member Area Members (Isolated)
-- 4.5.1 Get Enriched Member Area Members (Isolated)
-- 4.5.1 Get Enriched Member Area Members (Isolated)
CREATE OR REPLACE FUNCTION get_area_members_enriched(
    p_area_id UUID,
    p_page INTEGER DEFAULT 1,
    p_limit INTEGER DEFAULT 20,
    p_search TEXT DEFAULT '',
    p_status_filter TEXT DEFAULT '',
    p_type_filter TEXT DEFAULT 'all'
)
RETURNS TABLE (
    user_id UUID,
    email TEXT,
    name TEXT,
    status TEXT,
    joined_at TIMESTAMPTZ,
    orders_count BIGINT,
    active_products_count BIGINT,
    total_count BIGINT
)
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_offset INTEGER := (p_page - 1) * p_limit;
BEGIN
    RETURN QUERY
    WITH target_users AS (
        SELECT DISTINCT ag.user_id
        FROM public.access_grants ag
        LEFT JOIN public.contents c_direct ON ag.content_id = c_direct.id
        LEFT JOIN public.product_contents pc ON ag.product_id = pc.product_id
        LEFT JOIN public.contents c_via_prod ON pc.content_id = c_via_prod.id
        WHERE 
            ag.status = 'active'
            AND (
                (c_direct.member_area_id = p_area_id)
                OR
                (c_via_prod.member_area_id = p_area_id)
            )
    ),
    filtered_base AS (
        SELECT
            p.id as pid,
            p.email as p_email,
             -- TRY PROFILES FIRST, THEN AUTH METADATA (name OR full_name), THEN DEFAULT
            COALESCE(
                p.full_name, 
                (u.raw_user_meta_data ->> 'name'),
                (u.raw_user_meta_data ->> 'full_name'),
                'Sem nome'
            ) as p_name,
            p.status as p_status,
            COALESCE(p.created_at, NOW()) as p_joined_at,
            (SELECT COUNT(*) FROM public.orders o WHERE o.customer_user_id = p.id) as o_count,
            -- Calculate active grants count for this area (for display/filtering)
            (
                SELECT COUNT(DISTINCT ag_count.id)
                FROM public.access_grants ag_count
                LEFT JOIN public.contents c_d ON ag_count.content_id = c_d.id
                LEFT JOIN public.product_contents pc_c ON ag_count.product_id = pc_c.product_id
                LEFT JOIN public.contents c_vp ON pc_c.content_id = c_vp.id
                WHERE ag_count.user_id = p.id
                  AND ag_count.status = 'active'
                  AND (c_d.member_area_id = p_area_id OR c_vp.member_area_id = p_area_id)
            ) as ap_count
        FROM public.profiles p
        JOIN auth.users u ON u.id = p.id  -- JOIN AUTH.USERS TO ACCESS METADATA
        JOIN target_users tu ON tu.user_id = p.id
        WHERE
            (p_search = '' OR p.email ILIKE '%' || p_search || '%' OR COALESCE(p.full_name, u.raw_user_meta_data->>'name', 'Sem nome') ILIKE '%' || p_search || '%')
            AND (p_status_filter = '' OR p.status = p_status_filter)
    ),
    final_filtered AS (
        SELECT * FROM filtered_base
        WHERE
            (p_type_filter = 'all') OR
            (p_type_filter = 'paid' AND o_count > 0) OR
            (p_type_filter = 'free' AND o_count = 0)
    ),
    total_c AS (
        SELECT COUNT(*) as t_count FROM final_filtered
    )
    SELECT
        pid,
        p_email,
        p_name,
        p_status,
        p_joined_at,
        o_count,
        ap_count,
        (SELECT t_count FROM total_c)
    FROM final_filtered
    ORDER BY p_joined_at DESC
    LIMIT p_limit OFFSET v_offset;
END;
$$ LANGUAGE plpgsql;

-- 4.6 Admin Members View
CREATE OR REPLACE VIEW public.admin_members_view AS 
SELECT
  p.id as user_id,
  p.email,
  p.full_name,
  p.status,
  p.last_seen_at,
  p.created_at as joined_at,
  (SELECT COUNT(*) FROM access_grants ag WHERE ag.user_id = p.id AND ag.status = 'active') as active_products_count,
  (SELECT COUNT(*) FROM orders o WHERE o.customer_user_id = p.id) as orders_count
FROM public.profiles p;

-- 5. STORAGE & BUCKETS
-- ==========================================
INSERT INTO storage.buckets(id, name, public) VALUES('products', 'products', true) ON CONFLICT(id) DO NOTHING;
INSERT INTO storage.buckets(id, name, public) VALUES('checkouts', 'checkouts', true) ON CONFLICT(id) DO NOTHING;
INSERT INTO storage.buckets(id, name, public) VALUES('contents', 'contents', true) ON CONFLICT(id) DO NOTHING;
INSERT INTO storage.buckets(id, name, public) VALUES('avatars', 'avatars', true) ON CONFLICT(id) DO NOTHING;
INSERT INTO storage.buckets(id, name, public) VALUES('member-areas', 'member-areas', true) ON CONFLICT(id) DO NOTHING;
INSERT INTO storage.buckets(id, name, public) VALUES('product-deliverables', 'product-deliverables', false)
ON CONFLICT(id) DO UPDATE SET name = EXCLUDED.name, public = EXCLUDED.public;

-- ==========================================
-- 6. RLS POLICIES (Security)
-- ==========================================
ALTER TABLE domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateways ENABLE ROW LEVEL SECURITY;
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_legal_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_legal_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.two_factor_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies to avoid conflicts
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON "' || r.tablename || '";';
  END LOOP;
END $$;

-- Domains
CREATE POLICY "Users can manage their own domains" ON domains FOR ALL USING(auth.uid() = user_id);
CREATE POLICY "Public can view active domains" ON domains FOR SELECT USING(true);

-- Member Areas (Fase 15.2 — auditado: mantém SELECT público pois membros/anon precisam acessar por slug)
CREATE POLICY "Owners can view own member areas" ON member_areas FOR SELECT USING(auth.uid() = owner_id);
CREATE POLICY "Public can view member areas for access" ON member_areas FOR SELECT USING(true);
CREATE POLICY "Users can create member areas" ON member_areas FOR INSERT WITH CHECK(auth.uid() = owner_id);
CREATE POLICY "Users can update own member areas" ON member_areas FOR UPDATE USING(auth.uid() = owner_id);
CREATE POLICY "Users can delete own member areas" ON member_areas FOR DELETE USING(auth.uid() = owner_id);

-- Products
CREATE POLICY "Users can manage their own products" ON products FOR ALL USING(auth.uid() = user_id);
CREATE POLICY "Public can view products" ON products FOR SELECT USING(true);
-- Explicit INSERT policy to ensure creation works (Fix for System Locked/RLS error)
CREATE POLICY "Users can create products" ON products FOR INSERT WITH CHECK(auth.uid() = user_id);


-- Gateways
CREATE POLICY "Users can manage their own gateways" ON gateways FOR ALL USING(auth.uid() = user_id);
CREATE POLICY "Public can view active gateways" ON gateways FOR SELECT USING(active = true OR is_active = true);
CREATE POLICY "Users can create gateways" ON gateways FOR INSERT WITH CHECK(auth.uid() = user_id);

-- Checkouts
CREATE POLICY "Users can manage their own checkouts" ON checkouts FOR ALL USING(auth.uid() = user_id);
CREATE POLICY "Public can view active checkouts" ON checkouts FOR SELECT USING(active = true);
CREATE POLICY "Users can create checkouts" ON checkouts FOR INSERT WITH CHECK(auth.uid() = user_id);

-- Orders (Fase 15.2 — Blindagem: removido SELECT USING(true))
CREATE POLICY "Users can manage their own orders" ON orders FOR ALL USING(auth.uid() = user_id);
CREATE POLICY "Customers can view their own orders" ON orders FOR SELECT USING(auth.uid() = customer_user_id);
CREATE POLICY "Admins can view all orders" ON orders FOR SELECT USING(public.is_admin());
CREATE POLICY "Public can create orders" ON orders FOR INSERT WITH CHECK(true);
-- NOTA: Páginas públicas (PIX, ThankYou) usam /api/check-status (service_role) para polling.
-- O SELECT anônimo direto foi removido por segurança. Fallbacks no frontend devem migrar para API.

-- Payments (Fase 15.2 — Blindagem: removido SELECT USING(true))
CREATE POLICY "Users can manage their own payments" ON payments FOR ALL USING(auth.uid() = user_id);
CREATE POLICY "Admins can view all payments" ON payments FOR SELECT USING(public.is_admin());
CREATE POLICY "Public can create payments" ON payments FOR INSERT WITH CHECK(true);
-- NOTA: Webhooks usam service_role (bypass RLS). Frontend admin usa is_admin().

-- Webhooks
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

-- Email Templates
CREATE POLICY "Admins can read email templates" ON public.email_templates
FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can insert email templates" ON public.email_templates
FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update email templates" ON public.email_templates
FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete email templates" ON public.email_templates
FOR DELETE TO authenticated USING (public.is_admin());

-- Contents
CREATE POLICY "Users can manage their own contents" ON contents FOR ALL USING(
    EXISTS(SELECT 1 FROM member_areas ma WHERE ma.id = contents.member_area_id AND ma.owner_id = auth.uid())
);
CREATE POLICY "Public can view published contents" ON contents FOR SELECT USING(is_published = true);

-- Modules
CREATE POLICY "Users can manage their own modules" ON modules FOR ALL USING(
    EXISTS(SELECT 1 FROM contents c JOIN member_areas ma ON ma.id = c.member_area_id WHERE c.id = modules.content_id AND ma.owner_id = auth.uid())
);
CREATE POLICY "Public can view published modules" ON modules FOR SELECT USING(is_published = true);

-- Lessons
CREATE POLICY "Users can manage their own lessons" ON lessons FOR ALL USING(
    EXISTS(SELECT 1 FROM modules m JOIN contents c ON c.id = m.content_id JOIN member_areas ma ON ma.id = c.member_area_id WHERE m.id = lessons.module_id AND ma.owner_id = auth.uid())
);
CREATE POLICY "Public can view published lessons" ON lessons FOR SELECT USING(is_published = true);

-- Tracks
CREATE POLICY "Admins can manage tracks" ON tracks FOR ALL USING(
    EXISTS(SELECT 1 FROM member_areas ma WHERE ma.id = tracks.member_area_id AND ma.owner_id = auth.uid())
);
CREATE POLICY "Public can view visible tracks" ON tracks FOR SELECT USING(is_visible = true);

-- Track Items
CREATE POLICY "Admins can manage track items" ON track_items FOR ALL USING(
    EXISTS(SELECT 1 FROM tracks JOIN member_areas ma ON ma.id = tracks.member_area_id WHERE tracks.id = track_items.track_id AND ma.owner_id = auth.uid())
);
CREATE POLICY "Public can view track items" ON track_items FOR SELECT USING(
    EXISTS(SELECT 1 FROM tracks WHERE tracks.id = track_items.track_id AND tracks.is_visible = true)
);

-- Profiles
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING(auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING(auth.uid() = id);
CREATE POLICY "Admins can manage all profiles" ON public.profiles FOR ALL USING(public.is_admin());

-- 2FA login challenges are server-side only.
CREATE POLICY "Service role manages two factor challenges"
ON public.two_factor_challenges
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

REVOKE ALL ON public.two_factor_challenges FROM anon;
REVOKE ALL ON public.two_factor_challenges FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.two_factor_challenges TO service_role;

-- Accounts / Business Settings
CREATE POLICY "Users can view own account" ON public.accounts
FOR SELECT TO authenticated USING(auth.uid() = owner_user_id);

CREATE POLICY "Users can insert own account" ON public.accounts
FOR INSERT TO authenticated WITH CHECK(auth.uid() = owner_user_id);

CREATE POLICY "Users can update own account" ON public.accounts
FOR UPDATE TO authenticated USING(auth.uid() = owner_user_id) WITH CHECK(auth.uid() = owner_user_id);

CREATE POLICY "Users can manage their business settings" ON public.business_settings
FOR ALL TO authenticated
USING(account_id IN (SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()))
WITH CHECK(account_id IN (SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()));

CREATE POLICY "Public can read business settings" ON public.business_settings
FOR SELECT USING(true);

DROP POLICY IF EXISTS "Users can manage legal document versions for owned accounts" ON public.business_legal_document_versions;
CREATE POLICY "Users can manage legal document versions for owned accounts" ON public.business_legal_document_versions
FOR ALL TO authenticated
USING (
    public.is_admin()
    OR account_id IN (SELECT id FROM public.accounts WHERE owner_user_id = auth.uid())
)
WITH CHECK (
    public.is_admin()
    OR account_id IN (SELECT id FROM public.accounts WHERE owner_user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can view own platform legal acceptances" ON public.platform_legal_acceptances;
CREATE POLICY "Users can view own platform legal acceptances" ON public.platform_legal_acceptances
FOR SELECT TO authenticated
USING (
    public.is_admin()
    OR user_id = auth.uid()
);

DROP POLICY IF EXISTS "Admins can manage platform legal acceptances" ON public.platform_legal_acceptances;
CREATE POLICY "Admins can manage platform legal acceptances" ON public.platform_legal_acceptances
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Users can view consent preferences for owned checkouts" ON public.consent_preferences
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.checkouts c
        WHERE c.id = consent_preferences.checkout_id
          AND c.user_id = auth.uid()
    )
);

CREATE POLICY "Admins can view all consent preferences" ON public.consent_preferences
FOR SELECT TO authenticated
USING (public.is_admin());

-- Config Tables
CREATE POLICY "Admins can read system info" ON public.system_info
FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can insert system info" ON public.system_info
FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update system info" ON public.system_info
FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.system_email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read system email templates" ON public.system_email_templates
FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can insert system email templates" ON public.system_email_templates
FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update system email templates" ON public.system_email_templates
FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete system email templates" ON public.system_email_templates
FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can manage member notes" ON public.member_notes FOR ALL USING(EXISTS(SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can manage member tags" ON public.member_tags FOR ALL USING(EXISTS(SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Logs
CREATE POLICY "Users can create their own logs" ON public.activity_logs FOR INSERT WITH CHECK(auth.uid() = user_id);
CREATE POLICY "Users can view their own logs" ON public.activity_logs FOR SELECT USING(auth.uid() = user_id);
CREATE POLICY "Admins can view all logs" ON public.activity_logs FOR SELECT USING(EXISTS(SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can insert system events" ON public.system_events
FOR INSERT TO authenticated
WITH CHECK(account_id IN (SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can view system events" ON public.system_events
FOR SELECT TO authenticated
USING(account_id IN (SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()));

CREATE POLICY "Users can manage their own integrations" ON public.integrations FOR ALL USING(auth.uid() = user_id);

-- Licenses
CREATE POLICY "Users can view own license" ON public.licenses FOR SELECT TO authenticated USING(auth.uid() = owner_id OR public.is_admin());
CREATE POLICY "Admins can insert licenses" ON public.licenses FOR INSERT TO authenticated WITH CHECK(public.is_admin());
CREATE POLICY "Admins can update licenses" ON public.licenses FOR UPDATE TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
CREATE POLICY "Admins can delete licenses" ON public.licenses FOR DELETE TO authenticated USING(public.is_admin());
CREATE POLICY "Service Role full access licenses" ON public.licenses TO service_role USING(true) WITH CHECK(true);

CREATE POLICY "Admins can view validation logs" ON public.validation_logs FOR SELECT TO authenticated USING(public.is_admin());
CREATE POLICY "Service Role full access validation logs" ON public.validation_logs TO service_role USING(true) WITH CHECK(true);

-- Product Contents
CREATE POLICY "Users can manage product contents" ON product_contents FOR ALL USING(
    EXISTS(SELECT 1 FROM products p WHERE p.id = product_contents.product_id AND p.user_id = auth.uid())
);
CREATE POLICY "Public can view product contents" ON product_contents FOR SELECT USING(true);

-- Access Grants
CREATE POLICY "Users can view their own access grants" ON access_grants FOR SELECT USING(auth.uid() = user_id);
CREATE POLICY "Admins can manage access grants" ON access_grants FOR ALL USING(
    EXISTS(SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ==========================================
-- 7. STORAGE POLICIES
-- ==========================================

-- Drop existing storage policies
DROP POLICY IF EXISTS "Public Access Member Areas" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Upload Member Areas" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Update Member Areas" ON storage.objects;
DROP POLICY IF EXISTS "Public Access Contents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Upload Contents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Update Contents" ON storage.objects;
DROP POLICY IF EXISTS "Public Access Checkouts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Upload Checkouts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Update Checkouts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Delete Checkouts" ON storage.objects;
DROP POLICY IF EXISTS "Public Access Products" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Read Products" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Upload Products" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Update Products" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Delete Products" ON storage.objects;
DROP POLICY IF EXISTS "Admin Read Product Deliverables" ON storage.objects;
DROP POLICY IF EXISTS "Admin Upload Product Deliverables" ON storage.objects;
DROP POLICY IF EXISTS "Admin Update Product Deliverables" ON storage.objects;
DROP POLICY IF EXISTS "Admin Delete Product Deliverables" ON storage.objects;
DROP POLICY IF EXISTS "Public Access Avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Read Avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Upload Avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Read Member Areas" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Read Contents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Read Checkouts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Read Modules" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Read Activation Assets" ON storage.objects;
DROP POLICY IF EXISTS "Public Access Modules" ON storage.objects;
DROP POLICY IF EXISTS "Public Access Activation Assets" ON storage.objects;

-- Re-create Storage Policies
CREATE POLICY "Authenticated Read Member Areas" ON storage.objects FOR SELECT TO authenticated USING(bucket_id = 'member-areas');
CREATE POLICY "Authenticated Upload Member Areas" ON storage.objects FOR INSERT WITH CHECK(bucket_id = 'member-areas' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated Update Member Areas" ON storage.objects FOR UPDATE USING(bucket_id = 'member-areas' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated Read Contents" ON storage.objects FOR SELECT TO authenticated USING(bucket_id = 'contents');
CREATE POLICY "Authenticated Upload Contents" ON storage.objects FOR INSERT WITH CHECK(bucket_id = 'contents' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated Update Contents" ON storage.objects FOR UPDATE USING(bucket_id = 'contents' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated Read Checkouts" ON storage.objects FOR SELECT TO authenticated USING(bucket_id = 'checkouts');
CREATE POLICY "Authenticated Upload Checkouts" ON storage.objects FOR INSERT WITH CHECK(bucket_id = 'checkouts' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated Update Checkouts" ON storage.objects FOR UPDATE USING(bucket_id = 'checkouts' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated Delete Checkouts" ON storage.objects FOR DELETE USING(bucket_id = 'checkouts' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated Read Products" ON storage.objects FOR SELECT TO authenticated USING(bucket_id = 'products');
CREATE POLICY "Authenticated Upload Products" ON storage.objects FOR INSERT WITH CHECK(bucket_id = 'products' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated Update Products" ON storage.objects FOR UPDATE USING(bucket_id = 'products' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated Delete Products" ON storage.objects FOR DELETE USING(bucket_id = 'products' AND auth.role() = 'authenticated');

CREATE POLICY "Admin Read Product Deliverables" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'product-deliverables'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'owner', 'master_admin')
  )
);
CREATE POLICY "Admin Upload Product Deliverables" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-deliverables'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'owner', 'master_admin')
  )
);
CREATE POLICY "Admin Update Product Deliverables" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-deliverables'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'owner', 'master_admin')
  )
);
CREATE POLICY "Admin Delete Product Deliverables" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'product-deliverables'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'owner', 'master_admin')
  )
);

CREATE POLICY "Authenticated Read Avatars" ON storage.objects FOR SELECT TO authenticated USING(bucket_id = 'avatars');
CREATE POLICY "Authenticated Upload Avatars" ON storage.objects FOR INSERT WITH CHECK(bucket_id = 'avatars' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated Read Modules" ON storage.objects FOR SELECT TO authenticated USING(bucket_id = 'modules');
CREATE POLICY "Authenticated Read Activation Assets" ON storage.objects FOR SELECT TO authenticated USING(bucket_id = 'activation-assets');

-- ==========================================
-- 8. LICENSE SECURITY SHIELD (Critical)
-- ==========================================
CREATE OR REPLACE FUNCTION public.enforce_active_license()
RETURNS TRIGGER AS $$
DECLARE
    v_license_status TEXT;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- Fetch the most recent license
    SELECT status, expires_at INTO v_license_status, v_expires_at
    FROM public.licenses
    ORDER BY created_at DESC
    LIMIT 1;

    -- Strict Checking
    IF v_license_status IS NULL THEN
        RAISE EXCEPTION 'System Locked: No license found.';
    END IF;

    IF v_license_status != 'active' THEN
        RAISE EXCEPTION 'System Locked: License is not active (%s).', v_license_status;
    END IF;
    
    IF v_expires_at IS NOT NULL AND NOW() > v_expires_at THEN
         RAISE EXCEPTION 'System Locked: License expired on %.', v_expires_at;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply Triggers to Critical Business Tables
DROP TRIGGER IF EXISTS check_license_checkouts ON public.checkouts;
CREATE TRIGGER check_license_checkouts 
    BEFORE INSERT OR UPDATE ON public.checkouts 
    FOR EACH ROW EXECUTE FUNCTION public.enforce_active_license();

DROP TRIGGER IF EXISTS check_license_products ON public.products;
CREATE TRIGGER check_license_products 
    BEFORE INSERT OR UPDATE ON public.products 
    FOR EACH ROW EXECUTE FUNCTION public.enforce_active_license();

DROP TRIGGER IF EXISTS check_license_orders ON public.orders;
CREATE TRIGGER check_license_orders 
    BEFORE INSERT OR UPDATE ON public.orders 
    FOR EACH ROW EXECUTE FUNCTION public.enforce_active_license();

DROP TRIGGER IF EXISTS check_license_gateways ON public.gateways;
CREATE TRIGGER check_license_gateways 
    BEFORE INSERT OR UPDATE ON public.gateways 
    FOR EACH ROW EXECUTE FUNCTION public.enforce_active_license();

-- ==========================================
-- 8.5 SETUP UTILITIES
-- ==========================================
CREATE OR REPLACE FUNCTION public.is_setup_required(target_installation_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If there are no profiles (admins), setup is required
  IF NOT EXISTS (SELECT 1 FROM public.profiles LIMIT 1) THEN
    RETURN TRUE;
  END IF;
  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_setup_required(TEXT) TO anon, authenticated, service_role;

-- ==========================================
-- 9. CACHE RELOAD (Critical for API to see new columns immediately)
-- ==========================================
UPDATE public.schema_migrations
SET success = true,
    description = 'Canonical schema includes testing_evolution',
    error_log = NULL,
    executed_at = timezone('utc'::text, now())
WHERE version = '1.0.1';

INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
SELECT '1.0.1', 'Canonical schema includes testing_evolution', true, 0
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '1.0.1');

UPDATE public.schema_migrations
SET success = true,
    description = 'Canonical schema includes localized email templates',
    error_log = NULL,
    executed_at = timezone('utc'::text, now())
WHERE version = '1.0.2';

INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
SELECT '1.0.2', 'Canonical schema includes localized email templates', true, 0
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '1.0.2');

UPDATE public.schema_migrations
SET success = true,
    description = 'Canonical schema includes server-side 2FA challenges',
    error_log = NULL,
    executed_at = timezone('utc'::text, now())
WHERE version = '1.0.7';

INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
SELECT '1.0.7', 'Canonical schema includes server-side 2FA challenges', true, 0
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '1.0.7');

UPDATE public.schema_migrations
SET success = true,
    description = 'Canonical schema includes login telemetry and member area branding columns',
    error_log = NULL,
    executed_at = timezone('utc'::text, now())
WHERE version = '1.0.8';

INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
SELECT '1.0.8', 'Canonical schema includes login telemetry and member area branding columns', true, 0
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '1.0.8');

UPDATE public.schema_migrations
SET success = true,
    description = 'Canonical schema includes profile permission flags',
    error_log = NULL,
    executed_at = timezone('utc'::text, now())
WHERE version = '1.0.9';

INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
SELECT '1.0.9', 'Canonical schema includes profile permission flags', true, 0
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '1.0.9');

UPDATE public.schema_migrations
SET success = true,
    description = 'Canonical schema includes post-purchase business email templates',
    error_log = NULL,
    executed_at = timezone('utc'::text, now())
WHERE version = '1.0.10';

INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
SELECT '1.0.10', 'Canonical schema includes post-purchase business email templates', true, 0
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '1.0.10');

UPDATE public.schema_migrations
SET success = true,
    description = 'Canonical schema includes approved migration executor hardening',
    error_log = NULL,
    executed_at = timezone('utc'::text, now())
WHERE version = '1.0.11';

INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
SELECT '1.0.11', 'Canonical schema includes approved migration executor hardening', true, 0
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '1.0.11');

UPDATE public.schema_migrations
SET success = true,
    description = 'Canonical schema keeps update history service-role only',
    error_log = NULL,
    executed_at = timezone('utc'::text, now())
WHERE version = '1.0.12';

INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
SELECT '1.0.12', 'Canonical schema keeps update history service-role only', true, 0
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '1.0.12');

UPDATE public.schema_migrations
SET success = true,
    description = 'Canonical schema includes private product deliverables',
    error_log = NULL,
    executed_at = timezone('utc'::text, now())
WHERE version = '1.0.13';

INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
SELECT '1.0.13', 'Canonical schema includes private product deliverables', true, 0
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '1.0.13');

UPDATE public.schema_migrations
SET success = true,
    description = 'Canonical schema allows private file delivery action',
    error_log = NULL,
    executed_at = timezone('utc'::text, now())
WHERE version = '1.0.14';

INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
SELECT '1.0.14', 'Canonical schema allows private file delivery action', true, 0
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '1.0.14');

UPDATE public.schema_migrations
SET success = true,
    description = 'Canonical schema includes customer payment profile foundation',
    error_log = NULL,
    executed_at = timezone('utc'::text, now())
WHERE version = '1.0.15';

INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
SELECT '1.0.15', 'Canonical schema includes customer payment profile foundation', true, 0
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '1.0.15');

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
    ALTER TABLE public.privacy_requests ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE;
    ALTER TABLE public.privacy_requests ADD COLUMN IF NOT EXISTS request_type TEXT;
    ALTER TABLE public.privacy_requests ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open';
    ALTER TABLE public.privacy_requests ADD COLUMN IF NOT EXISTS subject_email TEXT;
    ALTER TABLE public.privacy_requests ADD COLUMN IF NOT EXISTS subject_name TEXT;
    ALTER TABLE public.privacy_requests ADD COLUMN IF NOT EXISTS subject_phone TEXT;
    ALTER TABLE public.privacy_requests ADD COLUMN IF NOT EXISTS subject_document TEXT;
    ALTER TABLE public.privacy_requests ADD COLUMN IF NOT EXISTS request_channel TEXT DEFAULT 'admin_panel';
    ALTER TABLE public.privacy_requests ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE public.privacy_requests ADD COLUMN IF NOT EXISTS resolution_notes TEXT;
    ALTER TABLE public.privacy_requests ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE public.privacy_requests ADD COLUMN IF NOT EXISTS requested_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    ALTER TABLE public.privacy_requests ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE public.privacy_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
    ALTER TABLE public.privacy_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
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
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'privacy_requests_request_type_check') THEN
        ALTER TABLE public.privacy_requests
        ADD CONSTRAINT privacy_requests_request_type_check
        CHECK (request_type IN ('access', 'correction', 'deletion', 'anonymization', 'objection', 'portability', 'revocation'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'privacy_requests_status_check') THEN
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
    ALTER TABLE public.data_retention_policies ADD COLUMN IF NOT EXISTS table_name TEXT;
    ALTER TABLE public.data_retention_policies ADD COLUMN IF NOT EXISTS retention_days INTEGER;
    ALTER TABLE public.data_retention_policies ADD COLUMN IF NOT EXISTS run_mode TEXT DEFAULT 'delete';
    ALTER TABLE public.data_retention_policies ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
    ALTER TABLE public.data_retention_policies ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE public.data_retention_policies ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
    ALTER TABLE public.data_retention_policies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
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
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'data_retention_policies_retention_days_check') THEN
        ALTER TABLE public.data_retention_policies
        ADD CONSTRAINT data_retention_policies_retention_days_check
        CHECK (retention_days > 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'data_retention_policies_run_mode_check') THEN
        ALTER TABLE public.data_retention_policies
        ADD CONSTRAINT data_retention_policies_run_mode_check
        CHECK (run_mode IN ('delete', 'anonymize'));
    END IF;
END $$;

INSERT INTO public.data_retention_policies(table_name, retention_days, run_mode, active, notes)
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
    ALTER TABLE public.data_retention_runs ADD COLUMN IF NOT EXISTS policy_id UUID REFERENCES public.data_retention_policies(id) ON DELETE SET NULL;
    ALTER TABLE public.data_retention_runs ADD COLUMN IF NOT EXISTS table_name TEXT;
    ALTER TABLE public.data_retention_runs ADD COLUMN IF NOT EXISTS rows_affected INTEGER DEFAULT 0;
    ALTER TABLE public.data_retention_runs ADD COLUMN IF NOT EXISTS cutoff_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE public.data_retention_runs ADD COLUMN IF NOT EXISTS run_mode TEXT DEFAULT 'delete';
    ALTER TABLE public.data_retention_runs ADD COLUMN IF NOT EXISTS triggered_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    ALTER TABLE public.data_retention_runs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE public.data_retention_runs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
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
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'data_retention_runs_rows_affected_check') THEN
        ALTER TABLE public.data_retention_runs
        ADD CONSTRAINT data_retention_runs_rows_affected_check
        CHECK (rows_affected >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'data_retention_runs_run_mode_check') THEN
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
CREATE POLICY "Users can view privacy requests for owned accounts" ON public.privacy_requests
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
CREATE POLICY "Users can insert privacy requests for owned accounts" ON public.privacy_requests
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
CREATE POLICY "Users can update privacy requests for owned accounts" ON public.privacy_requests
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
CREATE POLICY "Admins can manage data retention policies" ON public.data_retention_policies
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can view data retention runs" ON public.data_retention_runs;
CREATE POLICY "Admins can view data retention runs" ON public.data_retention_runs
FOR SELECT TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert data retention runs" ON public.data_retention_runs;
CREATE POLICY "Admins can insert data retention runs" ON public.data_retention_runs
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

WITH default_templates AS (
    SELECT
        $$1. Quem controla os dados
Esta politica explica como {{business_name}} trata dados pessoais em seu checkout, comunicacoes transacionais, suporte e entrega de produtos ou acessos. Para as compras realizadas nesta operacao, o vendedor identificado como {{legal_name}} atua como controlador principal dos dados do comprador. O Super Checkout e outros prestadores tecnicos podem atuar como operadores ou suboperadores para viabilizar a infraestrutura da venda.

2. Quais dados podem ser tratados
Podemos tratar dados de identificacao e contato, como nome e e-mail, e solicitar telefone ou documento apenas quando isso for necessario para contato operacional, prevencao a fraude, conciliacao ou exigencia do metodo de pagamento escolhido; dados da compra, como produto, valor, tentativas, status, meio de pagamento e identificadores da transacao; e dados tecnicos e de seguranca, como IP, user agent, cookies tecnicos, origem de campanha, logs de acesso e eventos necessarios para proteger a operacao.

3. Como os dados sao coletados
Os dados podem ser fornecidos diretamente pelo comprador no checkout, coletados automaticamente pelo navegador ou recebidos de integracoes e processadores usados para pagamento, antifraude, atendimento, entrega e recuperacao de acesso. Quando o vendedor habilita mensuracao comercial, o checkout tambem pode registrar parametros de campanha, identificadores de clique e eventos de navegacao ou compra para atribuicao e performance.

4. Finalidades do tratamento
Os dados sao utilizados para processar o pedido, confirmar o pagamento, entregar o produto, liberar acessos, enviar e-mails transacionais, prestar suporte, prevenir fraude, auditar eventos criticos, cumprir obrigacoes legais e defender direitos em demandas administrativas ou judiciais. Quando o vendedor habilita pixels, analytics ou integracoes de publicidade, dados de navegacao e da transacao tambem podem ser usados para mensuracao comercial, atribuicao de campanhas e deduplicacao de eventos.

5. Compartilhamento com terceiros
Os dados podem ser compartilhados, na medida do necessario, com processadores de pagamento, provedores de hospedagem, banco de dados, envio de e-mail, antifraude, analytics, publicidade e suporte tecnico vinculados a esta operacao. Dados sensiveis de pagamento, como o numero completo do cartao, nao sao armazenados por este checkout e permanecem sob tratamento direto dos processadores utilizados.

6. Retencao e seguranca
Os dados sao mantidos pelo prazo necessario para executar a venda, prestar suporte, cumprir obrigacoes fiscais, regulatorias e de seguranca, ou resguardar direitos em disputas. Logs e trilhas tecnicas sujeitos a janelas operacionais menores podem ser excluidos periodicamente conforme politica interna de retencao. Medidas tecnicas e organizacionais sao adotadas para reduzir acesso indevido, abuso, fraude e exposicao nao autorizada.

7. Direitos do titular e contato
O titular pode solicitar informacoes sobre tratamento, correcao, atualizacao, revogacao de consentimento quando aplicavel e demais direitos previstos em lei pelos canais oficiais do vendedor. Para temas de privacidade e atendimento, o contato informado para esta operacao e {{legal_contact}}. As solicitacoes recebidas podem ser registradas internamente para controle, resposta e evidencia operacional.$$::text AS privacy_template,
        $$1. Identificacao da oferta
Estes termos regulam a compra realizada com {{business_name}} por meio deste checkout. O vendedor identificado como {{legal_name}} e o responsavel comercial pela oferta, pelo conteudo vendido, pela entrega, pelo suporte e pelas informacoes publicadas na pagina de vendas.

2. Condicoes da compra
Antes de concluir o pagamento, o comprador deve verificar descricao da oferta, preco, forma de pagamento, recorrencia quando aplicavel, prazo de acesso, bonus, regras de entrega e eventuais restricoes informadas na oferta. Ao finalizar o pedido, o comprador declara que forneceu dados verdadeiros e possui capacidade legal para contratar.

3. Pagamento e aprovacao
O pagamento pode ser processado por provedores terceiros, como Stripe ou Mercado Pago. A aprovacao depende de validacoes do emissor, do processador e dos mecanismos de antifraude. A simples tentativa de pagamento nao garante aprovacao, reserva definitiva da oferta ou liberacao antecipada de acesso.

4. Entrega e acesso
A liberacao do produto, area de membros, arquivo, link, servico ou instrucoes de uso ocorre conforme a oferta adquirida e depende da confirmacao do pagamento. O comprador deve manter seus dados de contato atualizados para receber e-mails transacionais, acessos e orientacoes pos-compra.

5. Suporte e responsabilidade do comprador
O comprador e responsavel por revisar as informacoes da oferta, utilizar os canais corretos de atendimento e preservar as credenciais recebidas. O compartilhamento indevido de acessos, tentativas de fraude, chargeback abusivo ou uso ilicito do produto podem motivar bloqueio, suspensao ou medidas cabiveis.

6. Cancelamentos, reembolsos e arrependimento
Condicoes especificas de cancelamento, garantia ou reembolso devem ser apresentadas na propria oferta. Quando houver direito de arrependimento ou outra obrigacao legal aplicavel, ela sera observada nos termos da legislacao vigente e pelos canais oficiais do vendedor.

7. Infraestrutura tecnica e contato
O Super Checkout fornece a infraestrutura tecnica do checkout, mas nao substitui as obrigacoes comerciais e legais do vendedor perante o comprador. Quando houver mensuracao comercial habilitada, este checkout pode acionar tecnologias de analytics, pixel e atribuicao para registrar o inicio e a conclusao da compra. Campos como telefone ou documento podem ser exigidos apenas quando o meio de pagamento ou controles antifraude tornarem essa coleta necessaria. Para atendimento comercial, suporte e privacidade desta operacao, o canal informado pelo vendedor e {{support_email}}.$$::text AS terms_template
),
normalized_settings AS (
    SELECT
        bs.account_id,
        COALESCE(NULLIF(BTRIM(bs.business_name), ''), 'Este vendedor') AS business_name,
        COALESCE(NULLIF(BTRIM(bs.legal_name), ''), COALESCE(NULLIF(BTRIM(bs.business_name), ''), 'Este vendedor')) AS legal_name,
        COALESCE(NULLIF(BTRIM(bs.support_email), ''), 'nao informado') AS support_email,
        COALESCE(NULLIF(BTRIM(bs.legal_responsible_email), ''), COALESCE(NULLIF(BTRIM(bs.support_email), ''), 'nao informado')) AS legal_contact,
        COALESCE(NULLIF(BTRIM(bs.support_whatsapp), ''), '') AS support_whatsapp,
        CASE
            WHEN COALESCE(NULLIF(BTRIM(bs.privacy_policy), ''), '') = '' THEN NULL
            ELSE bs.privacy_policy
        END AS privacy_policy_template,
        NULLIF(BTRIM(bs.privacy_policy_version), '') AS privacy_policy_version,
        bs.privacy_policy_published_at,
        CASE
            WHEN COALESCE(NULLIF(BTRIM(bs.terms_of_purchase), ''), '') = '' THEN NULL
            ELSE bs.terms_of_purchase
        END AS terms_template,
        NULLIF(BTRIM(bs.terms_of_purchase_version), '') AS terms_version,
        bs.terms_of_purchase_published_at,
        COALESCE(bs.updated_at, timezone('utc'::text, now())) AS settings_updated_at
    FROM public.business_settings bs
),
privacy_snapshots AS (
    SELECT
        ns.account_id,
        'privacy_policy'::text AS document_key,
        COALESCE(
            ns.privacy_policy_version,
            CASE
                WHEN ns.privacy_policy_template IS NULL THEN 'lgpd-baseline-2026.05'
                ELSE CONCAT('privacy-', TO_CHAR(COALESCE(ns.privacy_policy_published_at, ns.settings_updated_at), 'YYYY.MM.DD'))
            END
        ) AS version,
        COALESCE(
            ns.privacy_policy_published_at,
            CASE
                WHEN ns.privacy_policy_template IS NULL THEN TIMESTAMP WITH TIME ZONE '2026-05-26T00:00:00.000Z'
                ELSE ns.settings_updated_at
            END
        ) AS published_at,
        CASE
            WHEN ns.privacy_policy_template IS NULL THEN 'default'
            ELSE 'custom'
        END AS source,
        COALESCE(ns.privacy_policy_template, dt.privacy_template) AS template_content,
        REPLACE(
            REPLACE(
                REPLACE(
                    REPLACE(
                        REPLACE(COALESCE(ns.privacy_policy_template, dt.privacy_template), '{{business_name}}', ns.business_name),
                        '{{legal_name}}',
                        ns.legal_name
                    ),
                    '{{support_email}}',
                    ns.support_email
                ),
                '{{legal_contact}}',
                ns.legal_contact
            ),
            '{{support_whatsapp}}',
            ns.support_whatsapp
        ) AS rendered_content,
        ns.legal_name,
        ns.legal_contact,
        ns.support_email,
        jsonb_build_object(
            'seeded_by_migration', '1.0.18',
            'default_legal_version', 'lgpd-baseline-2026.05',
            'seed_source', 'canonical_schema'
        ) AS metadata
    FROM normalized_settings ns
    CROSS JOIN default_templates dt
),
terms_snapshots AS (
    SELECT
        ns.account_id,
        'terms_of_purchase'::text AS document_key,
        COALESCE(
            ns.terms_version,
            CASE
                WHEN ns.terms_template IS NULL THEN 'lgpd-baseline-2026.05'
                ELSE CONCAT('terms-', TO_CHAR(COALESCE(ns.terms_of_purchase_published_at, ns.settings_updated_at), 'YYYY.MM.DD'))
            END
        ) AS version,
        COALESCE(
            ns.terms_of_purchase_published_at,
            CASE
                WHEN ns.terms_template IS NULL THEN TIMESTAMP WITH TIME ZONE '2026-05-26T00:00:00.000Z'
                ELSE ns.settings_updated_at
            END
        ) AS published_at,
        CASE
            WHEN ns.terms_template IS NULL THEN 'default'
            ELSE 'custom'
        END AS source,
        COALESCE(ns.terms_template, dt.terms_template) AS template_content,
        REPLACE(
            REPLACE(
                REPLACE(
                    REPLACE(
                        REPLACE(COALESCE(ns.terms_template, dt.terms_template), '{{business_name}}', ns.business_name),
                        '{{legal_name}}',
                        ns.legal_name
                    ),
                    '{{support_email}}',
                    ns.support_email
                ),
                '{{legal_contact}}',
                ns.legal_contact
            ),
            '{{support_whatsapp}}',
            ns.support_whatsapp
        ) AS rendered_content,
        ns.legal_name,
        ns.legal_contact,
        ns.support_email,
        jsonb_build_object(
            'seeded_by_migration', '1.0.18',
            'default_legal_version', 'lgpd-baseline-2026.05',
            'seed_source', 'canonical_schema'
        ) AS metadata
    FROM normalized_settings ns
    CROSS JOIN default_templates dt
)
INSERT INTO public.business_legal_document_versions (
    account_id,
    document_key,
    version,
    published_at,
    source,
    template_content,
    rendered_content,
    legal_name,
    legal_contact,
    support_email,
    metadata
)
SELECT
    snapshot.account_id,
    snapshot.document_key,
    snapshot.version,
    snapshot.published_at,
    snapshot.source,
    snapshot.template_content,
    snapshot.rendered_content,
    snapshot.legal_name,
    snapshot.legal_contact,
    snapshot.support_email,
    snapshot.metadata
FROM (
    SELECT * FROM privacy_snapshots
    UNION ALL
    SELECT * FROM terms_snapshots
) AS snapshot
ON CONFLICT (account_id, document_key, content_sha256) DO NOTHING;

UPDATE public.system_info
SET db_version = '1.0.19',
    last_update_at = timezone('utc'::text, now());

UPDATE public.schema_migrations
SET success = true,
    description = 'Canonical schema includes LGPD consent preferences and legal version metadata',
    error_log = NULL,
    executed_at = timezone('utc'::text, now())
WHERE version = '1.0.16';

INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
SELECT '1.0.16', 'Canonical schema includes LGPD consent preferences and legal version metadata', true, 0
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '1.0.16');

UPDATE public.schema_migrations
SET success = true,
    description = 'Canonical schema includes privacy requests and retention operations',
    error_log = NULL,
    executed_at = timezone('utc'::text, now())
WHERE version = '1.0.17';

INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
SELECT '1.0.17', 'Canonical schema includes privacy requests and retention operations', true, 0
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '1.0.17');

UPDATE public.schema_migrations
SET success = true,
    description = 'Canonical schema includes account-scoped legal document history snapshots',
    error_log = NULL,
    executed_at = timezone('utc'::text, now())
WHERE version = '1.0.18';

INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
SELECT '1.0.18', 'Canonical schema includes account-scoped legal document history snapshots', true, 0
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '1.0.18');

UPDATE public.schema_migrations
SET success = true,
    description = 'Canonical schema includes platform legal acceptance evidence',
    error_log = NULL,
    executed_at = timezone('utc'::text, now())
WHERE version = '1.0.19';

INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
SELECT '1.0.19', 'Canonical schema includes platform legal acceptance evidence', true, 0
WHERE NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '1.0.19');

NOTIFY pgrst, 'reload schema';

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from '../_cors.js';
import { enforceApiRateLimit } from '../_rate-limit.js';
import { getLocalSupabaseServerConfig } from '../_supabase-server.js';
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

const { Client } = pg;

const SENSITIVE_LOG_KEYS = new Set([
  'access_token',
  'refresh_token',
  'token',
  'secret',
  'clientsecret',
  'client_secret',
  'db_pass',
  'dbpass',
  'password',
  'service_role',
  'servicekey',
  'private_key',
  'webhook_secret',
  'api_key',
  'apikey',
  'authorization'
]);

function redactSensitive(value: any): any {
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SENSITIVE_LOG_KEYS.has(key.toLowerCase()) ? '[redacted]' : redactSensitive(entry)
      ])
    );
  }
  if (typeof value === 'string' && value.length > 80) return `${value.slice(0, 12)}...[redacted]`;
  return value;
}

function safeErrorMessage(error: any) {
  return String(error?.message || error || 'Unexpected installer error')
    .replace(/[A-Za-z0-9_\-]{32,}/g, '[redacted]');
}

function safeResponsePreview(value: any) {
  const text = safeErrorMessage(value).replace(/\s+/g, ' ').trim();
  if (text.length <= 160) return text;
  return `${text.slice(0, 160)}...[redacted]`;
}

function secureRandomSuffix(bytes = 2) {
  return randomBytes(bytes).toString('hex');
}

function normalizeVercelDeploymentDomain(value: unknown) {
  const hostname = String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .split(':')[0]
    .toLowerCase();

  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/.test(hostname)) {
    return '';
  }

  return hostname;
}

async function verifyVercelBackend(domain: string) {
  const response = await fetch(`https://${domain}/api/config?probe=${Date.now()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  const payload = await response.json().catch(() => ({}));
  const failureMessage = safeResponsePreview(
    payload?.message
    || payload?.error
    || `HTTP ${response.status}`
  );

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: failureMessage,
    };
  }

  return {
    ok: Boolean(payload?.url && payload?.anon),
    status: response.status,
    error: payload?.url && payload?.anon
      ? null
      : safeResponsePreview(payload?.message || payload?.error || 'Runtime config response is missing required fields.'),
  };
}

// Schema SQL embedded directly to avoid bundling/import issues
const schemaSql = `
-- Super Checkout - Definitive Fail-Proof Schema
-- Run this in the Supabase SQL Editor. It is idempotent (safe to run multiple times).

-- ==========================================
-- 1. EXTENSIONS & CONFIGURATION
-- ==========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1.1 Bootstrap helper functions required by early policies/triggers on fresh installs.
-- public.is_admin() is defined as a safe stub first because public.profiles
-- is created later in this schema and some policies reference the function before that.
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
CREATE TABLE IF NOT EXISTS domains (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'pending_verification',
  usage TEXT DEFAULT 'checkout',
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure columns exist (for updates)
DO $$
BEGIN
    ALTER TABLE domains ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
    ALTER TABLE domains ADD COLUMN IF NOT EXISTS usage TEXT DEFAULT 'checkout';
    ALTER TABLE domains ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;
EXCEPTION
    WHEN duplicate_column THEN RAISE NOTICE 'Column already exists in domains.';
END $$;

-- 2.2 Member Areas
CREATE TABLE IF NOT EXISTS member_areas (
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
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'BRL',
  image_url TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    ALTER TABLE products ADD COLUMN IF NOT EXISTS price_real DECIMAL(10,2);
    ALTER TABLE products ADD COLUMN IF NOT EXISTS price_fake DECIMAL(10,2);
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

-- 2.4 Contents
CREATE TABLE IF NOT EXISTS contents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_area_id UUID REFERENCES member_areas(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  image_vertical_url TEXT,
  image_horizontal_url TEXT,
  modules_layout TEXT DEFAULT 'horizontal',
  is_published BOOLEAN DEFAULT false,
  is_free BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    ALTER TABLE contents ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
    ALTER TABLE contents ADD COLUMN IF NOT EXISTS image_vertical_url TEXT;
    ALTER TABLE contents ADD COLUMN IF NOT EXISTS image_horizontal_url TEXT;
    ALTER TABLE contents ADD COLUMN IF NOT EXISTS modules_layout TEXT DEFAULT 'horizontal';
    ALTER TABLE contents ADD COLUMN IF NOT EXISTS is_free BOOLEAN DEFAULT FALSE;
END $$;

-- 2.5 Modules
CREATE TABLE IF NOT EXISTS modules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id UUID REFERENCES contents(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN DEFAULT false,
  image_vertical_url TEXT,
  image_horizontal_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    ALTER TABLE modules ADD COLUMN IF NOT EXISTS image_vertical_url TEXT;
    ALTER TABLE modules ADD COLUMN IF NOT EXISTS image_horizontal_url TEXT;
END $$;

-- 2.6 Lessons
CREATE TABLE IF NOT EXISTS lessons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  module_id UUID REFERENCES modules(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT,
  duration INTEGER,
  position INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN DEFAULT false,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    ALTER TABLE lessons ADD COLUMN IF NOT EXISTS video_url TEXT;
    ALTER TABLE lessons ADD COLUMN IF NOT EXISTS duration INTEGER;
    ALTER TABLE lessons ADD COLUMN IF NOT EXISTS image_url TEXT;
END $$;

-- 2.7 Product Contents
CREATE TABLE IF NOT EXISTS product_contents (
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  content_id UUID REFERENCES contents(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (product_id, content_id)
);

-- 2.8 Gateways (Essential for checkout)
CREATE TABLE IF NOT EXISTS gateways (
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

-- 2.8.1 Webhooks
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

-- 2.9 Checkouts
CREATE TABLE IF NOT EXISTS checkouts (
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

-- 2.10 Domains (CRITICAL: Must be before checkouts FK)
CREATE TABLE IF NOT EXISTS public.domains (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  type TEXT DEFAULT 'custom', -- 'installation' or 'custom'
  status TEXT DEFAULT 'pending_verification', -- 'active', 'pending', 'verified'
  usage TEXT DEFAULT 'checkout', -- 'checkout', 'member_area', 'general'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'domains' AND policyname = 'Allow public read access to active domains') THEN
        CREATE POLICY "Allow public read access to active domains" ON public.domains FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'domains' AND policyname = 'Allow admin full access') THEN
        CREATE POLICY "Allow admin full access" ON public.domains FOR ALL USING (public.is_admin());
    END IF;
END $$;

-- 2.10.1 Grants (Explicitly ensure anon can read)
GRANT SELECT ON public.domains TO anon;
GRANT SELECT ON public.domains TO authenticated;
GRANT ALL ON public.domains TO service_role;

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

-- 2.10 Orders
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  checkout_id UUID REFERENCES checkouts(id),
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  customer_document TEXT,
  total DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL,
  payment_method TEXT,
  payment_id TEXT,
  metadata JSONB,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    -- CRITICAL FIX: Ensure both user_id (seller) and customer_user_id (buyer) exist
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_user_id UUID REFERENCES auth.users(id);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_cpf TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS offer_id UUID;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_id TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS utm_source TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS utm_medium TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS items JSONB;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS total DECIMAL(10,2);
END $$;

-- 2.11 Payments
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) NOT NULL,
  gateway_id UUID REFERENCES gateways(id) NOT NULL,
  status TEXT NOT NULL,
  transaction_id TEXT,
  raw_response JSONB,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2.11.1 Customer Payment Profiles
CREATE TABLE IF NOT EXISTS customer_payment_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  gateway_id UUID REFERENCES gateways(id) NOT NULL,
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
  first_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  last_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$
BEGIN
    ALTER TABLE customer_payment_profiles ADD COLUMN IF NOT EXISTS gateway_name TEXT;
    ALTER TABLE customer_payment_profiles ADD COLUMN IF NOT EXISTS customer_user_id UUID REFERENCES auth.users(id);
    ALTER TABLE customer_payment_profiles ADD COLUMN IF NOT EXISTS customer_email TEXT;
    ALTER TABLE customer_payment_profiles ADD COLUMN IF NOT EXISTS customer_name TEXT;
    ALTER TABLE customer_payment_profiles ADD COLUMN IF NOT EXISTS payment_method_type TEXT;
    ALTER TABLE customer_payment_profiles ADD COLUMN IF NOT EXISTS gateway_customer_id TEXT DEFAULT '';
    ALTER TABLE customer_payment_profiles ADD COLUMN IF NOT EXISTS gateway_payment_method_id TEXT DEFAULT '';
    ALTER TABLE customer_payment_profiles ADD COLUMN IF NOT EXISTS card_brand TEXT;
    ALTER TABLE customer_payment_profiles ADD COLUMN IF NOT EXISTS card_last4 TEXT DEFAULT '';
    ALTER TABLE customer_payment_profiles ADD COLUMN IF NOT EXISTS card_exp_month INTEGER;
    ALTER TABLE customer_payment_profiles ADD COLUMN IF NOT EXISTS card_exp_year INTEGER;
    ALTER TABLE customer_payment_profiles ADD COLUMN IF NOT EXISTS wallet_type TEXT;
    ALTER TABLE customer_payment_profiles ADD COLUMN IF NOT EXISTS issuer_id TEXT;
    ALTER TABLE customer_payment_profiles ADD COLUMN IF NOT EXISTS reusable BOOLEAN DEFAULT false;
    ALTER TABLE customer_payment_profiles ADD COLUMN IF NOT EXISTS requires_reauthentication BOOLEAN DEFAULT true;
    ALTER TABLE customer_payment_profiles ADD COLUMN IF NOT EXISTS consent_scope TEXT DEFAULT 'post_purchase_upsell';
    ALTER TABLE customer_payment_profiles ADD COLUMN IF NOT EXISTS consent_captured_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE customer_payment_profiles ADD COLUMN IF NOT EXISTS first_order_id UUID REFERENCES orders(id) ON DELETE SET NULL;
    ALTER TABLE customer_payment_profiles ADD COLUMN IF NOT EXISTS last_order_id UUID REFERENCES orders(id) ON DELETE SET NULL;
    ALTER TABLE customer_payment_profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
    ALTER TABLE customer_payment_profiles ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE customer_payment_profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
    ALTER TABLE customer_payment_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
END $$;

UPDATE customer_payment_profiles
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

ALTER TABLE customer_payment_profiles ALTER COLUMN gateway_customer_id SET NOT NULL;
ALTER TABLE customer_payment_profiles ALTER COLUMN gateway_payment_method_id SET NOT NULL;
ALTER TABLE customer_payment_profiles ALTER COLUMN card_last4 SET NOT NULL;
ALTER TABLE customer_payment_profiles ALTER COLUMN customer_email SET NOT NULL;
ALTER TABLE customer_payment_profiles ALTER COLUMN payment_method_type SET NOT NULL;
ALTER TABLE customer_payment_profiles ALTER COLUMN gateway_name SET NOT NULL;
ALTER TABLE customer_payment_profiles ALTER COLUMN reusable SET NOT NULL;
ALTER TABLE customer_payment_profiles ALTER COLUMN requires_reauthentication SET NOT NULL;
ALTER TABLE customer_payment_profiles ALTER COLUMN consent_scope SET NOT NULL;
ALTER TABLE customer_payment_profiles ALTER COLUMN metadata SET NOT NULL;
ALTER TABLE customer_payment_profiles ALTER COLUMN last_seen_at SET NOT NULL;
ALTER TABLE customer_payment_profiles ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE customer_payment_profiles ALTER COLUMN updated_at SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customer_payment_profiles_unique_method
ON customer_payment_profiles (user_id, gateway_id, customer_email, gateway_customer_id, gateway_payment_method_id, payment_method_type, card_last4);
DROP TRIGGER IF EXISTS update_customer_payment_profiles_updated_at ON customer_payment_profiles;
CREATE TRIGGER update_customer_payment_profiles_updated_at
  BEFORE UPDATE ON customer_payment_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 2.12 Access Grants
CREATE TABLE IF NOT EXISTS access_grants (
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

-- 2.12 Tracks & Items
CREATE TABLE IF NOT EXISTS tracks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_area_id UUID REFERENCES member_areas(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('products', 'contents', 'modules', 'lessons')),
  position INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN DEFAULT true,
  card_style TEXT DEFAULT 'horizontal',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS track_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  track_id UUID REFERENCES tracks(id) ON DELETE CASCADE NOT NULL,
  item_id UUID NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2.13 Licenses (Installer logic)
CREATE TABLE IF NOT EXISTS licenses (
  key UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_email TEXT NOT NULL,
  client_name TEXT,
  status TEXT DEFAULT 'active',
  account_id UUID REFERENCES public.accounts(id),
  allowed_domain TEXT,
  plan TEXT DEFAULT 'lifetime',
  max_instances INTEGER DEFAULT 1,
  activated_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    ALTER TABLE licenses ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id);
    ALTER TABLE licenses ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE licenses ADD COLUMN IF NOT EXISTS allowed_domain TEXT;
    ALTER TABLE licenses ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'lifetime';
    ALTER TABLE licenses ADD COLUMN IF NOT EXISTS max_instances INTEGER DEFAULT 1;
END $$;

CREATE TABLE IF NOT EXISTS validation_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  license_key UUID REFERENCES licenses(key),
  ip_address TEXT,
  domain TEXT,
  user_agent TEXT,
  valid BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2.14 System Configuration
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==========================================
-- 3. MEMBER MANAGEMENT
-- ==========================================
CREATE TABLE IF NOT EXISTS public.profiles (
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

CREATE TABLE IF NOT EXISTS public.member_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  author_id UUID REFERENCES auth.users(id) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.member_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tag TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, tag)
);

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  event TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==========================================
-- 4. VIEWS & FUNCTIONS
-- ==========================================

-- 4.1. Replace bootstrap admin helper now that public.profiles already exists.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4.2. Handle New User
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  is_first_user BOOLEAN;
  v_full_name TEXT;
BEGIN
  -- Check if this is the first user registered to make them admin
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first_user;

  v_full_name := NULLIF(BTRIM(COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'customer_name',
    NEW.raw_user_meta_data->>'display_name'
  )), '');

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    CASE 
      WHEN is_first_user THEN 'admin' 
      ELSE COALESCE(NEW.raw_user_meta_data->>'role', 'member') 
    END
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    full_name = COALESCE(NULLIF(BTRIM(public.profiles.full_name), ''), EXCLUDED.full_name);
  
  -- Auto-seed default 'resend' integration (Inactive state, but valid provider)
  INSERT INTO integrations (user_id, name, provider, active, config)
  VALUES (NEW.id, 'resend', 'resend', false, '{}'::jsonb)
  ON CONFLICT (user_id, name) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4.3. Handle Order Access
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
        INSERT INTO access_grants (user_id, content_id, product_id, granted_at, status)
        VALUES (v_user_id, v_content_record.content_id, NULL, NOW(), 'active')
        ON CONFLICT (user_id, content_id) 
        DO UPDATE SET status = 'active', granted_at = NOW();
      END LOOP;
      
      INSERT INTO access_grants (user_id, product_id, granted_at, status)
      VALUES (v_user_id, v_product_id, NOW(), 'active')
      ON CONFLICT (user_id, product_id)
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

-- 4.4 Get Member Area Members
CREATE OR REPLACE FUNCTION get_member_area_members(area_id uuid)
RETURNS TABLE (
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
    COALESCE((u.raw_user_meta_data->>'name')::text, 'Sem nome') as name,
    MIN(ag.granted_at) as joined_at,
    ag.status::text
  FROM access_grants ag
  JOIN auth.users u ON ag.user_id = u.id
  JOIN contents c ON ag.content_id = c.id
  WHERE c.member_area_id = area_id
  GROUP BY u.id, u.email, u.raw_user_meta_data, ag.status;
END;
$$ LANGUAGE plpgsql;

-- 4.5 Admin Members View (Fixing the error source)
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

-- ==========================================
-- 5. RLS POLICIES (Re-apply safely)
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
ALTER TABLE customer_payment_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE gateways ENABLE ROW LEVEL SECURITY;
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies to avoid conflicts (safest approach for installer)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON "' || r.tablename || '";';
  END LOOP;
END $$;

-- 5.1 Basic Owner Policies
-- Domains
CREATE POLICY "Users can manage their own domains" ON domains FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Public can view active domains" ON domains FOR SELECT USING (true);

-- Member Areas
CREATE POLICY "Users can view their own member areas" ON member_areas FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert their own member areas" ON member_areas FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update their own member areas" ON member_areas FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete their own member areas" ON member_areas FOR DELETE USING (auth.uid() = owner_id);
CREATE POLICY "Public can view member areas by slug" ON member_areas FOR SELECT USING (true);

-- Products
CREATE POLICY "Users can manage their own products" ON products FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Public can view active products" ON products FOR SELECT USING (active = true);

-- Gateways
CREATE POLICY "Users can manage their own gateways" ON gateways FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Public can view active gateways" ON gateways FOR SELECT USING (active = true OR is_active = true);

-- Checkouts
CREATE POLICY "Users can manage their own checkouts" ON checkouts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Public can view active checkouts" ON checkouts FOR SELECT USING (active = true);

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

-- Orders
CREATE POLICY "Users can manage their own orders" ON orders FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Customers can view their own orders" ON orders FOR SELECT USING (auth.uid() = customer_user_id);
CREATE POLICY "Public can create orders" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can view orders" ON orders FOR SELECT USING (true);

-- Payments
CREATE POLICY "Users can manage their own payments" ON payments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Public can create payments" ON payments FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can view payments" ON payments FOR SELECT USING (true);

-- Customer Payment Profiles
CREATE POLICY "Users can manage their own customer payment profiles" ON customer_payment_profiles FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all customer payment profiles" ON customer_payment_profiles FOR SELECT USING (public.is_admin());

-- Contents
CREATE POLICY "Users can manage their own contents" ON contents FOR ALL USING (
  EXISTS (SELECT 1 FROM member_areas ma WHERE ma.id = contents.member_area_id AND ma.owner_id = auth.uid())
);
CREATE POLICY "Public can view published contents" ON contents FOR SELECT USING (is_published = true);

-- Modules
CREATE POLICY "Users can manage their own modules" ON modules FOR ALL USING (
  EXISTS (SELECT 1 FROM contents c JOIN member_areas ma ON ma.id = c.member_area_id WHERE c.id = modules.content_id AND ma.owner_id = auth.uid())
);
CREATE POLICY "Public can view published modules" ON modules FOR SELECT USING (is_published = true);

-- Lessons
CREATE POLICY "Users can manage their own lessons" ON lessons FOR ALL USING (
  EXISTS (SELECT 1 FROM modules m JOIN contents c ON c.id = m.content_id JOIN member_areas ma ON ma.id = c.member_area_id WHERE m.id = lessons.module_id AND ma.owner_id = auth.uid())
);
CREATE POLICY "Public can view published lessons" ON lessons FOR SELECT USING (is_published = true);

-- Tracks
CREATE POLICY "Admins can manage tracks" ON tracks FOR ALL USING (
  EXISTS (SELECT 1 FROM member_areas ma WHERE ma.id = tracks.member_area_id AND ma.owner_id = auth.uid())
);
CREATE POLICY "Public can view visible tracks" ON tracks FOR SELECT USING (is_visible = true);

-- Track Items
CREATE POLICY "Admins can manage track items" ON track_items FOR ALL USING (
  EXISTS (SELECT 1 FROM tracks JOIN member_areas ma ON ma.id = tracks.member_area_id WHERE tracks.id = track_items.track_id AND ma.owner_id = auth.uid())
);
CREATE POLICY "Public can view track items" ON track_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM tracks WHERE tracks.id = track_items.track_id AND tracks.is_visible = true)
);

-- Profiles
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can manage all profiles" ON public.profiles FOR ALL USING (public.is_admin());

-- Config Tables
CREATE POLICY "Admins can read system config" ON public.system_config FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can insert system config" ON public.system_config FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update system config" ON public.system_config FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins can delete system config" ON public.system_config FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can manage member notes" ON public.member_notes FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can manage member tags" ON public.member_tags FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Logs
CREATE POLICY "Users can create their own logs" ON public.activity_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own logs" ON public.activity_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all logs" ON public.activity_logs FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Licenses
CREATE POLICY "Users can view own license" ON public.licenses FOR SELECT TO authenticated USING (auth.uid() = owner_id OR public.is_admin());
CREATE POLICY "Admins can insert licenses" ON public.licenses FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update licenses" ON public.licenses FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins can delete licenses" ON public.licenses FOR DELETE TO authenticated USING (public.is_admin());
CREATE POLICY "Service Role full access licenses" ON public.licenses TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Admins can view validation logs" ON public.validation_logs FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Service Role full access validation logs" ON public.validation_logs TO service_role USING (true) WITH CHECK (true);

-- ==========================================
-- 6. STORAGE BUCKETS (Idempotent)
-- ==========================================

INSERT INTO storage.buckets (id, name, public) VALUES ('member-areas', 'member-areas', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('contents', 'contents', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('checkouts', 'checkouts', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('products', 'products', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('product-deliverables', 'product-deliverables', false)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, public = EXCLUDED.public;

-- Storage Policies (Drop first to ensure clean state)
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
CREATE POLICY "Authenticated Read Member Areas" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'member-areas');
CREATE POLICY "Authenticated Upload Member Areas" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'member-areas' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated Update Member Areas" ON storage.objects FOR UPDATE USING (bucket_id = 'member-areas' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated Read Contents" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'contents');
CREATE POLICY "Authenticated Upload Contents" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'contents' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated Update Contents" ON storage.objects FOR UPDATE USING (bucket_id = 'contents' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated Read Checkouts" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'checkouts');
CREATE POLICY "Authenticated Upload Checkouts" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'checkouts' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated Update Checkouts" ON storage.objects FOR UPDATE USING (bucket_id = 'checkouts' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated Delete Checkouts" ON storage.objects FOR DELETE USING (bucket_id = 'checkouts' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated Read Products" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'products');
CREATE POLICY "Authenticated Upload Products" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'products' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated Update Products" ON storage.objects FOR UPDATE USING (bucket_id = 'products' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated Delete Products" ON storage.objects FOR DELETE USING (bucket_id = 'products' AND auth.role() = 'authenticated');

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

CREATE POLICY "Authenticated Read Avatars" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avatars');
CREATE POLICY "Authenticated Upload Avatars" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated Read Modules" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'modules');
CREATE POLICY "Authenticated Read Activation Assets" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'activation-assets');
`;

export const config = {
  maxDuration: 60,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    applyCors(req, res, 'GET,OPTIONS,POST');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { action, code, licenseKey, projectRef, dbPass, organizationSlug, installationId, targetDomain } = req.body;

    // 0. Initialize Supabase (Admin Context)
    const { supabaseUrl, serverKey: supabaseServiceKey, serverKeySource } = getLocalSupabaseServerConfig();

    if (!supabaseUrl || !supabaseServiceKey) {
      const missing = [
        !supabaseUrl ? 'VITE_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL' : null,
        !supabaseServiceKey ? 'SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY' : null,
      ].filter(Boolean);

      console.error('[installer/supabase] Missing Supabase environment variables:', missing.join(', '));
      return res.status(500).json({ error: `Server configuration error: missing ${missing.join(', ')}` });
    }

    console.log('[installer/supabase] Using Supabase server key source:', serverKeySource);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Validate License (Via Central API - manage-licenses)
    if (!licenseKey) return res.status(400).json({ error: 'Missing license key' });
    if (!installationId) return res.status(400).json({ error: 'Missing installation ID' });

    const rateLimit = enforceApiRateLimit(req, res, {
      scope: action === 'create_project' ? 'installer_create_project' : 'installer_action',
      identifiers: [licenseKey, installationId, action],
      limit: action === 'create_project' ? 4 : (action === 'verify_backend' ? 40 : 10),
      windowMs: 15 * 60 * 1000
    });

    if (!rateLimit.allowed) {
      return res.status(429).json({ error: 'Too many installer attempts. Try again later.' });
    }

    const deploymentDomain = action === 'verify_backend'
      ? normalizeVercelDeploymentDomain(targetDomain)
      : '';

    if (action === 'verify_backend' && !deploymentDomain) {
      return res.status(400).json({ error: 'Invalid deployment domain' });
    }

    const validationDomain = deploymentDomain || 'setup-pending';

    // CENTRAL API CONFIG
    const CENTRAL_API_URL = 'https://bcmnryxjweiovrwmztpn.supabase.co/functions/v1';

    try {
      const validationRes = await fetch(`${CENTRAL_API_URL}/validate-license`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_key: licenseKey,
          installation_id: installationId,
          current_domain: validationDomain,
          register: true
        })
      });

      if (!validationRes.ok) throw new Error('Failed to validate license with central server');

      const validationData = await validationRes.json();
      if (!validationData.valid) {
        return res.status(403).json({ error: 'Invalid or inactive license' });
      }
    } catch (e) {
      console.error('License Validation Error:', safeErrorMessage(e));
      return res.status(403).json({ error: 'License validation failed' });
    }

    try {
      if (action === 'verify_backend') {
        const result = await verifyVercelBackend(deploymentDomain);
        if (!result.ok) {
          return res.status(409).json({
            success: false,
            status: result.status,
            error: result.error || 'Deployment backend is not ready'
          });
        }

        return res.status(200).json({ success: true, status: result.status });
      }

      if (action === 'create_project') {
        if (!code) return res.status(400).json({ error: 'Missing OAuth code' });

        const clientId = process.env.SUPABASE_CLIENT_ID;
        const clientSecret = process.env.SUPABASE_CLIENT_SECRET;
        const redirectUri = `${req.headers.origin}/installer`;

        console.log('[Installer] OAuth flow started:', {
          has_client_id: !!clientId,
          has_client_secret: !!clientSecret,
          has_code: !!code,
          redirect_origin: req.headers.origin || null
        });

        if (!clientId || !clientSecret) {
          throw new Error('Missing Supabase OAuth credentials on server');
        }

        // 2. Exchange Code for Access Token
        console.log('[Installer] Attempting token exchange.');
        const tokenRes = await fetch('https://api.supabase.com/v1/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri
          })
        });

        console.log('[Installer] Token exchange response status:', tokenRes.status);

        // Safe JSON parsing
        const contentType = tokenRes.headers.get('content-type');
        let tokenData: any;
        if (contentType && contentType.includes('application/json')) {
          tokenData = await tokenRes.json();
          console.log('[Installer] Token exchange metadata:', redactSensitive({
            has_access_token: !!tokenData?.access_token,
            has_organization_id: !!tokenData?.organization_id,
            token_type: tokenData?.token_type || null,
            expires_in: tokenData?.expires_in || null
          }));
        } else {
          const textError = await tokenRes.text();
          console.error('[ERROR] Non-JSON token response:', {
            status: tokenRes.status,
            preview: safeResponsePreview(textError)
          });
          throw new Error(`OAuth token exchange failed (${tokenRes.status})`);
        }

        if (!tokenRes.ok) {
          console.error('[ERROR] Token exchange failed:', redactSensitive(tokenData));
          throw new Error(tokenData.error_description || tokenData.error || 'Failed to exchange token');
        }

        const accessToken = tokenData.access_token;
        console.log('[Installer] Access token present:', !!accessToken);


        // 3. Determine Organization ID (Reliable Method)
        let organizationId = organizationSlug || tokenData.organization_id;

        console.log('[Installer] Organization metadata:', {
          has_manual_slug: !!organizationSlug,
          has_token_organization_id: !!tokenData.organization_id
        });

        if (!organizationId) {
          console.log('[Installer] Fetching organizations list.');
          const orgsRes = await fetch('https://api.supabase.com/v1/organizations', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });

          console.log('[Installer] Organizations API status:', orgsRes.status);

          // Safe JSON parsing for orgs
          const orgsContentType = orgsRes.headers.get('content-type');
          let orgs: any;
          if (orgsContentType && orgsContentType.includes('application/json')) {
            orgs = await orgsRes.json();
            console.log('[Installer] Organizations response count:', Array.isArray(orgs) ? orgs.length : 0);
          } else {
            const textResponse = await orgsRes.text();
            console.warn('[ERROR] Failed to parse organizations JSON.', {
              status: orgsRes.status,
              preview: safeResponsePreview(textResponse)
            });
            throw new Error(`API do Supabase retornou resposta inválida. Por favor, forneça o Organization Slug manualmente.`);
          }

          if (!orgsRes.ok) {
            const orgErrorMessage = safeResponsePreview(orgs?.message || orgsRes.statusText);
            throw new Error(`Falha ao buscar organizações: ${orgErrorMessage}. Por favor, forneça o Organization Slug manualmente.`);
          }

          // Try to get ID or slug from first organization
          if (orgs && orgs.length > 0) {
            organizationId = orgs[0].id || orgs[0].slug;
            console.log('[Installer] Auto-selected first organization:', {
              has_organization_id: !!organizationId
            });
          } else {
            console.error('[ERROR] No organizations found.', {
              response_count: Array.isArray(orgs) ? orgs.length : 0
            });
            throw new Error('Nenhuma organização encontrada. Por favor, forneça o Organization Slug manualmente. Você pode encontrá-lo em: https://supabase.com/dashboard/org/_/general');
          }
        } else {
          console.log('[Installer] Using organization from provided metadata:', !!organizationId);
        }

        // 3.5. If we have a slug, we need to get the actual organization ID
        // The Supabase API requires the numeric ID, not the slug
        if (organizationId && !organizationId.match(/^\d+$/)) {
          console.log('[Installer] Organization appears to be a slug, fetching actual ID.');
          const orgsRes = await fetch('https://api.supabase.com/v1/organizations', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });

          if (orgsRes.ok) {
            const orgs = await orgsRes.json();
            console.log('[Installer] Organizations list count:', Array.isArray(orgs) ? orgs.length : 0);

            // Find the organization by slug
            const org = orgs.find((o: any) => o.slug === organizationId);
            if (org && org.id) {
              console.log('[Installer] Found organization ID for provided slug:', true);
              organizationId = org.id;
            } else {
              console.warn('[WARN] Could not find organization ID for provided slug');
              console.warn('[WARN] Organizations available for lookup:', Array.isArray(orgs) ? orgs.length : 0);
            }
          } else {
            console.warn('[WARN] Failed to fetch organizations to convert slug to ID');
          }
        }

        console.log('[Installer] Final organization ID for project creation present:', !!organizationId);


        // 4. Create Project
        const dbPass = generateStrongPassword();

        const projectPayload = {
          name: `Super Checkout ${secureRandomSuffix(2)}`,
          organization_id: organizationId,
          db_pass: dbPass,
          region: 'us-east-1',
          plan: 'free'
        };

        console.log('[Installer] Creating Supabase project:', {
          name: projectPayload.name,
          has_organization_id: !!projectPayload.organization_id,
          region: projectPayload.region,
          plan: projectPayload.plan
        });

        const createRes = await fetch('https://api.supabase.com/v1/projects', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(projectPayload)
        });

        console.log('[Installer] Project creation response status:', createRes.status);

        // Safe JSON parsing
        const createContentType = createRes.headers.get('content-type');
        let projectData: any;
        if (createContentType && createContentType.includes('application/json')) {
          projectData = await createRes.json();
          console.log('[Installer] Project creation metadata:', {
            has_project_id: !!projectData?.id,
            name: projectData?.name,
            status: projectData?.status,
            region: projectData?.region
          });
        } else {
          const textError = await createRes.text();
          console.error('[ERROR] Non-JSON project creation response:', {
            status: createRes.status,
            preview: safeResponsePreview(textError)
          });
          throw new Error(`Project creation failed (${createRes.status})`);
        }

        if (!createRes.ok) {
          console.error('[ERROR] Project creation failed:', redactSensitive(projectData));
          throw new Error(projectData.message || projectData.error || 'Failed to create project');
        }

        // SUCCESS - Return without fetching keys
        return res.status(200).json({
          success: true,
          projectRef: projectData.id,
          dbPass: dbPass
        });
      }

      if (action === 'run_migrations') {
        if (!projectRef || !dbPass) {
          return res.status(400).json({ error: 'Missing projectRef or dbPass' });
        }
      }

      return res.status(400).json({ error: 'Invalid installer action' });
    } catch (error: any) {
      console.error('Supabase API Critical Error:', safeErrorMessage(error));
      return res.status(500).json({ error: safeErrorMessage(error) || 'Critical Server Error' });
    }
  } catch (outerError: any) {
    console.error('Handler Critical Error:', safeErrorMessage(outerError));
    return res.status(500).json({ error: safeErrorMessage(outerError) || 'Internal Server Error' });
  }
}

function generateStrongPassword() {
  let base = '';
  while (base.length < 28) {
    base += randomBytes(24)
      .toString('base64')
      .replace(/[+/=]/g, '');
  }
  base = base.slice(0, 28);
  return `${base}A1!`;
}

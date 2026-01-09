import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Buffer } from 'node:buffer';
import pg from 'pg';

const { Client } = pg;

// Schema SQL embedded directly to avoid bundling/import issues
const schemaSql = `
-- Super Checkout - Definitive Fail-Proof Schema
-- Run this in the Supabase SQL Editor. It is idempotent (safe to run multiple times).

-- ==========================================
-- 1. EXTENSIONS & CONFIGURATION
-- ==========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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
  login_image_url TEXT,
  allow_free_signup BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    ALTER TABLE member_areas ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES domains(id);
    ALTER TABLE member_areas ADD COLUMN IF NOT EXISTS favicon_url TEXT;
    ALTER TABLE member_areas ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#E50914';
    ALTER TABLE member_areas ADD COLUMN IF NOT EXISTS banner_url TEXT;
    ALTER TABLE member_areas ADD COLUMN IF NOT EXISTS login_image_url TEXT;
    ALTER TABLE member_areas ADD COLUMN IF NOT EXISTS allow_free_signup BOOLEAN DEFAULT TRUE;
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
END $$;

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
  active BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true, 
  public_key TEXT,
  private_key TEXT,
  webhook_secret TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    ALTER TABLE gateways ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    ALTER TABLE gateways ADD COLUMN IF NOT EXISTS public_key TEXT;
    ALTER TABLE gateways ADD COLUMN IF NOT EXISTS private_key TEXT;
    ALTER TABLE gateways ADD COLUMN IF NOT EXISTS webhook_secret TEXT;
END $$;

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
  allowed_domain TEXT,
  plan TEXT DEFAULT 'lifetime',
  activated_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    ALTER TABLE licenses ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;
    ALTER TABLE licenses ADD COLUMN IF NOT EXISTS allowed_domain TEXT;
    ALTER TABLE licenses ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'lifetime';
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
  last_seen_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

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

-- 4.1. Admin Helper Function
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
BEGIN
  -- Check if this is the first user registered to make them admin
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first_user;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    CASE 
      WHEN is_first_user THEN 'admin' 
      ELSE COALESCE(NEW.raw_user_meta_data->>'role', 'member') 
    END
  )
  ON CONFLICT (id) DO NOTHING;
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
        VALUES (v_user_id, v_content_record.content_id, v_product_id, NOW(), 'active')
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

-- Orders
CREATE POLICY "Users can manage their own orders" ON orders FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Customers can view their own orders" ON orders FOR SELECT USING (auth.uid() = customer_user_id);
CREATE POLICY "Public can create orders" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can view orders" ON orders FOR SELECT USING (true);

-- Payments
CREATE POLICY "Users can manage their own payments" ON payments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Public can create payments" ON payments FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can view payments" ON payments FOR SELECT USING (true);

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
CREATE POLICY "Admins can manage member notes" ON public.member_notes FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can manage member tags" ON public.member_tags FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Logs
CREATE POLICY "Users can create their own logs" ON public.activity_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own logs" ON public.activity_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all logs" ON public.activity_logs FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Licenses
CREATE POLICY "Admin can manage licenses" ON licenses USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Admin can view validation logs" ON validation_logs FOR SELECT USING (auth.role() = 'authenticated');

-- ==========================================
-- 6. STORAGE BUCKETS (Idempotent)
-- ==========================================

INSERT INTO storage.buckets (id, name, public) VALUES ('member-areas', 'member-areas', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('contents', 'contents', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('checkouts', 'checkouts', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('products', 'products', true) ON CONFLICT (id) DO NOTHING;

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
DROP POLICY IF EXISTS "Authenticated Upload Products" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Update Products" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Delete Products" ON storage.objects;

-- Re-create Storage Policies
CREATE POLICY "Public Access Member Areas" ON storage.objects FOR SELECT USING (bucket_id = 'member-areas');
CREATE POLICY "Authenticated Upload Member Areas" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'member-areas' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated Update Member Areas" ON storage.objects FOR UPDATE USING (bucket_id = 'member-areas' AND auth.role() = 'authenticated');

CREATE POLICY "Public Access Contents" ON storage.objects FOR SELECT USING (bucket_id = 'contents');
CREATE POLICY "Authenticated Upload Contents" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'contents' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated Update Contents" ON storage.objects FOR UPDATE USING (bucket_id = 'contents' AND auth.role() = 'authenticated');

CREATE POLICY "Public Access Checkouts" ON storage.objects FOR SELECT USING (bucket_id = 'checkouts');
CREATE POLICY "Authenticated Upload Checkouts" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'checkouts' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated Update Checkouts" ON storage.objects FOR UPDATE USING (bucket_id = 'checkouts' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated Delete Checkouts" ON storage.objects FOR DELETE USING (bucket_id = 'checkouts' AND auth.role() = 'authenticated');

CREATE POLICY "Public Access Products" ON storage.objects FOR SELECT USING (bucket_id = 'products');
CREATE POLICY "Authenticated Upload Products" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'products' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated Update Products" ON storage.objects FOR UPDATE USING (bucket_id = 'products' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated Delete Products" ON storage.objects FOR DELETE USING (bucket_id = 'products' AND auth.role() = 'authenticated');
`;

export const config = {
  maxDuration: 60,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { action, code, licenseKey, projectRef, dbPass, organizationSlug, installationId } = req.body;

    // 0. Initialize Supabase (Admin Context)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase Environment Variables');
      return res.status(500).json({ error: 'Server configuration error: Missing Supabase keys' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Validate License (Via Central API - manage-licenses)
    if (!licenseKey) return res.status(400).json({ error: 'Missing license key' });
    if (!installationId) return res.status(400).json({ error: 'Missing installation ID' });

    // CENTRAL API CONFIG
    const CENTRAL_API_URL = 'https://bcmnryxjweiovrwmztpn.supabase.co/functions/v1';

    try {
      const validationRes = await fetch(`${CENTRAL_API_URL}/manage-licenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'validate_license',
          license_key: licenseKey,
          installation_id: installationId,
          current_domain: req.headers.host || 'unknown',
          activate: false // Just check validity
        })
      });

      if (!validationRes.ok) throw new Error('Failed to validate license with central server');

      const validationData = await validationRes.json();
      if (!validationData.valid) {
        return res.status(403).json({ error: validationData.message || 'Invalid or inactive license' });
      }
    } catch (e) {
      console.error('License Validation Error:', e);
      return res.status(403).json({ error: 'License validation failed: ' + e.message });
    }

    try {
      if (action === 'create_project') {
        if (!code) return res.status(400).json({ error: 'Missing OAuth code' });

        const clientId = process.env.SUPABASE_CLIENT_ID;
        const clientSecret = process.env.SUPABASE_CLIENT_SECRET;
        const redirectUri = `${req.headers.origin}/installer`;

        console.log('[DEBUG] OAuth Flow Started');
        console.log('[DEBUG] Client ID exists:', !!clientId);
        console.log('[DEBUG] Client Secret exists:', !!clientSecret);
        console.log('[DEBUG] Redirect URI:', redirectUri);
        console.log('[DEBUG] OAuth code length:', code?.length);

        if (!clientId || !clientSecret) {
          throw new Error('Missing Supabase OAuth credentials on server');
        }

        // 2. Exchange Code for Access Token
        console.log('[DEBUG] Attempting token exchange...');
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

        console.log('[DEBUG] Token exchange response status:', tokenRes.status);
        console.log('[DEBUG] Token exchange response status:', tokenRes.status);
        console.log('[DEBUG] Token exchange response headers:', Object.fromEntries([...(tokenRes.headers as any).entries()]));

        // Safe JSON parsing
        const contentType = tokenRes.headers.get('content-type');
        let tokenData: any;
        if (contentType && contentType.includes('application/json')) {
          tokenData = await tokenRes.json();
          console.log('[DEBUG] Token data received:', JSON.stringify(tokenData, null, 2));
        } else {
          const textError = await tokenRes.text();
          console.error('[ERROR] Non-JSON token response:', textError);
          throw new Error(`OAuth token exchange failed (${tokenRes.status}): ${textError.substring(0, 200)}`);
        }

        if (!tokenRes.ok) {
          console.error('[ERROR] Token exchange failed:', tokenData);
          throw new Error(tokenData.error_description || tokenData.error || 'Failed to exchange token');
        }

        const accessToken = tokenData.access_token;
        console.log('[DEBUG] Access token received:', !!accessToken);


        // 3. Determine Organization ID (Reliable Method)
        let organizationId = organizationSlug || tokenData.organization_id;

        console.log('[DEBUG] Manual organization slug:', organizationSlug);
        console.log('[DEBUG] Token data organization_id:', tokenData.organization_id);
        console.log('[DEBUG] Full token data keys:', Object.keys(tokenData));

        if (!organizationId) {
          console.log('[DEBUG] No organization_id in token or manual input, fetching organizations list...');
          const orgsRes = await fetch('https://api.supabase.com/v1/organizations', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });

          console.log('[DEBUG] Organizations API status:', orgsRes.status);
          console.log('[DEBUG] Organizations API headers:', Object.fromEntries([...(orgsRes.headers as any).entries()]));

          // Safe JSON parsing for orgs
          const orgsContentType = orgsRes.headers.get('content-type');
          let orgs: any;
          if (orgsContentType && orgsContentType.includes('application/json')) {
            orgs = await orgsRes.json();
            console.log('[DEBUG] Organizations response:', JSON.stringify(orgs, null, 2));
          } else {
            const textResponse = await orgsRes.text();
            console.warn('[ERROR] Failed to parse organizations JSON. Response:', textResponse);
            throw new Error(`API do Supabase retornou resposta inválida. Por favor, forneça o Organization Slug manualmente.`);
          }

          if (!orgsRes.ok) {
            throw new Error(`Falha ao buscar organizações: ${orgs.message || orgsRes.statusText}. Por favor, forneça o Organization Slug manualmente.`);
          }

          // Try to get ID or slug from first organization
          if (orgs && orgs.length > 0) {
            organizationId = orgs[0].id || orgs[0].slug;
            console.log('[DEBUG] Auto-selected first organization:', organizationId, 'Name:', orgs[0].name);
          } else {
            console.error('[ERROR] No organizations found. Response was:', orgs);
            throw new Error('Nenhuma organização encontrada. Por favor, forneça o Organization Slug manualmente. Você pode encontrá-lo em: https://supabase.com/dashboard/org/_/general');
          }
        } else {
          console.log('[DEBUG] Using organization:', organizationId);
        }

        // 3.5. If we have a slug, we need to get the actual organization ID
        // The Supabase API requires the numeric ID, not the slug
        if (organizationId && !organizationId.match(/^\d+$/)) {
          console.log('[DEBUG] Organization appears to be a slug, fetching actual ID...');
          const orgsRes = await fetch('https://api.supabase.com/v1/organizations', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });

          if (orgsRes.ok) {
            const orgs = await orgsRes.json();
            console.log('[DEBUG] Organizations list:', JSON.stringify(orgs, null, 2));

            // Find the organization by slug
            const org = orgs.find((o: any) => o.slug === organizationId);
            if (org && org.id) {
              console.log('[DEBUG] Found organization ID:', org.id, 'for slug:', organizationId);
              organizationId = org.id;
            } else {
              console.warn('[WARN] Could not find organization ID for slug:', organizationId);
              console.warn('[WARN] Available organizations:', orgs.map((o: any) => ({ id: o.id, slug: o.slug, name: o.name })));
            }
          } else {
            console.warn('[WARN] Failed to fetch organizations to convert slug to ID');
          }
        }

        console.log('[DEBUG] Final organization ID for project creation:', organizationId);


        // 4. Create Project
        const dbPass = generateStrongPassword();

        const projectPayload = {
          name: `Super Checkout ${Math.floor(Math.random() * 10000)}`,
          organization_id: organizationId,
          db_pass: dbPass,
          region: 'us-east-1',
          plan: 'free'
        };

        console.log('[DEBUG] Creating project with payload:', JSON.stringify(projectPayload, null, 2));

        const createRes = await fetch('https://api.supabase.com/v1/projects', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(projectPayload)
        });

        console.log('[DEBUG] Project creation response status:', createRes.status);
        console.log('[DEBUG] Project creation response headers:', Object.fromEntries([...(createRes.headers as any).entries()]));

        // Safe JSON parsing
        const createContentType = createRes.headers.get('content-type');
        let projectData: any;
        if (createContentType && createContentType.includes('application/json')) {
          projectData = await createRes.json();
          console.log('[DEBUG] Project creation response:', JSON.stringify(projectData, null, 2));
        } else {
          const textError = await createRes.text();
          console.error('[ERROR] Non-JSON project creation response:', textError);
          throw new Error(`Project creation failed (${createRes.status}): ${textError.substring(0, 200)}`);
        }

        if (!createRes.ok) {
          console.error('[ERROR] Project creation failed:', projectData);
          throw new Error(projectData.message || projectData.error || 'Failed to create project');
        }

        // SUCCESS - Return without fetching keys
        return res.status(200).json({
          success: true,
          projectRef: projectData.id,
          dbPass: dbPass,
          accessToken // Return token for migrations
        });
      }

      if (action === 'run_migrations') {
        if (!projectRef || !dbPass) {
          return res.status(400).json({ error: 'Missing projectRef or dbPass' });
        }
      }
    } catch (error: any) {
      console.error('Supabase API Critical Error:', error);
      return res.status(500).json({ error: error.message || 'Critical Server Error' });
    }
  } catch (outerError: any) {
    console.error('Handler Critical Error:', outerError);
    return res.status(500).json({ error: outerError.message || 'Internal Server Error' });
  }
}

function generateStrongPassword() {
  return Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8) + 'A1!';
}

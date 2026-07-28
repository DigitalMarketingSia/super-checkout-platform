-- v1.0.36 - Replace broad anonymous table reads with explicit public projections.
--
-- Public checkout and member-area pages still receive the data they need through
-- sanitized views. Direct table access remains available only to the owner,
-- authorised members, or server-side service_role code.

DO $$
BEGIN
  IF to_regclass('public.app_config') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Public read app_config" ON public.app_config;
    DROP POLICY IF EXISTS "Public can read installation id" ON public.app_config;
    CREATE POLICY "Public can read installation id"
      ON public.app_config
      FOR SELECT TO anon, authenticated
      USING (key = 'installation_id');
  END IF;

  IF to_regclass('public.order_items') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Public can view order items" ON public.order_items;
    DROP POLICY IF EXISTS "Public read order items" ON public.order_items;
  END IF;

  IF to_regclass('public.products') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Public can view products" ON public.products;
    DROP POLICY IF EXISTS "Public read products" ON public.products;
  END IF;

  IF to_regclass('public.domains') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Public read access for domains" ON public.domains;
    DROP POLICY IF EXISTS "Public can view active domains" ON public.domains;
  END IF;

  IF to_regclass('public.business_settings') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Public can read business settings" ON public.business_settings;
  END IF;

  IF to_regclass('public.member_areas') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Public can view member areas for access" ON public.member_areas;
  END IF;

  IF to_regclass('public.offers') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Public can view offers" ON public.offers;
  END IF;

  IF to_regclass('public.product_contents') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Public can view product contents" ON public.product_contents;
  END IF;
END $$;

-- A member who has an active grant may read the product they received, while an
-- anonymous visitor must use public.public_products below.
CREATE OR REPLACE FUNCTION public.can_access_granted_product(target_product_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.access_grants ag
    WHERE ag.user_id = auth.uid()
      AND ag.status = 'active'
      AND (
        ag.product_id = target_product_id
        OR EXISTS (
          SELECT 1
          FROM public.product_contents pc
          WHERE pc.product_id = target_product_id
            AND pc.content_id = ag.content_id
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_granted_product(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_granted_product(UUID) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regclass('public.products') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Members can view granted products" ON public.products;
    CREATE POLICY "Members can view granted products"
      ON public.products
      FOR SELECT TO authenticated
      USING (public.can_access_granted_product(id));
  END IF;
END $$;

DROP VIEW IF EXISTS public.public_products;
CREATE VIEW public.public_products AS
SELECT
  p.id,
  p.name,
  p.description,
  p.price,
  p.price_real,
  p.price_fake,
  p.sku,
  p.category,
  p.currency,
  p.image_url,
  p.active,
  p.redirect_link,
  p.is_order_bump,
  p.is_upsell,
  p.visible_in_member_area,
  p.for_sale,
  p.member_area_action,
  p.member_area_checkout_id,
  p.saas_plan_slug,
  p.member_area_id,
  p.created_at
FROM public.products p
WHERE COALESCE(p.active, true) = true;

DROP VIEW IF EXISTS public.public_business_settings;
CREATE VIEW public.public_business_settings AS
SELECT
  business_name,
  legal_name,
  legal_responsible_email,
  support_email,
  support_whatsapp,
  sender_name,
  sender_email,
  logo_url,
  primary_color,
  privacy_policy,
  privacy_policy_version,
  privacy_policy_published_at,
  terms_of_purchase,
  terms_of_purchase_version,
  terms_of_purchase_published_at,
  show_legal_footer,
  updated_at
FROM public.business_settings;

DROP VIEW IF EXISTS public.public_domains;
CREATE VIEW public.public_domains AS
SELECT
  id,
  domain,
  status,
  type,
  usage,
  verified_at,
  checkout_id
FROM public.domains;

DROP VIEW IF EXISTS public.public_member_areas;
CREATE VIEW public.public_member_areas AS
SELECT
  id,
  name,
  slug,
  domain_id,
  logo_url,
  favicon_url,
  primary_color,
  banner_url,
  banner_title,
  banner_description,
  banner_button_text,
  banner_button_link,
  login_image_url,
  allow_free_signup,
  layout_mode,
  card_style,
  sidebar_config,
  custom_links,
  faqs,
  created_at
FROM public.member_areas;

ALTER VIEW public.public_products SET (security_invoker = false);
ALTER VIEW public.public_business_settings SET (security_invoker = false);
ALTER VIEW public.public_domains SET (security_invoker = false);
ALTER VIEW public.public_member_areas SET (security_invoker = false);

REVOKE ALL ON public.public_products FROM PUBLIC;
REVOKE ALL ON public.public_business_settings FROM PUBLIC;
REVOKE ALL ON public.public_domains FROM PUBLIC;
REVOKE ALL ON public.public_member_areas FROM PUBLIC;

GRANT SELECT ON public.public_products TO anon, authenticated, service_role;
GRANT SELECT ON public.public_business_settings TO anon, authenticated, service_role;
GRANT SELECT ON public.public_domains TO anon, authenticated, service_role;
GRANT SELECT ON public.public_member_areas TO anon, authenticated, service_role;

COMMENT ON VIEW public.public_products IS
  'Sanitized product projection for public checkout. Delivery-file metadata and owner identifiers are intentionally absent.';
COMMENT ON VIEW public.public_business_settings IS
  'Public legal and support identity projection for the single-installation checkout.';
COMMENT ON VIEW public.public_domains IS
  'Public domain lookup projection. Owner identifiers are intentionally absent.';
COMMENT ON VIEW public.public_member_areas IS
  'Public member-area branding projection. Owner identifiers are intentionally absent.';

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
    VALUES ('1.0.36', 'Replace broad public reads with sanitized public data views', true, 0)
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
    VALUES ('1.0.36', timezone('utc'::text, now()));
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
    SET db_version = '1.0.36',
        updated_at = timezone('utc'::text, now()),
        last_update_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.36',
        updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  END IF;
END $$;

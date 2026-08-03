-- v1.0.43 - Enforce commercial product permissions server-side.
-- The editor remains a convenience layer; this migration makes the catalog
-- contract authoritative for authenticated writes to public.products.

CREATE OR REPLACE FUNCTION public.can_manage_product_catalog_type(p_product_type TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.role() = 'service_role'
    OR CASE LOWER(BTRIM(COALESCE(NULLIF(p_product_type, ''), 'regular')))
      WHEN 'system_upgrade' THEN public.is_platform_owner()
      WHEN 'installation_service' THEN
        EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE id = auth.uid()
            AND COALESCE(is_blocked, false) = false
            AND role IN ('master_admin', 'partner')
        )
        OR EXISTS (
          SELECT 1
          FROM public.accounts
          WHERE owner_user_id = auth.uid()
            AND LOWER(COALESCE(plan_type, '')) = 'saas'
            AND LOWER(COALESCE(status, 'active')) = 'active'
        )
      ELSE true
    END;
$$;

REVOKE ALL ON FUNCTION public.can_manage_product_catalog_type(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_product_catalog_type(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.normalize_product_catalog_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.product_type := LOWER(BTRIM(COALESCE(NEW.product_type, 'regular')));
  NEW.service_type := NULLIF(LOWER(BTRIM(COALESCE(NEW.service_type, ''))), '');
  NEW.saas_plan_slug := NULLIF(LOWER(BTRIM(COALESCE(NEW.saas_plan_slug, ''))), '');

  -- Preserve the compatibility contract for old clients that only send the
  -- legacy saas_plan_slug/service_type fields.
  IF NEW.product_type = 'regular' AND NEW.saas_plan_slug IS NOT NULL THEN
    NEW.product_type := 'system_upgrade';
  ELSIF NEW.product_type = 'regular' AND NEW.service_type IS NOT NULL THEN
    NEW.product_type := 'installation_service';
  END IF;

  IF NEW.product_type = 'system_upgrade' THEN
    IF NEW.saas_plan_slug IS NULL THEN
      RAISE EXCEPTION 'system_upgrade products require saas_plan_slug';
    END IF;
    NEW.service_type := NULL;
  ELSIF NEW.product_type = 'installation_service' THEN
    IF NEW.service_type IS NULL THEN
      RAISE EXCEPTION 'installation_service products require service_type';
    END IF;
    NEW.saas_plan_slug := NULL;
  ELSE
    NEW.product_type := 'regular';
    NEW.service_type := NULL;
    NEW.saas_plan_slug := NULL;
  END IF;

  IF NOT public.can_manage_product_catalog_type(NEW.product_type) THEN
    RAISE EXCEPTION 'product type % is not allowed for this account', NEW.product_type
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_service_type_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_service_type_check
  CHECK (service_type IS NULL OR service_type IN ('system_installation'));

DROP POLICY IF EXISTS "Users can manage their own products" ON public.products;
CREATE POLICY "Users can manage their own products"
  ON public.products
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND public.can_manage_product_catalog_type(product_type)
  );

DROP POLICY IF EXISTS "Users can create products" ON public.products;
CREATE POLICY "Users can create products"
  ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.can_manage_product_catalog_type(product_type)
  );

COMMENT ON FUNCTION public.can_manage_product_catalog_type(TEXT) IS
  'Authorizes regular products for authenticated owners, system upgrades only for the platform owner, and installation services for the platform owner or eligible partners.';

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
    VALUES ('1.0.43', 'Enforce commercial product catalog permissions', true, 0)
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
    VALUES ('1.0.43', timezone('utc'::text, now()));
    RETURN;
  END IF;

  UPDATE public.system_info
  SET db_version = '1.0.43',
      updated_at = timezone('utc'::text, now()),
      last_update_at = timezone('utc'::text, now())
  WHERE id = target_id;
END $$;

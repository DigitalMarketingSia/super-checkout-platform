-- v1.0.44 - Make system-upgrade delivery automatic by contract.
-- A system upgrade changes the beneficiary licence/entitlements after payment;
-- it must not retain ordinary product delivery metadata.

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

  -- Preserve the compatibility contract for clients that only send the
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
    NEW.member_area_action := 'none';
    NEW.member_area_checkout_id := NULL;
    NEW.member_area_id := NULL;
    NEW.redirect_link := NULL;
    NEW.delivery_file_path := NULL;
    NEW.delivery_file_name := NULL;
    NEW.delivery_file_mime_type := NULL;
    NEW.delivery_file_size_bytes := NULL;
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

DROP TRIGGER IF EXISTS normalize_product_catalog_metadata_trigger ON public.products;
CREATE TRIGGER normalize_product_catalog_metadata_trigger
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.normalize_product_catalog_metadata();

COMMENT ON FUNCTION public.normalize_product_catalog_metadata() IS
  'Normalizes product catalog metadata and forces system_upgrade products to use automatic entitlement delivery only.';

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
    VALUES ('1.0.44', 'Force automatic delivery for system upgrade products', true, 0)
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
    VALUES ('1.0.44', timezone('utc'::text, now()));
    RETURN;
  END IF;

  UPDATE public.system_info
  SET db_version = '1.0.44',
      updated_at = timezone('utc'::text, now()),
      last_update_at = timezone('utc'::text, now())
  WHERE id = target_id;
END $$;

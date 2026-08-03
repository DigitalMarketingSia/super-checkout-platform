-- v1.0.42 - Formalize commercial product type metadata.
-- Additive migration: legacy products remain regular unless their existing
-- saas_plan_slug identifies them as a system upgrade.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS service_type TEXT;

UPDATE public.products
SET saas_plan_slug = CASE LOWER(BTRIM(saas_plan_slug))
  WHEN 'unlimited' THEN 'upgrade_domains'
  WHEN 'partner' THEN 'saas'
  WHEN 'upgrade_partner' THEN 'saas'
  ELSE NULLIF(BTRIM(saas_plan_slug), '')
END
WHERE saas_plan_slug IS NOT NULL;

UPDATE public.products
SET product_type = CASE
  WHEN NULLIF(BTRIM(saas_plan_slug), '') IS NOT NULL THEN 'system_upgrade'
  WHEN NULLIF(BTRIM(service_type), '') IS NOT NULL THEN 'installation_service'
  ELSE 'regular'
END
WHERE product_type IS NULL
   OR NULLIF(BTRIM(product_type), '') IS NULL
   OR product_type = 'regular';

UPDATE public.products
SET product_type = LOWER(BTRIM(product_type))
WHERE product_type IS NOT NULL;

UPDATE public.products
SET service_type = NULLIF(LOWER(BTRIM(service_type)), '')
WHERE service_type IS NOT NULL;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_product_type_check,
  DROP CONSTRAINT IF EXISTS products_catalog_metadata_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_product_type_check
  CHECK (product_type IN ('regular', 'system_upgrade', 'installation_service'));

CREATE OR REPLACE FUNCTION public.normalize_product_catalog_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.product_type := LOWER(BTRIM(COALESCE(NEW.product_type, 'regular')));
  NEW.service_type := NULLIF(LOWER(BTRIM(COALESCE(NEW.service_type, ''))), '');
  NEW.saas_plan_slug := NULLIF(LOWER(BTRIM(COALESCE(NEW.saas_plan_slug, ''))), '');

  -- Preserve the old editor contract: a populated saas_plan_slug means an
  -- upgrade product even when an older client does not send product_type.
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_product_catalog_metadata_trigger ON public.products;
CREATE TRIGGER normalize_product_catalog_metadata_trigger
BEFORE INSERT OR UPDATE OF product_type, service_type, saas_plan_slug ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.normalize_product_catalog_metadata();

ALTER TABLE public.products
  ADD CONSTRAINT products_catalog_metadata_check
  CHECK (
    (product_type = 'regular' AND service_type IS NULL AND saas_plan_slug IS NULL)
    OR (product_type = 'system_upgrade' AND service_type IS NULL AND saas_plan_slug IS NOT NULL)
    OR (product_type = 'installation_service' AND service_type IS NOT NULL AND saas_plan_slug IS NULL)
  );

COMMENT ON COLUMN public.products.product_type IS
  'Commercial catalog type: regular, system_upgrade, or installation_service.';
COMMENT ON COLUMN public.products.service_type IS
  'Operational service subtype. Current canonical value: system_installation.';

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
    VALUES ('1.0.42', 'Formalize commercial product type metadata', true, 0)
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
    VALUES ('1.0.42', timezone('utc'::text, now()));
    RETURN;
  END IF;

  UPDATE public.system_info
  SET db_version = '1.0.42',
      updated_at = timezone('utc'::text, now()),
      last_update_at = timezone('utc'::text, now())
  WHERE id = target_id;
END $$;

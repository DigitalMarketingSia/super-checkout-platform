-- v1.0.14 - Allow private file delivery action on products.
-- Fixes legacy check constraints that reject member_area_action = 'file'.

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

INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
VALUES ('1.0.14', 'Allow private file delivery action on products', true, 0)
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
    SET db_version = '1.0.14', updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.14'
    WHERE id = target_id;
  END IF;
END $$;

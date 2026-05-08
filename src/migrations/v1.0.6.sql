-- v1.0.6 - Public gateway view runtime fix.
-- Recreates public_gateways as a safe public projection without security_invoker.
-- This lets anon read only public gateway fields through the view without
-- requiring direct SELECT grants on public.gateways private columns.

DROP VIEW IF EXISTS public.public_gateways;

CREATE VIEW public.public_gateways
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
    SET db_version = '1.0.6', updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.6'
    WHERE id = target_id;
  END IF;
END $$;

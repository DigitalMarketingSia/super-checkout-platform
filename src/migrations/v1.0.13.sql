-- v1.0.13 - Private product deliverables.
-- Adds file metadata to products and provisions the private storage bucket used by paid file deliveries.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS delivery_file_path TEXT;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS delivery_file_name TEXT;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS delivery_file_mime_type TEXT;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS delivery_file_size_bytes BIGINT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-deliverables', 'product-deliverables', false)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = EXCLUDED.public;

DROP POLICY IF EXISTS "Admin Read Product Deliverables" ON storage.objects;
DROP POLICY IF EXISTS "Admin Upload Product Deliverables" ON storage.objects;
DROP POLICY IF EXISTS "Admin Update Product Deliverables" ON storage.objects;
DROP POLICY IF EXISTS "Admin Delete Product Deliverables" ON storage.objects;

CREATE POLICY "Admin Read Product Deliverables"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'product-deliverables'
  AND EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'owner', 'master_admin')
  )
);

CREATE POLICY "Admin Upload Product Deliverables"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-deliverables'
  AND EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'owner', 'master_admin')
  )
);

CREATE POLICY "Admin Update Product Deliverables"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'product-deliverables'
  AND EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'owner', 'master_admin')
  )
);

CREATE POLICY "Admin Delete Product Deliverables"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-deliverables'
  AND EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'owner', 'master_admin')
  )
);

INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
VALUES ('1.0.13', 'Private product deliverables', true, 0)
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
    SET db_version = '1.0.13', updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.13'
    WHERE id = target_id;
  END IF;
END $$;

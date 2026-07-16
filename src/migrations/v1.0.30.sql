-- v1.0.30 - Harden public checkout inserts and scope public storage listing by ownership.

INSERT INTO storage.buckets (id, name, public)
VALUES ('activation-assets', 'activation-assets', true)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = EXCLUDED.public;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_insert_public_order(
  p_checkout_id UUID,
  p_user_id UUID,
  p_status TEXT,
  p_customer_user_id UUID,
  p_payment_id TEXT,
  p_total NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_checkout_id IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF COALESCE(NULLIF(BTRIM(p_status), ''), '') <> 'pending' THEN
    RETURN false;
  END IF;

  IF p_total IS NULL OR p_total < 0 THEN
    RETURN false;
  END IF;

  IF p_payment_id IS NOT NULL AND NULLIF(BTRIM(p_payment_id), '') IS NOT NULL THEN
    RETURN false;
  END IF;

  IF p_customer_user_id IS NOT NULL AND p_customer_user_id <> auth.uid() THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.checkouts c
    JOIN public.products p ON p.id = c.product_id
    WHERE c.id = p_checkout_id
      AND c.user_id = p_user_id
      AND p.user_id = p_user_id
      AND COALESCE(c.active, true) = true
      AND COALESCE(p.active, true) = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_insert_public_payment(
  p_order_id UUID,
  p_gateway_id UUID,
  p_user_id UUID,
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_order_id IS NULL OR p_gateway_id IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF COALESCE(NULLIF(BTRIM(p_status), ''), '') NOT IN ('pending', 'paid', 'failed', 'canceled', 'refunded') THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.gateways g ON g.id = p_gateway_id
    WHERE o.id = p_order_id
      AND o.user_id = p_user_id
      AND o.checkout_id IS NOT NULL
      AND g.user_id = p_user_id
      AND COALESCE(g.active, true) = true
      AND COALESCE(g.is_active, true) = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.storage_object_owned_by_authenticated_user(
  p_bucket_id TEXT,
  p_object_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public, storage
AS $$
DECLARE
  path_tokens TEXT[] := storage.foldername(p_object_name);
  first_folder TEXT := COALESCE(path_tokens[1], '');
  second_folder TEXT := COALESCE(path_tokens[2], '');
BEGIN
  IF auth.role() <> 'authenticated' OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF p_bucket_id = 'member-areas' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.member_areas ma
      WHERE ma.id::text = first_folder
        AND ma.owner_id = auth.uid()
    );
  END IF;

  IF p_bucket_id = 'checkouts' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.checkouts c
      WHERE c.id::text = first_folder
        AND c.user_id = auth.uid()
    );
  END IF;

  IF p_bucket_id = 'products' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.user_id = auth.uid()
        AND (
          p.id::text = first_folder
          OR (first_folder = 'products' AND p.id::text = second_folder)
        )
    );
  END IF;

  IF p_bucket_id = 'contents' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.contents c
      JOIN public.member_areas ma ON ma.id = c.member_area_id
      WHERE c.id::text = first_folder
        AND ma.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.modules m
      JOIN public.contents c ON c.id = m.content_id
      JOIN public.member_areas ma ON ma.id = c.member_area_id
      WHERE m.id::text = first_folder
        AND ma.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.lessons l
      JOIN public.modules m ON m.id = l.module_id
      JOIN public.contents c ON c.id = m.content_id
      JOIN public.member_areas ma ON ma.id = c.member_area_id
      WHERE l.id::text = first_folder
        AND ma.owner_id = auth.uid()
    );
  END IF;

  IF p_bucket_id = 'modules' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.modules m
      JOIN public.contents c ON c.id = m.content_id
      JOIN public.member_areas ma ON ma.id = c.member_area_id
      WHERE m.id::text = first_folder
        AND ma.owner_id = auth.uid()
    );
  END IF;

  IF p_bucket_id IN ('avatars', 'activation-assets') THEN
    RETURN first_folder = auth.uid()::text;
  END IF;

  RETURN false;
END;
$$;

DROP POLICY IF EXISTS "Public can create orders" ON public.orders;
DROP POLICY IF EXISTS "Public can view orders" ON public.orders;
CREATE POLICY "Public can create orders" ON public.orders FOR INSERT TO anon, authenticated
WITH CHECK (
  public.can_insert_public_order(
    checkout_id,
    user_id,
    status,
    customer_user_id,
    payment_id,
    total
  )
);

DROP POLICY IF EXISTS "Public can create payments" ON public.payments;
DROP POLICY IF EXISTS "Public can view payments" ON public.payments;
CREATE POLICY "Public can create payments" ON public.payments FOR INSERT TO anon, authenticated
WITH CHECK (
  public.can_insert_public_payment(
    order_id,
    gateway_id,
    user_id,
    status
  )
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'order_items'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "Public can create order items" ON public.order_items';

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'order_items'
        AND column_name = 'order_id'
    ) THEN
      EXECUTE $policy$
        CREATE POLICY "Public can create order items"
        ON public.order_items
        FOR INSERT
        TO anon, authenticated
        WITH CHECK (
          order_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.orders o
            WHERE o.id = order_items.order_id
          )
        )
      $policy$;
    ELSE
      EXECUTE $policy$
        CREATE POLICY "Public can create order items"
        ON public.order_items
        FOR INSERT
        TO anon, authenticated
        WITH CHECK (false)
      $policy$;
    END IF;
  END IF;
END $$;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        COALESCE(qual, '') ILIKE '%member-areas%'
        OR COALESCE(with_check, '') ILIKE '%member-areas%'
        OR COALESCE(qual, '') ILIKE '%contents%'
        OR COALESCE(with_check, '') ILIKE '%contents%'
        OR COALESCE(qual, '') ILIKE '%checkouts%'
        OR COALESCE(with_check, '') ILIKE '%checkouts%'
        OR COALESCE(qual, '') ILIKE '%products%'
        OR COALESCE(with_check, '') ILIKE '%products%'
        OR COALESCE(qual, '') ILIKE '%avatars%'
        OR COALESCE(with_check, '') ILIKE '%avatars%'
        OR COALESCE(qual, '') ILIKE '%modules%'
        OR COALESCE(with_check, '') ILIKE '%modules%'
        OR COALESCE(qual, '') ILIKE '%activation-assets%'
        OR COALESCE(with_check, '') ILIKE '%activation-assets%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Admin Read Product Deliverables" ON storage.objects;
DROP POLICY IF EXISTS "Admin Upload Product Deliverables" ON storage.objects;
DROP POLICY IF EXISTS "Admin Update Product Deliverables" ON storage.objects;
DROP POLICY IF EXISTS "Admin Delete Product Deliverables" ON storage.objects;

CREATE POLICY "Scoped Read Member Areas Storage" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'member-areas' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));
CREATE POLICY "Scoped Insert Member Areas Storage" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'member-areas' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));
CREATE POLICY "Scoped Update Member Areas Storage" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'member-areas' AND public.storage_object_owned_by_authenticated_user(bucket_id, name))
WITH CHECK (bucket_id = 'member-areas' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));
CREATE POLICY "Scoped Delete Member Areas Storage" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'member-areas' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));

CREATE POLICY "Scoped Read Contents Storage" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'contents' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));
CREATE POLICY "Scoped Insert Contents Storage" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'contents' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));
CREATE POLICY "Scoped Update Contents Storage" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'contents' AND public.storage_object_owned_by_authenticated_user(bucket_id, name))
WITH CHECK (bucket_id = 'contents' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));
CREATE POLICY "Scoped Delete Contents Storage" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'contents' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));

CREATE POLICY "Scoped Read Checkouts Storage" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'checkouts' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));
CREATE POLICY "Scoped Insert Checkouts Storage" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'checkouts' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));
CREATE POLICY "Scoped Update Checkouts Storage" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'checkouts' AND public.storage_object_owned_by_authenticated_user(bucket_id, name))
WITH CHECK (bucket_id = 'checkouts' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));
CREATE POLICY "Scoped Delete Checkouts Storage" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'checkouts' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));

CREATE POLICY "Scoped Read Products Storage" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'products' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));
CREATE POLICY "Scoped Insert Products Storage" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'products' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));
CREATE POLICY "Scoped Update Products Storage" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'products' AND public.storage_object_owned_by_authenticated_user(bucket_id, name))
WITH CHECK (bucket_id = 'products' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));
CREATE POLICY "Scoped Delete Products Storage" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'products' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));

CREATE POLICY "Admin Read Product Deliverables" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'product-deliverables'
  AND EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'owner', 'master_admin')
  )
);
CREATE POLICY "Admin Upload Product Deliverables" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-deliverables'
  AND EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'owner', 'master_admin')
  )
);
CREATE POLICY "Admin Update Product Deliverables" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-deliverables'
  AND EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'owner', 'master_admin')
  )
)
WITH CHECK (
  bucket_id = 'product-deliverables'
  AND EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'owner', 'master_admin')
  )
);
CREATE POLICY "Admin Delete Product Deliverables" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'product-deliverables'
  AND EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'owner', 'master_admin')
  )
);

CREATE POLICY "Scoped Read Avatars Storage" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatars' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));
CREATE POLICY "Scoped Insert Avatars Storage" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));
CREATE POLICY "Scoped Update Avatars Storage" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND public.storage_object_owned_by_authenticated_user(bucket_id, name))
WITH CHECK (bucket_id = 'avatars' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));
CREATE POLICY "Scoped Delete Avatars Storage" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));

CREATE POLICY "Scoped Read Modules Storage" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'modules' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));
CREATE POLICY "Scoped Insert Modules Storage" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'modules' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));
CREATE POLICY "Scoped Update Modules Storage" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'modules' AND public.storage_object_owned_by_authenticated_user(bucket_id, name))
WITH CHECK (bucket_id = 'modules' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));
CREATE POLICY "Scoped Delete Modules Storage" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'modules' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));

CREATE POLICY "Scoped Read Activation Assets Storage" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'activation-assets' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));
CREATE POLICY "Scoped Insert Activation Assets Storage" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'activation-assets' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));
CREATE POLICY "Scoped Update Activation Assets Storage" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'activation-assets' AND public.storage_object_owned_by_authenticated_user(bucket_id, name))
WITH CHECK (bucket_id = 'activation-assets' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));
CREATE POLICY "Scoped Delete Activation Assets Storage" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'activation-assets' AND public.storage_object_owned_by_authenticated_user(bucket_id, name));

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'schema_migrations'
  ) THEN
    INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
    VALUES ('1.0.30', 'Harden public checkout inserts and scope public storage listing by ownership', true, 0)
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
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'system_info'
  ) THEN
    RETURN;
  END IF;

  SELECT id INTO target_id FROM public.system_info LIMIT 1;

  IF target_id IS NULL THEN
    INSERT INTO public.system_info(db_version, updated_at)
    VALUES ('1.0.30', timezone('utc'::text, now()));
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
    SET db_version = '1.0.30',
        updated_at = timezone('utc'::text, now()),
        last_update_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.30',
        updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  END IF;
END $$;

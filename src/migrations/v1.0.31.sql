-- v1.0.31 - Harden member area member RPCs with explicit owner/admin access guard.

CREATE OR REPLACE FUNCTION public.can_access_member_area_member_data(p_area_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  IF auth.uid() IS NULL OR p_area_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.member_areas ma
    WHERE ma.id = p_area_id
      AND (
        ma.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('admin', 'owner', 'master_admin')
        )
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_member_area_member_data(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_member_area_member_data(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.get_member_area_members(area_id UUID)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  name TEXT,
  joined_at TIMESTAMPTZ,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.can_access_member_area_member_data(area_id) THEN
    RAISE EXCEPTION 'Access denied to member area members'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    u.id AS user_id,
    u.email::TEXT,
    COALESCE((u.raw_user_meta_data ->> 'name')::TEXT, 'Sem nome') AS name,
    MIN(ag.granted_at) AS joined_at,
    ag.status::TEXT
  FROM public.access_grants ag
  JOIN auth.users u ON ag.user_id = u.id
  JOIN public.contents c ON ag.content_id = c.id
  WHERE c.member_area_id = area_id
  GROUP BY u.id, u.email, u.raw_user_meta_data, ag.status;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_area_members_enriched(
  p_area_id UUID,
  p_page INTEGER DEFAULT 1,
  p_limit INTEGER DEFAULT 20,
  p_search TEXT DEFAULT '',
  p_status_filter TEXT DEFAULT '',
  p_type_filter TEXT DEFAULT 'all'
)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  name TEXT,
  status TEXT,
  joined_at TIMESTAMPTZ,
  orders_count BIGINT,
  active_products_count BIGINT,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_offset INTEGER := (p_page - 1) * p_limit;
BEGIN
  IF NOT public.can_access_member_area_member_data(p_area_id) THEN
    RAISE EXCEPTION 'Access denied to member area member analytics'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH target_users AS (
    SELECT DISTINCT ag.user_id
    FROM public.access_grants ag
    LEFT JOIN public.contents c_direct ON ag.content_id = c_direct.id
    LEFT JOIN public.product_contents pc ON ag.product_id = pc.product_id
    LEFT JOIN public.contents c_via_prod ON pc.content_id = c_via_prod.id
    WHERE ag.status = 'active'
      AND (
        c_direct.member_area_id = p_area_id
        OR c_via_prod.member_area_id = p_area_id
      )
  ),
  filtered_base AS (
    SELECT
      p.id AS pid,
      p.email AS p_email,
      COALESCE(
        p.full_name,
        (u.raw_user_meta_data ->> 'name'),
        (u.raw_user_meta_data ->> 'full_name'),
        'Sem nome'
      ) AS p_name,
      p.status AS p_status,
      COALESCE(p.created_at, NOW()) AS p_joined_at,
      (
        SELECT COUNT(*)
        FROM public.orders o
        WHERE o.customer_user_id = p.id
      ) AS o_count,
      (
        SELECT COUNT(DISTINCT ag_count.id)
        FROM public.access_grants ag_count
        LEFT JOIN public.contents c_d ON ag_count.content_id = c_d.id
        LEFT JOIN public.product_contents pc_c ON ag_count.product_id = pc_c.product_id
        LEFT JOIN public.contents c_vp ON pc_c.content_id = c_vp.id
        WHERE ag_count.user_id = p.id
          AND ag_count.status = 'active'
          AND (
            c_d.member_area_id = p_area_id
            OR c_vp.member_area_id = p_area_id
          )
      ) AS ap_count
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    JOIN target_users tu ON tu.user_id = p.id
    WHERE
      (
        p_search = ''
        OR p.email ILIKE '%' || p_search || '%'
        OR COALESCE(p.full_name, u.raw_user_meta_data ->> 'name', 'Sem nome') ILIKE '%' || p_search || '%'
      )
      AND (p_status_filter = '' OR p.status = p_status_filter)
  ),
  final_filtered AS (
    SELECT *
    FROM filtered_base
    WHERE
      p_type_filter = 'all'
      OR (p_type_filter = 'paid' AND o_count > 0)
      OR (p_type_filter = 'free' AND o_count = 0)
  ),
  total_c AS (
    SELECT COUNT(*) AS t_count
    FROM final_filtered
  )
  SELECT
    pid,
    p_email,
    p_name,
    p_status,
    p_joined_at,
    o_count,
    ap_count,
    (SELECT t_count FROM total_c)
  FROM final_filtered
  ORDER BY p_joined_at DESC
  LIMIT p_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_member_area_members(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_area_members(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_area_members_enriched(UUID, INTEGER, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_area_members_enriched(UUID, INTEGER, INTEGER, TEXT, TEXT, TEXT) TO authenticated, service_role;

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
    VALUES ('1.0.31', 'Harden member area RPC access with owner/admin gate', true, 0)
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
    VALUES ('1.0.31', timezone('utc'::text, now()));
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
    SET db_version = '1.0.31',
        updated_at = timezone('utc'::text, now()),
        last_update_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.31',
        updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  END IF;
END $$;

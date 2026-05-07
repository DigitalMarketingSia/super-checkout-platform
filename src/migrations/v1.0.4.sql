-- v1.0.4 - Profile full_name repair and resilient auth trigger.
-- Ensures buyers and members created with user_metadata.name/customer_name are
-- persisted into public.profiles.full_name, and repairs existing null/generic rows.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  is_first_user BOOLEAN;
  v_full_name TEXT;
  v_role TEXT;
  v_central_id UUID;
  v_account_id UUID;
BEGIN
  SELECT NOT EXISTS(SELECT 1 FROM public.profiles) INTO is_first_user;

  v_full_name := NULLIF(BTRIM(COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    NEW.raw_user_meta_data ->> 'customer_name',
    NEW.raw_user_meta_data ->> 'display_name'
  )), '');

  v_central_id := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data ->> 'central_user_id', '')), '')::UUID;
  v_role := CASE
    WHEN is_first_user THEN 'admin'
    ELSE COALESCE(NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'role'), ''), 'member')
  END;

  INSERT INTO public.profiles(id, email, full_name, role, installation_id, central_user_id)
  VALUES(
    NEW.id,
    NEW.email,
    v_full_name,
    v_role,
    NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data ->> 'installation_id', '')), ''),
    v_central_id
  )
  ON CONFLICT(id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    full_name = COALESCE(NULLIF(BTRIM(public.profiles.full_name), ''), EXCLUDED.full_name),
    installation_id = COALESCE(EXCLUDED.installation_id, public.profiles.installation_id),
    central_user_id = COALESCE(EXCLUDED.central_user_id, public.profiles.central_user_id);

  IF v_role IN ('admin', 'owner') THEN
    INSERT INTO public.accounts(owner_user_id, plan_type, status, trust_score)
    VALUES(NEW.id, 'free', 'active', 50)
    ON CONFLICT(owner_user_id) DO UPDATE SET updated_at = timezone('utc'::text, now())
    RETURNING id INTO v_account_id;

    IF v_account_id IS NULL THEN
      SELECT id INTO v_account_id FROM public.accounts WHERE owner_user_id = NEW.id LIMIT 1;
    END IF;

    IF v_account_id IS NOT NULL THEN
      INSERT INTO public.business_settings(account_id, support_email, sender_email, sender_name)
      VALUES(v_account_id, NEW.email, NEW.email, COALESCE(v_full_name, NEW.email))
      ON CONFLICT(account_id) DO NOTHING;
    END IF;
  END IF;

  INSERT INTO public.integrations (user_id, name, provider, active, config)
  VALUES (NEW.id, 'resend', 'resend', false, '{}'::jsonb)
  ON CONFLICT (user_id, name) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

WITH order_names AS (
  SELECT
    LOWER(customer_email) AS email,
    (ARRAY_AGG(NULLIF(BTRIM(customer_name), '') ORDER BY created_at DESC))[1] AS customer_name
  FROM public.orders
  WHERE NULLIF(BTRIM(customer_email), '') IS NOT NULL
    AND NULLIF(BTRIM(customer_name), '') IS NOT NULL
  GROUP BY LOWER(customer_email)
),
auth_names AS (
  SELECT
    id,
    NULLIF(BTRIM(COALESCE(
      raw_user_meta_data ->> 'full_name',
      raw_user_meta_data ->> 'name',
      raw_user_meta_data ->> 'customer_name',
      raw_user_meta_data ->> 'display_name'
    )), '') AS metadata_name
  FROM auth.users
),
resolved_names AS (
  SELECT
    p.id,
    COALESCE(
      NULLIF(BTRIM(o.customer_name), ''),
      NULLIF(BTRIM(a.metadata_name), '')
    ) AS resolved_name
  FROM public.profiles p
  LEFT JOIN order_names o ON LOWER(p.email) = o.email
  LEFT JOIN auth_names a ON p.id = a.id
)
UPDATE public.profiles p
SET full_name = r.resolved_name
FROM resolved_names r
WHERE p.id = r.id
  AND NULLIF(BTRIM(r.resolved_name), '') IS NOT NULL
  AND (
    NULLIF(BTRIM(p.full_name), '') IS NULL
    OR LOWER(BTRIM(p.full_name)) IN ('usuario', 'user', 'cliente', 'client')
  );

UPDATE auth.users u
SET raw_user_meta_data = COALESCE(u.raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('full_name', p.full_name, 'name', p.full_name)
FROM public.profiles p
WHERE p.id = u.id
  AND NULLIF(BTRIM(p.full_name), '') IS NOT NULL
  AND (
    NULLIF(BTRIM(COALESCE(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')), '') IS NULL
    OR LOWER(BTRIM(COALESCE(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'))) IN ('usuario', 'user', 'cliente', 'client')
  );

UPDATE public.system_info
SET db_version = '1.0.4', updated_at = timezone('utc'::text, now())
WHERE id = (SELECT id FROM public.system_info ORDER BY created_at ASC LIMIT 1);

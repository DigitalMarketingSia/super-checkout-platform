-- v1.0.24 - One-time member login tickets.

CREATE TABLE IF NOT EXISTS public.member_login_tickets(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  member_area_id UUID REFERENCES public.member_areas(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  consumed_at TIMESTAMP WITH TIME ZONE,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_failed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_member_login_tickets_expires_at ON public.member_login_tickets(expires_at);
CREATE INDEX IF NOT EXISTS idx_member_login_tickets_email ON public.member_login_tickets(email);
CREATE INDEX IF NOT EXISTS idx_member_login_tickets_order_id ON public.member_login_tickets(order_id);

ALTER TABLE public.member_login_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_login_tickets FROM anon, authenticated;
GRANT ALL ON public.member_login_tickets TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'schema_migrations'
  ) THEN
    INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
    VALUES ('1.0.24', 'Add one-time member login tickets', true, 0)
    ON CONFLICT (version) DO UPDATE SET
      description = EXCLUDED.description,
      success = true,
      execution_time_ms = 0,
      executed_at = timezone('utc'::text, now());
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
    INSERT INTO public.system_info(db_version)
    VALUES ('1.0.24');
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'system_info'
      AND column_name = 'updated_at'
  ) THEN
    UPDATE public.system_info
    SET db_version = '1.0.24', updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.24'
    WHERE id = target_id;
  END IF;
END $$;

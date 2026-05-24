-- v1.0.15 - Customer payment profile foundation for gateway-aware upsell.
-- Defines the canonical tokenized payment profile entity without enabling one-click charging yet.

CREATE TABLE IF NOT EXISTS public.customer_payment_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  gateway_id UUID REFERENCES public.gateways(id) NOT NULL,
  gateway_name TEXT NOT NULL CHECK (gateway_name IN ('mercado_pago', 'stripe', 'pix')),
  customer_user_id UUID REFERENCES auth.users(id),
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  payment_method_type TEXT NOT NULL CHECK (payment_method_type IN ('credit_card', 'pix', 'boleto', 'apple_pay', 'google_pay')),
  gateway_customer_id TEXT NOT NULL DEFAULT '',
  gateway_payment_method_id TEXT NOT NULL DEFAULT '',
  card_brand TEXT,
  card_last4 TEXT NOT NULL DEFAULT '',
  card_exp_month INTEGER,
  card_exp_year INTEGER,
  wallet_type TEXT CHECK (wallet_type IS NULL OR wallet_type IN ('apple_pay', 'google_pay')),
  issuer_id TEXT,
  reusable BOOLEAN NOT NULL DEFAULT false,
  requires_reauthentication BOOLEAN NOT NULL DEFAULT true,
  consent_scope TEXT NOT NULL DEFAULT 'post_purchase_upsell',
  consent_captured_at TIMESTAMP WITH TIME ZONE,
  first_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  last_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$
BEGIN
  ALTER TABLE public.customer_payment_profiles
    ADD COLUMN IF NOT EXISTS gateway_name TEXT;
  ALTER TABLE public.customer_payment_profiles
    ADD COLUMN IF NOT EXISTS customer_user_id UUID REFERENCES auth.users(id);
  ALTER TABLE public.customer_payment_profiles
    ADD COLUMN IF NOT EXISTS customer_email TEXT;
  ALTER TABLE public.customer_payment_profiles
    ADD COLUMN IF NOT EXISTS customer_name TEXT;
  ALTER TABLE public.customer_payment_profiles
    ADD COLUMN IF NOT EXISTS payment_method_type TEXT;
  ALTER TABLE public.customer_payment_profiles
    ADD COLUMN IF NOT EXISTS gateway_customer_id TEXT DEFAULT '';
  ALTER TABLE public.customer_payment_profiles
    ADD COLUMN IF NOT EXISTS gateway_payment_method_id TEXT DEFAULT '';
  ALTER TABLE public.customer_payment_profiles
    ADD COLUMN IF NOT EXISTS card_brand TEXT;
  ALTER TABLE public.customer_payment_profiles
    ADD COLUMN IF NOT EXISTS card_last4 TEXT DEFAULT '';
  ALTER TABLE public.customer_payment_profiles
    ADD COLUMN IF NOT EXISTS card_exp_month INTEGER;
  ALTER TABLE public.customer_payment_profiles
    ADD COLUMN IF NOT EXISTS card_exp_year INTEGER;
  ALTER TABLE public.customer_payment_profiles
    ADD COLUMN IF NOT EXISTS wallet_type TEXT;
  ALTER TABLE public.customer_payment_profiles
    ADD COLUMN IF NOT EXISTS issuer_id TEXT;
  ALTER TABLE public.customer_payment_profiles
    ADD COLUMN IF NOT EXISTS reusable BOOLEAN DEFAULT false;
  ALTER TABLE public.customer_payment_profiles
    ADD COLUMN IF NOT EXISTS requires_reauthentication BOOLEAN DEFAULT true;
  ALTER TABLE public.customer_payment_profiles
    ADD COLUMN IF NOT EXISTS consent_scope TEXT DEFAULT 'post_purchase_upsell';
  ALTER TABLE public.customer_payment_profiles
    ADD COLUMN IF NOT EXISTS consent_captured_at TIMESTAMP WITH TIME ZONE;
  ALTER TABLE public.customer_payment_profiles
    ADD COLUMN IF NOT EXISTS first_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;
  ALTER TABLE public.customer_payment_profiles
    ADD COLUMN IF NOT EXISTS last_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;
  ALTER TABLE public.customer_payment_profiles
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
  ALTER TABLE public.customer_payment_profiles
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
  ALTER TABLE public.customer_payment_profiles
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
  ALTER TABLE public.customer_payment_profiles
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
END $$;

UPDATE public.customer_payment_profiles
SET gateway_customer_id = COALESCE(gateway_customer_id, ''),
    gateway_payment_method_id = COALESCE(gateway_payment_method_id, ''),
    card_last4 = COALESCE(card_last4, ''),
    customer_email = COALESCE(customer_email, ''),
    consent_scope = COALESCE(NULLIF(consent_scope, ''), 'post_purchase_upsell'),
    metadata = COALESCE(metadata, '{}'::jsonb),
    reusable = COALESCE(reusable, false),
    requires_reauthentication = COALESCE(requires_reauthentication, true),
    last_seen_at = COALESCE(last_seen_at, timezone('utc'::text, now())),
    created_at = COALESCE(created_at, timezone('utc'::text, now())),
    updated_at = COALESCE(updated_at, timezone('utc'::text, now()))
WHERE gateway_customer_id IS NULL
   OR gateway_payment_method_id IS NULL
   OR card_last4 IS NULL
   OR customer_email IS NULL
   OR consent_scope IS NULL
   OR metadata IS NULL
   OR reusable IS NULL
   OR requires_reauthentication IS NULL
   OR last_seen_at IS NULL
   OR created_at IS NULL
   OR updated_at IS NULL;

ALTER TABLE public.customer_payment_profiles
  ALTER COLUMN gateway_customer_id SET NOT NULL;
ALTER TABLE public.customer_payment_profiles
  ALTER COLUMN gateway_payment_method_id SET NOT NULL;
ALTER TABLE public.customer_payment_profiles
  ALTER COLUMN card_last4 SET NOT NULL;
ALTER TABLE public.customer_payment_profiles
  ALTER COLUMN customer_email SET NOT NULL;
ALTER TABLE public.customer_payment_profiles
  ALTER COLUMN payment_method_type SET NOT NULL;
ALTER TABLE public.customer_payment_profiles
  ALTER COLUMN gateway_name SET NOT NULL;
ALTER TABLE public.customer_payment_profiles
  ALTER COLUMN reusable SET NOT NULL;
ALTER TABLE public.customer_payment_profiles
  ALTER COLUMN requires_reauthentication SET NOT NULL;
ALTER TABLE public.customer_payment_profiles
  ALTER COLUMN consent_scope SET NOT NULL;
ALTER TABLE public.customer_payment_profiles
  ALTER COLUMN metadata SET NOT NULL;
ALTER TABLE public.customer_payment_profiles
  ALTER COLUMN last_seen_at SET NOT NULL;
ALTER TABLE public.customer_payment_profiles
  ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.customer_payment_profiles
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.customer_payment_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own customer payment profiles" ON public.customer_payment_profiles;
DROP POLICY IF EXISTS "Admins can view all customer payment profiles" ON public.customer_payment_profiles;

CREATE POLICY "Users can manage their own customer payment profiles"
ON public.customer_payment_profiles
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all customer payment profiles"
ON public.customer_payment_profiles
FOR SELECT
USING (public.is_admin());

CREATE UNIQUE INDEX IF NOT EXISTS customer_payment_profiles_unique_method
ON public.customer_payment_profiles (
  user_id,
  gateway_id,
  customer_email,
  gateway_customer_id,
  gateway_payment_method_id,
  payment_method_type,
  card_last4
);

DROP TRIGGER IF EXISTS update_customer_payment_profiles_updated_at ON public.customer_payment_profiles;
CREATE TRIGGER update_customer_payment_profiles_updated_at
  BEFORE UPDATE ON public.customer_payment_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

INSERT INTO public.schema_migrations(version, description, success, execution_time_ms)
VALUES ('1.0.15', 'Customer payment profile foundation for gateway-aware upsell', true, 0)
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
    SET db_version = '1.0.15', updated_at = timezone('utc'::text, now())
    WHERE id = target_id;
  ELSE
    UPDATE public.system_info
    SET db_version = '1.0.15'
    WHERE id = target_id;
  END IF;
END $$;

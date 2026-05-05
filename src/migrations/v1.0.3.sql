-- v1.0.3 - Public checkout gateway view hardening.
-- Recreate public_gateways as a safe public projection so public checkouts can
-- read active gateway public keys without exposing private credentials.

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

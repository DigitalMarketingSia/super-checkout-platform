const LIGHT_PUBLIC_ROUTE_PREFIXES = ['/c/', '/pagamento/', '/upsell/', '/thank-you/'];
const LIGHT_PUBLIC_EXACT_ROUTES = new Set(['/privacy-policy', '/terms-of-purchase']);

export const isLightPublicRoute = (pathname?: string | null): boolean => {
  const normalizedPath = String(pathname || '').split('?')[0];

  if (!normalizedPath) {
    return false;
  }

  return (
    LIGHT_PUBLIC_EXACT_ROUTES.has(normalizedPath) ||
    LIGHT_PUBLIC_ROUTE_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))
  );
};

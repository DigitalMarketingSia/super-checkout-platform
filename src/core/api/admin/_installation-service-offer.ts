import type { VercelRequest } from '@vercel/node';
import {
  buildCentralInstallationTrustHeaders,
  getCentralInstallationTrustConfig,
} from '../_central-installation-trust.js';

const INSTALLATION_SERVICE_PRODUCT_TYPE = 'installation_service';
const PORTAL_OFFER_CONFIG_KEY = 'portal_installation_service_product_id';
const OFFICIAL_CENTRAL_API_URL = 'https://bcmnryxjweiovrwmztpn.supabase.co/functions/v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type InstallationServiceOfferSyncResult = {
  synced: boolean;
  active: boolean;
  message?: string;
};

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function parseConfigValue(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === 'string' && parsed.trim() ? parsed.trim() : null;
  } catch {
    return trimmed.replace(/^"|"$/g, '') || null;
  }
}

function resolveCentralApiUrl() {
  return String(
    process.env.CENTRAL_API_URL
    || process.env.VITE_CENTRAL_API_URL
    || process.env.NEXT_PUBLIC_CENTRAL_API_URL
    || OFFICIAL_CENTRAL_API_URL,
  ).replace(/\/+$/, '');
}

function resolveApplicationUrl(req: VercelRequest) {
  const configured = String(
    process.env.APP_URL
    || process.env.NEXT_PUBLIC_APP_URL
    || process.env.VITE_APP_URL
    || process.env.VITE_SUPER_CHECKOUT_APP_URL
    || '',
  ).trim().replace(/\/+$/, '');
  if (configured) return configured;

  const host = String(req.headers.host || '').trim();
  if (!host) return '';
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const protocol = forwardedProto === 'http' ? 'http' : 'https';
  return `${protocol}://${host}`;
}

function resolveCheckoutUrl(product: any, req: VercelRequest) {
  const rawCheckouts = Array.isArray(product?.checkouts)
    ? product.checkouts
    : (product?.checkouts ? [product.checkouts] : []);
  const checkout = rawCheckouts.find((item: any) => item?.active !== false && cleanText(item?.custom_url_slug, 180)) || null;
  if (!checkout) return null;

  const slug = cleanText(checkout.custom_url_slug, 180);
  const domain = cleanText(
    Array.isArray(checkout.domains) ? checkout.domains[0]?.domain : checkout.domains?.domain,
    253,
  ).toLowerCase();
  if (domain) return `https://${domain}/${encodeURIComponent(slug)}`;

  const appUrl = resolveApplicationUrl(req);
  return appUrl ? `${appUrl}/c/${encodeURIComponent(slug)}` : null;
}

async function loadConfiguredOfferProduct(supabaseAdmin: any, userId: string) {
  const { data: config, error: configError } = await supabaseAdmin
    .from('app_config')
    .select('value')
    .eq('key', PORTAL_OFFER_CONFIG_KEY)
    .maybeSingle();
  if (configError) throw configError;

  const productId = parseConfigValue(config?.value);
  if (!productId || !UUID_PATTERN.test(productId)) {
    return { product: null, configuredProductId: null };
  }

  const { data: product, error: productError } = await supabaseAdmin
    .from('products')
    .select(`
      id,
      user_id,
      name,
      description,
      image_url,
      price,
      price_real,
      currency,
      active,
      for_sale,
      product_type,
      service_type,
      checkouts:checkouts!product_id(id, custom_url_slug, active, domain_id, domains:domain_id(domain))
    `)
    .eq('id', productId)
    .eq('user_id', userId)
    .maybeSingle();
  if (productError) throw productError;

  const isServiceProduct = product?.product_type === INSTALLATION_SERVICE_PRODUCT_TYPE
    && String(product?.service_type || '').toLowerCase() === 'system_installation';
  if (isServiceProduct) return { product, configuredProductId: productId };

  const { error: clearError } = await supabaseAdmin
    .from('app_config')
    .delete()
    .eq('key', PORTAL_OFFER_CONFIG_KEY);
  if (clearError) throw clearError;
  return { product: null, configuredProductId: null };
}

async function ensureOfferProductSelection(params: {
  supabaseAdmin: any;
  userId: string;
  productId?: string | null;
}) {
  const { supabaseAdmin, userId } = params;
  const requestedProductId = cleanText(params.productId, 64);

  const { data: config, error: configError } = await supabaseAdmin
    .from('app_config')
    .select('value')
    .eq('key', PORTAL_OFFER_CONFIG_KEY)
    .maybeSingle();
  if (configError) throw configError;

  // The first publishable installation-service product becomes the offer for
  // the partner's leads. Later products never replace it implicitly.
  if (parseConfigValue(config?.value)) return;

  let candidateQuery = supabaseAdmin
    .from('products')
    .select('id, user_id, product_type, service_type, active, for_sale')
    .eq('user_id', userId)
    .eq('product_type', INSTALLATION_SERVICE_PRODUCT_TYPE)
    .eq('service_type', 'system_installation')
    .eq('active', true)
    .eq('for_sale', true)
    .order('created_at', { ascending: true })
    .limit(1);
  if (UUID_PATTERN.test(requestedProductId)) {
    candidateQuery = supabaseAdmin
      .from('products')
      .select('id, user_id, product_type, service_type, active, for_sale')
      .eq('id', requestedProductId)
      .eq('user_id', userId)
      .limit(1);
  }
  const { data: candidates, error: candidateError } = await candidateQuery;
  if (candidateError) throw candidateError;
  const candidate = Array.isArray(candidates) ? candidates[0] : candidates;
  if (
    candidate?.product_type !== INSTALLATION_SERVICE_PRODUCT_TYPE
    || String(candidate.service_type || '').toLowerCase() !== 'system_installation'
    || candidate.active === false
    || candidate.for_sale === false
  ) return;

  const { error: saveError } = await supabaseAdmin
    .from('app_config')
    .upsert({ key: PORTAL_OFFER_CONFIG_KEY, value: JSON.stringify(candidate.id) }, { onConflict: 'key' });
  if (saveError) throw saveError;
}

export async function syncInstallationServiceOffer(params: {
  req: VercelRequest;
  supabaseAdmin: any;
  userId: string;
  selectProductId?: string | null;
}): Promise<InstallationServiceOfferSyncResult> {
  await ensureOfferProductSelection({
    supabaseAdmin: params.supabaseAdmin,
    userId: params.userId,
    productId: params.selectProductId,
  });

  const { product } = await loadConfiguredOfferProduct(params.supabaseAdmin, params.userId);
  const checkoutUrl = product ? resolveCheckoutUrl(product, params.req) : null;
  const active = Boolean(
    product
    && product.active !== false
    && product.for_sale !== false
    && checkoutUrl,
  );

  const trustConfig = getCentralInstallationTrustConfig();
  if (!trustConfig) {
    return {
      synced: false,
      active,
      message: 'As credenciais seguras desta instalação ainda não estão configuradas para publicar a oferta no Portal.',
    };
  }

  const body = JSON.stringify({
    action: 'sync_offer',
    source_product_id: active ? product.id : null,
    checkout_url: active ? checkoutUrl : null,
    product_name: active ? cleanText(product.name, 160) : null,
    description: active ? cleanText(product.description, 5000) || null : null,
    image_url: active ? cleanText(product.image_url, 2048) || null : null,
    price: active ? Number(product.price_real ?? product.price ?? 0) : 0,
    currency: active ? cleanText(product.currency || 'BRL', 3).toUpperCase() : 'BRL',
    active,
  });
  const headers = buildCentralInstallationTrustHeaders({
    config: trustConfig,
    method: 'POST',
    endpoint: 'installation-offers',
    rawBody: body,
  });

  const response = await fetch(`${resolveCentralApiUrl()}/installation-offers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success !== true) {
    throw new Error(payload?.error || 'Não foi possível publicar a oferta de instalação no Portal.');
  }

  return { synced: true, active };
}

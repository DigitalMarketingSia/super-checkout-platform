import crypto from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const DEFAULT_ALLOWED_ORIGIN = 'https://app.supercheckout.app';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIN_SECRET_LENGTH = 32;
const RATE_LIMIT_BUCKETS = new Map<string, { count: number; resetAt: number }>();

type UpsellExperienceMode = 'one_click' | 'light_confirmation' | 'repayment_explicit' | 'not_immediate';
type UpsellOfferStrategy =
  | 'one_click_charge'
  | 'saved_method_reconfirm'
  | 'new_card_capture'
  | 'pix_reoffer'
  | 'defer_offer';

type UpsellGatewayCapability = {
  gateway: 'stripe' | 'mercado_pago' | 'pagseguro' | 'pix' | 'unknown';
  original_payment_method: 'credit_card' | 'pix' | 'boleto' | 'apple_pay' | 'google_pay' | 'unknown';
  supports_saved_method: boolean;
  supports_off_session_charge: boolean;
  requires_step_up: boolean;
  supports_pix: boolean;
  supports_wallet_reuse: boolean;
  has_saved_profile: boolean;
  reusable_profile_available: boolean;
  should_offer_immediately: boolean;
  requires_payment_form: boolean;
  strategy: UpsellOfferStrategy;
  saved_profile?: {
    brand?: string | null;
    last4?: string | null;
    exp_month?: number | null;
    exp_year?: number | null;
    wallet_type?: 'apple_pay' | 'google_pay' | null;
    gateway_payment_method_id?: string | null;
  } | null;
  mode: UpsellExperienceMode;
};

const WALLET_METHODS = new Set(['apple_pay', 'google_pay']);

function getAllowedOrigins() {
  const origins = [
    DEFAULT_ALLOWED_ORIGIN,
    'https://supercheckout.app',
    'https://portal.supercheckout.app',
    'https://install.supercheckout.app',
    process.env.APP_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.NEXT_PUBLIC_APP_URL,
  ];

  if (process.env.NODE_ENV !== 'production') {
    origins.push('http://localhost:3000', 'http://localhost:5173');
  }

  return Array.from(new Set(origins.filter(Boolean) as string[]));
}

function isSameHostOrigin(req: VercelRequest) {
  const origin = String(req.headers.origin || '');
  const host = String(req.headers.host || '').toLowerCase();
  if (!origin || !host) return true;

  try {
    const originHost = new URL(origin).host.toLowerCase();
    return originHost === host || getAllowedOrigins().includes(origin);
  } catch {
    return false;
  }
}

function applyMemberCors(req: VercelRequest, res: VercelResponse) {
  const origin = String(req.headers.origin || '');
  res.setHeader('Access-Control-Allow-Origin', origin || DEFAULT_ALLOWED_ORIGIN);
  res.setHeader('Vary', 'Origin');
  return isSameHostOrigin(req);
}

function readFirstEnv(names: string[]) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function getSupabaseUrl() {
  return readFirstEnv(['NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL']);
}

function getSupabaseServerKey() {
  return readFirstEnv([
    'SUPABASE_SECRET_KEY_NEW',
    'SUPABASE_SECRET_KEY',
    'SUPABASE_SERVICE_ROLE_KEY_NEW',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]);
}

function normalizeSecretKey(value: string | undefined) {
  const key = String(value || '').trim();
  if (!key || key.length < MIN_SECRET_LENGTH || /^your_|placeholder|change_me/i.test(key)) {
    return null;
  }
  return crypto.createHash('sha256').update(key).digest();
}

function getSigningKeys() {
  const keys: Buffer[] = [];
  const current = normalizeSecretKey(process.env.PAYMENT_ENCRYPTION_KEY);
  if (current) keys.push(current);

  const previousValues = String(process.env.PAYMENT_ENCRYPTION_KEY_PREVIOUS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  for (const raw of previousValues) {
    const normalized = normalizeSecretKey(raw);
    if (normalized) keys.push(normalized);
  }

  return keys;
}

function verifyOrderSignature(orderId: string, signature: string) {
  if (!orderId || !signature) return false;

  try {
    const signatureBuffer = Buffer.from(signature, 'hex');
    if (signatureBuffer.length === 0) return false;

    return getSigningKeys().some((secretKey) => {
      const expectedSignature = crypto
        .createHmac('sha256', secretKey)
        .update(orderId)
        .digest('hex');

      return crypto.timingSafeEqual(signatureBuffer, Buffer.from(expectedSignature, 'hex'));
    });
  } catch {
    return false;
  }
}

function getClientIp(req: VercelRequest) {
  const forwarded = req.headers['x-forwarded-for'];
  const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return firstForwarded?.split(',')[0]?.trim()
    || String(req.headers['cf-connecting-ip'] || '')
    || String(req.socket?.remoteAddress || '')
    || 'unknown';
}

function hashIdentifier(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function enforceLocalRateLimit(req: VercelRequest, res: VercelResponse, orderId: string) {
  const limit = 80;
  const windowMs = 15 * 60 * 1000;
  const now = Date.now();
  const ip = getClientIp(req);
  const keys = [
    `upsell:ip:${hashIdentifier(ip)}`,
    `upsell:order:${hashIdentifier(orderId)}`,
  ];

  for (const [key, bucket] of RATE_LIMIT_BUCKETS) {
    if (bucket.resetAt <= now) RATE_LIMIT_BUCKETS.delete(key);
  }

  let blockedResetAt = 0;
  for (const key of keys) {
    const existing = RATE_LIMIT_BUCKETS.get(key);
    if (!existing || existing.resetAt <= now) {
      RATE_LIMIT_BUCKETS.set(key, { count: 1, resetAt: now + windowMs });
      continue;
    }

    existing.count += 1;
    if (existing.count > limit) {
      blockedResetAt = Math.max(blockedResetAt, existing.resetAt);
    }
  }

  if (!blockedResetAt) return true;

  const retryAfterSec = Math.max(1, Math.ceil((blockedResetAt - now) / 1000));
  res.setHeader('Retry-After', String(retryAfterSec));
  return false;
}

async function fetchSupabaseRows(path: string) {
  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabaseServerKey();
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('As credenciais server-side do Supabase estao desatualizadas apos a rotacao. Revise SUPABASE_SECRET_KEY na Vercel e redeploye o app.');
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Supabase REST ${response.status}: ${text}`);
  }

  return response.json();
}

function normalizeGatewayName(value: string | null | undefined): UpsellGatewayCapability['gateway'] {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'stripe') return 'stripe';
  if (normalized === 'mercado_pago') return 'mercado_pago';
  if (normalized === 'pagseguro' || normalized === 'pagbank') return 'pagseguro';
  if (normalized === 'pix') return 'pix';
  return 'unknown';
}

function normalizePaymentMethod(value: string | null | undefined): UpsellGatewayCapability['original_payment_method'] {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'credit_card' || normalized === 'pix' || normalized === 'boleto' || normalized === 'apple_pay' || normalized === 'google_pay') {
    return normalized;
  }
  return 'unknown';
}

function resolveCapability(params: {
  gatewayName?: string | null;
  paymentMethod?: string | null;
  hasSavedProfile?: boolean;
  reusableProfile?: boolean;
  requiresReauthentication?: boolean;
  savedProfile?: UpsellGatewayCapability['saved_profile'];
}) {
  const gateway = normalizeGatewayName(params.gatewayName);
  const original_payment_method = normalizePaymentMethod(params.paymentMethod);
  const has_saved_profile = Boolean(params.hasSavedProfile);
  const reusable_profile_available = has_saved_profile && Boolean(params.reusableProfile);
  const requires_step_up = params.requiresReauthentication ?? false;
  const supports_pix = original_payment_method === 'pix';

  const baseCapability: UpsellGatewayCapability = {
    gateway,
    original_payment_method,
    supports_saved_method: has_saved_profile,
    supports_off_session_charge: false,
    requires_step_up,
    supports_pix,
    supports_wallet_reuse: false,
    has_saved_profile,
    reusable_profile_available,
    should_offer_immediately: true,
    requires_payment_form: true,
    strategy: 'new_card_capture',
    saved_profile: params.savedProfile || null,
    mode: 'repayment_explicit',
  };

  if (original_payment_method === 'boleto' || original_payment_method === 'unknown') {
    return {
      ...baseCapability,
      should_offer_immediately: false,
      requires_payment_form: false,
      strategy: 'defer_offer' as const,
      mode: 'not_immediate' as const,
    };
  }

  if (original_payment_method === 'pix') {
    return {
      ...baseCapability,
      should_offer_immediately: true,
      requires_payment_form: false,
      strategy: 'pix_reoffer' as const,
      mode: 'repayment_explicit' as const,
    };
  }

  if (reusable_profile_available) {
    return {
      ...baseCapability,
      supports_saved_method: true,
      supports_off_session_charge: gateway === 'stripe',
      supports_wallet_reuse: original_payment_method === 'apple_pay' || original_payment_method === 'google_pay',
      requires_payment_form: false,
      strategy: requires_step_up ? 'saved_method_reconfirm' as const : 'one_click_charge' as const,
      mode: requires_step_up ? 'light_confirmation' as const : 'one_click' as const,
    };
  }

  if (has_saved_profile || WALLET_METHODS.has(original_payment_method)) {
    return {
      ...baseCapability,
      supports_saved_method: has_saved_profile,
      supports_wallet_reuse: original_payment_method === 'apple_pay' || original_payment_method === 'google_pay',
      requires_step_up: true,
      strategy: 'saved_method_reconfirm' as const,
      mode: 'light_confirmation' as const,
    };
  }

  return {
    ...baseCapability,
    strategy: gateway === 'pix' ? 'pix_reoffer' as const : 'new_card_capture' as const,
    requires_payment_form: gateway !== 'pix',
    mode: 'repayment_explicit' as const,
  };
}

function buildProfilePath(params: {
  gatewayId: string;
  merchantUserId?: string;
  lastOrderId?: string;
  customerUserId?: string;
  customerEmail?: string;
  paymentMethodCandidates?: string[];
}) {
  const query = new URLSearchParams({
    select: 'card_brand,card_last4,card_exp_month,card_exp_year,wallet_type,gateway_payment_method_id,reusable,requires_reauthentication',
    gateway_id: `eq.${params.gatewayId}`,
    order: 'updated_at.desc',
    limit: '1',
  });

  if (params.merchantUserId) query.set('user_id', `eq.${params.merchantUserId}`);
  if (params.lastOrderId) query.set('last_order_id', `eq.${params.lastOrderId}`);
  if (params.customerUserId) query.set('customer_user_id', `eq.${params.customerUserId}`);
  if (params.customerEmail) query.set('customer_email', `eq.${params.customerEmail}`);
  if (params.paymentMethodCandidates?.length) {
    query.set('payment_method_type', `in.(${params.paymentMethodCandidates.join(',')})`);
  }

  return `customer_payment_profiles?${query.toString()}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const corsAllowed = applyMemberCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (!corsAllowed) return res.status(403).json({ error: 'Origin not allowed' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const orderId = String(req.query.orderId || '').trim();
  const sig = String(req.query.sig || '').trim();
  if (!UUID_REGEX.test(orderId)) {
    return res.status(400).json({ error: 'Invalid orderId' });
  }

  if (!enforceLocalRateLimit(req, res, orderId)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  if (!verifyOrderSignature(orderId, sig)) {
    return res.status(200).json({ authorized: false, capability: null });
  }

  try {
    const [order] = await fetchSupabaseRows(
      `orders?id=eq.${encodeURIComponent(orderId)}&select=id,user_id,customer_user_id,checkout_id,customer_email,payment_method&limit=1`,
    );

    if (!order?.id) {
      return res.status(200).json({ authorized: true, capability: null });
    }

    const [payment] = await fetchSupabaseRows(
      `payments?order_id=eq.${encodeURIComponent(order.id)}&select=gateway_id,user_id,created_at&order=created_at.desc&limit=1`,
    );

    const [checkout] = order.checkout_id
      ? await fetchSupabaseRows(
          `checkouts?id=eq.${encodeURIComponent(order.checkout_id)}&select=gateway_id,user_id&limit=1`,
        )
      : [null];

    const effectiveGatewayId = String(payment?.gateway_id || checkout?.gateway_id || '').trim();
    const effectiveMerchantUserId = String(checkout?.user_id || payment?.user_id || order.user_id || '').trim();
    const normalizedCustomerEmail = String(order.customer_email || '').trim().toLowerCase();

    const [gateway] = effectiveGatewayId
      ? await fetchSupabaseRows(
          `gateways?id=eq.${encodeURIComponent(effectiveGatewayId)}&select=id,name&limit=1`,
        )
      : [null];

    let savedProfile: any = null;

    if (effectiveGatewayId) {
      const rows = await fetchSupabaseRows(
        buildProfilePath({
          gatewayId: effectiveGatewayId,
          merchantUserId: effectiveMerchantUserId || undefined,
          lastOrderId: order.id,
        }),
      );
      savedProfile = rows?.[0] || null;
    }

    if (!savedProfile && effectiveGatewayId && order.customer_user_id) {
      const rows = await fetchSupabaseRows(
        buildProfilePath({
          gatewayId: effectiveGatewayId,
          merchantUserId: effectiveMerchantUserId || undefined,
          customerUserId: order.customer_user_id,
        }),
      );
      savedProfile = rows?.[0] || null;
    }

    if (!savedProfile && effectiveGatewayId) {
      const paymentMethodCandidates = order.payment_method === 'credit_card'
        ? ['credit_card', 'apple_pay', 'google_pay']
        : [String(order.payment_method || '').trim()];

      const rows = await fetchSupabaseRows(
        buildProfilePath({
          gatewayId: effectiveGatewayId,
          merchantUserId: effectiveMerchantUserId || undefined,
          customerEmail: normalizedCustomerEmail,
          paymentMethodCandidates,
        }),
      );
      savedProfile = rows?.[0] || null;
    }

    const capability = resolveCapability({
      gatewayName: gateway?.name,
      paymentMethod: order.payment_method,
      hasSavedProfile: Boolean(savedProfile),
      reusableProfile: Boolean(savedProfile?.reusable),
      requiresReauthentication: savedProfile?.requires_reauthentication ?? undefined,
      savedProfile: savedProfile
        ? {
            brand: savedProfile.card_brand,
            last4: savedProfile.card_last4,
            exp_month: savedProfile.card_exp_month,
            exp_year: savedProfile.card_exp_year,
            wallet_type: savedProfile.wallet_type,
            gateway_payment_method_id: savedProfile.gateway_payment_method_id,
          }
        : null,
    });

    return res.status(200).json({
      authorized: true,
      capability,
    });
  } catch (err: any) {
    console.error('[UpsellEligibility] failed:', err?.message || err);
    return res.status(500).json({ error: 'Failed to resolve upsell eligibility' });
  }
}

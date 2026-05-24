import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getLocalSupabaseServerKeyErrorMessage, resolveLocalSupabaseServerClient } from '../src/core/api/_supabase-server.js';
import { enforceApiRateLimit } from '../src/core/api/_rate-limit.js';
import { resolveUpsellGatewayCapability } from '../src/core/config/upsellCapabilities.js';
import { verifySignature } from '../src/core/utils/cryptoUtils.js';

const DEFAULT_ALLOWED_ORIGIN = 'https://app.supercheckout.app';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  const rateLimit = enforceApiRateLimit(req, res, {
    scope: 'upsell_eligibility',
    identifiers: [orderId],
    limit: 80,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  if (!verifySignature(orderId, sig)) {
    return res.status(200).json({ authorized: false, capability: null });
  }

  try {
    const { supabase: supabaseAdmin } = await resolveLocalSupabaseServerClient();
    if (!supabaseAdmin) {
      return res.status(500).json({ error: getLocalSupabaseServerKeyErrorMessage() });
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, user_id, customer_user_id, checkout_id, customer_email, payment_method')
      .eq('id', orderId)
      .maybeSingle();

    if (orderError || !order?.id) {
      return res.status(200).json({ authorized: true, capability: null });
    }

    const { data: payment } = await supabaseAdmin
      .from('payments')
      .select('gateway_id, user_id')
      .eq('order_id', order.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: checkout } = await supabaseAdmin
      .from('checkouts')
      .select('gateway_id, user_id')
      .eq('id', order.checkout_id)
      .maybeSingle();

    const effectiveGatewayId = String(payment?.gateway_id || checkout?.gateway_id || '').trim();
    const effectiveMerchantUserId = String(checkout?.user_id || payment?.user_id || order.user_id || '').trim();
    const normalizedCustomerEmail = String(order.customer_email || '').trim().toLowerCase();

    const { data: gateway } = effectiveGatewayId
      ? await supabaseAdmin
          .from('gateways')
          .select('id, name')
          .eq('id', effectiveGatewayId)
          .maybeSingle()
      : { data: null };

    let savedProfile: any = null;

    if (effectiveGatewayId) {
      let exactProfileQuery = supabaseAdmin
        .from('customer_payment_profiles')
        .select('card_brand, card_last4, card_exp_month, card_exp_year, wallet_type, reusable, requires_reauthentication')
        .eq('gateway_id', effectiveGatewayId)
        .eq('last_order_id', order.id)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (effectiveMerchantUserId) {
        exactProfileQuery = exactProfileQuery.eq('user_id', effectiveMerchantUserId);
      }

      const { data: exactProfile } = await exactProfileQuery.maybeSingle();
      savedProfile = exactProfile;
    }

    if (!savedProfile && effectiveGatewayId && order.customer_user_id) {
      let customerUserProfileQuery = supabaseAdmin
        .from('customer_payment_profiles')
        .select('card_brand, card_last4, card_exp_month, card_exp_year, wallet_type, reusable, requires_reauthentication')
        .eq('gateway_id', effectiveGatewayId)
        .eq('customer_user_id', order.customer_user_id)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (effectiveMerchantUserId) {
        customerUserProfileQuery = customerUserProfileQuery.eq('user_id', effectiveMerchantUserId);
      }

      const { data: customerUserProfile } = await customerUserProfileQuery.maybeSingle();
      savedProfile = customerUserProfile;
    }

    if (!savedProfile && effectiveGatewayId) {
      const paymentMethodCandidates = order.payment_method === 'credit_card'
        ? ['credit_card', 'apple_pay', 'google_pay']
        : [order.payment_method];

      let fallbackProfileQuery = supabaseAdmin
        .from('customer_payment_profiles')
        .select('card_brand, card_last4, card_exp_month, card_exp_year, wallet_type, reusable, requires_reauthentication')
        .eq('gateway_id', effectiveGatewayId)
        .ilike('customer_email', normalizedCustomerEmail)
        .in('payment_method_type', paymentMethodCandidates)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (effectiveMerchantUserId) {
        fallbackProfileQuery = fallbackProfileQuery.eq('user_id', effectiveMerchantUserId);
      }

      const { data: fallbackProfile } = await fallbackProfileQuery.maybeSingle();
      savedProfile = fallbackProfile;
    }

    const capability = resolveUpsellGatewayCapability({
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

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import healthHandler from '../src/core/api/health.js';
import proxyHandler from '../src/core/api/proxy.js';
import sendEmailHandler from '../src/core/api/send-email.js';
import { PRODUCT_DELIVERABLE_BUCKET } from '../src/core/config/productDeliverables.js';
import { resolveUpsellGatewayCapability } from '../src/core/config/upsellCapabilities.js';
import {
    getLocalSupabasePublicConfig,
    getLocalSupabaseServerKeyErrorMessage,
    resolveLocalSupabaseServerClient,
} from '../src/core/api/_supabase-server.js';
import { sendOrderAccessEmail } from '../src/core/services/orderEmail.js';
import { buildOrderDeliverables, stripSensitiveDeliverableFields } from '../src/core/services/orderDeliverables.js';
import { verifySignature } from '../src/core/utils/cryptoUtils.js';
import { verifyLoginToken } from '../src/core/utils/loginToken.js';
import { enforceApiRateLimit } from '../src/core/api/_rate-limit.js';

const DEFAULT_ALLOWED_ORIGIN = 'https://app.supercheckout.app';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEV_LOCAL_SUPABASE_URL = 'https://vixlzrmhqsbzjhpgfwdn.supabase.co';

function getDevFallback(value: string) {
    return process.env.NODE_ENV !== 'production' ? value : '';
}

function getSupabaseAnonKey() {
    return process.env.SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.VITE_SUPABASE_ANON_KEY;
}

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

async function readJsonBody(req: VercelRequest) {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        return req.body as Record<string, any>;
    }

    const chunks: Buffer[] = [];
    const preload = req.body;

    if (typeof preload === 'string' && preload.trim()) {
        chunks.push(Buffer.from(preload));
    } else if (Buffer.isBuffer(preload) && preload.length > 0) {
        chunks.push(preload);
    } else if (!preload && typeof (req as any)[Symbol.asyncIterator] === 'function') {
        for await (const chunk of req as any as AsyncIterable<Buffer | string>) {
            if (typeof chunk === 'string') {
                if (chunk) chunks.push(Buffer.from(chunk));
                continue;
            }

            if (chunk?.length) chunks.push(Buffer.from(chunk));
        }
    }

    if (chunks.length === 0) return {};

    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        return {};
    }
}

function applyPublicCors(req: VercelRequest, res: VercelResponse) {
    const origin = req.headers.origin;
    const allowedOrigins = getAllowedOrigins();

    if (!origin) {
        res.setHeader('Access-Control-Allow-Origin', DEFAULT_ALLOWED_ORIGIN);
        return true;
    }

    if (!allowedOrigins.includes(origin)) return false;

    res.setHeader('Access-Control-Allow-Origin', origin);
    return true;
}

async function fallbackCheckStatusHandler(req: VercelRequest, res: VercelResponse) {
    const { orderId, sig } = req.query;

    if (!orderId || typeof orderId !== 'string') {
        return res.status(400).json({ error: 'Missing orderId' });
    }

    if (!UUID_REGEX.test(orderId)) {
        return res.status(400).json({ error: 'Invalid orderId' });
    }

    if (!verifySignature(orderId, sig as string)) {
        return res.status(200).json({ status: 'pending', fallback: true });
    }

    const supabaseUrl =
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        process.env.VITE_SUPABASE_URL ||
        getDevFallback(DEV_LOCAL_SUPABASE_URL);
    const supabaseKey = getSupabaseAnonKey();

    if (!supabaseKey) {
        return res.status(200).json({ status: 'pending', fallback: true, reason: 'missing_supabase_key' });
    }

    const encodedOrderId = encodeURIComponent(orderId);
    const orderRes = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${encodedOrderId}&select=status`, {
        headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`
        }
    });

    if (!orderRes.ok) {
        console.error('[System] Fallback check-status failed to fetch order:', { status: orderRes.status });
        return res.status(200).json({ status: 'pending', fallback: true, reason: 'fetch_order_failed' });
    }

    const orders = await orderRes.json();
    const status = String(orders?.[0]?.status || 'pending').toLowerCase();
    return res.status(200).json({ status, fallback: true });
}

async function publicGatewayHandler(req: VercelRequest, res: VercelResponse) {
    const corsAllowed = applyPublicCors(req, res);
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (!corsAllowed) return res.status(403).json({ error: 'Origin not allowed' });
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const id = String(req.query.id || '').trim();
    if (!UUID_REGEX.test(id)) {
        return res.status(400).json({ error: 'Invalid gateway id' });
    }

    const rateLimit = enforceApiRateLimit(req, res, {
        scope: 'system_public_gateway',
        identifiers: [id],
        limit: 80,
        windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = getSupabaseAnonKey();

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const gatewayRes = await fetch(
        `${supabaseUrl}/rest/v1/public_gateways?id=eq.${encodeURIComponent(id)}&select=id,name,provider,public_key,active,is_active,config&limit=1`,
        {
            headers: {
                apikey: supabaseKey,
                Authorization: `Bearer ${supabaseKey}`,
            },
        },
    );

    if (!gatewayRes.ok) {
        console.error('[System] public-gateway lookup failed:', { status: gatewayRes.status });
        return res.status(500).json({ error: 'Failed to load gateway' });
    }

    const rows = await gatewayRes.json();
    const gateway = rows?.[0];
    if (!gateway || (gateway.active === false && gateway.is_active === false)) {
        return res.status(404).json({ error: 'Gateway not found' });
    }

    return res.status(200).json({
        id: gateway.id,
        name: gateway.name || gateway.provider,
        provider: gateway.provider || gateway.name,
        public_key: gateway.public_key,
        active: gateway.active,
        is_active: gateway.is_active,
        config: gateway.config || {},
    });
}


async function autoLoginHandler(req: VercelRequest, res: VercelResponse) {
  try {
    const corsAllowed = applyMemberCors(req, res);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (!corsAllowed) return res.status(403).json({ error: 'Origin not allowed' });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = await readJsonBody(req);
    const token = String(body?.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Missing token' });

    const rateLimit = enforceApiRateLimit(req, res, {
      scope: 'system_auto_login',
      identifiers: [token.slice(0, 64)],
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    const verified = verifyLoginToken(token);
    if (!verified) return res.status(401).json({ error: 'Invalid or expired token' });

    const { supabaseUrl, publicKey } = getLocalSupabasePublicConfig();
    const { supabase: supabaseAdmin } = await resolveLocalSupabaseServerClient();
    const authApiKey = publicKey || getSupabaseAnonKey();
    if (!supabaseUrl || !supabaseAdmin || !authApiKey) {
      return res.status(500).json({ error: getLocalSupabaseServerKeyErrorMessage() });
    }

    // Generate magic link token server-side
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: verified.email,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('[AutoLogin] generateLink failed:', linkError?.message);
      return res.status(500).json({ error: 'Failed to generate session' });
    }

    const tryVerify = async (type: 'magiclink' | 'email') => {
      const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': authApiKey,
          'Authorization': `Bearer ${authApiKey}`,
        },
        body: JSON.stringify({
          token_hash: linkData.properties.hashed_token,
          type,
        }),
      });

      const sessionData = await verifyRes.json().catch(() => ({}));
      return {
        ok: verifyRes.ok,
        type,
        status: verifyRes.status,
        sessionData,
      };
    };

    const magiclinkAttempt = await tryVerify('magiclink');
    const emailAttempt = magiclinkAttempt.ok && magiclinkAttempt.sessionData?.access_token
      ? null
      : await tryVerify('email');
    const successfulAttempt = [magiclinkAttempt, emailAttempt].find((attempt) => attempt?.ok && attempt.sessionData?.access_token);

    if (!successfulAttempt) {
      console.error('[AutoLogin] GoTrue verify failed:', {
        magiclinkStatus: magiclinkAttempt.status,
        emailStatus: emailAttempt?.status || null,
      });
      return res.status(500).json({ error: 'Session verification failed' });
    }

    return res.status(200).json({
      access_token: successfulAttempt?.sessionData?.access_token,
      refresh_token: successfulAttempt?.sessionData?.refresh_token,
    });
  } catch (err: any) {
    console.error('[AutoLogin] Error:', err?.message || err);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function resendOrderAccessHandler(req: VercelRequest, res: VercelResponse) {
  const corsAllowed = applyPublicCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (!corsAllowed) return res.status(403).json({ error: 'Origin not allowed' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = await readJsonBody(req);
  const orderId = String(body.orderId || '').trim();
  if (!UUID_REGEX.test(orderId)) {
    return res.status(400).json({ error: 'Invalid orderId' });
  }

  const rateLimit = enforceApiRateLimit(req, res, {
    scope: 'system_resend_order_access',
    identifiers: [orderId],
    limit: 12,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const authHeader = String(req.headers.authorization || '');
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
  if (!accessToken) return res.status(401).json({ error: 'Missing authorization token' });

  try {
    const { supabase: supabaseAdmin } = await resolveLocalSupabaseServerClient();
    if (!supabaseAdmin) {
      return res.status(500).json({ error: getLocalSupabaseServerKeyErrorMessage() });
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
    const user = userData?.user;
    if (userError || !user?.id) return res.status(401).json({ error: 'Invalid authorization token' });

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, customer_email, customer_name, checkouts(user_id)')
      .eq('id', orderId)
      .single();

    if (orderError || !order) return res.status(404).json({ error: 'Order not found' });

    const merchantUserId = (order as any).checkouts?.user_id;
    if (merchantUserId && merchantUserId !== user.id) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (!['admin', 'owner'].includes(String(profile?.role || ''))) {
        return res.status(403).json({ error: 'Not allowed for this order' });
      }
    }

    const origin = normalizeRequestOrigin(req);
    const result = await sendOrderAccessEmail(supabaseAdmin, {
      orderId,
      origin,
      email: order.customer_email,
      name: order.customer_name,
      force: true,
    });

    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[System] resend-order-access failed:', err?.message || err);
    return res.status(500).json({ error: 'Failed to resend access email' });
  }
}

async function deliverableFileHandler(req: VercelRequest, res: VercelResponse) {
  const corsAllowed = applyMemberCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (!corsAllowed) return res.status(403).json({ error: 'Origin not allowed' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const orderId = String(req.query.orderId || '').trim();
  const productId = String(req.query.productId || '').trim();
  const sig = String(req.query.sig || '').trim();

  if (!UUID_REGEX.test(orderId) || !UUID_REGEX.test(productId) || !verifySignature(orderId, sig)) {
    return res.status(404).json({ error: 'Deliverable not found' });
  }

  try {
    const { supabase: supabaseAdmin } = await resolveLocalSupabaseServerClient();
    if (!supabaseAdmin) {
      return res.status(500).json({ error: getLocalSupabaseServerKeyErrorMessage() });
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, status, items')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Deliverable not found' });
    }

    const status = String(order.status || '').toLowerCase();
    if (status !== 'paid' && status !== 'approved') {
      return res.status(404).json({ error: 'Deliverable not found' });
    }

    const purchasedProductIds = new Set(
      (Array.isArray(order.items) ? order.items : [])
        .map((item: any) => String(item?.product_id || item?.id || '').trim())
        .filter(Boolean)
    );

    if (!purchasedProductIds.has(productId)) {
      return res.status(404).json({ error: 'Deliverable not found' });
    }

    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('id, name, member_area_action, delivery_file_path, delivery_file_name')
      .eq('id', productId)
      .maybeSingle();

    const filePath = String(product?.delivery_file_path || '').trim();
    if (productError || !product?.id || String(product.member_area_action || '') !== 'file' || !filePath) {
      return res.status(404).json({ error: 'Deliverable not found' });
    }

    const signedUrlResult = await supabaseAdmin
      .storage
      .from(PRODUCT_DELIVERABLE_BUCKET)
      .createSignedUrl(filePath, 60 * 15, {
        download: String(product.delivery_file_name || product.name || 'arquivo'),
      });

    if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
      console.error('[System] deliverable-file signed URL failed:', signedUrlResult.error?.message || signedUrlResult.error);
      return res.status(500).json({ error: 'Failed to open deliverable' });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, signedUrlResult.data.signedUrl);
  } catch (err: any) {
    console.error('[System] deliverable-file failed:', err?.message || err);
    return res.status(500).json({ error: 'Failed to open deliverable' });
  }
}

async function orderDeliverablesHandler(req: VercelRequest, res: VercelResponse) {
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
    scope: 'system_order_deliverables',
    identifiers: [orderId],
    limit: 80,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  let hasValidSignature = false;
  try {
    hasValidSignature = verifySignature(orderId, sig);
  } catch (signatureError: any) {
    console.error('[System] order-deliverables signature verification failed:', signatureError?.message || signatureError);
  }

  if (!hasValidSignature) {
    return res.status(200).json({ status: 'pending', deliverables: [], authorized: false });
  }

  try {
    const { supabase: supabaseAdmin } = await resolveLocalSupabaseServerClient();
    if (!supabaseAdmin) {
      return res.status(500).json({ error: getLocalSupabaseServerKeyErrorMessage() });
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, status, customer_email, customer_name, items, metadata, checkout_id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return res.status(200).json({ status: 'pending', deliverables: [], authorized: true });
    }

    const status = String(order.status || '').toLowerCase();
    if (status !== 'paid' && status !== 'approved') {
      return res.status(200).json({ status: order.status || 'pending', deliverables: [], authorized: true });
    }

    const origin = normalizeRequestOrigin(req);
    const deliverables = await buildOrderDeliverables(supabaseAdmin, {
      order,
      origin,
      recipientEmail: order.customer_email,
      includeAccessTokens: true,
    });

    const metadata = order.metadata && typeof order.metadata === 'object' ? order.metadata : {};
    if (!metadata.order_deliverables_generated_at) {
      await supabaseAdmin
        .from('orders')
        .update({
          metadata: {
            ...metadata,
            order_deliverables: deliverables.map(stripSensitiveDeliverableFields),
            order_deliverables_generated_at: new Date().toISOString(),
            order_deliverables_source: 'thank_you_endpoint',
          },
        })
        .eq('id', orderId);
    }

    return res.status(200).json({
      status: order.status,
      authorized: true,
      deliverables,
    });
  } catch (err: any) {
    console.error('[System] order-deliverables failed:', err?.message || err);
    return res.status(500).json({ error: 'Failed to load order deliverables' });
  }
}

async function upsellEligibilityHandler(req: VercelRequest, res: VercelResponse) {
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
    scope: 'system_upsell_eligibility',
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
    console.error('[System] upsell-eligibility failed:', err?.message || err);
    return res.status(500).json({ error: 'Failed to resolve upsell eligibility' });
  }
}

function maskEmail(email?: string | null) {
  const [name, domain] = String(email || '').split('@');
  if (!name || !domain) return 'unknown';
  return `${name.slice(0, 2)}***@${domain}`;
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

async function getActiveResendIntegration(supabaseAdmin: any, ownerId?: string | null) {
  if (ownerId) {
    const { data } = await supabaseAdmin
      .from('integrations')
      .select('*')
      .eq('name', 'resend')
      .eq('active', true)
      .eq('user_id', ownerId)
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  const { data } = await supabaseAdmin
    .from('integrations')
    .select('*')
    .eq('name', 'resend')
    .eq('active', true)
    .limit(1)
    .maybeSingle();
  return data;
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function userHasMemberAreaAccess(supabaseAdmin: any, userId: string, memberAreaId: string) {
  const { data: grants, error: grantsError } = await supabaseAdmin
    .from('access_grants')
    .select('product_id, content_id, product:products(member_area_id), content:contents(member_area_id)')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (grantsError) {
    console.warn('[System] member reset grant lookup failed:', grantsError.message);
    return false;
  }

  const productIds = new Set<string>();
  for (const grant of grants || []) {
    const productAreaId = (grant as any).product?.member_area_id;
    const contentAreaId = (grant as any).content?.member_area_id;
    if (productAreaId === memberAreaId || contentAreaId === memberAreaId) return true;
    if ((grant as any).product_id) productIds.add((grant as any).product_id);
  }

  if (productIds.size === 0) return false;

  const { data: links, error: linksError } = await supabaseAdmin
    .from('product_contents')
    .select('product_id, content:contents(member_area_id)')
    .in('product_id', Array.from(productIds));

  if (linksError) {
    console.warn('[System] member reset product content lookup failed:', linksError.message);
    return false;
  }

  return Boolean((links || []).some((link: any) => link.content?.member_area_id === memberAreaId));
}

function buildMemberResetHtml(params: {
  memberAreaName: string;
  email: string;
  resetUrl: string;
  origin: string;
}) {
  const memberAreaName = escapeHtml(params.memberAreaName);
  const email = escapeHtml(params.email);
  const resetUrl = escapeHtml(params.resetUrl);
  const origin = escapeHtml(params.origin);

  return `
    <div style="font-family:Arial,sans-serif;background:#0E1012;color:#ffffff;padding:32px">
      <div style="max-width:560px;margin:0 auto;background:#1A1D21;border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:28px">
        <h1 style="font-size:22px;margin:0 0 12px">Definir senha de acesso</h1>
        <p style="color:#cbd5e1;line-height:1.6;margin:0 0 18px">Recebemos uma solicitacao para criar ou redefinir a senha da sua area de membros em <strong>${memberAreaName}</strong>.</p>
        <p style="color:#cbd5e1;line-height:1.6;margin:0 0 24px">Use o botao abaixo para definir uma nova senha para ${email}.</p>
        <a href="${resetUrl}" style="display:inline-block;background:#ffffff;color:#111827;text-decoration:none;font-weight:700;padding:14px 18px;border-radius:8px">Definir senha</a>
        <p style="color:#94a3b8;font-size:13px;line-height:1.6;margin:24px 0 0">Se voce nao solicitou este link, pode ignorar este email. Este acesso pertence apenas a area de membros, nao ao Portal Super Checkout.</p>
        <p style="color:#64748b;font-size:12px;margin:18px 0 0">${origin}</p>
      </div>
    </div>
  `;
}

async function memberPasswordResetHandler(req: VercelRequest, res: VercelResponse) {
  const corsAllowed = applyMemberCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (!corsAllowed) return res.status(403).json({ error: 'Origin not allowed' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = await readJsonBody(req);
  const email = String(body.email || '').trim().toLowerCase();
  const memberAreaSlug = String(body.member_area_slug || '').trim();
  const rateLimit = enforceApiRateLimit(req, res, {
    scope: 'system_member_password_reset',
    identifiers: [email, memberAreaSlug],
    limit: 8,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return res.status(200).json({ message: 'Processado.' });
  }

  if (!email || !memberAreaSlug || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(200).json({ message: 'Processado.' });
  }

  try {
    const { supabase: supabaseAdmin } = await resolveLocalSupabaseServerClient();
    if (!supabaseAdmin) {
      return res.status(500).json({ error: getLocalSupabaseServerKeyErrorMessage() });
    }

    const origin = normalizeRequestOrigin(req);
    const { data: memberArea } = await supabaseAdmin
      .from('member_areas')
      .select('id, name, slug, owner_id')
      .eq('slug', memberAreaSlug)
      .maybeSingle();

    if (!memberArea?.id) {
      console.warn('[System] member reset area not found:', memberAreaSlug);
      return res.status(200).json({ message: 'Processado.' });
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();

    if (!profile?.id || !(await userHasMemberAreaAccess(supabaseAdmin, profile.id, memberArea.id))) {
      console.warn(`[System] member reset blocked for ${maskEmail(email)} in ${memberAreaSlug}`);
      return res.status(200).json({ message: 'Processado.' });
    }

    const refererPath = (() => {
      try {
        return new URL(String(req.headers.referer || '')).pathname;
      } catch {
        return '';
      }
    })();
    const isStandardMemberRoute = refererPath.startsWith(`/app/${memberArea.slug}`);
    const nextPath = isStandardMemberRoute ? `/app/${memberArea.slug}/login` : '/login';
    const resetBasePath = isStandardMemberRoute ? `/app/${memberArea.slug}/update-password` : '/update-password';
    const resetPath = `${resetBasePath}?scope=member&next=${encodeURIComponent(nextPath)}`;
    const redirectTo = `${origin}${resetPath}`;

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    });

    const tokenHash = linkData?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      console.error('[System] member reset link generation failed:', linkError?.message);
      return res.status(200).json({ message: 'Processado.' });
    }
    const resetUrl = `${redirectTo}&token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;

    const integration = await getActiveResendIntegration(supabaseAdmin, memberArea.owner_id);
    const apiKey = integration?.config?.apiKey || integration?.config?.api_key;
    const fromEmail = integration?.config?.senderEmail || integration?.config?.from_email || 'onboarding@resend.dev';
    const senderName = integration?.config?.senderName || memberArea.name;

    if (!apiKey) {
      console.warn('[System] member reset email provider missing.');
      return res.status(200).json({ message: 'Processado.' });
    }

    const cleanFromEmail = String(fromEmail).replace(/.*<|>/g, '');
    const from = senderName ? `${senderName} <${cleanFromEmail}>` : cleanFromEmail;
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `Defina sua senha - ${memberArea.name}`,
        html: buildMemberResetHtml({
          memberAreaName: memberArea.name,
          email,
          resetUrl,
          origin,
        }),
      }),
    });

    if (!resendRes.ok) {
      console.warn('[System] member reset email rejected:', { status: resendRes.status });
    } else {
      console.log(`[System] member reset email sent to ${maskEmail(email)} for ${memberAreaSlug}`);
    }

    return res.status(200).json({ message: 'Processado.' });
  } catch (err: any) {
    console.error('[System] member-password-reset failed:', err?.message || err);
    return res.status(200).json({ message: 'Processado.' });
  }
}

function normalizeRequestOrigin(req: VercelRequest) {
  const headerOrigin = String(req.headers.origin || '');
  if (headerOrigin) {
    try {
      return new URL(headerOrigin).origin;
    } catch {}
  }
  return `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host || 'app.supercheckout.app'}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { action } = req.query;

    try {
        switch (action) {
            case 'check-status': {
                try {
                    const mod = await import('../src/core/api/check-status.js');
                    return await mod.default(req, res);
                } catch (error: any) {
                    console.error('[System] check-status primary handler crashed, using fallback:', error);
                    return await fallbackCheckStatusHandler(req, res);
                }
            }
            case 'health':
                return await healthHandler(req, res);
            case 'proxy':
                return await proxyHandler(req, res);
            case 'send-email':
                return await sendEmailHandler(req, res);
            case 'public-gateway':
                return await publicGatewayHandler(req, res);
            case 'auto-login':
                return await autoLoginHandler(req, res);
            case 'resend-order-access':
                return await resendOrderAccessHandler(req, res);
            case 'deliverable-file':
                return await deliverableFileHandler(req, res);
            case 'order-deliverables':
                return await orderDeliverablesHandler(req, res);
            case 'upsell-eligibility':
                return await upsellEligibilityHandler(req, res);
            case 'member-password-reset':
                return await memberPasswordResetHandler(req, res);
            default:
                return res.status(404).json({ error: `Action ${action} not found in System Controller` });
        }
    } catch (error: any) {
        console.error('[System] Controller error:', error?.message || error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import {
    getLocalSupabasePublicConfig,
    getLocalSupabaseServerKeyErrorMessage,
    resolveLocalSupabaseServerClient,
} from '../src/core/api/_supabase-server.js';
import { decrypt, verifySignature, encrypt } from '../src/core/utils/cryptoUtils.js';
import { enforceApiRateLimit } from '../src/core/api/_rate-limit.js';
import { fulfillOrder } from '../src/core/services/fulfillment.js';
import { sendOrderAccessEmail } from '../src/core/services/orderEmail.js';
import { mergeOrderMetadata, normalizeOrderMetadata } from '../src/core/services/orderMetadata.js';

const DEFAULT_ALLOWED_ORIGIN = 'https://app.supercheckout.app';
const OFFICIAL_CENTRAL_API_URL = 'https://bcmnryxjweiovrwmztpn.supabase.co/functions/v1';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEV_LOCAL_SUPABASE_URL = 'https://vixlzrmhqsbzjhpgfwdn.supabase.co';
const PAGBANK_OAUTH_STATE_COOKIE = 'sc_pagbank_oauth_state';
const PAGBANK_OAUTH_SCOPE = 'payments.read payments.create';
const INTERNAL_SIGNATURE_TTL_MS = 5 * 60 * 1000;

function getDevFallback(value: string) {
    return process.env.NODE_ENV !== 'production' ? value : '';
}

function getSupabaseAnonKey() {
    return process.env.SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
        process.env.SUPABASE_ANON_KEY ||
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

function parseCookies(req: VercelRequest) {
    const header = String(req.headers.cookie || '');
    if (!header) return {} as Record<string, string>;

    return Object.fromEntries(
        header
            .split(';')
            .map((entry) => entry.trim())
            .filter(Boolean)
            .map((entry) => {
                const [name, ...rest] = entry.split('=');
                return [name, decodeURIComponent(rest.join('=') || '')];
            })
    );
}

function buildCookie(name: string, value: string, options?: {
    maxAge?: number;
    path?: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Lax' | 'Strict' | 'None';
}) {
    const parts = [`${name}=${encodeURIComponent(value)}`];
    parts.push(`Path=${options?.path || '/'}`);
    if (typeof options?.maxAge === 'number') parts.push(`Max-Age=${options.maxAge}`);
    if (options?.httpOnly !== false) parts.push('HttpOnly');
    if (options?.secure !== false) parts.push('Secure');
    parts.push(`SameSite=${options?.sameSite || 'Lax'}`);
    return parts.join('; ');
}

function clearCookie(name: string, path = '/') {
    return buildCookie(name, '', { maxAge: 0, path });
}

function buildPagbankOauthState(params: {
    userId: string;
    sandbox: boolean;
    origin: string;
}) {
    const nonce = crypto.randomBytes(16).toString('hex');
    const payload = encrypt(JSON.stringify({
        userId: params.userId,
        sandbox: params.sandbox,
        origin: params.origin,
        timestamp: Date.now(),
    }));

    return {
        state: nonce,
        cookieValue: `${nonce}.${payload}`,
    };
}

function parsePagbankOauthState(req: VercelRequest, state: string) {
    if (!/^[a-f0-9]{32}$/i.test(state)) {
        throw new Error('INVALID_STATE_FORMAT');
    }

    const cookies = parseCookies(req);
    const rawCookie = String(cookies[PAGBANK_OAUTH_STATE_COOKIE] || '');
    const separatorIndex = rawCookie.indexOf('.');
    if (separatorIndex <= 0) {
        throw new Error('MISSING_STATE_COOKIE');
    }

    const cookieState = rawCookie.slice(0, separatorIndex);
    const encryptedPayload = rawCookie.slice(separatorIndex + 1);
    if (cookieState !== state || !encryptedPayload) {
        throw new Error('STATE_MISMATCH');
    }

    const parsed = JSON.parse(decrypt(encryptedPayload));
    const timestamp = Number(parsed?.timestamp || 0);
    if (!Number.isFinite(timestamp) || timestamp <= 0 || (Date.now() - timestamp) > 10 * 60 * 1000) {
        throw new Error('STATE_EXPIRED');
    }

    return parsed;
}

function normalizePagbankRedirectUri(rawValue?: string) {
    const fallback = DEFAULT_PAGBANK_OAUTH_REDIRECT_URI;
    const raw = String(rawValue || '').trim();
    if (!raw) return fallback;

    try {
        const url = raw.startsWith('http://') || raw.startsWith('https://')
            ? new URL(raw)
            : new URL(raw, DEFAULT_ALLOWED_ORIGIN);

        if (url.pathname === '/api/system' && url.searchParams.get('action') === 'pagbank-oauth-callback') {
            url.pathname = '/api/pagbank-callback';
            url.search = '';
        }

        return url.toString();
    } catch {
        return fallback;
    }
}

function getPagbankOauthServerConfig(isSandbox: boolean = false) {
    const clientId = String(
        isSandbox
            ? (
                process.env.PAGSEGURO_SANDBOX_CLIENT_ID
                || process.env.PAGBANK_SANDBOX_CLIENT_ID
                || ''
            )
            : (
                process.env.PAGSEGURO_CLIENT_ID
                || process.env.PAGBANK_CLIENT_ID
                || ''
            )
    ).trim();
    const clientSecret = String(
        isSandbox
            ? (
                process.env.PAGSEGURO_SANDBOX_CLIENT_SECRET
                || process.env.PAGBANK_SANDBOX_CLIENT_SECRET
                || ''
            )
            : (
                process.env.PAGSEGURO_CLIENT_SECRET
                || process.env.PAGBANK_CLIENT_SECRET
                || ''
            )
    ).trim();
    const authorizationToken = String(
        isSandbox
            ? (
                process.env.PAGSEGURO_SANDBOX_AUTHORIZATION_TOKEN
                || process.env.PAGBANK_SANDBOX_AUTHORIZATION_TOKEN
                || process.env.PAGSEGURO_SANDBOX_INTEGRATOR_TOKEN
                || process.env.PAGBANK_SANDBOX_INTEGRATOR_TOKEN
                || ''
            )
            : (
                process.env.PAGSEGURO_AUTHORIZATION_TOKEN
                || process.env.PAGBANK_AUTHORIZATION_TOKEN
                || process.env.PAGSEGURO_INTEGRATOR_TOKEN
                || process.env.PAGBANK_INTEGRATOR_TOKEN
                || ''
            )
    ).trim();
    const redirectUri = normalizePagbankRedirectUri(
        process.env.PAGSEGURO_REDIRECT_URI || DEFAULT_PAGBANK_OAUTH_REDIRECT_URI
    );

    const missingEnv: string[] = [];
    if (!clientId) missingEnv.push(isSandbox ? 'PAGSEGURO_SANDBOX_CLIENT_ID' : 'PAGSEGURO_CLIENT_ID');
    if (!clientSecret) missingEnv.push(isSandbox ? 'PAGSEGURO_SANDBOX_CLIENT_SECRET' : 'PAGSEGURO_CLIENT_SECRET');
    if (!authorizationToken) missingEnv.push(isSandbox ? 'PAGSEGURO_SANDBOX_AUTHORIZATION_TOKEN' : 'PAGSEGURO_AUTHORIZATION_TOKEN');

    return {
        clientId,
        clientSecret,
        authorizationToken,
        redirectUri,
        missingEnv,
    };
}

function buildAdminGatewaysRedirect(baseOrigin: string | undefined, params: Record<string, string>) {
    const origin = String(baseOrigin || DEFAULT_ALLOWED_ORIGIN).trim() || DEFAULT_ALLOWED_ORIGIN;

    let url: URL;
    try {
        url = new URL('/admin/gateways', origin);
    } catch {
        url = new URL('/admin/gateways', DEFAULT_ALLOWED_ORIGIN);
    }

    Object.entries(params).forEach(([key, value]) => {
        if (value) {
            url.searchParams.set(key, value);
        }
    });

    return url.toString();
}

function getHeaderValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] || '' : value || '';
}

function getCentralApiUrl() {
    return String(
        process.env.CENTRAL_API_URL
        || process.env.VITE_CENTRAL_API_URL
        || process.env.NEXT_PUBLIC_CENTRAL_API_URL
        || OFFICIAL_CENTRAL_API_URL
        || ''
    ).trim().replace(/\/+$/, '');
}

function isValidCentralInternalSignature(req: VercelRequest, body: Record<string, any>) {
    const secret = String(process.env.CENTRAL_SHARED_SECRET || process.env.SHARED_SECRET || '').trim();
    const rawTimestamp = getHeaderValue(req.headers['x-admin-timestamp']);
    const rawSignature = getHeaderValue(req.headers['x-admin-signature']).replace(/^sha256=/i, '');

    if (!secret || !rawTimestamp || !rawSignature) return false;

    const timestamp = Number(rawTimestamp.length === 10 ? `${rawTimestamp}000` : rawTimestamp);
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > INTERNAL_SIGNATURE_TTL_MS) {
        return false;
    }

    const payload = `${rawTimestamp}.${JSON.stringify(body)}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    try {
        const expectedBuffer = Buffer.from(expected, 'hex');
        const receivedBuffer = Buffer.from(rawSignature, 'hex');
        return expectedBuffer.length === receivedBuffer.length
            && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
    } catch {
        return false;
    }
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

    const { verifyLoginToken } = await import('../src/core/utils/loginToken.js');
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
    const { sendOrderAccessEmail } = await import('../src/core/services/orderEmail.js');
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

    const { PRODUCT_DELIVERABLE_BUCKET } = await import('../src/core/config/productDeliverables.js');

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
      .select('id, status, customer_email, customer_name, payment_method, customer_user_id, items, metadata, checkout_id, created_at, total')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return res.status(200).json({ status: 'pending', deliverables: [], authorized: true });
    }

    const publicOrder = buildPublicOrderSummary(order);

    const status = String(order.status || '').toLowerCase();
    if (status !== 'paid' && status !== 'approved') {
      return res.status(200).json({
        status: order.status || 'pending',
        authorized: true,
        order: publicOrder,
        deliverables: [],
      });
    }

    const origin = normalizeRequestOrigin(req);
    const {
      buildOrderDeliverables,
      stripSensitiveDeliverableFields,
    } = await import('../src/core/services/orderDeliverables.js');

    const deliverables = await buildOrderDeliverables(supabaseAdmin, {
      order,
      origin,
      recipientEmail: order.customer_email,
      includeAccessTokens: true,
    });

    const metadata = normalizeOrderMetadata(order.metadata);
    if (!metadata.order_deliverables_generated_at) {
      await mergeOrderMetadata(supabaseAdmin, orderId, {
        order_deliverables: deliverables.map(stripSensitiveDeliverableFields),
        order_deliverables_generated_at: new Date().toISOString(),
        order_deliverables_source: 'thank_you_endpoint',
      });
    }

    return res.status(200).json({
      status: order.status,
      authorized: true,
      order: publicOrder,
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
        .select('card_brand, card_last4, card_exp_month, card_exp_year, wallet_type, gateway_payment_method_id, reusable, requires_reauthentication')
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
        .select('card_brand, card_last4, card_exp_month, card_exp_year, wallet_type, gateway_payment_method_id, reusable, requires_reauthentication')
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
        .select('card_brand, card_last4, card_exp_month, card_exp_year, wallet_type, gateway_payment_method_id, reusable, requires_reauthentication')
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

    const { resolveUpsellGatewayCapability } = await import('../src/core/config/upsellCapabilities.js');
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
            gateway_payment_method_id: savedProfile.gateway_payment_method_id,
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

function buildPublicOrderMetadata(metadata: any) {
  const safeMetadata = metadata && typeof metadata === 'object' ? metadata : {};
  const postPurchase = safeMetadata.post_purchase && typeof safeMetadata.post_purchase === 'object'
    ? {
        original_order_id: String(safeMetadata.post_purchase.original_order_id || '').trim() || null,
      }
    : null;

  return {
    original_order_id: String(safeMetadata.original_order_id || '').trim() || null,
    post_purchase: postPurchase,
    order_deliverables: Array.isArray(safeMetadata.order_deliverables) ? safeMetadata.order_deliverables : [],
    order_deliverables_generated_at: safeMetadata.order_deliverables_generated_at || null,
    order_deliverables_source: safeMetadata.order_deliverables_source || null,
  };
}

function buildPublicOrderSummary(order: any) {
  if (!order || typeof order !== 'object') return null;

  const amount = Number(order.total ?? order.amount ?? 0) || 0;
  return {
    id: String(order.id || ''),
    status: String(order.status || 'pending'),
    checkout_id: String(order.checkout_id || ''),
    customer_name: String(order.customer_name || ''),
    customer_email: String(order.customer_email || ''),
    payment_method: String(order.payment_method || ''),
    created_at: order.created_at || null,
    customer_user_id: order.customer_user_id || null,
    amount,
    total: amount,
    items: Array.isArray(order.items) ? order.items : [],
    metadata: buildPublicOrderMetadata(order.metadata),
  };
}

async function consentPreferencesHandler(req: VercelRequest, res: VercelResponse) {
  const corsAllowed = applyPublicCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (!corsAllowed) return res.status(403).json({ error: 'Origin not allowed' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = await readJsonBody(req);
  const checkoutId = String(body.checkoutId || '').trim();
  const visitorKey = String(body.visitorKey || '').trim();
  const sourceSurface = String(body.sourceSurface || '').trim();
  const consentVersion = String(body.consentVersion || '').trim();
  const categories = body.categories && typeof body.categories === 'object' ? body.categories : {};
  const analytics = categories.analytics === true;
  const marketing = categories.marketing === true;

  const parseTimestamp = (value: unknown) => {
    const normalized = String(value || '').trim();
    if (!normalized) return null;

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return null;

    return parsed.toISOString();
  };

  const now = new Date().toISOString();
  const createdAt = parseTimestamp(body.createdAt) || now;
  const updatedAt = parseTimestamp(body.updatedAt) || now;
  const revokedAt = analytics || marketing
    ? null
    : (parseTimestamp(body.revokedAt) || updatedAt);

  if (!UUID_REGEX.test(checkoutId)) {
    return res.status(400).json({ error: 'Invalid checkoutId' });
  }

  if (!visitorKey || visitorKey.length < 8 || visitorKey.length > 200) {
    return res.status(400).json({ error: 'Invalid visitorKey' });
  }

  if (!consentVersion || consentVersion.length > 120) {
    return res.status(400).json({ error: 'Invalid consentVersion' });
  }

  if (sourceSurface !== 'public_checkout' && sourceSurface !== 'thank_you') {
    return res.status(400).json({ error: 'Invalid sourceSurface' });
  }

  const rateLimit = enforceApiRateLimit(req, res, {
    scope: 'system_consent_preferences',
    identifiers: [checkoutId, visitorKey],
    limit: 30,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    const { supabase: supabaseAdmin } = await resolveLocalSupabaseServerClient();
    if (!supabaseAdmin) {
      return res.status(500).json({ error: getLocalSupabaseServerKeyErrorMessage() });
    }

    const { data: checkout } = await supabaseAdmin
      .from('checkouts')
      .select('id')
      .eq('id', checkoutId)
      .maybeSingle();

    if (!checkout?.id) {
      return res.status(404).json({ error: 'Checkout not found' });
    }

    const { error } = await supabaseAdmin
      .from('consent_preferences')
      .upsert({
        checkout_id: checkoutId,
        visitor_key: visitorKey,
        source_surface: sourceSurface,
        consent_version: consentVersion,
        necessary: true,
        analytics,
        marketing,
        created_at: createdAt,
        updated_at: updatedAt,
        revoked_at: revokedAt,
      }, {
        onConflict: 'checkout_id,visitor_key',
      });

    if (error) {
      console.error('[System] consent-preferences failed:', error);
      return res.status(500).json({ error: 'Failed to persist consent preference' });
    }

    return res.status(200).json({ status: 'ok' });
  } catch (error: any) {
    console.error('[System] consent-preferences crashed:', error?.message || error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function finalizeStripePaymentHandler(req: VercelRequest, res: VercelResponse) {
  const corsAllowed = applyMemberCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (!corsAllowed) return res.status(403).json({ error: 'Origin not allowed' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = await readJsonBody(req);
  const orderId = String(body.orderId || '').trim();
  const sig = String(body.sig || '').trim();
  const paymentIntentId = String(body.paymentIntentId || '').trim();

  if (!UUID_REGEX.test(orderId)) {
    return res.status(400).json({ error: 'Invalid orderId' });
  }

  const rateLimit = enforceApiRateLimit(req, res, {
    scope: 'system_finalize_stripe_payment',
    identifiers: [orderId],
    limit: 30,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  if (!verifySignature(orderId, sig)) {
    return res.status(200).json({ status: 'pending', authorized: false });
  }

  try {
    const { supabase: supabaseAdmin } = await resolveLocalSupabaseServerClient();
    if (!supabaseAdmin) {
      return res.status(500).json({ error: getLocalSupabaseServerKeyErrorMessage() });
    }

    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, status, user_id, checkout_id, payment_id, customer_email, customer_name')
      .eq('id', orderId)
      .maybeSingle();

    if (!order?.id || !order.checkout_id) {
      return res.status(200).json({ status: 'pending', authorized: true });
    }

    const { data: payment } = await supabaseAdmin
      .from('payments')
      .select('id, transaction_id, gateway_id, user_id')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: checkout } = await supabaseAdmin
      .from('checkouts')
      .select('id, user_id, gateway_id, backup_gateway_id')
      .eq('id', order.checkout_id)
      .maybeSingle();

    const gatewayId = String(payment?.gateway_id || checkout?.gateway_id || '').trim();
    const effectivePaymentIntentId = paymentIntentId || String(payment?.transaction_id || order.payment_id || '').trim();
    const merchantUserId = String(checkout?.user_id || payment?.user_id || order.user_id || '').trim();

    if (!gatewayId || !effectivePaymentIntentId || !merchantUserId) {
      return res.status(200).json({ status: 'pending', authorized: true });
    }

    const { data: gateway } = await supabaseAdmin
      .from('gateways')
      .select('id, user_id, name, private_key')
      .eq('id', gatewayId)
      .eq('user_id', merchantUserId)
      .maybeSingle();

    if (!gateway?.id || String(gateway.name || '').toLowerCase() !== 'stripe') {
      return res.status(200).json({ status: 'pending', authorized: true });
    }

    const secretKey = decrypt(gateway.private_key || '').replace(/\s/g, '');
    if (!secretKey) {
      return res.status(200).json({ status: 'pending', authorized: true });
    }

    const stripeRes = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(effectivePaymentIntentId)}`, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    });

    if (!stripeRes.ok) {
      const errorText = await stripeRes.text().catch(() => '');
      console.error('[System] finalize-stripe-payment failed to fetch PI:', { status: stripeRes.status, errorText });
      return res.status(200).json({ status: 'pending', authorized: true });
    }

    const stripeIntent = await stripeRes.json();
    const stripeStatus = String(stripeIntent?.status || '').toLowerCase();
    const internalStatus =
      stripeStatus === 'succeeded' ? 'paid'
        : stripeStatus === 'processing' ? 'pending'
          : stripeStatus === 'canceled' || stripeStatus === 'requires_payment_method' ? 'failed'
            : 'pending';

    const paymentData = {
      order_id: orderId,
      transaction_id: effectivePaymentIntentId,
      gateway_id: gateway.id,
      status: internalStatus,
      user_id: merchantUserId,
      raw_response: {
        redacted: true,
        provider: 'stripe',
        id: stripeIntent?.id || effectivePaymentIntentId,
        status: stripeIntent?.status || 'unknown',
        amount: stripeIntent?.amount || null,
        currency: stripeIntent?.currency || null,
        payment_method: stripeIntent?.payment_method || null,
        captured_at: new Date().toISOString(),
      },
    };

    if (payment?.id) {
      await supabaseAdmin.from('payments').update(paymentData).eq('id', payment.id);
    } else {
      await supabaseAdmin.from('payments').upsert(paymentData, {
        onConflict: 'transaction_id',
        ignoreDuplicates: false,
      });
    }

    await supabaseAdmin
      .from('orders')
      .update({
        status: internalStatus,
        payment_id: effectivePaymentIntentId,
      })
      .eq('id', orderId)
      .eq('checkout_id', order.checkout_id);

    const previousOrderStatus = String(order.status || '').toLowerCase();

    if (internalStatus === 'paid' && previousOrderStatus !== 'paid') {
      const origin = normalizeRequestOrigin(req);
      try {
        await fulfillOrder(supabaseAdmin, {
          orderId,
          email: order.customer_email,
          name: order.customer_name,
        });
        if (order.customer_email) {
          await sendOrderAccessEmail(supabaseAdmin, {
            orderId,
            origin,
            email: order.customer_email,
            name: order.customer_name,
          });
        }
      } catch (finalizeError: any) {
        console.error('[System] finalize-stripe-payment side effects failed:', finalizeError?.message || finalizeError);
      }
    }

    return res.status(200).json({
      status: internalStatus,
      authorized: true,
      paymentIntentId: effectivePaymentIntentId,
    });
  } catch (err: any) {
    console.error('[System] finalize-stripe-payment failed:', err?.message || err);
    return res.status(500).json({ error: 'Failed to finalize Stripe payment' });
  }
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

async function upsertPagbankGatewayOauth(params: {
  supabaseAdmin: any;
  userId: string;
  sandbox: boolean;
  accessToken: string;
  refreshToken?: string | null;
  expiresIn?: number | string | null;
  scope?: string | null;
  tokenType?: string | null;
  accountId?: string | null;
  publicKey?: string | null;
}) {
  const encryptedToken = encrypt(params.accessToken);
  const gatewayName = 'pagseguro';

  const { data: existingGateway, error: existingGatewayError } = await params.supabaseAdmin
    .from('gateways')
    .select('id, config, credentials')
    .eq('user_id', params.userId)
    .eq('name', gatewayName)
    .maybeSingle();

  if (existingGatewayError) throw existingGatewayError;

  const existingConfig = { ...(existingGateway?.config || {}) } as Record<string, any>;
  delete existingConfig.oauth_refresh_token;
  delete existingConfig.oauth_expires_in;
  delete existingConfig.oauth_expires_at;
  delete existingConfig.oauth_account_id;
  delete existingConfig.connected_via_oauth;
  delete existingConfig.oauth_scope;
  delete existingConfig.oauth_token_type;

  const config = {
    ...existingConfig,
    environment: params.sandbox ? 'sandbox' : 'production'
  };

  const credentials = {
    ...((existingGateway?.credentials || {}) as Record<string, any>),
    connected_via_oauth: true,
    oauth_account_id: params.accountId || null,
    oauth_expires_at: params.expiresIn
      ? new Date(Date.now() + (Number(params.expiresIn) * 1000)).toISOString()
      : null,
    oauth_refresh_token: params.refreshToken ? encrypt(params.refreshToken) : null,
    oauth_scope: params.scope || null,
    oauth_token_type: params.tokenType || null
  };

  const gatewayPayload = {
    user_id: params.userId,
    name: gatewayName,
    provider: gatewayName,
    public_key: params.publicKey || '',
    private_key: encryptedToken,
    credentials,
    config,
    active: true,
    is_active: true
  };

  if (existingGateway?.id) {
    const { error } = await params.supabaseAdmin
      .from('gateways')
      .update(gatewayPayload)
      .eq('id', existingGateway.id);

    if (error) throw error;
    return existingGateway.id;
  }

  const { data, error } = await params.supabaseAdmin
    .from('gateways')
    .insert(gatewayPayload)
    .select('id')
    .single();

  if (error) throw error;
  return data?.id || null;
}

const DEFAULT_PAGBANK_OAUTH_REDIRECT_URI = 'https://app.supercheckout.app/api/pagbank-callback';

async function proxyCentralPagbankCallback(req: VercelRequest, res: VercelResponse) {
  const centralApiUrl = getCentralApiUrl();
  if (!centralApiUrl) return false;

  const state = String(req.query.state || '');
  if (!state.startsWith('pbo_')) return false;

  const callbackUrl = new URL(`${centralApiUrl}/pagbank-oauth`);
  callbackUrl.searchParams.set('mode', 'callback');

  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === 'string' && value) {
      callbackUrl.searchParams.set(key, value);
    }
  }

  const response = await fetch(callbackUrl.toString(), {
    method: 'GET',
    redirect: 'manual',
  });

  const location = response.headers.get('location');
  if (location && response.status >= 300 && response.status < 400) {
    return res.redirect(response.status, location);
  }

  const contentType = response.headers.get('content-type') || 'application/json';
  res.status(response.status);
  res.setHeader('Content-Type', contentType);
  res.send(await response.text());
  return true;
}

async function pagbankOauthFinalizeHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = await readJsonBody(req);
  if (!isValidCentralInternalSignature(req, body)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId = String(body.user_id || '').trim();
  const accessToken = String(body.access_token || '').trim();
  const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token.trim() : '';
  const publicKey = typeof body.public_key === 'string' ? body.public_key.trim() : '';
  const tokenType = typeof body.token_type === 'string' ? body.token_type.trim() : '';
  const scope = typeof body.scope === 'string' ? body.scope.trim() : '';
  const accountId = typeof body.account_id === 'string' ? body.account_id.trim() : '';
  const expiresInRaw = body.expires_in;
  const isSandbox = body.environment === 'sandbox' || body.sandbox === true;

  if (!userId || !accessToken) {
    return res.status(400).json({ error: 'Missing OAuth payload' });
  }

  const expiresIn = Number(expiresInRaw);
  if (expiresInRaw != null && (!Number.isFinite(expiresIn) || expiresIn <= 0)) {
    return res.status(400).json({ error: 'Invalid expires_in' });
  }

  const { supabase: supabaseAdmin } = await resolveLocalSupabaseServerClient();
  if (!supabaseAdmin) {
    return res.status(500).json({ error: getLocalSupabaseServerKeyErrorMessage() });
  }

  try {
    await upsertPagbankGatewayOauth({
      supabaseAdmin,
      userId,
      sandbox: isSandbox,
      accessToken,
      refreshToken: refreshToken || null,
      expiresIn: Number.isFinite(expiresIn) ? expiresIn : null,
      scope: scope || null,
      tokenType: tokenType || null,
      accountId: accountId || null,
      publicKey: publicKey || null
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[System] pagbank-oauth-finalize failed:', error?.message || error);
    return res.status(500).json({ error: 'Unable to finalize PagBank OAuth' });
  }
}

async function pagbankOauthStartHandler(req: VercelRequest, res: VercelResponse) {
  const corsAllowed = applyMemberCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (!corsAllowed) return res.status(403).json({ error: 'Origin not allowed' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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

    const body = await readJsonBody(req);
    const isSandbox = Boolean(body.sandbox);

    const { clientId, redirectUri, missingEnv } = getPagbankOauthServerConfig(isSandbox);
    if (missingEnv.length > 0) {
      return res.status(500).json({
        error: `ConfiguraÃ§Ã£o OAuth do PagBank incompleta no servidor (${missingEnv.join(', ')})`
      });
    }

    const { state: oauthState, cookieValue } = buildPagbankOauthState({
      userId: user.id,
      sandbox: isSandbox,
      origin: normalizeRequestOrigin(req)
    });

    res.setHeader('Set-Cookie', buildCookie(PAGBANK_OAUTH_STATE_COOKIE, cookieValue, {
      maxAge: 10 * 60,
      path: '/api'
    }));

    const { PagBankOAuthService } = await import('../src/core/services/pagbankOAuth.js');
    const authorizeUrl = PagBankOAuthService.getAuthorizeUrl(
      clientId,
      redirectUri,
      PAGBANK_OAUTH_SCOPE,
      oauthState,
      isSandbox
    );

    return res.status(200).json({ url: authorizeUrl });
  } catch (err: any) {
    console.error('[System] pagbank-oauth-start failed:', err?.message || err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function pagbankSandboxConnectMockHandler(req: VercelRequest, res: VercelResponse) {
  const corsAllowed = applyMemberCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (!corsAllowed) return res.status(403).json({ error: 'Origin not allowed' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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

    const body = await readJsonBody(req);
    const sellerEmail = String(body.email || '').trim().toLowerCase();
    if (!sellerEmail) {
      return res.status(400).json({ error: 'Informe o e-mail do vendedor teste do Sandbox.' });
    }

    const {
      clientId,
      clientSecret,
      authorizationToken,
      missingEnv
    } = getPagbankOauthServerConfig(true);

    if (missingEnv.length > 0) {
      return res.status(500).json({
        error: `Configuracao OAuth sandbox do PagBank incompleta no servidor (${missingEnv.join(', ')})`
      });
    }

    const authHeaders = {
      Authorization: `Bearer ${authorizationToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      X_CLIENT_ID: clientId,
      X_CLIENT_SECRET: clientSecret,
    };

    const authorizeSmsResponse = await fetch('https://sandbox.api.pagseguro.com/oauth2/authorize/sms', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        bank_branch: '0001',
        account_number: '00000000-1',
      }),
    });

    const authorizeSmsRaw = await authorizeSmsResponse.text();
    const authorizeSmsPayload = JSON.parse(authorizeSmsRaw || '{}');

    if (!authorizeSmsResponse.ok) {
      console.error('[System] PagBank sandbox SMS authorize failed:', authorizeSmsRaw);
      return res.status(502).json({
        error: authorizeSmsPayload?.message
          || authorizeSmsPayload?.error
          || 'Falha ao solicitar autorizacao SMS no sandbox do PagBank.'
      });
    }

    const authorizationId = String(
      authorizeSmsPayload?.authorization_id
      || authorizeSmsPayload?.id
      || authorizeSmsPayload?.data?.authorization_id
      || authorizeSmsPayload?.data?.id
      || ''
    ).trim();

    if (!authorizationId) {
      console.error('[System] PagBank sandbox SMS authorize missing authorization_id:', authorizeSmsRaw);
      return res.status(502).json({ error: 'O PagBank nao retornou authorization_id no sandbox.' });
    }

    const tokenResponse = await fetch('https://sandbox.api.pagseguro.com/oauth2/token', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        grant_type: 'sms',
        sms_code: '123456',
        email: sellerEmail,
        authorization_id: authorizationId,
      }),
    });

    const tokenRaw = await tokenResponse.text();
    const tokenPayload = JSON.parse(tokenRaw || '{}');

    if (!tokenResponse.ok) {
      console.error('[System] PagBank sandbox SMS token failed:', tokenRaw);
      return res.status(502).json({
        error: tokenPayload?.message
          || tokenPayload?.error
          || tokenPayload?.error_messages?.[0]?.description
          || 'Falha ao obter access token sandbox via SMS Mock.'
      });
    }

    const accessTokenValue = String(tokenPayload?.access_token || '').trim();
    if (!accessTokenValue) {
      console.error('[System] PagBank sandbox SMS token missing access_token:', tokenRaw);
      return res.status(502).json({ error: 'O PagBank nao retornou access_token no sandbox.' });
    }

    let publicKey = '';
    try {
      const publicKeyResponse = await fetch('https://sandbox.api.pagseguro.com/public-keys', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessTokenValue}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'card' }),
      });

      const publicKeyRaw = await publicKeyResponse.text();
      const publicKeyPayload = JSON.parse(publicKeyRaw || '{}');
      if (publicKeyResponse.ok) {
        publicKey = String(
          publicKeyPayload?.public_key
          || publicKeyPayload?.publicKey
          || publicKeyPayload?.data?.public_key
          || ''
        ).trim();
      } else {
        console.warn('[System] PagBank sandbox public key generation failed:', publicKeyRaw);
      }
    } catch (publicKeyError) {
      console.warn('[System] PagBank sandbox public key request failed:', publicKeyError);
    }

    await upsertPagbankGatewayOauth({
      supabaseAdmin,
      userId: user.id,
      sandbox: true,
      accessToken: accessTokenValue,
      refreshToken: typeof tokenPayload?.refresh_token === 'string' ? tokenPayload.refresh_token.trim() : null,
      expiresIn: Number(tokenPayload?.expires_in || 0) || null,
      scope: typeof tokenPayload?.scope === 'string' ? tokenPayload.scope.trim() : null,
      tokenType: typeof tokenPayload?.token_type === 'string' ? tokenPayload.token_type.trim() : null,
      accountId: typeof tokenPayload?.account_id === 'string' ? tokenPayload.account_id.trim() : null,
      publicKey: publicKey || null,
    });

    return res.status(200).json({
      success: true,
      source: 'sandbox_sms_mock',
      has_public_key: Boolean(publicKey),
    });
  } catch (err: any) {
    console.error('[System] pagbank-sandbox-connect-mock failed:', err?.message || err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function pagbankOauthCallbackHandler(req: VercelRequest, res: VercelResponse) {
  // This is a GET request initiated by PagBank's redirection
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (await proxyCentralPagbankCallback(req, res)) {
    return;
  }

  const code = String(req.query.code || '');
  const stateEncrypted = String(req.query.state || '');
  const errorParam = String(req.query.error || '');

  const oauthCode = code;
  const oauthState = stateEncrypted;
  const providerError = errorParam;
  const providerErrorDescription = String(req.query.error_description || '');
  const clearStateCookie = clearCookie(PAGBANK_OAUTH_STATE_COOKIE, '/api');

  let oauthStateData: any = {};
  let baseOrigin = DEFAULT_ALLOWED_ORIGIN;

  if (providerError) {
    try {
      if (oauthState) {
        oauthStateData = parsePagbankOauthState(req, oauthState);
        baseOrigin = String(oauthStateData?.origin || DEFAULT_ALLOWED_ORIGIN);
      }
    } catch (stateError) {
      console.warn('[System] PagBank OAuth state could not be restored after provider error:', stateError);
    }

    res.setHeader('Set-Cookie', clearStateCookie);
    console.error('[System] PagBank OAuth returned error:', providerError, providerErrorDescription);

    if (providerError === 'access_denied') {
      return res.redirect(302, buildAdminGatewaysRedirect(baseOrigin, {
        error: 'pagbank_oauth_denied'
      }));
    }

    return res.redirect(302, buildAdminGatewaysRedirect(baseOrigin, {
      error: 'pagbank_oauth_provider_error',
      provider_error: providerError,
      provider_error_description: providerErrorDescription || 'Erro retornado pelo PagBank'
    }));
  }

  if (!oauthCode || !oauthState) {
    res.setHeader('Set-Cookie', clearStateCookie);
    return res.status(400).json({ error: 'Missing code or state' });
  }

  try {
    oauthStateData = parsePagbankOauthState(req, oauthState);
    baseOrigin = String(oauthStateData?.origin || DEFAULT_ALLOWED_ORIGIN);
  } catch (stateError) {
    console.error('[System] PagBank OAuth state validation failed:', stateError);
    res.setHeader('Set-Cookie', clearStateCookie);
    return res.status(400).json({ error: 'Invalid state parameter' });
  }

  const { userId, sandbox, origin } = oauthStateData;
  const isOauthSandbox = Boolean(sandbox);

  try {
    const {
      clientId,
      clientSecret,
      authorizationToken,
      redirectUri,
      missingEnv
    } = getPagbankOauthServerConfig(isOauthSandbox);

    if (missingEnv.length > 0) {
      throw new Error(`ConfiguraÃ§Ãµes OAuth do PagBank ausentes no servidor (${missingEnv.join(', ')})`);
    }

    const { PagBankOAuthService } = await import('../src/core/services/pagbankOAuth.js');
    const tokenResponse = await PagBankOAuthService.exchangeCodeForToken(
      oauthCode,
      redirectUri,
      clientId,
      clientSecret,
      authorizationToken,
      isOauthSandbox
    );

    const { supabase: supabaseAdmin } = await resolveLocalSupabaseServerClient();
    if (!supabaseAdmin) {
      throw new Error(getLocalSupabaseServerKeyErrorMessage());
    }

    const encryptedToken = encrypt(tokenResponse.access_token);
    const gatewayName = 'pagseguro';
    const resolvedOrigin = origin || baseOrigin || DEFAULT_ALLOWED_ORIGIN;

    const { data: existingGateway } = await supabaseAdmin
      .from('gateways')
      .select('id, config, credentials')
      .eq('user_id', userId)
      .eq('name', gatewayName)
      .maybeSingle();

    const existingConfig = { ...(existingGateway?.config || {}) } as Record<string, any>;
    delete existingConfig.oauth_refresh_token;
    delete existingConfig.oauth_expires_in;
    delete existingConfig.oauth_expires_at;
    delete existingConfig.oauth_account_id;
    delete existingConfig.connected_via_oauth;
    delete existingConfig.oauth_scope;
    delete existingConfig.oauth_token_type;

    const config = {
      ...existingConfig,
      environment: isOauthSandbox ? 'sandbox' : 'production'
    };

    const credentials = {
      ...((existingGateway?.credentials || {}) as Record<string, any>),
      connected_via_oauth: true,
      oauth_account_id: tokenResponse.account_id || null,
      oauth_expires_at: tokenResponse.expires_in
        ? new Date(Date.now() + (Number(tokenResponse.expires_in) * 1000)).toISOString()
        : null,
      oauth_refresh_token: tokenResponse.refresh_token ? encrypt(tokenResponse.refresh_token) : null,
      oauth_scope: tokenResponse.scope || null,
      oauth_token_type: tokenResponse.token_type || null
    };

    if (existingGateway?.id) {
      await supabaseAdmin.from('gateways').update({
        private_key: encryptedToken,
        credentials,
        config,
        active: true,
        is_active: true
      }).eq('id', existingGateway.id);
    } else {
      await supabaseAdmin.from('gateways').insert({
        user_id: userId,
        name: gatewayName,
        provider: gatewayName,
        private_key: encryptedToken,
        credentials,
        config,
        active: true,
        is_active: true
      });
    }

    res.setHeader('Set-Cookie', clearStateCookie);
    return res.redirect(302, buildAdminGatewaysRedirect(resolvedOrigin, {
      success: 'pagbank_oauth'
    }));
  } catch (oauthError: any) {
    console.error('[System] PagBank OAuth callback failed:', oauthError?.message || oauthError);
    res.setHeader('Set-Cookie', clearStateCookie);
    return res.redirect(302, buildAdminGatewaysRedirect(origin || baseOrigin, {
      error: 'pagbank_oauth_failed'
    }));
  }
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
                return await (await import('../src/core/api/health.js')).default(req, res);
            case 'proxy':
                return await (await import('../src/core/api/proxy.js')).default(req, res);
            case 'send-email':
                return await (await import('../src/core/api/send-email.js')).default(req, res);
            case 'demo-webhooks':
                return await (await import('../src/core/api/demo-webhooks.js')).default(req, res);
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
            case 'consent-preferences':
                return await consentPreferencesHandler(req, res);
            case 'finalize-stripe-payment':
                return await finalizeStripePaymentHandler(req, res);
            case 'upsell-eligibility':
                return await upsellEligibilityHandler(req, res);
            case 'member-password-reset':
                return await memberPasswordResetHandler(req, res);
            case 'pagbank-oauth-start':
                return await pagbankOauthStartHandler(req, res);
            case 'pagbank-sandbox-connect-mock':
                return await pagbankSandboxConnectMockHandler(req, res);
            case 'pagbank-oauth-callback':
                return await pagbankOauthCallbackHandler(req, res);
            case 'pagbank-oauth-finalize':
                return await pagbankOauthFinalizeHandler(req, res);
            default:
                return res.status(404).json({ error: `Action ${action} not found in System Controller` });
        }
    } catch (error: any) {
        console.error('[System] Controller error:', error?.message || error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

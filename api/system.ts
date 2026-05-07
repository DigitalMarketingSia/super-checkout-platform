import type { VercelRequest, VercelResponse } from '@vercel/node';
import healthHandler from '../src/core/api/health.js';
import proxyHandler from '../src/core/api/proxy.js';
import sendEmailHandler from '../src/core/api/send-email.js';

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
    const { orderId } = req.query;

    if (!orderId || typeof orderId !== 'string') {
        return res.status(400).json({ error: 'Missing orderId' });
    }

    if (!UUID_REGEX.test(orderId)) {
        return res.status(400).json({ error: 'Invalid orderId' });
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
        const errorText = await orderRes.text();
        console.error('[System] Fallback check-status failed to fetch order:', errorText);
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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const anonKey = getSupabaseAnonKey();

    if (!supabaseUrl || !anonKey) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const gatewayRes = await fetch(
        `${supabaseUrl}/rest/v1/gateways?id=eq.${encodeURIComponent(id)}&select=id,name,provider,public_key,active,is_active,config&limit=1`,
        {
            headers: {
                apikey: anonKey,
                Authorization: `Bearer ${anonKey}`,
            },
        },
    );

    if (!gatewayRes.ok) {
        const text = await gatewayRes.text();
        console.error('[System] public-gateway lookup failed:', text);
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

import crypto from 'crypto';

const AUTO_LOGIN_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getServiceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

export function createLoginToken(email: string): string {
  const secret = getServiceRoleKey();
  if (!secret) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY for token signing.');

  const payload = JSON.stringify({ email: email.toLowerCase().trim(), exp: Date.now() + AUTO_LOGIN_TOKEN_MAX_AGE_MS });
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

function verifyLoginToken(token: string): { email: string } | null {
  const secret = getServiceRoleKey();
  if (!secret || !token) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');

  if (sig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    if (!payload.email || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}

async function autoLoginHandler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const { token } = body;
  if (!token) return res.status(400).json({ error: 'Missing token' });

  const verified = verifyLoginToken(token);
  if (!verified) return res.status(401).json({ error: 'Invalid or expired token' });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = getServiceRoleKey();
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Generate magic link token server-side
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: verified.email,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('[AutoLogin] generateLink failed:', linkError?.message);
      return res.status(500).json({ error: 'Failed to generate session' });
    }

    // Verify the token server-side via GoTrue API
    const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
      },
      body: JSON.stringify({
        token_hash: linkData.properties.hashed_token,
        type: 'email',
      }),
    });

    if (!verifyRes.ok) {
      const errBody = await verifyRes.text();
      console.error('[AutoLogin] GoTrue verify failed:', verifyRes.status, errBody);
      return res.status(500).json({ error: 'Session verification failed' });
    }

    const sessionData = await verifyRes.json();
    if (!sessionData?.access_token) {
      console.error('[AutoLogin] No access_token in verify response');
      return res.status(500).json({ error: 'No session returned' });
    }

    return res.status(200).json({
      access_token: sessionData.access_token,
      refresh_token: sessionData.refresh_token,
    });
  } catch (err: any) {
    console.error('[AutoLogin] Error:', err.message);
    return res.status(500).json({ error: 'Internal error' });
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
                return await healthHandler(req, res);
            case 'proxy':
                return await proxyHandler(req, res);
            case 'send-email':
                return await sendEmailHandler(req, res);
            case 'public-gateway':
                return await publicGatewayHandler(req, res);
            case 'auto-login':
                return await autoLoginHandler(req, res);
            default:
                return res.status(404).json({ error: `Action ${action} not found in System Controller` });
        }
    } catch (error: any) {
        console.error('[System] Controller error:', error?.message || error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import healthHandler from '../src/core/api/health.js';
import proxyHandler from '../src/core/api/proxy.js';
import sendEmailHandler from '../src/core/api/send-email.js';
import { sendOrderAccessEmail } from '../src/core/services/orderEmail.js';
import { verifyLoginToken } from '../src/core/utils/loginToken.js';

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

function getSupabaseServiceKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY;
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
    const supabaseKey = getSupabaseServiceKey() || getSupabaseAnonKey();

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const gatewayRes = await fetch(
        `${supabaseUrl}/rest/v1/gateways?id=eq.${encodeURIComponent(id)}&select=id,name,provider,public_key,active,is_active,config&limit=1`,
        {
            headers: {
                apikey: supabaseKey,
                Authorization: `Bearer ${supabaseKey}`,
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
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.CENTRAL_SERVICE_ROLE_KEY;
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

async function resendOrderAccessHandler(req: VercelRequest, res: VercelResponse) {
  const corsAllowed = applyPublicCors(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (!corsAllowed) return res.status(403).json({ error: 'Origin not allowed' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const orderId = String(body.orderId || '').trim();
  if (!UUID_REGEX.test(orderId)) {
    return res.status(400).json({ error: 'Invalid orderId' });
  }

  const authHeader = String(req.headers.authorization || '');
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
  if (!accessToken) return res.status(401).json({ error: 'Missing authorization token' });

  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);
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
    return res.status(500).json({ error: err?.message || 'Failed to resend access email' });
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const email = String(body.email || '').trim().toLowerCase();
  const memberAreaSlug = String(body.member_area_slug || '').trim();
  if (!email || !memberAreaSlug || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(200).json({ message: 'Processado.' });
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);
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
      const resendData = await resendRes.json().catch(() => ({}));
      console.warn('[System] member reset email rejected:', JSON.stringify(resendData).slice(0, 300));
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

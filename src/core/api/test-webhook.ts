import { createHmac } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { logAuthzEvent, requireApiAuth } from './_authz.js';
import { applyCors } from './_cors.js';
import { enforceApiRateLimit } from './_rate-limit.js';

const MAX_TIMEOUT_MS = 15_000;
const WEBHOOK_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

type StoredWebhook = {
  id: string;
  url: string;
  method?: string | null;
  headers?: unknown;
  secret?: string | null;
  signature_mode?: string | null;
};

function parseBody(req: VercelRequest) {
  if (!req.body) return {} as Record<string, unknown>;
  if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body as Record<string, unknown>;
  }

  try {
    return JSON.parse(Buffer.from(req.body).toString('utf8')) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

function hmacSha256Hex(secret: string, message: string) {
  return createHmac('sha256', secret).update(message).digest('hex');
}

function getSafeWebhookUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return null;

    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host === '0.0.0.0' || host === '::1' || host === '[::1]') return null;
    if (host.startsWith('127.') || host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('169.254.')) return null;

    const ipv4Parts = host.split('.').map(Number);
    if (ipv4Parts.length === 4 && ipv4Parts.every(Number.isInteger) && ipv4Parts[0] === 172 && ipv4Parts[1] >= 16 && ipv4Parts[1] <= 31) return null;
    if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:') || host.startsWith('[fc') || host.startsWith('[fd') || host.startsWith('[fe80:')) return null;

    return url;
  } catch {
    return null;
  }
}

function addCustomHeaders(headers: Record<string, string>, source: unknown) {
  if (!Array.isArray(source)) return;

  for (const item of source) {
    if (!item || typeof item !== 'object') continue;
    const key = String((item as Record<string, unknown>).key || '').trim();
    const value = String((item as Record<string, unknown>).value || '').trim();
    if (!HEADER_NAME_PATTERN.test(key) || !value || /[\r\n]/.test(value)) continue;
    headers[key] = value;
  }
}

function updateTestUrl(url: URL, method: string, payloadTimestamp: string) {
  if (method !== 'GET') return url.toString();

  url.searchParams.set('test', 'true');
  url.searchParams.set('event', 'pagamento.aprovado');
  url.searchParams.set('timestamp', payloadTimestamp);
  return url.toString();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(req, res, 'OPTIONS,POST');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireApiAuth(req, res, {
    source: 'webhook_test',
    allowedRoles: ['owner', 'admin', 'master_admin'],
  });
  if (!auth) return;

  const webhookId = String(parseBody(req).webhook_id || '').trim();
  if (!WEBHOOK_ID_PATTERN.test(webhookId)) {
    return res.status(400).json({ error: 'Invalid webhook' });
  }

  const rateLimit = enforceApiRateLimit(req, res, {
    scope: 'webhook_test',
    identifiers: [auth.user.id, webhookId],
    limit: 30,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) return res.status(429).json({ error: 'Too many test requests' });

  const { data, error } = await auth.supabaseAdmin
    .from('webhooks')
    .select('id,url,method,headers,secret,signature_mode')
    .eq('id', webhookId)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (error) {
    console.error('[webhook_test] Could not load webhook:', error.message);
    return res.status(500).json({ error: 'Unable to test webhook' });
  }
  if (!data) return res.status(404).json({ error: 'Webhook not found' });

  const webhook = data as StoredWebhook;
  const targetUrl = getSafeWebhookUrl(webhook.url);
  if (!targetUrl) return res.status(400).json({ error: 'Webhook URL is not allowed' });

  const method = ['POST', 'PUT', 'PATCH', 'GET'].includes(String(webhook.method || '').toUpperCase())
    ? String(webhook.method).toUpperCase()
    : 'POST';
  const payloadTimestamp = new Date().toISOString();
  const payload = {
    test: true,
    event: 'pagamento.aprovado',
    timestamp: payloadTimestamp,
  };
  const rawBody = method === 'GET' ? '' : JSON.stringify(payload);
  const headers: Record<string, string> = {};
  addCustomHeaders(headers, webhook.headers);
  headers['Content-Type'] = 'application/json';
  headers['X-Super-Checkout-Event'] = 'pagamento.aprovado';

  if (webhook.secret) {
    if (webhook.signature_mode === 'legacy') {
      headers['X-Super-Checkout-Signature'] = webhook.secret;
    } else {
      const signatureTimestamp = Math.floor(Date.now() / 1000).toString();
      const signature = hmacSha256Hex(webhook.secret, `${signatureTimestamp}.${rawBody}`);
      headers['X-Super-Checkout-Timestamp'] = signatureTimestamp;
      headers['X-Super-Checkout-Signature'] = `sha256=${signature}`;
      headers['X-Super-Checkout-Signature-Version'] = 'v1';
    }
  }

  try {
    const response = await fetch(updateTestUrl(targetUrl, method, payloadTimestamp), {
      method,
      headers,
      body: rawBody || undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(MAX_TIMEOUT_MS),
    });

    await auth.supabaseAdmin
      .from('webhooks')
      .update({ last_fired_at: new Date().toISOString(), last_status: response.status })
      .eq('id', webhook.id)
      .eq('user_id', auth.user.id);

    if (!response.ok) return res.status(502).json({ error: 'Webhook endpoint returned an error', status: response.status });

    await logAuthzEvent({
      supabaseAdmin: auth.supabaseAdmin,
      req,
      source: 'webhook_test',
      eventType: 'webhook_test_dispatched',
      severity: 'INFO',
      userId: auth.user.id,
      metadata: { webhook_id: webhook.id, status: response.status },
    });

    return res.status(200).json({ success: true, status: response.status });
  } catch (dispatchError: any) {
    console.warn('[webhook_test] Delivery failed:', dispatchError?.name || 'request_error');
    await auth.supabaseAdmin
      .from('webhooks')
      .update({ last_fired_at: new Date().toISOString(), last_status: 599 })
      .eq('id', webhook.id)
      .eq('user_id', auth.user.id);
    return res.status(502).json({ error: 'Unable to reach webhook endpoint' });
  }
}

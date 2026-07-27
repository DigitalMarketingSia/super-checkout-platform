import type { VercelRequest, VercelResponse } from '@vercel/node';
import { logAuthzEvent, requireApiAuth } from './_authz.js';
import { applyCors } from './_cors.js';
import { enforceApiRateLimit } from './_rate-limit.js';
import {
  buildWebhookTestHeaders,
  getSafeWebhookUrl,
  updateWebhookTestUrl,
  WEBHOOK_TEST_EVENT,
} from './_webhook-test-utils.js';

const MAX_TIMEOUT_MS = 15_000;
const WEBHOOK_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
    event: WEBHOOK_TEST_EVENT,
    timestamp: payloadTimestamp,
  };
  const rawBody = method === 'GET' ? '' : JSON.stringify(payload);
  const signatureTimestamp = Math.floor(Date.now() / 1000).toString();
  const headers = buildWebhookTestHeaders({
    customHeaders: webhook.headers,
    secret: webhook.secret,
    signatureMode: webhook.signature_mode,
    timestamp: signatureTimestamp,
    rawBody,
  });

  try {
    const response = await fetch(updateWebhookTestUrl(targetUrl, method, payloadTimestamp), {
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

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from './_cors.js';
import { logAuthzEvent, requireApiAuth } from './_authz.js';
import { enforceApiRateLimit } from './_rate-limit.js';
import {
  buildCentralControlPlaneTrustHeaders,
  getCentralControlPlaneHmacKey,
} from './_central-control-plane-trust.js';

const OFFICIAL_CENTRAL_API_URL = 'https://bcmnryxjweiovrwmztpn.supabase.co/functions/v1';
const ALLOWED_ACTIONS = new Set(['list', 'update', 'toggle']);

function parseBody(req: VercelRequest) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function resolveCentralApiUrl() {
  return String(
    process.env.CENTRAL_API_URL
    || process.env.VITE_CENTRAL_API_URL
    || process.env.NEXT_PUBLIC_CENTRAL_API_URL
    || OFFICIAL_CENTRAL_API_URL,
  ).replace(/\/+$/, '');
}

async function callCentral(action: string, payload: Record<string, unknown>) {
  let key: string | null = null;
  try {
    key = getCentralControlPlaneHmacKey();
  } catch (error: any) {
    return { ok: false, status: 503, payload: {}, error: error?.message || 'central_control_plane_key_invalid' };
  }
  if (!key) return { ok: false, status: 503, payload: {}, error: 'central_control_plane_key_missing' };

  const rawBody = JSON.stringify({ action, ...payload });
  const headers = buildCentralControlPlaneTrustHeaders({
    key,
    method: 'POST',
    endpoint: 'platform-email-templates',
    rawBody,
  });

  try {
    const response = await fetch(`${resolveCentralApiUrl()}/platform-email-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: rawBody,
    });
    const responsePayload = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      payload: responsePayload,
      error: response.ok ? null : String(responsePayload?.error || 'central_platform_template_request_failed'),
    };
  } catch {
    return { ok: false, status: 502, payload: {}, error: 'central_platform_template_unreachable' };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(req, res, 'GET,OPTIONS,POST');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireApiAuth(req, res, {
    source: 'platform_email_templates',
    allowedRoles: ['master_admin'],
  });
  if (!auth) return;

  const body = req.method === 'POST' ? parseBody(req) as Record<string, unknown> : {};
  const action = req.method === 'GET' ? 'list' : String(body.action || '').trim().toLowerCase();
  if (!ALLOWED_ACTIONS.has(action)) return res.status(400).json({ error: 'Invalid platform template action' });

  const rateLimit = enforceApiRateLimit(req, res, {
    scope: `platform_email_templates:${action}`,
    identifiers: [auth.user.id],
    limit: action === 'list' ? 60 : 20,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) return res.status(429).json({ error: 'Too many platform template attempts' });

  const central = await callCentral(action, body);
  if (!central.ok) {
    await logAuthzEvent({
      supabaseAdmin: auth.supabaseAdmin,
      req,
      source: 'platform_email_templates',
      eventType: 'platform_email_template_request_failed',
      severity: 'WARNING',
      userId: auth.user.id,
      metadata: { action, status: central.status, error: central.error },
    });
    return res.status(central.status).json({ error: 'Platform template request failed', code: central.error });
  }

  if (action !== 'list') {
    await logAuthzEvent({
      supabaseAdmin: auth.supabaseAdmin,
      req,
      source: 'platform_email_templates',
      eventType: action === 'update' ? 'platform_email_template_updated' : 'platform_email_template_toggled',
      severity: 'INFO',
      userId: auth.user.id,
      metadata: { action, template_id: String(body.id || '').slice(0, 64) || null },
    });
  }

  return res.status(200).json(central.payload);
}

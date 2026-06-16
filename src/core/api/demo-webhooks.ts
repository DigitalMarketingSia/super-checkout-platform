import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enforceApiRateLimit } from './_rate-limit.js';
import { encrypt, decrypt } from '../utils/cryptoUtils.js';
import {
  DEMO_WEBHOOK_ALLOWED_METHODS,
  DEMO_WEBHOOK_SUPPORTED_EVENTS,
} from '../config/demoWebhooks.js';
import type { WebhookConfig, WebhookHeader, WebhookLog } from '../types.js';

const COOKIE_NAME = 'sc_demo_webhooks';
const COOKIE_TTL_SECONDS = 24 * 60 * 60;
const MAX_WEBHOOKS = 6;
const MAX_HEADERS = 8;
const MAX_EVENTS = 10;
const MAX_RESPONSE_BODY_LENGTH = 600;
const MAX_SECRET_LENGTH = 240;
const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 180;
const MAX_URL_LENGTH = 1024;

type DemoWebhookAction = 'sync' | 'dispatch' | 'clear';

interface DispatchBody {
  action: 'dispatch';
  event: string;
  eventAliases?: string[];
  payload?: Record<string, unknown>;
  targetWebhookId?: string;
  bypassEventFilter?: boolean;
}

function parseCookies(req: VercelRequest) {
  const raw = String(req.headers.cookie || '');
  if (!raw) return {} as Record<string, string>;

  return Object.fromEntries(
    raw
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [key, ...rest] = entry.split('=');
        return [key, decodeURIComponent(rest.join('=') || '')];
      }),
  );
}

function buildCookie(name: string, value: string, maxAgeSeconds = COOKIE_TTL_SECONDS) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; ');
}

function clearCookie(name: string) {
  return buildCookie(name, '', 0);
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

function normalizeHeaderValue(value: unknown) {
  return String(value || '').trim();
}

function sanitizeHeaders(input: unknown): WebhookHeader[] {
  if (!Array.isArray(input)) return [];

  const headers: WebhookHeader[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;

    const key = normalizeHeaderValue((item as Record<string, unknown>).key).slice(0, 80);
    const value = normalizeHeaderValue((item as Record<string, unknown>).value).slice(0, 300);
    if (!key || !value) continue;
    headers.push({ key, value });
    if (headers.length >= MAX_HEADERS) break;
  }

  return headers;
}

function sanitizeUrl(rawUrl: unknown) {
  const candidate = String(rawUrl || '').trim();
  if (!candidate) return '';

  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return '';
    return url.toString().slice(0, MAX_URL_LENGTH);
  } catch {
    return '';
  }
}

function sanitizeEvents(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  return Array.from(new Set(
    input
      .map((event) => String(event || '').trim())
      .filter((event) => DEMO_WEBHOOK_SUPPORTED_EVENTS.includes(event)),
  )).slice(0, MAX_EVENTS);
}

function sanitizeWebhook(input: unknown): WebhookConfig | null {
  if (!input || typeof input !== 'object') return null;
  const source = input as Record<string, unknown>;

  const id = String(source.id || '').trim().slice(0, 100);
  const name = String(source.name || '').trim().slice(0, MAX_NAME_LENGTH);
  const url = sanitizeUrl(source.url);
  const methodCandidate = String(source.method || 'POST').trim().toUpperCase();
  const method = DEMO_WEBHOOK_ALLOWED_METHODS.includes(methodCandidate as any)
    ? methodCandidate as WebhookConfig['method']
    : 'POST';
  const events = sanitizeEvents(source.events);
  const headers = sanitizeHeaders(source.headers);
  const createdAt = String(source.created_at || new Date().toISOString());
  const description = String(source.description || '').trim().slice(0, MAX_DESCRIPTION_LENGTH);
  const secret = String(source.secret || '').trim().slice(0, MAX_SECRET_LENGTH);

  if (!id || !name || !url || events.length === 0) return null;

  return {
    id,
    name,
    description: description || undefined,
    url,
    method,
    headers,
    events,
    active: source.active !== false,
    secret: secret || undefined,
    created_at: createdAt,
    last_fired_at: typeof source.last_fired_at === 'string' ? source.last_fired_at : undefined,
    last_status: typeof source.last_status === 'number' ? source.last_status : undefined,
  };
}

function sanitizeWebhookList(input: unknown): WebhookConfig[] {
  if (!Array.isArray(input)) return [];

  const hooks: WebhookConfig[] = [];
  for (const item of input) {
    const sanitized = sanitizeWebhook(item);
    if (!sanitized) continue;
    hooks.push(sanitized);
    if (hooks.length >= MAX_WEBHOOKS) break;
  }

  return hooks;
}

function encodeWebhookCookie(webhooks: WebhookConfig[]) {
  return encrypt(JSON.stringify({
    issued_at: new Date().toISOString(),
    webhooks,
  }));
}

function decodeWebhookCookie(req: VercelRequest): WebhookConfig[] {
  const cookies = parseCookies(req);
  const encrypted = String(cookies[COOKIE_NAME] || '').trim();
  if (!encrypted) return [];

  try {
    const raw = decrypt(encrypted);
    const parsed = JSON.parse(raw) as { webhooks?: unknown };
    return sanitizeWebhookList(parsed?.webhooks);
  } catch {
    return [];
  }
}

function buildGetUrl(baseUrl: string, payload: Record<string, unknown>) {
  const url = new URL(baseUrl);
  url.searchParams.set('event', String(payload.event || ''));
  url.searchParams.set('demo', String(payload.demo === true));
  url.searchParams.set('payload', JSON.stringify(payload));
  return url.toString();
}

function shouldDispatchWebhook(params: {
  hook: WebhookConfig;
  event: string;
  aliases: string[];
  bypassEventFilter: boolean;
  targetWebhookId?: string;
}) {
  if (!params.hook.active) return false;
  if (params.targetWebhookId && params.hook.id !== params.targetWebhookId) return false;
  if (params.bypassEventFilter) return true;

  const allowedEvents = new Set(params.hook.events || []);
  if (allowedEvents.has(params.event)) return true;

  return params.aliases.some((alias) => allowedEvents.has(alias));
}

async function dispatchToWebhook(params: {
  hook: WebhookConfig;
  event: string;
  payload: Record<string, unknown>;
}): Promise<WebhookLog> {
  const startedAt = Date.now();
  const body = JSON.stringify(params.payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Super-Checkout-Event': params.event,
    'X-Super-Checkout-Demo': 'true',
  };

  for (const header of params.hook.headers || []) {
    headers[header.key] = header.value;
  }

  if (params.hook.secret) {
    headers['X-Super-Checkout-Signature'] = params.hook.secret;
  }

  try {
    const response = await fetch(
      params.hook.method === 'GET'
        ? buildGetUrl(params.hook.url, params.payload)
        : params.hook.url,
      {
        method: params.hook.method || 'POST',
        headers,
        body: params.hook.method === 'GET' ? undefined : body,
      },
    );

    const responseBody = await response.text().catch(() => '');

    return {
      id: `demo-whlog-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      webhook_id: params.hook.id,
      direction: 'outgoing',
      event: params.event,
      payload: body,
      response_status: response.status,
      response_body: responseBody.slice(0, MAX_RESPONSE_BODY_LENGTH),
      duration_ms: Date.now() - startedAt,
      created_at: new Date().toISOString(),
    };
  } catch (error: any) {
    return {
      id: `demo-whlog-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      webhook_id: params.hook.id,
      direction: 'outgoing',
      event: params.event,
      payload: body,
      response_status: 599,
      response_body: String(error?.message || 'Webhook request failed').slice(0, MAX_RESPONSE_BODY_LENGTH),
      duration_ms: Date.now() - startedAt,
      created_at: new Date().toISOString(),
    };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = await readJsonBody(req);
  const action = String(body?.action || '').trim() as DemoWebhookAction;

  if (!['sync', 'dispatch', 'clear'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  if (action === 'dispatch') {
    const rateLimit = enforceApiRateLimit(req, res, {
      scope: 'demo_webhook_dispatch',
      identifiers: [
        String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown'),
        String((body as DispatchBody).event || ''),
      ],
      limit: 180,
      windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return res.status(429).json({ error: 'Too many requests' });
    }
  }

  try {
    if (action === 'clear') {
      res.setHeader('Set-Cookie', clearCookie(COOKIE_NAME));
      return res.status(200).json({ success: true });
    }

    if (action === 'sync') {
      const sanitizedHooks = sanitizeWebhookList(body?.webhooks);
      if (sanitizedHooks.length === 0) {
        res.setHeader('Set-Cookie', clearCookie(COOKIE_NAME));
        return res.status(200).json({ success: true, active: 0 });
      }

      res.setHeader('Set-Cookie', buildCookie(COOKIE_NAME, encodeWebhookCookie(sanitizedHooks)));
      return res.status(200).json({
        success: true,
        active: sanitizedHooks.filter((hook) => hook.active).length,
      });
    }

    const dispatchBody = body as DispatchBody;
    const hooks = decodeWebhookCookie(req);
    const event = String(dispatchBody.event || '').trim();
    const eventAliases = Array.isArray(dispatchBody.eventAliases)
      ? Array.from(new Set(dispatchBody.eventAliases.map((alias) => String(alias || '').trim()).filter(Boolean)))
      : [];

    if (!event || !hooks.length) {
      return res.status(200).json({
        success: true,
        matched: 0,
        delivered: 0,
        logs: [],
      });
    }

    const payload = dispatchBody.payload && typeof dispatchBody.payload === 'object'
      ? dispatchBody.payload
      : {};

    const matchingHooks = hooks.filter((hook) => shouldDispatchWebhook({
      hook,
      event,
      aliases: eventAliases,
      bypassEventFilter: dispatchBody.bypassEventFilter === true,
      targetWebhookId: dispatchBody.targetWebhookId,
    }));

    if (matchingHooks.length === 0) {
      return res.status(200).json({
        success: true,
        matched: 0,
        delivered: 0,
        logs: [],
      });
    }

    const logs = await Promise.all(
      matchingHooks.map((hook) => dispatchToWebhook({
        hook,
        event,
        payload,
      })),
    );

    return res.status(200).json({
      success: true,
      matched: matchingHooks.length,
      delivered: logs.filter((log) => Number(log.response_status || 0) >= 200 && Number(log.response_status || 0) < 300).length,
      logs,
    });
  } catch (error: any) {
    console.error('[DemoWebhookAPI] Error:', error?.message || error);
    return res.status(500).json({
      error: 'Nao foi possivel processar os webhooks demo.',
    });
  }
}

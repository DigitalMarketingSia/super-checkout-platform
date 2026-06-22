import type { VercelRequest, VercelResponse } from '@vercel/node';
import { logAuthzEvent, requireApiAuth } from '../_authz.js';
import { enforceApiRateLimit } from '../_rate-limit.js';

const DEFAULT_CONTENT_ORDER = ['video', 'text', 'file', 'image'] as const;
const ALLOWED_CONTENT_ORDER_SECTIONS = new Set(DEFAULT_CONTENT_ORDER);
const ALLOWED_PLAN_SCOPES = new Set(['all', 'starter', 'agency', 'master']);

function normalizeEmail(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function getMasterAdminEmails() {
  return new Set(
    String(process.env.MASTER_ADMIN_EMAILS || '')
      .split(',')
      .map((email) => normalizeEmail(email))
      .filter(Boolean),
  );
}

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

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTextContent(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function normalizeNullableUrl(value: unknown) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }

  return fallback;
}

function normalizeOrder(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

function normalizePlanScope(value: unknown) {
  const normalized = normalizeString(value).toLowerCase();
  return ALLOWED_PLAN_SCOPES.has(normalized) ? normalized : 'all';
}

function normalizeContentOrder(value: unknown) {
  if (!Array.isArray(value)) return [...DEFAULT_CONTENT_ORDER];

  const unique: string[] = [];
  for (const entry of value) {
    const normalized = normalizeString(entry).toLowerCase();
    if (!ALLOWED_CONTENT_ORDER_SECTIONS.has(normalized as typeof DEFAULT_CONTENT_ORDER[number])) continue;
    if (unique.includes(normalized)) continue;
    unique.push(normalized);
  }

  return unique.length > 0 ? unique : [...DEFAULT_CONTENT_ORDER];
}

function inferActivationType(params: {
  content: string;
  videoUrl: string | null;
  fileUrl: string | null;
  imageUrl: string | null;
}) {
  if (params.videoUrl) return 'video';
  if (params.fileUrl) return 'file';
  if (params.imageUrl) return 'image';

  const trimmedContent = params.content.trim();
  if (/^https?:\/\//i.test(trimmedContent)) return 'link';
  if (trimmedContent) return 'text';

  return 'text';
}

function buildActivationContentPayload(raw: Record<string, unknown>) {
  const content = normalizeTextContent(raw.content);
  const videoUrl = normalizeNullableUrl(raw.video_url);
  const fileUrl = normalizeNullableUrl(raw.file_url);
  const imageUrl = normalizeNullableUrl(raw.image_url);

  return {
    title: normalizeString(raw.title),
    type: inferActivationType({ content, videoUrl, fileUrl, imageUrl }),
    content,
    description: normalizeTextContent(raw.description),
    plan_scope: normalizePlanScope(raw.plan_scope),
    order: normalizeOrder(raw.order, 0),
    active: normalizeBoolean(raw.active, true),
    video_url: videoUrl,
    file_url: fileUrl,
    image_url: imageUrl,
    content_order: normalizeContentOrder(raw.content_order),
  };
}

function getIdFromRequest(req: VercelRequest) {
  const queryId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (queryId) return normalizeString(queryId);

  const body = parseBody(req);
  return normalizeString(body.id);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST', 'DELETE'].includes(req.method || '')) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireApiAuth(req, res, {
    source: 'admin_activation_content',
    allowedRoles: ['admin', 'owner', 'master_admin'],
  });
  if (!auth) return;

  const { supabaseAdmin, user, profile, role } = auth;
  const masterAdminEmails = getMasterAdminEmails();
  const isSystemOwner = role === 'master_admin'
    || (masterAdminEmails.size > 0
      && (masterAdminEmails.has(normalizeEmail(user.email)) || masterAdminEmails.has(normalizeEmail(profile.email))));

  if (!isSystemOwner) {
    return res.status(403).json({ error: 'System owner access required.' });
  }

  const body = parseBody(req);
  const bodyId = normalizeString(body.id);
  const rateLimit = enforceApiRateLimit(req, res, {
    scope: 'admin_activation_content',
    identifiers: [user.id, req.method || 'GET', bodyId],
    limit: 60,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('activation_content')
        .select('*')
        .order('order', { ascending: true });

      if (error) throw error;

      return res.status(200).json({ items: data || [] });
    }

    if (req.method === 'POST') {
      const payload = buildActivationContentPayload(body);
      const id = bodyId;

      if (!payload.title) {
        return res.status(400).json({ error: 'O titulo do bloco e obrigatorio.' });
      }

      const result = id
        ? await supabaseAdmin
          .from('activation_content')
          .update(payload)
          .eq('id', id)
          .select('*')
          .maybeSingle()
        : await supabaseAdmin
          .from('activation_content')
          .insert(payload)
          .select('*')
          .single();

      if (result.error) {
        console.error('[AdminActivationContent] Save failed:', {
          code: result.error.code,
          message: result.error.message,
        });
        return res.status(400).json({ error: result.error.message });
      }

      if (id && !result.data) {
        return res.status(404).json({ error: 'Bloco de ativacao nao encontrado.' });
      }

      await logAuthzEvent({
        supabaseAdmin,
        req,
        source: 'admin_activation_content',
        eventType: 'activation_content_saved',
        severity: 'INFO',
        userId: user.id,
        metadata: {
          activation_content_id: result.data?.id || id || null,
          action: id ? 'update' : 'create',
          type: payload.type,
        },
      });

      return res.status(id ? 200 : 201).json({ item: result.data });
    }

    const id = getIdFromRequest(req);
    if (!id) {
      return res.status(400).json({ error: 'ID do bloco e obrigatorio.' });
    }

    const { data, error } = await supabaseAdmin
      .from('activation_content')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[AdminActivationContent] Delete failed:', {
        code: error.code,
        message: error.message,
      });
      return res.status(400).json({ error: error.message });
    }

    if (!data?.id) {
      return res.status(404).json({ error: 'Bloco de ativacao nao encontrado.' });
    }

    await logAuthzEvent({
      supabaseAdmin,
      req,
      source: 'admin_activation_content',
      eventType: 'activation_content_deleted',
      severity: 'INFO',
      userId: user.id,
      metadata: {
        activation_content_id: id,
      },
    });

    return res.status(200).json({ success: true, id });
  } catch (error: any) {
    console.error('[AdminActivationContent] Unexpected failure:', error?.message || error);
    return res.status(500).json({ error: 'Falha ao processar a biblioteca de ativacao.' });
  }
}
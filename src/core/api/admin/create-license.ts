import { createHmac, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from '../_cors.js';
import { enforceApiRateLimit } from '../_rate-limit.js';
import {
    createSupabaseAdminClient,
    logAuthzEvent,
    requireApiAuth,
    type ApiAuthContext,
} from '../_authz.js';

const INTERNAL_SIGNATURE_TTL_MS = 5 * 60 * 1000;

function getHeaderValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] || '' : value || '';
}

function normalizeEmail(value: unknown) {
    return String(value || '').trim().toLowerCase();
}

function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeSlug(value: unknown, fallback: string) {
    const slug = String(value || fallback).trim().toLowerCase();
    return /^[a-z0-9_-]{2,64}$/.test(slug) ? slug : fallback;
}

function normalizeBody(body: unknown): Record<string, any> {
    if (!body) return {};
    if (typeof body === 'string') {
        try {
            return JSON.parse(body);
        } catch {
            return {};
        }
    }
    return typeof body === 'object' ? body as Record<string, any> : {};
}

function isValidInternalSignature(req: VercelRequest, body: Record<string, any>) {
    const secret = process.env.ADMIN_API_SECRET || '';
    const rawTimestamp = getHeaderValue(req.headers['x-admin-timestamp']);
    const rawSignature = getHeaderValue(req.headers['x-admin-signature']).replace(/^sha256=/i, '');

    if (!secret || !rawTimestamp || !rawSignature) return false;

    const timestamp = Number(rawTimestamp.length === 10 ? `${rawTimestamp}000` : rawTimestamp);
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > INTERNAL_SIGNATURE_TTL_MS) {
        return false;
    }

    const payload = `${rawTimestamp}.${JSON.stringify(body)}`;
    const expected = createHmac('sha256', secret).update(payload).digest('hex');

    try {
        const expectedBuffer = Buffer.from(expected, 'hex');
        const receivedBuffer = Buffer.from(rawSignature, 'hex');
        return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
    } catch {
        return false;
    }
}

async function resolveCreateLicenseActor(
    req: VercelRequest,
    res: VercelResponse,
    body: Record<string, any>,
): Promise<{ type: 'jwt'; auth: ApiAuthContext } | { type: 'internal'; auth: null } | null> {
    if (isValidInternalSignature(req, body)) {
        return { type: 'internal', auth: null };
    }

    const legacyToken = getHeaderValue(req.headers['x-admin-token']);
    if (legacyToken) {
        console.warn('[admin_create_license] Rejected legacy x-admin-token authorization. Use signed internal headers.');
    }

    const auth = await requireApiAuth(req, res, {
        source: 'admin_create_license',
        allowedRoles: ['master_admin'],
    });
    if (!auth) return null;

    return { type: 'jwt', auth };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    applyCors(req, res, 'POST,OPTIONS');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = normalizeBody(req.body);
    const actor = await resolveCreateLicenseActor(req, res, body);
    if (!actor) return;

    const clientEmailForRateLimit = normalizeEmail(body.client_email);
    const planForRateLimit = normalizeSlug(body.plan, 'unknown');
    const rateLimit = enforceApiRateLimit(req, res, {
        scope: 'admin_create_license',
        identifiers: [actor.auth?.user.id || 'internal', clientEmailForRateLimit, planForRateLimit],
        limit: 10,
        windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
        const auditClient = actor.auth?.supabaseAdmin || createSupabaseAdminClient();
        await logAuthzEvent({
            supabaseAdmin: auditClient,
            req,
            source: 'admin_create_license',
            eventType: 'license_create_rate_limited',
            severity: 'WARNING',
            userId: actor.auth?.user.id || null,
            metadata: {
                actor_type: actor.type,
                plan: planForRateLimit,
                client_email_domain: clientEmailForRateLimit.split('@')[1] || null,
            },
        });
        return res.status(429).json({ error: 'Too many requests' });
    }

    const clientName = String(body.client_name || '').trim().slice(0, 160);
    const clientEmail = normalizeEmail(body.client_email);
    const plan = normalizeSlug(body.plan, 'lifetime');
    const usageType = normalizeSlug(body.usage_type, 'personal');
    const expiresAt = body.expires_at ? String(body.expires_at) : null;

    if (!clientName || !clientEmail || !isValidEmail(clientEmail)) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const supabase = actor.auth?.supabaseAdmin || createSupabaseAdminClient();
    if (!supabase) {
        console.error('[admin_create_license] Missing Supabase service configuration');
        return res.status(500).json({ error: 'Internal Server Error' });
    }

    try {
        const { data, error } = await supabase
            .from('licenses')
            .insert({
                client_name: clientName,
                client_email: clientEmail,
                plan,
                usage_type: usageType,
                expires_at: expiresAt,
                status: 'active',
            })
            .select()
            .single();

        if (error) throw error;

        await logAuthzEvent({
            supabaseAdmin: supabase,
            req,
            source: 'admin_create_license',
            eventType: 'license_created',
            severity: 'CRITICAL',
            userId: actor.auth?.user.id || null,
            metadata: {
                actor_type: actor.type,
                plan,
                usage_type: usageType,
                client_email_domain: clientEmail.split('@')[1] || null,
            },
        });

        return res.status(200).json(data);
    } catch (error: any) {
        console.error('[admin_create_license] Create License Error:', error?.message || error);
        await logAuthzEvent({
            supabaseAdmin: supabase,
            req,
            source: 'admin_create_license',
            eventType: 'license_create_failed',
            severity: 'CRITICAL',
            userId: actor.auth?.user.id || null,
            metadata: {
                actor_type: actor.type,
                reason: 'insert_failed',
                plan,
            },
        });
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

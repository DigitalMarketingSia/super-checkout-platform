import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from './_cors.js';
import { logAuthzEvent, requireApiAuth } from './_authz.js';
import { enforceApiRateLimit } from './_rate-limit.js';
import {
    dispatchPlatformEmailThroughCentral,
    resolvePlatformEmailProfile,
    resolvePlatformTemplate,
} from './send-email.js';

export const config = {
    maxDuration: 60,
};

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

function normalizeRecipients(to: unknown): string[] {
    const recipients = Array.isArray(to) ? to : [to];
    return recipients
        .map((email) => String(email || '').trim().toLowerCase())
        .filter(Boolean);
}

function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    applyCors(req, res, 'OPTIONS,POST');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const auth = await requireApiAuth(req, res, {
        source: 'platform_email',
        allowedRoles: ['master_admin'],
    });
    if (!auth) return;

    const body = parseBody(req) as Record<string, any>;
    const recipients = normalizeRecipients(body.to);
    if (recipients.length === 0) return res.status(400).json({ error: "Missing 'to' field" });
    if (recipients.length > 5) return res.status(400).json({ error: 'Too many recipients' });
    if (!recipients.every(isValidEmail)) return res.status(400).json({ error: 'Invalid recipient email' });

    const rateLimit = enforceApiRateLimit(req, res, {
        scope: 'platform_email',
        identifiers: [auth.user.id, recipients.join(',')],
        limit: 12,
        windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
        await logAuthzEvent({
            supabaseAdmin: auth.supabaseAdmin,
            req,
            source: 'platform_email',
            eventType: 'platform_email_rate_limited',
            severity: 'WARNING',
            userId: auth.user.id,
            metadata: { recipient_count: recipients.length },
        });
        return res.status(429).json({ error: 'Too many email attempts' });
    }

    const approvedTemplate = await resolvePlatformTemplate(body);
    if (!approvedTemplate?.template_key || !approvedTemplate.variables) {
        await logAuthzEvent({
            supabaseAdmin: auth.supabaseAdmin,
            req,
            source: 'platform_email',
            eventType: 'platform_email_rejected',
            severity: 'WARNING',
            userId: auth.user.id,
            metadata: { reason: 'unapproved_template_or_variables' },
        });
        return res.status(400).json({ error: 'Platform email template is not approved' });
    }

    const result = await dispatchPlatformEmailThroughCentral({
        to: recipients,
        profile: resolvePlatformEmailProfile(approvedTemplate.template_key),
        templateKey: approvedTemplate.template_key,
        language: approvedTemplate.language || 'pt',
        variables: approvedTemplate.variables,
    });
    if (!result.ok) {
        await logAuthzEvent({
            supabaseAdmin: auth.supabaseAdmin,
            req,
            source: 'platform_email',
            eventType: 'platform_email_dispatch_failed',
            severity: 'CRITICAL',
            userId: auth.user.id,
            metadata: { template_key: approvedTemplate.template_key, status: result.status, reason: result.error },
        });
        return res.status(result.status).json({ error: 'Platform email dispatch failed', code: result.error });
    }

    await logAuthzEvent({
        supabaseAdmin: auth.supabaseAdmin,
        req,
        source: 'platform_email',
        eventType: 'platform_email_sent',
        severity: 'INFO',
        userId: auth.user.id,
        metadata: {
            recipient_count: recipients.length,
            provider: 'central_resend',
            template_key: approvedTemplate.template_key,
            resend_id: result.id,
        },
    });

    return res.status(200).json({ id: result.id, provider: 'central_resend' });
}

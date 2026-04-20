import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

export const ALLOWED_ORIGINS = [
    process.env.APP_URL,
    process.env.SUPER_CHECKOUT_APP_URL,
    process.env.SUPER_CHECKOUT_PORTAL_URL,
    process.env.SUPER_CHECKOUT_INSTALL_URL,
    process.env.VITE_SUPER_CHECKOUT_APP_URL,
    process.env.VITE_SUPER_CHECKOUT_PORTAL_URL,
    process.env.VITE_SUPER_CHECKOUT_INSTALL_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.NEXT_PUBLIC_APP_URL,
    'https://app.supercheckout.app',
    'https://portal.supercheckout.app',
    'https://install.supercheckout.app',
    'http://localhost:3000',
    'http://localhost:5173'
].filter(Boolean) as string[];

export type SecuritySeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'FATAL';

function sanitizeMetadata(metadata: Record<string, unknown> = {}) {
    const blocked = new Set([
        'password',
        'secret',
        'private_key',
        'webhook_secret',
        'token',
        'access_token',
        'refresh_token',
        'captcha_token'
    ]);

    return Object.fromEntries(
        Object.entries(metadata).filter(([key]) => !blocked.has(key.toLowerCase()))
    );
}

export function applyCors(req: VercelRequest, res: VercelResponse, methods = 'POST, OPTIONS') {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0] || 'https://portal.supercheckout.app');
    }

    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function getIp(req: VercelRequest): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        || req.socket?.remoteAddress
        || 'unknown';
}

export function getUserAgent(req: VercelRequest): string | null {
    return (req.headers['user-agent'] as string) || null;
}

export function normalizeEmail(email: string): string {
    return String(email || '').trim().toLowerCase();
}

export function maskEmail(email: string): string {
    const [name, domain] = normalizeEmail(email).split('@');
    if (!name || !domain) return 'unknown';
    const prefix = name.length <= 2 ? `${name[0] || '*'}*` : `${name.slice(0, 2)}***`;
    return `${prefix}@${domain}`;
}

export function emailFingerprint(email: string): string {
    return createHash('sha256').update(normalizeEmail(email)).digest('hex');
}

export function isLocalOrigin(origin?: string | null): boolean {
    return Boolean(origin && ['http://localhost:3000', 'http://localhost:5173'].includes(origin));
}

export function getPortalBaseUrl(origin?: string | null): string {
    if (isLocalOrigin(origin)) {
        return origin as string;
    }

    return (
        process.env.SUPER_CHECKOUT_PORTAL_URL
        || process.env.VITE_SUPER_CHECKOUT_PORTAL_URL
        || 'https://portal.supercheckout.app'
    ).replace(/\/+$/, '');
}

export function getAuditClient() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

    if (!supabaseUrl || !serviceKey) {
        return null;
    }

    return createClient(supabaseUrl, serviceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
}

export async function logSecurityEvent(params: {
    eventType: string;
    severity: SecuritySeverity;
    ip: string;
    userAgent?: string | null;
    userId?: string | null;
    metadata?: Record<string, unknown>;
    source: string;
}) {
    try {
        const supabaseAdmin = getAuditClient();
        if (!supabaseAdmin) return;

        const insertData: Record<string, unknown> = {
            event_type: params.eventType,
            severity: params.severity,
            ip_address: params.ip,
            metadata: {
                ...sanitizeMetadata(params.metadata || {}),
                user_agent: params.userAgent || null,
                source: params.source
            }
        };

        if (params.userId) {
            insertData.user_id = params.userId;
        }

        const { error } = await supabaseAdmin.from('security_events').insert(insertData);
        if (error) {
            console.warn(`[${params.source}] Security event insert failed:`, error.message);
        }
    } catch (error: any) {
        console.warn(`[${params.source}] Security event unexpected failure:`, error?.message || error);
    }
}

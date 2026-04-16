import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const ALLOWED_ORIGINS = [
    process.env.APP_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.NEXT_PUBLIC_APP_URL,
    'http://localhost:3000',
    'http://localhost:5173'
].filter(Boolean);

const ALLOWED_EVENTS = new Set([
    'password_reset_requested',
    'password_changed',
    'email_changed',
    'gateway_credentials_changed',
    'two_factor_enabled',
    'two_factor_disabled'
]);

function getIp(req: VercelRequest): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        || req.socket?.remoteAddress
        || 'unknown';
}

function sanitizeMetadata(metadata: Record<string, any> = {}) {
    const blocked = new Set(['password', 'private_key', 'webhook_secret', 'secret', 'token', 'access_token', 'refresh_token']);
    return Object.fromEntries(
        Object.entries(metadata).filter(([key]) => !blocked.has(key.toLowerCase()))
    );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0] || 'https://app.supercheckout.app');
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

    if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: 'Security audit is not configured.' });
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Missing bearer token.' });

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) return res.status(401).json({ error: 'Invalid session.' });

    const { event_type, severity = 'INFO', metadata = {} } = req.body || {};
    if (!ALLOWED_EVENTS.has(event_type)) {
        return res.status(400).json({ error: 'Unsupported security event.' });
    }

    const normalizedSeverity = ['INFO', 'WARNING', 'CRITICAL', 'FATAL'].includes(severity) ? severity : 'INFO';

    const { error } = await supabaseAdmin.from('security_events').insert({
        event_type,
        severity: normalizedSeverity,
        ip_address: getIp(req),
        user_id: userData.user.id,
        metadata: {
            ...sanitizeMetadata(metadata),
            user_agent: req.headers['user-agent'] || null,
            source: 'auth_security_event_api'
        }
    });

    if (error) {
        console.error('[SecurityEvent] Insert failed:', error.message);
        return res.status(500).json({ error: 'Failed to log security event.' });
    }

    return res.status(200).json({ success: true });
}

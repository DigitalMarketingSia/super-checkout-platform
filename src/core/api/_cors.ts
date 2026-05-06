import type { VercelRequest, VercelResponse } from '@vercel/node';

const DEFAULT_ALLOWED_ORIGIN = 'https://app.supercheckout.app';

function normalizeHost(value?: string | string[] | null) {
    const raw = Array.isArray(value) ? value[0] : value;
    return String(raw || '')
        .replace(/^https?:\/\//, '')
        .split('/')[0]
        .toLowerCase();
}

function getAllowedOrigins() {
    const origins = [
        DEFAULT_ALLOWED_ORIGIN,
        'https://supercheckout.app',
        'https://portal.supercheckout.app',
        'https://install.supercheckout.app',
        process.env.APP_URL,
        process.env.SUPER_CHECKOUT_APP_URL,
        process.env.SUPER_CHECKOUT_PORTAL_URL,
        process.env.SUPER_CHECKOUT_INSTALL_URL,
        process.env.NEXT_PUBLIC_APP_URL,
        process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
        ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:3000', 'http://localhost:5173'] : []),
    ];

    return Array.from(new Set(origins.filter(Boolean) as string[]));
}

export function applyCors(req: VercelRequest, res: VercelResponse, methods = 'GET,OPTIONS,POST') {
    const origin = req.headers.origin;
    const requestHost = normalizeHost(req.headers['x-forwarded-host'] || req.headers.host);
    const originHost = normalizeHost(origin);
    const allowedOrigins = getAllowedOrigins();
    const allowedOrigin = origin && (
        allowedOrigins.includes(origin) ||
        (!!requestHost && originHost === requestHost)
    ) ? origin : DEFAULT_ALLOWED_ORIGIN;

    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-Admin-Token, X-Idempotency-Key',
    );

    return !origin || allowedOrigin === origin || allowedOrigin === DEFAULT_ALLOWED_ORIGIN;
}

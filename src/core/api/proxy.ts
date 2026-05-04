import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * MERCADO PAGO PROXY — Hardened (Fase 11D)
 *
 * Este proxy encaminha requisições do frontend para a API do Mercado Pago.
 * SEGURANÇA: Apenas endpoints explicitamente listados na allowlist são permitidos.
 * Cada rota é restrita ao método HTTP específico que o checkout utiliza.
 */

// Allowlist: path regex + métodos HTTP permitidos
const ALLOWED_ROUTES: { pattern: RegExp; methods: string[] }[] = [
    { pattern: /^\/v1\/card_tokens(\?.*)?$/,                   methods: ['POST'] },
    { pattern: /^\/v1\/payment_methods\/installments(\?.*)?$/,  methods: ['GET'] },
    { pattern: /^\/v1\/payment_methods(\?.*)?$/,                methods: ['GET'] },
    { pattern: /^\/v1\/payments$/,                              methods: ['POST'] },
    { pattern: /^\/v1\/payments\/\d+$/,                         methods: ['GET'] },
];

const ALLOWED_ORIGINS = [
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
].filter(Boolean);

function isEndpointAllowed(endpoint: string, method: string): boolean {
    return ALLOWED_ROUTES.some(
        route => route.pattern.test(endpoint) && route.methods.includes(method)
    );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // 1. Handle CORS
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0] || 'https://app.supercheckout.app');
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-Idempotency-Key');

    // 2. Handle Preflight (OPTIONS)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 3. Block dangerous HTTP methods at the gate
    const method = req.method || 'GET';
    if (!['GET', 'POST'].includes(method)) {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const endpoint = req.query.endpoint as string;

        // 4. Health Check
        if (!endpoint) {
            return res.status(200).json({ status: 'ok', message: 'Proxy is running' });
        }

        // 5. SECURITY: Validate endpoint against allowlist (path + method)
        if (!isEndpointAllowed(endpoint, method)) {
            console.warn(`[Proxy] BLOCKED: ${method} ${endpoint}`);
            return res.status(403).json({ error: 'Endpoint not allowed' });
        }

        const targetUrl = `https://api.mercadopago.com${endpoint}`;
        console.log(`[Proxy] Forwarding ${method} to ${targetUrl}`);

        // 6. Prepare Request to Upstream
        const upstreamHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': (req.headers['authorization'] as string) || '',
            'X-Idempotency-Key': (req.headers['x-idempotency-key'] as string) || ''
        };

        const fetchOptions: any = {
            method: method,
            headers: upstreamHeaders,
        };

        if (method !== 'GET' && method !== 'HEAD' && req.body) {
            fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        }

        const response = await fetch(targetUrl, fetchOptions);

        // 7. Return Response
        const data = await response.text();
        
        res.status(response.status);
        res.setHeader('Content-Type', 'application/json');
        return res.send(data);

    } catch (error: any) {
        console.error('[Proxy] Error:', error);
        return res.status(500).json({ error: error.message || 'Internal Proxy Error' });
    }
}

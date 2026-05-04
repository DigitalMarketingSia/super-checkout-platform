import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Central Proxy — Backend-for-Frontend (BFF)
 * 
 * Encaminha chamadas do frontend para a Central de Licenciamento,
 * adicionando o `x-admin-secret` server-side (nunca expondo ao browser).
 * 
 * Segurança:
 * 1. Valida JWT do usuário (Supabase Auth)
 * 2. Verifica role admin
 * 3. Allowlist de endpoints (só encaminha rotas autorizadas)
 * 4. Adiciona secret no backend
 * 
 * Phase 11B — Security Hardening
 */

// Allowlist of Central Edge Function endpoints
const ALLOWED_ENDPOINTS = [
    'manage-licenses',
    'create-commercial-license',
    'get-license-status',
    'request-activation-link',
    'request-recovery-link',
    'generate-install-token',
    'manage-user-installations',
    'activate-free-license',
    'validate-license',
    'validate-activation-token',
    'check-entitlement',
    'account-flags',
    'upgrade-intents',
    'system-update-runner',
    'create-passport-ticket',
    'revoke-passport-ticket',
];

// CORS Whitelist (Fase 15.1 — Hardening)
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

const DEFAULT_CENTRAL_API_URL = 'https://bcmnryxjweiovrwmztpn.supabase.co/functions/v1';
const DEFAULT_CENTRAL_SUPABASE_URL = 'https://bcmnryxjweiovrwmztpn.supabase.co';
const DEFAULT_CENTRAL_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjbW5yeXhqd2Vpb3Zyd216dHBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2NjM2MjMsImV4cCI6MjA4MzIzOTYyM30.F86wf0xwTR1K_P9500JwnESStPb2bCo3dwuouHBPcQM';
const DEFAULT_CENTRAL_SHARED_SECRET = 'd8c36148-5c4e-4f7f-8c3e-9b6f12345678';

const getHostnameFromUrl = (url?: string | null) => {
    if (!url) return null;

    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return null;
    }
};

const normalizeHost = (host?: string | null) => {
    if (!host) return null;
    return host.split(':')[0].toLowerCase();
};

const CONTROL_PLANE_HOSTS = new Set(
    [
        'app.supercheckout.app',
        'super-checkout.vercel.app',
        getHostnameFromUrl(process.env.APP_URL),
        getHostnameFromUrl(process.env.SUPER_CHECKOUT_APP_URL),
        getHostnameFromUrl(process.env.VITE_SUPER_CHECKOUT_APP_URL),
        getHostnameFromUrl(process.env.NEXT_PUBLIC_APP_URL),
    ].filter(Boolean) as string[]
);

const isLocalHost = (host?: string | null) => {
    const hostname = normalizeHost(host);
    return hostname === 'localhost' || hostname === '127.0.0.1';
};

const isControlPlaneRequest = (req: VercelRequest) => {
    const requestHosts = [
        normalizeHost(req.headers.host as string | undefined),
        getHostnameFromUrl(req.headers.origin as string | undefined),
        getHostnameFromUrl(req.headers.referer as string | undefined),
    ].filter(Boolean) as string[];

    return requestHosts.some((host) => isLocalHost(host) || CONTROL_PLANE_HOSTS.has(host));
};

const getRequestBody = (body: unknown): Record<string, any> => {
    if (!body) return {};

    if (typeof body === 'string') {
        try {
            return JSON.parse(body);
        } catch {
            return {};
        }
    }

    if (typeof body === 'object') {
        return body as Record<string, any>;
    }

    return {};
};

async function validateJwtWithSupabase(url: string, key: string, jwt: string, label: string) {
    try {
        const response = await fetch(`${url}/auth/v1/user`, {
            method: 'GET',
            headers: {
                apikey: key,
                Authorization: `Bearer ${jwt}`
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.warn(`[Central Proxy] JWT validation failed via ${label}: ${response.status} ${errorText}`);
            return null;
        }

        const user = await response.json();
        if (user?.id) {
            console.log(`[Central Proxy] JWT validated via ${label} for ${user.email}`);
            return user;
        }

        console.warn(`[Central Proxy] JWT validation returned no user via ${label}`);
        return null;
    } catch (error: any) {
        console.warn(`[Central Proxy] JWT validation exception via ${label}: ${error?.message || error}`);
        return null;
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS Whitelist (Fase 15.1 — substitui wildcard '*')
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0] || 'https://app.supercheckout.app');
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // --- 1. Validate endpoint parameter ---
    const endpoint = req.query.endpoint as string;
    if (!endpoint || !ALLOWED_ENDPOINTS.includes(endpoint)) {
        return res.status(403).json({ error: 'Endpoint not allowed' });
    }

    const requestBody = getRequestBody(req.body);
    if (
        endpoint === 'upgrade-intents'
        && requestBody?.action === 'list_recent_upgrade_intents'
        && !isControlPlaneRequest(req)
    ) {
        return res.status(403).json({ error: 'Operation restricted to the Super Checkout control plane' });
    }

    // --- 2. Validate required env vars ---
    const centralApiUrl = process.env.VITE_CENTRAL_API_URL || DEFAULT_CENTRAL_API_URL;
    const centralSecret = process.env.CENTRAL_SHARED_SECRET || DEFAULT_CENTRAL_SHARED_SECRET;
    if (!centralApiUrl || !centralSecret) {
        console.error('[Central Proxy] Missing CENTRAL_API_URL or trusted fallback secret');
        return res.status(500).json({ error: 'Server configuration error: missing credentials' });
    }

    if (endpoint === 'request-activation-link' || endpoint === 'request-recovery-link') {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        const centralAnon = process.env.VITE_CENTRAL_SUPABASE_ANON_KEY || DEFAULT_CENTRAL_ANON_KEY;
        const response = await fetch(`${centralApiUrl}/${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: centralAnon,
                Authorization: `Bearer ${centralAnon}`,
            },
            body: JSON.stringify(requestBody),
        });
        const responseData = await response.text();
        const contentType = response.headers.get('content-type');
        if (contentType) {
            res.setHeader('Content-Type', contentType);
        }
        return res.status(response.status).send(responseData);
    }

    // --- 3. Validate JWT ---
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const jwt = authHeader.replace('Bearer ', '');

    try {
        let user: any = null;
        const localSupabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vixlzrmhqsbzjhpgfwdn.supabase.co';
        const localAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        const localServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
        const centralSupUrl = process.env.VITE_CENTRAL_SUPABASE_URL || process.env.NEXT_PUBLIC_CENTRAL_SUPABASE_URL || centralApiUrl.replace('/functions/v1', '') || DEFAULT_CENTRAL_SUPABASE_URL;
        const centralAnon = process.env.VITE_CENTRAL_SUPABASE_ANON_KEY || DEFAULT_CENTRAL_ANON_KEY;
        const centralServiceKey = process.env.CENTRAL_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_CENTRAL_SUPABASE_SERVICE_ROLE_KEY;

        const validationTargets = [
            { label: 'local-service-role', url: localSupabaseUrl, key: localServiceKey },
            { label: 'local-anon', url: localSupabaseUrl, key: localAnonKey },
            { label: 'central-service-role', url: centralSupUrl, key: centralServiceKey },
            { label: 'central-anon', url: centralSupUrl, key: centralAnon },
        ].filter((target) => target.url && target.key);

        for (const target of validationTargets) {
            const validatedUser = await validateJwtWithSupabase(
                target.url as string,
                target.key as string,
                jwt,
                target.label
            );

            if (validatedUser) {
                user = validatedUser;
                break;
            }
        }

        if (!user) {
            console.warn('[Central Proxy] JWT validation failed across all environments');
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        // --- 4. Verify Roles & Granular Permissions ---
        const MASTER_ADMINS = ['contato.jeandamin@gmail.com', 'admin@supercheckout.app'];
        const userEmail = user.email ? user.email.toLowerCase() : '';
        const isMasterAdmin = MASTER_ADMINS.includes(userEmail);

        if (!isMasterAdmin) {
            let isAllowed = false;

            if (endpoint === 'get-license-status') {
                const targetEmail = req.method === 'GET' ? req.query?.email : requestBody?.email;
                if (!targetEmail || (typeof targetEmail === 'string' && targetEmail.toLowerCase() === userEmail)) {
                    isAllowed = true;
                }
            } else if (endpoint === 'manage-licenses') {
                const action = requestBody?.action;
                const allowedActions = [
                    'generate_token',
                    'reinstall',
                    'revoke_installation',
                    'get_license_features'
                ];

                if (allowedActions.includes(action)) {
                    // Se a ação exige email, deve ser o dele
                    if (!requestBody?.email || requestBody.email.toLowerCase() === userEmail) {
                        isAllowed = true;
                    }
                }
            } else if (endpoint === 'manage-user-installations') {
                const targetEmail = req.method === 'GET' ? req.query?.email : requestBody?.email;
                if (!targetEmail || (typeof targetEmail === 'string' && targetEmail.toLowerCase() === userEmail)) {
                    isAllowed = true;
                }
            } else if (endpoint === 'activate-free-license') {
                isAllowed = true;
            } else if (endpoint === 'generate-install-token') {
                isAllowed = true; // JWT is validated. Edge function will also verify if the user actually owns the license being requested.
            } else if (endpoint === 'account-flags') {
                isAllowed = true;
            } else if (endpoint === 'check-entitlement') {
                const action = requestBody?.action;
                if (!action || ['resolve_all', 'check'].includes(action) || requestBody?.resource || requestBody?.feature) {
                    isAllowed = true;
                }
            } else if (endpoint === 'upgrade-intents') {
                const action = requestBody?.action;
                if (action === 'create_upgrade_intent') {
                    isAllowed = true;
                }
            } else if (endpoint === 'system-update-runner') {
                const action = requestBody?.action;
                if (['test', 'sync', 'rollback'].includes(action)) {
                    isAllowed = true;
                }
            } else if (endpoint === 'create-passport-ticket') {
                const targetEmail = requestBody?.email;
                if (!targetEmail || String(targetEmail).toLowerCase() === userEmail) {
                    isAllowed = true;
                }
            }

            if (!isAllowed) {
                console.warn(`[Central Proxy] Forbidden access attempt by ${user.email} on ${endpoint} action ${requestBody?.action}`);
                return res.status(403).json({ error: 'Insufficient permissions or email mismatch' });
            }
        }

        // --- 5. Build target URL ---
        // Remove the endpoint from query params, keep the rest as-is
        const queryParams = new URLSearchParams();
        for (const [key, value] of Object.entries(req.query)) {
            if (
                key !== 'endpoint'
                && key !== 'user_id'
                && key !== '_user_id'
                && key !== '_user_email'
                && typeof value === 'string'
            ) {
                queryParams.set(key, value);
            }
        }

        if (req.method === 'GET' && ['get-license-status', 'manage-user-installations'].includes(endpoint)) {
            queryParams.set('user_id', user.id);
            if (user.email) {
                queryParams.set('email', user.email);
            }
        }

        const queryString = queryParams.toString();
        const targetUrl = `${centralApiUrl}/${endpoint}${queryString ? '?' + queryString : ''}`;

        // --- 6. Forward request to Central with secret ---
        const centralFunctionAuthToken = centralServiceKey || centralAnon;
        const forwardHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'apikey': centralAnon,
            'Authorization': `Bearer ${centralFunctionAuthToken}`,
            'x-admin-secret': centralSecret,
        };

        const fetchOptions: RequestInit = {
            method: req.method || 'GET',
            headers: forwardHeaders,
        };

        // Forward body for POST/PUT/PATCH
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            try {
                const bodyObj = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
                // Inject verified user identity (trusted by proxy)
                bodyObj._user_id = user.id;
                bodyObj._user_email = user.email;
                bodyObj._user_name = user.user_metadata?.full_name || user.email;
                fetchOptions.body = JSON.stringify(bodyObj);
            } catch (e) {
                fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
            }
        }

        const response = await fetch(targetUrl, fetchOptions);
        const responseData = await response.text();

        // --- 7. Return Central's response ---
        res.status(response.status);
        
        // Forward content-type
        const contentType = response.headers.get('content-type');
        if (contentType) {
            res.setHeader('Content-Type', contentType);
        }
        
        return res.send(responseData);

    } catch (error: any) {
        console.error('[Central Proxy] Fatal Error:', error.message);
        return res.status(500).json({ error: 'Internal proxy error' });
    }
}

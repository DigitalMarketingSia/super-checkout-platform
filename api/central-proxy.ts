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
    'generate-install-token',
    'manage-user-installations',
    'activate-free-license',
    'validate-license',
    'validate-activation-token',
    'check-entitlement',
    'account-flags',
    'upgrade-intents',
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

    // --- 2. Validate required env vars ---
    const centralApiUrl = process.env.VITE_CENTRAL_API_URL || DEFAULT_CENTRAL_API_URL;
    const centralSecret = process.env.CENTRAL_SHARED_SECRET;
    if (!centralApiUrl || !centralSecret) {
        console.error('[Central Proxy] Missing CENTRAL_API_URL or CENTRAL_SHARED_SECRET');
        return res.status(500).json({ error: 'Server configuration error: missing credentials' });
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
                const targetEmail = req.method === 'GET' ? req.query?.email : req.body?.email;
                if (!targetEmail || (typeof targetEmail === 'string' && targetEmail.toLowerCase() === userEmail)) {
                    isAllowed = true;
                }
            } else if (endpoint === 'manage-licenses') {
                const action = req.body?.action;
                const allowedActions = [
                    'generate_token',
                    'reinstall',
                    'revoke_installation',
                    'get_license_features'
                ];

                if (allowedActions.includes(action)) {
                    // Se a ação exige email, deve ser o dele
                    if (!req.body?.email || req.body.email.toLowerCase() === userEmail) {
                        isAllowed = true;
                    }
                }
            } else if (endpoint === 'manage-user-installations') {
                const targetEmail = req.method === 'GET' ? req.query?.email : req.body?.email;
                if (!targetEmail || (typeof targetEmail === 'string' && targetEmail.toLowerCase() === userEmail)) {
                    isAllowed = true;
                }
            } else if (endpoint === 'activate-free-license') {
                isAllowed = true;
            } else if (endpoint === 'generate-install-token') {
                isAllowed = true; // JWT is validated. Edge function will also verify if the user actually owns the license being requested.
            } else if (endpoint === 'account-flags') {
                isAllowed = true;
            } else if (endpoint === 'upgrade-intents') {
                const action = req.body?.action;
                if (action === 'create_upgrade_intent') {
                    isAllowed = true;
                }
            }

            if (!isAllowed) {
                console.warn(`[Central Proxy] Forbidden access attempt by ${user.email} on ${endpoint} action ${req.body?.action}`);
                return res.status(403).json({ error: 'Insufficient permissions or email mismatch' });
            }
        }

        // --- 5. Build target URL ---
        // Remove the endpoint from query params, keep the rest as-is
        const queryParams = new URLSearchParams();
        for (const [key, value] of Object.entries(req.query)) {
            if (key !== 'endpoint' && typeof value === 'string') {
                queryParams.set(key, value);
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

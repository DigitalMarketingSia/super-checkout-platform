import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

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
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // --- 1. Validate endpoint parameter ---
    const endpoint = req.query.endpoint as string;
    if (!endpoint || !ALLOWED_ENDPOINTS.includes(endpoint)) {
        return res.status(403).json({ error: 'Endpoint not allowed' });
    }

    // --- 2. Validate required env vars ---
    const centralApiUrl = process.env.VITE_CENTRAL_API_URL || 'https://bcmnryxjweiovrwmztpn.supabase.co/functions/v1';
    const centralSecret = process.env.CENTRAL_SHARED_SECRET || process.env.VITE_CENTRAL_SHARED_SECRET;
    const supabaseUrl = process.env.VITE_CENTRAL_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_CENTRAL_SUPABASE_ANON_KEY;

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

        // Try LOCAL Supabase First
        const localSupabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        const localAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (localSupabaseUrl && localAnonKey) {
            const localClient = createClient(localSupabaseUrl, localAnonKey, {
                global: { headers: { Authorization: `Bearer ${jwt}` } }
            });
            const res = await localClient.auth.getUser(jwt);
            if (!res.error && res.data?.user) {
                user = res.data.user;
            }
        }

        // Try CENTRAL Supabase Fallback
        if (!user) {
            const centralSupUrl = process.env.VITE_CENTRAL_SUPABASE_URL || centralApiUrl.replace('/functions/v1', '');
            const centralAnon = process.env.VITE_CENTRAL_SUPABASE_ANON_KEY;
            
            if (centralSupUrl && centralAnon) {
                const altClient = createClient(centralSupUrl, centralAnon, {
                    global: { headers: { Authorization: `Bearer ${jwt}` } }
                });
                const resAlt = await altClient.auth.getUser(jwt);
                if (!resAlt.error && resAlt.data?.user) {
                    user = resAlt.data.user;
                }
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
                if (req.body?.email && req.body.email.toLowerCase() === userEmail) {
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
        const forwardHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwt}`,
            'x-admin-secret': centralSecret,
        };

        const fetchOptions: RequestInit = {
            method: req.method || 'GET',
            headers: forwardHeaders,
        };

        // Forward body for POST/PUT/PATCH
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
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

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
    const centralApiUrl = process.env.VITE_CENTRAL_API_URL;
    const centralSecret = process.env.CENTRAL_SHARED_SECRET || process.env.VITE_CENTRAL_SHARED_SECRET;
    const supabaseUrl = process.env.VITE_CENTRAL_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_CENTRAL_SUPABASE_ANON_KEY;

    if (!centralApiUrl || !centralSecret) {
        console.error('[Central Proxy] Missing CENTRAL_API_URL or CENTRAL_SHARED_SECRET');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    // --- 3. Validate JWT ---
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const jwt = authHeader.replace('Bearer ', '');

    try {
        // Use the CENTRAL Supabase to validate the JWT (since users are in the Central project)
        const centralSupabaseUrl = supabaseUrl || centralApiUrl.replace('/functions/v1', '');
        const centralAnonKey = supabaseAnonKey || '';

        if (!centralAnonKey) {
            console.error('[Central Proxy] Missing CENTRAL_SUPABASE_ANON_KEY for JWT validation');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const supabase = createClient(centralSupabaseUrl, centralAnonKey, {
            global: { headers: { Authorization: `Bearer ${jwt}` } }
        });

        const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);

        if (authError || !user) {
            console.warn('[Central Proxy] JWT validation failed:', authError?.message);
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        // --- 4. Verify admin/owner role ---
        const userRole = user.user_metadata?.role || user.app_metadata?.role;
        const ADMIN_ROLES = ['admin', 'owner'];
        if (!userRole || !ADMIN_ROLES.includes(userRole)) {
            console.warn(`[Central Proxy] Non-admin access attempt by ${user.id} (role: ${userRole})`);
            return res.status(403).json({ error: 'Insufficient permissions' });
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

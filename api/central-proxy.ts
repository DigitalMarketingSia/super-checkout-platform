import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enforceApiRateLimit } from '../src/core/api/_rate-limit.js';

const CRM_READ_ACTIONS = new Set([
    'get_partners',
    'get_launch_settings',
    'get_registration_waitlist',
    'update_registration_waitlist_lead',
    'send_registration_waitlist_invite',
    'get_registration_approval_queue',
    'get_crm_data',
    'get_crm_user_details',
]);

const MANAGE_LICENSES_OWNER_ACTIONS = new Set([
    'create',
    'update',
    'suspend',
    'activate',
    'delete',
    'toggle_license_feature',
    'manage_partner_status',
    'update_launch_settings',
    'process_registration_approval',
    'update_partner_opportunity_visibility',
    'update_profile',
    'soft_delete_user',
    'promote_to_vitalicia',
    'create_invite_token',
]);

const MANAGE_LICENSES_SELF_SERVICE_SECRET_ACTIONS = new Set([
    'generate_token',
    'reinstall',
    'revoke_installation',
]);

const TRUSTED_PROXY_ENDPOINTS = new Set([
    'account-flags',
    'activate-free-license',
    'create-passport-ticket',
    'generate-install-token',
    'manage-user-installations',
    'revoke-passport-ticket',
]);

function isSystemOwnerEmail(email?: string | null): boolean {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return false;

    return (process.env.MASTER_ADMIN_EMAILS || '')
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
        .includes(normalized);
}

function maskEmail(email?: string | null): string {
    const [name, domain] = String(email || '').split('@');
    if (!name || !domain) return 'unknown';
    return `${name.slice(0, 2)}***@${domain}`;
}

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
    ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:3000', 'http://localhost:5173'] : [])
].filter(Boolean);

const DEV_CENTRAL_API_URL = 'https://bcmnryxjweiovrwmztpn.supabase.co/functions/v1';
const DEV_CENTRAL_SUPABASE_URL = 'https://bcmnryxjweiovrwmztpn.supabase.co';
const DEV_LOCAL_SUPABASE_URL = 'https://vixlzrmhqsbzjhpgfwdn.supabase.co';
const OFFICIAL_CENTRAL_API_URL = 'https://bcmnryxjweiovrwmztpn.supabase.co/functions/v1';
const OFFICIAL_CENTRAL_SUPABASE_URL = 'https://bcmnryxjweiovrwmztpn.supabase.co';

function getDevFallback(value: string) {
    return process.env.NODE_ENV !== 'production' ? value : '';
}

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

const getRequestDomain = (req: VercelRequest, fallback?: string | null) => {
    const forwardedHost = req.headers['x-forwarded-host'];
    const host = Array.isArray(forwardedHost)
        ? forwardedHost[0]
        : forwardedHost || req.headers.host || fallback || '';

    return normalizeHost(String(host));
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
            console.log(`[Central Proxy] JWT validated via ${label} for ${maskEmail(user.email)}`);
            return user;
        }

        console.warn(`[Central Proxy] JWT validation returned no user via ${label}`);
        return null;
    } catch (error: any) {
        console.warn(`[Central Proxy] JWT validation exception via ${label}: ${error?.message || error}`);
        return null;
    }
}

async function fetchLocalProfileAccess(
    localSupabaseUrl: string,
    localKey: string,
    filters: string[],
    label: string,
    bearerToken?: string
) {
    const baseUrl = `${localSupabaseUrl}/rest/v1/profiles?or=(${filters.join(',')})&limit=1`;
    const headers = {
        apikey: localKey,
        Authorization: `Bearer ${bearerToken || localKey}`,
    };

    let response = await fetch(`${baseUrl}&select=role,status,is_blocked`, {
        method: 'GET',
        headers,
    });
    let assumesNotBlocked = false;

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        if (response.status === 400 && /is_blocked|PGRST204|schema cache/i.test(errorText)) {
            assumesNotBlocked = true;
            response = await fetch(`${baseUrl}&select=role,status`, {
                method: 'GET',
                headers,
            });
        } else {
            console.warn(`[Central Proxy] ${label} lookup failed: ${response.status}`);
            return { allowed: false, role: null as string | null };
        }
    }

    if (!response.ok) {
        console.warn(`[Central Proxy] ${label} lookup fallback failed: ${response.status}`);
        return { allowed: false, role: null as string | null };
    }

    const rows = await response.json();
    const profile = Array.isArray(rows) ? rows[0] : null;
    const role = String(profile?.role || '').toLowerCase();
    const status = String(profile?.status || 'active').toLowerCase();

    return {
        allowed: ['owner', 'master_admin', 'admin'].includes(role)
            && status !== 'suspended'
            && (assumesNotBlocked || profile?.is_blocked !== true),
        role: role || null,
    };
}

async function resolveControlPlaneAdminAccess(
    req: VercelRequest,
    localSupabaseUrl: string,
    localKey: string | undefined,
    userId: string,
    userEmail?: string | null,
    bearerToken?: string
) {
    if (!isControlPlaneRequest(req) || !localSupabaseUrl || !localKey || (!userId && !userEmail)) {
        return { allowed: false, role: null as string | null };
    }

    try {
        const filters = [
            userId ? `id.eq.${encodeURIComponent(userId)}` : '',
            userEmail ? `email.eq.${encodeURIComponent(String(userEmail).toLowerCase())}` : '',
        ].filter(Boolean);

        return await fetchLocalProfileAccess(localSupabaseUrl, localKey, filters, 'Local admin role', bearerToken);
    } catch (error: any) {
        console.warn(`[Central Proxy] Local admin role lookup exception: ${error?.message || error}`);
        return { allowed: false, role: null as string | null };
    }
}

async function resolveLocalAdminAccess(
    localSupabaseUrl: string,
    localKey: string | undefined,
    userId: string,
    userEmail?: string | null,
    bearerToken?: string
) {
    if (!localSupabaseUrl || !localKey || (!userId && !userEmail)) {
        return { allowed: false, role: null as string | null };
    }

    try {
        const filters = [
            userId ? `id.eq.${encodeURIComponent(userId)}` : '',
            userEmail ? `email.eq.${encodeURIComponent(String(userEmail).toLowerCase())}` : '',
        ].filter(Boolean);

        return await fetchLocalProfileAccess(localSupabaseUrl, localKey, filters, 'Local profile role', bearerToken);
    } catch (error: any) {
        console.warn(`[Central Proxy] Local profile role lookup exception: ${error?.message || error}`);
        return { allowed: false, role: null as string | null };
    }
}

function shouldForwardAdminSecret(
    endpoint: string,
    method: string | undefined,
    requestBody: Record<string, any>,
    hasOwnerGradeControlPlaneAccess: boolean
) {
    const action = requestBody?.action;

    if (endpoint === 'get-license-status') {
        return true;
    }

    if (endpoint === 'create-commercial-license') {
        return true;
    }

    if (TRUSTED_PROXY_ENDPOINTS.has(endpoint)) {
        return true;
    }

    if (endpoint === 'upgrade-intents') {
        return action === 'create_upgrade_intent'
            || action === 'consume_upgrade_intent'
            || (action === 'list_recent_upgrade_intents' && hasOwnerGradeControlPlaneAccess);
    }

    if (endpoint === 'manage-licenses') {
        if (method === 'GET') return hasOwnerGradeControlPlaneAccess;
        if (CRM_READ_ACTIONS.has(action)) return hasOwnerGradeControlPlaneAccess;
        return MANAGE_LICENSES_OWNER_ACTIONS.has(action)
            || MANAGE_LICENSES_SELF_SERVICE_SECRET_ACTIONS.has(action);
    }

    if (endpoint === 'system-update-runner') {
        return hasOwnerGradeControlPlaneAccess;
    }

    return false;
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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Signature, X-Admin-Timestamp');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // --- 1. Validate endpoint parameter ---
    const endpoint = req.query.endpoint as string;
    if (!endpoint || !ALLOWED_ENDPOINTS.includes(endpoint)) {
        return res.status(403).json({ error: 'Endpoint not allowed' });
    }

    const requestBody = getRequestBody(req.body);
    const action = String(requestBody?.action || req.query.action || req.method || '').trim().toLowerCase();
    const proxyRateLimit = enforceApiRateLimit(req, res, {
        scope: `central_proxy:${endpoint}`,
        identifiers: [
            action,
            typeof requestBody?.email === 'string' ? requestBody.email : null,
            typeof req.query.email === 'string' ? req.query.email : null,
            typeof requestBody?.license_key === 'string' ? requestBody.license_key : null,
        ],
        limit: ['system-update-runner', 'create-commercial-license', 'manage-licenses'].includes(endpoint) ? 30 : 80,
        windowMs: 15 * 60 * 1000,
    });
    if (!proxyRateLimit.allowed) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    if (
        endpoint === 'upgrade-intents'
        && requestBody?.action === 'list_recent_upgrade_intents'
        && !isControlPlaneRequest(req)
    ) {
        return res.status(403).json({ error: 'Operation restricted to the Super Checkout control plane' });
    }

    // --- 2. Validate required env vars ---
    const centralApiUrl =
        process.env.CENTRAL_API_URL
        || process.env.VITE_CENTRAL_API_URL
        || process.env.NEXT_PUBLIC_CENTRAL_API_URL
        || OFFICIAL_CENTRAL_API_URL
        || getDevFallback(DEV_CENTRAL_API_URL);
    const centralSecret = process.env.CENTRAL_SHARED_SECRET || process.env.SHARED_SECRET;
    const centralAnonEnv =
        process.env.CENTRAL_SUPABASE_PUBLISHABLE_KEY
        || process.env.VITE_CENTRAL_SUPABASE_PUBLISHABLE_KEY
        || process.env.NEXT_PUBLIC_CENTRAL_SUPABASE_PUBLISHABLE_KEY
        || process.env.CENTRAL_SUPABASE_ANON_KEY
        || process.env.VITE_CENTRAL_SUPABASE_ANON_KEY
        || process.env.NEXT_PUBLIC_CENTRAL_SUPABASE_ANON_KEY;
    if (!centralApiUrl || !centralAnonEnv) {
        console.error('[Central Proxy] Missing CENTRAL_API_URL or CENTRAL_SUPABASE_ANON_KEY');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    if (endpoint === 'request-activation-link' || endpoint === 'request-recovery-link') {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        const centralAnon = centralAnonEnv;
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
        const localSupabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || getDevFallback(DEV_LOCAL_SUPABASE_URL);
        const localAnonKey =
            process.env.SUPABASE_PUBLISHABLE_KEY
            || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
            || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
            || process.env.VITE_SUPABASE_ANON_KEY
            || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        const localServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
        const centralSupUrl =
            process.env.CENTRAL_SUPABASE_URL
            || process.env.VITE_CENTRAL_SUPABASE_URL
            || process.env.NEXT_PUBLIC_CENTRAL_SUPABASE_URL
            || centralApiUrl.replace('/functions/v1', '')
            || OFFICIAL_CENTRAL_SUPABASE_URL
            || getDevFallback(DEV_CENTRAL_SUPABASE_URL);
        const centralAnon = centralAnonEnv;
        const centralServiceKey = process.env.CENTRAL_SUPABASE_SECRET_KEY || process.env.CENTRAL_SUPABASE_SERVICE_ROLE_KEY;

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
        const userEmail = user.email ? user.email.toLowerCase() : '';
        const maskedUserEmail = maskEmail(user.email);
        const localAdminAccess = await resolveLocalAdminAccess(
            localSupabaseUrl as string,
            localAnonKey || localServiceKey,
            user.id,
            userEmail,
            jwt
        );
        const controlPlaneAdminAccess = await resolveControlPlaneAdminAccess(
            req,
            localSupabaseUrl as string,
            localAnonKey || localServiceKey,
            user.id,
            userEmail,
            jwt
        );
        const hasLocalAdminAccess = localAdminAccess.allowed;
        const hasSystemOwnerControlPlaneAccess = isControlPlaneRequest(req) && isSystemOwnerEmail(userEmail);
        const hasControlPlaneAdminAccess = controlPlaneAdminAccess.allowed || hasSystemOwnerControlPlaneAccess;
        const controlPlaneAdminRole = hasSystemOwnerControlPlaneAccess ? 'master_admin' : (controlPlaneAdminAccess.role || '');
        const canCreateCommercialLicense = hasSystemOwnerControlPlaneAccess;
        const hasOwnerGradeControlPlaneAccess = hasSystemOwnerControlPlaneAccess;

        if (endpoint === 'create-commercial-license') {
            if (req.method !== 'POST') {
                return res.status(405).json({ error: 'Method not allowed' });
            }

            if (!isControlPlaneRequest(req) || requestBody?.source !== 'manual_admin' || !canCreateCommercialLicense) {
                console.warn(`[Central Proxy] Blocked commercial license creation attempt by ${maskedUserEmail}`);
                return res.status(403).json({ error: 'Insufficient permissions' });
            }
        }

        if (endpoint === 'manage-licenses') {
            const action = requestBody?.action;
            const isGlobalRead = req.method === 'GET' && !requestBody?.action;
            const isOwnerOnlyAction = action ? MANAGE_LICENSES_OWNER_ACTIONS.has(action) : false;

            if ((isGlobalRead || isOwnerOnlyAction) && !hasOwnerGradeControlPlaneAccess) {
                console.warn(`[Central Proxy] Blocked non-owner global license operation by ${maskedUserEmail}: ${action || 'GET'}`);
                return res.status(403).json({ error: 'Insufficient permissions' });
            }
        }

        if (endpoint === 'system-update-runner') {
            const action = requestBody?.action;
            if (req.method !== 'POST' || !['test', 'sync', 'rollback'].includes(action)) {
                return res.status(400).json({ error: 'Invalid update runner request' });
            }

            if (!hasLocalAdminAccess && !hasControlPlaneAdminAccess) {
                console.warn(`[Central Proxy] Blocked update runner attempt by ${maskedUserEmail}`);
                return res.status(403).json({ error: 'Insufficient permissions' });
            }
        }

        if (endpoint === 'upgrade-intents') {
            const action = requestBody?.action;
            if (['consume_upgrade_intent', 'list_recent_upgrade_intents'].includes(action) && !hasOwnerGradeControlPlaneAccess) {
                console.warn(`[Central Proxy] Blocked privileged upgrade-intents action by ${maskedUserEmail}: ${action}`);
                return res.status(403).json({ error: 'Insufficient permissions' });
            }
        }

        if (endpoint === 'get-license-status') {
            const targetEmailRaw = req.method === 'GET' ? req.query?.email : requestBody?.email;
            const targetEmail = typeof targetEmailRaw === 'string' ? targetEmailRaw.toLowerCase() : '';
            if (targetEmail && targetEmail !== userEmail && !hasSystemOwnerControlPlaneAccess) {
                console.warn(`[Central Proxy] Blocked cross-account license status lookup by ${maskedUserEmail}`);
                return res.status(403).json({ error: 'Insufficient permissions or email mismatch' });
            }
        }

        if (!hasLocalAdminAccess && !hasControlPlaneAdminAccess) {
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
                    'get_license_features',
                    ...CRM_READ_ACTIONS
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
            } else if (endpoint === 'create-passport-ticket') {
                const targetEmail = requestBody?.email;
                if (!targetEmail || String(targetEmail).toLowerCase() === userEmail) {
                    isAllowed = true;
                }
            }

            if (!isAllowed) {
                console.warn(`[Central Proxy] Forbidden access attempt by ${maskedUserEmail} on ${endpoint} action ${requestBody?.action}`);
                return res.status(403).json({ error: 'Insufficient permissions or email mismatch' });
            }
        }

        const shouldSendAdminSecret = shouldForwardAdminSecret(
            endpoint,
            req.method,
            requestBody,
            hasOwnerGradeControlPlaneAccess
        );

        if (shouldSendAdminSecret && !centralSecret) {
            console.error(`[Central Proxy] Missing CENTRAL_SHARED_SECRET for trusted endpoint ${endpoint}`);
            return res.status(500).json({ error: 'Server configuration error' });
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
        const centralFunctionAuthToken = centralAnon;
        const forwardHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'apikey': centralAnon,
            'Authorization': `Bearer ${centralFunctionAuthToken}`,
        };
        if (shouldSendAdminSecret && centralSecret) {
            forwardHeaders['x-admin-secret'] = centralSecret;
        }

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

                if (endpoint === 'manage-user-installations' || endpoint === 'get-license-status') {
                    bodyObj.user_id = user.id;
                    bodyObj.email = user.email;
                }

                if (endpoint === 'create-commercial-license') {
                    bodyObj._proxy_authenticated = true;
                    bodyObj._actor_role = controlPlaneAdminRole;
                }

                if (
                    endpoint === 'system-update-runner'
                    || endpoint === 'check-entitlement'
                    || (endpoint === 'manage-licenses' && CRM_READ_ACTIONS.has(bodyObj.action))
                    || (endpoint === 'upgrade-intents' && bodyObj.action === 'create_upgrade_intent')
                ) {
                    bodyObj.license_key = bodyObj.license_key || process.env.VITE_LICENSE_KEY || process.env.NEXT_PUBLIC_LICENSE_KEY;
                    bodyObj.current_domain = getRequestDomain(req, bodyObj.current_domain);
                    bodyObj.proxy_authenticated = true;
                }

                fetchOptions.body = JSON.stringify(bodyObj);
            } catch (e) {
                fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
            }
        }

        const response = await fetch(targetUrl, fetchOptions);
        const responseData = await response.text();

        if (endpoint === 'system-update-runner' && response.status === 401) {
            const centralPayload = (() => {
                try {
                    return JSON.parse(responseData);
                } catch {
                    return {};
                }
            })();
            const centralError = String(centralPayload?.error || centralPayload?.message || responseData || '');

            if (/unauthorized/i.test(centralError)) {
                console.error('[Central Proxy] system-update-runner rejected x-admin-secret. Check CENTRAL_SHARED_SECRET in the installation Vercel project and Central Supabase secrets.');
                return res.status(502).json({
                    success: false,
                    code: 'CENTRAL_AUTH_FAILED',
                    error: 'Central authentication failed.'
                });
            }
        }

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

import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { applyCors } from '../_cors.js';
import { logAuthzEvent, requireApiAuth } from '../_authz.js';
import { enforceApiRateLimit } from '../_rate-limit.js';

export const config = {
    maxDuration: 60,
};

function normalizeDomain(value: unknown) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '')
        .replace(/\.$/, '');
}

function isValidDomain(domain: string) {
    return /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(domain);
}

type DomainLimit = number | 'unlimited';

const PLAN_DOMAIN_LIMITS: Record<string, DomainLimit> = {
    free: 1,
    starter: 1,
    pro: 'unlimited',
    saas: 1,
    upgrade_domains: 'unlimited',
    whitelabel: 'unlimited',
    agency: 'unlimited',
    enterprise: 'unlimited',
    master: 'unlimited',
    owner: 'unlimited',
    commercial: 'unlimited',
    lifetime: 'unlimited',
};

function normalizePlan(value: unknown) {
    return String(value || 'free').trim().toLowerCase();
}

function getDomainLimit(plan: string): DomainLimit {
    return PLAN_DOMAIN_LIMITS[normalizePlan(plan)] ?? PLAN_DOMAIN_LIMITS.free;
}

function normalizeConfigValue(value: unknown) {
    if (value == null) return '';
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return typeof parsed === 'string' ? parsed.trim() : String(parsed || '').trim();
        } catch {
            return value.trim();
        }
    }
    return String(value || '').trim();
}

async function loadInstallationId(supabaseAdmin: SupabaseClient) {
    const { data, error } = await supabaseAdmin
        .from('app_config')
        .select('value')
        .eq('key', 'installation_id')
        .maybeSingle();

    if (error) {
        const msg = error.message || '';
        if (msg.includes('app_config') || msg.includes('schema cache')) return '';
        throw error;
    }

    return normalizeConfigValue((data as any)?.value);
}

function isActiveStatus(status: unknown) {
    return ['active', 'valid', 'trialing'].includes(String(status || '').trim().toLowerCase());
}

function isExpired(expiresAt: unknown) {
    if (!expiresAt) return false;
    const expires = new Date(String(expiresAt)).getTime();
    return Number.isFinite(expires) && expires <= Date.now();
}

async function resolveDomainContext(
    supabaseAdmin: SupabaseClient,
    params: { localUserId: string; centralUserId?: string | null },
) {
    const { data: account, error: accountError } = await supabaseAdmin
        .from('accounts')
        .select('id,plan_type,status')
        .eq('owner_user_id', params.localUserId)
        .maybeSingle();

    if (accountError) throw accountError;
    if (account && !isActiveStatus((account as any).status)) {
        return { allowed: false, reason: 'inactive_account', status: 403 as const };
    }

    let licenseQuery = supabaseAdmin
        .from('licenses')
        .select('key,plan,status,owner_id,account_id,expires_at,allowed_domain,created_at')
        .order('created_at', { ascending: false })
        .limit(1);

    const centralUserId = String(params.centralUserId || '').trim();
    if ((account as any)?.id && centralUserId) {
        licenseQuery = licenseQuery.or(`account_id.eq.${(account as any).id},owner_id.eq.${centralUserId}`);
    } else if ((account as any)?.id) {
        licenseQuery = licenseQuery.eq('account_id', (account as any).id);
    } else if (centralUserId) {
        licenseQuery = licenseQuery.eq('owner_id', centralUserId);
    } else {
        licenseQuery = licenseQuery.eq('owner_id', params.localUserId);
    }

    const { data: licenses, error: licenseError } = await licenseQuery;
    if (licenseError) throw licenseError;

    const license = Array.isArray(licenses) ? licenses[0] : null;
    const activeLicense = license && isActiveStatus((license as any).status) && !isExpired((license as any).expires_at)
        ? license
        : null;

    const installationId = await loadInstallationId(supabaseAdmin);
    if (installationId) {
        if (!activeLicense?.key) {
            return { allowed: false, reason: 'missing_active_license_binding', status: 403 as const };
        }

        const { data: installation, error: installationError } = await supabaseAdmin
            .from('installations')
            .select('id,status,license_key,account_id,installation_id')
            .eq('installation_id', installationId)
            .eq('license_key', activeLicense.key)
            .maybeSingle();

        if (installationError) throw installationError;
        if (!installation || !isActiveStatus((installation as any).status)) {
            return { allowed: false, reason: 'missing_active_installation_binding', status: 403 as const };
        }
    }

    if (!account && !activeLicense) {
        return { allowed: false, reason: 'missing_account_or_license', status: 403 as const };
    }

    const plan = normalizePlan((activeLicense as any)?.plan || (account as any)?.plan_type || 'free');
    return {
        allowed: true,
        reason: null,
        status: 200 as const,
        plan,
        limit: getDomainLimit(plan),
        accountId: (account as any)?.id || null,
        licenseKey: (activeLicense as any)?.key || null,
        installationId: installationId || null,
    };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    applyCors(req, res, 'POST,OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const auth = await requireApiAuth(req, res, {
        source: 'domains_add',
        allowedRoles: ['admin', 'owner', 'master_admin'],
    });
    if (!auth) return;

    const { supabaseAdmin, user, profile } = auth;
    const domain = normalizeDomain(req.body?.domain);
    const rateLimit = enforceApiRateLimit(req, res, {
        scope: 'domains_add',
        identifiers: [user.id, domain],
        limit: 20,
        windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
        await logAuthzEvent({
            supabaseAdmin,
            req,
            source: 'domains_add',
            eventType: 'domain_operation_rate_limited',
            severity: 'WARNING',
            userId: user.id,
            metadata: {
                action: 'add',
                domain,
            },
        });
        return res.status(429).json({ error: 'Too many requests' });
    }

    if (!domain || !isValidDomain(domain)) {
        return res.status(400).json({ error: 'Domain is required' });
    }

    const { data: existingDomain, error: existingDomainError } = await supabaseAdmin
        .from('domains')
        .select('id,user_id,domain,status')
        .eq('domain', domain)
        .maybeSingle();

    if (existingDomainError) {
        console.error('[domains_add] Failed to load domain ownership:', existingDomainError.message);
        await logAuthzEvent({
            supabaseAdmin,
            req,
            source: 'domains_add',
            eventType: 'domain_operation_rejected',
            severity: 'CRITICAL',
            userId: user.id,
            metadata: {
                reason: 'domain_lookup_failed',
                domain,
            },
        });
        return res.status(500).json({ error: 'Internal Server Error' });
    }

    if (existingDomain && existingDomain.user_id !== user.id) {
        await logAuthzEvent({
            supabaseAdmin,
            req,
            source: 'domains_add',
            eventType: 'domain_operation_rejected',
            severity: 'CRITICAL',
            userId: user.id,
            metadata: {
                reason: 'domain_owner_mismatch',
                domain,
                domain_id: existingDomain.id,
            },
        });
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        const domainContext = await resolveDomainContext(supabaseAdmin, {
            localUserId: user.id,
            centralUserId: profile.central_user_id,
        });

        if (!domainContext.allowed) {
            await logAuthzEvent({
                supabaseAdmin,
                req,
                source: 'domains_add',
                eventType: 'domain_operation_rejected',
                severity: 'WARNING',
                userId: user.id,
                metadata: {
                    reason: domainContext.reason,
                    domain,
                },
            });
            return res.status(domainContext.status).json({ error: 'Domain is not allowed for this installation or license' });
        }

        if (!existingDomain) {
            const { data: ownedDomains, error: ownedDomainsError } = await supabaseAdmin
                .from('domains')
                .select('id,domain,type')
                .eq('user_id', user.id);

            if (ownedDomainsError) {
                console.error('[domains_add] Failed to load plan domain usage:', ownedDomainsError.message);
                return res.status(500).json({ error: 'Internal Server Error' });
            }

            const currentCustomDomains = (ownedDomains || []).filter((item: any) => {
                const itemDomain = String(item.domain || '').toLowerCase();
                return itemDomain !== domain
                    && item.type !== 'installation'
                    && !itemDomain.endsWith('.vercel.app');
            }).length;

            if (domainContext.limit !== 'unlimited' && currentCustomDomains >= domainContext.limit) {
                await logAuthzEvent({
                    supabaseAdmin,
                    req,
                    source: 'domains_add',
                    eventType: 'domain_plan_limit_reached',
                    severity: 'WARNING',
                    userId: user.id,
                    metadata: {
                        plan: domainContext.plan,
                        limit: domainContext.limit,
                        current_count: currentCustomDomains,
                    },
                });
                return res.status(403).json({ error: 'Domain plan limit reached' });
            }
        }
    } catch (securityError: any) {
        console.error('[domains_add] Domain security context failed:', securityError?.message || securityError);
        return res.status(500).json({ error: 'Internal Server Error' });
    }

    const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
    const PROJECT_ID = process.env.VERCEL_PROJECT_ID;
    const TEAM_ID = process.env.VERCEL_TEAM_ID;

    if (!VERCEL_TOKEN || !PROJECT_ID) {
        console.error('Missing Vercel configuration');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    try {
        const response = await fetch(
            `https://api.vercel.com/v10/projects/${PROJECT_ID}/domains${TEAM_ID ? `?teamId=${TEAM_ID}` : ''}`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${VERCEL_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: domain }),
            }
        );

        const data = await response.json();

        if (!response.ok) {
            // Handle 409 (Conflict) - check if it's already ours
            if (response.status === 409) {
                console.log('Domain already exists, checking ownership...');
                try {
                    const checkResponse = await fetch(
                        `https://api.vercel.com/v9/projects/${PROJECT_ID}/domains/${domain}${TEAM_ID ? `?teamId=${TEAM_ID}` : ''}`,
                        {
                            headers: {
                                Authorization: `Bearer ${VERCEL_TOKEN}`,
                            },
                        }
                    );

                    if (checkResponse.ok) {
                        const domainInfo = await checkResponse.json();
                        // It exists and is linked to this project. Return success.
                        return res.status(200).json(domainInfo);
                    }
                } catch (checkErr) {
                    console.error('Error checking existing domain:', checkErr);
                }
            }

            console.error('Vercel API Error:', data);
            return res.status(response.status).json({ error: 'Failed to add domain' });
        }

        return res.status(200).json(data);
    } catch (error: any) {
        console.error('Error adding domain:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

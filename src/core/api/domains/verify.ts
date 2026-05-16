import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from '../_cors.js';
import { logAuthzEvent, requireApiAuth } from '../_authz.js';
import { enforceApiRateLimit } from '../_rate-limit.js';

// export const config = {
//     maxDuration: 60,
// };

const TWO_PART_PUBLIC_SUFFIXES = new Set([
    'com.br',
    'net.br',
    'org.br',
    'gov.br',
    'edu.br',
    'co.uk',
    'org.uk',
    'com.au',
    'net.au',
    'co.jp'
]);

function getZoneDomain(domain: string) {
    const parts = domain.toLowerCase().split('.').filter(Boolean);
    if (parts.length <= 2) return parts.join('.');

    const lastTwo = parts.slice(-2).join('.');
    const lastThree = parts.slice(-3).join('.');

    if (TWO_PART_PUBLIC_SUFFIXES.has(lastTwo)) {
        return lastThree;
    }

    return lastTwo;
}

function isApexDomain(domain: string) {
    return domain.toLowerCase() === getZoneDomain(domain);
}

function getDnsHost(domain: string) {
    const normalized = domain.toLowerCase();
    const zone = getZoneDomain(normalized);
    if (normalized === zone) return '@';
    if (normalized.endsWith(`.${zone}`)) {
        return normalized.slice(0, -zone.length - 1);
    }
    return normalized;
}

function normalizeDomain(value: unknown) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '')
        .replace(/\.$/, '');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    applyCors(req, res, 'GET,OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const auth = await requireApiAuth(req, res, {
        source: 'domains_verify',
        allowedRoles: ['admin', 'owner', 'master_admin'],
    });
    if (!auth) return;

    const { supabaseAdmin, user } = auth;
    const domain = normalizeDomain(req.query.domain);
    const rateLimit = enforceApiRateLimit(req, res, {
        scope: 'domains_verify',
        identifiers: [user.id, domain],
        limit: 60,
        windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
        await logAuthzEvent({
            supabaseAdmin,
            req,
            source: 'domains_verify',
            eventType: 'domain_operation_rate_limited',
            severity: 'WARNING',
            userId: user.id,
            metadata: {
                action: 'verify',
                domain,
            },
        });
        return res.status(429).json({ error: 'Too many requests' });
    }

    if (!domain) {
        return res.status(400).json({ error: 'Domain is required' });
    }

    const { data: existingDomain, error: existingDomainError } = await supabaseAdmin
        .from('domains')
        .select('id,user_id,domain,status')
        .eq('domain', domain)
        .maybeSingle();

    if (existingDomainError) {
        console.error('[domains_verify] Failed to load domain ownership:', existingDomainError.message);
        await logAuthzEvent({
            supabaseAdmin,
            req,
            source: 'domains_verify',
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

    if (!existingDomain) {
        return res.status(404).json({ error: 'Domain not found' });
    }

    if (existingDomain.user_id !== user.id) {
        await logAuthzEvent({
            supabaseAdmin,
            req,
            source: 'domains_verify',
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

    const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
    const PROJECT_ID = process.env.VERCEL_PROJECT_ID;
    const TEAM_ID = process.env.VERCEL_TEAM_ID;

    if (!VERCEL_TOKEN || !PROJECT_ID) {
        console.error('Missing Vercel configuration');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    try {
        let currentTeamId = TEAM_ID;

        // 0. Auto-detect Team ID if missing
        // If we don't have a Team ID, try to fetch it from the user's teams.
        // This handles Team-Scoped Tokens where TEAM_ID might not be in env.
        if (!currentTeamId) {
            try {
                const teamsRes = await fetch('https://api.vercel.com/v2/teams', {
                    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` }
                });
                const teamsData = await teamsRes.json();
                if (teamsData.teams && teamsData.teams.length > 0) {
                    // Use the first team found (usually the one the token is scoped to)
                    currentTeamId = teamsData.teams[0].id;
                }
            } catch (e) {
                console.warn('Failed to fetch teams:', e);
            }
        }

        // 1. Get Domain Config
        let configRes = await fetch(
            `https://api.vercel.com/v6/domains/${domain}/config${currentTeamId ? `?teamId=${currentTeamId}` : ''}`,
            { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } }
        );
        let config = await configRes.json();

        // Retry if forbidden (just in case our detection failed or we need to try another way)
        // If config.error.code is 'forbidden' and we still don't have a teamId, it means the token
        // might be scoped to a personal account or a different team.
        // For now, we'll rely on the upfront team detection.
        // The previous complex project fetch logic is removed as per instructions.

        // 2. Get Domain Status (Verification challenges)
        const domainRes = await fetch(
            `https://api.vercel.com/v10/projects/${PROJECT_ID}/domains/${domain}${currentTeamId ? `?teamId=${currentTeamId}` : ''}`,
            { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } }
        );
        const domainData = await domainRes.json();

        if (domainData.error) {
            if (domainData.error.code === 'not_found') {
                return res.status(404).json({ error: 'Domain not found in project' });
            }
            throw new Error(domainData.error.message);
        }

        // 3. Force Verification Check
        let verificationChallenges = domainData.verification || [];
        let verifyData = null;
        const configFailed = !!config.error;

        // If challenges missing, try POST verify
        if (verificationChallenges.length === 0) {
            try {
                const verifyRes = await fetch(
                    `https://api.vercel.com/v9/projects/${PROJECT_ID}/domains/${domain}/verify${currentTeamId ? `?teamId=${currentTeamId}` : ''}`,
                    {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${VERCEL_TOKEN}` }
                    }
                );
                verifyData = await verifyRes.json();
                if (verifyData.verification) {
                    verificationChallenges = verifyData.verification;
                }
            } catch (e) {
                console.warn('Failed to force verify:', e);
            }
        }

        // Determine misconfigured status
        const isMisconfigured = domainData.misconfigured || config.misconfigured || configFailed;

        // Construct DNS Records: MERGE Verification + Config
        let dnsRecords: any[] = [];
        const apexDomain = isApexDomain(domain);
        const domainDnsHost = getDnsHost(domain);

        // 1. Add Verification Challenges (Ownership)
        if (verificationChallenges.length > 0) {
            dnsRecords = [...verificationChallenges];
        }

        // 2. Add Recommended Configuration (Connection) - if not already present
        if (config) {
            if (!apexDomain && config.recommendedCNAME && Array.isArray(config.recommendedCNAME)) {
                config.recommendedCNAME
                    .filter((rec: any) => rec.rank === 1)
                    .forEach((rec: any) => {
                        // Check if this type/value combo already exists
                        const exists = dnsRecords.some(r => r.type === 'CNAME' && r.value === rec.value);
                        if (!exists) {
                            dnsRecords.push({
                                type: 'CNAME',
                                domain: domainDnsHost,
                                value: rec.value.endsWith('.') ? rec.value.slice(0, -1) : rec.value,
                                reason: 'recommended_cname'
                            });
                        }
                    });
            }
            if (apexDomain && config.recommendedIPv4 && Array.isArray(config.recommendedIPv4)) {
                config.recommendedIPv4
                    .filter((rec: any) => rec.rank === 1)
                    .forEach((rec: any) => {
                        if (Array.isArray(rec.value)) {
                            rec.value.forEach((val: string) => {
                                const exists = dnsRecords.some(r => r.type === 'A' && r.value === val);
                                if (!exists) {
                                    dnsRecords.push({
                                        type: 'A',
                                        domain: '@',
                                        value: val,
                                        reason: 'recommended_a'
                                    });
                                }
                            });
                        } else {
                            const exists = dnsRecords.some(r => r.type === 'A' && r.value === rec.value);
                            if (!exists) {
                                dnsRecords.push({
                                    type: 'A',
                                    domain: '@',
                                    value: rec.value,
                                    reason: 'recommended_a'
                                });
                            }
                        }
                    });
            }
        }

        // FALLBACK: If we still have no records, return standard Vercel records
        if (dnsRecords.length === 0) {
            if (apexDomain) {
                dnsRecords.push({
                    type: 'A',
                    domain: '@',
                    value: '76.76.21.21',
                    reason: 'default_a'
                });
            } else {
                dnsRecords.push({
                    type: 'CNAME',
                    domain: domainDnsHost,
                    value: 'cname.vercel-dns.com',
                    reason: 'default_cname'
                });
            }
        }

        if (domainData.verified && !isMisconfigured) {
            const { error: updateError } = await supabaseAdmin
                .from('domains')
                .update({
                    status: 'active',
                    verified_at: new Date().toISOString()
                })
                .eq('id', existingDomain.id)
                .eq('user_id', user.id);

            if (updateError) {
                console.error('[Auto-Verify] Failed to update DB:', updateError.message);
            } else {
                console.log(`[Auto-Verify] Updated ${domain} to active`);
            }
        }

        return res.status(200).json({
            configured: !isMisconfigured,
            verified: domainData.verified,
            verification: verificationChallenges,
            status: isMisconfigured ? 'pending' : 'active',
            verificationChallenges: verificationChallenges,
            dnsRecords,
            misconfigured: isMisconfigured
        });

    } catch (error: any) {
        console.error('Error verifying domain:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

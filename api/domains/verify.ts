import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
    maxDuration: 60,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { domain } = req.query;

    if (!domain || typeof domain !== 'string') {
        return res.status(400).json({ error: 'Domain is required' });
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

        // 1. Add Verification Challenges (Ownership)
        if (verificationChallenges.length > 0) {
            dnsRecords = [...verificationChallenges];
        }

        // 2. Add Recommended Configuration (Connection) - if not already present
        if (config) {
            if (config.recommendedCNAME && Array.isArray(config.recommendedCNAME)) {
                config.recommendedCNAME
                    .filter((rec: any) => rec.rank === 1)
                    .forEach((rec: any) => {
                        // Check if this type/value combo already exists
                        const exists = dnsRecords.some(r => r.type === 'CNAME' && r.value === rec.value);
                        if (!exists) {
                            dnsRecords.push({
                                type: 'CNAME',
                                domain: domain,
                                value: rec.value.endsWith('.') ? rec.value.slice(0, -1) : rec.value,
                                reason: 'recommended_cname'
                            });
                        }
                    });
            }
            if (config.recommendedIPv4 && Array.isArray(config.recommendedIPv4)) {
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
            dnsRecords.push(
                {
                    type: 'CNAME',
                    domain: domain,
                    value: 'cname.vercel-dns.com',
                    reason: 'default_cname'
                },
                {
                    type: 'A',
                    domain: '@',
                    value: '76.76.21.21',
                    reason: 'default_a'
                }
            );
        }

        // NEW: If Verified, Update Supabase!
        if (domainData.verified && !isMisconfigured) {
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

            if (supabaseUrl && supabaseKey) {
                try {
                    await fetch(`${supabaseUrl}/rest/v1/domains?domain=eq.${domain}`, {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            'apikey': supabaseKey,
                            'Authorization': `Bearer ${supabaseKey}`,
                            'Prefer': 'return=minimal'
                        },
                        body: JSON.stringify({
                            status: 'active',
                            verified_at: new Date().toISOString()
                        })
                    });
                    console.log(`[Auto-Verify] Updated ${domain} to active`);
                } catch (dbErr) {
                    console.error('[Auto-Verify] Failed to update DB:', dbErr);
                }
            }
        }

        return res.status(200).json({
            configured: !isMisconfigured,
            verified: domainData.verified,
            verification: verificationChallenges,
            status: isMisconfigured ? 'pending' : 'active',
            config,
            verificationChallenges: verificationChallenges,
            dnsRecords, // New field with the best available records
            // DEBUG DATA
            debug_domain: domainData,
            debug_verify: verifyData || null,
            debug_config: config,
            detected_team_id: currentTeamId,
            ...domainData,
            misconfigured: isMisconfigured
        });

    } catch (error: any) {
        console.error('Error verifying domain:', error);
        return res.status(500).json({ error: error.message });
    }
}

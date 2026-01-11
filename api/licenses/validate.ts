import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { key, domain, skip_lock } = req.body;

    if (!key) return res.status(400).json({ valid: false, message: 'License key is required' });

    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error('Missing Supabase Environment Variables');
            return res.status(500).json({ valid: false, message: 'Server configuration error' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Get Local License
        const { data: license, error } = await supabase
            .from('licenses')
            .select('*')
            .eq('key', key)
            .single();

        // 2. Get Installation ID from app_config
        let installationId = null;
        try {
            const { data: configData } = await supabase
                .from('app_config')
                .select('value')
                .eq('key', 'installation_id')
                .single();

            if (configData?.value) {
                // Handle both raw string and JSON stringified values
                installationId = typeof configData.value === 'string'
                    ? configData.value.replace(/"/g, '') // Remove quotes if JSON stringified
                    : configData.value;
            }
        } catch (e) {
            console.warn('Failed to fetch installation_id from app_config', e);
        }

        // 3. Central Authority Check (Primary Validation & Enrichment)
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

            const validationRes = await fetch('https://bcmnryxjweiovrwmztpn.supabase.co/functions/v1/validate-license', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    license_key: key,
                    installation_id: installationId, // Send local installation_id
                    current_domain: req.headers['host'] || 'unknown',
                    domain: domain // Pass the client domain if provided
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (validationRes.ok) {
                const comparison = await validationRes.json();

                // If central says invalid (revoked, expired), return invalid immediately
                if (!comparison.valid) {
                    return res.status(200).json({
                        valid: false,
                        message: comparison.message || 'Licença revogada ou inválida.'
                    });
                }

                // If valid, return central data which contains the authoritative ROLE
                // We also sync with local DB if needed (Healing)
                if (!license && comparison.license) {
                    // Heal logic: Insert into local DB
                    await supabase.from('licenses').insert({
                        key: key,
                        status: 'active',
                        plan: comparison.license.plan,
                        client_name: comparison.license.client_name,
                        client_email: comparison.license.client_email,
                        allowed_domain: domain || comparison.license.allowed_domain,
                        expires_at: comparison.license.expires_at,
                        created_at: new Date().toISOString()
                    });
                }

                return res.status(200).json({
                    valid: true,
                    usage_type: comparison.usage_type || (license?.plan === 'commercial' ? 'commercial' : 'personal'),
                    role: comparison.role || 'client', // Default to client if missing
                    installation_id: installationId,
                    license: comparison.license || license,
                    permissions: {
                        create_license: comparison.role === 'owner',
                        resell: comparison.role === 'owner'
                    }
                });
            }
        } catch (centralError) {
            console.warn('⚠️ Central validation unreachable, using local fallback:', centralError);
        }

        // 4. Local Fallback (If Central is down)
        if (!license) {
            return res.status(200).json({ valid: false, message: 'License key invalid or not found locally.' });
        }

        if (license.status !== 'active') {
            return res.status(200).json({ valid: false, message: 'License is not active' });
        }

        // Expiration Check
        if (license.expires_at) {
            const now = new Date();
            const expirationDate = new Date(license.expires_at);
            if (now > expirationDate) {
                return res.status(200).json({
                    valid: false,
                    message: 'License expired on ' + expirationDate.toLocaleDateString()
                });
            }
        }

        // Domain Locking Logic (Local)
        if (license.allowed_domain) {
            const cleanDomain = domain?.replace(/^https?:\/\//, '').replace(/^www\./, '');
            const cleanAllowed = license.allowed_domain.replace(/^https?:\/\//, '').replace(/^www\./, '');

            if (cleanAllowed !== cleanDomain) {
                return res.status(200).json({
                    valid: false,
                    message: `License locked to domain: ${license.allowed_domain}`
                });
            }
        } else if (domain && !skip_lock) {
            // Lock to current domain if not locked
            const { error: updateError } = await supabase
                .from('licenses')
                .update({ allowed_domain: domain, activated_at: new Date().toISOString() })
                .eq('key', key);

            if (updateError) console.error('Failed to lock domain locally:', updateError);
        }

        return res.status(200).json({
            valid: true,
            usage_type: license.plan === 'commercial' ? 'commercial' : 'personal',
            role: 'client', // Default fallback role when offline
            installation_id: installationId,
            license: license,
            permissions: {
                create_license: license.plan === 'commercial',
                resell: license.plan === 'commercial'
            }
        });

    } catch (e: any) {
        console.error('Validation Warning:', e);
        return res.status(200).json({ valid: true, message: 'Validation bypassed (Error)' });
    }
}

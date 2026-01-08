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

        const { data: license, error } = await supabase
            .from('licenses')
            .select('*')
            .eq('key', key)
            .single();

        if (error || !license) {
            // FALLBACK: CHECK CENTRAL AUTHORITY (Hybrid Architecture)
            // If local check fails, we verify with the Central Server.
            // If valid there, we "heal" the local DB by inserting the license.
            console.log('Local license missing, checking Central Authority...');

            try {
                const centralAuthUrl = 'https://bcmnryxjweiovrwmztpn.supabase.co/functions/v1/validate-license';
                const centralRes = await fetch(centralAuthUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        license_key: key,
                        current_domain: domain || 'localhost',
                        activate: !skip_lock // ONLY activate if NOT skipping lock (e.g. Installer)
                    })
                });

                const centralData = await centralRes.json();

                if (centralRes.ok && centralData.valid) {
                    // HEAL LOCAL DB
                    console.log('Central Authority approved. Syncing to local...');
                    const { error: insertError } = await supabase
                        .from('licenses')
                        .insert({
                            key: key,
                            client_name: centralData.license.client_name || 'Admin User',
                            client_email: 'admin@local.com',
                            status: 'active',
                            plan: centralData.license.plan || 'commercial',
                            created_at: new Date().toISOString(),
                            activated_at: new Date().toISOString(),
                            allowed_domain: domain,
                            expires_at: centralData.license.expires_at || null
                        });

                    if (!insertError) {
                        return res.status(200).json({ valid: true, plan: centralData.license.plan });
                    }
                }
            } catch (centralError) {
                console.error('Central Validation Failed:', centralError);
            }

            // If fallback failed too:
            return res.status(200).json({ valid: false, message: 'Invalid license key (Local & Central)' });
        }

        if (license.status !== 'active') {
            return res.status(200).json({ valid: false, message: 'License is not active' });
        }

        // EXPIRATION CHECK
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

        // DOMAIN LOCKING LOGIC
        if (license.allowed_domain) {
            // Case 1: Domain is already locked -> Check match
            // Remove protocol and www for comparison
            const cleanDomain = domain?.replace(/^https?:\/\//, '').replace(/^www\./, '');
            const cleanAllowed = license.allowed_domain.replace(/^https?:\/\//, '').replace(/^www\./, '');

            if (cleanAllowed !== cleanDomain) {
                return res.status(200).json({
                    valid: false,
                    message: `License locked to domain: ${license.allowed_domain}`
                });
            }
        } else if (domain && !skip_lock) {
            // Case 2: No domain locked -> Lock to current domain (First Use)
            // ONLY if skip_lock is false (prevent installer from Locking)
            const { error: updateError } = await supabase
                .from('licenses')
                .update({
                    allowed_domain: domain,
                    activated_at: new Date().toISOString()
                })
                .eq('key', key);

            if (updateError) {
                console.error('Failed to lock domain:', updateError);
                // Fail safe: don't validate if we couldn't lock (prevents race condition)
                return res.status(500).json({ valid: false, message: 'Activation failed' });
            }
        }

        const usageType = license.usage_type || 'personal';
        const permissions = {
            create_license: usageType === 'commercial',
            resell: usageType === 'commercial'
        };

        return res.status(200).json({
            valid: true,
            usage_type: usageType,
            permissions
        });

    } catch (error: any) {
        console.error('License Validation Error:', error);
        return res.status(500).json({ valid: false, message: 'Internal Server Error' });
    }
}

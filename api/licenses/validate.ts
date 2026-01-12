import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // Allow GET for local status checks
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    let { key, domain, skip_lock } = req.body || {};

    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error('Missing Supabase Environment Variables');
            return res.status(500).json({ valid: false, message: 'Server configuration error' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. If no key provided (or GET), fetch most recent local license
        if (!key) {
            const { data: localLicense } = await supabase
                .from('licenses')
                .select('*')
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (localLicense) {
                key = localLicense.key;
            } else {
                // Even if no license, we might want to return installation_id if it exists?
                // But validation fails without a key usually.
                // Let's proceed to check installation_id anyway, returning invalid for license but valid for installation ID?
            }
        }

        if (!key && req.method === 'POST') {
            return res.status(400).json({ valid: false, message: 'License key is required' });
        }

        // 1. Get Local License (Refetch or reuse)
        const { data: license, error } = await supabase
            .from('licenses')
            .select('*')
            .eq('key', key)
            .single();

        // 2. Get Installation ID from app_config
        let installationId = null;
        let shouldRegister = false;

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

        // SELF-HEALING: If ID invalid or missing, generate and save it.
        // This migrates legacy installations to the new system automatically.
        if (!installationId) {
            console.log('⚠️ Legacy Installation detected (Missing ID). Auto-generating...');
            try {
                const crypto = await import('crypto');
                installationId = crypto.randomUUID();

                // Persist immediately
                const { error: saveError } = await supabase.from('app_config').insert({
                    key: 'installation_id',
                    value: JSON.stringify(installationId)
                });

                if (saveError) {
                    console.error('❌ Failed to save generated installation_id:', saveError);
                    // If table missing, we can't persist. CRITICAL ERROR.
                    // Fallback: Don't register to avoid filling slots with ephemeral IDs.
                    installationId = null;
                } else {
                    shouldRegister = true; // Force registration on Central
                    console.log(`✅ installation_id generated and saved: ${installationId}`);
                }
            } catch (err) {
                console.error('❌ Error generating ID:', err);
            }
        }

        // 3. Central Authority Check (Primary Validation & Enrichment)
        try {
            // Only proceed if we have an ID (or if we are deliberately checking without one, but we shouldn't)
            if (installationId) {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

                const validationRes = await fetch('https://bcmnryxjweiovrwmztpn.supabase.co/functions/v1/validate-license', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        license_key: key,
                        installation_id: installationId, // Send local installation_id
                        current_domain: req.headers['host'] || 'unknown',
                        domain: domain, // Pass the client domain if provided
                        register: shouldRegister // Auto-Register if it's new/healed
                    }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (validationRes.ok) {
                    let comparison = await validationRes.json();

                    // SELF-HEALING: If Central doesn't know this installation, register it now.
                    if (!comparison.valid && comparison.message?.includes('Installation not found')) {
                        console.warn('⚠️ Central missing installation. Attempting self-healing (auto-register)...');
                        try {
                            const retryRes = await fetch('https://bcmnryxjweiovrwmztpn.supabase.co/functions/v1/validate-license', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    license_key: key,
                                    installation_id: installationId,
                                    current_domain: req.headers['host'] || 'unknown',
                                    domain: domain,
                                    register: true // FORCE REGISTER
                                })
                            });

                            // Always parse the retry result if request completed
                            if (retryRes.ok || retryRes.status === 400 || retryRes.status === 409) {
                                const retryData = await retryRes.json();
                                // Only accept if valid, otherwise keep original error
                                if (retryData.valid) {
                                    console.log('✅ Self-healing successful.');
                                    comparison = retryData;
                                } else {
                                    console.error('❌ Self-healing failed:', retryData.message);
                                }
                            }
                        } catch (retryErr) {
                            console.error('Self-healing network error', retryErr);
                        }
                    }

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

                    // Logic to determine role locally if needed
                    const derivedRole = (comparison.role && comparison.role !== 'client')
                        ? comparison.role
                        : (comparison.license?.plan === 'master' || license?.plan === 'master') ? 'owner' : 'client';

                    return res.status(200).json({
                        valid: true,
                        usage_type: comparison.usage_type || (license?.plan === 'commercial' ? 'commercial' : 'personal'),
                        role: derivedRole,
                        installation_id: installationId,
                        license: comparison.license || license,
                        permissions: {
                            create_license: derivedRole === 'owner',
                            resell: derivedRole === 'owner'
                        }
                    });
                }
            } // End if (installationId)
        } catch (centralError) {
            console.warn('⚠️ Central validation unreachable, using local fallback:', centralError);
        }

        // 4. Local Fallback (If Central is down or ID missing)
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

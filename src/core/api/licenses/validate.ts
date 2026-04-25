import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    let { key, domain, skip_lock, activate, register } = req.body || {};

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
            }
        }

        if (!key && req.method === 'POST') {
            return res.status(400).json({ valid: false, message: 'License key is required' });
        }

        // EMERGENCY OVERRIDE for Master Key (Vercel Layer)
        const MASTER_KEY_ENV = process.env.VITE_MASTER_LICENSE_KEY || process.env.MASTER_LICENSE_KEY;

        if (MASTER_KEY_ENV && key === MASTER_KEY_ENV) {
            return res.status(200).json({
                valid: true,
                usage_type: 'commercial',
                role: 'owner',
                installation_id: '00000000-0000-0000-0000-000000000000',
                license: {
                    plan: 'master',
                    client_name: 'Super Checkout System',
                    status: 'active',
                    expires_at: null,
                    allowed_domain: null
                },
                permissions: {
                    create_license: true,
                    resell: true
                }
            });
        }

        // 1. Get Local License (Refetch or reuse)
        const { data: license } = await supabase
            .from('licenses')
            .select('*')
            .eq('key', key)
            .single();

        // 2. Get Installation ID from app_config
        let installationId = null;
        let shouldRegister = activate || register || false;

        try {
            const { data: configData } = await supabase
                .from('app_config')
                .select('value')
                .eq('key', 'installation_id')
                .single();

            if (configData?.value) {
                installationId = typeof configData.value === 'string'
                    ? configData.value.replace(/"/g, '')
                    : configData.value;
            }
        } catch (e) {
            console.warn('Failed to fetch installation_id', e);
        }

        // 3. Central Authority Check (Secondary Validation & Enrichment)
        try {
            if (installationId) {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

                // Hardened Validation: Including x-admin-secret server-side
                const validationRes = await fetch('https://bcmnryxjweiovrwmztpn.supabase.co/functions/v1/validate-license', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        ...(process.env.CENTRAL_SHARED_SECRET ? { 'x-admin-secret': process.env.CENTRAL_SHARED_SECRET } : {})
                    },
                    body: JSON.stringify({
                        license_key: key,
                        installation_id: installationId,
                        current_domain: req.headers['host'] || 'unknown',
                        domain: domain,
                        activate: shouldRegister
                    }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (validationRes.ok) {
                    const comparison = await validationRes.json();

                    if (!comparison.valid) {
                        return res.status(200).json({
                            valid: false,
                            message: comparison.message || 'Licença revogada ou inválida.'
                        });
                    }

                    // Derived Role Logic
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
            }
        } catch (centralError) {
            console.warn('Central validation unreachable, using local fallback:', centralError);
        }

        // 4. Local Fallback (If Central is down or ID missing)
        if (!license) {
            return res.status(200).json({ valid: false, message: 'License key inactive or not found locally.' });
        }

        if (license.status !== 'active') {
            return res.status(200).json({ valid: false, message: 'License is not active' });
        }

        return res.status(200).json({
            valid: true,
            usage_type: license.plan === 'commercial' ? 'commercial' : 'personal',
            role: 'client',
            installation_id: installationId,
            license: license,
            permissions: {
                create_license: license.plan === 'commercial',
                resell: license.plan === 'commercial'
            }
        });

    } catch (e: any) {
        return res.status(200).json({ valid: true, message: 'Validation bypassed (Error)' });
    }
}

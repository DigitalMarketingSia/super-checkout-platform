import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from '../_cors.js';
import { getLocalSupabaseServerConfig } from '../_supabase-server.js';

const CENTRAL_VALIDATE_URL = 'https://bcmnryxjweiovrwmztpn.supabase.co/functions/v1/validate-license';

const getRequestDomain = (req: VercelRequest) => {
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    return String(Array.isArray(host) ? host[0] : host)
        .replace(/^https?:\/\//, '')
        .split('/')[0]
        .split(':')[0]
        .trim()
        .toLowerCase();
};

const parseConfigValue = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    try {
        const parsed = JSON.parse(trimmed);
        return typeof parsed === 'string' && parsed.trim() ? parsed.trim() : null;
    } catch {
        return trimmed.replace(/^"|"$/g, '') || null;
    }
};

const publicLicense = (license: any) => ({
    client_name: license?.client_name || null,
    plan: license?.plan || null,
    status: license?.status || null,
    max_instances: license?.max_instances || null,
    expires_at: license?.expires_at || null,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
    applyCors(req, res, 'GET,OPTIONS,POST');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).json({ valid: false, error: 'Method not allowed' });
    }

    try {
        const { supabaseUrl, serverKey: supabaseServiceKey, serverKeySource } = getLocalSupabaseServerConfig();
        const centralAnonKey = String(
            process.env.CENTRAL_SUPABASE_PUBLISHABLE_KEY
            || process.env.VITE_CENTRAL_SUPABASE_PUBLISHABLE_KEY
            || process.env.NEXT_PUBLIC_CENTRAL_SUPABASE_PUBLISHABLE_KEY
            || process.env.CENTRAL_SUPABASE_ANON_KEY
            || process.env.VITE_CENTRAL_SUPABASE_ANON_KEY
            || process.env.NEXT_PUBLIC_CENTRAL_SUPABASE_ANON_KEY
            || ''
        ).trim();

        if (!supabaseUrl || !supabaseServiceKey || !centralAnonKey) {
            const missing = [
                !supabaseUrl ? 'VITE_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL' : null,
                !supabaseServiceKey ? 'SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY' : null,
                !centralAnonKey ? 'CENTRAL_SUPABASE_PUBLISHABLE_KEY/VITE_CENTRAL_SUPABASE_ANON_KEY' : null,
            ].filter(Boolean);

            console.error('[licenses/validate] Missing server configuration:', missing.join(', '));
            return res.status(500).json({
                valid: false,
                message: 'Server license validation is not configured.'
            });
        }

        console.log('[licenses/validate] Using Supabase server key source:', serverKeySource);
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const requestBody = req.method === 'POST' && req.body && typeof req.body === 'object' ? req.body : {};
        const requestedInstallationId = typeof requestBody.installation_id === 'string'
            ? requestBody.installation_id.trim()
            : null;
        const domain = getRequestDomain(req);

        // The installation ID is persisted by the installer on the server.  A value
        // supplied by the browser can only be used when it matches that server value.
        const { data: configData, error: configError } = await supabase
            .from('app_config')
            .select('value')
            .eq('key', 'installation_id')
            .maybeSingle();

        if (configError) throw configError;

        const persistedInstallationId = parseConfigValue(configData?.value);
        if (!persistedInstallationId) {
            return res.status(403).json({ valid: false, message: 'Installation is not configured.' });
        }

        if (requestedInstallationId && requestedInstallationId !== persistedInstallationId) {
            return res.status(403).json({ valid: false, message: 'Installation identity mismatch.' });
        }

        const { data: installation, error: installationError } = await supabase
            .from('installations')
            .select('id, license_key, installation_id, domain, status')
            .eq('installation_id', persistedInstallationId)
            .maybeSingle();

        if (installationError) throw installationError;
        if (!installation?.license_key || installation.status !== 'active') {
            return res.status(403).json({ valid: false, message: 'Installation is inactive or not registered.' });
        }

        const { data: license, error: licenseError } = await supabase
            .from('licenses')
            .select('key, client_name, client_email, status, plan, max_instances, expires_at')
            .eq('key', installation.license_key)
            .maybeSingle();

        if (licenseError) throw licenseError;
        if (!license || license.status !== 'active') {
            return res.status(403).json({ valid: false, message: 'License is inactive or not found.' });
        }

        const validationRes = await fetch(CENTRAL_VALIDATE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: centralAnonKey,
                Authorization: `Bearer ${centralAnonKey}`,
            },
            body: JSON.stringify({
                license_key: license.key,
                installation_id: persistedInstallationId,
                current_domain: domain,
            }),
            signal: AbortSignal.timeout(6000),
        });

        if (!validationRes.ok) {
            console.error('[licenses/validate] Central validation failed:', validationRes.status);
            return res.status(503).json({ valid: false, message: 'License authority is unavailable.' });
        }

        const comparison = await validationRes.json().catch(() => null);
        if (!comparison?.valid) {
            return res.status(403).json({
                valid: false,
                message: comparison?.message || 'License is revoked or invalid.'
            });
        }

        const centralLicense = comparison.license || {};
        const authoritativeInstallationId = String(comparison.installation_id || persistedInstallationId);
        const derivedRole = comparison.role && comparison.role !== 'client'
            ? comparison.role
            : centralLicense.plan === 'master' || license.plan === 'master'
                ? 'owner'
                : 'client';

        await supabase
            .from('installations')
            .update({ last_check_in: new Date().toISOString() })
            .eq('id', installation.id);

        if (authoritativeInstallationId !== persistedInstallationId) {
            await supabase
                .from('app_config')
                .upsert({ key: 'installation_id', value: JSON.stringify(authoritativeInstallationId) }, { onConflict: 'key' });
        }

        return res.status(200).json({
            valid: true,
            usage_type: comparison.usage_type || (license.plan === 'commercial' ? 'commercial' : 'personal'),
            role: derivedRole,
            installation_id: authoritativeInstallationId,
            license: publicLicense({ ...license, ...centralLicense }),
            permissions: {
                create_license: derivedRole === 'owner',
                resell: derivedRole === 'owner'
            }
        });
    } catch (error: any) {
        console.error('[licenses/validate] Unexpected validation error:', error?.message || error);
        return res.status(500).json({ valid: false, message: 'Unable to validate license.' });
    }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from './_cors.js';
import { getLocalSupabasePublicConfig } from './_supabase-server.js';

/**
 * CONFIGURATION ENDPOINT
 * 
 * Returns public configuration (Supabase URL & Anon Key) from server-side environment variables.
 * This acts as a fallback/hydration source for clients that lost their localStorage config
 * (e.g. fresh load on a custom domain).
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
    try {
        applyCors(req, res, 'GET,OPTIONS');

        if (req.method === 'OPTIONS') {
            res.status(200).end();
            return;
        }

        const { supabaseUrl, publicKey: supabaseAnonKey } = getLocalSupabasePublicConfig();

        if (!supabaseUrl || !supabaseAnonKey) {
            const missing = [
                !supabaseUrl ? 'VITE_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL' : null,
                !supabaseAnonKey ? 'SUPABASE_PUBLISHABLE_KEY/VITE_SUPABASE_ANON_KEY' : null,
            ].filter(Boolean);

            return res.status(500).json({
                error: 'Environment Configuration Missing',
                message: `Missing runtime environment variables: ${missing.join(', ')}`
            });
        }

        const licenseKey = process.env.VITE_LICENSE_KEY || process.env.NEXT_PUBLIC_LICENSE_KEY;

        res.status(200).json({
            url: supabaseUrl,
            anon: supabaseAnonKey,
            license: licenseKey
        });
    } catch (error: any) {
        console.error('[config] Failed to return runtime config:', error?.message || error);
        return res.status(500).json({
            error: 'Runtime Config Failed',
            message: 'Unable to load runtime configuration.'
        });
    }
}

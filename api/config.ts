import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * CONFIGURATION ENDPOINT
 * 
 * Returns public configuration (Supabase URL & Anon Key) from server-side environment variables.
 * This acts as a fallback/hydration source for clients that lost their localStorage config
 * (e.g. fresh load on a custom domain).
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
    // CORS Headers allowing any origin (since custom domains are dynamic)
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Retrieve keys from standard Vercel/Vite env vars
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        return res.status(500).json({
            error: 'Environment Configuration Missing',
            message: 'Server environment variables are not set.'
        });
    }

    res.status(200).json({
        url: supabaseUrl,
        anon: supabaseAnonKey,
        // We DO NOT return the Service Role Key here for security.
    });
}

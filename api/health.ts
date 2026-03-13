import type { VercelRequest, VercelResponse } from '@vercel.node';

/**
 * HEALTH / KEEP-ALIVE ENDPOINT
 * 
 * This endpoint is called by Vercel Cron to prevent Supabase project pausing.
 * It performs a simple query to ensure database activity.
 * Uses native fetch to match the project's existing API patterns.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS Headers
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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://vixlzrmhqsbzjhpgfwdn.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({
            error: 'Configuration Missing',
            message: 'Supabase environment variables are not set.'
        });
    }

    try {
        // Simple query via REST API to generate activity
        const response = await fetch(`${supabaseUrl}/rest/v1/modules?select=id&limit=1`, {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            }
        });

        if (!response.ok) {
            throw new Error(`Supabase REST API returned ${response.status}`);
        }

        res.status(200).json({
            status: 'healthy',
            message: 'Supabase keep-alive successful',
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        console.error('Keep-alive failed:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Internal Server Error'
        });
    }
}

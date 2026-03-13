import type { VercelRequest, VercelResponse } from '@vercel.node';
import { createClient } from '@supabase/supabase-js';

/**
 * HEALTH / KEEP-ALIVE ENDPOINT
 * 
 * This endpoint is called by Vercel Cron to prevent Supabase project pausing.
 * It performs a simple query to ensure database activity.
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

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        return res.status(500).json({
            error: 'Configuration Missing',
            message: 'Supabase environment variables are not set.'
        });
    }

    try {
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        
        // Simple query to generate activity
        const { data, error } = await supabase.from('modules').select('id').limit(1);

        if (error) throw error;

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

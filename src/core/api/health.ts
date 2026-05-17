import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from './_cors.js';
import { APP_VERSION, SCHEMA_VERSION } from '../config/version.js';

/**
 * HEALTH / KEEP-ALIVE ENDPOINT
 * 
 * This endpoint is called daily by Vercel Cron to reduce the chance of Supabase
 * Free projects being paused for inactivity.
 * It performs a simple query to ensure database activity.
 * Uses native fetch to match the project's existing API patterns.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    applyCors(req, res, 'GET,OPTIONS');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey =
        process.env.SUPABASE_PUBLISHABLE_KEY ||
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.VITE_SUPABASE_ANON_KEY ||
        process.env.SUPABASE_SECRET_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Service unavailable' });
    }

    try {
        // Simple query via REST API to generate activity on the customer's Supabase project.
        const headers: Record<string, string> = { apikey: supabaseKey };
        if (!supabaseKey.startsWith('sb_')) {
            headers.Authorization = `Bearer ${supabaseKey}`;
        }

        const response = await fetch(`${supabaseUrl}/rest/v1/modules?select=id&limit=1`, { headers });

        if (!response.ok) {
            throw new Error(`Supabase REST API returned ${response.status}`);
        }

        res.status(200).json({
            status: 'healthy',
            message: 'Supabase keep-alive successful',
            app_version: APP_VERSION,
            schema_version: SCHEMA_VERSION,
            fulfillment_pipeline: 'vercel',
            hotfix: 'paid-checkout-side-effects',
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        console.error('Keep-alive failed:', error?.message || error);
        res.status(500).json({
            status: 'error',
            message: 'Internal Server Error'
        });
    }
}

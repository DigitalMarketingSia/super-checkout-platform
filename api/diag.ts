import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.status(200).json({
        status: 'online',
        env: {
            SUPABASE_URL: !!(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL),
            SERVICE_ROLE_KEY: !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY),
            STRIPE_WEBHOOK_SECRET_ENV: !!process.env.STRIPE_WEBHOOK_SECRET,
            NODE_ENV: process.env.NODE_ENV
        },
        timestamp: new Date().toISOString()
    });
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import healthHandler from '../src/core/api/health.js';
import proxyHandler from '../src/core/api/proxy.js';
import sendEmailHandler from '../src/core/api/send-email.js';

async function fallbackCheckStatusHandler(req: VercelRequest, res: VercelResponse) {
    const { orderId } = req.query;

    if (!orderId || typeof orderId !== 'string') {
        return res.status(400).json({ error: 'Missing orderId' });
    }

    const supabaseUrl =
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        process.env.VITE_SUPABASE_URL ||
        'https://vixlzrmhqsbzjhpgfwdn.supabase.co';
    const supabaseKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseKey) {
        return res.status(200).json({ status: 'pending', fallback: true, reason: 'missing_supabase_key' });
    }

    const orderRes = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${orderId}&select=status`, {
        headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`
        }
    });

    if (!orderRes.ok) {
        const errorText = await orderRes.text();
        console.error('[System] Fallback check-status failed to fetch order:', errorText);
        return res.status(200).json({ status: 'pending', fallback: true, reason: 'fetch_order_failed' });
    }

    const orders = await orderRes.json();
    const status = String(orders?.[0]?.status || 'pending').toLowerCase();
    return res.status(200).json({ status, fallback: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { action } = req.query;

    try {
        switch (action) {
            case 'check-status': {
                try {
                    const mod = await import('../src/core/api/check-status.js');
                    return await mod.default(req, res);
                } catch (error: any) {
                    console.error('[System] check-status primary handler crashed, using fallback:', error);
                    return await fallbackCheckStatusHandler(req, res);
                }
            }
            case 'health':
                return await healthHandler(req, res);
            case 'proxy':
                return await proxyHandler(req, res);
            case 'send-email':
                return await sendEmailHandler(req, res);
            default:
                return res.status(404).json({ error: `Action ${action} not found in System Controller` });
        }
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}

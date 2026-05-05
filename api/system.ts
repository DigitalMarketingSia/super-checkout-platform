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

async function publicGatewayHandler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const id = String(req.query.id || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        return res.status(400).json({ error: 'Invalid gateway id' });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const gatewayRes = await fetch(
        `${supabaseUrl}/rest/v1/gateways?id=eq.${encodeURIComponent(id)}&select=id,name,provider,public_key,active,is_active,config&limit=1`,
        {
            headers: {
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
            },
        },
    );

    if (!gatewayRes.ok) {
        const text = await gatewayRes.text();
        console.error('[System] public-gateway lookup failed:', text);
        return res.status(500).json({ error: 'Failed to load gateway' });
    }

    const rows = await gatewayRes.json();
    const gateway = rows?.[0];
    if (!gateway || (gateway.active === false && gateway.is_active === false)) {
        return res.status(404).json({ error: 'Gateway not found' });
    }

    return res.status(200).json({
        id: gateway.id,
        name: gateway.name || gateway.provider,
        provider: gateway.provider || gateway.name,
        public_key: gateway.public_key,
        active: gateway.active,
        is_active: gateway.is_active,
        config: gateway.config || {},
    });
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
            case 'public-gateway':
                return await publicGatewayHandler(req, res);
            default:
                return res.status(404).json({ error: `Action ${action} not found in System Controller` });
        }
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}

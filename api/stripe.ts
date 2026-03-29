import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// --- VERCEL CONFIG ---
export const config = {
    api: {
        bodyParser: false,
    },
};

// --- HELPERS ---
const getRawBody = async (req: VercelRequest): Promise<string> => {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk: any) => body += chunk);
        req.on('end', () => resolve(body));
        req.on('error', (err: any) => reject(err));
    });
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { action } = req.query;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Stripe-Signature, x-signature, x-super-checkout-signature');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://vixlzrmhqsbzjhpgfwdn.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Configuration error: Missing Supabase credentials' });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    try {
        const rawBody = await getRawBody(req);
        
        if (action === 'stripe') {
            return await handleStripe(req, res, rawBody, supabaseAdmin, supabaseUrl, supabaseKey);
        } else if (action === 'mercadopago') {
            return await handleMercadoPago(req, res, rawBody, supabaseAdmin);
        } else if (action === 'central' || action === 'super-checkout-central') {
            return await handleCentral(req, res, rawBody, supabaseAdmin);
        }

        return res.status(404).json({ error: `Action ${action} not found in Unified Controller` });

    } catch (error: any) {
        console.error('[Webhooks Hub] Fatal:', error.message);
        return res.status(500).json({ error: error.message });
    }
}

// --- STRIPE HANDLER ---
async function handleStripe(req: VercelRequest, res: VercelResponse, rawBody: string, supabaseAdmin: any, supabaseUrl: string, supabaseKey: string) {
    const payload = JSON.parse(rawBody);
    const signature = req.headers['stripe-signature'] as string;
    const eventType = payload.type;
    const paymentIntentId = payload.data?.object?.payment_intent || payload.data?.object?.id;

    const logWebhook = async (event: string, msg: string, status: number) => {
        await supabaseAdmin.from('webhook_logs').insert({
            event, payload: rawBody, response_status: status, response_body: msg, direction: 'inbound', processed: status === 200
        });
    };

    if (!paymentIntentId || !paymentIntentId.startsWith('pi_')) {
        await logWebhook('webhook.stripe_ignored', 'No PI ID', 200);
        return res.status(200).json({ message: 'Ignored' });
    }

    // 1. Fetch Payment & Gateway Secret
    const { data: paymentRecord } = await supabaseAdmin
        .from('payments')
        .select('*, gateways(stripe_webhook_secret)')
        .eq('transaction_id', paymentIntentId)
        .single();

    if (!paymentRecord) {
        await logWebhook('webhook.stripe_error', `Payment missing: ${paymentIntentId}`, 404);
        return res.status(200).json({ message: 'Payment record not found' });
    }

    // 2. Validate Signature
    const webhookSecret = (paymentRecord as any).gateways?.stripe_webhook_secret;
    if (webhookSecret && signature) {
        try {
            const parts = signature.split(',');
            const timestamp = parts.find((p: any) => p.startsWith('t='))?.split('=')[1];
            const stripeSig = parts.find((p: any) => p.startsWith('v1='))?.split('=')[1];
            const signedPayload = `${timestamp}.${rawBody}`;
            const expectedSig = crypto.createHmac('sha256', webhookSecret).update(signedPayload).digest('hex');

            if (stripeSig !== expectedSig) {
                await logWebhook('webhook.stripe_signature_error', 'Signature mismatch', 400);
                return res.status(400).json({ error: 'Invalid signature' });
            }
        } catch (e) {
            return res.status(400).json({ error: 'Signature failure' });
        }
    }

    // 3. Update Status
    if (['payment_intent.succeeded', 'charge.succeeded', 'checkout.session.completed'].includes(eventType)) {
        const orderId = paymentRecord.order_id;
        await Promise.all([
            supabaseAdmin.from('payments').update({ status: 'paid' }).eq('id', paymentRecord.id),
            supabaseAdmin.from('orders').update({ status: 'paid' }).eq('id', orderId)
        ]);

        fetch(`${supabaseUrl}/functions/v1/fulfill-order`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId })
        }).catch(() => {});

        await logWebhook('webhook.stripe_success', `Order ${orderId} paid`, 200);
    } else {
        await logWebhook(`webhook.stripe_ignored_${eventType}`, 'Event ignored', 200);
    }
    return res.status(200).json({ success: true });
}

// --- MERCADO PAGO HANDLER ---
async function handleMercadoPago(req: VercelRequest, res: VercelResponse, rawBody: string, supabaseAdmin: any) {
    const payload = JSON.parse(rawBody || '{}');
    const paymentId = payload.data?.id || payload.id;
    if (!paymentId) return res.status(200).json({ message: 'Ignored: No ID' });
    
    // Mercado Pago simplified placeholder for the Hub
    return res.status(200).json({ success: true, provider: 'mercadopago' });
}

// --- CENTRAL HANDLER ---
async function handleCentral(req: VercelRequest, res: VercelResponse, rawBody: string, supabaseAdmin: any) {
    const body = JSON.parse(rawBody || '{}');
    const { event, payload } = body;
    const signature = req.headers['x-super-checkout-signature'];
    const sharedSecret = process.env.VITE_CENTRAL_SHARED_SECRET;

    if (!signature || signature !== sharedSecret) return res.status(401).json({ error: 'Unauthorized' });

    if (event === 'license.upgraded' || event === 'license.activated') {
        const { license_key, plan_type } = payload;
        const { data: license } = await supabaseAdmin.from('licenses').select('account_id, key').eq('key', license_key).single();
        if (license?.account_id) {
            await supabaseAdmin.from('accounts').update({ plan_type: plan_type.toLowerCase() }).eq('id', license.account_id);
            await supabaseAdmin.from('licenses').update({ plan: plan_type }).eq('key', license.key);
        }
    }
    return res.status(200).json({ success: true });
}

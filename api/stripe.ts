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
    
    // Support both Full Stripe Payload and Simplified Dispatcher Payload
    const eventType = payload.type || payload.event;
    const paymentIntentId = payload.data?.object?.payment_intent || payload.data?.object?.id || payload.pi;

    const logWebhook = async (event: string, msg: string, status: number) => {
        await supabaseAdmin.from('webhook_logs').insert({
            event, payload: rawBody, response_status: status, response_body: msg, direction: 'inbound', processed: status === 200
        });
    };

    // Extract ID (Priority: Specific PI -> Session PI -> Payload ID)
    const piFromSession = payload.data?.object?.payment_intent;
    const effectiveId = piFromSession || payload.data?.object?.id || payload.pi;

    if (!effectiveId || (!effectiveId.startsWith('pi_') && !effectiveId.startsWith('cs_'))) {
        await logWebhook('webhook.stripe_ignored', `Invalid ID: ${effectiveId}`, 200);
        return res.status(200).json({ message: 'Ignored: Invalid ID format' });
    }

    // 1. Fetch Payment & Gateway Secret
    let paymentRecord: any = null;
    let gatewayRecord: any = null;
    let mustCreatePayment = false;

    const { data: existingPayment } = await supabaseAdmin
        .from('payments')
        .select('*, gateways(*)')
        .eq('transaction_id', effectiveId)
        .single();

    if (existingPayment) {
        paymentRecord = existingPayment;
        gatewayRecord = existingPayment.gateways;
    } else {
        // RECOVERY LOGIC: Use Metadata if DB record hasn't been created yet (Race Condition)
        const metadataOrderId = payload.data?.object?.metadata?.order_id || payload.order_id;
        
        if (metadataOrderId) {
            console.log(`[Stripe Webhook] Recovery: Payment not found for ${effectiveId}. Checking Order ${metadataOrderId}...`);
            const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', metadataOrderId).single();
            
            if (order) {
                // Find an active Stripe gateway to get the webhook secret
                const { data: gateways } = await supabaseAdmin.from('gateways').select('*').eq('name', 'stripe').eq('active', true).limit(1);
                gatewayRecord = gateways?.[0];
                
                paymentRecord = {
                    order_id: order.id,
                    gateway_id: gatewayRecord?.id,
                    status: 'pending',
                    transaction_id: effectiveId
                };
                mustCreatePayment = true;
                console.log(`[Stripe Webhook] Recovery: Found Order ${order.id}. Proceeding with auto-creation.`);
            }
        }
    }

    if (!paymentRecord) {
        await logWebhook('webhook.stripe_error', `Payment and Recovery failed: ${effectiveId}`, 404);
        return res.status(200).json({ message: 'Payment record not found and recovery failed' });
    }

    // 2. Validate Signature
    const webhookSecret = gatewayRecord?.stripe_webhook_secret;
    const internalSecret = process.env.VITE_CENTRAL_SHARED_SECRET;
    const incomingInternalSig = req.headers['x-super-checkout-signature'];

    // Bypass signature if it's an internal dispatch with valid secret
    const isInternalMatch = incomingInternalSig && internalSecret && incomingInternalSig === internalSecret;

    if (!isInternalMatch && webhookSecret && signature) {
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
            console.error('[Stripe Webhook] Sig validation error:', e);
            return res.status(400).json({ error: 'Signature failure' });
        }
    }

    // 3. Update Status
    if (['payment_intent.succeeded', 'charge.succeeded', 'checkout.session.completed', 'paid', 'pagamento.aprovado'].includes(eventType)) {
        const orderId = paymentRecord.order_id;
        
        const updates = [
            supabaseAdmin.from('orders').update({ status: 'paid' }).eq('id', orderId)
        ];

        if (mustCreatePayment) {
            updates.push(supabaseAdmin.from('payments').insert({
                ...paymentRecord,
                status: 'paid',
                raw_response: rawBody,
                created_at: new Date().toISOString()
            }));
        } else {
            updates.push(supabaseAdmin.from('payments').update({ status: 'paid', raw_response: rawBody }).eq('id', paymentRecord.id));
        }

        await Promise.all(updates);

        fetch(`${supabaseUrl}/functions/v1/fulfill-order`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId })
        }).catch(() => {});

        await logWebhook('webhook.stripe_success', `Order ${orderId} approved (Recovery: ${mustCreatePayment})`, 200);
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

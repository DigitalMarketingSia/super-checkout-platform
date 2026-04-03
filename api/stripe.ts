import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// --- CONFIG ---
export const config = {
    api: {
        bodyParser: false,
    },
};

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
        return res.status(200).json({ error: 'CONFIG_ERROR', message: 'Missing credentials' });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    try {
        // --- BODY EXTRACTION ---
        // Stripe REQUIRES rawBody for signature. 
        // Mercado Pago IPN often sends EMPTY body but has data in query params.
        const rawBody = await getRawBody(req);

        if (action === 'stripe') {
            if (!rawBody) return res.status(200).json({ status: 'EMPTY_BODY_STRIPE' });
            return await handleStripe(req, res, rawBody, supabaseAdmin, supabaseUrl, supabaseKey);
        } 
        
        if (action === 'mercadopago') {
            // Mercado Pago can have empty body if it's an IPN
            return await handleMercadoPago(req, res, rawBody, supabaseAdmin);
        }

        if (action === 'central' || action === 'super-checkout-central') {
            if (!rawBody) return res.status(200).json({ status: 'EMPTY_BODY_CENTRAL' });
            return await handleCentral(req, res, rawBody, supabaseAdmin);
        }

        return res.status(404).json({ error: `ACTION_NOT_FOUND: ${action}` });

    } catch (error: any) {
        console.error('[Webhooks Hub] Fatal Error:', error.message);
        return res.status(200).json({ status: 'FATAL_ERROR', error: error.message });
    }
}

async function handleStripe(req: VercelRequest, res: VercelResponse, rawBody: string, supabaseAdmin: any, supabaseUrl: string, supabaseKey: string) {
    let payload: any;
    try {
        payload = JSON.parse(rawBody);
    } catch (e) {
        return res.status(200).json({ status: 'INVALID_JSON' });
    }

    const signature = req.headers['stripe-signature'] as string;
    const eventType = payload.type || payload.event;
    
    // 1. Identify IDs (Support pi_ and cs_)
    const piFromSession = payload.data?.object?.payment_intent;
    const effectiveId = piFromSession || payload.data?.object?.id || payload.pi;

    const logWebhook = async (event: string, msg: string, status: number) => {
        try {
            await supabaseAdmin.from('webhook_logs').insert({
                event, payload: rawBody, response_status: status, response_body: msg, direction: 'inbound', processed: status === 200
            });
        } catch (e) {
            console.error('[Log Error]:', e);
        }
    };

    if (!effectiveId || (!effectiveId.startsWith('pi_') && !effectiveId.startsWith('cs_'))) {
        await logWebhook('webhook.stripe_ignored', `Invalid ID format: ${effectiveId}`, 200);
        return res.status(200).json({ message: 'Ignored: Invalid ID' });
    }

    // 2. Fetch or Recover Record
    let paymentRecord: any = null;
    let gatewayRecord: any = null;
    let mustCreate = false;

    const { data: existing } = await supabaseAdmin.from('payments').select('*, gateways(*)').eq('transaction_id', effectiveId).single();

    if (existing) {
        paymentRecord = existing;
        gatewayRecord = existing.gateways;
    } else {
        // Recovery Logic via Metadata
        const metaOrder = payload.data?.object?.metadata?.order_id || payload.order_id;
        if (metaOrder) {
            const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', metaOrder).single();
            if (order) {
                const { data: gts } = await supabaseAdmin.from('gateways').select('*').eq('name', 'stripe').eq('active', true).limit(1);
                gatewayRecord = gts?.[0];
                paymentRecord = { order_id: order.id, gateway_id: gatewayRecord?.id, transaction_id: effectiveId, status: 'pending' };
                mustCreate = true;
            }
        }
    }

    if (!paymentRecord) {
        await logWebhook('webhook.stripe_error', `Record not found and recovery failed for ${effectiveId}`, 200);
        return res.status(200).json({ status: 'NOT_FOUND' });
    }

    // 3. Validate Signature (Optional if Internal Bypass)
    const secret = gatewayRecord?.stripe_webhook_secret;
    const internalSecret = process.env.VITE_CENTRAL_SHARED_SECRET;
    const incomingInternalSig = req.headers['x-super-checkout-signature'];
    const isInternalMatch = incomingInternalSig && internalSecret && incomingInternalSig === internalSecret;

    if (!isInternalMatch && secret && signature) {
        try {
            const parts = signature.split(',');
            const timestamp = (parts.find(p => p.startsWith('t=')) || '').split('=')[1];
            const stripeSig = (parts.find(p => p.startsWith('v1=')) || '').split('=')[1];
            const expectedSig = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');

            // Timing-safe comparison to prevent timing attacks
            const sigBuffer = Buffer.from(stripeSig || '', 'hex');
            const expectedBuffer = Buffer.from(expectedSig, 'hex');
            if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
                await logWebhook('webhook.stripe_signature_error', 'Signature Mismatch', 200);
                return res.status(200).json({ status: 'INVALID_SIGNATURE' });
            }
        } catch (e) {
            return res.status(200).json({ status: 'SIG_FAILURE' });
        }
    }

    // 4. Fulfillment
    const successEvents = ['payment_intent.succeeded', 'charge.succeeded', 'checkout.session.completed', 'paid', 'pagamento.aprovado'];
    if (successEvents.includes(eventType)) {
        const oid = paymentRecord.order_id;
        const updates = [
            supabaseAdmin.from('orders').update({ status: 'paid' }).eq('id', oid)
        ];

        if (mustCreate) {
            updates.push(supabaseAdmin.from('payments').insert({ ...paymentRecord, status: 'paid', raw_response: rawBody, created_at: new Date().toISOString() }));
        } else {
            updates.push(supabaseAdmin.from('payments').update({ status: 'paid', raw_response: rawBody }).eq('id', paymentRecord.id));
        }

        await Promise.all(updates);
        
        // Fulfillment Trigger (Non-blocking)
        try {
            const fUrl = `${supabaseUrl}/functions/v1/fulfill-order`;
            fetch(fUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_id: oid })
            }).catch(() => {});
        } catch (e) {}

        await logWebhook('webhook.stripe_success', `Order ${oid} approved (Recovery: ${mustCreate})`, 200);
    } else {
        await logWebhook(`webhook.stripe_ignored_${eventType}`, 'Ignored event type', 200);
    }

    return res.status(200).json({ status: 'OK' });
}

async function handleMercadoPago(req: VercelRequest, res: VercelResponse, rawBody: string, supabaseAdmin: any) {
    let payload: any = {};
    if (rawBody) {
        try { payload = JSON.parse(rawBody); } catch (e) { console.warn('[MP Hub] Raw body is not JSON'); }
    }

    // Mercado Pago IPN/Webhooks can have different formats.
    // Webhooks: { action: "payment.created", data: { id: "123" } }
    // IPN: query params ?id=123&topic=payment
    const resourceId = (payload.data?.id || payload.id || req.query.id || req.query['data.id']) as string;
    const type = (payload.type || payload.topic || req.query.topic || req.query.type) as string;

    console.log('[MP Hub] ID:', resourceId, 'Type:', type, 'Action:', payload.action);

    if (!resourceId) {
        return res.status(200).json({ status: 'IGNORED_NO_ID', query: req.query });
    }

    // Capture standard payment actions
    const isPaymentAction = type === 'payment' || payload.action?.includes('payment') || req.query.topic === 'payment';
    
    if (!isPaymentAction && type !== 'merchant_order') {
        return res.status(200).json({ status: 'IGNORED_TYPE', type });
    }

    // 1. Find the Active Mercado Pago Gateway
    const { data: gateways } = await supabaseAdmin
        .from('gateways')
        .select('*')
        .or('name.ilike.%mercado%,name.eq.mercado_pago')
        .eq('active', true);
    
    const gatewayRecord = gateways?.[0];
    
    if (!gatewayRecord || !gatewayRecord.private_key) {
        console.warn(`[MP Hub] No active Mercado Pago gateway found or missing private key`);
        return res.status(200).json({ status: 'GATEWAY_NOT_FOUND' });
    }

    // 2. Fetch Payment Info from Mercado Pago (Verification)
    try {
        const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${resourceId}`, {
            headers: { 'Authorization': `Bearer ${gatewayRecord.private_key}` }
        });

        if (!mpResponse.ok) {
            // If it's a merchant_order, we might need a different API, but for now we focus on payments
            console.warn(`[MP Hub] Resource ${resourceId} not found or error: ${mpResponse.status}`);
            return res.status(200).json({ status: 'RESOURCE_NOT_FOUND', resourceId });
        }
        
        const mpData = await mpResponse.json();

        // 3. Match with local Order/Payment
        const transactionId = mpData.id?.toString();
        const externalRef = mpData.external_reference; // This matches order.id

        console.log(`[MP Hub] Processing ID ${transactionId}, Status: ${mpData.status}, Ref: ${externalRef}`);

        let paymentRecord: any = null;
        const { data: existing } = await supabaseAdmin.from('payments').select('*').eq('transaction_id', transactionId).single();

        if (existing) {
            paymentRecord = existing;
        } else if (externalRef) {
            // Recovery: Try to find by order ID (external_reference)
            const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', externalRef).single();
            if (order) {
                console.log(`[MP Hub] Recovered order ${order.id} for transaction ${transactionId}`);
                paymentRecord = { order_id: order.id, gateway_id: gatewayRecord.id, transaction_id: transactionId, status: 'pending' };
            }
        }

        if (!paymentRecord) {
            console.warn(`[MP Hub] No local record found for Transaction ${transactionId} / Ref ${externalRef}`);
            return res.status(200).json({ status: 'ORDER_NOT_FOUND', transactionId, externalRef });
        }

        // 4. Update Status (Resilient logic)
        const mpStatus = mpData.status?.toLowerCase();
        if (mpStatus === 'approved' || mpStatus === 'authorized') {
            const oid = paymentRecord.order_id;
            console.log(`[MP Hub] Fulfilling order ${oid}...`);
            
            const updates = [
                supabaseAdmin.from('orders').update({ status: 'paid' }).eq('id', oid)
            ];

            if (!paymentRecord.id) {
                const newId = crypto.randomUUID();
                updates.push(supabaseAdmin.from('payments').insert({ 
                    ...paymentRecord, 
                    id: newId,
                    status: 'paid', 
                    raw_response: JSON.stringify(mpData), 
                    created_at: new Date().toISOString() 
                }));
            } else {
                updates.push(supabaseAdmin.from('payments').update({ 
                    status: 'paid', 
                    raw_response: JSON.stringify(mpData) 
                }).eq('id', paymentRecord.id));
            }

            await Promise.all(updates);

            // Fulfillment Trigger (Non-blocking)
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vixlzrmhqsbzjhpgfwdn.supabase.co';
            const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
            
            if (supabaseKey) {
                fetch(`${supabaseUrl}/functions/v1/fulfill-order`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ order_id: oid })
                }).catch(e => console.error('[MP Hub] Fulfillment trigger error:', e.message));
            }
        }

        return res.status(200).json({ status: 'OK', mpStatus: mpData.status });

    } catch (err: any) {
        console.error('[MercadoPago Webhook] Fatal Error:', err.message);
        return res.status(200).json({ status: 'ERROR', message: err.message });
    }
}

async function handleCentral(req: VercelRequest, res: VercelResponse, rawBody: string, supabaseAdmin: any) {
    let payload: any;
    try { payload = JSON.parse(rawBody); } catch (e) { return res.status(200).json({ status: 'INVALID_JSON' }); }

    const { event, payload: data } = payload;
    const internalSecret = process.env.VITE_CENTRAL_SHARED_SECRET;
    const incomingSig = req.headers['x-super-checkout-signature'];

    if (!incomingSig || incomingSig !== internalSecret) return res.status(200).json({ status: 'UNAUTHORIZED' });

    if (event === 'license.upgraded' || event === 'license.activated') {
        const { license_key, plan_type } = data;
        const { data: lic } = await supabaseAdmin.from('licenses').select('account_id, key').eq('key', license_key).single();
        if (lic?.account_id) {
            await supabaseAdmin.from('accounts').update({ plan_type: plan_type.toLowerCase() }).eq('id', lic.account_id);
            await supabaseAdmin.from('licenses').update({ plan: plan_type }).eq('key', lic.key);
        }
    }
    return res.status(200).json({ status: 'CENTRAL_HUB_OK' });
}

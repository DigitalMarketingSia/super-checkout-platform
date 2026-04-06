import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { decrypt } from '../src/core/utils/cryptoUtils.js';
import { MercadoPagoConfig, Payment } from 'mercadopago';

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

// --- SHARED LOGGING ---
const logWebhook = async (supabaseAdmin: any, event: string, msg: string, status: number, rawPayload?: string) => {
    try {
        await supabaseAdmin.from('webhook_logs').insert({
            event, payload: rawPayload || '', response_status: status, response_body: msg, direction: 'inbound', processed: status === 200
        });
    } catch (e) {
        console.error('[Webhook Log Error]:', e);
    }
};

// --- IDEMPOTENCY CHECK ---
const isAlreadyProcessed = async (supabaseAdmin: any, eventId: string): Promise<boolean> => {
    if (!eventId) return false;
    const { data } = await supabaseAdmin.from('webhook_logs').select('id').eq('event', eventId).eq('processed', true).limit(1);
    return !!(data && data.length > 0);
};

// --- ANTI-REPLAY: Timestamp validation (5 min window) ---
const WEBHOOK_TIMESTAMP_TOLERANCE = 300; // 5 minutes in seconds

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { action } = req.query;

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('[Webhooks Hub] FATAL: Missing SUPABASE_URL or SERVICE_ROLE_KEY');
        return res.status(500).json({ error: 'CONFIG_ERROR' });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    try {
        const rawBody = await getRawBody(req);

        if (action === 'stripe') {
            if (!rawBody) return res.status(200).json({ status: 'EMPTY_BODY_STRIPE' });
            return await handleStripe(req, res, rawBody, supabaseAdmin, supabaseUrl, supabaseKey);
        } 
        
        if (action === 'mercadopago') {
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

// --- STRIPE ---
const STRIPE_ALLOWED_EVENTS = [
    'payment_intent.succeeded', 'payment_intent.payment_failed', 'charge.succeeded',
    'charge.refunded', 'checkout.session.completed', 'invoice.paid',
    'customer.subscription.deleted', 'customer.subscription.updated'
];

async function handleStripe(req: VercelRequest, res: VercelResponse, rawBody: string, supabaseAdmin: any, supabaseUrl: string, supabaseKey: string) {
    let payload: any;
    try { payload = JSON.parse(rawBody); } catch (e) { return res.status(200).json({ status: 'INVALID_JSON' }); }

    const signature = req.headers['stripe-signature'] as string;
    const eventType = payload.type || payload.event;
    const eventId = payload.id;
    
    if (eventType && !STRIPE_ALLOWED_EVENTS.includes(eventType)) {
        return res.status(200).json({ status: 'EVENT_IGNORED', type: eventType });
    }

    if (eventId && await isAlreadyProcessed(supabaseAdmin, eventId)) {
        return res.status(200).json({ status: 'ALREADY_PROCESSED', eventId });
    }

    const piFromSession = payload.data?.object?.payment_intent;
    const effectiveId = piFromSession || payload.data?.object?.id || payload.pi;

    if (!effectiveId) return res.status(200).json({ status: 'NO_ID' });

    const { data: existing } = await supabaseAdmin.from('payments').select('*, gateways(*)').eq('transaction_id', effectiveId).single();
    let paymentRecord = existing;
    let gatewayRecord = existing?.gateways;
    let mustCreate = false;

    if (!paymentRecord) {
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

    if (!paymentRecord) return res.status(200).json({ status: 'NOT_FOUND' });

    const secret = decrypt(gatewayRecord?.webhook_secret || gatewayRecord?.stripe_webhook_secret);
    if (!secret || !signature) return res.status(401).json({ status: 'UNAUTHORIZED' });

    try {
        const parts = signature.split(',');
        const timestamp = (parts.find(p => p.startsWith('t=')) || '').split('=')[1];
        const stripeSig = (parts.find(p => p.startsWith('v1=')) || '').split('=')[1];
        
        const expectedSig = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
        if (stripeSig !== expectedSig) return res.status(401).json({ status: 'INVALID_SIGNATURE' });
    } catch (e) { return res.status(401).json({ status: 'SIG_ERROR' }); }

    const successEvents = ['payment_intent.succeeded', 'charge.succeeded', 'checkout.session.completed'];
    if (successEvents.includes(eventType)) {
        const oid = paymentRecord.order_id;
        const updates = [supabaseAdmin.from('orders').update({ status: 'paid' }).eq('id', oid)];
        if (mustCreate) {
            updates.push(supabaseAdmin.from('payments').insert({ ...paymentRecord, id: crypto.randomUUID(), status: 'paid', raw_response: rawBody, created_at: new Date().toISOString() }));
        } else {
            updates.push(supabaseAdmin.from('payments').update({ status: 'paid', raw_response: rawBody }).eq('id', paymentRecord.id));
        }
        await Promise.all(updates);
        fetch(`${supabaseUrl}/functions/v1/fulfill-order`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: oid })
        }).catch(() => {});
        await logWebhook(supabaseAdmin, eventId, `Stripe Approved: ${oid}`, 200, rawBody);
    }

    return res.status(200).json({ status: 'OK' });
}

// --- MERCADO PAGO SDK v2 ---
async function handleMercadoPago(req: VercelRequest, res: VercelResponse, rawBody: string, supabaseAdmin: any) {
    let payload: any = {};
    if (rawBody) {
        try { payload = JSON.parse(rawBody); } catch (e) { console.warn('[MP Hub] Raw body is not JSON'); }
    }

    const resourceId = (payload.data?.id || payload.id || req.query.id || req.query['data.id']) as string;
    const type = (payload.type || payload.topic || req.query.topic || req.query.type) as string;

    if (!resourceId) return res.status(200).json({ status: 'IGNORED_NO_ID' });

    const isPaymentAction = type === 'payment' || payload.action?.includes('payment') || req.query.topic === 'payment';
    if (!isPaymentAction) return res.status(200).json({ status: 'IGNORED_TYPE' });

    const mpIdempotencyKey = `mp_payment_${resourceId}`;
    if (await isAlreadyProcessed(supabaseAdmin, mpIdempotencyKey)) {
        return res.status(200).json({ status: 'ALREADY_PROCESSED', resourceId });
    }

    const { data: gateways } = await supabaseAdmin.from('gateways').select('*').or('name.ilike.%mercado%,name.eq.mercado_pago').eq('active', true);
    const gatewayRecord = gateways?.[0];
    if (!gatewayRecord?.private_key) return res.status(200).json({ status: 'GATEWAY_NOT_FOUND' });

    try {
        const decodedKey = decrypt(gatewayRecord.private_key).trim();
        const client = new MercadoPagoConfig({ accessToken: decodedKey });
        const payment = new Payment(client);

        const mpData = await payment.get({ id: resourceId });
        const transactionId = mpData.id?.toString();
        const externalRef = mpData.external_reference;

        let paymentRecord: any = null;
        const { data: existing } = await supabaseAdmin.from('payments').select('*').eq('transaction_id', transactionId).single();
        if (existing) {
            paymentRecord = existing;
        } else if (externalRef) {
            const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', externalRef).single();
            if (order) paymentRecord = { order_id: order.id, gateway_id: gatewayRecord.id, transaction_id: transactionId, status: 'pending' };
        }

        if (!paymentRecord) return res.status(200).json({ status: 'ORDER_NOT_FOUND' });

        const mpStatus = mpData.status?.toLowerCase();
        if (mpStatus === 'approved' || mpStatus === 'authorized') {
            const oid = paymentRecord.order_id;
            const updates = [supabaseAdmin.from('orders').update({ status: 'paid' }).eq('id', oid)];
            if (!paymentRecord.id) {
                updates.push(supabaseAdmin.from('payments').insert({ ...paymentRecord, id: crypto.randomUUID(), status: 'paid', raw_response: JSON.stringify(mpData), created_at: new Date().toISOString() }));
            } else {
                updates.push(supabaseAdmin.from('payments').update({ status: 'paid', raw_response: JSON.stringify(mpData) }).eq('id', paymentRecord.id));
            }
            await Promise.all(updates);

            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
            if (supabaseUrl && supabaseKey) {
                fetch(`${supabaseUrl}/functions/v1/fulfill-order`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ order_id: oid })
                }).catch(() => {});
            }
            await logWebhook(supabaseAdmin, mpIdempotencyKey, `Approved: ${oid}`, 200, rawBody);
        }
        return res.status(200).json({ status: 'OK', mpStatus });
    } catch (err: any) {
        await logWebhook(supabaseAdmin, 'webhook.mp_error', err.message, 500, rawBody);
        return res.status(200).json({ status: 'ERROR', message: err.message });
    }
}

// --- CENTRAL ---
const CENTRAL_ALLOWED_EVENTS = ['license.upgraded', 'license.activated', 'license.suspended', 'license.deleted'];

async function handleCentral(req: VercelRequest, res: VercelResponse, rawBody: string, supabaseAdmin: any) {
    let payload: any;
    try { payload = JSON.parse(rawBody); } catch (e) { return res.status(400).json({ status: 'INVALID_JSON' }); }

    const { event, payload: data } = payload;
    const centralSecret = process.env.CENTRAL_SHARED_SECRET;
    const incomingSig = req.headers['x-super-checkout-signature'] as string;

    if (!centralSecret || incomingSig !== centralSecret) return res.status(401).json({ status: 'UNAUTHORIZED' });
    if (!event || !CENTRAL_ALLOWED_EVENTS.includes(event)) return res.status(400).json({ status: 'INVALID_EVENT' });

    const centralIdempotencyKey = `central_${event}_${data?.license_key}`;
    if (await isAlreadyProcessed(supabaseAdmin, centralIdempotencyKey)) return res.status(200).json({ status: 'ALREADY_PROCESSED' });

    if (event === 'license.upgraded' || event === 'license.activated') {
        const { license_key, plan_type } = data;
        const { data: lic } = await supabaseAdmin.from('licenses').select('account_id, key').eq('key', license_key).single();
        if (lic?.account_id) {
            await supabaseAdmin.from('accounts').update({ plan_type: plan_type.toLowerCase() }).eq('id', lic.account_id);
            await supabaseAdmin.from('licenses').update({ plan: plan_type }).eq('key', lic.key);
            await logWebhook(supabaseAdmin, centralIdempotencyKey, `Central Update: ${license_key}`, 200, rawBody);
        }
    }
    return res.status(200).json({ status: 'CENTRAL_HUB_OK' });
}

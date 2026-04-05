import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { decrypt } from '../src/core/utils/cryptoUtils.js';

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

    // SECURITY: No CORS on webhooks — these are server-to-server only
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

// --- STRIPE EVENT WHITELIST ---
const STRIPE_ALLOWED_EVENTS = [
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'charge.succeeded',
    'charge.refunded',
    'checkout.session.completed',
    'invoice.paid',
    'customer.subscription.deleted',
    'customer.subscription.updated'
];

async function handleStripe(req: VercelRequest, res: VercelResponse, rawBody: string, supabaseAdmin: any, supabaseUrl: string, supabaseKey: string) {
    let payload: any;
    try {
        payload = JSON.parse(rawBody);
    } catch (e) {
        return res.status(200).json({ status: 'INVALID_JSON' });
    }

    const signature = req.headers['stripe-signature'] as string;
    const eventType = payload.type || payload.event;
    const eventId = payload.id; // Stripe event ID for idempotency (e.g., evt_xxx)
    
    // 1. Event Whitelist — reject unknown events immediately
    if (eventType && !STRIPE_ALLOWED_EVENTS.includes(eventType)) {
        await logWebhook(supabaseAdmin, `webhook.stripe_rejected_event`, `Rejected unknown event: ${eventType}`, 200, rawBody);
        return res.status(200).json({ status: 'EVENT_IGNORED', type: eventType });
    }

    // 2. Idempotency — prevent duplicate processing
    if (eventId && await isAlreadyProcessed(supabaseAdmin, eventId)) {
        console.log(`[Stripe] Idempotency: Event ${eventId} already processed. Skipping.`);
        return res.status(200).json({ status: 'ALREADY_PROCESSED', eventId });
    }

    // 3. Identify IDs (Support pi_ and cs_)
    const piFromSession = payload.data?.object?.payment_intent;
    const effectiveId = piFromSession || payload.data?.object?.id || payload.pi;

    if (!effectiveId || (!effectiveId.startsWith('pi_') && !effectiveId.startsWith('cs_'))) {
        await logWebhook(supabaseAdmin, 'webhook.stripe_ignored', `Invalid ID format: ${effectiveId}`, 200, rawBody);
        return res.status(200).json({ message: 'Ignored: Invalid ID' });
    }

    // 4. Fetch or Recover Record
    let paymentRecord: any = null;
    let gatewayRecord: any = null;
    let mustCreate = false;

    const { data: existing } = await supabaseAdmin.from('payments').select('*, gateways(*)').eq('transaction_id', effectiveId).single();

    if (existing) {
        paymentRecord = existing;
        gatewayRecord = existing.gateways;
    } else {
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
        await logWebhook(supabaseAdmin, 'webhook.stripe_error', `Record not found and recovery failed for ${effectiveId}`, 200, rawBody);
        return res.status(200).json({ status: 'NOT_FOUND' });
    }

    // 5. Validate Signature (Strict HMAC — fail-closed)
    const secret = decrypt(gatewayRecord?.webhook_secret || gatewayRecord?.stripe_webhook_secret);

    if (!secret || !signature) {
        await logWebhook(supabaseAdmin, 'webhook.stripe_signature_missing', `Missing secret (${!!secret}) or signature (${!!signature})`, 401, rawBody);
        return res.status(401).json({ status: 'MISSING_SIGNATURE' });
    }

    try {
        const parts = signature.split(',');
        const timestamp = (parts.find(p => p.startsWith('t=')) || '').split('=')[1];
        const stripeSig = (parts.find(p => p.startsWith('v1=')) || '').split('=')[1];

        // ANTI-REPLAY: Reject webhooks older than 5 minutes
        const webhookAge = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
        if (isNaN(webhookAge) || webhookAge > WEBHOOK_TIMESTAMP_TOLERANCE) {
            await logWebhook(supabaseAdmin, 'webhook.stripe_replay_rejected', `Timestamp too old: ${webhookAge}s (max ${WEBHOOK_TIMESTAMP_TOLERANCE}s)`, 401, rawBody);
            return res.status(401).json({ status: 'REPLAY_REJECTED' });
        }

        const expectedSig = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');

        // Timing-safe comparison to prevent timing attacks
        const sigBuffer = Buffer.from(stripeSig || '', 'hex');
        const expectedBuffer = Buffer.from(expectedSig, 'hex');
        if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
            await logWebhook(supabaseAdmin, 'webhook.stripe_signature_invalid', 'HMAC Signature Mismatch', 401, rawBody);
            return res.status(401).json({ status: 'INVALID_SIGNATURE' });
        }
    } catch (e: any) {
        await logWebhook(supabaseAdmin, 'webhook.stripe_sig_failure', `Signature validation error: ${e.message}`, 500, rawBody);
        return res.status(500).json({ status: 'SIG_FAILURE' });
    }

    // 6. Fulfillment (only for success events)
    const successEvents = ['payment_intent.succeeded', 'charge.succeeded', 'checkout.session.completed'];
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
            fetch(`${supabaseUrl}/functions/v1/fulfill-order`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_id: oid })
            }).catch(() => {});
        } catch (e) {}

        await logWebhook(supabaseAdmin, eventId || 'webhook.stripe_success', `Order ${oid} approved (Recovery: ${mustCreate})`, 200, rawBody);
    } else {
        await logWebhook(supabaseAdmin, eventId || `webhook.stripe_${eventType}`, `Event processed: ${eventType}`, 200, rawBody);
    }

    return res.status(200).json({ status: 'OK' });
}

async function handleMercadoPago(req: VercelRequest, res: VercelResponse, rawBody: string, supabaseAdmin: any) {
    let payload: any = {};
    if (rawBody) {
        try { payload = JSON.parse(rawBody); } catch (e) { console.warn('[MP Hub] Raw body is not JSON'); }
    }

    const resourceId = (payload.data?.id || payload.id || req.query.id || req.query['data.id']) as string;
    const type = (payload.type || payload.topic || req.query.topic || req.query.type) as string;

    console.log('[MP Hub] ID:', resourceId, 'Type:', type, 'Action:', payload.action);

    if (!resourceId) {
        await logWebhook(supabaseAdmin, 'webhook.mp_no_id', `No resource ID in webhook`, 200, rawBody);
        return res.status(200).json({ status: 'IGNORED_NO_ID', query: req.query });
    }

    const isPaymentAction = type === 'payment' || payload.action?.includes('payment') || req.query.topic === 'payment';
    
    if (!isPaymentAction && type !== 'merchant_order') {
        await logWebhook(supabaseAdmin, 'webhook.mp_ignored_type', `Ignored type: ${type}`, 200, rawBody);
        return res.status(200).json({ status: 'IGNORED_TYPE', type });
    }

    // Idempotency: check if this MP resource was already processed
    const mpIdempotencyKey = `mp_payment_${resourceId}`;
    if (await isAlreadyProcessed(supabaseAdmin, mpIdempotencyKey)) {
        console.log(`[MP Hub] Idempotency: Payment ${resourceId} already processed. Skipping.`);
        return res.status(200).json({ status: 'ALREADY_PROCESSED', resourceId });
    }

    // 1. Find the Active Mercado Pago Gateway
    const { data: gateways } = await supabaseAdmin
        .from('gateways')
        .select('*')
        .or('name.ilike.%mercado%,name.eq.mercado_pago')
        .eq('active', true);
    
    const gatewayRecord = gateways?.[0];
    
    if (!gatewayRecord || !gatewayRecord.private_key) {
        await logWebhook(supabaseAdmin, 'webhook.mp_gateway_missing', 'No active MP gateway or missing private key', 200, rawBody);
        return res.status(200).json({ status: 'GATEWAY_NOT_FOUND' });
    }

    // 2. Fetch Payment Info from Mercado Pago (Reverse Verification — most robust method)
    try {
        // CRITICAL FIX: Decrypt the private key before using it as a Bearer token!
        const decodedKey = decrypt(gatewayRecord.private_key).trim();

        const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${resourceId}`, {
            headers: { 'Authorization': `Bearer ${decodedKey}` }
        });

        if (!mpResponse.ok) {
            await logWebhook(supabaseAdmin, 'webhook.mp_resource_error', `Resource ${resourceId} not found: ${mpResponse.status}`, 200, rawBody);
            return res.status(200).json({ status: 'RESOURCE_NOT_FOUND', resourceId });
        }
        
        const mpData = await mpResponse.json();
        const transactionId = mpData.id?.toString();
        const externalRef = mpData.external_reference;

        console.log(`[MP Hub] Processing ID ${transactionId}, Status: ${mpData.status}, Ref: ${externalRef}`);

        let paymentRecord: any = null;
        const { data: existing } = await supabaseAdmin.from('payments').select('*').eq('transaction_id', transactionId).single();

        if (existing) {
            paymentRecord = existing;
        } else if (externalRef) {
            const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', externalRef).single();
            if (order) {
                console.log(`[MP Hub] Recovered order ${order.id} for transaction ${transactionId}`);
                paymentRecord = { order_id: order.id, gateway_id: gatewayRecord.id, transaction_id: transactionId, status: 'pending' };
            }
        }

        if (!paymentRecord) {
            await logWebhook(supabaseAdmin, 'webhook.mp_order_not_found', `No local record for TX ${transactionId} / Ref ${externalRef}`, 200, rawBody);
            return res.status(200).json({ status: 'ORDER_NOT_FOUND', transactionId, externalRef });
        }

        // 3. Update Status
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
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
            
            if (supabaseUrl && supabaseKey) {
                fetch(`${supabaseUrl}/functions/v1/fulfill-order`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ order_id: oid })
                }).catch(e => console.error('[MP Hub] Fulfillment trigger error:', e.message));
            }

            await logWebhook(supabaseAdmin, mpIdempotencyKey, `Order ${oid} approved via MP (${mpStatus})`, 200, rawBody);
        } else {
            await logWebhook(supabaseAdmin, `webhook.mp_status_${mpStatus}`, `MP Status: ${mpStatus} for TX ${transactionId}`, 200, rawBody);
        }

        return res.status(200).json({ status: 'OK', mpStatus: mpData.status });

    } catch (err: any) {
        console.error('[MercadoPago Webhook] Fatal Error:', err.message);
        await logWebhook(supabaseAdmin, 'webhook.mp_fatal_error', err.message, 500, rawBody);
        return res.status(200).json({ status: 'ERROR', message: err.message });
    }
}

// --- CENTRAL EVENT WHITELIST ---
const CENTRAL_ALLOWED_EVENTS = ['license.upgraded', 'license.activated', 'license.suspended', 'license.deleted'];

async function handleCentral(req: VercelRequest, res: VercelResponse, rawBody: string, supabaseAdmin: any) {
    let payload: any;
    try { payload = JSON.parse(rawBody); } catch (e) {
        await logWebhook(supabaseAdmin, 'webhook.central_invalid_json', 'Failed to parse JSON body', 400, rawBody);
        return res.status(400).json({ status: 'INVALID_JSON' });
    }

    const { event, payload: data } = payload;
    const centralSecret = process.env.CENTRAL_SHARED_SECRET;
    const incomingSig = req.headers['x-super-checkout-signature'] as string;

    // SECURITY: Fail-closed — if secret is not configured, reject everything
    if (!centralSecret) {
        console.error('[Central Webhook] FATAL: CENTRAL_SHARED_SECRET not configured');
        await logWebhook(supabaseAdmin, 'webhook.central_config_error', 'CENTRAL_SHARED_SECRET missing', 500, rawBody);
        return res.status(500).json({ status: 'CONFIG_ERROR' });
    }

    // SECURITY: Timing-safe comparison (prevents timing attacks)
    if (!incomingSig) {
        await logWebhook(supabaseAdmin, 'webhook.central_no_signature', 'Missing x-super-checkout-signature header', 401, rawBody);
        return res.status(401).json({ status: 'UNAUTHORIZED' });
    }

    try {
        const sigBuffer = Buffer.from(incomingSig, 'utf-8');
        const secretBuffer = Buffer.from(centralSecret, 'utf-8');
        if (sigBuffer.length !== secretBuffer.length || !crypto.timingSafeEqual(sigBuffer, secretBuffer)) {
            await logWebhook(supabaseAdmin, 'webhook.central_auth_failed', 'Invalid signature (timingSafeEqual)', 401, rawBody);
            return res.status(401).json({ status: 'UNAUTHORIZED' });
        }
    } catch (e) {
        await logWebhook(supabaseAdmin, 'webhook.central_auth_error', 'Signature comparison error', 401, rawBody);
        return res.status(401).json({ status: 'UNAUTHORIZED' });
    }

    // SECURITY: Event whitelist — reject unknown events
    if (!event || !CENTRAL_ALLOWED_EVENTS.includes(event)) {
        await logWebhook(supabaseAdmin, 'webhook.central_rejected_event', `Rejected unknown event: ${event}`, 400, rawBody);
        return res.status(400).json({ status: 'INVALID_EVENT', event });
    }

    // SECURITY: Payload validation — require mandatory fields
    if (!data || !data.license_key || !data.plan_type) {
        await logWebhook(supabaseAdmin, 'webhook.central_invalid_payload', `Missing required fields: license_key=${!!data?.license_key}, plan_type=${!!data?.plan_type}`, 400, rawBody);
        return res.status(400).json({ status: 'INVALID_PAYLOAD' });
    }

    // Idempotency using event + license_key combo
    const centralIdempotencyKey = `central_${event}_${data.license_key}`;
    if (await isAlreadyProcessed(supabaseAdmin, centralIdempotencyKey)) {
        console.log(`[Central] Idempotency: ${centralIdempotencyKey} already processed. Skipping.`);
        return res.status(200).json({ status: 'ALREADY_PROCESSED' });
    }

    // PROCESS: License events
    if (event === 'license.upgraded' || event === 'license.activated') {
        const { license_key, plan_type } = data;
        const { data: lic } = await supabaseAdmin.from('licenses').select('account_id, key').eq('key', license_key).single();
        if (lic?.account_id) {
            await supabaseAdmin.from('accounts').update({ plan_type: plan_type.toLowerCase() }).eq('id', lic.account_id);
            await supabaseAdmin.from('licenses').update({ plan: plan_type }).eq('key', lic.key);
            await logWebhook(supabaseAdmin, centralIdempotencyKey, `License ${license_key} updated to ${plan_type}`, 200, rawBody);
        } else {
            await logWebhook(supabaseAdmin, 'webhook.central_license_not_found', `License ${license_key} not found locally`, 200, rawBody);
        }
    } else if (event === 'license.suspended' || event === 'license.deleted') {
        const { license_key } = data;
        const newStatus = event === 'license.suspended' ? 'suspended' : 'inactive';
        await supabaseAdmin.from('licenses').update({ status: newStatus }).eq('key', license_key);
        await logWebhook(supabaseAdmin, centralIdempotencyKey, `License ${license_key} set to ${newStatus}`, 200, rawBody);
    }

    return res.status(200).json({ status: 'CENTRAL_HUB_OK' });
}

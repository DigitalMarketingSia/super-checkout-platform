import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { decrypt } from '../src/core/utils/cryptoUtils.js';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { fulfillOrder } from '../src/core/services/fulfillment.js';
import { sendOrderAccessEmail } from '../src/core/services/orderEmail.js';

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
const safeString = (value: unknown, maxLength = 160) => {
    if (value === null || value === undefined) return null;
    return String(value).slice(0, maxLength);
};

const getNested = (source: any, path: string) => {
    return path.split('.').reduce((current, key) => {
        if (!current || typeof current !== 'object') return undefined;
        return current[key];
    }, source);
};

const summarizeWebhookPayload = (rawPayload?: string) => {
    if (!rawPayload) {
        return { redacted: true, has_payload: false };
    }

    let payload: any = {};
    try {
        payload = JSON.parse(rawPayload);
    } catch {
        return {
            redacted: true,
            has_payload: true,
            parse_error: 'invalid_json',
            body_bytes: Buffer.byteLength(rawPayload, 'utf8'),
        };
    }

    return {
        redacted: true,
        has_payload: true,
        event: safeString(payload.type || payload.event || payload.action || payload.topic),
        id: safeString(payload.id || getNested(payload, 'data.id') || getNested(payload, 'data.object.id')),
        object: safeString(getNested(payload, 'data.object.object')),
        order_id: safeString(payload.order_id || getNested(payload, 'data.object.metadata.order_id') || payload.external_reference),
        body_bytes: Buffer.byteLength(rawPayload, 'utf8'),
    };
};

const buildProviderRawResponse = (provider: 'stripe' | 'mercadopago', data: any) => {
    return JSON.stringify({
        redacted: true,
        provider,
        id: safeString(data?.id || data?.data?.object?.id || data?.data?.id),
        status: safeString(data?.status || data?.data?.object?.status),
        event: safeString(data?.type || data?.event || data?.action || data?.topic),
        external_reference: safeString(data?.external_reference),
        order_id: safeString(data?.order_id || data?.data?.object?.metadata?.order_id),
        captured_at: new Date().toISOString(),
    });
};

const logWebhook = async (supabaseAdmin: any, event: string, msg: string, status: number, rawPayload?: string) => {
    try {
        await supabaseAdmin.from('webhook_logs').insert({
            event,
            payload: summarizeWebhookPayload(rawPayload),
            response_status: status,
            response_body: safeString(msg, 240) || '',
            direction: 'inbound',
            processed: status === 200
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

function safeCompare(a?: string | null, b?: string | null): boolean {
    if (!a || !b) return false;

    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) return false;

    return crypto.timingSafeEqual(left, right);
}

function isStripeTimestampFresh(timestamp?: string | null): boolean {
    if (!timestamp || !/^\d+$/.test(timestamp)) return false;

    const timestampSeconds = Number(timestamp);
    if (!Number.isFinite(timestampSeconds)) return false;

    const nowSeconds = Math.floor(Date.now() / 1000);
    return Math.abs(nowSeconds - timestampSeconds) <= WEBHOOK_TIMESTAMP_TOLERANCE;
}

function isMercadoPagoTimestampFresh(timestamp?: string | null): boolean {
    if (!timestamp || !/^\d+$/.test(timestamp)) return false;

    const rawTimestamp = Number(timestamp);
    if (!Number.isFinite(rawTimestamp)) return false;

    const timestampMs = rawTimestamp > 10_000_000_000 ? rawTimestamp : rawTimestamp * 1000;
    return Math.abs(Date.now() - timestampMs) <= WEBHOOK_TIMESTAMP_TOLERANCE * 1000;
}

function getSingleQueryValue(value: string | string[] | undefined): string {
    if (Array.isArray(value)) return value[0] || '';
    return value || '';
}

function getHeaderValue(value: string | string[] | undefined): string {
    if (Array.isArray(value)) return value[0] || '';
    return value || '';
}

function parseMercadoPagoSignature(signature: string): { ts: string; v1: string } | null {
    const parsed = new Map<string, string>();

    for (const part of signature.split(',')) {
        const [key, value] = part.split('=');
        if (key && value) parsed.set(key.trim(), value.trim());
    }

    const ts = parsed.get('ts') || '';
    const v1 = parsed.get('v1') || '';
    return ts && v1 ? { ts, v1 } : null;
}

function buildMercadoPagoSignatureManifest(dataId: string, requestId: string, ts: string): string {
    const parts: string[] = [];
    if (dataId) parts.push(`id:${dataId}`);
    if (requestId) parts.push(`request-id:${requestId}`);
    if (ts) parts.push(`ts:${ts}`);
    return `${parts.join(';')};`;
}

function verifyMercadoPagoSignature(req: VercelRequest, webhookSecret: string) {
    const contentType = getHeaderValue(req.headers['content-type']);
    if (!contentType.toLowerCase().includes('application/json')) {
        return { ok: false, status: 'INVALID_CONTENT_TYPE' };
    }

    const signatureHeader = getHeaderValue(req.headers['x-signature']);
    const requestId = getHeaderValue(req.headers['x-request-id']);
    const parsedSignature = parseMercadoPagoSignature(signatureHeader);

    if (!webhookSecret || !signatureHeader || !requestId || !parsedSignature) {
        return { ok: false, status: 'MISSING_SIGNATURE' };
    }

    if (!isMercadoPagoTimestampFresh(parsedSignature.ts)) {
        return { ok: false, status: 'STALE_SIGNATURE' };
    }

    const dataId = getSingleQueryValue(req.query['data.id']) || getSingleQueryValue(req.query.id);
    const manifest = buildMercadoPagoSignatureManifest(dataId, requestId, parsedSignature.ts);
    const expectedSig = crypto.createHmac('sha256', webhookSecret).update(manifest).digest('hex');

    if (!safeCompare(parsedSignature.v1, expectedSig)) {
        return { ok: false, status: 'INVALID_SIGNATURE' };
    }

    return { ok: true, status: 'OK' };
}

function verifyCentralSignature(req: VercelRequest, rawBody: string) {
    const centralSecret =
        process.env.CENTRAL_WEBHOOK_HMAC_SECRET ||
        process.env.CENTRAL_SHARED_SECRET ||
        process.env.SHARED_SECRET ||
        '';
    const timestamp = getHeaderValue(req.headers['x-super-checkout-timestamp']);
    const signatureHeader = getHeaderValue(req.headers['x-super-checkout-signature']);
    const signature = signatureHeader.replace(/^sha256=/i, '');

    if (!centralSecret || !timestamp || !signature) {
        return { ok: false, status: 'MISSING_SIGNATURE' };
    }

    if (!isStripeTimestampFresh(timestamp)) {
        return { ok: false, status: 'STALE_SIGNATURE' };
    }

    const expectedSig = crypto
        .createHmac('sha256', centralSecret)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex');

    if (!safeCompare(signature, expectedSig)) {
        return { ok: false, status: 'INVALID_SIGNATURE' };
    }

    return { ok: true, status: 'OK' };
}

function checkoutAllowsGateway(checkout: any, gatewayId?: string | null) {
    if (!checkout || !gatewayId) return false;
    const allowedGatewayIds = [checkout.gateway_id, checkout.backup_gateway_id]
        .filter(Boolean)
        .map((id) => String(id));
    return allowedGatewayIds.includes(String(gatewayId));
}

async function loadOrderAndCheckout(supabaseAdmin: any, orderId?: string | null) {
    if (!orderId) return { order: null, checkout: null };

    const { data: order } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .maybeSingle();

    if (!order?.checkout_id) return { order, checkout: null };

    const { data: checkout } = await supabaseAdmin
        .from('checkouts')
        .select('*')
        .eq('id', order.checkout_id)
        .maybeSingle();

    return { order, checkout };
}

function webhookOwnershipMatches(order: any, checkout: any, gateway: any, paymentRecord?: any) {
    if (!order?.user_id || !checkout || !gateway?.id) return false;
    if (checkout.user_id !== order.user_id) return false;
    if (gateway.user_id !== order.user_id) return false;
    if (paymentRecord?.user_id && paymentRecord.user_id !== order.user_id) return false;
    return checkoutAllowsGateway(checkout, gateway.id);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { action } = req.query;

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

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

        return res.status(404).json({ error: 'ACTION_NOT_FOUND' });

    } catch (error: any) {
        console.error('[Webhooks Hub] Fatal Error:', error?.message || error);
        return res.status(200).json({ status: 'FATAL_ERROR' });
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
            const { order, checkout } = await loadOrderAndCheckout(supabaseAdmin, metaOrder);
            if (order && checkout) {
                const allowedGatewayIds = [checkout.gateway_id, checkout.backup_gateway_id].filter(Boolean).map(String);
                const { data: gts } = await supabaseAdmin
                    .from('gateways')
                    .select('*')
                    .in('id', allowedGatewayIds)
                    .eq('user_id', order.user_id)
                    .eq('name', 'stripe')
                    .eq('active', true);
                gatewayRecord = gts?.find((gateway: any) => checkoutAllowsGateway(checkout, gateway.id));
                if (gatewayRecord) {
                    paymentRecord = {
                        order_id: order.id,
                        gateway_id: gatewayRecord.id,
                        transaction_id: effectiveId,
                        status: 'pending',
                        user_id: order.user_id
                    };
                }
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

        if (!isStripeTimestampFresh(timestamp)) return res.status(401).json({ status: 'STALE_SIGNATURE' });
        
        const expectedSig = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
        if (!safeCompare(stripeSig, expectedSig)) return res.status(401).json({ status: 'INVALID_SIGNATURE' });
    } catch (e) { return res.status(401).json({ status: 'SIG_ERROR' }); }

    const successEvents = ['payment_intent.succeeded', 'charge.succeeded', 'checkout.session.completed'];
    if (successEvents.includes(eventType)) {
        const oid = paymentRecord.order_id;
        const { order: orderData, checkout } = await loadOrderAndCheckout(supabaseAdmin, oid);
        if (!webhookOwnershipMatches(orderData, checkout, gatewayRecord, paymentRecord)) {
            await logWebhook(supabaseAdmin, `${eventId || effectiveId}_ownership_rejected`, 'Stripe ownership rejected', 200, rawBody);
            return res.status(200).json({ status: 'OWNERSHIP_REJECTED' });
        }
        
        const updates = [
            supabaseAdmin
                .from('orders')
                .update({ status: 'paid' })
                .eq('id', oid)
                .eq('user_id', orderData.user_id)
        ];
        if (mustCreate) {
            updates.push(supabaseAdmin.from('payments').insert({ ...paymentRecord, id: crypto.randomUUID(), status: 'paid', raw_response: buildProviderRawResponse('stripe', payload), created_at: new Date().toISOString() }));
        } else {
            updates.push(
                supabaseAdmin
                    .from('payments')
                    .update({ status: 'paid', raw_response: buildProviderRawResponse('stripe', payload), user_id: orderData.user_id })
                    .eq('id', paymentRecord.id)
                    .eq('order_id', oid)
            );
        }
        await Promise.all(updates);
        await fulfillOrder(supabaseAdmin, {
            orderId: oid,
            email: orderData?.customer_email,
            name: orderData?.customer_name,
        });
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

    const { data: existingPaymentPre } = await supabaseAdmin
        .from('payments')
        .select('*')
        .eq('transaction_id', resourceId)
        .maybeSingle();
    let paymentRecord: any = existingPaymentPre || null;

    const gatewayQuery = supabaseAdmin
        .from('gateways')
        .select('*')
        .eq('active', true);

    const { data: candidateGateways } = paymentRecord?.gateway_id
        ? await gatewayQuery.eq('id', paymentRecord.gateway_id)
        : await gatewayQuery.or('name.ilike.%mercado%,name.eq.mercado_pago,provider.ilike.%mercado%,provider.eq.mercado_pago');

    let gatewayRecord = null;
    const gatewaysWithSecrets = (candidateGateways || [])
        .map((gateway: any) => ({ gateway, secret: decrypt(gateway.webhook_secret || '') }))
        .filter((entry: any) => entry.secret);

    if (gatewaysWithSecrets.length > 0) {
        const matched = gatewaysWithSecrets.find((entry: any) => verifyMercadoPagoSignature(req, entry.secret).ok);
        if (!matched) {
            await logWebhook(supabaseAdmin, 'webhook.mp_invalid_signature', 'INVALID_SIGNATURE', 401, rawBody);
            return res.status(401).json({ status: 'INVALID_SIGNATURE' });
        }
        gatewayRecord = matched.gateway;
    } else if (paymentRecord?.gateway_id) {
        gatewayRecord = candidateGateways?.[0] || null;
    } else {
        await logWebhook(supabaseAdmin, 'webhook.mp_missing_signature', 'MISSING_SIGNATURE', 401, rawBody);
        return res.status(401).json({ status: 'MISSING_SIGNATURE' });
    }

    if (!gatewayRecord?.private_key) return res.status(200).json({ status: 'GATEWAY_NOT_FOUND' });

    try {
        const decodedKey = decrypt(gatewayRecord.private_key).trim();
        const client = new MercadoPagoConfig({ accessToken: decodedKey });
        const payment = new Payment(client);

        const mpData = await payment.get({ id: resourceId });
        const transactionId = mpData.id?.toString();
        const externalRef = mpData.external_reference;

        if (!paymentRecord && externalRef) {
            const { order, checkout } = await loadOrderAndCheckout(supabaseAdmin, externalRef);
            if (webhookOwnershipMatches(order, checkout, gatewayRecord)) {
                paymentRecord = {
                    order_id: order.id,
                    gateway_id: gatewayRecord.id,
                    transaction_id: transactionId,
                    status: 'pending',
                    user_id: order.user_id
                };
            }
        }

        if (!paymentRecord) return res.status(200).json({ status: 'ORDER_NOT_FOUND' });

        const mpStatus = mpData.status?.toLowerCase();
        if (mpStatus === 'approved' || mpStatus === 'authorized') {
            const oid = paymentRecord.order_id;
            const { order: orderData, checkout } = await loadOrderAndCheckout(supabaseAdmin, oid);
            if (!webhookOwnershipMatches(orderData, checkout, gatewayRecord, paymentRecord)) {
                await logWebhook(supabaseAdmin, `${mpIdempotencyKey}_ownership_rejected`, 'MP ownership rejected', 200, rawBody);
                return res.status(200).json({ status: 'OWNERSHIP_REJECTED' });
            }

            const updates = [
                supabaseAdmin
                    .from('orders')
                    .update({ status: 'paid' })
                    .eq('id', oid)
                    .eq('user_id', orderData.user_id)
            ];
            if (!paymentRecord.id) {
                updates.push(supabaseAdmin.from('payments').insert({ ...paymentRecord, id: crypto.randomUUID(), status: 'paid', raw_response: buildProviderRawResponse('mercadopago', mpData), created_at: new Date().toISOString() }));
            } else {
                updates.push(
                    supabaseAdmin
                        .from('payments')
                        .update({ status: 'paid', raw_response: buildProviderRawResponse('mercadopago', mpData), user_id: orderData.user_id })
                        .eq('id', paymentRecord.id)
                        .eq('order_id', oid)
                );
            }
            await Promise.all(updates);

            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
            if (!supabaseUrl || !supabaseKey) {
                throw new Error('Missing Supabase runtime config for fulfill-order.');
            }

            await fulfillOrder(supabaseAdmin, {
                orderId: oid,
                email: orderData?.customer_email,
                name: orderData?.customer_name,
            });
            try {
                const origin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
                const emailResult = await sendOrderAccessEmail(supabaseAdmin, {
                    orderId: oid,
                    origin,
                    email: orderData?.customer_email,
                    name: orderData?.customer_name,
                });
                if ((emailResult as any)?.sent) {
                    await logWebhook(supabaseAdmin, `${mpIdempotencyKey}_email_fallback`, `Business email sent: ${oid}`, 200, rawBody);
                }
            } catch (emailError: any) {
                console.error('[MP Hub] Business email fallback failed:', emailError?.message || emailError);
                await logWebhook(supabaseAdmin, `${mpIdempotencyKey}_email_fallback_error`, 'Business email fallback failed', 500, rawBody);
            }

            await logWebhook(supabaseAdmin, mpIdempotencyKey, `Approved: ${oid}`, 200, rawBody);
        }
        return res.status(200).json({ status: 'OK', mpStatus });
    } catch (err: any) {
        console.error('[MP Hub] Processing failed:', err?.message || err);
        await logWebhook(supabaseAdmin, 'webhook.mp_error', 'MP processing failed', 500, rawBody);
        return res.status(500).json({ status: 'ERROR' });
    }
}

// --- CENTRAL ---
const CENTRAL_ALLOWED_EVENTS = ['license.upgraded', 'license.activated', 'license.suspended', 'license.deleted'];

async function handleCentral(req: VercelRequest, res: VercelResponse, rawBody: string, supabaseAdmin: any) {
    let payload: any;
    try { payload = JSON.parse(rawBody); } catch (e) { return res.status(400).json({ status: 'INVALID_JSON' }); }

    const { event, payload: data } = payload;
    const signatureResult = verifyCentralSignature(req, rawBody);

    if (!signatureResult.ok) return res.status(401).json({ status: signatureResult.status });
    if (!event || !CENTRAL_ALLOWED_EVENTS.includes(event)) return res.status(400).json({ status: 'INVALID_EVENT' });
    if (!data?.license_key || typeof data.license_key !== 'string') return res.status(400).json({ status: 'INVALID_PAYLOAD' });

    const centralIdempotencyKey = `central_${event}_${data?.license_key}`;
    if (await isAlreadyProcessed(supabaseAdmin, centralIdempotencyKey)) return res.status(200).json({ status: 'ALREADY_PROCESSED' });

    if (event === 'license.upgraded' || event === 'license.activated') {
        const { license_key, plan_type } = data;
        if (!plan_type || typeof plan_type !== 'string') return res.status(400).json({ status: 'INVALID_PAYLOAD' });
        const { data: lic } = await supabaseAdmin.from('licenses').select('account_id, key').eq('key', license_key).single();
        if (lic?.account_id) {
            await supabaseAdmin.from('accounts').update({ plan_type: plan_type.toLowerCase() }).eq('id', lic.account_id);
            await supabaseAdmin.from('licenses').update({ plan: plan_type }).eq('key', lic.key);
            await logWebhook(supabaseAdmin, centralIdempotencyKey, 'Central update applied', 200, rawBody);
        }
    }
    return res.status(200).json({ status: 'CENTRAL_HUB_OK' });
}

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

const invokeFulfillOrder = async (
    supabaseUrl: string,
    supabaseKey: string,
    payload: { order_id: string; email?: string | null; name?: string | null },
) => {
    const fulfillRes = await fetch(`${supabaseUrl}/functions/v1/fulfill-order`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    const responseText = await fulfillRes.text();
    let responseData: any = null;

    try {
        responseData = responseText ? JSON.parse(responseText) : null;
    } catch {
        responseData = null;
    }

    if (!fulfillRes.ok) {
        throw new Error(
            responseData?.error
            || responseText
            || `fulfill-order failed with status ${fulfillRes.status}`,
        );
    }

    return responseData;
};

const replaceTemplateVars = (template: string, variables: Record<string, string>) => {
    let output = template || '';
    for (const [key, value] of Object.entries(variables)) {
        output = output.replace(new RegExp(key, 'g'), value || '');
    }
    return output;
};

const hasBusinessEventPipelineRecord = async (supabaseAdmin: any, orderId: string) => {
    const { data, error } = await supabaseAdmin
        .from('app_events')
        .select('id,status')
        .in('type', ['ORDER_COMPLETED', 'ACCESS_GRANTED'])
        .eq('payload->>order_id', orderId)
        .limit(1);

    if (error) {
        const message = String(error.message || '').toLowerCase();
        if (error.code === '42P01' || message.includes('app_events')) return false;
        console.warn('[Webhook Email Fallback] Could not inspect app_events:', error.message);
        return true;
    }

    return Boolean(data?.length);
};

const resolveMembersAreaUrl = async (supabaseAdmin: any, order: any, origin: string, email: string) => {
    let redirectTo = `${origin.replace(/\/+$/, '')}/login`;
    const items = Array.isArray(order.items) ? order.items : [];
    const productIds = items.map((item: any) => item.product_id || item.id).filter(Boolean);

    try {
        if (productIds.length > 0) {
            const { data: links } = await supabaseAdmin
                .from('product_contents')
                .select('content:contents(member_area_id, member_areas(slug, domains(domain)))')
                .in('product_id', productIds)
                .limit(1);

            const area = links?.[0]?.content?.member_areas;
            if (area?.slug) redirectTo = `${origin.replace(/\/+$/, '')}/app/${area.slug}`;
            if (area?.domains?.domain) redirectTo = `https://${area.domains.domain}`;
        }

        const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email,
            options: { redirectTo },
        });

        return linkData?.properties?.action_link || redirectTo;
    } catch (error: any) {
        console.warn('[Webhook Email Fallback] Failed to resolve member area magic link:', error.message || error);
        return redirectTo;
    }
};

const sendBusinessOrderEmailFallback = async (
    supabaseAdmin: any,
    orderId: string,
    origin: string,
    recipient?: { email?: string | null; name?: string | null } | null,
) => {
    const { data: order, error: orderError } = await supabaseAdmin
        .from('orders')
        .select('id, customer_email, customer_name, items, metadata, checkout_id, checkouts(user_id)')
        .eq('id', orderId)
        .single();

    if (orderError || !order) throw new Error(`Order ${orderId} not found for email fallback.`);

    const metadata = order.metadata && typeof order.metadata === 'object' ? order.metadata : {};
    if (metadata.order_completed_email_sent_at) {
        console.log(`[Webhook Email Fallback] Email already sent for order ${orderId}. Skipping.`);
        return { skipped: true, reason: 'already_sent' };
    }

    if (await hasBusinessEventPipelineRecord(supabaseAdmin, orderId)) {
        console.log(`[Webhook Email Fallback] app_events pipeline present for order ${orderId}. Skipping direct send.`);
        return { skipped: true, reason: 'event_pipeline_present' };
    }

    const to = recipient?.email || order.customer_email;
    const name = recipient?.name || order.customer_name || 'Cliente';
    if (!to) throw new Error(`Order ${orderId} has no recipient email.`);

    const { data: integration } = await supabaseAdmin
        .from('integrations')
        .select('*')
        .eq('name', 'resend')
        .eq('active', true)
        .limit(1)
        .maybeSingle();

    const apiKey = integration?.config?.apiKey || integration?.config?.api_key;
    const fromEmail = integration?.config?.senderEmail || integration?.config?.from_email || 'onboarding@resend.dev';
    if (!apiKey) throw new Error("Email provider 'resend' is not active or configured.");

    const { data: template } = await supabaseAdmin
        .from('email_templates')
        .select('*')
        .eq('event_type', 'ORDER_COMPLETED')
        .eq('active', true)
        .limit(1)
        .maybeSingle();

    const { data: settings } = await supabaseAdmin
        .from('business_settings')
        .select('sender_name,business_name')
        .limit(1)
        .maybeSingle();

    const productNames = Array.isArray(order.items) && order.items.length > 0
        ? order.items.map((item: any) => item.name).filter(Boolean).join(', ')
        : 'Produto';
    const membersAreaUrl = await resolveMembersAreaUrl(supabaseAdmin, order, origin, to);
    const variables = {
        '{{order_id}}': orderId ? `#${orderId.split('-')[0]}` : '',
        '{{customer_name}}': name,
        '{{name}}': name,
        '{{email}}': to,
        '{{product_names}}': productNames || 'Produto',
        '{{members_area_url}}': membersAreaUrl,
        '{{business_name}}': settings?.business_name || 'Super Checkout',
    };

    const subject = replaceTemplateVars(template?.subject || 'Pagamento aprovado - acesso liberado', variables);
    const html = replaceTemplateVars(template?.html_body || `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1>Ola, {{customer_name}}!</h1>
            <p>Seu pagamento foi aprovado.</p>
            <p>Produto(s): <strong>{{product_names}}</strong></p>
            <p><a href="{{members_area_url}}">Acessar area de membros</a></p>
        </div>
    `, variables);

    const senderName = settings?.sender_name || settings?.business_name;
    const from = senderName ? `${senderName} <${fromEmail.replace(/.*<|>/g, '')}>` : fromEmail;
    const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ from, to: [to], subject, html }),
    });

    const resendData = await resendRes.json().catch(() => ({}));
    if (!resendRes.ok) {
        throw new Error(`Resend rejected order email: ${JSON.stringify(resendData)}`);
    }

    await supabaseAdmin
        .from('orders')
        .update({
            metadata: {
                ...metadata,
                order_completed_email_sent_at: new Date().toISOString(),
                order_completed_email_resend_id: resendData?.id || null,
                order_completed_email_source: 'webhook_fallback',
            },
        })
        .eq('id', orderId);

    return { sent: true, id: resendData?.id };
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

        if (!isStripeTimestampFresh(timestamp)) return res.status(401).json({ status: 'STALE_SIGNATURE' });
        
        const expectedSig = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
        if (!safeCompare(stripeSig, expectedSig)) return res.status(401).json({ status: 'INVALID_SIGNATURE' });
    } catch (e) { return res.status(401).json({ status: 'SIG_ERROR' }); }

    const successEvents = ['payment_intent.succeeded', 'charge.succeeded', 'checkout.session.completed'];
    if (successEvents.includes(eventType)) {
        const oid = paymentRecord.order_id;
        const { data: orderData } = await supabaseAdmin.from('orders').select('customer_email, customer_name').eq('id', oid).single();
        
        const updates = [supabaseAdmin.from('orders').update({ status: 'paid' }).eq('id', oid)];
        if (mustCreate) {
            updates.push(supabaseAdmin.from('payments').insert({ ...paymentRecord, id: crypto.randomUUID(), status: 'paid', raw_response: rawBody, created_at: new Date().toISOString() }));
        } else {
            updates.push(supabaseAdmin.from('payments').update({ status: 'paid', raw_response: rawBody }).eq('id', paymentRecord.id));
        }
        await Promise.all(updates);
        await invokeFulfillOrder(supabaseUrl, supabaseKey, {
            order_id: oid,
            email: orderData?.customer_email,
            name: orderData?.customer_name,
        });
        try {
            const origin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
            const emailResult = await sendBusinessOrderEmailFallback(supabaseAdmin, oid, origin, {
                email: orderData?.customer_email,
                name: orderData?.customer_name,
            });
            if ((emailResult as any)?.sent) {
                await logWebhook(supabaseAdmin, `${eventId}_email_fallback`, `Business email sent: ${oid}`, 200, rawBody);
            }
        } catch (emailError: any) {
            await logWebhook(supabaseAdmin, `${eventId}_email_fallback_error`, emailError.message, 500, rawBody);
        }
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
            const { data: orderData } = await supabaseAdmin.from('orders').select('customer_email, customer_name').eq('id', oid).single();

            const updates = [supabaseAdmin.from('orders').update({ status: 'paid' }).eq('id', oid)];
            if (!paymentRecord.id) {
                updates.push(supabaseAdmin.from('payments').insert({ ...paymentRecord, id: crypto.randomUUID(), status: 'paid', raw_response: JSON.stringify(mpData), created_at: new Date().toISOString() }));
            } else {
                updates.push(supabaseAdmin.from('payments').update({ status: 'paid', raw_response: JSON.stringify(mpData) }).eq('id', paymentRecord.id));
            }
            await Promise.all(updates);

            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
            if (!supabaseUrl || !supabaseKey) {
                throw new Error('Missing Supabase runtime config for fulfill-order.');
            }

            await invokeFulfillOrder(supabaseUrl, supabaseKey, {
                order_id: oid,
                email: orderData?.customer_email,
                name: orderData?.customer_name,
            });
            try {
                const origin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
                const emailResult = await sendBusinessOrderEmailFallback(supabaseAdmin, oid, origin, {
                    email: orderData?.customer_email,
                    name: orderData?.customer_name,
                });
                if ((emailResult as any)?.sent) {
                    await logWebhook(supabaseAdmin, `${mpIdempotencyKey}_email_fallback`, `Business email sent: ${oid}`, 200, rawBody);
                }
            } catch (emailError: any) {
                await logWebhook(supabaseAdmin, `${mpIdempotencyKey}_email_fallback_error`, emailError.message, 500, rawBody);
            }

            await logWebhook(supabaseAdmin, mpIdempotencyKey, `Approved: ${oid}`, 200, rawBody);
        }
        return res.status(200).json({ status: 'OK', mpStatus });
    } catch (err: any) {
        await logWebhook(supabaseAdmin, 'webhook.mp_error', err.message, 500, rawBody);
        return res.status(500).json({ status: 'ERROR', message: err.message });
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

    if (!centralSecret || !safeCompare(incomingSig, centralSecret)) return res.status(401).json({ status: 'UNAUTHORIZED' });
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

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// --- CONFIG ---
export const config = {
    api: {
        bodyParser: false,
    },
};

// --- HELPERS ---
const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

const getRawBody = async (req: VercelRequest): Promise<string> => {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => body += chunk);
        req.on('end', () => resolve(body));
        req.on('error', (err) => reject(err));
    });
};

// --- MAIN HANDLER ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Stripe-Signature');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://vixlzrmhqsbzjhpgfwdn.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('[Stripe Webhook] Missing Supabase credentials (URL or Service Role Key)');
        return res.status(500).json({ error: 'Server configuration error: Missing credentials' });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // --- HELPER LOGGING ---
    const logWebhook = async (event: string, payload: any, responseStatus: number, responseBody: string) => {
        try {
            await supabaseAdmin.from('webhook_logs').insert({
                event,
                payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
                response_status: responseStatus,
                response_body: responseBody,
                direction: 'inbound',
                processed: responseStatus === 200
            });
        } catch (e) {
            console.error('[Stripe Webhook] Failed to log to DB:', e);
        }
    };

    try {
        const rawBody = await getRawBody(req);
        const signature = req.headers['stripe-signature'] as string;
        const payload = JSON.parse(rawBody);
        const eventType = payload.type;
        const paymentIntentId = payload.data?.object?.payment_intent || payload.data?.object?.id;

        console.log(`[Stripe Webhook] Received Event: ${eventType} for PI: ${paymentIntentId}`);

        if (!paymentIntentId || !paymentIntentId.startsWith('pi_')) {
            await logWebhook('webhook.stripe_ignored', payload, 200, 'Ignored: No PI ID');
            return res.status(200).json({ message: 'Ignored: No PI ID' });
        }

        // 1. FETCH DATA (WITH RETRY)
        let paymentRecord = null;
        for (let i = 0; i < 3; i++) {
            const { data, error } = await supabaseAdmin
                .from('payments')
                .select('*, gateways(stripe_webhook_secret)')
                .eq('transaction_id', paymentIntentId)
                .single();
            
            if (data) {
                paymentRecord = data;
                break;
            }
            if (error) console.warn(`[Stripe Webhook] Fetch error: ${error.message}`);
            console.log(`[Stripe Webhook] Retrying fetch for ${paymentIntentId}... (${i+1}/3)`);
            await new Promise(r => setTimeout(r, 1000));
        }

        if (!paymentRecord) {
            const msg = `Payment not found in DB: ${paymentIntentId}`;
            console.error(`[Stripe Webhook] ${msg}`);
            await logWebhook('webhook.stripe_error', payload, 404, msg);
            return res.status(200).json({ message: msg });
        }

        // 2. VALIDATE SIGNATURE
        const webhookSecret = (paymentRecord as any).gateways?.stripe_webhook_secret;
        if (webhookSecret && signature) {
            try {
                const parts = signature.split(',');
                const timestamp = parts.find(p => p.startsWith('t='))?.split('=')[1];
                const stripeSig = parts.find(p => p.startsWith('v1='))?.split('=')[1];
                const signedPayload = `${timestamp}.${rawBody}`;
                const expectedSig = crypto.createHmac('sha256', webhookSecret).update(signedPayload).digest('hex');

                if (stripeSig !== expectedSig) {
                    const msg = 'Signature mismatch - check your Stripe Webhook Secret';
                    console.error(`[Stripe Webhook] ${msg}`);
                    await logWebhook('webhook.stripe_signature_error', payload, 400, msg);
                    return res.status(400).json({ error: msg });
                }
            } catch (sigErr: any) {
                console.error('[Stripe Webhook] Signature parse error:', sigErr.message);
                await logWebhook('webhook.stripe_signature_parse_error', payload, 400, sigErr.message);
                return res.status(400).json({ error: 'Signature failure' });
            }
        }

        // 3. PROCESS SUCCESS
        if (eventType === 'payment_intent.succeeded' || eventType === 'charge.succeeded' || eventType === 'checkout.session.completed') {
            const orderId = paymentRecord.order_id;
            console.log(`[Stripe Webhook] Processing success for Order: ${orderId}`);

            // ATOMIC UPDATES (Admin Power)
            const [payUpdate, ordUpdate] = await Promise.all([
                supabaseAdmin.from('payments').update({ status: 'paid' }).eq('id', paymentRecord.id),
                supabaseAdmin.from('orders').update({ status: 'paid' }).eq('id', orderId)
            ]);

            if (payUpdate.error || ordUpdate.error) {
                const errorMsg = payUpdate.error?.message || ordUpdate.error?.message || 'Update failed';
                console.error('[Stripe Webhook] Update error:', errorMsg);
                await logWebhook('webhook.stripe_db_error', payload, 500, errorMsg);
                return res.status(500).json({ error: errorMsg });
            } else {
                console.log(`[Stripe Webhook] SUCCESS: Order ${orderId} is now PAID`);
                await logWebhook('webhook.stripe_success', payload, 200, `Order ${orderId} paid`);
                
                // Trigger fulfillment Edge Function
                fetch(`${supabaseUrl}/functions/v1/fulfill-order`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ order_id: orderId })
                }).catch(e => console.error('[Stripe Webhook] Fulfillment trigger error:', e.message));
            }
        } else {
            // Ignored event
            await logWebhook(`webhook.stripe_ignored_${eventType}`, payload, 200, 'Event ignored');
        }

        return res.status(200).json({ success: true });

    } catch (err: any) {
        console.error('[Stripe Webhook] Critical Error:', err.message);
        await logWebhook('webhook.stripe_critical_error', { error: err.message }, 500, err.stack || 'No stack');
        return res.status(500).json({ error: err.message });
    }
}

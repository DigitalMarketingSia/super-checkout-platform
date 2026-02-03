import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// --- TYPES ---
interface WebhookLog {
    id: string;
    gateway_id?: string;
    direction: string;
    event: string;
    payload: string;
    raw_data?: string;
    processed: boolean;
    created_at: string;
}

// --- HELPERS ---
const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

// --- MAIN HANDLER ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-signature, x-request-id'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Force Rebuild Trigger: 2026-02-03-12-00-00-FORCE
    // Fix: Check for NEXT_PUBLIC_ env vars (Vercel standard) or VITE_ (Local)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://vixlzrmhqsbzjhpgfwdn.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    // Helper to log to Supabase
    const logToSupabase = async (event: string, payload: any, processed: boolean, gatewayId?: string) => {
        if (!supabaseKey) {
            console.warn('[Webhook] No Supabase Key available for logging');
            return;
        }
        try {
            const logEntry: WebhookLog = {
                id: generateUUID(),
                gateway_id: gatewayId,
                direction: 'incoming',
                event: event,
                payload: JSON.stringify(payload),
                raw_data: JSON.stringify(payload),
                processed: processed,
                created_at: new Date().toISOString()
            };

            await fetch(`${supabaseUrl}/rest/v1/webhook_logs`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(logEntry)
            });
        } catch (e: any) {
            console.error('Failed to log to Supabase:', e.message);
        }
    };

    let paymentRecord: any = null;


    // --- EMAIL HELPERS ---
    const sendOrderEmail = async (order: any, supabaseUrl: string, supabaseKey: string) => {
        try {
            console.log(`[Webhook] Attempting to send email for Order ${order.id}`);

            // 1. Fetch Resend Integration
            const intRes = await fetch(`${supabaseUrl}/rest/v1/integrations?name=eq.resend&active=eq.true&select=*&limit=1`, {
                headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
            });

            if (!intRes.ok) throw new Error('Failed to fetch integrations');
            const integrations = await intRes.json();
            const integration = integrations?.[0];

            if (!integration || !integration.config?.apiKey) {
                console.warn('[Webhook] No active Resend integration found. Skipping email.');
                return;
            }

            const apiKey = integration.config.apiKey;
            const fromEmail = integration.config.senderEmail || "onboarding@resend.dev";

            // 2. Fetch Template
            let subject = '';
            let html = '';

            try {
                const tplRes = await fetch(`${supabaseUrl}/rest/v1/email_templates?event_type=eq.ORDER_COMPLETED&active=eq.true&select=*&limit=1`, {
                    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
                });

                if (tplRes.ok) {
                    const templates = await tplRes.json();
                    if (templates && templates.length > 0) {
                        const tpl = templates[0];
                        subject = tpl.subject;
                        html = tpl.html_body;
                    } else {
                        console.log('[Webhook] Notification disabled (no active template found). Skipping email.');
                        return;
                    }
                } else {
                    console.warn('[Webhook] Failed to query templates. DB Error.');
                    return;
                }
            } catch (tplErr) {
                console.warn('[Webhook] Failed to fetch template:', tplErr);
                return;
            }

            // 3. Replace Variables
            const variables: Record<string, string> = {
                '{{customer_name}}': order.customer_name || 'Cliente',
                '{{order_id}}': order.id,
                '{{amount}}': order.amount,
                '{{product_names}}': 'Produtos Digitais', // Future: fetch items names
                '{{members_area_url}}': 'https://app.supercheckout.app/login' // Generic fallback
            };

            for (const [key, value] of Object.entries(variables)) {
                subject = subject.replace(new RegExp(key, 'g'), value);
                html = html.replace(new RegExp(key, 'g'), value);
            }

            // 4. Send via Resend
            const resendRes = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    from: fromEmail,
                    to: [order.customer_email],
                    subject: subject,
                    html: html
                }),
            });

            if (!resendRes.ok) {
                const errData = await resendRes.json();
                console.error('[Webhook] Resend API Error:', errData);
            } else {
                console.log(`[Webhook] Email sent to ${order.customer_email}`);
            }

        } catch (error: any) {
            console.error('[Webhook] Email sending failed:', error.message);
        }
    };


    try {
        console.log('[Webhook] Received POST request');
        // ... (rest of handler) ...

        const payload = req.body;

        // 1. Log Raw Receipt
        await logToSupabase('webhook.received', { headers: req.headers, body: payload }, false);

        const paymentId = payload.data?.id || payload.id;
        const action = payload.action || payload.type;

        if (!paymentId) {
            await logToSupabase('webhook.ignored', { reason: 'No payment ID found', payload }, false);
            return res.status(200).json({ message: 'Ignored: No payment ID' });
        }

        // 2. Fetch Payment Info from Mercado Pago

        // A. Find the payment record to get the gateway_id
        if (supabaseKey) {
            try {
                console.log(`[Webhook] Fetching payment record for transaction ${paymentId}`);
                const paymentRes = await fetch(`${supabaseUrl}/rest/v1/payments?transaction_id=eq.${paymentId}&select=*`, {
                    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
                });

                if (!paymentRes.ok) {
                    throw new Error(`Supabase Payment Fetch Error: ${paymentRes.status} ${paymentRes.statusText}`);
                }

                const payments = await paymentRes.json();
                if (payments && payments.length > 0) {
                    paymentRecord = payments[0];
                    console.log(`[Webhook] Found payment record: ${paymentRecord.id}`);
                } else {
                    console.warn(`[Webhook] No payment record found for transaction ${paymentId}`);
                }
            } catch (fetchError: any) {
                console.error('[Webhook] Error fetching payment:', fetchError);
                await logToSupabase('webhook.error_fetching_payment', { error: fetchError.message }, false);
            }
        }

        // B. Get Gateway Credentials
        let accessToken = '';

        if (supabaseKey) {
            try {
                console.log('[Webhook] Fetching gateway credentials');
                // FIX: Database name is 'mercado_pago', not 'mercadopago'
                const gatewayRes = await fetch(`${supabaseUrl}/rest/v1/gateways?name=eq.mercado_pago&active=eq.true&select=*`, {
                    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
                });

                if (!gatewayRes.ok) {
                    throw new Error(`Supabase Gateway Fetch Error: ${gatewayRes.status} ${gatewayRes.statusText}`);
                }

                const gateways = await gatewayRes.json();
                if (gateways && gateways.length > 0) {
                    // Use the one from the payment record if available, otherwise the first active one
                    // This fallback is CRITICAL if the payment record wasn't found (e.g. race condition)
                    const gateway = (paymentRecord && gateways.find((g: any) => g.id === paymentRecord.gateway_id)) || gateways[0];

                    accessToken = gateway.private_key;
                    console.log(`[Webhook] Using gateway: ${gateway.id}`);
                } else {
                    console.error('[Webhook] No active Mercado Pago gateways found');
                }
            } catch (fetchError: any) {
                console.error('[Webhook] Error fetching gateways:', fetchError);
                await logToSupabase('webhook.error_fetching_gateway', { error: fetchError.message }, false);
            }
        }

        if (!accessToken) {
            await logToSupabase('webhook.error_no_token', { message: 'No active Mercado Pago gateway found' }, false);
            throw new Error('No active Mercado Pago gateway found');
        }

        // 4. Fetch latest status from Mercado Pago API
        console.log(`[Webhook] Fetching status from MP for payment ${paymentId}`);
        const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!mpRes.ok) {
            const errorText = await mpRes.text();
            await logToSupabase('webhook.error_mp_api', { status: mpRes.status, body: errorText }, false);
            throw new Error(`Failed to fetch payment from MP: ${mpRes.statusText}`);
        }

        const paymentData = await mpRes.json();
        const status = paymentData.status; // approved, pending, rejected, etc.
        console.log(`[Webhook] MP Status: ${status}`);

        // 5. Update Payment and Order in Supabase
        // Map MP status to our OrderStatus
        let orderStatus = 'pending';
        if (status === 'approved') orderStatus = 'paid';
        else if (status === 'rejected' || status === 'cancelled') orderStatus = 'failed';
        else if (status === 'in_process' || status === 'pending') orderStatus = 'pending';
        else if (status === 'refunded' || status === 'charged_back') orderStatus = 'refunded';

        // Fetch order details early so we can use it throughout
        let order: any = null;
        if (paymentRecord && supabaseKey) {
            try {
                const orderRes = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${paymentRecord.order_id}&select=*`, {
                    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
                });
                if (orderRes.ok) {
                    const orders = await orderRes.json();
                    order = orders[0];
                }
            } catch (fetchError: any) {
                console.error('[Webhook] Error fetching order:', fetchError);
            }
        }

        if (paymentRecord && supabaseKey) {
            try {
                console.log(`[Webhook] Updating Payment ${paymentRecord.id} and Order ${paymentRecord.order_id}`);
                console.log(`[Webhook] Current status: ${paymentRecord.status}, New status: ${orderStatus}`);

                // IDEMPOTENCY: Check if status actually changed
                // We consider it changed if payment OR order status is different from new status
                const isPaymentsynced = paymentRecord.status === orderStatus;
                const isOrderSynced = order && order.status === orderStatus;
                const statusChanged = !isPaymentsynced || !isOrderSynced;

                console.log(`[Webhook] Sync Check - Payment: ${paymentRecord.status}, Order: ${order?.status}, New: ${orderStatus}`);
                console.log(`[Webhook] Update required: ${statusChanged}`);

                // Update Payment
                await fetch(`${supabaseUrl}/rest/v1/payments?id=eq.${paymentRecord.id}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': `Bearer ${supabaseKey}`,
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify({
                        status: orderStatus,
                        raw_response: JSON.stringify(paymentData)
                    })
                });

                // Update Order
                await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${paymentRecord.order_id}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': `Bearer ${supabaseKey}`,
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify({ status: orderStatus })
                });

                await logToSupabase('webhook.success', {
                    paymentId,
                    oldPaymentStatus: paymentRecord.status,
                    oldOrderStatus: order?.status,
                    newStatus: orderStatus,
                    statusChanged
                }, true, paymentRecord.gateway_id);

                console.log(`[Webhook] Updated Order ${paymentRecord.order_id} to ${orderStatus}`);

                // --- NEW: Dispatch Secure Webhook to Client ---
                // This calls the Edge Function which filters data (Public/Client Scope)
                try {
                    console.log('[Webhook] Dispatching event to Client Webhooks...');

                    // Construct Safe Payload
                    // We only send what is necessary and safe. The Dispatcher will whitelist-filter this again to be double sure.
                    const safePayload = {
                        event: `pagamento.${orderStatus === 'paid' ? 'aprovado' : orderStatus}`, // 'pagamento.aprovado'
                        order_id: paymentRecord.order_id,
                        checkout_id: order?.checkout_id,
                        amount: order?.total || order?.amount,
                        currency: order?.currency || 'BRL',
                        status: orderStatus,
                        payment_method: order?.payment_method || 'unknown',
                        customer: {
                            name: order?.customer_name,
                            email: order?.customer_email,
                            phone: order?.customer_phone,
                            cpf: order?.customer_cpf
                        },
                        items: order?.items,
                        purchased_at: new Date().toISOString()
                    };

                    // Call dispatch-webhook Function
                    // Using fetch to calling the function URL
                    await fetch(`${supabaseUrl}/functions/v1/dispatch-webhook`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${supabaseKey}` // Service Role or Anon Key (Check Permissions)
                        },
                        body: JSON.stringify({
                            event: safePayload.event,
                            scope: 'client', // STRICTLY CLIENT SCOPE
                            owner_id: paymentRecord?.user_id || order?.user_id, // The Merchant ID
                            payload: safePayload
                        })
                    });

                } catch (dispatchError: any) {
                    console.error('[Webhook] Failed to dispatch client webhook:', dispatchError);
                    // Don't fail the whole request, just log
                    await logToSupabase('webhook.dispatch_error', { error: dispatchError.message }, false);
                }
                // ----------------------------------------------

                // Store whether we should send email (only if status changed to paid AND wasn't fully processed before)
                if (order) {
                    // Send email/grant access if:
                    // 1. New status IS 'paid'
                    // 2. AND (Payment wasn't paid OR Order wasn't paid)
                    // This creates a retry mechanism: if order failed to update to 'paid' previously, we try again.
                    // Also checks if user was linked - if not, we need to process fulfillment.
                    const isUserLinked = !!order.customer_user_id;
                    order._shouldSendEmail = orderStatus === 'paid' && (!isPaymentsynced || !isOrderSynced || !isUserLinked);
                }
            } catch (updateError: any) {
                console.error('[Webhook] Error updating records:', updateError);
                await logToSupabase('webhook.error_updating_records', { error: updateError.message }, false);
            }
        } else {
            // If we don't have a payment record, we can't update the order directly.
            // But we should log this as a warning. In a more advanced system, we might want to create the record.
            await logToSupabase('webhook.warning', {
                message: 'Payment record not found, cannot update order',
                paymentId,
                mpStatus: status
            }, false);
        }

        // 6. Fulfill Order (Agnostic Brain)
        // This centralizes user creation, access grants, and SaaS licensing
        if (orderStatus === 'paid' && order && supabaseKey) {

            // A. Send Email (Directly from Webhook for reliability)
            // We run this in parallel or before the Edge Function to ensure delivery
            if (order._shouldSendEmail) {
                await sendOrderEmail(order, supabaseUrl, supabaseKey);
            } else {
                console.log('[Webhook] Skipping email (Duplicate/Idempotency check).');
            }

            try {
                console.log(`[Webhook] Triggering internal fulfillment for Order ${order.id}`);

                // We use the same service role key to call our internal function
                // Note: In Client Install, this function might NOT exist. 
                // We wrap in try/catch and logging implies it's optional for basic email flow now.
                const fulfillRes = await fetch(`${supabaseUrl}/functions/v1/fulfill-order`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${supabaseKey}`
                    },
                    body: JSON.stringify({
                        order_id: order.id,
                        email: order.customer_email,
                        name: order.customer_name
                    })
                });

                if (!fulfillRes.ok) {
                    console.warn(`[Webhook] fulfill-order function might be missing (Client Install?). Status: ${fulfillRes.status}`);
                } else {
                    await logToSupabase('webhook.fulfillment_triggered', {
                        orderId: order.id,
                        email: order.customer_email
                    }, true, paymentRecord?.gateway_id);
                }

            } catch (fulfillError: any) {
                console.error('[Webhook] Failed to trigger fulfillment:', fulfillError);
                await logToSupabase('webhook.fulfillment_trigger_error', { error: fulfillError.message }, false);
            }
        }

        return res.status(200).json({ success: true });


    } catch (error: any) {
        console.error('[Webhook] Critical Error:', error);
        // Try to log the critical error if possible
        try {
            await logToSupabase('webhook.critical_error', { error: error.message }, false);
        } catch (e) { }

        return res.status(500).json({ error: error.message });
    }
}

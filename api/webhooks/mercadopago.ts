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

    try {
        console.log('[Webhook] Received POST request');
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

        // 6. Send Email if Payment is Approved
        // IDEMPOTENCY: Only send if status actually changed to paid
        if (orderStatus === 'paid' && paymentRecord && order && supabaseKey && order._shouldSendEmail) {
            try {
                console.log(`[Webhook] Attempting to send approval email for Order ${paymentRecord.order_id}`);

                if (order && order.customer_email) {
                    const productName = order.items?.[0]?.name || 'seu produto';

                    // Get member area domain from database
                    // Chain: order -> checkout -> product -> content -> member_area -> domain
                    let memberAreaUrl = process.env.VITE_APP_URL || process.env.PUBLIC_URL || 'https://seu-dominio.vercel.app';

                    try {
                        // 1. Get checkout to find product_id
                        const checkoutRes = await fetch(`${supabaseUrl}/rest/v1/checkouts?id=eq.${order.checkout_id}&select=product_id`, {
                            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
                        });

                        if (checkoutRes.ok) {
                            const checkouts = await checkoutRes.json();
                            if (checkouts && checkouts.length > 0) {
                                const productId = checkouts[0].product_id;

                                // 2. Get content linked to this product
                                const pcRes = await fetch(`${supabaseUrl}/rest/v1/product_contents?product_id=eq.${productId}&select=content_id`, {
                                    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
                                });

                                if (pcRes.ok) {
                                    const productContents = await pcRes.json();
                                    if (productContents && productContents.length > 0) {
                                        const contentId = productContents[0].content_id;

                                        // 3. Get member_area_id from content
                                        const contentRes = await fetch(`${supabaseUrl}/rest/v1/contents?id=eq.${contentId}&select=member_area_id`, {
                                            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
                                        });

                                        if (contentRes.ok) {
                                            const contents = await contentRes.json();
                                            if (contents && contents.length > 0) {
                                                const memberAreaId = contents[0].member_area_id;

                                                // 4. Get domain_id from member_area
                                                const maRes = await fetch(`${supabaseUrl}/rest/v1/member_areas?id=eq.${memberAreaId}&select=domain_id`, {
                                                    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
                                                });

                                                if (maRes.ok) {
                                                    const memberAreas = await maRes.json();
                                                    if (memberAreas && memberAreas.length > 0 && memberAreas[0].domain_id) {
                                                        const domainId = memberAreas[0].domain_id;

                                                        // 5. Get actual domain
                                                        const domainRes = await fetch(`${supabaseUrl}/rest/v1/domains?id=eq.${domainId}&select=domain`, {
                                                            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
                                                        });

                                                        if (domainRes.ok) {
                                                            const domains = await domainRes.json();
                                                            if (domains && domains.length > 0) {
                                                                memberAreaUrl = `https://${domains[0].domain}`;
                                                                console.log(`[Webhook] Using custom member area domain: ${memberAreaUrl}`);
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } catch (domainError: any) {
                        console.warn('[Webhook] Could not fetch member area domain, using fallback:', domainError.message);
                    }

                    const loginUrl = `${memberAreaUrl}/login`;

                    // Default password for new users
                    const defaultPassword = '123456';

                    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Acesso Liberado!</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f6f6f6;">
<center style="width: 100%; background-color: #f6f6f6;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px 0; box-shadow: 0 0 10px rgba(0,0,0,0.05);">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
                <td style="padding: 20px; font-family: Arial, sans-serif; background-color: #ffffff; text-align: center;">
                    <p style="font-size: 24px; font-weight: bold; color: #1a1a1a; margin-top: 0; margin-bottom: 20px;">
                        🎉 Olá, ${order.customer_name}!
                    </p>
                    <p style="font-size: 16px; line-height: 1.5; color: #555555; margin-bottom: 20px;">
                        Seu pagamento foi aprovado com sucesso!
                        <br><br>Você já pode acessar a área de membros e começar agora mesmo.
                    </p>
                    
                    <!-- Purchased Items -->
                    <div style="background-color: #f0f9ff; border-left: 4px solid #007bff; padding: 15px; margin: 20px 0; text-align: left;">
                        <p style="font-size: 14px; font-weight: bold; color: #007bff; margin: 0 0 10px 0;">📦 PRODUTOS ADQUIRIDOS:</p>
                        ${order.items && Array.isArray(order.items)
                            ? order.items.map((item: any) => `
                                <p style="font-size: 14px; color: #333; margin: 5px 0;">
                                    ✓ <strong>${item.name}</strong> - R$ ${item.price?.toFixed(2) || '0.00'}
                                </p>
                            `).join('')
                            : `<p style="font-size: 14px; color: #333; margin: 5px 0;">✓ <strong>${productName}</strong></p>`
                        }
                    </div>
                    
                    <!-- Credentials Box -->
                    <div style="background-color: #f8f9fa; border: 2px solid #007bff; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: left;">
                        <p style="font-size: 14px; font-weight: bold; color: #007bff; margin: 0 0 15px 0; text-align: center;">🔐 SEUS DADOS DE ACESSO</p>
                        <p style="font-size: 14px; color: #333; margin: 8px 0;">
                            <strong>Email:</strong> ${order.customer_email}
                        </p>
                        <p style="font-size: 14px; color: #333; margin: 8px 0;">
                            <strong>Senha:</strong> ${defaultPassword}
                        </p>
                        <p style="font-size: 12px; color: #666; margin: 15px 0 0 0; font-style: italic;">
                            💡 Recomendamos alterar sua senha após o primeiro acesso.
                        </p>
                    </div>
                    
                    <div style="margin: 30px auto; display: block;">
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: auto;">
                            <tr>
                                <td style="border-radius: 6px; background: #007bff; text-align: center;">
                                    <a href="${loginUrl}" target="_blank" 
                                       style="background: #007bff; border: 1px solid #007bff; padding: 14px 30px; color: #ffffff; display: inline-block; 
                                              font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; text-decoration: none; border-radius: 6px;">
                                        🚀 ACESSAR ÁREA DE MEMBROS
                                    </a>
                                </td>
                            </tr>
                        </table>
                    </div>
                    
                    <p style="font-size: 13px; line-height: 1.5; color: #777; margin-top: 30px; margin-bottom: 10px;">
                        Precisa de ajuda? Nossa equipe de suporte está à disposição!
                    </p>
                    <p style="font-size: 12px; color: #999; margin: 5px 0;">
                        Atenciosamente,<br>
                        <strong>Equipe Super Checkout</strong>
                    </p>
                </td>
            </tr>
        </table>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
                <td style="padding: 20px; font-family: Arial, sans-serif; font-size: 11px; color: #AAAAAA; text-align: center; border-top: 1px solid #eeeeee; margin-top: 30px;">
                    Este é um e-mail automático transacional e não deve ser respondido.<br>
                    ${productName} - Powered by Super Checkout
                </td>
            </tr>
        </table>
    </div>
</center>
</body>
</html>
                        `;

                    // Call Edge Function to send email
                    const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${supabaseKey}`
                        },
                        body: JSON.stringify({
                            to: order.customer_email,
                            subject: `Pagamento Aprovado - Acesso Liberado!`,
                            html
                        })
                    });

                    if (emailRes.ok) {
                        console.log(`[Webhook] Email sent successfully to ${order.customer_email}`);
                        await logToSupabase('webhook.email_sent', { orderId: order.id, email: order.customer_email }, true, paymentRecord.gateway_id);
                    } else {
                        const errText = await emailRes.text();
                        console.error(`[Webhook] Failed to send email: ${errText}`);
                        await logToSupabase('webhook.error_sending_email', { error: errText }, false);
                    }
                }
            } catch (emailError: any) {
                console.error('[Webhook] Error in email sending flow:', emailError);
                await logToSupabase('webhook.error_email_flow', { error: emailError.message }, false);
            }
        }


        // 7. Ensure User Exists & Grant Access
        // IDEMPOTENCY: Only process if status actually changed to paid
        // If order doesn't have a user_id, we try to find or create one now.
        if (order && !order.customer_user_id && order.customer_email && order._shouldSendEmail) {
            try {
                console.log(`[Webhook] Order ${order.id} has no user_id. Checking if user exists for ${order.customer_email}`);

                // Simplified approach: Try to create user directly.
                // If user already exists, we'll handle it in the error response.

                let userId = null;
                let isNewUser = false;
                let password = null;

                // Use default password for all new users
                const tempPassword = '123456'; // Simple default password

                const createUserRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': `Bearer ${supabaseKey}`
                    },
                    body: JSON.stringify({
                        email: order.customer_email,
                        password: tempPassword,
                        email_confirm: true,
                        user_metadata: {
                            name: order.customer_name
                        }
                    })
                });

                if (createUserRes.ok) {
                    const newUser = await createUserRes.json();
                    userId = newUser.id || newUser.user?.id; // Depends on API version
                    isNewUser = true;
                    password = tempPassword;
                    console.log(`[Webhook] Created new user ${userId}`);
                    await logToSupabase('webhook.user_created', { userId, email: order.customer_email }, true);
                } else {
                    const errorText = await createUserRes.text();
                    console.log(`[Webhook] User creation response: ${createUserRes.status} - ${errorText}`);

                    if (errorText.includes('already registered') || errorText.includes('User already registered')) {
                        console.log('[Webhook] User already exists, looking up ID via Auth API...');

                        // Use Auth Admin API to find user by email
                        const listUsersRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
                            headers: {
                                'apikey': supabaseKey,
                                'Authorization': `Bearer ${supabaseKey}`
                            }
                        });

                        if (listUsersRes.ok) {
                            const { users } = await listUsersRes.json();
                            const existingUser = users?.find((u: any) => u.email === order.customer_email);

                            if (existingUser) {
                                userId = existingUser.id;
                                console.log(`[Webhook] Found existing user ID via Auth API: ${userId}`);
                                await logToSupabase('webhook.user_found_auth', { userId, email: order.customer_email }, true);
                            } else {
                                console.warn('[Webhook] User not found in Auth API users list');
                            }
                        } else {
                            console.error('[Webhook] Failed to list users from Auth API:', await listUsersRes.text());
                        }

                        // Fallback: try profiles table if Auth API didn't work
                        if (!userId) {
                            console.log('[Webhook] Fallback: trying profiles table...');
                            const profileRes = await fetch(`${supabaseUrl}/rest/v1/profiles?email=eq.${order.customer_email}&select=id`, {
                                headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
                            });

                            if (profileRes.ok) {
                                const profiles = await profileRes.json();
                                if (profiles && profiles.length > 0) {
                                    userId = profiles[0].id;
                                    console.log(`[Webhook] Found existing user ID via profiles: ${userId}`);
                                    await logToSupabase('webhook.user_found_profiles', { userId, email: order.customer_email }, true);
                                } else {
                                    console.error('[Webhook] User exists in Auth but not found in Profiles table.');
                                    await logToSupabase('webhook.error_user_not_in_profiles', { email: order.customer_email }, false);
                                }
                            } else {
                                console.error('[Webhook] Failed to query profiles table:', await profileRes.text());
                            }
                        }
                    } else {
                        // Other error - log it but don't crash the webhook
                        console.error('[Webhook] Failed to create user:', errorText);
                        await logToSupabase('webhook.error_user_creation_failed', { error: errorText, email: order.customer_email }, false);
                    }
                }

                if (userId) {
                    // Update Order with new User ID
                    await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${order.id}`, {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            'apikey': supabaseKey,
                            'Authorization': `Bearer ${supabaseKey}`,
                            'Prefer': 'return=minimal'
                        },
                        body: JSON.stringify({ customer_user_id: userId })
                    });

                    // Update local order object for next steps
                    order.customer_user_id = userId;

                    // Note: Welcome email with password is now included in the approval email above
                    // No need to send a separate welcome email
                }

            } catch (err: any) {
                console.error('[Webhook] Error ensuring user exists:', err);
                await logToSupabase('webhook.error_user_creation', { error: err.message }, false);
            }
        }

        // 8. Grant Access (using updated order.customer_user_id)
        // IDEMPOTENCY: Only grant access if status actually changed to paid
        if (order && order.customer_user_id && order._shouldSendEmail) {
            try {
                console.log(`[Webhook] Granting access for Order ${order.id} to User ${order.customer_user_id}`);

                // Get all product IDs from order items
                const productsToGrant: string[] = [];

                if (order.items && Array.isArray(order.items)) {
                    for (const item of order.items) {
                        if ((item as any).product_id) {
                            productsToGrant.push((item as any).product_id);
                        }
                    }
                }

                // Fallback: if no product_ids in items, use checkout product_id (backwards compatibility)
                if (productsToGrant.length === 0) {
                    console.log('[Webhook] No product_ids in order items, falling back to checkout.product_id');
                    const checkoutRes = await fetch(`${supabaseUrl}/rest/v1/checkouts?id=eq.${order.checkout_id}&select=product_id`, {
                        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
                    });

                    if (checkoutRes.ok) {
                        const checkouts = await checkoutRes.json();
                        if (checkouts[0]?.product_id) {
                            productsToGrant.push(checkouts[0].product_id);
                        }
                    }
                }

                console.log(`[Webhook] Processing ${productsToGrant.length} product(s): ${productsToGrant.join(', ')}`);

                // Grant access for each product
                for (const productId of productsToGrant) {
                    // Get contents linked to this product
                    const pcRes = await fetch(`${supabaseUrl}/rest/v1/product_contents?product_id=eq.${productId}&select=content_id`, {
                        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
                    });

                    if (pcRes.ok) {
                        const productContents = await pcRes.json();
                        console.log(`[Webhook] Product ${productId} has ${productContents.length} content(s)`);

                        for (const pc of productContents) {
                            // Create access grant
                            const grantRes = await fetch(`${supabaseUrl}/rest/v1/access_grants`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'apikey': supabaseKey,
                                    'Authorization': `Bearer ${supabaseKey}`,
                                    'Prefer': 'return=minimal'
                                },
                                body: JSON.stringify({
                                    user_id: order.customer_user_id,
                                    content_id: pc.content_id,
                                    product_id: productId,
                                    status: 'active',
                                    granted_at: new Date().toISOString()
                                })
                            });

                            if (!grantRes.ok) {
                                const errorText = await grantRes.text();
                                console.error(`[Webhook] Failed to create grant for product ${productId}, content ${pc.content_id}:`, errorText);
                            } else {
                                console.log(`[Webhook] ✓ Access granted for product ${productId}, content ${pc.content_id}`);
                            }
                        }
                    } else {
                        console.warn(`[Webhook] Failed to fetch product_contents for product ${productId}`);
                    }
                }

                await logToSupabase('webhook.access_granted', {
                    orderId: order.id,
                    userId: order.customer_user_id,
                    productsCount: productsToGrant.length,
                    productIds: productsToGrant
                }, true, paymentRecord.gateway_id);

            } catch (grantError: any) {
                console.error('[Webhook] Error granting access:', grantError);
                await logToSupabase('webhook.error_granting_access', { error: grantError.message }, false);
            }
        } else {
            console.warn('[Webhook] No customer_user_id in order, skipping access grant');
            await logToSupabase('webhook.warning_no_user_id', { orderId: paymentRecord.order_id }, false);
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

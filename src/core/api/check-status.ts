import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { resolveLocalSupabaseServerClient } from './_supabase-server.js';
import { decrypt, verifySignature } from '../utils/cryptoUtils.js';
import { applyCors } from './_cors.js';
import { fulfillOrder } from '../services/fulfillment.js';
import { sendOrderAccessEmail } from '../services/orderEmail.js';
import { enforceApiRateLimit } from './_rate-limit.js';

// Define types locally since we are in a serverless function structure that might not share types easily with frontend
interface Order {
    id: string;
    status: string;
    payment_method: string;
    checkout_id: string;
    user_id?: string;
    payment_id?: string;
    amount?: number;
    customer_email: string;
    customer_name: string;
    customer_user_id?: string;
    items?: any[];
    metadata?: any;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function maskIdentifier(value?: string | null): string {
    const text = String(value || '');
    if (!text) return 'unknown';
    if (text.length <= 12) return `${text.slice(0, 4)}...`;
    return `${text.slice(0, 8)}...${text.slice(-4)}`;
}

function safeString(value: unknown, maxLength = 160) {
    if (value === null || value === undefined) return null;
    return String(value).slice(0, maxLength);
}

function buildSafeMercadoPagoRawResponse(mpData: any) {
    return JSON.stringify({
        redacted: true,
        provider: 'mercadopago',
        id: safeString(mpData?.id),
        status: safeString(mpData?.status),
        external_reference: safeString(mpData?.external_reference),
        captured_at: new Date().toISOString(),
    });
}

function buildSafeStripeRawResponse(stripeData: any) {
    return JSON.stringify({
        redacted: true,
        provider: 'stripe',
        id: safeString(stripeData?.id),
        status: safeString(stripeData?.status),
        amount: typeof stripeData?.amount === 'number' ? stripeData.amount : undefined,
        currency: safeString(stripeData?.currency),
        payment_method: safeString(stripeData?.payment_method),
        captured_at: new Date().toISOString(),
    });
}

function buildOrderUpdateUrl(supabaseUrl: string, safeOrderId: string, checkoutId?: string | null) {
    const filters = [`id=eq.${safeOrderId}`];
    const normalizedCheckoutId = String(checkoutId || '').trim();
    if (normalizedCheckoutId) {
        filters.push(`checkout_id=eq.${encodeURIComponent(normalizedCheckoutId)}`);
    }
    return `${supabaseUrl}/rest/v1/orders?${filters.join('&')}`;
}

function resolveMerchantUserId(input: {
    productUserId?: string | null;
    checkoutUserId?: string | null;
    paymentUserId?: string | null;
    orderUserId?: string | null;
}) {
    return String(
        input.productUserId
        || input.checkoutUserId
        || input.paymentUserId
        || input.orderUserId
        || '',
    ).trim();
}

async function processPaidSideEffects(params: {
    supabaseAdmin?: any;
    supabaseUrl: string;
    serviceRoleKey?: string;
    orderId: string;
    knownOrder?: Order;
    origin?: string;
}) {
    const { supabaseUrl, serviceRoleKey, orderId, knownOrder, origin } = params;
    if (!params.supabaseAdmin && !serviceRoleKey) {
        console.warn(`[CheckStatus] Missing service role key; cannot run paid side effects for ${orderId}.`);
        return;
    }

    try {
        const supabaseAdmin = params.supabaseAdmin || createClient(supabaseUrl, serviceRoleKey!, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });
        const order = knownOrder?.customer_email
            ? knownOrder
            : (await supabaseAdmin
                .from('orders')
                .select('id,status,customer_email,customer_name,customer_user_id,items,metadata')
                .eq('id', orderId)
                .single()).data;

        const metadata = order?.metadata && typeof order.metadata === 'object' ? order.metadata : {};
        const needsFulfillment = !metadata.fulfilled_at;

        if (!needsFulfillment) return;

        if (needsFulfillment) {
            await fulfillOrder(supabaseAdmin, {
                orderId,
                email: order?.customer_email,
                name: order?.customer_name,
            });
        }

        if (order?.customer_email) {
            await sendOrderAccessEmail(supabaseAdmin, {
                orderId,
                origin: origin || 'https://app.supercheckout.app',
                email: order.customer_email,
                name: order.customer_name,
            });
        }
    } catch (error: any) {
        console.error(`[CheckStatus] Paid side effects failed for ${orderId}:`, error?.message || error);
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    applyCors(req, res, 'GET,OPTIONS');

    // Prevent Caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { orderId, sig } = req.query;

    if (!orderId || typeof orderId !== 'string') {
        return res.status(400).json({ error: 'Missing orderId' });
    }

    if (!UUID_REGEX.test(orderId)) {
        return res.status(200).json({ status: 'pending' });
    }

    const rateLimit = enforceApiRateLimit(req, res, {
        scope: 'check_status',
        identifiers: [orderId],
        limit: 3000,
        windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
        return res.status(200).json({ status: 'pending' });
    }

    // 🔥 2. HMAC Auth (Fase 11F)
    // Public polling needs the order-scoped HMAC before any DB read or mutation.
    let hasValidSignature = false;
    try {
        hasValidSignature = verifySignature(orderId, sig as string);
    } catch (error: any) {
        console.error('[CheckStatus] Signature verification failed:', error?.message || error);
    }
    if (!hasValidSignature) {
        console.warn(`[CheckStatus] Invalid or missing signature for order ${maskIdentifier(orderId)}.`);
        return res.status(200).json({ status: 'pending' });
    }

    // Fix: Check for NEXT_PUBLIC_ env vars (Vercel standard) or VITE_ (Local)
    const supabaseUrl =
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        process.env.VITE_SUPABASE_URL ||
        'https://vixlzrmhqsbzjhpgfwdn.supabase.co';
    
    // Status healing mutates orders/payments, so this endpoint must use service role.
    const serviceRoleKey =
        process.env.SUPABASE_SECRET_KEY_NEW ||
        process.env.SUPABASE_SECRET_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY_NEW ||
        process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseKey = serviceRoleKey;

    if (!supabaseKey) {
        console.error('[CheckStatus] Missing service role key.');
        return res.status(200).json({ status: 'pending' });
    }

    const safeOrderId = encodeURIComponent(orderId);
    const requestOrigin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host || 'app.supercheckout.app'}`;
    console.log(`[CheckStatus] Checking order: ${maskIdentifier(orderId)}`);

    try {
        const { supabase: supabaseAdmin } = await resolveLocalSupabaseServerClient();
        if (!supabaseAdmin) {
            throw new Error('Failed to initialize Supabase server client.');
        }

        const { data: order, error: orderError } = await supabaseAdmin
            .from('orders')
            .select('id,status,payment_method,checkout_id,user_id,payment_id,amount,customer_email,customer_name,customer_user_id,items,metadata')
            .eq('id', orderId)
            .maybeSingle();

        if (orderError) throw orderError;
        if (!order?.id) {
            console.warn(`[CheckStatus] Signed status lookup found no order: ${maskIdentifier(orderId)}.`);
            return res.status(200).json({ status: 'pending' });
        }

        const status = (order.status || '').toLowerCase();
        if (status === 'paid' || status === 'approved') {
            await processPaidSideEffects({
                supabaseAdmin,
                supabaseUrl,
                serviceRoleKey,
                orderId: orderId as string,
                knownOrder: order,
                origin: requestOrigin,
            });
            return res.status(200).json({ status: 'paid' });
        }

        const { data: payments, error: paymentError } = await supabaseAdmin
            .from('payments')
            .select('id,gateway_id,order_id,status,transaction_id,raw_response,created_at,user_id')
            .eq('order_id', orderId)
            .order('created_at', { ascending: false });
        if (paymentError) throw paymentError;

        let payment = payments && payments.length > 0
            ? payments[0]
            : null;

        const persistedPaymentStatus = String(payment?.status || '').toLowerCase();
        const rawPaymentStatus = (() => {
            try {
                const raw = typeof payment?.raw_response === 'string'
                    ? JSON.parse(payment.raw_response)
                    : payment?.raw_response;
                return String(raw?.status || '').toLowerCase();
            } catch {
                return '';
            }
        })();

        if (
            persistedPaymentStatus === 'paid' ||
            persistedPaymentStatus === 'approved' ||
            rawPaymentStatus === 'approved' ||
            rawPaymentStatus === 'authorized'
        ) {
            if (status !== 'paid' && status !== 'approved') {
                const { error: paidOrderUpdateError } = await supabaseAdmin
                    .from('orders')
                    .update({ status: 'paid' })
                    .eq('id', orderId)
                    .eq('checkout_id', order.checkout_id);
                if (paidOrderUpdateError) throw paidOrderUpdateError;
            }
            await processPaidSideEffects({
                supabaseAdmin,
                supabaseUrl,
                serviceRoleKey,
                orderId: orderId as string,
                knownOrder: { ...order, status: 'paid' },
                origin: requestOrigin,
            });
            return res.status(200).json({ status: 'paid' });
        }

        // 3. Fetch Gateway Credentials
        // If payment exists, use its gateway_id. If not, use the order's checkout_id to find the gateway.
        let gatewayId = payment?.gateway_id;
        let checkout: any = null;
    
        if (order.checkout_id) {
            const { data: checkoutData, error: checkoutError } = await supabaseAdmin
                .from('checkouts')
                .select('id,user_id,gateway_id,backup_gateway_id,product_id')
                .eq('id', order.checkout_id)
                .maybeSingle();
            if (checkoutError) throw checkoutError;
            checkout = checkoutData || null;
            if (!gatewayId && checkout) gatewayId = checkout.gateway_id;
        }

        if (!gatewayId) return res.status(200).json({ status: order.status || 'pending' });
        if (!checkout) return res.status(200).json({ status: order.status || 'pending' });

        const allowedGatewayIds = [checkout.gateway_id, checkout.backup_gateway_id].filter(Boolean).map(String);
        if (!allowedGatewayIds.includes(String(gatewayId))) {
            console.warn('[CheckStatus] Gateway is not attached to checkout.');
            return res.status(200).json({ status: order.status || 'pending' });
        }

        let productOwnerId = '';
        if (checkout?.product_id) {
            const { data: product, error: productError } = await supabaseAdmin
                .from('products')
                .select('user_id')
                .eq('id', String(checkout.product_id))
                .maybeSingle();
            if (productError) throw productError;
            productOwnerId = String(product?.user_id || '').trim();
        }

    const merchantUserId = resolveMerchantUserId({
        productUserId: productOwnerId,
        checkoutUserId: checkout?.user_id,
        paymentUserId: payment?.user_id,
        orderUserId: (order as any).user_id,
    });
    if (!merchantUserId) {
        console.warn('[CheckStatus] Could not resolve merchant owner for order.');
        return res.status(200).json({ status: order.status || 'pending' });
    }

        const { data: gateway, error: gatewayError } = await supabaseAdmin
            .from('gateways')
            .select('id,user_id,name,private_key')
            .eq('id', String(gatewayId))
            .eq('user_id', merchantUserId)
            .maybeSingle();
        if (gatewayError) throw gatewayError;
        if (!gateway) {
            return res.status(200).json({ status: order.status });
        }
    // Normalize and check gateway name
    const gatewayName = (gateway.name || '').toLowerCase().replace(/[\s_]/g, '');
    if (gatewayName === 'stripe') {
        const secretKey = decrypt(gateway.private_key || '').replace(/\s/g, '');
        const paymentIntentId = payment?.transaction_id || (order as any).payment_id;

        if (!secretKey || !paymentIntentId || !String(paymentIntentId).startsWith('pi_')) {
            return res.status(200).json({ status: order.status || 'pending' });
        }

        const stripeRes = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(String(paymentIntentId))}`, {
            headers: {
                'Authorization': `Bearer ${secretKey}`
            }
        });

        if (!stripeRes.ok) {
            console.error('[CheckStatus] Stripe status polling failed:', { status: stripeRes.status, paymentIntentId: maskIdentifier(String(paymentIntentId)) });
            return res.status(200).json({ status: order.status || 'pending' });
        }

        const stripeData = await stripeRes.json();
        const stripeStatus = String(stripeData?.status || '').toLowerCase();

        let newStatus = 'pending';
        if (stripeStatus === 'succeeded') newStatus = 'paid';
        else if (stripeStatus === 'processing') newStatus = 'pending';
        else if (stripeStatus === 'canceled' || stripeStatus === 'requires_payment_method') newStatus = 'failed';
        else if (stripeStatus === 'requires_action' || stripeStatus === 'requires_confirmation') newStatus = 'pending';

        const currentStatusNorm = (order.status || 'pending').toLowerCase();

        if (newStatus !== currentStatusNorm) {
            console.log(`[CheckStatus] Updating Stripe Order ${maskIdentifier(orderId)}: ${currentStatusNorm} -> ${newStatus}`);
            const { error: stripeOrderUpdateError } = await supabaseAdmin
                .from('orders')
                .update({ status: newStatus })
                .eq('id', orderId)
                .eq('checkout_id', order.checkout_id);
            if (stripeOrderUpdateError) throw stripeOrderUpdateError;
        }

        if (payment?.id) {
            const { error: stripePaymentUpdateError } = await supabaseAdmin
                .from('payments')
                .update({
                    status: newStatus,
                    raw_response: buildSafeStripeRawResponse(stripeData),
                })
                .eq('id', String(payment.id));
            if (stripePaymentUpdateError) throw stripePaymentUpdateError;
        }

        if (newStatus === 'paid') {
            await processPaidSideEffects({
                supabaseAdmin,
                supabaseUrl,
                serviceRoleKey,
                orderId: orderId as string,
                knownOrder: { ...order, status: 'paid' },
                origin: requestOrigin,
            });
        }

        return res.status(200).json({ status: newStatus });
    }

    if (gatewayName !== 'mercadopago') {
        return res.status(200).json({ status: order.status });
    }

    const accessToken = decrypt(gateway.private_key || '').replace(/\s/g, '');
    if (!accessToken || accessToken.startsWith('iv:')) {
        console.error('[CheckStatus] Mercado Pago private key could not be decrypted for status polling.');
        return res.status(200).json({ status: order.status || 'pending' });
    }

    // 4. Check Status with Mercado Pago
    let mpData: any = null;
    const effectiveTxId = payment?.transaction_id || (order as any).payment_id;

    if (effectiveTxId) {
        // Method A: Direct ID lookup (Fastest) with Delay Tolerance Loop
        console.log(`[CheckStatus] Checking MP for TX: ${maskIdentifier(String(effectiveTxId))}`);
        
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
            const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${effectiveTxId}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            
            if (mpRes.ok) {
                mpData = await mpRes.json();
                break;
            } else if (mpRes.status === 404) {
                console.log(`[CheckStatus] MP 404 (Replication Delay). Retrying... (${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, 600)); // 600ms delay
                retryCount++;
            } else {
                // Outro erro (ex: 401), aborta para evitar spam
                console.log(`[CheckStatus] MP Erro na consulta TX: Status ${mpRes.status}`);
                break;
            }
        }
    }

    // Method B: Search by external_reference (Self-Healing Fallback)
    if (!mpData || mpData.status === 404 || mpData.status === '404' || mpData.error) {
        console.log(`[CheckStatus] Payment not found by ID or missing locally. Searching by external_reference: ${maskIdentifier(orderId)}`);
        const searchRes = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${safeOrderId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (searchRes.ok) {
            const searchData = await searchRes.json();
            if (searchData.results && searchData.results.length > 0) {
                // Get most recent approved payment or just the first one
                mpData = searchData.results.sort((a: any, b: any) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime())[0];
                const mpStatus = mpData.status;
                console.log(`[CheckStatus] MP Search Result for ${maskIdentifier(orderId)}: ${mpStatus}`);

                if (['approved', 'authorized'].includes(mpStatus?.toLowerCase())) {
                    let newStatus = 'paid';
                    
                    // Update Transaction ID if we found it through search
                    const foundTxId = mpData.id?.toString();
                    
                    console.log(`[CheckStatus] Healing orphan payment. Found TX: ${maskIdentifier(foundTxId)}`);
                    
                    const { error: mpOrderHealError } = await supabaseAdmin
                        .from('orders')
                        .update({ status: 'paid' })
                        .eq('id', orderId)
                        .eq('checkout_id', order.checkout_id);

                    if (!mpOrderHealError) {
                        console.log(`[CheckStatus] Order ${maskIdentifier(orderId)} successfully updated to PAID via self-healing`);
                        
                        // Also update/create payment record to avoid repeating this search
                        if (foundTxId) {
                            if (payment?.id) {
                                const { error: paymentHealUpdateError } = await supabaseAdmin
                                    .from('payments')
                                    .update({ status: 'paid', transaction_id: foundTxId })
                                    .eq('id', String(payment.id));
                                if (paymentHealUpdateError) throw paymentHealUpdateError;
                            } else {
                                const { error: paymentHealInsertError } = await supabaseAdmin
                                    .from('payments')
                                    .insert({
                                        id: crypto.randomUUID(),
                                        order_id: orderId,
                                        gateway_id: gatewayId,
                                        status: 'paid',
                                        transaction_id: foundTxId,
                                        raw_response: buildSafeMercadoPagoRawResponse(mpData),
                                        user_id: merchantUserId || payment?.user_id || (order as any).user_id,
                                        created_at: new Date().toISOString(),
                                    });
                                if (paymentHealInsertError) throw paymentHealInsertError;
                            }
                        }
                    } else {
                        console.error(`[CheckStatus] FAILED to update order ${maskIdentifier(orderId)}:`, mpOrderHealError.message);
                    }
                }
            }
        }
    }

    if (!mpData) {
        return res.status(200).json({ status: order.status || 'pending' });
    }

    if (mpData.external_reference && String(mpData.external_reference) !== String(orderId)) {
        console.warn('[CheckStatus] MP external_reference does not match order.');
        return res.status(200).json({ status: order.status || 'pending' });
    }

    const mpStatus = mpData.status; // approved, pending, etc.

    // Map MP status to our types
    let newStatus = 'pending';
    if (mpStatus === 'approved') newStatus = 'paid';
    else if (mpStatus === 'rejected' || mpStatus === 'cancelled') newStatus = 'failed';
    else if (mpStatus === 'in_process' || mpStatus === 'pending') newStatus = 'pending';
    else if (mpStatus === 'refunded') newStatus = 'refunded';

    // 5. Update if changed
    const currentStatusNorm = (order.status || 'pending').toLowerCase();

    if (newStatus !== currentStatusNorm) {
        console.log(`[CheckStatus] Updating Order ${maskIdentifier(orderId)}: ${currentStatusNorm} -> ${newStatus}`);

        const { error: mpOrderUpdateError } = await supabaseAdmin
            .from('orders')
            .update({ status: newStatus })
            .eq('id', orderId)
            .eq('checkout_id', order.checkout_id);
        if (mpOrderUpdateError) throw mpOrderUpdateError;

        // Update or Create Payment record
        if (payment?.id) {
            const { error: mpPaymentUpdateError } = await supabaseAdmin
                .from('payments')
                .update({
                    status: newStatus,
                    raw_response: buildSafeMercadoPagoRawResponse(mpData),
                })
                .eq('id', String(payment.id))
                .eq('order_id', orderId);
            if (mpPaymentUpdateError) throw mpPaymentUpdateError;
        } else {
            console.log(`[CheckStatus] Self-Healing: Creating missing payment record for Order ${maskIdentifier(orderId)}`);
            const { error: mpPaymentInsertError } = await supabaseAdmin
                .from('payments')
                .insert({
                    id: crypto.randomUUID(),
                    order_id: orderId,
                    gateway_id: gatewayId,
                    status: newStatus,
                    transaction_id: mpData.id.toString(),
                    raw_response: buildSafeMercadoPagoRawResponse(mpData),
                    user_id: merchantUserId || payment?.user_id || (order as any).user_id,
                    created_at: new Date().toISOString(),
                });
            if (mpPaymentInsertError) throw mpPaymentInsertError;
        }

        // Run Vercel side effects directly. This endpoint already verified the
        // Mercado Pago payment with gateway credentials, while webhook replay
        // from here would fail MP signature validation.
        if (newStatus === 'paid' && currentStatusNorm === 'pending') {
            console.log(`[CheckStatus] Status changed to paid, running Vercel side effects for ${maskIdentifier(orderId)}`);
            await processPaidSideEffects({
                supabaseAdmin,
                supabaseUrl,
                serviceRoleKey,
                orderId: orderId as string,
                knownOrder: { ...order, status: 'paid' },
                origin: requestOrigin,
            });
        }

        return res.status(200).json({ status: newStatus });
    }

    return res.status(200).json({ status: currentStatusNorm });


    } catch (error: any) {
        console.error('Check Status Error:', error);
        // Do not fail the request to the client, just return pending so they keep polling
        return res.status(200).json({ status: 'pending' });
    }
}

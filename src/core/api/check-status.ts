import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
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
    supabaseUrl: string;
    serviceRoleKey?: string;
    orderId: string;
    knownOrder?: Order;
    origin?: string;
}) {
    const { supabaseUrl, serviceRoleKey, orderId, knownOrder, origin } = params;
    if (!serviceRoleKey) {
        console.warn(`[CheckStatus] Missing service role key; cannot run paid side effects for ${orderId}.`);
        return;
    }

    try {
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
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
    const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseKey = serviceRoleKey;

    if (!supabaseKey) {
        console.error('[CheckStatus] Missing service role key.');
        return res.status(200).json({ status: 'pending' });
    }

    const safeOrderId = encodeURIComponent(orderId);
    const requestOrigin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host || 'app.supercheckout.app'}`;
    console.log(`[CheckStatus] Checking order: ${maskIdentifier(orderId)}`);

    try {
        // 1. Fetch Order with standardized headers
        const headers = { 
            'apikey': supabaseKey as string, 
            'Authorization': `Bearer ${supabaseKey}` 
        };

    const orderSelect = [
        'id',
        'status',
        'payment_method',
        'checkout_id',
        'user_id',
        'payment_id',
        'amount',
        'customer_email',
        'customer_name',
        'customer_user_id',
        'items',
        'metadata'
    ].join(',');
    const orderRes = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${safeOrderId}&select=${orderSelect}`, {
        headers
    });

    if (!orderRes.ok) throw new Error('Failed to fetch order');

    const orders = await orderRes.json();
    if (!orders || orders.length === 0) {
        console.warn(`[CheckStatus] Signed status lookup found no order: ${maskIdentifier(orderId)}.`);
        return res.status(200).json({ status: 'pending' });
    }

    const order: Order = orders[0];
    const orderUpdateUrl = buildOrderUpdateUrl(supabaseUrl, safeOrderId, order.checkout_id);

    // If already paid, return immediately (Case-insensitive check)
    const status = (order.status || '').toLowerCase();
    if (status === 'paid' || status === 'approved') {
        await processPaidSideEffects({
            supabaseUrl,
            serviceRoleKey,
            orderId: orderId as string,
            knownOrder: order,
            origin: requestOrigin,
        });
        return res.status(200).json({ status: 'paid' });
    }

    // 2. Fetch Payment Record
    const paymentSelect = 'id,gateway_id,order_id,status,transaction_id,raw_response,created_at,user_id';
    const paymentRes = await fetch(`${supabaseUrl}/rest/v1/payments?order_id=eq.${safeOrderId}&select=${paymentSelect}`, {
        headers
    });

    let payments = await paymentRes.json();
    let payment = payments && payments.length > 0 
        ? payments.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
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
            await fetch(orderUpdateUrl, {
                method: 'PATCH',
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({ status: 'paid' })
            });
        }
        await processPaidSideEffects({
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
        const checkoutRes = await fetch(`${supabaseUrl}/rest/v1/checkouts?id=eq.${encodeURIComponent(order.checkout_id)}&select=id,user_id,gateway_id,backup_gateway_id,product_id`, {
            headers
        });
        const checkouts = await checkoutRes.json();
        checkout = checkouts?.[0] || null;
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
        const productRes = await fetch(`${supabaseUrl}/rest/v1/products?id=eq.${encodeURIComponent(String(checkout.product_id))}&select=user_id&limit=1`, {
            headers,
        });
        const products = await productRes.json().catch(() => []);
        productOwnerId = String(products?.[0]?.user_id || '').trim();
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

    const gatewayRes = await fetch(`${supabaseUrl}/rest/v1/gateways?id=eq.${encodeURIComponent(String(gatewayId))}&user_id=eq.${encodeURIComponent(merchantUserId)}&select=id,user_id,name,private_key`, {
        headers
    });
    const gateways = await gatewayRes.json();

    if (!gateways || gateways.length === 0) {
        return res.status(200).json({ status: order.status });
    }

    const gateway = gateways[0];
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
            await fetch(orderUpdateUrl, {
                method: 'PATCH',
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({ status: newStatus })
            });
        }

        if (payment?.id) {
            await fetch(`${supabaseUrl}/rest/v1/payments?id=eq.${encodeURIComponent(String(payment.id))}`, {
                method: 'PATCH',
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                    status: newStatus,
                    raw_response: buildSafeStripeRawResponse(stripeData),
                })
            });
        }

        if (newStatus === 'paid') {
            await processPaidSideEffects({
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
                    
                    // Persist change to Supabase immediately using Service Role
                    const updateRes = await fetch(orderUpdateUrl, {
                        method: 'PATCH',
                        headers: {
                            ...headers,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=minimal'
                        },
                        body: JSON.stringify({ status: 'paid' })
                    });

                    if (updateRes.ok) {
                        console.log(`[CheckStatus] Order ${maskIdentifier(orderId)} successfully updated to PAID via self-healing`);
                        
                        // Also update/create payment record to avoid repeating this search
                        if (foundTxId) {
                            await fetch(`${supabaseUrl}/rest/v1/payments?order_id=eq.${safeOrderId}`, {
                                method: 'PATCH',
                                headers: { ...headers, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ status: 'paid', transaction_id: foundTxId })
                            });
                        }
                    } else {
                        const errText = await updateRes.text();
                        console.error(`[CheckStatus] FAILED to update order ${maskIdentifier(orderId)}:`, errText);
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

        // Update Order
        await fetch(orderUpdateUrl, {
            method: 'PATCH',
            headers: {
                ...headers,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ status: newStatus })
        });

        // Update or Create Payment record
        if (payment?.id) {
            await fetch(`${supabaseUrl}/rest/v1/payments?id=eq.${encodeURIComponent(String(payment.id))}&order_id=eq.${safeOrderId}`, {
                method: 'PATCH',
                headers: {
                        ...headers,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify({
                        status: newStatus,
                        raw_response: buildSafeMercadoPagoRawResponse(mpData)
                    })
                });
            } else {
                // Self-Healing: Create missing payment record
                console.log(`[CheckStatus] Self-Healing: Creating missing payment record for Order ${maskIdentifier(orderId)}`);
                await fetch(`${supabaseUrl}/rest/v1/payments`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': `Bearer ${supabaseKey}`,
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify({
                        order_id: orderId,
                        gateway_id: gatewayId,
                        status: newStatus,
                        transaction_id: mpData.id.toString(),
                        raw_response: buildSafeMercadoPagoRawResponse(mpData),
                        user_id: merchantUserId || payment?.user_id || (order as any).user_id
                    })
                });
            }

            // Run Vercel side effects directly. This endpoint already verified the
            // Mercado Pago payment with gateway credentials, while webhook replay
            // from here would fail MP signature validation.
            if (newStatus === 'paid' && currentStatusNorm === 'pending') {
                console.log(`[CheckStatus] Status changed to paid, running Vercel side effects for ${maskIdentifier(orderId)}`);
                await processPaidSideEffects({
                    supabaseUrl,
                    serviceRoleKey,
                    orderId: orderId as string,
                    knownOrder: { ...order, status: 'paid' },
                    origin: requestOrigin,
                });
            }
        }

        return res.status(200).json({ status: newStatus });


    } catch (error: any) {
        console.error('Check Status Error:', error);
        // Do not fail the request to the client, just return pending so they keep polling
        return res.status(200).json({ status: 'pending' });
    }
}

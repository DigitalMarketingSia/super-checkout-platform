import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifySignature } from '../utils/cryptoUtils.js';

// Define types locally since we are in a serverless function structure that might not share types easily with frontend
interface Order {
    id: string;
    status: string;
    payment_method: string;
    checkout_id: string;
    customer_email: string;
    customer_name: string;
    customer_user_id?: string;
    items?: any[];
}

const ALLOWED_ORIGINS = [
    process.env.APP_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.NEXT_PUBLIC_APP_URL,
    'http://localhost:3000',
    'http://localhost:5173'
].filter(Boolean);

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // 1. CORS Whitelist (Fase 11F)
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        // Fallback for non-browser or matched origins
        res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0] || '*');
    }
    
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

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

    const { orderId, transactionId, sig } = req.query;

    if (!orderId) {
        return res.status(400).json({ error: 'Missing orderId' });
    }

    // 🔥 2. HMAC Auth (Fase 11F)
    // Para o checkout público, aceitamos leitura do status já persistido mesmo sem assinatura válida.
    // A assinatura continua obrigatória apenas para consultar o gateway e disparar side effects.
    const hasValidSignature = verifySignature(orderId as string, sig as string);
    if (!hasValidSignature) {
        console.warn(`[CheckStatus] Invalid or missing signature for order ${orderId}. Falling back to persisted status only.`);
    }

    // Fix: Check for NEXT_PUBLIC_ env vars (Vercel standard) or VITE_ (Local)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vixlzrmhqsbzjhpgfwdn.supabase.co';
    
    // 🔥 CRITICAL: Use SERVICE_ROLE_KEY for backend operations to bypass RLS
    // Fallback to Anon only for read-only identification if needed, but PATCH REQUIRES Service Role
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    console.log(`[CheckStatus] Checking order: ${orderId} (Key Length: ${supabaseKey?.length || 0})`);

    try {
        // 1. Fetch Order with standardized headers
        const headers = { 
            'apikey': supabaseKey as string, 
            'Authorization': `Bearer ${supabaseKey}` 
        };

    const orderRes = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${orderId}&select=*`, {
        headers
    });

    if (!orderRes.ok) throw new Error('Failed to fetch order');

    const orders = await orderRes.json();
    if (!orders || orders.length === 0) {
        return res.status(404).json({ error: 'Order not found' });
    }

    const order: Order = orders[0];

    // If already paid, return immediately (Case-insensitive check)
    const status = (order.status || '').toLowerCase();
    if (status === 'paid' || status === 'approved') {
        return res.status(200).json({ status: 'paid' });
    }

    // Without a valid signature, we only expose the already persisted coarse status.
    // This is enough for the PIX page to unlock redirect after the webhook updates the order,
    // but avoids hitting the gateway or mutating anything from an unsigned request.
    if (!hasValidSignature) {
        return res.status(200).json({ status: status || 'pending' });
    }

    // 2. Fetch Payment Record
    const paymentRes = await fetch(`${supabaseUrl}/rest/v1/payments?order_id=eq.${orderId}&select=*`, {
        headers
    });

    let payments = await paymentRes.json();
    let payment = payments && payments.length > 0 
        ? payments.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
        : null;

    // 3. Fetch Gateway Credentials
    // If payment exists, use its gateway_id. If not, use the order's checkout_id to find the gateway.
    let gatewayId = payment?.gateway_id;
    
    if (!gatewayId && order.checkout_id) {
        const checkoutRes = await fetch(`${supabaseUrl}/rest/v1/checkouts?id=eq.${order.checkout_id}&select=gateway_id`, {
            headers
        });
        const checkouts = await checkoutRes.json();
        if (checkouts && checkouts.length > 0) gatewayId = checkouts[0].gateway_id;
    }

    if (!gatewayId) return res.status(200).json({ status: order.status || 'pending' });

    const gatewayRes = await fetch(`${supabaseUrl}/rest/v1/gateways?id=eq.${gatewayId}&select=*`, {
        headers
    });
    let gateways = await gatewayRes.json();

    if (!gateways || gateways.length === 0) {
        // Last resort: find by name
        const gtRes = await fetch(`${supabaseUrl}/rest/v1/gateways?name=ilike.*mercado*&select=*`, {
            headers
        });
        gateways = await gtRes.json();
    }

    if (!gateways || gateways.length === 0) {
        // Can't check, just return current status
        return res.status(200).json({ status: order.status });
    }

    const gateway = gateways[0];
    // Normalize and check gateway name
    const gatewayName = (gateway.name || '').toLowerCase().replace(/[\s_]/g, '');
    if (gatewayName !== 'mercadopago') {
        return res.status(200).json({ status: order.status });
    }

    const accessToken = gateway.private_key;

    // 4. Check Status with Mercado Pago
    let mpData: any = null;
    const effectiveTxId = transactionId || payment?.transaction_id;

    if (effectiveTxId) {
        // Method A: Direct ID lookup (Fastest) with Delay Tolerance Loop
        console.log(`[CheckStatus] Checking MP for TX: ${effectiveTxId}`);
        
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
        console.log(`[CheckStatus] Payment not found by ID or missing locally. Searching by external_reference: ${orderId}`);
        const searchRes = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${orderId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (searchRes.ok) {
            const searchData = await searchRes.json();
            if (searchData.results && searchData.results.length > 0) {
                // Get most recent approved payment or just the first one
                mpData = searchData.results.sort((a: any, b: any) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime())[0];
                const mpStatus = mpData.status;
                console.log(`[CheckStatus] MP Search Result for ${orderId}: ${mpStatus}`);

                if (['approved', 'authorized'].includes(mpStatus?.toLowerCase())) {
                    let newStatus = 'paid';
                    
                    // Update Transaction ID if we found it through search
                    const foundTxId = mpData.id?.toString();
                    
                    console.log(`[CheckStatus] Healing orphan payment. Found TX: ${foundTxId}`);
                    
                    // Persist change to Supabase immediately using Service Role
                    const updateRes = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${orderId}`, {
                        method: 'PATCH',
                        headers: {
                            ...headers,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=minimal'
                        },
                        body: JSON.stringify({ status: 'paid' })
                    });

                    if (updateRes.ok) {
                        console.log(`[CheckStatus] Order ${orderId} successfully updated to PAID via self-healing`);
                        
                        // Also update/create payment record to avoid repeating this search
                        if (foundTxId) {
                            await fetch(`${supabaseUrl}/rest/v1/payments?order_id=eq.${orderId}`, {
                                method: 'PATCH',
                                headers: { ...headers, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ status: 'paid', transaction_id: foundTxId })
                            });
                        }
                    } else {
                        const errText = await updateRes.text();
                        console.error(`[CheckStatus] FAILED to update order ${orderId}:`, errText);
                    }
                }
            }
        }
    }

    if (!mpData) {
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
        console.log(`[CheckStatus] Updating Order ${orderId}: ${currentStatusNorm} -> ${newStatus}`);

        // Update Order
        await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${orderId}`, {
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
            await fetch(`${supabaseUrl}/rest/v1/payments?id=eq.${payment.id}`, {
                method: 'PATCH',
                headers: {
                        ...headers,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify({
                        status: newStatus,
                        raw_response: JSON.stringify(mpData)
                    })
                });
            } else {
                // Self-Healing: Create missing payment record
                console.log(`[CheckStatus] Self-Healing: Creating missing payment record for Order ${orderId}`);
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
                        raw_response: JSON.stringify(mpData),
                        user_id: (order as any).user_id || order.customer_user_id
                    })
                });
            }

            // Trigger Webhook Logic for Side Effects
            if (newStatus === 'paid' && currentStatusNorm === 'pending') {
                const protocol = req.headers['x-forwarded-proto'] || 'https';
                const host = req.headers.host;
                const webhookUrl = `${protocol}://${host}/api/webhooks/mercadopago`;

                console.log(`[CheckStatus] Status changed to paid, triggering webhook once at ${webhookUrl}`);

                try {
                    await fetch(webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'payment.updated',
                            data: { id: mpData.id }
                        })
                    });
                } catch (whErr) {
                    console.error('Failed to trigger webhook from check-status:', whErr);
                }
            }
        }

        return res.status(200).json({ status: newStatus });


    } catch (error: any) {
        console.error('Check Status Error:', error);
        // Do not fail the request to the client, just return pending so they keep polling
        return res.status(200).json({ status: 'pending', error: error.message });
    }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '../../core/utils/cryptoUtils.js';
import { securityService } from '../../core/services/securityService.js';

// --- CONFIG ---
/**
 * STRIPE CREATE PAYMENT INTENT — Serverless Function (Vercel)
 *
 * Esta function é o coração da migração para produção.
 * Ela recebe um paymentMethodId (token seguro do Stripe Elements)
 * e cria um PaymentIntent usando a Secret Key que NUNCA sai do servidor.
 *
 * Fluxo:
 * 1. Frontend tokeniza cartão via Stripe Elements → paymentMethodId
 * 2. Frontend envia paymentMethodId + metadados para esta function
 * 3. Esta function busca a secret_key do gateway no Supabase
 * 4. Cria PaymentIntent via API Stripe com confirm: true
 * 5. Retorna resultado ao frontend
 */

// --- HELPERS ---

function encodeFormData(data: Record<string, any>, parentKey?: string): string {
    const parts: string[] = [];
    for (const key in data) {
        if (!data.hasOwnProperty(key)) continue;
        const value = data[key];
        const encodedKey = parentKey ? `${parentKey}[${key}]` : key;

        if (typeof value === 'object' && value !== null) {
            parts.push(encodeFormData(value, encodedKey));
        } else if (value !== undefined && value !== null) {
            parts.push(`${encodeURIComponent(encodedKey)}=${encodeURIComponent(value)}`);
        }
    }
    return parts.join('&');
}

async function stripeRequest(secretKey: string, endpoint: string, method: string, data?: Record<string, any>, idempotencyKey?: string): Promise<any> {
    const url = `https://api.stripe.com/v1${endpoint}`;
    const body = data ? encodeFormData(data) : undefined;

    const headers: Record<string, string> = {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
    };

    if (idempotencyKey) {
        headers['Idempotency-Key'] = idempotencyKey;
    }

    const response = await fetch(url, {
        method,
        headers,
        body
    });

    const responseData = await response.json();

    if (!response.ok) {
        const errorMessage = responseData.error?.message || 'Unknown Stripe error';
        const errorCode = responseData.error?.code || 'unknown';
        const declineCode = responseData.error?.decline_code;
        console.error(`[Stripe API] ${endpoint} failed:`, responseData.error);
        throw new Error(JSON.stringify({ message: errorMessage, code: errorCode, decline_code: declineCode }));
    }

    return responseData;
}

// --- MAIN HANDLER ---

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            paymentMethodId,
            amount,
            currency,
            description,
            customerEmail,
            customerName,
            gatewayId,
            checkoutId,
            selectedBumpIds = [],
            metadata
        } = req.body;

        // --- INPUT VALIDATION ---
        if (!paymentMethodId) {
            return res.status(400).json({ error: 'paymentMethodId is required' });
        }
        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'amount must be greater than 0' });
        }
        if (!currency) {
            return res.status(400).json({ error: 'currency is required' });
        }
        if (!gatewayId) {
            return res.status(400).json({ error: 'gatewayId is required' });
        }

        // --- FETCH GATEWAY SECRET KEY FROM SUPABASE ---
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://vixlzrmhqsbzjhpgfwdn.supabase.co';
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            console.error('[CreatePaymentIntent] Missing Supabase credentials');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Fetch gateway by ID to get the secret_key
        const gatewayRes = await fetch(
            `${supabaseUrl}/rest/v1/gateways?id=eq.${gatewayId}&active=eq.true&select=private_key,name`,
            {
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`
                }
            }
        );

        if (!gatewayRes.ok) {
            console.error('[CreatePaymentIntent] Failed to fetch gateway:', gatewayRes.status);
            return res.status(500).json({ error: 'Failed to fetch gateway configuration' });
        }

        const gateways = await gatewayRes.json();
        const gateway = gateways?.[0];

        if (!gateway || !gateway.private_key) {
            return res.status(400).json({ error: 'Gateway not found or missing credentials' });
        }

        if (gateway.name !== 'stripe') {
            return res.status(400).json({ error: 'Gateway is not a Stripe gateway' });
        }

        // The private key is encrypted in the database (Fase 11C), so we must decrypt it
        const encryptedKey = gateway.private_key;
        const secretKey = decrypt(encryptedKey)?.replace(/\s/g, '');

        if (!secretKey || secretKey.length < 10) {
            console.error('[CreatePaymentIntent] Failed to decrypt Stripe private key.');
            return res.status(500).json({ error: 'Internal configuration error with Gateway.' });
        }
        
        // --- NEW: SERVER-SIDE PRICE VERIFICATION (Fase 13.1) ---
        const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
        
        const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
        
        // 1. Fetch Checkout and Main Product
        const { data: checkout, error: checkoutErr } = await supabaseAdmin
            .from('checkouts')
            .select('*, product:products!product_id(*)')
            .or(`id.eq.${checkoutId},custom_url_slug.eq.${checkoutId}`)
            .single();

        if (checkoutErr || !checkout) {
            console.error('[CreatePaymentIntent] Checkout not found:', checkoutId);
            return res.status(400).json({ error: 'Invalid checkout configuration' });
        }

        const productsData = Array.isArray(checkout.product) ? checkout.product : [checkout.product];
        const mainProduct = productsData[0];
        
        let calculatedTotal = Number(mainProduct.price_real || 0);
        const allowedBumpIds = Array.isArray(checkout.order_bump_ids) ? checkout.order_bump_ids : [];

        // 2. Add selected Bumps
        if (selectedBumpIds.length > 0) {
            const validBumpIds = selectedBumpIds.filter(id => allowedBumpIds.includes(id));
            if (validBumpIds.length > 0) {
                const { data: bumpsData } = await supabaseAdmin.from('products').select('price_real').in('id', validBumpIds);
                if (bumpsData) {
                    bumpsData.forEach(bp => {
                        calculatedTotal += Number(bp.price_real || 0);
                    });
                }
            }
        }

        // 3. Round to 2 decimals
        calculatedTotal = Number(calculatedTotal.toFixed(2));

        // 4. Verification Check
        if (Math.abs(calculatedTotal - amount) > 0.05) { // Allowance for small rounding differences
            console.warn(`[Security] Price manipulation detected! Received: ${amount}, Calculated: ${calculatedTotal}, IP: ${ip}`);
            await securityService.logViolation(ip, 'price_manipulation', {
                received_amount: amount,
                calculated_amount: calculatedTotal,
                checkout_id: checkoutId,
                order_id: metadata?.order_id,
                owner_id: checkout.user_id
            });
            
            // Critical: Overwrite the malicious amount with the correct one from our DB
            // OR Reject. Let's overwrite and proceed for better UX, or just reject for maximum security.
            // Protocol says: "Tentar alterar amount. Sucesso = Rejeição pelo Backend"
            return res.status(400).json({ 
                error: 'O valor do pedido não confere com os registros do sistema.',
                code: 'PRICE_MISMATCH'
            });
        }

        // --- CREATE PAYMENT INTENT ---
        const amountInCents = Math.round(amount * 100);

        const paymentIntentData: Record<string, any> = {
            amount: amountInCents,
            currency: currency.toLowerCase(),
            payment_method: paymentMethodId,
            confirm: 'true',
            description: description || 'Payment',
            receipt_email: customerEmail,
            // return_url is required for 3D Secure cards
            return_url: req.headers.origin || req.headers.referer || 'https://localhost',
        };

        // Add metadata if provided
        if (metadata && typeof metadata === 'object') {
            for (const [key, value] of Object.entries(metadata)) {
                paymentIntentData[`metadata[${key}]`] = value;
            }
            // Remove the nested metadata object since we've flattened it
            delete paymentIntentData.metadata;
        }

        const idempotencyKey = metadata?.order_id || `new_pi_${Date.now()}`;
        console.log(`[CreatePaymentIntent] Creating PI: ${amountInCents} ${currency} for ${customerEmail} (Key: ${idempotencyKey})`);

        const paymentIntent = await stripeRequest(secretKey, '/payment_intents', 'POST', paymentIntentData, idempotencyKey);

        console.log(`[CreatePaymentIntent] PI created: ${paymentIntent.id} — Status: ${paymentIntent.status}`);

        // --- NEW: PERSIST PAYMENT IN DATABASE (SERVER-SIDE) ---
        // This ensures the record exists BEFORE the webhook arrives.
        try {
            const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
            const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

            if (url && key) {
                // Re-use supabaseAdmin created above
                
                // Get user_id (merchant) from order to ensure ownership
                const { data: orderData } = await supabaseAdmin
                    .from('orders')
                    .select('user_id')
                    .eq('id', metadata.order_id)
                    .single();

                const paymentData = {
                    order_id: metadata.order_id,
                    transaction_id: paymentIntent.id,
                    gateway_id: gatewayId,
                    status: 'pending', // Initial status
                    user_id: orderData?.user_id
                };

                // Usamos .insert() simples para evitar erro de constraint única (transaction_id não é unique no banco)
                const { error: dbError } = await supabaseAdmin
                    .from('payments')
                    .insert(paymentData);

                if (dbError) {
                    console.error('[CreatePaymentIntent] DB Error:', dbError.message);
                } else {
                    console.log(`[CreatePaymentIntent] Payment persisted to DB: ${paymentIntent.id}`);
                }
            } else {
                console.warn('[CreatePaymentIntent] Supabase env vars missing. Skipping server-side save.');
            }
        } catch (dbCatch) {
            console.error('[CreatePaymentIntent] Unexpected DB error during server-side save:', dbCatch);
        }

        // --- RETURN RESULT ---
        return res.status(200).json({
            success: true,
            paymentIntentId: paymentIntent.id,
            status: paymentIntent.status,
            clientSecret: paymentIntent.client_secret,
            // For 3D Secure: if status is 'requires_action', frontend needs client_secret
            requiresAction: paymentIntent.status === 'requires_action',
            lastPaymentError: paymentIntent.last_payment_error?.message || null
        });

    } catch (error: any) {
        console.error('[CreatePaymentIntent] Error:', error);

        let errorMessage = 'Payment processing failed';
        let errorCode = 'unknown';
        let declineCode = undefined;

        try {
            const parsed = JSON.parse(error.message);
            errorMessage = parsed.message;
            errorCode = parsed.code;
            declineCode = parsed.decline_code;
        } catch {
            errorMessage = error.message || errorMessage;
        }

        return res.status(400).json({
            success: false,
            error: errorMessage,
            code: errorCode,
            decline_code: declineCode
        });
    }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '../../core/utils/cryptoUtils.js';
import { securityService } from '../../core/services/securityService.js';
import { applyCors } from '../../core/api/_cors.js';
import { fulfillOrder } from '../../core/services/fulfillment.js';
import { sendOrderAccessEmail } from '../../core/services/orderEmail.js';
import {
    PaymentSecurityError,
    assertCurrencyMatchesCheckout,
    getMainProductForCheckout,
    loadCheckoutForPayment,
    loadOwnedActiveGateway,
    loadOwnedOrderForCheckout,
    loadValidCheckoutBumps
} from '../payments/payment-security.js';

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

function maskEmail(email?: string | null) {
    const [name, domain] = String(email || '').split('@');
    if (!name || !domain) return 'unknown';
    return `${name.slice(0, 2)}***@${domain}`;
}

function translateStripeIntentStatus(status: string): 'paid' | 'pending' | 'failed' | 'canceled' {
    if (status === 'succeeded') return 'paid';
    if (status === 'requires_payment_method') return 'failed';
    if (status === 'canceled') return 'canceled';
    return 'pending';
}

// --- MAIN HANDLER ---

export default async function handler(req: VercelRequest, res: VercelResponse) {
    applyCors(req, res, 'POST,OPTIONS');

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
        const requestMetadata = metadata && typeof metadata === 'object' ? metadata : {};
        const orderId = typeof requestMetadata.order_id === 'string' ? requestMetadata.order_id : '';

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
        if (!checkoutId) {
            return res.status(400).json({ error: 'checkoutId is required' });
        }
        if (!orderId) {
            return res.status(400).json({ error: 'metadata.order_id is required' });
        }

        // --- FETCH CHECKOUT, ORDER AND GATEWAY WITH SERVER-SIDE OWNERSHIP ---
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://vixlzrmhqsbzjhpgfwdn.supabase.co';
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceRoleKey) {
            console.error('[CreatePaymentIntent] Missing Supabase credentials');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
        const checkout = await loadCheckoutForPayment(supabaseAdmin, checkoutId);
        const mainProduct = getMainProductForCheckout(checkout);
        const orderData = await loadOwnedOrderForCheckout(supabaseAdmin, checkout, orderId);
        const gateway = await loadOwnedActiveGateway(supabaseAdmin, checkout, gatewayId, 'stripe');
        const serverCurrency = assertCurrencyMatchesCheckout(checkout, mainProduct, currency);

        // The private key is encrypted in the database (Fase 11C), so we must decrypt it
        const encryptedKey = gateway.private_key;
        const secretKey = decrypt(encryptedKey)?.replace(/\s/g, '');

        if (!secretKey || secretKey.length < 10) {
            console.error('[CreatePaymentIntent] Failed to decrypt Stripe private key.');
            return res.status(500).json({ error: 'Internal configuration error with Gateway.' });
        }
        
        // --- NEW: SERVER-SIDE PRICE VERIFICATION (Fase 13.1) ---
        const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
        
        let calculatedTotal = Number(mainProduct.price_real || 0);

        // 2. Add selected Bumps
        if (selectedBumpIds.length > 0) {
            const bumpsData = await loadValidCheckoutBumps(supabaseAdmin, checkout, selectedBumpIds);
            bumpsData.forEach((bp: any) => {
                calculatedTotal += Number(bp.price_real || 0);
            });
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
                order_id: orderId,
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
            currency: serverCurrency.toLowerCase(),
            payment_method: paymentMethodId,
            confirm: 'true',
            description: description || 'Payment',
            receipt_email: customerEmail,
            // return_url is required for 3D Secure cards
            return_url: req.headers.origin || req.headers.referer || 'https://localhost',
        };

        // Add metadata if provided
        if (requestMetadata && typeof requestMetadata === 'object') {
            for (const [key, value] of Object.entries(requestMetadata)) {
                paymentIntentData[`metadata[${key}]`] = value;
            }
            // Remove the nested metadata object since we've flattened it
            delete paymentIntentData.metadata;
        }

        const idempotencyKey = orderId;
        console.log(`[CreatePaymentIntent] Creating PI: ${amountInCents} ${serverCurrency} for ${maskEmail(customerEmail)} (Key: ${idempotencyKey})`);

        const paymentIntent = await stripeRequest(secretKey, '/payment_intents', 'POST', paymentIntentData, idempotencyKey);

        console.log(`[CreatePaymentIntent] PI created: ${paymentIntent.id} — Status: ${paymentIntent.status}`);

        // --- PERSIST PAYMENT/ORDER IN DATABASE (SERVER-SIDE) ---
        // Stripe can confirm synchronously. Persist the final status here so the
        // admin does not depend exclusively on webhook delivery/configuration.
        let serverPersisted = false;
        let fulfillmentTriggered = false;
        const internalPaymentStatus = translateStripeIntentStatus(paymentIntent.status);
        try {
            const paymentData = {
                order_id: orderId,
                transaction_id: paymentIntent.id,
                gateway_id: gateway.id,
                status: internalPaymentStatus,
                user_id: checkout.user_id,
                raw_response: paymentIntent
            };

            // Avoid duplicate records when Stripe/webhook retries reuse the same PaymentIntent.
            const { data: existingPayment } = await supabaseAdmin
                .from('payments')
                .select('id')
                .eq('transaction_id', paymentIntent.id)
                .maybeSingle();

            const paymentWrite = existingPayment?.id
                ? supabaseAdmin.from('payments').update(paymentData).eq('id', existingPayment.id)
                : supabaseAdmin.from('payments').insert(paymentData);

            const { error: paymentError } = await paymentWrite;
            if (paymentError) {
                console.error('[CreatePaymentIntent] Payment DB Error:', paymentError.message);
            } else {
                serverPersisted = true;
                console.log(`[CreatePaymentIntent] Payment persisted to DB: ${paymentIntent.id} (${internalPaymentStatus})`);
            }

            if (internalPaymentStatus === 'paid') {
                const { error: orderError } = await supabaseAdmin
                    .from('orders')
                    .update({ status: 'paid', payment_id: paymentIntent.id })
                    .eq('id', orderId)
                    .eq('checkout_id', checkout.id);

                if (orderError) {
                    console.error('[CreatePaymentIntent] Order status update error:', orderError.message);
                } else {
                    console.log(`[CreatePaymentIntent] Order ${orderId} marked as PAID from synchronous Stripe confirmation.`);
                }

                try {
                    await fulfillOrder(supabaseAdmin, {
                        orderId,
                        email: orderData?.customer_email || customerEmail,
                        name: orderData?.customer_name || customerName,
                    });
                    fulfillmentTriggered = true;
                    const origin = String(req.headers.origin || req.headers.referer || '').replace(/\/+$/, '')
                        || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
                    await sendOrderAccessEmail(supabaseAdmin, {
                        orderId,
                        origin,
                        email: orderData?.customer_email || customerEmail,
                        name: orderData?.customer_name || customerName,
                    });
                } catch (fulfillError: any) {
                    console.error('[CreatePaymentIntent] Vercel fulfillment/email failed:', fulfillError.message || fulfillError);
                }
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
            serverPersisted,
            orderStatus: internalPaymentStatus,
            fulfillmentTriggered,
            // For 3D Secure: if status is 'requires_action', frontend needs client_secret
            requiresAction: paymentIntent.status === 'requires_action',
            lastPaymentError: paymentIntent.last_payment_error?.message || null
        });

    } catch (error: any) {
        console.error('[CreatePaymentIntent] Error:', error);

        if (error instanceof PaymentSecurityError) {
            return res.status(error.status).json({
                success: false,
                error: error.publicMessage,
                code: error.code
            });
        }

        let errorMessage = 'Payment processing failed';
        let errorCode = 'unknown';
        let declineCode = undefined;

        try {
            const parsed = JSON.parse(error.message);
            errorMessage = parsed.message;
            errorCode = parsed.code;
            declineCode = parsed.decline_code;
        } catch {
            errorMessage = 'Payment processing failed';
        }

        return res.status(400).json({
            success: false,
            error: errorMessage,
            code: errorCode,
            decline_code: declineCode
        });
    }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { decrypt, generateSignature } from '../../core/utils/cryptoUtils.js';
import {
    getLocalSupabaseServerKeyErrorMessage,
    resolveLocalSupabaseServerClient,
} from '../../core/api/_supabase-server.js';
import { securityService } from '../../core/services/securityService.js';
import { applyCors } from '../../core/api/_cors.js';
import { fulfillOrder } from '../../core/services/fulfillment.js';
import { sendOrderAccessEmail } from '../../core/services/orderEmail.js';
import { upsertCustomerPaymentProfile } from '../payments/customer-payment-profiles.js';
import {
    PaymentSecurityError,
    assertCurrencyMatchesCheckout,
    getMainProductForCheckout,
    loadCheckoutForPayment,
    loadOwnedActiveGateway,
    loadOwnedOrderForCheckoutWithMerchant,
    loadValidCheckoutBumps,
    resolveCheckoutMerchantUserId
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

async function findOrCreateStripeCustomer(secretKey: string, email?: string | null, name?: string | null) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return null;

    const existing = await stripeRequest(
        secretKey,
        `/customers?email=${encodeURIComponent(normalizedEmail)}&limit=1`,
        'GET'
    );

    if (Array.isArray(existing?.data) && existing.data[0]?.id) {
        return existing.data[0];
    }

    return stripeRequest(secretKey, '/customers', 'POST', {
        email: normalizedEmail,
        name: name || undefined,
    });
}

async function loadStripePaymentMethod(secretKey: string, paymentMethodId?: string | null) {
    const normalized = String(paymentMethodId || '').trim();
    if (!normalized) return null;
    return stripeRequest(secretKey, `/payment_methods/${encodeURIComponent(normalized)}`, 'GET');
}

interface StripeSavedProfileRecord {
    gateway_customer_id: string;
    gateway_payment_method_id: string;
    card_brand?: string | null;
    card_last4?: string | null;
    card_exp_month?: number | null;
    card_exp_year?: number | null;
    wallet_type?: 'apple_pay' | 'google_pay' | null;
    reusable?: boolean | null;
    requires_reauthentication?: boolean | null;
}

function buildStripeSavedProfileSummary(profile?: Partial<StripeSavedProfileRecord> | null) {
    if (!profile) return null;
    if (!profile.card_last4 && !profile.wallet_type) return null;

    return {
        brand: profile.card_brand || null,
        last4: profile.card_last4 || null,
        exp_month: profile.card_exp_month || null,
        exp_year: profile.card_exp_year || null,
        wallet_type: profile.wallet_type || null,
    };
}

function buildStripeUpsellCapability(params: {
    originalPaymentMethod?: string | null;
    savedProfile?: ReturnType<typeof buildStripeSavedProfileSummary>;
    reusableProfileAvailable?: boolean;
    requiresPaymentForm?: boolean;
    requiresStepUp?: boolean;
}) {
    const originalPaymentMethod = params.originalPaymentMethod || 'credit_card';
    const savedProfile = params.savedProfile || null;
    const reusableProfileAvailable = Boolean(params.reusableProfileAvailable);
    const requiresStepUp = params.requiresStepUp ?? false;
    const supportsWalletReuse = savedProfile?.wallet_type === 'apple_pay' || savedProfile?.wallet_type === 'google_pay';
    const hasSavedProfile = Boolean(savedProfile);

    return {
        gateway: 'stripe',
        original_payment_method: originalPaymentMethod,
        supports_saved_method: hasSavedProfile,
        supports_off_session_charge: reusableProfileAvailable,
        requires_step_up: requiresStepUp,
        supports_pix: false,
        supports_wallet_reuse: supportsWalletReuse,
        has_saved_profile: hasSavedProfile,
        reusable_profile_available: reusableProfileAvailable,
        should_offer_immediately: true,
        requires_payment_form: params.requiresPaymentForm ?? !reusableProfileAvailable,
        strategy: reusableProfileAvailable
            ? (requiresStepUp ? 'saved_method_reconfirm' : 'one_click_charge')
            : (hasSavedProfile ? 'saved_method_reconfirm' : 'new_card_capture'),
        saved_profile: savedProfile,
        mode: reusableProfileAvailable
            ? (requiresStepUp ? 'light_confirmation' : 'one_click')
            : (hasSavedProfile ? 'light_confirmation' : 'repayment_explicit'),
    };
}

function parseStripeError(error: unknown) {
    const fallback = {
        message: 'Payment processing failed',
        code: 'unknown',
        decline_code: undefined as string | undefined,
    };

    if (!error || typeof error !== 'object') {
        return fallback;
    }

    const rawMessage = typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : '';

    if (!rawMessage) {
        return fallback;
    }

    try {
        const parsed = JSON.parse(rawMessage);
        return {
            message: typeof parsed?.message === 'string' ? parsed.message : fallback.message,
            code: typeof parsed?.code === 'string' ? parsed.code : fallback.code,
            decline_code: typeof parsed?.decline_code === 'string' ? parsed.decline_code : undefined,
        };
    } catch {
        return {
            message: rawMessage,
            code: fallback.code,
            decline_code: undefined,
        };
    }
}

function shouldFallbackToManualStripeConfirmation(error: unknown) {
    const parsed = parseStripeError(error);
    const code = String(parsed.decline_code || parsed.code || '').trim().toLowerCase();

    return code === 'authentication_required'
        || code === 'payment_intent_authentication_failure'
        || code === 'authentication_not_handled'
        || code === 'approval_required';
}

async function loadReusableStripeProfile(params: {
    supabaseAdmin: any;
    merchantUserId: string;
    gatewayId: string;
    customerEmail?: string | null;
    originalOrderId?: string | null;
}) {
    const normalizedEmail = String(params.customerEmail || '').trim().toLowerCase();
    if (!normalizedEmail) return null;

    const selectFields = 'gateway_customer_id,gateway_payment_method_id,card_brand,card_last4,card_exp_month,card_exp_year,wallet_type,reusable,requires_reauthentication,updated_at,last_order_id';

    if (params.originalOrderId) {
        const { data: directMatch, error: directError } = await params.supabaseAdmin
            .from('customer_payment_profiles')
            .select(selectFields)
            .eq('user_id', params.merchantUserId)
            .eq('gateway_id', params.gatewayId)
            .eq('gateway_name', 'stripe')
            .eq('customer_email', normalizedEmail)
            .eq('payment_method_type', 'credit_card')
            .eq('reusable', true)
            .eq('last_order_id', params.originalOrderId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (directError) {
            console.warn('[CreatePaymentIntent] Failed to load reusable Stripe profile for original order:', directError.message);
        } else if (directMatch?.gateway_customer_id && directMatch?.gateway_payment_method_id) {
            return directMatch as StripeSavedProfileRecord;
        }
    }

    const { data: fallbackProfiles, error: fallbackError } = await params.supabaseAdmin
        .from('customer_payment_profiles')
        .select(selectFields)
        .eq('user_id', params.merchantUserId)
        .eq('gateway_id', params.gatewayId)
        .eq('gateway_name', 'stripe')
        .eq('customer_email', normalizedEmail)
        .eq('payment_method_type', 'credit_card')
        .eq('reusable', true)
        .order('updated_at', { ascending: false })
        .limit(1);

    if (fallbackError) {
        console.warn('[CreatePaymentIntent] Failed to load fallback reusable Stripe profile:', fallbackError.message);
        return null;
    }

    const profile = Array.isArray(fallbackProfiles) ? fallbackProfiles[0] : null;
    if (!profile?.gateway_customer_id || !profile?.gateway_payment_method_id) {
        return null;
    }

    return profile as StripeSavedProfileRecord;
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
            metadata,
            originalOrderId: requestOriginalOrderId,
            useSavedPaymentMethod: rawUseSavedPaymentMethod,
        } = req.body;
        const useSavedPaymentMethod = rawUseSavedPaymentMethod === true || rawUseSavedPaymentMethod === 'true';
        const requestMetadata = metadata && typeof metadata === 'object' ? metadata : {};
        const orderId = typeof requestMetadata.order_id === 'string' ? requestMetadata.order_id : '';
        const originalOrderId = typeof requestOriginalOrderId === 'string' && requestOriginalOrderId.trim()
            ? requestOriginalOrderId.trim()
            : (typeof requestMetadata.original_order_id === 'string' ? requestMetadata.original_order_id.trim() : '');
        const originalCustomerUserId = typeof requestMetadata.customer_user_id === 'string' && requestMetadata.customer_user_id.trim()
            ? requestMetadata.customer_user_id.trim()
            : null;

        // --- INPUT VALIDATION ---
        if (!paymentMethodId && !useSavedPaymentMethod) {
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
        const { supabase: supabaseAdmin, serverKeySource, probeError } = await resolveLocalSupabaseServerClient();
        if (!supabaseAdmin) {
            console.error('[CreatePaymentIntent] Missing or invalid Supabase server credentials:', probeError);
            return res.status(500).json({
                success: false,
                error: getLocalSupabaseServerKeyErrorMessage(),
                code: 'SUPABASE_SERVER_KEY_INVALID',
            });
        }
        console.log('[CreatePaymentIntent] Using Supabase server key source:', serverKeySource || 'unknown');
        const checkout = await loadCheckoutForPayment(supabaseAdmin, checkoutId);
        const mainProduct = getMainProductForCheckout(checkout);
        const merchantUserId = resolveCheckoutMerchantUserId(checkout, mainProduct);
        const orderData = await loadOwnedOrderForCheckoutWithMerchant(supabaseAdmin, checkout, merchantUserId, orderId);
        const gateway = await loadOwnedActiveGateway(supabaseAdmin, merchantUserId, checkout, gatewayId, 'stripe');
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

        const isUpsellAttempt = Boolean(originalOrderId);
        let calculatedTotal = 0;

        if (isUpsellAttempt) {
            const upsellProductId = checkout?.config?.upsell?.product_id;
            if (!upsellProductId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid checkout configuration.',
                    code: 'UPSELL_PRODUCT_NOT_CONFIGURED',
                });
            }

            const { data: upsellProduct, error: upsellProductError } = await supabaseAdmin
                .from('products')
                .select('id, user_id, price_real')
                .eq('id', upsellProductId)
                .eq('user_id', merchantUserId)
                .maybeSingle();

            if (upsellProductError) {
                console.error('[CreatePaymentIntent] Upsell product lookup failed:', upsellProductError.message);
                throw new PaymentSecurityError('UPSELL_PRODUCT_LOOKUP_FAILED', 'Invalid checkout configuration.');
            }

            if (!upsellProduct) {
                throw new PaymentSecurityError('UPSELL_PRODUCT_FORBIDDEN', 'Invalid checkout configuration.');
            }

            calculatedTotal = Number(upsellProduct.price_real || 0);
        } else {
            calculatedTotal = Number(mainProduct.price_real || 0);

            // 2. Add selected Bumps
            if (selectedBumpIds.length > 0) {
                const bumpsData = await loadValidCheckoutBumps(supabaseAdmin, checkout, merchantUserId, selectedBumpIds);
                bumpsData.forEach((bp: any) => {
                    calculatedTotal += Number(bp.price_real || 0);
                });
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
            confirm: 'true',
            description: description || 'Payment',
            receipt_email: customerEmail,
        };

        let stripeCustomer: any = null;
        let stripePaymentMethod: any = null;
        let stripeWalletType: 'apple_pay' | 'google_pay' | null = null;
        let paymentMethodType = 'credit_card';
        let reusableProfileAvailable = false;
        let savedProfileSummary: ReturnType<typeof buildStripeSavedProfileSummary> = null;
        let gatewayCustomerId = '';
        let resolvedPaymentMethodId = typeof paymentMethodId === 'string' ? paymentMethodId.trim() : '';

        if (useSavedPaymentMethod) {
            const reusableProfile = await loadReusableStripeProfile({
                supabaseAdmin,
                merchantUserId,
                gatewayId: gateway.id,
                customerEmail,
                originalOrderId,
            });

            savedProfileSummary = buildStripeSavedProfileSummary(reusableProfile);
            const savedMethodFallbackCapability = buildStripeUpsellCapability({
                originalPaymentMethod: 'credit_card',
                savedProfile: savedProfileSummary,
                reusableProfileAvailable: Boolean(reusableProfile),
                requiresPaymentForm: true,
                requiresStepUp: true,
            });

            if (!reusableProfile?.gateway_customer_id || !reusableProfile?.gateway_payment_method_id) {
                return res.status(200).json({
                    success: false,
                    error: 'O banco pediu uma confirmação adicional para concluir este item.',
                    code: 'UPSELL_REQUIRES_PAYMENT_FORM',
                    upsellCapability: savedMethodFallbackCapability,
                });
            }

            reusableProfileAvailable = true;
            gatewayCustomerId = reusableProfile.gateway_customer_id;
            resolvedPaymentMethodId = reusableProfile.gateway_payment_method_id;
            paymentIntentData.customer = gatewayCustomerId;
            paymentIntentData.payment_method = resolvedPaymentMethodId;
            paymentIntentData.off_session = 'true';
        } else {
            try {
                stripeCustomer = await findOrCreateStripeCustomer(secretKey, customerEmail, customerName);
                if (stripeCustomer?.id) {
                    paymentIntentData.customer = stripeCustomer.id;
                    gatewayCustomerId = stripeCustomer.id;
                }
            } catch (customerError: any) {
                console.warn('[CreatePaymentIntent] Failed to resolve Stripe customer:', customerError?.message || customerError);
            }

            try {
                stripePaymentMethod = await loadStripePaymentMethod(secretKey, paymentMethodId);
            } catch (paymentMethodError: any) {
                console.warn('[CreatePaymentIntent] Failed to inspect Stripe payment method:', paymentMethodError?.message || paymentMethodError);
            }

            stripeWalletType = stripePaymentMethod?.card?.wallet?.type === 'apple_pay' || stripePaymentMethod?.card?.wallet?.type === 'google_pay'
                ? stripePaymentMethod.card.wallet.type
                : null;
            paymentMethodType = stripeWalletType || 'credit_card';
            savedProfileSummary = buildStripeSavedProfileSummary({
                card_brand: stripePaymentMethod?.card?.brand || null,
                card_last4: stripePaymentMethod?.card?.last4 || null,
                card_exp_month: stripePaymentMethod?.card?.exp_month || null,
                card_exp_year: stripePaymentMethod?.card?.exp_year || null,
                wallet_type: stripeWalletType,
            });

            reusableProfileAvailable = Boolean(stripePaymentMethod?.card?.last4) && !stripeWalletType && Boolean(gatewayCustomerId) && Boolean(resolvedPaymentMethodId);
            paymentIntentData.payment_method = resolvedPaymentMethodId;
            if (reusableProfileAvailable) {
                paymentIntentData.setup_future_usage = 'off_session';
            }
            // return_url is required for cards that trigger authentication on-session.
            paymentIntentData.return_url = req.headers.origin || req.headers.referer || 'https://localhost';
        }

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

        let paymentIntent: any;
        try {
            paymentIntent = await stripeRequest(secretKey, '/payment_intents', 'POST', paymentIntentData, idempotencyKey);
        } catch (stripeError: any) {
            if (useSavedPaymentMethod && shouldFallbackToManualStripeConfirmation(stripeError)) {
                return res.status(200).json({
                    success: false,
                    error: 'O banco pediu uma confirmação adicional para concluir este item.',
                    code: 'UPSELL_REQUIRES_PAYMENT_FORM',
                    upsellCapability: buildStripeUpsellCapability({
                        originalPaymentMethod: 'credit_card',
                        savedProfile: savedProfileSummary,
                        reusableProfileAvailable: true,
                        requiresPaymentForm: true,
                        requiresStepUp: true,
                    }),
                });
            }

            throw stripeError;
        }

        console.log(`[CreatePaymentIntent] PI created: ${paymentIntent.id} — Status: ${paymentIntent.status}`);

        gatewayCustomerId = gatewayCustomerId || paymentIntent.customer || '';

        const upsellCapability = buildStripeUpsellCapability({
            originalPaymentMethod: paymentMethodType,
            savedProfile: savedProfileSummary,
            reusableProfileAvailable,
            requiresPaymentForm: !reusableProfileAvailable,
            requiresStepUp: reusableProfileAvailable || Boolean(savedProfileSummary),
        });

        try {
            const profileResult = await upsertCustomerPaymentProfile({
                supabaseAdmin,
                userId: merchantUserId,
                gatewayId: gateway.id,
                gatewayName: gateway.name,
                customerUserId: originalCustomerUserId,
                customerEmail: customerEmail,
                customerName: customerName,
                paymentMethodType: paymentMethodType as any,
                gatewayCustomerId: gatewayCustomerId || null,
                gatewayPaymentMethodId: resolvedPaymentMethodId || null,
                cardBrand: savedProfileSummary?.brand || null,
                cardLast4: savedProfileSummary?.last4 || null,
                cardExpMonth: savedProfileSummary?.exp_month || null,
                cardExpYear: savedProfileSummary?.exp_year || null,
                walletType: savedProfileSummary?.wallet_type || null,
                reusable: reusableProfileAvailable,
                requiresReauthentication: reusableProfileAvailable,
                consentCapturedAt: new Date().toISOString(),
                consentScope: 'post_purchase_upsell',
                firstOrderId: orderId,
                lastOrderId: orderId,
                metadata: {
                    source: 'stripe_create_payment_intent',
                    payment_intent_id: paymentIntent.id,
                    payment_intent_status: paymentIntent.status,
                    original_order_id: originalOrderId || null,
                    saved_method_attempt: useSavedPaymentMethod,
                },
            });

            if (profileResult.ok === false) {
                console.warn('[CreatePaymentIntent] Customer payment profile not persisted:', profileResult.reason, profileResult.error || '');
            }
        } catch (profileError: any) {
            console.warn('[CreatePaymentIntent] Passive payment profile capture failed:', profileError?.message || profileError);
        }

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
            statusSignature: generateSignature(orderId),
            upsellCapability,
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

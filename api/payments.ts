import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * PAYMENTS HUB (v4)
 * Orquestrador central de pagamentos com camadas de segurança.
 */
const ALLOWED_ORIGINS = [
    process.env.APP_URL,
    process.env.SUPER_CHECKOUT_APP_URL,
    process.env.SUPER_CHECKOUT_PORTAL_URL,
    process.env.SUPER_CHECKOUT_INSTALL_URL,
    process.env.VITE_SUPER_CHECKOUT_APP_URL,
    process.env.VITE_SUPER_CHECKOUT_PORTAL_URL,
    process.env.VITE_SUPER_CHECKOUT_INSTALL_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.NEXT_PUBLIC_APP_URL,
    'https://app.supercheckout.app',
    'https://portal.supercheckout.app',
    'https://install.supercheckout.app',
    ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:3000', 'http://localhost:5173'] : [])
].filter(Boolean);

async function readJsonBody(req: VercelRequest) {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        return req.body as Record<string, any>;
    }

    const chunks: Buffer[] = [];
    const preload = req.body;

    if (typeof preload === 'string' && preload.trim()) {
        chunks.push(Buffer.from(preload));
    } else if (Buffer.isBuffer(preload) && preload.length > 0) {
        chunks.push(preload);
    } else if (!preload && typeof (req as any)[Symbol.asyncIterator] === 'function') {
        for await (const chunk of req as any as AsyncIterable<Buffer | string>) {
            if (typeof chunk === 'string') {
                if (chunk) chunks.push(Buffer.from(chunk));
                continue;
            }

            if (chunk?.length) chunks.push(Buffer.from(chunk));
        }
    }

    if (chunks.length === 0) return {};

    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        const invalidJsonError = new Error('Invalid JSON');
        (invalidJsonError as any).code = 'INVALID_JSON';
        throw invalidJsonError;
    }
}

const PUBLIC_PAYMENT_FAILURE_MESSAGE = 'Nao foi possivel processar o pagamento agora. Tente novamente.';
const SAFE_PAYMENT_ERROR_PREFIXES = [
    'Nao foi possivel',
    'Pagamento recusado',
    'O cartao',
    'O codigo',
    'A data',
    'Informe um CPF',
    'No sandbox legado',
    'O Mercado Pago',
    'O token do cartao',
    'O emissor do cartao',
    'O documento do pagador',
    'A quantidade de parcelas',
    'O valor do pedido',
];

function safePublicString(value: unknown, maxLength = 512) {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim();
    return normalized ? normalized.slice(0, maxLength) : undefined;
}

function safePublicNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toPublicRedirectUrl(value: unknown) {
    const normalized = safePublicString(value, 2048);
    if (!normalized) return undefined;

    try {
        const parsed = new URL(normalized);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? normalized : undefined;
    } catch {
        return undefined;
    }
}

function toPublicPixData(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const source = value as Record<string, unknown>;
    const qrCode = safePublicString(source.qr_code, 4096);
    const qrCodeBase64 = safePublicString(source.qr_code_base64, 200000);

    if (!qrCode && !qrCodeBase64) return undefined;
    return {
        qr_code: qrCode || '',
        qr_code_base64: qrCodeBase64 || '',
    };
}

function toPublicBoletoData(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const source = value as Record<string, unknown>;
    const barcode = safePublicString(source.barcode, 4096);
    const url = toPublicRedirectUrl(source.url);

    if (!barcode && !url) return undefined;
    return {
        barcode: barcode || '',
        url: url || '',
    };
}

function toPublicUpsellCapability(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const source = value as Record<string, any>;
    const savedProfile = source.saved_profile && typeof source.saved_profile === 'object' && !Array.isArray(source.saved_profile)
        ? source.saved_profile as Record<string, unknown>
        : null;

    const capability = {
        gateway: safePublicString(source.gateway, 32),
        original_payment_method: safePublicString(source.original_payment_method, 32),
        supports_saved_method: source.supports_saved_method === true,
        supports_off_session_charge: source.supports_off_session_charge === true,
        requires_step_up: source.requires_step_up === true,
        supports_pix: source.supports_pix === true,
        supports_wallet_reuse: source.supports_wallet_reuse === true,
        has_saved_profile: source.has_saved_profile === true,
        reusable_profile_available: source.reusable_profile_available === true,
        should_offer_immediately: source.should_offer_immediately === true,
        requires_payment_form: source.requires_payment_form === true,
        strategy: safePublicString(source.strategy, 64),
        mode: safePublicString(source.mode, 64),
        saved_profile: savedProfile ? {
            brand: safePublicString(savedProfile.brand, 32) || null,
            last4: safePublicString(savedProfile.last4, 4) || null,
            exp_month: safePublicNumber(savedProfile.exp_month) || null,
            exp_year: safePublicNumber(savedProfile.exp_year) || null,
            wallet_type: safePublicString(savedProfile.wallet_type, 32) || null,
            // Required by Mercado Pago's public SDK to tokenize the CVC of the saved card.
            gateway_payment_method_id: safePublicString(savedProfile.gateway_payment_method_id, 256) || null,
        } : null,
    };

    return capability;
}

function toPublicPaymentFailureMessage(value: unknown, code?: string) {
    if (code === 'UPSELL_REQUIRES_PAYMENT_FORM') {
        return 'O banco pediu uma confirmacao adicional para concluir este item.';
    }

    const message = safePublicString(value, 240);
    return message && SAFE_PAYMENT_ERROR_PREFIXES.some((prefix) => message.startsWith(prefix))
        ? message
        : PUBLIC_PAYMENT_FAILURE_MESSAGE;
}

function toPublicPaymentResult(result: any) {
    const code = safePublicString(result?.code, 96);

    if (!result?.success) {
        return {
            success: false,
            error: toPublicPaymentFailureMessage(result?.error, code),
            code: code || 'PAYMENT_PROCESSING_FAILED',
            upsellCapability: toPublicUpsellCapability(result?.upsellCapability),
        };
    }

    return {
        success: true,
        paymentId: safePublicString(result.paymentId ?? result.id, 256),
        status: safePublicString(result.status, 96),
        localStatus: safePublicString(result.localStatus, 64),
        statusSignature: safePublicString(result.statusSignature, 512),
        paypalOrderId: safePublicString(result.paypalOrderId, 256),
        redirectUrl: toPublicRedirectUrl(result.redirectUrl),
        pixData: toPublicPixData(result.pixData),
        boletoData: toPublicBoletoData(result.boletoData),
        upsellCapability: toPublicUpsellCapability(result.upsellCapability),
    };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // 1. CORS Whitelist (Fase 11F)
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0] || 'https://app.supercheckout.app');
    }
    
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { action } = req.query;
    const forwardedFor = Array.isArray(req.headers['x-forwarded-for'])
        ? req.headers['x-forwarded-for'][0]
        : req.headers['x-forwarded-for'];
    const cfConnectingIp = Array.isArray(req.headers['cf-connecting-ip'])
        ? req.headers['cf-connecting-ip'][0]
        : req.headers['cf-connecting-ip'];
    const realIp = Array.isArray(req.headers['x-real-ip'])
        ? req.headers['x-real-ip'][0]
        : req.headers['x-real-ip'];
    const ip = String(
        cfConnectingIp
        || forwardedFor?.split(',')[0]
        || realIp
        || req.socket.remoteAddress
        || 'unknown',
    ).trim();

    try {
        const body = await readJsonBody(req);
        const { securityService } = await import('../src/core/services/securityService.js');

        // 1. Rate Limit Check (Pre-Action)
        const isLimited = await securityService.isRateLimited(ip);
        if (isLimited) {
            return res.status(429).json({ 
                error: 'Muitas tentativas. Seu IP foi temporariamente bloqueado por segurança.',
                code: 'RATE_LIMIT_EXCEEDED'
            });
        }

        // 2. Routing
        if (action === 'create-payment-intent') {
            const stripePaymentIntentHandler = (await import('../src/modules/stripe/create-payment-intent.js')).default;
            return await stripePaymentIntentHandler(req, res);
        }

        if (action === 'mercadopago') {
            const { processMercadoPagoPayment } = await import('../src/modules/payments/mercadopago.js');
            console.log("[PaymentsHub] Action: mercadopago");
            
            // 2. Dynamic Host Resolution for Notifications (Fase 11 - Robustness)
            const protocol = req.headers['x-forwarded-proto'] || 'https';
            const host = req.headers.host;
            const baseUrl = `${protocol}://${host}`;

            const result = await processMercadoPagoPayment({
                ...body,
                baseUrl,
                ip
            });

            return res.status(result.success ? 200 : 400).json(toPublicPaymentResult(result));
        }

        if (action === 'pagseguro') {
            const { processPagSeguroPayment } = await import('../src/modules/payments/pagseguro.js');
            console.log('[PaymentsHub] Action: pagseguro');

            const protocol = req.headers['x-forwarded-proto'] || 'https';
            const host = req.headers.host;
            const baseUrl = `${protocol}://${host}`;

            const result = await processPagSeguroPayment({
                ...body,
                baseUrl,
                ip
            });

            return res.status(result.success ? 200 : 400).json(toPublicPaymentResult(result));
        }

        if (action === 'asaas') {
            const { processAsaasPayment } = await import('../src/modules/payments/asaas.js');
            console.log('[PaymentsHub] Action: asaas');

            const protocol = req.headers['x-forwarded-proto'] || 'https';
            const host = req.headers.host;
            const baseUrl = `${protocol}://${host}`;

            const result = await processAsaasPayment({
                ...body,
                baseUrl,
                ip
            });

            return res.status(result.success ? 200 : 400).json(toPublicPaymentResult(result));
        }

        if (action === 'paypal-create-order') {
            const { createPayPalOrder } = await import('../src/modules/payments/paypal.js');
            const result = await createPayPalOrder({
                ...body,
                paymentMethod: 'paypal',
                ip,
            });
            return res.status(result.success ? 200 : 400).json(toPublicPaymentResult(result));
        }

        if (action === 'paypal-capture-order') {
            const { capturePayPalOrder } = await import('../src/modules/payments/paypal.js');
            const protocol = req.headers['x-forwarded-proto'] || 'https';
            const host = req.headers.host;
            const baseUrl = `${protocol}://${host}`;
            const result = await capturePayPalOrder({
                ...body,
                ip,
                baseUrl,
            });
            return res.status(result.success ? 200 : 400).json(toPublicPaymentResult(result));
        }

        if (action === 'paypal-test-credentials') {
            const { requireApiAuth } = await import('../src/core/api/_authz.js');
            const auth = await requireApiAuth(req, res, {
                source: 'paypal_test_credentials',
                allowedRoles: ['owner', 'admin', 'master_admin'],
            });
            if (!auth) return;

            const { testPayPalGatewayCredentials } = await import('../src/modules/payments/paypal.js');
            const result = await testPayPalGatewayCredentials({
                supabaseAdmin: auth.supabaseAdmin,
                merchantUserId: auth.user.id,
                gatewayId: String(body.gatewayId || '').trim(),
            });
            return res.status(result.success ? 200 : 400).json(result);
        }
        
        return res.status(404).json({ error: `Action ${action} not found in Payments Controller` });
    } catch (error: any) {
        console.error('[PaymentsHub] Global Error:', {
            message: error?.message,
            code: error?.code
        });
        if (error?.code === 'INVALID_JSON') {
            return res.status(400).json({ error: 'Invalid JSON' });
        }
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

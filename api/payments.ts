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

            if (!result.success) {
                const { details, data, ...safeResult } = result as any;
                return res.status(400).json(safeResult);
            }

            return res.status(200).json(result);
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

            if (!result.success) {
                const { details, data, ...safeResult } = result as any;
                return res.status(400).json(safeResult);
            }

            return res.status(200).json(result);
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

            if (!result.success) {
                const { details, data, ...safeResult } = result as any;
                return res.status(400).json(safeResult);
            }

            return res.status(200).json(result);
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

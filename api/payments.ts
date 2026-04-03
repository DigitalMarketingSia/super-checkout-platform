import type { VercelRequest, VercelResponse } from '@vercel/node';
import stripePaymentIntentHandler from '../src/modules/stripe/create-payment-intent.js';
import { processMercadoPagoPayment } from '../src/modules/payments/mercadopago.js';
import { securityService } from '../src/core/services/securityService.js';

/**
 * PAYMENTS HUB (v4)
 * Orquestrador central de pagamentos com camadas de segurança.
 */
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
        res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0] || '*');
    }
    
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { action } = req.query;
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';

    try {
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
            return await stripePaymentIntentHandler(req, res);
        }

        if (action === 'mercadopago') {
            const result = await processMercadoPagoPayment({
                ...req.body,
                ip
            });

            if (!result.success) {
                return res.status(400).json({ error: result.error });
            }

            return res.status(200).json(result);
        }
        
        return res.status(404).json({ error: `Action ${action} not found in Payments Controller` });
    } catch (error: any) {
        console.error('[PaymentsHub] Global Error:', error.message);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}

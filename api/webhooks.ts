import type { VercelRequest, VercelResponse } from '@vercel/node';
import centralWebhookHandler from '../src/core/api/webhooks/central';
import mercadopagoWebhookHandler from '../src/modules/mercadopago/webhook';
import stripeWebhookHandler from '../src/modules/stripe/webhook';
import scCentralWebhookHandler from '../src/core/api/webhooks/super-checkout-central';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { action } = req.query;

    try {
        switch (action) {
            case 'central':
                return await centralWebhookHandler(req, res);
            case 'mercadopago':
                return await mercadopagoWebhookHandler(req, res);
            case 'stripe':
                return await stripeWebhookHandler(req, res);
            case 'super-checkout-central':
                return await scCentralWebhookHandler(req, res);
            default:
                return res.status(404).json({ error: `Action ${action} not found in Webhooks Controller` });
        }
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}

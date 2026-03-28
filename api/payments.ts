import type { VercelRequest, VercelResponse } from '@vercel/node';
import stripePaymentIntentHandler from '../src/modules/stripe/create-payment-intent';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { action } = req.query;

    try {
        if (action === 'create-payment-intent') {
            return await stripePaymentIntentHandler(req, res);
        }
        
        return res.status(404).json({ error: `Action ${action} not found in Payments Controller` });
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}

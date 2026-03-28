import type { VercelRequest, VercelResponse } from '@vercel/node';
import checkStatusHandler from '../src/core/api/check-status';
import healthHandler from '../src/core/api/health';
import proxyHandler from '../src/core/api/proxy';
import sendEmailHandler from '../src/core/api/send-email';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { action } = req.query;

    try {
        switch (action) {
            case 'check-status':
                return await checkStatusHandler(req, res);
            case 'health':
                return await healthHandler(req, res);
            case 'proxy':
                return await proxyHandler(req, res);
            case 'send-email':
                return await sendEmailHandler(req, res);
            default:
                return res.status(404).json({ error: `Action ${action} not found in System Controller` });
        }
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}

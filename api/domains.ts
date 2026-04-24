import type { VercelRequest, VercelResponse } from '@vercel/node';
import addHandler from '../src/core/api/domains/add';
import removeHandler from '../src/core/api/domains/remove';
import verifyHandler from '../src/core/api/domains/verify';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { action } = req.query;

    try {
        switch (action) {
            case 'add':
                return await addHandler(req, res);
            case 'remove':
                return await removeHandler(req, res);
            case 'verify':
                return await verifyHandler(req, res);
            default:
                return res.status(404).json({ error: `Action ${action} not found in Domains Controller` });
        }
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}

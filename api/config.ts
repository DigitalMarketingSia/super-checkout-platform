import type { VercelRequest, VercelResponse } from '@vercel/node';
import configHandler from '../src/core/api/config.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        return await configHandler(req, res);
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}

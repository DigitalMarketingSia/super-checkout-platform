import type { VercelRequest, VercelResponse } from '@vercel/node';
import validateLicenseHandler from '../src/core/api/licenses/validate.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        // This handler handles license validation for the current domain
        return await validateLicenseHandler(req, res);
    } catch (error: any) {
        console.error('[Licenses] Controller error:', error?.message || error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import validateLicenseHandler from '../src/core/api/licenses/validate.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        // This handler handles license validation for the current domain
        return await validateLicenseHandler(req, res);
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import createLicenseHandler from '../src/core/api/admin/create-license.js';
import membersHandler from '../src/core/api/admin/members.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { action } = req.query;

    try {
        switch (action) {
            case 'create-license':
                return await createLicenseHandler(req, res);
            case 'members':
                return await membersHandler(req, res);
            default:
                return res.status(404).json({ error: `Action ${action} not found in Admin Controller` });
        }
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}

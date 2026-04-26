import type { VercelRequest, VercelResponse } from '@vercel/node';
import configHandler from '../src/core/api/config.js';
import setupAdminHandler from '../src/core/api/installer/setup-admin.js';
import supabaseHandler from '../src/core/api/installer/supabase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        const { action } = req.query;

        if (action === 'config') {
            return await configHandler(req, res);
        }

        if (action === 'setup-admin') {
            return await setupAdminHandler(req, res);
        }

        return await supabaseHandler(req, res);
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}

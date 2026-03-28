import type { VercelRequest, VercelResponse } from '@vercel/node';
import supabaseHandler from '../src/core/api/installer/supabase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        return await supabaseHandler(req, res);
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}

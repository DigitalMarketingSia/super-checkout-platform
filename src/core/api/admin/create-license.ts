import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // 1. Validate the Request Body
    const { client_name, client_email, plan, usage_type, expires_at } = req.body;

    if (!client_name || !client_email) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // 2. Validate THIS Instance's License (The "Reseller" Check)
        // We verify if the current instance has permission to create licenses
        const INSTANCE_LICENSE_KEY = process.env.VITE_LICENSE_KEY;
        // Self-validation: In a real distributed system, we would call the central server.
        // For this architecture, since we ARE the central code, we can check our own Key or simple logic.
        // However, following the "Secure" pattern, we should simulate the check or trust the env if we are the central authority.

        // CRITICAL CHECK: In a self-hosted scenario, we must call the Central Authority to check if WE are commercial.
        const CENTRAL_SERVER_URL = process.env.VITE_LICENSING_SERVER_URL || 'https://super-checkout.vercel.app';

        // If we are running LOCALLY or on the MAIN DOMAIN, we might be the Authority itself.
        // But let's follow the standard "Client -> Authority" check for robustness.

        let isCommercial = false;

        if (INSTANCE_LICENSE_KEY) {
            const validationRes = await fetch(`${CENTRAL_SERVER_URL}/api/licenses/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: INSTANCE_LICENSE_KEY, domain: req.headers.host })
            });
            const validationData = await validationRes.json();

            if (validationData.valid && validationData.permissions?.create_license) {
                isCommercial = true;
            }
        } else {
            // Dev/SaaS Fallback: If no key is set (e.g. standard SaaS), we might verify session or allow based on Auth.
            // For now, fail safe.
            console.log('No instance license key found for authorization.');
        }

        // --- BYPASS FOR N8N AUTOMATION ---
        // N8N doesn't have a "License Key" but needs to create keys for sales.
        // We use a shared secret key (ADMIN_API_SECRET) in the header 'x-admin-token'.
        const adminSecret = process.env.ADMIN_API_SECRET;
        const requestToken = req.headers['x-admin-token'];

        if (adminSecret && requestToken === adminSecret) {
            console.log('Authorized via ADMIN_API_SECRET (N8N Automation)');
            isCommercial = true;
        }

        // --- BYPASS FOR DEVELOPMENT/ADMIN --- 
        // If the user requesting is the SUPER ADMIN (authenticated via Supabase Session in frontend -> passed here?), 
        // handling Auth in Serverless functions can be tricky without forwarding headers.

        // SIMPLIFICATION FOR THIS TASK:
        // We rely on the `isCommercial` check obtained above.

        if (!isCommercial) {
            // ALLOW BYPASS FOR SYSTEM DOMAIN (Your logic)
            // If we are running on 'sistema.supercheckout.app', we are the system.
            const host = req.headers.host || '';
            if (!host.includes('supercheckout.app') && !host.includes('localhost')) {
                return res.status(403).json({ error: 'Forbidden: Upgrade to Commercial Plan to create licenses.' });
            }
        }

        // 3. Perform the Action (Secure Write)
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { data, error } = await supabase
            .from('licenses')
            .insert({
                client_name,
                client_email,
                plan: plan || 'lifetime',
                usage_type: usage_type || 'personal',
                expires_at: expires_at || null,
                status: 'active'
            })
            .select()
            .single();

        if (error) throw error;

        return res.status(200).json(data);

    } catch (error: any) {
        console.error('Create License Error:', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}

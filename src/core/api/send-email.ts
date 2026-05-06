
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from './_cors.js';

// Vercel Serverless Function Config
export const config = {
    maxDuration: 60,
};

function maskEmail(email?: string | null) {
    const [name, domain] = String(email || '').split('@');
    if (!name || !domain) return 'unknown';
    return `${name.slice(0, 2)}***@${domain}`;
}

function maskRecipients(to: unknown) {
    const recipients = Array.isArray(to) ? to : [to];
    return recipients.map((email) => maskEmail(String(email || ''))).join(', ');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    applyCors(req, res, 'GET,OPTIONS,POST');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // 2. Auth & Config
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Must be set in Vercel Env Vars

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error('[Send-Email] Missing Supabase Keys on Server');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        // 3. Fetch "resend" integration
        const { data: integrations, error: intError } = await supabaseAdmin
            .from('integrations')
            .select('*')
            .eq('name', 'resend')
            .eq('active', true)
            .limit(1);

        if (intError) {
            console.error('[Send-Email] DB Error:', intError);
            throw new Error('Failed to fetch integration configuration');
        }

        const integration = integrations?.[0];

        // Graceful degradation / Informative error
        if (!integration || !integration.config) {
            console.warn("[Send-Email] No active Resend integration found.");
            return res.status(400).json({
                error: "Email provider 'resend' is not active or configured.",
                details: "Please go to Settings > Integrations and activate Resend."
            });
        }

        const apiKey = integration.config.apiKey || integration.config.api_key;
        const fromEmail = integration.config.senderEmail || integration.config.from_email || "onboarding@resend.dev";

        if (!apiKey) {
            return res.status(400).json({ error: "Missing Resend API Key in configuration." });
        }

        // 4. Parse Request
        const { to, subject, html, plain_text, from_name } = req.body;

        if (!to) return res.status(400).json({ error: "Missing 'to' field" });
        if (!html && !plain_text) return res.status(400).json({ error: "Missing content (html or text)" });

        // Construct dynamic sender identity
        // Format: "Business Name <system@email.com>"
        const fromIdentity = from_name
            ? `"${from_name}" <${fromEmail}>`
            : fromEmail;

        const emailBody: any = {
            from: fromIdentity,
            to: Array.isArray(to) ? to : [to],
            subject: subject || 'No Subject',
        };

        if (html) emailBody.html = html;
        if (plain_text) emailBody.text = plain_text;

        console.log(`[Send-Email] Sending to ${maskRecipients(to)} via Resend as '${fromIdentity}'...`);

        // 5. Send via Resend
        const resendRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify(emailBody),
        });

        const dataRes = await resendRes.json();

        if (!resendRes.ok) {
            console.error("[Send-Email] Resend API Failed:", JSON.stringify(dataRes));
            return res.status(400).json({ 
                error: "Resend API rejected the request", 
                details: dataRes,
                suggestion: "Check if the sender email is verified in your Resend dashboard."
            });
        }

        console.log(`[Send-Email] Success. ID: ${dataRes.id}`);
        return res.status(200).json(dataRes);

    } catch (error: any) {
        console.error("[Send-Email] Critical Error:", error?.message || error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

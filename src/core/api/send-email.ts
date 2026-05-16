
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from './_cors.js';
import { logAuthzEvent, requireApiAuth } from './_authz.js';
import { enforceApiRateLimit } from './_rate-limit.js';

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

function parseBody(req: VercelRequest) {
    if (!req.body) return {};
    if (typeof req.body === 'string') {
        try {
            return JSON.parse(req.body);
        } catch {
            return {};
        }
    }
    return req.body;
}

function normalizeRecipients(to: unknown): string[] {
    const recipients = Array.isArray(to) ? to : [to];
    return recipients
        .map((email) => String(email || '').trim().toLowerCase())
        .filter(Boolean);
}

function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(value: unknown) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const ALLOWED_CONTENT_FLOWS = new Set([
    'ORDER_COMPLETED',
    'ACCESS_GRANTED',
    'BOLETO_GENERATED',
    'SYSTEM_EMAIL',
    'INTEGRATION_TEST',
]);

const APPROVED_MANUAL_TEMPLATES: Record<string, {
    subject: string;
    html: (variables: Record<string, unknown>) => string;
}> = {
    lead_welcome: {
        subject: 'Bem-vindo ao Super Checkout',
        html: (variables) => {
            const name = escapeHtml(variables.name || 'tudo bem');
            return `
                <h1>Bem-vindo ao Super Checkout</h1>
                <p>Ola, ${name}.</p>
                <p>Estamos felizes em ter voce conosco. O proximo passo e configurar seu primeiro dominio e gateway de pagamento.</p>
                <p>Se precisar de ajuda para comecar, responda este e-mail.</p>
            `;
        },
    },
    lead_setup_help: {
        subject: 'Precisa de ajuda com a configuracao?',
        html: (variables) => {
            const name = escapeHtml(variables.name || 'tudo bem');
            return `
                <h1>Ajuda com a configuracao</h1>
                <p>Ola, ${name}.</p>
                <p>Notamos que a configuracao do dominio ou gateway ainda nao foi finalizada.</p>
                <p>Essa etapa e importante para iniciar as vendas. Se estiver encontrando dificuldade, responda este e-mail para combinarmos o melhor proximo passo.</p>
            `;
        },
    },
    member_access_granted: {
        subject: 'Acesso liberado',
        html: (variables) => {
            const name = escapeHtml(variables.name || 'tudo bem');
            const memberAreaName = escapeHtml(variables.member_area_name || 'area de membros');
            const accessUrl = escapeHtml(variables.access_url || '');
            return `
                <h1>Acesso liberado</h1>
                <p>Ola, ${name}.</p>
                <p>Seu acesso a ${memberAreaName} foi liberado.</p>
                ${accessUrl ? `<p><a href="${accessUrl}">Acessar agora</a></p>` : ''}
            `;
        },
    },
};

function resolveApprovedContent(body: Record<string, any>) {
    const templateKey = String(body.template_key || '').trim();
    if (templateKey) {
        const template = APPROVED_MANUAL_TEMPLATES[templateKey];
        if (!template) return null;

        const variables = body.variables && typeof body.variables === 'object' ? body.variables : {};
        return {
            subject: template.subject,
            html: template.html(variables),
            flow: `manual:${templateKey}`,
        };
    }

    const flow = String(body.flow || '').trim();
    if (!ALLOWED_CONTENT_FLOWS.has(flow)) return null;

    return {
        subject: String(body.subject || '').trim(),
        html: body.html ? String(body.html) : '',
        text: body.plain_text ? String(body.plain_text) : '',
        flow,
    };
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
        const auth = await requireApiAuth(req, res, {
            source: 'send_email',
            allowedRoles: ['admin', 'owner', 'master_admin'],
        });
        if (!auth) return;

        const { supabaseAdmin, user } = auth;
        const body = parseBody(req) as Record<string, any>;
        const { to, from_name } = body;
        const recipients = normalizeRecipients(to);

        const rateLimit = enforceApiRateLimit(req, res, {
            scope: 'send_email',
            identifiers: [user.id, recipients.join(',')],
            limit: 12,
            windowMs: 15 * 60 * 1000,
        });

        if (!rateLimit.allowed) {
            await logAuthzEvent({
                supabaseAdmin,
                req,
                source: 'send_email',
                eventType: 'email_rate_limited',
                severity: 'WARNING',
                userId: user.id,
                metadata: { recipient_count: recipients.length },
            });
            return res.status(429).json({ error: 'Too many email attempts' });
        }

        const { data: integrations, error: intError } = await supabaseAdmin
            .from('integrations')
            .select('*')
            .eq('user_id', user.id)
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
        const fromEmail = integration.config.senderEmail || integration.config.from_email;

        if (!apiKey) {
            return res.status(400).json({ error: "Missing Resend API Key in configuration." });
        }

        if (!fromEmail || !isValidEmail(String(fromEmail))) {
            return res.status(400).json({ error: 'Invalid sender email configuration.' });
        }

        if (recipients.length === 0) return res.status(400).json({ error: "Missing 'to' field" });
        if (recipients.length > 5) return res.status(400).json({ error: 'Too many recipients' });
        if (!recipients.every(isValidEmail)) return res.status(400).json({ error: 'Invalid recipient email' });

        const approvedContent = resolveApprovedContent(body);
        if (!approvedContent || (!approvedContent.html && !approvedContent.text)) {
            await logAuthzEvent({
                supabaseAdmin,
                req,
                source: 'send_email',
                eventType: 'email_rejected',
                severity: 'WARNING',
                userId: user.id,
                metadata: { reason: 'unapproved_template_or_flow' },
            });
            return res.status(400).json({ error: 'Email template or flow is not approved' });
        }

        const safeSubject = String(approvedContent.subject || '').trim().slice(0, 180);
        const safeHtml = approvedContent.html ? String(approvedContent.html).slice(0, 100_000) : '';
        const safeText = approvedContent.text ? String(approvedContent.text).slice(0, 20_000) : '';
        const safeFromName = from_name ? String(from_name).replace(/[<>"\r\n]/g, '').trim().slice(0, 80) : '';

        const fromIdentity = from_name
            ? `"${safeFromName}" <${fromEmail}>`
            : fromEmail;

        const emailBody: any = {
            from: fromIdentity,
            to: recipients,
            subject: safeSubject || 'No Subject',
        };

        if (safeHtml) emailBody.html = safeHtml;
        if (safeText) emailBody.text = safeText;

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
            console.error("[Send-Email] Resend API Failed:", {
                status: resendRes.status,
                name: dataRes?.name || null,
                message: dataRes?.message || null,
            });
            return res.status(400).json({ 
                error: "Resend API rejected the request",
                suggestion: "Check if the sender email is verified in your Resend dashboard.",
            });
        }

        await logAuthzEvent({
            supabaseAdmin,
            req,
            source: 'send_email',
            eventType: 'email_sent',
            severity: 'INFO',
            userId: user.id,
            metadata: {
                recipient_count: recipients.length,
                provider: 'resend',
                flow: approvedContent.flow,
                resend_id: dataRes?.id || null,
            },
        });

        console.log(`[Send-Email] Success. ID: ${dataRes.id}`);
        return res.status(200).json(dataRes);

    } catch (error: any) {
        console.error("[Send-Email] Critical Error:", error?.message || error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

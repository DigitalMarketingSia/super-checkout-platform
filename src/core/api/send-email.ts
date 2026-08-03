
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors } from './_cors.js';
import { logAuthzEvent, requireApiAuth } from './_authz.js';
import { enforceApiRateLimit } from './_rate-limit.js';
import {
    buildCentralControlPlaneTrustHeaders,
    getCentralControlPlaneHmacKey,
} from './_central-control-plane-trust.js';

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

const PLATFORM_SYSTEM_TEMPLATE_VARIABLES: Record<string, Set<string>> = {
    SYSTEM_ORDER_COMPLETED: new Set(['{{portal_url}}', '{{license_key}}', '{{plan_name}}', '{{customer_name}}', '{{order_id}}']),
    SYSTEM_ACCESS_GRANTED: new Set(['{{portal_url}}', '{{customer_name}}']),
    WELCOME_FREE: new Set(['{{name}}', '{{portal_url}}']),
    UPGRADE_UNLIMITED: new Set(['{{name}}', '{{support_url}}']),
    UPGRADE_PARTNER: new Set(['{{name}}', '{{partner_portal_url}}']),
};

const PLATFORM_SYSTEM_TEMPLATE_KEYS: Record<string, string> = {
    SYSTEM_ORDER_COMPLETED: 'PLATFORM_SYSTEM_ORDER_COMPLETED',
    SYSTEM_ACCESS_GRANTED: 'PLATFORM_SYSTEM_ACCESS_GRANTED',
    WELCOME_FREE: 'PLATFORM_ACCOUNT_WELCOME_FREE',
    UPGRADE_UNLIMITED: 'PLATFORM_UPGRADE_UNLIMITED',
    UPGRADE_PARTNER: 'PLATFORM_UPGRADE_PARTNER',
};

const PLATFORM_SYSTEM_TEMPLATE_PROFILES: Record<string, 'account' | 'upgrade' | 'installation' | 'notification'> = {
    PLATFORM_SYSTEM_ORDER_COMPLETED: 'account',
    PLATFORM_SYSTEM_ACCESS_GRANTED: 'account',
    PLATFORM_ACCOUNT_WELCOME_FREE: 'account',
    PLATFORM_UPGRADE_UNLIMITED: 'upgrade',
    PLATFORM_UPGRADE_PARTNER: 'upgrade',
};

const OFFICIAL_CENTRAL_API_URL = 'https://bcmnryxjweiovrwmztpn.supabase.co/functions/v1';

function resolveCentralApiUrl() {
    return String(
        process.env.CENTRAL_API_URL
        || process.env.VITE_CENTRAL_API_URL
        || process.env.NEXT_PUBLIC_CENTRAL_API_URL
        || OFFICIAL_CENTRAL_API_URL,
    ).replace(/\/+$/, '');
}

function normalizeTemplateLanguage(value: unknown) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized.startsWith('en')) return 'en';
    if (normalized.startsWith('es')) return 'es';
    return 'pt';
}

async function resolvePlatformTemplate(
    body: Record<string, any>,
) {
    const requestedTemplateKey = String(body.template_key || '').trim();
    const templateKey = PLATFORM_SYSTEM_TEMPLATE_KEYS[requestedTemplateKey];
    const allowedVariables = PLATFORM_SYSTEM_TEMPLATE_VARIABLES[requestedTemplateKey];
    if (!allowedVariables) return null;

    const variables = body.variables && typeof body.variables === 'object' && !Array.isArray(body.variables)
        ? Object.fromEntries(
            Object.entries(body.variables).map(([key, value]) => [key, String(value ?? '')]),
        )
        : {};

    if (Object.keys(variables).some((key) => !allowedVariables.has(key))) return null;

    return {
        subject: '',
        html: '',
        text: '',
        flow: 'SYSTEM_EMAIL',
        template_key: templateKey,
        language: normalizeTemplateLanguage(body.language),
        variables,
    };
}

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

async function resolveApprovedContent(body: Record<string, any>) {
    const flow = String(body.flow || '').trim();
    if (flow === 'SYSTEM_EMAIL') {
        return resolvePlatformTemplate(body);
    }

    const templateKey = String(body.template_key || '').trim();
    if (templateKey) {
        const template = APPROVED_MANUAL_TEMPLATES[templateKey];
        if (!template) return null;

        const variables = body.variables && typeof body.variables === 'object' ? body.variables : {};
        return {
            subject: template.subject,
            html: template.html(variables),
            text: '',
            flow: `manual:${templateKey}`,
            template_key: templateKey,
            language: null,
            variables: null,
        };
    }

    if (!ALLOWED_CONTENT_FLOWS.has(flow)) return null;

    return {
        subject: String(body.subject || '').trim(),
        html: body.html ? String(body.html) : '',
        text: body.plain_text ? String(body.plain_text) : '',
        flow,
        template_key: null,
        language: null,
        variables: null,
    };
}

function isPlatformSystemFlow(body: Record<string, any>) {
    return String(body.flow || '').trim().toUpperCase() === 'SYSTEM_EMAIL';
}

async function dispatchPlatformEmailThroughCentral(params: {
    to: string[];
    profile: 'account' | 'upgrade' | 'installation' | 'notification';
    templateKey: string;
    language: string;
    variables: Record<string, string>;
}) {
    let key: string | null = null;
    try {
        key = getCentralControlPlaneHmacKey();
    } catch (error: any) {
        return { ok: false, status: 503, error: error?.message || 'central_control_plane_key_invalid', id: null };
    }
    if (!key) return { ok: false, status: 503, error: 'central_control_plane_key_missing', id: null };

    const rawBody = JSON.stringify({
        to: params.to,
        profile: params.profile,
        template_key: params.templateKey,
        language: params.language,
        variables: params.variables,
    });
    const headers = buildCentralControlPlaneTrustHeaders({
        key,
        method: 'POST',
        endpoint: 'platform-email',
        rawBody,
    });

    try {
        const response = await fetch(`${resolveCentralApiUrl()}/platform-email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
            body: rawBody,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.status !== 'sent') {
            return {
                ok: false,
                status: response.status || 502,
                error: payload?.error || 'central_platform_email_failed',
                id: payload?.id || null,
            };
        }
        return { ok: true, status: 200, error: null, id: payload?.id || null };
    } catch (error: any) {
        return { ok: false, status: 502, error: error?.message || 'central_platform_email_unreachable', id: null };
    }
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

        const { supabaseAdmin, user, role } = auth;
        const body = parseBody(req) as Record<string, any>;
        const { to, from_name } = body;
        const recipients = normalizeRecipients(to);

        // Platform templates are not tenant mail. During the migration to the
        // Central dispatcher, keep the legacy flow available only to the
        // global system actor. Tenant owners/admins must use the business
        // templates/flows and cannot submit arbitrary platform HTML.
        if (isPlatformSystemFlow(body) && role !== 'master_admin') {
            await logAuthzEvent({
                supabaseAdmin,
                req,
                source: 'send_email',
                eventType: 'platform_email_scope_rejected',
                severity: 'CRITICAL',
                userId: user.id,
                metadata: { role, recipient_count: recipients.length },
            });
            return res.status(403).json({ error: 'Platform email flow is restricted' });
        }

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

        let apiKey = '';
        let fromEmail = '';
        if (!isPlatformSystemFlow(body)) {
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
            if (!integration || !integration.config) {
                console.warn("[Send-Email] No active Resend integration found.");
                return res.status(400).json({
                    error: "Email provider 'resend' is not active or configured.",
                    details: "Please go to Settings > Integrations and activate Resend."
                });
            }

            apiKey = integration.config.apiKey || integration.config.api_key;
            fromEmail = integration.config.senderEmail || integration.config.from_email;

            if (!apiKey) {
                return res.status(400).json({ error: "Missing Resend API Key in configuration." });
            }

            if (!fromEmail || !isValidEmail(String(fromEmail))) {
                return res.status(400).json({ error: 'Invalid sender email configuration.' });
            }
        }

        if (recipients.length === 0) return res.status(400).json({ error: "Missing 'to' field" });
        if (recipients.length > 5) return res.status(400).json({ error: 'Too many recipients' });
        if (!recipients.every(isValidEmail)) return res.status(400).json({ error: 'Invalid recipient email' });

        const approvedContent = await resolveApprovedContent(body);
        if (!approvedContent) {
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

        if (isPlatformSystemFlow(body)) {
            const templateKey = String(approvedContent.template_key || body.template_key || '').trim();
            const variables = approvedContent.variables && typeof approvedContent.variables === 'object'
                ? approvedContent.variables
                : {};
            const result = await dispatchPlatformEmailThroughCentral({
                to: recipients,
                profile: PLATFORM_SYSTEM_TEMPLATE_PROFILES[templateKey] || 'notification',
                templateKey,
                language: approvedContent.language || 'pt',
                variables,
            });

            if (!result.ok) {
                await logAuthzEvent({
                    supabaseAdmin,
                    req,
                    source: 'send_email',
                    eventType: 'platform_email_dispatch_failed',
                    severity: 'CRITICAL',
                    userId: user.id,
                    metadata: { template_key: templateKey, status: result.status, reason: result.error },
                });
                return res.status(result.status).json({ error: 'Platform email dispatch failed', code: result.error });
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
                    provider: 'central_resend',
                    flow: approvedContent.flow,
                    template_key: templateKey || null,
                    resend_id: result.id,
                },
            });

            return res.status(200).json({ id: result.id, provider: 'central_resend' });
        }

        const safeSubject = String(approvedContent.subject || '').trim().slice(0, 180);
        const safeHtml = approvedContent.html ? String(approvedContent.html).slice(0, 100_000) : '';
        const safeText = approvedContent.text ? String(approvedContent.text).slice(0, 20_000) : '';
        if (!safeHtml && !safeText) {
            return res.status(400).json({ error: 'Email template or flow is not approved' });
        }

        const safeFromName = from_name
            ? String(from_name).replace(/[<>"\r\n]/g, '').trim().slice(0, 80)
            : '';

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
                template_key: approvedContent.template_key || null,
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

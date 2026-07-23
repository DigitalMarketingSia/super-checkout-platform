// api/admin/members.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { applyCors } from '../_cors.js';
import { enforceApiRateLimit } from '../_rate-limit.js';
import {
    getMemberAccessEmailTemplate,
    normalizeMemberAccessEmailLanguage,
    type MemberAccessEmailTemplateEventType,
    type MemberAccessEmailTemplateLanguage,
} from '../../services/memberAccessEmailTemplates.js';
import {
    logAuthzEvent,
    requireApiAuth,
    type ApiAuthContext,
    type ApiRole,
    type AuthzSeverity,
} from '../_authz.js';

function maskEmail(email?: string | null) {
    const [name, domain] = String(email || '').split('@');
    if (!name || !domain) return 'unknown';
    return `${name.slice(0, 2)}***@${domain}`;
}

function normalizeEmail(value: unknown) {
    return String(value || '').trim().toLowerCase();
}

function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getStringArray(value: unknown) {
    return Array.isArray(value)
        ? value.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
}

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function generateInternalPassword() {
    return `${randomBytes(24).toString('base64url')}A1!`;
}

function escapeHtml(value: unknown) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getRequestBaseUrl(req: VercelRequest) {
    return String(req.headers.origin || 'https://super-checkout.vercel.app').replace(/\/$/, '');
}

function getMemberAccessUrl(req: VercelRequest, memberAreaSlug?: string) {
    const baseUrl = getRequestBaseUrl(req);
    const slug = String(memberAreaSlug || '').trim();
    return slug
        ? `${baseUrl}/app/${encodeURIComponent(slug)}/login`
        : `${baseUrl}/login`;
}

function getMemberMagicLinkUrl(req: VercelRequest, memberAreaSlug?: string) {
    return `${getMemberAccessUrl(req, memberAreaSlug)}?email_access=1`;
}

function getMemberPasswordSetupUrl(req: VercelRequest, memberAreaSlug?: string) {
    const baseUrl = getRequestBaseUrl(req);
    const slug = String(memberAreaSlug || '').trim();
    const encodedSlug = encodeURIComponent(slug);
    const nextPath = slug ? `/app/${encodedSlug}` : '/';
    const updatePasswordPath = slug ? `/app/${encodedSlug}/update-password` : '/update-password';

    return `${baseUrl}${updatePasswordPath}?scope=member&next=${encodeURIComponent(nextPath)}`;
}

type MemberEmailDelivery = {
    apiKey: string;
    from: string;
    businessName: string;
    language: MemberAccessEmailTemplateLanguage;
};

function replaceTemplateVariables(value: string, variables: Record<string, string>) {
    return Object.entries(variables).reduce(
        (rendered, [variable, replacement]) => rendered.split(variable).join(replacement),
        value,
    );
}

async function loadMemberResendIntegration(supabaseAdmin: SupabaseClient, ownerId: string) {
    const { data: ownerIntegration } = await supabaseAdmin
        .from('integrations')
        .select('config')
        .eq('name', 'resend')
        .eq('active', true)
        .eq('user_id', ownerId)
        .limit(1)
        .maybeSingle();

    if (ownerIntegration) return ownerIntegration;

    const { data: globalIntegration } = await supabaseAdmin
        .from('integrations')
        .select('config')
        .eq('name', 'resend')
        .eq('active', true)
        .limit(1)
        .maybeSingle();

    return globalIntegration;
}

async function loadMemberBusinessSettings(supabaseAdmin: SupabaseClient, ownerId: string) {
    const { data: account } = await supabaseAdmin
        .from('accounts')
        .select('id')
        .eq('owner_user_id', ownerId)
        .limit(1)
        .maybeSingle();

    if (account?.id) {
        const { data: ownerSettings } = await supabaseAdmin
            .from('business_settings')
            .select('sender_name,business_name,sender_email')
            .eq('account_id', account.id)
            .limit(1)
            .maybeSingle();
        if (ownerSettings) return ownerSettings;
    }

    const { data: globalSettings } = await supabaseAdmin
        .from('business_settings')
        .select('sender_name,business_name,sender_email')
        .limit(1)
        .maybeSingle();
    return globalSettings;
}

async function resolveMemberEmailDelivery(supabaseAdmin: SupabaseClient, ownerId: string): Promise<MemberEmailDelivery | null> {
    const [integration, settings, systemConfigResult] = await Promise.all([
        loadMemberResendIntegration(supabaseAdmin, ownerId),
        loadMemberBusinessSettings(supabaseAdmin, ownerId),
        supabaseAdmin.from('system_config').select('default_locale').limit(1).maybeSingle(),
    ]);

    const apiKey = String(integration?.config?.apiKey || integration?.config?.api_key || '').trim();
    if (!apiKey) return null;

    const fromEmail = String(
        integration?.config?.senderEmail
        || integration?.config?.from_email
        || settings?.sender_email
        || 'onboarding@resend.dev',
    ).replace(/.*<|>/g, '').trim();
    if (!fromEmail) return null;

    const senderName = String(settings?.sender_name || settings?.business_name || 'Super Checkout').trim();
    return {
        apiKey,
        from: senderName ? `${senderName} <${fromEmail}>` : fromEmail,
        businessName: String(settings?.business_name || senderName || 'Super Checkout').trim(),
        language: normalizeMemberAccessEmailLanguage(systemConfigResult.data?.default_locale),
    };
}

async function loadMemberEmailTemplate(
    supabaseAdmin: SupabaseClient,
    eventType: MemberAccessEmailTemplateEventType,
    preferredLanguage: MemberAccessEmailTemplateLanguage,
) {
    const { data, error } = await supabaseAdmin
        .from('email_templates')
        .select('language,subject,html_body,active')
        .eq('event_type', eventType)
        .eq('active', true)
        .limit(10);

    if (error) {
        console.warn('[admin_members] Failed to load member email template:', error.message);
        return null;
    }

    const templates = Array.isArray(data) ? data : [];
    return templates.sort((left: any, right: any) => {
        const score = (template: any) => {
            const language = normalizeMemberAccessEmailLanguage(template?.language);
            return language === preferredLanguage ? 2 : language === 'pt' ? 1 : 0;
        };
        return score(right) - score(left);
    })[0] || null;
}

async function generateMemberActionLink(params: {
    supabaseAdmin: SupabaseClient;
    email: string;
    type: 'recovery' | 'magiclink';
    redirectTo: string;
}) {
    const { data, error } = await params.supabaseAdmin.auth.admin.generateLink({
        type: params.type,
        email: params.email,
        options: { redirectTo: params.redirectTo },
    });
    const actionLink = String(data?.properties?.action_link || '');
    if (error || !actionLink) {
        throw new Error(error?.message || 'member_action_link_generation_failed');
    }
    return actionLink;
}

async function sendMemberAccessEmail(params: {
    supabaseAdmin: SupabaseClient;
    delivery: MemberEmailDelivery;
    eventType: MemberAccessEmailTemplateEventType;
    email: string;
    name: string;
    memberAreaName: string;
    accessUrl: string;
}) {
    const fallbackTemplate = getMemberAccessEmailTemplate(params.eventType, params.delivery.language);
    if (!fallbackTemplate) throw new Error('member_email_template_missing');

    const customTemplate = await loadMemberEmailTemplate(
        params.supabaseAdmin,
        params.eventType,
        params.delivery.language,
    );
    const variables = {
        '{{customer_name}}': escapeHtml(params.name || (params.delivery.language === 'en' ? 'Customer' : 'Cliente')),
        '{{member_area_name}}': escapeHtml(params.memberAreaName || 'Área de membros'),
        '{{access_url}}': escapeHtml(params.accessUrl),
        '{{business_name}}': escapeHtml(params.delivery.businessName),
    };
    const subject = replaceTemplateVariables(customTemplate?.subject || fallbackTemplate.subject, variables);
    const html = replaceTemplateVariables(customTemplate?.html_body || fallbackTemplate.htmlBody, variables);

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${params.delivery.apiKey}`,
        },
        body: JSON.stringify({
            from: params.delivery.from,
            to: [params.email],
            subject,
            html,
        }),
    });

    if (!response.ok) {
        const responseData = await response.json().catch(() => ({}));
        throw new Error(`member_email_delivery_failed:${response.status}:${JSON.stringify(responseData).slice(0, 200)}`);
    }
}

async function sendNativeMemberEmail(params: {
    supabaseAdmin: SupabaseClient;
    email: string;
    type: 'recovery' | 'magiclink';
    redirectTo: string;
}) {
    if (params.type === 'recovery') {
        const { error } = await params.supabaseAdmin.auth.resetPasswordForEmail(params.email, {
            redirectTo: params.redirectTo,
        });
        if (error) throw error;
        return;
    }

    const { error } = await params.supabaseAdmin.auth.signInWithOtp({
        email: params.email,
        options: { emailRedirectTo: params.redirectTo },
    });
    if (error) throw error;
}

async function findAuthUserByEmail(supabaseAdmin: SupabaseClient, email: string) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return null;

    const perPage = 100;
    for (let page = 1; page <= 100; page += 1) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
        if (error) throw error;

        const user = data?.users?.find((candidate: any) => normalizeEmail(candidate.email) === normalizedEmail);
        if (user) return user;

        if (!data?.users || data.users.length < perPage) break;
    }

    return null;
}

async function logMemberAuthzEvent(params: {
    auth: ApiAuthContext;
    req: VercelRequest;
    eventType: string;
    severity: AuthzSeverity;
    metadata?: Record<string, unknown>;
}) {
    await logAuthzEvent({
        supabaseAdmin: params.auth.supabaseAdmin,
        req: params.req,
        source: 'admin_members',
        eventType: params.eventType,
        severity: params.severity,
        userId: params.auth.user.id,
        metadata: params.metadata,
    });
}

async function resolveMemberAreaAccessIds(supabaseAdmin: SupabaseClient, memberAreaId?: string) {
    if (!memberAreaId) return { contentIds: [] as string[], productIds: [] as string[] };

    const { data: directProducts, error: directProductsError } = await supabaseAdmin
        .from('products')
        .select('id')
        .eq('member_area_id', memberAreaId);

    if (directProductsError) throw directProductsError;

    const directProductIds = (directProducts || []).map((product: any) => product.id).filter(Boolean);

    const { data: contents, error: contentsError } = await supabaseAdmin
        .from('contents')
        .select('id')
        .eq('member_area_id', memberAreaId);

    if (contentsError) throw contentsError;

    const contentIds = (contents || []).map((content: any) => content.id).filter(Boolean);
    if (contentIds.length === 0) return { contentIds, productIds: directProductIds };

    const { data: productLinks, error: productLinksError } = await supabaseAdmin
        .from('product_contents')
        .select('product_id')
        .in('content_id', contentIds);

    if (productLinksError) throw productLinksError;

    const productIds = Array.from(new Set([
        ...directProductIds,
        ...(productLinks || []).map((link: any) => link.product_id).filter(Boolean),
    ]));
    return { contentIds, productIds };
}

async function updateMemberAreaAccess(
    supabaseAdmin: SupabaseClient,
    userId: string,
    status: 'active' | 'suspended' | 'revoked',
    memberAreaId?: string,
) {
    const { contentIds, productIds } = await resolveMemberAreaAccessIds(supabaseAdmin, memberAreaId);
    const updates: PromiseLike<any>[] = [];

    if (memberAreaId) {
        if (productIds.length > 0) {
            updates.push(
                supabaseAdmin
                    .from('access_grants')
                    .update({ status })
                    .eq('user_id', userId)
                    .in('product_id', productIds),
            );
        }

        if (contentIds.length > 0) {
            updates.push(
                supabaseAdmin
                    .from('access_grants')
                    .update({ status })
                    .eq('user_id', userId)
                    .in('content_id', contentIds),
            );
        }

        if (updates.length === 0) return;
    } else {
        updates.push(
            supabaseAdmin
                .from('access_grants')
                .update({ status })
                .eq('user_id', userId),
        );
    }

    const results = await Promise.all(updates);
    const failed = results.find((result: any) => result.error);
    if (failed?.error) throw failed.error;
}

async function deleteMemberAreaAccess(supabaseAdmin: SupabaseClient, userId: string, memberAreaId?: string) {
    const { contentIds, productIds } = await resolveMemberAreaAccessIds(supabaseAdmin, memberAreaId);
    const deletes: PromiseLike<any>[] = [];

    if (memberAreaId) {
        if (productIds.length > 0) {
            deletes.push(
                supabaseAdmin
                    .from('access_grants')
                    .delete()
                    .eq('user_id', userId)
                    .in('product_id', productIds),
            );
        }

        if (contentIds.length > 0) {
            deletes.push(
                supabaseAdmin
                    .from('access_grants')
                    .delete()
                    .eq('user_id', userId)
                    .in('content_id', contentIds),
            );
        }

        if (deletes.length === 0) return;
    } else {
        deletes.push(
            supabaseAdmin
                .from('access_grants')
                .delete()
                .eq('user_id', userId),
        );
    }

    const results = await Promise.all(deletes);
    const failed = results.find((result: any) => result.error);
    if (failed?.error) throw failed.error;
}

function isMissingAccessGrantConflictConstraint(error: { message?: string | null; code?: string | null } | null | undefined) {
    const message = String(error?.message || '').toLowerCase();
    return error?.code === '42P10'
        || message.includes('no unique or exclusion constraint matching the on conflict specification');
}

async function grantProductAccess(
    supabaseAdmin: SupabaseClient,
    userId: string,
    productIds: string[],
) {
    if (productIds.length === 0) return;

    const nowIso = new Date().toISOString();
    const grants = productIds.map((productId) => ({
        user_id: userId,
        product_id: productId,
        status: 'active',
        granted_at: nowIso,
    }));

    const { error: upsertError } = await supabaseAdmin
        .from('access_grants')
        .upsert(grants, { onConflict: 'user_id, product_id' });

    if (!upsertError) return;
    if (!isMissingAccessGrantConflictConstraint(upsertError)) throw upsertError;

    const { data: existingRows, error: existingError } = await supabaseAdmin
        .from('access_grants')
        .select('id,product_id')
        .eq('user_id', userId)
        .in('product_id', productIds);

    if (existingError) throw existingError;

    const existingProductIds = new Set(
        (existingRows || []).map((row: any) => String(row.product_id || '')).filter(Boolean),
    );
    const missingProductIds = productIds.filter((productId) => !existingProductIds.has(productId));

    if (existingProductIds.size > 0) {
        const { error: updateError } = await supabaseAdmin
            .from('access_grants')
            .update({ status: 'active', granted_at: nowIso })
            .eq('user_id', userId)
            .in('product_id', Array.from(existingProductIds));

        if (updateError) throw updateError;
    }

    if (missingProductIds.length > 0) {
        const fallbackRows = missingProductIds.map((productId) => ({
            user_id: userId,
            product_id: productId,
            status: 'active',
            granted_at: nowIso,
        }));

        const { error: insertError } = await supabaseAdmin
            .from('access_grants')
            .insert(fallbackRows);

        if (insertError) throw insertError;
    }
}

async function requireOwnedMemberArea(
    auth: ApiAuthContext,
    req: VercelRequest,
    res: VercelResponse,
    memberAreaId?: string,
) {
    if (!memberAreaId || !isUuid(memberAreaId)) {
        res.status(400).json({ error: 'Member area is required' });
        return null;
    }

    const { data: memberArea, error } = await auth.supabaseAdmin
        .from('member_areas')
        .select('id,owner_id,name,slug')
        .eq('id', memberAreaId)
        .maybeSingle();

    if (error) {
        console.error('[admin_members] Failed to load member area ownership:', error.message);
        await logMemberAuthzEvent({
            auth,
            req,
            eventType: 'member_operation_rejected',
            severity: 'CRITICAL',
            metadata: { reason: 'member_area_lookup_failed', member_area_id: memberAreaId },
        });
        res.status(500).json({ error: 'Internal Server Error' });
        return null;
    }

    if (!memberArea) {
        res.status(404).json({ error: 'Member area not found' });
        return null;
    }

    if (memberArea.owner_id !== auth.user.id) {
        await logMemberAuthzEvent({
            auth,
            req,
            eventType: 'member_operation_rejected',
            severity: 'CRITICAL',
            metadata: {
                reason: 'member_area_owner_mismatch',
                member_area_id: memberAreaId,
                owner_id: memberArea.owner_id,
            },
        });
        res.status(403).json({ error: 'Access denied' });
        return null;
    }

    return memberArea;
}

async function requireOwnedProductsForArea(
    auth: ApiAuthContext,
    req: VercelRequest,
    res: VercelResponse,
    productIds: string[],
    memberAreaId?: string,
) {
    const uniqueIds = Array.from(new Set(productIds));
    if (uniqueIds.length === 0) return uniqueIds;

    if (uniqueIds.length > 50 || uniqueIds.some((id) => !isUuid(id))) {
        res.status(400).json({ error: 'Invalid product selection' });
        return null;
    }

    const { data: products, error } = await auth.supabaseAdmin
        .from('products')
        .select('id,user_id,member_area_id')
        .in('id', uniqueIds);

    if (error) {
        console.error('[admin_members] Failed to load product ownership:', error.message);
        await logMemberAuthzEvent({
            auth,
            req,
            eventType: 'member_operation_rejected',
            severity: 'CRITICAL',
            metadata: { reason: 'product_lookup_failed', product_count: uniqueIds.length },
        });
        res.status(500).json({ error: 'Internal Server Error' });
        return null;
    }

    const productMap = new Map((products || []).map((product: any) => [String(product.id), product]));
    const missingOrForeign = uniqueIds.filter((id) => {
        const product = productMap.get(id);
        return !product || product.user_id !== auth.user.id;
    });

    if (missingOrForeign.length > 0) {
        await logMemberAuthzEvent({
            auth,
            req,
            eventType: 'member_operation_rejected',
            severity: 'CRITICAL',
            metadata: {
                reason: 'product_owner_mismatch',
                product_count: uniqueIds.length,
                rejected_count: missingOrForeign.length,
            },
        });
        res.status(403).json({ error: 'Access denied' });
        return null;
    }

    if (!memberAreaId) return uniqueIds;

    const linkedByColumn = new Set(
        (products || [])
            .filter((product: any) => product.member_area_id === memberAreaId)
            .map((product: any) => String(product.id)),
    );
    const needsContentLinkCheck = uniqueIds.filter((id) => !linkedByColumn.has(id));

    if (needsContentLinkCheck.length === 0) return uniqueIds;

    const { data: productContents, error: linksError } = await auth.supabaseAdmin
        .from('product_contents')
        .select('product_id,content_id')
        .in('product_id', needsContentLinkCheck);

    if (linksError) {
        console.error('[admin_members] Failed to load product content links:', linksError.message);
        res.status(500).json({ error: 'Internal Server Error' });
        return null;
    }

    const contentIds = Array.from(new Set((productContents || []).map((link: any) => link.content_id).filter(Boolean)));
    let areaContentIds = new Set<string>();

    if (contentIds.length > 0) {
        const { data: contents, error: contentsError } = await auth.supabaseAdmin
            .from('contents')
            .select('id,member_area_id')
            .in('id', contentIds)
            .eq('member_area_id', memberAreaId);

        if (contentsError) {
            console.error('[admin_members] Failed to validate product area links:', contentsError.message);
            res.status(500).json({ error: 'Internal Server Error' });
            return null;
        }

        areaContentIds = new Set((contents || []).map((content: any) => String(content.id)));
    }

    const linkedByContent = new Set(
        (productContents || [])
            .filter((link: any) => areaContentIds.has(String(link.content_id)))
            .map((link: any) => String(link.product_id)),
    );
    const invalidAreaLinks = needsContentLinkCheck.filter((id) => !linkedByContent.has(id));

    if (invalidAreaLinks.length > 0) {
        await logMemberAuthzEvent({
            auth,
            req,
            eventType: 'member_operation_rejected',
            severity: 'CRITICAL',
            metadata: {
                reason: 'product_member_area_mismatch',
                member_area_id: memberAreaId,
                rejected_count: invalidAreaLinks.length,
            },
        });
        res.status(403).json({ error: 'Access denied' });
        return null;
    }

    return uniqueIds;
}

async function memberHasAccessInArea(supabaseAdmin: SupabaseClient, userId: string, memberAreaId: string) {
    const { contentIds, productIds } = await resolveMemberAreaAccessIds(supabaseAdmin, memberAreaId);
    const checks: PromiseLike<any>[] = [];

    if (productIds.length > 0) {
        checks.push(
            supabaseAdmin
                .from('access_grants')
                .select('id')
                .eq('user_id', userId)
                .in('product_id', productIds)
                .limit(1),
        );
    }

    if (contentIds.length > 0) {
        checks.push(
            supabaseAdmin
                .from('access_grants')
                .select('id')
                .eq('user_id', userId)
                .in('content_id', contentIds)
                .limit(1),
        );
    }

    if (checks.length === 0) return false;

    const results = await Promise.all(checks);
    const failed = results.find((result: any) => result.error);
    if (failed?.error) throw failed.error;

    return results.some((result: any) => Array.isArray(result.data) && result.data.length > 0);
}

async function getMemberAreaEmailContext(
    supabaseAdmin: SupabaseClient,
    ownerId: string,
    productIds: string[],
    fallback?: { slug?: string | null; name?: string | null },
) {
    if (fallback?.slug || fallback?.name) {
        return {
            slug: fallback.slug || '',
            name: fallback.name || '',
        };
    }

    if (productIds.length === 0) return { slug: '', name: '' };

    const { data: pcData } = await supabaseAdmin
        .from('product_contents')
        .select('content_id')
        .eq('product_id', productIds[0])
        .limit(1)
        .maybeSingle();

    if (!pcData?.content_id) return { slug: '', name: '' };

    const { data: contentData } = await supabaseAdmin
        .from('contents')
        .select('member_area_id')
        .eq('id', pcData.content_id)
        .maybeSingle();

    if (!contentData?.member_area_id) return { slug: '', name: '' };

    const { data: memberArea } = await supabaseAdmin
        .from('member_areas')
        .select('slug,name')
        .eq('id', contentData.member_area_id)
        .eq('owner_id', ownerId)
        .maybeSingle();

    return {
        slug: memberArea?.slug || '',
        name: memberArea?.name || '',
    };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    applyCors(req, res, 'GET,OPTIONS,PATCH,DELETE,POST,PUT');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const body = typeof req.body === 'object' && req.body ? req.body as Record<string, any> : {};
    const { action, ...data } = body;
    const allowedRoles: ApiRole[] = action === 'promote_admin'
        ? ['owner', 'master_admin']
        : ['owner', 'admin', 'master_admin'];
    const auth = await requireApiAuth(req, res, {
        source: 'admin_members',
        allowedRoles,
    });
    if (!auth) return;

    const { supabaseAdmin } = auth;
    const normalizedAction = String(action || 'unknown').trim().toLowerCase();
    const rateLimit = enforceApiRateLimit(req, res, {
        scope: `admin_members:${normalizedAction}`,
        identifiers: [
            auth.user.id,
            normalizeEmail(data.email),
            String(data.userId || '').trim(),
            String(data.memberAreaId || '').trim(),
        ],
        limit: ['create', 'resend_email', 'promote_admin'].includes(normalizedAction) ? 20 : 60,
        windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
        await logMemberAuthzEvent({
            auth,
            req,
            eventType: 'member_operation_rate_limited',
            severity: 'WARNING',
            metadata: {
                action: normalizedAction,
                member_area_id: String(data.memberAreaId || '').trim() || null,
            },
        });
        return res.status(429).json({ error: 'Too many requests' });
    }

    try {
        if (action === 'create') {
            const email = normalizeEmail(data.email);
            const name = String(data.name || '').trim().slice(0, 120);
            const memberAreaId = String(data.memberAreaId || '').trim();
            const requestedProductIds = getStringArray(data.productIds);

            if (!email || !isValidEmail(email)) return res.status(400).json({ error: 'Email is required' });
            if (!memberAreaId && requestedProductIds.length === 0) {
                return res.status(400).json({ error: 'Member area or product access is required' });
            }

            const memberArea = memberAreaId
                ? await requireOwnedMemberArea(auth, req, res, memberAreaId)
                : null;
            if (memberAreaId && !memberArea) return;

            const productIds = await requireOwnedProductsForArea(auth, req, res, requestedProductIds, memberAreaId || undefined);
            if (!productIds) return;

            const emailContext = await getMemberAreaEmailContext(
                supabaseAdmin,
                auth.user.id,
                productIds,
                memberArea || undefined,
            );
            const emailDelivery = await resolveMemberEmailDelivery(supabaseAdmin, auth.user.id);

            let userId = '';
            let isNewUser = false;

            console.log(`[Admin] Processing member add for ${maskEmail(email)}`);

            const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
                .from('profiles')
                .select('id')
                .ilike('email', email)
                .maybeSingle();

            if (existingProfileError) {
                console.error('[admin_members] Profile lookup failed:', existingProfileError.message);
                return res.status(500).json({ error: 'Internal Server Error' });
            }

            if (existingProfile) {
                userId = existingProfile.id;
            } else {
                let userData: any = null;
                let createError: any = null;

                if (emailDelivery) {
                    const result = await supabaseAdmin.auth.admin.createUser({
                        email,
                        password: generateInternalPassword(),
                        email_confirm: true,
                        user_metadata: { name: name || email.split('@')[0] },
                    });
                    userData = result.data;
                    createError = result.error;
                } else {
                    ({ data: userData, error: createError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
                    redirectTo: getMemberPasswordSetupUrl(req, emailContext.slug),
                    data: {
                        name: name || email.split('@')[0],
                        member_area_name: emailContext.name || 'Área de membros',
                    },
                    }));
                }

                if (createError) {
                    if (createError.message?.toLowerCase().includes('already')) {
                        let foundUser: any = null;
                        try {
                            foundUser = await findAuthUserByEmail(supabaseAdmin, email);
                        } catch (listError: any) {
                            console.error('[admin_members] Auth recovery lookup failed:', listError?.message || listError);
                            return res.status(500).json({ error: 'Internal Server Error' });
                        }

                        if (!foundUser) {
                            console.error('[admin_members] Auth recovery failed:', 'user not found');
                            return res.status(500).json({ error: 'Internal Server Error' });
                        }

                        userId = foundUser.id;

                        const { error: profileInsertError } = await supabaseAdmin.from('profiles').upsert({
                            id: userId,
                            email,
                            full_name: name || email.split('@')[0],
                            role: 'member',
                            updated_at: new Date().toISOString(),
                        }, { onConflict: 'id' });

                        if (profileInsertError) {
                            console.error('[admin_members] Profile recovery upsert failed:', profileInsertError.message);
                            return res.status(500).json({ error: 'Internal Server Error' });
                        }
                    } else {
                        console.error('[admin_members] Error creating member auth user:', createError.message);
                        return res.status(400).json({ error: 'Unable to create member' });
                    }
                } else if (userData.user?.id) {
                    userId = userData.user.id;
                    isNewUser = true;

                    const { error: roleUpdateError } = await supabaseAdmin
                        .from('profiles')
                        .upsert({
                            id: userId,
                            email,
                            full_name: name || email.split('@')[0],
                            role: 'member',
                            updated_at: new Date().toISOString(),
                        }, { onConflict: 'id' });

                    if (roleUpdateError) {
                        console.error('[admin_members] Failed to upsert member profile:', roleUpdateError.message);
                        return res.status(500).json({ error: 'Internal Server Error' });
                    }
                }
            }

            if (!userId) return res.status(500).json({ error: 'Internal Server Error' });

            if (productIds.length > 0) {
                try {
                    await grantProductAccess(supabaseAdmin, userId, productIds);
                } catch (grantError: any) {
                    console.error('[admin_members] Error granting access:', grantError?.message || grantError);
                    return res.status(500).json({ error: 'Internal Server Error' });
                }
            }

            if (emailDelivery) {
                try {
                    const isPasswordSetup = isNewUser;
                    const accessUrl = await generateMemberActionLink({
                        supabaseAdmin,
                        email,
                        type: isPasswordSetup ? 'recovery' : 'magiclink',
                        redirectTo: isPasswordSetup
                            ? getMemberPasswordSetupUrl(req, emailContext.slug)
                            : getMemberMagicLinkUrl(req, emailContext.slug),
                    });
                    await sendMemberAccessEmail({
                        supabaseAdmin,
                        delivery: emailDelivery,
                        eventType: isPasswordSetup ? 'MEMBER_INVITATION' : 'MEMBER_MAGIC_LINK',
                        email,
                        name: name || email.split('@')[0],
                        memberAreaName: emailContext.name || 'Área de membros',
                        accessUrl,
                    });
                } catch (emailErr: any) {
                    console.warn('[Admin API] Custom member email failed, using Supabase fallback:', emailErr?.message || emailErr);
                    try {
                        await sendNativeMemberEmail({
                            supabaseAdmin,
                            email,
                            type: isNewUser ? 'recovery' : 'magiclink',
                            redirectTo: isNewUser
                                ? getMemberPasswordSetupUrl(req, emailContext.slug)
                                : getMemberMagicLinkUrl(req, emailContext.slug),
                        });
                    } catch (fallbackError: any) {
                        console.error('[Admin API] Supabase member email fallback failed:', fallbackError?.message || fallbackError);
                    }
                }
            } else if (!isNewUser) {
                try {
                    await sendNativeMemberEmail({
                        supabaseAdmin,
                        email,
                        type: 'magiclink',
                        redirectTo: getMemberMagicLinkUrl(req, emailContext.slug),
                    });
                } catch (emailErr: any) {
                    console.warn('[Admin API] Existing member magic link email failed:', emailErr?.message || emailErr);
                }
            }

            await logMemberAuthzEvent({
                auth,
                req,
                eventType: 'member_created',
                severity: 'INFO',
                metadata: {
                    member_area_id: memberAreaId || null,
                    product_count: productIds.length,
                    is_new_user: isNewUser,
                },
            });

            return res.status(200).json({ success: true, userId, isNewUser });
        }

        if (action === 'suspend' || action === 'activate') {
            const userId = String(data.userId || '').trim();
            const memberAreaId = String(data.memberAreaId || '').trim();
            const status = action === 'suspend' ? 'suspended' : 'active';

            if (!isUuid(userId)) return res.status(400).json({ error: 'UserId required' });
            const memberArea = await requireOwnedMemberArea(auth, req, res, memberAreaId);
            if (!memberArea) return;

            const hasAccess = await memberHasAccessInArea(supabaseAdmin, userId, memberAreaId);
            if (!hasAccess) return res.status(404).json({ error: 'Member not found' });

            await updateMemberAreaAccess(supabaseAdmin, userId, status, memberAreaId);
            await logMemberAuthzEvent({
                auth,
                req,
                eventType: 'member_area_access_updated',
                severity: 'INFO',
                metadata: { member_area_id: memberAreaId, status },
            });

            return res.status(200).json({ success: true });
        }

        if (action === 'resend_email') {
            const userId = String(data.userId || '').trim();
            const memberAreaId = String(data.memberAreaId || '').trim();
            const type = String(data.type || '').trim();

            if (!isUuid(userId)) return res.status(400).json({ error: 'UserId required' });
            const memberArea = await requireOwnedMemberArea(auth, req, res, memberAreaId);
            if (!memberArea) return;

            const hasAccess = await memberHasAccessInArea(supabaseAdmin, userId, memberAreaId);
            if (!hasAccess) return res.status(404).json({ error: 'Member not found' });

            const { data: targetUser, error: targetUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
            const email = targetUser?.user?.email;
            if (targetUserError || !email) return res.status(404).json({ error: 'Member not found' });

            const isPasswordSetup = type === 'reset_password';
            const isMagicLink = type === 'magic_link';
            if (!isPasswordSetup && !isMagicLink) {
                return res.status(400).json({ error: 'Invalid email action' });
            }

            const redirectTo = isPasswordSetup
                ? getMemberPasswordSetupUrl(req, memberArea.slug)
                : getMemberMagicLinkUrl(req, memberArea.slug);
            const emailDelivery = await resolveMemberEmailDelivery(supabaseAdmin, auth.user.id);
            try {
                if (emailDelivery) {
                    const accessUrl = await generateMemberActionLink({
                        supabaseAdmin,
                        email,
                        type: isPasswordSetup ? 'recovery' : 'magiclink',
                        redirectTo,
                    });
                    await sendMemberAccessEmail({
                        supabaseAdmin,
                        delivery: emailDelivery,
                        eventType: isPasswordSetup ? 'MEMBER_PASSWORD_SETUP' : 'MEMBER_MAGIC_LINK',
                        email,
                        name: String(targetUser.user?.user_metadata?.name || email.split('@')[0]),
                        memberAreaName: memberArea.name || 'Área de membros',
                        accessUrl,
                    });
                } else {
                    await sendNativeMemberEmail({
                        supabaseAdmin,
                        email,
                        type: isPasswordSetup ? 'recovery' : 'magiclink',
                        redirectTo,
                    });
                }
            } catch (emailError: any) {
                console.error('[admin_members] Member email failed:', emailError?.message || emailError);
                return res.status(500).json({ error: 'Internal Server Error' });
            }

            await logMemberAuthzEvent({
                auth,
                req,
                eventType: 'member_email_triggered',
                severity: 'INFO',
                metadata: { member_area_id: memberAreaId, email_type: type },
            });

            return res.status(200).json({ success: true });
        }

        if (action === 'delete') {
            const email = normalizeEmail(data.email);
            const memberAreaId = String(data.memberAreaId || '').trim();
            let targetId = String(data.userId || '').trim();

            const memberArea = await requireOwnedMemberArea(auth, req, res, memberAreaId);
            if (!memberArea) return;

            if (!targetId && email) {
                const { data: profile } = await supabaseAdmin
                    .from('profiles')
                    .select('id')
                    .eq('email', email)
                    .maybeSingle();

                if (profile) {
                    targetId = profile.id;
                } else {
                    try {
                        const found = await findAuthUserByEmail(supabaseAdmin, email);
                        if (found?.id) targetId = found.id;
                    } catch (listError: any) {
                        console.error('[admin_members] Delete lookup failed:', listError?.message || listError);
                        return res.status(500).json({ error: 'Internal Server Error' });
                    }
                }
            }

            if (!isUuid(targetId)) return res.status(400).json({ error: 'UserId required' });

            const hasAccess = await memberHasAccessInArea(supabaseAdmin, targetId, memberAreaId);
            if (!hasAccess) return res.status(404).json({ error: 'Member not found' });

            await deleteMemberAreaAccess(supabaseAdmin, targetId, memberAreaId);
            await logMemberAuthzEvent({
                auth,
                req,
                eventType: 'member_area_access_removed',
                severity: 'INFO',
                metadata: { member_area_id: memberAreaId },
            });

            return res.status(200).json({ success: true });
        }

        if (action === 'promote_admin') {
            const email = normalizeEmail(data.email);
            const memberAreaId = String(data.memberAreaId || '').trim();
            if (!email || !isValidEmail(email)) return res.status(400).json({ error: 'Email required' });

            const memberArea = await requireOwnedMemberArea(auth, req, res, memberAreaId);
            if (!memberArea) return;

            console.log('Promoting user to admin:', maskEmail(email));

            let targetUser: any = null;
            try {
                targetUser = await findAuthUserByEmail(supabaseAdmin, email);
            } catch (listError: any) {
                console.error('[admin_members] List users error:', listError?.message || listError);
                return res.status(500).json({ error: 'Internal Server Error' });
            }

            if (!targetUser?.id) return res.status(404).json({ error: 'Member not found' });

            const hasAccess = await memberHasAccessInArea(supabaseAdmin, targetUser.id, memberAreaId);
            if (!hasAccess) {
                await logMemberAuthzEvent({
                    auth,
                    req,
                    eventType: 'member_operation_rejected',
                    severity: 'CRITICAL',
                    metadata: { reason: 'promote_target_outside_member_area', member_area_id: memberAreaId },
                });
                return res.status(403).json({ error: 'Access denied' });
            }

            const { error: upsertError } = await supabaseAdmin
                .from('profiles')
                .upsert({
                    id: targetUser.id,
                    email: targetUser.email,
                    role: 'admin',
                    updated_at: new Date().toISOString(),
                });

            if (upsertError) {
                console.error('[admin_members] Upsert profile error:', upsertError.message);
                return res.status(500).json({ error: 'Internal Server Error' });
            }

            await logMemberAuthzEvent({
                auth,
                req,
                eventType: 'member_promoted_admin',
                severity: 'CRITICAL',
                metadata: {
                    member_area_id: memberAreaId,
                    target_user_id: targetUser.id,
                    target_email_domain: String(targetUser.email || '').split('@')[1] || null,
                },
            });

            return res.status(200).json({ success: true, userId: targetUser.id });
        }

        return res.status(400).json({ error: 'Invalid action' });
    } catch (error: any) {
        console.error('Admin Member API Error:', error?.message || error);
        await logAuthzEvent({
            supabaseAdmin,
            req,
            source: 'admin_members',
            eventType: 'member_operation_failed',
            severity: 'CRITICAL',
            userId: auth.user.id,
            metadata: {
                action: String(action || 'unknown'),
                reason: 'unexpected_error',
            },
        });
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

// api/admin/members.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { applyCors } from '../_cors.js';
import { enforceApiRateLimit } from '../_rate-limit.js';
import {
    logAuthzEvent,
    requireApiAuth,
    type ApiAuthContext,
    type ApiRole,
    type AuthzSeverity,
} from '../_authz.js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

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

async function sendMemberCreatedEmail(params: {
    req: VercelRequest;
    email: string;
    isNewUser: boolean;
    memberAreaSlug: string;
    memberAreaName: string;
}) {
    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('missing_supabase_email_config');
    }

    const baseUrl = getRequestBaseUrl(params.req);
    const accessUrl = getMemberAccessUrl(params.req, params.memberAreaSlug);
    const safeEmail = escapeHtml(params.email);
    const safeMemberAreaName = escapeHtml(params.memberAreaName);
    const safeAccessUrl = escapeHtml(accessUrl);
    const safeLoginUrl = escapeHtml(`${baseUrl}/login`);

    const emailSubject = params.isNewUser
        ? (params.memberAreaName ? `Acesso Liberado: ${params.memberAreaName}` : 'Acesso Liberado - Boas vindas!')
        : `Novo acesso liberado${params.memberAreaName ? `: ${params.memberAreaName}` : ''}`;

    const emailHtml = params.isNewUser
        ? `
            <h1>Bem-vindo${safeMemberAreaName ? ` ao ${safeMemberAreaName}` : ''}!</h1>
            <p>Sua conta foi criada com sucesso.</p>
            <p><strong>Email:</strong> ${safeEmail}</p>
            <p>Enviamos um link seguro para voce definir sua senha. Use o link recebido para concluir o primeiro acesso.</p>
            <div style="margin: 30px 0;">
                <a href="${safeAccessUrl}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Acessar Agora</a>
            </div>
            <p style="font-size: 12px; color: #666;">Por seguranca, nenhuma senha provisoria e enviada por e-mail.</p>
        `
        : `
            <h1>Novo Acesso Liberado!</h1>
            <p>Voce recebeu acesso a um novo conteudo${safeMemberAreaName ? ` em <strong>${safeMemberAreaName}</strong>` : ''}.</p>
            <p>Como voce ja possui cadastro, utilize sua senha atual para acessar.</p>
            <div style="margin: 30px 0;">
                <a href="${safeAccessUrl}" style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Acessar Area de Membros</a>
            </div>
            <p><small>Esqueceu sua senha? <a href="${safeLoginUrl}">Recupere aqui</a>.</small></p>
        `;

    await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
            to: params.email,
            subject: emailSubject,
            html: emailHtml,
        }),
    });
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

            let userId = '';
            let isNewUser = false;
            const internalPassword = generateInternalPassword();

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
                const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
                    email,
                    password: internalPassword,
                    email_confirm: true,
                    user_metadata: { name: name || email.split('@')[0] },
                });

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
                const grants = productIds.map((pid: string) => ({
                    user_id: userId,
                    product_id: pid,
                    status: 'active',
                    granted_at: new Date().toISOString(),
                }));

                const { error: grantError } = await supabaseAdmin
                    .from('access_grants')
                    .upsert(grants, { onConflict: 'user_id, product_id' });

                if (grantError) {
                    console.error('[admin_members] Error granting access:', grantError.message);
                    return res.status(500).json({ error: 'Internal Server Error' });
                }
            }

            try {
                const context = await getMemberAreaEmailContext(
                    supabaseAdmin,
                    auth.user.id,
                    productIds,
                    memberArea || undefined,
                );

                if (isNewUser) {
                    const { error: recoveryError } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
                        redirectTo: getMemberAccessUrl(req, context.slug),
                    });

                    if (recoveryError) {
                        console.error('[admin_members] Password setup email failed:', recoveryError.message);
                        await logMemberAuthzEvent({
                            auth,
                            req,
                            eventType: 'member_password_setup_email_failed',
                            severity: 'WARNING',
                            metadata: { member_area_id: memberAreaId || null },
                        });
                    }
                }

                await sendMemberCreatedEmail({
                    req,
                    email,
                    isNewUser,
                    memberAreaSlug: context.slug,
                    memberAreaName: context.name,
                });
            } catch (emailErr: any) {
                console.warn('[Admin API] Email sending failed:', emailErr?.message || emailErr);
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

            if (type === 'reset_password') {
                const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
                    redirectTo: getMemberAccessUrl(req, memberArea.slug),
                });
                if (error) {
                    console.error('[admin_members] Reset password email failed:', error.message);
                    return res.status(500).json({ error: 'Internal Server Error' });
                }
            } else if (type === 'magic_link') {
                const { error } = await supabaseAdmin.auth.signInWithOtp({ email });
                if (error) {
                    console.error('[admin_members] Magic link email failed:', error.message);
                    return res.status(500).json({ error: 'Internal Server Error' });
                }
            } else {
                return res.status(400).json({ error: 'Invalid email action' });
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

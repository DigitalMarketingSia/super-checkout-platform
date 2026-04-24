import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { applyCors, emailFingerprint, getAuditClient, getIp, getPortalBaseUrl, getUserAgent, logSecurityEvent, maskEmail, normalizeEmail } from './_shared';
import { isDisposableEmailDomain } from './_disposableEmailDomains';

type PublicAction = 'signup' | 'resend' | 'track' | 'status' | 'waitlist' | 'validate_invite';
type PublicTrackEvent =
    | 'register_page_view'
    | 'register_form_started'
    | 'register_confirmation_viewed'
    | 'activation_email_unconfirmed_viewed';

interface LaunchSettings {
    registrationOpen: boolean;
    manualApprovalEnabled: boolean;
}

interface MemoryBucket {
    count: number;
    firstHitAt: number;
    blockedUntil: number;
}

const SOURCE = 'auth_register_api';
const memoryBuckets = new Map<string, MemoryBucket>();
const DEFAULT_LAUNCH_SETTINGS: LaunchSettings = {
    registrationOpen: true,
    manualApprovalEnabled: false
};
const DEFAULT_CENTRAL_API_URL = 'https://bcmnryxjweiovrwmztpn.supabase.co/functions/v1';
const DEFAULT_CENTRAL_SUPABASE_URL = 'https://bcmnryxjweiovrwmztpn.supabase.co';
const DEFAULT_CENTRAL_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjbW5yeXhqd2Vpb3Zyd216dHBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2NjM2MjMsImV4cCI6MjA4MzIzOTYyM30.F86wf0xwTR1K_P9500JwnESStPb2bCo3dwuouHBPcQM';
const SIGNUP_PROFILE_RETRY_DELAYS_MS = [0, 250, 750] as const;

interface SignupPersistenceParams {
    userId: string;
    email: string;
    name: string;
    whatsapp: string;
    partnerId: string | null;
    partnerConsent: boolean;
    accountStatus: 'active' | 'pending_approval';
    inviteToken: string | null;
}

const HARD_LIMITS = {
    signupIp: { max: 4, windowMs: 30 * 60 * 1000, blockMs: 60 * 60 * 1000 },
    signupEmail: { max: 2, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 },
    waitlistIp: { max: 6, windowMs: 30 * 60 * 1000, blockMs: 60 * 60 * 1000 },
    waitlistEmail: { max: 3, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 },
    resendIp: { max: 5, windowMs: 30 * 60 * 1000, blockMs: 60 * 60 * 1000 },
    resendEmail: { max: 3, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 },
    trackIp: { max: 30, windowMs: 10 * 60 * 1000, blockMs: 10 * 60 * 1000 }
} as const;

const CAPTCHA_THRESHOLDS = {
    signupIp: { count: 2, windowMs: 30 * 60 * 1000 },
    signupEmail: { count: 1, windowMs: 60 * 60 * 1000 },
    resendIp: { count: 3, windowMs: 30 * 60 * 1000 },
    resendEmail: { count: 2, windowMs: 60 * 60 * 1000 }
} as const;

const TRACK_EVENT_MAP: Record<PublicTrackEvent, string> = {
    register_page_view: 'register_page_view',
    register_form_started: 'register_form_started',
    register_confirmation_viewed: 'register_confirmation_viewed',
    activation_email_unconfirmed_viewed: 'activation_email_unconfirmed_viewed'
};

function cleanupMemoryBuckets() {
    const now = Date.now();
    for (const [key, bucket] of memoryBuckets.entries()) {
        if (bucket.blockedUntil > 0 && bucket.blockedUntil > now) continue;
        if (now - bucket.firstHitAt > 24 * 60 * 60 * 1000) {
            memoryBuckets.delete(key);
        }
    }
}

function inspectMemoryBucket(key: string, config: { max: number; windowMs: number; blockMs: number }) {
    const now = Date.now();
    const bucket = memoryBuckets.get(key);

    if (!bucket) {
        return { blocked: false, count: 0, retryAfterSec: 0 };
    }

    if (bucket.blockedUntil > now) {
        return {
            blocked: true,
            count: bucket.count,
            retryAfterSec: Math.ceil((bucket.blockedUntil - now) / 1000)
        };
    }

    if (now - bucket.firstHitAt > config.windowMs) {
        memoryBuckets.delete(key);
        return { blocked: false, count: 0, retryAfterSec: 0 };
    }

    return { blocked: false, count: bucket.count, retryAfterSec: 0 };
}

function incrementMemoryBucket(key: string, config: { max: number; windowMs: number; blockMs: number }) {
    const now = Date.now();
    const bucket = memoryBuckets.get(key);

    if (!bucket || now - bucket.firstHitAt > config.windowMs) {
        memoryBuckets.set(key, {
            count: 1,
            firstHitAt: now,
            blockedUntil: 0
        });
        return { count: 1, retryAfterSec: 0 };
    }

    bucket.count += 1;

    if (bucket.count > config.max) {
        bucket.blockedUntil = now + config.blockMs;
        return {
            count: bucket.count,
            retryAfterSec: Math.ceil(config.blockMs / 1000)
        };
    }

    return { count: bucket.count, retryAfterSec: 0 };
}

function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password: string) {
    return String(password || '').length >= 6;
}

function normalizeInviteToken(token: unknown) {
    return String(token || '').trim();
}

function hasCaptchaConfigured() {
    return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.VITE_TURNSTILE_SITE_KEY);
}

function getCaptchaSiteKey() {
    return process.env.VITE_TURNSTILE_SITE_KEY || null;
}

function readBooleanSetting(value: unknown, fallback: boolean) {
    if (typeof value === 'boolean') return value;

    if (value && typeof value === 'object') {
        const valueRecord = value as Record<string, unknown>;
        if (typeof valueRecord.value === 'boolean') {
            return valueRecord.value;
        }
        if (typeof valueRecord.enabled === 'boolean') {
            return valueRecord.enabled;
        }
    }

    return fallback;
}

async function verifyCaptcha(params: {
    token?: string | null;
    ip: string;
}): Promise<boolean> {
    if (!hasCaptchaConfigured()) return false;
    if (!params.token) return false;

    const formData = new URLSearchParams();
    formData.set('secret', process.env.TURNSTILE_SECRET_KEY as string);
    formData.set('response', params.token);
    if (params.ip && params.ip !== 'unknown') {
        formData.set('remoteip', params.ip);
    }

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
    });

    if (!response.ok) return false;

    const payload = await response.json().catch(() => ({}));
    return payload?.success === true;
}

function getCentralClient(): SupabaseClient | null {
    const supabaseUrl =
        process.env.VITE_CENTRAL_SUPABASE_URL
        || process.env.VITE_CENTRAL_API_URL?.replace('/functions/v1', '')
        || DEFAULT_CENTRAL_API_URL.replace('/functions/v1', '')
        || DEFAULT_CENTRAL_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_CENTRAL_SUPABASE_ANON_KEY || DEFAULT_CENTRAL_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        return null;
    }

    return createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
}

function getCentralAdminClient(): SupabaseClient | null {
    const supabaseUrl =
        process.env.VITE_CENTRAL_SUPABASE_URL
        || process.env.VITE_CENTRAL_API_URL?.replace('/functions/v1', '')
        || DEFAULT_CENTRAL_API_URL.replace('/functions/v1', '')
        || DEFAULT_CENTRAL_SUPABASE_URL;
    const serviceRoleKey =
        process.env.CENTRAL_SUPABASE_SERVICE_ROLE_KEY
        || process.env.VITE_CENTRAL_SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        return null;
    }

    return createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureSignupPersistence(params: SignupPersistenceParams) {
    const centralAdmin = getCentralAdminClient();
    if (!centralAdmin) {
        return {
            ok: false,
            recoveredProfile: false,
            reason: 'missing_central_admin_client'
        } as const;
    }

    const { data: authData, error: authError } = await centralAdmin.auth.admin.getUserById(params.userId);
    if (authError || !authData?.user) {
        return {
            ok: false,
            recoveredProfile: false,
            reason: authError?.message || 'central_auth_user_not_found'
        } as const;
    }

    for (const delayMs of SIGNUP_PROFILE_RETRY_DELAYS_MS) {
        if (delayMs > 0) {
            await sleep(delayMs);
        }

        const { data: profile, error: profileError } = await centralAdmin
            .from('profiles')
            .select('id')
            .eq('id', params.userId)
            .maybeSingle();

        if (!profileError && profile?.id) {
            return {
                ok: true,
                recoveredProfile: false,
                reason: null
            } as const;
        }
    }

    const nowIso = new Date().toISOString();
    const profilePayload = {
        id: params.userId,
        email: params.email,
        full_name: params.name,
        whatsapp: params.whatsapp,
        role: 'admin',
        signup_source: 'register_page',
        referred_by_partner_id: params.partnerId,
        partner_consent: params.partnerId ? params.partnerConsent : false,
        account_status: params.accountStatus,
        is_blocked: false,
        approval_status_changed_at: nowIso,
        updated_at: nowIso
    };

    const { error: upsertError } = await centralAdmin
        .from('profiles')
        .upsert(profilePayload, { onConflict: 'id' });

    if (upsertError) {
        return {
            ok: false,
            recoveredProfile: false,
            reason: upsertError.message
        } as const;
    }

    if (params.inviteToken) {
        try {
            await centralAdmin.rpc('consume_invite_token', {
                p_token: params.inviteToken,
                p_used_by: params.userId
            });
        } catch {
            // O consumo do convite ja e tentado pelo trigger; aqui e apenas um fallback.
        }
    }

    return {
        ok: true,
        recoveredProfile: true,
        reason: null
    } as const;
}

async function findCentralAuthUserByEmail(email: string) {
    const centralAdmin = getCentralAdminClient();
    if (!centralAdmin) {
        return {
            user: null,
            reason: 'missing_central_admin_client'
        } as const;
    }

    let page = 1;

    while (page <= 10) {
        const { data, error } = await centralAdmin.auth.admin.listUsers({
            page,
            perPage: 1000
        });

        if (error) {
            return {
                user: null,
                reason: error.message
            } as const;
        }

        const matchedUser = (data?.users || []).find((user) => normalizeEmail(user.email || '') === email);
        if (matchedUser) {
            return {
                user: matchedUser,
                reason: null
            } as const;
        }

        const lastPage = data?.lastPage || 0;
        if (!lastPage || page >= lastPage) {
            break;
        }

        page += 1;
    }

    return {
        user: null,
        reason: null
    } as const;
}

async function getLaunchSettings(central: SupabaseClient): Promise<LaunchSettings> {
    try {
        const { data, error } = await central
            .from('system_settings')
            .select('setting_key, value_json')
            .in('setting_key', ['registration_open', 'manual_approval_enabled']);

        if (error) {
            console.warn(`[${SOURCE}] Failed to load launch settings:`, error.message);
            return DEFAULT_LAUNCH_SETTINGS;
        }

        const settingsMap = new Map((data || []).map((row: any) => [row.setting_key, row.value_json]));

        return {
            registrationOpen: readBooleanSetting(
                settingsMap.get('registration_open'),
                DEFAULT_LAUNCH_SETTINGS.registrationOpen
            ),
            manualApprovalEnabled: readBooleanSetting(
                settingsMap.get('manual_approval_enabled'),
                DEFAULT_LAUNCH_SETTINGS.manualApprovalEnabled
            )
        };
    } catch (error: any) {
        console.warn(`[${SOURCE}] Unexpected launch settings error:`, error?.message || error);
        return DEFAULT_LAUNCH_SETTINGS;
    }
}

async function validateInviteToken(central: SupabaseClient, token: string) {
    const inviteToken = normalizeInviteToken(token);
    if (!inviteToken) {
        return {
            valid: false,
            reason: 'missing',
            expiresAt: null as string | null
        };
    }

    try {
        const { data, error } = await central.rpc('validate_invite_token', {
            p_token: inviteToken
        });

        if (error) {
            console.warn(`[${SOURCE}] Failed to validate invite token:`, error.message);
            return {
                valid: false,
                reason: 'validation_failed',
                expiresAt: null as string | null
            };
        }

        const inviteResult = Array.isArray(data) ? data[0] : data;
        return {
            valid: inviteResult?.valid === true,
            reason: inviteResult?.reason || null,
            expiresAt: inviteResult?.expires_at || null
        };
    } catch (error: any) {
        console.warn(`[${SOURCE}] Unexpected invite validation error:`, error?.message || error);
        return {
            valid: false,
            reason: 'validation_failed',
            expiresAt: null as string | null
        };
    }
}

async function countRecentEvents(params: {
    eventType: string;
    ip?: string;
    email?: string;
    windowMs: number;
}) {
    try {
        const supabaseAdmin = getAuditClient();
        if (!supabaseAdmin) return 0;

        const since = new Date(Date.now() - params.windowMs).toISOString();
        let query = supabaseAdmin
            .from('security_events')
            .select('id', { count: 'exact', head: true })
            .eq('event_type', params.eventType)
            .gte('created_at', since);

        if (params.ip) {
            query = query.eq('ip_address', params.ip);
        }

        if (params.email) {
            query = query.contains('metadata', {
                email_fingerprint: emailFingerprint(params.email)
            });
        }

        const { count, error } = await query;
        if (error) {
            console.warn(`[${SOURCE}] Failed to count recent events:`, error.message);
            return 0;
        }

        return count || 0;
    } catch (error: any) {
        console.warn(`[${SOURCE}] Unexpected rate count error:`, error?.message || error);
        return 0;
    }
}

async function enforceRateLimit(params: {
    action: 'signup' | 'resend' | 'track' | 'waitlist';
    ip: string;
    email?: string;
}) {
    const configs = params.action === 'signup'
        ? { ip: HARD_LIMITS.signupIp, email: HARD_LIMITS.signupEmail, eventType: 'register_signup_attempt' }
        : params.action === 'waitlist'
            ? { ip: HARD_LIMITS.waitlistIp, email: HARD_LIMITS.waitlistEmail, eventType: 'register_waitlist_join_attempt' }
        : params.action === 'resend'
            ? { ip: HARD_LIMITS.resendIp, email: HARD_LIMITS.resendEmail, eventType: 'register_resend_attempt' }
            : { ip: HARD_LIMITS.trackIp, email: null, eventType: 'register_track_event' };

    const ipKey = `${params.action}:ip:${params.ip}`;
    const ipInspection = inspectMemoryBucket(ipKey, configs.ip);
    if (ipInspection.blocked) {
        return { blocked: true, retryAfterSec: ipInspection.retryAfterSec, dimension: 'ip' as const };
    }

    const persistedIpCount = await countRecentEvents({
        eventType: configs.eventType,
        ip: params.ip,
        windowMs: configs.ip.windowMs
    });

    if (persistedIpCount >= configs.ip.max) {
        const bumped = incrementMemoryBucket(ipKey, configs.ip);
        return { blocked: true, retryAfterSec: bumped.retryAfterSec || Math.ceil(configs.ip.blockMs / 1000), dimension: 'ip' as const };
    }

    if (params.email && configs.email) {
        const emailKey = `${params.action}:email:${emailFingerprint(params.email)}`;
        const emailInspection = inspectMemoryBucket(emailKey, configs.email);
        if (emailInspection.blocked) {
            return { blocked: true, retryAfterSec: emailInspection.retryAfterSec, dimension: 'email' as const };
        }

        const persistedEmailCount = await countRecentEvents({
            eventType: configs.eventType,
            email: params.email,
            windowMs: configs.email.windowMs
        });

        if (persistedEmailCount >= configs.email.max) {
            const bumped = incrementMemoryBucket(emailKey, configs.email);
            return { blocked: true, retryAfterSec: bumped.retryAfterSec || Math.ceil(configs.email.blockMs / 1000), dimension: 'email' as const };
        }
    }

    return { blocked: false, retryAfterSec: 0, dimension: null };
}

async function shouldRequireCaptcha(params: {
    action: 'signup' | 'resend';
    ip: string;
    email: string;
}) {
    if (!hasCaptchaConfigured()) return false;

    const thresholds = params.action === 'signup'
        ? { ip: CAPTCHA_THRESHOLDS.signupIp, email: CAPTCHA_THRESHOLDS.signupEmail, eventType: 'register_signup_attempt' }
        : { ip: CAPTCHA_THRESHOLDS.resendIp, email: CAPTCHA_THRESHOLDS.resendEmail, eventType: 'register_resend_attempt' };

    const persistedIpCount = await countRecentEvents({
        eventType: thresholds.eventType,
        ip: params.ip,
        windowMs: thresholds.ip.windowMs
    });

    if (persistedIpCount >= thresholds.ip.count) {
        return true;
    }

    const persistedEmailCount = await countRecentEvents({
        eventType: thresholds.eventType,
        email: params.email,
        windowMs: thresholds.email.windowMs
    });

    return persistedEmailCount >= thresholds.email.count;
}

async function handleTrack(req: VercelRequest, res: VercelResponse, ip: string) {
    const { event, email, partnerId } = req.body || {};

    if (!event || !(event in TRACK_EVENT_MAP)) {
        return res.status(400).json({ error: 'Evento de funil invalido.' });
    }

    const rate = await enforceRateLimit({ action: 'track', ip });
    if (rate.blocked) {
        return res.status(202).json({ success: false });
    }

    incrementMemoryBucket(`track:ip:${ip}`, HARD_LIMITS.trackIp);

    await logSecurityEvent({
        eventType: TRACK_EVENT_MAP[event as PublicTrackEvent],
        severity: 'INFO',
        ip,
        userAgent: getUserAgent(req),
        source: SOURCE,
        metadata: {
            email: email ? maskEmail(email) : undefined,
            email_fingerprint: email ? emailFingerprint(email) : undefined,
            partner_id: partnerId || null
        }
    });

    return res.status(200).json({ success: true });
}

async function respondCaptchaRequired(req: VercelRequest, res: VercelResponse, params: {
    action: 'signup' | 'resend';
    ip: string;
    email: string;
}) {
    await logSecurityEvent({
        eventType: `${params.action === 'signup' ? 'register_signup' : 'register_resend'}_captcha_required`,
        severity: 'WARNING',
        ip: params.ip,
        userAgent: getUserAgent(req),
        source: SOURCE,
        metadata: {
            email: maskEmail(params.email),
            email_fingerprint: emailFingerprint(params.email)
        }
    });

    return res.status(403).json({
        error: hasCaptchaConfigured()
            ? 'Confirme que voce e humano para continuar.'
            : 'Detectamos atividade suspeita. Aguarde alguns minutos e tente novamente.',
        error_code: hasCaptchaConfigured() ? 'captcha_required' : 'suspicious_activity',
        requiresCaptcha: hasCaptchaConfigured(),
        captchaSiteKey: getCaptchaSiteKey()
    });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    cleanupMemoryBuckets();
    applyCors(req, res, 'POST, OPTIONS');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const ip = getIp(req);
    const action = req.body?.action as PublicAction | undefined;

    if (!action || !['signup', 'resend', 'track', 'status', 'waitlist', 'validate_invite'].includes(action)) {
        return res.status(400).json({ error: 'Acao invalida.' });
    }

    if (action === 'track') {
        return handleTrack(req, res, ip);
    }

    if (action === 'status') {
        const central = getCentralClient();
        if (!central) {
            return res.status(500).json({ error: 'Configuracao do servidor indisponivel.' });
        }

        const settings = await getLaunchSettings(central);
        return res.status(200).json({
            success: true,
            registrationOpen: settings.registrationOpen,
            manualApprovalEnabled: settings.manualApprovalEnabled
        });
    }

    if (action === 'validate_invite') {
        const central = getCentralClient();
        if (!central) {
            return res.status(500).json({ error: 'Configuracao do servidor indisponivel.' });
        }

        const inviteToken = normalizeInviteToken(req.body?.inviteToken || req.body?.token);
        const invite = await validateInviteToken(central, inviteToken);

        return res.status(200).json({
            success: true,
            inviteValid: invite.valid,
            inviteReason: invite.reason,
            inviteExpiresAt: invite.expiresAt
        });
    }

    const email = normalizeEmail(req.body?.email || '');
    const honeypot = String(req.body?.honeypot || '').trim();
    const flow = req.body?.flow === 'activation_setup' ? 'activation_setup' : 'register';
    const captchaToken = typeof req.body?.captchaToken === 'string' ? req.body.captchaToken : null;
    const userAgent = getUserAgent(req);

    if (!email || !isValidEmail(email)) {
        return res.status(400).json({ error: 'Informe um e-mail valido.' });
    }

    if (action === 'signup' && honeypot) {
        await logSecurityEvent({
            eventType: 'register_honeypot_triggered',
            severity: 'WARNING',
            ip,
            userAgent,
            source: SOURCE,
            metadata: {
                email: maskEmail(email),
                email_fingerprint: emailFingerprint(email),
                honeypot_length: honeypot.length
            }
        });

        return res.status(200).json({ success: true, ignored: true });
    }

    if (isDisposableEmailDomain(email)) {
        await logSecurityEvent({
            eventType: 'register_disposable_email_blocked',
            severity: 'WARNING',
            ip,
            userAgent,
            source: SOURCE,
            metadata: {
                email: maskEmail(email),
                email_fingerprint: emailFingerprint(email),
                domain: email.split('@')[1]
            }
        });

        return res.status(422).json({
            error: 'Use um e-mail real e permanente para criar sua conta.',
            error_code: 'disposable_email_blocked'
        });
    }

    const rate = await enforceRateLimit({ action, ip, email });
    if (rate.blocked) {
        await logSecurityEvent({
            eventType: action === 'signup'
                ? 'register_signup_rate_limited'
                : action === 'waitlist'
                    ? 'register_waitlist_rate_limited'
                    : 'register_resend_rate_limited',
            severity: 'WARNING',
            ip,
            userAgent,
            source: SOURCE,
            metadata: {
                email: maskEmail(email),
                email_fingerprint: emailFingerprint(email),
                dimension: rate.dimension,
                retry_after_sec: rate.retryAfterSec
            }
        });

        res.setHeader('Retry-After', String(rate.retryAfterSec || 60));
        return res.status(429).json({
            error: 'Muitas tentativas agora. Aguarde alguns minutos e tente novamente.',
            error_code: 'rate_limited',
            retryAfterSec: rate.retryAfterSec
        });
    }

    const requiresCaptcha = action !== 'waitlist'
        ? await shouldRequireCaptcha({ action, ip, email })
        : false;

    if (requiresCaptcha) {
        const captchaOk = await verifyCaptcha({ token: captchaToken, ip });
        if (!captchaOk) {
            return respondCaptchaRequired(req, res, {
                action: action === 'signup' ? 'signup' : 'resend',
                ip,
                email
            });
        }
    }

    if (action === 'waitlist') {
        incrementMemoryBucket(`waitlist:ip:${ip}`, HARD_LIMITS.waitlistIp);
        incrementMemoryBucket(`waitlist:email:${emailFingerprint(email)}`, HARD_LIMITS.waitlistEmail);

        await logSecurityEvent({
            eventType: 'register_waitlist_join_attempt',
            severity: 'INFO',
            ip,
            userAgent,
            source: SOURCE,
            metadata: {
                email: maskEmail(email),
                email_fingerprint: emailFingerprint(email)
            }
        });

        const central = getCentralClient();
        if (!central) {
            return res.status(500).json({ error: 'Configuracao do servidor indisponivel.' });
        }

        try {
            const { error } = await central
                .from('registration_waitlist')
                .insert({
                    email,
                    source: 'register_launch_closed',
                    metadata: {
                        ip,
                        user_agent: userAgent
                    }
                });

            const isDuplicate = Boolean(error && (
                error.code === '23505'
                || /duplicate/i.test(error.message || '')
            ));

            if (error && !isDuplicate) {
                throw error;
            }

            await logSecurityEvent({
                eventType: isDuplicate ? 'register_waitlist_join_duplicate' : 'register_waitlist_join_success',
                severity: 'INFO',
                ip,
                userAgent,
                source: SOURCE,
                metadata: {
                    email: maskEmail(email),
                    email_fingerprint: emailFingerprint(email)
                }
            });

            return res.status(200).json({
                success: true,
                alreadyJoined: isDuplicate
            });
        } catch (error: any) {
            console.error(`[${SOURCE}] Waitlist fatal error:`, error?.message || error);
            await logSecurityEvent({
                eventType: 'register_waitlist_join_failed',
                severity: 'WARNING',
                ip,
                userAgent,
                source: SOURCE,
                metadata: {
                    email: maskEmail(email),
                    email_fingerprint: emailFingerprint(email),
                    reason: error?.message || 'unexpected_error'
                }
            });

            return res.status(500).json({
                error: 'Nao foi possivel entrar na lista de espera agora.',
                error_code: 'waitlist_failed'
            });
        }
    }

    if (action === 'signup') {
        const name = String(req.body?.name || '').trim();
        const whatsapp = String(req.body?.whatsapp || '').trim();
        const password = String(req.body?.password || '');
        const partnerId = typeof req.body?.partnerId === 'string' ? req.body.partnerId : null;
        const partnerConsent = Boolean(req.body?.partnerConsent);
        const inviteToken = normalizeInviteToken(req.body?.inviteToken);

        if (!name) {
            return res.status(400).json({ error: 'Informe seu nome.' });
        }

        if (!isValidPassword(password)) {
            return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
        }

        if (!whatsapp) {
            return res.status(400).json({ error: 'Informe seu telefone ou WhatsApp.' });
        }

        incrementMemoryBucket(`signup:ip:${ip}`, HARD_LIMITS.signupIp);
        incrementMemoryBucket(`signup:email:${emailFingerprint(email)}`, HARD_LIMITS.signupEmail);

        await logSecurityEvent({
            eventType: 'register_signup_attempt',
            severity: 'INFO',
            ip,
            userAgent,
            source: SOURCE,
            metadata: {
                email: maskEmail(email),
                email_fingerprint: emailFingerprint(email),
                partner_id: partnerId,
                partner_consent: partnerConsent
            }
        });

        const central = getCentralClient();
        if (!central) {
            return res.status(500).json({ error: 'Configuracao do servidor indisponivel.' });
        }

        try {
            const launchSettings = await getLaunchSettings(central);
            const invite = inviteToken
                ? await validateInviteToken(central, inviteToken)
                : { valid: false, reason: null as string | null, expiresAt: null as string | null };

            if (inviteToken && !invite.valid) {
                await logSecurityEvent({
                    eventType: 'register_invite_invalid',
                    severity: 'WARNING',
                    ip,
                    userAgent,
                    source: SOURCE,
                    metadata: {
                        email: maskEmail(email),
                        email_fingerprint: emailFingerprint(email),
                        invite_reason: invite.reason
                    }
                });

                return res.status(403).json({
                    error: 'Este convite nao e mais valido. Solicite um novo link ao time responsavel.',
                    error_code: 'invalid_invite',
                    inviteValid: false,
                    inviteReason: invite.reason,
                    inviteExpiresAt: invite.expiresAt
                });
            }

            if (!launchSettings.registrationOpen && !invite.valid) {
                await logSecurityEvent({
                    eventType: 'register_signup_closed_gate_blocked',
                    severity: 'INFO',
                    ip,
                    userAgent,
                    source: SOURCE,
                    metadata: {
                        email: maskEmail(email),
                        email_fingerprint: emailFingerprint(email)
                    }
                });

                return res.status(403).json({
                    error: 'Os novos cadastros estao temporariamente fechados. Entre na lista de espera.',
                    error_code: 'registration_closed',
                    registrationOpen: false,
                    manualApprovalEnabled: launchSettings.manualApprovalEnabled,
                    inviteValid: false
                });
            }

            const accountStatus = launchSettings.manualApprovalEnabled ? 'pending_approval' : 'active';
            const redirectPath = `${getPortalBaseUrl(req.headers.origin)}/activate`;
            const existingAuthUser = await findCentralAuthUserByEmail(email);

            if (existingAuthUser.reason) {
                await logSecurityEvent({
                    eventType: 'register_signup_failed',
                    severity: 'CRITICAL',
                    ip,
                    userAgent,
                    source: SOURCE,
                    metadata: {
                        email: maskEmail(email),
                        email_fingerprint: emailFingerprint(email),
                        reason: existingAuthUser.reason
                    }
                });

                return res.status(503).json({
                    error: 'Nao foi possivel validar o cadastro existente agora. Tente novamente em alguns instantes.',
                    error_code: 'signup_precheck_failed'
                });
            }

            if (existingAuthUser.user?.id) {
                const persistence = await ensureSignupPersistence({
                    userId: existingAuthUser.user.id,
                    email,
                    name,
                    whatsapp,
                    partnerId,
                    partnerConsent,
                    accountStatus,
                    inviteToken: invite.valid ? inviteToken : null
                });

                if (!persistence.ok) {
                    await logSecurityEvent({
                        eventType: 'register_signup_failed',
                        severity: 'CRITICAL',
                        ip,
                        userAgent,
                        source: SOURCE,
                        userId: existingAuthUser.user.id,
                        metadata: {
                            email: maskEmail(email),
                            email_fingerprint: emailFingerprint(email),
                            reason: persistence.reason || 'existing_user_persistence_failed'
                        }
                    });

                    return res.status(503).json({
                        error: 'Encontramos um cadastro anterior, mas ele nao pode ser reconciliado agora. Tente novamente em alguns instantes.',
                        error_code: 'signup_not_persisted'
                    });
                }

                const isEmailConfirmed = Boolean(existingAuthUser.user.email_confirmed_at);

                if (!isEmailConfirmed) {
                    const { error: resendError } = await central.auth.resend({
                        type: 'signup',
                        email,
                        options: {
                            emailRedirectTo: redirectPath
                        }
                    });

                    if (resendError) {
                        await logSecurityEvent({
                            eventType: 'register_signup_confirmation_email_failed',
                            severity: 'WARNING',
                            ip,
                            userAgent,
                            source: SOURCE,
                            userId: existingAuthUser.user.id,
                            metadata: {
                                email: maskEmail(email),
                                email_fingerprint: emailFingerprint(email),
                                reason: resendError.message,
                                reused_existing_user: true
                            }
                        });

                        return res.status(503).json({
                            error: 'Encontramos um cadastro pendente, mas nao foi possivel reenviar o e-mail de confirmacao agora.',
                            error_code: 'confirmation_email_failed',
                            emailDeliveryIssue: true
                        });
                    }

                    await logSecurityEvent({
                        eventType: 'register_signup_success',
                        severity: 'INFO',
                        ip,
                        userAgent,
                        source: SOURCE,
                        userId: existingAuthUser.user.id,
                        metadata: {
                            email: maskEmail(email),
                            email_fingerprint: emailFingerprint(email),
                            license_side_effects: 'auth_only_until_activation',
                            account_status: accountStatus,
                            invited_signup: invite.valid,
                            reused_existing_user: true,
                            profile_recovered_after_signup: persistence.recoveredProfile
                        }
                    });

                    return res.status(200).json({
                        success: true,
                        approvalPending: launchSettings.manualApprovalEnabled,
                        inviteValid: invite.valid,
                        inviteExpiresAt: invite.expiresAt
                    });
                }

                await logSecurityEvent({
                    eventType: 'register_signup_duplicate',
                    severity: 'INFO',
                    ip,
                    userAgent,
                    source: SOURCE,
                    userId: existingAuthUser.user.id,
                    metadata: {
                        email: maskEmail(email),
                        email_fingerprint: emailFingerprint(email),
                        reused_existing_user: true
                    }
                });

                return res.status(409).json({
                    error: 'E-mail ja cadastrado. Use outro ou recupere sua senha.',
                    error_code: 'email_exists'
                });
            }

            const { data, error } = await central.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: name,
                        whatsapp: whatsapp,
                        phone: whatsapp,
                        role: 'admin',
                        source: 'register_page',
                        partner_id: partnerId,
                        partner_consent: partnerId ? partnerConsent : false,
                        account_status: accountStatus,
                        invite_token: invite.valid ? inviteToken : null
                    },
                    emailRedirectTo: redirectPath
                }
            });

            if (error) {
                const message = error.message || 'Erro ao criar conta.';
                const isDuplicate = /already registered|already exists/i.test(message);
                const isEmailRateLimited = /email rate limit exceeded/i.test(message);
                const isConfirmationEmailFailure = /error sending confirmation email/i.test(message);
                const derivedErrorCode = isDuplicate
                    ? 'email_exists'
                    : isEmailRateLimited
                        ? 'auth_email_rate_limited'
                        : isConfirmationEmailFailure
                            ? 'confirmation_email_failed'
                            : 'signup_failed';
                const statusCode = isDuplicate
                    ? 409
                    : isEmailRateLimited
                        ? 429
                        : isConfirmationEmailFailure
                            ? 503
                            : 400;

                await logSecurityEvent({
                    eventType: isDuplicate
                        ? 'register_signup_duplicate'
                        : isEmailRateLimited
                            ? 'register_signup_email_rate_limited'
                            : isConfirmationEmailFailure
                                ? 'register_signup_confirmation_email_failed'
                                : 'register_signup_failed',
                    severity: isDuplicate ? 'INFO' : 'WARNING',
                    ip,
                    userAgent,
                    source: SOURCE,
                    metadata: {
                        email: maskEmail(email),
                        email_fingerprint: emailFingerprint(email),
                        reason: message
                    }
                });

                return res.status(statusCode).json({
                    error: isDuplicate
                        ? 'E-mail ja cadastrado. Use outro ou recupere sua senha.'
                        : isEmailRateLimited
                            ? 'O servico de e-mail do cadastro atingiu o limite temporario de envio. Aguarde alguns minutos e tente novamente.'
                            : isConfirmationEmailFailure
                                ? 'Nao foi possivel enviar o e-mail de confirmacao agora. Tente novamente em alguns minutos.'
                                : message,
                    error_code: derivedErrorCode,
                    emailDeliveryIssue: isEmailRateLimited || isConfirmationEmailFailure
                });
            }

            if (!data.user?.id) {
                await logSecurityEvent({
                    eventType: 'register_signup_failed',
                    severity: 'CRITICAL',
                    ip,
                    userAgent,
                    source: SOURCE,
                    metadata: {
                        email: maskEmail(email),
                        email_fingerprint: emailFingerprint(email),
                        reason: 'signup_returned_without_user_id'
                    }
                });

                return res.status(503).json({
                    error: 'O cadastro nao foi persistido corretamente. Tente novamente em alguns instantes.',
                    error_code: 'signup_not_persisted'
                });
            }

            const persistence = await ensureSignupPersistence({
                userId: data.user.id,
                email,
                name,
                whatsapp,
                partnerId,
                partnerConsent,
                accountStatus,
                inviteToken: invite.valid ? inviteToken : null
            });

            if (!persistence.ok) {
                await logSecurityEvent({
                    eventType: 'register_signup_failed',
                    severity: 'CRITICAL',
                    ip,
                    userAgent,
                    source: SOURCE,
                    userId: data.user.id,
                    metadata: {
                        email: maskEmail(email),
                        email_fingerprint: emailFingerprint(email),
                        reason: persistence.reason || 'signup_persistence_failed'
                    }
                });

                return res.status(503).json({
                    error: 'O cadastro nao foi concluido com seguranca. Tente novamente em alguns instantes.',
                    error_code: 'signup_not_persisted'
                });
            }

            await logSecurityEvent({
                eventType: launchSettings.manualApprovalEnabled
                    ? 'register_signup_pending_approval'
                    : 'register_signup_success',
                severity: 'INFO',
                ip,
                userAgent,
                source: SOURCE,
                userId: data.user?.id || null,
                metadata: {
                    email: maskEmail(email),
                    email_fingerprint: emailFingerprint(email),
                    license_side_effects: 'auth_only_until_activation',
                    account_status: accountStatus,
                    invited_signup: invite.valid,
                    profile_recovered_after_signup: persistence.recoveredProfile
                }
            });

            return res.status(200).json({
                success: true,
                approvalPending: launchSettings.manualApprovalEnabled,
                inviteValid: invite.valid,
                inviteExpiresAt: invite.expiresAt
            });
        } catch (error: any) {
            console.error(`[${SOURCE}] Signup fatal error:`, error?.message || error);
            await logSecurityEvent({
                eventType: 'register_signup_failed',
                severity: 'CRITICAL',
                ip,
                userAgent,
                source: SOURCE,
                metadata: {
                    email: maskEmail(email),
                    email_fingerprint: emailFingerprint(email),
                    reason: error?.message || 'unexpected_error'
                }
            });

            return res.status(500).json({ error: 'Erro interno ao processar o cadastro.' });
        }
    }

    incrementMemoryBucket(`resend:ip:${ip}`, HARD_LIMITS.resendIp);
    incrementMemoryBucket(`resend:email:${emailFingerprint(email)}`, HARD_LIMITS.resendEmail);

    await logSecurityEvent({
        eventType: 'register_resend_attempt',
        severity: 'INFO',
        ip,
        userAgent,
        source: SOURCE,
        metadata: {
            email: maskEmail(email),
            email_fingerprint: emailFingerprint(email),
            flow
        }
    });

    const central = getCentralClient();
    if (!central) {
        return res.status(500).json({ error: 'Configuracao do servidor indisponivel.' });
    }

    try {
        const redirectPath = `${getPortalBaseUrl(req.headers.origin)}${flow === 'activation_setup' ? '/activate/setup' : '/activate'}`;
        const { error } = await central.auth.resend({
            type: 'signup',
            email,
            options: {
                emailRedirectTo: redirectPath
            }
        });

        if (error) {
            await logSecurityEvent({
                eventType: 'register_resend_failed',
                severity: 'WARNING',
                ip,
                userAgent,
                source: SOURCE,
                metadata: {
                    email: maskEmail(email),
                    email_fingerprint: emailFingerprint(email),
                    reason: error.message,
                    flow
                }
            });

            return res.status(400).json({
                error: error.message || 'Nao foi possivel reenviar o e-mail agora.',
                error_code: 'resend_failed'
            });
        }

        await logSecurityEvent({
            eventType: 'register_resend_success',
            severity: 'INFO',
            ip,
            userAgent,
            source: SOURCE,
            metadata: {
                email: maskEmail(email),
                email_fingerprint: emailFingerprint(email),
                flow
            }
        });

        return res.status(200).json({ success: true });
    } catch (error: any) {
        console.error(`[${SOURCE}] Resend fatal error:`, error?.message || error);
        await logSecurityEvent({
            eventType: 'register_resend_failed',
            severity: 'CRITICAL',
            ip,
            userAgent,
            source: SOURCE,
            metadata: {
                email: maskEmail(email),
                email_fingerprint: emailFingerprint(email),
                reason: error?.message || 'unexpected_error',
                flow
            }
        });

        return res.status(500).json({ error: 'Erro interno ao reenviar o e-mail.' });
    }
}

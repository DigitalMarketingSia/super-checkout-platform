import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { encrypt } from '../../src/core/utils/cryptoUtils.js';

/**
 * AUTH LOGIN PROXY — Rate Limited (Fase 15.3)
 * 
 * Proxies signInWithPassword through Vercel Serverless with:
 * 1. IP-based rate limiting (5 attempts / 5 min → 15 min block)
 * 2. Login event logging (success/failure)
 * 3. CORS whitelist (reuses standard pattern)
 * 
 * This prevents brute-force attacks that bypass Supabase's default
 * (very generous) rate limits.
 */

// --- CORS Whitelist ---
const ALLOWED_ORIGINS = [
    process.env.APP_URL,
    process.env.SUPER_CHECKOUT_APP_URL,
    process.env.SUPER_CHECKOUT_PORTAL_URL,
    process.env.SUPER_CHECKOUT_INSTALL_URL,
    process.env.VITE_SUPER_CHECKOUT_APP_URL,
    process.env.VITE_SUPER_CHECKOUT_PORTAL_URL,
    process.env.VITE_SUPER_CHECKOUT_INSTALL_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.NEXT_PUBLIC_APP_URL,
    'https://app.supercheckout.app',
    'https://portal.supercheckout.app',
    'https://install.supercheckout.app',
    'http://localhost:3000',
    'http://localhost:5173'
].filter(Boolean);

// --- Rate Limiting (In-Memory) ---
// Note: In-memory state is per-instance on Vercel Serverless.
// For coordinated multi-instance rate limiting, use a DB or Redis.
// This provides ~90% protection against single-origin brute force.

interface RateLimitEntry {
    attempts: number;
    firstAttempt: number;
    blockedUntil: number;
    blockLevel?: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

const RATE_LIMIT = {
    WINDOW_MS: 24 * 60 * 60 * 1000,   // 24 hours rolling window
    LEVELS: [
        { attempts: 5, blockMs: 15 * 60 * 1000, severity: 'WARNING' as const },
        { attempts: 10, blockMs: 60 * 60 * 1000, severity: 'CRITICAL' as const },
        { attempts: 20, blockMs: 24 * 60 * 60 * 1000, severity: 'FATAL' as const },
    ],
};

function getUserAgent(req: VercelRequest): string | null {
    return (req.headers['user-agent'] as string) || null;
}

function maskEmail(email: string): string {
    const [name, domain] = String(email || '').split('@');
    if (!name || !domain) return 'unknown';
    return `${name.slice(0, 2)}***@${domain}`;
}

function normalizeEmail(email: string): string {
    return String(email || '').trim().toLowerCase();
}

function emailFingerprint(email: string): string {
    return createHash('sha256').update(normalizeEmail(email)).digest('hex');
}

function getNextThreshold(attempts: number): number | null {
    const next = RATE_LIMIT.LEVELS.find((level) => attempts < level.attempts);
    return next?.attempts || null;
}

function formatRetryMessage(retryAfterSec?: number): string {
    const seconds = Number(retryAfterSec || 900);
    if (seconds >= 3600) {
        const hours = Math.ceil(seconds / 3600);
        return `Muitas tentativas de login. Tente novamente em ${hours} hora${hours > 1 ? 's' : ''}.`;
    }
    const mins = Math.ceil(seconds / 60);
    return `Muitas tentativas de login. Tente novamente em ${mins} minuto${mins > 1 ? 's' : ''}.`;
}

async function logAuthEvent(params: {
    supabaseUrl: string;
    serviceKey: string;
    eventType: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'FATAL';
    ip: string;
    userAgent: string | null;
    userId?: string | null;
    metadata?: Record<string, any>;
}) {
    try {
        if (!params.supabaseUrl || !params.serviceKey) return;
        const supabaseAdmin = createClient(params.supabaseUrl, params.serviceKey);
        const insertData: any = {
            event_type: params.eventType,
            severity: params.severity,
            ip_address: params.ip,
            metadata: {
                ...params.metadata,
                user_agent: params.userAgent,
                source: 'auth_login_proxy'
            }
        };
        if (params.userId) insertData.user_id = params.userId;
        const { error } = await supabaseAdmin.from('security_events').insert(insertData);
        if (error) console.warn('[Auth/Login] Security event insert failed:', error.message);
    } catch (error: any) {
        console.warn('[Auth/Login] Security event unexpected failure:', error?.message || error);
    }
}

async function countRecentFailedLogins(params: {
    supabaseUrl: string;
    serviceKey: string;
    ip: string;
}): Promise<number | null> {
    try {
        if (!params.supabaseUrl || !params.serviceKey) return null;

        const since = new Date(Date.now() - RATE_LIMIT.WINDOW_MS).toISOString();
        const supabaseAdmin = createClient(params.supabaseUrl, params.serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        });

        const { count, error } = await supabaseAdmin
            .from('security_events')
            .select('id', { count: 'exact', head: true })
            .eq('event_type', 'login_failed')
            .eq('ip_address', params.ip)
            .gte('created_at', since);

        if (error) {
            console.warn('[Auth/Login] Failed to count recent login failures:', error.message);
            return null;
        }

        return count || 0;
    } catch (error: any) {
        console.warn('[Auth/Login] Unexpected failure counting login failures:', error?.message || error);
        return null;
    }
}

async function sendProgressiveBlockNotification(params: {
    supabaseUrl: string;
    serviceKey: string;
    email: string;
    ip: string;
    userAgent: string | null;
    attempts: number;
    blockDurationSec: number;
    blockedUntilIso: string;
}) {
    try {
        if (!params.supabaseUrl || !params.serviceKey) return;

        const normalizedEmail = normalizeEmail(params.email);
        const supabaseAdmin = createClient(params.supabaseUrl, params.serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        });

        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('id,email,full_name')
            .eq('email', normalizedEmail)
            .maybeSingle();

        if (!profile?.email) {
            await logAuthEvent({
                supabaseUrl: params.supabaseUrl,
                serviceKey: params.serviceKey,
                eventType: 'login_progressive_notification_skipped',
                severity: 'INFO',
                ip: params.ip,
                userAgent: params.userAgent,
                metadata: {
                    email: maskEmail(params.email),
                    email_fingerprint: emailFingerprint(params.email),
                    reason: 'profile_not_found',
                    failed_attempts: params.attempts
                }
            });
            return;
        }

        const { data: integrations } = await supabaseAdmin
            .from('integrations')
            .select('config')
            .eq('name', 'resend')
            .eq('active', true)
            .limit(1);

        const integration = integrations?.[0];
        const apiKey = integration?.config?.apiKey || integration?.config?.api_key;
        const fromEmail = integration?.config?.senderEmail || integration?.config?.from_email || 'onboarding@resend.dev';

        if (!apiKey) {
            await logAuthEvent({
                supabaseUrl: params.supabaseUrl,
                serviceKey: params.serviceKey,
                eventType: 'login_progressive_notification_skipped',
                severity: 'WARNING',
                ip: params.ip,
                userAgent: params.userAgent,
                userId: profile.id,
                metadata: {
                    email: maskEmail(profile.email),
                    email_fingerprint: emailFingerprint(profile.email),
                    reason: 'resend_not_configured',
                    failed_attempts: params.attempts
                }
            });
            return;
        }

        const blockMinutes = Math.ceil(params.blockDurationSec / 60);
        const subject = 'Alerta de segurança: acesso temporariamente bloqueado';
        const plainText = [
            'Detectamos múltiplas tentativas de acesso sem sucesso na sua conta Super Checkout.',
            `Por segurança, novas tentativas foram bloqueadas temporariamente por ${blockMinutes} minuto(s).`,
            `IP de origem: ${params.ip}`,
            `Bloqueado até: ${params.blockedUntilIso}`,
            'Se foi você, aguarde o prazo e tente novamente. Se não foi você, recomendamos trocar sua senha quando acessar.'
        ].join('\n');

        const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                from: fromEmail,
                to: [profile.email],
                subject,
                text: plainText,
            }),
        });

        const resendPayload = await resendResponse.json().catch(() => ({}));
        await logAuthEvent({
            supabaseUrl: params.supabaseUrl,
            serviceKey: params.serviceKey,
            eventType: resendResponse.ok ? 'login_progressive_notification_sent' : 'login_progressive_notification_failed',
            severity: resendResponse.ok ? 'INFO' : 'WARNING',
            ip: params.ip,
            userAgent: params.userAgent,
            userId: profile.id,
            metadata: {
                email: maskEmail(profile.email),
                email_fingerprint: emailFingerprint(profile.email),
                failed_attempts: params.attempts,
                resend_id: resendPayload?.id,
                reason: resendResponse.ok ? undefined : JSON.stringify(resendPayload).slice(0, 200)
            }
        });
    } catch (error: any) {
        console.warn('[Auth/Login] Failed to send progressive block notification:', error?.message || error);
    }
}

function isRateLimited(key: string): { limited: boolean; retryAfterSec?: number; attempts?: number; blockLevel?: number } {
    const now = Date.now();
    const entry = rateLimitMap.get(key);

    if (!entry) return { limited: false };

    // Check if currently blocked
    if (entry.blockedUntil > now) {
        const retryAfterSec = Math.ceil((entry.blockedUntil - now) / 1000);
        return { limited: true, retryAfterSec, attempts: entry.attempts, blockLevel: entry.blockLevel };
    }

    // Reset if window expired
    if (now - entry.firstAttempt > RATE_LIMIT.WINDOW_MS) {
        rateLimitMap.delete(key);
        return { limited: false };
    }

    return { limited: false };
}

function recordFailedAttempt(key: string): { attempts: number; blockLevel?: typeof RATE_LIMIT.LEVELS[number]; retryAfterSec?: number } {
    const now = Date.now();
    const entry = rateLimitMap.get(key);

    if (!entry || (now - entry.firstAttempt > RATE_LIMIT.WINDOW_MS)) {
        rateLimitMap.set(key, { attempts: 1, firstAttempt: now, blockedUntil: 0 });
        return { attempts: 1 };
    }

    entry.attempts++;

    const blockLevel = RATE_LIMIT.LEVELS.find((level) => level.attempts === entry.attempts);
    if (blockLevel) {
        entry.blockedUntil = now + blockLevel.blockMs;
        entry.blockLevel = blockLevel.attempts;
        return {
            attempts: entry.attempts,
            blockLevel,
            retryAfterSec: Math.ceil(blockLevel.blockMs / 1000)
        };
    }

    return { attempts: entry.attempts };
}

function applyProgressiveBlock(key: string, attempts: number, blockLevel: typeof RATE_LIMIT.LEVELS[number]): number {
    const now = Date.now();
    const entry = rateLimitMap.get(key) || { attempts, firstAttempt: now, blockedUntil: 0 };
    entry.attempts = Math.max(entry.attempts, attempts);
    entry.blockedUntil = now + blockLevel.blockMs;
    entry.blockLevel = blockLevel.attempts;
    rateLimitMap.set(key, entry);
    return Math.ceil(blockLevel.blockMs / 1000);
}

function resetAttempts(key: string): void {
    rateLimitMap.delete(key);
}

function cleanupStaleRateLimitEntries(): void {
    const now = Date.now();
    const maxBlockMs = Math.max(...RATE_LIMIT.LEVELS.map((level) => level.blockMs));
    for (const [key, entry] of rateLimitMap.entries()) {
        if (now - entry.firstAttempt > RATE_LIMIT.WINDOW_MS + maxBlockMs) {
            rateLimitMap.delete(key);
        }
    }
}


export default async function handler(req: VercelRequest, res: VercelResponse) {
    cleanupStaleRateLimitEntries();

    // --- CORS ---
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0] || 'https://app.supercheckout.app');
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // --- Extract IP ---
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() 
             || req.socket?.remoteAddress 
             || 'unknown';

    // --- Rate Limit Check (FAIL-CLOSED) ---
    const { limited, retryAfterSec, attempts: limitedAttempts, blockLevel } = isRateLimited(ip);
    if (limited) {
        console.warn(`[Auth/Login] 🚫 Rate limited IP: ${ip} (retry in ${retryAfterSec}s)`);
        await logAuthEvent({
            supabaseUrl: process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
            serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '',
            eventType: 'login_rate_limited',
            severity: 'WARNING',
            ip,
            userAgent: getUserAgent(req),
            metadata: {
                target: req.body?.target || 'local',
                email: maskEmail(req.body?.email || ''),
                email_fingerprint: req.body?.email ? emailFingerprint(req.body.email) : undefined,
                failed_attempts: limitedAttempts,
                threshold: blockLevel,
                progressive: true
            }
        });
        res.setHeader('Retry-After', String(retryAfterSec || 900));
        return res.status(429).json({ 
            error: formatRetryMessage(retryAfterSec),
            error_code: 'rate_limited',
            retryAfterSec 
        });
    }

    // --- Validate Body ---
    const { email, password, target } = req.body || {};
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    }

    // --- Determine Target Supabase (local vs central) ---
    let supabaseUrl: string;
    let supabaseAnonKey: string;

    if (target === 'central') {
        // ActivationLogin uses Central Supabase
        supabaseUrl = process.env.VITE_CENTRAL_SUPABASE_URL || '';
        supabaseAnonKey = process.env.VITE_CENTRAL_SUPABASE_ANON_KEY || '';
    } else {
        // Default: Local Supabase (Login.tsx, MemberLogin.tsx)
        supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    }

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('[Auth/Login] Missing Supabase configuration');
        return res.status(500).json({ error: 'Erro de configuração do servidor.' });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';
    const auditSupabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || supabaseUrl;

    try {
        // --- Authenticate via Supabase ---
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            console.warn(`[Auth/Login] ❌ Failed login for ${email} from IP ${ip}: ${error.message}`);
            
            const failedAttempt = recordFailedAttempt(ip);
            await logAuthEvent({
                supabaseUrl: auditSupabaseUrl,
                serviceKey,
                eventType: 'login_failed',
                severity: 'WARNING',
                ip,
                userAgent: getUserAgent(req),
                metadata: {
                    target: target || 'local',
                    email: maskEmail(email),
                    reason: error.message,
                    failed_attempts: failedAttempt.attempts,
                    next_threshold: getNextThreshold(failedAttempt.attempts),
                    email_fingerprint: emailFingerprint(email)
                }
            });

            const persistedFailureCount = await countRecentFailedLogins({
                supabaseUrl: auditSupabaseUrl,
                serviceKey,
                ip
            });
            const effectiveAttempts = Math.max(failedAttempt.attempts, persistedFailureCount || 0);
            const thresholdBlock = RATE_LIMIT.LEVELS.find((level) => level.attempts === effectiveAttempts);
            const blockLevel = failedAttempt.blockLevel || thresholdBlock;

            if (blockLevel) {
                const retryAfterSec = applyProgressiveBlock(ip, effectiveAttempts, blockLevel);
                const blockedUntilIso = new Date(Date.now() + retryAfterSec * 1000).toISOString();

                await logAuthEvent({
                    supabaseUrl: auditSupabaseUrl,
                    serviceKey,
                    eventType: 'login_progressive_blocked',
                    severity: blockLevel.severity,
                    ip,
                    userAgent: getUserAgent(req),
                    metadata: {
                        target: target || 'local',
                        email: maskEmail(email),
                        email_fingerprint: emailFingerprint(email),
                        failed_attempts: effectiveAttempts,
                        threshold: blockLevel.attempts,
                        block_duration_sec: retryAfterSec,
                        blocked_until: blockedUntilIso,
                        reason: error.message
                    }
                });

                if (target !== 'central') {
                    await sendProgressiveBlockNotification({
                        supabaseUrl: auditSupabaseUrl,
                        serviceKey,
                        email,
                        ip,
                        userAgent: getUserAgent(req),
                        attempts: effectiveAttempts,
                        blockDurationSec: retryAfterSec,
                        blockedUntilIso
                    });
                }

                res.setHeader('Retry-After', String(retryAfterSec));
                return res.status(429).json({
                    error: formatRetryMessage(retryAfterSec),
                    error_code: 'progressive_login_block',
                    retryAfterSec,
                    failedAttempts: effectiveAttempts
                });
            }

            const nextThreshold = getNextThreshold(effectiveAttempts);
            const remainingAttempts = nextThreshold ? Math.max(0, nextThreshold - effectiveAttempts) : 0;

            return res.status(401).json({ 
                error: error.message === 'Invalid login credentials' 
                    ? 'Email ou senha incorretos.' 
                    : error.message,
                error_code: 'invalid_credentials',
                remainingAttempts,
                failedAttempts: effectiveAttempts
            });
        }

        // --- Success: Reset rate limit for this IP ---
        resetAttempts(ip);
        console.log(`[Auth/Login] ✅ Successful login for ${email} from IP ${ip}`);
        await logAuthEvent({
            supabaseUrl: auditSupabaseUrl,
            serviceKey,
            eventType: 'login_success',
            severity: 'INFO',
            ip,
            userAgent: getUserAgent(req),
            userId: target === 'central' ? null : data.user?.id,
            metadata: {
                target: target || 'local',
                email: maskEmail(email)
            }
        });

        if (target !== 'central') {
            try {
                if (!serviceKey) {
                    throw new Error('Missing service role key for 2FA inspection.');
                }

                const adminClient = createClient(auditSupabaseUrl, serviceKey, {
                    auth: {
                        autoRefreshToken: false,
                        persistSession: false
                    }
                });

                const { data: profile, error: profileError } = await adminClient
                    .from('profiles')
                    .select('id, email, totp_enabled, totp_secret_encrypted')
                    .eq('id', data.user.id)
                    .single();

                if (profileError) {
                    throw profileError;
                }

                if (profile?.totp_enabled) {
                    if (!profile.totp_secret_encrypted) {
                        console.warn(`[Auth/Login] 2FA enabled but secret missing for ${email}. Falling back to normal login.`);
                    } else {
                        const challengePayload = {
                            session: data.session,
                            user: data.user,
                            userId: data.user.id,
                            target: target || 'local',
                            expiresAt: Date.now() + (5 * 60 * 1000)
                        };

                        const challengeToken = encrypt(JSON.stringify(challengePayload));

                        await logAuthEvent({
                            supabaseUrl: auditSupabaseUrl,
                            serviceKey,
                            eventType: 'login_2fa_required',
                            severity: 'INFO',
                            ip,
                            userAgent: getUserAgent(req),
                            userId: data.user.id,
                            metadata: {
                                target: target || 'local',
                                email: maskEmail(email),
                                source: 'auth_login_proxy',
                                two_factor_required: true
                            }
                        });

                        return res.status(200).json({
                            requires_two_factor: true,
                            two_factor_token: challengeToken,
                            two_factor_expires_in_sec: 300,
                            user: data.user
                        });
                    }
                }
            } catch (inspectionError: any) {
                console.warn(`[Auth/Login] 2FA inspection skipped for ${email}:`, inspectionError?.message || inspectionError);
            }
        }

        if (target === 'central' && data.session?.access_token && data.user?.id) {
            try {
                const centralProfileClient = createClient(supabaseUrl, supabaseAnonKey, {
                    auth: {
                        autoRefreshToken: false,
                        persistSession: false
                    },
                    global: {
                        headers: {
                            Authorization: `Bearer ${data.session.access_token}`
                        }
                    }
                });

                const { data: centralProfile } = await centralProfileClient
                    .from('profiles')
                    .select('account_status, approval_notes, is_blocked, blocked_at')
                    .eq('id', data.user.id)
                    .maybeSingle();

                if (centralProfile?.is_blocked) {
                    return res.status(403).json({
                        error: 'Seu acesso ao portal foi bloqueado. Fale com o suporte para regularizar.',
                        error_code: 'blocked',
                        blocked_at: centralProfile.blocked_at || null
                    });
                }

                if (centralProfile?.account_status === 'pending_approval') {
                    return res.status(403).json({
                        error: 'Seu cadastro ainda esta em analise. Aguarde a aprovacao do time.',
                        error_code: 'pending_approval',
                        approval_notes: centralProfile.approval_notes || null
                    });
                }

                if (centralProfile?.account_status === 'rejected') {
                    return res.status(403).json({
                        error: 'Seu cadastro nao foi aprovado neste ciclo.',
                        error_code: 'rejected',
                        approval_notes: centralProfile.approval_notes || null
                    });
                }
            } catch (centralProfileError: any) {
                console.warn(`[Auth/Login] Central approval check skipped for ${email}:`, centralProfileError?.message || centralProfileError);
            }
        }

        // Return session data (the frontend needs the session to set auth state)
        return res.status(200).json({
            session: data.session,
            user: data.user
        });

    } catch (err: any) {
        console.error(`[Auth/Login] Fatal error for ${email} from IP ${ip}:`, err.message);
        return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
}

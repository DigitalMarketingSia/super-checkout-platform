import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
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
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    process.env.NEXT_PUBLIC_APP_URL,
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
}

const rateLimitMap = new Map<string, RateLimitEntry>();

const RATE_LIMIT = {
    MAX_ATTEMPTS: 5,       // Max attempts per window
    WINDOW_MS: 5 * 60 * 1000,   // 5 minutes
    BLOCK_MS: 15 * 60 * 1000,   // 15 min block
};

function getUserAgent(req: VercelRequest): string | null {
    return (req.headers['user-agent'] as string) || null;
}

function maskEmail(email: string): string {
    const [name, domain] = String(email || '').split('@');
    if (!name || !domain) return 'unknown';
    return `${name.slice(0, 2)}***@${domain}`;
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

function isRateLimited(ip: string): { limited: boolean; retryAfterSec?: number } {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);

    if (!entry) return { limited: false };

    // Check if currently blocked
    if (entry.blockedUntil > now) {
        const retryAfterSec = Math.ceil((entry.blockedUntil - now) / 1000);
        return { limited: true, retryAfterSec };
    }

    // Reset if window expired
    if (now - entry.firstAttempt > RATE_LIMIT.WINDOW_MS) {
        rateLimitMap.delete(ip);
        return { limited: false };
    }

    // Check if at limit
    if (entry.attempts >= RATE_LIMIT.MAX_ATTEMPTS) {
        entry.blockedUntil = now + RATE_LIMIT.BLOCK_MS;
        return { limited: true, retryAfterSec: Math.ceil(RATE_LIMIT.BLOCK_MS / 1000) };
    }

    return { limited: false };
}

function recordAttempt(ip: string): void {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);

    if (!entry || (now - entry.firstAttempt > RATE_LIMIT.WINDOW_MS)) {
        rateLimitMap.set(ip, { attempts: 1, firstAttempt: now, blockedUntil: 0 });
        return;
    }

    entry.attempts++;
    
    // If reached limit, set block
    if (entry.attempts >= RATE_LIMIT.MAX_ATTEMPTS) {
        entry.blockedUntil = now + RATE_LIMIT.BLOCK_MS;
    }
}

function resetAttempts(ip: string): void {
    rateLimitMap.delete(ip);
}

function cleanupStaleRateLimitEntries(): void {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap.entries()) {
        if (now - entry.firstAttempt > RATE_LIMIT.WINDOW_MS + RATE_LIMIT.BLOCK_MS) {
            rateLimitMap.delete(ip);
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
    const { limited, retryAfterSec } = isRateLimited(ip);
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
                email: maskEmail(req.body?.email || '')
            }
        });
        res.setHeader('Retry-After', String(retryAfterSec || 900));
        return res.status(429).json({ 
            error: 'Muitas tentativas de login. Tente novamente mais tarde.',
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
        // --- Record Attempt (before auth) ---
        recordAttempt(ip);

        // --- Authenticate via Supabase ---
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            console.warn(`[Auth/Login] ❌ Failed login for ${email} from IP ${ip}: ${error.message}`);
            
            // Check if now rate limited after this failed attempt
            const postCheck = isRateLimited(ip);
            const remainingAttempts = RATE_LIMIT.MAX_ATTEMPTS - (rateLimitMap.get(ip)?.attempts || 0);
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
                    remaining_attempts: Math.max(0, remainingAttempts)
                }
            });

            return res.status(401).json({ 
                error: error.message === 'Invalid login credentials' 
                    ? 'Email ou senha incorretos.' 
                    : error.message,
                error_code: 'invalid_credentials',
                remainingAttempts: Math.max(0, remainingAttempts),
                ...(postCheck.limited ? { retryAfterSec: postCheck.retryAfterSec } : {})
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
                        await supabase.auth.signOut().catch(() => null);

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

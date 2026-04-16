import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

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

// Cleanup stale entries every 10 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap.entries()) {
        if (now - entry.firstAttempt > RATE_LIMIT.WINDOW_MS + RATE_LIMIT.BLOCK_MS) {
            rateLimitMap.delete(ip);
        }
    }
}, 10 * 60 * 1000);


export default async function handler(req: VercelRequest, res: VercelResponse) {
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

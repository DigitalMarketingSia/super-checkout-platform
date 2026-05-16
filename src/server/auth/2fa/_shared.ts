import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';
import { decrypt, encrypt } from '../../../core/utils/cryptoUtils.js';

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
  ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:3000', 'http://localhost:5173'] : []),
].filter(Boolean);

export const TWO_FACTOR_ISSUER = 'Super Checkout';
export const TWO_FACTOR_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const DEV_CENTRAL_API_URL = 'https://bcmnryxjweiovrwmztpn.supabase.co/functions/v1';
const DEV_CENTRAL_SUPABASE_URL = 'https://bcmnryxjweiovrwmztpn.supabase.co';

function getDevFallback(value: string) {
  return process.env.NODE_ENV !== 'production' ? value : '';
}

export function applyCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0] || 'https://app.supercheckout.app');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function getIp(req: VercelRequest): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';
}

export function getUserAgent(req: VercelRequest): string | null {
  return (req.headers['user-agent'] as string) || null;
}

export function maskEmail(email: string): string {
  const [name, domain] = String(email || '').split('@');
  if (!name || !domain) return 'unknown';
  return `${name.slice(0, 2)}***@${domain}`;
}

export async function logSecurityEvent(params: {
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
    const admin = createClient(params.supabaseUrl, params.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await admin.from('security_events').insert({
      event_type: params.eventType,
      severity: params.severity,
      ip_address: params.ip,
      user_id: params.userId || null,
      metadata: {
        ...(params.metadata || {}),
        user_agent: params.userAgent || undefined,
        source: params.metadata?.source || 'auth_2fa',
      },
    });
  } catch (error: any) {
    console.warn('[2FA Shared] Failed to log security event:', error?.message || error);
  }
}

export function getSupabaseUrl(target?: string): string {
  if (target === 'central') {
    return process.env.VITE_CENTRAL_SUPABASE_URL
      || process.env.NEXT_PUBLIC_CENTRAL_SUPABASE_URL
      || process.env.VITE_CENTRAL_API_URL?.replace('/functions/v1', '')
      || getDevFallback(DEV_CENTRAL_API_URL.replace('/functions/v1', ''))
      || getDevFallback(DEV_CENTRAL_SUPABASE_URL);
  }
  return process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
}

export function getSupabaseAnonKey(target?: string): string {
  if (target === 'central') {
    return process.env.CENTRAL_SUPABASE_PUBLISHABLE_KEY
      || process.env.VITE_CENTRAL_SUPABASE_PUBLISHABLE_KEY
      || process.env.NEXT_PUBLIC_CENTRAL_SUPABASE_PUBLISHABLE_KEY
      || process.env.CENTRAL_SUPABASE_ANON_KEY
      || process.env.VITE_CENTRAL_SUPABASE_ANON_KEY
      || process.env.NEXT_PUBLIC_CENTRAL_SUPABASE_ANON_KEY
      || '';
  }
  return process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || '';
}

export function getSupabaseServiceKey(): string {
  return process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || '';
}

export function isLegacyApiKeyDisabledError(error: any): boolean {
  const message = String(error?.message || error?.error_description || error || '').toLowerCase();
  return message.includes('legacy api keys are disabled') || message.includes('legacy api key');
}

export function encryptChallenge(payload: Record<string, any>): string {
  return encrypt(JSON.stringify(payload));
}

export function createOpaqueChallengeToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashChallengeToken(token: string): string {
  const normalized = String(token || '').trim();
  if (!normalized) {
    throw new Error('EMPTY_CHALLENGE_TOKEN');
  }
  return createHash('sha256').update(normalized).digest('hex');
}

export function normalizeTotpCode(code: string): string {
  return String(code || '').replace(/[^\d]/g, '').trim();
}

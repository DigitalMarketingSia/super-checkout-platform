import { getEnv } from '../utils/env';

const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);

function readBooleanEnv(key: string): boolean {
    return TRUTHY_VALUES.has(String(getEnv(key) || '').trim().toLowerCase());
}

export function isSupabaseAuthCaptchaEnabled() {
    return readBooleanEnv('VITE_ENABLE_SUPABASE_AUTH_CAPTCHA')
        || readBooleanEnv('ENABLE_SUPABASE_AUTH_CAPTCHA');
}

export function getSupabaseAuthCaptchaSiteKey() {
    const siteKey = String(getEnv('VITE_TURNSTILE_SITE_KEY') || '').trim();
    return siteKey || null;
}

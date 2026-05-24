import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

type Bucket = {
    count: number;
    resetAt: number;
};

type RateLimitOptions = {
    scope: string;
    identifiers?: Array<string | null | undefined>;
    limit?: number;
    windowMs?: number;
};

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5000;

function getClientIp(req: VercelRequest) {
    const forwarded = req.headers['x-forwarded-for'];
    const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return firstForwarded?.split(',')[0]?.trim()
        || String(req.headers['cf-connecting-ip'] || '')
        || String(req.socket?.remoteAddress || '')
        || 'unknown';
}

function hashIdentifier(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function pruneExpired(now: number) {
    for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
    }

    if (buckets.size <= MAX_BUCKETS) return;

    const overflow = buckets.size - MAX_BUCKETS;
    for (const key of Array.from(buckets.keys()).slice(0, overflow)) {
        buckets.delete(key);
    }
}

function incrementBucket(key: string, now: number, windowMs: number) {
    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
        const fresh = { count: 1, resetAt: now + windowMs };
        buckets.set(key, fresh);
        return fresh;
    }

    existing.count += 1;
    return existing;
}

export function enforceApiRateLimit(
    req: VercelRequest,
    res: VercelResponse,
    options: RateLimitOptions,
) {
    const limit = options.limit ?? 20;
    const windowMs = options.windowMs ?? 15 * 60 * 1000;
    const now = Date.now();
    const ip = getClientIp(req);
    const normalizedIdentifiers = (options.identifiers || [])
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean);

    pruneExpired(now);

    const keys = [`${options.scope}:ip:${hashIdentifier(ip)}`];
    if (normalizedIdentifiers.length > 0) {
        keys.push(`${options.scope}:id:${hashIdentifier(normalizedIdentifiers.join('|'))}`);
    }

    let blockedBucket: Bucket | null = null;
    for (const key of keys) {
        const bucket = incrementBucket(key, now, windowMs);
        if (bucket.count > limit) blockedBucket = bucket;
    }

    if (!blockedBucket) {
        return { allowed: true, retryAfterSec: 0 };
    }

    const retryAfterSec = Math.max(1, Math.ceil((blockedBucket.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    console.warn('[rate-limit] Blocked request:', {
        scope: options.scope,
        has_identifiers: normalizedIdentifiers.length > 0,
        retry_after_sec: retryAfterSec,
    });

    return { allowed: false, retryAfterSec };
}

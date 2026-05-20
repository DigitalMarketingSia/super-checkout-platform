export function sanitizeGtmId(id: string | undefined): string | undefined {
    if (!id) return undefined;
    const cleaned = id.trim().toUpperCase();
    if (/^GTM-[A-Z0-9]+$/.test(cleaned)) return cleaned;
    return undefined;
}

export function sanitizeFacebookId(id: string | undefined): string | undefined {
    if (!id) return undefined;
    const cleaned = id.trim();
    if (/^\d+$/.test(cleaned)) return cleaned;
    return undefined;
}

export function sanitizeTiktokId(id: string | undefined): string | undefined {
    if (!id) return undefined;
    const cleaned = id.trim().toUpperCase();
    if (/^[A-Z0-9]+$/.test(cleaned)) return cleaned;
    return undefined;
}

export function sanitizeGoogleAnalyticsId(id: string | undefined): string | undefined {
    if (!id) return undefined;
    const cleaned = id.trim().toUpperCase();
    if (/^G-[A-Z0-9]+$/.test(cleaned)) return cleaned;
    return undefined;
}

export function sanitizeGoogleAdsId(id: string | undefined): string | undefined {
    if (!id) return undefined;
    const cleaned = id.trim().toUpperCase();
    if (/^AW-[A-Z0-9]+$/.test(cleaned)) return cleaned;
    return undefined;
}

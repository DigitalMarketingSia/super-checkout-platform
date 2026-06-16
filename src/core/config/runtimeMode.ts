export type RuntimeMode = 'standard' | 'demo';

export const getHostnameFromUrl = (url?: string) => {
    if (!url) return null;

    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return null;
    }
};

export const getCurrentHostname = () => {
    if (typeof window === 'undefined') return '';
    return window.location.hostname.toLowerCase();
};

export const isLocalHostname = (hostname: string) =>
    hostname.includes('localhost') || hostname.includes('127.0.0.1');

const DEMO_HOSTNAMES = new Set(
    [
        'demo.supercheckout.app',
        getHostnameFromUrl(import.meta.env.VITE_SUPER_CHECKOUT_DEMO_URL),
    ].filter(Boolean) as string[]
);

export const isDemoHostname = (hostname = getCurrentHostname()) =>
    DEMO_HOSTNAMES.has(hostname.toLowerCase());

export const getRuntimeMode = (hostname = getCurrentHostname()): RuntimeMode =>
    isDemoHostname(hostname) ? 'demo' : 'standard';

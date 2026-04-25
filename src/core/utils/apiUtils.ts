/**
 * Resolves the stable API URL for the application.
 * This ensures that even when accessing via a custom domain,
 * critical API calls are routed to the stable Vercel infrastructure.
 */
export const getApiUrl = (path: string): string => {
    // 1. Explicit API URL from environment (Only if strictly needed, e.g. local frontend -> remote backend)
    const explicitApiUrl = import.meta.env.VITE_API_URL;
    if (explicitApiUrl && explicitApiUrl.startsWith('http')) {
        return `${explicitApiUrl}${path}`;
    }

    // 2. Default: Relative path (Same-Origin)
    // This works perfectly for Custom Domains AND Vercel Domains
    return path.startsWith('/') ? path : `/${path}`;
};

/**
 * Resolves the stable Base URL (Origin)
 */
export const getBaseUrl = (): string => {
    const explicitApiUrl = import.meta.env.VITE_API_URL;
    if (explicitApiUrl) return explicitApiUrl;

    const vercelUrl = import.meta.env.VITE_VERCEL_URL;
    if (vercelUrl) return `https://${vercelUrl}`;

    return window.location.origin;
}

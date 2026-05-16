type QueryValue = string | number | boolean | null | undefined;

const DEFAULT_MARKETING_URL = 'https://supercheckout.app';
const DEFAULT_APP_URL = 'https://app.supercheckout.app';
const DEFAULT_PORTAL_URL = 'https://portal.supercheckout.app';
const DEFAULT_INSTALL_URL = 'https://install.supercheckout.app';

const normalizeBaseUrl = (url: string) => url.replace(/\/+$/, '');

const getEnvUrl = (key: string, fallback: string): string => {
    const env = (import.meta.env as unknown as Record<string, string | undefined>)[key];

    if (env) {
        return normalizeBaseUrl(env);
    }

    if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        return window.location.origin;
    }

    return fallback;
};

export const platformUrls = {
    marketing: getEnvUrl('VITE_SUPER_CHECKOUT_MARKETING_URL', DEFAULT_MARKETING_URL),
    app: getEnvUrl('VITE_SUPER_CHECKOUT_APP_URL', DEFAULT_APP_URL),
    portal: getEnvUrl('VITE_SUPER_CHECKOUT_PORTAL_URL', DEFAULT_PORTAL_URL),
    install: getEnvUrl('VITE_SUPER_CHECKOUT_INSTALL_URL', DEFAULT_INSTALL_URL),
};

export const buildPlatformUrl = (
    baseUrl: string,
    path: string,
    params?: Record<string, QueryValue>
): string => {
    const url = new URL(path.startsWith('/') ? path : `/${path}`, `${normalizeBaseUrl(baseUrl)}/`);

    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
            url.searchParams.set(key, String(value));
        }
    });

    return url.toString();
};

export const getRegisterUrl = (params?: Record<string, QueryValue>) =>
    buildPlatformUrl(platformUrls.portal, '/register', params);

export const getActivationUrl = () =>
    buildPlatformUrl(platformUrls.portal, '/activate');

export const getActivationSetupUrl = () =>
    buildPlatformUrl(platformUrls.portal, '/activate/setup');

export const getInstallerUrl = (token?: string | null) =>
    buildPlatformUrl(platformUrls.install, '/installer', { token });

export const getPlatformTermsUrl = () =>
    buildPlatformUrl(platformUrls.portal, '/legal/terms');

export const getPlatformPrivacyUrl = () =>
    buildPlatformUrl(platformUrls.portal, '/legal/privacy');

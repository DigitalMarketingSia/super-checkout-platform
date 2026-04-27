import { getEnv } from '../utils/env';

const DEFAULT_UPDATE_APP_SLUG = 'super-checkout-update-app';

const updateAppSlug = getEnv('VITE_GITHUB_UPDATE_APP_SLUG') || DEFAULT_UPDATE_APP_SLUG;

export const GITHUB_UPDATE_CONFIG = {
    APP_SLUG: updateAppSlug,
    INSTALL_URL:
        getEnv('VITE_GITHUB_UPDATE_APP_INSTALL_URL') ||
        `https://github.com/apps/${updateAppSlug}/installations/new`,
    SOURCE_REPOSITORY:
        getEnv('VITE_UPDATE_SOURCE_REPOSITORY') ||
        'DigitalMarketingSia/super-checkout-platform'
};

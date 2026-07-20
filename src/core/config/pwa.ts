export type PwaSurfaceKey = 'admin' | 'portal';
export type PwaCapability = 'shell' | 'serviceWorker' | 'push';

export const PWA_THEME_COLOR = '#05050A';
export const PWA_BACKGROUND_COLOR = '#05050A';
export const PWA_MANIFEST_PATHS: Record<PwaSurfaceKey, string> = {
  admin: '/manifest-admin.webmanifest',
  portal: '/manifest-portal.webmanifest',
};
export const PWA_SERVICE_WORKER_PATH = '/pwa-auth-sw.js';
export const PWA_SERVICE_WORKER_VERSION = '2026-07-19-42.3B';
export const PWA_SERVICE_WORKER_CACHE_PREFIX = 'super-checkout-auth-static:';

const PWA_SHELL_FLAG_NAME = 'VITE_PWA_SHELL_ENABLED';
const PWA_SERVICE_WORKER_FLAG_NAME = 'VITE_PWA_SW_ENABLED';
const PWA_PUSH_FLAG_NAME = 'VITE_PWA_PUSH_ENABLED';
const PWA_SHELL_SURFACES_FLAG_NAME = 'VITE_PWA_SHELL_SURFACES';
const PWA_SERVICE_WORKER_SURFACES_FLAG_NAME = 'VITE_PWA_SW_SURFACES';
const PWA_PUSH_SURFACES_FLAG_NAME = 'VITE_PWA_PUSH_SURFACES';
const PWA_HOST_ALLOWLIST_FLAG_NAME = 'VITE_PWA_HOST_ALLOWLIST';
const PWA_INSTALLATION_ALLOWLIST_FLAG_NAME = 'VITE_PWA_INSTALLATION_ALLOWLIST';
const PWA_PUSH_PUBLIC_KEY_FLAG_NAME = 'VITE_PWA_PUSH_PUBLIC_KEY';

const AUTHORIZED_SURFACES: Array<{ key: PwaSurfaceKey; pattern: RegExp }> = [
  { key: 'admin', pattern: /^\/admin(?:\/|$)/ },
  { key: 'portal', pattern: /^\/activate(?:\/|$)/ },
];

const readPwaFlag = (flagName: string, devDefault: boolean) => {
  const env = import.meta.env as Record<string, string | undefined>;
  const rawFlag = String(env[flagName] || '').trim().toLowerCase();

  if (import.meta.env.DEV) {
    return rawFlag ? rawFlag !== 'false' : devDefault;
  }

  return rawFlag === 'true';
};

export const isPwaShellEnabled = () => readPwaFlag(PWA_SHELL_FLAG_NAME, true);

export const isPwaServiceWorkerEnabled = () =>
  isPwaShellEnabled() && readPwaFlag(PWA_SERVICE_WORKER_FLAG_NAME, false);

export const isPwaPushEnabled = () =>
  isPwaServiceWorkerEnabled() && readPwaFlag(PWA_PUSH_FLAG_NAME, false);

const normalizeValue = (value: string | null | undefined) => String(value || '').trim().toLowerCase();

const readCsvEnv = (flagName: string) => {
  const env = import.meta.env as Record<string, string | undefined>;
  const raw = String(env[flagName] || '').trim();

  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map((item) => normalizeValue(item))
    .filter(Boolean);
};

const isSurfaceAllowlisted = (surfaceKey: PwaSurfaceKey, flagName: string) => {
  const allowedSurfaces = readCsvEnv(flagName);
  return allowedSurfaces.length === 0 || allowedSurfaces.includes(surfaceKey);
};

const doesHostnameMatchRule = (hostname: string, rule: string) => {
  if (rule === '*') {
    return true;
  }

  if (rule.startsWith('*.')) {
    const suffix = rule.slice(2);
    return Boolean(suffix) && hostname.endsWith(`.${suffix}`);
  }

  return hostname === rule;
};

const isHostnameAllowlisted = (hostname: string | null | undefined) => {
  const normalizedHostname = normalizeValue(hostname);
  const hostAllowlist = readCsvEnv(PWA_HOST_ALLOWLIST_FLAG_NAME);

  if (hostAllowlist.length === 0) {
    return true;
  }

  if (!normalizedHostname) {
    return false;
  }

  return hostAllowlist.some((rule) => doesHostnameMatchRule(normalizedHostname, rule));
};

const isInstallationAllowlisted = (installationId: string | null | undefined) => {
  const installationAllowlist = readCsvEnv(PWA_INSTALLATION_ALLOWLIST_FLAG_NAME);

  if (installationAllowlist.length === 0) {
    return true;
  }

  return installationAllowlist.includes(normalizeValue(installationId));
};

const getSurfaceFlagName = (capability: PwaCapability) =>
  capability === 'serviceWorker'
    ? PWA_SERVICE_WORKER_SURFACES_FLAG_NAME
    : capability === 'push'
      ? PWA_PUSH_SURFACES_FLAG_NAME
      : PWA_SHELL_SURFACES_FLAG_NAME;

export const getPwaSurfaceKey = (pathname: string): PwaSurfaceKey | null => {
  for (const surface of AUTHORIZED_SURFACES) {
    if (surface.pattern.test(pathname)) {
      return surface.key;
    }
  }

  return null;
};

export const isPwaInstallSurface = (pathname: string) => getPwaSurfaceKey(pathname) !== null;

export const getPwaInstallDismissStorageKey = (surfaceKey: PwaSurfaceKey) =>
  `pwa_install_banner_dismissed:${surfaceKey}:v1`;

export const getPwaManifestPath = (surfaceKey: PwaSurfaceKey) => PWA_MANIFEST_PATHS[surfaceKey];

export const getPwaServiceWorkerScriptUrl = () =>
  `${PWA_SERVICE_WORKER_PATH}?v=${encodeURIComponent(PWA_SERVICE_WORKER_VERSION)}`;

export const getPwaPushPublicKey = () => {
  const env = import.meta.env as Record<string, string | undefined>;
  return String(env[PWA_PUSH_PUBLIC_KEY_FLAG_NAME] || '').trim();
};

export const isPwaPushConfigured = () => Boolean(getPwaPushPublicKey());

export interface PwaRolloutContext {
  surfaceKey: PwaSurfaceKey | null;
  hostname?: string | null;
  installationId?: string | null;
}

const isCapabilityGloballyEnabled = (capability: PwaCapability) =>
  capability === 'serviceWorker'
    ? isPwaServiceWorkerEnabled()
    : capability === 'push'
      ? isPwaPushEnabled()
      : isPwaShellEnabled();

export const isPwaCapabilityEnabledForContext = (
  capability: PwaCapability,
  context: PwaRolloutContext
) => {
  const { surfaceKey, hostname, installationId } = context;

  if (!surfaceKey) {
    return false;
  }

  if (!isCapabilityGloballyEnabled(capability)) {
    return false;
  }

  if (!isSurfaceAllowlisted(surfaceKey, getSurfaceFlagName(capability))) {
    return false;
  }

  if (!isHostnameAllowlisted(hostname)) {
    return false;
  }

  if (!isInstallationAllowlisted(installationId)) {
    return false;
  }

  return true;
};

export type ConsentSourceSurface = 'public_checkout' | 'thank_you';

export type ConsentCategory = 'necessary' | 'analytics' | 'marketing';

export type ConsentCategories = {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
};

export interface StoredConsentPreference {
  visitorKey: string;
  checkoutId: string;
  sourceSurface: ConsentSourceSurface;
  consentVersion: string;
  categories: ConsentCategories;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
}

export const CONSENT_VERSION = 'lgpd-consent-2026.05';
export const CONSENT_STORAGE_KEY_PREFIX = 'sc_consent_preferences_v1';
export const CONSENT_VISITOR_KEY_STORAGE_KEY = 'sc_consent_visitor_key_v1';

export const DEFAULT_CONSENT_CATEGORIES: ConsentCategories = {
  necessary: true,
  analytics: false,
  marketing: false,
};

export const DEFAULT_CONSENT_SOURCE_SURFACES: ConsentSourceSurface[] = ['public_checkout', 'thank_you'];

export function getConsentStorageKey(checkoutId: string) {
  return `${CONSENT_STORAGE_KEY_PREFIX}:${String(checkoutId || '').trim()}`;
}

export function normalizeConsentCategories(value?: Partial<ConsentCategories> | null): ConsentCategories {
  return {
    necessary: true,
    analytics: value?.analytics === true,
    marketing: value?.marketing === true,
  };
}

export function isConsentSourceSurface(value: unknown): value is ConsentSourceSurface {
  return DEFAULT_CONSENT_SOURCE_SURFACES.includes(value as ConsentSourceSurface);
}

export function normalizeConsentSourceSurface(value: unknown, fallback: ConsentSourceSurface): ConsentSourceSurface {
  return isConsentSourceSurface(value) ? value : fallback;
}

export function parseStoredConsentPreference(value: unknown): StoredConsentPreference | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const raw = value as Record<string, unknown>;
  const visitorKey = String(raw.visitorKey || '').trim();
  const checkoutId = String(raw.checkoutId || '').trim();
  const consentVersion = String(raw.consentVersion || '').trim();
  const sourceSurface = normalizeConsentSourceSurface(raw.sourceSurface, 'public_checkout');

  if (!visitorKey || !checkoutId || !consentVersion) return null;

  return {
    visitorKey,
    checkoutId,
    sourceSurface,
    consentVersion,
    categories: normalizeConsentCategories(raw.categories as Partial<ConsentCategories> | null),
    createdAt: String(raw.createdAt || '').trim() || new Date().toISOString(),
    updatedAt: String(raw.updatedAt || '').trim() || new Date().toISOString(),
    revokedAt: String(raw.revokedAt || '').trim() || null,
  };
}

export function hasOptionalConsent(categories?: Partial<ConsentCategories> | null) {
  const normalized = normalizeConsentCategories(categories);
  return normalized.analytics || normalized.marketing;
}

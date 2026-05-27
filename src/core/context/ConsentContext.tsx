import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getApiUrl } from '../utils/apiUtils';
import {
  CONSENT_VERSION,
  CONSENT_VISITOR_KEY_STORAGE_KEY,
  DEFAULT_CONSENT_CATEGORIES,
  type ConsentCategories,
  type ConsentSourceSurface,
  type StoredConsentPreference,
  getConsentStorageKey,
  normalizeConsentCategories,
  normalizeConsentSourceSurface,
  parseStoredConsentPreference,
} from '../utils/consent';

type SaveConsentOptions = {
  categories: Partial<ConsentCategories>;
  sourceSurface?: ConsentSourceSurface;
};

interface ConsentContextValue {
  checkoutId: string;
  isLoaded: boolean;
  hasPreference: boolean;
  preferences: StoredConsentPreference | null;
  visitorKey: string;
  isPreferencesOpen: boolean;
  allowsAnalytics: boolean;
  allowsMarketing: boolean;
  acceptAll: () => Promise<void>;
  rejectOptional: () => Promise<void>;
  savePreferences: (options: SaveConsentOptions) => Promise<void>;
  openPreferences: () => void;
  closePreferences: () => void;
}

const ConsentContext = createContext<ConsentContextValue | undefined>(undefined);

function buildVisitorKey() {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `visitor-${Math.random().toString(36).slice(2, 12)}-${Date.now().toString(36)}`;
}

function readOrCreateVisitorKey() {
  if (typeof window === 'undefined') return '';

  const existing = String(window.localStorage.getItem(CONSENT_VISITOR_KEY_STORAGE_KEY) || '').trim();
  if (existing) return existing;

  const next = buildVisitorKey();
  window.localStorage.setItem(CONSENT_VISITOR_KEY_STORAGE_KEY, next);
  return next;
}

async function persistConsentPreference(preference: StoredConsentPreference) {
  try {
    await fetch(getApiUrl('/api/system?action=consent-preferences'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        checkoutId: preference.checkoutId,
        visitorKey: preference.visitorKey,
        sourceSurface: preference.sourceSurface,
        consentVersion: preference.consentVersion,
        categories: preference.categories,
        createdAt: preference.createdAt,
        updatedAt: preference.updatedAt,
        revokedAt: preference.revokedAt,
      }),
    });
  } catch (error) {
    console.warn('[Consent] Failed to persist consent preference:', error);
  }
}

export const ConsentProvider: React.FC<{
  checkoutId: string;
  sourceSurface: ConsentSourceSurface;
  children: React.ReactNode;
}> = ({ checkoutId, sourceSurface, children }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [preferences, setPreferences] = useState<StoredConsentPreference | null>(null);
  const [visitorKey, setVisitorKey] = useState('');
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const scopedKey = getConsentStorageKey(checkoutId);
    const storedPreference = parseStoredConsentPreference(window.localStorage.getItem(scopedKey));
    const resolvedVisitorKey = readOrCreateVisitorKey();

    setVisitorKey(resolvedVisitorKey);

    if (storedPreference && storedPreference.consentVersion === CONSENT_VERSION) {
      setPreferences(storedPreference);
    }

    setIsLoaded(true);
  }, [checkoutId]);

  const savePreferences = async ({ categories, sourceSurface: nextSourceSurface }: SaveConsentOptions) => {
    const normalizedCategories = normalizeConsentCategories(categories);
    const now = new Date().toISOString();
    const scopedKey = getConsentStorageKey(checkoutId);
    const effectiveVisitorKey = visitorKey || readOrCreateVisitorKey();
    const current = preferences;

    const nextPreference: StoredConsentPreference = {
      visitorKey: effectiveVisitorKey,
      checkoutId,
      sourceSurface: normalizeConsentSourceSurface(nextSourceSurface, sourceSurface),
      consentVersion: CONSENT_VERSION,
      categories: normalizedCategories,
      createdAt: current?.createdAt || now,
      updatedAt: now,
      revokedAt: normalizedCategories.analytics || normalizedCategories.marketing ? null : now,
    };

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(scopedKey, JSON.stringify(nextPreference));
    }

    setVisitorKey(effectiveVisitorKey);
    setPreferences(nextPreference);
    setIsPreferencesOpen(false);

    await persistConsentPreference(nextPreference);
  };

  const value = useMemo<ConsentContextValue>(() => ({
    checkoutId,
    isLoaded,
    hasPreference: Boolean(preferences),
    preferences,
    visitorKey,
    isPreferencesOpen,
    allowsAnalytics: preferences?.categories.analytics === true,
    allowsMarketing: preferences?.categories.marketing === true,
    acceptAll: () => savePreferences({
      categories: {
        necessary: true,
        analytics: true,
        marketing: true,
      },
    }),
    rejectOptional: () => savePreferences({
      categories: DEFAULT_CONSENT_CATEGORIES,
    }),
    savePreferences,
    openPreferences: () => setIsPreferencesOpen(true),
    closePreferences: () => setIsPreferencesOpen(false),
  }), [checkoutId, isLoaded, preferences, visitorKey, isPreferencesOpen]);

  return (
    <ConsentContext.Provider value={value}>
      {children}
    </ConsentContext.Provider>
  );
};

export function useConsent() {
  const context = useContext(ConsentContext);
  if (!context) {
    return {
      checkoutId: '',
      isLoaded: true,
      hasPreference: false,
      preferences: null,
      visitorKey: '',
      isPreferencesOpen: false,
      allowsAnalytics: false,
      allowsMarketing: false,
      acceptAll: async () => {},
      rejectOptional: async () => {},
      savePreferences: async () => {},
      openPreferences: () => {},
      closePreferences: () => {},
    } satisfies ConsentContextValue;
  }

  return context;
}

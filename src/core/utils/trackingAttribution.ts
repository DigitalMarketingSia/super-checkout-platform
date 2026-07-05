export interface CheckoutTrackingAttribution {
  captured_at: string;
  landing_url?: string | null;
  landing_path?: string | null;
  referrer?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  src?: string | null;
  s1?: string | null;
  s2?: string | null;
  s3?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  ttclid?: string | null;
}

export const CHECKOUT_TRACKING_ATTRIBUTION_STORAGE_KEY = 'checkout_tracking_attribution_v1';
const TRACKING_ATTRIBUTION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const ATTRIBUTION_KEYS: Array<keyof CheckoutTrackingAttribution> = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'src',
  's1',
  's2',
  's3',
  'fbclid',
  'gclid',
  'gbraid',
  'wbraid',
  'ttclid',
];

function cleanValue(value: unknown, maxLength = 240) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function normalizeUrl(value: unknown, maxLength = 1000) {
  const normalized = cleanValue(value, maxLength);
  if (!normalized) return null;

  try {
    return new URL(normalized).toString().slice(0, maxLength);
  } catch {
    return normalized;
  }
}

export function normalizeCheckoutTrackingAttribution(
  value: Partial<CheckoutTrackingAttribution> | null | undefined,
): CheckoutTrackingAttribution | null {
  if (!value || typeof value !== 'object') return null;

  const capturedAt = cleanValue(value.captured_at, 40) || new Date().toISOString();
  const normalized: CheckoutTrackingAttribution = {
    captured_at: capturedAt,
    landing_url: normalizeUrl(value.landing_url),
    landing_path: cleanValue(value.landing_path, 500),
    referrer: normalizeUrl(value.referrer),
  };

  for (const key of ATTRIBUTION_KEYS) {
    normalized[key] = cleanValue(value[key]);
  }

  return normalized;
}

function getTrackingAttributionStorage() {
  if (typeof window === 'undefined') return null;

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function clearLegacyTrackingAttributionStorage() {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(CHECKOUT_TRACKING_ATTRIBUTION_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function isExpiredAttribution(attribution: CheckoutTrackingAttribution | null) {
  if (!attribution?.captured_at) return true;

  const capturedAt = new Date(attribution.captured_at).getTime();
  if (Number.isNaN(capturedAt)) return true;

  return Date.now() - capturedAt > TRACKING_ATTRIBUTION_MAX_AGE_MS;
}

export function readStoredCheckoutTrackingAttribution() {
  if (typeof window === 'undefined') return null;

  try {
    const storage = getTrackingAttributionStorage();
    const sessionRaw = storage?.getItem(CHECKOUT_TRACKING_ATTRIBUTION_STORAGE_KEY) || '';
    const legacyRaw = sessionRaw ? '' : String(window.localStorage.getItem(CHECKOUT_TRACKING_ATTRIBUTION_STORAGE_KEY) || '');
    const raw = sessionRaw || legacyRaw;
    if (!raw) return null;

    const normalized = normalizeCheckoutTrackingAttribution(JSON.parse(raw));
    if (!normalized || isExpiredAttribution(normalized)) {
      storage?.removeItem(CHECKOUT_TRACKING_ATTRIBUTION_STORAGE_KEY);
      clearLegacyTrackingAttributionStorage();
      return null;
    }

    if (!sessionRaw && legacyRaw && storage) {
      storage.setItem(CHECKOUT_TRACKING_ATTRIBUTION_STORAGE_KEY, JSON.stringify(normalized));
      clearLegacyTrackingAttributionStorage();
    }

    return normalized;
  } catch {
    return null;
  }
}

function buildAttributionFromWindow() {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const currentUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;

  return normalizeCheckoutTrackingAttribution({
    captured_at: new Date().toISOString(),
    landing_url: currentUrl,
    landing_path: `${window.location.pathname}${window.location.search}`,
    referrer: typeof document !== 'undefined' ? document.referrer : '',
    utm_source: params.get('utm_source'),
    utm_medium: params.get('utm_medium'),
    utm_campaign: params.get('utm_campaign'),
    utm_content: params.get('utm_content'),
    utm_term: params.get('utm_term'),
    src: params.get('src'),
    s1: params.get('s1'),
    s2: params.get('s2'),
    s3: params.get('s3'),
    fbclid: params.get('fbclid'),
    gclid: params.get('gclid'),
    gbraid: params.get('gbraid'),
    wbraid: params.get('wbraid'),
    ttclid: params.get('ttclid'),
  });
}

function mergeAttribution(
  stored: CheckoutTrackingAttribution | null,
  current: CheckoutTrackingAttribution | null,
) {
  if (!stored && !current) return null;
  if (!stored) return current;
  if (!current) return stored;

  return normalizeCheckoutTrackingAttribution({
    ...stored,
    ...current,
    landing_url: stored.landing_url || current.landing_url,
    landing_path: stored.landing_path || current.landing_path,
    referrer: stored.referrer || current.referrer,
    captured_at: stored.captured_at || current.captured_at,
  });
}

export function captureCheckoutTrackingAttribution() {
  if (typeof window === 'undefined') return null;

  const stored = readStoredCheckoutTrackingAttribution();
  const current = buildAttributionFromWindow();
  const next = mergeAttribution(stored, current);

  if (!next) return null;

  try {
    const storage = getTrackingAttributionStorage();
    storage?.setItem(
      CHECKOUT_TRACKING_ATTRIBUTION_STORAGE_KEY,
      JSON.stringify(next),
    );
    clearLegacyTrackingAttributionStorage();
  } catch (error) {
    console.warn('[TrackingAttribution] Failed to persist attribution:', error);
  }

  return next;
}

export function hasTrackingAttributionSignal(attribution?: CheckoutTrackingAttribution | null) {
  if (!attribution) return false;

  return ATTRIBUTION_KEYS.some((key) => Boolean(cleanValue(attribution[key])));
}

export function buildTrackingAttributionEventFields(attribution?: CheckoutTrackingAttribution | null) {
  if (!attribution) return {};

  const fields: Record<string, string> = {};
  for (const key of ['landing_url', 'landing_path', 'referrer', ...ATTRIBUTION_KEYS] as Array<keyof CheckoutTrackingAttribution>) {
    const normalized = cleanValue(attribution[key], 1000);
    if (normalized) fields[key] = normalized;
  }

  return fields;
}

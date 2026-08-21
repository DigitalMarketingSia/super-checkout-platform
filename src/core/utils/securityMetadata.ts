const BLOCKED_METADATA_KEYS = new Set([
  'password',
  'secret',
  'private_key',
  'webhook_secret',
  'token',
  'access_token',
  'refresh_token',
  'captcha_token',
]);

const BLOCKED_METADATA_KEY_FRAGMENTS = ['cpf', 'cnpj', 'document', 'phone', 'whatsapp'];
const MAX_DEPTH = 4;
const MAX_ENTRIES = 50;
const MAX_ARRAY_ITEMS = 20;
const MAX_STRING_LENGTH = 500;

function isBlockedKey(key: string) {
  const normalized = String(key || '').trim().toLowerCase();
  return BLOCKED_METADATA_KEYS.has(normalized)
    || BLOCKED_METADATA_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return '[max_depth]';
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, MAX_STRING_LENGTH);
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, depth + 1));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !isBlockedKey(key))
        .slice(0, MAX_ENTRIES)
        .map(([key, nestedValue]) => [key, sanitizeValue(nestedValue, depth + 1)]),
    );
  }

  return String(value || '').slice(0, MAX_STRING_LENGTH);
}

export function sanitizeSecurityMetadata(metadata: Record<string, unknown> = {}) {
  return sanitizeValue(metadata, 0) as Record<string, unknown>;
}

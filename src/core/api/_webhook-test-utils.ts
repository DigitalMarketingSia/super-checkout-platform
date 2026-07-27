import { createHmac } from 'node:crypto';

export const WEBHOOK_TEST_EVENT = 'pagamento.aprovado';

const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

type WebhookTestHeader = {
  key?: unknown;
  value?: unknown;
};

export type WebhookTestSignatureMode = 'legacy' | 'hmac_sha256';

export function hmacSha256Hex(secret: string, timestamp: string, rawBody: string) {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
}

export function getSafeWebhookUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return null;

    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host === '0.0.0.0' || host === '::1' || host === '[::1]') return null;
    if (host.startsWith('127.') || host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('169.254.')) return null;

    const ipv4Parts = host.split('.').map(Number);
    if (ipv4Parts.length === 4 && ipv4Parts.every(Number.isInteger) && ipv4Parts[0] === 172 && ipv4Parts[1] >= 16 && ipv4Parts[1] <= 31) return null;
    if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:') || host.startsWith('[fc') || host.startsWith('[fd') || host.startsWith('[fe80:')) return null;

    return url;
  } catch {
    return null;
  }
}

export function buildWebhookTestHeaders(params: {
  customHeaders?: unknown;
  secret?: string | null;
  signatureMode?: string | null;
  timestamp: string;
  rawBody: string;
}) {
  const headers: Record<string, string> = {};

  if (Array.isArray(params.customHeaders)) {
    for (const item of params.customHeaders as WebhookTestHeader[]) {
      const key = String(item?.key || '').trim();
      const value = String(item?.value || '').trim();
      if (!HEADER_NAME_PATTERN.test(key) || !value || /[\r\n]/.test(value)) continue;
      headers[key] = value;
    }
  }

  // Reserved transport headers are set after custom values so a stored custom
  // header can never replace the event metadata or its cryptographic proof.
  headers['Content-Type'] = 'application/json';
  headers['X-Super-Checkout-Event'] = WEBHOOK_TEST_EVENT;

  if (!params.secret) return headers;

  if (params.signatureMode === 'legacy') {
    headers['X-Super-Checkout-Signature'] = params.secret;
    return headers;
  }

  headers['X-Super-Checkout-Timestamp'] = params.timestamp;
  headers['X-Super-Checkout-Signature'] = `sha256=${hmacSha256Hex(params.secret, params.timestamp, params.rawBody)}`;
  headers['X-Super-Checkout-Signature-Version'] = 'v1';
  return headers;
}

export function updateWebhookTestUrl(url: URL, method: string, payloadTimestamp: string) {
  if (method !== 'GET') return url.toString();

  url.searchParams.set('test', 'true');
  url.searchParams.set('event', WEBHOOK_TEST_EVENT);
  url.searchParams.set('timestamp', payloadTimestamp);
  return url.toString();
}

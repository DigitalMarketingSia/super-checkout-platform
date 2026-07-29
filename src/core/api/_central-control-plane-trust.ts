import { createHash, createHmac, randomUUID } from 'node:crypto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNATURE_VERSION = 'v1';

function sha256Hex(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function assertUuid(value: string, name: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${name} must be a UUID.`);
  }
}

/**
 * The control-plane key belongs only to the official Vercel deployment and
 * the Central Supabase project. It is intentionally separate from both the
 * per-installation credential and the retiring CENTRAL_SHARED_SECRET.
 */
export function getCentralControlPlaneHmacKey(): string | null {
  const key = String(process.env.CENTRAL_CONTROL_PLANE_HMAC_KEY || '').trim();
  if (!key) return null;
  if (key.length < 32) {
    throw new Error('CENTRAL_CONTROL_PLANE_HMAC_KEY is invalid.');
  }
  return key;
}

export function buildCentralControlPlaneTrustHeaders(input: {
  key: string;
  method: string;
  endpoint: string;
  rawBody: string;
  queryString?: string;
  timestamp?: string;
  requestId?: string;
}) {
  if (!/^[a-z0-9][a-z0-9._/-]*$/i.test(input.endpoint)) {
    throw new Error('Central endpoint is invalid for control-plane HMAC signing.');
  }

  const timestamp = input.timestamp || String(Math.floor(Date.now() / 1000));
  const requestId = input.requestId || randomUUID();
  assertUuid(requestId, 'control-plane request id');

  const canonicalValue = [
    SIGNATURE_VERSION,
    timestamp,
    requestId,
    input.method.toUpperCase(),
    input.endpoint,
    sha256Hex(input.queryString || ''),
    sha256Hex(input.rawBody),
  ].join('.');
  const signature = createHmac('sha256', input.key)
    .update(canonicalValue, 'utf8')
    .digest('hex');

  return {
    'x-super-checkout-control-plane-version': SIGNATURE_VERSION,
    'x-super-checkout-control-plane-timestamp': timestamp,
    'x-super-checkout-control-plane-request-id': requestId,
    'x-super-checkout-control-plane-signature': `sha256=${signature}`,
  };
}

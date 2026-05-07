import crypto from 'crypto';

const TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getSecret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.CENTRAL_SERVICE_ROLE_KEY || '';
}

/**
 * Creates a signed login token containing the user's email.
 * Used in purchase confirmation emails so the user can auto-login
 * when clicking the member area link.
 */
export function createLoginToken(email: string): string {
  const secret = getSecret();
  if (!secret) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or CENTRAL_SERVICE_ROLE_KEY for token signing.');

  const payload = JSON.stringify({
    email: email.toLowerCase().trim(),
    exp: Date.now() + TOKEN_MAX_AGE_MS,
  });
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

/**
 * Verifies a signed login token and returns the email if valid.
 */
export function verifyLoginToken(token: string): { email: string } | null {
  const secret = getSecret();
  if (!secret || !token) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');

  if (sig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    if (!payload.email || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}

import crypto from 'crypto';

const DEFAULT_TICKET_TTL_MINUTES = 30;

function getSecret(): string {
  return process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SECRET_KEY_NEW
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY_NEW
    || process.env.CENTRAL_SUPABASE_SECRET_KEY
    || process.env.CENTRAL_SUPABASE_SECRET_KEY_NEW
    || process.env.CENTRAL_SERVICE_ROLE_KEY
    || '';
}

function getTicketTtlMs(): number {
  const raw = Number(process.env.MEMBER_LOGIN_TICKET_TTL_MINUTES || DEFAULT_TICKET_TTL_MINUTES);
  const minutes = Number.isFinite(raw) ? Math.max(5, Math.min(raw, 24 * 60)) : DEFAULT_TICKET_TTL_MINUTES;
  return minutes * 60 * 1000;
}

function normalizeEmail(email: string): string {
  return String(email || '').toLowerCase().trim();
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(String(token || '').trim()).digest('hex');
}

/**
 * Creates an opaque, one-time member login ticket.
 * The raw token is only sent by email; the database stores only its hash.
 */
export async function createLoginToken(
  supabaseAdmin: any,
  params: {
    email: string;
    orderId?: string | null;
    memberAreaId?: string | null;
    productId?: string | null;
  },
): Promise<string> {
  if (!supabaseAdmin) throw new Error('Missing Supabase admin client for member login ticket.');

  const email = normalizeEmail(params.email);
  if (!email) throw new Error('Missing email for member login ticket.');

  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + getTicketTtlMs()).toISOString();

  const { error } = await supabaseAdmin
    .from('member_login_tickets')
    .insert({
      token_hash: hashToken(token),
      email,
      order_id: params.orderId || null,
      member_area_id: params.memberAreaId || null,
      product_id: params.productId || null,
      expires_at: expiresAt,
      metadata: {
        source: 'order_deliverables',
        ttl_minutes: Math.round(getTicketTtlMs() / 60000),
      },
    });

  if (error) {
    throw new Error(error.message || 'Failed to create member login ticket.');
  }

  return token;
}

/**
 * Consumes a member login ticket once. Replay, missing and expired tickets fail closed.
 */
export async function consumeLoginToken(supabaseAdmin: any, token: string): Promise<{ email: string } | null> {
  if (!supabaseAdmin || !token) return null;

  const tokenHash = hashToken(token);
  const now = new Date().toISOString();

  const { data: ticket, error: lookupError } = await supabaseAdmin
    .from('member_login_tickets')
    .select('id, email, expires_at, consumed_at, attempts')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (lookupError || !ticket) return null;

  const recordFailedAttempt = async () => {
    await supabaseAdmin
      .from('member_login_tickets')
      .update({
        attempts: Number(ticket.attempts || 0) + 1,
        last_failed_at: now,
        updated_at: now,
      })
      .eq('id', ticket.id);
  };

  if (ticket.consumed_at || Date.parse(ticket.expires_at) <= Date.now()) {
    await recordFailedAttempt();
    return null;
  }

  const { data: claimedTicket, error: claimError } = await supabaseAdmin
    .from('member_login_tickets')
    .update({
      consumed_at: now,
      updated_at: now,
    })
    .eq('id', ticket.id)
    .is('consumed_at', null)
    .gt('expires_at', now)
    .select('email')
    .maybeSingle();

  if (claimError || !claimedTicket?.email) return null;

  return { email: normalizeEmail(claimedTicket.email) };
}

/**
 * Legacy verifier kept only for emergency rollback by explicit env flag.
 * New code must use createLoginToken/consumeLoginToken above.
 */
export function verifyLegacyLoginToken(token: string): { email: string } | null {
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
    return { email: normalizeEmail(payload.email) };
  } catch {
    return null;
  }
}

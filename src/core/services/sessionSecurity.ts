import type { Session } from '@supabase/supabase-js';

export const MAX_AUTH_SESSION_AGE_MS = 60 * 60 * 1000;

function getSessionAnchor(session: Session | null | undefined): string | null {
  if (!session) return null;

  const lastSignInAt = session.user?.last_sign_in_at || null;
  if (lastSignInAt) return lastSignInAt;

  const createdAt = (session as any)?.created_at || null;
  if (createdAt) return createdAt;

  return null;
}

export function getSessionAgeMs(session: Session | null | undefined): number | null {
  const anchor = getSessionAnchor(session);
  if (!anchor) return null;

  const parsed = Date.parse(anchor);
  if (Number.isNaN(parsed)) return null;

  return Math.max(0, Date.now() - parsed);
}

export function isSessionTooOld(session: Session | null | undefined): boolean {
  const ageMs = getSessionAgeMs(session);
  if (ageMs === null) return false;
  return ageMs > MAX_AUTH_SESSION_AGE_MS;
}

export function getSessionPolicyLabel(): string {
  return '1h max auth session age';
}

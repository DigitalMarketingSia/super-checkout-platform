import type { VercelRequest, VercelResponse } from '@vercel/node';
import { logAuthzEvent, requireApiAuth, type ApiAuthContext } from '../_authz.js';

const DEFAULT_CONTROL_PLANE_HOST = 'app.supercheckout.app';
const KNOWN_PROFILE_ROLES = ['owner', 'admin', 'master_admin', 'partner', 'member', 'client'] as const;

function normalizeEmail(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function getHostname(value?: string | string[] | null) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;

  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function configuredControlPlaneHosts() {
  return new Set(
    [
      DEFAULT_CONTROL_PLANE_HOST,
      'super-checkout.vercel.app',
      getHostname(process.env.APP_URL),
      getHostname(process.env.NEXT_PUBLIC_APP_URL),
      getHostname(process.env.VITE_APP_URL),
      getHostname(process.env.VITE_SUPER_CHECKOUT_APP_URL),
    ].filter(Boolean) as string[],
  );
}

export function isControlPlaneRequest(req: VercelRequest) {
  const hostname = getHostname(req.headers.host);
  if (!hostname) return false;

  if (process.env.NODE_ENV !== 'production' && (hostname === 'localhost' || hostname === '127.0.0.1')) {
    return true;
  }

  return configuredControlPlaneHosts().has(hostname);
}

export function isConfiguredPlatformOwnerEmail(email?: string | null) {
  const allowedEmails = new Set(
    String(process.env.MASTER_ADMIN_EMAILS || '')
      .split(',')
      .map((candidate) => normalizeEmail(candidate))
      .filter(Boolean),
  );

  return allowedEmails.size > 0 && allowedEmails.has(normalizeEmail(email));
}

/**
 * Authorizes the one official-platform owner without conflating that identity
 * with `profiles.role`, which belongs to each local installation.
 */
export async function requireConfiguredPlatformOwner(
  req: VercelRequest,
  res: VercelResponse,
  source: string,
): Promise<ApiAuthContext | null> {
  if (!isControlPlaneRequest(req)) {
    res.status(403).json({ error: 'This action is only available on the official control plane.' });
    return null;
  }

  // The email allowlist below is the authority check. Accepting all known
  // local roles here only lets the existing auth helper verify the JWT and an
  // active local profile; it never grants access by role alone.
  const auth = await requireApiAuth(req, res, {
    source,
    allowedRoles: [...KNOWN_PROFILE_ROLES],
  });
  if (!auth) return null;

  if (isConfiguredPlatformOwnerEmail(auth.user.email)) {
    return auth;
  }

  await logAuthzEvent({
    supabaseAdmin: auth.supabaseAdmin,
    req,
    source,
    eventType: 'platform_owner_authorization_rejected',
    severity: 'CRITICAL',
    userId: auth.user.id,
    metadata: { reason: 'email_not_in_server_allowlist' },
  });
  res.status(403).json({ error: 'Access denied' });
  return null;
}

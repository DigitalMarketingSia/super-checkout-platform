import type { VercelRequest, VercelResponse } from '@vercel/node';
import { logAuthzEvent, type ApiAuthContext } from '../_authz.js';
import {
  getLocalSupabaseServerKeyErrorMessage,
  resolveLocalSupabaseServerClient,
  validateLocalUserWithPublicKey,
} from '../_supabase-server.js';

const DEFAULT_CONTROL_PLANE_HOST = 'app.supercheckout.app';

function normalizeEmail(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function getBearerToken(req: VercelRequest) {
  const raw = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0] || ''
    : req.headers.authorization || '';
  return raw.startsWith('Bearer ') ? raw.slice('Bearer '.length).trim() : '';
}

function isInactiveStatus(status?: string | null) {
  return ['blocked', 'suspended', 'revoked', 'disabled', 'inactive'].includes(
    String(status || '').trim().toLowerCase(),
  );
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

  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  // The official owner is identified by a server-side email allowlist. A
  // valid local JWT is enough to establish that identity; requiring a local
  // `profiles` row before evaluating the allowlist creates an inconsistent
  // state where the UI recognizes the owner but protected writes reject it.
  const user = await validateLocalUserWithPublicKey(token);
  if (!user?.id) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const { supabase: supabaseAdmin } = await resolveLocalSupabaseServerClient();
  if (!supabaseAdmin) {
    res.status(500).json({ error: getLocalSupabaseServerKeyErrorMessage() });
    return null;
  }

  if (!isConfiguredPlatformOwnerEmail(user.email)) {
    await logAuthzEvent({
      supabaseAdmin,
      req,
      source,
      eventType: 'platform_owner_authorization_rejected',
      severity: 'CRITICAL',
      userId: user.id,
      metadata: { reason: 'email_not_in_server_allowlist' },
    });
    res.status(403).json({ error: 'Access denied' });
    return null;
  }

  // Keep a blocked local profile blocked when it is available. A missing
  // profile is logged, but cannot override the explicit platform-owner
  // identity: the session-authz endpoint already follows this same model.
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id,email,status,installation_id,central_user_id')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.id && isInactiveStatus(profile.status)) {
    await logAuthzEvent({
      supabaseAdmin,
      req,
      source,
      eventType: 'platform_owner_authorization_rejected',
      severity: 'CRITICAL',
      userId: user.id,
      metadata: { reason: 'inactive_profile' },
    });
    res.status(403).json({ error: 'Access denied' });
    return null;
  }

  if (profileError || !profile?.id) {
    await logAuthzEvent({
      supabaseAdmin,
      req,
      source,
      eventType: 'platform_owner_profile_fallback',
      severity: 'WARNING',
      userId: user.id,
      metadata: { reason: profileError ? 'profile_lookup_failed' : 'profile_missing' },
    });
  }

  return {
    token,
    user,
    profile: {
      id: user.id,
      email: profile?.email || user.email || null,
      role: 'master_admin',
      status: profile?.status || 'active',
      installation_id: profile?.installation_id || null,
      central_user_id: profile?.central_user_id || null,
    },
    role: 'master_admin',
    supabaseAdmin,
  };
}

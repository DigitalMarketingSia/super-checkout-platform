import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createSupabaseAdminClient, logAuthzEvent } from '../_authz.js';
import { enforceApiRateLimit } from '../_rate-limit.js';
import {
  getLocalSupabaseServerKeyErrorMessage,
  isLocalSupabaseServerKeyFailure,
  resolveLocalSupabaseServerClient,
} from '../_supabase-server.js';

function getBearerToken(req: VercelRequest): string {
  const authHeader = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0] || ''
    : req.headers.authorization || '';

  return authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
}

function normalizeRole(role?: string | null) {
  return String(role || '').trim().toLowerCase();
}

function normalizeEmail(email?: string | null) {
  return String(email || '').trim().toLowerCase();
}

function getMasterAdminEmails() {
  return new Set(
    String(process.env.MASTER_ADMIN_EMAILS || '')
      .split(',')
      .map((email) => normalizeEmail(email))
      .filter(Boolean),
  );
}

function getSupabasePublicConfig() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    publicKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      || process.env.VITE_SUPABASE_ANON_KEY
      || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
      || process.env.SUPABASE_ANON_KEY
      || process.env.SUPABASE_PUBLISHABLE_KEY
      || '',
  };
}

async function validateUserWithPublicKey(token: string) {
  const { supabaseUrl, publicKey } = getSupabasePublicConfig();
  if (!supabaseUrl || !publicKey) return { user: null, status: 500 };

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: publicKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) return { user: null, status: response.status };

  const user = await response.json();
  return { user: user?.id ? user : null, status: response.status };
}

function isInactiveStatus(status?: string | null) {
  return ['blocked', 'suspended', 'revoked', 'disabled', 'inactive'].includes(
    String(status || '').trim().toLowerCase(),
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const rateLimit = enforceApiRateLimit(req, res, {
    scope: 'admin_session_authz',
    identifiers: [token.slice(-48)],
    limit: 120,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const { user, status } = await validateUserWithPublicKey(token);
  if (!user?.id) {
    return res.status(status === 500 ? 500 : 401).json({ error: status === 500 ? 'Internal Server Error' : 'Unauthorized' });
  }

  const masterEmails = getMasterAdminEmails();
  const userEmail = normalizeEmail(user.email);
  const isConfiguredPlatformOwner = masterEmails.size > 0 && masterEmails.has(userEmail);

  const fallbackSupabaseAdmin = createSupabaseAdminClient();
  if (!fallbackSupabaseAdmin) {
    return res.status(200).json({
      success: true,
      // Keep the prior break-glass read behaviour when the server key is
      // unavailable, but never pretend that the database role was synced.
      role: isConfiguredPlatformOwner ? 'master_admin' : null,
      is_master_admin: isConfiguredPlatformOwner,
    });
  }

  const { supabase: supabaseAdmin, probeError } = await resolveLocalSupabaseServerClient();
  if (!supabaseAdmin) {
    return res.status(500).json({ error: getLocalSupabaseServerKeyErrorMessage() });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id,email,role,status')
    .eq('id', user.id)
    .maybeSingle();

  if (isLocalSupabaseServerKeyFailure(profileError || probeError)) {
    return res.status(500).json({ error: getLocalSupabaseServerKeyErrorMessage() });
  }

  if (profileError || !profile?.id || isInactiveStatus(profile.status)) {
    await logAuthzEvent({
      supabaseAdmin,
      req,
      source: 'admin_session_authz',
      eventType: 'session_authz_rejected',
      severity: 'WARNING',
      userId: user.id,
      metadata: { reason: profile?.id ? 'inactive_or_blocked' : 'profile_missing' },
    });
    return res.status(403).json({ error: 'Access denied' });
  }

  // The allowlist is server-only and identifies the unique owner of the
  // official control plane. Persist that authority in the local profile so
  // database triggers/RLS see the same role as the UI. A plain `owner` of a
  // customer installation is never promoted by this endpoint.
  if (isConfiguredPlatformOwner) {
    const currentRole = normalizeRole(profile.role);
    if (currentRole !== 'master_admin') {
      const { error: promoteError } = await supabaseAdmin
        .from('profiles')
        .update({ role: 'master_admin' })
        .eq('id', user.id);

      if (promoteError) {
        console.error('[session-authz] Failed to synchronize configured platform owner:', promoteError.message);
        await logAuthzEvent({
          supabaseAdmin,
          req,
          source: 'admin_session_authz',
          eventType: 'platform_owner_role_sync_failed',
          severity: 'CRITICAL',
          userId: user.id,
          metadata: { previous_role: currentRole || null },
        });
        return res.status(500).json({ error: 'Unable to synchronize platform owner authorization.' });
      }

      await logAuthzEvent({
        supabaseAdmin,
        req,
        source: 'admin_session_authz',
        eventType: 'platform_owner_role_synchronized',
        severity: 'INFO',
        userId: user.id,
        metadata: { previous_role: currentRole || null },
      });
    }

    return res.status(200).json({
      success: true,
      role: 'master_admin',
      is_master_admin: true,
    });
  }

  const profileRole = normalizeRole(profile.role);
  const isMasterAdmin = profileRole === 'master_admin';
  const effectiveRole = isMasterAdmin ? 'master_admin' : profileRole;

  return res.status(200).json({
    success: true,
    role: effectiveRole,
    is_master_admin: isMasterAdmin,
  });
}

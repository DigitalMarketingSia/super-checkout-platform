import { createHash, randomBytes } from 'node:crypto';
import type { VercelRequest } from '@vercel/node';
import { createLocalSupabaseServerClient } from './_supabase-server.js';

export type SensitiveActionPurpose = 'installation_reset' | 'installation_revoke';

const APPROVAL_TTL_MS = 5 * 60 * 1000;

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function requestIp(req: VercelRequest) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.headers['x-real-ip'] || '').trim() || null;
}

export function getSensitiveActionActorFingerprint(userId: string) {
  return hash(String(userId || '').trim());
}

export async function issueSensitiveActionApproval(params: {
  req: VercelRequest;
  actorUserId: string;
  purpose: SensitiveActionPurpose;
}) {
  const supabase = createLocalSupabaseServerClient();
  if (!supabase) {
    throw new Error('A configuracao segura da instalacao nao esta disponivel.');
  }

  const approval = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + APPROVAL_TTL_MS);
  const actorFingerprint = getSensitiveActionActorFingerprint(params.actorUserId);

  const { error: grantError } = await supabase
    .from('sensitive_action_grants')
    .insert({
      token_hash: hash(approval),
      actor_fingerprint: actorFingerprint,
      purpose: params.purpose,
      issued_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      metadata: {
        source: 'central_portal_totp_step_up',
        ip_present: Boolean(requestIp(params.req)),
      },
    });

  if (grantError) {
    throw new Error('Nao foi possivel registrar a aprovacao de seguranca.');
  }

  const { error: auditError } = await supabase
    .from('security_events')
    .insert({
      event_type: 'sensitive_action_approval_issued',
      severity: 'WARNING',
      ip_address: requestIp(params.req),
      metadata: {
        purpose: params.purpose,
        actor_fingerprint: actorFingerprint,
        source: 'central_portal_totp_step_up',
        expires_at: expiresAt.toISOString(),
      },
    });

  if (auditError) {
    await supabase
      .from('sensitive_action_grants')
      .delete()
      .eq('token_hash', hash(approval));
    throw new Error('Nao foi possivel registrar a auditoria de seguranca.');
  }

  return {
    approval,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function consumeSensitiveActionApproval(params: {
  req: VercelRequest;
  approval: string;
  actorUserId: string;
  purpose: SensitiveActionPurpose;
  endpoint: string;
}) {
  const supabase = createLocalSupabaseServerClient();
  if (!supabase) return 'error' as const;

  const { data, error } = await supabase.rpc('consume_sensitive_action_grant', {
    p_token_hash: hash(params.approval),
    p_actor_fingerprint: getSensitiveActionActorFingerprint(params.actorUserId),
    p_purpose: params.purpose,
    p_endpoint: params.endpoint,
    p_ip_address: requestIp(params.req),
  });

  if (error) {
    console.error('[Sensitive approval] Failed to consume approval:', error.message || error);
    return 'error' as const;
  }

  return ['consumed', 'expired', 'replayed', 'rejected'].includes(String(data || ''))
    ? String(data) as 'consumed' | 'expired' | 'replayed' | 'rejected'
    : 'error' as const;
}

export async function recordSensitiveActionAudit(params: {
  req: VercelRequest;
  eventType: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  actorUserId: string;
  purpose: SensitiveActionPurpose;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createLocalSupabaseServerClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from('security_events')
    .insert({
      event_type: params.eventType,
      severity: params.severity,
      ip_address: requestIp(params.req),
      metadata: {
        purpose: params.purpose,
        actor_fingerprint: getSensitiveActionActorFingerprint(params.actorUserId),
        source: 'central_proxy',
        ...(params.metadata || {}),
      },
    });

  return !error;
}

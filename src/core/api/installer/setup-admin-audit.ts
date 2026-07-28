import { createHash } from 'node:crypto';

export const SETUP_ADMIN_REJECTION_EVENT = 'installer_setup_admin_rejected';

export type SetupAdminRejectionReason =
  | 'invalid_request'
  | 'password_policy_rejected'
  | 'bootstrap_invalid'
  | 'bootstrap_missing_installation'
  | 'installation_mismatch'
  | 'rate_limited'
  | 'setup_already_completed'
  | 'unexpected_failure';

type AuditRequest = {
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string | null };
};

type RejectedSetupAdminAuditInput = {
  request: AuditRequest;
  reason: SetupAdminRejectionReason;
  responseStatus: number;
  email?: string | null;
  installationId?: string | null;
  requestedInstallationId?: string | null;
};

function getHeader(request: AuditRequest, name: string): string | null {
  const value = request.headers?.[name];
  const resolved = Array.isArray(value) ? value[0] : value;
  const normalized = String(resolved || '').trim();
  return normalized || null;
}

function getRequestIp(request: AuditRequest): string {
  const forwarded = getHeader(request, 'x-forwarded-for');
  return forwarded?.split(',')[0]?.trim()
    || String(request.socket?.remoteAddress || '').trim()
    || 'unknown';
}

function fingerprint(value: string | null | undefined): string | null {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized
    ? createHash('sha256').update(normalized).digest('hex')
    : null;
}

function truncate(value: string | null, maximumLength: number): string | null {
  return value ? value.slice(0, maximumLength) : null;
}

/**
 * Builds an audit row for a rejected bootstrap attempt.
 *
 * The bootstrap token and password are intentionally absent from the input and
 * output contracts. The optional identifiers are stored only as SHA-256
 * fingerprints so the event remains useful for correlation without retaining
 * the raw setup payload.
 */
export function buildRejectedSetupAdminEvent(input: RejectedSetupAdminAuditInput) {
  return {
    event_type: SETUP_ADMIN_REJECTION_EVENT,
    severity: 'WARNING' as const,
    ip_address: getRequestIp(input.request),
    metadata: {
      source: 'installer/setup-admin',
      reason: input.reason,
      response_status: input.responseStatus,
      email_fingerprint: fingerprint(input.email),
      installation_id_fingerprint: fingerprint(input.installationId),
      requested_installation_id_fingerprint: fingerprint(input.requestedInstallationId),
      user_agent: truncate(getHeader(input.request, 'user-agent'), 512),
    },
  };
}

export async function recordRejectedSetupAdminAttempt(supabase: any, input: RejectedSetupAdminAuditInput) {
  try {
    const { error } = await supabase
      .from('security_events')
      .insert(buildRejectedSetupAdminEvent(input));

    if (error) {
      console.warn('[installer/setup-admin] Rejected bootstrap audit insert failed:', error.message);
    }
  } catch (error: any) {
    console.warn('[installer/setup-admin] Rejected bootstrap audit unavailable:', error?.message || error);
  }
}

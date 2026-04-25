import { supabase } from './supabase';
import { getApiUrl } from '../utils/apiUtils';

type SecuritySeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'FATAL';

export async function logSecurityEvent(
  eventType: string,
  metadata: Record<string, unknown> = {},
  severity: SecuritySeverity = 'INFO'
) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    await fetch(getApiUrl('/api/auth/security-event'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        event_type: eventType,
        severity,
        metadata,
      }),
    });
  } catch (error) {
    console.warn('[SecurityAuditClient] Failed to log event:', error);
  }
}

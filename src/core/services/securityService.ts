import { createClient } from '@supabase/supabase-js';

/**
 * SERVICE: SECURITY (BACKEND-ONLY)
 *
 * Handles audit logging and rate limiting without hard-failing the payments
 * runtime when the admin Supabase client is temporarily unavailable.
 */

let supabaseAdmin: ReturnType<typeof createClient> | null | undefined;

function getSupabaseAdmin() {
  if (supabaseAdmin !== undefined) {
    return supabaseAdmin;
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    '';
  const supabaseServiceKey =
    process.env.SUPABASE_SECRET_KEY_NEW ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY_NEW ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    '';

  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('[SecurityService] Supabase admin client unavailable: missing URL or service key.');
    supabaseAdmin = null;
    return supabaseAdmin;
  }

  try {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  } catch (error) {
    console.warn('[SecurityService] Failed to initialize Supabase admin client:', error);
    supabaseAdmin = null;
  }

  return supabaseAdmin;
}

export class SecurityService {
  /**
   * Records a security violation when the admin client is available.
   */
  async logViolation(
    ip: string,
    type:
      | 'price_manipulation'
      | 'invalid_checkout'
      | 'rate_limit_exceeded'
      | 'invalid_bump'
      | 'auth_brute_force'
      | 'suspicious_activity',
    metadata: any = {},
  ) {
    console.error(`[SecurityViolation] IP: ${ip} | Type: ${type}`, metadata);

    const admin = getSupabaseAdmin();
    let severity = 'WARNING';
    if (['price_manipulation', 'invalid_checkout', 'invalid_bump'].includes(type)) {
      severity = 'CRITICAL';
    }

    try {
      const insertData: any = {
        event_type: type,
        severity,
        ip_address: ip,
        metadata: { ...metadata, origin: 'edge_security_service' },
      };

      if (metadata.user_id && metadata.user_id !== '00000000-0000-0000-0000-000000000000') {
        insertData.user_id = metadata.user_id;
      } else if (metadata.owner_id) {
        insertData.user_id = metadata.owner_id;
      }

      if (!admin) {
        console.warn('[SecurityService] Skipping violation persistence because Supabase admin client is unavailable.');
        return;
      }

      const { error } = await admin.from('security_events').insert(insertData);

      if (error) {
        console.warn('[SecurityService] Audit log DB insertion failed:', error.message);
      }
    } catch (err) {
      console.error('[SecurityService] Unexpected log error:', err);
    }
  }

  /**
   * Checks whether an IP exceeded the invalid-attempt threshold.
   * If the audit database is unavailable, the payments flow stays open and the
   * incident is logged to stderr instead of crashing the lambda cold start.
   */
  async isRateLimited(ip: string, limit: number = 5): Promise<boolean> {
    const admin = getSupabaseAdmin();

    if (!admin) {
      return false;
    }

    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

      const { count, error } = await admin
        .from('security_events')
        .select('*', { count: 'exact', head: true })
        .eq('ip_address', ip)
        .in('event_type', ['rate_limit_exceeded', 'auth_brute_force', 'invalid_checkout'])
        .gt('created_at', tenMinutesAgo);

      if (error) {
        console.error('[SecurityService] Rate limit DB check error. Allowing request in degraded mode:', error.message);
        return false;
      }

      return (count || 0) >= limit;
    } catch (err) {
      console.error('[SecurityService] Rate limit unexpected error. Allowing request in degraded mode:', err);
      return false;
    }
  }
}

export const securityService = new SecurityService();

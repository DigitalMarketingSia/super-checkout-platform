import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export type ApiRole = 'owner' | 'admin' | 'master_admin' | 'member' | 'client';
export type AuthzSeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'FATAL';

export interface ApiProfile {
  id: string;
  email: string | null;
  role: ApiRole | string | null;
  status?: string | null;
  installation_id?: string | null;
  central_user_id?: string | null;
}

export interface ApiAuthContext {
  token: string;
  user: User;
  profile: ApiProfile;
  role: ApiRole | string;
  supabaseAdmin: SupabaseClient;
}

export interface ApiAuthOptions {
  source: string;
  allowedRoles?: ApiRole[];
  allowInactiveProfile?: boolean;
}

const DEFAULT_ADMIN_ROLES: ApiRole[] = ['owner', 'admin', 'master_admin'];

function getHeaderValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function getBearerToken(req: VercelRequest): string {
  const authHeader = getHeaderValue(req.headers.authorization);
  return authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
}

function getIp(req: VercelRequest): string {
  return getHeaderValue(req.headers['x-forwarded-for']).split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';
}

function getUserAgent(req: VercelRequest): string | null {
  return getHeaderValue(req.headers['user-agent']) || null;
}

function normalizeRole(role?: string | null): string {
  return String(role || '').trim().toLowerCase();
}

function isInactiveProfile(profile: ApiProfile): boolean {
  const status = String(profile.status || '').trim().toLowerCase();
  return ['blocked', 'suspended', 'revoked', 'disabled', 'inactive'].includes(status);
}

function sanitizeMetadata(metadata: Record<string, unknown> = {}) {
  const blocked = new Set([
    'password',
    'secret',
    'private_key',
    'webhook_secret',
    'token',
    'access_token',
    'refresh_token',
    'captcha_token',
  ]);

  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => !blocked.has(key.toLowerCase())),
  );
}

export function getSupabaseServerConfig() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  };
}

export function createSupabaseAdminClient(): SupabaseClient | null {
  const { supabaseUrl, serviceRoleKey } = getSupabaseServerConfig();
  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function logAuthzEvent(params: {
  supabaseAdmin?: SupabaseClient | null;
  req: VercelRequest;
  source: string;
  eventType: string;
  severity: AuthzSeverity;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    if (!params.supabaseAdmin) return;

    const insertData: Record<string, unknown> = {
      event_type: params.eventType,
      severity: params.severity,
      ip_address: getIp(params.req),
      metadata: {
        ...sanitizeMetadata(params.metadata || {}),
        user_agent: getUserAgent(params.req),
        source: params.source,
      },
    };

    if (params.userId) insertData.user_id = params.userId;

    const { error } = await params.supabaseAdmin.from('security_events').insert(insertData);
    if (error) {
      console.warn(`[${params.source}] Security event insert failed:`, error.message);
    }
  } catch (error: any) {
    console.warn(`[${params.source}] Security event unexpected failure:`, error?.message || error);
  }
}

export async function requireApiAuth(
  req: VercelRequest,
  res: VercelResponse,
  options: ApiAuthOptions,
): Promise<ApiAuthContext | null> {
  const supabaseAdmin = createSupabaseAdminClient();
  const allowedRoles = options.allowedRoles || DEFAULT_ADMIN_ROLES;

  if (!supabaseAdmin) {
    console.error(`[${options.source}] Missing SUPABASE url/service role configuration.`);
    res.status(500).json({ error: 'Internal Server Error' });
    return null;
  }

  const token = getBearerToken(req);
  if (!token) {
    await logAuthzEvent({
      supabaseAdmin,
      req,
      source: options.source,
      eventType: 'api_authz_rejected',
      severity: 'WARNING',
      metadata: { reason: 'missing_bearer' },
    });
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  const user = userData?.user;

  if (userError || !user?.id) {
    await logAuthzEvent({
      supabaseAdmin,
      req,
      source: options.source,
      eventType: 'api_authz_rejected',
      severity: 'WARNING',
      metadata: { reason: 'invalid_token' },
    });
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id,email,role,status,installation_id')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile?.id) {
    await logAuthzEvent({
      supabaseAdmin,
      req,
      source: options.source,
      eventType: 'api_authz_rejected',
      severity: 'WARNING',
      userId: user.id,
      metadata: { reason: 'profile_missing' },
    });
    res.status(403).json({ error: 'Access denied' });
    return null;
  }

  const role = normalizeRole(profile.role);
  if (!allowedRoles.includes(role as ApiRole)) {
    await logAuthzEvent({
      supabaseAdmin,
      req,
      source: options.source,
      eventType: 'api_authz_rejected',
      severity: 'WARNING',
      userId: user.id,
      metadata: { reason: 'insufficient_role', role },
    });
    res.status(403).json({ error: 'Access denied' });
    return null;
  }

  if (!options.allowInactiveProfile && isInactiveProfile(profile as ApiProfile)) {
    await logAuthzEvent({
      supabaseAdmin,
      req,
      source: options.source,
      eventType: 'api_authz_rejected',
      severity: 'CRITICAL',
      userId: user.id,
      metadata: { reason: 'inactive_profile', role, status: profile.status || null },
    });
    res.status(403).json({ error: 'Access denied' });
    return null;
  }

  return {
    token,
    user,
    profile: profile as ApiProfile,
    role,
    supabaseAdmin,
  };
}

export async function verifyResourceOwnership(params: {
  supabaseAdmin: SupabaseClient;
  table: string;
  idColumn?: string;
  id: string;
  ownerColumn?: string;
  ownerId: string;
}) {
  const idColumn = params.idColumn || 'id';
  const ownerColumn = params.ownerColumn || 'user_id';

  const { data, error } = await params.supabaseAdmin
    .from(params.table)
    .select('*')
    .eq(idColumn, params.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { exists: false, ownerMatches: false, data: null };

  const ownerMatches = String((data as Record<string, unknown>)[ownerColumn] || '') === params.ownerId;
  return { exists: true, ownerMatches, data };
}

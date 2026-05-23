import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enforceApiRateLimit } from '../_rate-limit.js';
import {
  CURRENT_SCHEMA_VERSION,
  UNKNOWN_SCHEMA_VERSION,
  compareVersions,
  getPendingApprovedMigrationVersions,
} from './_migration-registry.js';

function parseBody(req: VercelRequest) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

async function validateLocalUser(supabaseUrl: string, anonKey: string, jwt: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${jwt}`
    }
  });

  if (!response.ok) return null;
  const user = await response.json();
  return user?.id ? user : null;
}

async function resolveSchemaState(supabase: any, reportedDbVersion?: string | null) {
  const { data, error } = await supabase
    .from('schema_migrations')
    .select('version,success');

  if (error) {
    console.warn('[system-info] schema_migrations read failed:', error.message || error);
    const fallbackVersion = reportedDbVersion
      && compareVersions(reportedDbVersion, CURRENT_SCHEMA_VERSION) <= 0
      ? reportedDbVersion
      : UNKNOWN_SCHEMA_VERSION;

    return {
      effectiveDbVersion: fallbackVersion,
      latestCompletedMigration: null,
      pendingMigrations: fallbackVersion === UNKNOWN_SCHEMA_VERSION
        ? []
        : getPendingApprovedMigrationVersions(fallbackVersion),
      databaseStatus: 'unverified' as const,
    };
  }

  const completedVersions = Array.from(new Set(
    ((data || []) as Array<{ version?: string | null; success?: boolean | null }>)
      .filter((row) => row?.success)
      .map((row) => String(row.version || '').trim())
      .filter(Boolean)
  )).sort(compareVersions);

  if (completedVersions.length === 0) {
    const fallbackVersion = reportedDbVersion
      && compareVersions(reportedDbVersion, CURRENT_SCHEMA_VERSION) <= 0
      ? reportedDbVersion
      : UNKNOWN_SCHEMA_VERSION;

    return {
      effectiveDbVersion: fallbackVersion,
      latestCompletedMigration: null,
      pendingMigrations: fallbackVersion === UNKNOWN_SCHEMA_VERSION
        ? []
        : getPendingApprovedMigrationVersions(fallbackVersion),
      databaseStatus: 'unverified' as const,
    };
  }

  const latestCompletedMigration = completedVersions[completedVersions.length - 1];
  const pendingMigrations = getPendingApprovedMigrationVersions(latestCompletedMigration);

  return {
    effectiveDbVersion: latestCompletedMigration,
    latestCompletedMigration,
    pendingMigrations,
    databaseStatus: pendingMigrations.length > 0 ? 'pending' as const : 'current' as const,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const parsedBody = parseBody(req);
  const rateLimit = enforceApiRateLimit(req, res, {
    scope: 'admin_system_info',
    identifiers: [String(parsedBody.github_repository || req.method || '')],
    limit: 30,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : '';
  if (!jwt) return res.status(401).json({ error: 'Missing authorization' });

  const user = await validateLocalUser(supabaseUrl, anonKey, jwt);
  if (!user?.id) return res.status(401).json({ error: 'Invalid session' });

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !['admin', 'owner', 'master_admin'].includes(profile?.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const { data: info, error: infoError } = await supabase
      .from('system_info')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (infoError) throw infoError;

    const schemaState = await resolveSchemaState(supabase, info?.db_version || null);
    const responsePayload = {
      id: info?.id || 'virtual-system-info',
      core_version: info?.core_version || null,
      db_version: schemaState.effectiveDbVersion,
      reported_db_version: info?.db_version || null,
      latest_completed_migration: schemaState.latestCompletedMigration,
      pending_migrations: schemaState.pendingMigrations,
      pending_migration_count: schemaState.pendingMigrations.length,
      database_status: schemaState.databaseStatus,
      system_info_present: Boolean(info),
      ui_version: info?.ui_version || null,
      installed_at: info?.installed_at || null,
      last_update_at: info?.last_update_at || null,
      license_key: info?.license_key || null,
      github_installation_id: info?.github_installation_id || null,
      github_repository: info?.github_repository || null,
      metadata: info?.metadata || null,
    };

    if (req.method === 'GET') {
      return res.status(200).json({ success: true, data: responsePayload });
    }

    const body = parsedBody;
    const githubInstallationId = String(body.github_installation_id || '').trim();
    const githubRepository = String(body.github_repository || '').trim();

    if (!/^\d+$/.test(githubInstallationId)) {
      return res.status(400).json({ error: 'GitHub Installation ID invalido.' });
    }

    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(githubRepository)) {
      return res.status(400).json({ error: 'Repository Name deve usar owner/repo.' });
    }

    const payload = {
      db_version: responsePayload.db_version,
      github_installation_id: githubInstallationId,
      github_repository: githubRepository,
      last_update_at: new Date().toISOString()
    };

    const result = info?.id
      ? await supabase.from('system_info').update(payload).eq('id', info.id).select('*').single()
      : await supabase.from('system_info').insert(payload).select('*').single();

    if (result.error) throw result.error;
    return res.status(200).json({ success: true, data: result.data });
  } catch (error: any) {
    console.error('[system-info] update failed:', error?.message || error);
    return res.status(500).json({ error: 'Falha ao atualizar integracao.' });
  }
}

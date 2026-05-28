import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { enforceApiRateLimit } from '../_rate-limit.js';
import {
  getLocalSupabasePublicConfig,
  getLocalSupabaseServerKeyErrorMessage,
  isLocalSupabaseServerKeyFailure,
  resolveLocalSupabaseServerClient,
  validateLocalUserWithPublicKey,
} from '../_supabase-server.js';
import { APPROVED_MIGRATION_ALLOWLIST } from './_migration-registry.js';

const ALLOWED_MIGRATION_ROLES = new Set(['admin', 'owner', 'master_admin']);

function cleanMigrationDetail(value: unknown) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 280) : '';
}

function getMigrationFailureDetail(data: unknown, error: { message?: string; details?: string; hint?: string } | null) {
  const rpcResult = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  return cleanMigrationDetail(
    rpcResult.error
      || rpcResult.message
      || error?.message
      || error?.details
      || error?.hint
  );
}

function requiresAdminSqlSession(detail: string) {
  return detail.toLowerCase().includes('only admins can execute system sql');
}

function approvedExecutorUnavailable(error: { code?: string } | null, detail: string) {
  const normalized = `${error?.code || ''} ${detail}`.toLowerCase();
  return error?.code === 'PGRST202'
    || (
      normalized.includes('apply_approved_migration')
      && (
        normalized.includes('schema cache')
        || normalized.includes('could not find')
        || normalized.includes('not found')
      )
    );
}

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

function loadApprovedMigrationSql(version: string) {
  const migration = APPROVED_MIGRATION_ALLOWLIST[version];
  if (!migration) return null;

  const workspaceRoot = resolve(process.cwd());
  const candidatePaths = [
    resolve(join(workspaceRoot, 'src', 'migrations', migration.file)),
    resolve(join(workspaceRoot, 'dist', 'src', 'migrations', migration.file))
  ].filter((path) => path.startsWith(workspaceRoot));
  const migrationPath = candidatePaths.find((path) => existsSync(path));
  if (!migrationPath) {
    throw new Error(`Approved migration file not found for version ${version}`);
  }

  const sql = readFileSync(migrationPath, 'utf8');
  const actualHash = createHash('sha256').update(sql, 'utf8').digest('hex');
  if (actualHash !== migration.sha256) {
    throw new Error(`Approved migration hash mismatch for version ${version}`);
  }

  return { sql, sha256: actualHash, file: migration.file };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const body = parseBody(req);
  const version = String((req.method === 'GET' ? req.query.version : body.version) || '').trim();
  const rateLimit = enforceApiRateLimit(req, res, {
    scope: 'admin_run_migration',
    identifiers: [version],
    limit: 10,
    windowMs: 30 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const { supabaseUrl, publicKey } = getLocalSupabasePublicConfig();
  if (!supabaseUrl || !publicKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : '';
  if (!jwt) return res.status(401).json({ error: 'Missing authorization' });

  const user = await validateLocalUserWithPublicKey(jwt);
  if (!user?.id) return res.status(401).json({ error: 'Invalid session' });

  const { supabase, probeError } = await resolveLocalSupabaseServerClient();
  if (!supabase) {
    return res.status(500).json({ error: getLocalSupabaseServerKeyErrorMessage() });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (isLocalSupabaseServerKeyFailure(profileError || probeError)) {
    return res.status(500).json({ error: getLocalSupabaseServerKeyErrorMessage() });
  }

  if (profileError || !ALLOWED_MIGRATION_ROLES.has(String(profile?.role || ''))) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  if (!version) {
    return res.status(400).json({ error: 'Missing migration version.' });
  }

  if (body.sql) {
    console.warn('[run-migration] Rejected raw SQL payload for approved migration endpoint.');
    return res.status(400).json({ error: 'Raw SQL payloads are not accepted.' });
  }

  let approvedMigration: ReturnType<typeof loadApprovedMigrationSql>;
  try {
    approvedMigration = loadApprovedMigrationSql(version);
  } catch (loadError: any) {
    const detail = cleanMigrationDetail(loadError?.message) || 'Approved migration file could not be loaded.';
    console.error('[run-migration] Approved migration asset failed:', {
      version,
      detail
    });
    return res.status(500).json({
      success: false,
      error: 'Migration asset unavailable',
      detail
    });
  }

  if (!approvedMigration) {
    return res.status(400).json({ error: 'Migration version is not approved.' });
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      migration: {
        version,
        file: approvedMigration.file,
        sha256: approvedMigration.sha256,
        sql: approvedMigration.sql
      }
    });
  }

  let executionMode: 'approved_service' | 'legacy_service' | 'legacy_admin_session' = 'approved_service';
  let { data, error } = await supabase.rpc('apply_approved_migration', { sql_query: approvedMigration.sql });
  let detail = getMigrationFailureDetail(data, error);

  if ((error || !(data as any)?.success) && approvedExecutorUnavailable(error, detail)) {
    executionMode = 'legacy_service';
    const legacyExecution = await supabase.rpc('exec_sql', { sql_query: approvedMigration.sql });
    data = legacyExecution.data;
    error = legacyExecution.error;
    detail = getMigrationFailureDetail(data, error);

    if ((error || !(data as any)?.success) && requiresAdminSqlSession(detail)) {
      const adminSessionSupabase = createClient(supabaseUrl, publicKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: {
          headers: {
            Authorization: `Bearer ${jwt}`
          }
        }
      });

      executionMode = 'legacy_admin_session';
      const retry = await adminSessionSupabase.rpc('exec_sql', { sql_query: approvedMigration.sql });
      data = retry.data;
      error = retry.error;
      detail = getMigrationFailureDetail(data, error);
    }
  }

  if (error || !(data as any)?.success) {
    console.error('[run-migration] Approved migration failed:', {
      version,
      file: approvedMigration.file,
      sha256: approvedMigration.sha256,
      code: error?.code || null,
      executionMode,
      detail: detail || null,
    });
    return res.status(500).json({
      success: false,
      error: 'Migration failed',
      code: error?.code || null,
      detail: detail || 'The approved database update could not be applied.'
    });
  }

  return res.status(200).json({
    success: true,
    migration: {
      version,
      file: approvedMigration.file,
      sha256: approvedMigration.sha256,
      executionMode
    }
  });
}

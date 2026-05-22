import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { enforceApiRateLimit } from '../_rate-limit.js';

const MIGRATION_ALLOWLIST: Record<string, { file: string; sha256: string }> = {
  '1.0.1': {
    file: 'v1.0.1.sql',
    sha256: 'a0e7c52cac13245c6d8f68387dfffa67e180efb523696dc8989f140cf2e77896'
  },
  '1.0.2': {
    file: 'v1.0.2.sql',
    sha256: 'd21ce0cf568115c9bd4dbfc53d97c4f9a47495b22d8da11b0699b415725e146b'
  },
  '1.0.3': {
    file: 'v1.0.3.sql',
    sha256: '3a63df2ffab5f47cc1707d68a69137f3852bd27a1ee54dfbbc1aadea69290596'
  },
  '1.0.4': {
    file: 'v1.0.4.sql',
    sha256: 'f5b8cac26c7e73d43bfb6f6ce3dfb7e8ec6ebfebfad8244d6d934772d9a1e33f'
  },
  '1.0.5': {
    file: 'v1.0.5.sql',
    sha256: 'de6ce4676f6a50dc8bccf92bc9009e84021191191b5697b2c3c2cf46b35d497a'
  },
  '1.0.6': {
    file: 'v1.0.6.sql',
    sha256: '1cc3521f8d7a06fda782378b7aaf17648ffa8ac474149cb7ce34fafd73e58959'
  },
  '1.0.7': {
    file: 'v1.0.7.sql',
    sha256: 'b5fc42a1128c2d6338e650e8da4ce89b610f35d7443fcddf7a510c17e31ff9a6'
  },
  '1.0.8': {
    file: 'v1.0.8.sql',
    sha256: '10878ea5dd26e9f170dabc2dc07129fa36a990a23623d7b4e3a02b2207289eb8'
  },
  '1.0.9': {
    file: 'v1.0.9.sql',
    sha256: '3b740e3971fd0577febbb9ec7ab4e2bca8b6747d7ddb916cea9b9b9957e4f42a'
  },
  '1.0.10': {
    file: 'v1.0.10.sql',
    sha256: '0a8c9a78ffef6b83ab663885326e9011d8d515e4ed1c54be56e687e6dafbf385'
  },
  '1.0.11': {
    file: 'v1.0.11.sql',
    sha256: '7a44a7da98af1c4c623585e9e578a250dd396055108fc12f574585256dd31241'
  }
};

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

function loadApprovedMigrationSql(version: string) {
  const migration = MIGRATION_ALLOWLIST[version];
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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = parseBody(req);
  const version = String(body.version || '').trim();
  const rateLimit = enforceApiRateLimit(req, res, {
    scope: 'admin_run_migration',
    identifiers: [version],
    limit: 10,
    windowMs: 30 * 60 * 1000,
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
      const adminSessionSupabase = createClient(supabaseUrl, anonKey, {
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

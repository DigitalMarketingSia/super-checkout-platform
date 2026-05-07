import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
    sha256: 'adbe623612c0cb8287184e829e788c6fa95b772156eaa09fc60a9a3e65439d4e'
  }
};

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

  const candidatePaths = [
    join(process.cwd(), 'src', 'migrations', migration.file),
    join(process.cwd(), 'dist', 'src', 'migrations', migration.file)
  ];
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

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

  const body = parseBody(req);
  const version = String(body.version || '').trim();

  if (!version) {
    return res.status(400).json({ error: 'Missing migration version.' });
  }

  if (body.sql) {
    console.warn('[run-migration] Rejected raw SQL payload for approved migration endpoint.');
    return res.status(400).json({ error: 'Raw SQL payloads are not accepted.' });
  }

  const approvedMigration = loadApprovedMigrationSql(version);
  if (!approvedMigration) {
    return res.status(400).json({ error: 'Migration version is not approved.' });
  }

  const { data, error } = await supabase.rpc('exec_sql', { sql_query: approvedMigration.sql });

  if (error || !(data as any)?.success) {
    const errorMsg = error?.message || (data as any)?.error || 'Migration failed';
    return res.status(500).json({ success: false, error: errorMsg });
  }

  return res.status(200).json({
    success: true,
    data,
    migration: {
      version,
      file: approvedMigration.file,
      sha256: approvedMigration.sha256
    }
  });
}

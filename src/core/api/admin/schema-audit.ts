import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  CURRENT_SCHEMA_VERSION,
  compareVersions,
  getPendingApprovedMigrationVersions,
} from './_migration-registry.js';

const SCHEMA_CHECKS = [
  { table: 'system_info', columns: ['db_version', 'github_installation_id', 'github_repository'] },
  { table: 'schema_migrations', columns: ['version', 'success'] },
  { table: 'accounts', columns: ['owner_user_id', 'plan_type', 'status'] },
  { table: 'business_settings', columns: ['account_id', 'support_email', 'is_ready_to_sell'] },
  { table: 'licenses', columns: ['key', 'account_id', 'max_instances', 'status'] },
  { table: 'installations', columns: ['license_key', 'account_id', 'installation_id', 'status'] },
  { table: 'profiles', columns: ['role', 'status', 'last_login_at', 'is_blocked'] },
  { table: 'member_areas', columns: ['banner_description', 'sidebar_config', 'custom_links', 'faqs'] },
  { table: 'gateways', columns: ['provider', 'credentials', 'config', 'is_active'] },
  { table: 'public_gateways', columns: ['id', 'provider', 'public_key', 'config'] },
  { table: 'email_templates', columns: ['event_type', 'language', 'html_body'] },
  { table: 'system_email_templates', columns: ['event_type', 'language', 'html_body'] },
  { table: 'system_updates_log', columns: ['action', 'status', 'files_affected'] }
];

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

function detectMissingColumn(message: string, columns: string[]) {
  const normalized = message.toLowerCase();
  return columns.find(column => normalized.includes(`'${column.toLowerCase()}'`) || normalized.includes(` ${column.toLowerCase()} `));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

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

  const drifts: any[] = [];

  for (const check of SCHEMA_CHECKS) {
    const { error } = await supabase
      .from(check.table)
      .select(check.columns.join(','))
      .limit(1);

    if (error) {
      const message = error.message || 'Schema check failed';
      const missingColumn = detectMissingColumn(message, check.columns);
      console.warn('[schema-audit] Drift detected:', {
        table: check.table,
        type: missingColumn ? 'column_missing' : 'schema_check_failed',
        column: missingColumn || null,
        code: error.code || null,
      });

      drifts.push({
        type: missingColumn ? 'column_missing' : 'schema_check_failed',
        name: check.table,
        column: missingColumn,
        expected_columns: check.columns,
        message: missingColumn ? 'Expected column is missing' : 'Schema check failed'
      });
    }
  }

  const migrationState = await supabase
    .from('schema_migrations')
    .select('version,success');

  if (migrationState.error) {
    drifts.push({
      type: 'migration_state_unverified',
      name: 'schema_migrations',
      message: 'Nao foi possivel comprovar o historico de migrations aprovadas.'
    });
  } else {
    const successfulVersions = Array.from(new Set(
      (migrationState.data || [])
        .filter((row) => row?.success)
        .map((row) => String(row.version || '').trim())
        .filter(Boolean)
    )).sort(compareVersions);

    const latestCompletedMigration = successfulVersions[successfulVersions.length - 1] || null;
    if (!latestCompletedMigration) {
      drifts.push({
        type: 'migration_state_unverified',
        name: 'schema_migrations',
        message: 'Nenhuma migration aprovada confirmada no historico local.'
      });
    } else {
      const pendingMigrations = getPendingApprovedMigrationVersions(latestCompletedMigration)
        .filter((version) => compareVersions(version, CURRENT_SCHEMA_VERSION) <= 0);

      if (pendingMigrations.length > 0) {
        drifts.push({
          type: 'migration_pending',
          name: 'schema_migrations',
          versions: pendingMigrations,
          message: `Migrations aprovadas pendentes: ${pendingMigrations.join(', ')}`
        });
      }

      const systemInfoState = await supabase
        .from('system_info')
        .select('db_version')
        .limit(1)
        .maybeSingle();

      if (!systemInfoState.error && systemInfoState.data?.db_version && systemInfoState.data.db_version !== latestCompletedMigration) {
        drifts.push({
          type: 'db_version_mismatch',
          name: 'system_info',
          current_version: systemInfoState.data.db_version,
          expected_version: latestCompletedMigration,
          message: `system_info reporta v${systemInfoState.data.db_version}, mas schema_migrations confirma v${latestCompletedMigration}.`
        });
      }
    }
  }

  return res.status(200).json({
    success: true,
    data: {
      is_healthy: drifts.length === 0,
      drifts,
      checked_at: new Date().toISOString()
    }
  });
}

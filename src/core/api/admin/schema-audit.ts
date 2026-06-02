import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getLocalSupabasePublicConfig,
  getLocalSupabaseServerKeyErrorMessage,
  isLocalSupabaseServerKeyFailure,
  resolveLocalSupabaseServerClient,
  validateLocalUserWithPublicKey,
} from '../_supabase-server.js';
import {
  CURRENT_SCHEMA_VERSION,
  compareVersions,
  getPendingApprovedMigrationVersions,
} from './_migration-registry.js';

const SCHEMA_CHECKS = [
  { table: 'system_info', columns: ['db_version', 'github_installation_id', 'github_repository'] },
  { table: 'schema_migrations', columns: ['version', 'success'] },
  { table: 'accounts', columns: ['owner_user_id', 'plan_type', 'status'] },
  { table: 'business_settings', columns: ['account_id', 'support_email', 'privacy_policy_version', 'terms_of_purchase_version', 'is_ready_to_sell'] },
  { table: 'business_legal_document_versions', columns: ['account_id', 'document_key', 'version', 'content_sha256'] },
  { table: 'platform_legal_acceptances', columns: ['email', 'surface', 'terms_version', 'privacy_version'] },
  { table: 'licenses', columns: ['key', 'account_id', 'max_instances', 'status'] },
  { table: 'installations', columns: ['license_key', 'account_id', 'installation_id', 'status'] },
  { table: 'profiles', columns: ['role', 'status', 'last_login_at', 'is_blocked'] },
  { table: 'member_areas', columns: ['banner_description', 'sidebar_config', 'custom_links', 'faqs'] },
  { table: 'gateways', columns: ['provider', 'credentials', 'config', 'is_active'] },
  { table: 'customer_payment_profiles', columns: ['gateway_id', 'gateway_name', 'gateway_customer_id', 'gateway_payment_method_id', 'reusable'] },
  { table: 'consent_preferences', columns: ['checkout_id', 'visitor_key', 'consent_version', 'analytics', 'marketing'] },
  { table: 'privacy_requests', columns: ['account_id', 'request_type', 'status', 'subject_email'] },
  { table: 'data_retention_policies', columns: ['table_name', 'retention_days', 'run_mode', 'active'] },
  { table: 'data_retention_runs', columns: ['table_name', 'rows_affected', 'cutoff_at', 'created_at'] },
  { table: 'public_gateways', columns: ['id', 'provider', 'public_key', 'config'] },
  { table: 'email_templates', columns: ['event_type', 'language', 'html_body'] },
  { table: 'system_email_templates', columns: ['event_type', 'language', 'html_body'] },
  { table: 'system_updates_log', columns: ['action', 'status', 'files_affected'] }
];

function detectMissingColumn(message: string, columns: string[]) {
  const normalized = message.toLowerCase();
  return columns.find(column => normalized.includes(`'${column.toLowerCase()}'`) || normalized.includes(` ${column.toLowerCase()} `));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
      if (isLocalSupabaseServerKeyFailure(error)) {
        return res.status(500).json({ error: getLocalSupabaseServerKeyErrorMessage() });
      }

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

  if (isLocalSupabaseServerKeyFailure(migrationState.error)) {
    return res.status(500).json({ error: getLocalSupabaseServerKeyErrorMessage() });
  }

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
    )) as string[];
    successfulVersions.sort(compareVersions);

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

      if (isLocalSupabaseServerKeyFailure(systemInfoState.error)) {
        return res.status(500).json({ error: getLocalSupabaseServerKeyErrorMessage() });
      }

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

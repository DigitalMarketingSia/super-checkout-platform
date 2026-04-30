import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const SCHEMA_CHECKS = [
  { table: 'system_info', columns: ['db_version', 'github_installation_id', 'github_repository'] },
  { table: 'schema_migrations', columns: ['version', 'success'] },
  { table: 'accounts', columns: ['owner_user_id', 'plan_type', 'status'] },
  { table: 'business_settings', columns: ['account_id', 'support_email', 'is_ready_to_sell'] },
  { table: 'licenses', columns: ['key', 'account_id', 'max_instances', 'status'] },
  { table: 'installations', columns: ['license_key', 'account_id', 'installation_id', 'status'] },
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
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

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

      drifts.push({
        type: missingColumn ? 'column_missing' : 'schema_check_failed',
        name: check.table,
        column: missingColumn,
        expected_columns: check.columns,
        message
      });
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

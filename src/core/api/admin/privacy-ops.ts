import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getLocalSupabaseServerKeyErrorMessage,
  isLocalSupabaseServerKeyFailure,
  resolveLocalSupabaseServerClient,
  validateLocalUserWithPublicKey,
} from '../_supabase-server.js';

const ADMIN_ROLES = new Set(['admin', 'owner', 'master_admin']);
const ALLOWED_RETENTION_TABLES = new Set([
  'webhook_logs',
  'activity_logs',
  'validation_logs',
  'two_factor_challenges',
  'security_events',
  'system_updates_log',
]);

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

function normalizeText(value: unknown, maxLength = 5000) {
  const normalized = String(value || '').trim();
  return normalized.slice(0, maxLength);
}

function normalizeEmail(value: unknown) {
  return normalizeText(value, 320).toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isMissingTableError(error: { code?: string | null; message?: string | null } | null) {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01' || message.includes('does not exist') || message.includes('relation') && message.includes('does not exist');
}

async function resolveAdminContext(req: VercelRequest) {
  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : '';
  if (!jwt) {
    return { error: { status: 401, message: 'Missing authorization' } };
  }

  const user = await validateLocalUserWithPublicKey(jwt);
  if (!user?.id) {
    return { error: { status: 401, message: 'Invalid session' } };
  }

  const { supabase, probeError } = await resolveLocalSupabaseServerClient();
  if (!supabase) {
    return { error: { status: 500, message: getLocalSupabaseServerKeyErrorMessage() } };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (isLocalSupabaseServerKeyFailure(profileError || probeError)) {
    return { error: { status: 500, message: getLocalSupabaseServerKeyErrorMessage() } };
  }

  const role = String(profile?.role || '').trim();
  if (profileError || !ADMIN_ROLES.has(role)) {
    return { error: { status: 403, message: 'Admin access required' } };
  }

  return { supabase, user, role };
}

async function resolveAccessibleAccountIds(supabase: any, userId: string, role: string) {
  if (role === 'admin' || role === 'master_admin') {
    const { data } = await supabase
      .from('accounts')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(200);

    return (data || []).map((row: any) => String(row.id || '')).filter(Boolean);
  }

  const { data } = await supabase
    .from('accounts')
    .select('id')
    .eq('owner_user_id', userId)
    .order('created_at', { ascending: true })
    .limit(200);

  return (data || []).map((row: any) => String(row.id || '')).filter(Boolean);
}

async function buildDashboard(supabase: any, accountIds: string[]) {
  const [requestsResult, policiesResult, runsResult] = await Promise.all([
    accountIds.length > 0
      ? supabase
          .from('privacy_requests')
          .select('*')
          .in('account_id', accountIds)
          .order('created_at', { ascending: false })
          .limit(100)
      : { data: [], error: null },
    supabase
      .from('data_retention_policies')
      .select('*')
      .order('table_name', { ascending: true }),
    supabase
      .from('data_retention_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  if (requestsResult.error) throw requestsResult.error;
  if (policiesResult.error) throw policiesResult.error;
  if (runsResult.error) throw runsResult.error;

  return {
    scope_account_id: accountIds.length === 1 ? accountIds[0] : null,
    requests: requestsResult.data || [],
    policies: policiesResult.data || [],
    runs: runsResult.data || [],
  };
}

async function canSelectColumn(supabase: any, table: string, column: string) {
  const { error } = await supabase.from(table).select(column).limit(1);
  if (!error) return true;

  const code = String(error.code || '').trim();
  const message = String(error.message || '').toLowerCase();
  if (
    code === '42703'
    || code === 'PGRST204'
    || message.includes('schema cache')
    || message.includes('does not exist')
    || message.includes(`'${column.toLowerCase()}' column`)
  ) {
    return false;
  }

  throw error;
}

async function resolveOrdersSelect(supabase: any) {
  const baseColumns = [
    'id',
    'checkout_id',
    'status',
    'customer_email',
    'customer_name',
    'payment_method',
    'total',
    'metadata',
    'created_at',
  ];
  const optionalColumns = [
    'customer_phone',
    'customer_document',
    'customer_cpf',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'customer_user_id',
  ];

  const resolvedOptionalColumns: string[] = [];
  for (const column of optionalColumns) {
    if (await canSelectColumn(supabase, 'orders', column)) {
      resolvedOptionalColumns.push(column);
    }
  }

  return [...baseColumns, ...resolvedOptionalColumns].join(',');
}

async function exportSubjectData(supabase: any, email: string) {
  const normalizedEmail = normalizeEmail(email);

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id,email,full_name,status,role,created_at,last_seen_at,last_login_at')
    .ilike('email', normalizedEmail)
    .limit(20);

  if (profilesError) throw profilesError;

  const userIds = Array.from(new Set((profiles || []).map((profile: any) => String(profile.id || '')).filter(Boolean)));

  const ordersSelect = await resolveOrdersSelect(supabase);

  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select(ordersSelect)
    .ilike('customer_email', normalizedEmail)
    .order('created_at', { ascending: false })
    .limit(500);

  if (ordersError) throw ordersError;

  const orderIds = Array.from(new Set((orders || []).map((order: any) => String(order.id || '')).filter(Boolean)));

  const [paymentsResult, grantsResult, activityLogsResult, paymentProfilesResult, privacyRequestsResult, licensesResult] = await Promise.all([
    orderIds.length > 0
      ? supabase
          .from('payments')
          .select('id,order_id,gateway_id,status,transaction_id,created_at')
          .in('order_id', orderIds)
          .order('created_at', { ascending: false })
          .limit(500)
      : { data: [], error: null },
    userIds.length > 0
      ? supabase
          .from('access_grants')
          .select('id,user_id,content_id,product_id,status,granted_at,expires_at,is_subscription,subscription_status')
          .in('user_id', userIds)
          .order('granted_at', { ascending: false })
          .limit(500)
      : { data: [], error: null },
    userIds.length > 0
      ? supabase
          .from('activity_logs')
          .select('id,user_id,event,metadata,ip_address,user_agent,created_at')
          .in('user_id', userIds)
          .order('created_at', { ascending: false })
          .limit(500)
      : { data: [], error: null },
    supabase
      .from('customer_payment_profiles')
      .select('id,customer_email,customer_name,payment_method_type,card_brand,card_last4,card_exp_month,card_exp_year,wallet_type,reusable,requires_reauthentication,consent_scope,consent_captured_at,last_seen_at,created_at,updated_at')
      .ilike('customer_email', normalizedEmail)
      .order('updated_at', { ascending: false })
      .limit(100),
    supabase
      .from('privacy_requests')
      .select('*')
      .ilike('subject_email', normalizedEmail)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('licenses')
      .select('key,client_email,client_name,status,plan,created_at,expires_at')
      .ilike('client_email', normalizedEmail)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  if (paymentsResult.error) throw paymentsResult.error;
  if (grantsResult.error) throw grantsResult.error;
  if (activityLogsResult.error) throw activityLogsResult.error;
  if (paymentProfilesResult.error) throw paymentProfilesResult.error;
  if (privacyRequestsResult.error) throw privacyRequestsResult.error;
  if (licensesResult.error) throw licensesResult.error;

  return {
    generated_at: new Date().toISOString(),
    subject_email: normalizedEmail,
    profiles: profiles || [],
    orders: orders || [],
    payments: paymentsResult.data || [],
    access_grants: grantsResult.data || [],
    activity_logs: activityLogsResult.data || [],
    customer_payment_profiles: paymentProfilesResult.data || [],
    privacy_requests: privacyRequestsResult.data || [],
    licenses: licensesResult.data || [],
  };
}

async function executeRetentionCleanup(supabase: any, policy: any, userId: string) {
  const tableName = String(policy?.table_name || '').trim();
  if (!ALLOWED_RETENTION_TABLES.has(tableName)) {
    throw new Error(`Tabela de retencao nao aprovada: ${tableName}`);
  }

  const retentionDays = Number(policy?.retention_days || 0);
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    throw new Error(`Retention days invalido para ${tableName}`);
  }

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const probe = await supabase
    .from(tableName)
    .select('created_at', { head: true, count: 'exact' })
    .limit(1);

  if (probe.error && !isMissingTableError(probe.error)) {
    throw probe.error;
  }

  let rowsAffected = 0;
  const metadata: Record<string, any> = {
    skipped: false,
    retention_days: retentionDays,
  };

  if (probe.error && isMissingTableError(probe.error)) {
    metadata.skipped = true;
    metadata.reason = 'table_unavailable';
  } else {
    const deletion = await supabase
      .from(tableName)
      .delete({ count: 'exact' })
      .lt('created_at', cutoff);

    if (deletion.error) {
      throw deletion.error;
    }

    rowsAffected = Number(deletion.count || 0);
  }

  const { data: run, error: runError } = await supabase
    .from('data_retention_runs')
    .insert({
      policy_id: policy.id,
      table_name: tableName,
      rows_affected: rowsAffected,
      cutoff_at: cutoff,
      run_mode: policy.run_mode || 'delete',
      triggered_by_user_id: userId,
      metadata,
    })
    .select('*')
    .single();

  if (runError) throw runError;
  return run;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const context = await resolveAdminContext(req);
  if ('error' in context) {
    return res.status(context.error.status).json({ error: context.error.message });
  }

  const { supabase, user, role } = context;

  try {
    if (req.method === 'GET') {
      const mode = normalizeText(req.query.mode || 'dashboard', 100);
      const accountIds = await resolveAccessibleAccountIds(supabase, user.id, role);

      if (mode === 'export-subject') {
        const email = normalizeEmail(req.query.email);
        if (!isValidEmail(email)) {
          return res.status(400).json({ error: 'E-mail invalido para exportacao.' });
        }

        const data = await exportSubjectData(supabase, email);
        return res.status(200).json({ success: true, data });
      }

      const data = await buildDashboard(supabase, accountIds);
      return res.status(200).json({ success: true, data });
    }

    const body = parseBody(req);
    const action = normalizeText(body.action, 100);
    const accountIds = await resolveAccessibleAccountIds(supabase, user.id, role);

    if (action === 'create-request') {
      const subjectEmail = normalizeEmail(body.subjectEmail);
      if (!isValidEmail(subjectEmail)) {
        return res.status(400).json({ error: 'Informe um e-mail valido do titular.' });
      }

      const requestType = normalizeText(body.requestType, 50);
      const accountId = normalizeText(body.accountId, 80) || (accountIds.length === 1 ? accountIds[0] : '');
      if (!accountId || !accountIds.includes(accountId)) {
        return res.status(400).json({ error: 'Conta de privacidade nao resolvida para a solicitacao.' });
      }

      const { data, error } = await supabase
        .from('privacy_requests')
        .insert({
          account_id: accountId,
          request_type: requestType,
          status: 'open',
          subject_email: subjectEmail,
          subject_name: normalizeText(body.subjectName, 255) || null,
          subject_phone: normalizeText(body.subjectPhone, 80) || null,
          subject_document: normalizeText(body.subjectDocument, 80) || null,
          request_channel: 'admin_panel',
          notes: normalizeText(body.notes, 4000) || null,
          requested_by_user_id: user.id,
          metadata: {
            origin: 'privacy_center',
          },
        })
        .select('*')
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    if (action === 'update-request') {
      const id = normalizeText(body.id, 80);
      const status = normalizeText(body.status, 30);
      if (!id) {
        return res.status(400).json({ error: 'Solicitacao invalida.' });
      }

      const { data: existing, error: existingError } = await supabase
        .from('privacy_requests')
        .select('id,account_id')
        .eq('id', id)
        .maybeSingle();

      if (existingError) throw existingError;
      if (!existing?.id || !accountIds.includes(String(existing.account_id || ''))) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada.' });
      }

      const fulfilledAt = status === 'fulfilled' ? new Date().toISOString() : null;
      const { data, error } = await supabase
        .from('privacy_requests')
        .update({
          status,
          resolution_notes: normalizeText(body.resolutionNotes, 4000) || null,
          fulfilled_at: fulfilledAt,
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    if (action === 'update-policy') {
      const id = normalizeText(body.id, 80);
      const retentionDays = Number(body.retentionDays || 0);
      if (!id || !Number.isFinite(retentionDays) || retentionDays <= 0) {
        return res.status(400).json({ error: 'Politica de retencao invalida.' });
      }

      const { data, error } = await supabase
        .from('data_retention_policies')
        .update({
          retention_days: retentionDays,
          active: body.active === true,
          notes: normalizeText(body.notes, 1000) || null,
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }

    if (action === 'run-cleanup') {
      const tableName = normalizeText(body.tableName, 120);
      const policiesQuery = supabase
        .from('data_retention_policies')
        .select('*')
        .eq('active', true)
        .order('table_name', { ascending: true });

      const { data: policies, error: policiesError } = tableName
        ? await policiesQuery.eq('table_name', tableName)
        : await policiesQuery;

      if (policiesError) throw policiesError;

      const results: any[] = [];
      for (const policy of policies || []) {
        results.push(await executeRetentionCleanup(supabase, policy, user.id));
      }

      return res.status(200).json({ success: true, data: { results } });
    }

    return res.status(400).json({ error: 'Privacy action not supported.' });
  } catch (error: any) {
    console.error('[privacy-ops] failed:', error?.message || error);
    return res.status(500).json({ error: error?.message || 'Falha nas operacoes de privacidade.' });
  }
}

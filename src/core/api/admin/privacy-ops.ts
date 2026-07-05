import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getLocalSupabaseServerKeyErrorMessage,
  isLocalSupabaseServerKeyFailure,
  resolveLocalSupabaseServerClient,
  validateLocalUserWithPublicKey,
} from '../_supabase-server.js';
import { buildRetentionSafePaymentRawResponse } from '../../utils/paymentRawResponse.js';

const ADMIN_ROLES = new Set(['admin', 'owner', 'master_admin']);
const PRIVACY_REQUEST_TYPES = new Set(['access', 'correction', 'deletion', 'anonymization', 'objection', 'portability', 'revocation']);
const PRIVACY_REQUEST_STATUSES = new Set(['open', 'in_review', 'fulfilled', 'rejected']);
const PRIVACY_REQUEST_CHANNELS = new Set(['privacy_email', 'support_email', 'checkout_form', 'member_portal', 'admin_panel', 'anpd', 'consumer_authority', 'other']);
const RETENTION_REVIEW_REQUEST_TYPES = new Set(['deletion', 'anonymization']);
const DEFAULT_PRIVACY_SLA_POLICY = Object.freeze({
  policy_version: 'phase36_5_v1',
  acknowledgement_business_days: 2,
  response_target_calendar_days: 15,
  reference: 'anpd_direitos_titular_plus_internal_operational_policy',
});

type RetentionRunMode = 'delete' | 'anonymize';
type PrivacyRequestChannel =
  | 'privacy_email'
  | 'support_email'
  | 'checkout_form'
  | 'member_portal'
  | 'admin_panel'
  | 'anpd'
  | 'consumer_authority'
  | 'other';
type PrivacyGovernanceSnapshot = {
  business_name?: string | null;
  official_channel_email?: string | null;
  official_channel_source: 'legal_responsible_email' | 'support_email' | 'not_configured';
  official_channel_configured: boolean;
  acknowledgement_business_days: number;
  response_target_calendar_days: number;
  policy_version: string;
  reference: string;
};
type RetentionExecutionResult = {
  rowsAffected: number;
  metadata?: Record<string, any>;
};
type CorrectionRequestSnapshot = {
  target_email?: string | null;
  target_name?: string | null;
  target_phone?: string | null;
  target_document?: string | null;
  requested_fields?: string[];
  captured_at?: string;
};
type RetentionTableConfig = {
  supportedModes: RetentionRunMode[];
  anonymize?: (supabase: any, cutoff: string) => Promise<RetentionExecutionResult>;
};

function normalizeRunMode(value: unknown): RetentionRunMode {
  return String(value || '').trim().toLowerCase() === 'anonymize' ? 'anonymize' : 'delete';
}

const RETENTION_TABLE_CONFIG: Record<string, RetentionTableConfig> = {
  webhook_logs: {
    supportedModes: ['delete', 'anonymize'],
    anonymize: async (supabase, cutoff) => {
      const anonymizedAt = new Date().toISOString();
      const { count, error } = await supabase
        .from('webhook_logs')
        .update({
          payload: {
            retention_anonymized_at: anonymizedAt,
            retention_scope: 'payload_removed',
            retention_mode: 'anonymize',
          },
          response_body: null,
        }, { count: 'exact' })
        .lt('created_at', cutoff)
        .filter('payload->>retention_anonymized_at', 'is', null);

      if (error) throw error;
      return {
        rowsAffected: Number(count || 0),
        metadata: {
          strategy: 'payload_body_removed',
        },
      };
    },
  },
  activity_logs: {
    supportedModes: ['delete'],
  },
  validation_logs: {
    supportedModes: ['delete', 'anonymize'],
    anonymize: async (supabase, cutoff) => {
      const { count, error } = await supabase
        .from('validation_logs')
        .update({
          license_key: null,
          ip_address: null,
          domain: null,
          user_agent: null,
        }, { count: 'exact' })
        .lt('created_at', cutoff)
        .or('license_key.not.is.null,ip_address.not.is.null,domain.not.is.null,user_agent.not.is.null');

      if (error) throw error;
      return {
        rowsAffected: Number(count || 0),
        metadata: {
          strategy: 'license_validation_minimized',
        },
      };
    },
  },
  two_factor_challenges: {
    supportedModes: ['delete'],
  },
  security_events: {
    supportedModes: ['delete', 'anonymize'],
    anonymize: async (supabase, cutoff) => {
      const anonymizedAt = new Date().toISOString();
      const { count, error } = await supabase
        .from('security_events')
        .update({
          ip_address: null,
          user_id: null,
          metadata: {
            retention_anonymized_at: anonymizedAt,
            retention_scope: 'security_event_minimized',
            retention_mode: 'anonymize',
          },
        }, { count: 'exact' })
        .lt('created_at', cutoff)
        .filter('metadata->>retention_anonymized_at', 'is', null);

      if (error) throw error;
      return {
        rowsAffected: Number(count || 0),
        metadata: {
          strategy: 'event_trace_minimized',
        },
      };
    },
  },
  payments: {
    supportedModes: ['anonymize'],
    anonymize: async (supabase, cutoff) => {
      const { data: payments, error } = await supabase
        .from('payments')
        .select('id,status,raw_response')
        .lt('created_at', cutoff)
        .not('raw_response', 'is', null);

      if (error) throw error;

      let rowsAffected = 0;
      const providers: Record<string, number> = {};

      for (const payment of payments || []) {
        const result = buildRetentionSafePaymentRawResponse(payment.raw_response, payment.status);
        if (!result.changed || !result.rawResponse) continue;

        const { error: updateError } = await supabase
          .from('payments')
          .update({
            raw_response: result.rawResponse,
          })
          .eq('id', payment.id);

        if (updateError) throw updateError;

        rowsAffected += 1;
        const providerKey = String(result.provider || 'unknown');
        providers[providerKey] = Number(providers[providerKey] || 0) + 1;
      }

      return {
        rowsAffected,
        metadata: {
          strategy: 'terminal_payment_artifacts_minimized',
          providers,
        },
      };
    },
  },
  system_updates_log: {
    supportedModes: ['delete'],
  },
};

const ALLOWED_RETENTION_TABLES = new Set(Object.keys(RETENTION_TABLE_CONFIG));

function requiresRetentionReview(requestType: string) {
  return RETENTION_REVIEW_REQUEST_TYPES.has(requestType);
}

function normalizeRequestChannel(value: unknown): PrivacyRequestChannel | null {
  const normalized = String(value || '').trim().toLowerCase();
  return PRIVACY_REQUEST_CHANNELS.has(normalized) ? normalized as PrivacyRequestChannel : null;
}

function normalizeLifecycleStatus(value: unknown) {
  return String(value || '').trim().toLowerCase();
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

function getObjectRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : null;
}

function addCalendarDays(baseDate: Date, days: number) {
  const next = new Date(baseDate.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addBusinessDays(baseDate: Date, days: number) {
  const next = new Date(baseDate.getTime());
  let remaining = Math.max(0, Math.trunc(days));

  while (remaining > 0) {
    next.setUTCDate(next.getUTCDate() + 1);
    const weekDay = next.getUTCDay();
    if (weekDay !== 0 && weekDay !== 6) {
      remaining -= 1;
    }
  }

  return next;
}

function buildPrivacySlaSnapshot(createdAt: Date) {
  return {
    ...DEFAULT_PRIVACY_SLA_POLICY,
    registered_at: createdAt.toISOString(),
    acknowledge_by: addBusinessDays(createdAt, DEFAULT_PRIVACY_SLA_POLICY.acknowledgement_business_days).toISOString(),
    response_due_at: addCalendarDays(createdAt, DEFAULT_PRIVACY_SLA_POLICY.response_target_calendar_days).toISOString(),
  };
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

async function resolvePrivacyGovernanceSnapshot(supabase: any, accountId?: string | null): Promise<PrivacyGovernanceSnapshot> {
  const fallback: PrivacyGovernanceSnapshot = {
    business_name: null,
    official_channel_email: null,
    official_channel_source: 'not_configured',
    official_channel_configured: false,
    acknowledgement_business_days: DEFAULT_PRIVACY_SLA_POLICY.acknowledgement_business_days,
    response_target_calendar_days: DEFAULT_PRIVACY_SLA_POLICY.response_target_calendar_days,
    policy_version: DEFAULT_PRIVACY_SLA_POLICY.policy_version,
    reference: DEFAULT_PRIVACY_SLA_POLICY.reference,
  };

  if (!accountId) {
    return fallback;
  }

  const { data, error } = await supabase
    .from('business_settings')
    .select('business_name,legal_responsible_email,support_email')
    .eq('account_id', accountId)
    .maybeSingle();

  if (error && !isMissingTableError(error)) {
    throw error;
  }

  const legalResponsibleEmail = normalizeEmail(data?.legal_responsible_email);
  const supportEmail = normalizeEmail(data?.support_email);
  const officialChannelEmail = legalResponsibleEmail || supportEmail || null;
  const officialChannelSource = legalResponsibleEmail
    ? 'legal_responsible_email'
    : supportEmail
      ? 'support_email'
      : 'not_configured';

  return {
    ...fallback,
    business_name: normalizeText(data?.business_name, 255) || null,
    official_channel_email: officialChannelEmail,
    official_channel_source: officialChannelSource,
    official_channel_configured: Boolean(officialChannelEmail),
  };
}

async function buildDashboard(supabase: any, accountIds: string[]) {
  const scopeAccountId = accountIds.length === 1 ? accountIds[0] : null;
  const [requestsResult, policiesResult, runsResult, governance] = await Promise.all([
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
    resolvePrivacyGovernanceSnapshot(supabase, scopeAccountId),
  ]);

  if (requestsResult.error) throw requestsResult.error;
  if (policiesResult.error) throw policiesResult.error;
  if (runsResult.error) throw runsResult.error;

  return {
    scope_account_id: scopeAccountId,
    governance,
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

function buildCorrectionRequestSnapshot(body: Record<string, any>) {
  const targetEmailRaw = normalizeText(body.correctionTargetEmail, 320);
  const targetEmail = normalizeEmail(targetEmailRaw);
  if (targetEmailRaw && !isValidEmail(targetEmail)) {
    return {
      snapshot: null,
      error: 'Informe um e-mail valido para a correcao solicitada.',
    };
  }

  const targetName = normalizeText(body.correctionTargetName, 255);
  const targetPhone = normalizeText(body.correctionTargetPhone, 80);
  const targetDocument = normalizeText(body.correctionTargetDocument, 80);
  const requestedFields: string[] = [];

  if (targetEmail) requestedFields.push('email');
  if (targetName) requestedFields.push('name');
  if (targetPhone) requestedFields.push('phone');
  if (targetDocument) requestedFields.push('document');

  if (requestedFields.length === 0) {
    return {
      snapshot: null,
      error: null,
    };
  }

  return {
    snapshot: {
      target_email: targetEmail || null,
      target_name: targetName || null,
      target_phone: targetPhone || null,
      target_document: targetDocument || null,
      requested_fields: requestedFields,
      captured_at: new Date().toISOString(),
    } satisfies CorrectionRequestSnapshot,
    error: null,
  };
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

function extractOrderLegalAcceptances(orders: any[]) {
  return (orders || [])
    .map((order: any) => {
      const legalAcceptance = order?.metadata?.legal_acceptance;
      if (!legalAcceptance || typeof legalAcceptance !== 'object') {
        return null;
      }

      return {
        order_id: String(order.id || ''),
        checkout_id: String(order.checkout_id || ''),
        accepted_at: normalizeText(legalAcceptance.accepted_at, 80) || null,
        source_surface: normalizeText(legalAcceptance.source_surface, 80) || null,
        business_name: normalizeText(legalAcceptance.business_name, 255) || null,
        privacy_policy_version: normalizeText(legalAcceptance.privacy_policy_version, 120) || null,
        privacy_policy_published_at: normalizeText(legalAcceptance.privacy_policy_published_at, 80) || null,
        privacy_policy_source: normalizeText(legalAcceptance.privacy_policy_source, 80) || null,
        terms_of_purchase_version: normalizeText(legalAcceptance.terms_of_purchase_version, 120) || null,
        terms_of_purchase_published_at: normalizeText(legalAcceptance.terms_of_purchase_published_at, 80) || null,
        terms_of_purchase_source: normalizeText(legalAcceptance.terms_of_purchase_source, 80) || null,
      };
    })
    .filter(Boolean);
}

function buildSubjectExportAuditSummary(payload: Record<string, any>) {
  const sectionNames = [
    'profiles',
    'orders',
    'payments',
    'access_grants',
    'activity_logs',
    'customer_payment_profiles',
    'platform_legal_acceptances',
    'order_legal_acceptances',
    'privacy_requests',
    'licenses',
  ];

  const counts = Object.fromEntries(
    sectionNames.map((section) => [
      section,
      Array.isArray(payload?.[section]) ? payload[section].length : 0,
    ]),
  );

  return {
    generated_at: normalizeText(payload?.generated_at, 80) || new Date().toISOString(),
    subject_email: normalizeEmail(payload?.subject_email),
    included_sections: sectionNames.filter((section) => counts[section] > 0),
    counts,
    export_notes_count: Array.isArray(payload?.export_notes) ? payload.export_notes.length : 0,
  };
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

  const [
    paymentsResult,
    grantsResult,
    activityLogsResult,
    paymentProfilesResult,
    privacyRequestsResult,
    licensesResult,
    platformLegalAcceptancesResult,
  ] = await Promise.all([
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
    supabase
      .from('platform_legal_acceptances')
      .select('id,user_id,email,surface,terms_version,privacy_version,terms_url,privacy_url,channel_email,accepted_at,created_at,updated_at,metadata')
      .ilike('email', normalizedEmail)
      .order('accepted_at', { ascending: false })
      .limit(100),
  ]);

  if (paymentsResult.error) throw paymentsResult.error;
  if (grantsResult.error) throw grantsResult.error;
  if (activityLogsResult.error) throw activityLogsResult.error;
  if (paymentProfilesResult.error) throw paymentProfilesResult.error;
  if (privacyRequestsResult.error) throw privacyRequestsResult.error;
  if (licensesResult.error) throw licensesResult.error;
  if (platformLegalAcceptancesResult.error && !isMissingTableError(platformLegalAcceptancesResult.error)) {
    throw platformLegalAcceptancesResult.error;
  }

  const safeOrders = orders || [];
  const orderLegalAcceptances = extractOrderLegalAcceptances(safeOrders);
  const exportNotes: string[] = [];
  if (orderIds.length > 0) {
    exportNotes.push('Order metadata may already contain legal_acceptance snapshots tied to the purchase flow.');
  }
  exportNotes.push('Anonymous checkout consent_preferences are keyed by checkout_id + visitor_key and are not yet deterministically linked to subject email in this export.');

  return {
    generated_at: new Date().toISOString(),
    subject_email: normalizedEmail,
    profiles: profiles || [],
    orders: safeOrders,
    payments: paymentsResult.data || [],
    access_grants: grantsResult.data || [],
    activity_logs: activityLogsResult.data || [],
    customer_payment_profiles: paymentProfilesResult.data || [],
    platform_legal_acceptances: platformLegalAcceptancesResult.data || [],
    order_legal_acceptances: orderLegalAcceptances,
    privacy_requests: privacyRequestsResult.data || [],
    licenses: licensesResult.data || [],
    export_notes: exportNotes,
  };
}

async function assessSubjectRetentionReview(supabase: any, email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return {
      subject_email: normalizedEmail,
      manual_review_required: false,
      retention_blocked: false,
      total_orders: 0,
      total_payments: 0,
      liquidated_orders: 0,
      pending_orders: 0,
      failed_or_abandoned_orders: 0,
      blocking_reason_codes: [],
      matrix_reference: 'ORDERS_PAYMENTS_RETENTION_MATRIX.md',
      reviewed_at: new Date().toISOString(),
    };
  }

  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id,status,created_at')
    .ilike('customer_email', normalizedEmail)
    .order('created_at', { ascending: false })
    .limit(500);

  if (ordersError && !isMissingTableError(ordersError)) {
    throw ordersError;
  }

  const safeOrders = Array.isArray(orders) ? orders : [];
  const orderIds = safeOrders.map((order: any) => String(order.id || '')).filter(Boolean);

  const paymentsResult = orderIds.length > 0
    ? await supabase
        .from('payments')
        .select('id,order_id,status,created_at')
        .in('order_id', orderIds)
        .order('created_at', { ascending: false })
        .limit(500)
    : { data: [], error: null };

  if (paymentsResult.error && !isMissingTableError(paymentsResult.error)) {
    throw paymentsResult.error;
  }

  const liquidatedStatuses = new Set(['paid', 'approved', 'refunded', 'canceled', 'cancelled', 'completed']);
  const failedStatuses = new Set(['failed', 'rejected', 'declined']);

  let liquidatedOrders = 0;
  let failedOrAbandonedOrders = 0;

  for (const order of safeOrders) {
    const status = normalizeLifecycleStatus(order?.status);
    if (liquidatedStatuses.has(status)) {
      liquidatedOrders += 1;
      continue;
    }
    if (failedStatuses.has(status)) {
      failedOrAbandonedOrders += 1;
    }
  }

  const totalOrders = safeOrders.length;
  const totalPayments = Array.isArray(paymentsResult.data) ? paymentsResult.data.length : 0;
  const pendingOrders = Math.max(0, totalOrders - liquidatedOrders - failedOrAbandonedOrders);
  const manualReviewRequired = totalOrders > 0 || totalPayments > 0;
  const retentionBlocked = liquidatedOrders > 0 || totalPayments > 0;

  const blockingReasonCodes: string[] = [];
  if (liquidatedOrders > 0) {
    blockingReasonCodes.push('liquidated_orders_minimum_5y_window');
  }
  if (totalPayments > 0) {
    blockingReasonCodes.push('payments_reconciliation_audit_window');
  }
  if (pendingOrders > 0) {
    blockingReasonCodes.push('pending_orders_require_case_review');
  }
  if (failedOrAbandonedOrders > 0) {
    blockingReasonCodes.push('failed_or_abandoned_orders_require_manual_review');
  }

  return {
    subject_email: normalizedEmail,
    manual_review_required: manualReviewRequired,
    retention_blocked: retentionBlocked,
    total_orders: totalOrders,
    total_payments: totalPayments,
    liquidated_orders: liquidatedOrders,
    pending_orders: pendingOrders,
    failed_or_abandoned_orders: failedOrAbandonedOrders,
    blocking_reason_codes: blockingReasonCodes,
    matrix_reference: 'ORDERS_PAYMENTS_RETENTION_MATRIX.md',
    reviewed_at: new Date().toISOString(),
  };
}

async function applySubjectRevocationControls(supabase: any, email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return {
      subject_email: normalizedEmail,
      customer_payment_profiles_disabled: 0,
      skipped: true,
      reason: 'invalid_email',
      executed_at: new Date().toISOString(),
    };
  }

  const { count, error } = await supabase
    .from('customer_payment_profiles')
    .update({
      reusable: false,
      requires_reauthentication: true,
    }, { count: 'exact' })
    .ilike('customer_email', normalizedEmail)
    .eq('reusable', true);

  if (error && !isMissingTableError(error)) {
    throw error;
  }

  return {
    subject_email: normalizedEmail,
    customer_payment_profiles_disabled: Number(count || 0),
    skipped: Boolean(error && isMissingTableError(error)),
    reason: error && isMissingTableError(error) ? 'table_unavailable' : null,
    strategy: 'disable_local_saved_payment_reuse',
    executed_at: new Date().toISOString(),
  };
}

async function applySubjectCorrectionControls(
  supabase: any,
  request: {
    subject_email: string;
    subject_name?: string | null;
    subject_phone?: string | null;
    subject_document?: string | null;
    metadata?: Record<string, any>;
  },
) {
  const normalizedEmail = normalizeEmail(request.subject_email);
  const metadata = getObjectRecord(request.metadata) || {};
  const correctionRequest = getObjectRecord(metadata.correction_request) || {};
  const fallbackName = normalizeText(request.subject_name, 255);
  const fallbackPhone = normalizeText(request.subject_phone, 80);
  const fallbackDocument = normalizeText(request.subject_document, 80);
  const targetName = normalizeText(correctionRequest.target_name ?? fallbackName, 255);
  const targetPhone = normalizeText(correctionRequest.target_phone ?? fallbackPhone, 80);
  const targetDocument = normalizeText(correctionRequest.target_document ?? fallbackDocument, 80);
  const targetEmail = normalizeEmail(correctionRequest.target_email);
  const requestedFields = Array.isArray(correctionRequest.requested_fields)
    ? correctionRequest.requested_fields
        .map((value: unknown) => normalizeText(value, 80))
        .filter(Boolean)
    : [];

  if (!isValidEmail(normalizedEmail)) {
    return {
      subject_email: normalizedEmail,
      requested_fields: requestedFields,
      auto_applied_fields: [],
      manual_follow_up_fields: [],
      skipped: true,
      reason: 'invalid_subject_email',
      executed_at: new Date().toISOString(),
    };
  }

  if (!targetName && !targetEmail && !targetPhone && !targetDocument) {
    return {
      subject_email: normalizedEmail,
      requested_fields: requestedFields,
      auto_applied_fields: [],
      manual_follow_up_fields: [],
      skipped: true,
      reason: 'no_requested_corrections',
      executed_at: new Date().toISOString(),
    };
  }

  let profilesUpdated = 0;
  let authMetadataUpdated = 0;
  let licensesUpdated = 0;
  let customerPaymentProfilesUpdated = 0;
  const autoAppliedFields: string[] = [];
  const manualFollowUpFields: string[] = [];

  if (targetName) {
    const { data: matchingProfiles, error: profilesLookupError } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', normalizedEmail);

    if (profilesLookupError && !isMissingTableError(profilesLookupError)) {
      throw profilesLookupError;
    }

    for (const profile of matchingProfiles || []) {
      const userId = normalizeText(profile?.id, 80);
      if (!userId) continue;

      try {
        const { error: authUpdateError } = await supabase.auth.admin.updateUserById(userId, {
          user_metadata: {
            full_name: targetName,
            name: targetName,
          },
        });

        if (authUpdateError) throw authUpdateError;
        authMetadataUpdated += 1;
      } catch {
        if (!manualFollowUpFields.includes('auth_metadata_sync')) {
          manualFollowUpFields.push('auth_metadata_sync');
        }
      }
    }

    const profileUpdate = await supabase
      .from('profiles')
      .update({ full_name: targetName }, { count: 'exact' })
      .ilike('email', normalizedEmail);

    if (profileUpdate.error && !isMissingTableError(profileUpdate.error)) {
      throw profileUpdate.error;
    }
    profilesUpdated = Number(profileUpdate.count || 0);

    const licenseUpdate = await supabase
      .from('licenses')
      .update({ client_name: targetName }, { count: 'exact' })
      .ilike('client_email', normalizedEmail);

    if (licenseUpdate.error && !isMissingTableError(licenseUpdate.error)) {
      throw licenseUpdate.error;
    }
    licensesUpdated = Number(licenseUpdate.count || 0);

    const paymentProfilesUpdate = await supabase
      .from('customer_payment_profiles')
      .update({ customer_name: targetName }, { count: 'exact' })
      .ilike('customer_email', normalizedEmail);

    if (paymentProfilesUpdate.error && !isMissingTableError(paymentProfilesUpdate.error)) {
      throw paymentProfilesUpdate.error;
    }
    customerPaymentProfilesUpdated = Number(paymentProfilesUpdate.count || 0);

    autoAppliedFields.push('name');
  }

  if (targetEmail) {
    manualFollowUpFields.push('email_auth_identity');
  }
  if (targetPhone) {
    manualFollowUpFields.push('phone_external_or_financial_records');
  }
  if (targetDocument) {
    manualFollowUpFields.push('document_external_or_financial_records');
  }

  return {
    subject_email: normalizedEmail,
    requested_fields: requestedFields.length > 0
      ? requestedFields
      : [
          ...(targetName ? ['name'] : []),
          ...(targetEmail ? ['email'] : []),
          ...(targetPhone ? ['phone'] : []),
          ...(targetDocument ? ['document'] : []),
        ],
    auto_applied_fields: autoAppliedFields,
    manual_follow_up_fields: manualFollowUpFields,
    profiles_updated: profilesUpdated,
    auth_metadata_updated: authMetadataUpdated,
    licenses_updated: licensesUpdated,
    customer_payment_profiles_updated: customerPaymentProfilesUpdated,
    skipped: false,
    strategy: 'update_mutable_subject_aliases_only',
    executed_at: new Date().toISOString(),
  };
}

async function applySubjectObjectionControls(supabase: any, email: string) {
  const revocationResult = await applySubjectRevocationControls(supabase, email);
  const manualFollowUpFields = ['anonymous_consent_preferences_by_visitor_key'];

  return {
    subject_email: revocationResult.subject_email,
    customer_payment_profiles_disabled: revocationResult.customer_payment_profiles_disabled,
    linked_optional_processing_restricted: Number(revocationResult.customer_payment_profiles_disabled || 0) > 0,
    anonymous_consent_linkable: false,
    manual_follow_up_fields: manualFollowUpFields,
    skipped: revocationResult.skipped,
    reason: revocationResult.reason,
    strategy: 'restrict_subject_linked_optional_processing',
    executed_at: new Date().toISOString(),
  };
}

async function executeRetentionCleanup(supabase: any, policy: any, userId: string) {
  const tableName = String(policy?.table_name || '').trim();
  if (!ALLOWED_RETENTION_TABLES.has(tableName)) {
    throw new Error(`Tabela de retencao nao aprovada: ${tableName}`);
  }
  const tableConfig = RETENTION_TABLE_CONFIG[tableName];
  if (!tableConfig) {
    throw new Error(`Configuracao de retencao ausente para ${tableName}`);
  }
  const runMode = normalizeRunMode(policy?.run_mode);
  if (!tableConfig.supportedModes.includes(runMode)) {
    throw new Error(`Modo de retencao nao suportado para ${tableName}: ${runMode}`);
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
    requested_run_mode: runMode,
  };

  if (probe.error && isMissingTableError(probe.error)) {
    metadata.skipped = true;
    metadata.reason = 'table_unavailable';
  } else {
    if (runMode === 'anonymize') {
      const anonymize = tableConfig.anonymize;
      if (!anonymize) {
        throw new Error(`Tabela sem estrategia de anonimização: ${tableName}`);
      }
      const result = await anonymize(supabase, cutoff);
      rowsAffected = result.rowsAffected;
      Object.assign(metadata, result.metadata || {});
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
  }

  const { data: run, error: runError } = await supabase
    .from('data_retention_runs')
    .insert({
      policy_id: policy.id,
      table_name: tableName,
      rows_affected: rowsAffected,
      cutoff_at: cutoff,
      run_mode: runMode,
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
      if (!PRIVACY_REQUEST_TYPES.has(requestType)) {
        return res.status(400).json({ error: 'Tipo de solicitacao de privacidade invalido.' });
      }
      const accountId = normalizeText(body.accountId, 80) || (accountIds.length === 1 ? accountIds[0] : '');
      if (!accountId || !accountIds.includes(accountId)) {
        return res.status(400).json({ error: 'Conta de privacidade nao resolvida para a solicitacao.' });
      }
      const requestChannel = normalizeRequestChannel(body.requestChannel);
      if (!requestChannel) {
        return res.status(400).json({ error: 'Canal de solicitacao de privacidade invalido.' });
      }
      const governance = await resolvePrivacyGovernanceSnapshot(supabase, accountId);
      const registeredAt = new Date();

      const metadata: Record<string, any> = {
        origin: 'privacy_center',
        intake: {
          request_channel: requestChannel,
          official_channel_email: governance.official_channel_email,
          official_channel_source: governance.official_channel_source,
          official_channel_configured: governance.official_channel_configured,
        },
        sla: buildPrivacySlaSnapshot(registeredAt),
      };
      if (requestType === 'correction') {
        const correctionRequest = buildCorrectionRequestSnapshot(body);
        if (correctionRequest.error) {
          return res.status(400).json({ error: correctionRequest.error });
        }
        if (correctionRequest.snapshot) {
          metadata.correction_request = correctionRequest.snapshot;
        }
      }
      if (requiresRetentionReview(requestType)) {
        metadata.retention_review = await assessSubjectRetentionReview(supabase, subjectEmail);
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
          request_channel: requestChannel,
          notes: normalizeText(body.notes, 4000) || null,
          requested_by_user_id: user.id,
          metadata,
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
      if (!PRIVACY_REQUEST_STATUSES.has(status)) {
        return res.status(400).json({ error: 'Status de solicitacao invalido.' });
      }

      const { data: existing, error: existingError } = await supabase
        .from('privacy_requests')
        .select('id,account_id,request_type,subject_email,subject_name,subject_phone,subject_document,request_channel,metadata,created_at')
        .eq('id', id)
        .maybeSingle();

      if (existingError) throw existingError;
      if (!existing?.id || !accountIds.includes(String(existing.account_id || ''))) {
        return res.status(404).json({ error: 'Solicitacao nao encontrada.' });
      }

      const requestType = normalizeText(existing.request_type, 50);
      const resolutionNotes = normalizeText(body.resolutionNotes, 4000) || null;
      const isClosingStatus = status === 'fulfilled' || status === 'rejected';
      if (isClosingStatus && !resolutionNotes) {
        return res.status(400).json({
          error: 'Documente em notas a decisao tomada para concluir ou recusar esta solicitacao.',
        });
      }
      const currentMetadata = existing.metadata && typeof existing.metadata === 'object'
        ? existing.metadata
        : {};
      const governance = await resolvePrivacyGovernanceSnapshot(supabase, String(existing.account_id || ''));
      const requestCreatedAt = new Date(existing.created_at || Date.now());
      const safeCreatedAt = Number.isNaN(requestCreatedAt.getTime()) ? new Date() : requestCreatedAt;
      let nextMetadata: Record<string, any> = { ...currentMetadata };
      const nextSla = currentMetadata.sla && typeof currentMetadata.sla === 'object'
        ? {
            ...currentMetadata.sla,
          }
        : buildPrivacySlaSnapshot(safeCreatedAt);

      nextMetadata = {
        ...nextMetadata,
        intake: {
          ...(nextMetadata.intake && typeof nextMetadata.intake === 'object' ? nextMetadata.intake : {}),
          request_channel: normalizeRequestChannel(existing.request_channel) || 'admin_panel',
          official_channel_email: governance.official_channel_email,
          official_channel_source: governance.official_channel_source,
          official_channel_configured: governance.official_channel_configured,
        },
        sla: {
          ...nextSla,
          last_reviewed_at: new Date().toISOString(),
        },
      };

      if (status === 'fulfilled' || status === 'rejected') {
        nextMetadata.sla = {
          ...nextMetadata.sla,
          resolved_at: new Date().toISOString(),
          final_status: status,
        };
      } else if (nextMetadata.sla && typeof nextMetadata.sla === 'object') {
        delete nextMetadata.sla.resolved_at;
        delete nextMetadata.sla.final_status;
      }

      if (requiresRetentionReview(requestType)) {
        const retentionReview = await assessSubjectRetentionReview(supabase, normalizeEmail(existing.subject_email));
        nextMetadata = {
          ...nextMetadata,
          retention_review: retentionReview,
        };

        if (retentionReview.retention_blocked && status === 'fulfilled') {
          return res.status(409).json({
            error: 'Exclusao total bloqueada: existem orders/payments sob retencao ativa. Use `rejected` ou mantenha `in_review` com justificativa operacional.',
          });
        }
      }

      if (requestType === 'revocation' && status === 'fulfilled') {
        nextMetadata = {
          ...nextMetadata,
          revocation_execution: await applySubjectRevocationControls(supabase, normalizeEmail(existing.subject_email)),
        };
      }

      if (requestType === 'correction' && status === 'fulfilled') {
        nextMetadata = {
          ...nextMetadata,
          correction_execution: await applySubjectCorrectionControls(supabase, {
            subject_email: normalizeEmail(existing.subject_email),
            subject_name: existing.subject_name,
            subject_phone: existing.subject_phone,
            subject_document: existing.subject_document,
            metadata: nextMetadata,
          }),
        };
      }

      if (requestType === 'objection' && status === 'fulfilled') {
        nextMetadata = {
          ...nextMetadata,
          objection_execution: await applySubjectObjectionControls(supabase, normalizeEmail(existing.subject_email)),
        };
      }

      if ((requestType === 'access' || requestType === 'portability') && status === 'fulfilled') {
        const exportPayload = await exportSubjectData(supabase, normalizeEmail(existing.subject_email));
        nextMetadata = {
          ...nextMetadata,
          export_execution: buildSubjectExportAuditSummary(exportPayload),
        };
      }

      const fulfilledAt = status === 'fulfilled' ? new Date().toISOString() : null;
      const { data, error } = await supabase
        .from('privacy_requests')
        .update({
          status,
          resolution_notes: resolutionNotes,
          fulfilled_at: fulfilledAt,
          metadata: nextMetadata,
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
      const runMode = normalizeRunMode(body.runMode);
      if (!id || !Number.isFinite(retentionDays) || retentionDays <= 0) {
        return res.status(400).json({ error: 'Politica de retencao invalida.' });
      }

      const { data: currentPolicy, error: currentPolicyError } = await supabase
        .from('data_retention_policies')
        .select('id, table_name')
        .eq('id', id)
        .single();

      if (currentPolicyError) throw currentPolicyError;

      const tableName = String(currentPolicy?.table_name || '').trim();
      const tableConfig = RETENTION_TABLE_CONFIG[tableName];
      if (!tableConfig) {
        return res.status(400).json({ error: 'Tabela de retencao nao aprovada.' });
      }
      if (!tableConfig.supportedModes.includes(runMode)) {
        return res.status(400).json({ error: `Modo ${runMode} nao suportado para ${tableName}.` });
      }

      const { data, error } = await supabase
        .from('data_retention_policies')
        .update({
          retention_days: retentionDays,
          run_mode: runMode,
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

import { sendPushNotification, getPushServerConfig } from '../api/_push.js';
import { loadOrderMetadata, mergeOrderMetadata } from './orderMetadata.js';
import {
  DEFAULT_PUSH_PREFERENCES,
  type PushPreferences,
  type PushSubscriptionJson,
} from '../types/pwaPush.js';

type SupabaseAdmin = any;
type PushPreferenceKey = 'sale_approved' | 'payment_failed' | 'lead_captured' | 'system_alerts';

interface SaleApprovedPushInput {
  supabaseAdmin: SupabaseAdmin;
  merchantUserId: string | null | undefined;
  orderId: string;
  customerName?: string | null;
  amount?: number | null;
  paymentMethod?: string | null;
  productNames?: string[];
}

interface PaymentFailedPushInput {
  supabaseAdmin: SupabaseAdmin;
  merchantUserId: string | null | undefined;
  orderId: string;
  customerName?: string | null;
  amount?: number | null;
  paymentMethod?: string | null;
  productNames?: string[];
  failureReason?: string | null;
}

interface ActivePushSubscriptionRecord {
  id: string;
  subscription_json?: unknown;
}

interface PushDispatchResult {
  skipped: string | null;
  sent: number;
  failed: number;
  revoked: number;
  total: number;
}

interface DispatchUserPushInput {
  supabaseAdmin: SupabaseAdmin;
  merchantUserId: string | null | undefined;
  preferenceKey: PushPreferenceKey;
  payload: Record<string, any>;
  ttl?: number;
}

const ADMIN_PUSH_SURFACE = 'admin';
const DEFAULT_PUSH_RESULT: PushDispatchResult = {
  skipped: null,
  sent: 0,
  failed: 0,
  revoked: 0,
  total: 0,
};
const PAYMENT_FAILED_SENT_AT_KEY = 'push_payment_failed_sent_at';

function normalizeText(value: unknown, maxLength: number) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maxLength) : '';
}

function normalizePreferences(value: unknown): PushPreferences {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};

  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULT_PUSH_PREFERENCES.enabled,
    sale_approved: typeof source.sale_approved === 'boolean' ? source.sale_approved : DEFAULT_PUSH_PREFERENCES.sale_approved,
    payment_failed: typeof source.payment_failed === 'boolean' ? source.payment_failed : DEFAULT_PUSH_PREFERENCES.payment_failed,
    lead_captured: typeof source.lead_captured === 'boolean' ? source.lead_captured : DEFAULT_PUSH_PREFERENCES.lead_captured,
    system_alerts: typeof source.system_alerts === 'boolean' ? source.system_alerts : DEFAULT_PUSH_PREFERENCES.system_alerts,
    updated_at: typeof source.updated_at === 'string' ? source.updated_at : null,
  };
}

function sanitizePushSubscription(value: unknown): PushSubscriptionJson | null {
  const subscription = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : null;

  const endpoint = normalizeText(subscription?.endpoint, 2048);
  const keys = subscription?.keys && typeof subscription.keys === 'object'
    ? subscription.keys as Record<string, unknown>
    : null;

  const p256dh = normalizeText(keys?.p256dh, 512);
  const auth = normalizeText(keys?.auth, 512);

  if (!endpoint || !p256dh || !auth) {
    return null;
  }

  const expirationTime = Number(subscription?.expirationTime);

  return {
    endpoint,
    expirationTime: Number.isFinite(expirationTime) ? expirationTime : null,
    keys: {
      p256dh,
      auth,
    },
  };
}

function formatCurrency(value: number | null | undefined) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return '';
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(normalized);
}

function getPaymentMethodLabel(paymentMethod: string | null | undefined) {
  const normalized = String(paymentMethod || '').trim().toLowerCase();

  switch (normalized) {
    case 'pix':
      return 'com Pix';
    case 'credit_card':
      return 'com Cartao';
    case 'boleto':
      return 'com Boleto';
    case 'apple_pay':
      return 'com Apple Pay';
    case 'google_pay':
      return 'com Google Pay';
    default:
      return '';
  }
}

function getPrimaryProductLabel(productNames?: string[]) {
  return normalizeText(productNames?.[0], 90) || 'Produto';
}

function buildOrderPushBody(parts: Array<string | null | undefined>, fallback: string) {
  return normalizeText(parts.filter(Boolean).join(' - '), 220) || fallback;
}

function buildOrderUrl(orderId: string) {
  return `/admin/orders?order=${encodeURIComponent(orderId)}&source=push`;
}

function buildSaleApprovedPayload(input: SaleApprovedPushInput) {
  const paymentMethodLabel = getPaymentMethodLabel(input.paymentMethod);
  const title = paymentMethodLabel
    ? `Venda aprovada ${paymentMethodLabel}`
    : 'Venda aprovada';
  const customerName = normalizeText(input.customerName, 60) || 'Cliente';
  const primaryProduct = getPrimaryProductLabel(input.productNames);
  const amountLabel = formatCurrency(input.amount);
  const orderUrl = buildOrderUrl(input.orderId);

  return {
    title,
    body: buildOrderPushBody(
      [customerName, primaryProduct, amountLabel],
      'Uma nova venda foi aprovada no painel.',
    ),
    tag: `sc-sale-approved:${input.orderId}`,
    icon: '/pwa-icon-192.png',
    badge: '/pwa-badge-monochrome.svg',
    renotify: true,
    requireInteraction: false,
    timestamp: Date.now(),
    data: {
      url: orderUrl,
      primaryAction: 'open',
      actionUrls: {
        open: orderUrl,
      },
      orderId: input.orderId,
      eventType: 'sale_approved',
    },
    actions: [
      {
        action: 'open',
        title: 'Abrir pedido',
      },
    ],
  };
}

function buildPaymentFailedPayload(input: PaymentFailedPushInput) {
  const paymentMethodLabel = getPaymentMethodLabel(input.paymentMethod);
  const title = paymentMethodLabel
    ? `Pagamento recusado ${paymentMethodLabel}`
    : 'Pagamento recusado';
  const customerName = normalizeText(input.customerName, 60) || 'Cliente';
  const primaryProduct = getPrimaryProductLabel(input.productNames);
  const amountLabel = formatCurrency(input.amount);
  const failureReason = normalizeText(input.failureReason, 90);
  const orderUrl = buildOrderUrl(input.orderId);

  return {
    title,
    body: buildOrderPushBody(
      [customerName, primaryProduct, amountLabel, failureReason],
      'Houve uma tentativa de pagamento recusada no checkout.',
    ),
    tag: `sc-payment-failed:${input.orderId}`,
    icon: '/pwa-icon-192.png',
    badge: '/pwa-badge-monochrome.svg',
    renotify: true,
    requireInteraction: true,
    timestamp: Date.now(),
    data: {
      url: orderUrl,
      primaryAction: 'open',
      actionUrls: {
        open: orderUrl,
      },
      orderId: input.orderId,
      eventType: 'payment_failed',
    },
    actions: [
      {
        action: 'open',
        title: 'Abrir pedido',
      },
    ],
  };
}

function isPreferenceEnabled(preferences: PushPreferences, key: PushPreferenceKey) {
  switch (key) {
    case 'sale_approved':
      return preferences.sale_approved;
    case 'payment_failed':
      return preferences.payment_failed;
    case 'lead_captured':
      return preferences.lead_captured;
    case 'system_alerts':
      return preferences.system_alerts;
    default:
      return false;
  }
}

async function loadUserPushPreferences(supabaseAdmin: SupabaseAdmin, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('push_notification_preferences')
    .select('enabled,sale_approved,payment_failed,lead_captured,system_alerts,updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return normalizePreferences(data);
}

async function loadActiveAdminPushSubscriptions(supabaseAdmin: SupabaseAdmin, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id,subscription_json')
    .eq('user_id', userId)
    .eq('surface_key', ADMIN_PUSH_SURFACE)
    .eq('permission_state', 'granted')
    .eq('is_active', true)
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data as ActivePushSubscriptionRecord[] : [];
}

async function sendPayloadToSubscriptions(input: {
  supabaseAdmin: SupabaseAdmin;
  subscriptions: ActivePushSubscriptionRecord[];
  payload: Record<string, any>;
  ttl?: number;
}): Promise<PushDispatchResult> {
  const now = new Date().toISOString();
  let sent = 0;
  let failed = 0;
  let revoked = 0;

  for (const subscriptionRecord of input.subscriptions) {
    const subscription = sanitizePushSubscription(subscriptionRecord.subscription_json);
    const basePatch = {
      last_delivery_tag: input.payload.tag,
      last_delivery_title: input.payload.title,
      last_delivery_body: input.payload.body,
      last_delivery_sw_version: null,
    };

    if (!subscription) {
      failed += 1;
      await input.supabaseAdmin
        .from('push_subscriptions')
        .update({
          ...basePatch,
          last_delivery_state: 'error',
          last_delivery_error: 'Invalid stored push subscription payload.',
        })
        .eq('id', subscriptionRecord.id);
      continue;
    }

    try {
      await sendPushNotification({
        subscription,
        payload: input.payload,
        ttl: input.ttl || 300,
      });

      sent += 1;
      await input.supabaseAdmin
        .from('push_subscriptions')
        .update({
          ...basePatch,
          last_delivery_state: 'sent',
          last_delivery_error: null,
        })
        .eq('id', subscriptionRecord.id);
    } catch (error: any) {
      const statusCode = Number(error?.statusCode || error?.status || 0);
      const normalizedError = normalizeText(error?.body || error?.message || error, 220) || 'Push send failed.';

      if (statusCode === 404 || statusCode === 410) {
        revoked += 1;
        await input.supabaseAdmin
          .from('push_subscriptions')
          .update({
            ...basePatch,
            is_active: false,
            permission_state: 'revoked',
            revoked_at: now,
            last_delivery_state: 'revoked',
            last_delivery_error: normalizedError,
          })
          .eq('id', subscriptionRecord.id);
        continue;
      }

      failed += 1;
      await input.supabaseAdmin
        .from('push_subscriptions')
        .update({
          ...basePatch,
          last_delivery_state: 'error',
          last_delivery_error: normalizedError,
        })
        .eq('id', subscriptionRecord.id);
    }
  }

  return {
    skipped: null,
    sent,
    failed,
    revoked,
    total: input.subscriptions.length,
  };
}

async function dispatchUserPush(input: DispatchUserPushInput): Promise<PushDispatchResult> {
  const merchantUserId = normalizeText(input.merchantUserId, 120);
  if (!merchantUserId) {
    return { ...DEFAULT_PUSH_RESULT, skipped: 'missing_user_id' };
  }

  const pushConfig = getPushServerConfig();
  if (!pushConfig.isConfigured) {
    return { ...DEFAULT_PUSH_RESULT, skipped: 'push_not_configured' };
  }

  const preferences = await loadUserPushPreferences(input.supabaseAdmin, merchantUserId);
  if (!preferences.enabled || !isPreferenceEnabled(preferences, input.preferenceKey)) {
    return { ...DEFAULT_PUSH_RESULT, skipped: 'preference_disabled' };
  }

  const subscriptions = await loadActiveAdminPushSubscriptions(input.supabaseAdmin, merchantUserId);
  if (subscriptions.length === 0) {
    return { ...DEFAULT_PUSH_RESULT, skipped: 'no_active_subscriptions' };
  }

  return sendPayloadToSubscriptions({
    supabaseAdmin: input.supabaseAdmin,
    subscriptions,
    payload: input.payload,
    ttl: input.ttl,
  });
}

export async function dispatchSaleApprovedPush(input: SaleApprovedPushInput) {
  return dispatchUserPush({
    supabaseAdmin: input.supabaseAdmin,
    merchantUserId: input.merchantUserId,
    preferenceKey: 'sale_approved',
    payload: buildSaleApprovedPayload(input),
    ttl: 300,
  });
}

export async function dispatchPaymentFailedPush(input: PaymentFailedPushInput) {
  try {
    const orderMetadata = await loadOrderMetadata(input.supabaseAdmin, input.orderId);
    if (normalizeText(orderMetadata[PAYMENT_FAILED_SENT_AT_KEY], 80)) {
      return { ...DEFAULT_PUSH_RESULT, skipped: 'already_sent' };
    }
  } catch (error: any) {
    console.warn('[pushAutomation] Failed to inspect order metadata before payment_failed push:', error?.message || error);
  }

  const result = await dispatchUserPush({
    supabaseAdmin: input.supabaseAdmin,
    merchantUserId: input.merchantUserId,
    preferenceKey: 'payment_failed',
    payload: buildPaymentFailedPayload(input),
    ttl: 300,
  });

  if (result.sent > 0) {
    try {
      await mergeOrderMetadata(input.supabaseAdmin, input.orderId, {
        [PAYMENT_FAILED_SENT_AT_KEY]: new Date().toISOString(),
      });
    } catch (error: any) {
      console.warn('[pushAutomation] Failed to persist payment_failed push marker:', error?.message || error);
    }
  }

  return result;
}

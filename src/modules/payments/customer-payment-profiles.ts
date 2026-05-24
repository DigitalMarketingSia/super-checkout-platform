import type { SupabaseClient } from '@supabase/supabase-js';
import { GatewayProvider, type PaymentMethodType } from '../../core/types.js';

const SUPPORTED_METHODS = new Set<PaymentMethodType>(['credit_card', 'apple_pay', 'google_pay']);

type ProfileResult =
  | { ok: true; created: boolean; id: string | null }
  | { ok: false; reason: string; error?: string };

export interface UpsertCustomerPaymentProfileInput {
  supabaseAdmin: SupabaseClient;
  userId?: string | null;
  gatewayId?: string | null;
  gatewayName?: string | null;
  customerUserId?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  paymentMethodType?: PaymentMethodType | null;
  gatewayCustomerId?: string | null;
  gatewayPaymentMethodId?: string | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
  cardExpMonth?: number | null;
  cardExpYear?: number | null;
  walletType?: 'apple_pay' | 'google_pay' | null;
  issuerId?: string | null;
  reusable?: boolean;
  requiresReauthentication?: boolean;
  consentScope?: string | null;
  consentCapturedAt?: string | null;
  firstOrderId?: string | null;
  lastOrderId?: string | null;
  metadata?: Record<string, unknown> | null;
}

function normalizeText(value: unknown, fallback = '') {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function normalizeEmail(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function normalizeGatewayName(value: unknown): GatewayProvider {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === GatewayProvider.STRIPE) return GatewayProvider.STRIPE;
  if (normalized === GatewayProvider.MERCADO_PAGO) return GatewayProvider.MERCADO_PAGO;
  return GatewayProvider.PIX;
}

function normalizePaymentMethodType(
  paymentMethodType: PaymentMethodType | null | undefined,
  walletType?: 'apple_pay' | 'google_pay' | null,
): PaymentMethodType {
  if (walletType === 'apple_pay' || walletType === 'google_pay') return walletType;
  if (paymentMethodType === 'credit_card' || paymentMethodType === 'apple_pay' || paymentMethodType === 'google_pay') {
    return paymentMethodType;
  }
  return 'credit_card';
}

function normalizePositiveInt(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function upsertCustomerPaymentProfile(input: UpsertCustomerPaymentProfileInput): Promise<ProfileResult> {
  const userId = normalizeText(input.userId);
  const gatewayId = normalizeText(input.gatewayId);
  const customerEmail = normalizeEmail(input.customerEmail);

  if (!userId || !gatewayId || !customerEmail) {
    return { ok: false, reason: 'missing_identity' };
  }

  const paymentMethodType = normalizePaymentMethodType(input.paymentMethodType, input.walletType);
  if (!SUPPORTED_METHODS.has(paymentMethodType)) {
    return { ok: false, reason: 'unsupported_payment_method' };
  }

  const now = new Date().toISOString();
  const key = {
    user_id: userId,
    gateway_id: gatewayId,
    customer_email: customerEmail,
    gateway_customer_id: normalizeText(input.gatewayCustomerId),
    gateway_payment_method_id: normalizeText(input.gatewayPaymentMethodId),
    payment_method_type: paymentMethodType,
    card_last4: normalizeText(input.cardLast4),
  };

  const metadata = isPlainObject(input.metadata) ? input.metadata : {};

  const baseRecord = {
    ...key,
    gateway_name: normalizeGatewayName(input.gatewayName),
    customer_user_id: normalizeText(input.customerUserId) || null,
    customer_name: normalizeText(input.customerName) || null,
    card_brand: normalizeText(input.cardBrand) || null,
    card_exp_month: normalizePositiveInt(input.cardExpMonth),
    card_exp_year: normalizePositiveInt(input.cardExpYear),
    wallet_type: input.walletType || null,
    issuer_id: normalizeText(input.issuerId) || null,
    reusable: Boolean(input.reusable),
    requires_reauthentication: input.requiresReauthentication ?? true,
    consent_scope: normalizeText(input.consentScope, 'post_purchase_upsell'),
    consent_captured_at: normalizeText(input.consentCapturedAt) || now,
    last_order_id: normalizeText(input.lastOrderId) || null,
    last_seen_at: now,
    metadata,
  };

  const { data: existing, error: existingError } = await input.supabaseAdmin
    .from('customer_payment_profiles')
    .select('id, first_order_id, metadata, consent_captured_at, customer_user_id, customer_name')
    .match(key)
    .maybeSingle();

  if (existingError) {
    return { ok: false, reason: 'lookup_failed', error: existingError.message };
  }

  if (existing?.id) {
    const mergedMetadata = {
      ...(isPlainObject(existing.metadata) ? existing.metadata : {}),
      ...metadata,
    };

    const { error: updateError } = await input.supabaseAdmin
      .from('customer_payment_profiles')
      .update({
        ...baseRecord,
        customer_user_id: existing.customer_user_id || baseRecord.customer_user_id,
        customer_name: existing.customer_name || baseRecord.customer_name,
        metadata: mergedMetadata,
        first_order_id: existing.first_order_id || normalizeText(input.firstOrderId) || null,
        consent_captured_at: existing.consent_captured_at || baseRecord.consent_captured_at,
      })
      .eq('id', existing.id);

    if (updateError) {
      return { ok: false, reason: 'update_failed', error: updateError.message };
    }

    return { ok: true, created: false, id: existing.id };
  }

  const { data: created, error: insertError } = await input.supabaseAdmin
    .from('customer_payment_profiles')
    .insert({
      ...baseRecord,
      first_order_id: normalizeText(input.firstOrderId) || null,
    })
    .select('id')
    .maybeSingle();

  if (insertError) {
    return { ok: false, reason: 'insert_failed', error: insertError.message };
  }

  return { ok: true, created: true, id: created?.id || null };
}

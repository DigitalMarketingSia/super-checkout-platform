import { GatewayProvider, type PaymentMethodType, type UpsellExperienceMode } from '../types';

type UpsellPaymentMethod = PaymentMethodType | 'unknown';
type UpsellGatewayName = GatewayProvider | 'unknown';

export type UpsellOfferStrategy =
  | 'one_click_charge'
  | 'saved_method_reconfirm'
  | 'new_card_capture'
  | 'pix_reoffer'
  | 'defer_offer';

export interface UpsellSavedProfileSummary {
  brand?: string | null;
  last4?: string | null;
  exp_month?: number | null;
  exp_year?: number | null;
  wallet_type?: 'apple_pay' | 'google_pay' | null;
  gateway_payment_method_id?: string | null;
}

export interface UpsellGatewayCapability {
  gateway: UpsellGatewayName;
  original_payment_method: UpsellPaymentMethod;
  supports_saved_method: boolean;
  supports_off_session_charge: boolean;
  requires_step_up: boolean;
  supports_pix: boolean;
  supports_wallet_reuse: boolean;
  has_saved_profile: boolean;
  reusable_profile_available: boolean;
  should_offer_immediately: boolean;
  requires_payment_form: boolean;
  strategy: UpsellOfferStrategy;
  saved_profile?: UpsellSavedProfileSummary | null;
  mode: UpsellExperienceMode;
}

const WALLET_METHODS = new Set(['apple_pay', 'google_pay']);

function normalizeGatewayName(value: string | null | undefined): UpsellGatewayName {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === GatewayProvider.STRIPE) return GatewayProvider.STRIPE;
  if (normalized === GatewayProvider.MERCADO_PAGO) return GatewayProvider.MERCADO_PAGO;
  if (normalized === GatewayProvider.PIX) return GatewayProvider.PIX;
  return 'unknown';
}

function normalizePaymentMethod(value: string | null | undefined): UpsellPaymentMethod {
  const normalized = String(value || '').trim().toLowerCase();
  if (
    normalized === 'credit_card'
    || normalized === 'pix'
    || normalized === 'boleto'
    || normalized === 'apple_pay'
    || normalized === 'google_pay'
  ) {
    return normalized as UpsellPaymentMethod;
  }

  return 'unknown';
}

export function resolveUpsellGatewayCapability(params: {
  gatewayName?: string | null;
  paymentMethod?: string | null;
  hasSavedProfile?: boolean;
  reusableProfile?: boolean;
  requiresReauthentication?: boolean;
  savedProfile?: UpsellSavedProfileSummary | null;
  allowPixImmediate?: boolean;
}): UpsellGatewayCapability {
  const gateway = normalizeGatewayName(params.gatewayName);
  const original_payment_method = normalizePaymentMethod(params.paymentMethod);
  const has_saved_profile = Boolean(params.hasSavedProfile);
  const reusable_profile_available = has_saved_profile && Boolean(params.reusableProfile);
  const requires_step_up = params.requiresReauthentication ?? false;
  const supports_pix = original_payment_method === 'pix';
  const allow_pix_immediate = params.allowPixImmediate ?? true;

  const baseCapability: UpsellGatewayCapability = {
    gateway,
    original_payment_method,
    supports_saved_method: has_saved_profile,
    supports_off_session_charge: false,
    requires_step_up,
    supports_pix,
    supports_wallet_reuse: false,
    has_saved_profile,
    reusable_profile_available,
    should_offer_immediately: true,
    requires_payment_form: true,
    strategy: 'new_card_capture',
    saved_profile: params.savedProfile || null,
    mode: 'repayment_explicit',
  };

  if (original_payment_method === 'boleto' || original_payment_method === 'unknown') {
    return {
      ...baseCapability,
      should_offer_immediately: false,
      requires_payment_form: false,
      strategy: 'defer_offer',
      mode: 'not_immediate',
    };
  }

  if (original_payment_method === 'pix') {
    return {
      ...baseCapability,
      should_offer_immediately: allow_pix_immediate,
      requires_payment_form: false,
      strategy: allow_pix_immediate ? 'pix_reoffer' : 'defer_offer',
      mode: allow_pix_immediate ? 'repayment_explicit' : 'not_immediate',
    };
  }

  if (reusable_profile_available) {
    return {
      ...baseCapability,
      supports_saved_method: true,
      supports_off_session_charge: gateway === GatewayProvider.STRIPE,
      supports_wallet_reuse: original_payment_method === 'apple_pay' || original_payment_method === 'google_pay',
      requires_payment_form: false,
      strategy: requires_step_up ? 'saved_method_reconfirm' : 'one_click_charge',
      mode: requires_step_up ? 'light_confirmation' : 'one_click',
    };
  }

  if (has_saved_profile) {
    return {
      ...baseCapability,
      supports_saved_method: true,
      supports_wallet_reuse: original_payment_method === 'apple_pay' || original_payment_method === 'google_pay',
      requires_step_up: true,
      strategy: 'saved_method_reconfirm',
      mode: 'light_confirmation',
    };
  }

  if (WALLET_METHODS.has(original_payment_method)) {
    return {
      ...baseCapability,
      requires_step_up: true,
      strategy: 'saved_method_reconfirm',
      mode: 'light_confirmation',
    };
  }

  switch (gateway) {
    case GatewayProvider.STRIPE:
      return {
        ...baseCapability,
        requires_step_up: true,
        strategy: 'new_card_capture',
        mode: 'repayment_explicit',
      };
    case GatewayProvider.MERCADO_PAGO:
      return {
        ...baseCapability,
        strategy: 'new_card_capture',
        mode: 'repayment_explicit',
      };
    case GatewayProvider.PIX:
      return {
        ...baseCapability,
        supports_pix: true,
        requires_payment_form: false,
        strategy: allow_pix_immediate ? 'pix_reoffer' : 'defer_offer',
        should_offer_immediately: allow_pix_immediate,
        mode: allow_pix_immediate ? 'repayment_explicit' : 'not_immediate',
      };
    default:
      return {
        ...baseCapability,
        strategy: 'new_card_capture',
        mode: 'repayment_explicit',
      };
  }
}

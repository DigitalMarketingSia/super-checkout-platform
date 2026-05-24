import { GatewayProvider, type Order, type UpsellExperienceMode } from '../types';

type UpsellPaymentMethod = Order['payment_method'] | 'unknown';
type UpsellGatewayName = GatewayProvider | 'unknown';

export interface UpsellGatewayCapability {
  gateway: UpsellGatewayName;
  original_payment_method: UpsellPaymentMethod;
  supports_saved_method: boolean;
  supports_off_session_charge: boolean;
  requires_step_up: boolean;
  supports_pix: boolean;
  supports_wallet_reuse: boolean;
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
}): UpsellGatewayCapability {
  const gateway = normalizeGatewayName(params.gatewayName);
  const original_payment_method = normalizePaymentMethod(params.paymentMethod);

  const baseCapability: UpsellGatewayCapability = {
    gateway,
    original_payment_method,
    supports_saved_method: false,
    supports_off_session_charge: false,
    requires_step_up: false,
    supports_pix: original_payment_method === 'pix',
    supports_wallet_reuse: false,
    mode: 'repayment_explicit',
  };

  if (original_payment_method === 'pix') {
    return {
      ...baseCapability,
      mode: 'repayment_explicit',
    };
  }

  if (WALLET_METHODS.has(original_payment_method)) {
    return {
      ...baseCapability,
      requires_step_up: true,
      mode: 'repayment_explicit',
    };
  }

  switch (gateway) {
    case GatewayProvider.STRIPE:
      return {
        ...baseCapability,
        requires_step_up: true,
        mode: 'repayment_explicit',
      };
    case GatewayProvider.MERCADO_PAGO:
      return {
        ...baseCapability,
        mode: 'repayment_explicit',
      };
    case GatewayProvider.PIX:
      return {
        ...baseCapability,
        supports_pix: true,
        mode: 'repayment_explicit',
      };
    default:
      return {
        ...baseCapability,
        mode: 'repayment_explicit',
      };
  }
}

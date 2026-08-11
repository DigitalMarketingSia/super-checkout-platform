import {
  buildCentralControlPlaneTrustHeaders,
  getCentralControlPlaneHmacKey,
} from '../api/_central-control-plane-trust.js';
import {
  buildCentralInstallationTrustHeaders,
  getCentralInstallationTrustConfig,
} from '../api/_central-installation-trust.js';

const OFFICIAL_CENTRAL_API_URL = 'https://bcmnryxjweiovrwmztpn.supabase.co/functions/v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PaidServiceOrderInput = {
  sourceOrderId: string;
  originInstallationId?: string | null;
  externalBeneficiaryUserId?: string | null;
  beneficiaryEmail: string;
  beneficiaryName?: string | null;
  externalSellerUserId?: string | null;
  productId: string;
  productName: string;
  serviceType: string;
  price: number;
  currency?: string | null;
  paidAt?: string | null;
  deduplicationKey: string;
};

export type PaidServiceOrderResult = {
  serviceOrderId: string;
  status: string;
  created: boolean;
  beneficiaryBound: boolean;
};

function resolveCentralApiUrl() {
  return String(
    process.env.CENTRAL_API_URL
    || process.env.VITE_CENTRAL_API_URL
    || process.env.NEXT_PUBLIC_CENTRAL_API_URL
    || OFFICIAL_CENTRAL_API_URL,
  ).replace(/\/+$/, '');
}

export async function upsertPaidCentralServiceOrder(
  input: PaidServiceOrderInput,
): Promise<PaidServiceOrderResult> {
  const controlPlaneHmacKey = getCentralControlPlaneHmacKey();
  const installationTrust = controlPlaneHmacKey ? null : getCentralInstallationTrustConfig();
  if (!controlPlaneHmacKey && !installationTrust) {
    throw new Error('Missing private Central trust credential for service-order creation.');
  }

  const rawBody = JSON.stringify({
    action: 'upsert_paid_service_order',
    service_order: {
      source_order_id: input.sourceOrderId,
      origin_installation_id: input.originInstallationId || null,
      external_beneficiary_user_id: input.externalBeneficiaryUserId || null,
      beneficiary_email: input.beneficiaryEmail,
      beneficiary_name: input.beneficiaryName || null,
      external_seller_user_id: input.externalSellerUserId || null,
      product_id: input.productId,
      product_name: input.productName,
      service_type: input.serviceType,
      price: input.price,
      currency: input.currency || 'BRL',
      paid_at: input.paidAt || null,
      deduplication_key: input.deduplicationKey,
    },
  });
  const trustHeaders = controlPlaneHmacKey
    ? buildCentralControlPlaneTrustHeaders({
      key: controlPlaneHmacKey,
      method: 'POST',
      endpoint: 'service-orders',
      rawBody,
    })
    : buildCentralInstallationTrustHeaders({
      config: installationTrust!,
      method: 'POST',
      endpoint: 'service-orders',
      rawBody,
    });

  let response: Response;
  try {
    response = await fetch(`${resolveCentralApiUrl()}/service-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...trustHeaders },
      body: rawBody,
    });
  } catch {
    throw new Error('Central service-order endpoint is unreachable.');
  }

  const responseText = await response.text();
  let payload: any = {};
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    // The HTTP status below remains the safe error surface.
  }

  if (!response.ok || payload?.success !== true) {
    throw new Error('Central service order could not be created.');
  }

  const serviceOrderId = String(payload.service_order_id || '').trim();
  if (!UUID_PATTERN.test(serviceOrderId)) {
    throw new Error('Central service-order response is invalid.');
  }

  return {
    serviceOrderId,
    status: String(payload.status || '').trim() || 'paid',
    created: payload.created === true,
    beneficiaryBound: payload.beneficiary_bound === true,
  };
}

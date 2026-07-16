function safeString(value: unknown, maxLength = 240) {
  if (value === null || value === undefined) return null;
  return String(value).slice(0, maxLength);
}

function safeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizePixImageValue(value: unknown) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return normalized.slice(0, 200000);
}

export function detectAsaasApiKeyEnvironment(value?: string | null) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (normalized.startsWith('$aact_hmlg_')) return 'sandbox';
  if (normalized.startsWith('$aact_prod_')) return 'production';
  return null;
}

export function getAsaasApiBaseUrl(isSandbox?: boolean) {
  return isSandbox ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';
}

export function mapAsaasStatusToLocal(
  status: string,
  billingType?: string,
  options?: { sandbox?: boolean | null },
) {
  const normalizedStatus = String(status || '').trim().toUpperCase();
  const normalizedBillingType = String(billingType || '').trim().toUpperCase();
  const isSandbox = options?.sandbox === true;

  switch (normalizedStatus) {
    case 'RECEIVED':
    case 'RECEIVED_IN_CASH':
      return 'paid';
    case 'CONFIRMED':
      if (normalizedBillingType === 'PIX') {
        return isSandbox ? 'paid' : 'pending';
      }
      return 'paid';
    case 'REFUNDED':
    case 'REFUND_REQUESTED':
    case 'REFUND_IN_PROGRESS':
    case 'CHARGEBACK_REQUESTED':
    case 'CHARGEBACK_DISPUTE':
    case 'AWAITING_CHARGEBACK_REVERSAL':
      return 'refunded';
    case 'CANCELED':
      return 'canceled';
    case 'PENDING':
    case 'AWAITING_RISK_ANALYSIS':
    case 'OVERDUE':
    case 'DUNNING_REQUESTED':
    case 'DUNNING_RECEIVED':
    default:
      return 'pending';
  }
}

export function buildSafeAsaasRawResponse(paymentData: any, pixData?: any) {
  const qrCode = safeString(
    pixData?.payload
      || paymentData?.qrCode?.payload
      || paymentData?.pixTransaction?.qrCode?.payload
      || paymentData?.qr_code,
    4096,
  );
  const qrCodeBase64 = normalizePixImageValue(
    pixData?.encodedImage
      || paymentData?.qrCode?.encodedImage
      || paymentData?.pixTransaction?.qrCode?.encodedImage
      || paymentData?.qr_code_base64,
  );

  return JSON.stringify({
    redacted: true,
    provider: 'asaas',
    id: safeString(paymentData?.id),
    status: safeString(paymentData?.status),
    billingType: safeString(paymentData?.billingType),
    value: safeNumber(paymentData?.value),
    totalValue: safeNumber(paymentData?.totalValue),
    installmentCount: safeNumber(paymentData?.installmentCount),
    invoiceUrl: safeString(paymentData?.invoiceUrl, 2000),
    bankSlipUrl: safeString(paymentData?.bankSlipUrl, 2000),
    identificationField: safeString(paymentData?.identificationField, 256),
    externalReference: safeString(paymentData?.externalReference),
    dueDate: safeString(paymentData?.dueDate),
    point_of_interaction: qrCode || qrCodeBase64
      ? {
          transaction_data: {
            qr_code: qrCode,
            qr_code_base64: qrCodeBase64,
          },
        }
      : undefined,
    captured_at: new Date().toISOString(),
  });
}

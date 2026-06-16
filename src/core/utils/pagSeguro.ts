import { GatewayProvider } from '../types.js';

export type PagSeguroEnvironment = 'production' | 'sandbox';

type PagSeguroGatewayLike = {
  name?: string | null;
  config?: Record<string, any> | null;
} | null | undefined;

export function isPagSeguroGatewayName(value: unknown): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === GatewayProvider.PAGSEGURO || normalized === 'pagbank';
}

export function isPagSeguroGateway(gateway?: PagSeguroGatewayLike): boolean {
  return isPagSeguroGatewayName(gateway?.name);
}

export function resolvePagSeguroEnvironment(gateway?: PagSeguroGatewayLike): PagSeguroEnvironment {
  const normalized = String(gateway?.config?.environment || gateway?.config?.env || '')
    .trim()
    .toLowerCase();
  return normalized === 'sandbox' ? 'sandbox' : 'production';
}

export function getPagSeguroApiBaseUrl(gateway?: PagSeguroGatewayLike): string {
  return resolvePagSeguroEnvironment(gateway) === 'sandbox'
    ? 'https://sandbox.api.pagseguro.com'
    : 'https://api.pagseguro.com';
}

export function getPagSeguroCharge(orderData: any) {
  const charges = Array.isArray(orderData?.charges) ? orderData.charges : [];
  return charges[0] || null;
}

export function getPagSeguroQrCode(orderData: any) {
  const topLevelQrCodes = Array.isArray(orderData?.qr_codes) ? orderData.qr_codes : [];
  if (topLevelQrCodes[0]) return topLevelQrCodes[0];

  const charge = getPagSeguroCharge(orderData);
  const nestedQrCodes = Array.isArray(charge?.payment_method?.pix?.qr_codes)
    ? charge.payment_method.pix.qr_codes
    : [];
  return nestedQrCodes[0] || null;
}

export function getPagSeguroQrCodeText(orderData: any): string {
  const qrCode = getPagSeguroQrCode(orderData);
  return String(qrCode?.text || qrCode?.amount?.text || '').trim();
}

export function getPagSeguroQrCodeImageUrl(orderData: any): string {
  const qrCode = getPagSeguroQrCode(orderData);
  const links = Array.isArray(qrCode?.links) ? qrCode.links : [];
  const imageLink = links.find((link: any) => {
    const media = String(link?.media || '').toLowerCase();
    const href = String(link?.href || '').trim();
    return media.includes('image/png') || href.endsWith('.png');
  });
  return String(imageLink?.href || '').trim();
}

export function getPagSeguroStatus(orderData: any): string {
  const chargeStatus = String(getPagSeguroCharge(orderData)?.status || '').trim().toUpperCase();
  if (chargeStatus) return chargeStatus;
  return String(orderData?.status || '').trim().toUpperCase();
}

export function mapPagSeguroStatusToLocal(status: string): 'pending' | 'paid' | 'failed' | 'refunded' | 'canceled' {
  switch (String(status || '').trim().toUpperCase()) {
    case 'PAID':
      return 'paid';
    case 'DECLINED':
      return 'failed';
    case 'CANCELED':
      return 'canceled';
    case 'REFUNDED':
      return 'refunded';
    case 'AUTHORIZED':
    case 'IN_ANALYSIS':
    case 'WAITING':
    default:
      return 'pending';
  }
}

function safeString(value: unknown, maxLength = 240) {
  if (value === null || value === undefined) return null;
  return String(value).slice(0, maxLength);
}

function maskEmail(value: string) {
  const [name, domain] = String(value || '').split('@');
  if (!name || !domain) return safeString(value);
  return `${name.slice(0, 2)}***@${domain}`;
}

function maskTaxId(value: string) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length <= 4) return `***${digits}`;
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function sanitizePagSeguroLogValue(value: any, keyPath: string[] = [], maskSensitiveFields: boolean = true): any {
  if (!maskSensitiveFields) {
    if (Array.isArray(value)) {
      return value.map((item) => sanitizePagSeguroLogValue(item, keyPath, false));
    }

    if (value && typeof value === 'object') {
      const output: Record<string, any> = {};
      for (const [key, entry] of Object.entries(value)) {
        output[key] = sanitizePagSeguroLogValue(entry, [...keyPath, key], false);
      }
      return output;
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizePagSeguroLogValue(item, [...keyPath, String(index)], true));
  }

  if (value && typeof value === 'object') {
    const output: Record<string, any> = {};
    for (const [key, entry] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase();
      const nextPath = [...keyPath, key];

      if (normalizedKey === 'encrypted') {
        output[key] = '[REDACTED_ENCRYPTED_CARD]';
        continue;
      }

      if (normalizedKey === 'authorization' || normalizedKey === 'access_token' || normalizedKey === 'refresh_token') {
        output[key] = '[REDACTED_SECRET]';
        continue;
      }

      if (normalizedKey === 'email') {
        output[key] = maskEmail(String(entry || ''));
        continue;
      }

      if (normalizedKey === 'tax_id') {
        output[key] = maskTaxId(String(entry || ''));
        continue;
      }

      if ((normalizedKey === 'number' || normalizedKey === 'security_code') && keyPath.includes('card')) {
        output[key] = '[REDACTED_CARD_DATA]';
        continue;
      }

      output[key] = sanitizePagSeguroLogValue(entry, nextPath, true);
    }
    return output;
  }

  return value;
}

type BuildSafePagSeguroRawResponseOptions = {
  environment?: string;
  requestBody?: Record<string, any> | null;
  requestHeaders?: Record<string, string> | null;
  responseStatus?: number | null;
  maskSensitiveFields?: boolean;
};

export function buildSafePagSeguroRawResponse(orderData: any, options?: BuildSafePagSeguroRawResponseOptions) {
  const charge = getPagSeguroCharge(orderData);
  const qrCodeText = getPagSeguroQrCodeText(orderData);
  const qrCodeImageUrl = getPagSeguroQrCodeImageUrl(orderData);
  const shouldMaskSensitiveFields = options?.maskSensitiveFields !== false;
  const sanitizedRequestBody = options?.requestBody
    ? sanitizePagSeguroLogValue(options.requestBody, [], shouldMaskSensitiveFields)
    : undefined;
  const sanitizedResponseBody = sanitizePagSeguroLogValue(orderData, [], shouldMaskSensitiveFields);
  const requestHeaders = options?.requestHeaders || undefined;

  return JSON.stringify({
    redacted: true,
    provider: 'pagseguro',
    environment: safeString(options?.environment || null),
    id: safeString(orderData?.id),
    reference_id: safeString(orderData?.reference_id),
    status: safeString(getPagSeguroStatus(orderData)),
    charge_id: safeString(charge?.id),
    charge_status: safeString(charge?.status),
    payment_method_type: safeString(charge?.payment_method?.type),
    qr_codes: qrCodeText || qrCodeImageUrl
      ? [{
          text: safeString(qrCodeText),
          image_url: safeString(qrCodeImageUrl),
        }]
      : undefined,
    request_headers: requestHeaders,
    request_body: sanitizedRequestBody,
    response_status: Number.isFinite(options?.responseStatus as number) ? Number(options?.responseStatus) : undefined,
    response_body: sanitizedResponseBody,
    captured_at: new Date().toISOString(),
  });
}

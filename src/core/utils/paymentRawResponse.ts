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

type PaymentRawResponseRecord = Record<string, any>;

function isRecord(value: unknown): value is PaymentRawResponseRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseStoredPaymentRawResponse(value: unknown): PaymentRawResponseRecord | null {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return isRecord(value) ? value : null;
}

function isTerminalPaymentStatus(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'paid'
    || normalized === 'failed'
    || normalized === 'canceled'
    || normalized === 'cancelled'
    || normalized === 'refunded';
}

function stripEmptyPaymentArtifacts(record: PaymentRawResponseRecord) {
  const transactionData = record?.point_of_interaction?.transaction_data;
  if (isRecord(transactionData) && Object.keys(transactionData).length === 0) {
    delete record.point_of_interaction.transaction_data;
  }

  if (isRecord(record?.point_of_interaction) && Object.keys(record.point_of_interaction).length === 0) {
    delete record.point_of_interaction;
  }

  if (isRecord(record?.transaction_details) && Object.keys(record.transaction_details).length === 0) {
    delete record.transaction_details;
  }
}

export function buildRetentionSafePaymentRawResponse(rawResponse: unknown, paymentStatus?: unknown) {
  const parsed = parseStoredPaymentRawResponse(rawResponse);
  const provider = safeString(parsed?.provider, 64);

  if (!parsed) {
    return {
      changed: false,
      provider,
      rawResponse: null,
    };
  }

  if (!isTerminalPaymentStatus(paymentStatus || parsed.status)) {
    return {
      changed: false,
      provider,
      rawResponse: JSON.stringify(parsed),
    };
  }

  const sanitized = JSON.parse(JSON.stringify(parsed)) as PaymentRawResponseRecord;
  let changed = false;
  const transactionData = sanitized?.point_of_interaction?.transaction_data;

  if (isRecord(transactionData)) {
    if (transactionData.qr_code) {
      delete transactionData.qr_code;
      changed = true;
    }
    if (transactionData.qr_code_base64) {
      delete transactionData.qr_code_base64;
      changed = true;
    }
  }

  if (isRecord(sanitized?.transaction_details) && sanitized.transaction_details.external_resource_url) {
    delete sanitized.transaction_details.external_resource_url;
    changed = true;
  }

  if (Array.isArray(sanitized.qr_codes) && sanitized.qr_codes.length > 0) {
    delete sanitized.qr_codes;
    changed = true;
  }

  for (const key of ['request_headers', 'request_body', 'response_body']) {
    if (Object.prototype.hasOwnProperty.call(sanitized, key)) {
      delete sanitized[key];
      changed = true;
    }
  }

  if (!changed) {
    return {
      changed: false,
      provider,
      rawResponse: JSON.stringify(parsed),
    };
  }

  sanitized.retention_anonymized_at = new Date().toISOString();
  sanitized.retention_scope = 'transient_payment_artifacts_removed';
  sanitized.retention_mode = 'anonymize';
  sanitized.retention_strategy = 'terminal_payment_artifacts_minimized';
  stripEmptyPaymentArtifacts(sanitized);

  return {
    changed: true,
    provider,
    rawResponse: JSON.stringify(sanitized),
  };
}

export function buildSafeMercadoPagoRawResponse(mpData: any) {
  const qrCode = safeString(mpData?.point_of_interaction?.transaction_data?.qr_code, 4096);
  const qrCodeBase64 = normalizePixImageValue(mpData?.point_of_interaction?.transaction_data?.qr_code_base64);
  const ticketUrl = safeString(mpData?.transaction_details?.external_resource_url, 2000);

  return JSON.stringify({
    redacted: true,
    provider: 'mercadopago',
    id: safeString(mpData?.id),
    status: safeString(mpData?.status),
    status_detail: safeString(mpData?.status_detail),
    external_reference: safeString(mpData?.external_reference),
    payment_type_id: safeString(mpData?.payment_type_id),
    payment_method_id: safeString(mpData?.payment_method_id),
    transaction_amount: safeNumber(mpData?.transaction_amount),
    currency_id: safeString(mpData?.currency_id),
    point_of_interaction: qrCode || qrCodeBase64
      ? {
          transaction_data: {
            qr_code: qrCode,
            qr_code_base64: qrCodeBase64,
          },
        }
      : undefined,
    transaction_details: ticketUrl
      ? {
          external_resource_url: ticketUrl,
        }
      : undefined,
    date_created: safeString(mpData?.date_created),
    date_approved: safeString(mpData?.date_approved),
    captured_at: new Date().toISOString(),
  });
}

export function buildSafeStripeRawResponse(stripeData: any) {
  return JSON.stringify({
    redacted: true,
    provider: 'stripe',
    id: safeString(stripeData?.id || stripeData?.paymentIntentId),
    status: safeString(stripeData?.status),
    amount: safeNumber(stripeData?.amount),
    currency: safeString(stripeData?.currency),
    payment_method: safeString(stripeData?.payment_method),
    payment_method_types: Array.isArray(stripeData?.payment_method_types)
      ? stripeData.payment_method_types.map((entry: unknown) => safeString(entry, 64)).filter(Boolean)
      : undefined,
    status_detail: safeString(
      stripeData?.last_payment_error?.message
      || stripeData?.lastPaymentError
      || stripeData?.decline_code,
      500,
    ),
    captured_at: new Date().toISOString(),
  });
}

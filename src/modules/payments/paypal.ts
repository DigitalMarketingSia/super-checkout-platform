import crypto from 'crypto';
import { decrypt, generateSignature } from '../../core/utils/cryptoUtils.js';
import {
  getLocalSupabaseServerKeyErrorMessage,
  resolveLocalSupabaseServerClient,
} from '../../core/api/_supabase-server.js';
import { securityService } from '../../core/services/securityService.js';
import { fulfillOrder } from '../../core/services/fulfillment.js';
import { sendOrderAccessEmail } from '../../core/services/orderEmail.js';
import { dispatchPaymentFailedPush } from '../../core/services/pushAutomation.js';
import { mergeOrderMetadata, normalizeOrderMetadata } from '../../core/services/orderMetadata.js';
import {
  PaymentSecurityError,
  getMainProductForCheckout,
  getServerCurrency,
  loadCheckoutForPayment,
  loadOwnedActiveGateway,
  loadOwnedOrderForCheckoutWithMerchant,
  loadValidCheckoutBumps,
  resolveCheckoutMerchantUserId,
} from './payment-security.js';

type PayPalEnvironment = 'sandbox' | 'production';

type PayPalCreateOrderPayload = {
  checkoutId: string;
  orderId: string;
  gatewayId: string;
  paymentMethod: 'paypal';
  selectedBumpIds?: string[];
  ip: string;
};

type PayPalCaptureOrderPayload = {
  checkoutId: string;
  orderId: string;
  gatewayId: string;
  paypalOrderId: string;
  ip: string;
  baseUrl?: string;
};

type PayPalGatewayCredentials = {
  clientId: string;
  clientSecret: string;
  webhookId: string;
  environment: PayPalEnvironment;
};

const PAYPAL_API_BASE_URL: Record<PayPalEnvironment, string> = {
  sandbox: 'https://api-m.sandbox.paypal.com',
  production: 'https://api-m.paypal.com',
};

const PAYPAL_ALLOWED_WEBHOOK_EVENTS = new Set([
  'PAYMENT.CAPTURE.COMPLETED',
  'PAYMENT.CAPTURE.PENDING',
  'PAYMENT.CAPTURE.DENIED',
  'PAYMENT.CAPTURE.REFUNDED',
  'PAYMENT.CAPTURE.REVERSED',
]);

function getPayPalEnvironment(gateway: any): PayPalEnvironment {
  return gateway?.config?.environment === 'sandbox' ? 'sandbox' : 'production';
}

function normalizeProviderId(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 256) : '';
}

function toPayPalAmount(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new PaymentSecurityError('ORDER_TOTAL_INVALID', 'Nao foi possivel calcular o valor do pedido.');
  }

  return value.toFixed(2);
}

function toSafePayPalRawResponse(payload: any) {
  const capture = payload?.purchase_units?.[0]?.payments?.captures?.[0] || null;
  return JSON.stringify({
    redacted: true,
    provider: 'paypal',
    order_id: normalizeProviderId(payload?.id),
    capture_id: normalizeProviderId(capture?.id),
    status: String(payload?.status || '').trim().slice(0, 64) || null,
    capture_status: String(capture?.status || '').trim().slice(0, 64) || null,
    captured_at: new Date().toISOString(),
  });
}

function resolveCanonicalOrderDetails(params: {
  mainProduct: any;
  selectedBumps: any[];
}) {
  const items = [
    {
      id: params.mainProduct.id,
      product_id: params.mainProduct.id,
      name: params.mainProduct.name,
      price: Number(params.mainProduct.price_real || 0),
      quantity: 1,
      type: 'main',
    },
    ...params.selectedBumps.map((bump: any) => ({
      id: bump.id,
      product_id: bump.id,
      name: bump.name,
      price: Number(bump.price_real || 0),
      quantity: 1,
      type: 'bump',
    })),
  ];

  const total = items.reduce((sum, item) => sum + (Number(item.price || 0) * Math.max(1, Number(item.quantity || 1))), 0);
  return { items, total };
}

function getPayPalCredentials(gateway: any): PayPalGatewayCredentials {
  const clientId = String(gateway?.public_key || '').trim();
  const clientSecret = decrypt(String(gateway?.private_key || '')).trim();
  const webhookId = decrypt(String(gateway?.webhook_secret || '')).trim();

  if (!clientId || !clientSecret) {
    throw new PaymentSecurityError('GATEWAY_CREDENTIALS_MISSING', 'Credenciais do PayPal nao configuradas.');
  }

  return {
    clientId,
    clientSecret,
    webhookId,
    environment: getPayPalEnvironment(gateway),
  };
}

async function fetchPayPalAccessToken(credentials: PayPalGatewayCredentials) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${PAYPAL_API_BASE_URL[credentials.environment]}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en_US',
        Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    const accessToken = String(payload?.access_token || '').trim();

    if (!response.ok || !accessToken) {
      throw new Error('PAYPAL_AUTH_FAILED');
    }

    return accessToken;
  } finally {
    clearTimeout(timeout);
  }
}

async function callPayPalJson(params: {
  credentials: PayPalGatewayCredentials;
  accessToken: string;
  path: string;
  method: 'POST' | 'GET';
  idempotencyKey?: string;
  body?: Record<string, any>;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(`${PAYPAL_API_BASE_URL[params.credentials.environment]}${params.path}`, {
      method: params.method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${params.accessToken}`,
        ...(params.body ? { 'Content-Type': 'application/json' } : {}),
        ...(params.idempotencyKey ? { 'PayPal-Request-Id': params.idempotencyKey } : {}),
      },
      ...(params.body ? { body: JSON.stringify(params.body) } : {}),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload) {
      throw new Error(`PAYPAL_API_FAILED_${response.status}`);
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function upsertServerPaymentRecord(params: {
  supabaseAdmin: any;
  gatewayId: string;
  merchantUserId: string;
  orderId: string;
  status: string;
  transactionId: string;
  rawResponse: string;
}) {
  const { data: existingPayment } = await params.supabaseAdmin
    .from('payments')
    .select('id')
    .eq('order_id', params.orderId)
    .eq('gateway_id', params.gatewayId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const value = {
    status: params.status,
    transaction_id: params.transactionId,
    raw_response: params.rawResponse,
    user_id: params.merchantUserId,
  };

  if (existingPayment?.id) {
    await params.supabaseAdmin
      .from('payments')
      .update(value)
      .eq('id', existingPayment.id)
      .eq('order_id', params.orderId);
    return;
  }

  await params.supabaseAdmin.from('payments').insert({
    id: crypto.randomUUID(),
    order_id: params.orderId,
    gateway_id: params.gatewayId,
    ...value,
    created_at: new Date().toISOString(),
  });
}

async function loadPayPalPaymentContext(params: {
  supabaseAdmin: any;
  checkoutId: string;
  orderId: string;
  gatewayId: string;
}) {
  const checkout = await loadCheckoutForPayment(params.supabaseAdmin, params.checkoutId);
  const mainProduct = getMainProductForCheckout(checkout);
  const merchantUserId = resolveCheckoutMerchantUserId(checkout, mainProduct);
  const order = await loadOwnedOrderForCheckoutWithMerchant(
    params.supabaseAdmin,
    checkout,
    merchantUserId,
    params.orderId,
  );

  if (String(order.payment_method || '').trim() !== 'paypal') {
    throw new PaymentSecurityError('PAYMENT_METHOD_GATEWAY_FORBIDDEN', 'Invalid checkout configuration.');
  }

  const gateway = await loadOwnedActiveGateway(
    params.supabaseAdmin,
    merchantUserId,
    checkout,
    params.gatewayId,
    'paypal',
    'paypal',
  );

  return { checkout, mainProduct, merchantUserId, order, gateway };
}

export async function createPayPalOrder(payload: PayPalCreateOrderPayload) {
  const { checkoutId, orderId, gatewayId, paymentMethod, selectedBumpIds = [], ip } = payload;

  try {
    if (paymentMethod !== 'paypal') {
      throw new PaymentSecurityError('PAYMENT_METHOD_GATEWAY_FORBIDDEN', 'Invalid checkout configuration.');
    }

    const { supabase: supabaseAdmin, probeError } = await resolveLocalSupabaseServerClient();
    if (!supabaseAdmin) {
      console.error('[PayPal] Missing Supabase server credentials:', probeError);
      throw new Error(`SUPABASE_SERVER_KEY_INVALID: ${getLocalSupabaseServerKeyErrorMessage()}`);
    }

    if (await securityService.isRateLimited(ip)) {
      throw new Error('TOO_MANY_REQUESTS');
    }

    const context = await loadPayPalPaymentContext({ supabaseAdmin, checkoutId, orderId, gatewayId });
    const currency = getServerCurrency(context.checkout, context.mainProduct);
    const validBumps = await loadValidCheckoutBumps(
      supabaseAdmin,
      context.checkout,
      context.merchantUserId,
      selectedBumpIds,
    );
    const canonical = resolveCanonicalOrderDetails({ mainProduct: context.mainProduct, selectedBumps: validBumps });
    const metadata = normalizeOrderMetadata(context.order.metadata);
    const credentials = getPayPalCredentials(context.gateway);
    const savedPayPalOrderId = normalizeProviderId(metadata.paypal_order_id);

    if (savedPayPalOrderId && metadata.paypal_environment === credentials.environment) {
      return {
        success: true,
        paypalOrderId: savedPayPalOrderId,
        status: 'CREATED',
        localStatus: 'pending',
        statusSignature: generateSignature(orderId),
      };
    }

    const accessToken = await fetchPayPalAccessToken(credentials);
    const providerOrder = await callPayPalJson({
      credentials,
      accessToken,
      path: '/v2/checkout/orders',
      method: 'POST',
      idempotencyKey: `super-checkout:${orderId}:create`,
      body: {
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: orderId,
          custom_id: orderId,
          description: `Pedido ${orderId}`.slice(0, 127),
          amount: {
            currency_code: currency,
            value: toPayPalAmount(canonical.total),
          },
        }],
      },
    });
    const paypalOrderId = normalizeProviderId(providerOrder?.id);

    if (!paypalOrderId) {
      throw new Error('PAYPAL_ORDER_ID_MISSING');
    }

    await supabaseAdmin
      .from('orders')
      .update({
        status: 'pending',
        payment_id: paypalOrderId,
        total: Number(canonical.total.toFixed(2)),
        items: canonical.items,
      })
      .eq('id', orderId)
      .eq('checkout_id', context.checkout.id)
      .eq('user_id', context.merchantUserId);
    await mergeOrderMetadata(supabaseAdmin, orderId, {
      paypal_order_id: paypalOrderId,
      paypal_environment: credentials.environment,
      paypal_order_created_at: new Date().toISOString(),
    });
    await upsertServerPaymentRecord({
      supabaseAdmin,
      gatewayId: context.gateway.id,
      merchantUserId: context.merchantUserId,
      orderId,
      status: 'pending',
      transactionId: paypalOrderId,
      rawResponse: toSafePayPalRawResponse(providerOrder),
    });

    return {
      success: true,
      paypalOrderId,
      status: String(providerOrder?.status || 'CREATED').toUpperCase(),
      localStatus: 'pending',
      statusSignature: generateSignature(orderId),
    };
  } catch (error: any) {
    const isSecurityError = error instanceof PaymentSecurityError;
    const code = isSecurityError ? error.code : 'PAYPAL_CREATE_ORDER_FAILED';
    console.error('[PayPal] Create order failed:', { orderId, code, message: error?.message || error });
    return {
      success: false,
      code,
      error: isSecurityError
        ? error.publicMessage
        : 'Nao foi possivel preparar o pagamento via PayPal. Tente novamente.',
    };
  }
}

function mapPayPalStatus(status: unknown) {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'COMPLETED') return 'paid';
  if (normalized === 'PENDING') return 'pending';
  if (normalized === 'REFUNDED') return 'refunded';
  if (normalized === 'REVERSED') return 'canceled';
  if (normalized === 'DENIED' || normalized === 'DECLINED' || normalized === 'FAILED') return 'failed';
  return 'pending';
}

function getCaptureStatus(providerOrder: any) {
  const capture = providerOrder?.purchase_units?.[0]?.payments?.captures?.[0] || null;
  return String(capture?.status || providerOrder?.status || '').trim().toUpperCase();
}

function getCaptureId(providerOrder: any) {
  return normalizeProviderId(providerOrder?.purchase_units?.[0]?.payments?.captures?.[0]?.id);
}

function assertCapturedAmountMatchesOrder(providerOrder: any, expectedTotal: unknown, expectedCurrency: unknown) {
  const capture = providerOrder?.purchase_units?.[0]?.payments?.captures?.[0] || null;
  const capturedValue = Number(capture?.amount?.value);
  const capturedCurrency = String(capture?.amount?.currency_code || '').trim().toUpperCase();
  const canonicalTotal = Number(expectedTotal);
  const canonicalCurrency = String(expectedCurrency || '').trim().toUpperCase();

  if (!Number.isFinite(capturedValue) || !Number.isFinite(canonicalTotal)
    || Math.abs(capturedValue - canonicalTotal) > 0.0001
    || !capturedCurrency || capturedCurrency !== canonicalCurrency) {
    throw new PaymentSecurityError('PAYPAL_CAPTURE_AMOUNT_MISMATCH', 'Nao foi possivel confirmar o valor do pagamento PayPal.');
  }
}

export async function capturePayPalOrder(payload: PayPalCaptureOrderPayload) {
  const { checkoutId, orderId, gatewayId, paypalOrderId, ip, baseUrl } = payload;

  try {
    const { supabase: supabaseAdmin, probeError } = await resolveLocalSupabaseServerClient();
    if (!supabaseAdmin) {
      console.error('[PayPal] Missing Supabase server credentials:', probeError);
      throw new Error(`SUPABASE_SERVER_KEY_INVALID: ${getLocalSupabaseServerKeyErrorMessage()}`);
    }
    if (await securityService.isRateLimited(ip)) {
      throw new Error('TOO_MANY_REQUESTS');
    }

    const context = await loadPayPalPaymentContext({ supabaseAdmin, checkoutId, orderId, gatewayId });
    const metadata = normalizeOrderMetadata(context.order.metadata);
    const storedPayPalOrderId = normalizeProviderId(metadata.paypal_order_id);
    const requestedPayPalOrderId = normalizeProviderId(paypalOrderId);
    if (!storedPayPalOrderId || storedPayPalOrderId !== requestedPayPalOrderId) {
      throw new PaymentSecurityError('PAYPAL_ORDER_FORBIDDEN', 'Invalid checkout configuration.');
    }

    const credentials = getPayPalCredentials(context.gateway);
    const accessToken = await fetchPayPalAccessToken(credentials);
    const providerOrder = await callPayPalJson({
      credentials,
      accessToken,
      path: `/v2/checkout/orders/${encodeURIComponent(storedPayPalOrderId)}/capture`,
      method: 'POST',
      idempotencyKey: `super-checkout:${orderId}:capture`,
      body: {},
    });
    const providerStatus = getCaptureStatus(providerOrder);
    const localStatus = mapPayPalStatus(providerStatus);
    const captureId = getCaptureId(providerOrder);

    if (localStatus === 'paid' || localStatus === 'pending') {
      assertCapturedAmountMatchesOrder(
        providerOrder,
        context.order.total,
        getServerCurrency(context.checkout, context.mainProduct),
      );
    }

    await supabaseAdmin
      .from('orders')
      .update({
        status: localStatus,
        payment_id: captureId || storedPayPalOrderId,
      })
      .eq('id', orderId)
      .eq('checkout_id', context.checkout.id)
      .eq('user_id', context.merchantUserId);
    await mergeOrderMetadata(supabaseAdmin, orderId, {
      paypal_capture_id: captureId || null,
      paypal_capture_status: providerStatus || null,
      paypal_captured_at: new Date().toISOString(),
    });
    await upsertServerPaymentRecord({
      supabaseAdmin,
      gatewayId: context.gateway.id,
      merchantUserId: context.merchantUserId,
      orderId,
      status: localStatus,
      transactionId: storedPayPalOrderId,
      rawResponse: toSafePayPalRawResponse(providerOrder),
    });

    if (localStatus === 'paid') {
      await fulfillOrder(supabaseAdmin, {
        orderId,
        email: context.order.customer_email,
        name: context.order.customer_name,
      });
      if (context.order.customer_email) {
        const origin = String(baseUrl || process.env.APP_URL || 'https://app.supercheckout.app').replace(/\/$/, '');
        await sendOrderAccessEmail(supabaseAdmin, {
          orderId,
          origin,
          email: context.order.customer_email,
          name: context.order.customer_name,
        });
      }
    } else if (localStatus === 'failed' && String(context.order.status || '').toLowerCase() !== 'failed') {
      await dispatchPaymentFailedPush({
        supabaseAdmin,
        merchantUserId: context.merchantUserId,
        orderId,
        customerName: context.order.customer_name || null,
        amount: Number(context.order.total || 0) || 0,
        paymentMethod: 'paypal',
        productNames: Array.isArray(context.order.items)
          ? context.order.items.map((item: any) => String(item?.name || '').trim()).filter(Boolean)
          : [],
        failureReason: providerStatus || null,
      });
    }

    return {
      success: localStatus === 'paid' || localStatus === 'pending',
      orderId,
      status: providerStatus || 'PENDING',
      localStatus,
      statusSignature: generateSignature(orderId),
    };
  } catch (error: any) {
    const isSecurityError = error instanceof PaymentSecurityError;
    const code = isSecurityError ? error.code : 'PAYPAL_CAPTURE_FAILED';
    console.error('[PayPal] Capture failed:', { orderId, code, message: error?.message || error });
    return {
      success: false,
      code,
      error: isSecurityError
        ? error.publicMessage
        : 'Nao foi possivel concluir o pagamento via PayPal. Tente novamente.',
    };
  }
}

export async function testPayPalGatewayCredentials(params: {
  supabaseAdmin: any;
  merchantUserId: string;
  gatewayId: string;
}) {
  const { data: gateway, error } = await params.supabaseAdmin
    .from('gateways')
    .select('id,user_id,name,provider,public_key,private_key,webhook_secret,config')
    .eq('id', params.gatewayId)
    .eq('user_id', params.merchantUserId)
    .maybeSingle();

  if (error || !gateway || (gateway.name !== 'paypal' && gateway.provider !== 'paypal')) {
    return { success: false, error: 'Gateway PayPal nao encontrado.' };
  }

  try {
    const credentials = getPayPalCredentials(gateway);
    await fetchPayPalAccessToken(credentials);
    return { success: true, environment: credentials.environment };
  } catch (error: any) {
    console.error('[PayPal] Credential test failed:', error?.message || error);
    return { success: false, error: 'O PayPal recusou as credenciais informadas.' };
  }
}

function getWebhookHeader(headers: Record<string, string | string[] | undefined>, name: string) {
  const value = headers[name];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

async function logPayPalWebhook(supabaseAdmin: any, event: string, status: number, rawBody: string, message: string) {
  try {
    await supabaseAdmin.from('webhook_logs').insert({
      event,
      payload: {
        redacted: true,
        provider: 'paypal',
        body_bytes: Buffer.byteLength(rawBody || '', 'utf8'),
      },
      response_status: status,
      response_body: message.slice(0, 240),
      direction: 'inbound',
      processed: status === 200,
    });
  } catch (error: any) {
    console.error('[PayPal] Webhook audit log failed:', error?.message || error);
  }
}

async function verifyPayPalWebhookSignature(params: {
  rawBody: string;
  payload: any;
  headers: Record<string, string | string[] | undefined>;
  gateway: any;
}) {
  const credentials = getPayPalCredentials(params.gateway);
  if (!credentials.webhookId) return false;

  const accessToken = await fetchPayPalAccessToken(credentials);
  const verification = await callPayPalJson({
    credentials,
    accessToken,
    path: '/v1/notifications/verify-webhook-signature',
    method: 'POST',
    body: {
      auth_algo: getWebhookHeader(params.headers, 'paypal-auth-algo'),
      cert_url: getWebhookHeader(params.headers, 'paypal-cert-url'),
      transmission_id: getWebhookHeader(params.headers, 'paypal-transmission-id'),
      transmission_sig: getWebhookHeader(params.headers, 'paypal-transmission-sig'),
      transmission_time: getWebhookHeader(params.headers, 'paypal-transmission-time'),
      webhook_id: credentials.webhookId,
      webhook_event: params.payload,
    },
  });

  return String(verification?.verification_status || '').toUpperCase() === 'SUCCESS';
}

function getPayPalWebhookOrderId(payload: any) {
  return normalizeProviderId(
    payload?.resource?.supplementary_data?.related_ids?.order_id
    || payload?.resource?.order_id
    || payload?.resource?.invoice_id,
  );
}

function getPayPalWebhookStatus(eventType: string) {
  if (eventType === 'PAYMENT.CAPTURE.COMPLETED') return 'paid';
  if (eventType === 'PAYMENT.CAPTURE.PENDING') return 'pending';
  if (eventType === 'PAYMENT.CAPTURE.REFUNDED') return 'refunded';
  if (eventType === 'PAYMENT.CAPTURE.REVERSED') return 'canceled';
  return 'failed';
}

function canApplyPayPalWebhookStatus(currentStatus: unknown, nextStatus: string) {
  const current = String(currentStatus || '').trim().toLowerCase();
  if (nextStatus === 'paid') return !['refunded', 'canceled'].includes(current);
  if (nextStatus === 'pending') return !['paid', 'refunded', 'canceled', 'failed'].includes(current);
  if (nextStatus === 'failed') return !['paid', 'refunded', 'canceled'].includes(current);
  return true;
}

export async function handlePayPalWebhook(params: {
  rawBody: string;
  headers: Record<string, string | string[] | undefined>;
  supabaseAdmin: any;
  origin?: string;
}) {
  let payload: any;
  try {
    payload = JSON.parse(params.rawBody);
  } catch {
    return { status: 400, body: { status: 'INVALID_JSON' } };
  }

  const eventType = String(payload?.event_type || '').trim().toUpperCase();
  const eventId = normalizeProviderId(payload?.id);
  const providerOrderId = getPayPalWebhookOrderId(payload);
  const logKey = `paypal_${eventId || `${providerOrderId}_${eventType || 'unknown'}`}`;

  if (!PAYPAL_ALLOWED_WEBHOOK_EVENTS.has(eventType) || !providerOrderId) {
    return { status: 200, body: { status: 'EVENT_IGNORED' } };
  }

  const { data: processed } = await params.supabaseAdmin
    .from('webhook_logs')
    .select('id')
    .eq('event', logKey)
    .eq('processed', true)
    .limit(1);
  if (processed?.length) return { status: 200, body: { status: 'ALREADY_PROCESSED' } };

  const { data: payment } = await params.supabaseAdmin
    .from('payments')
    .select('*')
    .eq('transaction_id', providerOrderId)
    .maybeSingle();
  if (!payment?.order_id || !payment?.gateway_id) {
    await logPayPalWebhook(params.supabaseAdmin, logKey, 200, params.rawBody, 'ORDER_NOT_FOUND');
    return { status: 200, body: { status: 'ORDER_NOT_FOUND' } };
  }

  const [{ data: order }, { data: gateway }] = await Promise.all([
    params.supabaseAdmin.from('orders').select('*').eq('id', payment.order_id).maybeSingle(),
    params.supabaseAdmin.from('gateways').select('*').eq('id', payment.gateway_id).maybeSingle(),
  ]);
  if (!order || !gateway || (gateway.name !== 'paypal' && gateway.provider !== 'paypal') || order.user_id !== gateway.user_id || order.payment_method !== 'paypal') {
    await logPayPalWebhook(params.supabaseAdmin, logKey, 200, params.rawBody, 'OWNERSHIP_REJECTED');
    return { status: 200, body: { status: 'OWNERSHIP_REJECTED' } };
  }

  try {
    const signatureIsValid = await verifyPayPalWebhookSignature({
      rawBody: params.rawBody,
      payload,
      headers: params.headers,
      gateway,
    });
    if (!signatureIsValid) {
      await logPayPalWebhook(params.supabaseAdmin, logKey, 401, params.rawBody, 'INVALID_SIGNATURE');
      return { status: 401, body: { status: 'INVALID_SIGNATURE' } };
    }
  } catch (error: any) {
    console.error('[PayPal] Webhook verification failed:', error?.message || error);
    await logPayPalWebhook(params.supabaseAdmin, logKey, 401, params.rawBody, 'SIGNATURE_VERIFICATION_FAILED');
    return { status: 401, body: { status: 'SIGNATURE_VERIFICATION_FAILED' } };
  }

  const localStatus = getPayPalWebhookStatus(eventType);
  const captureId = normalizeProviderId(payload?.resource?.id);
  if (!canApplyPayPalWebhookStatus(order.status, localStatus)) {
    await logPayPalWebhook(params.supabaseAdmin, logKey, 200, params.rawBody, 'STALE_EVENT_IGNORED');
    return { status: 200, body: { status: 'STALE_EVENT_IGNORED' } };
  }
  const rawResponse = JSON.stringify({
    redacted: true,
    provider: 'paypal',
    event_type: eventType,
    event_id: eventId || null,
    order_id: providerOrderId,
    capture_id: captureId || null,
    status: String(payload?.resource?.status || '').trim().slice(0, 64) || null,
    captured_at: new Date().toISOString(),
  });

  await params.supabaseAdmin
    .from('orders')
    .update({ status: localStatus, payment_id: captureId || providerOrderId })
    .eq('id', order.id)
    .eq('user_id', order.user_id);
  await params.supabaseAdmin
    .from('payments')
    .update({ status: localStatus, raw_response: rawResponse, user_id: order.user_id })
    .eq('id', payment.id)
    .eq('order_id', order.id);
  await mergeOrderMetadata(params.supabaseAdmin, order.id, {
    paypal_webhook_event: eventType,
    paypal_webhook_event_id: eventId || null,
    paypal_capture_id: captureId || null,
    paypal_webhook_received_at: new Date().toISOString(),
  });

  if (localStatus === 'paid') {
    await fulfillOrder(params.supabaseAdmin, {
      orderId: order.id,
      email: order.customer_email,
      name: order.customer_name,
    });
    if (order.customer_email) {
      await sendOrderAccessEmail(params.supabaseAdmin, {
        orderId: order.id,
        origin: String(params.origin || 'https://app.supercheckout.app').replace(/\/$/, ''),
        email: order.customer_email,
        name: order.customer_name,
      });
    }
  } else if (localStatus === 'failed' && String(order.status || '').toLowerCase() !== 'failed') {
    await dispatchPaymentFailedPush({
      supabaseAdmin: params.supabaseAdmin,
      merchantUserId: order.user_id || null,
      orderId: order.id,
      customerName: order.customer_name || null,
      amount: Number(order.total || 0) || 0,
      paymentMethod: 'paypal',
      productNames: Array.isArray(order.items)
        ? order.items.map((item: any) => String(item?.name || '').trim()).filter(Boolean)
        : [],
      failureReason: eventType,
    });
  }

  await logPayPalWebhook(params.supabaseAdmin, logKey, 200, params.rawBody, 'OK');
  return { status: 200, body: { status: 'OK', localStatus } };
}

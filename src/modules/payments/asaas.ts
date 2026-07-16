import crypto from 'crypto';
import { decrypt, generateSignature } from '../../core/utils/cryptoUtils.js';
import {
  getLocalSupabaseServerKeyErrorMessage,
  resolveLocalSupabaseServerClient,
} from '../../core/api/_supabase-server.js';
import { securityService } from '../../core/services/securityService.js';
import {
  buildSafeAsaasRawResponse,
  getAsaasApiBaseUrl,
  mapAsaasStatusToLocal,
  resolveAsaasEnvironment,
} from '../../core/utils/asaas.js';
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

interface AsaasPaymentPayload {
  checkoutId: string;
  orderId: string;
  gatewayId: string;
  paymentMethod: 'credit_card' | 'pix' | 'boleto';
  installments?: number;
  selectedBumpIds?: string[];
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
  customerCpf?: string;
  ip: string;
  baseUrl?: string;
}

function normalizeDocument(value?: string) {
  return String(value || '').replace(/\D/g, '');
}

function normalizePhone(value?: string) {
  return String(value || '').replace(/\D/g, '');
}

function normalizePublicBaseUrl(value: string | undefined) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return null;

  const normalizedValue = rawValue.startsWith('http') ? rawValue : `https://${rawValue}`;

  try {
    const parsed = new URL(normalizedValue);
    const hostname = parsed.hostname.trim().toLowerCase();
    const isLocalHost = hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '0.0.0.0'
      || hostname === '::1';
    const isPrivateIpv4 = /^10\./.test(hostname)
      || /^192\.168\./.test(hostname)
      || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);

    if (parsed.protocol !== 'https:' || isLocalHost || isPrivateIpv4) {
      return null;
    }

    parsed.hash = '';
    parsed.search = '';
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function resolveAsaasCallbackUrl(baseUrl: string | undefined, orderId: string, statusSignature: string) {
  const callbackBaseUrl = normalizePublicBaseUrl(
    process.env.ASAAS_CALLBACK_BASE_URL
    || baseUrl
    || process.env.APP_URL
    || process.env.NEXT_PUBLIC_APP_URL
    || process.env.VITE_SITE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  );

  if (!callbackBaseUrl) {
    return null;
  }

  return `${callbackBaseUrl}/thank-you/${encodeURIComponent(orderId)}?sig=${encodeURIComponent(statusSignature)}`;
}

async function callAsaasJson(url: string, init: RequestInit, actionLabel: string) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload) {
    const errorMessage = String(
      payload?.errors?.[0]?.description
      || payload?.message
      || payload?.error
      || `Falha ao executar ${actionLabel} no Asaas.`,
    );
    throw new Error(errorMessage);
  }

  return payload;
}

async function ensureAsaasCustomer(params: {
  apiBaseUrl: string;
  authToken: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerCpf?: string;
  merchantUserId: string;
}) {
  const cpfCnpj = normalizeDocument(params.customerCpf);
  const normalizedEmail = String(params.customerEmail || '').trim().toLowerCase();
  const query = cpfCnpj
    ? `cpfCnpj=${encodeURIComponent(cpfCnpj)}`
    : `email=${encodeURIComponent(normalizedEmail)}`;

  const customerList = await callAsaasJson(
    `${params.apiBaseUrl}/customers?${query}`,
    {
      method: 'GET',
      headers: {
        accept: 'application/json',
        access_token: params.authToken,
      },
    },
    'customer_lookup',
  );

  if (Array.isArray(customerList?.data) && customerList.data.length > 0) {
    return String(customerList.data[0]?.id || '').trim();
  }

  const normalizedPhone = normalizePhone(params.customerPhone);
  const createdCustomer = await callAsaasJson(
    `${params.apiBaseUrl}/customers`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
        access_token: params.authToken,
      },
      body: JSON.stringify({
        name: params.customerName,
        email: normalizedEmail,
        cpfCnpj: cpfCnpj || undefined,
        mobilePhone: normalizedPhone || undefined,
        notificationDisabled: true,
        externalReference: `sc-customer:${params.merchantUserId}:${normalizedEmail}`,
      }),
    },
    'customer_create',
  );

  const customerId = String(createdCustomer?.id || '').trim();
  if (!customerId) {
    throw new Error('Nao foi possivel criar o cliente no Asaas.');
  }

  return customerId;
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

  if (existingPayment?.id) {
    await params.supabaseAdmin
      .from('payments')
      .update({
        status: params.status,
        transaction_id: params.transactionId,
        raw_response: params.rawResponse,
        user_id: params.merchantUserId,
      })
      .eq('id', existingPayment.id)
      .eq('order_id', params.orderId);
    return;
  }

  await params.supabaseAdmin
    .from('payments')
    .insert({
      id: crypto.randomUUID(),
      order_id: params.orderId,
      gateway_id: params.gatewayId,
      status: params.status,
      transaction_id: params.transactionId,
      raw_response: params.rawResponse,
      user_id: params.merchantUserId,
      created_at: new Date().toISOString(),
    });
}

export async function processAsaasPayment(payload: AsaasPaymentPayload) {
  const {
    checkoutId,
    orderId,
    gatewayId,
    paymentMethod,
    selectedBumpIds = [],
    customerEmail,
    customerName,
    customerPhone,
    customerCpf,
    ip,
    baseUrl,
  } = payload;

  try {
    const { supabase: supabaseAdmin, probeError } = await resolveLocalSupabaseServerClient();
    if (!supabaseAdmin) {
      console.error('[Asaas] Missing or invalid Supabase server credentials:', probeError);
      throw new Error(`SUPABASE_SERVER_KEY_INVALID: ${getLocalSupabaseServerKeyErrorMessage()}`);
    }

    const isLimited = await securityService.isRateLimited(ip);
    if (isLimited) {
      throw new Error('TOO_MANY_REQUESTS: Excesso de tentativas.');
    }

    const checkout = await loadCheckoutForPayment(supabaseAdmin, checkoutId);
    const mainProduct = getMainProductForCheckout(checkout);
    const merchantUserId = resolveCheckoutMerchantUserId(checkout, mainProduct);
    const ownedOrder = await loadOwnedOrderForCheckoutWithMerchant(supabaseAdmin, checkout, merchantUserId, orderId);
    const gateway = await loadOwnedActiveGateway(
      supabaseAdmin,
      merchantUserId,
      checkout,
      gatewayId,
      'asaas',
      paymentMethod,
    );

    const serverCurrency = getServerCurrency(checkout, mainProduct);
    if (serverCurrency !== 'BRL') {
      throw new PaymentSecurityError('PAYMENT_CURRENCY_GATEWAY_FORBIDDEN', 'O Asaas esta habilitado apenas para BRL.');
    }

    if (paymentMethod !== 'pix') {
      throw new PaymentSecurityError(
        'PAYMENT_METHOD_GATEWAY_FORBIDDEN',
        'O Asaas esta disponivel apenas via Pix no Super Checkout neste momento.',
      );
    }

    const authToken = decrypt(gateway.private_key || '').replace(/\s/g, '').trim();
    if (!authToken) {
      throw new PaymentSecurityError('GATEWAY_CREDENTIALS_MISSING', 'Credenciais do Asaas nao configuradas.');
    }

    const {
      configuredSandbox,
      keyEnvironment,
      effectiveSandbox,
    } = resolveAsaasEnvironment({
      configuredSandbox: gateway.config?.sandbox === true,
      apiKey: authToken,
    });

    if (keyEnvironment && ((keyEnvironment === 'sandbox') !== configuredSandbox)) {
      console.warn('[Asaas] Gateway config sandbox does not match API key prefix. Using key environment.', {
        orderId,
        configuredSandbox,
        keyEnvironment,
      });
    }

    const apiBaseUrl = getAsaasApiBaseUrl(effectiveSandbox);
    const customerId = await ensureAsaasCustomer({
      apiBaseUrl,
      authToken,
      customerName,
      customerEmail,
      customerPhone,
      customerCpf,
      merchantUserId,
    });

    const validBumps = selectedBumpIds.length > 0
      ? await loadValidCheckoutBumps(supabaseAdmin, checkout, merchantUserId, selectedBumpIds)
      : [];

    const existingOrderItems = Array.isArray((ownedOrder as any)?.items) ? (ownedOrder as any).items : [];
    const fallbackOrderItems = [
      {
        id: mainProduct.id,
        product_id: mainProduct.id,
        name: mainProduct.name,
        price: mainProduct.price_real,
        quantity: 1,
        type: 'main',
      },
      ...validBumps.map((bump: any) => ({
        id: bump.id,
        product_id: bump.id,
        name: bump.name,
        price: bump.price_real,
        quantity: 1,
        type: 'bump',
      })),
    ];
    const resolvedOrderItems = existingOrderItems.length > 0 ? existingOrderItems : fallbackOrderItems;

    let totalAmount = Number((ownedOrder as any)?.total || 0);
    if (!(Number.isFinite(totalAmount) && totalAmount > 0)) {
      totalAmount = resolvedOrderItems.reduce((sum: number, item: any) => {
        const unitPrice = Number(item?.price || 0);
        const quantity = Math.max(1, Number(item?.quantity || 1));
        return sum + (Number.isFinite(unitPrice) ? unitPrice * quantity : 0);
      }, 0);
    }

    if (!(Number.isFinite(totalAmount) && totalAmount > 0)) {
      throw new PaymentSecurityError('ORDER_TOTAL_INVALID', 'Nao foi possivel calcular o valor do pedido.');
    }

    const billingType: 'PIX' | 'CREDIT_CARD' | 'BOLETO' = 'PIX';
    const statusSignature = generateSignature(orderId);
    const callbackUrl = resolveAsaasCallbackUrl(baseUrl, orderId, statusSignature);
    const paymentPayload: Record<string, any> = {
      customer: customerId,
      billingType,
      value: Number(totalAmount.toFixed(2)),
      dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      externalReference: orderId,
      description: `Pedido ${orderId}`,
    };

    if (callbackUrl) {
      paymentPayload.callback = {
        successUrl: callbackUrl,
      };
    } else {
      console.warn('[Asaas] Skipping callback.successUrl because the resolved return URL is not a public HTTPS address accepted by Asaas.', {
        orderId,
        baseUrl: baseUrl || null,
        callbackBaseUrlOverride: process.env.ASAAS_CALLBACK_BASE_URL || null,
      });
    }

    const paymentResponse = await callAsaasJson(
      `${apiBaseUrl}/payments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/json',
          access_token: authToken,
          'x-idempotency-key': orderId,
        },
        body: JSON.stringify(paymentPayload),
      },
      'payment_create',
    );

    let pixQrCodeResponse: any = null;
    if (billingType === 'PIX') {
      pixQrCodeResponse = await callAsaasJson(
        `${apiBaseUrl}/payments/${encodeURIComponent(String(paymentResponse.id))}/pixQrCode`,
        {
          method: 'GET',
          headers: {
            accept: 'application/json',
            access_token: authToken,
          },
        },
        'pix_qr_code',
      );
    }

    const localStatus = mapAsaasStatusToLocal(paymentResponse?.status, paymentResponse?.billingType);
    const safeRawResponse = buildSafeAsaasRawResponse(paymentResponse, pixQrCodeResponse);
    const transactionId = String(paymentResponse?.id || orderId);
    const redirectUrl = undefined;

    await supabaseAdmin
      .from('orders')
      .update({
        status: localStatus,
        payment_id: transactionId,
        total: Number(totalAmount.toFixed(2)),
        items: resolvedOrderItems,
      })
      .eq('id', orderId)
      .eq('checkout_id', checkout.id);

    await upsertServerPaymentRecord({
      supabaseAdmin,
      gatewayId: gateway.id,
      merchantUserId,
      orderId,
      status: localStatus,
      transactionId,
      rawResponse: safeRawResponse,
    });

    return {
      success: true,
      status: String(paymentResponse?.status || 'PENDING').trim().toUpperCase(),
      localStatus,
      data: paymentResponse,
      statusSignature,
      redirectUrl,
      pixData: {
        qr_code: String(pixQrCodeResponse?.payload || ''),
        qr_code_base64: String(pixQrCodeResponse?.encodedImage || ''),
      },
      boletoData: undefined,
    };
  } catch (error: any) {
    const isSecurityError = error instanceof PaymentSecurityError;
    const code = isSecurityError ? error.code : 'ASAAS_PAYMENT_FAILED';
    const publicMessage = isSecurityError
      ? error.publicMessage
      : String(error?.message || 'Nao foi possivel processar o pagamento com Asaas.');

    console.error('[Asaas] Payment failed:', {
      orderId,
      code,
      message: error?.message || error,
    });

    return {
      success: false,
      code,
      error: publicMessage,
      details: typeof error?.message === 'string' ? error.message : null,
    };
  }
}

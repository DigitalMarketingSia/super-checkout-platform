import crypto from 'crypto';
import { generateSignature } from '../../core/utils/cryptoUtils.js';
import {
  getLocalSupabaseServerKeyErrorMessage,
  resolveLocalSupabaseServerClient,
} from '../../core/api/_supabase-server.js';
import { resolvePagbankAccessToken } from '../../core/api/_pagbank-token.js';
import { securityService } from '../../core/services/securityService.js';
import { fulfillOrder } from '../../core/services/fulfillment.js';
import { sendOrderAccessEmail } from '../../core/services/orderEmail.js';
import {
  buildSafePagSeguroRawResponse,
  getPagSeguroApiBaseUrl,
  getPagSeguroCharge,
  getPagSeguroQrCodeImageUrl,
  getPagSeguroQrCodeText,
  getPagSeguroStatus,
  mapPagSeguroStatusToLocal,
} from '../../core/utils/pagSeguro.js';
import {
  PaymentSecurityError,
  getMainProductForCheckout,
  getServerCurrency,
  loadCheckoutForPayment,
  loadOwnedActiveGateway,
  loadOwnedOrderForCheckoutWithMerchant,
  loadValidCheckoutBumps,
  normalizeInstallmentsForGateway,
  resolveCheckoutMerchantUserId,
} from './payment-security.js';

interface PagSeguroPaymentPayload {
  checkoutId: string;
  orderId: string;
  gatewayId: string;
  paymentMethod: 'credit_card' | 'pix' | 'boleto';
  encryptedCard?: string;
  installments?: number;
  selectedBumpIds?: string[];
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
  customerCpf?: string;
  ip: string;
  baseUrl?: string;
}

function normalizeTaxId(value: string | undefined) {
  return String(value || '').replace(/\D/g, '');
}

function truncateText(value: string, maxLength: number, fallback: string) {
  const normalized = String(value || '').trim() || fallback;
  return normalized.slice(0, maxLength);
}

function toAmountInCents(value: number) {
  return Math.max(0, Math.round((Number(value) || 0) * 100));
}

function buildPagSeguroPhoneList(phone?: string) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return undefined;

  let nationalNumber = digits;
  if (nationalNumber.startsWith('55') && nationalNumber.length >= 12) {
    nationalNumber = nationalNumber.slice(2);
  }

  if (nationalNumber.length < 10) return undefined;

  return [{
    country: '55',
    area: nationalNumber.slice(0, 2),
    number: nationalNumber.slice(2),
    type: 'MOBILE',
  }];
}

function buildNotificationUrl(baseUrl?: string) {
  let stableBaseUrl = String(baseUrl || '').trim();
  if (!stableBaseUrl) return '';
  if (stableBaseUrl.endsWith('/')) stableBaseUrl = stableBaseUrl.slice(0, -1);
  if (!stableBaseUrl.startsWith('http')) stableBaseUrl = `https://${stableBaseUrl}`;

  if (
    stableBaseUrl.includes('localhost')
    || stableBaseUrl.includes('127.0.0.1')
    || !stableBaseUrl.includes('.')
  ) {
    return '';
  }

  return `${stableBaseUrl}/api/webhooks/pagseguro`;
}

function buildPagSeguroItems(items: any[]) {
  return items.map((item, index) => ({
    reference_id: truncateText(String(item?.product_id || item?.id || `item-${index + 1}`), 120, `item-${index + 1}`),
    name: truncateText(String(item?.name || `Item ${index + 1}`), 120, `Item ${index + 1}`),
    quantity: Math.max(1, Number(item?.quantity || 1)),
    unit_amount: toAmountInCents(Number(item?.price || 0)),
  }));
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

export async function processPagSeguroPayment(payload: PagSeguroPaymentPayload) {
  const {
    checkoutId,
    orderId,
    gatewayId,
    paymentMethod,
    encryptedCard,
    installments = 1,
    selectedBumpIds = [],
    customerEmail,
    customerName,
    customerPhone,
    customerCpf,
    ip,
    baseUrl,
  } = payload;

  try {
    if (paymentMethod === 'boleto') {
      throw new PaymentSecurityError(
        'PAGSEGURO_BOLETO_NOT_AVAILABLE',
        'O boleto do PagBank sera liberado quando o checkout coletar endereco de cobranca completo.',
      );
    }

    const { supabase: supabaseAdmin, probeError } = await resolveLocalSupabaseServerClient();
    if (!supabaseAdmin) {
      console.error('[PagSeguro] Missing or invalid Supabase server credentials:', probeError);
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
    const gateway = await loadOwnedActiveGateway(supabaseAdmin, merchantUserId, checkout, gatewayId, 'pagseguro');

    const serverCurrency = getServerCurrency(checkout, mainProduct);
    if (serverCurrency !== 'BRL') {
      throw new PaymentSecurityError('PAYMENT_CURRENCY_GATEWAY_FORBIDDEN', 'O PagBank esta habilitado apenas para BRL.');
    }

    const taxId = normalizeTaxId(customerCpf);
    if (taxId.length !== 11 && taxId.length !== 14) {
      throw new PaymentSecurityError('PAGSEGURO_TAX_ID_REQUIRED', 'O PagBank exige um CPF ou CNPJ valido para concluir a compra.');
    }

    const { accessToken: authToken } = await resolvePagbankAccessToken({
      supabaseAdmin,
      gateway,
      reason: 'payment',
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

    const amountInCents = toAmountInCents(totalAmount);
    const notificationUrl = buildNotificationUrl(baseUrl);
    const safeInstallments = normalizeInstallmentsForGateway(installments, gateway);
    const apiBaseUrl = getPagSeguroApiBaseUrl(gateway);
    const customerPhones = buildPagSeguroPhoneList(customerPhone);
    const isSandboxGateway = gateway?.config?.environment === 'sandbox';
    const enableFullSandboxLogs = isSandboxGateway && String(process.env.PAGBANK_SANDBOX_FULL_LOGS || '').trim().toLowerCase() === 'true';

    const requestBody: Record<string, any> = {
      reference_id: orderId,
      customer: {
        name: truncateText(customerName, 120, 'Cliente'),
        email: String(customerEmail || '').trim().toLowerCase(),
        tax_id: taxId,
        ...(customerPhones ? { phones: customerPhones } : {}),
      },
      items: buildPagSeguroItems(resolvedOrderItems),
      ...(notificationUrl ? { notification_urls: [notificationUrl] } : {}),
    };

    if (paymentMethod === 'pix') {
      requestBody.qr_codes = [{
        amount: {
          value: amountInCents,
        },
      }];
    } else {
      if (!encryptedCard) {
        throw new PaymentSecurityError('PAGSEGURO_CARD_REQUIRED', 'O PagBank exige a criptografia local do cartao antes do envio.');
      }

      requestBody.charges = [{
        reference_id: `${orderId}-charge`,
        description: truncateText(`Pedido ${orderId}`, 160, `Pedido ${orderId}`),
        amount: {
          value: amountInCents,
          currency: 'BRL',
        },
        payment_method: {
          type: 'CREDIT_CARD',
          installments: safeInstallments,
          capture: true,
          card: {
            encrypted: encryptedCard,
            holder: {
              name: truncateText(customerName, 120, 'Cliente'),
              tax_id: taxId,
            },
            store: false,
          },
        },
      }];
    }

    const requestHeaders = {
      'Content-Type': 'application/json',
      'x-idempotency-key': orderId,
    };

    const response = await fetch(`${apiBaseUrl}/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        ...requestHeaders,
      },
      body: JSON.stringify(requestBody),
    });

    const pagSeguroOrder = await response.json().catch(() => null);
    if (!response.ok || !pagSeguroOrder) {
      const errorMessage = String(
        pagSeguroOrder?.error_messages?.[0]?.description
        || pagSeguroOrder?.message
        || pagSeguroOrder?.error
        || 'Nao foi possivel criar o pedido no PagBank.',
      );
      throw new Error(errorMessage);
    }

    const providerStatus = getPagSeguroStatus(pagSeguroOrder);
    const localStatus = mapPagSeguroStatusToLocal(providerStatus);
    const transactionId = String(pagSeguroOrder?.id || orderId);
    const rawResponse = buildSafePagSeguroRawResponse(pagSeguroOrder, {
      environment: isSandboxGateway ? 'sandbox' : 'production',
      requestBody,
      requestHeaders,
      responseStatus: response.status,
      maskSensitiveFields: !enableFullSandboxLogs,
    });

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
      rawResponse,
    });

    if (localStatus === 'paid') {
      const publicOrigin = String(baseUrl || '').trim().startsWith('http')
        ? String(baseUrl).trim()
        : (process.env.VITE_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://app.supercheckout.app'));
      await fulfillOrder(supabaseAdmin, {
        orderId,
        email: customerEmail,
        name: customerName,
      });
      await sendOrderAccessEmail(supabaseAdmin, {
        orderId,
        origin: publicOrigin,
        email: customerEmail,
        name: customerName,
      });
    }

    return {
      success: true,
      status: providerStatus,
      data: pagSeguroOrder,
      statusSignature: generateSignature(orderId),
      pixData: paymentMethod === 'pix'
        ? {
            qr_code: getPagSeguroQrCodeText(pagSeguroOrder),
            qr_code_base64: getPagSeguroQrCodeImageUrl(pagSeguroOrder),
          }
        : undefined,
      paymentId: getPagSeguroCharge(pagSeguroOrder)?.id || null,
    };
  } catch (error: any) {
    const isSecurityError = error instanceof PaymentSecurityError;
    const code = isSecurityError ? error.code : 'PAGSEGURO_PAYMENT_FAILED';
    const publicMessage = isSecurityError
      ? error.publicMessage
      : String(error?.message || 'Nao foi possivel processar o pagamento com PagBank.');

    console.error('[PagSeguro] Payment failed:', {
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

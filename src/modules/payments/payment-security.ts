export class PaymentSecurityError extends Error {
  code: string;
  status: number;
  publicMessage: string;

  constructor(code: string, publicMessage = 'Payment request could not be authorized.', status = 400) {
    super(code);
    this.name = 'PaymentSecurityError';
    this.code = code;
    this.status = status;
    this.publicMessage = publicMessage;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireId(value: unknown, code: string) {
  if (typeof value !== 'string' || !value.trim() || value.length > 120) {
    throw new PaymentSecurityError(code);
  }

  return value.trim();
}

export async function loadCheckoutForPayment(supabaseAdmin: any, checkoutId: unknown) {
  const safeCheckoutId = requireId(checkoutId, 'CHECKOUT_ID_REQUIRED');
  const baseQuery = supabaseAdmin
    .from('checkouts')
    .select('*')
    .eq('active', true);

  const query = UUID_PATTERN.test(safeCheckoutId)
    ? baseQuery.eq('id', safeCheckoutId)
    : baseQuery.eq('custom_url_slug', safeCheckoutId);

  const { data: checkout, error } = await query.maybeSingle();

  if (error) {
    console.error('[PaymentSecurity] Checkout lookup failed:', error.message);
    throw new PaymentSecurityError('CHECKOUT_LOOKUP_FAILED', 'Invalid checkout configuration.');
  }

  if (!checkout) {
    throw new PaymentSecurityError('CHECKOUT_NOT_FOUND', 'Invalid checkout configuration.');
  }

  if (!checkout.product_id) {
    throw new PaymentSecurityError('CHECKOUT_PRODUCT_MISSING', 'Invalid checkout configuration.');
  }

  const { data: product, error: productError } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('id', checkout.product_id)
    .maybeSingle();

  if (productError) {
    console.error('[PaymentSecurity] Product lookup failed:', productError.message);
    throw new PaymentSecurityError('CHECKOUT_PRODUCT_LOOKUP_FAILED', 'Invalid checkout configuration.');
  }

  if (!product) {
    throw new PaymentSecurityError('CHECKOUT_PRODUCT_NOT_FOUND', 'Invalid checkout configuration.');
  }

  checkout.product = product;
  return checkout;
}

export function getMainProductForCheckout(checkout: any) {
  const productsData = Array.isArray(checkout?.product) ? checkout.product : [checkout?.product];
  const mainProduct = productsData[0];

  if (!mainProduct) {
    throw new PaymentSecurityError('CHECKOUT_PRODUCT_FORBIDDEN', 'Invalid checkout configuration.');
  }

  return mainProduct;
}

export function resolveCheckoutMerchantUserId(checkout: any, mainProduct: any) {
  const productOwnerId = typeof mainProduct?.user_id === 'string' && mainProduct.user_id.trim()
    ? mainProduct.user_id.trim()
    : '';
  const checkoutOwnerId = typeof checkout?.user_id === 'string' && checkout.user_id.trim()
    ? checkout.user_id.trim()
    : '';

  const merchantUserId = productOwnerId || checkoutOwnerId;

  if (!merchantUserId) {
    throw new PaymentSecurityError('CHECKOUT_OWNER_NOT_FOUND', 'Invalid checkout configuration.');
  }

  return merchantUserId;
}

export function getServerCurrency(checkout: any, mainProduct: any) {
  return String(checkout?.currency || mainProduct?.currency || 'BRL').trim().toUpperCase();
}

export function assertCurrencyMatchesCheckout(checkout: any, mainProduct: any, requestedCurrency: unknown) {
  const serverCurrency = getServerCurrency(checkout, mainProduct);
  const requestCurrency = String(requestedCurrency || '').trim().toUpperCase();

  if (!requestCurrency || requestCurrency !== serverCurrency) {
    throw new PaymentSecurityError('CURRENCY_MISMATCH', 'Payment currency does not match checkout configuration.');
  }

  return serverCurrency;
}

export function normalizeInstallmentsForGateway(value: unknown, gateway: any) {
  const requested = Number(value || 1);
  const configuredMax = Number(gateway?.config?.max_installments || gateway?.config?.maxInstallments || 12);
  const maxInstallments = Number.isInteger(configuredMax) && configuredMax > 0
    ? Math.min(configuredMax, 24)
    : 12;

  if (!Number.isInteger(requested) || requested < 1 || requested > maxInstallments) {
    throw new PaymentSecurityError('INVALID_INSTALLMENTS', 'Invalid payment installments.');
  }

  return requested;
}

function getAllowedGatewayIds(checkout: any) {
  return [checkout?.gateway_id, checkout?.backup_gateway_id]
    .filter(Boolean)
    .map((id) => String(id));
}

export function assertGatewayAllowedForCheckout(checkout: any, gatewayId: unknown) {
  const safeGatewayId = requireId(gatewayId, 'GATEWAY_ID_REQUIRED');
  const allowedGatewayIds = getAllowedGatewayIds(checkout);

  if (!allowedGatewayIds.includes(safeGatewayId)) {
    throw new PaymentSecurityError('PAYMENT_GATEWAY_FORBIDDEN');
  }

  return safeGatewayId;
}

export async function loadOwnedActiveGateway(
  supabaseAdmin: any,
  merchantUserId: string,
  checkout: any,
  gatewayId: unknown,
  expectedProvider: string
) {
  const safeGatewayId = assertGatewayAllowedForCheckout(checkout, gatewayId);
  const { data: gateway, error } = await supabaseAdmin
    .from('gateways')
    .select('*')
    .eq('id', safeGatewayId)
    .eq('user_id', merchantUserId)
    .maybeSingle();

  if (error) {
    console.error('[PaymentSecurity] Gateway lookup failed:', error.message);
    throw new PaymentSecurityError('GATEWAY_LOOKUP_FAILED');
  }

  const providerMatches = gateway?.name === expectedProvider || gateway?.provider === expectedProvider;
  const active = gateway?.active !== false && gateway?.is_active !== false;

  if (!gateway || !gateway.private_key || !active || !providerMatches) {
    throw new PaymentSecurityError('PAYMENT_GATEWAY_FORBIDDEN');
  }

  return gateway;
}

export async function loadOwnedOrderForCheckout(supabaseAdmin: any, checkout: any, orderId: unknown) {
  return loadOwnedOrderForCheckoutWithMerchant(supabaseAdmin, checkout, checkout?.user_id || null, orderId);
}

export async function loadOwnedOrderForCheckoutWithMerchant(
  supabaseAdmin: any,
  checkout: any,
  merchantUserId: string | null,
  orderId: unknown
) {
  const safeOrderId = requireId(orderId, 'ORDER_ID_REQUIRED');
  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select('id, checkout_id, user_id, customer_user_id, status, customer_email, customer_name, total, items, metadata')
    .eq('id', safeOrderId)
    .maybeSingle();

  if (error) {
    console.error('[PaymentSecurity] Order lookup failed:', error.message);
    throw new PaymentSecurityError('ORDER_LOOKUP_FAILED');
  }

  if (!order || order.checkout_id !== checkout.id) {
    throw new PaymentSecurityError('PAYMENT_ORDER_FORBIDDEN');
  }

  const canonicalMerchantUserId = typeof merchantUserId === 'string' && merchantUserId.trim()
    ? merchantUserId.trim()
    : (typeof checkout?.user_id === 'string' ? checkout.user_id.trim() : '');

  if (!canonicalMerchantUserId) {
    throw new PaymentSecurityError('PAYMENT_ORDER_FORBIDDEN');
  }

  if (!order.user_id || order.user_id !== canonicalMerchantUserId) {
    await supabaseAdmin
      .from('orders')
      .update({ user_id: canonicalMerchantUserId })
      .eq('id', safeOrderId)
      .eq('checkout_id', checkout.id);
  }

  return {
    ...order,
    user_id: canonicalMerchantUserId
  };
}

export async function loadValidCheckoutBumps(
  supabaseAdmin: any,
  checkout: any,
  merchantUserId: string,
  selectedBumpIds: unknown
) {
  const allowedBumpIds = new Set(
    (Array.isArray(checkout?.order_bump_ids) ? checkout.order_bump_ids : [])
      .filter(Boolean)
      .map((id: unknown) => String(id))
  );

  const requestedBumpIds = Array.from(new Set(
    (Array.isArray(selectedBumpIds) ? selectedBumpIds : [])
      .filter((id): id is string => typeof id === 'string' && allowedBumpIds.has(id))
  ));

  if (requestedBumpIds.length === 0) {
    return [];
  }

  const { data: bumps, error } = await supabaseAdmin
    .from('products')
    .select('*')
    .in('id', requestedBumpIds)
    .eq('user_id', merchantUserId)
    .eq('active', true);

  if (error) {
    console.error('[PaymentSecurity] Order bump lookup failed:', error.message);
    throw new PaymentSecurityError('ORDER_BUMP_LOOKUP_FAILED', 'Invalid checkout configuration.');
  }

  if ((bumps?.length || 0) !== requestedBumpIds.length) {
    throw new PaymentSecurityError('ORDER_BUMP_FORBIDDEN', 'Invalid checkout configuration.');
  }

  return bumps || [];
}

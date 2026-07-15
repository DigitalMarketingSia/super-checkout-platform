import {
  CheckoutConfig,
  CheckoutMethodGatewayRoute,
  CheckoutPaymentRoutingConfig,
  Gateway,
  GatewayProvider,
  PaymentMethodType,
} from '../types.js';

export const ROUTABLE_PAYMENT_METHODS: PaymentMethodType[] = [
  'pix',
  'credit_card',
  'boleto',
  'apple_pay',
  'google_pay',
];

type GatewayReference = Pick<Gateway, 'id' | 'name'>;

type CheckoutRoutingLike = {
  config?: Partial<CheckoutConfig> | null;
  gatewayId?: string | null;
  backupGatewayId?: string | null;
};

export const GATEWAY_METHOD_COMPATIBILITY: Record<
  GatewayProvider,
  Partial<Record<PaymentMethodType, boolean>>
> = {
  [GatewayProvider.MERCADO_PAGO]: {
    pix: true,
    credit_card: true,
    boleto: false,
    apple_pay: false,
    google_pay: false,
  },
  [GatewayProvider.STRIPE]: {
    pix: false,
    credit_card: true,
    boleto: false,
    apple_pay: true,
    google_pay: true,
  },
  [GatewayProvider.PAGSEGURO]: {
    pix: true,
    credit_card: true,
    boleto: false,
    apple_pay: false,
    google_pay: false,
  },
  [GatewayProvider.ASAAS]: {
    pix: true,
    credit_card: false,
    boleto: false,
    apple_pay: false,
    google_pay: false,
  },
  [GatewayProvider.PIX]: {
    pix: true,
    credit_card: false,
    boleto: false,
    apple_pay: false,
    google_pay: false,
  },
};

function normalizeGatewayId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function collectUniqueGatewayIds(values: Array<string | null | undefined>) {
  return values.filter((value, index, array): value is string => {
    if (!value) return false;
    return array.indexOf(value) === index;
  });
}

function getGatewayById(gateways: GatewayReference[], gatewayId: string | null) {
  if (!gatewayId) return null;
  return gateways.find((gateway) => gateway.id === gatewayId) || null;
}

function sanitizeRouteGatewayIdForMethod(
  paymentMethod: PaymentMethodType,
  gatewayId: string | null,
  gateways: GatewayReference[]
) {
  const gateway = getGatewayById(gateways, gatewayId);
  if (!gateway) return null;
  return supportsGatewayPaymentMethod(gateway.name, paymentMethod) ? gateway.id : null;
}

export function supportsGatewayPaymentMethod(
  gatewayName: GatewayProvider | string | undefined | null,
  paymentMethod: PaymentMethodType
) {
  if (!gatewayName) return false;
  const compatibility = GATEWAY_METHOD_COMPATIBILITY[gatewayName as GatewayProvider];
  return compatibility?.[paymentMethod] === true;
}

export function getCompatiblePaymentMethodsForGateway(
  gatewayName: GatewayProvider | string | undefined | null
) {
  return ROUTABLE_PAYMENT_METHODS.filter((method) => supportsGatewayPaymentMethod(gatewayName, method));
}

export function getConfiguredRouteGatewayIdsForMethod(
  config: Partial<CheckoutConfig> | null | undefined,
  paymentMethod: PaymentMethodType
) {
  const route = config?.payment_routing?.[paymentMethod];
  return collectUniqueGatewayIds([
    normalizeGatewayId(route?.primary_gateway_id),
    normalizeGatewayId(route?.backup_gateway_id),
  ]);
}

export function collectCheckoutRoutingGatewayIds(params: CheckoutRoutingLike) {
  const explicitRouteGatewayIds = ROUTABLE_PAYMENT_METHODS.flatMap((paymentMethod) =>
    getConfiguredRouteGatewayIdsForMethod(params.config, paymentMethod)
  );

  return collectUniqueGatewayIds([
    normalizeGatewayId(params.gatewayId),
    normalizeGatewayId(params.backupGatewayId),
    ...explicitRouteGatewayIds,
  ]);
}

function buildLegacyRouteForMethod(params: {
  paymentMethod: PaymentMethodType;
  enabled: boolean;
  gatewayId?: string | null;
  backupGatewayId?: string | null;
  gateways?: GatewayReference[];
}): CheckoutMethodGatewayRoute {
  const { paymentMethod, enabled, gatewayId, backupGatewayId } = params;
  const gateways = params.gateways || [];

  const orderedCandidates = [normalizeGatewayId(gatewayId), normalizeGatewayId(backupGatewayId)]
    .filter((gateway, index, array): gateway is string => Boolean(gateway) && array.indexOf(gateway) === index)
    .map((id) => getGatewayById(gateways, id))
    .filter((gateway): gateway is GatewayReference => Boolean(gateway))
    .filter((gateway) => supportsGatewayPaymentMethod(gateway.name, paymentMethod));

  return {
    enabled,
    primary_gateway_id: orderedCandidates[0]?.id || null,
    backup_gateway_id: orderedCandidates[1]?.id || null,
  };
}

function normalizeConfiguredRoute(
  paymentMethod: PaymentMethodType,
  route: CheckoutMethodGatewayRoute | undefined,
  enabled: boolean,
  gateways: GatewayReference[]
): CheckoutMethodGatewayRoute {
  if (!route) {
    return {
      enabled,
      primary_gateway_id: null,
      backup_gateway_id: null,
    };
  }

  const primaryGatewayId = sanitizeRouteGatewayIdForMethod(
    paymentMethod,
    normalizeGatewayId(route.primary_gateway_id),
    gateways
  );
  const backupGatewayId = sanitizeRouteGatewayIdForMethod(
    paymentMethod,
    normalizeGatewayId(route.backup_gateway_id),
    gateways
  );

  return {
    enabled: route.enabled ?? enabled,
    primary_gateway_id: primaryGatewayId,
    backup_gateway_id: backupGatewayId && backupGatewayId !== primaryGatewayId ? backupGatewayId : null,
  };
}

export function normalizeCheckoutPaymentRouting(params: {
  config?: Partial<CheckoutConfig> | null;
  gatewayId?: string | null;
  backupGatewayId?: string | null;
  gateways?: GatewayReference[];
}): CheckoutPaymentRoutingConfig {
  const config = params.config || {};
  const paymentMethods: Partial<Record<PaymentMethodType, boolean>> = config.payment_methods || {};
  const configuredRouting: CheckoutPaymentRoutingConfig = config.payment_routing || {};

  return ROUTABLE_PAYMENT_METHODS.reduce<CheckoutPaymentRoutingConfig>((acc, paymentMethod) => {
    const enabled = paymentMethods[paymentMethod] === true;
    const configuredRoute = configuredRouting[paymentMethod];

    if (configuredRoute) {
      acc[paymentMethod] = normalizeConfiguredRoute(paymentMethod, configuredRoute, enabled, params.gateways || []);
      return acc;
    }

    if (!enabled && !params.gatewayId && !params.backupGatewayId) {
      return acc;
    }

    acc[paymentMethod] = buildLegacyRouteForMethod({
      paymentMethod,
      enabled,
      gatewayId: params.gatewayId,
      backupGatewayId: params.backupGatewayId,
      gateways: params.gateways,
    });

    return acc;
  }, {});
}

export function getAllowedGatewayIdsForPaymentMethod(params: CheckoutRoutingLike & {
  paymentMethod: PaymentMethodType;
  gateways?: GatewayReference[];
}) {
  const normalizedRouting = normalizeCheckoutPaymentRouting({
    config: params.config,
    gatewayId: params.gatewayId,
    backupGatewayId: params.backupGatewayId,
    gateways: params.gateways,
  });
  const normalizedRoute = normalizedRouting[params.paymentMethod];
  const normalizedRouteGatewayIds = collectUniqueGatewayIds([
    normalizeGatewayId(normalizedRoute?.primary_gateway_id),
    normalizeGatewayId(normalizedRoute?.backup_gateway_id),
  ]);

  if (params.gateways && params.gateways.length > 0) {
    return normalizedRouteGatewayIds;
  }

  const explicitRouteGatewayIds = getConfiguredRouteGatewayIdsForMethod(params.config, params.paymentMethod);
  if (explicitRouteGatewayIds.length > 0) {
    return explicitRouteGatewayIds;
  }

  if (normalizedRouteGatewayIds.length > 0) {
    return normalizedRouteGatewayIds;
  }

  return collectUniqueGatewayIds([
    normalizeGatewayId(params.gatewayId),
    normalizeGatewayId(params.backupGatewayId),
  ]);
}


import { Checkout, Gateway, GatewayProvider, Order, OrderStatus, Payment, WebhookLog, OrderItem, InstallmentOption, PaymentMethodType } from '../types';
import { storage } from './storageService';
import { demoDataService, isDemoDataRuntime } from './demoDataService';
import { MercadoPagoAdapter } from './adapters/MercadoPagoAdapter';
import { StripeAdapter } from './adapters/StripeAdapter';
import { emailService } from './emailService';
import { getApiUrl } from '../utils/apiUtils';
import { translatePaymentError } from '../utils/errorTranslator';
import i18n from '../i18n/config';
import type { UpgradeIntentContext } from './licenseService';
import type { UpsellGatewayCapability } from '../config/upsellCapabilities';
import type { CheckoutTrackingAttribution } from '../utils/trackingAttribution';
import { encryptPagSeguroCard } from '../utils/pagSeguroBrowser';
import { buildSafePagSeguroRawResponse, mapPagSeguroStatusToLocal } from '../utils/pagSeguro';
import { buildSafeMercadoPagoRawResponse, buildSafeStripeRawResponse } from '../utils/paymentRawResponse';
import { buildSafeAsaasRawResponse, mapAsaasStatusToLocal } from '../utils/asaas';
import { dispatchDemoWebhookEvent } from './demoWebhookService';
import {
  collectCheckoutRoutingGatewayIds,
  getAllowedGatewayIdsForPaymentMethod,
  normalizeCheckoutPaymentRouting,
} from '../config/paymentRouting';
import { mergeOrderMetadata, normalizeOrderMetadata } from './orderMetadata';
import { supabase } from './supabase';

// Helper for UUID generation
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const debugPayment = (...args: unknown[]) => {
  if (import.meta.env.DEV) {
    console.debug(...args);
  }
};

const getSafeMercadoPagoErrorMessage = (error: unknown) => {
  const message = String((error as any)?.message || error || '').trim();

  if (message.includes('valid CPF or CNPJ')) {
    return 'Informe um CPF ou CNPJ valido para pagar com cartao no Mercado Pago.';
  }

  const customerSafePrefixes = [
    'Nao foi possivel',
    'Pagamento recusado',
    'O cartao',
    'O codigo',
    'A data',
    'Informe um CPF',
    'No sandbox legado',
    'O Mercado Pago',
    'O token do cartao',
    'O emissor do cartao',
    'O documento do pagador',
    'A quantidade de parcelas',
  ];

  if (customerSafePrefixes.some((prefix) => message.startsWith(prefix))) {
    return message;
  }

  return 'Nao foi possivel processar o pagamento agora. Revise os dados e tente novamente.';
};

export interface ProcessPaymentRequest {
  checkoutId: string;
  offerId: string;
  amount: number;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerCpf?: string;
  gatewayId: string;
  paymentMethod: PaymentMethodType;
  items: OrderItem[];
  currency: string; // New: Currency (BRL, USD, EUR)
  customerUserId?: string; // Added for access grants
  selectedBumps?: string[]; // Added for Backend Hub v4 (Anti-Fraud calculation)
  // Card Data (Optional - only for credit_card)
  cardData?: {
    number: string;
    holderName: string;
    expiryMonth: string;
    expiryYear: string;
    cvc: string;
  };
  stripePaymentMethodId?: string; // New: For Apple/Google Pay express checkout
  mercadoPagoCardToken?: string;
  originalOrderId?: string;
  useSavedPaymentMethod?: boolean;
  saveCardForUpsell?: boolean;
  installments?: number; // New: Number of installments
  upgradeIntentToken?: string;
  upgradeIntentContext?: UpgradeIntentContext;
  trackingAttribution?: CheckoutTrackingAttribution;
  legalAcceptance?: {
    accepted_at: string;
    source_surface: 'public_checkout' | 'upsell';
    checkout_id: string;
    business_name: string;
    privacy_policy_version: string;
    privacy_policy_published_at?: string | null;
    privacy_policy_source: 'custom' | 'default';
    terms_of_purchase_version: string;
    terms_of_purchase_published_at?: string | null;
    terms_of_purchase_source: 'custom' | 'default';
  };
}

export interface ProcessPaymentResult {
  success: boolean;
  orderId?: string;
  gatewayStatus?: string;
  statusSignature?: string; // New: HMAC signature for secure polling (Fase 11F)
  upsellCapability?: UpsellGatewayCapability | null;
  redirectUrl?: string; // Keep for backward compatibility or fallback
  message?: string;
  // Direct Response Data
  pixData?: {
    qr_code: string;
    qr_code_base64: string;
  };
  boletoData?: {
    barcode: string;
    url: string;
  };
  requiresPaymentForm?: boolean;
  requiresAction?: boolean;
  clientSecret?: string;
  paymentMethodId?: string;
  code?: string;
}

type GatewayAttemptPlan = {
  orderedGatewayIds: string[];
  primaryGatewayId: string | null;
  backupGatewayId: string | null;
  routeIsExplicit: boolean;
  fallbackMode: 'disabled' | 'pix_backup';
};

type PixFailoverDecision = {
  shouldFailover: boolean;
  reason:
    | 'not_pix'
    | 'no_backup_available'
    | 'gateway_inactive'
    | 'gateway_temporarily_unavailable'
    | 'provider_error'
    | 'validation_or_payment_error';
};

const PIX_FAILOVER_RETRYABLE_PATTERNS = [
  /timeout/i,
  /timed out/i,
  /network/i,
  /failed to fetch/i,
  /service unavailable/i,
  /temporarily unavailable/i,
  /gateway .*not available/i,
  /gateway .*indisponivel/i,
  /invalid response/i,
  /backend is running/i,
  /\b502\b/i,
  /\b503\b/i,
  /\b504\b/i,
];

const PIX_FAILOVER_NON_RETRYABLE_PATTERNS = [
  /cpf/i,
  /cnpj/i,
  /document/i,
  /currency/i,
  /apenas para checkouts em brl/i,
  /payment rejected/i,
  /pagamento rejeitado/i,
  /rejected/i,
  /refused/i,
  /denied/i,
  /cart[aã]o/i,
  /card/i,
  /boleto/i,
  /requires additional/i,
  /dados obrigat[oó]rios/i,
];

/**
 * PAYMENT SERVICE LAYER
 * 
 * Responsabilidades:
 * 1. Receive standardized checkout request
 * 2. Identify selected Gateway
 * 3. Create local Order record (Pending)
 * 4. Delegate to Gateway Adapter (Mercado Pago, Stripe, etc.)
 * 5. Handle response and create Payment record
 * 6. Process Webhooks and update order status
 */
class PaymentService {
  // Adapter is now instantiated per request to support multiple accounts/dynamic keys

  private resolveOrderLanguage() {
    const rawLanguage = String(i18n.resolvedLanguage || i18n.language || 'pt').trim().toLowerCase();
    if (rawLanguage.startsWith('en')) return 'en';
    if (rawLanguage.startsWith('es')) return 'es';
    return 'pt';
  }

  private buildOrderMetadata(request: ProcessPaymentRequest) {
    const token = request.upgradeIntentToken?.trim();
    const context = request.upgradeIntentContext;
    const originalOrderId = request.originalOrderId?.trim();
    const postPurchaseContext = originalOrderId
      ? {
          original_order_id: originalOrderId,
          source_surface: request.offerId === 'upsell' ? 'upsell' : 'post_purchase',
          use_saved_payment_method: Boolean(request.useSavedPaymentMethod),
        }
      : null;

    const payerSnapshot = {
      name: request.customerName || null,
      email: request.customerEmail || null,
    };
    const trackingAttribution = request.trackingAttribution && typeof request.trackingAttribution === 'object'
      ? request.trackingAttribution
      : null;
    const legalAcceptance = request.legalAcceptance && typeof request.legalAcceptance === 'object'
      ? {
          accepted_at: request.legalAcceptance.accepted_at || new Date().toISOString(),
          source_surface: request.legalAcceptance.source_surface || 'public_checkout',
          checkout_id: request.legalAcceptance.checkout_id || request.checkoutId,
          business_name: request.legalAcceptance.business_name || null,
          privacy_policy_version: request.legalAcceptance.privacy_policy_version || null,
          privacy_policy_published_at: request.legalAcceptance.privacy_policy_published_at || null,
          privacy_policy_source: request.legalAcceptance.privacy_policy_source || null,
          terms_of_purchase_version: request.legalAcceptance.terms_of_purchase_version || null,
          terms_of_purchase_published_at: request.legalAcceptance.terms_of_purchase_published_at || null,
          terms_of_purchase_source: request.legalAcceptance.terms_of_purchase_source || null,
        }
      : null;

    if (!token) {
      return {
        ...(originalOrderId ? { original_order_id: originalOrderId } : {}),
        ...(postPurchaseContext ? { post_purchase: postPurchaseContext } : {}),
        payer_snapshot: payerSnapshot,
        ...(trackingAttribution ? { attribution: trackingAttribution } : {}),
        payment_context: {
          currency: request.currency || 'BRL',
          gateway_id: request.gatewayId || null,
          payment_method: request.paymentMethod || null,
          language: this.resolveOrderLanguage(),
        },
        ...(legalAcceptance ? { legal_acceptance: legalAcceptance } : {}),
        reconciliation: {
          status: 'not_required',
          reason: 'public_checkout_without_upgrade_intent',
        },
      };
    }

    return {
      upgrade_intent_token: token,
      ...(originalOrderId ? { original_order_id: originalOrderId } : {}),
      ...(postPurchaseContext ? { post_purchase: postPurchaseContext } : {}),
      upgrade_intent: {
        token,
        status: context?.status || null,
        target_plan_slug: context?.target_plan_slug || null,
        target_license_key: context?.target_license_key || null,
        checkout_id: context?.checkout_id || request.checkoutId,
        product_id: context?.product_id || null,
        source_surface: context?.source_surface || null,
        source_context: context?.source_context || {},
        expires_at: context?.expires_at || null,
        can_auto_apply: Boolean(context?.can_auto_apply),
      },
      beneficiary: {
        display_name: context?.beneficiary?.display_name || null,
        display_email_masked: context?.beneficiary?.display_email_masked || null,
        target_license_key: context?.target_license_key || null,
        target_plan_slug: context?.target_plan_slug || null,
      },
      payer_snapshot: payerSnapshot,
      ...(trackingAttribution ? { attribution: trackingAttribution } : {}),
      payment_context: {
        currency: request.currency || 'BRL',
        gateway_id: request.gatewayId || null,
        payment_method: request.paymentMethod || null,
        language: this.resolveOrderLanguage(),
      },
      ...(legalAcceptance ? { legal_acceptance: legalAcceptance } : {}),
      reconciliation: {
        status: context?.can_auto_apply ? 'intent_attached' : 'manual_review_required',
        reason: context?.can_auto_apply ? null : 'upgrade_intent_cannot_auto_apply',
      },
    };
  }

  private buildGatewayMetadata(order: Order) {
    const metadata = order.metadata && typeof order.metadata === 'object' ? order.metadata : {};
    const upgradeIntent = metadata.upgrade_intent && typeof metadata.upgrade_intent === 'object'
      ? metadata.upgrade_intent
      : {};

    return {
      order_id: order.id,
      customer_user_id: order.customer_user_id || '',
      original_order_id: metadata.original_order_id
        || (metadata.post_purchase && typeof metadata.post_purchase === 'object'
          ? metadata.post_purchase.original_order_id || ''
          : ''),
      upgrade_intent_token: metadata.upgrade_intent_token || '',
      upgrade_target_license_key: upgradeIntent.target_license_key || metadata.upgrade_target_license_key || '',
      upgrade_target_plan_slug: upgradeIntent.target_plan_slug || metadata.upgrade_target_plan_slug || '',
      upgrade_source_surface: upgradeIntent.source_surface || '',
    };
  }

  private buildDemoWebhookPayload(
    order: Order,
    overrides: Record<string, unknown> = {},
  ) {
    const metadata = order.metadata && typeof order.metadata === 'object' ? order.metadata : {};
    const paymentContext = metadata.payment_context && typeof metadata.payment_context === 'object'
      ? metadata.payment_context
      : {};

    return {
      demo: true,
      source: 'demo',
      workspace_mode: 'demo',
      scenario: metadata.demo_scenario || metadata.scenario || null,
      order_id: order.id,
      checkout_id: order.checkout_id,
      amount: order.total || order.amount || 0,
      currency: paymentContext.currency || 'BRL',
      status: order.status,
      payment_method: order.payment_method,
      customer: {
        name: order.customer_name,
        email: order.customer_email,
        phone: order.customer_phone || null,
        cpf: order.customer_cpf || null,
      },
      items: Array.isArray(order.items) ? order.items : [],
      created_at: order.created_at,
      ...overrides,
    };
  }

  private async dispatchDemoLifecycleWebhook(params: {
    event: string;
    order: Order;
    payloadOverrides?: Record<string, unknown>;
    eventAliases?: string[];
  }) {
    try {
      const payload = {
        event: params.event,
        ...this.buildDemoWebhookPayload(params.order, params.payloadOverrides),
      };

      const result = await dispatchDemoWebhookEvent({
        event: params.event,
        eventAliases: params.eventAliases,
        payload,
      });

      if (result.logs.length > 0) {
        await storage.saveWebhookLogs(result.logs);
      }
    } catch (error) {
      console.warn(`[PaymentService] Demo webhook dispatch failed for ${params.event}:`, error);
    }
  }

  private async dispatchDemoPaidWebhooks(order: Order) {
    const purchasedAt = new Date().toISOString();

    await this.dispatchDemoLifecycleWebhook({
      event: 'pagamento.aprovado',
      eventAliases: ['pedido.pago'],
      order,
      payloadOverrides: {
        status: OrderStatus.PAID,
        purchased_at: purchasedAt,
      },
    });

    if (order.payment_method === 'pix') {
      await this.dispatchDemoLifecycleWebhook({
        event: 'pix.pago',
        order,
        payloadOverrides: {
          status: OrderStatus.PAID,
          purchased_at: purchasedAt,
          pix_data: demoDataService.buildPixData(order.id, order.total || order.amount || 0),
        },
      });
    }
  }

  private async loadCheckoutRoutingGateways(checkout: Checkout | null) {
    if (!checkout) return [];

    const gatewayIds = collectCheckoutRoutingGatewayIds({
      config: checkout.config,
      gatewayId: checkout.gateway_id,
      backupGatewayId: checkout.backup_gateway_id,
    });

    if (gatewayIds.length === 0) return [];

    const gateways = await Promise.all(gatewayIds.map((gatewayId) => storage.getPublicGateway(gatewayId)));
    return gateways.filter((gateway): gateway is Gateway => Boolean(gateway?.id));
  }

  private resolveGatewayAttemptPlan(params: {
    checkout: Checkout | null;
    paymentMethod: PaymentMethodType;
    requestedGatewayId: string;
    gateways: Gateway[];
  }): GatewayAttemptPlan {
    const emptyPlan: GatewayAttemptPlan = {
      orderedGatewayIds: [],
      primaryGatewayId: null,
      backupGatewayId: null,
      routeIsExplicit: false,
      fallbackMode: 'disabled',
    };

    const requestedGatewayId = String(params.requestedGatewayId || '').trim() || null;

    if (!params.checkout) {
      return {
        ...emptyPlan,
        orderedGatewayIds: requestedGatewayId ? [requestedGatewayId] : [],
        primaryGatewayId: requestedGatewayId,
        backupGatewayId: null,
      };
    }

    const normalizedRouting = normalizeCheckoutPaymentRouting({
      config: params.checkout.config,
      gatewayId: params.checkout.gateway_id,
      backupGatewayId: params.checkout.backup_gateway_id,
      gateways: params.gateways,
    });
    const route = normalizedRouting[params.paymentMethod];
    const allowedGatewayIds = getAllowedGatewayIdsForPaymentMethod({
      config: params.checkout.config,
      gatewayId: params.checkout.gateway_id,
      backupGatewayId: params.checkout.backup_gateway_id,
      paymentMethod: params.paymentMethod,
      gateways: params.gateways,
    });
    const routeIsExplicit = Boolean(params.checkout.config?.payment_routing?.[params.paymentMethod]);

    const preferredGatewayId = [
      route?.primary_gateway_id || null,
      requestedGatewayId,
      allowedGatewayIds[0] || null,
    ].find((gatewayId): gatewayId is string => Boolean(gatewayId));

    if (!preferredGatewayId) {
      return {
        ...emptyPlan,
        routeIsExplicit,
      };
    }
    const fallbackAllowedForMethod = params.paymentMethod === 'pix';
    const explicitBackupGatewayId = route?.backup_gateway_id || null;
    const derivedBackupGatewayId = allowedGatewayIds.find((gatewayId) => gatewayId !== preferredGatewayId) || null;
    const backupGatewayId = fallbackAllowedForMethod
      ? [explicitBackupGatewayId, derivedBackupGatewayId]
          .find((gatewayId): gatewayId is string => Boolean(gatewayId && gatewayId !== preferredGatewayId))
        || null
      : null;
    const orderedGatewayIds: string[] = [preferredGatewayId];

    if (backupGatewayId) {
      orderedGatewayIds.push(backupGatewayId);
    }

    return {
      orderedGatewayIds,
      primaryGatewayId: preferredGatewayId,
      backupGatewayId,
      routeIsExplicit,
      fallbackMode: backupGatewayId ? 'pix_backup' : 'disabled',
    };
  }

  private getGatewayAttemptRole(plan: GatewayAttemptPlan, gatewayId: string) {
    if (gatewayId === plan.primaryGatewayId) return 'primary';
    if (gatewayId === plan.backupGatewayId) return 'backup';
    return 'candidate';
  }

  private decidePixFailover(params: {
    paymentMethod: PaymentMethodType;
    hasNextGateway: boolean;
    message?: string | null;
    gatewayInactive?: boolean;
  }): PixFailoverDecision {
    if (params.paymentMethod !== 'pix') {
      return { shouldFailover: false, reason: 'not_pix' };
    }

    if (!params.hasNextGateway) {
      return { shouldFailover: false, reason: 'no_backup_available' };
    }

    if (params.gatewayInactive) {
      return { shouldFailover: true, reason: 'gateway_inactive' };
    }

    const normalizedMessage = String(params.message || '').trim();
    if (!normalizedMessage) {
      return { shouldFailover: true, reason: 'provider_error' };
    }

    if (PIX_FAILOVER_RETRYABLE_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
      return { shouldFailover: true, reason: 'gateway_temporarily_unavailable' };
    }

    if (PIX_FAILOVER_NON_RETRYABLE_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
      return { shouldFailover: false, reason: 'validation_or_payment_error' };
    }

    return { shouldFailover: true, reason: 'provider_error' };
  }

  private async updatePaymentRoutingAudit(
    orderId: string,
    apply: (currentRuntime: Record<string, any>, metadata: Record<string, any>) => {
      nextRuntime: Record<string, any>;
      nextPaymentContext?: Record<string, any> | null;
    }
  ) {
    if (isDemoDataRuntime()) return;

    try {
      const { data, error } = await supabase
        .from('orders')
        .select('metadata')
        .eq('id', orderId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      const metadata = normalizeOrderMetadata(data?.metadata);
      const currentRuntime = normalizeOrderMetadata(metadata.payment_routing_runtime);
      const currentPaymentContext = normalizeOrderMetadata(metadata.payment_context);
      const { nextRuntime, nextPaymentContext } = apply(currentRuntime, metadata);

      await mergeOrderMetadata(supabase, orderId, {
        payment_context: nextPaymentContext
          ? {
              ...currentPaymentContext,
              ...nextPaymentContext,
            }
          : currentPaymentContext,
        payment_routing_runtime: nextRuntime,
      });
    } catch (auditError) {
      console.warn('[PaymentService] Failed to persist payment routing audit trail:', auditError);
    }
  }

  private async initializePaymentRoutingAudit(order: Order, plan: GatewayAttemptPlan, gateways: Gateway[]) {
    const nowIso = new Date().toISOString();
    const gatewayNamesById = gateways.reduce<Record<string, string>>((acc, gateway) => {
      acc[gateway.id] = gateway.name;
      return acc;
    }, {});

    await this.updatePaymentRoutingAudit(order.id, (currentRuntime) => ({
      nextPaymentContext: {
        gateway_id: plan.primaryGatewayId,
        payment_method: order.payment_method,
      },
      nextRuntime: {
        ...currentRuntime,
        initialized_at: currentRuntime.initialized_at || nowIso,
        updated_at: nowIso,
        strategy: plan.fallbackMode === 'pix_backup' ? 'pix_first_with_backup' : 'single_gateway',
        payment_method: order.payment_method,
        primary_gateway_id: plan.primaryGatewayId,
        backup_gateway_id: plan.backupGatewayId,
        ordered_gateway_ids: plan.orderedGatewayIds,
        ordered_gateways: plan.orderedGatewayIds.map((gatewayId) => ({
          gateway_id: gatewayId,
          gateway_name: gatewayNamesById[gatewayId] || null,
          route_role: this.getGatewayAttemptRole(plan, gatewayId),
        })),
        route_is_explicit: plan.routeIsExplicit,
        fallback_enabled: plan.fallbackMode === 'pix_backup',
        fallback_used: false,
        final_status: 'pending',
        attempts: Array.isArray(currentRuntime.attempts) ? currentRuntime.attempts : [],
      },
    }));
  }

  private async recordPaymentRoutingAttempt(params: {
    orderId: string;
    plan: GatewayAttemptPlan;
    attemptNumber: number;
    gatewayId: string;
    gatewayName?: string | null;
    startedAt: string;
    finishedAt: string;
    outcome: 'success' | 'failed' | 'requires_payment_form';
    message?: string | null;
    gatewayStatus?: string | null;
    failoverDecision?: PixFailoverDecision | null;
    winnerGatewayId?: string | null;
  }) {
    await this.updatePaymentRoutingAudit(params.orderId, (currentRuntime) => {
      const attempts = Array.isArray(currentRuntime.attempts) ? currentRuntime.attempts : [];
      const fallbackTriggered = Boolean(
        params.outcome === 'failed'
          && params.failoverDecision?.shouldFailover
          && params.plan.backupGatewayId
          && params.gatewayId !== params.plan.backupGatewayId
      );

      const nextFinalStatus = params.outcome === 'success'
        ? 'succeeded'
        : params.outcome === 'requires_payment_form'
          ? 'requires_payment_form'
          : fallbackTriggered
            ? 'pending'
            : 'failed';

      return {
        nextPaymentContext: params.winnerGatewayId
          ? { gateway_id: params.winnerGatewayId }
          : null,
        nextRuntime: {
          ...currentRuntime,
          updated_at: params.finishedAt,
          fallback_used: Boolean(currentRuntime.fallback_used) || params.gatewayId === params.plan.backupGatewayId,
          winner_gateway_id: params.winnerGatewayId || currentRuntime.winner_gateway_id || null,
          final_status: nextFinalStatus,
          final_error: nextFinalStatus === 'failed'
            ? params.message || currentRuntime.final_error || null
            : nextFinalStatus === 'pending'
              ? currentRuntime.final_error || null
              : null,
          attempts: [
            ...attempts,
            {
              attempt_number: params.attemptNumber,
              gateway_id: params.gatewayId,
              gateway_name: params.gatewayName || null,
              route_role: this.getGatewayAttemptRole(params.plan, params.gatewayId),
              started_at: params.startedAt,
              finished_at: params.finishedAt,
              outcome: params.outcome,
              message: params.message || null,
              gateway_status: params.gatewayStatus || null,
              failover_decision: params.failoverDecision
                ? {
                    should_failover: params.failoverDecision.shouldFailover,
                    reason: params.failoverDecision.reason,
                    fallback_triggered: fallbackTriggered,
                  }
                : null,
            },
          ],
        },
      };
    });
  }

  private async finalizePaymentRoutingFailure(orderId: string, message: string) {
    await this.updatePaymentRoutingAudit(orderId, (currentRuntime) => ({
      nextRuntime: {
        ...currentRuntime,
        updated_at: new Date().toISOString(),
        final_status: 'failed',
        final_error: message || currentRuntime.final_error || 'Payment processing failed',
      },
    }));
  }

  /**
   * MOTOR FINANCEIRO HÍBRIDO
   * Retorna parcelas dinâmicas baseadas na Moeda, Gateway e BIN do Cartão.
   * - USD/EUR: Retorna apenas 1x (À Vista) — padrão internacional.
   * - BRL + Mercado Pago: Usa API real do MP (/installments) com juros exatos.
   * - BRL + Stripe (ou outro): Usa calculadora interna (Tabela Price).
   */
  async getPaymentOptions(
    gatewayId: string,
    amount: number,
    currency: string,
    bin?: string
  ): Promise<InstallmentOption[]> {
    try {
      // === EARLY RETURN: Moedas internacionais não parcelam ===
      const upperCurrency = currency.toUpperCase();
      if (upperCurrency !== 'BRL') {
        const symbol = upperCurrency === 'USD' ? '$' : '€';
        return [{
          installments: 1,
          installmentAmount: amount,
          totalAmount: amount,
          label: `${symbol} ${amount.toFixed(2)} (${i18n.t('a_vista', 'À vista')})`
        }];
      }

      // === BRL: Verificar Gateway ===
      const gateway = await storage.getPublicGateway(gatewayId);
      
      if (!gateway || !gateway.active) {
        return [{
          installments: 1,
          installmentAmount: amount,
          totalAmount: amount,
          label: `1x de R$ ${amount.toFixed(2).replace('.', ',')} (${i18n.t('a_vista', 'À vista')})`
        }];
      }

      // Extrair configurações dinâmicas do gateway
      const maxInst = gateway.config?.max_installments ?? 12;
      const minInstVal = gateway.config?.min_installment_value ?? 5.00;
      const stripeInterest = gateway.config?.interest_rate ?? 2.99;

      switch (gateway.name) {
        case GatewayProvider.MERCADO_PAGO: {
          if (!bin || bin.length < 6) {
            // Sem BIN, fallback simples usando a trava configurada
            return this.generateSimpleInstallments(amount, maxInst, minInstVal);
          }
          const proxyBaseUrl = '/mp-api';
          const mpAdapter = new MercadoPagoAdapter(gateway.private_key || '', {
            isProduction: false,
            baseUrl: proxyBaseUrl
          });
          const mpInstallments = await mpAdapter.getInstallments(amount, bin, gateway.public_key, minInstVal);
          return mpInstallments.length > 0 ? mpInstallments : this.generateSimpleInstallments(amount, maxInst, minInstVal);
        }

        case GatewayProvider.STRIPE: {
          const stripeAdapter = new StripeAdapter();
          return stripeAdapter.getInstallments(amount, maxInst, stripeInterest, minInstVal);
        }

        default:
          return this.generateSimpleInstallments(amount, maxInst, minInstVal);
      }
    } catch (error) {
      console.error('[PaymentService] Error getting payment options:', error);
      return [{
        installments: 1,
        installmentAmount: amount,
        totalAmount: amount,
        label: `1x de R$ ${amount.toFixed(2).replace('.', ',')} (${i18n.t('a_vista', 'À vista')})`
      }];
    }
  }

  /**
   * Fallback simples: Gera lista 1x-12x sem juros quando o adapter não responde.
   */
  private generateSimpleInstallments(amount: number, max: number = 12, minInstallmentAmount: number = 5.00): InstallmentOption[] {
    const options: InstallmentOption[] = [];

    // 1x is always allowed
    options.push({
      installments: 1,
      installmentAmount: amount,
      totalAmount: amount,
      label: `1x de R$ ${amount.toFixed(2).replace('.', ',')} (${i18n.t('a_vista', 'À vista')})`
    });

    for (let i = 2; i <= max; i++) {
      const installmentAmount = amount / i;
      
      // Filter by minimum amount
      if (installmentAmount < minInstallmentAmount) continue;

      options.push({
        installments: i,
        installmentAmount,
        totalAmount: amount,
        label: `${i}x de R$ ${installmentAmount.toFixed(2).replace('.', ',')} (${i18n.t('sem_juros', 'Sem juros')})`
      });
    }
    return options;
  }

  /**
   * ORQUESTRAÇÃO DE PAGAMENTO COM FAILOVER
   * Tenta processar no gateway principal. Se falhar e houver backup, tenta no backup.
   */
  async processPayment(request: ProcessPaymentRequest): Promise<ProcessPaymentResult> {
    try {
      console.log('[PaymentService] processPayment started');
      
      // 1. Carregar configuração do Checkout para verificar se tem Backup
      const checkout = await storage.getPublicCheckout(request.checkoutId);
      const routingGateways = await this.loadCheckoutRoutingGateways(checkout);
      const attemptPlan = this.resolveGatewayAttemptPlan({
        checkout,
        paymentMethod: request.paymentMethod,
        requestedGatewayId: request.gatewayId,
        gateways: routingGateways,
      });
      const gatewaysToTry = attemptPlan.orderedGatewayIds;

      if (gatewaysToTry.length === 0) {
        return {
          success: false,
          message: 'Nenhum gateway compativel ativo foi encontrado para este metodo de pagamento.',
        };
      }

      const resolvedRequest: ProcessPaymentRequest = {
        ...request,
        gatewayId: gatewaysToTry[0],
      };

      let lastError = '';
      const currentOrder: Order = {
        id: generateUUID(),
        checkout_id: request.checkoutId,
        offer_id: (request.offerId === 'direct' || request.offerId === 'upsell') ? undefined : request.offerId,
        amount: request.amount,
        customer_email: request.customerEmail,
        customer_name: request.customerName,
        customer_phone: request.customerPhone,
        customer_cpf: request.customerCpf,
        status: OrderStatus.PENDING,
        payment_method: resolvedRequest.paymentMethod,
        utm_source: resolvedRequest.trackingAttribution?.utm_source || undefined,
        utm_medium: resolvedRequest.trackingAttribution?.utm_medium || undefined,
        utm_campaign: resolvedRequest.trackingAttribution?.utm_campaign || undefined,
        items: resolvedRequest.items,
        metadata: this.buildOrderMetadata(resolvedRequest),
        created_at: new Date().toISOString(),
        customer_user_id: resolvedRequest.customerUserId,
      };

      await storage.createOrder(currentOrder);
      await this.initializePaymentRoutingAudit(currentOrder, attemptPlan, routingGateways);

      for (const [attemptIndex, gatewayId] of gatewaysToTry.entries()) {
        const hasNextGateway = attemptIndex < gatewaysToTry.length - 1;
        const startedAt = new Date().toISOString();
        try {
          console.log(`[PaymentService] Attempting payment with gateway: ${gatewayId}`);
          const gateway = await storage.getPublicGateway(gatewayId);
          
          if (!gateway || !gateway.active) {
            lastError = `Gateway ${gatewayId} is not available/active`;
            console.warn(`[PaymentService] ${lastError}`);
            const failoverDecision = this.decidePixFailover({
              paymentMethod: request.paymentMethod,
              hasNextGateway,
              message: lastError,
              gatewayInactive: true,
            });
            await this.recordPaymentRoutingAttempt({
              orderId: currentOrder.id,
              plan: attemptPlan,
              attemptNumber: attemptIndex + 1,
              gatewayId,
              startedAt,
              finishedAt: new Date().toISOString(),
              outcome: 'failed',
              message: lastError,
              failoverDecision,
            });
            if (failoverDecision.shouldFailover) {
              continue;
            }
            break;
          }

          const attemptRequest = gatewayId === resolvedRequest.gatewayId
            ? resolvedRequest
            : { ...resolvedRequest, gatewayId };

          if (gateway.config?.demo) {
            return await this.processDemoGateway(gateway, currentOrder, attemptRequest);
          }

          // Executar roteamento
          let gatewayResponse: ProcessPaymentResult;
          switch (gateway.name) {
            case GatewayProvider.MERCADO_PAGO:
              gatewayResponse = await this.processMercadoPago(gateway, currentOrder, attemptRequest);
              break;
            case GatewayProvider.STRIPE:
              gatewayResponse = await this.processStripe(gateway, currentOrder, attemptRequest);
              break;
            case GatewayProvider.PAGSEGURO:
              gatewayResponse = await this.processPagSeguro(gateway, currentOrder, attemptRequest);
              break;
            case GatewayProvider.ASAAS:
              gatewayResponse = await this.processAsaas(gateway, currentOrder, attemptRequest);
              break;
            default:
              gatewayResponse = { success: false, message: i18n.t('unknown_gateway') };
          }

          if (gatewayResponse.success) {
            console.log(`[PaymentService] Payment SUCCESS with gateway: ${gatewayId}`);
            await this.recordPaymentRoutingAttempt({
              orderId: currentOrder.id,
              plan: attemptPlan,
              attemptNumber: attemptIndex + 1,
              gatewayId,
              gatewayName: gateway.name,
              startedAt,
              finishedAt: new Date().toISOString(),
              outcome: 'success',
              message: gatewayResponse.message || null,
              gatewayStatus: gatewayResponse.gatewayStatus || null,
              winnerGatewayId: gatewayId,
            });
            // Post-payment side effects must stay server-side. The Vercel payment
            // handlers/webhooks fulfill the order and send the tokenized access email.
            return {
              ...gatewayResponse,
              success: true,
              orderId: gatewayResponse.orderId || currentOrder.id,
            };
          } else if (gatewayResponse.requiresPaymentForm) {
            console.warn(`[PaymentService] Payment requires additional confirmation with gateway ${gatewayId}.`);
            await this.recordPaymentRoutingAttempt({
              orderId: currentOrder.id,
              plan: attemptPlan,
              attemptNumber: attemptIndex + 1,
              gatewayId,
              gatewayName: gateway.name,
              startedAt,
              finishedAt: new Date().toISOString(),
              outcome: 'requires_payment_form',
              message: gatewayResponse.message || null,
              gatewayStatus: gatewayResponse.gatewayStatus || null,
              winnerGatewayId: gatewayId,
            });
            try {
              await this.updateOrderStatus(currentOrder.id, OrderStatus.FAILED);
            } catch (statusError) {
              console.warn('[PaymentService] Failed to mark preliminary order as failed:', statusError);
            }
            return {
              ...gatewayResponse,
              orderId: gatewayResponse.orderId || currentOrder.id,
            };
          } else {
            console.warn(`[PaymentService] Payment FAILED with gateway ${gatewayId}: ${gatewayResponse.message}`);
            lastError = gatewayResponse.message || 'Unknown error';
            const failoverDecision = this.decidePixFailover({
              paymentMethod: request.paymentMethod,
              hasNextGateway,
              message: lastError,
            });
            await this.recordPaymentRoutingAttempt({
              orderId: currentOrder.id,
              plan: attemptPlan,
              attemptNumber: attemptIndex + 1,
              gatewayId,
              gatewayName: gateway.name,
              startedAt,
              finishedAt: new Date().toISOString(),
              outcome: 'failed',
              message: lastError,
              gatewayStatus: gatewayResponse.gatewayStatus || null,
              failoverDecision,
            });
            if (failoverDecision.shouldFailover) {
              continue;
            }
            break;
          }
        } catch (attemptError: any) {
          console.error(`[PaymentService] Exception during gateway attempt ${gatewayId}:`, attemptError);
          lastError = attemptError.message;
          const failoverDecision = this.decidePixFailover({
            paymentMethod: request.paymentMethod,
            hasNextGateway,
            message: lastError,
          });
          await this.recordPaymentRoutingAttempt({
            orderId: currentOrder.id,
            plan: attemptPlan,
            attemptNumber: attemptIndex + 1,
            gatewayId,
            startedAt,
            finishedAt: new Date().toISOString(),
            outcome: 'failed',
            message: lastError,
            failoverDecision,
          });
          if (failoverDecision.shouldFailover) {
            continue;
          }
          break;
        }
      }

      // Se chegou aqui, todos os gateways falharam
      await this.finalizePaymentRoutingFailure(currentOrder.id, lastError || 'Payment processing failed');
      try {
        await this.updateOrderStatus(currentOrder.id, OrderStatus.FAILED);
      } catch (e) {}
      
      return { success: false, message: lastError || 'Payment processing failed' };

    } catch (error: any) {
      console.error('[PaymentService] Critical error in processPayment:', error);
      return { success: false, message: error.message || 'Payment processing failed' };
    }
  }

  // --- Gateway Adapters ---

  private async processDemoGateway(
    gateway: Gateway,
    order: Order,
    request: ProcessPaymentRequest
  ): Promise<ProcessPaymentResult> {
    try {
      const demoMember = await demoDataService.resolveOrCreateMember({
        requestedUserId: request.customerUserId || order.customer_user_id || null,
        email: request.customerEmail || order.customer_email,
        fullName: request.customerName || order.customer_name,
      });
      const selectedScenario = await demoDataService.getSelectedScenario(order.checkout_id, request.paymentMethod);
      const scenario = request.paymentMethod === 'pix'
        ? (selectedScenario === 'rejected' ? 'pix_pending' : selectedScenario)
        : selectedScenario === 'rejected'
          ? 'rejected'
          : 'approved';
      const statusSignature = `demo:${order.id}`;
      const metadata = order.metadata && typeof order.metadata === 'object' ? order.metadata : {};
      const baseOrder: Order = {
        ...order,
        customer_user_id: demoMember.id,
        customer_email: demoMember.email,
        customer_name: request.customerName || demoMember.full_name,
        total: order.total || order.amount,
        metadata: {
          ...metadata,
          demo: true,
          demo_scenario: scenario,
          demo_status_signature: statusSignature,
        },
      };

      if (request.paymentMethod === 'pix') {
        const autoApprove = scenario === 'pix_paid' || scenario === 'approved';
        const pendingOrder: Order = {
          ...baseOrder,
          status: OrderStatus.PENDING,
          metadata: {
            ...baseOrder.metadata,
            demo_gateway_status: 'pending',
            demo_auto_approve_at: autoApprove ? new Date(Date.now() + 4000).toISOString() : null,
            order_deliverables: [],
          },
        };

        await demoDataService.saveOrders([pendingOrder]);
        await demoDataService.upsertPayment({
          id: `demo-payment:${order.id}`,
          order_id: order.id,
          gateway_id: gateway.id,
          status: OrderStatus.PENDING,
          transaction_id: `demo-pix-${order.id}`,
          raw_response: JSON.stringify({
            demo: true,
            scenario,
            payment_method: request.paymentMethod,
          }),
          created_at: new Date().toISOString(),
        });

        await this.dispatchDemoLifecycleWebhook({
          event: 'pedido.criado',
          order: pendingOrder,
          payloadOverrides: {
            status: OrderStatus.PENDING,
          },
        });
        await this.dispatchDemoLifecycleWebhook({
          event: 'pix.gerado',
          order: pendingOrder,
          payloadOverrides: {
            status: OrderStatus.PENDING,
            pix_data: demoDataService.buildPixData(order.id, order.amount || 0),
          },
        });

        return {
          success: true,
          orderId: order.id,
          gatewayStatus: 'pending',
          statusSignature,
          pixData: demoDataService.buildPixData(order.id, order.amount || 0),
          message: autoApprove ? 'pending_auto_confirm' : 'pending',
        };
      }

      if (scenario === 'rejected') {
        const failedOrder: Order = {
          ...baseOrder,
          status: OrderStatus.FAILED,
          metadata: {
            ...baseOrder.metadata,
            demo_gateway_status: 'rejected',
            demo_auto_approve_at: null,
            order_deliverables: [],
          },
        };

        await demoDataService.saveOrders([failedOrder]);
        await demoDataService.upsertPayment({
          id: `demo-payment:${order.id}`,
          order_id: order.id,
          gateway_id: gateway.id,
          status: OrderStatus.FAILED,
          transaction_id: `demo-card-${order.id}`,
          raw_response: JSON.stringify({
            demo: true,
            scenario,
            payment_method: request.paymentMethod,
          }),
          created_at: new Date().toISOString(),
        });

        await this.dispatchDemoLifecycleWebhook({
          event: 'pedido.criado',
          order: failedOrder,
          payloadOverrides: {
            status: OrderStatus.PENDING,
          },
        });
        await this.dispatchDemoLifecycleWebhook({
          event: 'pagamento.rejeitado',
          order: failedOrder,
          payloadOverrides: {
            status: OrderStatus.FAILED,
          },
        });

        return {
          success: false,
          orderId: order.id,
          gatewayStatus: 'rejected',
          message: 'Pagamento demo recusado pelo cenario selecionado.',
        };
      }

      const approvedOrder: Order = {
        ...baseOrder,
        status: OrderStatus.PENDING,
        metadata: {
          ...baseOrder.metadata,
          demo_gateway_status: 'approved',
          demo_auto_approve_at: null,
        },
      };

      await demoDataService.saveOrders([approvedOrder]);
      await demoDataService.upsertPayment({
        id: `demo-payment:${order.id}`,
        order_id: order.id,
        gateway_id: gateway.id,
        status: OrderStatus.PAID,
        transaction_id: `demo-card-${order.id}`,
        raw_response: JSON.stringify({
          demo: true,
          scenario,
          payment_method: request.paymentMethod,
        }),
        created_at: new Date().toISOString(),
      });
      await this.dispatchDemoLifecycleWebhook({
        event: 'pedido.criado',
        order: approvedOrder,
        payloadOverrides: {
          status: OrderStatus.PENDING,
        },
      });
      await demoDataService.markOrderPaid(order.id);

      return {
        success: true,
        orderId: order.id,
        gatewayStatus: 'approved',
        statusSignature,
      };
    } catch (error: any) {
      console.error('[PaymentService] Demo gateway error:', error);
      return {
        success: false,
        message: error?.message || 'Falha ao processar pagamento demo.',
      };
    }
  }

  private async processMercadoPago(
    gateway: Gateway,
    order: Order,
    request: ProcessPaymentRequest
  ): Promise<ProcessPaymentResult> {
    // Initialize Adapter with Dynamic Credentials from DB
    // In Zero-Trust v4, private_key is NEVER sent to the frontend.
    // We only require public_key for card tokenization if applicable.
    if (!gateway.public_key) {
      return { success: false, message: 'O pagamento por cartao esta indisponivel no momento. Tente novamente mais tarde.' };
    }

    // Force the adapter to use the stable Vercel URL for the proxy to avoid custom domain issues
    // We use ?endpoint= so the adapter appends    // Use relative path to avoid CORS (Same-Origin)
    // In development, this requires a Vite proxy or will fail (but user is testing prod)
    const proxyBaseUrl = '/mp-api';
    debugPayment('[PaymentService] Initializing Mercado Pago adapter.');

    // Initializing MP Adapter ONLY for tokenization (uses public_key)
    const mpAdapter = new MercadoPagoAdapter('', {
      isProduction: false,
      baseUrl: proxyBaseUrl
    });

    try {
      let token = request.mercadoPagoCardToken;
      let saveCardToken = undefined;
      let mpPaymentMethodId = undefined;
      let mpIssuer = undefined;

      // 1. Prepare Token for Credit Card (Tokenization still happens on client via proxy)
      if (request.paymentMethod === 'credit_card') {
        const payerDocument = String(request.customerCpf || '').replace(/\D/g, '');
        if (payerDocument.length !== 11 && payerDocument.length !== 14) {
          throw new Error('Mercado Pago requires a valid CPF or CNPJ for credit card payments.');
        }

        if (!token) {
          if (!request.cardData) {
            throw new Error(i18n.t('card_data_required'));
          }

          const rawYear = request.cardData.expiryYear.toString().trim();
          const expiration_year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
          const tokenizationPayload = {
            card_number: request.cardData.number.replace(/\s/g, ''),
            expiration_month: request.cardData.expiryMonth.padStart(2, '0'),
            expiration_year: expiration_year,
            security_code: request.cardData.cvc,
            cardholder: {
              name: request.cardData.holderName,
              identification: {
                type: payerDocument.length === 14 ? 'CNPJ' : 'CPF',
                number: payerDocument,
              }
            }
          };

          // Fiel ao Ponto 2: Capturar token, paymentMethodId e issuerId
          const { token: mpToken, paymentMethodId: mpBrand, issuerId } = await mpAdapter.createCardToken(
            tokenizationPayload,
            gateway.public_key,
          );

          token = mpToken;
          mpPaymentMethodId = mpBrand || this.detectCardBrand(request.cardData.number);
          mpIssuer = issuerId;

          if (!request.useSavedPaymentMethod && request.saveCardForUpsell) {
            try {
              const vaultTokenResponse = await mpAdapter.createCardToken(tokenizationPayload, gateway.public_key);
              saveCardToken = vaultTokenResponse.token;
            } catch (vaultTokenError) {
              debugPayment('[PaymentService] Failed to generate Mercado Pago vault token for upsell reuse.', vaultTokenError);
            }
          }

          debugPayment('[PaymentService] Mercado Pago card tokenized.');
        } else if (!request.useSavedPaymentMethod && request.cardData) {
          mpPaymentMethodId = this.detectCardBrand(request.cardData.number);
        }
      }

      // 2. Delegate Payment Creation to Backend Hub (v4 Protection)
      // Prices are recalculated server-side using checkoutId and selectedBumps.
      debugPayment('[PaymentService] Calling Mercado Pago payment hub.');
      
      const response = await fetch('/api/payments?action=mercadopago', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            checkoutId: order.checkout_id,
            orderId: order.id,
            gatewayId: gateway.id,
            paymentMethod: request.paymentMethod,
            paymentMethodId: mpPaymentMethodId, // 'visa', 'master', etc
            issuerId: mpIssuer, // Passar o ID do emissor para o backend
            cardBin: request.paymentMethod === 'credit_card' && request.cardData ? request.cardData.number.replace(/\s/g, '').substring(0, 6) : undefined,
            selectedBumpIds: request.selectedBumps,
            customerEmail: order.customer_email,
            customerName: order.customer_name,
            customerPhone: order.customer_phone,
            customerCpf: order.customer_cpf,
            cardToken: token,
            saveCardToken,
            originalOrderId: request.originalOrderId,
            useSavedPaymentMethod: request.useSavedPaymentMethod === true,
            installments: request.installments || 1,
            total: order.amount || 0
          })
        });

      const result = await response.json();

      if ((!response.ok || !result.success) && result.code === 'UPSELL_REQUIRES_PAYMENT_FORM') {
        return {
          success: false,
          message: result.error || result.message || 'A confirmação adicional do cartão é necessária para concluir este item.',
          code: result.code,
          requiresPaymentForm: true,
          upsellCapability: result.upsellCapability || null,
        };
      }

      if (!response.ok || !result.success) {
        debugPayment('[PaymentService] Mercado Pago payment hub rejected the request.', {
          status: response.status,
          code: result?.code || null,
        });
        throw new Error(getSafeMercadoPagoErrorMessage(result?.error));
      }

      const publicPaymentSummary = {
        id: typeof result.paymentId === 'string' ? result.paymentId : '',
        status: typeof result.status === 'string' ? result.status : '',
        point_of_interaction: request.paymentMethod === 'pix' && result.pixData ? {
          transaction_data: {
            qr_code: typeof result.pixData.qr_code === 'string' ? result.pixData.qr_code : '',
            qr_code_base64: typeof result.pixData.qr_code_base64 === 'string' ? result.pixData.qr_code_base64 : '',
          },
        } : undefined,
      };

      // 3. Record Payment locally
      const newPayment: Payment = {
        id: generateUUID(),
        order_id: order.id,
        gateway_id: gateway.id,
        status: mpAdapter.translateStatus(publicPaymentSummary.status),
        transaction_id: publicPaymentSummary.id || order.id,
        raw_response: buildSafeMercadoPagoRawResponse(publicPaymentSummary),
        created_at: new Date().toISOString()
      };

      try {
        await this.savePayment(newPayment);
      } catch (err) {
        debugPayment('[PaymentService] Local Mercado Pago payment persistence failed.', err);
      }

      debugPayment('[PaymentService] Mercado Pago payment response received.');

      const normalizedGatewayStatus = String(publicPaymentSummary.status || '').toLowerCase();

      if (
        normalizedGatewayStatus === 'approved'
        || normalizedGatewayStatus === 'authorized'
        || normalizedGatewayStatus === 'in_process'
        || normalizedGatewayStatus === 'pending'
      ) {
        const paymentResult: ProcessPaymentResult = {
          success: true,
          gatewayStatus: normalizedGatewayStatus,
          message: normalizedGatewayStatus,
          statusSignature: result.statusSignature,
          upsellCapability: result.upsellCapability || null,
        };

        // Mercado Pago can return the same top-level statuses for card and Pix.
        // Only attach QR data when the request itself was a Pix payment.
        if (request.paymentMethod === 'pix') {
          paymentResult.pixData = {
            qr_code: publicPaymentSummary.point_of_interaction?.transaction_data?.qr_code || '',
            qr_code_base64: publicPaymentSummary.point_of_interaction?.transaction_data?.qr_code_base64 || ''
          };
        }

        return paymentResult;
      } else {
        return {
          success: false,
          message: i18n.t('payment_rejected')
        };
      }

    } catch (error: any) {
      debugPayment('[PaymentService] Mercado Pago payment failed.', error);
      return {
        success: false,
        message: getSafeMercadoPagoErrorMessage(error)
      };
    }
  }

  private detectCardBrand(number: string): string {
    const clean = number.replace(/\D/g, '');
    if (/^4/.test(clean)) return 'visa';
    if (/^5[1-5]/.test(clean)) return 'master';
    if (/^3[47]/.test(clean)) return 'amex';
    if (/^6/.test(clean)) return 'elo';
    return 'master';
  }

  private mapPagSeguroOrderStatus(status: string): OrderStatus {
    const normalized = mapPagSeguroStatusToLocal(status);
    switch (normalized) {
      case 'paid':
        return OrderStatus.PAID;
      case 'failed':
        return OrderStatus.FAILED;
      case 'refunded':
        return OrderStatus.REFUNDED;
      case 'canceled':
        return OrderStatus.CANCELED;
      default:
        return OrderStatus.PENDING;
    }
  }

  private mapAsaasOrderStatus(status: string, billingType?: string): OrderStatus {
    const normalized = mapAsaasStatusToLocal(status, billingType);
    switch (normalized) {
      case 'paid':
        return OrderStatus.PAID;
      case 'refunded':
        return OrderStatus.REFUNDED;
      case 'canceled':
        return OrderStatus.CANCELED;
      default:
        return OrderStatus.PENDING;
    }
  }

  private async processPagSeguro(
    gateway: Gateway,
    order: Order,
    request: ProcessPaymentRequest
  ): Promise<ProcessPaymentResult> {
    try {
      if (String(request.currency || '').trim().toUpperCase() !== 'BRL') {
        throw new Error('O PagBank esta disponivel apenas para checkouts em BRL.');
      }

      const payerDocument = String(request.customerCpf || '').replace(/\D/g, '');
      if (payerDocument.length !== 11 && payerDocument.length !== 14) {
        throw new Error('O PagBank exige um CPF ou CNPJ valido para concluir a compra.');
      }

      if (request.paymentMethod === 'boleto') {
        throw new Error('O boleto do PagBank sera habilitado quando o checkout coletar endereco de cobranca completo.');
      }

      let encryptedCard: string | undefined;
      if (request.paymentMethod === 'credit_card') {
        if (!gateway.public_key) {
          throw new Error('PagBank public key missing in settings.');
        }

        if (!request.cardData) {
          throw new Error(i18n.t('card_data_required'));
        }

        encryptedCard = await encryptPagSeguroCard({
          publicKey: gateway.public_key,
          holder: request.cardData.holderName || request.customerName,
          number: request.cardData.number,
          expMonth: request.cardData.expiryMonth,
          expYear: request.cardData.expiryYear,
          securityCode: request.cardData.cvc,
        });
      }

      const response = await fetch('/api/payments?action=pagseguro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkoutId: order.checkout_id,
          orderId: order.id,
          gatewayId: gateway.id,
          paymentMethod: request.paymentMethod,
          encryptedCard,
          installments: request.installments || 1,
          selectedBumpIds: request.selectedBumps,
          customerEmail: order.customer_email,
          customerName: order.customer_name,
          customerPhone: order.customer_phone,
          customerCpf: order.customer_cpf,
          originalOrderId: request.originalOrderId,
          total: order.amount || 0,
        }),
      });

      const responseText = await response.text();
      let result: any = {};

      try {
        result = responseText ? JSON.parse(responseText) : {};
      } catch (parseError) {
        console.error('[PaymentService] Failed to parse PagBank response:', responseText);
        throw new Error(`Invalid PagBank response (Status ${response.status}).`);
      }

      if (!response.ok || !result.success) {
        throw new Error(result.error || result.message || 'Erro ao processar pagamento no PagBank.');
      }

      const providerStatus = String(result.status || 'WAITING').trim().toUpperCase();
      const publicPaymentSummary = {
        id: typeof result.paymentId === 'string' ? result.paymentId : '',
        status: providerStatus,
      };
      const newPayment: Payment = {
        id: generateUUID(),
        order_id: order.id,
        gateway_id: gateway.id,
        status: this.mapPagSeguroOrderStatus(providerStatus),
        transaction_id: publicPaymentSummary.id || order.id,
        raw_response: buildSafePagSeguroRawResponse(publicPaymentSummary),
        created_at: new Date().toISOString()
      };

      try {
        await this.savePayment(newPayment);
      } catch (saveError) {
        console.warn('[PaymentService] PagBank payment save failed:', saveError);
      }

      const localStatus = this.mapPagSeguroOrderStatus(providerStatus);
      if (localStatus === OrderStatus.FAILED || localStatus === OrderStatus.CANCELED) {
        return {
          success: false,
          message: i18n.t('payment_rejected')
        };
      }

      return {
        success: true,
        gatewayStatus: providerStatus,
        statusSignature: result.statusSignature,
        pixData: result.pixData,
      };
    } catch (error: any) {
      console.error('[PaymentService] PagBank error:', error);
      return {
        success: false,
        message: translatePaymentError(undefined, undefined, error.message || 'Failed to process with PagBank')
      };
    }
  }

  private async processAsaas(
    gateway: Gateway,
    order: Order,
    request: ProcessPaymentRequest
  ): Promise<ProcessPaymentResult> {
    try {
      if (String(request.currency || '').trim().toUpperCase() !== 'BRL') {
        throw new Error('O Asaas está disponível apenas para checkouts em BRL.');
      }

      if (request.paymentMethod !== 'pix') {
        throw new Error('O Asaas está disponível apenas via Pix no Super Checkout neste momento.');
      }

      console.log('[PaymentService] Calling Backend Payment Hub for Asaas...');

      const response = await fetch('/api/payments?action=asaas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkoutId: order.checkout_id,
          orderId: order.id,
          gatewayId: gateway.id,
          paymentMethod: request.paymentMethod,
          customerEmail: order.customer_email,
          customerName: order.customer_name,
          customerPhone: order.customer_phone,
          customerCpf: order.customer_cpf,
          installments: request.installments || 1,
          selectedBumpIds: request.selectedBumps,
          total: order.amount || 0
        })
      });

      const responseText = await response.text();
      let result;
      try {
        result = responseText ? JSON.parse(responseText) : {};
      } catch (parseError) {
        console.error('[PaymentService] Failed to parse Asaas response:', responseText);
        throw new Error(`Invalid Asaas response (Status ${response.status}).`);
      }

      if (!response.ok || !result.success) {
        throw new Error(result.error || result.message || 'Erro ao processar pagamento no Asaas.');
      }

      const providerStatus = String(result.status || 'PENDING').trim().toUpperCase();
      const localStatus = this.mapAsaasOrderStatus(providerStatus, 'PIX');
      const publicPaymentSummary = {
        id: typeof result.paymentId === 'string' ? result.paymentId : '',
        status: providerStatus,
        billingType: 'PIX',
      };

      const newPayment: Payment = {
        id: generateUUID(),
        order_id: order.id,
        gateway_id: gateway.id,
        status: localStatus,
        transaction_id: publicPaymentSummary.id || order.id,
        raw_response: buildSafeAsaasRawResponse(publicPaymentSummary, result.pixData ? {
          payload: result.pixData.qr_code,
          encodedImage: result.pixData.qr_code_base64,
        } : undefined),
        created_at: new Date().toISOString()
      };

      try {
        await this.savePayment(newPayment);
      } catch (saveError) {
        console.warn('[PaymentService] Asaas payment save failed:', saveError);
      }

      if (localStatus === OrderStatus.FAILED || localStatus === OrderStatus.CANCELED) {
        return {
          success: false,
          message: result.message || i18n.t('payment_rejected')
        };
      }

      return {
        success: true,
        gatewayStatus: providerStatus,
        statusSignature: result.statusSignature,
        redirectUrl: result.redirectUrl,
        pixData: result.pixData,
        boletoData: result.boletoData,
      };
    } catch (error: any) {
      console.error('[PaymentService] Asaas error:', error);
      return {
        success: false,
        message: translatePaymentError(undefined, undefined, error.message || 'Failed to process with Asaas')
      };
    }
  }

  private async processStripe(
    gateway: Gateway,
    order: Order,
    request: ProcessPaymentRequest
  ): Promise<ProcessPaymentResult> {
    // In production, Stripe payments are processed via Serverless Function
    // The secret_key never leaves the server

    try {
      const useSavedPaymentMethod = request.useSavedPaymentMethod === true;

      if (useSavedPaymentMethod && request.paymentMethod !== 'credit_card') {
        throw new Error('Stripe saved method reuse currently only supports credit cards.');
      }

      if (request.paymentMethod !== 'credit_card' && !request.stripePaymentMethodId && !useSavedPaymentMethod) {
        throw new Error('Stripe integration currently only supports credit cards or wallets.');
      }

      if (!request.stripePaymentMethodId && !useSavedPaymentMethod) {
        throw new Error('Stripe payment requires a paymentMethodId from Stripe Elements. Raw card data is not accepted.');
      }

      // Call the Serverless Function that holds the secret_key
      const response = await fetch('/api/stripe/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethodId: request.stripePaymentMethodId,
          paymentMethod: request.paymentMethod,
          useSavedPaymentMethod,
          originalOrderId: request.originalOrderId,
          amount: order.amount,
          currency: request.currency,
          description: `Pedido #${order.id}`,
          customerEmail: order.customer_email,
          customerName: order.customer_name,
          gatewayId: gateway.id,
          checkoutId: order.checkout_id,
          selectedBumpIds: request.selectedBumps,
          metadata: {
            ...this.buildGatewayMetadata(order)
          }
        })
      });

      // Secure JSON handling: Check response before parsing
      let result: any;
      const responseText = await response.text();
      
      try {
        result = responseText ? JSON.parse(responseText) : {};
      } catch (e) {
        console.error('[PaymentService] Failed to parse Stripe response:', responseText);
        throw new Error(`Invalid response from server (Status ${response.status}). Please ensure the backend is running.`);
      }

      if ((!response.ok || !result.success) && result.code === 'UPSELL_REQUIRES_PAYMENT_FORM') {
        return {
          success: false,
          message: result.error || result.message || 'A confirmação adicional do cartão é necessária para concluir este item.',
          code: result.code,
          requiresPaymentForm: true,
          upsellCapability: result.upsellCapability || null,
        };
      }

      if (!response.ok || !result.success) {
        throw new Error(JSON.stringify({
            message: result.error || result.message || `Stripe payment failed (Status ${response.status})`,
            code: result.code,
            decline_code: result.decline_code
        }));
      }

      // Record Payment locally
      const stripeAdapter = new StripeAdapter();
      const newPayment: Payment = {
        id: generateUUID(),
        order_id: order.id,
        gateway_id: gateway.id,
        status: stripeAdapter.translateStatus(result.status),
        transaction_id: result.paymentIntentId,
        raw_response: buildSafeStripeRawResponse({
          paymentIntentId: result.paymentIntentId,
          status: result.status,
          amount: order.amount,
          currency: request.currency,
          payment_method: request.stripePaymentMethodId || null,
          lastPaymentError: result.lastPaymentError || null,
        }),
        created_at: new Date().toISOString()
      };

      if (!result.serverPersisted) {
        try {
          await this.savePayment(newPayment);
          console.log('[PaymentService] Stripe Payment saved successfully');
        } catch (err) {
          console.error('[PaymentService] Stripe Payment save failed:', err);
        }
      } else {
        console.log('[PaymentService] Stripe Payment already persisted by server');
      }

      // Handle 3D Secure (requires_action)
      if (result.requiresAction) {
        // Future: handle 3DS via stripe.handleCardAction(result.clientSecret)
        // For now, treat as pending
        return {
          success: true,
          orderId: result.orderId,
          message: 'Payment requires additional authentication',
          gatewayStatus: result.status,
          statusSignature: result.statusSignature,
          requiresAction: true,
          clientSecret: result.clientSecret,
          paymentMethodId: typeof result.paymentMethodId === 'string' ? result.paymentMethodId : undefined,
          upsellCapability: result.upsellCapability || null,
        };
      }

      // Handle Response
      if (result.status === 'succeeded' || result.status === 'processing') {
        return {
          success: true,
          orderId: result.orderId,
          gatewayStatus: result.status,
          statusSignature: result.statusSignature,
          upsellCapability: result.upsellCapability || null,
        };
      } else {
        return {
          success: false,
          message: result.lastPaymentError || i18n.t('payment_rejected')
        };
      }

    } catch (error: any) {
      console.error('[PaymentService] Stripe error:', error);
      let translatedMessage = error.message || 'Failed to process with Stripe';
      try {
        const parsed = JSON.parse(error.message);
        translatedMessage = translatePaymentError(parsed.code, parsed.decline_code, parsed.message);
      } catch (e) {
        // If it's not JSON, try to guess from English string
        translatedMessage = translatePaymentError(undefined, undefined, error.message);
      }
      return {
        success: false,
        message: translatedMessage
      };
    }
  }

  // --- Webhook Handlers ---

  async handleMercadoPagoWebhook(
    payload: any,
    xSignature: string | null,
    xRequestId: string | null
  ): Promise<{ received: boolean; processed: boolean; message?: string }> {
    try {
      // 1. Find the Active Mercado Pago Gateway to get the Secret
      const gateways = await storage.getGateways();
      const mpGateway = gateways.find(g => g.name === GatewayProvider.MERCADO_PAGO && g.active);

      if (!mpGateway || !mpGateway.webhook_secret || !mpGateway.private_key) {
        console.warn('[PaymentService] No active Mercado Pago gateway found for webhook or missing credentials');
        return { received: true, processed: false, message: 'Gateway configuration missing' };
      }

      // Initialize Adapter just for validation/translation
      const mpAdapter = new MercadoPagoAdapter(mpGateway.private_key, false);

      // 2. Validate webhook signature using the gateway's secret
      const isValid = await mpAdapter.validateWebhookSignature(
        payload,
        xSignature,
        xRequestId,
        mpGateway.webhook_secret // Pass secret explicitly
      );

      if (!isValid) {
        console.warn('[PaymentService] Invalid webhook signature');
        return { received: true, processed: false, message: 'Invalid signature' };
      }

      // 3. Parse webhook payload
      const paymentId = payload.data?.id || payload.id;
      const action = payload.action || payload.type;

      if (!paymentId) {
        return { received: true, processed: false, message: 'Missing payment ID' };
      }

      // 4. Get full payment info
      const paymentInfo = await mpAdapter.getPaymentInfo(paymentId);

      // 5. Find related payment record
      const relatedPayment = await storage.getPaymentByTransactionId(paymentId.toString());

      if (!relatedPayment) {
        console.warn('[PaymentService] Payment not found for webhook');
        return { received: true, processed: false, message: 'Payment not found' };
      }

      // 6. Translate status
      const newStatus = mpAdapter.translateStatus(paymentInfo.status);

      // 7. Update order and payment
      await this.updateOrderStatus(relatedPayment.order_id, newStatus);
      await this.updatePaymentStatus(relatedPayment.id, newStatus, paymentId);

      if (newStatus === OrderStatus.PAID) {
        console.log('[PaymentService] Paid webhook received in legacy client handler. Server-side fulfillment owns access/email side effects.');
      }

      // 8. Log webhook
      await this.logWebhook({
        gateway_id: relatedPayment.gateway_id,
        event: action || 'payment.updated',
        payload: JSON.stringify(payload),
        processed: true
      });

      console.log(`[PaymentService] Webhook processed: ${relatedPayment.order_id} -> ${newStatus}`);

      return { received: true, processed: true };

    } catch (error: any) {
      console.error('[PaymentService] Webhook processing error:', error);

      await this.logWebhook({
        event: 'webhook.error',
        payload: JSON.stringify({ error: error.message, originalPayload: payload }),
        processed: false
      });

      return {
        received: true,
        processed: false,
        message: error.message
      };
    }
  }

  // --- Helper Methods ---

  private async grantAccess(order: Order) {
    if (!order.customer_user_id) {
      console.warn('[PaymentService] No customer user ID found for order. Cannot grant access automatically.');
      // Future: Implement email-based lookup or "claim" system
      return;
    }

    console.log('[PaymentService] Granting access for order:', order.id);

    const productsToGrant: string[] = [];

    // 1. Identify Products from Order Items (Robust Method)
    if (order.items && order.items.length > 0) {
      for (const item of order.items) {
        if (item.product_id) {
          productsToGrant.push(item.product_id);
        } else {
          // Fallback: If no product_id (Legacy), try to infer from name or type?
          // For now, we log a warning.
          console.warn('[PaymentService] Item missing product_id:', item.name);
        }
      }
    } else {
      // 2. Fallback for Legacy Orders (No items array) - Only Main Product
      const checkout = await storage.getPublicCheckout(order.checkout_id);
      if (checkout) {
        productsToGrant.push(checkout.product_id);
      }
    }

    // Dedup IDs
    const uniqueProductIds = Array.from(new Set(productsToGrant));
    console.log('[PaymentService] Products to grant:', uniqueProductIds);

    // 3. Grant Access for each product
    for (const productId of uniqueProductIds) {
      console.log(`[PaymentService] Processing grants for Product ID: ${productId}`);

      // --- NEW: System Notification Trigger ---
      // Check if product is a SaaS Plan Upgrade
      storage.getPublicProduct(productId).then(product => {
        if (product?.saas_plan_slug === 'unlimited') {
          emailService.sendUpgradeUnlimited(order.customer_email, order.customer_name).catch(console.error);
        } else if (product?.saas_plan_slug === 'partner') {
          emailService.sendUpgradePartner(order.customer_email, order.customer_name).catch(console.error);
        }
      }).catch(err => console.error('[PaymentService] Error checking product for system email:', err));

      // A. Product-Level Grant (Always grant base access to the product)
      // This ensures it appears in "My Products" even if no content is linked yet.
      try {
        await storage.createAccessGrant({
          user_id: order.customer_user_id,
          content_id: null, // Null = Product Level Access
          product_id: productId,
          status: 'active'
        });
      } catch (err) {
        console.error(`[PaymentService] Failed to create product-level grant for ${productId}`, err);
      }

      // B. Content-Level Grants (Granular access)
      const contents = await storage.getContentsByProduct(productId);

      if (contents.length === 0) {
        console.warn(`[PaymentService] Product ${productId} has no linked contents. Only product-level access granted.`);
      } else {
        console.log(`[PaymentService] Granting access to ${contents.length} contents for product ${productId}`);
        for (const content of contents) {
          try {
            await storage.createAccessGrant({
              user_id: order.customer_user_id,
              content_id: content.id,
              product_id: undefined,
              status: 'active'
            });
          } catch (err) {
            console.error(`[PaymentService] Failed to grant content access ${content.id}`, err);
          }
        }
      }
    }
  }

  private async savePayment(payment: Payment) {
    // Use upsert to handle idempotency and avoid duplicates
    // This is critical when Stripe returns the same PI ID for re-tries
    await storage.upsertPayment(payment);
  }

  private async updateOrderStatus(orderId: string, status: OrderStatus) {
    if (isDemoDataRuntime()) {
      const orders = await demoDataService.getOrders();
      const orderToUpdate = orders.find(o => o.id === orderId);
      if (orderToUpdate) {
        await demoDataService.saveOrders([{ ...orderToUpdate, status }]);
      }
      return;
    }

    const { error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId);

    if (error) {
      throw error;
    }
  }

  private async updatePaymentStatus(
    paymentId: string,
    status: OrderStatus,
    transactionId?: string
  ) {
    const payments = await storage.getPayments();
    const updatedPayments = payments.map(p => {
      if (p.id === paymentId) {
        return {
          ...p,
          status,
          ...(transactionId && { transaction_id: transactionId })
        };
      }
      return p;
    });
    await storage.savePayments(updatedPayments);
  }

  private async logWebhook(data: {
    gateway_id?: string;
    event: string;
    payload: string;
    processed: boolean;
  }) {
    const newLog: WebhookLog = {
      id: `wh_${Date.now()}`,
      gateway_id: data.gateway_id,
      direction: 'incoming',
      event: data.event,
      payload: data.payload,
      raw_data: data.payload,
      processed: data.processed,
      created_at: new Date().toISOString()
    };

    await storage.saveWebhookLogs([newLog]);
  }
}

export const paymentService = new PaymentService();

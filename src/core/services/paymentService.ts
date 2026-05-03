
import { Gateway, GatewayProvider, Order, OrderStatus, Payment, WebhookLog, OrderItem, InstallmentOption } from '../types';
import { storage } from './storageService';
import { MercadoPagoAdapter } from './adapters/MercadoPagoAdapter';
import { StripeAdapter } from './adapters/StripeAdapter';
import { emailService } from './emailService';
import { getApiUrl, getBaseUrl } from '../utils/apiUtils';
import { translatePaymentError } from '../utils/errorTranslator';
import i18n from '../i18n/config';
import type { UpgradeIntentContext } from './licenseService';

// Helper for UUID generation
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
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
  paymentMethod: 'credit_card' | 'pix' | 'boleto';
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
  installments?: number; // New: Number of installments
  upgradeIntentToken?: string;
  upgradeIntentContext?: UpgradeIntentContext;
}

export interface ProcessPaymentResult {
  success: boolean;
  orderId?: string;
  gatewayStatus?: string;
  statusSignature?: string; // New: HMAC signature for secure polling (Fase 11F)
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
}

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

  private buildOrderMetadata(request: ProcessPaymentRequest) {
    const token = request.upgradeIntentToken?.trim();
    const context = request.upgradeIntentContext;

    const payerSnapshot = {
      name: request.customerName || null,
      email: request.customerEmail || null,
      phone: request.customerPhone || null,
      cpf: request.customerCpf || null,
    };

    if (!token) {
      return {
        payer_snapshot: payerSnapshot,
        reconciliation: {
          status: 'not_required',
          reason: 'public_checkout_without_upgrade_intent',
        },
      };
    }

    return {
      upgrade_intent_token: token,
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
      upgrade_intent_token: metadata.upgrade_intent_token || '',
      upgrade_target_license_key: upgradeIntent.target_license_key || metadata.upgrade_target_license_key || '',
      upgrade_target_plan_slug: upgradeIntent.target_plan_slug || metadata.upgrade_target_plan_slug || '',
      upgrade_source_surface: upgradeIntent.source_surface || '',
    };
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
      const backupId = checkout?.backup_gateway_id;
      
      const gatewaysToTry = [request.gatewayId];
      if (backupId) gatewaysToTry.push(backupId);

      let lastError = '';
      let currentOrder: Order | null = null;

      for (const gatewayId of gatewaysToTry) {
        try {
          console.log(`[PaymentService] Attempting payment with gateway: ${gatewayId}`);
          const gateway = await storage.getPublicGateway(gatewayId);
          
          if (!gateway || !gateway.active) {
            console.warn(`[PaymentService] Gateway ${gatewayId} is not available/active`);
            continue;
          }

          // Criar ou Reutilizar Order
          if (!currentOrder) {
            currentOrder = {
              id: generateUUID(),
              checkout_id: request.checkoutId,
              offer_id: (request.offerId === 'direct' || request.offerId === 'upsell') ? undefined : request.offerId,
              amount: request.amount,
              customer_email: request.customerEmail,
              customer_name: request.customerName,
              customer_phone: request.customerPhone,
              customer_cpf: request.customerCpf,
              status: OrderStatus.PENDING,
              payment_method: request.paymentMethod,
              items: request.items,
              metadata: this.buildOrderMetadata(request),
              created_at: new Date().toISOString(),
              customer_user_id: request.customerUserId
            };
            await storage.createOrder(currentOrder);
          }

          // Executar roteamento
          let gatewayResponse: ProcessPaymentResult;
          switch (gateway.name) {
            case GatewayProvider.MERCADO_PAGO:
              gatewayResponse = await this.processMercadoPago(gateway, currentOrder, request);
              break;
            case GatewayProvider.STRIPE:
              gatewayResponse = await this.processStripe(gateway, currentOrder, request);
              break;
            default:
              gatewayResponse = { success: false, message: i18n.t('unknown_gateway') };
          }

          if (gatewayResponse.success) {
            console.log(`[PaymentService] Payment SUCCESS with gateway: ${gatewayId}`);
            if (!gatewayResponse.pixData && !gatewayResponse.boletoData) {
              if (gateway.name !== GatewayProvider.MERCADO_PAGO) {
                try {
                  await emailService.sendPaymentApproved({ ...currentOrder, status: OrderStatus.PAID });
                } catch (emailError) {
                  console.warn('[PaymentService] Immediate payment email failed:', emailError);
                }
              }
              this.grantAccess(currentOrder).catch(console.error);
            }
            return {
              success: true,
              orderId: currentOrder.id,
              ...gatewayResponse
            };
          } else {
            console.warn(`[PaymentService] Payment FAILED with gateway ${gatewayId}: ${gatewayResponse.message}`);
            lastError = gatewayResponse.message || 'Unknown error';
            // Se falhou o principal e temos backup, continua o loop
          }
        } catch (attemptError: any) {
          console.error(`[PaymentService] Exception during gateway attempt ${gatewayId}:`, attemptError);
          lastError = attemptError.message;
        }
      }

      // Se chegou aqui, todos os gateways falharam
      if (currentOrder) {
         try {
           await this.updateOrderStatus(currentOrder.id, OrderStatus.FAILED);
         } catch (e) {}
      }
      
      return { success: false, message: lastError || 'Payment processing failed' };

    } catch (error: any) {
      console.error('[PaymentService] Critical error in processPayment:', error);
      return { success: false, message: error.message || 'Payment processing failed' };
    }
  }

  // --- Gateway Adapters ---

  private async processMercadoPago(
    gateway: Gateway,
    order: Order,
    request: ProcessPaymentRequest
  ): Promise<ProcessPaymentResult> {
    // Initialize Adapter with Dynamic Credentials from DB
    // In Zero-Trust v4, private_key is NEVER sent to the frontend.
    // We only require public_key for card tokenization if applicable.
    if (!gateway.public_key) {
      return { success: false, message: 'Mercado Pago Public Key missing in settings' };
    }

    // Prioritize explicit API_URL, then Vercel System URL, then fallback to window origin
    const publicUrl = getBaseUrl();

    // Force the adapter to use the stable Vercel URL for the proxy to avoid custom domain issues
    // We use ?endpoint= so the adapter appends    // Use relative path to avoid CORS (Same-Origin)
    // In development, this requires a Vite proxy or will fail (but user is testing prod)
    const proxyBaseUrl = '/mp-api';
    console.log('[PaymentService] Initializing Adapter with Base URL:', proxyBaseUrl);

    // Initializing MP Adapter ONLY for tokenization (uses public_key)
    const mpAdapter = new MercadoPagoAdapter('', {
      isProduction: false,
      baseUrl: proxyBaseUrl
    });

    try {
      let token = undefined;
      let mpPaymentMethodId = undefined;
      let mpIssuer = undefined;

      // 1. Prepare Token for Credit Card (Tokenization still happens on client via proxy)
      if (request.paymentMethod === 'credit_card') {
          if (!request.cardData) {
          throw new Error(i18n.t('card_data_required'));
        }

        const rawYear = request.cardData.expiryYear.toString().trim();
        const expiration_year = rawYear.length === 2 ? `20${rawYear}` : rawYear;

        // Fiel ao Ponto 2: Capturar token, paymentMethodId e issuerId
        const { token: mpToken, paymentMethodId: mpBrand, issuerId: mpIssuer } = await mpAdapter.createCardToken({
          card_number: request.cardData.number.replace(/\s/g, ''),
          expiration_month: request.cardData.expiryMonth.padStart(2, '0'),
          expiration_year: expiration_year,
          security_code: request.cardData.cvc,
          cardholder: {
            name: request.cardData.holderName
          }
        }, gateway.public_key);

        token = mpToken;
        mpPaymentMethodId = mpBrand;

        console.log('[PaymentService] Card tokenized. Brand:', mpPaymentMethodId, 'Issuer:', mpIssuer);
      }

      // 2. Delegate Payment Creation to Backend Hub (v4 Protection)
      // Prices are recalculated server-side using checkoutId and selectedBumps.
      console.log('[PaymentService] Calling Backend Payment Hub...');
      
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
            installments: request.installments || 1,
            total: order.amount || 0
          })
        });

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.error('[PaymentService] Backend result failed:', result);
        let errorMsg = result.error || 'Erro ao processar pagamento no Mercado Pago (Backend)';
        // Keep technical details only in console, not in the UI
        console.error('[PaymentService] Error details:', result.details);
        throw new Error(errorMsg);
      }

      const paymentResponse = result.data;

      // 3. Record Payment locally
      const newPayment: Payment = {
        id: generateUUID(),
        order_id: order.id,
        gateway_id: gateway.id,
        status: mpAdapter.translateStatus(paymentResponse.status),
        transaction_id: paymentResponse.id.toString(),
        raw_response: JSON.stringify(paymentResponse),
        created_at: new Date().toISOString()
      };

      try {
        await this.savePayment(newPayment);
      } catch (err) {
        console.warn('[PaymentService] Local payment save failed (Backend usually handles it but we log it):', err);
      }

      console.log('[PaymentService] Proceeding to handle response immediately...');

      if (paymentResponse.status === 'approved' || paymentResponse.status === 'in_process' || paymentResponse.status === 'pending') {
        return {
          success: true,
          gatewayStatus: paymentResponse.status,
          statusSignature: result.statusSignature,
          pixData: {
            qr_code: paymentResponse.point_of_interaction?.transaction_data?.qr_code || '',
            qr_code_base64: paymentResponse.point_of_interaction?.transaction_data?.qr_code_base64 || ''
          }
        };
      } else {
        return {
          success: false,
          message: paymentResponse.status_detail ? mpAdapter.translateError(paymentResponse.status_detail) : i18n.t('payment_rejected')
        };
      }

    } catch (error: any) {
      console.error('[PaymentService] Mercado Pago error:', error);
      return {
        success: false,
        message: translatePaymentError(undefined, undefined, error.message || 'Failed to process with Mercado Pago')
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

  private async processStripe(
    gateway: Gateway,
    order: Order,
    request: ProcessPaymentRequest
  ): Promise<ProcessPaymentResult> {
    // In production, Stripe payments are processed via Serverless Function
    // The secret_key never leaves the server

    try {
      if (request.paymentMethod !== 'credit_card' && !request.stripePaymentMethodId) {
        throw new Error('Stripe integration currently only supports credit cards or wallets.');
      }

      if (!request.stripePaymentMethodId) {
        throw new Error('Stripe payment requires a paymentMethodId from Stripe Elements. Raw card data is not accepted.');
      }

      // Call the Serverless Function that holds the secret_key
      const response = await fetch('/api/stripe/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethodId: request.stripePaymentMethodId,
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
        raw_response: JSON.stringify(result),
        created_at: new Date().toISOString()
      };

      try {
        await this.savePayment(newPayment);
        console.log('[PaymentService] Stripe Payment saved successfully');
      } catch (err) {
        console.error('[PaymentService] Stripe Payment save failed:', err);
      }

      // Handle 3D Secure (requires_action)
      if (result.requiresAction) {
        // Future: handle 3DS via stripe.handleCardAction(result.clientSecret)
        // For now, treat as pending
        return {
          success: true,
          message: 'Payment requires additional authentication'
        };
      }

      // Handle Response
      if (result.status === 'succeeded' || result.status === 'processing') {
        return { success: true, gatewayStatus: result.status };
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
        const orders = await storage.getOrders();
        const order = orders.find(o => o.id === relatedPayment.order_id);
        if (order) {
          emailService.sendPaymentApproved(order).catch(console.error);
          this.grantAccess(order).catch(console.error);
        }
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
              product_id: productId,
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
    const orders = await storage.getOrders();
    const orderToUpdate = orders.find(o => o.id === orderId);

    if (orderToUpdate) {
      await storage.saveOrders([{ ...orderToUpdate, status }]);
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

    const logs = await storage.getWebhookLogs();
    await storage.saveWebhookLogs([newLog, ...logs]);
  }
}

export const paymentService = new PaymentService();

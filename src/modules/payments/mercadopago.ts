import { decrypt, generateSignature } from '../../core/utils/cryptoUtils.js';
import {
  getLocalSupabaseServerKeyErrorMessage,
  resolveLocalSupabaseServerClient,
} from '../../core/api/_supabase-server.js';
import { securityService } from '../../core/services/securityService.js';
import { fulfillOrder } from '../../core/services/fulfillment.js';
import { sendOrderAccessEmail } from '../../core/services/orderEmail.js';
import { upsertCustomerPaymentProfile } from './customer-payment-profiles.js';
import {
  PaymentSecurityError,
  getMainProductForCheckout,
  getServerCurrency,
  loadCheckoutForPayment,
  loadOwnedActiveGateway,
  loadOwnedOrderForCheckoutWithMerchant,
  loadValidCheckoutBumps,
  normalizeInstallmentsForGateway,
  resolveCheckoutMerchantUserId
} from './payment-security.js';

/**
 * MODULE: MERCADO PAGO HANDLER v6 (FETCH NATIVE - BYPASS SDK)
 * 
 * Substituímos o SDK oficial pelo Fetch Nativo para garantir 100% de compatibilidade
 * com o ambiente Vercel e eliminar bugs latentes da biblioteca v2.
 */

async function sendPaymentApprovedEmail(supabaseAdmin: any, orderId: string, order: any, productName: string) {
  try {
    const metadata = order?.metadata && typeof order.metadata === 'object' ? order.metadata : {};
    if (metadata.payment_email_sent_at) {
      console.log(`[MP-FETCH] Payment email already sent for order ${orderId}. Skipping.`);
      return;
    }

    const { data: integration } = await supabaseAdmin
      .from('integrations')
      .select('*')
      .eq('name', 'resend')
      .eq('active', true)
      .limit(1)
      .maybeSingle();

    const apiKey = integration?.config?.apiKey || integration?.config?.api_key;
    const fromEmail = integration?.config?.senderEmail || integration?.config?.from_email || 'onboarding@resend.dev';

    if (!apiKey) {
      console.warn('[MP-FETCH] Resend integration not active/configured. Skipping payment email.');
      return;
    }

    const { data: settings } = await supabaseAdmin
      .from('business_settings')
      .select('sender_name, business_name')
      .limit(1)
      .maybeSingle();

    const fromName = settings?.sender_name || settings?.business_name;
    const from = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;

    const { data: template } = await supabaseAdmin
      .from('email_templates')
      .select('*')
      .eq('event_type', 'ORDER_COMPLETED')
      .eq('active', true)
      .limit(1)
      .maybeSingle();

    const variables: Record<string, string> = {
      '{{order_id}}': orderId ? `#${orderId.split('-')[0]}` : '',
      '{{customer_name}}': order.customer_name || 'Cliente',
      '{{product_names}}': productName || 'seu produto',
      '{{business_name}}': settings?.business_name || settings?.sender_name || 'Super Checkout',
      '{{members_area_url}}': order.membersAreaUrl || (process.env.VITE_SITE_URL ? `${process.env.VITE_SITE_URL}/login` : 'https://app.supercheckout.app/login')
    };

    let subject = template?.subject || 'Pagamento Aprovado';
    let html = template?.html_body || `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Ola, {{customer_name}}!</h1>
        <p>Seu pagamento para <strong>{{product_names}}</strong> foi aprovado.</p>
        <p>Pedido: {{order_id}}</p>
      </div>
    `;

    for (const [key, value] of Object.entries(variables)) {
      subject = subject.replace(new RegExp(key, 'g'), value);
      html = html.replace(new RegExp(key, 'g'), value);
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from,
        to: [order.customer_email],
        subject,
        html
      })
    });

    const resendData = await resendRes.json().catch(() => ({}));

    if (!resendRes.ok) {
      console.error('[MP-FETCH] Resend payment email failed:', resendData);
      return;
    }

    await supabaseAdmin
      .from('orders')
      .update({
        metadata: {
          ...metadata,
          payment_email_sent_at: new Date().toISOString(),
          payment_email_resend_id: resendData?.id || null
        }
      })
      .eq('id', orderId);

    console.log(`[MP-FETCH] Payment approved email sent for order ${orderId}.`);
  } catch (emailError: any) {
    console.error('[MP-FETCH] Payment email error:', emailError?.message || emailError);
  }
}

interface MPPaymentPayload {
  checkoutId: string;
  orderId: string;
  gatewayId: string;
  paymentMethod: string;
  selectedBumpIds?: string[];
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
  customerCpf?: string;
  cardToken?: string; 
  paymentMethodId?: string; 
  issuerId?: string; 
  installments?: number;
  ip: string;
  baseUrl?: string; 
}

function shouldExposeMercadoPagoDetail(gateway: any) {
  const publicKey = String(gateway?.public_key || '').trim().toUpperCase();
  const privateKey = String(gateway?.private_key || '').trim().toUpperCase();
  return publicKey.startsWith('TEST-') || privateKey.startsWith('TEST-');
}

function mapMercadoPagoApiErrorMessage(message: string) {
  const normalized = String(message || '').toLowerCase();

  if (normalized.includes('invalid users involved')) {
    return 'No sandbox do Mercado Pago, use credenciais TEST do vendedor e o e-mail exato test@testuser.com no comprador.';
  }

  if (normalized.includes('payment_method_id')) {
    return 'O Mercado Pago rejeitou a bandeira do cartao enviada pelo checkout.';
  }

  if (normalized.includes('invalid card token') || normalized.includes('card token')) {
    return 'O token do cartao gerado pelo Mercado Pago nao foi aceito na etapa de cobranca.';
  }

  if (normalized.includes('issuer_id')) {
    return 'O emissor do cartao informado nao foi aceito pelo Mercado Pago.';
  }

  if (normalized.includes('identification')) {
    return 'O documento do pagador foi rejeitado pelo Mercado Pago.';
  }

  if (normalized.includes('installments')) {
    return 'A quantidade de parcelas informada nao foi aceita pelo Mercado Pago.';
  }

  return message || 'Erro na API do Mercado Pago';
}

export async function processMercadoPagoPayment(payload: MPPaymentPayload) {
  const { 
    checkoutId, orderId, gatewayId, paymentMethod, paymentMethodId, issuerId,
    selectedBumpIds = [], customerEmail, customerName, 
    customerCpf, cardToken, installments = 1, ip, baseUrl 
  } = payload;

  let body: any = {}; 

  try {
    const { supabase: supabaseAdmin, probeError } = await resolveLocalSupabaseServerClient();
    if (!supabaseAdmin) {
      console.error('[MP-FETCH] Missing or invalid Supabase server credentials:', probeError);
      throw new Error(`SUPABASE_SERVER_KEY_INVALID: ${getLocalSupabaseServerKeyErrorMessage()}`);
    }

    // 1. Rate Limit
    const isLimited = await securityService.isRateLimited(ip);
    if (isLimited) throw new Error('TOO_MANY_REQUESTS: Excesso de tentativas.');

    const checkout = await loadCheckoutForPayment(supabaseAdmin, checkoutId);
    const mainProduct = getMainProductForCheckout(checkout);
    const merchantUserId = resolveCheckoutMerchantUserId(checkout, mainProduct);
    await loadOwnedOrderForCheckoutWithMerchant(supabaseAdmin, checkout, merchantUserId, orderId);

    const gateway = await loadOwnedActiveGateway(supabaseAdmin, merchantUserId, checkout, gatewayId, 'mercado_pago');
    const exposeGatewayDetail = shouldExposeMercadoPagoDetail(gateway);
    const serverCurrency = getServerCurrency(checkout, mainProduct);
    if (serverCurrency !== 'BRL') {
      throw new PaymentSecurityError('PAYMENT_CURRENCY_GATEWAY_FORBIDDEN', 'Invalid checkout configuration.');
    }
    const safeInstallments = normalizeInstallmentsForGateway(installments, gateway);
    const privateKeyRaw = decrypt(gateway.private_key)?.replace(/\s/g, '') || '';
    
    // Validação de Hotfix #32: Detectar falha de decriptografia silenciosa
    if (privateKeyRaw.startsWith('iv:')) {
      throw new Error('DECRYPTION_FAILED: A chave privada não pôde ser decriptografada. Verifique se a PAYMENT_ENCRYPTION_KEY está correta na Vercel.');
    }

    const privateKey = privateKeyRaw;
    if (!privateKey || privateKey.length < 10) throw new Error('Falha crítica na decriptografia da chave privada (Chave vazia).');

    // 2. Calcular Preço (Otimizado)
    let totalAmount = Number(mainProduct.price_real || 0);
    const validBumps: any[] = [];

    if (selectedBumpIds.length > 0) {
      const bumpsData = await loadValidCheckoutBumps(supabaseAdmin, checkout, merchantUserId, selectedBumpIds);
      bumpsData.forEach((bp: any) => {
        totalAmount += Number(bp.price_real || 0);
        validBumps.push({ id: bp.id, name: bp.name, price: bp.price_real });
      });
    }

    // 3. Montar Payload por metodo. Pix deve ir sem campos de cartao.
    const nameParts = (customerName || 'Cliente Teste').trim().split(/\s+/);
    const payer: any = {
      email: customerEmail,
      first_name: nameParts[0] || 'Cliente',
      last_name: nameParts.slice(1).join(' ') || 'Super'
    };

    const payerDocument = String(customerCpf || '').replace(/\D/g, '');
    if (payerDocument.length === 11 || payerDocument.length === 14) {
      payer.identification = {
        type: payerDocument.length === 14 ? 'CNPJ' : 'CPF',
        number: payerDocument
      };
    }

    let stableBaseUrl = baseUrl || process.env.NEXT_PUBLIC_API_URL || process.env.VITE_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
    if (stableBaseUrl.endsWith('/')) stableBaseUrl = stableBaseUrl.slice(0, -1);
    if (stableBaseUrl && !stableBaseUrl.startsWith('http')) stableBaseUrl = `https://${stableBaseUrl}`;
    const isLocalhost = stableBaseUrl.includes('localhost') || stableBaseUrl.includes('127.0.0.1') || !stableBaseUrl.includes('.');

    body = {
      transaction_amount: Number(totalAmount.toFixed(2)),
      description: `Pedido ${orderId}`.substring(0, 60),
      payment_method_id: paymentMethod === 'credit_card' ? paymentMethodId : paymentMethod,
      payer,
      external_reference: orderId
    };

    if (stableBaseUrl && !isLocalhost) {
      body.notification_url = `${stableBaseUrl}/api/stripe?action=mercadopago`;
    }

    if (paymentMethod === 'credit_card') {
      if (!cardToken) throw new Error('Token do cartao e obrigatorio.');
      body.installments = safeInstallments;
      body.token = cardToken;
    }

    if (paymentMethod === 'credit_card' && issuerId) {
      body.issuer_id = Number(issuerId);
    }

    // 4. Chamada API via FETCH (Bypass SDK)
    console.log(`[MP-FETCH] Processando pagamento para ${orderId}... Total: ${totalAmount}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${privateKey}`,
        'X-Idempotency-Key': orderId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const mpResult = await response.json();
    const requestId = response.headers.get('x-request-id');

    if (!response.ok) {
      console.error(`[MP-FETCH] Erro API (Request-ID: ${requestId}):`, mpResult);
      const detailedError = Array.isArray(mpResult?.cause) && mpResult.cause[0]?.description
        ? mpResult.cause[0].description
        : mpResult.message || 'Erro na API do Mercado Pago';

      throw { 
        api_response: { content: mpResult }, 
        message: mapMercadoPagoApiErrorMessage(detailedError),
        publicMessage: exposeGatewayDetail ? mapMercadoPagoApiErrorMessage(detailedError) : 'Nao foi possivel processar o pagamento agora.',
        requestId 
      };
    }

    // 8. Sucesso e Persistência
    if (paymentMethod === 'credit_card') {
      try {
        const profileResult = await upsertCustomerPaymentProfile({
          supabaseAdmin,
          userId: checkout.user_id,
          gatewayId: gateway.id,
          gatewayName: gateway.name,
          customerUserId: null,
          customerEmail,
          customerName,
          paymentMethodType: 'credit_card',
          gatewayCustomerId: mpResult?.payer?.id ? String(mpResult.payer.id) : null,
          gatewayPaymentMethodId: mpResult?.card?.id ? String(mpResult.card.id) : null,
          cardBrand: mpResult?.payment_method_id || paymentMethodId || null,
          cardLast4: mpResult?.card?.last_four_digits || null,
          cardExpMonth: mpResult?.card?.expiration_month || null,
          cardExpYear: mpResult?.card?.expiration_year || null,
          issuerId: issuerId ? String(issuerId) : null,
          reusable: false,
          requiresReauthentication: true,
          consentCapturedAt: new Date().toISOString(),
          consentScope: 'post_purchase_upsell',
          firstOrderId: orderId,
          lastOrderId: orderId,
          metadata: {
            source: 'mercadopago_process_payment',
            mp_payment_id: mpResult?.id ? String(mpResult.id) : null,
            mp_status: mpResult?.status || null,
          },
        });

        if (profileResult.ok === false) {
          console.warn('[MP-FETCH] Customer payment profile not persisted:', profileResult.reason, profileResult.error || '');
        }
      } catch (profileError: any) {
        console.warn('[MP-FETCH] Passive payment profile capture failed:', profileError?.message || profileError);
      }
    }

    const paidStatus = mpResult.status === 'approved';
    const updatedOrder = {
      status: (mpResult.status === 'approved') ? 'paid' : 'pending',
      payment_id: String(mpResult.id),
      total: totalAmount,
      items: [
        { id: mainProduct.id, name: mainProduct.name, price: mainProduct.price_real, type: 'main' },
        ...validBumps.map(b => ({ ...b, type: 'bump' }))
      ]
    };

    await supabaseAdmin
      .from('orders')
      .update(updatedOrder)
      .eq('id', orderId)
      .eq('checkout_id', checkout.id);

    if (paidStatus) {
      // Resolve member area URL dynamically
      const baseUrl = process.env.VITE_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://app.supercheckout.app');
      let membersAreaUrl = `${baseUrl}/login`;
      const { data: links } = await supabaseAdmin
          .from('product_contents')
          .select('content:contents(member_area_id, member_areas(slug, domains(domain)))')
          .eq('product_id', mainProduct.id)
          .limit(1);

      const rawContent = (links?.[0] as any)?.content;
      const content = Array.isArray(rawContent) ? rawContent[0] : rawContent;
      const area = Array.isArray(content?.member_areas) ? content.member_areas[0] : content?.member_areas;
      if (area?.slug) membersAreaUrl = `${baseUrl}/app/${area.slug}`;
      const rawDomains = area?.domains as any;
      const domain = Array.isArray(rawDomains) ? rawDomains[0]?.domain : rawDomains?.domain;
      if (domain) membersAreaUrl = `https://${domain}`;

      // Generate magic link token for auto-login
      try {
          const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
              type: 'magiclink',
              email: customerEmail,
              options: { redirectTo: membersAreaUrl }
          });
          if (linkData?.properties?.hashed_token) {
              const separator = membersAreaUrl.includes('?') ? '&' : '?';
              membersAreaUrl = `${membersAreaUrl}${separator}auth_token=${linkData.properties.hashed_token}&auth_email=${encodeURIComponent(customerEmail)}`;
          }
      } catch (err) {
          console.error('[MP] Failed to generate magic link:', err);
      }

      let vercelEmailSent = false;
      try {
          await fulfillOrder(supabaseAdmin, {
            orderId,
            email: customerEmail,
            name: customerName,
          });
          const emailResult = await sendOrderAccessEmail(supabaseAdmin, {
            orderId,
            origin: baseUrl,
            email: customerEmail,
            name: customerName,
          });
          vercelEmailSent = Boolean((emailResult as any)?.sent || (emailResult as any)?.skipped);
      } catch (err) {
          console.error('[MP-FETCH] Vercel fulfillment/email error:', err);
      }

      if (!vercelEmailSent) {
        await sendPaymentApprovedEmail(supabaseAdmin, orderId, { ...checkout, ...updatedOrder, customer_email: customerEmail, customer_name: customerName, membersAreaUrl }, mainProduct.name);
      }
    }

    return {
      success: true,
      id: mpResult.id,
      status: mpResult.status,
      data: mpResult,
      amount: totalAmount,
      statusSignature: generateSignature(orderId)
    };

  } catch (error: any) {
    const isSecurityError = error instanceof PaymentSecurityError;
    const code = isSecurityError ? error.code : 'PAYMENT_PROCESSING_FAILED';
    const publicMessage = isSecurityError
      ? error.publicMessage
      : (typeof error?.publicMessage === 'string' && error.publicMessage.trim()
        ? error.publicMessage.trim()
        : 'Nao foi possivel processar o pagamento agora.');

    console.error('[MP-FETCH] Payment failed:', {
      code,
      orderId,
      message: error?.message,
      requestId: error?.requestId
    });

    return {
      success: false,
      error: `${publicMessage} | FETCH_RELIABILITY_V6`,
      code,
      details: typeof error?.message === 'string' ? error.message : null,
    };
  }
}

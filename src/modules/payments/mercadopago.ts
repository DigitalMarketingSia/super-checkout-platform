import { createClient } from '@supabase/supabase-js';
import { decrypt, generateSignature } from '../../core/utils/cryptoUtils.js';
import { securityService } from '../../core/services/securityService.js';
import { fulfillOrder } from '../../core/services/fulfillment.js';
import { sendOrderAccessEmail } from '../../core/services/orderEmail.js';

/**
 * MODULE: MERCADO PAGO HANDLER v6 (FETCH NATIVE - BYPASS SDK)
 * 
 * Substituímos o SDK oficial pelo Fetch Nativo para garantir 100% de compatibilidade
 * com o ambiente Vercel e eliminar bugs latentes da biblioteca v2.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function sendPaymentApprovedEmail(orderId: string, order: any, productName: string) {
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
      '{{members_area_url}}': order.membersAreaUrl || (process.env.VITE_SITE_URL ? `${process.env.VITE_SITE_URL}/login` : 'https://app.supercheckout.app/login')
    };

    let subject = template?.subject || 'Pagamento Aprovado - Acesso Liberado!';
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

export async function processMercadoPagoPayment(payload: MPPaymentPayload) {
  const { 
    checkoutId, orderId, gatewayId, paymentMethod, paymentMethodId, issuerId,
    selectedBumpIds = [], customerEmail, customerName, 
    customerCpf, cardToken, installments = 1, ip, baseUrl 
  } = payload;

  let body: any = {}; 

  try {
    // 1. Rate Limit
    const isLimited = await securityService.isRateLimited(ip);
    if (isLimited) throw new Error('TOO_MANY_REQUESTS: Excesso de tentativas.');

    // 1. Recuperar Gateway AGORA (Prioridade Máxima)
    const { data: gateway } = await supabaseAdmin.from('gateways').select('*').eq('id', gatewayId).single();
    if (!gateway || !gateway.private_key) throw new Error('Gateway não configurado no banco de dados.');

    const privateKeyRaw = decrypt(gateway.private_key)?.replace(/\s/g, '');
    
    // Validação de Hotfix #32: Detectar falha de decriptografia silenciosa
    if (privateKeyRaw.startsWith('iv:')) {
      throw new Error('DECRYPTION_FAILED: A chave privada não pôde ser decriptografada. Verifique se a PAYMENT_ENCRYPTION_KEY está correta na Vercel.');
    }

    const privateKey = privateKeyRaw;
    if (!privateKey || privateKey.length < 10) throw new Error('Falha crítica na decriptografia da chave privada (Chave vazia).');

    // 2. Calcular Preço (Otimizado)
    const { data: checkout } = await supabaseAdmin
      .from('checkouts')
      .select('*, product:products!product_id(*)')
      .or(`id.eq.${checkoutId},custom_url_slug.eq.${checkoutId}`)
      .single();

    if (!checkout) throw new Error('Checkout não encontrado.');
    const productsData = Array.isArray(checkout.product) ? checkout.product : [checkout.product];
    const mainProduct = productsData[0];
    
    let totalAmount = Number(mainProduct.price_real || 0);
    const validBumps: any[] = [];
    const allowedBumpIds = Array.isArray(checkout.order_bump_ids) ? checkout.order_bump_ids : [];

    if (selectedBumpIds.length > 0) {
      const filteredBumpIds = selectedBumpIds.filter(id => allowedBumpIds.includes(id));
      if (filteredBumpIds.length > 0) {
        const { data: bumpsData } = await supabaseAdmin.from('products').select('*').in('id', filteredBumpIds);
        if (bumpsData) {
          bumpsData.forEach(bp => {
            totalAmount += Number(bp.price_real || 0);
            validBumps.push({ id: bp.id, name: bp.name, price: bp.price_real });
          });
        }
      }
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
      body.installments = Number(installments) || 1;
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
        message: detailedError,
        requestId 
      };
    }

    // 8. Sucesso e Persistência
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

    await supabaseAdmin.from('orders').update(updatedOrder).eq('id', orderId);

    if (paidStatus) {
      // Resolve member area URL dynamically
      const baseUrl = process.env.VITE_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://app.supercheckout.app');
      let membersAreaUrl = `${baseUrl}/login`;
      const { data: links } = await supabaseAdmin
          .from('product_contents')
          .select('content:contents(member_area_id, member_areas(slug, domains(domain)))')
          .eq('product_id', mainProduct.id)
          .limit(1);

      const area = links?.[0]?.content?.member_areas;
      if (area?.slug) membersAreaUrl = `${baseUrl}/app/${area.slug}`;
      if (area?.domains?.domain) membersAreaUrl = `https://${area.domains.domain}`;

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
        await sendPaymentApprovedEmail(orderId, { ...checkout, ...updatedOrder, customer_email: customerEmail, customer_name: customerName, membersAreaUrl }, mainProduct.name);
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
    console.error('[MP-FETCH] Erro Crítico:', error);
    
    const apiResponse = error.api_response?.content || error;
    const errorMessage = apiResponse.message || error.message || 'Erro interno no processador Fetch';

    return {
      success: false,
      error: `${errorMessage} | FETCH_RELIABILITY_V6`,
      details: {
        raw: error,
        apiError: apiResponse, 
        sentPayload: body, 
        message: errorMessage,
        timestamp: new Date().toISOString(),
        v: 'fetch_v6',
        orderId
      }
    };
  }
}

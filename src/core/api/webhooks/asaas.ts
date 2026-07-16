import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { resolveLocalSupabaseServerClient } from '../_supabase-server.js';
import { fulfillOrder } from '../../services/fulfillment.js';
import { decrypt } from '../../utils/cryptoUtils.js';
import {
  buildSafeAsaasRawResponse,
  mapAsaasStatusToLocal,
  resolveAsaasEnvironment,
} from '../../utils/asaas.js';
import { getAllowedGatewayIdsForPaymentMethod } from '../../config/paymentRouting.js';

function getHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function isMissingCheckoutBackupGatewayColumn(error: any) {
  const normalized = String(
    error?.message
    || error?.details
    || error?.hint
    || ''
  ).toLowerCase();

  return error?.code === '42703' && normalized.includes('backup_gateway_id');
}

async function getRawBody(req: VercelRequest): Promise<string> {
  return await new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: any) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', (error: any) => reject(error));
  });
}

async function isAlreadyProcessed(supabaseAdmin: any, eventId: string) {
  if (!eventId) return false;
  const { data } = await supabaseAdmin
    .from('webhook_logs')
    .select('id')
    .eq('event', eventId)
    .eq('processed', true)
    .limit(1);

  return Boolean(data && data.length > 0);
}

async function loadOrderAndCheckout(supabaseAdmin: any, orderId?: string | null) {
  if (!orderId) return { order: null, checkout: null };

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id,status,checkout_id,user_id,customer_email,customer_name,payment_id,payment_method')
    .eq('id', orderId)
    .maybeSingle();

  if (!order?.checkout_id) {
    return { order, checkout: null };
  }

  const legacyResult = await supabaseAdmin
    .from('checkouts')
    .select('id,user_id,gateway_id,backup_gateway_id,config')
    .eq('id', order.checkout_id)
    .maybeSingle();

  if (!legacyResult.error) {
    return { order, checkout: legacyResult.data || null };
  }

  if (!isMissingCheckoutBackupGatewayColumn(legacyResult.error)) {
    throw legacyResult.error;
  }

  console.warn('[Asaas Webhook] Legacy column public.checkouts.backup_gateway_id is missing. Falling back to routing config only.');

  const fallbackResult = await supabaseAdmin
    .from('checkouts')
    .select('id,user_id,gateway_id,config')
    .eq('id', order.checkout_id)
    .maybeSingle();

  if (fallbackResult.error) {
    throw fallbackResult.error;
  }

  return {
    order,
    checkout: fallbackResult.data
      ? { ...fallbackResult.data, backup_gateway_id: null }
      : null,
  };
}

async function logWebhook(supabaseAdmin: any, params: {
  eventId: string;
  gatewayId?: string | null;
  processed: boolean;
  payload: string;
  providerPaymentId?: string | null;
  providerEvent?: string | null;
  orderId?: string | null;
}) {
  try {
    await supabaseAdmin.from('webhook_logs').insert({
      id: `wh_asaas_${crypto.randomUUID()}`,
      gateway_id: params.gatewayId || null,
      direction: 'inbound',
      event: params.eventId,
      payload: JSON.stringify({
        redacted: true,
        provider: 'asaas',
        provider_payment_id: params.providerPaymentId || null,
        provider_event: params.providerEvent || null,
        order_id: params.orderId || null,
      }),
      raw_data: params.payload,
      processed: params.processed,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Asaas Webhook] Failed to persist webhook log:', error);
  }
}

export async function handleAsaasWebhook(
  req: VercelRequest,
  res: VercelResponse,
  rawBodyOverride?: string,
  supabaseAdminOverride?: any,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const rawBody = typeof rawBodyOverride === 'string' ? rawBodyOverride : await getRawBody(req);
    const payload = rawBody
      ? JSON.parse(rawBody)
      : (req.body && typeof req.body === 'object' ? req.body : null);
    const rawPayloadForLog = rawBody || JSON.stringify(payload || {});
    if (!payload?.payment?.id || !payload?.event) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const providerPaymentId = String(payload.payment.id || '').trim();
    const providerEventId = String(payload.id || '').trim();
    const providerEvent = String(payload.event || '').trim();
    const externalReference = String(payload.payment.externalReference || '').trim();
    const eventId = providerEventId
      ? `asaas_${providerEventId}`
      : `asaas_${providerPaymentId}_${providerEvent || 'event'}`;

    const { supabase: defaultSupabaseAdmin } = await resolveLocalSupabaseServerClient();
    const supabaseAdmin = supabaseAdminOverride || defaultSupabaseAdmin;
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Database connection failed' });
    }

    if (await isAlreadyProcessed(supabaseAdmin, eventId)) {
      return res.status(200).json({ status: 'ALREADY_PROCESSED' });
    }

    const { data: paymentRecord } = await supabaseAdmin
      .from('payments')
      .select('id,order_id,gateway_id,user_id,status')
      .eq('transaction_id', providerPaymentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const resolvedOrderId = paymentRecord?.order_id || externalReference;
    const { order, checkout } = await loadOrderAndCheckout(supabaseAdmin, resolvedOrderId);
    if (!order || !checkout) {
      await logWebhook(supabaseAdmin, {
        eventId,
        processed: false,
        payload: rawPayloadForLog,
        providerPaymentId,
        providerEvent,
        orderId: resolvedOrderId,
      });
      return res.status(200).json({ status: 'ORDER_NOT_FOUND' });
    }

    const allowedGatewayIds = getAllowedGatewayIdsForPaymentMethod({
      config: checkout.config || null,
      gatewayId: checkout.gateway_id || null,
      backupGatewayId: checkout.backup_gateway_id || null,
      paymentMethod: String(order.payment_method || '').trim() as any,
    });
    if (allowedGatewayIds.length === 0) {
      await logWebhook(supabaseAdmin, {
        eventId,
        processed: false,
        payload: rawPayloadForLog,
        providerPaymentId,
        providerEvent,
        orderId: resolvedOrderId,
      });
      return res.status(200).json({ status: 'GATEWAY_NOT_FOUND' });
    }
    let gatewayId = paymentRecord?.gateway_id ? String(paymentRecord.gateway_id) : '';
    if (!gatewayId) {
      const { data: candidateGateways } = await supabaseAdmin
        .from('gateways')
        .select('id')
        .in('id', allowedGatewayIds)
        .eq('user_id', order.user_id)
        .eq('name', 'asaas')
        .eq('active', true);
      gatewayId = String(candidateGateways?.[0]?.id || '').trim();
    }

    if (!gatewayId) {
      await logWebhook(supabaseAdmin, {
        eventId,
        processed: false,
        payload: rawPayloadForLog,
        providerPaymentId,
        providerEvent,
        orderId: resolvedOrderId,
      });
      return res.status(200).json({ status: 'GATEWAY_NOT_FOUND' });
    }

    const { data: gateway } = await supabaseAdmin
      .from('gateways')
      .select('id,user_id,private_key,webhook_secret,config')
      .eq('id', gatewayId)
      .maybeSingle();

    if (!gateway?.id || gateway.user_id !== order.user_id) {
      await logWebhook(supabaseAdmin, {
        eventId,
        gatewayId,
        processed: false,
        payload: rawPayloadForLog,
        providerPaymentId,
        providerEvent,
        orderId: resolvedOrderId,
      });
      return res.status(200).json({ status: 'OWNERSHIP_REJECTED' });
    }

    const expectedWebhookToken = decrypt(gateway.webhook_secret || '').replace(/\s/g, '').trim();
    const providedWebhookToken = getHeaderValue(req.headers['asaas-access-token']).trim();
    if (expectedWebhookToken && expectedWebhookToken !== providedWebhookToken) {
      return res.status(401).json({ status: 'INVALID_SIGNATURE' });
    }

    if (externalReference && externalReference !== order.id) {
      await logWebhook(supabaseAdmin, {
        eventId,
        gatewayId,
        processed: false,
        payload: rawPayloadForLog,
        providerPaymentId,
        providerEvent,
        orderId: resolvedOrderId,
      });
      return res.status(200).json({ status: 'ORDER_MISMATCH' });
    }

    const decryptedApiKey = decrypt(gateway.private_key || '').replace(/\s/g, '').trim();
    const {
      configuredSandbox,
      keyEnvironment,
      effectiveSandbox,
    } = resolveAsaasEnvironment({
      configuredSandbox: gateway.config?.sandbox === true,
      apiKey: decryptedApiKey,
    });

    if (keyEnvironment && ((keyEnvironment === 'sandbox') !== configuredSandbox)) {
      console.warn('[Asaas Webhook] Gateway config sandbox does not match API key prefix. Using key environment.', {
        gatewayId,
        configuredSandbox,
        keyEnvironment,
      });
    }

    const localStatus = mapAsaasStatusToLocal(payload.payment.status, payload.payment.billingType, {
      sandbox: effectiveSandbox,
    });
    const safeRawResponse = buildSafeAsaasRawResponse(payload.payment);

    if (paymentRecord?.id) {
      await supabaseAdmin
        .from('payments')
        .update({
          status: localStatus,
          transaction_id: providerPaymentId,
          raw_response: safeRawResponse,
          user_id: order.user_id,
        })
        .eq('id', paymentRecord.id)
        .eq('order_id', order.id);
    } else {
      await supabaseAdmin
        .from('payments')
        .insert({
          id: crypto.randomUUID(),
          order_id: order.id,
          gateway_id: gatewayId,
          status: localStatus,
          transaction_id: providerPaymentId,
          raw_response: safeRawResponse,
          user_id: order.user_id,
          created_at: new Date().toISOString(),
        });
    }

    if (String(order.status || '').toLowerCase() !== localStatus || String(order.payment_id || '') !== providerPaymentId) {
      await supabaseAdmin
        .from('orders')
        .update({
          status: localStatus,
          payment_id: providerPaymentId,
        })
        .eq('id', order.id)
        .eq('checkout_id', order.checkout_id);
    }

    if (localStatus === 'paid' && String(order.status || '').toLowerCase() !== 'paid') {
      try {
        await fulfillOrder(supabaseAdmin, {
          orderId: order.id,
          email: order.customer_email,
          name: order.customer_name,
        });
      } catch (fulfillmentError) {
        console.error('[Asaas Webhook] Fulfillment error:', fulfillmentError);
      }
    }

    await logWebhook(supabaseAdmin, {
      eventId,
      gatewayId,
      processed: true,
      payload: rawPayloadForLog,
      providerPaymentId,
      providerEvent,
      orderId: order.id,
    });

    return res.status(200).json({ status: 'OK' });
  } catch (error: any) {
    console.error('[Asaas Webhook] Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return handleAsaasWebhook(req, res);
}

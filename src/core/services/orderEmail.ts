import {
  buildOrderDeliverables,
  stripSensitiveDeliverableFields,
  type OrderDeliverable,
} from './orderDeliverables.js';

type SupabaseAdmin = any;

type DeliveryEmailKind = 'direct_delivery' | 'member_access' | 'processing';

interface DeliveryEmailMessage {
  kind: DeliveryEmailKind;
  subject: string;
  html: string;
  deliverables: OrderDeliverable[];
}

export interface SendOrderAccessEmailInput {
  orderId: string;
  origin: string;
  email?: string | null;
  name?: string | null;
  force?: boolean;
}

const SENT_AT_KEY_BY_KIND: Record<DeliveryEmailKind, string> = {
  direct_delivery: 'direct_delivery_email_sent_at',
  member_access: 'member_access_email_sent_at',
  processing: 'delivery_processing_email_sent_at',
};

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function maskEmail(email?: string | null) {
  const [name, domain] = String(email || '').split('@');
  if (!name || !domain) return 'unknown';
  return `${name.slice(0, 2)}***@${domain}`;
}

function normalizeText(value: unknown, fallback: string) {
  const text = String(value || '').trim();
  return text || fallback;
}

function renderEmailShell(params: {
  title: string;
  greetingName: string;
  intro: string;
  sectionTitle?: string;
  bodyHtml?: string;
  businessName: string;
}) {
  const sectionTitle = params.sectionTitle
    ? `<h2 style="font-size:18px;color:#111827;margin:24px 0 12px;">${escapeHtml(params.sectionTitle)}</h2>`
    : '';

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827;line-height:1.6;">
      <h1 style="font-size:24px;line-height:1.2;margin:0 0 16px;color:#111827;">${escapeHtml(params.title)}</h1>
      <p style="margin:0 0 12px;color:#374151;">Ola, ${escapeHtml(params.greetingName)}.</p>
      <p style="margin:0;color:#374151;">${escapeHtml(params.intro)}</p>
      ${sectionTitle}
      ${params.bodyHtml || ''}
      <p style="margin:28px 0 0;color:#6b7280;font-size:13px;">Atenciosamente,<br/>Equipe ${escapeHtml(params.businessName)}</p>
    </div>
  `;
}

function renderDeliverableCards(deliverables: OrderDeliverable[], fallbackLabel: string) {
  return deliverables.map((deliverable) => {
    const url = escapeHtml(deliverable.url || '');
    const label = escapeHtml(normalizeText(deliverable.label, fallbackLabel));
    const instructions = normalizeText(deliverable.instructions, 'Seu acesso esta disponivel.');

    return `
      <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:12px 0;background:#ffffff;">
        <div style="font-weight:700;color:#111827;margin-bottom:6px;">${escapeHtml(deliverable.title)}</div>
        <div style="font-size:13px;color:#6b7280;margin-bottom:12px;">${escapeHtml(instructions)}</div>
        ${url ? `<a href="${url}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:700;padding:11px 16px;border-radius:8px;">${label}</a>` : ''}
      </div>
    `;
  }).join('');
}

function buildDeliveryMessages(params: {
  deliverables: OrderDeliverable[];
  customerName: string;
  businessName: string;
}): DeliveryEmailMessage[] {
  const actionable = params.deliverables.filter((deliverable) => deliverable.status === 'available' && deliverable.url);
  const directDeliverables = actionable.filter((deliverable) => deliverable.delivery_type === 'external_link');
  const memberDeliverables = actionable.filter((deliverable) => deliverable.delivery_type === 'member_area');

  const messages: DeliveryEmailMessage[] = [];

  if (memberDeliverables.length > 0) {
    messages.push({
      kind: 'member_access',
      subject: 'Seu acesso foi liberado',
      deliverables: memberDeliverables,
      html: renderEmailShell({
        title: 'Seu acesso foi liberado',
        greetingName: params.customerName,
        intro: 'Seu acesso a area de membros foi liberado com sucesso. Use o botao abaixo para entrar no conteudo comprado.',
        sectionTitle: memberDeliverables.length > 1 ? 'Areas liberadas' : 'Area liberada',
        bodyHtml: renderDeliverableCards(memberDeliverables, 'Acessar area de membros'),
        businessName: params.businessName,
      }),
    });
  }

  if (directDeliverables.length > 0) {
    messages.push({
      kind: 'direct_delivery',
      subject: directDeliverables.length > 1 ? 'Seus materiais estao disponiveis' : 'Seu material esta disponivel',
      deliverables: directDeliverables,
      html: renderEmailShell({
        title: directDeliverables.length > 1 ? 'Seus materiais estao disponiveis' : 'Seu material esta disponivel',
        greetingName: params.customerName,
        intro: 'Sua compra foi aprovada e os materiais de entrega direta ja estao disponiveis para acesso.',
        sectionTitle: directDeliverables.length > 1 ? 'Materiais da compra' : 'Material da compra',
        bodyHtml: renderDeliverableCards(directDeliverables, 'Acessar material'),
        businessName: params.businessName,
      }),
    });
  }

  if (messages.length === 0) {
    messages.push({
      kind: 'processing',
      subject: 'Pedido aprovado',
      deliverables: [],
      html: renderEmailShell({
        title: 'Pedido aprovado',
        greetingName: params.customerName,
        intro: 'Seu pagamento foi aprovado. A entrega automatica ainda esta em processamento; caso precise de ajuda, responda este e-mail.',
        businessName: params.businessName,
      }),
    });
  }

  return messages;
}

async function loadBusinessSettings(supabaseAdmin: SupabaseAdmin, merchantUserId?: string | null) {
  let settings: any = null;
  if (merchantUserId) {
    const { data: account } = await supabaseAdmin
      .from('accounts')
      .select('id')
      .eq('owner_user_id', merchantUserId)
      .limit(1)
      .maybeSingle();

    if (account?.id) {
      const { data } = await supabaseAdmin
        .from('business_settings')
        .select('sender_name,business_name,sender_email')
        .eq('account_id', account.id)
        .limit(1)
        .maybeSingle();
      settings = data;
    }
  }

  if (!settings) {
    const { data } = await supabaseAdmin
      .from('business_settings')
      .select('sender_name,business_name,sender_email')
      .limit(1)
      .maybeSingle();
    settings = data;
  }

  return settings;
}

async function loadResendIntegration(supabaseAdmin: SupabaseAdmin, merchantUserId?: string | null) {
  let integrationQuery = supabaseAdmin
    .from('integrations')
    .select('*')
    .eq('name', 'resend')
    .eq('active', true)
    .limit(1);

  if (merchantUserId) integrationQuery = integrationQuery.eq('user_id', merchantUserId);
  const { data: merchantIntegration } = await integrationQuery.maybeSingle();
  if (merchantIntegration || !merchantUserId) return merchantIntegration;

  const { data: globalIntegration } = await supabaseAdmin
    .from('integrations')
    .select('*')
    .eq('name', 'resend')
    .eq('active', true)
    .limit(1)
    .maybeSingle();

  return globalIntegration;
}

async function sendViaResend(params: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
}) {
  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });

  const resendData = await resendRes.json().catch(() => ({}));
  if (!resendRes.ok) {
    throw new Error(`Resend rejected order email: ${JSON.stringify(resendData)}`);
  }

  return resendData;
}

export async function sendOrderAccessEmail(
  supabaseAdmin: SupabaseAdmin,
  input: SendOrderAccessEmailInput,
) {
  const { orderId } = input;
  if (!orderId) throw new Error('Missing orderId for order email.');

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, customer_email, customer_name, items, metadata, checkout_id, checkouts(user_id)')
    .eq('id', orderId)
    .single();

  if (orderError || !order) throw new Error(`Order ${orderId} not found for access email.`);

  const metadata = order.metadata && typeof order.metadata === 'object' ? order.metadata : {};
  const to = input.email || order.customer_email;
  const name = input.name || order.customer_name || 'Cliente';
  if (!to) throw new Error(`Order ${orderId} has no recipient email.`);

  const merchantUserId = order.checkouts?.user_id;
  const [integration, settings] = await Promise.all([
    loadResendIntegration(supabaseAdmin, merchantUserId),
    loadBusinessSettings(supabaseAdmin, merchantUserId),
  ]);

  const apiKey = integration?.config?.apiKey || integration?.config?.api_key;
  const fromEmail = integration?.config?.senderEmail || integration?.config?.from_email || settings?.sender_email || 'onboarding@resend.dev';
  if (!apiKey) throw new Error("Email provider 'resend' is not active or configured.");

  const deliverables = await buildOrderDeliverables(supabaseAdmin, {
    order,
    origin: input.origin,
    recipientEmail: to,
    includeAccessTokens: true,
  });

  const businessName = settings?.business_name || 'Super Checkout';
  const messages = buildDeliveryMessages({
    deliverables,
    customerName: name,
    businessName,
  }).filter((message) => input.force || !metadata[SENT_AT_KEY_BY_KIND[message.kind]]);

  if (messages.length === 0 || (!input.force && metadata.order_completed_email_sent_at)) {
    return { skipped: true, reason: 'already_sent' };
  }

  let emailMetadata = metadata;
  const persistMetadata = async (partial: Record<string, any>) => {
    emailMetadata = {
      ...emailMetadata,
      ...partial,
    };
    await supabaseAdmin
      .from('orders')
      .update({ metadata: emailMetadata })
      .eq('id', orderId);
  };

  if (!input.force) {
    const sendingAt = new Date().toISOString();
    const { data: lockRows, error: lockError } = await supabaseAdmin
      .from('orders')
      .update({
        metadata: {
          ...metadata,
          order_completed_email_sending_at: sendingAt,
        },
      })
      .eq('id', orderId)
      .is('metadata->>order_completed_email_sent_at', null)
      .is('metadata->>order_completed_email_sending_at', null)
      .select('id')
      .limit(1);

    if (lockError) {
      console.warn('[OrderEmailService] Could not acquire email send lock:', lockError.message);
      return { skipped: true, reason: 'email_lock_error' };
    } else if (!lockRows || lockRows.length === 0) {
      return { skipped: true, reason: 'send_in_progress_or_already_sent' };
    }

    emailMetadata = {
      ...metadata,
      order_completed_email_sending_at: sendingAt,
    };
  }

  const senderName = settings?.sender_name || settings?.business_name;
  const cleanFromEmail = String(fromEmail).replace(/.*<|>/g, '');
  const from = senderName ? `${senderName} <${cleanFromEmail}>` : cleanFromEmail;
  const sentIds: Record<string, string | null> = {};
  const sentTypes: DeliveryEmailKind[] = [];

  console.log(`[OrderEmailService] Sending ${messages.length} post-purchase email(s) for ${orderId} to ${maskEmail(to)}.`);

  try {
    for (const message of messages) {
      const resendData = await sendViaResend({
        apiKey,
        from,
        to,
        subject: message.subject,
        html: message.html,
      });

      sentIds[message.kind] = resendData?.id || null;
      sentTypes.push(message.kind);
      await persistMetadata({
        [SENT_AT_KEY_BY_KIND[message.kind]]: new Date().toISOString(),
        [`${message.kind}_email_resend_id`]: resendData?.id || null,
      });
    }

    await persistMetadata({
      order_completed_email_sending_at: null,
      order_completed_email_sent_at: new Date().toISOString(),
      order_completed_email_resend_id: Object.values(sentIds).find(Boolean) || null,
      order_completed_email_resend_ids: sentIds,
      order_completed_email_types: sentTypes,
      order_completed_email_source: 'vercel',
      order_deliverables_email_snapshot: deliverables.map(stripSensitiveDeliverableFields),
    });
  } catch (error: any) {
    await persistMetadata({
      order_completed_email_sending_at: null,
      order_completed_email_error: error?.message || 'email_send_failed',
      order_completed_email_failed_at: new Date().toISOString(),
    });
    throw error;
  }

  return {
    sent: true,
    id: Object.values(sentIds).find(Boolean) || null,
    ids: sentIds,
    sentTypes,
  };
}

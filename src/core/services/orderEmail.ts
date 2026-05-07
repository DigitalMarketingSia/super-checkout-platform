import { createLoginToken } from '../utils/loginToken.js';

type SupabaseAdmin = any;

export interface SendOrderAccessEmailInput {
  orderId: string;
  origin: string;
  email?: string | null;
  name?: string | null;
  force?: boolean;
}

const replaceTemplateVars = (template: string, variables: Record<string, string>) => {
  let output = template || '';
  for (const [key, value] of Object.entries(variables)) {
    output = output.replace(new RegExp(key, 'g'), value || '');
  }
  return output;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function maskEmail(email?: string | null) {
  const [name, domain] = String(email || '').split('@');
  if (!name || !domain) return 'unknown';
  return `${name.slice(0, 2)}***@${domain}`;
}

function normalizeOrigin(origin: string) {
  const raw = origin || process.env.NEXT_PUBLIC_APP_URL || process.env.VITE_SITE_URL || 'https://app.supercheckout.app';
  try {
    const parsed = new URL(raw);
    return parsed.origin;
  } catch {
    return String(raw).replace(/\/+$/, '');
  }
}

function getAreaDomain(area: any): string {
  const domains = area?.domains;
  if (Array.isArray(domains)) return domains[0]?.domain || '';
  return domains?.domain || '';
}

function ensureTokenizedAccessLink(html: string, membersAreaUrl: string) {
  if (!html) return html;
  if (html.includes('login_token=') || html.includes('auth_token=')) return html;

  let output = html;
  let visualUrl = membersAreaUrl;
  try {
    const parsed = new URL(membersAreaUrl);
    parsed.search = '';
    parsed.hash = '';
    visualUrl = parsed.toString().replace(/\/$/, '');
  } catch {
    visualUrl = membersAreaUrl.split('?')[0].replace(/\/$/, '');
  }

  const candidates = Array.from(new Set([
    visualUrl,
    visualUrl.replace(/^https?:\/\/[^/]+/, ''),
  ].filter(Boolean)));

  for (const candidate of candidates) {
    const pattern = new RegExp(escapeRegExp(candidate), 'g');
    if (pattern.test(output)) {
      output = output.replace(pattern, membersAreaUrl);
    }
  }

  if (output.includes('login_token=') || output.includes('auth_token=')) return output;

  return `${output}
    <div style="margin-top: 24px; text-align: center;">
      <a href="${membersAreaUrl}" style="background-color: #0070f3; color: white; padding: 12px 20px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Acessar area de membros</a>
    </div>`;
}

async function resolveMembersAreaUrl(
  supabaseAdmin: SupabaseAdmin,
  order: any,
  origin: string,
  email: string,
) {
  const safeOrigin = normalizeOrigin(origin);
  let visualUrl = `${safeOrigin}/login`;
  const items = Array.isArray(order.items) ? order.items : [];
  const productIds = items.map((item: any) => item.product_id || item.id).filter(Boolean);

  try {
    if (productIds.length > 0) {
      const { data: products } = await supabaseAdmin
        .from('products')
        .select('id, member_area_id')
        .in('id', productIds);

      const directAreaId = (products || []).find((product: any) => product.member_area_id)?.member_area_id;
      if (directAreaId) {
        const { data: area } = await supabaseAdmin
          .from('member_areas')
          .select('slug, domains(domain)')
          .eq('id', directAreaId)
          .maybeSingle();

        if (area?.slug) {
          visualUrl = `${safeOrigin}/app/${area.slug}`;
        }
        const domain = getAreaDomain(area);
        if (domain) {
          visualUrl = `https://${domain}`;
        }
      }

      const { data: links } = await supabaseAdmin
        .from('product_contents')
        .select('content:contents(member_area_id, member_areas(slug, domains(domain)))')
        .in('product_id', productIds)
        .limit(1);

      const area = links?.[0]?.content?.member_areas;
      if (area?.slug && visualUrl === `${safeOrigin}/login`) {
        visualUrl = `${safeOrigin}/app/${area.slug}`;
      }
      const domain = getAreaDomain(area);
      if (domain) {
        visualUrl = `https://${domain}`;
      }
    }
  } catch (error: any) {
    console.warn('[OrderEmailService] Failed to resolve member area URL:', error.message || error);
  }

  // Generate a self-signed token containing the email.
  // The frontend will send this to POST /api/system?action=auto-login
  // which verifies it server-side and returns a ready session.
  const loginToken = createLoginToken(email);
  const separator = visualUrl.includes('?') ? '&' : '?';
  return `${visualUrl}${separator}login_token=${encodeURIComponent(loginToken)}`;
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
  if (!input.force && metadata.order_completed_email_sent_at) {
    return { skipped: true, reason: 'already_sent' };
  }

  const to = input.email || order.customer_email;
  const name = input.name || order.customer_name || 'Cliente';
  if (!to) throw new Error(`Order ${orderId} has no recipient email.`);

  const merchantUserId = order.checkouts?.user_id;
  let integrationQuery = supabaseAdmin
    .from('integrations')
    .select('*')
    .eq('name', 'resend')
    .eq('active', true)
    .limit(1);

  if (merchantUserId) integrationQuery = integrationQuery.eq('user_id', merchantUserId);
  const { data: merchantIntegration } = await integrationQuery.maybeSingle();
  let integration = merchantIntegration;

  if (!integration && merchantUserId) {
    const { data: globalIntegration } = await supabaseAdmin
      .from('integrations')
      .select('*')
      .eq('name', 'resend')
      .eq('active', true)
      .limit(1)
      .maybeSingle();
    integration = globalIntegration;
  }

  const apiKey = integration?.config?.apiKey || integration?.config?.api_key;
  const fromEmail = integration?.config?.senderEmail || integration?.config?.from_email || 'onboarding@resend.dev';
  if (!apiKey) throw new Error("Email provider 'resend' is not active or configured.");

  const { data: template } = await supabaseAdmin
    .from('email_templates')
    .select('*')
    .eq('event_type', 'ORDER_COMPLETED')
    .eq('active', true)
    .limit(1)
    .maybeSingle();

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

  const productNames = Array.isArray(order.items) && order.items.length > 0
    ? order.items.map((item: any) => item.name).filter(Boolean).join(', ')
    : 'Produto';
  const membersAreaUrl = await resolveMembersAreaUrl(supabaseAdmin, order, input.origin, to);
  const variables = {
    '{{order_id}}': orderId ? `#${orderId.split('-')[0]}` : '',
    '{{customer_name}}': name,
    '{{name}}': name,
    '{{email}}': to,
    '{{product_names}}': productNames || 'Produto',
    '{{members_area_url}}': membersAreaUrl,
    '{{business_name}}': settings?.business_name || 'Super Checkout',
  };

  const subject = replaceTemplateVars(template?.subject || 'Pagamento aprovado - acesso liberado', variables);
  const html = ensureTokenizedAccessLink(replaceTemplateVars(template?.html_body || `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1>Ola, {{customer_name}}!</h1>
      <p>Seu pagamento foi aprovado.</p>
      <p>Produto(s): <strong>{{product_names}}</strong></p>
      <p><a href="{{members_area_url}}">Acessar area de membros</a></p>
    </div>
  `, variables), membersAreaUrl);

  const senderName = settings?.sender_name || settings?.business_name;
  const cleanFromEmail = String(fromEmail).replace(/.*<|>/g, '');
  const from = senderName ? `${senderName} <${cleanFromEmail}>` : cleanFromEmail;

  console.log(`[OrderEmailService] Sending access email for ${orderId} to ${maskEmail(to)}.`);

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });

  const resendData = await resendRes.json().catch(() => ({}));
  if (!resendRes.ok) {
    throw new Error(`Resend rejected order email: ${JSON.stringify(resendData)}`);
  }

  await supabaseAdmin
    .from('orders')
    .update({
      metadata: {
        ...metadata,
        order_completed_email_sent_at: new Date().toISOString(),
        order_completed_email_resend_id: resendData?.id || null,
        order_completed_email_source: 'vercel',
      },
    })
    .eq('id', orderId);

  return { sent: true, id: resendData?.id, membersAreaUrl };
}

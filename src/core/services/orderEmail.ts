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

async function resolveMembersAreaUrl(
  supabaseAdmin: SupabaseAdmin,
  order: any,
  origin: string,
  email: string,
) {
  const safeOrigin = normalizeOrigin(origin);
  let visualUrl = `${safeOrigin}/login`;
  let tokenRedirectTo = visualUrl;
  const items = Array.isArray(order.items) ? order.items : [];
  const productIds = items.map((item: any) => item.product_id || item.id).filter(Boolean);

  try {
    if (productIds.length > 0) {
      const { data: links } = await supabaseAdmin
        .from('product_contents')
        .select('content:contents(member_area_id, member_areas(slug, domains(domain)))')
        .in('product_id', productIds)
        .limit(1);

      const area = links?.[0]?.content?.member_areas;
      if (area?.slug) {
        tokenRedirectTo = `${safeOrigin}/app/${area.slug}`;
        visualUrl = tokenRedirectTo;
      }
      if (area?.domains?.domain) {
        visualUrl = `https://${area.domains.domain}`;
      }
    }

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: tokenRedirectTo },
    });

    if (linkError) throw linkError;

    if (linkData?.properties?.hashed_token) {
      const separator = visualUrl.includes('?') ? '&' : '?';
      return `${visualUrl}${separator}auth_token=${linkData.properties.hashed_token}&auth_email=${encodeURIComponent(email)}`;
    }

    return linkData?.properties?.action_link || visualUrl;
  } catch (error: any) {
    console.warn('[OrderEmailService] Failed to generate member magic link:', error.message || error);
    return visualUrl;
  }
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
  const { data: integration } = await integrationQuery.maybeSingle();

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
  const html = replaceTemplateVars(template?.html_body || `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1>Ola, {{customer_name}}!</h1>
      <p>Seu pagamento foi aprovado.</p>
      <p>Produto(s): <strong>{{product_names}}</strong></p>
      <p><a href="{{members_area_url}}">Acessar area de membros</a></p>
    </div>
  `, variables);

  const configuredFrom = settings?.sender_email || fromEmail;
  const senderName = settings?.sender_name || settings?.business_name;
  const cleanFromEmail = String(configuredFrom).replace(/.*<|>/g, '');
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

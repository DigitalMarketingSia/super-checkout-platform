import crypto from 'crypto';

type SupabaseAdmin = any;

export interface FulfillOrderInput {
  orderId: string;
  email?: string | null;
  name?: string | null;
  items?: Array<{ id?: string; product_id?: string; name?: string }>;
}

export interface FulfillOrderResult {
  success: true;
  orderId: string;
  userId: string | null;
  accessGrantedCount: number;
  saasPlans: string[];
  beneficiaryEmail: string | null;
  beneficiaryName: string | null;
}

type ConsumedUpgradeIntent = {
  token: string;
  status: string;
  order_id: string;
  target_plan_slug: string;
  target_user_id: string;
  target_license_key: string;
  beneficiary_email: string | null;
  beneficiary_name: string | null;
};

const isPlainObject = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function maskEmail(email?: string | null) {
  const [name, domain] = String(email || '').split('@');
  if (!name || !domain) return 'unknown';
  return `${name.slice(0, 2)}***@${domain}`;
}

function generateTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  const bytes = crypto.randomBytes(32);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

async function tableExistsError(error: any, tableName: string) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === '42P01' || message.includes(tableName.toLowerCase());
}

async function appEventExists(supabaseAdmin: SupabaseAdmin, type: string, orderId: string) {
  const { data, error } = await supabaseAdmin
    .from('app_events')
    .select('id')
    .eq('type', type)
    .eq('payload->>order_id', orderId)
    .limit(1)
    .maybeSingle();

  if (error) {
    if (await tableExistsError(error, 'app_events')) return true;
    console.warn(`[FulfillmentService] Could not inspect ${type} app_event:`, error.message);
    return true;
  }

  return Boolean(data?.id);
}

async function insertAppEventOnce(
  supabaseAdmin: SupabaseAdmin,
  event: { type: string; payload: Record<string, unknown>; status: string; source: string },
) {
  const orderId = typeof event.payload.order_id === 'string' ? event.payload.order_id : '';
  if (orderId && await appEventExists(supabaseAdmin, event.type, orderId)) return;

  const { error } = await supabaseAdmin.from('app_events').insert(event);
  if (error) {
    if (await tableExistsError(error, 'app_events')) return;
    console.warn(`[FulfillmentService] Failed to emit ${event.type}:`, error.message);
  }
}

async function consumeUpgradeIntent(params: {
  token: string;
  orderId: string;
  purchasedPlanSlugs: string[];
  payerEmail: string | null;
  payerName: string | null;
  payerPhone: string | null;
  payerCpf: string | null;
  orderCreatedAt?: string | null;
  orderPaidAt?: string | null;
}) {
  const centralUrl = (process.env.CENTRAL_SUPABASE_URL || 'https://bcmnryxjweiovrwmztpn.supabase.co').replace(/\/+$/, '');
  const centralInvokeKey =
    process.env.CENTRAL_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_CENTRAL_SUPABASE_ANON_KEY ||
    process.env.VITE_CENTRAL_SUPABASE_ANON_KEY ||
    process.env.CENTRAL_SERVICE_ROLE_KEY ||
    '';
  const sharedSecret = process.env.CENTRAL_SHARED_SECRET || process.env.SHARED_SECRET || '';

  if (!centralInvokeKey || !sharedSecret) {
    throw new Error('Missing Central credentials for upgrade intent consumption.');
  }

  const response = await fetch(`${centralUrl}/functions/v1/upgrade-intents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: centralInvokeKey,
      Authorization: `Bearer ${centralInvokeKey}`,
      'x-admin-secret': sharedSecret,
    },
    body: JSON.stringify({
      action: 'consume_upgrade_intent',
      token: params.token,
      order_id: params.orderId,
      purchased_plan_slugs: params.purchasedPlanSlugs,
      payer_email: params.payerEmail,
      payer_name: params.payerName,
      payer_phone: params.payerPhone,
      payer_cpf: params.payerCpf,
      order_created_at: params.orderCreatedAt,
      order_paid_at: params.orderPaidAt,
    }),
  });

  const responseText = await response.text();
  const responseData = responseText ? JSON.parse(responseText) : {};

  if (!response.ok || !responseData?.success) {
    throw new Error(responseData?.error || 'Failed to consume upgrade intent.');
  }

  return responseData.data as ConsumedUpgradeIntent;
}

export async function fulfillOrder(
  supabaseAdmin: SupabaseAdmin,
  input: FulfillOrderInput,
): Promise<FulfillOrderResult> {
  const { orderId } = input;
  if (!orderId) throw new Error('Missing orderId for fulfillment.');

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('*, items')
    .eq('id', orderId)
    .single();

  if (orderError || !order) throw new Error(`Order ${orderId} not found.`);

  const payerEmail = input.email || order.customer_email;
  const payerName = input.name || order.customer_name || 'Cliente';
  if (!payerEmail) throw new Error('Missing customer email for fulfillment.');

  const orderMetadata = isPlainObject(order.metadata) ? order.metadata : {};
  if (orderMetadata.fulfilled_at && order.customer_user_id) {
    return {
      success: true,
      orderId,
      userId: order.customer_user_id,
      accessGrantedCount: Number(orderMetadata.fulfillment_access_granted_count || 0),
      saasPlans: Array.isArray(orderMetadata.fulfillment_saas_plans) ? orderMetadata.fulfillment_saas_plans : [],
      beneficiaryEmail: orderMetadata.fulfillment_beneficiary_email || payerEmail,
      beneficiaryName: orderMetadata.fulfillment_beneficiary_name || payerName,
    };
  }

  console.log(`[FulfillmentService] Processing order ${orderId} for ${maskEmail(payerEmail)}`);

  const items = input.items || order.items || [];
  let userId = order.customer_user_id || null;
  const saasPlansToCreate: string[] = [];
  let accessGrantedCount = 0;

  for (const item of items) {
    const productId = item.product_id || item.id;
    if (!productId) continue;

    const { data: product } = await supabaseAdmin
      .from('products')
      .select('saas_plan_slug')
      .eq('id', productId)
      .maybeSingle();

    if (product?.saas_plan_slug) saasPlansToCreate.push(product.saas_plan_slug);
  }

  const uniqueSaasPlansToCreate = Array.from(new Set(saasPlansToCreate));
  const upgradeIntentToken = typeof orderMetadata.upgrade_intent_token === 'string'
    ? orderMetadata.upgrade_intent_token.trim()
    : '';
  let upgradeBeneficiary: ConsumedUpgradeIntent | null = null;

  if (upgradeIntentToken) {
    if (uniqueSaasPlansToCreate.length === 0) {
      throw new Error('Upgrade intent provided but no upgrade product was found in this order.');
    }

    upgradeBeneficiary = await consumeUpgradeIntent({
      token: upgradeIntentToken,
      orderId,
      purchasedPlanSlugs: uniqueSaasPlansToCreate,
      payerEmail,
      payerName,
      payerPhone: order.customer_phone || null,
      payerCpf: order.customer_cpf || null,
      orderCreatedAt: order.created_at || null,
      orderPaidAt: order.paid_at || order.updated_at || null,
    });

    userId = upgradeBeneficiary.target_user_id;
  }

  if (!userId) {
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', payerEmail)
      .maybeSingle();

    if (existingProfile?.id) {
      userId = existingProfile.id;
    } else {
      const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: payerEmail,
        email_confirm: true,
        password: generateTemporaryPassword(),
        user_metadata: {
          full_name: payerName,
          name: payerName,
          requires_password_setup: true,
          created_by: 'vercel-fulfillment',
        },
      });

      if (createError) {
        console.warn('[FulfillmentService] createUser failed, trying profile fallback:', createError.message);
        const { data: profileAfterError } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('email', payerEmail)
          .maybeSingle();
        userId = profileAfterError?.id || null;
      } else {
        userId = userData.user?.id || null;
      }
    }
  }

  if (!userId) throw new Error(`Could not create or locate customer user for ${maskEmail(payerEmail)}.`);

  try {
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: {
        full_name: payerName,
        name: payerName,
      },
    });
  } catch (metadataError: any) {
    console.warn('[FulfillmentService] Could not sync buyer auth metadata:', metadataError?.message || metadataError);
  }

  await supabaseAdmin
    .from('profiles')
    .update({ full_name: payerName })
    .eq('id', userId)
    .or('full_name.is.null,full_name.eq.Usuario,full_name.eq.User');

  const mergedMetadata: Record<string, any> = {
    ...orderMetadata,
    fulfillment_started_at: new Date().toISOString(),
    fulfillment_source: 'vercel',
    fulfillment_saas_plans: uniqueSaasPlansToCreate,
    fulfillment_beneficiary_email: upgradeBeneficiary?.beneficiary_email || payerEmail,
    fulfillment_beneficiary_name: upgradeBeneficiary?.beneficiary_name || payerName,
  };

  if (upgradeBeneficiary) {
    Object.assign(mergedMetadata, {
      upgrade_intent_token: upgradeIntentToken,
      upgrade_intent_status: upgradeBeneficiary.status,
      upgrade_target_user_id: upgradeBeneficiary.target_user_id,
      upgrade_target_license_key: upgradeBeneficiary.target_license_key,
      upgrade_target_plan_slug: upgradeBeneficiary.target_plan_slug,
      upgrade_consumed_at: new Date().toISOString(),
      payer_snapshot: {
        email: payerEmail,
        name: payerName,
        phone: order.customer_phone || null,
        cpf: order.customer_cpf || null,
      },
    });
  }

  await supabaseAdmin
    .from('orders')
    .update({ customer_user_id: userId, metadata: mergedMetadata })
    .eq('id', orderId);

  for (const item of items) {
    const productId = item.product_id || item.id;
    if (!productId) continue;
    const grantedAt = new Date().toISOString();

    const { error } = await supabaseAdmin.from('access_grants').upsert({
      user_id: userId,
      product_id: productId,
      status: 'active',
      granted_at: grantedAt,
    }, { onConflict: 'user_id,product_id' });

    if (error) {
      console.warn(`[FulfillmentService] Failed to grant product ${productId}:`, error.message);
    } else {
      accessGrantedCount += 1;
    }

    const { data: linkedContents, error: linkedContentsError } = await supabaseAdmin
      .from('product_contents')
      .select('content_id')
      .eq('product_id', productId);

    if (linkedContentsError) {
      console.warn(`[FulfillmentService] Failed to load contents for product ${productId}:`, linkedContentsError.message);
      continue;
    }

    const contentGrants = Array.from(new Set((linkedContents || [])
      .map((row: any) => row.content_id)
      .filter(Boolean)))
      .map((contentId: string) => ({
        user_id: userId,
        content_id: contentId,
        product_id: null,
        status: 'active',
        granted_at: grantedAt,
      }));

    if (contentGrants.length === 0) {
      console.warn(`[FulfillmentService] Product ${productId} has no linked contents. Only product-level access granted.`);
      continue;
    }

    const { error: contentGrantError } = await supabaseAdmin
      .from('access_grants')
      .upsert(contentGrants, { onConflict: 'user_id,content_id' });

    if (contentGrantError) {
      console.warn(`[FulfillmentService] Failed to grant contents for product ${productId}:`, contentGrantError.message);
    } else {
      accessGrantedCount += contentGrants.length;
    }
  }

  const productNames = items.map((item: any) => item.name).filter(Boolean).join(', ') || 'Produtos';
  const systemRecipientEmail = upgradeBeneficiary?.beneficiary_email || payerEmail;
  const systemRecipientName = upgradeBeneficiary?.beneficiary_name || payerName;

  if (accessGrantedCount > 0) {
    await insertAppEventOnce(supabaseAdmin, {
      type: 'ACCESS_GRANTED',
      payload: { order_id: orderId, email: payerEmail, name: payerName, user_id: userId, product_names: productNames },
      status: 'processed',
      source: 'vercel-fulfillment',
    });
  }

  await insertAppEventOnce(supabaseAdmin, {
    type: 'ORDER_COMPLETED',
    payload: {
      order_id: orderId,
      email: payerEmail,
      name: payerName,
      user_id: userId,
      saas_plans: uniqueSaasPlansToCreate,
      product_names: productNames,
      beneficiary_email: systemRecipientEmail,
      beneficiary_name: systemRecipientName,
      upgrade_intent_token: upgradeIntentToken || null,
    },
    status: 'processed',
    source: 'vercel-fulfillment',
  });

  await supabaseAdmin
    .from('orders')
    .update({
      metadata: {
        ...mergedMetadata,
        fulfilled_at: new Date().toISOString(),
        fulfillment_access_granted_count: accessGrantedCount,
      },
    })
    .eq('id', orderId);

  return {
    success: true,
    orderId,
    userId,
    accessGrantedCount,
    saasPlans: uniqueSaasPlansToCreate,
    beneficiaryEmail: systemRecipientEmail,
    beneficiaryName: systemRecipientName,
  };
}

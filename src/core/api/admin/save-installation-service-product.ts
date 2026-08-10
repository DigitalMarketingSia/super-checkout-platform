import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enforceApiRateLimit } from '../_rate-limit.js';
import { logAuthzEvent, requireApiAuth } from '../_authz.js';
import { normalizeCatalogPlanSlug, SYSTEM_INSTALLATION_SERVICE } from '../../services/productCatalog.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INSTALLATION_SERVICE_PRODUCT_TYPE = 'installation_service';

function parseBody(req: VercelRequest): Record<string, unknown> {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
}

function text(value: unknown, maxLength: number, fallback = '') {
  return String(value ?? fallback).trim().slice(0, maxLength);
}

function nullableText(value: unknown, maxLength: number) {
  const normalized = text(value, maxLength);
  return normalized || null;
}

function nonNegativeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseInstallationServiceProduct(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const product = value as Record<string, unknown>;
  const name = text(product.name, 160);
  const productType = text(product.product_type, 80).toLowerCase();
  const serviceType = text(product.service_type, 80).toLowerCase() || SYSTEM_INSTALLATION_SERVICE;

  if (!name) return { error: 'O nome do produto de servico e obrigatorio.' };
  if (productType !== INSTALLATION_SERVICE_PRODUCT_TYPE) {
    return { error: 'Este endpoint aceita somente servico de instalacao.' };
  }
  if (serviceType !== SYSTEM_INSTALLATION_SERVICE) {
    return { error: 'Selecione um tipo de servico de instalacao valido.' };
  }

  const priceReal = nonNegativeNumber(product.price_real);
  return {
    record: {
      name,
      description: nullableText(product.description, 5000),
      active: product.active !== false,
      image_url: nullableText(product.imageUrl, 2048),
      price: priceReal,
      price_real: priceReal,
      price_fake: product.price_fake === null || product.price_fake === undefined || product.price_fake === ''
        ? null
        : nonNegativeNumber(product.price_fake),
      sku: nullableText(product.sku, 160),
      category: nullableText(product.category, 160),
      currency: 'BRL',
      is_order_bump: Boolean(product.is_order_bump),
      is_upsell: Boolean(product.is_upsell),
      visible_in_member_area: false,
      for_sale: product.for_sale !== false,
      product_type: INSTALLATION_SERVICE_PRODUCT_TYPE,
      service_type: SYSTEM_INSTALLATION_SERVICE,
      saas_plan_slug: null,
      member_area_action: 'none',
      member_area_checkout_id: null,
      member_area_id: null,
      redirect_link: null,
      delivery_file_path: null,
      delivery_file_name: null,
      delivery_file_mime_type: null,
      delivery_file_size_bytes: null,
    },
  };
}

function parseConfigValue(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === 'string' && parsed.trim() ? parsed.trim() : null;
  } catch {
    return trimmed.replace(/^"|"$/g, '') || null;
  }
}

function getSelfOrigin(req: VercelRequest) {
  const deploymentHost = String(process.env.VERCEL_URL || '').trim().toLowerCase();
  if (/^[a-z0-9.-]+\.vercel\.app$/i.test(deploymentHost)) return `https://${deploymentHost}`;

  if (process.env.NODE_ENV !== 'production') {
    const requestHost = Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host;
    if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(requestHost || ''))) {
      return `http://${requestHost}`;
    }
  }

  return '';
}

function isPartnerEntitlement(payload: any) {
  const plan = normalizeCatalogPlanSlug(payload?.plan_slug);
  const partnerRights = payload?.features?.partner_rights;
  return ['saas', 'partner', 'upgrade_partner'].includes(plan)
    || partnerRights === true
    || partnerRights === 'true'
    || partnerRights === 'unlimited';
}

async function resolvePartnerEntitlement(req: VercelRequest, token: string) {
  const origin = getSelfOrigin(req);
  if (!origin) throw new Error('A verificacao de entitlement exige um deployment Vercel configurado.');

  const response = await fetch(`${origin}/api/central-proxy?endpoint=check-entitlement`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action: 'resolve_all' }),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !isPartnerEntitlement(payload)) {
    return { allowed: false, plan: String(payload?.plan_slug || '').trim().toLowerCase() || null };
  }

  return { allowed: true, plan: String(payload?.plan_slug || '').trim().toLowerCase() };
}

async function resolveInstallationAccountId(supabaseAdmin: any) {
  const { data: config, error: configError } = await supabaseAdmin
    .from('app_config')
    .select('value')
    .eq('key', 'installation_id')
    .maybeSingle();
  if (configError) throw configError;

  const installationId = parseConfigValue(config?.value);
  if (!installationId || !UUID_PATTERN.test(installationId)) return null;

  const { data: installation, error: installationError } = await supabaseAdmin
    .from('installations')
    .select('license_key,status')
    .eq('installation_id', installationId)
    .maybeSingle();
  if (installationError) throw installationError;
  if (!installation?.license_key || String(installation.status || '').toLowerCase() !== 'active') return null;

  const { data: license, error: licenseError } = await supabaseAdmin
    .from('licenses')
    .select('account_id,status')
    .eq('key', installation.license_key)
    .maybeSingle();
  if (licenseError) throw licenseError;
  if (String(license?.status || '').toLowerCase() !== 'active') return null;

  return String(license?.account_id || '').trim() || null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireApiAuth(req, res, {
    source: 'admin_save_installation_service_product',
    allowedRoles: ['owner', 'admin', 'master_admin', 'partner'],
  });
  if (!auth) return;

  const body = parseBody(req);
  const mode = String(body.mode || '').trim().toLowerCase();
  const productId = String(body.productId || '').trim();
  const parsedProduct = parseInstallationServiceProduct(body.product);

  const rateLimit = enforceApiRateLimit(req, res, {
    scope: 'admin_save_installation_service_product',
    identifiers: [auth.user.id, productId || 'new'],
    limit: 30,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) return res.status(429).json({ error: 'Too many requests' });

  if ((mode !== 'create' && mode !== 'update') || !UUID_PATTERN.test(productId)) {
    return res.status(400).json({ error: 'Dados de produto invalidos.' });
  }
  if (!parsedProduct || 'error' in parsedProduct) {
    return res.status(400).json({ error: parsedProduct?.error || 'Dados de produto invalidos.' });
  }

  try {
    const { data: account, error: accountError } = await auth.supabaseAdmin
      .from('accounts')
      .select('id,status')
      .eq('owner_user_id', auth.user.id)
      .maybeSingle();
    if (accountError) throw accountError;

    const installationAccountId = await resolveInstallationAccountId(auth.supabaseAdmin);
    if (
      !account?.id
      || String(account.status || '').toLowerCase() !== 'active'
      || !installationAccountId
      || installationAccountId !== String(account.id)
    ) {
      await logAuthzEvent({
        supabaseAdmin: auth.supabaseAdmin,
        req,
        source: 'admin_save_installation_service_product',
        eventType: 'installation_service_write_rejected',
        severity: 'CRITICAL',
        userId: auth.user.id,
        metadata: { product_id: productId, reason: 'installation_account_mismatch' },
      });
      return res.status(403).json({ error: 'A conta atual nao corresponde a licenca desta instalacao.' });
    }

    const entitlement = await resolvePartnerEntitlement(req, auth.token);
    if (!entitlement.allowed) {
      await logAuthzEvent({
        supabaseAdmin: auth.supabaseAdmin,
        req,
        source: 'admin_save_installation_service_product',
        eventType: 'installation_service_write_rejected',
        severity: 'WARNING',
        userId: auth.user.id,
        metadata: { product_id: productId, reason: 'partner_entitlement_missing', plan: entitlement.plan },
      });
      return res.status(403).json({ error: 'Seu Plano Parceiro ativo e obrigatorio para criar servicos de instalacao.' });
    }

    if (mode === 'update') {
      const { data: existing, error: existingError } = await auth.supabaseAdmin
        .from('products')
        .select('id,user_id,product_type')
        .eq('id', productId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing) return res.status(404).json({ error: 'Produto de servico nao encontrado.' });
      if (
        String(existing.user_id || '') !== auth.user.id
        || String(existing.product_type || '') !== INSTALLATION_SERVICE_PRODUCT_TYPE
      ) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const { error } = await auth.supabaseAdmin
        .from('products')
        .update(parsedProduct.record)
        .eq('id', productId)
        .eq('user_id', auth.user.id);
      if (error) throw error;
    } else {
      const { error } = await auth.supabaseAdmin
        .from('products')
        .insert({ id: productId, user_id: auth.user.id, ...parsedProduct.record });
      if (error) throw error;
    }

    await logAuthzEvent({
      supabaseAdmin: auth.supabaseAdmin,
      req,
      source: 'admin_save_installation_service_product',
      eventType: mode === 'create' ? 'installation_service_product_created' : 'installation_service_product_updated',
      severity: 'INFO',
      userId: auth.user.id,
      metadata: {
        product_id: productId,
        plan: entitlement.plan,
        service_type: SYSTEM_INSTALLATION_SERVICE,
      },
    });

    return res.status(200).json({ success: true, productId });
  } catch (error: any) {
    console.error('[save-installation-service-product] Failed:', error?.message || error);
    return res.status(500).json({ error: 'Nao foi possivel salvar o produto de servico.' });
  }
}

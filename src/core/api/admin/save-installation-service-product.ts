import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enforceApiRateLimit } from '../_rate-limit.js';
import { logAuthzEvent, requireApiAuth } from '../_authz.js';
import {
  buildCentralInstallationTrustHeaders,
  getCentralInstallationTrustConfig,
} from '../_central-installation-trust.js';
import { normalizeCatalogPlanSlug, SYSTEM_INSTALLATION_SERVICE } from '../../services/productCatalog.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INSTALLATION_SERVICE_PRODUCT_TYPE = 'installation_service';
const OFFICIAL_CENTRAL_API_URL = 'https://bcmnryxjweiovrwmztpn.supabase.co/functions/v1';

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

function resolveCentralApiUrl() {
  return String(
    process.env.CENTRAL_API_URL
    || process.env.VITE_CENTRAL_API_URL
    || process.env.NEXT_PUBLIC_CENTRAL_API_URL
    || OFFICIAL_CENTRAL_API_URL,
  ).replace(/\/+$/, '');
}

function isPartnerEntitlement(payload: any) {
  const plan = normalizeCatalogPlanSlug(payload?.plan_slug || payload?.license?.plan);
  const partnerRights = payload?.features?.partner_rights
    ?? payload?.features?.FEATURE_PARTNER_PANEL
    ?? payload?.limits?.partner_rights;
  return ['saas', 'partner', 'upgrade_partner'].includes(plan)
    || partnerRights === true
    || partnerRights === 'true'
    || partnerRights === 'unlimited';
}

async function resolvePartnerEntitlement(installationId: string) {
  let trustConfig;
  try {
    trustConfig = getCentralInstallationTrustConfig();
  } catch (error: any) {
    return { allowed: false, plan: null, failure: error?.message || 'installation_trust_invalid' };
  }
  if (!trustConfig) return { allowed: false, plan: null, failure: 'installation_trust_missing' };
  if (trustConfig.installationId !== installationId) {
    return { allowed: false, plan: null, failure: 'installation_trust_mismatch' };
  }

  const rawBody = JSON.stringify({ action: 'resolve_all' });
  const headers = buildCentralInstallationTrustHeaders({
    config: trustConfig,
    method: 'POST',
    endpoint: 'check-entitlement',
    rawBody,
  });

  try {
    const response = await fetch(`${resolveCentralApiUrl()}/check-entitlement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: rawBody,
    });
    const payload = await response.json().catch(() => ({}));
    const plan = normalizeCatalogPlanSlug(payload?.plan_slug || payload?.license?.plan) || null;
    if (!response.ok) {
      return { allowed: false, plan, failure: `central_entitlement_http_${response.status}` };
    }
    return { allowed: isPartnerEntitlement(payload), plan, failure: null };
  } catch {
    return { allowed: false, plan: null, failure: 'central_entitlement_unreachable' };
  }
}

async function resolveInstallationContext(supabaseAdmin: any) {
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

  const accountId = String(license?.account_id || '').trim();
  return accountId ? { installationId, accountId } : null;
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

    const installationContext = await resolveInstallationContext(auth.supabaseAdmin);
    if (
      !account?.id
      || String(account.status || '').toLowerCase() !== 'active'
      || !installationContext
      || installationContext.accountId !== String(account.id)
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

    const entitlement = await resolvePartnerEntitlement(installationContext.installationId);
    if (!entitlement.allowed) {
      await logAuthzEvent({
        supabaseAdmin: auth.supabaseAdmin,
        req,
        source: 'admin_save_installation_service_product',
        eventType: 'installation_service_write_rejected',
        severity: entitlement.failure ? 'CRITICAL' : 'WARNING',
        userId: auth.user.id,
        metadata: {
          product_id: productId,
          reason: entitlement.failure || 'partner_entitlement_missing',
          plan: entitlement.plan,
        },
      });
      if (entitlement.failure) {
        return res.status(503).json({ error: 'Nao foi possivel confirmar seu Plano Parceiro no Central. Tente novamente em instantes.' });
      }
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

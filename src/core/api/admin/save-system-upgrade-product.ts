import type { VercelRequest, VercelResponse } from '@vercel/node';
import { logAuthzEvent } from '../_authz.js';
import { enforceApiRateLimit } from '../_rate-limit.js';
import { requireConfiguredPlatformOwner } from './_platform-owner.js';
import {
  SYSTEM_INSTALLATION_SERVICE,
  SYSTEM_UPGRADE_PLAN_SLUGS,
} from '../../services/productCatalog.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SYSTEM_UPGRADE_PRODUCT_TYPE = 'system_upgrade';
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

function parseProduct(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const product = value as Record<string, unknown>;
  const name = text(product.name, 160);
  const productType = text(product.product_type, 80).toLowerCase();
  const saasPlanSlug = text(product.saas_plan_slug, 80).toLowerCase();
  const serviceType = text(product.service_type, 80).toLowerCase() || SYSTEM_INSTALLATION_SERVICE;
  const isSystemUpgrade = productType === SYSTEM_UPGRADE_PRODUCT_TYPE;
  const isInstallationService = productType === INSTALLATION_SERVICE_PRODUCT_TYPE;

  if (!name) return { error: 'O nome do produto especial e obrigatorio.' };
  if (!isSystemUpgrade && !isInstallationService) {
    return { error: 'Tipo de produto especial invalido.' };
  }
  if (isSystemUpgrade && !SYSTEM_UPGRADE_PLAN_SLUGS.has(saasPlanSlug)) {
    return { error: 'Selecione um plano de upgrade valido.' };
  }
  if (isInstallationService && serviceType !== SYSTEM_INSTALLATION_SERVICE) {
    return { error: 'Selecione um tipo de servico de instalacao valido.' };
  }

  const priceReal = nonNegativeNumber(product.price_real);

  // This explicit allowlist is intentional. The server owns the commercial
  // classification and automatic delivery contract; the browser cannot turn
  // a platform product into a member/link/file delivery.
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
      product_type: productType,
      service_type: isInstallationService ? serviceType : null,
      saas_plan_slug: isSystemUpgrade ? saasPlanSlug : null,
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireConfiguredPlatformOwner(req, res, 'admin_save_platform_catalog_product');
  if (!auth) return;

  const body = parseBody(req);
  const mode = String(body.mode || '').trim().toLowerCase();
  const productId = String(body.productId || '').trim();
  const parsedProduct = parseProduct(body.product);

  const rateLimit = enforceApiRateLimit(req, res, {
    scope: 'admin_save_platform_catalog_product',
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
    if (mode === 'update') {
      const { data: existing, error: existingError } = await auth.supabaseAdmin
        .from('products')
        .select('id,user_id,product_type')
        .eq('id', productId)
        .maybeSingle();

      if (existingError) throw existingError;
      if (!existing) return res.status(404).json({ error: 'Produto especial nao encontrado.' });
      if (
        String(existing.user_id || '') !== auth.user.id
        || String(existing.product_type || '') !== parsedProduct.record.product_type
      ) {
        await logAuthzEvent({
          supabaseAdmin: auth.supabaseAdmin,
          req,
          source: 'admin_save_platform_catalog_product',
          eventType: 'platform_catalog_product_write_rejected',
          severity: 'CRITICAL',
          userId: auth.user.id,
          metadata: {
            product_id: productId,
            product_type: parsedProduct.record.product_type,
            reason: 'ownership_or_type_mismatch',
          },
        });
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
      source: 'admin_save_platform_catalog_product',
      eventType: mode === 'create' ? 'platform_catalog_product_created' : 'platform_catalog_product_updated',
      severity: 'INFO',
      userId: auth.user.id,
      metadata: {
        product_id: productId,
        product_type: parsedProduct.record.product_type,
        plan_slug: parsedProduct.record.saas_plan_slug,
        service_type: parsedProduct.record.service_type,
      },
    });

    return res.status(200).json({ success: true, productId });
  } catch (error: any) {
    console.error('[save-platform-catalog-product] Failed:', error?.message || error);
    return res.status(500).json({ error: 'Nao foi possivel salvar o produto especial.' });
  }
}

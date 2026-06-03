import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { logAuthzEvent, requireApiAuth } from '../_authz.js';
import { enforceApiRateLimit } from '../_rate-limit.js';

const DEFAULT_CONTROL_PLANE_URL = 'https://app.supercheckout.app';
const LEGACY_UPGRADE_PLAN_SLUG_MAP: Record<string, string> = {
  unlimited: 'upgrade_domains',
  partner: 'saas',
};

function parseBody(req: VercelRequest) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function getHostnameFromUrl(value?: string | null) {
  if (!value) return null;

  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isControlPlaneRequest(req: VercelRequest) {
  const allowedHosts = new Set(
    [
      'app.supercheckout.app',
      'super-checkout.vercel.app',
      getHostnameFromUrl(process.env.APP_URL),
      getHostnameFromUrl(process.env.NEXT_PUBLIC_APP_URL),
      getHostnameFromUrl(process.env.VITE_APP_URL),
      getHostnameFromUrl(process.env.VITE_SUPER_CHECKOUT_APP_URL),
    ].filter(Boolean) as string[],
  );

  const candidates = [
    req.headers.origin,
    req.headers.referer,
    req.headers.host ? `https://${req.headers.host}` : '',
  ];

  return candidates.some((candidate) => {
    const hostname = getHostnameFromUrl(Array.isArray(candidate) ? candidate[0] : candidate);
    return Boolean(hostname) && (
      hostname === 'localhost'
      || hostname === '127.0.0.1'
      || allowedHosts.has(hostname as string)
    );
  });
}

function normalizePlanSlug(slug?: string | null) {
  const normalized = String(slug || '').trim().toLowerCase();
  if (!normalized) return '';
  return LEGACY_UPGRADE_PLAN_SLUG_MAP[normalized] || normalized;
}

function getControlPlaneBaseUrl() {
  const configured =
    process.env.APP_URL
    || process.env.NEXT_PUBLIC_APP_URL
    || process.env.VITE_APP_URL
    || process.env.VITE_SUPER_CHECKOUT_APP_URL
    || DEFAULT_CONTROL_PLANE_URL;

  return String(configured).trim().replace(/\/+$/, '');
}

function getCentralSupabaseConfig() {
  const supabaseUrl =
    process.env.CENTRAL_SUPABASE_URL
    || process.env.VITE_CENTRAL_SUPABASE_URL
    || process.env.NEXT_PUBLIC_CENTRAL_SUPABASE_URL
    || 'https://bcmnryxjweiovrwmztpn.supabase.co';

  const serviceKey =
    process.env.CENTRAL_SUPABASE_SECRET_KEY
    || process.env.CENTRAL_SUPABASE_SECRET_KEY_NEW
    || process.env.CENTRAL_SUPABASE_SERVICE_ROLE_KEY
    || process.env.CENTRAL_SUPABASE_SERVICE_ROLE_KEY_NEW;

  return {
    supabaseUrl: String(supabaseUrl || '').trim(),
    serviceKey: String(serviceKey || '').trim(),
  };
}

function resolveCheckoutUrl(product: any) {
  const linkedCheckout = Array.isArray(product.linked_checkout)
    ? product.linked_checkout[0]
    : product.linked_checkout;
  const allCheckouts = Array.isArray(product.all_checkouts)
    ? product.all_checkouts
    : (product.all_checkouts ? [product.all_checkouts] : []);
  const bestCheckout = linkedCheckout || allCheckouts.find((checkout: any) => checkout?.active !== false) || allCheckouts[0];

  if (bestCheckout?.domains?.domain && bestCheckout?.custom_url_slug) {
    return `https://${bestCheckout.domains.domain}/${bestCheckout.custom_url_slug}`;
  }

  if (bestCheckout?.custom_url_slug) {
    return `${getControlPlaneBaseUrl()}/c/${bestCheckout.custom_url_slug}`;
  }

  return String(product.redirect_link || '').trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!isControlPlaneRequest(req)) {
      return res.status(403).json({ error: 'This action is only available on the official control plane.' });
    }

    const auth = await requireApiAuth(req, res, {
      source: 'admin_sync_saas_plan',
      allowedRoles: ['owner', 'master_admin'],
    });
    if (!auth) return;

    const { supabaseAdmin, user, role } = auth;
    const body = parseBody(req);
    const productId = String(body.productId || '').trim();

    const rateLimit = enforceApiRateLimit(req, res, {
      scope: 'admin_sync_saas_plan',
      identifiers: [user.id, productId],
      limit: 30,
      windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    if (!productId) {
      return res.status(400).json({ error: 'Missing productId' });
    }

    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select(`
        id,
        user_id,
        name,
        description,
        active,
        image_url,
        price,
        price_real,
        redirect_link,
        saas_plan_slug,
        linked_checkout:checkouts!member_area_checkout_id(id, custom_url_slug, domain_id, active, domains:domain_id(domain)),
        all_checkouts:checkouts!product_id(id, custom_url_slug, domain_id, active, domains:domain_id(domain))
      `)
      .eq('id', productId)
      .maybeSingle();

    if (productError) {
      console.error('[AdminSyncSaasPlan] Product lookup failed:', productError.message);
      return res.status(500).json({ error: 'Failed to load product for central sync.' });
    }

    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    if (product.user_id !== user.id && role !== 'master_admin') {
      await logAuthzEvent({
        supabaseAdmin,
        req,
        source: 'admin_sync_saas_plan',
        eventType: 'saas_plan_sync_rejected',
        severity: 'CRITICAL',
        userId: user.id,
        metadata: {
          product_id: productId,
          owner_user_id: product.user_id || null,
          reason: 'product_owner_mismatch',
        },
      });
      return res.status(403).json({ error: 'Product owner mismatch.' });
    }

    const normalizedSlug = normalizePlanSlug(product.saas_plan_slug);
    if (!normalizedSlug) {
      return res.status(400).json({ error: 'This product is not linked to an upgrade plan.' });
    }

    const { supabaseUrl, serviceKey } = getCentralSupabaseConfig();
    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: 'Central plan sync is missing CENTRAL_SUPABASE_URL or CENTRAL_SUPABASE_SECRET_KEY.' });
    }

    const centralSupabase = createClient(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const checkoutUrl = resolveCheckoutUrl(product);
    const price = Number(product.price_real ?? product.price ?? 0);

    const { data: updatedPlan, error: updateError } = await centralSupabase
      .from('plans')
      .update({
        name: product.name,
        description: product.description || '',
        image_url: product.image_url || null,
        price,
        checkout_url: checkoutUrl || null,
        active: product.active !== false,
      })
      .eq('slug', normalizedSlug)
      .select('id, slug, checkout_url, price, active')
      .maybeSingle();

    if (updateError) {
      console.error('[AdminSyncSaasPlan] Central plan update failed:', updateError.message);
      return res.status(500).json({ error: 'Failed to publish linked upgrade plan to the central catalog.' });
    }

    if (!updatedPlan) {
      return res.status(404).json({ error: `Central plan "${normalizedSlug}" was not found.` });
    }

    await logAuthzEvent({
      supabaseAdmin,
      req,
      source: 'admin_sync_saas_plan',
      eventType: 'saas_plan_synced',
      severity: 'INFO',
      userId: user.id,
      metadata: {
        product_id: product.id,
        plan_slug: normalizedSlug,
        checkout_url: checkoutUrl || null,
        price,
      },
    });

    return res.status(200).json({
      success: true,
      plan: updatedPlan,
      checkout_url: checkoutUrl || null,
    });
  } catch (error: any) {
    console.error('[AdminSyncSaasPlan] Unexpected error:', error?.message || error);
    return res.status(500).json({ error: 'Unexpected error while syncing central plan.' });
  }
}

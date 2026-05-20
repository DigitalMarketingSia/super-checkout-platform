import { createLoginToken } from '../utils/loginToken.js';

type SupabaseAdmin = any;

export type OrderDeliverableType = 'external_link' | 'member_area' | 'none';
export type OrderDeliverableStatus = 'available' | 'not_configured';

export interface OrderDeliverable {
  id: string;
  order_id: string;
  product_id: string | null;
  item_type: 'main' | 'bump' | 'upsell' | 'item';
  title: string;
  delivery_type: OrderDeliverableType;
  status: OrderDeliverableStatus;
  url: string | null;
  visual_url?: string | null;
  label: string;
  instructions?: string | null;
  sort_order: number;
  source: string;
}

interface BuildOrderDeliverablesInput {
  order: any;
  origin: string;
  recipientEmail?: string | null;
  includeAccessTokens?: boolean;
}

const isPlainObject = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const firstRelation = (value: any) => Array.isArray(value) ? value[0] : value;

function normalizeOrigin(origin: string) {
  const raw = origin || process.env.NEXT_PUBLIC_APP_URL || process.env.VITE_SITE_URL || 'https://app.supercheckout.app';
  try {
    return new URL(raw).origin;
  } catch {
    return String(raw).replace(/\/+$/, '');
  }
}

function normalizeDeliveryUrl(rawUrl: string | null | undefined, origin: string) {
  const raw = String(rawUrl || '').trim();
  if (!raw) return '';

  const withProtocol = !/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !raw.startsWith('/') && raw.includes('.')
    ? `https://${raw}`
    : (/^www\./i.test(raw) ? `https://${raw}` : raw);
  try {
    const parsed = new URL(withProtocol, normalizeOrigin(origin));
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function getAreaDomain(area: any): string {
  const domains = firstRelation(area?.domains);
  return String(domains?.domain || '').trim();
}

function getAreaUrl(area: any, origin: string) {
  const domain = getAreaDomain(area);
  if (domain) return `https://${domain}`;

  const slug = String(area?.slug || '').trim();
  if (!slug) return `${normalizeOrigin(origin)}/login`;
  return `${normalizeOrigin(origin)}/app/${slug}`;
}

function tokenizedMemberAreaUrl(baseUrl: string, recipientEmail?: string | null, includeAccessTokens = true) {
  if (!includeAccessTokens || !recipientEmail) return baseUrl;
  const loginToken = createLoginToken(recipientEmail);
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}login_token=${encodeURIComponent(loginToken)}`;
}

function isPdfUrl(url: string) {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return /\.pdf($|[?#])/i.test(url);
  }
}

function normalizeItemType(value: string): OrderDeliverable['item_type'] {
  if (value === 'main' || value === 'bump' || value === 'upsell') return value;
  return 'item';
}

function getProductId(item: any) {
  return String(item?.product_id || item?.id || '').trim();
}

function getProductTitle(item: any, product: any) {
  return String(item?.name || product?.name || 'Produto').trim();
}

function buildDeliverableId(orderId: string, productId: string | null, index: number) {
  return `${orderId}:${productId || 'item'}:${index}`;
}

export function hasActionableDeliverables(deliverables: OrderDeliverable[]) {
  return deliverables.some((deliverable) => deliverable.status === 'available' && Boolean(deliverable.url));
}

export async function buildOrderDeliverables(
  supabaseAdmin: SupabaseAdmin,
  input: BuildOrderDeliverablesInput,
): Promise<OrderDeliverable[]> {
  const order = input.order || {};
  const orderId = String(order.id || '').trim();
  const origin = normalizeOrigin(input.origin);
  const items = Array.isArray(order.items) ? order.items : [];

  if (!orderId || items.length === 0) return [];

  const productIds = Array.from(new Set(items.map(getProductId).filter(Boolean)));
  const productsById = new Map<string, any>();
  const directAreaIds = new Set<string>();

  if (productIds.length > 0) {
    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('id, name, redirect_link, member_area_action, member_area_id, member_area_checkout_id')
      .in('id', productIds);

    if (productsError) {
      console.warn('[OrderDeliverables] Failed to load products:', productsError.message);
    }

    for (const product of products || []) {
      productsById.set(product.id, product);
      if (product.member_area_id) directAreaIds.add(product.member_area_id);
    }
  }

  const areasById = new Map<string, any>();
  if (directAreaIds.size > 0) {
    const { data: areas, error: areasError } = await supabaseAdmin
      .from('member_areas')
      .select('id, slug, domains(domain)')
      .in('id', Array.from(directAreaIds));

    if (areasError) {
      console.warn('[OrderDeliverables] Failed to load direct member areas:', areasError.message);
    }

    for (const area of areas || []) {
      areasById.set(area.id, area);
    }
  }

  const contentAreasByProductId = new Map<string, any>();
  if (productIds.length > 0) {
    const { data: links, error: linksError } = await supabaseAdmin
      .from('product_contents')
      .select('product_id, content:contents(member_area_id, member_areas(id, slug, domains(domain)))')
      .in('product_id', productIds);

    if (linksError) {
      console.warn('[OrderDeliverables] Failed to load product contents:', linksError.message);
    }

    for (const link of links || []) {
      if (contentAreasByProductId.has(link.product_id)) continue;
      const content = firstRelation(link.content);
      const area = firstRelation(content?.member_areas);
      if (area?.slug || getAreaDomain(area)) {
        contentAreasByProductId.set(link.product_id, area);
      }
    }
  }

  return items.map((item: any, index: number) => {
    const productId = getProductId(item) || null;
    const product = productId ? productsById.get(productId) : null;
    const title = getProductTitle(item, product);
    const itemType = normalizeItemType(String(item?.type || 'item'));
    const action = String(product?.member_area_action || '').trim();
    const externalUrl = normalizeDeliveryUrl(product?.redirect_link, origin);
    const directArea = product?.member_area_id ? areasById.get(product.member_area_id) : null;
    const contentArea = productId ? contentAreasByProductId.get(productId) : null;
    const memberArea = directArea || contentArea;

    if (action === 'sales_page' && externalUrl) {
      return {
        id: buildDeliverableId(orderId, productId, index),
        order_id: orderId,
        product_id: productId,
        item_type: itemType,
        title,
        delivery_type: 'external_link',
        status: 'available',
        url: externalUrl,
        visual_url: externalUrl,
        label: isPdfUrl(externalUrl) ? 'Abrir PDF' : 'Acessar material',
        instructions: 'Seu material esta disponivel para acesso imediato.',
        sort_order: index,
        source: 'products.redirect_link',
      } satisfies OrderDeliverable;
    }

    if (memberArea) {
      const visualUrl = getAreaUrl(memberArea, origin);
      return {
        id: buildDeliverableId(orderId, productId, index),
        order_id: orderId,
        product_id: productId,
        item_type: itemType,
        title,
        delivery_type: 'member_area',
        status: 'available',
        url: tokenizedMemberAreaUrl(visualUrl, input.recipientEmail, input.includeAccessTokens !== false),
        visual_url: visualUrl,
        label: 'Acessar conteudo',
        instructions: 'Seu acesso foi liberado na area de membros.',
        sort_order: index,
        source: 'member_area',
      } satisfies OrderDeliverable;
    }

    return {
      id: buildDeliverableId(orderId, productId, index),
      order_id: orderId,
      product_id: productId,
      item_type: itemType,
      title,
      delivery_type: 'none',
      status: 'not_configured',
      url: null,
      visual_url: null,
      label: 'Entrega em processamento',
      instructions: 'Este produto nao possui entrega automatica configurada.',
      sort_order: index,
      source: 'not_configured',
    } satisfies OrderDeliverable;
  });
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderDeliverablesEmailHtml(deliverables: OrderDeliverable[]) {
  const actionable = deliverables.filter((deliverable) => deliverable.status === 'available' && deliverable.url);
  if (actionable.length === 0) return '';

  const rows = actionable.map((deliverable) => `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:12px 0;background:#ffffff;">
      <div style="font-weight:700;color:#111827;margin-bottom:6px;">${escapeHtml(deliverable.title)}</div>
      <div style="font-size:13px;color:#6b7280;margin-bottom:12px;">${escapeHtml(deliverable.instructions || 'Material liberado para acesso.')}</div>
      <a href="${escapeHtml(deliverable.url || '')}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:700;padding:11px 16px;border-radius:8px;">${escapeHtml(deliverable.label)}</a>
    </div>
  `).join('');

  return `
    <div data-super-checkout-deliverables="true" style="margin-top:24px;">
      <h2 style="font-size:18px;color:#111827;margin:0 0 12px;">Seus acessos</h2>
      ${rows}
    </div>
  `;
}

export function renderDeliverablesText(deliverables: OrderDeliverable[]) {
  return deliverables
    .filter((deliverable) => deliverable.status === 'available' && deliverable.url)
    .map((deliverable) => `${deliverable.title}: ${deliverable.url}`)
    .join('\n');
}

export function stripSensitiveDeliverableFields(deliverable: OrderDeliverable) {
  const isMemberArea = deliverable.delivery_type === 'member_area';
  return {
    ...deliverable,
    url: isMemberArea ? deliverable.visual_url || null : deliverable.url,
  };
}

export function normalizeStoredDeliverables(value: unknown): OrderDeliverable[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isPlainObject).map((deliverable) => deliverable as OrderDeliverable);
}

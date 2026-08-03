import type { Product, ProductType } from '../types';

export const PRODUCT_TYPE_REGULAR: ProductType = 'regular';
export const PRODUCT_TYPE_SYSTEM_UPGRADE: ProductType = 'system_upgrade';
export const PRODUCT_TYPE_INSTALLATION_SERVICE: ProductType = 'installation_service';
export const SYSTEM_INSTALLATION_SERVICE = 'system_installation';

export const SYSTEM_UPGRADE_PLAN_SLUGS = new Set([
  'upgrade_domains',
  'saas',
]);

/**
 * Keeps old rows readable until the product catalog migration is applied.
 * Existing `saas_plan_slug` rows are system upgrades by definition.
 */
export const deriveProductType = (product: Pick<Product, 'product_type' | 'service_type' | 'saas_plan_slug'>): ProductType => {
  if (product.product_type === PRODUCT_TYPE_SYSTEM_UPGRADE) return PRODUCT_TYPE_SYSTEM_UPGRADE;
  if (product.product_type === PRODUCT_TYPE_INSTALLATION_SERVICE) return PRODUCT_TYPE_INSTALLATION_SERVICE;
  if (product.saas_plan_slug) return PRODUCT_TYPE_SYSTEM_UPGRADE;
  if (product.service_type) return PRODUCT_TYPE_INSTALLATION_SERVICE;
  return PRODUCT_TYPE_REGULAR;
};

export const normalizeProductCatalogPayload = (product: Pick<Product, 'product_type' | 'service_type' | 'saas_plan_slug'>) => {
  const productType = deriveProductType(product);

  if (productType === PRODUCT_TYPE_SYSTEM_UPGRADE) {
    return {
      product_type: productType,
      service_type: null,
      saas_plan_slug: product.saas_plan_slug || null,
    };
  }

  if (productType === PRODUCT_TYPE_INSTALLATION_SERVICE) {
    return {
      product_type: productType,
      service_type: product.service_type || SYSTEM_INSTALLATION_SERVICE,
      saas_plan_slug: null,
    };
  }

  return {
    product_type: PRODUCT_TYPE_REGULAR,
    service_type: null,
    saas_plan_slug: null,
  };
};

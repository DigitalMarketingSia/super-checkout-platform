import type { UpgradePlanSlug } from './upgradeCheckout';
import { normalizeCatalogPlanSlug } from './productCatalog';

export const normalizeUpgradePlanSlug = (slug?: string | null): string | null => {
  return normalizeCatalogPlanSlug(slug);
};

export const matchesUpgradePlanSlug = (currentSlug: string | null | undefined, expectedSlug: string | null | undefined) => {
  return normalizeUpgradePlanSlug(currentSlug) === normalizeUpgradePlanSlug(expectedSlug);
};

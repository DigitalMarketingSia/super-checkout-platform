import { UpgradePlanSlug } from './upgradeCheckout';

const LEGACY_UPGRADE_PLAN_SLUG_MAP: Record<string, UpgradePlanSlug> = {
  unlimited: 'upgrade_domains',
  partner: 'saas',
};

export const normalizeUpgradePlanSlug = (slug?: string | null): string | null => {
  if (!slug) return null;

  const normalized = slug.trim().toLowerCase();
  return LEGACY_UPGRADE_PLAN_SLUG_MAP[normalized] || normalized;
};

export const matchesUpgradePlanSlug = (currentSlug: string | null | undefined, expectedSlug: string | null | undefined) => {
  return normalizeUpgradePlanSlug(currentSlug) === normalizeUpgradePlanSlug(expectedSlug);
};

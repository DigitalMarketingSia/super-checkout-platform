import React from 'react';
import { Crown, Zap, ArrowRight, ShieldCheck, Users, Globe, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Aurora from '../../../components/ui/Aurora';
import { License } from '../../../services/licenseService';
import { Product } from '../../../types';
import { openUpgradeCheckout } from '../../../services/upgradeCheckout';

interface UpsellBannersProps {
    license: License;
    products: Product[];
    onNavigate: (tab: string) => void;
    showPartnerOpportunity: boolean;
}

const DynamicBanner: React.FC<{
    product: Product,
    onNavigate: (tab: string) => void,
    variant: 'primary' | 'orange'
}> = ({ product, variant }) => {
    const { t } = useTranslation('portal');
    const isPrimary = variant === 'primary';
    const [isOpeningCheckout, setIsOpeningCheckout] = React.useState(false);
    
    // Border classes
    const borderGradient = isPrimary
        ? "from-primary/30 to-transparent"
        : "from-orange-500/30 to-transparent";

    const titleColorClass = isPrimary ? "text-primary" : "text-orange-400";
    const btnClass = isPrimary
        ? "bg-primary hover:bg-primary-hover shadow-primary/20"
        : "bg-orange-500 hover:bg-orange-600 shadow-orange-500/20";

    const iconBgClass = isPrimary ? "bg-primary/20 text-primary" : "bg-orange-500/20 text-orange-500";
    const Icon = product.saas_plan_slug === 'saas' ? Users : Globe;

    const handleOpenUpgrade = async () => {
        if (!product.checkout_url || !product.saas_plan_slug) return;

        setIsOpeningCheckout(true);
        try {
            await openUpgradeCheckout({
                checkoutUrl: product.checkout_url,
                planSlug: product.saas_plan_slug as 'saas' | 'upgrade_domains' | 'whitelabel',
                productId: product.id,
                sourceSurface: 'portal',
                sourceContext: {
                    trigger: 'portal_banner',
                    product_slug: product.saas_plan_slug,
                    banner_variant: variant,
                },
            });
        } finally {
            setIsOpeningCheckout(false);
        }
    };

    return (
        <div className={`p-1 bg-gradient-to-r ${borderGradient} rounded-[2rem] overflow-hidden group`}>
            <div className="relative bg-[#05050A]/60 backdrop-blur-3xl rounded-[1.9rem] overflow-hidden p-6 md:p-10 border border-white/5">
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10">
                    <div className="flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
                        <div className={`w-16 h-16 rounded-2xl ${iconBgClass} flex items-center justify-center shadow-inner shrink-0 group-hover:scale-110 transition-transform duration-500`}>
                            <Icon className="w-8 h-8 animate-pulse" />
                        </div>
                        <div>
                            <h3 className="text-2xl md:text-3xl font-display font-black text-white italic uppercase tracking-tighter leading-none mb-2">
                                {(t(`banners.${product.saas_plan_slug}.name`, product.name) as string).split(' ').map((word, i) => {
                                    const highlightWords = (t('banners.highlights', { defaultValue: 'ilimitados parceiro unlimited partner socio' }) as string).toLowerCase();
                                    const shouldHighlight = highlightWords.includes(word.toLowerCase().replace(/[.,!]/g, ''));
                                    return (
                                        <span key={i} className={shouldHighlight ? titleColorClass : ''}>
                                            {word}{' '}
                                        </span>
                                    );
                                })}
                            </h3>
                            <p className="text-gray-400 text-sm md:text-base font-medium leading-relaxed max-w-xl line-clamp-2">
                                {t(`banners.${product.saas_plan_slug}.description`, product.description)}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col items-center md:items-end gap-5 w-full md:w-auto shrink-0">
                        <button
                            onClick={handleOpenUpgrade}
                            disabled={!product.checkout_url || isOpeningCheckout}
                            className={`w-full sm:w-auto px-10 py-5 ${btnClass} text-white font-black text-lg rounded-2xl border-none shadow-2xl flex items-center justify-center gap-4 transform transition-all active:scale-95 cursor-pointer no-underline italic tracking-tighter whitespace-nowrap`}
                        >
                             {isOpeningCheckout ? <Loader2 className="w-6 h-6 animate-spin" /> : isPrimary ? <Zap className="w-6 h-6 fill-current" /> : <Users className="w-6 h-6" />}
                             {isOpeningCheckout ? 'Preparando...' : isPrimary ? t('common:release_now') : t('opportunity.activate_partner')}
                         </button>
                        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-gray-500 text-center md:text-right max-w-[200px] leading-tight">
                            upgrade aplicado automaticamente nesta conta
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const UpsellBanners: React.FC<UpsellBannersProps> = ({ license, products, showPartnerOpportunity }) => {
    // If user is already whitelabel, they don't need any upsells
    if (license?.plan === 'whitelabel') return null;

    // Filter relevant products for the user
    // 1. If not unlimited, show upgrade_domains or whitelabel iif available
    // FIX: Don't show upgrade if they already have upgrade_domains
    const showUpgrade = license?.plan !== 'upgrade_domains' && (license?.max_instances || 0) <= 1 && products.some(p => p.saas_plan_slug === 'upgrade_domains' || p.saas_plan_slug === 'whitelabel');

    // 2. If not partner, show saas plan if available in products
    const showSaaS = showPartnerOpportunity && license?.plan !== 'saas' && products.some(p => p.saas_plan_slug === 'saas');

    const upgradeProduct = products.find(p => p.saas_plan_slug === 'upgrade_domains' || p.saas_plan_slug === 'whitelabel');
    const saasProduct = products.find(p => p.saas_plan_slug === 'saas');

    return (
        <div className="space-y-6">
            {showUpgrade && upgradeProduct && (
                <DynamicBanner
                    product={upgradeProduct}
                    variant="primary"
                    onNavigate={() => { }}
                />
            )}
            {showSaaS && saasProduct && (
                <DynamicBanner
                    product={saasProduct}
                    variant="orange"
                    onNavigate={() => { }}
                />
            )}
        </div>
    );
};

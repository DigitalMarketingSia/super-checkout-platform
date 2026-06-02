import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { ArrowRight, BadgePercent, CheckCircle, ShieldCheck, Zap } from 'lucide-react';
import { storage } from '../../services/storageService';
import { licenseService } from '../../services/licenseService';
import { openUpgradeCheckout, UpgradePlanSlug } from '../../services/upgradeCheckout';

const BLOCKED_CHECKOUT_HOSTS = new Set(['pay.supercheckout.app']);
const OFFICIAL_CHECKOUT_FALLBACKS: Partial<Record<UpgradePlanSlug, string>> = {
    upgrade_domains: 'https://portal.supercheckout.app/c/chk-1770902160498',
};

const resolveSafeCheckoutUrl = (checkoutUrl?: string | null) => {
    if (!checkoutUrl) return '';

    try {
        const url = new URL(checkoutUrl, window.location.origin);
        if (BLOCKED_CHECKOUT_HOSTS.has(url.hostname)) return '';
        return url.toString();
    } catch {
        return '';
    }
};

const resolveFirstSafeCheckoutUrl = (...checkoutUrls: Array<string | null | undefined>) => {
    for (const checkoutUrl of checkoutUrls) {
        const safeUrl = resolveSafeCheckoutUrl(checkoutUrl);
        if (safeUrl) return safeUrl;
    }
    return '';
};

interface UpsellModalProps {
    isOpen: boolean;
    onClose: () => void;
    offerSlug: 'unlimited_domains' | 'partner_rights' | 'whitelabel' | null;
}

interface OfferConfig {
    title: string;
    description: string;
    anchorPrice: number | null;
    fallbackPrice: number;
    features: string[];
    cta: string;
    planSlug: UpgradePlanSlug;
    badge: string;
    priceContext: string;
}

const formatPriceBRL = (value: number) => new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
}).format(value);

export const UpsellModal = ({ isOpen, onClose, offerSlug }: UpsellModalProps) => {
    const [products, setProducts] = React.useState<any[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [openingCheckout, setOpeningCheckout] = React.useState(false);
    const [checkoutError, setCheckoutError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!isOpen) return;

        const fetchProducts = async () => {
            setLoading(true);
            setCheckoutError(null);
            try {
                const [officialPlansResult, localProductsResult] = await Promise.allSettled([
                    licenseService.getOfficialPlans(),
                    storage.getPublicSaaSProducts(),
                ]);

                const officialPlans = officialPlansResult.status === 'fulfilled' ? officialPlansResult.value : [];
                const localProducts = localProductsResult.status === 'fulfilled' ? localProductsResult.value : [];

                const mergedPlans = officialPlans.map((plan: any) => {
                    const localMatch = localProducts.find((product: any) => product.saas_plan_slug === plan.saas_plan_slug);

                    return {
                        ...plan,
                        name: localMatch?.name || plan.name,
                        description: localMatch?.description || plan.description,
                        imageUrl: localMatch?.imageUrl || plan.imageUrl,
                        price_real: localMatch?.price_real || plan.price_real,
                        checkout_url: resolveFirstSafeCheckoutUrl(
                            localMatch?.checkout_url,
                            plan.checkout_url,
                            OFFICIAL_CHECKOUT_FALLBACKS[plan.saas_plan_slug as UpgradePlanSlug],
                        ),
                    };
                });

                const localOnlyProducts = localProducts
                    .filter((product: any) => !mergedPlans.some((plan: any) => plan.saas_plan_slug === product.saas_plan_slug))
                    .map((product: any) => ({
                        ...product,
                        checkout_url: resolveSafeCheckoutUrl(product.checkout_url),
                    }));

                setProducts([...mergedPlans, ...localOnlyProducts]);
            } catch (error) {
                console.error('Error fetching SaaS products for modal:', error);
                setCheckoutError('Nao foi possivel carregar o checkout de upgrade agora.');
            } finally {
                setLoading(false);
            }
        };

        fetchProducts();
    }, [isOpen]);

    if (!offerSlug) return null;

    const offers: Record<'unlimited_domains' | 'partner_rights' | 'whitelabel', OfferConfig> = {
        unlimited_domains: {
            title: 'Licenca Vitalicia Elite',
            description: 'Remova todos os limites principais do sistema e destrave uma oferta especial de ativacao para escalar com mais margem.',
            anchorPrice: 497,
            fallbackPrice: 197,
            features: [
                'Dominios e subdominios ilimitados',
                'Produtos, checkouts e areas de membros ilimitados',
                'SSL automatico incluso',
                'Atualizacoes vitalicias',
            ],
            cta: 'Fazer Upgrade Vitalicio',
            planSlug: 'upgrade_domains',
            badge: 'Oferta de Ativacao',
            priceContext: 'O valor final abaixo acompanha automaticamente o produto vinculado ao plano de upgrade.',
        },
        partner_rights: {
            title: 'Licenca Comercial / Parceiro',
            description: 'Ideal para agencias e freelancers que querem vender implantacao e operar com uma condicao comercial mais agressiva.',
            anchorPrice: 997,
            fallbackPrice: 497,
            features: [
                'Direito de uso comercial',
                'Instalacoes para clientes',
                'Suporte prioritario',
                'Painel de gestao multi-licencas',
            ],
            cta: 'Ser Parceiro Oficial',
            planSlug: 'saas',
            badge: 'Condicao Comercial',
            priceContext: 'O valor final abaixo acompanha automaticamente o produto parceiro vinculado a este plano.',
        },
        whitelabel: {
            title: 'Upgrade White Label Elite',
            description: 'Remova totalmente a nossa marca e apresente o sistema como seu para clientes com uma camada premium de posicionamento.',
            anchorPrice: null,
            fallbackPrice: 997,
            features: [
                'Tudo da licenca comercial',
                'Remocao da marca Super Checkout',
                'Personalizacao de logotipo',
                'Dominio proprio de admin',
            ],
            cta: 'Ativar White Label',
            planSlug: 'whitelabel',
            badge: 'Camada Premium',
            priceContext: 'O valor final abaixo acompanha o produto white label vinculado quando existir configuracao comercial publicada.',
        },
    };

    const content = offers[offerSlug] || offers.unlimited_domains;
    const licenseKey = import.meta.env.VITE_LICENSE_KEY || '';

    const dynamicProduct = products.find((product) => product.saas_plan_slug === content.planSlug);
    const checkoutUrl = resolveFirstSafeCheckoutUrl(
        dynamicProduct?.checkout_url,
        OFFICIAL_CHECKOUT_FALLBACKS[content.planSlug],
    );
    const planSlug = (dynamicProduct?.saas_plan_slug || content.planSlug) as UpgradePlanSlug;
    const checkoutUnavailable = !loading && !checkoutUrl;

    const effectivePrice = Number(dynamicProduct?.price_real ?? content.fallbackPrice ?? 0);
    const anchorPrice = typeof content.anchorPrice === 'number' ? content.anchorPrice : null;
    const hasDiscountAnchor = anchorPrice !== null && effectivePrice > 0 && anchorPrice > effectivePrice;
    const savingsValue = hasDiscountAnchor ? anchorPrice - effectivePrice : 0;
    const savingsPercent = hasDiscountAnchor ? Math.round((savingsValue / anchorPrice) * 100) : 0;

    const handleOpenCheckout = async () => {
        if (!checkoutUrl || !planSlug) {
            setCheckoutError('Checkout oficial do plano ainda nao esta configurado. Tente novamente em instantes.');
            return;
        }

        setOpeningCheckout(true);
        setCheckoutError(null);
        try {
            await openUpgradeCheckout({
                checkoutUrl,
                planSlug,
                productId: dynamicProduct?.id || null,
                sourceSurface: 'installation',
                sourceContext: {
                    trigger: 'upsell_modal',
                    offer_slug: offerSlug,
                    license_key: licenseKey || null,
                    plan_slug: planSlug,
                    checkout_source: dynamicProduct?.checkout_url ? 'official_plan' : 'missing_checkout_url',
                },
            });
            onClose();
        } catch (error) {
            setCheckoutError(error instanceof Error ? error.message : 'Falha ao preparar checkout seguro.');
        } finally {
            setOpeningCheckout(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="">
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#070910] p-6 text-center sm:p-8 sm:text-left">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.18),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.18),transparent_40%)]" />

                <div className="relative z-10">
                    <div className="mb-6 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">
                            <Zap className="h-3.5 w-3.5" />
                            {content.badge}
                        </div>
                        {hasDiscountAnchor && (
                            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-amber-200">
                                <BadgePercent className="h-3.5 w-3.5" />
                                Economia de {savingsPercent}%
                            </div>
                        )}
                    </div>

                    <h2 className="text-3xl font-black italic tracking-tighter text-white sm:text-4xl">
                        {content.title}
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm font-medium leading-relaxed text-white/60 sm:text-base">
                        {content.description}
                    </p>

                    <div className="mt-7 grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
                        <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/40">
                                Condicao especial desta conta
                            </p>

                            <div className="mt-4 flex flex-wrap items-end gap-3">
                                {hasDiscountAnchor && anchorPrice !== null && (
                                    <span className="text-lg font-black text-white/30 line-through sm:text-2xl">
                                        {formatPriceBRL(anchorPrice)}
                                    </span>
                                )}
                                <span className="text-4xl font-black tracking-tight text-white sm:text-6xl">
                                    {loading ? '...' : formatPriceBRL(effectivePrice)}
                                </span>
                            </div>

                            <p className="mt-3 text-sm font-medium text-emerald-200/90">
                                {hasDiscountAnchor && anchorPrice !== null
                                    ? `De ${formatPriceBRL(anchorPrice)} por ${formatPriceBRL(effectivePrice)}`
                                    : 'Preco atual liberado para este plano'}
                            </p>

                            {hasDiscountAnchor && savingsValue > 0 && (
                                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-200">
                                    <ShieldCheck className="h-4 w-4" />
                                    Economia de {formatPriceBRL(savingsValue)}
                                </div>
                            )}

                            <p className="mt-4 text-xs font-medium leading-relaxed text-white/45">
                                {content.priceContext}
                            </p>
                        </div>

                        <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-5">
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/40">
                                O que voce libera agora
                            </p>
                            <ul className="mt-4 space-y-3">
                                {content.features.map((feature, idx) => (
                                    <li key={idx} className="flex items-start gap-3 text-sm text-gray-200">
                                        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                                        <span className="leading-relaxed">{feature}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-col gap-3">
                        <p className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                            Upgrade aplicado automaticamente nesta conta
                        </p>

                        {checkoutError && (
                            <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-400">
                                {checkoutError}
                            </p>
                        )}

                        {checkoutUnavailable && !checkoutError && (
                            <p className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs font-bold text-amber-300">
                                Checkout oficial do plano nao encontrado. Tente novamente em instantes ou abra o upgrade pelo Portal do Cliente.
                            </p>
                        )}

                        <Button
                            onClick={handleOpenCheckout}
                            disabled={loading || openingCheckout || checkoutUnavailable}
                            className="w-full rounded-[1.35rem] border-none bg-gradient-to-r from-emerald-500 via-green-400 to-lime-300 py-4 text-sm font-black uppercase tracking-[0.18em] text-[#08110d] shadow-[0_24px_60px_rgba(74,222,128,0.24)] hover:brightness-105"
                        >
                            {loading ? 'Carregando...' : openingCheckout ? 'Preparando Checkout...' : content.cta}
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>

                        <button
                            onClick={onClose}
                            className="py-2 text-sm text-gray-500 transition-colors hover:text-white"
                        >
                            Nao, obrigado. Quero continuar limitado.
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

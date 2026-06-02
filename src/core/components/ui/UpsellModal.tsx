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
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={
                <div className="flex flex-col">
                    <span className="text-[9px] font-black uppercase tracking-[0.24em] text-emerald-400">
                        Upgrade prioritário
                    </span>
                    <span className="text-xs font-medium text-white/60 mt-0.5">
                        Remova os limites da conta com condição especial
                    </span>
                </div>
            }
            className="max-w-[960px]"
        >
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#070910] text-left">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.1),transparent_45%)]" />
                <div className="pointer-events-none absolute inset-y-0 left-0 w-full bg-[linear-gradient(135deg,rgba(9,14,20,0.4),transparent_50%,rgba(9,14,20,0.2))]" />

                <div className="relative z-10 grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
                    <section className="min-w-0 border-b border-white/10 p-4 sm:p-6 lg:border-b-0 lg:border-r lg:p-7">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-300">
                                <Zap className="h-3 w-3" />
                                {content.badge}
                            </div>
                            {hasDiscountAnchor && (
                                <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.2em] text-amber-200">
                                    <BadgePercent className="h-3 w-3" />
                                    Economia de {savingsPercent}%
                                </div>
                            )}
                        </div>

                        <div className="mt-4 max-w-[32rem]">
                            <h2 className="text-2xl font-black italic leading-none tracking-[-0.04em] text-white sm:text-4xl">
                                {content.title}
                            </h2>
                            <p className="mt-2.5 text-xs sm:text-sm font-medium leading-relaxed text-white/60">
                                {content.description}
                            </p>
                        </div>

                        <div className="mt-4 grid gap-2 grid-cols-1 sm:grid-cols-2">
                            {content.features.map((feature, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-white/[0.02] p-2.5"
                                >
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                                        <CheckCircle className="h-3 w-3" />
                                    </span>
                                    <span className="text-[11px] sm:text-xs font-semibold leading-tight text-white/90">
                                        {feature}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.02] p-3 text-xs leading-relaxed text-white/60">
                            <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                            <div>
                                <strong className="text-emerald-300 font-bold uppercase tracking-wider text-[9px] block mb-0.5">
                                    Liberação imediata
                                </strong>
                                O upgrade é aplicado na conta atual e remove as principais travas comerciais sem você perder sua configuração já criada.
                            </div>
                        </div>
                    </section>

                    <aside className="min-w-0 p-4 sm:p-6 lg:p-7 flex flex-col justify-between">
                        <div className="rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-xl sm:p-5 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl" />

                            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/40">
                                Condição especial desta conta
                            </p>

                            <div className="mt-3 flex flex-col gap-1">
                                {hasDiscountAnchor && anchorPrice !== null && (
                                    <div className="flex items-center gap-2 text-white/30 text-xs">
                                        <span className="line-through font-medium">{formatPriceBRL(anchorPrice)}</span>
                                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold text-[8px] uppercase tracking-wider">
                                            Economize {savingsPercent}%
                                        </span>
                                    </div>
                                )}

                                <div className="flex items-baseline gap-2">
                                    <span className="text-[2.25rem] sm:text-[3rem] font-black tracking-tight text-white leading-none">
                                        {loading ? '...' : formatPriceBRL(effectivePrice)}
                                    </span>
                                    <span className="text-xs text-white/50 font-medium">/ vitalício</span>
                                </div>
                            </div>

                            {hasDiscountAnchor && savingsValue > 0 && (
                                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold">
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                    <span>Você economiza {formatPriceBRL(savingsValue)}</span>
                                </div>
                            )}

                            <div className="mt-4 flex justify-between gap-1 border-t border-white/5 pt-3">
                                <div className="flex items-center gap-1">
                                    <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="text-[10px] font-bold text-white/70">Sem travas</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="text-[10px] font-bold text-white/70">Pagamento Único</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="text-[10px] font-bold text-white/70">Acesso Imediato</span>
                                </div>
                            </div>

                            <p className="mt-3.5 text-[10px] font-medium leading-relaxed text-white/40 text-center">
                                {content.priceContext}
                            </p>
                        </div>

                        <div className="mt-4 flex flex-col gap-2.5">
                            {checkoutError && (
                                <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-400">
                                    {checkoutError}
                                </p>
                            )}

                            {checkoutUnavailable && !checkoutError && (
                                <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-300">
                                    Checkout oficial do plano não encontrado. Tente novamente em instantes ou abra o upgrade pelo Portal do Cliente.
                                </p>
                            )}

                            <Button
                                onClick={handleOpenCheckout}
                                disabled={loading || openingCheckout || checkoutUnavailable}
                                className="w-full rounded-xl border-none bg-gradient-to-r from-emerald-500 via-green-400 to-lime-300 py-3 text-xs font-black uppercase tracking-[0.15em] text-[#08110d] shadow-[0_20px_50px_rgba(74,222,128,0.15)] hover:brightness-105 transition-all duration-200 flex items-center justify-center"
                            >
                                {loading ? 'Carregando...' : openingCheckout ? 'Preparando Checkout...' : content.cta}
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>

                            <div className="flex flex-col items-center gap-1.5 mt-1.5">
                                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/30 text-center">
                                    Upgrade automático e 100% seguro
                                </p>

                                <button
                                    onClick={onClose}
                                    className="text-xs text-white/40 hover:text-white transition-colors underline underline-offset-4"
                                >
                                    Não, obrigado. Quero continuar limitado.
                                </button>
                            </div>
                        </div>
                    </aside>
                </div>
            </div>
        </Modal>
    );
};

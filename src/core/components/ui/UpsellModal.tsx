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
            description: 'Tudo ilimitado para você vender mais: domínios, subdomínios, produtos, checkouts e áreas de membros.',
            anchorPrice: 497,
            fallbackPrice: 197,
            features: [
                'Dominios ilimitados',
                'Subdominios ilimitados',
                'Produtos e checkouts ilimitados',
                'Areas de membros ilimitadas',
            ],
            cta: 'Fazer Upgrade Vitalicio',
            planSlug: 'upgrade_domains',
            badge: 'Oferta Especial de Ativação',
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
                        Remova os limites da conta com essa condição Exclusiva
                    </span>
                </div>
            }
            className="max-w-[960px]"
        >
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#070910] text-left">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.1),transparent_45%)]" />
                <div className="pointer-events-none absolute inset-y-0 left-0 w-full bg-[linear-gradient(135deg,rgba(9,14,20,0.4),transparent_50%,rgba(9,14,20,0.2))]" />

                <div className="relative z-10 grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
                    <section className="min-w-0 border-b border-white/10 p-4 sm:p-6 lg:border-b-0 lg:p-7">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="inline-flex items-center transform skew-x-[-12deg] bg-emerald-400 text-slate-950 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em]">
                                <span className="transform skew-x-[12deg] flex items-center gap-1.5">
                                    <Zap className="h-3 w-3 fill-slate-950" />
                                    {content.badge}
                                </span>
                            </div>
                        </div>

                        <div className="mt-4 max-w-[32rem]">
                            <h2 className="text-2xl font-black italic leading-none tracking-[-0.04em] text-white sm:text-4xl">
                                {content.title}
                            </h2>
                            <p className="mt-2.5 text-xs sm:text-sm font-medium leading-relaxed text-white/60">
                                {content.description}
                            </p>
                        </div>

                        <div className={`mt-4 grid gap-2.5 ${content.features.length <= 2 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
                            {content.features.map((feature, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 hover:border-emerald-500/10 hover:bg-white/[0.04] transition-all duration-200"
                                >
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                                        <CheckCircle className="h-3.5 w-3.5" />
                                    </span>
                                    <span className="text-xs sm:text-sm font-semibold leading-tight text-white/95">
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
                                Ativação rápida e transparente. Sua estrutura atual é mantida enquanto os limites da plataforma são removidos automaticamente.
                            </div>
                        </div>
                    </section>

                    <aside className="min-w-0 p-4 sm:p-6 lg:p-7 flex flex-col justify-between bg-slate-50 border-t border-slate-200 lg:border-t-0 lg:border-l lg:border-slate-200">
                        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.03)] sm:p-5 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/[0.02] rounded-full blur-2xl" />

                            <div className="relative w-fit mb-3">
                                <div 
                                    className="absolute inset-0 bg-emerald-500/15 translate-x-[2px] translate-y-[2px]"
                                    style={{ clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)' }}
                                />
                                <div 
                                    style={{ clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)' }}
                                    className="relative bg-slate-900 px-3.5 py-1 text-emerald-400 font-mono text-[8px] sm:text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-2"
                                >
                                    <span className="w-1.5 h-1.5 bg-emerald-400 rotate-45 shrink-0 block" />
                                    Condição especial Aplicada!
                                </div>
                            </div>

                            <div className="mt-3 flex flex-col gap-1">
                                {hasDiscountAnchor && anchorPrice !== null && (
                                    <div className="flex items-center gap-2 text-slate-400 text-xs">
                                        <span className="line-through font-medium">{formatPriceBRL(anchorPrice)}</span>
                                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/50 font-bold text-[8px] uppercase tracking-wider">
                                            Economize {savingsPercent}%
                                        </span>
                                    </div>
                                )}

                                <div className="flex items-baseline gap-2">
                                    <span className="text-[2.25rem] sm:text-[3rem] font-black tracking-tight text-slate-900 leading-none">
                                        {loading ? '...' : formatPriceBRL(effectivePrice)}
                                    </span>
                                    <span className="text-xs text-slate-500 font-semibold">/ vitalício</span>
                                </div>
                            </div>

                            {hasDiscountAnchor && savingsValue > 0 && (
                                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-emerald-600 font-bold bg-emerald-50/50 border border-emerald-100/50 rounded-lg px-2 py-1 w-fit">
                                    <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                                    <span>Você economiza {formatPriceBRL(savingsValue)}</span>
                                </div>
                            )}

                            <div className="mt-4 flex justify-between gap-1 border-t border-slate-100 pt-3">
                                <div className="flex items-center gap-1.5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[10px] font-bold text-slate-700">Sem travas</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[10px] font-bold text-slate-700">Pagamento Único</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[10px] font-bold text-slate-700">Acesso Imediato</span>
                                </div>
                            </div>

                            <p className="mt-3.5 text-[10px] font-semibold leading-relaxed text-slate-400 text-center">
                                {content.priceContext}
                            </p>
                        </div>

                        <div className="mt-4 flex flex-col gap-2.5">
                            {checkoutError && (
                                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
                                    {checkoutError}
                                </p>
                            )}

                            {checkoutUnavailable && !checkoutError && (
                                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
                                    Checkout oficial do plano não encontrado. Tente novamente em instantes ou abra o upgrade pelo Portal do Cliente.
                                </p>
                            )}

                            <Button
                                onClick={handleOpenCheckout}
                                disabled={loading || openingCheckout || checkoutUnavailable}
                                className="w-full rounded-xl border-none bg-gradient-to-r from-emerald-600 via-emerald-500 to-green-500 py-3.5 text-xs font-black uppercase tracking-[0.15em] text-white shadow-[0_10px_20px_rgba(16,185,129,0.2)] hover:shadow-[0_12px_24px_rgba(16,185,129,0.3)] hover:brightness-105 active:scale-[0.99] transition-all duration-200 flex items-center justify-center"
                            >
                                {loading ? 'Carregando...' : openingCheckout ? 'Preparando Checkout...' : content.cta}
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>

                            <div className="flex flex-col items-center gap-2 mt-1">
                                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 text-center">
                                    Upgrade automático e 100% seguro
                                </p>

                                <button
                                    onClick={onClose}
                                    className="text-xs text-slate-400 hover:text-slate-700 transition-colors font-medium underline underline-offset-4"
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

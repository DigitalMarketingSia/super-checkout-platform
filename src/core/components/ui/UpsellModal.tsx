import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { CheckCircle, ArrowRight, Zap } from 'lucide-react';
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

export const UpsellModal = ({ isOpen, onClose, offerSlug }: UpsellModalProps) => {
    const [products, setProducts] = React.useState<any[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [openingCheckout, setOpeningCheckout] = React.useState(false);
    const [checkoutError, setCheckoutError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (isOpen) {
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

                    const localOnlyProducts = localProducts.filter((product: any) =>
                        !mergedPlans.some((plan: any) => plan.saas_plan_slug === product.saas_plan_slug)
                    ).map((product: any) => ({
                        ...product,
                        checkout_url: resolveSafeCheckoutUrl(product.checkout_url),
                    }));

                    setProducts([...mergedPlans, ...localOnlyProducts]);
                } catch (err) {
                    console.error('Error fetching SaaS products for modal:', err);
                    setCheckoutError('Nao foi possivel carregar o checkout de upgrade agora.');
                } finally {
                    setLoading(false);
                }
            };
            fetchProducts();
        }
    }, [isOpen]);

    if (!offerSlug) return null;

    const offers = {
        unlimited_domains: {
            title: 'Licença Vitalícia Elite',
            description: 'Remova todos os limites de domínios e produtos. Pague uma vez e tenha liberdade total para escalar seu negócio.',
            price: 'R$ 197',
            features: ['Domínios e Subdomínios Ilimitados', 'Produtos e Checkouts Ilimitados', 'SSL Automático incluso', 'Atualizações Vitalícias'],
            cta: 'Fazer Upgrade Vitalício',
            plan_slug: 'upgrade_domains'
        },
        partner_rights: {
            title: 'Licença Comercial / Parceiro',
            description: 'O modelo ideal para agências e freelancers. Instale o sistema para seus clientes e lucre com a implementação.',
            price: 'R$ 497',
            features: ['Direito de Uso Comercial', 'Instalações p/ Clientes', 'Suporte Prioritário', 'Painel de Gestão Multi-Licenças'],
            cta: 'Ser Parceiro Oficial',
            plan_slug: 'saas'
        },
        whitelabel: {
            title: 'Upgrade White Label Elite',
            description: 'Remova totalmente a nossa marca e apresente o sistema como seu para seus clientes.',
            price: 'R$ 997',
            features: ['Tudo da Licença Comercial', 'Remover Marca Super Checkout', 'Personalização de Logotipo', 'Domínio Próprio de Admin'],
            cta: 'Ativar White Label',
            plan_slug: 'whitelabel'
        }
    };

    const content = offers[offerSlug] || offers.unlimited_domains;

    // Detect current license key
    const licenseKey = import.meta.env.VITE_LICENSE_KEY || '';
    
    // Try to find a dynamic product that matches the required plan
    const dynamicProduct = products.find((p) => p.saas_plan_slug === content.plan_slug);
    const checkoutUrl = resolveFirstSafeCheckoutUrl(
        dynamicProduct?.checkout_url,
        OFFICIAL_CHECKOUT_FALLBACKS[content.plan_slug as UpgradePlanSlug],
    );
    const planSlug = (dynamicProduct?.saas_plan_slug || content.plan_slug) as UpgradePlanSlug;
    const checkoutUnavailable = !loading && !checkoutUrl;

    const finalPrice = dynamicProduct ? `R$ ${dynamicProduct.price_real}` : content.price;

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
            <div className="text-center sm:text-left">
                <div className="mb-6 flex justify-center sm:justify-start">
                    <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center text-purple-400">
                        <Zap className="w-6 h-6" />
                    </div>
                </div>

                <h2 className="text-2xl font-bold text-white mb-2">{content.title}</h2>
                <p className="text-gray-400 mb-6">{content.description}</p>

                <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
                    <ul className="space-y-3">
                        {content.features.map((feat, idx) => (
                            <li key={idx} className="flex items-center gap-2 text-sm text-gray-300">
                                <CheckCircle className="w-4 h-4 text-green-500" />
                                {feat}
                            </li>
                        ))}
                    </ul>
                    <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center">
                        <span className="text-sm text-gray-400">Pagamento Único</span>
                        <span className="text-xl font-bold text-white">{loading ? '...' : finalPrice}</span>
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 text-center">
                        Upgrade aplicado automaticamente nesta conta
                    </p>
                    {checkoutError && (
                        <p className="text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3">
                            {checkoutError}
                        </p>
                    )}
                    {checkoutUnavailable && !checkoutError && (
                        <p className="text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3">
                            Checkout oficial do plano nao encontrado. Tente novamente em instantes ou abra o upgrade pelo Portal do Cliente.
                        </p>
                    )}
                    <Button
                        onClick={handleOpenCheckout}
                        disabled={loading || openingCheckout || checkoutUnavailable}
                        className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold shadow-lg shadow-purple-500/20"
                    >
                        {loading ? 'Carregando...' : openingCheckout ? 'Preparando Checkout...' : content.cta} <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                    <button
                        onClick={onClose}
                        className="text-sm text-gray-500 hover:text-white transition-colors py-2"
                    >
                        Não, obrigado. Quero continuar limitado.
                    </button>
                </div>
            </div>
        </Modal>
    );
};

import React from 'react';
import { Crown, Zap, CheckCircle, Target, DollarSign, ArrowRight, BookOpen, UserPlus, Layers, HeartHandshake, Settings, Check, Calculator, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { sanitizeTranslationHtml } from '../../../utils/sanitize';
import Aurora from '../../../components/ui/Aurora';
import { openUpgradeCheckout } from '../../../services/upgradeCheckout';

interface BlockOpportunityProps {
    onNavigate: (tab: string) => void;
}

export const BlockOpportunity: React.FC<BlockOpportunityProps> = ({ onNavigate }) => {
    const [t] = useTranslation('portal');
    const [saasProduct, setSaasProduct] = React.useState<any>(null);
    const [loading, setLoading] = React.useState(true);
    const [isOpeningCheckout, setIsOpeningCheckout] = React.useState(false);

    React.useEffect(() => {
        const load = async () => {
            try {
                const { storage } = await import('../../../services/storageService');
                const products = await storage.getPublicSaaSProducts();
                const found = products.find(p => p.saas_plan_slug === 'saas');
                setSaasProduct(found);
            } catch (err) {
                console.error('Error loading saas product for BlockOpportunity:', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const handleOpenPartnerCheckout = async () => {
        if (!saasProduct?.checkout_url || !saasProduct?.saas_plan_slug) return;

        setIsOpeningCheckout(true);
        try {
            await openUpgradeCheckout({
                checkoutUrl: saasProduct.checkout_url,
                planSlug: saasProduct.saas_plan_slug,
                productId: saasProduct.id,
                sourceSurface: 'portal',
                sourceContext: {
                    trigger: 'partner_opportunity_page',
                    product_slug: saasProduct.saas_plan_slug,
                },
            });
        } finally {
            setIsOpeningCheckout(false);
        }
    };

    return (
        <div className="space-y-24 animate-in fade-in slide-in-from-bottom-10 duration-1000 pb-32">

            {/* 1. HERO SECTION */}
            <div className="relative overflow-hidden rounded-[3rem] bg-[#05050A] border border-white/5 p-12 md:p-24 text-center group">
                <div className="absolute inset-0 opacity-30 grayscale group-hover:grayscale-0 transition-all duration-1000">
                    <Aurora
                        colorStops={['#8A2BE2', '#4B0082', '#9370DB']}
                        amplitude={1.5}
                        blend={0.6}
                        speed={0.5}
                    />
                </div>

                <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary/20 rounded-full blur-[120px] pointer-events-none" />

                <div className="relative z-10 max-w-4xl mx-auto">
                    <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 border border-white/10 text-primary text-xs font-black uppercase tracking-[0.3em] mb-10 backdrop-blur-md">
                        <Crown className="w-4 h-4" />
                        {t('opportunity.business_opportunity')}
                    </div>

                    <h1 className="text-5xl md:text-8xl font-display font-black text-white leading-[0.9] mb-10 tracking-tighter italic uppercase" 
                        dangerouslySetInnerHTML={{ __html: sanitizeTranslationHtml(t('opportunity.hero_title')) }} 
                    />

                    <p className="text-gray-400 text-xl md:text-2xl font-medium leading-relaxed max-w-2xl mx-auto mb-12">
                        {t('opportunity.hero_desc')}
                        <span className="block mt-4 text-white font-bold">{t('opportunity.hero_desc_extra')}</span>
                    </p>

                    <div className="flex flex-col items-center gap-4">
                        <button
                            onClick={handleOpenPartnerCheckout}
                            disabled={!saasProduct?.checkout_url || isOpeningCheckout}
                            className="group relative px-12 py-6 bg-primary text-white font-black text-xl rounded-2xl hover:scale-105 transition-all shadow-2xl shadow-primary/20 flex items-center gap-4 uppercase tracking-tighter italic"
                        >
                            <span>{loading || isOpeningCheckout ? 'Preparando...' : t('opportunity.activate_partner')}</span>
                            {isOpeningCheckout ? <Loader2 className="w-6 h-6 animate-spin" /> : <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />}
                        </button>
                        <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.3em]">
                            {t('opportunity.immediate_access')}
                        </p>
                        <p className="text-gray-600 text-[10px] font-black uppercase tracking-[0.22em]">
                            upgrade aplicado automaticamente nesta conta
                        </p>
                    </div>
                </div>
            </div>

            {/* 2. COMO VOCÊ GANHA DINHEIRO */}
            <div className="space-y-12">
                <div className="text-center space-y-4">
                    <h2 className="text-4xl md:text-5xl font-display font-black text-white uppercase tracking-tighter italic">{t('opportunity.how_it_works')}</h2>
                    <p className="text-gray-400 text-lg max-w-2xl mx-auto">{t('opportunity.service_tool')}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="bg-white/5 border border-white/10 p-10 rounded-[2.5rem] backdrop-blur-xl hover:border-primary/30 transition-all group">
                        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                            <BookOpen className="w-7 h-7 text-primary" />
                        </div>
                        <h3 className="text-xl font-black text-white mb-4 uppercase tracking-tight italic">{t('opportunity.learn_process')}</h3>
                        <p className="text-gray-400 text-sm leading-relaxed">
                            {t('opportunity.learn_desc')}
                        </p>
                    </div>

                    <div className="bg-white/5 border border-white/10 p-10 rounded-[2.5rem] backdrop-blur-xl hover:border-primary/30 transition-all group">
                        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                            <UserPlus className="w-7 h-7 text-primary" />
                        </div>
                        <h3 className="text-xl font-black text-white mb-4 uppercase tracking-tight italic">{t('opportunity.offer_service')}</h3>
                        <p className="text-gray-400 text-sm leading-relaxed mb-4">{t('opportunity.offer_desc')}</p>
                        <ul className="space-y-2">
                            {[
                                t('opportunity.offer_items.clients'),
                                t('opportunity.offer_items.leads'),
                                t('opportunity.offer_items.companies')
                            ].map((item, i) => (
                                <li key={i} className="flex items-center gap-2 text-[10px] font-black text-gray-300 uppercase tracking-widest">
                                    <CheckCircle className="w-3 h-3 text-primary" /> {item}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="bg-white/5 border border-white/10 p-10 rounded-[2.5rem] backdrop-blur-xl hover:border-primary/30 transition-all group">
                        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                            <DollarSign className="w-7 h-7 text-emerald-500" />
                        </div>
                        <h3 className="text-xl font-black text-white mb-4 uppercase tracking-tight italic">{t('opportunity.charge_installation')}</h3>
                        <p className="text-gray-400 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: sanitizeTranslationHtml(t('opportunity.charge_desc')) }} />
                    </div>

                    <div className="bg-white/5 border border-white/10 p-10 rounded-[2.5rem] backdrop-blur-xl hover:border-primary/30 transition-all group">
                        <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                            <Settings className="w-7 h-7 text-blue-500" />
                        </div>
                        <h3 className="text-xl font-black text-white mb-4 uppercase tracking-tight italic">{t('opportunity.config_service')}</h3>
                        <p className="text-gray-400 text-sm leading-relaxed">
                            {t('opportunity.config_desc')}
                        </p>
                    </div>
                </div>
            </div>

            {/* 3. QUANTO VOCÊ PODE GANHAR */}
            <div className="bg-white/5 border border-white/10 rounded-[3.5rem] p-10 md:p-14 relative overflow-hidden group/section">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none group-hover/section:bg-primary/10 transition-all duration-1000" />

                <div className="grid grid-cols-1 lg:grid-cols-12 items-start gap-10 relative z-10">
                    {/* LEFT COLUMN: EARNINGS & SIMULATOR */}
                    <div className="lg:col-span-7 flex flex-col gap-10">
                        <div className="space-y-4">
                            <h2 className="text-4xl md:text-5xl font-display font-black text-white uppercase tracking-tighter italic leading-none" 
                                dangerouslySetInnerHTML={{ __html: sanitizeTranslationHtml(t('opportunity.potential_earnings')) }}
                            />
                            <p className="text-gray-400 text-lg font-medium leading-relaxed max-w-xl"
                                dangerouslySetInnerHTML={{ __html: sanitizeTranslationHtml(t('opportunity.roi_desc')) }}
                            />
                        </div>

                        {/* 3-SERVICE GRID */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            {[
                                { title: "Instalações", desc: "10 Clientes x R$ 97", total: "970" },
                                { title: "Configurações", desc: "10 Serviços x R$ 47", total: "470" },
                                { title: t('opportunity.upgrade_commission'), desc: t('opportunity.upgrade_calc'), total: "367", extra: "25% Fixo" }
                            ].map((item, i) => (
                                <div key={i} className={`p-6 bg-white/[0.02] rounded-[1.5rem] border ${item.extra ? 'border-primary/30 bg-primary/10' : 'border-white/5'} hover:bg-white/[0.05] transition-all flex flex-col justify-between h-full relative`}>
                                    {item.extra && (
                                        <div className="absolute -top-px -right-px px-2 py-1 bg-primary text-white text-[9px] font-black uppercase tracking-tighter rounded-tr-[1.5rem] rounded-bl-xl border-b border-l border-white/10 shadow-sm">{item.extra}</div>
                                    )}
                                    <div className="space-y-2 mb-6">
                                        <span className="text-white font-black text-sm uppercase italic tracking-tighter block">{item.title}</span>
                                        <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.1em]">{item.desc}</p>
                                    </div>
                                    <div className="flex items-baseline gap-1 mt-auto">
                                        <span className="text-primary text-sm font-black italic">R$</span>
                                        <span className="text-white font-black text-4xl italic tracking-tighter leading-none">{item.total}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* TOTAL PROFIT BOX */}
                        <div className="relative group/total">
                            <div className="absolute -inset-1 bg-gradient-to-r from-primary/40 to-purple-600/40 rounded-[2.5rem] blur opacity-20 group-hover/total:opacity-40 transition duration-1000"></div>
                            <div className="relative h-full bg-[#05050A]/80 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-8 md:p-10 flex flex-col items-start gap-8 shadow-xl">
                                <div className="space-y-6">
                                    <div>
                                        <p className="text-primary text-[10px] font-black uppercase tracking-[0.4em] mb-4">SEU LUCRO ESTIMADO</p>
                                        <div className="flex items-baseline gap-3">
                                            <span className="text-primary font-black text-3xl italic tracking-tighter">R$</span>
                                            <h4 className="text-7xl md:text-8xl font-display font-black text-white italic uppercase tracking-tighter leading-none">1.807</h4>
                                        </div>
                                    </div>
                                    <p className="text-gray-400 text-xs font-black uppercase tracking-[0.1em] bg-white/5 py-2.5 px-5 rounded-xl border border-white/5 inline-block">Ganho potencial com apenas 20 atendimentos + Upgrades</p>
                                </div>
                                
                                <style>
                                    {`
                                        @keyframes gradient-x {
                                            0% { background-position: 0% 50%; }
                                            50% { background-position: 100% 50%; }
                                            100% { background-position: 0% 50%; }
                                        }
                                        .animate-gradient-x {
                                            animation: gradient-x 3s ease infinite;
                                        }
                                    `}
                                </style>
                                <button 
                                    onClick={() => onNavigate('simulator')}
                                    className="group relative overflow-hidden w-full flex items-center justify-center gap-4 px-8 py-5 bg-gradient-to-r from-primary via-purple-500 to-primary bg-[length:200%_auto] animate-gradient-x text-white font-black rounded-2xl active:scale-[0.98] transition-all duration-300 shadow-xl shadow-primary/30 uppercase tracking-tighter italic text-xl"
                                >
                                    <span className="relative z-10">{t('sidebar.earnings_simulator')}</span>
                                    <Calculator className="w-6 h-6 relative z-10 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-300" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: HIGHLIGHTS */}
                    <div className="lg:col-span-5 flex flex-col gap-6 h-full">
                        {/* MARGIN CARD */}
                        <div className="p-8 rounded-[2.5rem] bg-gradient-to-br from-primary to-purple-800 shadow-xl shadow-primary/20 text-center relative overflow-hidden group/target flex flex-col justify-center items-center">
                            <div className="absolute inset-0 bg-white/5 opacity-0 group-hover/target:opacity-100 transition-opacity duration-1000" />
                            <Target className="w-10 h-10 text-white mb-4 opacity-90" />
                            <div className="text-[10px] text-white/60 uppercase font-black tracking-[0.3em] mb-2">{t('opportunity.profit_margin')}</div>
                            <div className="text-6xl font-display font-black text-white italic tracking-tighter leading-none mb-3">100%</div>
                            <p className="text-[10px] text-white/80 uppercase font-bold tracking-wider leading-relaxed max-w-[180px]">
                                {t('opportunity.no_fees')}
                            </p>
                        </div>

                        {/* PASSIVE INCOME CARD */}
                        <div className="flex-1 p-8 md:p-10 rounded-[2.5rem] bg-[#05050A]/80 border border-primary/30 backdrop-blur-3xl relative overflow-hidden group/passive-card shadow-2xl flex flex-col justify-between">
                            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-purple-900/10 opacity-60 pointer-events-none" />
                            
                            <div className="relative z-10 space-y-6">
                                <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center shadow-inner">
                                    <Zap className="w-6 h-6 text-primary animate-pulse" />
                                </div>
                                
                                <div className="space-y-4">
                                    <h5 className="text-2xl md:text-3xl font-display font-black text-white uppercase italic tracking-tighter leading-none drop-shadow-md">
                                        {t('opportunity.passive_income_title')}
                                    </h5>
                                    <div className="inline-block px-3 py-1.5 rounded-lg bg-primary/15 border border-primary/30 text-primary text-[10px] font-black uppercase tracking-[0.15em]">
                                        {t('opportunity.passive_income_highlight')}
                                    </div>
                                    <p className="text-gray-300 text-sm leading-relaxed font-medium">
                                        {t('opportunity.passive_income_desc')}
                                    </p>
                                </div>
                            </div>
                            
                            <div className="relative z-10 mt-8 pt-6 border-t border-white/5">
                                <div className="flex items-center gap-4 py-3 px-5 bg-emerald-500/15 rounded-xl border border-emerald-500/30 group-hover/passive-card:bg-emerald-500/25 transition-all shadow-lg shadow-emerald-500/10">
                                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                                        <Check className="w-4 h-4 text-emerald-400" />
                                    </div>
                                    <span className="text-emerald-50 font-black italic uppercase tracking-tighter text-sm">Gere lucros dormindo</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 4. O QUE VOCÊ RECEBE & 5. PARA QUEM É */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-8">
                    <h2 className="text-4xl font-display font-black text-white uppercase tracking-tighter italic">{t('opportunity.whats_included')}</h2>
                    <div className="grid grid-cols-1 gap-6">
                        {[
                            { icon: BookOpen, label: t('opportunity.included_items.training') },
                            { icon: Target, label: t('opportunity.included_items.process') },
                            { icon: Layers, label: t('opportunity.included_items.infra') },
                            { icon: Layers, label: t('opportunity.included_items.area') },
                            { icon: HeartHandshake, label: t('opportunity.included_items.support') }
                        ].map((item, i) => (
                            <div key={i} className="flex items-center gap-4 group">
                                <div className="p-3 bg-white/5 rounded-xl border border-white/5 group-hover:bg-primary/20 transition-colors">
                                    <item.icon className="w-5 h-5 text-primary" />
                                </div>
                                <span className="text-gray-300 font-bold uppercase text-xs tracking-widest">{item.label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white/5 border border-white/10 p-10 md:p-14 rounded-[3rem] space-y-8">
                    <h2 className="text-3xl font-display font-black text-white uppercase tracking-tighter italic">{t('opportunity.for_whom')}</h2>
                    <div className="space-y-6">
                        {[
                            t('opportunity.for_whom_items.income'),
                            t('opportunity.for_whom_items.tech'),
                            t('opportunity.for_whom_items.ready'),
                            t('opportunity.for_whom_items.scale')
                        ].map((item, i) => (
                            <div key={i} className="flex items-start gap-4">
                                <Zap className="w-5 h-5 text-yellow-500 shrink-0 mt-1" />
                                <span className="text-gray-400 font-medium leading-relaxed">{item}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* VIP PRICING CARD */}
            <div className="relative py-24">
                <div className="absolute inset-0 bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
                
                <div className="max-w-xl mx-auto">
                    <div className="bg-gradient-to-br from-primary/20 via-white/5 to-primary/20 p-px rounded-[3rem] shadow-2xl shadow-primary/20 animate-in zoom-in duration-1000">
                        <div className="bg-[#05050A] rounded-[2.9rem] p-12 md:p-20 relative overflow-hidden text-center">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
                            
                            <div className="relative z-10">
                                <span className="inline-block px-4 py-1.5 rounded-full bg-primary/20 border border-primary/30 text-primary text-[10px] font-black uppercase tracking-[0.3em] mb-8">
                                    {t('opportunity.vip_plan.badge')}
                                </span>
                                
                                <h3 className="text-3xl md:text-4xl font-display font-black text-white italic uppercase tracking-tighter mb-4">
                                    {t('opportunity.vip_plan.title')}
                                </h3>
                                
                                <div className="flex items-center justify-center gap-2 mb-10">
                                    <span className="text-primary font-black text-2xl italic tracking-tighter">R$</span>
                                    <span className="text-7xl md:text-8xl font-display font-black text-white italic tracking-tighter leading-none">
                                        {t('opportunity.vip_plan.price')}
                                    </span>
                                </div>

                                <div className="space-y-4 mb-12">
                                    {[
                                        t('opportunity.vip_plan.benefits.install'),
                                        t('opportunity.vip_plan.benefits.config'),
                                        t('opportunity.vip_plan.benefits.upgrade'),
                                        t('opportunity.included_items.training'),
                                        t('opportunity.included_items.infra'),
                                        t('opportunity.included_items.support')
                                    ].map((benefit, i) => (
                                        <div key={i} className="flex items-center justify-center gap-3 text-gray-400 font-bold uppercase text-[10px] tracking-widest">
                                            <CheckCircle className="w-3.5 h-3.5 text-primary" />
                                            {benefit}
                                        </div>
                                    ))}
                                </div>

                                <button
                                    onClick={handleOpenPartnerCheckout}
                                    disabled={!saasProduct?.checkout_url || isOpeningCheckout}
                                    className="block w-full py-6 bg-primary text-white font-black text-xl rounded-2xl hover:scale-[1.03] active:scale-[0.98] transition-all shadow-xl shadow-primary/30 uppercase tracking-tighter italic mb-8"
                                >
                                    {isOpeningCheckout ? 'Preparando...' : t('opportunity.vip_plan.cta')}
                                </button>

                                <p className="text-[10px] text-gray-600 font-black uppercase tracking-[0.2em]">
                                    {t('opportunity.vip_plan.footer')}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 6. FINAL CTA */}
            <div className="text-center space-y-12 py-24 bg-gradient-to-b from-white/5 to-transparent border border-white/10 rounded-[3rem] relative overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-primary/5 blur-[120px] pointer-events-none" />

                <div className="max-w-3xl mx-auto px-6 relative z-10">
                    <h2 className="text-4xl md:text-6xl font-display font-black text-white uppercase italic tracking-tighter mb-8 leading-none" 
                        dangerouslySetInnerHTML={{ __html: sanitizeTranslationHtml(t('opportunity.ready_to_sell')) }}
                    />
                    <p className="text-gray-400 text-xl font-medium leading-relaxed mb-12">
                        {t('opportunity.no_need_create')}
                    </p>
 
                    <button
                        onClick={handleOpenPartnerCheckout}
                        disabled={!saasProduct?.checkout_url || isOpeningCheckout}
                        className="group relative inline-flex px-16 py-8 bg-white text-black font-black text-2xl rounded-[1.5rem] hover:scale-105 transition-all shadow-2xl shadow-white/10 items-center gap-4 uppercase tracking-tighter italic"
                    >
                        <span>{loading || isOpeningCheckout ? 'Preparando...' : t('opportunity.activate_now')}</span>
                        {isOpeningCheckout ? <Loader2 className="w-7 h-7 animate-spin" /> : <ArrowRight className="w-7 h-7 group-hover:translate-x-2 transition-transform" />}
                    </button>
                </div>
            </div>
        </div>
    );
};

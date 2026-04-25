import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { licenseService, License } from '../../services/licenseService';
import { storage } from '../../services/storageService';
import { Product } from '../../types';
import { BlockPlanInfo } from './components/BlockPlanInfo';
import { BlockLicense } from './components/BlockLicense';
import { BlockInstall } from './components/BlockInstall';
import { BlockTutorials } from './components/BlockTutorials';
import { BlockPasswordSetup } from './components/BlockPasswordSetup';
import { UpsellBanners } from './components/UpsellBanners';
import { BlockOpportunity } from './components/BlockOpportunity';
import { BlockPartner } from './components/BlockPartner';
import { BlockProfile } from './components/BlockProfile';
import { BlockEarningsSimulator } from './components/BlockEarningsSimulator';
import { BlockBasicDashboard } from './components/BlockBasicDashboard';
import { EmailVerificationGate } from './components/EmailVerificationGate';
import { getPlatformPrivacyUrl, getPlatformTermsUrl } from '../../config/platformUrls';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from '../../components/ui/LanguageSelector';
import { Loader2, LogOut, LayoutDashboard, Key, Download, PlayCircle, Shield, Menu, X, User, Crown, BarChart3, Check, ArrowRight, ShieldCheck, TrendingUp } from 'lucide-react';
import './ActivationPortal.css';

const SidebarItem = ({ icon: Icon, label, active, onClick, collapsed }: any) => (
    <button
        onClick={onClick}
        title={collapsed ? label : undefined}
        className={`w-full flex items-center gap-4 py-4 rounded-2xl transition-all duration-500 group relative ${active
            ? 'bg-primary/10 text-primary border border-primary/20 shadow-lg shadow-primary/5'
            : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent'
            } ${collapsed ? 'px-0 justify-center' : 'px-4'}`}
    >
        <Icon className={`shrink-0 transition-all duration-500 ${collapsed ? 'w-7 h-7' : 'w-5 h-5'} ${active ? 'text-primary' : 'text-gray-500'}`} />
        {!collapsed && (
            <span className="text-[12px] font-black uppercase tracking-wider italic whitespace-nowrap overflow-hidden animate-in fade-in slide-in-from-left-2 duration-500">
                {label}
            </span>
        )}
        {active && (
            <div className="absolute left-0 w-1 h-6 bg-primary rounded-r-full shadow-[4px_0_12px_rgba(255,90,31,0.5)]" />
        )}
    </button>
);

export const ActivationPortal: React.FC = () => {
    const [t] = useTranslation(['portal', 'common']);
    const navigate = useNavigate();
    const [centralUser, setCentralUser] = useState<any | null>(null);
    const [license, setLicense] = useState<License | null>(null);
    const [installations, setInstallations] = useState<any[]>([]);
    const [saasProducts, setSaasProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTabInternal] = useState('home');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [isEmailUnconfirmed, setIsEmailUnconfirmed] = useState(false);
    const [approvalState, setApprovalState] = useState<{ status: 'pending_approval' | 'rejected' | 'blocked'; notes?: string | null; blockedAt?: string | null } | null>(null);
    const [partnerOpportunityEnabled, setPartnerOpportunityEnabled] = useState(false);

    const setActiveTab = (tab: string) => {
        setActiveTabInternal(tab);
        if (window.innerWidth < 768) setSidebarOpen(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleActivate = async () => {
        if (!termsAccepted) {
            alert('Voce precisa aceitar os termos de uso.');
            return;
        }

        setLoading(true);
        try {
            const result = await licenseService.activateFree({ termsAccepted: true });
            if (result.success) {
                await loadData();
            } else {
                alert(result.message || 'Erro ao ativar licenca');
            }
        } catch (error: any) {
            console.error('Activation error:', error);
            alert(error.message || 'Erro de conexao');
        } finally {
            setLoading(false);
        }
    };

    const loadData = async () => {
        setLoading(true);
        try {
            const { centralSupabase } = await import('../../services/centralClient');
            const { data: { user } } = await centralSupabase.auth.getUser();

            if (!user) {
                navigate('/activate');
                return;
            }

            if (!user.email_confirmed_at && user.app_metadata?.provider === 'email') {
                setIsEmailUnconfirmed(true);
                setCentralUser(user);
                setLoading(false);
                return;
            }

            setIsEmailUnconfirmed(false);
            setCentralUser(user);

            const { data: profile } = await centralSupabase
                .from('profiles')
                .select('account_status, approval_notes, is_blocked, blocked_at')
                .eq('id', user.id)
                .maybeSingle();

            if (profile?.is_blocked) {
                setApprovalState({
                    status: 'blocked',
                    notes: profile.approval_notes || null,
                    blockedAt: profile.blocked_at || null
                });
                setLicense(null);
                setInstallations([]);
                setLoading(false);
                return;
            }

            if (profile?.account_status === 'pending_approval' || profile?.account_status === 'rejected') {
                setApprovalState({
                    status: profile.account_status,
                    notes: profile.approval_notes || null,
                    blockedAt: profile.blocked_at || null
                });
                setLicense(null);
                setInstallations([]);
                setLoading(false);
                return;
            }

            setApprovalState(null);

            const [licenseData, centralPlans, localSaaSProducts, partnerVisibility] = await Promise.all([
                licenseService.getLicenseByUserId(user.id, user.email),
                licenseService.getOfficialPlans(),
                storage.getPublicSaaSProducts(),
                licenseService.getPartnerOpportunityVisibility().catch(() => ({
                    partner_opportunity_enabled: false,
                    plan_type: null,
                    account_id: null,
                }))
            ]);

            const mergedPlans = centralPlans.map(cp => {
                const localMatch = localSaaSProducts.find(lp =>
                    lp.saas_plan_slug === cp.saas_plan_slug ||
                    (cp.saas_plan_slug === 'whitelabel' && lp.saas_plan_slug === 'upgrade_domains') ||
                    (cp.saas_plan_slug === 'upgrade_domains' && lp.saas_plan_slug === 'whitelabel')
                );

                if (localMatch) {
                    return {
                        ...cp,
                        name: localMatch.name || cp.name,
                        description: localMatch.description || cp.description,
                        imageUrl: localMatch.imageUrl || cp.imageUrl,
                        price_real: localMatch.price_real || cp.price_real,
                        checkout_url: localMatch.checkout_url || cp.checkout_url
                    };
                }
                return cp;
            });

            setLicense(licenseData);
            setSaasProducts(mergedPlans);
            setPartnerOpportunityEnabled(Boolean(partnerVisibility?.partner_opportunity_enabled));

            if (licenseData) {
                const instData = await licenseService.getMyInstallations();
                setInstallations(instData);
            }
        } catch (error) {
            console.error('Error loading activation data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        
        const handleNavEvent = (e: Event) => {
            const customEvent = e as CustomEvent<string>;
            if (customEvent.detail) {
                setActiveTab(customEvent.detail);
            }
        };
        window.addEventListener('nav-to-tab', handleNavEvent);
        return () => window.removeEventListener('nav-to-tab', handleNavEvent);
    }, []);

    const isPartnerExperienceVisible = partnerOpportunityEnabled || license?.plan === 'saas';
    const showPartnerOpportunityTab = license?.plan !== 'saas' && isPartnerExperienceVisible;
    const showPartnerPanelTab = license?.plan === 'saas';
    const showEarningsSimulatorTab = isPartnerExperienceVisible;
    const upgradeProduct = saasProducts.find((product) =>
        product.saas_plan_slug === 'upgrade_domains' || product.saas_plan_slug === 'whitelabel'
    ) || null;

    useEffect(() => {
        if (activeTab === 'opportunity' && !showPartnerOpportunityTab) {
            setActiveTabInternal('home');
            return;
        }

        if (activeTab === 'partner' && !showPartnerPanelTab) {
            setActiveTabInternal('home');
            return;
        }

        if (activeTab === 'simulator' && !showEarningsSimulatorTab) {
            setActiveTabInternal('home');
        }
    }, [activeTab, showEarningsSimulatorTab, showPartnerOpportunityTab, showPartnerPanelTab]);

    // Real-time listener for block enforcement
    useEffect(() => {
        if (!centralUser) return;

        let channel: any;
        const setupRealtime = async () => {
            try {
                const { centralSupabase } = await import('../../services/centralClient');
                channel = centralSupabase
                    .channel(`public:profiles:block-check:${centralUser.id}`)
                    .on(
                        'postgres_changes',
                        {
                            event: 'UPDATE',
                            schema: 'public',
                            table: 'profiles',
                            filter: `id=eq.${centralUser.id}`,
                        },
                        (payload) => {
                            if (payload.new && payload.new.is_blocked !== payload.old?.is_blocked) {
                                console.log('[Portal] Realtime block state changed, reloading...');
                                loadData();
                            }
                        }
                    )
                    .subscribe();
            } catch (err) {
                console.error('[Portal] Failed to setup realtime block listener:', err);
            }
        };

        setupRealtime();

        return () => {
            if (channel) {
                channel.unsubscribe();
            }
        };
    }, [centralUser]);

    const handleLogout = async () => {
        const { centralSupabase } = await import('../../services/centralClient');
        await centralSupabase.auth.signOut();
        navigate('/activate');
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#05050A] flex items-center justify-center text-white">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (isEmailUnconfirmed && centralUser) {
        return (
            <EmailVerificationGate
                email={centralUser.email || ''}
                onResendSuccess={() => console.log('Confirmation email task triggered')}
                onLogout={handleLogout}
            />
        );
    }

    if (approvalState && centralUser) {
        const isRejected = approvalState.status === 'rejected';
        const isBlocked = approvalState.status === 'blocked';

        return (
            <div className="min-h-screen bg-[#05050A] flex items-center justify-center p-4 text-white">
                <div className="w-full max-w-2xl bg-[#0F0F13] border border-white/10 rounded-[2rem] p-8 md:p-12 shadow-2xl">
                    <div className={`w-20 h-20 rounded-[1.5rem] flex items-center justify-center mb-8 ${
                        isBlocked
                            ? 'bg-red-500/10 text-red-400'
                            : isRejected
                                ? 'bg-red-500/10 text-red-400'
                                : 'bg-amber-500/10 text-amber-300'
                    }`}>
                        <ShieldCheck className="w-10 h-10" />
                    </div>

                    <h1 className="text-4xl font-black tracking-tighter uppercase italic mb-4">
                        {isBlocked ? 'Acesso bloqueado' : isRejected ? 'Cadastro nao aprovado' : 'Cadastro em analise'}
                    </h1>

                    <p className="text-lg text-gray-300 leading-relaxed mb-6">
                        {isBlocked
                            ? 'Seu acesso ao portal foi bloqueado pelo time interno. Enquanto o bloqueio estiver ativo, esta sessao nao pode usar o portal.'
                            : isRejected
                            ? 'Sua conta foi revisada, mas nao foi liberada neste ciclo. Se precisar, fale com o time para uma nova avaliacao.'
                            : 'Seu e-mail ja foi confirmado. Agora falta a aprovacao manual do time interno para liberar o portal.'}
                    </p>

                    {isBlocked && approvalState.blockedAt && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 mb-6">
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-red-300">Bloqueado em</p>
                            <p className="mt-2 text-sm text-red-100 leading-relaxed">
                                {new Date(approvalState.blockedAt).toLocaleString('pt-BR')}
                            </p>
                        </div>
                    )}

                    {approvalState.notes && (
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-6">
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-400">Observacao interna</p>
                            <p className="mt-2 text-sm text-gray-300 leading-relaxed">{approvalState.notes}</p>
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-3">
                        <button
                            onClick={() => window.location.reload()}
                            className="flex-1 bg-white text-black py-4 rounded-xl font-bold hover:bg-gray-200 transition-all"
                        >
                            Atualizar status
                        </button>
                        <button
                            onClick={handleLogout}
                            className="flex-1 bg-white/5 border border-white/10 text-white py-4 rounded-xl font-bold hover:bg-white/10 transition-all"
                        >
                            Sair
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Removed immediate activation gate. User goes straight to the portal and can generate their license there.
    const renderContent = () => {
        switch (activeTab) {
            case 'home':
                return (
                    <div className="space-y-16 animate-in fade-in slide-in-from-bottom-8 duration-1000 fill-mode-both text-white text-center">
                        <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-primary/10 via-transparent to-transparent border border-white/5 p-8 md:p-16">
                            <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
                            <h1 className="font-display italic font-black text-4xl md:text-7xl text-white uppercase tracking-tighter mb-6 leading-none">
                                {t('welcome.title')} <span className="bg-gradient-to-r from-primary to-indigo-400 bg-clip-text text-transparent">{t('welcome.span')}</span>
                            </h1>
                            <p className="text-gray-400 text-lg md:text-xl max-w-2xl font-medium leading-relaxed mx-auto">
                                {t('welcome.desc')}
                            </p>
                        </div>
                        {!isPartnerExperienceVisible && (
                            <BlockBasicDashboard
                                license={license}
                                installations={installations}
                                onNavigate={setActiveTab}
                                upgradeProduct={upgradeProduct}
                            />
                        )}
                        <BlockPlanInfo license={license} userName={centralUser?.user_metadata?.name || centralUser?.email} />
                        <UpsellBanners
                            license={license}
                            products={saasProducts}
                            onNavigate={(tab) => setActiveTab(tab)}
                            showPartnerOpportunity={isPartnerExperienceVisible}
                        />
                    </div>
                );
            case 'license':
                return (
                    <div className="animate-in fade-in duration-500 text-white">
                        <h2 className="text-3xl font-black text-white mb-8 font-display uppercase tracking-tighter italic">{t('sidebar.access_data')}</h2>
                        <BlockLicense 
                            license={license} 
                            isUnlimited={centralUser?.email === 'contato.jeandamin@gmail.com'} 
                            userName={centralUser?.user_metadata?.name || centralUser?.email}
                            onRefresh={loadData}
                        />
                    </div>
                );
            case 'install':
                return (
                    <div className="animate-in fade-in duration-500 text-white">
                        <h2 className="text-3xl font-black text-white mb-8 font-display uppercase tracking-tighter italic">{t('sidebar.installation')}</h2>
                        <BlockInstall
                            license={license}
                            installations={installations}
                            onRefresh={loadData}
                            onNavigate={(tab) => setActiveTab(tab)}
                            upgradeProduct={upgradeProduct}
                        />
                    </div>
                );
            case 'tutorials':
                return (
                    <div className="animate-in fade-in duration-500 text-white">
                        <h2 className="text-3xl font-black text-white mb-8 font-display uppercase tracking-tighter italic">{t('sidebar.tutorials')}</h2>
                        <BlockTutorials planType={license?.plan || 'free'} />
                    </div>
                );
            case 'security':
                return (
                    <div className="animate-in fade-in duration-500 text-white">
                        <h2 className="text-3xl font-black text-white mb-8 font-display uppercase tracking-tighter italic">{t('sidebar.security')}</h2>
                        <BlockPasswordSetup />
                    </div>
                );
            case 'opportunity':
                if (!showPartnerOpportunityTab) return null;
                return (
                    <div className="animate-in fade-in duration-500 text-white">
                        <BlockOpportunity onNavigate={setActiveTab} />
                    </div>
                );
            case 'partner':
                if (!showPartnerPanelTab) return null;
                return (
                    <div className="animate-in fade-in duration-500 text-white">
                        <BlockPartner userId={centralUser.id} />
                    </div>
                );
            case 'simulator':
                if (!showEarningsSimulatorTab) return null;
                return (
                    <div className="animate-in fade-in duration-500 text-white">
                        <BlockEarningsSimulator onNavigate={setActiveTab} />
                    </div>
                );
            case 'profile':
                return (
                    <div className="animate-in fade-in duration-500 text-white">
                        <h2 className="text-3xl font-black text-white mb-8 font-display uppercase tracking-tighter italic">{t('sidebar.my_account')}</h2>
                        <BlockProfile user={centralUser} license={license} onNavigate={setActiveTab} />
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="min-h-screen bg-[#05050A] text-white flex overflow-hidden font-sans">
            {/* SIDEBAR */}
            <aside className={`hidden lg:flex flex-col fixed inset-y-0 border-r border-white/5 bg-[#05050A]/80 backdrop-blur-3xl z-50 transition-all duration-500 ease-in-out ${isCollapsed ? 'w-24' : 'w-72'}`}>
                <div className={`h-full flex flex-col items-center transition-all duration-500 ${isCollapsed ? 'px-4 py-6' : 'p-6'}`}>
                    {/* Brand / Logo */}
                    <div className={`flex items-center gap-3 mb-12 px-2 transition-all duration-500 ${isCollapsed ? 'justify-center' : 'w-full'}`}>
                        <div className="w-11 h-11 bg-primary rounded-2xl flex items-center justify-center font-display font-black text-white shadow-2xl shadow-primary/40 text-xl italic shrink-0">S</div>
                        {!isCollapsed && (
                            <div className="animate-in fade-in slide-in-from-left-4 duration-500">
                                <h1 className="font-display font-black text-lg leading-tight uppercase tracking-tighter italic">Super <span className="text-primary">Checkout</span></h1>
                                <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em]">Customer Portal</p>
                            </div>
                        )}
                    </div>

                    {/* Collapse Toggle */}
                    <button 
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="absolute -right-3 top-24 w-6 h-6 bg-primary rounded-full flex items-center justify-center text-white shadow-lg hover:scale-110 transition-transform hidden lg:flex"
                    >
                        {isCollapsed ? <ArrowRight className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    </button>

                    {/* Navigation */}
                    <nav className="flex-1 space-y-2 w-full overflow-y-auto overflow-x-hidden pr-2 custom-scrollbar">
                        <SidebarItem icon={LayoutDashboard} label={t('sidebar.dashboard')} active={activeTab === 'home'} onClick={() => setActiveTab('home')} collapsed={isCollapsed} />
                        <SidebarItem icon={PlayCircle} label={t('sidebar.tutorials')} active={activeTab === 'tutorials'} onClick={() => setActiveTab('tutorials')} collapsed={isCollapsed} />
                        <SidebarItem icon={Key} label={t('sidebar.access_data')} active={activeTab === 'license'} onClick={() => setActiveTab('license')} collapsed={isCollapsed} />
                        <SidebarItem icon={Download} label={t('sidebar.installation')} active={activeTab === 'install'} onClick={() => setActiveTab('install')} collapsed={isCollapsed} />
                        
                        {showPartnerOpportunityTab ? (
                            <SidebarItem icon={Crown} label={t('sidebar.upgrade_business')} active={activeTab === 'opportunity'} onClick={() => setActiveTab('opportunity')} collapsed={isCollapsed} />
                        ) : showPartnerPanelTab ? (
                            <SidebarItem icon={BarChart3} label={t('sidebar.partner_panel')} active={activeTab === 'partner'} onClick={() => setActiveTab('partner')} collapsed={isCollapsed} />
                        ) : null}
                        {showEarningsSimulatorTab && (
                            <SidebarItem icon={TrendingUp} label={t('sidebar.earnings_simulator')} active={activeTab === 'simulator'} onClick={() => setActiveTab('simulator')} collapsed={isCollapsed} />
                        )}
                    </nav>

                    {/* Footer / Support info could go here */}
                </div>
            </aside>

            {/* MOBILE HEADER */}
            <header className="lg:hidden fixed top-0 inset-x-0 h-16 bg-[#05050A]/80 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-6 z-40">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center font-display font-black text-white text-sm italic">S</div>
                </div>
                <button onClick={() => setSidebarOpen(true)} className="p-2 text-gray-400 group">
                    <Menu className="w-6 h-6 group-hover:text-primary transition-colors" />
                </button>
            </header>

            {/* MOBILE SIDEBAR MODAL */}
            {sidebarOpen && (
                <div className="fixed inset-0 bg-black/80 z-50 lg:hidden backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setSidebarOpen(false)}>
                    <div className="absolute left-0 inset-y-0 w-72 bg-[#05050A] border-r border-white/10 p-8 flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-10">
                            <span className="font-display font-black text-lg tracking-tighter uppercase italic">{t('common:menu')}</span>
                            <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-white transition-colors"><X /></button>
                        </div>
                        <nav className="space-y-4 flex-1">
                            <SidebarItem icon={LayoutDashboard} label={t('sidebar.dashboard')} active={activeTab === 'home'} onClick={() => setActiveTab('home')} />
                            <SidebarItem icon={PlayCircle} label={t('sidebar.tutorials')} active={activeTab === 'tutorials'} onClick={() => setActiveTab('tutorials')} />
                            <SidebarItem icon={Key} label={t('sidebar.access_data')} active={activeTab === 'license'} onClick={() => setActiveTab('license')} />
                            <SidebarItem icon={Download} label={t('sidebar.installation')} active={activeTab === 'install'} onClick={() => setActiveTab('install')} />
                            {showPartnerOpportunityTab ? (
                                <SidebarItem icon={Crown} label={t('sidebar.upgrade_business')} active={activeTab === 'opportunity'} onClick={() => setActiveTab('opportunity')} />
                            ) : showPartnerPanelTab ? (
                                <SidebarItem icon={BarChart3} label={t('sidebar.partner_panel')} active={activeTab === 'partner'} onClick={() => setActiveTab('partner')} />
                            ) : null}
                            {showEarningsSimulatorTab && (
                                <SidebarItem icon={TrendingUp} label={t('sidebar.earnings_simulator')} active={activeTab === 'simulator'} onClick={() => setActiveTab('simulator')} />
                            )}
                        </nav>
                        <button onClick={handleLogout} className="mt-auto flex items-center justify-center gap-3 px-4 py-4 text-red-500 font-black uppercase italic tracking-tighter border border-red-500/20 rounded-2xl bg-red-500/5 hover:bg-red-500 hover:text-white transition-all duration-300">
                            <LogOut className="w-4 h-4" /> 
                            {t('sidebar.logout')}
                        </button>
                    </div>
                </div>
            )}

            {/* MAIN CONTENT AREA */}
            <main className={`flex-1 min-h-screen overflow-y-auto transition-all duration-500 ease-in-out ${isCollapsed ? 'lg:ml-24' : 'lg:ml-72'}`}>
                
                {/* TOP NAVBAR (NEW) */}
                <div className="sticky top-0 z-30 w-full h-20 bg-[#05050A]/60 backdrop-blur-2xl border-b border-white/5 px-6 lg:px-12 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="hidden lg:flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary leading-none mb-1 italic">Customer Portal</span>
                            <h2 className="text-sm font-black text-white/40 uppercase tracking-widest italic leading-none">
                                {t(`sidebar.${({
                                    home: 'dashboard',
                                    license: 'access_data',
                                    install: 'installation',
                                    tutorials: 'tutorials',
                                    security: 'security',
                                    opportunity: 'upgrade_business',
                                    partner: 'partner_panel',
                                    simulator: 'earnings_simulator',
                                    profile: 'my_account'
                                } as any)[activeTab] || activeTab}`)}
                            </h2>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 lg:gap-6">
                        {/* Language Selector */}
                        <div className="hidden md:block">
                            <LanguageSelector variant="portal" />
                        </div>

                        {/* Security */}
                        <button 
                            onClick={() => setActiveTab('security')}
                            title={t('sidebar.security')}
                            className={`p-3 rounded-2xl transition-all border ${activeTab === 'security' ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-white/5 border-white/5 text-gray-400 hover:text-white hover:bg-white/10'}`}
                        >
                            <Shield className="w-5 h-5" />
                        </button>

                        {/* Profile / Client */}
                        <button 
                            onClick={() => setActiveTab('profile')}
                            className={`flex items-center gap-3 p-1.5 pr-4 rounded-2xl transition-all border ${activeTab === 'profile' ? 'bg-primary/10 border-primary/20' : 'bg-white/5 border-white/5 hover:bg-white/10 group'}`}
                        >
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${activeTab === 'profile' ? 'bg-primary text-white' : 'bg-white/5 text-gray-500 group-hover:text-white'}`}>
                                <User className="w-5 h-5" />
                            </div>
                            <div className="hidden sm:block text-left">
                                <p className="text-xs font-black uppercase tracking-tighter italic text-white leading-none mb-0.5">{centralUser?.user_metadata?.name?.split(' ')[0] || 'Cliente'}</p>
                                <p className="text-[9px] text-primary/60 font-black uppercase tracking-widest leading-none">{license?.plan}</p>
                            </div>
                        </button>

                        {/* Logout */}
                        <button 
                            onClick={handleLogout}
                            title={t('sidebar.logout')}
                            className="p-3 rounded-2xl bg-red-500/5 border border-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-lg shadow-red-500/5 group"
                        >
                            <LogOut className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        </button>
                    </div>
                </div>

                <div className="p-6 lg:p-12 max-w-[1400px] mx-auto pb-32 relative">
                    {renderContent()}
                </div>
            </main>
        </div>
    );
};


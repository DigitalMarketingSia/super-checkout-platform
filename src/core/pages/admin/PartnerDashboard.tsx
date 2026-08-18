import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Layout } from '../../components/Layout';
import {
    Users,
    Globe,
    ExternalLink,
    Copy,
    CheckCircle2,
    AlertTriangle,
    Info,
    Calendar,
    Clock,
    ShieldCheck,
    Crown,
    Zap,
    Rocket,
    MoreVertical,
    Link as LinkIcon,
    RefreshCw,
    Wallet,
    Activity,
    Wifi,
    ArrowUpRight
} from 'lucide-react';
import { centralSupabase } from '../../services/centralClient';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
    CentralInstallationEcosystemError,
    listInstallationEcosystem,
    type InstallationEcosystemItem,
} from '../../services/centralInstallationEcosystem';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { licenseService } from '../../services/licenseService';
import { supabase } from '../../services/supabase';
import { getInstallerUrl, getRegisterUrl } from '../../config/platformUrls';

export const PartnerDashboard = () => {
    const { profile, user } = useAuth();
    const { t, i18n } = useTranslation('admin');
    const navigate = useNavigate();
    const [stats, setStats] = useState({ clients: 0, installations: 0 });
    const [clients, setClients] = useState<InstallationEcosystemItem[]>([]); // Authorized ecosystem rows
    const [leads, setLeads] = useState<any[]>([]); // Referred Profiles
    const [loading, setLoading] = useState(true);
    
    // Create/Install Modal
    const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
    const [selectedLead, setSelectedLead] = useState<any>(null);
    const [creatingLicense, setCreatingLicense] = useState(false);

    const referralLink = getRegisterUrl({ partner: user?.id });
    const partnerDateLocale = i18n.language.startsWith('es')
        ? 'es-ES'
        : i18n.language.startsWith('en')
            ? 'en-US'
            : 'pt-BR';

    // Extracting fetch logic to a reusable function
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useEffect(() => {
        const fetchPartnerData = async () => {
            if (!user?.email) return;
            setLoading(true);
            try {
                // 1. Get CENTRAL user ID by email
                const { data: centralProfile } = await centralSupabase
                    .from('profiles')
                    .select('id')
                    .eq('email', user.email)
                    .single();
                
                const centralUserId = centralProfile?.id;
                
                if (!centralUserId) {
                    console.warn('Partner not found in central database');
                    setLoading(false);
                    return;
                }

                // 2. Fetch LEADS
                const { data: leadData, count: leadCount } = await centralSupabase
                    .from('profiles')
                    .select('id, full_name, email, whatsapp, created_at, partner_consent', { count: 'exact' })
                    .eq('referred_by_partner_id', centralUserId)
                    .order('created_at', { ascending: false });

                // 3. Fetch the same server-side read model used by the Portal.
                // The admin surface must not fall back to a legacy installation
                // table filter or receive license secrets in the browser.
                const ecosystem = await listInstallationEcosystem({ page: 1, page_size: 50 });

                setStats({
                    clients: leadCount || 0,
                    installations: ecosystem.summary.total
                });

                setClients(ecosystem.items);

                if (leadData) {
                    setLeads(leadData);
                }

            } catch (error) {
                console.error('Error fetching partner data:', error);
                if (error instanceof CentralInstallationEcosystemError && error.kind === 'access_denied') {
                    toast.error(t('partner_dashboard.toasts.access_denied'));
                } else {
                    toast.error(t('partner_dashboard.toasts.load_error'));
                }
            } finally {
                setLoading(false);
            }
        };

        fetchPartnerData();
    }, [refreshTrigger, t, user?.email, user?.id]);

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success(t('partner_dashboard.toasts.link_copied'));
    };

    const handleStartInstall = (lead: any) => {
        setSelectedLead(lead);
        setIsInstallModalOpen(true);
    };

    const confirmInstallation = async () => {
        if (!selectedLead) return;
        setCreatingLicense(true);
        try {
            // 1. Try to find EXISTING license for this lead email
            const existingLicense = await licenseService.getLicenseByUserId('', selectedLead.email);

            if (existingLicense) {
                toast.success(t('partner_dashboard.toasts.existing_license_found'));
                const data = await licenseService.generateInstallToken(existingLicense.key);
                if (data.token) {
                    const url = getInstallerUrl(data.token);
                    window.open(url, '_blank');
                    setIsInstallModalOpen(false);
                    return;
                }
            }

            // 2. If no license found, inform the partner
            toast.error(t('partner_dashboard.toasts.no_active_license_for_lead'));
            
            /* 
            // Fallback commented out as per user request (don't create new keys blindly)
            const result = await licenseService.createCommercial({
                name: selectedLead.full_name,
                email: selectedLead.email,
                plan: 'agency', 
                source: 'partner_dashboard'
            }, session.access_token);
            */
            
        } catch (error: any) {
            toast.error(t('partner_dashboard.toasts.generic_error', { message: error.message }));
        } finally {
            setCreatingLicense(false);
        }
    };

    return (
        <Layout>
            <div className="flex flex-col gap-8 pb-12 animate-in fade-in duration-700">
                {/* Header Section */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-orange-500/10 rounded-xl">
                                <Crown className="w-8 h-8 text-orange-400" />
                            </div>
                            <h1 className="text-4xl font-black text-white tracking-tighter italic uppercase">
                                {t('partner_dashboard.title')}
                            </h1>
                        </div>
                        <p className="text-gray-400 font-medium flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]"></span>
                            {t('partner_dashboard.subtitle')}
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {/* Connection Status Indicator */}
                        <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-3 backdrop-blur-md">
                            <div className="relative">
                                <div className="w-2 h-2 bg-green-500 rounded-full" />
                                <div className="absolute inset-0 w-2 h-2 bg-green-500 rounded-full animate-ping opacity-75" />
                            </div>
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('partner_dashboard.central_online')}</span>
                        </div>

                        {/* Portal Financeiro Bridge */}
                        <Button 
                            variant="outline"
                            onClick={() => window.open('https://supercheckout.app/portal/billing', '_blank')}
                            className="bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-2xl font-black text-xs uppercase tracking-wider group"
                        >
                            <Wallet className="w-4 h-4 mr-2 text-primary group-hover:scale-110 transition-transform" />
                            {t('partner_dashboard.billing_and_commissions')}
                        </Button>

                        <div className="h-8 w-[1px] bg-white/10 hidden md:block" />

                        <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => setRefreshTrigger(prev => prev + 1)}
                            className={`bg-white/5 hover:bg-white/10 rounded-xl transition-all ${loading ? 'opacity-50' : ''}`}
                        >
                            <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </div>

                {/* Main Stats - Elite Design */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="group bg-gradient-to-br from-blue-600/10 to-transparent border border-blue-500/20 rounded-[2.5rem] p-8 backdrop-blur-3xl relative overflow-hidden transition-all hover:border-blue-500/40">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-[40px] -mr-16 -mt-16 group-hover:bg-blue-500/20 transition-all" />
                        <div className="flex flex-col gap-6 relative z-10">
                            <div className="w-14 h-14 bg-blue-600/20 rounded-2xl flex items-center justify-center text-blue-400 shadow-inner">
                                <Users className="w-7 h-7" />
                            </div>
                            <div>
                                <p className="text-gray-400 text-xs font-black uppercase tracking-[0.2em] mb-1">{t('partner_dashboard.total_referrals')}</p>
                                <div className="flex items-baseline gap-2">
                                    <h2 className="text-5xl font-black text-white font-display italic tracking-tighter">{stats.clients}</h2>
                                    <span className="text-blue-500 font-bold text-xs uppercase">{t('partner_dashboard.active_leads')}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="group bg-gradient-to-br from-purple-600/10 to-transparent border border-purple-500/20 rounded-[2.5rem] p-8 backdrop-blur-3xl relative overflow-hidden transition-all hover:border-purple-500/40">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-[40px] -mr-16 -mt-16 group-hover:bg-purple-500/20 transition-all" />
                        <div className="flex flex-col gap-6 relative z-10">
                            <div className="w-14 h-14 bg-purple-600/20 rounded-2xl flex items-center justify-center text-purple-400 shadow-inner">
                                <Globe className="w-7 h-7" />
                            </div>
                            <div>
                                <p className="text-gray-400 text-xs font-black uppercase tracking-[0.2em] mb-1">{t('partner_dashboard.active_installations')}</p>
                                <div className="flex items-baseline gap-2">
                                    <h2 className="text-5xl font-black text-white font-display italic tracking-tighter">{stats.installations}</h2>
                                    <span className="text-purple-500 font-bold text-xs uppercase tracking-widest">{t('partner_dashboard.systems')}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Quick Link Card */}
                    <div className="bg-[#0A0A12]/40 border border-white/5 rounded-[2.5rem] p-8 backdrop-blur-md flex flex-col justify-between group hover:border-white/10 transition-all">
                        <div>
                            <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest mb-4">{t('partner_dashboard.your_referral_link')}</p>
                            <div className="bg-black/40 border border-white/10 rounded-2xl p-4 font-mono text-xs text-primary truncate mb-4 select-all">
                                {referralLink}
                            </div>
                        </div>
                        <Button 
                            onClick={() => copyToClipboard(referralLink)}
                            className="bg-primary hover:bg-primary-hover text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-primary/20 transition-all active:scale-95 group-hover:translate-y-[-2px]"
                        >
                            <Copy className="w-4 h-4" />
                            {t('partner_dashboard.copy_access')}
                        </Button>
                    </div>
                </div>

                {/* Leads Table - Ultra Clean Design */}
                <div className="bg-[#0F0F13]/60 border border-white/5 rounded-[2rem] overflow-hidden backdrop-blur-xl transition-all hover:border-white/10">
                    <div className="p-8 border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400">
                                <Users className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-black text-white uppercase italic tracking-tighter">{t('partner_dashboard.my_leads')}</h3>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{t('partner_dashboard.referral_tracking')}</p>
                            </div>
                        </div>
                        <span className="px-3 py-1 bg-white/5 border border-white/5 rounded-full text-[10px] font-black text-gray-400 uppercase tracking-widest">
                            {t('partner_dashboard.leads_count', { count: leads.length })}
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-black/20 border-b border-white/5">
                                    <th className="px-8 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">{t('partner_dashboard.person_contact')}</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">{t('partner_dashboard.date')}</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] text-right">{t('partner_dashboard.operational_action')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {leads.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="px-8 py-16 text-center text-gray-600 italic text-sm">
                                            {t('partner_dashboard.empty_referrals')}
                                        </td>
                                    </tr>
                                ) : (
                                    leads.map((lead) => {
                                        const isInstalled = clients.some(c => c.beneficiary.id === lead.id);
                                        return (
                                            <tr key={lead.id} className="hover:bg-white/[0.02] transition-colors group">
                                                <td className="px-8 py-6">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-gray-200 group-hover:text-white transition-colors">{lead.full_name || t('partner_dashboard.no_name')}</span>
                                                        <span className="text-[11px] text-gray-500 flex items-center gap-2 mt-1">
                                                            {lead.email}
                                                            {lead.whatsapp && (
                                                                <>
                                                                    <span className="w-1 h-1 rounded-full bg-gray-700"></span>
                                                                    <a
                                                                        href={`https://wa.me/${lead.whatsapp.replace(/\D/g, '')}`}
                                                                        target="_blank"
                                                                        className="text-green-500 hover:text-green-400 font-bold"
                                                                    >
                                                                        {lead.whatsapp}
                                                                    </a>
                                                                </>
                                                            )}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs text-gray-400 font-medium">{new Date(lead.created_at).toLocaleDateString(partnerDateLocale)}</span>
                                                        <span className="text-[9px] text-gray-600 font-black uppercase tracking-widest">{t('partner_dashboard.registered')}</span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6 text-right">
                                                    {!isInstalled ? (
                                                        <Button 
                                                            size="sm" 
                                                            onClick={() => handleStartInstall(lead)}
                                                            className="bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-600/20 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all"
                                                        >
                                                            <Rocket className="w-3 h-3 mr-2" />
                                                            {t('partner_dashboard.install_now')}
                                                        </Button>
                                                    ) : (
                                                        <div className="flex items-center justify-end gap-2 text-green-500/60 font-black text-[10px] uppercase tracking-widest italic">
                                                            <CheckCircle2 className="w-3 h-3" />
                                                            {t('partner_dashboard.completed')}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Installations Table - Elite Grid */}
                <div className="bg-[#0F0F13]/60 border border-white/5 rounded-[2rem] overflow-hidden backdrop-blur-xl transition-all hover:border-white/10">
                    <div className="p-8 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-purple-500/5 to-transparent">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center text-purple-400">
                                <Globe className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-black text-white uppercase italic tracking-tighter">{t('partner_dashboard.installed_systems')}</h3>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{t('partner_dashboard.active_domains_and_licenses')}</p>
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-black/20 border-b border-white/5">
                                    <th className="px-8 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">{t('partner_dashboard.domain_client')}</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">{t('partner_dashboard.expires_in')}</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] text-right">{t('partner_dashboard.control')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {clients.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="px-8 py-16 text-center text-gray-600 italic text-sm">
                                            {t('partner_dashboard.no_system_installed')}
                                        </td>
                                    </tr>
                                ) : (
                                    clients.map((client) => (
                                        <tr key={`${client.installation_id}-${client.service_order_id}`} className="hover:bg-white/[0.02] transition-colors group">
                                            <td className="px-8 py-6">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-black text-white tracking-tight">{client.domain}</span>
                                                        <a href={`https://${client.domain}`} target="_blank" className="text-gray-600 hover:text-white transition-colors">
                                                            <ArrowUpRight className="w-3 h-3" />
                                                        </a>
                                                    </div>
                                                    <span className="text-[11px] text-gray-500 font-medium">{client.beneficiary.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6 text-xs text-gray-400">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]"></span>
                                                    {t('partner_dashboard.lifetime_batch')}
                                                </div>
                                            </td>
                                            <td className="px-8 py-6 text-right">
                                                <div className="flex flex-wrap justify-end gap-2">
                                                    <button
                                                        onClick={() => navigate(`/activate/setup?tab=services&order_id=${encodeURIComponent(client.service_order_id)}`)}
                                                        className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500/5 hover:bg-orange-500 text-orange-400 hover:text-white border border-orange-500/20 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest group/btn active:scale-95"
                                                    >
                                                        <ArrowUpRight className="w-3 h-3 group-hover/btn:animate-pulse" />
                                                        {t('partner_dashboard.view_order')}
                                                    </button>
                                                    <button
                                                        onClick={() => navigate(`/admin/system-licenses?search=${encodeURIComponent(client.beneficiary.email || client.beneficiary.name)}`)}
                                                        className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest active:scale-95"
                                                    >
                                                        <Zap className="w-3 h-3" />
                                                        {t('partner_dashboard.activate_features')}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Revocation Warning */}
                <div className="p-6 rounded-2xl bg-red-500/5 border border-red-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 shrink-0">
                            <ShieldCheck className="w-5 h-5" />
                        </div>
                        <div>
                            <h4 className="font-bold text-white text-sm">{t('partner_dashboard.brand_protection_title')}</h4>
                            <p className="text-xs text-gray-400 mt-1 max-w-xl">
                                {t('partner_dashboard.brand_protection_description')}
                            </p>
                        </div>
                    </div>
                </div>

                {/* MODAL: Iniciar Instalação */}
                <Modal
                    isOpen={isInstallModalOpen}
                    onClose={() => setIsInstallModalOpen(false)}
                    title={t('partner_dashboard.installation_assistant')}
                >
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center gap-5 p-6 bg-blue-500/5 border border-blue-500/10 rounded-[1.5rem] backdrop-blur-sm relative overflow-hidden group">
                            <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center text-blue-400 shadow-lg relative z-10">
                                <Rocket className="w-8 h-8 animate-bounce" />
                            </div>
                            <div className="relative z-10">
                                <p className="text-white font-black text-xl italic tracking-tighter uppercase">{selectedLead?.full_name}</p>
                                <p className="text-xs text-blue-400 font-bold uppercase tracking-widest">{selectedLead?.email}</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <p className="text-sm text-gray-400 leading-relaxed font-medium">
                                {t('partner_dashboard.install_modal.description_before')} <strong className="text-white">{t('partner_dashboard.install_modal.free_license')}</strong> {t('partner_dashboard.install_modal.description_after')}
                            </p>
                            <div className="flex items-center gap-2 p-3 bg-white/5 border border-white/5 rounded-xl text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                <Activity className="w-3 h-3 text-blue-500" />
                                {t('partner_dashboard.install_modal.remote_installation_protocol_active')}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <Button 
                                variant="outline" 
                                onClick={() => setIsInstallModalOpen(false)} 
                                className="bg-white/5 border-white/10 hover:bg-white/10 text-white font-black py-4 rounded-xl uppercase text-[10px] tracking-widest transition-all"
                            >
                                {t('common.cancel')}
                            </Button>
                            <Button 
                                onClick={confirmInstallation} 
                                disabled={creatingLicense}
                                className="bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl uppercase text-[10px] tracking-widest shadow-lg shadow-blue-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                {creatingLicense ? (
                                    <>
                                        <RefreshCw className="w-3 h-3 animate-spin" />
                                        {t('partner_dashboard.searching')}
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-3 h-3" />
                                        {t('partner_dashboard.confirm')}
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </Modal>
            </div>
        </Layout>
    );
};

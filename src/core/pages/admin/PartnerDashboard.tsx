import React, { useState, useEffect } from 'react';
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
    Settings,
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
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { licenseService, LicenseFeature } from '../../services/licenseService';
import { supabase } from '../../services/supabase';
import { getInstallerUrl, getRegisterUrl } from '../../config/platformUrls';

export const PartnerDashboard = () => {
    const { profile, user } = useAuth();
    const [stats, setStats] = useState({ clients: 0, installations: 0 });
    const [clients, setClients] = useState<any[]>([]); // Installations
    const [leads, setLeads] = useState<any[]>([]); // Referred Profiles
    const [loading, setLoading] = useState(true);
    
    // Manage Features Modal
    const [isFeaturesModalOpen, setIsFeaturesModalOpen] = useState(false);
    const [features, setFeatures] = useState<LicenseFeature[]>([]);
    const [loadingFeatures, setLoadingFeatures] = useState(false);
    const [selectedLicenseKey, setSelectedLicenseKey] = useState<string | null>(null);
    const [selectedClientName, setSelectedClientName] = useState<string | null>(null);

    // Create/Install Modal
    const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
    const [selectedLead, setSelectedLead] = useState<any>(null);
    const [creatingLicense, setCreatingLicense] = useState(false);

    const referralLink = getRegisterUrl({ partner: user?.id });

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

                // 3. Fetch INSTALLATIONS
                const { data: instData, count: instCount } = await centralSupabase
                    .from('installations')
                    .select('id, domain, status, installed_at, account_id, license_key')
                    .eq('installed_by_partner_id', centralUserId);

                setStats({
                    clients: leadCount || 0,
                    installations: instCount || 0
                });

                if (instData) {
                    const enrichedInst = instData.map(inst => ({
                        ...inst,
                        profiles: leadData?.find(l => l.id === inst.account_id) || {
                            id: inst.account_id,
                            full_name: 'Usuário não identificado',
                            email: 'N/A'
                        }
                    }));
                    setClients(enrichedInst);
                }

                if (leadData) {
                    setLeads(leadData);
                }

            } catch (error) {
                console.error('Error fetching partner data:', error);
                toast.error('Erro ao carregar dados do parceiro');
            } finally {
                setLoading(false);
            }
        };

        fetchPartnerData();
    }, [user?.id, refreshTrigger]);

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Link copiado para a área de transferência!');
    };

    const handleViewFeatures = async (licenseKey: string, clientName: string) => {
        setSelectedLicenseKey(licenseKey);
        setSelectedClientName(clientName);
        setIsFeaturesModalOpen(true);
        setLoadingFeatures(true);
        try {
            const data = await licenseService.getLicenseFeatures(licenseKey);
            
            const defaultPatterns = [
                { key: 'UNLIMITED_DOMAINS', label: 'Domínios Ilimitados' },
                { key: 'FEATURE_PARTNER_PANEL', label: 'Painel de Parceiros' },
                { key: 'FEATURE_CRM_LEADS', label: 'CRM de Leads' }
            ];

            const mergedFeatures = defaultPatterns.map(p => {
                const existing = data.find(f => f.feature_key === p.key);
                return {
                    id: existing?.id || '',
                    license_key: licenseKey,
                    feature_key: p.key,
                    label: p.label,
                    is_enabled: existing?.is_enabled || false,
                    settings: existing?.settings || {}
                } as any;
            });

            setFeatures(mergedFeatures);
        } catch (error: any) {
            toast.error(`Erro ao carregar recursos: ${error.message}`);
        } finally {
            setLoadingFeatures(false);
        }
    };

    const handleToggleFeature = async (featureKey: string, isEnabled: boolean) => {
        if (!selectedLicenseKey) return;
        try {
            await licenseService.toggleLicenseFeature(selectedLicenseKey, featureKey, isEnabled);
            setFeatures(prev => prev.map(f => f.feature_key === featureKey ? { ...f, is_enabled: isEnabled } : f));
            toast.success('Recurso atualizado no banco central!');
        } catch (error: any) {
            toast.error(`Erro ao atualizar: ${error.message}`);
        }
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
                toast.success('Licença existente encontrada! Gerando acesso...');
                const data = await licenseService.generateInstallToken(existingLicense.key);
                if (data.token) {
                    const url = getInstallerUrl(data.token);
                    window.open(url, '_blank');
                    setIsInstallModalOpen(false);
                    return;
                }
            }

            // 2. If no license found, inform the partner
            toast.error('Nenhuma licença ativa encontrada para este lead. Peça para o cliente completar o cadastro no Portal primeiro.');
            
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
            toast.error(`Erro: ${error.message}`);
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
                                Hub do Parceiro
                            </h1>
                        </div>
                        <p className="text-gray-400 font-medium flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]"></span>
                            Gestão técnica de instalações e controle de licenças.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {/* Connection Status Indicator */}
                        <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-3 backdrop-blur-md">
                            <div className="relative">
                                <div className="w-2 h-2 bg-green-500 rounded-full" />
                                <div className="absolute inset-0 w-2 h-2 bg-green-500 rounded-full animate-ping opacity-75" />
                            </div>
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Central Online</span>
                        </div>

                        {/* Portal Financeiro Bridge */}
                        <Button 
                            variant="outline"
                            onClick={() => window.open('https://supercheckout.app/portal/billing', '_blank')}
                            className="bg-white/5 border-white/10 hover:bg-white/10 text-white rounded-2xl font-black text-xs uppercase tracking-wider group"
                        >
                            <Wallet className="w-4 h-4 mr-2 text-primary group-hover:scale-110 transition-transform" />
                            Financeiro & Comissões
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
                                <p className="text-gray-400 text-xs font-black uppercase tracking-[0.2em] mb-1">Total de Indicações</p>
                                <div className="flex items-baseline gap-2">
                                    <h2 className="text-5xl font-black text-white font-display italic tracking-tighter">{stats.clients}</h2>
                                    <span className="text-blue-500 font-bold text-xs uppercase">Leads Ativos</span>
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
                                <p className="text-gray-400 text-xs font-black uppercase tracking-[0.2em] mb-1">Instalações Ativas</p>
                                <div className="flex items-baseline gap-2">
                                    <h2 className="text-5xl font-black text-white font-display italic tracking-tighter">{stats.installations}</h2>
                                    <span className="text-purple-500 font-bold text-xs uppercase tracking-widest">Sistemas</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Quick Link Card */}
                    <div className="bg-[#0A0A12]/40 border border-white/5 rounded-[2.5rem] p-8 backdrop-blur-md flex flex-col justify-between group hover:border-white/10 transition-all">
                        <div>
                            <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest mb-4">Seu Link de Indicação</p>
                            <div className="bg-black/40 border border-white/10 rounded-2xl p-4 font-mono text-xs text-primary truncate mb-4 select-all">
                                {referralLink}
                            </div>
                        </div>
                        <Button 
                            onClick={() => copyToClipboard(referralLink)}
                            className="bg-primary hover:bg-primary-hover text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-primary/20 transition-all active:scale-95 group-hover:translate-y-[-2px]"
                        >
                            <Copy className="w-4 h-4" />
                            Copiar Acesso
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
                                <h3 className="font-black text-white uppercase italic tracking-tighter">Meus Leads</h3>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Acompanhamento de Indicações</p>
                            </div>
                        </div>
                        <span className="px-3 py-1 bg-white/5 border border-white/5 rounded-full text-[10px] font-black text-gray-400 uppercase tracking-widest">
                            {leads.length} leads
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-black/20 border-b border-white/5">
                                    <th className="px-8 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Pessoa / Contato</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Data</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] text-right">Ação Operacional</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {leads.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="px-8 py-16 text-center text-gray-600 italic text-sm">
                                            Nenhuma indicação registrada. Compartilhe seu link!
                                        </td>
                                    </tr>
                                ) : (
                                    leads.map((lead) => {
                                        const isInstalled = clients.some(c => c.profiles?.id === lead.id);
                                        return (
                                            <tr key={lead.id} className="hover:bg-white/[0.02] transition-colors group">
                                                <td className="px-8 py-6">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-gray-200 group-hover:text-white transition-colors">{lead.full_name || 'Sem nome'}</span>
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
                                                        <span className="text-xs text-gray-400 font-medium">{new Date(lead.created_at).toLocaleDateString()}</span>
                                                        <span className="text-[9px] text-gray-600 font-black uppercase tracking-widest">Registrado</span>
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
                                                            Instalar Agora
                                                        </Button>
                                                    ) : (
                                                        <div className="flex items-center justify-end gap-2 text-green-500/60 font-black text-[10px] uppercase tracking-widest italic">
                                                            <CheckCircle2 className="w-3 h-3" />
                                                            Concluído
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
                                <h3 className="font-black text-white uppercase italic tracking-tighter">Sistemas Instalados</h3>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Domínios e Licenças Ativas</p>
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-black/20 border-b border-white/5">
                                    <th className="px-8 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Domínio / Cliente</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Expira em</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] text-right">Controle</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {clients.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="px-8 py-16 text-center text-gray-600 italic text-sm">
                                            Nenhum sistema instalado.
                                        </td>
                                    </tr>
                                ) : (
                                    clients.map((client) => (
                                        <tr key={client.id} className="hover:bg-white/[0.02] transition-colors group">
                                            <td className="px-8 py-6">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-black text-white tracking-tight">{client.domain}</span>
                                                        <a href={`https://${client.domain}`} target="_blank" className="text-gray-600 hover:text-white transition-colors">
                                                            <ArrowUpRight className="w-3 h-3" />
                                                        </a>
                                                    </div>
                                                    <span className="text-[11px] text-gray-500 font-medium">{client.profiles?.full_name}</span>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6 text-xs text-gray-400">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]"></span>
                                                    Lote Vitalício
                                                </div>
                                            </td>
                                            <td className="px-8 py-6 text-right">
                                                <button
                                                    onClick={() => handleViewFeatures(client.license_key, client.profiles?.full_name)}
                                                    className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500/5 hover:bg-orange-500 text-orange-400 hover:text-white border border-orange-500/20 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest group/btn active:scale-95"
                                                >
                                                    <Zap className="w-3 h-3 group-hover/btn:animate-pulse" />
                                                    Ativar Recursos
                                                </button>
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
                            <h4 className="font-bold text-white text-sm">Proteção da Marca e Suporte</h4>
                            <p className="text-xs text-gray-400 mt-1 max-w-xl">
                                Em caso de abandono de suporte ou má conduta técnica com clientes indicados, a licença de parceiro pode ser suspensa ou revogada pela plataforma após análise.
                            </p>
                        </div>
                    </div>
                </div>

                {/* MODAL: Gerenciar Recursos (Flags) */}
                <Modal
                    isOpen={isFeaturesModalOpen}
                    onClose={() => setIsFeaturesModalOpen(false)}
                    title={`Gestão de Módulos: ${selectedClientName}`}
                >
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="bg-gradient-to-r from-orange-500/10 to-transparent border border-orange-500/20 p-5 rounded-[1.5rem] flex items-start gap-4 backdrop-blur-sm">
                            <Zap className="w-6 h-6 text-orange-400 shrink-0" />
                            <p className="text-orange-200/70 text-sm leading-relaxed font-medium">
                                Como parceiro mestre, você tem o poder de liberar módulos premium para este cliente instantaneamente.
                            </p>
                        </div>

                        {loadingFeatures ? (
                            <div className="flex flex-col items-center justify-center p-12 gap-4">
                                <RefreshCw className="w-8 h-8 animate-spin text-orange-500/40" />
                                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Sincronizando Central...</span>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {features.map((feat) => (
                                    <div key={feat.feature_key} className="flex items-center justify-between p-5 bg-white/5 border border-white/5 rounded-[1.25rem] hover:bg-white/[0.08] transition-all group">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${feat.is_enabled ? 'bg-orange-500/20 text-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.2)]' : 'bg-gray-500/10 text-gray-600'}`}>
                                                <Settings className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <div className="text-white font-black tracking-tight">{(feat as any).label}</div>
                                                <div className="text-[9px] text-gray-500 font-black uppercase tracking-widest">{feat.feature_key}</div>
                                            </div>
                                        </div>
                                        
                                        <label className="relative inline-flex items-center cursor-pointer group/toggle">
                                            <input 
                                                type="checkbox" 
                                                className="sr-only peer"
                                                checked={feat.is_enabled}
                                                onChange={(e) => handleToggleFeature(feat.feature_key, e.target.checked)}
                                            />
                                            <div className="w-12 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-6 rtl:peer-checked:after:-translate-x-6 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:start-[4px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500 shadow-inner group-hover/toggle:ring-4 group-hover/toggle:ring-orange-500/10"></div>
                                        </label>
                                    </div>
                                ))}
                            </div>
                        )}
                        <Button 
                            variant="outline" 
                            onClick={() => setIsFeaturesModalOpen(false)} 
                            className="w-full bg-white/5 border-white/10 hover:bg-white/10 text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest transition-all"
                        >
                            Concluir Gestão
                        </Button>
                    </div>
                </Modal>

                {/* MODAL: Iniciar Instalação */}
                <Modal
                    isOpen={isInstallModalOpen}
                    onClose={() => setIsInstallModalOpen(false)}
                    title="Assistente de Instalação"
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
                                Ao confirmar, o sistema irá sincronizar com o banco central para localizar a <strong className="text-white">licença gratuita</strong> deste cliente.
                            </p>
                            <div className="flex items-center gap-2 p-3 bg-white/5 border border-white/5 rounded-xl text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                <Activity className="w-3 h-3 text-blue-500" />
                                Protocolo de Instalação Remota Ativo
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <Button 
                                variant="outline" 
                                onClick={() => setIsInstallModalOpen(false)} 
                                className="bg-white/5 border-white/10 hover:bg-white/10 text-white font-black py-4 rounded-xl uppercase text-[10px] tracking-widest transition-all"
                            >
                                Cancelar
                            </Button>
                            <Button 
                                onClick={confirmInstallation} 
                                disabled={creatingLicense}
                                className="bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl uppercase text-[10px] tracking-widest shadow-lg shadow-blue-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                {creatingLicense ? (
                                    <>
                                        <RefreshCw className="w-3 h-3 animate-spin" />
                                        Buscando...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-3 h-3" />
                                        Confirmar
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

import React, { useState, useEffect } from 'react';
import { Layout } from '../../components/Layout';
import { supabase } from '../../services/supabase';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal, ConfirmModal } from '../../components/ui/Modal';
import { licenseService, License, Installation, LicenseFeature } from '../../services/licenseService';
import { usePlans } from '../../hooks/usePlans';
import {
    Search, CheckCircle, XCircle, Trash2, Shield, MoreHorizontal,
    ChevronLeft, ChevronRight, RefreshCw, AlertTriangle, Plus, Copy, Globe, Calendar, Link as LinkIcon, Layers, Settings, Zap
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';

export const SystemLicenses = () => {
    const { user } = useAuth();
    const [licenses, setLicenses] = useState<License[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);

    const { plans, loading: loadingPlans } = usePlans();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newLicense, setNewLicense] = useState({ name: '', email: '', plan: 'starter' });

    const [creating, setCreating] = useState(false);
    const [createdLicenseData, setCreatedLicenseData] = useState<{ install_url: string, license_key: string } | null>(null);

    // Installations Modal State
    const [isInstallationsModalOpen, setIsInstallationsModalOpen] = useState(false);
    const [selectedInstallations, setSelectedInstallations] = useState<Installation[]>([]);
    const [loadingInstallations, setLoadingInstallations] = useState(false);
    const [selectedLicenseKey, setSelectedLicenseKey] = useState<string | null>(null);
    const [selectedLicenseName, setSelectedLicenseName] = useState<string | null>(null);

    // Features Modal State
    const [isFeaturesModalOpen, setIsFeaturesModalOpen] = useState(false);
    const [features, setFeatures] = useState<LicenseFeature[]>([]);
    const [loadingFeatures, setLoadingFeatures] = useState(false);

    // Confirmation Modal State (Suspension/Deletion)
    const [actionModal, setActionModal] = useState<{
        isOpen: boolean;
        type: 'activate' | 'suspend' | 'delete' | null;
        licenseKey: string;
        clientName: string;
        loading: boolean;
    }>({
        isOpen: false,
        type: null,
        licenseKey: '',
        clientName: '',
        loading: false
    });

    // Debounce Search
    useEffect(() => {
        const timer = setTimeout(() => {
            setPage(1); // Reset to page 1 on search
            fetchLicenses(1, search);
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    // Pagination Change
    useEffect(() => {
        fetchLicenses(page, search);
    }, [page]);

    const fetchLicenses = async (p: number, s: string) => {
        setLoading(true);
        try {
            const res = await licenseService.list(p, s);
            setLicenses(res.data);
            setTotalPages(res.meta.totalPages || 1);
            setTotalItems(res.meta.total || res.data.length);
        } catch (error) {
            console.error('[SystemLicenses] Fetch failed:', error);
            setLicenses([]);
        } finally {
            setLoading(false);
        }
    };

    const handleAction = (lic: License, action: 'activate' | 'suspend' | 'delete') => {
        setActionModal({
            isOpen: true,
            type: action,
            licenseKey: lic.key,
            clientName: lic.client_name || lic.client_email,
            loading: false
        });
    };

    const handleConfirmAction = async () => {
        if (!actionModal.type || !actionModal.licenseKey) return;

        setActionModal(prev => ({ ...prev, loading: true }));
        try {
            await licenseService.toggleStatus(actionModal.licenseKey, actionModal.type);
            fetchLicenses(page, search); // Refresh list
            toast.success('Ação executada com sucesso!');
            setActionModal(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
            toast.error('Erro ao executar ação');
        } finally {
            setActionModal(prev => ({ ...prev, loading: false }));
        }
    };

    const handleCreateLicense = async () => {
        if (!newLicense.email || !newLicense.name) {
            toast.error('Preencha nome e e-mail');
            return;
        }

        setCreating(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                toast.error('Sessão expirada');
                return;
            }

            const result = await licenseService.createCommercial({
                name: newLicense.name,
                email: newLicense.email,
                plan: newLicense.plan,
                source: 'manual_admin'
            }, session.access_token);

            setCreatedLicenseData(result);
            setIsCreateModalOpen(false);
            setNewLicense({ name: '', email: '', plan: plans[0]?.id || 'starter' });
            fetchLicenses(1, ''); // Refresh list
            // Don't alert success, show the modal with the link
        } catch (error: any) {
            toast.error(`Erro ao criar licença: ${error.message}`);
        } finally {
            setCreating(false);
        }
    };

    const handleViewFeatures = async (license: License) => {
        setSelectedLicenseKey(license.key);
        setSelectedLicenseName(license.client_name);
        setIsFeaturesModalOpen(true);
        setLoadingFeatures(true);
        try {
            const data = await licenseService.getLicenseFeatures(license.key);
            
            // Definição dos recursos padrão se não existirem no banco para esta licença
            const defaultPatterns = [
                { key: 'UNLIMITED_DOMAINS', label: 'Domínios Ilimitados' },
                { key: 'FEATURE_PARTNER_PANEL', label: 'Painel de Parceiros' },
                { key: 'FEATURE_CRM_LEADS', label: 'CRM de Leads' }
            ];

            const mergedFeatures = defaultPatterns.map(p => {
                const existing = data.find(f => f.feature_key === p.key);
                return {
                    id: existing?.id || '',
                    license_key: license.key,
                    feature_key: p.key,
                    label: p.label, // Virtual field for UI
                    is_enabled: existing?.is_enabled || false,
                    settings: existing?.settings || {}
                } as any;
            });

            setFeatures(mergedFeatures);
        } catch (error: any) {
            console.error(error);
            toast.error(`Erro ao carregar recursos: ${error.message}`);
        } finally {
            setLoadingFeatures(false);
        }
    };

    const handleViewInstallations = async (key: string) => {
        setSelectedLicenseKey(key);
        setIsInstallationsModalOpen(true);
        setLoadingInstallations(true);
        try {
            const data = await licenseService.getInstallations(key);
            setSelectedInstallations(data);
        } catch (error: any) {
            console.error(error);
            toast.error(`Erro ao carregar instalações: ${error.message}`);
        } finally {
            setLoadingInstallations(false);
        }
    };

    const handleToggleFeature = async (featureKey: string, isEnabled: boolean) => {
        if (!selectedLicenseKey) return;
        
        try {
            await licenseService.toggleLicenseFeature(selectedLicenseKey, featureKey, isEnabled);
            setFeatures(prev => prev.map(f => f.feature_key === featureKey ? { ...f, is_enabled: isEnabled } : f));
            toast.success('Recurso atualizado com sucesso!');
        } catch (error: any) {
            toast.error(`Erro ao atualizar recurso: ${error.message}`);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copiado para a área de transferência!');
    };

    return (
        <Layout>
            <div className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-6 animate-in fade-in slide-in-from-top duration-700">
                <div>
                    <h1 className="text-4xl font-black text-white italic tracking-tighter flex items-center gap-3">
                        <Shield className="w-10 h-10 text-primary drop-shadow-[0_0_15px_rgba(138,43,226,0.5)]" />
                        SYSTEM <span className="text-primary">LICENSES</span>
                    </h1>
                    <div className="flex items-center gap-3 mt-2">
                        <span className="flex items-center gap-1.5 bg-primary/10 text-primary px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase border border-primary/20">
                           <Shield className="w-3 h-3" /> Security Protocol Active
                        </span>
                        <span className="text-gray-500 text-xs font-medium">Overlord Tier Control Plane</span>
                    </div>
                </div>
                <div className="flex gap-3">
                    <Button 
                        onClick={() => fetchLicenses(page, search)} 
                        variant="ghost" 
                        size="icon"
                        className="bg-white/5 hover:bg-white/10 border border-white/5 h-12 w-12 rounded-xl transition-all duration-300"
                    >
                        <RefreshCw className={`w-5 h-5 text-gray-400 ${loading ? 'animate-spin text-primary' : ''}`} />
                    </Button>
                    <Button 
                        onClick={() => setIsCreateModalOpen(true)}
                        className="bg-primary hover:bg-primary/90 text-white h-12 px-6 rounded-xl font-bold shadow-[0_0_20px_rgba(138,43,226,0.3)] transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
                    >
                        <Plus className="w-5 h-5" /> Nova Licença
                    </Button>
                </div>
            </div>

            {/* Search Bar Pod */}
            <div className="mb-8 animate-in fade-in slide-in-from-bottom duration-700 delay-100">
                <div className="relative group">
                    <div className="absolute inset-0 bg-primary/5 blur-2xl rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity duration-700" />
                    <Card className="relative p-1.5 bg-[#0A0A15]/60 backdrop-blur-2xl border-white/5 rounded-2xl overflow-hidden">
                        <div className="relative flex items-center">
                            <Search className="absolute left-4 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-colors" />
                            <input
                                type="text"
                                placeholder="Scan licenses by name, email or hash..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full bg-transparent border-none rounded-xl pl-12 pr-4 py-4 text-white placeholder:text-gray-600 focus:ring-0 outline-none transition-all font-medium"
                            />
                            {loading && (
                                <div className="absolute right-4">
                                    <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
            </div>


            {/* Table / Managed Assets Grid */}
            <div className="animate-in fade-in slide-in-from-bottom duration-700 delay-200">
                <Card className="overflow-hidden bg-[#0A0A15]/40 backdrop-blur-2xl border-white/5 rounded-[2.5rem]">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-gray-400">
                            <thead className="bg-white/[0.02] text-gray-300 font-bold uppercase tracking-widest text-[10px]">
                                <tr>
                                    <th className="pl-8 pr-4 py-6">Identity Protocol</th>
                                    <th className="px-4 py-6">Tier Status</th>
                                    <th className="px-4 py-6">Network Point</th>
                                    <th className="px-4 py-6 text-center">Status</th>
                                    <th className="pl-4 pr-8 py-6 text-right">Command Control</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} className="p-20 text-center">
                                            <div className="flex flex-col items-center gap-4">
                                                <div className="relative">
                                                    <div className="w-12 h-12 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                                                    <Shield className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 text-primary" />
                                                </div>
                                                <span className="text-gray-500 font-medium animate-pulse">Scanning Grid Infrastructure...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : licenses.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-20 text-center">
                                            <div className="flex flex-col items-center gap-4 opacity-20">
                                                <Shield className="w-16 h-16" />
                                                <span className="text-xl font-bold tracking-tighter italic">NO ASSETS DETECTED</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    licenses.map((lic) => (
                                        <tr key={lic.key} className="group hover:bg-primary/[0.02] transition-all duration-300">
                                            <td className="pl-8 pr-4 py-6">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 group-hover:border-primary/20 transition-colors">
                                                        <Shield className="w-5 h-5 text-gray-500 group-hover:text-primary transition-colors" />
                                                    </div>
                                                    <div>
                                                        <div className="text-white font-black italic tracking-tight text-lg leading-tight uppercase underline decoration-primary/30 decoration-2 underline-offset-4 group-hover:decoration-primary transition-all">
                                                            {lic.client_name || 'ANONYMOUS'}
                                                        </div>
                                                        <div className="text-xs text-gray-500 flex items-center gap-1 mt-1 font-medium">
                                                            {lic.client_email}
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-2 opacity-50 group-hover:opacity-100 transition-opacity">
                                                            <code className="text-[9px] font-mono bg-black/40 px-2 py-0.5 rounded-full border border-white/5 text-gray-400">
                                                                {lic.key.substring(0, 12)}...
                                                            </code>
                                                            <button 
                                                                onClick={() => copyToClipboard(lic.key)}
                                                                className="text-gray-500 hover:text-white transition-colors"
                                                            >
                                                                <Copy className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-6">
                                                <div className="flex flex-col gap-1.5">
                                                    <span className={`w-fit px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                                                        lic.plan.includes('enterprise') || lic.plan.includes('master')
                                                            ? 'bg-purple-500/10 text-purple-400 border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.1)]'
                                                            : lic.plan.includes('commercial') || lic.plan.includes('agency')
                                                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                                                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                    }`}>
                                                        {lic.plan}
                                                    </span>
                                                    <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-bold uppercase tracking-tight pl-1">
                                                        <Globe className="w-3 h-3" />
                                                        {lic.max_instances > 900000 ? 'Unlimited Nodes' : `${lic.max_instances} Max Nodes`}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-6">
                                                {lic.current_domain ? (
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-xs font-mono text-white/90 group-hover:text-primary transition-colors">
                                                            {lic.current_domain}
                                                        </span>
                                                        <span className="text-[10px] text-gray-600 font-medium">Active Endpoint</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-700 italic text-xs">Waiting Deployment...</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-6 text-center">
                                                {lic.status === 'active' ? (
                                                    <div className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-500 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tighter border border-emerald-500/20">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                                                        Operational
                                                    </div>
                                                ) : (
                                                    <div className="inline-flex items-center gap-2 bg-red-500/10 text-red-500 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tighter border border-red-500/20">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                                                        Suspended
                                                    </div>
                                                )}
                                            </td>
                                            <td className="pl-4 pr-8 py-6 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button 
                                                        size="sm" 
                                                        variant="ghost" 
                                                        className="h-10 w-10 bg-white/5 hover:bg-white/10 hover:text-primary border border-white/5 disabled:opacity-50"
                                                        onClick={() => handleViewFeatures(lic)}
                                                        title="Manage Resources"
                                                    >
                                                        <Zap className="w-4 h-4" />
                                                    </Button>
                                                    <Button 
                                                        size="sm" 
                                                        variant="ghost" 
                                                        className="h-10 w-10 bg-white/5 hover:bg-white/10 hover:text-blue-400 border border-white/5"
                                                        onClick={() => handleViewInstallations(lic.key)}
                                                        title="Monitoring Nodes"
                                                    >
                                                        <Layers className="w-4 h-4" />
                                                    </Button>
                                                    <div className="h-6 w-px bg-white/10 mx-1" />
                                                    
                                                    {lic.status === 'active' ? (
                                                        <Button 
                                                            size="sm" 
                                                            variant="outline" 
                                                            className="h-9 px-4 border-orange-500/30 hover:bg-orange-500/10 text-orange-400 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all"
                                                            onClick={() => handleAction(lic, 'suspend')}
                                                        >
                                                            Suspend
                                                        </Button>
                                                    ) : (
                                                        <Button 
                                                            size="sm" 
                                                            variant="outline" 
                                                            className="h-9 px-4 border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all"
                                                            onClick={() => handleAction(lic, 'activate')}
                                                        >
                                                            Restore
                                                        </Button>
                                                    )}
                                                    <Button 
                                                        size="icon" 
                                                        variant="ghost" 
                                                        className="h-9 w-9 text-gray-600 hover:text-red-500 hover:bg-red-500/5 transition-all"
                                                        onClick={() => handleAction(lic, 'delete')}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination - Portal Style */}
                    <div className="p-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white/[0.01]">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                            Showing <span className="text-white">{(page - 1) * 10 + 1} — {Math.min(page * 10, totalItems)}</span> of <span className="text-primary">{totalItems}</span> protocols
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={page === 1}
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                className="bg-white/5 hover:bg-white/10 text-white disabled:opacity-20 h-10 px-4 rounded-xl font-bold text-xs uppercase tracking-tighter"
                            >
                                <ChevronLeft className="w-4 h-4 mr-1" /> Prev
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={page >= totalPages}
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                className="bg-white/5 hover:bg-white/10 text-white disabled:opacity-20 h-10 px-4 rounded-xl font-bold text-xs uppercase tracking-tighter"
                            >
                                Next <ChevronRight className="w-4 h-4 ml-1" />
                            </Button>
                        </div>
                    </div>
                </Card>
            </div>
    
            {/* Create License Modal */}
            <Modal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                title="CONTRATAR NOVA LICENÇA"
            >
                <div className="space-y-6">
                    <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl flex items-center gap-4 animate-in zoom-in duration-500">
                        <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                            <Plus className="w-6 h-6 text-primary" />
                        </div>
                        <p className="text-xs text-primary/80 font-bold leading-relaxed uppercase tracking-tighter">
                            Gerando ativos comerciais autorizados. Preencha os protocolos de identificação abaixo.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div className="group">
                            <label className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-widest pl-1">Identidade do Cliente</label>
                            <input
                                type="text"
                                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white outline-none focus:border-primary focus:bg-white/[0.08] transition-all font-medium"
                                value={newLicense.name}
                                onChange={(e) => setNewLicense({ ...newLicense, name: e.target.value })}
                                placeholder="NOME COMPLETO OU RAZÃO"
                            />
                        </div>
                        <div className="group">
                            <label className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-widest pl-1">Protocolo de Comunicação (E-mail)</label>
                            <input
                                type="email"
                                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white outline-none focus:border-primary focus:bg-white/[0.08] transition-all font-medium"
                                value={newLicense.email}
                                onChange={(e) => setNewLicense({ ...newLicense, email: e.target.value })}
                                placeholder="CLIENTE@EMAIL.COM"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-gray-500 mb-3 uppercase tracking-widest pl-1">Nível de Acesso (Tier Plan)</label>
                        <div className="grid grid-cols-1 gap-3">
                            {loadingPlans ? (
                                <div className="p-8 text-center text-gray-600 animate-pulse font-bold tracking-tighter">SYNCHRONIZING TIERS...</div>
                            ) : (
                                plans.map((plan) => (
                                    <div
                                        key={plan.id}
                                        onClick={() => setNewLicense({ ...newLicense, plan: plan.id })}
                                        className={`group relative p-4 rounded-xl border cursor-pointer transition-all overflow-hidden ${
                                            newLicense.plan === plan.id
                                                ? 'bg-primary/10 border-primary shadow-[0_0_20px_rgba(138,43,226,0.15)]'
                                                : 'bg-white/5 border-white/5 hover:border-white/20'
                                        }`}
                                    >
                                        {newLicense.plan === plan.id && (
                                            <div className="absolute top-0 right-0 w-20 h-20 -mr-6 -mt-6 bg-primary/20 blur-2xl rounded-full" />
                                        )}
                                        <div className="relative flex justify-between items-center">
                                            <div>
                                                <div className={`font-black italic text-lg tracking-tight uppercase transition-colors ${
                                                    newLicense.plan === plan.id ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'
                                                }`}>
                                                    {plan.label}
                                                </div>
                                                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mt-0.5">
                                                    {plan.maxInstallations > 900000 ? 'Unlimited Node Infrastructure' : `Max Nodes: ${plan.maxInstallations}`}
                                                </div>
                                            </div>
                                            <div className={`text-xl font-black italic tracking-tighter transition-colors ${
                                                newLicense.plan === plan.id ? 'text-primary' : 'text-gray-600'
                                            }`}>
                                                {plan.price}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="pt-4 flex gap-3">
                        <Button 
                            variant="ghost" 
                            onClick={() => setIsCreateModalOpen(false)} 
                            className="flex-1 bg-white/5 hover:bg-white/10 text-white rounded-xl h-12 font-bold text-xs uppercase tracking-widest"
                        >
                            Abortar
                        </Button>
                        <Button 
                            onClick={handleCreateLicense} 
                            disabled={creating} 
                            className="flex-1 bg-primary hover:bg-primary/90 text-white rounded-xl h-12 font-bold text-xs uppercase tracking-widest shadow-[0_0_20px_rgba(138,43,226,0.3)] transition-all"
                        >
                            {creating ? (
                                <div className="flex items-center gap-2">
                                    <RefreshCw className="w-4 h-4 animate-spin" /> EXECUTANDO...
                                </div>
                            ) : 'Gerar Licença'}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Installations List Modal */}
            <Modal
                isOpen={isInstallationsModalOpen}
                onClose={() => setIsInstallationsModalOpen(false)}
                title="MONITORAMENTO DE NÓS"
            >
                <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl animate-in fade-in duration-500">
                        <div>
                            <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Target Protocol</div>
                            <code className="text-primary font-bold">{selectedLicenseKey}</code>
                        </div>
                        <div className="p-3 rounded-xl bg-primary/10">
                            <Globe className="w-5 h-5 text-primary" />
                        </div>
                    </div>

                    {loadingInstallations ? (
                        <div className="flex flex-col items-center justify-center p-12 gap-4">
                            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Scanning Network...</span>
                        </div>
                    ) : selectedInstallations.length === 0 ? (
                        <div className="text-center p-12 border-2 border-dashed border-white/5 rounded-[2rem] bg-white/[0.02]">
                            <Globe className="w-12 h-12 text-gray-700 mx-auto mb-4 opacity-50" />
                            <div className="text-xl font-bold text-gray-600 italic tracking-tighter uppercase">No Active Nodes Detected</div>
                            <p className="text-xs text-gray-500 mt-2 font-medium">This license has not been deployed to any endpoint yet.</p>
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                            {selectedInstallations.map((inst) => (
                                <div key={inst.id} className="group bg-[#0A0A15]/40 border border-white/5 p-4 rounded-2xl flex items-center justify-between hover:bg-white/[0.05] hover:border-white/10 transition-all duration-300">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                                            <Globe className="w-4 h-4 text-primary" />
                                        </div>
                                        <div>
                                            <div className="text-white font-bold tracking-tight text-sm group-hover:text-primary transition-colors">
                                                {inst.domain}
                                            </div>
                                            <div className="flex items-center gap-3 mt-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-tighter">
                                                <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-gray-600" /> {new Date(inst.installed_at).toLocaleDateString()}</span>
                                                <span className={`px-2 py-0.5 rounded-full border shadow-sm ${
                                                    inst.status === 'active' 
                                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                                        : 'bg-red-500/10 text-red-400 border-red-500/20'
                                                }`}>
                                                    {inst.status}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <a
                                        href={`https://${inst.domain}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="h-10 w-10 flex items-center justify-center bg-white/5 hover:bg-primary hover:text-white rounded-xl text-gray-500 transition-all"
                                        title="Access Point"
                                    >
                                        <LinkIcon className="w-4 h-4" />
                                    </a>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="pt-4 flex justify-end">
                        <Button 
                            variant="ghost" 
                            onClick={() => setIsInstallationsModalOpen(false)}
                            className="bg-white/5 hover:bg-white/10 text-white rounded-xl px-8 h-12 font-bold text-xs uppercase tracking-widest"
                        >
                            Fechar
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Features Management Modal */}
            <Modal
                isOpen={isFeaturesModalOpen}
                onClose={() => setIsFeaturesModalOpen(false)}
                title="PROTOCOLO DE RECURSOS"
            >
                <div className="space-y-6">
                    <div className="bg-primary/5 border border-primary/20 p-5 rounded-2xl flex items-start gap-4">
                        <div className="p-3 bg-primary/20 rounded-xl">
                            <Settings className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h4 className="text-white font-black italic tracking-tighter uppercase text-sm">Overdose Access Sync</h4>
                            <p className="text-xs text-primary/70 mt-1 font-medium leading-relaxed">
                                Sincronize módulos e capacidades de processamento remotamente. Estas definições sobrepõem as travas locais do nó cliente.
                            </p>
                        </div>
                    </div>

                    {loadingFeatures ? (
                        <div className="flex flex-col items-center justify-center p-12 gap-4">
                            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Hydrating Configs...</span>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {features.map((feat) => (
                                <div key={feat.feature_key} className="group flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/[0.08] hover:border-white/10 transition-all duration-300">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                                            feat.is_enabled ? 'bg-primary/20 text-primary shadow-[0_0_15px_rgba(138,43,226,0.2)]' : 'bg-gray-500/5 text-gray-700'
                                        }`}>
                                            <Zap className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <div className="text-white font-black italic tracking-tight uppercase group-hover:text-primary transition-colors">
                                                {(feat as any).label}
                                            </div>
                                            <div className="text-[10px] font-mono text-gray-600 tracking-tighter mt-0.5">
                                                ID: {feat.feature_key}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            className="sr-only peer"
                                            checked={feat.is_enabled}
                                            onChange={(e) => handleToggleFeature(feat.feature_key, e.target.checked)}
                                        />
                                        <div className="w-14 h-7 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:start-[4px] after:bg-white after:rounded-full after:h-[20px] after:w-[20px] after:transition-all peer-checked:bg-primary shadow-inner"></div>
                                    </label>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="pt-6 border-t border-white/5 flex justify-end">
                        <Button 
                            variant="ghost" 
                            onClick={() => setIsFeaturesModalOpen(false)}
                            className="bg-white/5 hover:bg-white/10 text-white rounded-xl px-10 h-12 font-bold text-xs uppercase tracking-widest"
                        >
                            Confirmar Protocolo
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Success Modal with Link */}
            <Modal
                isOpen={!!createdLicenseData}
                onClose={() => setCreatedLicenseData(null)}
                title="ATIVO GERADO COM SUCESSO"
            >
                <div className="space-y-6">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 text-emerald-400 text-sm flex flex-col items-center text-center gap-4 animate-in zoom-in duration-700">
                        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                            <CheckCircle className="w-8 h-8" />
                        </div>
                        <div>
                            <h3 className="font-black italic text-xl uppercase tracking-tighter text-white">License Protocol Ready</h3>
                            <p className="text-emerald-500/70 font-bold text-xs uppercase tracking-tight mt-1">O token de implantação foi ativado e expira em 60 minutos.</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="group">
                            <label className="block text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest pl-1">Deployment Access (Send to Client)</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    readOnly
                                    value={createdLicenseData?.install_url || ''}
                                    className="w-full bg-[#0A0A15]/60 border border-white/5 rounded-2xl pl-4 pr-14 py-4 text-primary font-mono text-xs shadow-inner"
                                />
                                <Button 
                                    onClick={() => copyToClipboard(createdLicenseData?.install_url || '')} 
                                    variant="ghost" 
                                    size="icon"
                                    className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 bg-white/5 hover:bg-white/10 rounded-xl text-white transition-all shadow-sm"
                                >
                                    <Copy className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                        <div className="group">
                            <label className="block text-[10px] font-black text-gray-500 mb-2 uppercase tracking-widest pl-1">Security Hash (License Key)</label>
                            <div className="relative">
                                <code className="w-full bg-[#0A0A15]/60 border border-white/5 rounded-2xl pl-4 pr-14 py-4 text-white font-mono text-xs block truncate shadow-inner">
                                    {createdLicenseData?.license_key}
                                </code>
                                <Button 
                                    onClick={() => copyToClipboard(createdLicenseData?.license_key || '')} 
                                    variant="ghost" 
                                    size="icon"
                                    className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 bg-white/5 hover:bg-white/10 rounded-xl text-white transition-all shadow-sm"
                                >
                                    <Copy className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <Button 
                            variant="ghost" 
                            onClick={() => {
                                const url = createdLicenseData?.install_url;
                                if (url) window.open(url, '_blank');
                            }}
                            className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl px-6 h-12 font-bold text-xs uppercase tracking-widest transition-all"
                        >
                            Open Installer
                        </Button>
                        <Button 
                            onClick={() => setCreatedLicenseData(null)}
                            className="bg-white/5 hover:bg-white/10 text-white rounded-xl px-8 h-12 font-bold text-xs uppercase tracking-widest"
                        >
                            Fechar Portal
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Action Confirmation Modal */}
            <ConfirmModal
                isOpen={actionModal.isOpen}
                onClose={() => setActionModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={handleConfirmAction}
                loading={actionModal.loading}
                title={
                    actionModal.type === 'delete' ? 'DANGER: PERMANENT DELETION' :
                    actionModal.type === 'suspend' ? 'PROTOCOL SUSPENSION' : 'PROTOCOL RESTORATION'
                }
                message={
                    actionModal.type === 'delete' 
                        ? `Tem certeza que deseja EXCUTAR a exclusão permanente dos ativos de ${actionModal.clientName}? Esta operação é IRREVERSÍVEL e causará colapso imediato dos nós dependentes.`
                        : actionModal.type === 'suspend'
                            ? `Confirmar suspensão imediata de identificação para ${actionModal.clientName}. O acesso a todos os serviços será bloqueado.`
                            : `Restaurar autorização e fluxo de dados para ${actionModal.clientName}.`
                }
                confirmText={
                    actionModal.type === 'delete' ? 'Confirmar Exclusão' :
                    actionModal.type === 'suspend' ? 'Confirmar Suspensão' : 'Restaurar Acesso'
                }
                variant={
                    actionModal.type === 'delete' ? 'danger' :
                    actionModal.type === 'suspend' ? 'warning' : 'primary'
                }
            />
        </Layout>
    );
};

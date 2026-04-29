import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Layout } from '../../components/Layout';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmModal } from '../../components/ui/Modal';
import { Key, Plus, Copy, CheckCircle, ShieldCheck, Server, AlertTriangle, Loader2, Globe, RefreshCw, Trash2, Activity, HardDrive, Shield, ChevronRight, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { supabase } from '../../services/supabase';

interface Installation {
    id: string;
    domain: string;
    installed_at: string;
    status: 'active' | 'inactive' | 'revoked';
}

interface MyLicense {
    key?: string; // License key
    plan: string;
    max_installations: number;
    used_installations: number;
    status: 'active' | 'suspended';
    expires_at: string | null;
    installations: Installation[];
}

const normalizeConfigValue = (value: any): string | null => {
    if (!value) return null;
    return String(typeof value === 'string' ? value : value.value || value)
        .replace(/^"|"$/g, '')
        .trim() || null;
};

const getCurrentDomain = () => {
    if (typeof window === 'undefined') return 'local';
    return window.location.hostname || window.location.host || 'local';
};

const normalizeInstallation = (row: any, fallbackInstallationId?: string | null): Installation => ({
    id: String(row?.installation_id || row?.id || fallbackInstallationId || 'local-installation'),
    domain: String(row?.domain || getCurrentDomain()),
    installed_at: String(row?.installed_at || row?.created_at || row?.activated_at || row?.last_check_in || new Date().toISOString()),
    status: row?.status === 'inactive' || row?.status === 'revoked' ? row.status : 'active'
});

export const Licenses = () => {
    const { t, i18n } = useTranslation(['admin', 'common', 'portal']);
    const { user, account, profile } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [license, setLicense] = useState<MyLicense | null>(null);
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const [revokeModal, setRevokeModal] = useState<{ isOpen: boolean; installationId: string; domain: string }>({
        isOpen: false,
        installationId: '',
        domain: ''
    });

    // Local state for role and installation ID
    const [localRole, setLocalRole] = useState<string | null>(null);
    const [localInstallationId, setLocalInstallationId] = useState<string | null>(null);

    useEffect(() => {
        fetchMyLicense();
    }, []);



    const fetchLocalDetails = async (): Promise<{ role: string | null; installationId: string | null; validation: any | null }> => {
        let role: string | null = null;
        let installationId: string | null = null;
        let validation: any | null = null;

        try {
            // 1. Try to get Installation ID directly from DB (Most Reliable for Admin)
            const { data: configData } = await supabase
                .from('app_config')
                .select('value')
                .eq('key', 'installation_id')
                .maybeSingle();

            if (configData?.value) {
                installationId = normalizeConfigValue(configData.value);
                setLocalInstallationId(installationId);
            }

            // 2. Fetch local validation to get role (and fallback ID)
            const res = await fetch('/api/licenses/validate');
            validation = await res.json();

            if (validation.valid) {
                if (validation.role) {
                    role = validation.role;
                    setLocalRole(role);
                    localStorage.setItem('license_role', role);
                }
                // If DB fetch failed but API succeed (rare), use API ID
                if (validation.installation_id && !installationId) {
                    installationId = validation.installation_id;
                    setLocalInstallationId(installationId);
                }
            }
        } catch (e) {
            console.error('Failed to fetch local details', e);
        }

        return { role, installationId, validation };
    };

    const fetchLocalLicense = async (): Promise<MyLicense | null> => {
        const { installationId, validation } = await fetchLocalDetails();

        const { data: localLicense, error: licenseError } = await supabase
            .from('licenses')
            .select('*')
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (licenseError) {
            console.warn('Local license lookup failed:', licenseError.message);
        }

        const sourceLicense = localLicense || validation?.license;
        if (!sourceLicense) return null;

        let installationRows: any[] = [];
        if (sourceLicense.key) {
            const { data, error } = await supabase
                .from('installations')
                .select('*')
                .eq('license_key', sourceLicense.key)
                .order('installed_at', { ascending: false });

            if (error) {
                console.warn('Local installations lookup failed:', error.message);
            } else {
                installationRows = data || [];
            }
        }

        const fallbackInstallation = normalizeInstallation({
            installation_id: installationId || validation?.installation_id,
            domain: sourceLicense.allowed_domain || getCurrentDomain(),
            installed_at: sourceLicense.activated_at || sourceLicense.created_at,
            status: 'active'
        }, installationId || validation?.installation_id);

        const installations = installationRows.length > 0
            ? installationRows.map(row => normalizeInstallation(row, installationId || validation?.installation_id))
            : [fallbackInstallation];

        const activeInstallations = installations.filter(inst => inst.status === 'active').length;
        const maxInstallations = Number(sourceLicense.max_installations ?? sourceLicense.max_instances ?? 1);

        return {
            key: sourceLicense.key,
            plan: sourceLicense.plan || 'free',
            max_installations: maxInstallations > 0 ? maxInstallations : 1,
            used_installations: activeInstallations || installations.length,
            status: sourceLicense.status === 'suspended' ? 'suspended' : 'active',
            expires_at: sourceLicense.expires_at || null,
            installations
        };
    };

    const fetchMyLicense = async () => {
        setLoading(true);
        setError(null);
        let localSnapshot: MyLicense | null = null;
        try {
            localSnapshot = await fetchLocalLicense();
            if (localSnapshot) {
                setLicense(localSnapshot);
                return;
            }

            if (!user || !user.email) {
                throw new Error(t('invalid_session_email'));
            }

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error(t('common.session_expired'));

            const response = await fetch('/api/central/get-license-status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    email: user.email
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || `${t('fetch_license_failed')} (${response.status})`);
            }

            const data = await response.json();

            // Enforce White Label Limits on Client Side
            if (account?.plan_type === 'free' && profile?.role !== 'admin') {
                data.max_installations = 1;
                data.plan = 'Free Tier';
            }

            setLicense(data);
        } catch (error: any) {
            console.error('Erro ao buscar licença:', error);
            if (localSnapshot) {
                setLicense(localSnapshot);
            } else {
                setError(error.message || t('unknown_license_error'));
            }
        } finally {
            setLoading(false);
        }
    };


    const handleRevoke = async (installationId: string, domain: string) => {
        setRevokeModal({ isOpen: true, installationId, domain });
    };

    const confirmRevoke = async () => {
        if (!license) return;
        const { installationId, domain } = revokeModal;

        setRevokingId(installationId);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session || !session.user.email) {
                toast.error(t('common.session_expired_login'));
                return;
            }

            if (!localInstallationId) {
                toast.error(t('local_id_error'));
                return;
            }

            const response = await fetch('/api/central/manage-licenses', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    action: 'revoke_installation',
                    email: session.user.email,
                    installation_id: installationId,
                    requestor_installation_id: localInstallationId
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || err.message || t('revoke_error'));
            }

            await fetchMyLicense();
            toast.success(t('revoke_success'));

        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setRevokingId(null);
            setRevokeModal({ isOpen: false, installationId: '', domain: '' });
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    if (loading) {
        return (
            <Layout>
                <div className="flex flex-col items-center justify-center h-[70vh] space-y-8">
                    <div className="relative">
                        <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse" />
                        <Loader2 className="relative w-16 h-16 animate-spin text-primary" />
                    </div>
                    <div className="text-center space-y-2">
                        <p className="text-[10px] text-primary font-black uppercase tracking-[0.4em] animate-pulse">Initializing Protocol</p>
                        <p className="text-sm text-gray-500 font-medium italic">{t('loading_license')}</p>
                    </div>
                </div>
            </Layout>
        );
    }

    if (error) {
        return (
            <Layout>
                <div className="flex flex-col items-center justify-center h-[70vh] text-center p-6 space-y-10">
                    <div className="relative group">
                        <div className="absolute inset-0 bg-rose-500/20 blur-3xl rounded-full group-hover:bg-rose-500/30 transition-all duration-1000" />
                        <div className="relative w-24 h-24 bg-[#0A0A15] border-2 border-rose-500/20 rounded-[2rem] flex items-center justify-center text-rose-500 shadow-2xl">
                            <AlertTriangle className="w-12 h-12 animate-bounce" />
                        </div>
                    </div>
                    <div className="space-y-4 max-w-md">
                        <h2 className="text-3xl font-portal-display text-white italic font-black uppercase tracking-tighter">{t('error_loading_license')}</h2>
                        <p className="text-sm text-gray-500 font-medium leading-relaxed italic">{error}</p>
                    </div>
                    <Button 
                        onClick={fetchMyLicense} 
                        className="h-16 px-12 rounded-2xl bg-white/5 border border-white/10 text-white hover:bg-white/10 font-black uppercase tracking-widest flex items-center gap-3 transition-all active:scale-95 shadow-xl"
                    >
                        <RefreshCw className="w-4 h-4" /> {t('try_again')}
                    </Button>
                </div>
            </Layout>
        );
    }

    if (!license) return null;

    if (localRole === 'client') {
        return (
            <Layout>
                <div className="space-y-12 pb-24 max-w-6xl mx-auto px-4 md:px-0">
                    {/* Tactical Restricted Header */}
                    <div className="relative p-8 lg:p-12 rounded-[2.5rem] bg-[#0A0A15] border border-white/5 overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-1000">
                        <div className="absolute top-0 right-0 w-80 h-80 bg-primary/10 blur-[120px] -translate-y-1/2 translate-x-1/2 opacity-50" />
                        <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/5 blur-[100px] translate-y-1/2 -translate-x-1/2 opacity-30" />
                        
                        <div className="relative z-20 flex flex-col lg:flex-row lg:items-end justify-between gap-10">
                            <div className="space-y-6">
                                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-[0.3em] animate-pulse">
                                    <ShieldCheck className="w-3.5 h-3.5" /> Security Protocol
                                </div>
                                <div>
                                    <h1 className="text-4xl lg:text-6xl font-portal-display text-white tracking-tighter italic leading-none mb-6 uppercase">
                                        MY <span className="text-primary font-black">LICENSE</span>
                                    </h1>
                                    <p className="text-sm text-gray-400 font-medium max-w-2xl leading-relaxed italic border-l-2 border-primary/20 pl-6">
                                        Você está visualizando uma instância gerenciada. As chaves criptográficas e infraestrutura são administradas pelo protocolo Master da sua agência.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 px-6 py-4 rounded-[1.5rem] bg-white/[0.02] border border-white/5">
                                <Activity className="w-5 h-5 text-emerald-500" />
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Status</span>
                                    <span className="text-[11px] font-black text-emerald-500 uppercase tracking-tighter italic">Client Node Active</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <Card className="relative p-10 lg:p-12 border border-white/5 backdrop-blur-3xl bg-[#0A0A15]/80 overflow-hidden group rounded-[2.5rem]">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-[60px] -translate-y-1/2 translate-x-1/2 group-hover:bg-primary/20 transition-all duration-700" />
                            <div className="relative z-10 flex items-center gap-8">
                                <div className="w-20 h-20 rounded-[2rem] bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
                                    <Key className="w-10 h-10" />
                                </div>
                                <div className="space-y-2">
                                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.3em]">Plan Discovery</p>
                                    <h3 className="text-3xl font-portal-display text-white italic tracking-tighter uppercase font-black">{license.plan}</h3>
                                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[9px] font-black uppercase tracking-widest w-fit">
                                        <CheckCircle className="w-3 h-3" /> Fully Integrated
                                    </div>
                                </div>
                            </div>
                        </Card>

                        <Card className="relative p-10 lg:p-12 border border-white/5 backdrop-blur-3xl bg-[#0A0A15]/80 flex flex-col justify-center items-center text-center overflow-hidden group rounded-[2.5rem]">
                            <ShieldCheck className="w-16 h-16 text-gray-800/30 mb-6 group-hover:scale-110 transition-transform duration-700" />
                            <h3 className="text-xl font-portal-display text-white mb-3 italic font-black uppercase tracking-tighter">{t('restricted_management')}</h3>
                            <p className="text-sm text-gray-500 font-medium leading-relaxed italic max-w-sm">
                                {t('agency_managed_desc')}
                            </p>
                        </Card>
                    </div>
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div className="space-y-12 pb-24 max-w-6xl mx-auto px-4 md:px-0">
                {/* Tactical Owner Header */}
                <div className="relative p-8 lg:p-12 rounded-[2.5rem] bg-[#0A0A15] border border-white/5 overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-1000">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-primary/10 blur-[120px] -translate-y-1/2 translate-x-1/2 opacity-50" />
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/5 blur-[100px] translate-y-1/2 -translate-x-1/2 opacity-30" />
                    
                    <div className="relative z-20 flex flex-col lg:flex-row lg:items-end justify-between gap-10">
                        <div className="space-y-6">
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-[0.3em] animate-pulse">
                                <Shield className="w-3.5 h-3.5" /> Security Dashboard
                            </div>
                            <div>
                                <h1 className="text-4xl lg:text-6xl font-portal-display text-white tracking-tighter italic leading-none mb-6 uppercase">
                                    LICENSING <span className="text-primary font-black">PROTOCOL</span>
                                </h1>
                                <p className="text-sm text-gray-500 font-medium max-w-2xl leading-relaxed italic border-l-2 border-primary/20 pl-6">
                                    {t('manage_installations_desc')} Gerencie seus clusters de instalação e monitore a integridade dos nós distribuídos.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-4 px-6 py-4 rounded-[1.5rem] bg-white/[0.02] border border-white/5 group/item hover:border-primary/30 transition-all duration-500">
                                <Activity className="w-5 h-5 text-primary" />
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Protocol</span>
                                    <span className="text-[11px] font-black text-white uppercase tracking-tighter italic">v1.1 Owner</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Card 01: License Authority */}
                    <Card className="relative p-10 lg:p-12 border border-white/5 backdrop-blur-3xl bg-[#0A0A15]/80 overflow-hidden group rounded-[2.5rem]">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-[60px] -translate-y-1/2 translate-x-1/2 group-hover:bg-primary/20 transition-all duration-700" />
                        <div className="relative z-10 space-y-8">
                            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
                                <Key className="w-8 h-8" />
                            </div>
                            <div>
                                <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.3em] mb-2">{t('plan_current')}</p>
                                <h3 className="text-3xl font-portal-display text-white italic tracking-tighter uppercase font-black truncate">
                                    {(user?.email === 'contato.jeandamin@gmail.com' || license.plan === 'lifetime' || profile?.role === 'admin') ? t('plan_owner_lifetime') : license.plan}
                                </h3>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[9px] font-black uppercase tracking-widest w-fit">
                                <CheckCircle className="w-3.5 h-3.5" /> Protocol Active
                            </div>
                        </div>
                    </Card>

                    {/* Card 02: Node Capacity */}
                    <Card className="relative p-10 lg:p-12 border border-white/5 backdrop-blur-3xl bg-[#0A0A15]/80 overflow-hidden group rounded-[2.5rem]">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-[60px] -translate-y-1/2 translate-x-1/2 group-hover:bg-blue-500/20 transition-all duration-700" />
                        <div className="relative z-10 space-y-8">
                            <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shadow-inner">
                                <HardDrive className="w-8 h-8" />
                            </div>
                            <div>
                                <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.3em] mb-2">{t('installations_label')}</p>
                                <h3 className="text-4xl font-portal-display text-white italic tracking-tighter font-black">
                                    {license.used_installations} 
                                    <span className="text-gray-700 text-lg font-medium ml-2 uppercase">
                                        {(user?.email === 'contato.jeandamin@gmail.com' || license.max_installations > 900000 || profile?.role === 'admin') ? `/ ${t('unlimited')}` : `/ ${license.max_installations}`}
                                    </span>
                                </h3>
                            </div>
                            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                                <div
                                    className="h-full bg-gradient-to-r from-blue-600 to-primary transition-all duration-1000 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                                    style={{ width: `${(user?.email === 'contato.jeandamin@gmail.com' || license.max_installations > 900000 || profile?.role === 'admin') ? '5%' : Math.min(100, (license.used_installations / license.max_installations) * 100)}%` }}
                                />
                            </div>
                        </div>
                    </Card>

                    {/* Card 03: Deployment Policy */}
                    <Card className="relative p-10 lg:p-12 border border-white/5 backdrop-blur-3xl bg-[#0A0A15]/80 overflow-hidden group rounded-[2.5rem]">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 blur-[60px] -translate-y-1/2 translate-x-1/2 group-hover:bg-purple-500/10 transition-all duration-700" />
                        <div className="relative z-10 flex flex-col h-full justify-between gap-8">
                            <div>
                                <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-4 flex items-center gap-2">
                                    <Shield className="w-3.5 h-3.5 text-primary" /> {t('secure_installer')}
                                </h3>
                                <p className="text-xs text-gray-600 leading-relaxed font-medium italic">
                                    {t('installer_centralized_desc', { defaultValue: 'Geração de novos nós restrita ao Portal de Licenciamento central para integridade da rede.' })}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-5 py-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-gray-500">
                                    Portal separado da instalacao
                                </p>
                            </div>
                        </div>
                    </Card>
                </div>

            <Card className="relative border border-white/5 backdrop-blur-3xl bg-[#0A0A15]/80 shadow-2xl overflow-hidden rounded-[2.5rem]">
                <div className="p-10 lg:p-12 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                    <div className="flex items-center gap-5">
                        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-[1.5rem] text-emerald-500 shadow-inner">
                            <Globe className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-portal-display text-white italic uppercase tracking-tighter font-black">
                                Live <span className="text-emerald-500">Node Monitoring</span>
                            </h3>
                            <div className="text-[10px] text-gray-700 font-bold uppercase tracking-[0.2em] mt-1.5 flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Active Infrastructure Sync
                            </div>
                        </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/5">
                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest leading-none">Total Nodes:</span>
                        <span className="text-xs font-black text-white leading-none">{license.installations?.length || 0}</span>
                    </div>
                </div>

                <div className="divide-y divide-white/5">
                    {license.installations?.map(inst => (
                        <div key={inst.id} className="group p-8 lg:p-10 flex flex-col sm:flex-row sm:items-center justify-between gap-8 hover:bg-white/[0.02] transition-all duration-500">
                            <div className="flex items-center gap-8">
                                <div className="relative">
                                    <div className={`absolute -inset-2 rounded-2xl blur-lg opacity-0 group-hover:opacity-40 transition-opacity duration-700 ${inst.status === 'active' ? 'bg-emerald-500/20' : 'bg-rose-500/20'}`} />
                                    <div className="relative w-16 h-16 rounded-2xl bg-[#0A0A15] border border-white/5 flex items-center justify-center text-gray-700 group-hover:text-white transition-colors duration-500 shadow-xl">
                                        <Server className="w-7 h-7" />
                                    </div>
                                    {inst.status === 'active' && (
                                        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#0A0A15] shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse" />
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    <h4 className="text-lg font-bold text-white tracking-tight group-hover:text-primary transition-colors">{inst.domain}</h4>
                                    <div className="flex items-center gap-4">
                                        <span className="text-[10px] text-gray-600 font-black uppercase tracking-widest flex items-center gap-2">
                                            <Clock className="w-3 h-3" />
                                            {t('installed_at', { date: new Date(inst.installed_at).toLocaleDateString(i18n.language === 'en' ? 'en-US' : i18n.language === 'es' ? 'es-ES' : 'pt-BR') })}
                                        </span>
                                        <div className="w-1 h-1 rounded-full bg-gray-800" />
                                        <span className="text-[10px] text-gray-600 font-black uppercase tracking-widest">Node ID: {inst.id.split('-')[0]}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-6">
                                <div className={`px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest shadow-inner ${
                                    inst.status === 'active' 
                                        ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-500' 
                                        : 'bg-rose-500/5 border-rose-500/20 text-rose-500'
                                }`}>
                                    {inst.status === 'active' ? 'Operational' : 'Terminated'}
                                </div>

                                <Button
                                    variant="outline"
                                    onClick={() => handleRevoke(inst.id, inst.domain)}
                                    disabled={revokingId === inst.id || inst.status === 'revoked'}
                                    className="group/revoke h-14 rounded-2xl border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white px-8 text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-lg overflow-hidden relative"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-rose-600 to-rose-400 opacity-0 group-hover/revoke:opacity-100 transition-opacity" />
                                    <div className="relative z-10 flex items-center gap-3">
                                        {revokingId === inst.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="w-4 h-4" />
                                        )}
                                        {t('revoke')}
                                    </div>
                                </Button>
                            </div>
                        </div>
                    ))}
                    {(!license.installations || license.installations.length === 0) && (
                        <div className="p-20 text-center space-y-4">
                            <div className="w-20 h-20 bg-white/[0.02] border border-white/5 rounded-[2rem] flex items-center justify-center text-gray-800 mx-auto mb-6">
                                <Server className="w-10 h-10 opacity-20" />
                            </div>
                            <p className="text-gray-500 font-medium italic uppercase tracking-widest text-xs">
                                {t('no_installations_registered')}
                            </p>
                        </div>
                    )}
                </div>
            </Card>

            <ConfirmModal
                isOpen={revokeModal.isOpen}
                onClose={() => setRevokeModal({ isOpen: false, installationId: '', domain: '' })}
                onConfirm={confirmRevoke}
                title={t('revoke_title')}
                message={t('revoke_confirm', { domain: revokeModal.domain })}
                confirmText={t('revoke_btn')}
                cancelText={t('common.cancel')}
                variant="danger"
                loading={revokingId === revokeModal.installationId}
            />
            </div>
        </Layout>
    );
};

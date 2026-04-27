import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Layout } from '../../components/Layout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { licenseService, Installation } from '../../services/licenseService';
import { supabase } from '../../services/supabase';
import { Globe, Calendar, Trash2, Loader2, AlertCircle, RefreshCw, Activity, Server, Shuffle, ChevronRight, ExternalLink, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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

const normalizeInstallation = (row: any, fallbackLicenseKey = ''): Installation => ({
    id: String(row?.installation_id || row?.id || 'local-installation'),
    license_key: String(row?.license_key || fallbackLicenseKey || ''),
    installation_id: String(row?.installation_id || row?.id || 'local-installation'),
    domain: String(row?.domain || getCurrentDomain()),
    status: String(row?.status || 'active'),
    installed_at: String(row?.installed_at || row?.created_at || row?.activated_at || row?.last_check_in || new Date().toISOString()),
    last_check_in: String(row?.last_check_in || row?.installed_at || row?.created_at || new Date().toISOString())
});

export const MyInstallations = () => {
    const { t, i18n } = useTranslation(['admin', 'common']);
    const { user } = useAuth();
    const [installations, setInstallations] = useState<Installation[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            loadData();
        }
    }, [user]);

    const loadData = async () => {
        setLoading(true);
        try {
            if (!user) return;
            const localData = await getLocalInstallations();
            if (localData.length > 0) {
                setInstallations(localData);
                return;
            }

            const data = await licenseService.getMyInstallations();
            setInstallations(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const getLocalInstallations = async (): Promise<Installation[]> => {
        let installationId: string | null = null;
        let validation: any | null = null;

        const { data: configData } = await supabase
            .from('app_config')
            .select('value')
            .eq('key', 'installation_id')
            .maybeSingle();

        installationId = normalizeConfigValue(configData?.value) || localStorage.getItem('installation_id');

        try {
            const response = await fetch('/api/licenses/validate');
            validation = await response.json();
            if (validation?.installation_id) installationId = validation.installation_id;
        } catch (error) {
            console.warn('Local license validation failed:', error);
        }

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

        const license = localLicense || validation?.license;
        const licenseKey = String(license?.key || '');

        if (licenseKey) {
            const { data, error } = await supabase
                .from('installations')
                .select('*')
                .eq('license_key', licenseKey)
                .order('installed_at', { ascending: false });

            if (!error && data?.length) {
                return data.map(row => normalizeInstallation(row, licenseKey));
            }

            if (error) {
                console.warn('Local installations lookup failed:', error.message);
            }
        }

        if (!license && !installationId) return [];

        return [normalizeInstallation({
            license_key: licenseKey,
            installation_id: installationId || 'local-installation',
            domain: license?.allowed_domain || getCurrentDomain(),
            status: 'active',
            installed_at: license?.activated_at || license?.created_at,
            last_check_in: new Date().toISOString()
        }, licenseKey)];
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
                        <p className="text-[10px] text-primary font-black uppercase tracking-[0.4em] animate-pulse">Scanning Infrastructure</p>
                        <p className="text-sm text-gray-500 font-medium italic">Sincronizando nós ativos...</p>
                    </div>
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div className="space-y-12 pb-24 max-w-6xl mx-auto px-4 md:px-0">
                {/* Tactical Infrastructure Header */}
                <div className="relative p-8 lg:p-12 rounded-[2.5rem] bg-[#0A0A15] border border-white/5 overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-1000">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-primary/10 blur-[120px] -translate-y-1/2 translate-x-1/2 opacity-50" />
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/5 blur-[100px] translate-y-1/2 -translate-x-1/2 opacity-30" />
                    
                    <div className="relative z-20 flex flex-col lg:flex-row lg:items-end justify-between gap-10">
                        <div className="space-y-6">
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-[0.3em] animate-pulse">
                                <Server className="w-3.5 h-3.5" /> Active Infrastructure
                            </div>
                            <div>
                                <h1 className="text-4xl lg:text-6xl font-portal-display text-white tracking-tighter italic leading-none mb-6 uppercase">
                                    NODE <span className="text-primary font-black">CONTROL</span>
                                </h1>
                                <p className="text-sm text-gray-500 font-medium max-w-2xl leading-relaxed italic border-l-2 border-primary/20 pl-6">
                                    {t('installations_desc')} Monitore e gerencie os pontos de terminação do seu ecossistema distribuído.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-4 px-6 py-4 rounded-[1.5rem] bg-white/[0.02] border border-white/5 group transition-all duration-500">
                                <Activity className="w-5 h-5 text-emerald-500" />
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Global Status</span>
                                    <span className="text-[11px] font-black text-emerald-500 uppercase tracking-tighter italic">Nodes Operational</span>
                                </div>
                            </div>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => loadData()}
                                className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 text-white hover:bg-white/10 active:scale-95 transition-all shadow-xl"
                            >
                                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>
                    </div>
                </div>

                <Card className="relative border border-white/5 backdrop-blur-3xl bg-[#0A0A15]/80 shadow-2xl overflow-hidden rounded-[2.5rem]">
                    <div className="p-10 lg:p-12 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                        <div className="flex items-center gap-5">
                            <div className="p-4 bg-primary/10 border border-primary/20 rounded-[1.5rem] text-primary shadow-inner">
                                <Globe className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-portal-display text-white italic uppercase tracking-tighter font-black">
                                    Managed <span className="text-primary font-black">Endpoints</span>
                                </h3>
                                <p className="text-[10px] text-gray-700 font-bold uppercase tracking-[0.2em] mt-1.5 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                    Active Synchronization Loop
                                </p>
                            </div>
                        </div>
                        <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/5">
                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest leading-none">Cluster Size:</span>
                            <span className="text-xs font-black text-white leading-none">{installations.length}</span>
                        </div>
                    </div>

                    <div className="divide-y divide-white/5">
                        {installations.length === 0 ? (
                            <div className="p-24 text-center space-y-6">
                                <div className="relative mx-auto w-24 h-24 bg-[#0A0A15] border-2 border-white/5 rounded-[2.5rem] flex items-center justify-center text-gray-800 shadow-2xl">
                                    <Globe className="w-10 h-10 opacity-20" />
                                    <div className="absolute inset-0 bg-primary/5 blur-2xl rounded-full" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-lg font-portal-display text-white italic font-black uppercase tracking-tighter">{t('no_active_installations')}</h3>
                                    <p className="text-xs text-gray-600 font-medium italic max-w-sm mx-auto">
                                        {t('no_installations_desc')}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            installations.map(inst => (
                                <div key={inst.id} className="group p-8 lg:p-10 flex flex-col md:flex-row md:items-center justify-between gap-8 hover:bg-white/[0.02] transition-all duration-500">
                                    <div className="flex items-center gap-8">
                                        <div className="relative">
                                            <div className={`absolute -inset-2 rounded-2xl blur-lg opacity-0 group-hover:opacity-40 transition-opacity duration-700 ${inst.status === 'active' ? 'bg-emerald-500/20' : 'bg-rose-500/20'}`} />
                                            <div className="relative w-16 h-16 rounded-2xl bg-[#0A0A15] border border-white/5 flex items-center justify-center text-gray-700 group-hover:text-primary transition-colors duration-500 shadow-xl">
                                                <Globe className="w-7 h-7" />
                                            </div>
                                            {inst.status === 'active' && (
                                                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#0A0A15] shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse" />
                                            )}
                                        </div>
                                        <div className="space-y-1.5">
                                            <h4 className="text-lg font-bold text-white tracking-tight group-hover:text-primary transition-colors">{inst.domain}</h4>
                                            <div className="flex items-center gap-4 text-[10px] text-gray-600 font-black uppercase tracking-widest">
                                                <span className="flex items-center gap-2">
                                                    <Clock className="w-3 h-3" />
                                                    {t('installed_at', { date: new Date(inst.installed_at).toLocaleDateString(i18n.language === 'en' ? 'en-US' : i18n.language === 'es' ? 'es-ES' : 'pt-BR') })}
                                                </span>
                                                <div className="w-1 h-1 rounded-full bg-gray-800" />
                                                <span>Protocol ID: {inst.id.split('-')[0]}</span>
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

                                        <a
                                            href={`https://${inst.domain}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="group/link h-14 px-8 rounded-2xl bg-white/5 border border-white/10 text-white hover:bg-primary transition-all duration-300 flex items-center gap-3 text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95"
                                        >
                                            {t('access')}
                                            <ExternalLink className="w-4 h-4 group-hover/link:translate-x-1 group-hover/link:-translate-y-1 transition-transform" />
                                        </a>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </Card>
            </div>
        </Layout>
    );
};

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Boxes, Check, Copy, ExternalLink, Globe, KeyRound, LayoutDashboard, Link2, Package, RefreshCcw, Rocket, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Installation, License } from '../../../services/licenseService';
import { Product } from '../../../types';
import { openUpgradeCheckout } from '../../../services/upgradeCheckout';

interface BlockBasicDashboardProps {
    license: License | null;
    installations?: Installation[];
    onNavigate: (tab: string) => void;
    upgradeProduct?: Product | null;
}

type QuickAccessItem = {
    key: string;
    icon: React.ComponentType<{ className?: string }>;
    path: string;
};

const QUICK_ACCESS_ITEMS: QuickAccessItem[] = [
    { key: 'checkouts', icon: LayoutDashboard, path: '/admin/checkouts' },
    { key: 'domains', icon: Globe, path: '/admin/domains' },
    { key: 'products', icon: Package, path: '/admin/products' },
    { key: 'members', icon: Boxes, path: '/admin/members' },
];

export const BlockBasicDashboard: React.FC<BlockBasicDashboardProps> = ({
    license,
    installations = [],
    onNavigate,
    upgradeProduct,
}) => {
    const { t } = useTranslation('portal');
    const [copiedKey, setCopiedKey] = useState(false);
    const [savedInstallUrl, setSavedInstallUrl] = useState<string | null>(null);

    useEffect(() => {
        setSavedInstallUrl(sessionStorage.getItem('activation_install_url'));
    }, []);

    const activeInstall = useMemo(
        () => installations.find((installation) => installation.status === 'active') || null,
        [installations]
    );

    const latestInstall = activeInstall || installations[0] || null;
    const hasUnlimitedPlan = license?.plan === 'upgrade_domains' || license?.plan === 'whitelabel' || license?.plan === 'saas';
    const domainLimit = hasUnlimitedPlan ? t('license.unlimited') : '1';
    const productLimit = hasUnlimitedPlan ? t('license.unlimited') : '3';
    const installedAdminBaseUrl = activeInstall?.domain ? `https://${activeInstall.domain}` : null;

    const openInstalledPath = (path: string) => {
        if (!installedAdminBaseUrl) return;

        const targetUrl = new URL(path, `${installedAdminBaseUrl}/`).toString();
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
    };

    const openUpgrade = () => {
        if (upgradeProduct?.checkout_url && upgradeProduct?.saas_plan_slug) {
            void openUpgradeCheckout({
                checkoutUrl: upgradeProduct.checkout_url,
                planSlug: upgradeProduct.saas_plan_slug as 'upgrade_domains' | 'whitelabel' | 'saas',
                productId: upgradeProduct.id,
                sourceSurface: 'portal',
                sourceContext: {
                    trigger: 'basic_dashboard_limits',
                    location: 'portal_home',
                },
            });
            return;
        }

        onNavigate('install');
    };

    const copyLicenseKey = async () => {
        if (!license?.key) return;

        await navigator.clipboard.writeText(license.key);
        setCopiedKey(true);
        window.setTimeout(() => setCopiedKey(false), 1800);
    };

    const installationStatusLabel = activeInstall
        ? t('basic_dashboard.status.active')
        : latestInstall
            ? t('basic_dashboard.status.inactive')
            : t('basic_dashboard.status.pending');

    const installationStatusHint = activeInstall
        ? t('basic_dashboard.status.active_desc', { domain: activeInstall.domain })
        : latestInstall
            ? t('basic_dashboard.status.inactive_desc')
            : t('basic_dashboard.status.pending_desc');

    return (
        <section className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/5 p-6 text-left md:p-8 backdrop-blur-2xl">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-primary/10 to-transparent" />

            <div className="relative z-10 space-y-8">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between border-b border-white/5 pb-10">
                    <div className="max-w-4xl">
                        <p className="text-[11px] font-black uppercase tracking-[0.45em] text-primary/80">
                            {t('basic_dashboard.eyebrow')}
                        </p>
                        <h3 className="mt-4 font-display text-4xl font-black italic uppercase tracking-tighter text-white md:text-5xl lg:text-7xl leading-[0.9]">
                            {t('basic_dashboard.title')}
                        </h3>
                        <p className="mt-6 text-base font-medium leading-relaxed text-gray-500 max-w-2xl">
                            {t('basic_dashboard.description')}
                        </p>
                    </div>
 
                    <button
                        onClick={() => onNavigate(license ? 'install' : 'license')}
                        disabled={!license}
                        className="group relative flex flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl bg-primary px-14 py-5 font-display text-white shadow-[0_0_30px_rgba(168,85,247,0.35)] transition-all hover:scale-[1.02] hover:shadow-[0_0_50px_rgba(168,85,247,0.5)] active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                    >
                        <div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-[100%]" />
                        <div className="flex items-center gap-3">
                            {license ? <Zap className="h-7 w-7 fill-current" /> : <KeyRound className="h-7 w-7" />}
                            <span className="text-2xl font-black italic uppercase tracking-tighter leading-none">
                                {license ? t('basic_dashboard.primary_cta.install') : t('basic_dashboard.primary_cta.license')}
                            </span>
                        </div>
                        {license && (
                            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40 leading-none mt-1">
                                {t('basic_dashboard.primary_cta.install_subtext')}
                            </span>
                        )}
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* HUB DE STATUS (CARD PRINCIPAL) */}
                    <div className="lg:col-span-8 group relative overflow-hidden rounded-[2.5rem] border border-white/5 bg-[#0A0A0F]/60 p-8 backdrop-blur-3xl transition-all hover:border-white/10">
                        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />
                        
                        <div className="relative flex flex-col h-full">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                <div className="flex items-center gap-4 text-emerald-400">
                                    <div className="p-3.5 rounded-2xl bg-emerald-400/10 border border-emerald-400/20 shadow-[0_0_15px_rgba(52,211,153,0.15)]">
                                        <LayoutDashboard className="h-7 w-7" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-500 leading-none">
                                            {t('basic_dashboard.cards.installation_status')}
                                        </p>
                                        <h3 className="mt-2 text-3xl font-black italic uppercase tracking-tighter text-white leading-none">
                                            CENTRO DE OPERAÇÕES
                                        </h3>
                                    </div>
                                </div>
                                <div className={`inline-flex items-center gap-3 px-5 py-2.5 rounded-full border ${activeInstall ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                                    <span className={`h-2.5 w-2.5 rounded-full animate-pulse ${activeInstall ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]' : 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]'}`} />
                                    <span className="text-[11px] font-black uppercase tracking-[0.25em]">{installationStatusLabel}</span>
                                </div>
                            </div>

                            <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
                                <div>
                                    <p className="text-xl font-medium text-gray-400 leading-relaxed max-w-sm">
                                        {installationStatusHint}
                                    </p>
                                    <div className="mt-10 flex flex-wrap gap-4">
                                        {savedInstallUrl && (
                                            <a
                                                href={savedInstallUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-3 rounded-2xl bg-white px-8 py-4 text-xs font-black uppercase tracking-widest text-black transition-all hover:bg-gray-100 hover:scale-[1.02] shadow-xl"
                                            >
                                                <ExternalLink className="h-4.5 w-4.5" />
                                                {t('basic_dashboard.actions.open_link')}
                                            </a>
                                        )}
                                        <button
                                            onClick={() => onNavigate('install')}
                                            className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-8 py-4 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-white/10"
                                        >
                                            <RefreshCcw className="h-4.5 w-4.5" />
                                            {savedInstallUrl ? t('basic_dashboard.actions.renew_link') : t('basic_dashboard.actions.view_installation')}
                                        </button>
                                    </div>
                                </div>

                                <div className="hidden md:block">
                                    <div className="rounded-[2rem] border border-white/5 bg-white/[0.02] p-7 relative overflow-hidden group/logs">
                                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover/logs:opacity-100 transition-opacity duration-500" />
                                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-500 mb-5 flex items-center gap-2">
                                            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                            LOGS OPERACIONAIS
                                        </p>
                                        <div className="space-y-4 relative z-10">
                                            <div className="flex items-center gap-3 text-[11px] font-mono text-gray-400">
                                                <span className="text-emerald-400 font-bold">[OK]</span> 
                                                <span className="opacity-40">Core Engine: Sincronizado</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-[11px] font-mono text-gray-400">
                                                <span className="text-primary font-bold">[OK]</span>
                                                <span className="opacity-40">Licença: Validada em Cloud</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-[11px] font-mono text-gray-400">
                                                <span className="text-sky-400 font-bold">[OK]</span>
                                                <span className="opacity-40">Domínios: Monitoramento Ativo</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* CREDENCIAIS E LIMITES */}
                    <div className="lg:col-span-4 flex flex-col gap-6">
                        <div className="flex-1 rounded-[2.5rem] border border-white/5 bg-[#0A0A0F]/60 p-8 backdrop-blur-3xl transition-all hover:border-white/10 group/key">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 text-primary/80">
                                    <KeyRound className="h-5 w-5" />
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">
                                        {t('basic_dashboard.cards.installation_key')}
                                    </p>
                                </div>
                                <button 
                                    onClick={copyLicenseKey}
                                    className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all opacity-0 group-hover/key:opacity-100"
                                >
                                    <Copy className="h-4 w-4" />
                                </button>
                            </div>
                            
                            <div className="mt-8">
                                {license?.key ? (
                                    <div className="space-y-5">
                                        <div className="relative group/code">
                                            <code className="block break-all rounded-2xl border border-white/5 bg-black/40 p-5 text-[11px] font-bold leading-relaxed text-white/50 font-mono transition-all group-hover/code:text-white group-hover/code:border-primary/30">
                                                {license.key}
                                            </code>
                                        </div>
                                        <button
                                            onClick={() => onNavigate('license')}
                                            className="w-full inline-flex items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-white/10"
                                        >
                                            {t('basic_dashboard.actions.manage_key')}
                                        </button>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500 leading-relaxed italic">{t('basic_dashboard.empty_key')}</p>
                                )}
                            </div>
                        </div>

                        <div className={`rounded-[2.5rem] border p-8 transition-all relative overflow-hidden group/plan ${hasUnlimitedPlan ? 'border-primary/20 bg-primary/5' : 'border-white/5 bg-white/[0.02]'}`}>
                            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-[40px] pointer-events-none" />
                            
                            <div className="relative z-10 flex items-center justify-between">
                                <div className="flex items-center gap-3 text-primary">
                                    <Globe className="h-5 w-5" />
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">
                                        {t('basic_dashboard.cards.current_limits')}
                                    </p>
                                </div>
                                {!hasUnlimitedPlan && (
                                    <button onClick={openUpgrade} className="text-[10px] font-black text-primary hover:underline uppercase tracking-tighter">Fazer Upgrade</button>
                                )}
                            </div>
                            
                            <div className="relative z-10 mt-8 grid grid-cols-2 gap-6">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-600">DOMÍNIOS</p>
                                    <p className="text-4xl font-black italic tracking-tighter text-white">
                                        {domainLimit}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-600">PRODUTOS</p>
                                    <p className="text-4xl font-black italic tracking-tighter text-white">
                                        {productLimit}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="rounded-[2.5rem] border border-white/5 bg-[#05050A]/40 p-6 md:p-10">
                    <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.4em] text-primary/60">
                                {t('basic_dashboard.quick_access.eyebrow')}
                            </p>
                            <h4 className="mt-3 font-display text-3xl font-black italic uppercase tracking-tighter text-white">
                                {t('basic_dashboard.quick_access.title')}
                            </h4>
                            <p className="mt-3 max-w-2xl text-sm font-medium leading-relaxed text-gray-500">
                                {installedAdminBaseUrl
                                    ? t('basic_dashboard.quick_access.ready')
                                    : t('basic_dashboard.quick_access.waiting')}
                            </p>
                        </div>

                        {installedAdminBaseUrl && (
                            <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-3 backdrop-blur-md">
                                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.5)]" />
                                <span className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-400/90">
                                    {activeInstall?.domain}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {QUICK_ACCESS_ITEMS.map(({ key, icon: Icon, path }) => (
                            <button
                                key={key}
                                disabled={!installedAdminBaseUrl}
                                onClick={() => openInstalledPath(path)}
                                className="group relative flex flex-col justify-between overflow-hidden rounded-[2rem] border border-white/5 bg-white/[0.02] p-6 text-left transition-all duration-500 hover:border-primary/40 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-30"
                            >
                                <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-primary/5 blur-2xl transition-all group-hover:bg-primary/10" />
                                
                                <div className="relative z-10 flex items-center justify-between">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform duration-500 group-hover:scale-110 group-hover:bg-primary/20">
                                        <Icon className="h-6 w-6" />
                                    </div>
                                    <ExternalLink className="h-4 w-4 text-gray-600 transition-all duration-300 group-hover:translate-x-1 group-hover:-translate-y-1 group-hover:text-primary" />
                                </div>
                                <div className="relative z-10 mt-8">
                                    <p className="font-display text-xl font-black italic uppercase tracking-tight text-white group-hover:text-primary-hover transition-colors">
                                        {t(`basic_dashboard.quick_access.items.${key}`)}
                                    </p>
                                    <p className="mt-2 text-xs font-medium leading-relaxed text-gray-500 group-hover:text-gray-400 transition-colors">
                                        {installedAdminBaseUrl
                                            ? t('basic_dashboard.quick_access.open_live')
                                            : t('basic_dashboard.quick_access.install_required')}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};

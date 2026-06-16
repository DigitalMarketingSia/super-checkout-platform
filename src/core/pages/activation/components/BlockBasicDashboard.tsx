import React, { useEffect, useMemo, useState } from 'react';
import { Boxes, Copy, ExternalLink, Globe, KeyRound, LayoutDashboard, Loader2, Package, RefreshCcw, Sparkles, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Installation, License } from '../../../services/licenseService';
import { Product } from '../../../types';
import { openUpgradeCheckout } from '../../../services/upgradeCheckout';

interface BlockBasicDashboardProps {
    license: License | null;
    installations?: Installation[];
    onNavigate: (tab: string) => void;
    upgradeProduct?: Product | null;
    onOpenDemo: () => Promise<void>;
    demoLoading: boolean;
    demoError: string | null;
}

type QuickAccessItem = {
    key: string;
    icon: React.ComponentType<{ className?: string }>;
    path: string;
};

interface DemoExperienceCardProps {
    onOpenDemo: () => Promise<void>;
    demoLoading: boolean;
    demoError: string | null;
}

const QUICK_ACCESS_ITEMS: QuickAccessItem[] = [
    { key: 'checkouts', icon: LayoutDashboard, path: '/admin/checkouts' },
    { key: 'domains', icon: Globe, path: '/admin/domains' },
    { key: 'products', icon: Package, path: '/admin/products' },
    { key: 'members', icon: Boxes, path: '/admin/members' },
];

export const DemoExperienceCard: React.FC<DemoExperienceCardProps> = ({
    onOpenDemo,
    demoLoading,
    demoError,
}) => {
    const { t } = useTranslation('portal');

    return (
        <div className="relative overflow-hidden rounded-[2.4rem] border border-primary/20 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.22),transparent_34%),linear-gradient(135deg,rgba(17,9,26,0.98),rgba(8,8,14,0.96))] p-6 md:p-8">
            <div className="pointer-events-none absolute -left-16 top-0 h-40 w-40 rounded-full bg-primary/25 blur-3xl" />
            <div className="pointer-events-none absolute -right-12 bottom-0 h-36 w-36 rounded-full bg-cyan-400/15 blur-3xl" />

            <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px] xl:items-stretch">
                <div className="max-w-3xl">
                    <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-[0.3em] text-primary/90">
                        <Sparkles className="h-3.5 w-3.5" />
                        {t('basic_dashboard.demo.eyebrow')}
                    </div>

                    <h4 className="mt-4 font-display text-3xl font-black italic uppercase tracking-tighter text-white md:text-4xl">
                        {t('basic_dashboard.demo.title')}
                    </h4>
                    <p className="mt-4 max-w-2xl text-sm leading-relaxed text-gray-300 md:text-[15px]">
                        {t('basic_dashboard.demo.description')}
                    </p>

                    <div className="mt-6 flex flex-wrap gap-3">
                        <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-gray-200 shadow-[0_10px_25px_rgba(0,0,0,0.2)]">
                            {t('basic_dashboard.demo.bullets.ui')}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-gray-200 shadow-[0_10px_25px_rgba(0,0,0,0.2)]">
                            {t('basic_dashboard.demo.bullets.checkout')}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-gray-200 shadow-[0_10px_25px_rgba(0,0,0,0.2)]">
                            {t('basic_dashboard.demo.bullets.members')}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-gray-200 shadow-[0_10px_25px_rgba(0,0,0,0.2)]">
                            {t('basic_dashboard.demo.bullets.full_test', 'Teste completo')}
                        </span>
                    </div>
                </div>

                <div className="relative">
                    <div className="absolute -inset-2 rounded-[2rem] bg-gradient-to-br from-primary/35 via-transparent to-cyan-400/25 blur-2xl opacity-90" />
                    <div className="relative flex h-full flex-col justify-between rounded-[2rem] border border-white/10 bg-black/35 p-5 shadow-[0_25px_65px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-primary">
                                {t('basic_dashboard.demo.cta_title', 'Abrir sistema demo')}
                            </p>
                            <p className="mt-3 text-lg font-black uppercase tracking-tight text-white/95 leading-snug">
                                {t('basic_dashboard.demo.cta_hint', 'Abre o ambiente guiado em uma nova aba sem sair do portal.')}
                            </p>
                        </div>

                        <div className="mt-6 space-y-3">
                            <button
                                type="button"
                                onClick={() => void onOpenDemo()}
                                disabled={demoLoading}
                                className="group inline-flex w-full items-center justify-between gap-3 rounded-[1.5rem] bg-white px-5 py-5 text-left text-black shadow-[0_18px_45px_rgba(255,255,255,0.18)] transition-all hover:-translate-y-0.5 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                                <span className="flex items-center gap-3">
                                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black text-white">
                                        {demoLoading ? (
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                        ) : (
                                            <Sparkles className="h-5 w-5" />
                                        )}
                                    </span>
                                    <span className="flex flex-col">
                                        <span className="text-xs font-black uppercase tracking-[0.22em]">
                                            {demoLoading
                                                ? t('basic_dashboard.demo.opening')
                                                : t('basic_dashboard.demo.cta')}
                                        </span>
                                        <span className="mt-1 text-[10px] font-black uppercase tracking-[0.22em] text-black/50">
                                            {t('basic_dashboard.demo.cta_support', 'Abrir em nova aba')}
                                        </span>
                                    </span>
                                </span>

                                <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-black/10 bg-black text-white transition-transform duration-500 group-hover:translate-x-1">
                                    <ExternalLink className="h-4.5 w-4.5" />
                                </span>
                            </button>

                            <p className="text-xs leading-relaxed text-gray-500">
                                {t('basic_dashboard.demo.retention')}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {demoError && (
                <p className="relative mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {demoError}
                </p>
            )}
        </div>
    );
};

export const BlockBasicDashboard: React.FC<BlockBasicDashboardProps> = ({
    license,
    installations = [],
    onNavigate,
    upgradeProduct,
    onOpenDemo,
    demoLoading,
    demoError,
}) => {
    const { t } = useTranslation('portal');
    const [savedInstallUrl, setSavedInstallUrl] = useState<string | null>(null);

    useEffect(() => {
        setSavedInstallUrl(sessionStorage.getItem('activation_install_url'));
    }, []);

    const activeInstall = useMemo(
        () => installations.find((installation) => installation.status === 'active') || null,
        [installations]
    );

    const latestInstall = activeInstall || installations[0] || null;
    const hasUnlimitedPlan =
        Boolean(license?.has_unlimited_domains)
        || license?.plan === 'upgrade_domains'
        || license?.plan === 'whitelabel';
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
 
                    <div className="relative self-start lg:self-auto">
                        <div className="absolute -inset-3 rounded-[2rem] bg-primary/20 blur-2xl opacity-80" />
                        <div className="absolute -inset-1 rounded-[2rem] bg-gradient-to-br from-primary via-primary/60 to-amber-300/60 opacity-80" />
                        <button
                            onClick={() => onNavigate(license ? 'install' : 'license')}
                            disabled={!license}
                            className="group relative flex min-w-[280px] flex-col items-start justify-center gap-3 overflow-hidden rounded-[1.7rem] border border-white/15 bg-[#120815] px-6 py-5 text-left font-display text-white shadow-[0_0_45px_rgba(168,85,247,0.35)] transition-all hover:scale-[1.02] hover:shadow-[0_0_65px_rgba(168,85,247,0.48)] active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                        >
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.2),transparent_45%)] opacity-80" />
                            <div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-[100%]" />

                            <div className="relative flex items-center gap-2">
                                <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.28em] text-white/80">
                                    {license
                                        ? t('basic_dashboard.primary_cta.recommended', 'Comece aqui')
                                        : t('basic_dashboard.primary_cta.unlock_label', 'Passo inicial')}
                                </span>
                                <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.95)]" />
                            </div>

                            <div className="relative flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/10 shadow-inner">
                                    {license ? <Zap className="h-7 w-7 fill-current" /> : <KeyRound className="h-7 w-7" />}
                                </div>
                                <div>
                                    <span className="block text-2xl font-black italic uppercase tracking-tighter leading-none">
                                        {license ? t('basic_dashboard.primary_cta.install') : t('basic_dashboard.primary_cta.license')}
                                    </span>
                                    <span className="mt-1 block text-[10px] font-black uppercase tracking-[0.24em] text-white/55">
                                        {license
                                            ? t('basic_dashboard.primary_cta.install_subtext')
                                            : t('basic_dashboard.primary_cta.unlock_subtext', 'Ative sua base gratuita para continuar')}
                                    </span>
                                </div>
                            </div>

                            <div className="relative flex w-full items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                                <span className="text-[10px] font-black uppercase tracking-[0.22em] text-white/80">
                                    {license
                                        ? t('basic_dashboard.primary_cta.install_hint', 'Abrir instalacao guiada agora')
                                        : t('basic_dashboard.primary_cta.license_hint', 'Liberar acesso e seguir para instalacao')}
                                </span>
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-black transition-transform duration-500 group-hover:translate-x-1">
                                    <ExternalLink className="h-4.5 w-4.5" />
                                </div>
                            </div>
                        </button>
                    </div>
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
                    <div className="mb-6">
                        <DemoExperienceCard
                            onOpenDemo={onOpenDemo}
                            demoLoading={demoLoading}
                            demoError={demoError}
                        />
                    </div>

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

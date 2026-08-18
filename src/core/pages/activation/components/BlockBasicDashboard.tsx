import React, { useMemo } from 'react';
import {
    Activity,
    ArrowUpRight,
    Boxes,
    Check,
    Copy,
    ExternalLink,
    Globe,
    KeyRound,
    LayoutDashboard,
    Loader2,
    Package,
    Play,
    RefreshCcw,
    ShieldCheck,
    Zap,
} from 'lucide-react';
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

const isSetupPendingInstallation = (installation: Installation) =>
    String(installation?.domain || '').trim().toLowerCase() === 'setup-pending';

export const DemoExperienceCard: React.FC<DemoExperienceCardProps> = ({
    onOpenDemo,
    demoLoading,
    demoError,
}) => {
    const { t } = useTranslation('portal');

    return (
        <article className="relative overflow-hidden rounded-[2rem] border border-purple-500/40 bg-gradient-to-br from-purple-950/80 via-[#0D0B18] to-emerald-950/30 p-6 shadow-2xl flex flex-col justify-between text-left">
            <div>
                <div className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                    {/* Lado Esquerdo do Card Demo */}
                    <div className="md:col-span-7 space-y-3">
                        <h3 className="font-display text-2xl font-black uppercase italic tracking-tighter text-white leading-tight sm:text-3xl">
                            {t('basic_dashboard.demo.title')}
                        </h3>

                        {/* Resumo Curto */}
                        <p className="text-xs text-gray-300 font-medium leading-relaxed">
                            {t('basic_dashboard.demo.description')}
                        </p>

                        {/* Lista de Bullets (Builtpoints) */}
                        <ul className="space-y-2 text-[11px] font-semibold text-gray-300 pt-1">
                            <li className="flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-purple-400 shrink-0" />
                                <span>Interface 100% real do produto</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-purple-400 shrink-0" />
                                <span>Simulação de vendas, compras e Pix</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-purple-400 shrink-0" />
                                <span>Área de alunos interativa liberada</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-purple-400 shrink-0" />
                                <span>Teste completo em ambiente seguro</span>
                            </li>
                        </ul>
                    </div>

                    {/* Lado Direito: SUB-CARD BRANCO REFINADO */}
                    <div className="md:col-span-5 space-y-3">
                        <span className="inline-flex items-center gap-2 rounded-full border border-purple-500/40 bg-purple-500/20 px-4 py-1.5 text-[9px] font-black uppercase tracking-widest text-purple-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                            {t('basic_dashboard.demo.eyebrow')}
                        </span>
                        <p className="text-xs font-black uppercase tracking-tight text-white leading-snug">
                            {t('basic_dashboard.demo.cta_support')}
                        </p>

                        {/* Botão Card Branco Sólido */}
                        <div
                            onClick={() => void onOpenDemo()}
                            className={`mt-3 cursor-pointer rounded-[1.5rem] bg-white p-4 text-black shadow-2xl transition duration-200 hover:bg-gray-100 hover:scale-[1.02] active:scale-95 flex items-center justify-between ${demoLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-black text-white">
                                    {demoLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
                                </div>
                                <div>
                                    <p className="text-xs font-black uppercase tracking-wider text-black">
                                        {demoLoading ? t('basic_dashboard.demo.opening') : t('basic_dashboard.demo.cta')}
                                    </p>
                                </div>
                            </div>
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-black text-white">
                                <ExternalLink className="h-5 w-5" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {demoError && (
                <p className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-xs font-medium text-red-200">
                    {demoError}
                </p>
            )}
        </article>
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
    const [copiedKey, setCopiedKey] = React.useState(false);

    const activeInstall = useMemo(
        () => installations.find(
            (installation) => installation.status === 'active' && !isSetupPendingInstallation(installation)
        ) || null,
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
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 2000);
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

    const statusIsActive = Boolean(activeInstall);

    return (
        <section className="space-y-6 text-left">
            {/* HEADER PRINCIPAL */}
            <header className="flex flex-col gap-5 rounded-[2rem] border border-purple-500/30 bg-gradient-to-r from-[#120B20] via-[#0E0C18] to-[#0B1317] p-6 shadow-2xl lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-purple-400 shadow-[0_0_8px_#a855f7]" />
                        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-purple-400">
                            {t('basic_dashboard.eyebrow')}
                        </span>
                    </div>
                    <h3 className="font-display text-3xl font-black uppercase italic tracking-tighter text-white sm:text-4xl">
                        {t('basic_dashboard.title')}
                    </h3>
                    <p className="text-xs text-gray-400 max-w-xl leading-relaxed">
                        {t('basic_dashboard.description')}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => onNavigate(license ? 'install' : 'license')}
                    className="inline-flex shrink-0 items-center justify-center gap-2.5 rounded-2xl border border-purple-400/50 bg-gradient-to-r from-purple-600 to-purple-800 px-6 py-3.5 text-xs font-black uppercase italic tracking-wider text-white shadow-xl shadow-purple-950/70 transition duration-200 hover:from-purple-500 hover:to-purple-700 active:scale-95"
                >
                    {license ? <Zap className="h-4 w-4 fill-current text-white" /> : <KeyRound className="h-4 w-4" />}
                    <span>{license ? t('basic_dashboard.primary_cta.install') : t('basic_dashboard.primary_cta.license')}</span>
                    <ArrowUpRight className="h-4 w-4" />
                </button>
            </header>

            {/* GRADE PRINCIPAL: STATUS + CHAVE */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* CARD 1: STATUS DA INSTALAÇÃO */}
                <article className="flex flex-col justify-between rounded-[2rem] border border-emerald-500/30 bg-gradient-to-br from-[#120B20] via-[#0E0C18] to-[#0A1417] p-6 shadow-2xl lg:col-span-7 relative overflow-hidden">
                    <div className="space-y-6">
                        {/* Header Superior Limpo */}
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${statusIsActive ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 'border-amber-500/40 bg-amber-500/10 text-amber-400'}`}>
                                    <Activity className="h-5 w-5" />
                                </div>
                                <div>
                                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400">
                                        {t('basic_dashboard.cards.installation_status')}
                                    </span>
                                    <p className="text-[11px] font-bold text-gray-500">
                                        {t('basic_dashboard.cards.operations_center')}
                                    </p>
                                </div>
                            </div>
                            <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[9px] font-black uppercase tracking-widest ${statusIsActive ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.25)]' : 'border-amber-500/40 bg-amber-500/15 text-amber-400'}`}>
                                <span className={`h-2 w-2 rounded-full ${statusIsActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                                {installationStatusLabel}
                            </span>
                        </div>

                        {/* Seção 1: Domínio Principal em Campo Separado */}
                        <div className="space-y-2">
                            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 px-1">
                                {t('basic_dashboard.cards.installation_status')}
                            </span>
                            <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-[#0B0A12] p-3.5 shadow-inner">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <Globe className="h-4 w-4 text-emerald-400 shrink-0" />
                                    <code className="truncate font-mono text-sm sm:text-base font-black tracking-tight text-white">
                                        {activeInstall?.domain || installationStatusHint}
                                    </code>
                                </div>
                                <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${statusIsActive ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-amber-500/30 bg-amber-500/10 text-amber-400'}`}>
                                    <Check className="h-3.5 w-3.5" /> {installationStatusLabel}
                                </span>
                            </div>
                        </div>

                        {/* Seção 2: Logs Operacionais em Campo Separado */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between px-1">
                                <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                                    {t('basic_dashboard.cards.operational_logs')}
                                </span>
                                <span className="text-[10px] font-black text-emerald-400 uppercase">
                                    {statusIsActive ? t('basic_dashboard.status.active') : t('basic_dashboard.status.pending')}
                                </span>
                            </div>
                            <div className="rounded-2xl border border-white/[0.08] bg-[#0B0A12] p-4 space-y-2.5">
                                <div className="flex items-center gap-1.5">
                                    {[0, 1, 2, 3, 4, 5, 6, 7].map((seg) => (
                                        <span
                                            key={seg}
                                            className={`h-2.5 flex-1 rounded-full ${statusIsActive || seg < 2 ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-white/10'}`}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 border-t border-white/[0.08] pt-4">
                        <button
                            type="button"
                            onClick={() => onNavigate('install')}
                            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.05] hover:bg-white/10 px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-gray-200 transition duration-200"
                        >
                            <RefreshCcw className="h-3.5 w-3.5" />
                            <span>{t('basic_dashboard.actions.view_installation')}</span>
                        </button>
                    </div>
                </article>

                {/* CARD 2: CHAVE DE INSTALAÇÃO */}
                <article className="flex flex-col justify-between rounded-[2rem] border border-purple-500/30 bg-gradient-to-br from-[#180E29] via-[#0E0C18] to-[#120B20] p-6 shadow-2xl lg:col-span-5 relative overflow-hidden">
                    <div className="space-y-6">
                        {/* Header Superior Limpo */}
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-purple-500/40 bg-purple-500/10 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.15)]">
                                <KeyRound className="h-5 w-5" />
                            </div>
                            <div>
                                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400">
                                    {t('basic_dashboard.cards.installation_key')}
                                </span>
                                <p className="text-[11px] font-bold text-purple-300/70">
                                    CHAVE MASTER DE AUTENTICAÇÃO
                                </p>
                            </div>
                        </div>

                        {/* Seção Organizada da Chave */}
                        {license?.key ? (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-purple-400">
                                        {t('basic_dashboard.cards.installation_key')}
                                    </span>
                                    <span className="text-[9px] font-bold text-emerald-400 flex items-center gap-1">
                                        <ShieldCheck className="h-3 w-3" /> {t('basic_dashboard.status.active')}
                                    </span>
                                </div>

                                {/* Campo Estilizado Separado */}
                                <div className="flex items-center justify-between gap-3 rounded-2xl border border-purple-500/40 bg-[#0B0A12] p-3 shadow-inner">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <KeyRound className="h-4 w-4 text-purple-400 shrink-0" />
                                        <code className="truncate font-mono text-xs sm:text-sm font-black tracking-wider text-purple-200 select-all">
                                            {license.key}
                                        </code>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={copyLicenseKey}
                                        disabled={!license?.key}
                                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-purple-400/40 bg-purple-600 hover:bg-purple-500 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white shadow-md transition duration-200 active:scale-95 disabled:opacity-40"
                                    >
                                        {copiedKey ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                                        <span>{copiedKey ? 'COPIADO' : 'COPIAR'}</span>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-white/[0.08] bg-[#0B0A12] p-4 text-xs italic leading-relaxed text-gray-400">
                                {t('basic_dashboard.empty_key')}
                            </div>
                        )}
                    </div>

                    {/* Rodapé Separado */}
                    <div className="mt-6 flex items-center justify-between border-t border-white/[0.08] pt-4">
                        <span className="text-[10px] font-medium text-gray-400">
                            Usada para validar suas instâncias
                        </span>
                        <button
                            type="button"
                            onClick={() => onNavigate('license')}
                            className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-purple-400 transition hover:text-purple-300 hover:underline"
                        >
                            {t('basic_dashboard.actions.manage_key')}
                            <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </article>
            </div>

            {/* GRADE SECUNDÁRIA: LIMITES + DEMO */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* CARD 3: LIMITES DO PLANO */}
                <article className={`rounded-[2rem] border p-6 shadow-2xl lg:col-span-5 flex flex-col justify-between relative overflow-hidden ${hasUnlimitedPlan ? 'border-purple-500/30 bg-gradient-to-br from-[#120B20] via-[#0E0C18] to-[#180E29]' : 'border-sky-500/30 bg-gradient-to-br from-[#0C1324] via-[#0E0C18] to-[#180E29]'}`}>
                    <div>
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-500/40 bg-sky-500/10 text-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.15)]">
                                    <Globe className="h-5 w-5" />
                                </div>
                                <div>
                                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400">
                                        {t('basic_dashboard.cards.current_limits')}
                                    </span>
                                    <p className="text-[11px] font-bold text-sky-300/70">
                                        RECURSOS LIBERADOS
                                    </p>
                                </div>
                            </div>
                            {!hasUnlimitedPlan && (
                                <button
                                    type="button"
                                    onClick={openUpgrade}
                                    className="text-[9px] font-black uppercase tracking-wider text-purple-400 hover:text-white transition"
                                >
                                    {t('basic_dashboard.actions.upgrade_plan')}
                                </button>
                            )}
                        </div>

                        <div className="mt-5 grid grid-cols-2 gap-3.5">
                            <div className="rounded-[1.25rem] border border-white/[0.08] bg-black/60 p-4">
                                <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                                    {t('basic_dashboard.labels.domains')}
                                </span>
                                <p className="mt-2 font-display text-2xl font-black italic tracking-tighter text-white">{domainLimit}</p>
                                <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
                                    <div className={`h-full rounded-full ${hasUnlimitedPlan ? 'w-full bg-purple-500 shadow-[0_0_10px_#a855f7]' : 'w-1/4 bg-sky-400'}`} />
                                </div>
                            </div>

                            <div className="rounded-[1.25rem] border border-white/[0.08] bg-black/60 p-4">
                                <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                                    {t('basic_dashboard.labels.products')}
                                </span>
                                <p className="mt-2 font-display text-2xl font-black italic tracking-tighter text-white">{productLimit}</p>
                                <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
                                    <div className={`h-full rounded-full ${hasUnlimitedPlan ? 'w-full bg-purple-500 shadow-[0_0_10px_#a855f7]' : 'w-2/5 bg-sky-400'}`} />
                                </div>
                            </div>
                        </div>
                    </div>
                </article>

                {/* CARD 4: SISTEMA DEMO OFICIAL */}
                <div className="lg:col-span-7">
                    <DemoExperienceCard
                        onOpenDemo={onOpenDemo}
                        demoLoading={demoLoading}
                        demoError={demoError}
                    />
                </div>
            </div>

            {/* SEÇÃO 5: ATALHOS RÁPIDOS */}
            <section className="pt-4 space-y-4">
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-purple-400">
                            {t('basic_dashboard.quick_access.eyebrow')}
                        </span>
                        <h4 className="font-display text-xl font-black uppercase italic tracking-tighter text-white">
                            {t('basic_dashboard.quick_access.title')}
                        </h4>
                    </div>
                    {installedAdminBaseUrl && (
                        <span className="max-w-[180px] truncate rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-300">
                            {activeInstall?.domain}
                        </span>
                    )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {QUICK_ACCESS_ITEMS.map(({ key, icon: Icon, path }) => (
                        <button
                            key={key}
                            type="button"
                            disabled={!installedAdminBaseUrl}
                            onClick={() => openInstalledPath(path)}
                            className="group flex flex-col justify-between rounded-[1.75rem] border border-purple-500/20 bg-gradient-to-br from-[#140E24] via-[#0E0C18] to-[#0A0F1B] p-5 transition duration-300 hover:-translate-y-1 hover:border-purple-500/50 hover:shadow-2xl hover:shadow-purple-950/50 text-left min-h-[130px] disabled:cursor-not-allowed disabled:opacity-30"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-purple-500/25 bg-purple-500/10 text-purple-400 transition duration-300 group-hover:bg-purple-600 group-hover:text-white group-hover:border-purple-500 shadow-inner">
                                    <Icon className="h-5 w-5" />
                                </div>
                                <ArrowUpRight className="h-4 w-4 text-gray-500 transition duration-300 group-hover:text-purple-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                            </div>
                            <div className="mt-4 flex items-end justify-between gap-2">
                                <h5 className="font-display text-sm font-black uppercase italic tracking-tight text-white transition duration-300 group-hover:text-purple-300 truncate">
                                    {t(`basic_dashboard.quick_access.items.${key}`)}
                                </h5>
                                <span className="shrink-0 text-[8px] font-black uppercase tracking-widest text-gray-500">
                                    {installedAdminBaseUrl ? t('basic_dashboard.quick_access.open_live') : t('basic_dashboard.quick_access.install_required')}
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            </section>
        </section>
    );
};

export default BlockBasicDashboard;

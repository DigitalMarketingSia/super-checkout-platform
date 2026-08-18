import React, { useMemo, useRef, useState } from 'react';
import {
    Activity,
    ArrowUpRight,
    Boxes,
    Check,
    Copy,
    Crown,
    ExternalLink,
    Globe,
    KeyRound,
    LayoutDashboard,
    Loader2,
    Package,
    Play,
    RefreshCcw,
    ShieldCheck,
    Smartphone,
    Zap,
} from 'lucide-react';
import { Installation, License } from '../../services/licenseService';

const MOCK_LICENSE: License = {
    key: 'SUP-8849-XK29-9182-PRO',
    client_name: 'Conta de demonstração',
    client_email: 'demo@supercheckout.app',
    plan: 'upgrade_domains',
    status: 'active',
    max_instances: 999999,
    has_unlimited_domains: true,
    created_at: new Date().toISOString(),
};

const MOCK_INSTALLATIONS: Installation[] = [
    {
        id: 'inst-1',
        license_key: 'SUP-8849-XK29-9182-PRO',
        installation_id: 'inst-id-001',
        domain: 'app.sualoja.com',
        status: 'active',
        installed_at: new Date().toISOString(),
        last_check_in: new Date().toISOString(),
    },
];

const QUICK_ACCESS_ITEMS = [
    { key: 'checkouts', icon: LayoutDashboard, label: 'CHECKOUTS', desc: 'Gerenciar fluxos de venda' },
    { key: 'domains', icon: Globe, label: 'DOMÍNIOS', desc: 'Configurações de DNS e URLs' },
    { key: 'products', icon: Package, label: 'PRODUTOS', desc: 'Catálogo e ofertas ativas' },
    { key: 'members', icon: Boxes, label: 'ÁREA DE MEMBROS', desc: 'Cursos e alunos' },
];

export interface PreviewDashboardProps {
    license?: License | null;
    installations?: Installation[];
    userCreatedAt?: string | null;
    isPortalOwner?: boolean;
    ownerTwoFactorEnabled?: boolean;
    onNavigate?: (tab: string) => void;
    onQuickAccess?: (key: string) => void;
    onOpenDemo?: () => void | Promise<void>;
    demoLoading?: boolean;
    demoError?: string | null;
    hasInstallationOffer?: boolean;
    onPurchaseInstallation?: () => void;
    showPreviewBanner?: boolean;
    embedded?: boolean;
}

export const PreviewDashboard: React.FC<PreviewDashboardProps> = ({
    license,
    installations,
    userCreatedAt,
    isPortalOwner = false,
    ownerTwoFactorEnabled,
    onNavigate,
    onQuickAccess,
    onOpenDemo,
    demoLoading,
    demoError,
    hasInstallationOffer = false,
    onPurchaseInstallation,
    showPreviewBanner = true,
    embedded = false,
}) => {
    const [copiedKey, setCopiedKey] = useState(false);
    const [localDemoLoading, setLocalDemoLoading] = useState(false);
    const [localDemoError, setLocalDemoError] = useState<string | null>(null);
    const isPreviewMode = license === undefined && installations === undefined;
    const currentLicense = license === undefined ? MOCK_LICENSE : license;
    const currentInstallations = installations === undefined ? MOCK_INSTALLATIONS : installations;
    const isTwoFactorEnabled = ownerTwoFactorEnabled ?? isPreviewMode;

    // Estado dos 6 dígitos OTP 2FA
    const [otpDigits, setOtpDigits] = useState<string[]>(['6', '3', '1', '', '', '']);
    const otpInputsRef = useRef<(HTMLInputElement | null)[]>([]);

    const handleOtpChange = (index: number, value: string) => {
        const cleanValue = value.replace(/[^\d]/g, '').slice(-1);
        const newDigits = [...otpDigits];
        newDigits[index] = cleanValue;
        setOtpDigits(newDigits);

        if (cleanValue && index < 5) {
            otpInputsRef.current[index + 1]?.focus();
        }
    };

    const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
            otpInputsRef.current[index - 1]?.focus();
        }
    };

    const activeInstall = useMemo(
        () => currentInstallations.find((inst) => inst.status === 'active') || null,
        [currentInstallations]
    );
    const displayedInstall = activeInstall || currentInstallations.find((inst) => {
        const domain = String(inst.domain || '').trim().toLowerCase();
        return domain && domain !== 'setup-pending';
    }) || null;
    const installationDomain = displayedInstall?.domain || 'AGUARDANDO INSTALAÇÃO';
    const hasLicenseKey = Boolean(String(currentLicense?.key || '').trim());
    const licenseKeyAccent = hasLicenseKey
        ? {
            icon: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
            label: 'text-purple-400',
            status: 'text-emerald-400',
            statusIcon: <ShieldCheck className="h-3 w-3" />,
            statusText: 'VERIFICADA',
            value: currentLicense?.key || '',
        }
        : {
            icon: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
            label: 'text-amber-300',
            status: 'text-amber-300',
            statusIcon: <RefreshCcw className="h-3 w-3" />,
            statusText: 'PENDENTE',
            value: 'CHAVE NÃO GERADA',
        };
    const installationAccent = activeInstall
        ? {
            cardBorder: 'border-white/[0.08] hover:border-emerald-500/30',
            icon: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
            badge: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400',
            dot: 'bg-emerald-400',
            domainIcon: 'text-emerald-400',
            domainBadge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
            logs: 'text-emerald-400',
            segment: 'bg-emerald-500/90 shadow-[0_0_8px_rgba(16,185,129,0.3)]',
        }
        : {
            cardBorder: 'border-white/[0.08] hover:border-amber-500/30',
            icon: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
            badge: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
            dot: 'bg-amber-400',
            domainIcon: 'text-amber-300',
            domainBadge: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
            logs: 'text-amber-300',
            segment: 'bg-white/10',
        };

    const hasUnlimitedPlan = Boolean(
        isPortalOwner
        || currentLicense?.has_unlimited_domains
        || currentLicense?.plan === 'upgrade_domains'
        || currentLicense?.plan === 'whitelabel'
    );
    const domainLimit = hasUnlimitedPlan ? 'ILIMITADO' : '1';
    const productLimit = hasUnlimitedPlan ? 'ILIMITADO' : '3';
    const planLabel = isPortalOwner
        ? 'OWNER GLOBAL'
        : currentLicense?.has_partner_panel && currentLicense.has_unlimited_domains
            ? 'PLANO PARCEIRO + ILIMITADO'
            : currentLicense?.has_partner_panel || currentLicense?.plan === 'saas'
                ? 'PLANO PARCEIRO'
                : currentLicense?.has_unlimited_domains || currentLicense?.plan === 'upgrade_domains'
                    ? 'PLANO ILIMITADO'
                    : 'PLANO GRATUITO';
    const isPartnerPlan = Boolean(currentLicense?.has_partner_panel || currentLicense?.plan === 'saas');
    const planBenefits = isPortalOwner
        ? ['Recursos globais liberados', 'Operações de parceiro habilitadas']
        : currentLicense?.plan === 'whitelabel'
            ? ['Recursos ilimitados liberados', 'White label habilitado']
            : isPartnerPlan && hasUnlimitedPlan
                ? ['Recursos ilimitados liberados', 'Serviços de parceiro habilitados']
                : isPartnerPlan
                    ? ['Serviços de parceiro habilitados', 'Pedidos de instalação disponíveis']
                    : hasUnlimitedPlan
                        ? ['Recursos ilimitados liberados', 'Domínios ilimitados habilitados']
                        : ['1 domínio disponível', 'Até 3 produtos disponíveis'];
    const planBenefitsTitle = isPortalOwner || isPartnerPlan || hasUnlimitedPlan
        ? 'BENEFÍCIOS ATIVOS'
        : 'RECURSOS DISPONÍVEIS';
    const effectiveDemoLoading = demoLoading ?? localDemoLoading;
    const effectiveDemoError = demoError ?? localDemoError;
    const memberSince = currentLicense?.created_at || userCreatedAt;
    const memberSinceLabel = memberSince
        ? new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(memberSince))
        : 'DATA NÃO DISPONÍVEL';
    const securityAccent = isTwoFactorEnabled
        ? {
            cardBorder: 'border-emerald-500/30 hover:border-emerald-500/50',
            iconBorder: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
            label: 'text-emerald-400',
            badge: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400',
            button: 'border-emerald-400/40 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30',
            input: 'focus:border-emerald-400 focus:ring-emerald-400/20',
        }
        : {
            cardBorder: 'border-amber-500/30 hover:border-amber-500/50',
            iconBorder: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
            label: 'text-amber-400',
            badge: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
            button: 'border-amber-400/50 bg-amber-400 text-black hover:bg-amber-300',
            input: 'focus:border-amber-400 focus:ring-amber-400/20',
        };
    const installationCtaLabel = hasInstallationOffer
        ? 'CONTRATAR INSTALAÇÃO'
        : isPreviewMode
            ? 'INSTALAR COM 1-CLIQUE'
            : 'VER OPÇÕES DE INSTALAÇÃO';

    const handleInstallationCta = () => {
        if (hasInstallationOffer && onPurchaseInstallation) {
            onPurchaseInstallation();
            return;
        }
        onNavigate?.('install');
    };

    const copyKey = async () => {
        if (!currentLicense?.key) return;
        await navigator.clipboard.writeText(currentLicense.key);
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 2000);
    };

    const handleDemo = async () => {
        if (onOpenDemo) {
            await onOpenDemo();
            return;
        }

        setLocalDemoError(null);
        setLocalDemoLoading(true);
        setTimeout(() => setLocalDemoLoading(false), 1500);
    };

    return (
        <div className={`${embedded ? 'relative bg-transparent' : 'relative min-h-screen bg-[#06050A] p-4 sm:p-6 lg:p-10'} text-gray-200 antialiased selection:bg-purple-600 selection:text-white`}>
            {/* Ambient Background Radial Glow */}
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute -top-40 left-1/4 h-[600px] w-[600px] rounded-full bg-purple-900/20 blur-[150px]" />
                <div className="absolute top-1/2 -right-20 h-[500px] w-[500px] rounded-full bg-indigo-900/15 blur-[150px]" />
            </div>

            <div className="relative z-10 mx-auto max-w-6xl space-y-8">
                {showPreviewBanner && <div className="flex flex-col gap-3 rounded-[1.5rem] border border-purple-500/30 bg-[#0D0B18] p-4 sm:flex-row sm:items-center sm:justify-between shadow-xl">
                    <div className="flex items-center gap-3">
                        <div className="flex h-3 w-3 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500" />
                        </div>
                        <div>
                            <p className="text-xs font-black uppercase tracking-wider text-white">
                                PREVIEW UX: PALETA UNIFICADA NEUTRA (ESTILO STRIPE/LINEAR) & HIERARQUIA EM 3 BLOCOS
                            </p>
                            <p className="text-[11px] text-gray-400">
                                URL: <code className="rounded bg-black/60 px-2 py-0.5 font-mono text-purple-300 border border-purple-500/30">http://localhost:5173/preview/dashboard</code>
                            </p>
                        </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center justify-center rounded-full border border-purple-400/40 bg-purple-500/20 px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-purple-300">
                        CONCEITO UX REFINADO
                    </span>
                </div>}

                {/* HEADER DA PÁGINA: LIMPO, SEM MOLDURA DE CARD */}
                <header className="flex flex-col gap-4 py-2 px-1 lg:flex-row lg:items-end lg:justify-between text-left">
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-purple-400 shadow-[0_0_8px_#a855f7]" />
                            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-purple-400">
                                BEM-VINDO AO PORTAL
                            </span>
                        </div>
                        <h1 className="font-display text-3xl font-black uppercase italic tracking-tighter text-white sm:text-4xl md:text-5xl">
                            DASHBOARD DE ATIVAÇÃO
                        </h1>
                        <p className="text-xs text-gray-400 max-w-2xl leading-relaxed">
                            Configure sua licença, gerencie instalações e acesse o ecossistema Super Checkout em um ambiente premium de alta performance.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={handleInstallationCta}
                        className={`inline-flex shrink-0 items-center justify-center gap-2.5 rounded-2xl border px-6 py-3.5 text-xs font-black uppercase italic tracking-wider text-white shadow-xl transition duration-200 active:scale-95 ${hasInstallationOffer
                            ? 'border-orange-300/50 bg-gradient-to-r from-orange-400 to-amber-500 text-black shadow-orange-950/50 hover:from-orange-300 hover:to-amber-400'
                            : 'border-purple-400/50 bg-gradient-to-r from-purple-600 to-purple-800 shadow-purple-950/70 hover:from-purple-500 hover:to-purple-700'
                            }`}
                    >
                        <Zap className="h-4 w-4 fill-current" />
                        <span>{installationCtaLabel}</span>
                        <ArrowUpRight className="h-4 w-4" />
                    </button>
                </header>

                {/* BLOCO 1: OPERAÇÃO & CHAVE DA INSTALAÇÃO (SURFACING LIMPO E UNIFICADO) */}
                <section className="space-y-3 text-left">
                    <div className="flex items-center gap-2 px-1">
                        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-purple-400">
                            01. OPERAÇÃO ATIVA
                        </span>
                    </div>

                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                        {/* CARD STATUS DA INSTALAÇÃO (FUNDO NEUTRO COM ACCENT ROXO SUTIL) */}
                        <article className={`flex flex-col justify-between rounded-[2rem] border bg-[#0B0912] p-6 shadow-2xl lg:col-span-7 relative overflow-hidden transition ${installationAccent.cardBorder}`}>
                            <div className="space-y-6">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${installationAccent.icon}`}>
                                            <Activity className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400">
                                                STATUS DA INSTALAÇÃO
                                            </span>
                                            <p className="text-[11px] font-bold text-gray-400">
                                                CENTRO DE OPERAÇÕES
                                            </p>
                                        </div>
                                    </div>
                                    <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[9px] font-black uppercase tracking-widest ${installationAccent.badge}`}>
                                        <span className={`h-2 w-2 rounded-full ${installationAccent.dot} ${activeInstall ? 'animate-pulse' : ''}`} />
                                        {activeInstall ? 'ATIVO' : 'PENDENTE'}
                                    </span>
                                </div>

                                <div className="space-y-2">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 px-1">
                                        DOMÍNIO PRINCIPAL
                                    </span>
                                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#06050A] p-3.5 shadow-inner">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <Globe className={`h-4 w-4 shrink-0 ${installationAccent.domainIcon}`} />
                                            <code className="truncate font-mono text-sm sm:text-base font-black tracking-tight text-white">
                                                {installationDomain}
                                            </code>
                                        </div>
                                        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${installationAccent.domainBadge}`}>
                                            {activeInstall ? <Check className="h-3.5 w-3.5" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                                            {activeInstall ? 'OPERACIONAL' : 'AGUARDANDO'}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between px-1">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                                            LOGS OPERACIONAIS
                                        </span>
                                        <span className={`text-[10px] font-black ${installationAccent.logs}`}>
                                            {activeInstall ? '8 / 8 NÓS ATIVOS' : '0 / 8 NÓS ATIVOS'}
                                        </span>
                                    </div>
                                    <div className="rounded-2xl border border-white/[0.08] bg-[#06050A] p-4 space-y-2.5">
                                        <div className="flex items-center gap-1.5">
                                            {[0, 1, 2, 3, 4, 5, 6, 7].map((seg) => (
                                                <span
                                                    key={seg}
                                                    className={`h-2.5 flex-1 rounded-full ${installationAccent.segment}`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6 border-t border-white/[0.08] pt-4">
                                {!activeInstall && hasInstallationOffer && (
                                    <button
                                        type="button"
                                        onClick={onPurchaseInstallation}
                                        className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-orange-300/40 bg-orange-400 px-5 py-3 text-[10px] font-black uppercase tracking-wider text-black shadow-lg shadow-orange-500/20 transition hover:bg-orange-300 active:scale-[0.99]"
                                    >
                                        <Zap className="h-3.5 w-3.5 fill-current" />
                                        CONTRATAR INSTALAÇÃO
                                        <ArrowUpRight className="h-3.5 w-3.5" />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => onNavigate?.('install')}
                                    className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.05] hover:bg-white/10 px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-gray-200 transition duration-200"
                                >
                                    <RefreshCcw className="h-3.5 w-3.5 text-purple-400" />
                                    <span>VER DETALHES DA INSTALAÇÃO</span>
                                </button>
                            </div>
                        </article>

                        {/* CARD CHAVE DE INSTALAÇÃO (FUNDO NEUTRO UNIFICADO) */}
                        <article className="flex flex-col justify-between rounded-[2rem] border border-white/[0.08] bg-[#0B0912] p-6 shadow-2xl lg:col-span-5 relative overflow-hidden transition hover:border-purple-500/30">
                            <div className="space-y-6">
                                <div className="flex items-center gap-3">
                                    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${licenseKeyAccent.icon}`}>
                                        <KeyRound className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400">
                                            CHAVE DE INSTALAÇÃO
                                        </span>
                                        <p className="text-[11px] font-bold text-gray-400">
                                            AUTENTICAÇÃO MASTER
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between px-1">
                                        <span className={`text-[9px] font-black uppercase tracking-widest ${licenseKeyAccent.label}`}>
                                            {hasLicenseKey ? 'CHAVE ATIVA DA LICENÇA' : 'LICENÇA AINDA NÃO GERADA'}
                                        </span>
                                        <span className={`text-[9px] font-bold flex items-center gap-1 ${licenseKeyAccent.status}`}>
                                            {licenseKeyAccent.statusIcon} {licenseKeyAccent.statusText}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#06050A] p-3.5 shadow-inner">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <KeyRound className="h-4 w-4 text-purple-400 shrink-0" />
                                            <code className="truncate font-mono text-xs sm:text-sm font-black tracking-wider text-purple-200 select-all">
                                                {licenseKeyAccent.value}
                                            </code>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={copyKey}
                                            disabled={!hasLicenseKey}
                                            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-purple-400/40 bg-purple-600 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white shadow-md transition duration-200 hover:bg-purple-500 active:scale-95 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-gray-500 disabled:shadow-none"
                                        >
                                            {copiedKey ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                                            <span>{copiedKey ? 'COPIADO' : 'COPIAR'}</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6 flex items-center justify-between border-t border-white/[0.08] pt-4">
                                <span className="text-[10px] font-medium text-gray-400">
                                    {hasLicenseKey ? 'Usada para validar suas instâncias' : 'Gere uma licença para validar suas instâncias'}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => onNavigate?.('license')}
                                    className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-purple-400 transition hover:text-purple-300 hover:underline"
                                >
                                    GERENCIAR CHAVE
                                    <ArrowUpRight className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </article>
                    </div>
                </section>

                {/* BLOCO 2: ACESSO RÁPIDO & SISTEMA DEMO (JORNADA DE TESTE E GERENCIAMENTO) */}
                <section className="space-y-3 text-left">
                    <div className="flex items-center gap-2 px-1">
                        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-purple-400">
                            02. ACESSO AOS MÓDULOS & TESTE DEMO
                        </span>
                    </div>

                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                        {/* ATALHOS RÁPIDOS DOS MÓDULOS (7 COLS) */}
                        <div className="lg:col-span-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
                            {QUICK_ACCESS_ITEMS.map(({ key, icon: Icon, label, desc }) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => onQuickAccess?.(key)}
                                    className="group flex flex-col justify-between rounded-[1.75rem] border border-white/[0.08] bg-[#0B0912] p-5 transition duration-300 hover:-translate-y-1 hover:border-purple-500/40 hover:shadow-2xl text-left min-h-[130px]"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-purple-500/25 bg-purple-500/10 text-purple-400 transition duration-300 group-hover:bg-purple-600 group-hover:text-white group-hover:border-purple-500 shadow-inner">
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <ArrowUpRight className="h-4 w-4 text-gray-500 transition duration-300 group-hover:text-purple-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                                    </div>
                                    <div className="mt-4">
                                        <h3 className="font-display text-sm font-black uppercase italic tracking-tight text-white transition duration-300 group-hover:text-purple-300">
                                            {label}
                                        </h3>
                                        <p className="text-[11px] font-semibold text-gray-400">
                                            {desc}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>

                        {/* CARD SISTEMA DEMO OFICIAL (5 COLS - COMPACTO E ELEGANTE) */}
                        <article className="rounded-[2rem] border border-white/[0.08] bg-[#0B0912] p-6 shadow-2xl lg:col-span-5 flex flex-col justify-between relative overflow-hidden transition hover:border-purple-500/30">
                            <div className="space-y-4">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-3.5 py-1 text-[9px] font-black uppercase tracking-widest text-purple-300">
                                        <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                                        TESTE ANTES DE INSTALAR
                                    </span>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="font-display text-2xl font-black uppercase italic tracking-tighter text-white">
                                        SISTEMA DEMO OFICIAL
                                    </h3>
                                    <p className="text-xs text-gray-400 leading-relaxed">
                                        Simule produtos, checkout e área de membros em tempo real sem alterar nada no seu servidor.
                                    </p>
                                </div>

                                <ul className="space-y-1.5 text-[11px] font-semibold text-gray-300 pt-1">
                                    <li className="flex items-center gap-2">
                                        <span className="h-1.5 w-1.5 rounded-full bg-purple-400 shrink-0" />
                                        <span>Interface 100% real do produto</span>
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <span className="h-1.5 w-1.5 rounded-full bg-purple-400 shrink-0" />
                                        <span>Simulação de vendas e Pix</span>
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <span className="h-1.5 w-1.5 rounded-full bg-purple-400 shrink-0" />
                                        <span>Área de alunos liberada</span>
                                    </li>
                                </ul>
                            </div>

                            <div className="mt-5 pt-3 border-t border-white/[0.08]">
                                <div
                                    onClick={handleDemo}
                                    className="cursor-pointer rounded-[1.25rem] bg-white p-3.5 text-black shadow-xl transition duration-200 hover:bg-gray-100 hover:scale-[1.02] active:scale-95 flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black text-white">
                                            {effectiveDemoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current ml-0.5" />}
                                        </div>
                                        <div>
                                            <p className="text-xs font-black uppercase tracking-wider text-black">
                                                ABRIR SISTEMA DEMO
                                            </p>
                                            <p className="text-[8px] font-extrabold uppercase tracking-widest text-gray-500">
                                                NOVA ABA SEM SAIR
                                            </p>
                                        </div>
                                    </div>
                                    <ExternalLink className="h-4 w-4 text-black" />
                                 </div>
                                {effectiveDemoError && (
                                    <p className="mt-3 rounded-2xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[10px] font-medium text-red-200">
                                        {effectiveDemoError}
                                    </p>
                                )}
                             </div>
                         </article>
                    </div>
                </section>

                {/* BLOCO 3: RECURSOS DA CONTA & SEGURANÇA (UNIFICADO E DISCRETO) */}
                <section className="space-y-3 text-left">
                    <div className="flex items-center gap-2 px-1">
                        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-purple-400">
                            03. RECURSOS DA CONTA & SEGURANÇA 2FA
                        </span>
                    </div>

                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                        {/* PLANO E RECURSOS DA CONTA (6 COLS) */}
                        <article className="rounded-[2rem] border border-white/[0.08] bg-[#0B0912] p-6 shadow-2xl lg:col-span-6 flex flex-col justify-between relative overflow-hidden transition hover:border-purple-500/30">
                            <div className="space-y-5">
                                <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-400">
                                            <Crown className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-purple-400">
                                                PLANO DA CONTA
                                            </span>
                                            <h3 className="font-display text-lg font-black uppercase italic tracking-tight text-white">
                                                {planLabel}
                                            </h3>
                                        </div>
                                    </div>
                                    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-[8px] font-black uppercase tracking-widest text-emerald-400">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                        ATIVO
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-2xl border border-white/[0.08] bg-[#06050A] p-3.5 space-y-1">
                                        <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">DOMÍNIOS</span>
                                        <p className="font-display text-xl font-black italic tracking-tight text-white">{domainLimit}</p>
                                    </div>
                                    <div className="rounded-2xl border border-white/[0.08] bg-[#06050A] p-3.5 space-y-1">
                                        <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">PRODUTOS</span>
                                        <p className="font-display text-xl font-black italic tracking-tight text-white">{productLimit}</p>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-white/[0.08] bg-[#06050A] p-4 space-y-2">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">{planBenefitsTitle}</span>
                                    <ul className="text-[10px] font-bold text-gray-300 space-y-1">
                                        {planBenefits.map((benefit) => (
                                            <li key={benefit} className="flex items-center gap-1.5">
                                                <span className="h-1.5 w-1.5 rounded-full bg-purple-400 shrink-0" />
                                                <span>{benefit}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            <div className="mt-5 border-t border-white/[0.08] pt-3 flex items-center justify-between">
                                <span className="text-[10px] font-medium text-gray-400">
                                    Membro ativo desde {memberSinceLabel}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => onNavigate?.('license')}
                                    className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-purple-400 hover:text-purple-300 hover:underline"
                                >
                                    GERENCIAR PLANO
                                    <ArrowUpRight className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </article>

                        {/* PROTEÇÃO DO PORTAL / 2FA (6 COLS) */}
                        <article className={`rounded-[2rem] border bg-[#0B0912] p-6 shadow-2xl lg:col-span-6 flex flex-col justify-between relative overflow-hidden transition ${securityAccent.cardBorder}`}>
                            <div className="space-y-5">
                                <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${securityAccent.iconBorder}`}>
                                            <ShieldCheck className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <span className={`text-[9px] font-black uppercase tracking-[0.2em] ${securityAccent.label}`}>
                                                SEGURANÇA DO PORTAL
                                            </span>
                                            <h3 className="font-display text-lg font-black uppercase italic tracking-tight text-white">
                                                {isTwoFactorEnabled ? '2FA DO PORTAL ESTÁ ATIVA' : '2FA DO PORTAL PENDENTE'}
                                            </h3>
                                        </div>
                                    </div>
                                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[8px] font-black uppercase tracking-widest ${securityAccent.badge}`}>
                                        {isTwoFactorEnabled ? <Check className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
                                        {isTwoFactorEnabled ? 'PROTEGIDO' : 'CONFIGURAÇÃO PENDENTE'}
                                    </span>
                                </div>

                                <p className="text-xs text-gray-300 leading-relaxed">
                                    {isTwoFactorEnabled
                                        ? 'Novos logins e operações de reset exigem seu código temporário de 6 dígitos do autenticador.'
                                        : 'Configure o autenticador do Portal para proteger novos logins e operações de reset.'}
                                </p>

                                {isTwoFactorEnabled ? <div className="rounded-2xl border border-white/[0.08] bg-[#06050A] p-4 space-y-2.5 shadow-inner">
                                    <span className="block text-[9px] font-black uppercase tracking-widest text-gray-400">
                                        CÓDIGO ATUAL DO AUTENTICADOR (6 DÍGITOS)
                                    </span>

                                    <div className="flex items-center justify-between gap-2 max-w-xs">
                                            {otpDigits.map((digit, idx) => (
                                            <input
                                                key={idx}
                                                ref={(el) => (otpInputsRef.current[idx] = el)}
                                                type="text"
                                                inputMode="numeric"
                                                maxLength={1}
                                                value={digit}
                                                onChange={(e) => handleOtpChange(idx, e.target.value)}
                                                onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                                                className={`w-10 h-11 rounded-xl border border-white/10 bg-[#120E1C] text-center font-mono text-base font-black text-white shadow-inner outline-none transition duration-200 ${securityAccent.input}`}
                                            />
                                        ))}
                                    </div>
                                </div> : <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-4 shadow-inner">
                                    <span className="block text-[9px] font-black uppercase tracking-widest text-amber-300">
                                        CONFIGURAÇÃO NECESSÁRIA
                                    </span>
                                    <p className="mt-2 text-[11px] leading-relaxed text-gray-300">
                                        Ative a autenticação em dois fatores para liberar a proteção completa do Portal.
                                    </p>
                                </div>}
                            </div>

                            <div className="mt-5 pt-3 border-t border-white/[0.08]">
                                <button
                                    type="button"
                                    onClick={() => onNavigate?.('security')}
                                    disabled={isTwoFactorEnabled && otpDigits.join('').length !== 6}
                                    className={`inline-flex items-center gap-2 rounded-2xl border px-5 py-2.5 text-[10px] font-black uppercase tracking-wider transition duration-200 disabled:opacity-40 ${securityAccent.button}`}
                                >
                                    <Smartphone className="h-3.5 w-3.5" />
                                    <span>{isTwoFactorEnabled ? 'CONFIRMAR E TROCAR AUTENTICADOR' : 'CONFIGURAR 2FA AGORA'}</span>
                                </button>
                            </div>
                        </article>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default PreviewDashboard;

import React from 'react';
import { AlertTriangle, Calendar, Crown, Package, RefreshCcw, UserCheck } from 'lucide-react';
import { License } from '../../../services/licenseService';
import { useTranslation } from 'react-i18next';

interface BlockPlanInfoProps {
    license: License | null;
    licenseLoadError?: string | null;
    userName?: string;
    userCreatedAt?: string | null;
    isPlatformOwner?: boolean;
}

const formatMemberSince = (value: string | null | undefined, language: string, fallback: string) => {
    if (!value) return fallback;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    const normalizedLanguage = language.toLowerCase();

    return date.toLocaleDateString(
        normalizedLanguage.startsWith('en') ? 'en-US' : normalizedLanguage.startsWith('es') ? 'es-ES' : 'pt-BR',
        { month: 'long', year: 'numeric' }
    );
};

const getPlanBenefits = (license: License | null, t: any, isPlatformOwner: boolean): string[] => {
    if (isPlatformOwner) {
        return [
            t('plan_info.benefits.owner_global'),
            t('plan_info.benefits.owner_operations'),
        ];
    }

    if (!license) return [];

    if (license.plan === 'whitelabel') {
        return [
            t('plan_info.benefits.unlimited_resources'),
            t('plan_info.benefits.whitelabel'),
        ];
    }

    if (license.has_partner_panel && license.has_unlimited_domains) {
        return [
            t('plan_info.benefits.unlimited_resources'),
            t('plan_info.benefits.partner_services'),
        ];
    }

    if (license.has_partner_panel || license.plan === 'saas') {
        return [
            t('plan_info.benefits.partner_services'),
            t('plan_info.benefits.partner_orders'),
        ];
    }

    if (license.has_unlimited_domains || license.plan === 'upgrade_domains') {
        return [
            t('plan_info.benefits.unlimited_resources'),
            t('plan_info.benefits.unlimited_domains'),
        ];
    }

    return [
        t('plan_info.benefits.free_resources'),
        t('plan_info.benefits.free_installation'),
    ];
};

export const BlockPlanInfo: React.FC<BlockPlanInfoProps> = ({
    license,
    licenseLoadError = null,
    userName,
    userCreatedAt,
    isPlatformOwner = false,
}) => {
    const { t, i18n } = useTranslation('portal');
    const planLabel =
        isPlatformOwner
            ? t('plan_info.platform_owner')
            : license?.plan === 'whitelabel'
                ? t('plan_info.whitelabel')
                : license?.has_partner_panel && license?.has_unlimited_domains
                    ? `${t('plan_info.partner')} + ${t('plan_info.unlimited')}`
                    : license?.has_partner_panel || license?.plan === 'saas'
                        ? t('plan_info.partner')
                        : license?.has_unlimited_domains || license?.plan === 'upgrade_domains'
                            ? t('plan_info.unlimited')
                            : license?.plan || t('plan_info.free_account');

    const memberSince = formatMemberSince(
        license?.created_at || userCreatedAt,
        i18n.language,
        t('plan_info.date_unavailable')
    );
    const planBenefits = getPlanBenefits(license, t, isPlatformOwner);
    const isActive = isPlatformOwner || license?.status === 'active';

    if (!license && !isPlatformOwner) {
        if (licenseLoadError) {
            return (
                <article className="rounded-[2rem] border border-amber-500/40 bg-[#140C10] p-6 shadow-2xl relative overflow-hidden flex flex-col justify-between text-left">
                    <div className="space-y-6">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-500/40 bg-amber-500/10 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                                    <AlertTriangle className="h-5 w-5" />
                                </div>
                                <div>
                                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-400">
                                        {t('plan_info.title')}
                                    </span>
                                    <h3 className="font-display text-xl font-black uppercase italic tracking-tight text-white">
                                        Status da licença indisponível
                                    </h3>
                                </div>
                            </div>
                            <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/15 px-4 py-1.5 text-[9px] font-black uppercase tracking-widest text-amber-300">
                                INDISPONÍVEL
                            </span>
                        </div>

                        <div className="space-y-2">
                            <span className="text-[9px] font-black uppercase tracking-widest text-amber-400 px-1">
                                ERRO DE CONFIGURAÇÃO DO SERVIDOR
                            </span>
                            <div className="rounded-2xl border border-amber-500/30 bg-[#0B0A12] p-4 shadow-inner">
                                <code className="block font-mono text-xs font-bold text-amber-200 leading-relaxed select-all">
                                    {licenseLoadError}
                                </code>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 px-1">
                                AVISO DE CLASSIFICAÇÃO DA CONTA
                            </span>
                            <div className="rounded-2xl border border-white/[0.08] bg-[#0B0A12] p-4 shadow-inner">
                                <p className="text-xs font-bold text-amber-300/90 leading-relaxed">
                                    A conta não foi classificada como gratuita enquanto a consulta não for concluída.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 border-t border-white/[0.08] pt-4">
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 px-5 py-2.5 text-[10px] font-black uppercase tracking-wider text-amber-300 transition duration-200"
                        >
                            <RefreshCcw className="h-3.5 w-3.5" />
                            <span>TENTAR NOVAMENTE</span>
                        </button>
                    </div>
                </article>
            );
        }

        return (
            <article className="rounded-[2rem] border border-white/10 bg-[#0E0C18] p-6 shadow-2xl text-left space-y-4">
                <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
                    <div>
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400">
                            {t('plan_info.title')}
                        </span>
                        <h3 className="font-display text-xl font-black uppercase italic tracking-tight text-white mt-0.5">
                            {t('plan_info.free_account')}
                        </h3>
                    </div>
                    <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3.5 py-1 text-[9px] font-black uppercase tracking-widest text-amber-300">
                        {t('plan_info.pending')}
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-white/[0.08] bg-[#0B0A12] p-4 space-y-1.5 shadow-inner">
                        <div className="flex items-center gap-2 text-gray-400">
                            <Package className="h-4 w-4" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">{t('plan_info.profile')}</span>
                        </div>
                        <p className="font-display text-xs font-black uppercase italic tracking-tight text-white">{t('plan_info.free_account')}</p>
                    </div>
                    <div className="rounded-2xl border border-white/[0.08] bg-[#0B0A12] p-4 space-y-1.5 shadow-inner">
                        <div className="flex items-center gap-2 text-amber-400">
                            <UserCheck className="h-4 w-4" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">{t('plan_info.current_status')}</span>
                        </div>
                        <p className="font-display text-xs font-black uppercase italic tracking-tight text-amber-300">{t('plan_info.no_license')}</p>
                    </div>
                </div>

                <button
                    type="button"
                    className="mt-3 flex w-full items-center justify-between rounded-2xl border border-purple-500/30 bg-purple-500/10 p-4 text-left transition hover:bg-purple-500/20"
                    onClick={() => window.dispatchEvent(new CustomEvent('nav-to-tab', { detail: 'license' }))}
                >
                    <span className="text-[10px] font-black uppercase tracking-wider text-purple-300">{t('plan_info.action_required')}</span>
                    <span className="text-xs font-bold text-gray-300">{t('plan_info.generate_license_prompt')}</span>
                </button>
            </article>
        );
    }

    return (
        <article className="rounded-[2rem] border border-purple-500/30 bg-[#120B20] p-6 shadow-2xl relative overflow-hidden flex flex-col justify-between text-left space-y-6">
            <div className="space-y-6">
                <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-purple-500/40 bg-purple-500/10 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.15)]">
                            <Crown className="h-5 w-5" />
                        </div>
                        <div>
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-purple-400">
                                {t('plan_info.title')}
                            </span>
                            <h3 className="font-display text-xl font-black uppercase italic tracking-tight text-white">
                                {planLabel}
                            </h3>
                        </div>
                    </div>
                    <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[9px] font-black uppercase tracking-widest ${isActive ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.25)]' : 'border-red-500/40 bg-red-500/15 text-red-300'}`}>
                        <span className={`h-2 w-2 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                        {isActive ? t('plan_info.active') : t('plan_info.inactive')}
                    </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="rounded-2xl border border-white/[0.08] bg-[#0B0A12] p-4 space-y-2 shadow-inner">
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-400">
                                <Package className="h-4 w-4" />
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                                {t('plan_info.profile')}
                            </span>
                        </div>
                        <p className="font-display text-xs font-black uppercase italic tracking-tight text-white pt-0.5 truncate">
                            {planLabel}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-white/[0.08] bg-[#0B0A12] p-4 space-y-2 shadow-inner">
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                                <UserCheck className="h-4 w-4" />
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                                {t('plan_info.current_status')}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 pt-0.5">
                            <span className={`h-2 w-2 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                            <p className={`font-display text-xs font-black uppercase italic tracking-tight ${isActive ? 'text-emerald-400' : 'text-red-300'}`}>
                                {isActive ? t('plan_info.active') : t('plan_info.inactive')}
                            </p>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/[0.08] bg-[#0B0A12] p-4 space-y-2 shadow-inner">
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-400">
                                <Calendar className="h-4 w-4" />
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                                {t('plan_info.member_since')}
                            </span>
                        </div>
                        <p className="font-display text-xs font-black uppercase italic tracking-tight text-white pt-0.5 truncate">
                            {memberSince}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-white/[0.08] bg-[#0B0A12] p-4 space-y-2 shadow-inner">
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
                                <Crown className="h-4 w-4" />
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                                {t('plan_info.benefits.title')}
                            </span>
                        </div>
                        <ul className="text-[10px] font-bold text-gray-300 space-y-1 pt-0.5">
                            {planBenefits.map((benefit) => (
                                <li key={benefit} className="flex items-center gap-1.5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-purple-400 shrink-0" />
                                    <span className="truncate">{benefit}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </article>
    );
};

export default BlockPlanInfo;

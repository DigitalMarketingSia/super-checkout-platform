import React, { useEffect, useState } from 'react';
import { ArrowRight, Boxes, Clock3, Loader2, Package, RefreshCcw, RotateCcw, ShieldCheck, ShoppingCart, Sparkles, UserRound, Workflow } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { platformUrls } from '../../config/platformUrls';
import { centralSupabase } from '../../services/centralClient';
import { demoDataService } from '../../services/demoDataService';
import { demoWorkspaceService } from '../../services/demoWorkspaceService';
import type { DemoWorkspaceResponse } from '../../types/demoWorkspace';

type LauncherState = 'loading' | 'ready' | 'error';

const formatDateTime = (value?: string | null) => {
    if (!value) return '--';

    try {
        return new Intl.DateTimeFormat('pt-BR', {
            dateStyle: 'short',
            timeStyle: 'short',
        }).format(new Date(value));
    } catch {
        return value;
    }
};

export const DemoWorkspaceLauncher: React.FC = () => {
    const { t } = useTranslation('portal');
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const showLaunchpad = searchParams.get('launchpad') === '1';
    const [state, setState] = useState<LauncherState>('loading');
    const [email, setEmail] = useState('');
    const [workspacePayload, setWorkspacePayload] = useState<DemoWorkspaceResponse | null>(
        demoWorkspaceService.getCachedWorkspace()
    );
    const [busyAction, setBusyAction] = useState<'ensure' | 'refresh' | 'reset' | null>(null);
    const [feedback, setFeedback] = useState('');

    const loadWorkspace = async (mode: 'ensure' | 'refresh' | 'reset') => {
        setBusyAction(mode);
        setFeedback('');
        const previousWorkspaceId = workspacePayload?.workspace?.id || demoWorkspaceService.getCachedWorkspace()?.workspace?.id || null;

        try {
            const response = mode === 'reset'
                ? await demoWorkspaceService.resetWorkspace()
                : mode === 'refresh'
                    ? await demoWorkspaceService.ensureWorkspace()
                    : await demoWorkspaceService.ensureWorkspace();

            if (mode === 'reset') {
                demoDataService.clearWorkspaceRuntime(previousWorkspaceId);
                demoDataService.clearWorkspaceRuntime(response.workspace?.id || null);
            }

            setWorkspacePayload(response);
            setState('ready');
            setFeedback(mode === 'reset'
                ? t('basic_dashboard.demo.launchpad.feedback_reset')
                : t('basic_dashboard.demo.launchpad.feedback_ready'));
            return response;
        } catch (error: any) {
            setState('error');
            setFeedback(error?.message || t('basic_dashboard.demo.error'));
            return null;
        } finally {
            setBusyAction(null);
        }
    };

    useEffect(() => {
        let cancelled = false;

        const bootstrap = async () => {
            try {
                const { data, error } = await centralSupabase.auth.getUser();

                if (error || !data?.user) {
                    throw new Error('missing_demo_session');
                }

                if (cancelled) return;

                setEmail(data.user.email || '');
                const response = await loadWorkspace(workspacePayload ? 'refresh' : 'ensure');
                if (!cancelled && response && !showLaunchpad) {
                    navigate('/admin', { replace: true });
                }
            } catch {
                if (cancelled) return;
                setState('error');
            }
        };

        void bootstrap();

        return () => {
            cancelled = true;
        };
    }, [navigate, showLaunchpad]);

    const isLoading = state === 'loading';
    const isReady = state === 'ready';
    const workspace = workspacePayload?.workspace || null;
    const summary = workspacePayload?.summary || null;

    return (
        <div className="min-h-screen bg-[#05050A] px-6 py-10 text-white">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
                <section className="relative overflow-hidden rounded-[2.5rem] border border-primary/20 bg-white/[0.03] p-8 md:p-12">
                    <div className="absolute inset-y-0 right-0 w-80 bg-gradient-to-l from-primary/10 to-transparent" />

                    <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-3xl">
                            <p className="text-[11px] font-black uppercase tracking-[0.4em] text-primary/70">
                                {t('basic_dashboard.demo.launchpad.eyebrow')}
                            </p>
                            <h1 className="mt-4 font-display text-4xl font-black italic uppercase tracking-tighter text-white md:text-6xl">
                                {t('basic_dashboard.demo.launchpad.title')}
                            </h1>
                            <p className="mt-5 max-w-2xl text-base leading-relaxed text-gray-400">
                                {isLoading
                                    ? t('basic_dashboard.demo.launchpad.loading')
                                    : isReady
                                        ? t('basic_dashboard.demo.launchpad.workspace_ready')
                                        : t('basic_dashboard.demo.launchpad.no_session')}
                            </p>
                        </div>

                        <div className={`inline-flex items-center gap-3 rounded-full border px-5 py-3 text-[11px] font-black uppercase tracking-[0.25em] ${
                            isReady
                                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                                : state === 'error'
                                    ? 'border-red-500/20 bg-red-500/10 text-red-300'
                                    : 'border-white/10 bg-white/5 text-gray-300'
                        }`}>
                            {isLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <ShieldCheck className="h-4 w-4" />
                            )}
                            <span>
                                {isReady
                                    ? t('basic_dashboard.demo.launchpad.status_ready')
                                    : state === 'error'
                                        ? t('basic_dashboard.demo.launchpad.status_error')
                                        : t('basic_dashboard.demo.launchpad.loading')}
                            </span>
                        </div>
                    </div>
                </section>

                <section className="grid gap-6 lg:grid-cols-3">
                    <article className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <Sparkles className="h-6 w-6" />
                        </div>
                        <p className="mt-5 text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">
                            {t('basic_dashboard.demo.launchpad.safe_flow')}
                        </p>
                        <p className="mt-3 text-sm leading-relaxed text-gray-400">
                            {t('basic_dashboard.demo.description')}
                        </p>
                    </article>

                    <article className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <UserRound className="h-6 w-6" />
                        </div>
                        <p className="mt-5 text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">
                            {t('basic_dashboard.demo.launchpad.workspace_rule')}
                        </p>
                        <p className="mt-3 text-sm leading-relaxed text-gray-400">
                            {email
                                ? t('basic_dashboard.demo.launchpad.signed_as', { email })
                                : t('basic_dashboard.demo.bullets.members')}
                        </p>
                    </article>

                    <article className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <Clock3 className="h-6 w-6" />
                        </div>
                        <p className="mt-5 text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">
                            {t('basic_dashboard.demo.launchpad.retention_rule')}
                        </p>
                        <p className="mt-3 text-sm leading-relaxed text-gray-400">
                            {t('basic_dashboard.demo.retention')}
                        </p>
                    </article>
                </section>

                {workspace && summary && (
                    <>
                        <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 md:p-8">
                            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                                <div className="max-w-3xl">
                                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/70">
                                        {t('basic_dashboard.demo.launchpad.workspace_title')}
                                    </p>
                                    <h2 className="mt-3 text-2xl font-black italic uppercase tracking-tighter text-white">
                                        {workspace.seed_payload.business.name}
                                    </h2>
                                    <p className="mt-3 text-sm leading-relaxed text-gray-400">
                                        {workspace.seed_payload.business.niche} • {workspace.seed_payload.business.support_email}
                                    </p>
                                </div>

                                <div className="flex flex-wrap gap-3">
                                    <button
                                        onClick={() => void loadWorkspace('refresh')}
                                        disabled={Boolean(busyAction)}
                                        className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {busyAction === 'refresh' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                                        {t('basic_dashboard.demo.launchpad.actions.refresh')}
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (window.confirm(t('basic_dashboard.demo.launchpad.reset_confirm'))) {
                                                void loadWorkspace('reset');
                                            }
                                        }}
                                        disabled={Boolean(busyAction)}
                                        className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-black transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {busyAction === 'reset' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                                        {t('basic_dashboard.demo.launchpad.actions.reset')}
                                    </button>
                                </div>
                            </div>

                            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                <div className="rounded-2xl border border-white/10 bg-[#0A0A0F]/70 p-5">
                                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">
                                        {t('basic_dashboard.demo.launchpad.labels.workspace_id')}
                                    </p>
                                    <p className="mt-3 break-all text-sm font-mono text-white/80">
                                        {workspace.id}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-[#0A0A0F]/70 p-5">
                                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">
                                        {t('basic_dashboard.demo.launchpad.labels.expires_at')}
                                    </p>
                                    <p className="mt-3 text-sm text-white/80">
                                        {formatDateTime(workspace.expires_at)}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-[#0A0A0F]/70 p-5">
                                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">
                                        {t('basic_dashboard.demo.launchpad.labels.reset_count')}
                                    </p>
                                    <p className="mt-3 text-sm text-white/80">
                                        {workspace.reset_count}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-[#0A0A0F]/70 p-5">
                                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">
                                        {t('basic_dashboard.demo.launchpad.labels.storage_prefix')}
                                    </p>
                                    <p className="mt-3 break-all text-sm font-mono text-white/80">
                                        {workspace.storage_prefix || '--'}
                                    </p>
                                </div>
                            </div>

                            {feedback && (
                                <p className="mt-5 text-sm text-emerald-300">
                                    {feedback}
                                </p>
                            )}
                        </section>

                        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                                <Package className="h-5 w-5 text-primary" />
                                <p className="mt-4 text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">
                                    {t('basic_dashboard.demo.launchpad.summary.products')}
                                </p>
                                <p className="mt-2 text-3xl font-black italic text-white">
                                    {summary.products}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                                <ShoppingCart className="h-5 w-5 text-primary" />
                                <p className="mt-4 text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">
                                    {t('basic_dashboard.demo.launchpad.summary.checkouts')}
                                </p>
                                <p className="mt-2 text-3xl font-black italic text-white">
                                    {summary.checkouts}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                                <Boxes className="h-5 w-5 text-primary" />
                                <p className="mt-4 text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">
                                    {t('basic_dashboard.demo.launchpad.summary.orders')}
                                </p>
                                <p className="mt-2 text-3xl font-black italic text-white">
                                    {summary.orders}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                                <UserRound className="h-5 w-5 text-primary" />
                                <p className="mt-4 text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">
                                    {t('basic_dashboard.demo.launchpad.summary.member_modules')}
                                </p>
                                <p className="mt-2 text-3xl font-black italic text-white">
                                    {summary.member_modules}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                                <Workflow className="h-5 w-5 text-primary" />
                                <p className="mt-4 text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">
                                    {t('basic_dashboard.demo.launchpad.summary.integrations')}
                                </p>
                                <p className="mt-2 text-3xl font-black italic text-white">
                                    {summary.integrations}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                                <Sparkles className="h-5 w-5 text-primary" />
                                <p className="mt-4 text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">
                                    {t('basic_dashboard.demo.launchpad.summary.domains')}
                                </p>
                                <p className="mt-2 text-3xl font-black italic text-white">
                                    {summary.domains}
                                </p>
                            </div>
                        </section>

                        <section className="grid gap-6 xl:grid-cols-2">
                            <article className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6">
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/70">
                                    {t('basic_dashboard.demo.launchpad.sections.products')}
                                </p>
                                <div className="mt-5 space-y-3">
                                    {workspace.seed_payload.products.map((product) => (
                                        <div key={product.id} className="rounded-2xl border border-white/10 bg-[#0A0A0F]/70 p-4">
                                            <p className="font-black uppercase tracking-tight text-white">{product.name}</p>
                                            <p className="mt-2 text-sm text-gray-400">
                                                {product.kind} • R$ {product.price_brl.toFixed(2)} • {product.status}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </article>

                            <article className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6">
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/70">
                                    {t('basic_dashboard.demo.launchpad.sections.member_area')}
                                </p>
                                <div className="mt-5 rounded-2xl border border-white/10 bg-[#0A0A0F]/70 p-4">
                                    <p className="font-black uppercase tracking-tight text-white">
                                        {workspace.seed_payload.member_area.name}
                                    </p>
                                    <p className="mt-2 text-sm text-gray-400">
                                        {workspace.seed_payload.member_area.creator_name} • {workspace.seed_payload.member_area.student_email}
                                    </p>
                                    <div className="mt-4 space-y-2">
                                        {workspace.seed_payload.member_area.modules.map((module) => (
                                            <div key={module.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
                                                <span className="text-white/90">{module.title}</span>
                                                <span className="text-gray-500">{module.lesson_count} aulas</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </article>

                            <article className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6">
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/70">
                                    {t('basic_dashboard.demo.launchpad.sections.orders')}
                                </p>
                                <div className="mt-5 space-y-3">
                                    {workspace.seed_payload.orders.map((order) => (
                                        <div key={order.id} className="rounded-2xl border border-white/10 bg-[#0A0A0F]/70 p-4">
                                            <p className="font-black uppercase tracking-tight text-white">{order.customer_name}</p>
                                            <p className="mt-2 text-sm text-gray-400">
                                                {order.scenario} • {order.payment_method} • R$ {order.total_brl.toFixed(2)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </article>

                            <article className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6">
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/70">
                                    {t('basic_dashboard.demo.launchpad.sections.integrations')}
                                </p>
                                <div className="mt-5 space-y-3">
                                    {workspace.seed_payload.integrations.map((integration) => (
                                        <div key={integration.id} className="rounded-2xl border border-white/10 bg-[#0A0A0F]/70 p-4">
                                            <p className="font-black uppercase tracking-tight text-white">{integration.provider}</p>
                                            <p className="mt-2 text-sm text-gray-400">
                                                {integration.category} • {integration.status}
                                            </p>
                                            <p className="mt-2 text-xs leading-relaxed text-gray-500">
                                                {integration.note}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </article>
                        </section>
                    </>
                )}

                <section className="rounded-[2rem] border border-dashed border-white/10 bg-[#0A0A0F]/70 p-6 md:p-8">
                    <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                        <div className="max-w-2xl">
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/70">
                                FASE 38.2
                            </p>
                            <h2 className="mt-3 text-2xl font-black italic uppercase tracking-tighter text-white">
                                {t('basic_dashboard.demo.launchpad.next_title')}
                            </h2>
                            <p className="mt-3 text-sm leading-relaxed text-gray-400">
                                {t('basic_dashboard.demo.launchpad.next_description')}
                            </p>
                        </div>

                        <a
                            href={`${platformUrls.portal}/activate`}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-black transition-colors hover:bg-gray-200"
                        >
                            {t('basic_dashboard.demo.launchpad.back_portal')}
                            <ArrowRight className="h-4 w-4" />
                        </a>
                    </div>
                </section>
            </div>
        </div>
    );
};

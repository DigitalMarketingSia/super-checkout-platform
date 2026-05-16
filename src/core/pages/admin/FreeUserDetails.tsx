import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../services/supabase';
import { subscriptionService } from '../../services/subscriptionService';
import { useAuth } from '../../context/AuthContext';
import { Layout } from '../../components/Layout';
import { toast } from 'sonner';
import { AccessLogsModal } from '../../components/admin/members/AccessLogsModal';
import { SendEmailModal } from '../../components/admin/members/SendEmailModal';
import {
    ArrowLeft,
    User,
    Mail,
    Calendar,
    Shield,
    Ban,
    Unlock,
    Trash2,
    Activity,
    Globe,
    CreditCard,
    CheckCircle,
    XCircle,
    AlertTriangle
} from 'lucide-react';
import { Loading } from '../../components/ui/Loading';

interface UserDetails {
    id: string;
    email: string;
    full_name?: string;
    created_at: string;
    last_login_at?: string;
    signup_source?: string;
    status: 'active' | 'suspended' | 'disabled';
    is_blocked: boolean;
    blocked_at?: string;
    avatar_url?: string;
    onboarding?: {
        domain_configured: boolean;
        gateway_configured: boolean;
        webhook_configured: boolean;
        setup_completed: boolean;
        updated_at: string;
    };
    subscription?: {
        status: string;
        started_at: string;
        plan: {
            name: string;
            slug: string;
        };
    };
}

export const FreeUserDetails: React.FC = () => {
    const { t } = useTranslation('admin');
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { isWhiteLabel, profile } = useAuth();
    const effectiveRole = profile?.effective_role || profile?.role;
    const isSystemOwner = effectiveRole === 'master_admin';
    const [user, setUser] = useState<UserDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [showLogs, setShowLogs] = useState(false);
    const [showEmailModal, setShowEmailModal] = useState(false);

    useEffect(() => {
        if (id) fetchUserDetails();
    }, [id]);

    const fetchUserDetails = async () => {
        try {
            setLoading(true);

            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch('/api/central/manage-licenses', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
                },
                body: JSON.stringify({
                    action: 'get_crm_user_details',
                    user_id: id
                })
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error || t('free_user_details.errors.load_details'));

            const { profile: profileData, onboarding: onboardingData, subscription: subData } = result;

            if (!profileData) throw new Error(t('free_user_details.errors.not_found'));

            // Defensive mapping for plan object/array
            let subscription: any = null;
            if (subData) {
                const plan = Array.isArray(subData.plan) ? subData.plan[0] : subData.plan;
                subscription = {
                    ...subData,
                    plan: plan || { name: t('free_user_details.plan.free_lead'), slug: 'free' }
                };
            }

            setUser({
                ...profileData,
                onboarding: onboardingData,
                subscription
            });

        } catch (error) {
            console.error('Error details:', error);
            toast.error(t('free_user_details.errors.load_user'));
            navigate('/admin/free-users');
        } finally {
            setLoading(false);
        }
    };

    const handleBlockToggle = async () => {
        if (!user) return;
        try {
            setProcessing(true);
            const newBlockedState = !user.is_blocked;

            const updates = {
                is_blocked: newBlockedState,
                blocked_at: newBlockedState ? new Date().toISOString() : null,
                status: newBlockedState ? 'suspended' : 'active'
            };

            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch('/api/central/manage-licenses', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
                },
                body: JSON.stringify({
                    action: 'update_profile',
                    user_id: user.id,
                    updates
                })
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error || t('free_user_details.errors.update'));

            setUser(prev => prev ? ({ ...prev, ...updates }) : null);
            toast.success(newBlockedState ? t('free_user_details.toasts.blocked') : t('free_user_details.toasts.unblocked'));

        } catch (error: any) {
            console.error('Error blocking user:', error);
            toast.error(t('free_user_details.toasts.status_error', { message: error.message }));
        } finally {
            setProcessing(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm(t('free_user_details.confirm.delete'))) return;

        try {
            setProcessing(true);

            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch('/api/central/manage-licenses', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
                },
                body: JSON.stringify({
                    action: 'soft_delete_user',
                    user_id: user!.id
                })
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error || t('free_user_details.errors.delete'));

            toast.success(t('free_user_details.toasts.deleted'));
            navigate('/admin/free-users');

        } catch (error: any) {
            console.error('Delete error:', error);
            toast.error(t('free_user_details.toasts.delete_error', { message: error.message }));
        } finally {
            setProcessing(false);
        }
    };

    const handleUpgrade = async () => {
        if (!user) return;
        if (user.subscription?.plan.slug === 'whitelabel') {
            toast.error(t('free_user_details.toasts.already_lifetime'));
            return;
        }

        if (!window.confirm(t('free_user_details.confirm.upgrade'))) return;

        try {
            setProcessing(true);
            await subscriptionService.promoteToVitalicia(user.id);
            toast.success(t('free_user_details.toasts.upgraded'));
            fetchUserDetails(); // Refresh data
        } catch (error: any) {
            toast.error(error.message || t('free_user_details.errors.upgrade'));
        } finally {
            setProcessing(false);
        }
    };

    // Card styling based on plan
    const planConfig = (() => {
        const slug = user?.subscription?.plan.slug || 'free';
        switch (slug) {
            case 'free':
                return {
                    bg: 'bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-green-900/20',
                    label: 'FREE',
                    subtext: 'text-green-100',
                    btn: 'bg-white text-green-900 hover:bg-green-50'
                };
            case 'partner':
                return {
                    bg: 'bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-orange-900/20',
                    label: 'PARCEIRO',
                    subtext: 'text-orange-100',
                    btn: 'bg-white text-orange-900 hover:bg-orange-50'
                };
            case 'upgrade_domains':
                return {
                    bg: 'bg-gradient-to-br from-indigo-700 to-purple-800 text-white shadow-indigo-900/20',
                    label: 'UNLIMITED',
                    subtext: 'text-indigo-100',
                    btn: 'bg-white text-indigo-900 hover:bg-indigo-50'
                };
            case 'whitelabel':
                return {
                    bg: 'bg-gradient-to-br from-indigo-900 to-purple-900 text-white shadow-indigo-900/20',
                    label: 'VITALÍCIA',
                    subtext: 'text-purple-100',
                    btn: 'bg-white text-purple-900 hover:bg-purple-50'
                };
            default:
                return {
                    bg: 'bg-gradient-to-br from-slate-700 to-slate-800 text-white shadow-slate-900/20',
                    label: 'PRO',
                    subtext: 'text-slate-100',
                    btn: 'bg-white text-slate-900 hover:bg-slate-50'
                };
        }
    })();

    // Guard
    if (isWhiteLabel) return null;
    if (!isSystemOwner && effectiveRole !== 'owner' && effectiveRole !== 'master_admin') return <div>{t('free_user_details.access_denied')}</div>;

    if (loading) return <Loading />;
    if (!user) return <div className="p-8 text-center">{t('free_user_details.not_found')}</div>;

    return (
        <Layout>
            <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in pb-20">

                {/* Header / Nav */}
                <div className="flex items-center gap-4">
                    <Link
                        to="/admin/free-users"
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-gray-500" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            {user.full_name || t('free_user_details.unnamed_user')}
                            {user.is_blocked && (
                                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full border border-red-200">
                                    {t('free_user_details.blocked_badge')}
                                </span>
                            )}
                        </h1>
                        <p className="text-sm text-gray-500 flex items-center gap-2">
                            <span className="font-mono text-xs text-gray-400">{user.id}</span>
                            <span>&bull;</span>
                            <span className="text-primary">{user.email}</span>
                        </p>
                    </div>

                    <div className="ml-auto flex items-center gap-2">
                        <button
                            onClick={handleBlockToggle}
                            disabled={processing}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${user.is_blocked
                                ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-900/20'
                                : 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/30'
                                }`}
                        >
                            {processing ? <Activity className="w-4 h-4 animate-spin" /> : user.is_blocked ? <Unlock className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                            {user.is_blocked ? t('free_user_details.actions.unblock') : t('free_user_details.actions.block')}
                        </button>

                        <button
                            onClick={handleDelete}
                            disabled={processing}
                            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                            title={t('free_user_details.actions.delete')}
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Main Info Card */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white dark:bg-[#1A1A2E] rounded-xl border border-gray-200 dark:border-white/5 p-6 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                <User className="w-5 h-5 text-primary" />
                                {t('free_user_details.sections.personal_data')}
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-4">
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-500 uppercase font-semibold">{t('free_user_details.fields.full_name')}</label>
                                    <p className="font-medium">{user.full_name || '-'}</p>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-500 uppercase font-semibold">{t('free_user_details.fields.email')}</label>
                                    <div className="flex items-center gap-2">
                                        <Mail className="w-3 h-3 text-gray-400" />
                                        <a href={`mailto:${user.email}`} className="text-blue-500 hover:underline">{user.email}</a>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-500 uppercase font-semibold">{t('free_user_details.fields.source')}</label>
                                    <p className="font-mono text-sm bg-gray-100 dark:bg-white/5 inline-block px-2 py-1 rounded">
                                        {user.signup_source || t('free_user_details.unknown_source')}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-500 uppercase font-semibold">{t('free_user_details.fields.created_at')}</label>
                                    <div className="flex items-center gap-2">
                                        <Calendar className="w-3 h-3 text-gray-400" />
                                        <span>{new Date(user.created_at).toLocaleString()}</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-500 uppercase font-semibold">{t('free_user_details.fields.last_access')}</label>
                                    <div className="flex items-center gap-2">
                                        <Activity className="w-3 h-3 text-primary" />
                                        <span>{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : t('free_user_details.never_accessed')}</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-500 uppercase font-semibold">{t('free_user_details.fields.account_status')}</label>
                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${user.status === 'active'
                                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                        }`}>
                                        {t(`free_user_details.status.${user.status}`)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Setup Progress */}
                        <div className="bg-white dark:bg-[#1A1A2E] rounded-xl border border-gray-200 dark:border-white/5 p-6 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                <Activity className="w-5 h-5 text-green-500" />
                                {t('free_user_details.sections.onboarding_progress')}
                            </h3>

                            {user.onboarding ? (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-white/5">
                                        <div className="flex items-center gap-3">
                                            <Globe className={`w-5 h-5 ${user.onboarding.domain_configured ? 'text-green-500' : 'text-gray-400'}`} />
                                            <div>
                                                <p className="font-medium text-sm">{t('free_user_details.onboarding.domain_title')}</p>
                                                <p className="text-xs text-gray-500">{t('free_user_details.onboarding.domain_desc')}</p>
                                            </div>
                                        </div>
                                        {user.onboarding.domain_configured ? <CheckCircle className="w-5 h-5 text-green-500" /> : <XCircle className="w-5 h-5 text-gray-400" />}
                                    </div>

                                    <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-white/5">
                                        <div className="flex items-center gap-3">
                                            <CreditCard className={`w-5 h-5 ${user.onboarding.gateway_configured ? 'text-green-500' : 'text-gray-400'}`} />
                                            <div>
                                                <p className="font-medium text-sm">{t('free_user_details.onboarding.gateway_title')}</p>
                                                <p className="text-xs text-gray-500">{t('free_user_details.onboarding.gateway_desc')}</p>
                                            </div>
                                        </div>
                                        {user.onboarding.gateway_configured ? <CheckCircle className="w-5 h-5 text-green-500" /> : <XCircle className="w-5 h-5 text-gray-400" />}
                                    </div>

                                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-white/5">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-gray-500">{t('free_user_details.onboarding.setup_complete')}</span>
                                            <span className={`font-bold ${user.onboarding.setup_completed ? 'text-green-500' : 'text-orange-500'}`}>
                                                {user.onboarding.setup_completed ? t('free_user_details.onboarding.ready') : t('free_user_details.onboarding.pending')}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-4 bg-orange-50 dark:bg-orange-900/10 text-orange-600 rounded-lg flex items-center gap-2 text-sm">
                                    <AlertTriangle className="w-4 h-4" />
                                    {t('free_user_details.onboarding.missing')}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sidebar Actions / Plan */}
                    <div className="space-y-6">
                        <div className={`rounded-xl p-6 shadow-lg relative overflow-hidden transition-all duration-500 ${planConfig.bg}`}>
                            {/* Background Pattern */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>

                            <h3 className="font-bold text-lg mb-4 relative z-10 text-white">{t('free_user_details.sections.current_plan')}</h3>

                            <div className="text-center py-4 relative z-10">
                                <p className="text-4xl font-extrabold tracking-tight">
                                    {planConfig.label}
                                </p>
                                <p className={`${planConfig.subtext} text-sm mt-1 uppercase font-semibold`}>
                                    {user.subscription?.plan.name || t('free_user_details.plan.base_platform')}
                                </p>
                            </div>

                            <div className="space-y-2 mt-4 relative z-10">
                                <div className="flex justify-between text-sm opacity-90">
                                    <span>{t('free_user_details.fields.status')}</span>
                                    <span className="font-bold bg-white/20 px-2 rounded uppercase">{user.subscription?.status || t('free_user_details.status.active')}</span>
                                </div>
                                <div className="flex justify-between text-sm opacity-90">
                                    <span>{t('free_user_details.fields.started_at')}</span>
                                    <span>{user.subscription?.started_at ? new Date(user.subscription.started_at).toLocaleDateString() : '-'}</span>
                                </div>
                            </div>

                            <button
                                onClick={handleUpgrade}
                                disabled={processing || user.subscription?.plan.slug === 'whitelabel'}
                                className={`w-full mt-6 font-bold py-3 rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2 ${user.subscription?.plan.slug === 'whitelabel'
                                    ? 'bg-white/20 text-white cursor-not-allowed'
                                    : planConfig.btn
                                    }`}
                            >
                                <Shield className="w-4 h-4" />
                                {user.subscription?.plan.slug === 'whitelabel' ? t('free_user_details.actions.lifetime_active') : t('free_user_details.actions.force_upgrade')}
                            </button>
                        </div>

                        {/* Quick Actions */}
                        <div className="bg-white dark:bg-[#1A1A2E] rounded-xl border border-gray-200 dark:border-white/5 p-4 shadow-sm space-y-2">
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 pl-2">{t('free_user_details.sections.quick_actions')}</h4>

                            <button
                                onClick={() => setShowEmailModal(true)}
                                className="w-full flex items-center justify-center gap-2 p-3 bg-white/5 border border-white/5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                <Mail className="w-4 h-4" />
                                {t('free_user_details.actions.send_email')}
                            </button>
                            <button
                                onClick={() => setShowLogs(true)}
                                className="w-full flex items-center justify-center gap-2 p-3 bg-white/5 border border-white/5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                <Activity className="w-4 h-4" />
                                {t('free_user_details.actions.view_access_logs')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals */}
            {user && (
                <>
                    <AccessLogsModal
                        isOpen={showLogs}
                        onClose={() => setShowLogs(false)}
                        userId={user.id}
                        userName={user.full_name}
                    />
                    <SendEmailModal
                        isOpen={showEmailModal}
                        onClose={() => setShowEmailModal(false)}
                        userEmail={user.email}
                        userName={user.full_name}
                    />
                </>
            )}
        </Layout>
    );
};

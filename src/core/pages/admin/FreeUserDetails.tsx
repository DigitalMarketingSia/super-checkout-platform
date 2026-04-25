import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { CENTRAL_CONFIG } from '../../config/central';
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
    ExternalLink,
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
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { isWhiteLabel, profile } = useAuth();
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
            if (!result.success) throw new Error(result.error || 'Erro ao carregar detalhes');

            const { profile: profileData, onboarding: onboardingData, subscription: subData } = result;

            if (!profileData) throw new Error('Usuário não encontrado');

            // Defensive mapping for plan object/array
            let subscription: any = null;
            if (subData) {
                const plan = Array.isArray(subData.plan) ? subData.plan[0] : subData.plan;
                subscription = {
                    ...subData,
                    plan: plan || { name: 'Lead / Gratuito', slug: 'free' }
                };
            }

            setUser({
                ...profileData,
                onboarding: onboardingData,
                subscription
            });

        } catch (error) {
            console.error('Error details:', error);
            toast.error('Erro ao carregar detalhes do usuário');
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
            if (!result.success) throw new Error(result.error || 'Erro ao atualizar');

            setUser(prev => prev ? ({ ...prev, ...updates }) : null);
            toast.success(newBlockedState ? 'Usuário bloqueado com sucesso' : 'Usuário desbloqueado');

        } catch (error: any) {
            console.error('Error blocking user:', error);
            toast.error(`Falha ao atualizar status: ${error.message}`);
        } finally {
            setProcessing(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('TEM CERTEZA? Essa ação removerá o usuário e todos os dados associados. Não pode ser desfeita.')) return;

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
            if (!result.success) throw new Error(result.error || 'Erro ao remover');

            toast.success('Usuário desativado/removido do sistema');
            navigate('/admin/free-users');

        } catch (error: any) {
            console.error('Delete error:', error);
            toast.error(`Erro ao excluir: ${error.message}`);
        } finally {
            setProcessing(false);
        }
    };

    const handleUpgrade = async () => {
        if (!user) return;
        if (user.subscription?.plan.slug === 'whitelabel') {
            toast.error('O usuário já possui o plano Vitalícia.');
            return;
        }

        if (!window.confirm('Deseja forçar o upgrade deste usuário para o plano VITALÍCIA (Domínios Ilimitados)?')) return;

        try {
            setProcessing(true);
            await subscriptionService.promoteToVitalicia(user.id);
            toast.success('Usuário promovido para o plano VITALÍCIA com sucesso!');
            fetchUserDetails(); // Refresh data
        } catch (error: any) {
            toast.error(error.message || 'Erro ao realizar upgrade');
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
    if (profile?.role !== 'owner' && profile?.role !== 'master_admin') return <div>Acesso negado</div>;

    if (loading) return <Loading />;
    if (!user) return <div className="p-8 text-center">Usuário não encontrado</div>;

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
                            {user.full_name || 'Usuário Sem Nome'}
                            {user.is_blocked && (
                                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full border border-red-200">
                                    Bloqueado
                                </span>
                            )}
                        </h1>
                        <p className="text-sm text-gray-500 flex items-center gap-2">
                            <span className="font-mono text-xs text-gray-400">{user.id}</span>
                            <span>•</span>
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
                            {user.is_blocked ? 'Desbloquear' : 'Bloquear Acesso'}
                        </button>

                        <button
                            onClick={handleDelete}
                            disabled={processing}
                            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                            title="Excluir Usuário"
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
                                Dados Pessoais
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-4">
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-500 uppercase font-semibold">Nome Completo</label>
                                    <p className="font-medium">{user.full_name || '-'}</p>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-500 uppercase font-semibold">Email</label>
                                    <div className="flex items-center gap-2">
                                        <Mail className="w-3 h-3 text-gray-400" />
                                        <a href={`mailto:${user.email}`} className="text-blue-500 hover:underline">{user.email}</a>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-500 uppercase font-semibold">Origem (Source)</label>
                                    <p className="font-mono text-sm bg-gray-100 dark:bg-white/5 inline-block px-2 py-1 rounded">
                                        {user.signup_source || 'Desconhecida'}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-500 uppercase font-semibold">Data de Cadastro</label>
                                    <div className="flex items-center gap-2">
                                        <Calendar className="w-3 h-3 text-gray-400" />
                                        <span>{new Date(user.created_at).toLocaleString()}</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-500 uppercase font-semibold">Último Acesso</label>
                                    <div className="flex items-center gap-2">
                                        <Activity className="w-3 h-3 text-primary" />
                                        <span>{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Nunca acessou'}</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-500 uppercase font-semibold">Status da Conta</label>
                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${user.status === 'active'
                                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                        }`}>
                                        {user.status.toUpperCase()}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Setup Progress */}
                        <div className="bg-white dark:bg-[#1A1A2E] rounded-xl border border-gray-200 dark:border-white/5 p-6 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                <Activity className="w-5 h-5 text-green-500" />
                                Progresso de Onboarding
                            </h3>

                            {user.onboarding ? (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-white/5">
                                        <div className="flex items-center gap-3">
                                            <Globe className={`w-5 h-5 ${user.onboarding.domain_configured ? 'text-green-500' : 'text-gray-400'}`} />
                                            <div>
                                                <p className="font-medium text-sm">Configuração de Domínio</p>
                                                <p className="text-xs text-gray-500">Adicionar domínio personalizado</p>
                                            </div>
                                        </div>
                                        {user.onboarding.domain_configured ? <CheckCircle className="w-5 h-5 text-green-500" /> : <XCircle className="w-5 h-5 text-gray-400" />}
                                    </div>

                                    <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-white/5">
                                        <div className="flex items-center gap-3">
                                            <CreditCard className={`w-5 h-5 ${user.onboarding.gateway_configured ? 'text-green-500' : 'text-gray-400'}`} />
                                            <div>
                                                <p className="font-medium text-sm">Configuração de Gateway</p>
                                                <p className="text-xs text-gray-500">Conectar Mercado Pago / Stripe</p>
                                            </div>
                                        </div>
                                        {user.onboarding.gateway_configured ? <CheckCircle className="w-5 h-5 text-green-500" /> : <XCircle className="w-5 h-5 text-gray-400" />}
                                    </div>

                                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-white/5">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-gray-500">Setup Completo?</span>
                                            <span className={`font-bold ${user.onboarding.setup_completed ? 'text-green-500' : 'text-orange-500'}`}>
                                                {user.onboarding.setup_completed ? 'SIM (Pronto para vender)' : 'NÃO (Pendente)'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-4 bg-orange-50 dark:bg-orange-900/10 text-orange-600 rounded-lg flex items-center gap-2 text-sm">
                                    <AlertTriangle className="w-4 h-4" />
                                    Dados de onboarding não encontrados (Usuário antigo ou erro de criação).
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sidebar Actions / Plan */}
                    <div className="space-y-6">
                        <div className={`rounded-xl p-6 shadow-lg relative overflow-hidden transition-all duration-500 ${planConfig.bg}`}>
                            {/* Background Pattern */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>

                            <h3 className="font-bold text-lg mb-4 relative z-10 text-white">Plano Atual</h3>

                            <div className="text-center py-4 relative z-10">
                                <p className="text-4xl font-extrabold tracking-tight">
                                    {planConfig.label}
                                </p>
                                <p className={`${planConfig.subtext} text-sm mt-1 uppercase font-semibold`}>
                                    {user.subscription?.plan.name || 'PLATAFORMA BASE'}
                                </p>
                            </div>

                            <div className="space-y-2 mt-4 relative z-10">
                                <div className="flex justify-between text-sm opacity-90">
                                    <span>Status</span>
                                    <span className="font-bold bg-white/20 px-2 rounded uppercase">{user.subscription?.status || 'Active'}</span>
                                </div>
                                <div className="flex justify-between text-sm opacity-90">
                                    <span>Início</span>
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
                                {user.subscription?.plan.slug === 'whitelabel' ? 'Vitalícia Ativa' : 'Forçar Upgrade (VITALÍCIA)'}
                            </button>
                        </div>

                        {/* Quick Actions */}
                        <div className="bg-white dark:bg-[#1A1A2E] rounded-xl border border-gray-200 dark:border-white/5 p-4 shadow-sm space-y-2">
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 pl-2">Ações Rápidas</h4>

                            <button
                                onClick={() => setShowEmailModal(true)}
                                className="w-full flex items-center justify-center gap-2 p-3 bg-white/5 border border-white/5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                <Mail className="w-4 h-4" />
                                Enviar Email
                            </button>
                            <button
                                onClick={() => setShowLogs(true)}
                                className="w-full flex items-center justify-center gap-2 p-3 bg-white/5 border border-white/5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                <Activity className="w-4 h-4" />
                                Ver Logs de Acesso
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

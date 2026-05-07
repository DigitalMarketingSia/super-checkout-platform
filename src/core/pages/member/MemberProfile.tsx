import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { storage } from '../../services/storageService';
import { supabase } from '../../services/supabase';
import { MemberArea, AccessGrant } from '../../types';
import {
    AlertCircle,
    Calendar,
    CheckCircle2,
    Clock,
    CreditCard,
    KeyRound,
    LogOut,
    Mail,
    Package,
    Shield,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface MemberAreaContextType {
    memberArea: MemberArea | null;
}

type DisplayGrant = AccessGrant & {
    displayType: 'product' | 'content';
    displayName: string;
};

const getGrantName = (grant: AccessGrant) => {
    if (grant.product_id) return grant.product?.name || 'Produto / Assinatura';
    return grant.content?.title || 'Conteudo Avulso';
};

export const MemberProfile = () => {
    const { user, signOut } = useAuth();
    const { t } = useTranslation('member');
    const navigate = useNavigate();
    const { memberArea } = useOutletContext<MemberAreaContextType>();
    const [accessGrants, setAccessGrants] = useState<AccessGrant[]>([]);
    const [loading, setLoading] = useState(true);
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || t('profile.user', 'Usuario');
    const initials = String(displayName || user?.email || 'US').slice(0, 2).toUpperCase();

    const displayGrants = useMemo<DisplayGrant[]>(() => {
        const productGrants = new Map<string, DisplayGrant>();
        const contentGrants: DisplayGrant[] = [];

        accessGrants
            .filter((grant) => grant.status === 'active')
            .forEach((grant) => {
                if (grant.product_id) {
                    const existing = productGrants.get(grant.product_id);
                    if (!existing || new Date(grant.granted_at) > new Date(existing.granted_at)) {
                        productGrants.set(grant.product_id, {
                            ...grant,
                            displayType: 'product',
                            displayName: getGrantName(grant),
                        });
                    }
                    return;
                }

                contentGrants.push({
                    ...grant,
                    displayType: 'content',
                    displayName: getGrantName(grant),
                });
            });

        const visibleGrants = productGrants.size > 0 ? [...productGrants.values()] : contentGrants;

        return visibleGrants
            .sort((a, b) => new Date(b.granted_at).getTime() - new Date(a.granted_at).getTime());
    }, [accessGrants]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const grants = await storage.getAccessGrants();
            setAccessGrants(grants);
        } catch (error) {
            console.error('Error loading profile data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await signOut();
        if (memberArea) {
            navigate(`/app/${memberArea.slug}/login`);
        } else {
            navigate('/login');
        }
    };

    const handlePasswordSetup = async () => {
        if (!user?.email) return;
        setPasswordLoading(true);
        setPasswordMessage(null);

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
                redirectTo: `${window.location.origin}/update-password`,
            });

            if (error) throw error;
            setPasswordMessage({
                type: 'success',
                text: t('profile.password_email_sent', 'Enviamos um link para criar ou redefinir sua senha.'),
            });
        } catch (error: any) {
            setPasswordMessage({
                type: 'error',
                text: error?.message || t('profile.password_email_error', 'Nao foi possivel enviar o link de senha agora.'),
            });
        } finally {
            setPasswordLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" style={{ borderColor: memberArea?.primary_color ? `${memberArea.primary_color} transparent transparent transparent` : undefined }}></div>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto px-4 py-8">
            <div className="mb-8">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">{memberArea?.name || 'Member Area'}</p>
                <h1 className="text-3xl font-bold text-white">{t('profile.title', 'Meu Perfil')}</h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-1 space-y-6">
                    <div className="bg-[#1A1D21] rounded-lg p-6 border border-white/10">
                        <div className="flex flex-col items-center text-center">
                            <div
                                className="w-24 h-24 rounded-full flex items-center justify-center mb-4 border-2 border-white/10 text-2xl font-black text-white"
                                style={{ backgroundColor: memberArea?.primary_color || '#D4143C' }}
                            >
                                {initials}
                            </div>
                            <h2 className="text-xl font-bold text-white mb-1">{displayName}</h2>
                            <p className="text-gray-400 text-sm break-all">{user?.email}</p>
                        </div>

                        <button
                            onClick={handleLogout}
                            className="mt-6 w-full flex items-center justify-center gap-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 py-3 px-4 rounded-lg transition-colors border border-red-500/20 font-semibold"
                        >
                            <LogOut className="w-4 h-4" />
                            {t('nav.logout', 'Sair da conta')}
                        </button>
                    </div>

                    <div className="bg-[#1A1D21] rounded-lg p-6 border border-white/10">
                        <h3 className="text-lg font-semibold text-white mb-5 flex items-center gap-2">
                            <Shield className="w-5 h-5 text-gray-400" />
                            {t('profile.security', 'Seguranca')}
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs text-gray-500 uppercase mb-1">{t('profile.email', 'Email')}</label>
                                <div className="flex items-center gap-2 text-gray-300 bg-black/20 p-3 rounded-lg border border-white/10 break-all">
                                    <Mail className="w-4 h-4 text-gray-500" />
                                    {user?.email}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-gray-500 uppercase mb-1">{t('profile.password', 'Senha')}</label>
                                <div className="bg-black/20 p-3 rounded-lg border border-white/10">
                                    <div className="flex items-center gap-2 text-gray-300">
                                        <KeyRound className="w-4 h-4 text-gray-500" />
                                        <span>{t('profile.password_setup_hint', 'Crie a primeira senha ou redefina sua senha atual.')}</span>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handlePasswordSetup}
                                disabled={passwordLoading}
                                className="w-full flex items-center justify-center gap-2 text-sm font-bold text-white py-3 rounded-lg transition-colors disabled:opacity-60"
                                style={{ backgroundColor: memberArea?.primary_color || '#D4143C' }}
                            >
                                {passwordLoading ? <Clock className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                                {passwordLoading ? t('profile.sending', 'Enviando...') : t('profile.setup_password', 'Criar ou redefinir senha')}
                            </button>

                            {passwordMessage && (
                                <div className={`flex items-start gap-2 text-sm p-3 rounded-lg border ${passwordMessage.type === 'success'
                                    ? 'bg-green-500/10 text-green-300 border-green-500/20'
                                    : 'bg-red-500/10 text-red-300 border-red-500/20'
                                    }`}>
                                    {passwordMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <AlertCircle className="w-4 h-4 mt-0.5" />}
                                    <span>{passwordMessage.text}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="md:col-span-2">
                    <div className="bg-[#1A1D21] rounded-lg border border-white/10 h-full overflow-hidden">
                        <div className="p-6 border-b border-white/10">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                <CreditCard className="w-6 h-6 text-gray-400" />
                                {t('profile.subscriptions', 'Minhas Assinaturas e Compras')}
                            </h3>
                            <p className="text-sm text-gray-500 mt-2">
                                {t('profile.subscriptions_hint', 'Cada produto aparece uma unica vez, mesmo quando libera varios conteudos internos.')}
                            </p>
                        </div>

                        {displayGrants.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                <p>{t('profile.no_grants', 'Nenhuma assinatura ou compra ativa encontrada.')}</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-white/10">
                                {displayGrants.map((grant) => (
                                    <div key={`${grant.displayType}-${grant.product_id || grant.content_id || grant.id}`} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="flex items-start gap-4 min-w-0">
                                            <div className="w-11 h-11 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                                                <Package className="w-5 h-5 text-gray-300" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                                    <h4 className="font-bold text-white text-lg truncate">
                                                        {grant.displayName}
                                                    </h4>
                                                </div>
                                                <p className="text-gray-400 text-sm flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {t('profile.access_granted_at', 'Acesso liberado em')}: {new Date(grant.granted_at).toLocaleDateString()}
                                                </p>
                                                <p className="text-xs text-gray-600 mt-1">
                                                    {grant.displayType === 'product'
                                                        ? t('profile.product_subscription', 'Produto / Assinatura')
                                                        : t('profile.single_content', 'Conteudo Avulso')}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-green-500/10 text-green-400 border border-green-500/20">
                                                {t('status.active', 'Ativo')}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

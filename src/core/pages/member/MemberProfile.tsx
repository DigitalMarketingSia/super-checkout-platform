import React, { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { storage } from '../../services/storageService';
import { MemberArea, AccessGrant } from '../../types';
import { User, Mail, Shield, LogOut, CreditCard, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface MemberAreaContextType {
    memberArea: MemberArea | null;
}

export const MemberProfile = () => {
    const { user, signOut } = useAuth();
    const { t } = useTranslation('member');
    const navigate = useNavigate();
    const { memberArea } = useOutletContext<MemberAreaContextType>();
    const [accessGrants, setAccessGrants] = useState<AccessGrant[]>([]);
    const [loading, setLoading] = useState(true);

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

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" style={{ borderColor: memberArea?.primary_color ? `${memberArea.primary_color} transparent transparent transparent` : undefined }}></div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold text-white mb-8">{t('profile.title', 'Meu Perfil')}</h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* User Info Card */}
                <div className="md:col-span-1 space-y-6">
                    <div className="bg-[#1A1D21] rounded-xl p-6 border border-white/5 flex flex-col items-center text-center">
                        <div className="w-24 h-24 bg-gradient-to-br from-gray-700 to-gray-900 rounded-full flex items-center justify-center mb-4 border-2 border-white/10">
                            <User className="w-10 h-10 text-gray-400" />
                        </div>
                        <h2 className="text-xl font-bold text-white mb-1">{user?.user_metadata?.full_name || t('profile.user', 'Usuário')}</h2>
                        <p className="text-gray-400 text-sm mb-6">{user?.email}</p>

                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center justify-center gap-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 py-2 px-4 rounded-lg transition-colors border border-red-500/20"
                        >
                            <LogOut className="w-4 h-4" />
                            {t('nav.logout', 'Sair da conta')}
                        </button>
                    </div>

                    <div className="bg-[#1A1D21] rounded-xl p-6 border border-white/5">
                        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <Shield className="w-5 h-5 text-gray-400" />
                            {t('profile.security', 'Segurança')}
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs text-gray-500 uppercase mb-1">Email</label>
                                <div className="flex items-center gap-2 text-gray-300 bg-black/20 p-3 rounded-lg border border-white/5 break-all">
                                    <Mail className="w-4 h-4 text-gray-500" />
                                    {user?.email}
                                </div>
                            </div>
                            <button className="w-full text-left text-sm text-blue-400 hover:text-blue-300 transition-colors">
                                {t('profile.change_password', 'Alterar senha')}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Active Plans / Grants */}
                <div className="md:col-span-2">
                    <div className="bg-[#1A1D21] rounded-xl p-6 border border-white/5 h-full">
                        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                            <CreditCard className="w-6 h-6 text-gray-400" />
                            {t('profile.subscriptions', 'Minhas Assinaturas e Compras')}
                        </h3>

                        {accessGrants.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                <p>{t('profile.no_grants', 'Nenhuma assinatura ou compra ativa encontrada.')}</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {accessGrants.map((grant) => (
                                    <div key={grant.id} className="bg-black/20 rounded-lg p-4 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`w-2 h-2 rounded-full ${grant.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                                <h4 className="font-bold text-white text-lg">
                                                    {grant.product_id ? t('profile.product_subscription', 'Produto / Assinatura') : t('profile.single_content', 'Conteúdo Avulso')}
                                                </h4>
                                            </div>
                                            <p className="text-gray-400 text-sm flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                {t('profile.access_granted_at', 'Acesso liberado em')}: {new Date(grant.granted_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${grant.status === 'active'
                                                ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                                                : 'bg-red-500/10 text-red-500 border border-red-500/20'
                                                }`}>
                                                {grant.status === 'active' ? t('status.active', 'Ativo') : t('status.inactive', 'Inativo')}
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

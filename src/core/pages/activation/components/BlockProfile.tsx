import React from 'react';
import { User, Mail, Shield, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface BlockProfileProps {
    user: any;
    license: any;
    onNavigate: (tab: string) => void;
}

export const BlockProfile: React.FC<BlockProfileProps> = ({ user, license, onNavigate }) => {
    const { t } = useTranslation('portal');
    const planBadge =
        license?.plan === 'whitelabel'
            ? t('profile.plan_label', { plan: 'WHITELABEL' })
            : license?.has_partner_panel && license?.has_unlimited_domains
                ? `${t('profile.partner')} + ${t('profile.unlimited_domains')}`
                : license?.has_partner_panel || license?.plan === 'saas'
                    ? t('profile.partner')
                    : license?.has_unlimited_domains || license?.plan === 'upgrade_domains'
                        ? t('profile.unlimited_domains')
                        : t('profile.plan_label', { plan: license?.plan?.toUpperCase() });
    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700">
            {/* Main Profile Info Card */}
            <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-10 md:p-14 backdrop-blur-xl relative overflow-hidden group">
                {/* Decorative Background Element */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[100px] -mr-32 -mt-32 pointer-events-none group-hover:bg-primary/20 transition-all duration-700" />

                <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-10">
                    <div className="w-24 h-24 rounded-[2rem] bg-white/5 border border-white/10 flex items-center justify-center relative group/avatar">
                        <User className="w-10 h-10 text-gray-500 group-hover/avatar:text-primary transition-colors duration-500" />
                        <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg border-2 border-[#05050A]">
                            <Shield className="w-4 h-4" />
                        </div>
                    </div>

                    <div className="flex-1 space-y-2">
                        <h3 className="text-4xl font-display font-black text-white italic uppercase tracking-tighter">
                            {user?.user_metadata?.full_name || user?.user_metadata?.name || t('profile.client')}
                        </h3>
                        <div className="flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-2 bg-white/5 border border-white/5 px-4 py-1.5 rounded-full">
                                <Mail className="w-3.5 h-3.5 text-primary" />
                                <span className="text-sm font-bold text-gray-300">{user?.email}</span>
                            </div>
                            <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 px-4 py-1.5 rounded-full">
                                <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em] italic">
                                    {planBadge}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
                    <div className="bg-white/5 border border-white/5 rounded-3xl p-8 hover:bg-white/[0.07] transition-all duration-300">
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">{t('profile.user_id')}</p>
                        <p className="text-sm font-mono text-gray-400 break-all">{user?.id}</p>
                    </div>
                    <div className="bg-white/5 border border-white/5 rounded-3xl p-8 hover:bg-white/[0.07] transition-all duration-300">
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">{t('profile.member_since')}</p>
                        <p className="text-sm font-bold text-white uppercase italic tracking-tighter">
                            {new Date(user?.created_at).toLocaleDateString(navigator.language, { day: '2-digit', month: 'long', year: 'numeric' })}
                        </p>
                    </div>
                </div>
            </div>

            {/* Quick Actions Card */}
            <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-10 md:p-14 backdrop-blur-xl relative overflow-hidden group/security">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                    <div className="space-y-2">
                        <h4 className="text-2xl font-display font-black text-white italic uppercase tracking-tighter">{t('security.title')}</h4>
                        <p className="text-gray-400 font-medium">{t('profile.security_desc')}</p>
                    </div>

                    <button
                        onClick={() => onNavigate('security')}
                        className="group/btn flex items-center gap-3 bg-white text-black font-black uppercase text-sm px-8 py-4 rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-xl shadow-white/5 tracking-tighter italic"
                    >
                        <span>{t('profile.manage_password')}</span>
                        <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                    </button>
                </div>
            </div>
        </div>
    );
};

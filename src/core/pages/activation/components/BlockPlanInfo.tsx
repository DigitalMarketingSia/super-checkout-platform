import React from 'react';
import { Calendar, Package, UserCheck } from 'lucide-react';
import { License } from '../../../services/licenseService';
import { useTranslation } from 'react-i18next';

interface BlockPlanInfoProps {
    license: License;
    userName?: string;
}

export const BlockPlanInfo: React.FC<BlockPlanInfoProps> = ({ license, userName }) => {
    const { t, i18n } = useTranslation('portal');
    
    if (!license) {
        return (
            <div className="bg-white/5 border border-white/10 rounded-[2rem] p-8 backdrop-blur-xl">
                <h3 className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] mb-8">{t('plan_info.title')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="flex items-center gap-5 p-4 rounded-2xl bg-white/5 border border-white/5">
                        <div className="w-12 h-12 bg-gray-500/10 rounded-xl flex items-center justify-center text-gray-500">
                            <Package className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{t('plan_info.profile')}</p>
                            <p className="text-lg font-black text-white font-display italic tracking-tighter">Conta Gratuita</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-5 p-4 rounded-2xl bg-white/5 border border-white/5">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-orange-500/10 text-orange-500">
                            <UserCheck className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{t('plan_info.current_status')}</p>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full animate-pulse bg-orange-500" />
                                    <p className="text-lg font-black text-white font-display italic tracking-tighter">S/ Licença</p>
                                </div>
                                <span className="px-2 py-1 bg-orange-500/10 text-orange-400 text-[9px] font-black uppercase tracking-widest rounded-md border border-orange-500/20">
                                    Pendente
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="mt-6 flex flex-col items-center justify-center p-4 bg-orange-500/5 border border-orange-500/10 rounded-2xl cursor-pointer hover:bg-orange-500/10 transition-colors" onClick={() => {
                    const event = new CustomEvent('nav-to-tab', { detail: 'license' });
                    window.dispatchEvent(event);
                }}>
                    <p className="text-xs font-bold text-orange-400 uppercase tracking-widest">Ação Necessária</p>
                    <p className="text-sm text-gray-400 mt-1">Acesse a aba <strong>Dados de Acesso</strong> para gerar sua licença gratuita.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white/5 border border-white/10 rounded-[2rem] p-8 backdrop-blur-xl">
            <h3 className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] mb-8">{t('plan_info.title')}</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Plan Name */}
                <div className="flex items-center gap-5 p-4 rounded-2xl bg-white/5 border border-white/5 group hover:border-primary/20 transition-all duration-300">
                    <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary transition-transform group-hover:scale-110">
                        <Package className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{t('plan_info.profile')}</p>
                        <p className="text-xl font-black text-white capitalize font-display italic tracking-tighter">
                            {license.plan === 'upgrade_domains' ? t('plan_info.unlimited') : license.plan === 'saas' ? t('plan_info.partner') : license.plan}
                        </p>
                    </div>
                </div>

                {/* Status */}
                <div className="flex items-center gap-5 p-4 rounded-2xl bg-white/5 border border-white/5 group hover:border-green-500/20 transition-all duration-300">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${license.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                        <UserCheck className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{t('plan_info.current_status')}</p>
                        <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full animate-pulse ${license.status === 'active' ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
                            <p className="text-xl font-black text-white capitalize font-display italic tracking-tighter">{license.status === 'active' ? t('plan_info.active') : t('plan_info.inactive')}</p>
                        </div>
                    </div>
                </div>

                {/* Date */}
                <div className="flex items-center gap-5 p-4 rounded-2xl bg-white/5 border border-white/5 group hover:border-blue-500/20 transition-all duration-300">
                    <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 transition-transform group-hover:scale-110">
                        <Calendar className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{t('plan_info.member_since')}</p>
                        <p className="text-xl font-black text-white font-display italic tracking-tighter">
                            {new Date(license.created_at).toLocaleDateString(i18n.language === 'en' ? 'en-US' : i18n.language === 'es' ? 'es-ES' : 'pt-BR', { month: 'long', year: 'numeric' })}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

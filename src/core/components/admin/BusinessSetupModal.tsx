import React from 'react';
import { Building2, AlertTriangle, ArrowRight, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { useTranslation } from 'react-i18next';

interface BusinessSetupModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const BusinessSetupModal: React.FC<BusinessSetupModalProps> = ({ isOpen, onClose }) => {
    const { t } = useTranslation('admin');
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={
                <div className="flex items-center gap-2 text-orange-500">
                    <AlertTriangle className="w-5 h-5" />
                    <span>{t('compliance_banner.title', 'Configuração Obrigatória')}</span>
                </div>
            }
        >
            <div className="space-y-6">
                {/* Visual Header with Gradient */}
                <div className="bg-gradient-to-br from-orange-600 to-yellow-500 p-6 rounded-2xl text-white shadow-lg relative overflow-hidden group">
                    <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/10 blur-2xl rounded-full group-hover:scale-110 transition-transform duration-500"></div>

                    <div className="relative z-10 flex flex-col items-center text-center gap-3">
                        <div className="bg-white/20 p-3 rounded-full backdrop-blur-sm border border-white/30">
                            <Building2 className="w-8 h-8 text-white" />
                        </div>
                        <h3 className="text-xl font-bold">{t('compliance_banner.identity', 'Identidade do seu Negócio')}</h3>
                        <p className="text-sm text-orange-50/90 leading-relaxed font-medium">
                            {t('compliance_banner.warning', 'Atenção: Configure os dados do seu negócio para ativar seus checkouts e envios de e-mail.')}
                        </p>
                    </div>
                </div>

                <div className="space-y-4">
                    <p className="text-sm text-gray-400 leading-relaxed">
                        {t('compliance_banner.desc_1', 'Para garantir a segurança das suas vendas e o funcionamento correto dos e-mails automáticos, você precisa definir o ')}
                        <strong>{t('compliance_banner.desc_business', 'Nome do Negócio')}</strong> 
                        {t('compliance_banner.desc_2', ' e o ')}
                        <strong>{t('compliance_banner.desc_email', 'E-mail de Suporte')}</strong>.
                    </p>

                    <div className="bg-[#0F0F13] border border-white/5 rounded-xl p-4 space-y-3">
                        <div className="flex items-start gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 shrink-0" />
                            <p className="text-xs text-gray-300">{t('compliance_banner.footer_hint', 'Essas informações aparecerão no rodapé dos seus checkouts.')}</p>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 shrink-0" />
                            <p className="text-xs text-gray-300">{t('compliance_banner.email_hint', 'O e-mail de suporte será o remetente oficial para seus clientes.')}</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        className="flex-1 border-white/5 hover:bg-white/5"
                    >
                        {t('compliance_banner.not_now', 'Agora não')}
                    </Button>
                    <a
                        href="/admin/business-settings"
                        className="flex-[2] bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-orange-600/20"
                    >
                        {t('compliance_banner.configure_now', 'Configurar Agora')} <ArrowRight className="w-4 h-4" />
                    </a>
                </div>
            </div>
        </Modal>
    );
};

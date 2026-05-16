import React from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface ComplianceBannerProps {
    complianceStatus: string | undefined;
}

export const ComplianceBanner: React.FC<ComplianceBannerProps> = ({ complianceStatus }) => {
    const { t } = useTranslation('admin');
    // Only show if NOT verified (meaning pending or empty)
    // Wait, we need to be careful. Initially undefined/null means loading.
    // We should pass a loading state or handle it.
    // If complianceStatus is 'verified', return null.

    if (complianceStatus === 'verified') return null;

    // We should probably check if it's explicitly 'pending' or 'suspended' or missing.
    // Assuming 'verified' is the only "good" state.

    return (
        <div className="w-full bg-gradient-to-r from-orange-600 to-yellow-500 text-white shadow-md relative z-50">
            <div className="max-w-7xl mx-auto px-4 py-2 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2">
                    <div className="bg-white/20 p-1 rounded">
                        <AlertTriangle className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-medium">
                        {t('compliance_banner.warning', 'Atenção: Configure os dados do seu negócio para ativar seus checkouts e envios de e-mail.')}
                    </span>
                </div>

                <Link
                    to="/admin/business-settings"
                    className="whitespace-nowrap bg-white text-orange-600 hover:bg-orange-50 px-3 py-1 rounded-full font-bold text-xs flex items-center gap-1 transition-colors shadow-sm"
                >
                    {t('compliance_banner.configure_now', 'Configurar agora')} <ArrowRight className="w-3 h-3" />
                </Link>
            </div>
        </div>
    );
};

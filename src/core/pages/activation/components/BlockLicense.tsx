import React from 'react';
import { Key, Copy, Check } from 'lucide-react';
import { License } from '../../../services/licenseService';
import { useTranslation } from 'react-i18next';
import { GenerateLicenseGate } from './GenerateLicenseGate';

interface BlockLicenseProps {
    license: License;
    isUnlimited?: boolean;
    userName?: string;
    onRefresh?: () => void;
}

export const BlockLicense: React.FC<BlockLicenseProps> = ({ license, isUnlimited, userName = '', onRefresh }) => {
    const { t } = useTranslation('portal');
    const [copied, setCopied] = React.useState(false);

    if (!license) {
        return <GenerateLicenseGate userName={userName} onActivated={() => onRefresh && onRefresh()} />;
    }

    const handleCopy = () => {
        navigator.clipboard.writeText(license.key);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="bg-white/5 border border-white/10 rounded-[2rem] p-8 backdrop-blur-xl">
            <h3 className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] mb-8">{t('license.title')}</h3>

            <div className="bg-white/5 border border-white/5 rounded-[1.5rem] p-6 flex flex-col md:flex-row items-center justify-between gap-6 group hover:border-primary/20 transition-all duration-500">
                <div className="flex items-center gap-5 w-full">
                    <div className="w-14 h-14 bg-primary/10 rounded-[1.25rem] flex items-center justify-center text-primary shrink-0 transition-transform group-hover:scale-110">
                        <Key className="w-7 h-7" />
                    </div>
                    <div className="w-full">
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">{t('license.master_key')}</p>
                        <code className="block w-full text-xl md:text-2xl font-display font-black text-white break-all tracking-tighter select-all italic italic">{license.key}</code>
                    </div>
                </div>

                <button
                    onClick={handleCopy}
                    className="shrink-0 w-full md:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-white/5 hover:bg-primary hover:text-white text-white rounded-2xl transition-all duration-300 font-bold border border-white/10 hover:border-primary group/btn"
                >
                    {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5 group-hover/btn:scale-110 transition-transform" />}
                    <span>{copied ? t('license.copied') : t('license.copy_token')}</span>
                </button>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <p className="text-sm font-medium text-gray-400">{t('license.installations')}: <span className="text-white font-bold">{isUnlimited ? t('license.unlimited') : license.max_instances}</span></p>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <p className="text-sm font-medium text-gray-400">{t('license.domain')}: <span className="text-white font-bold">{license.allowed_domain || t('license.any_domain')}</span></p>
                </div>
            </div>
        </div>
    );
};

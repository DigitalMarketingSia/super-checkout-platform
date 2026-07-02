import React, { useState } from 'react';
import { ShieldCheck, Check, ArrowRight, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getPlatformPrivacyUrl, getPlatformTermsUrl } from '../../../config/platformUrls';
import { licenseService } from '../../../services/licenseService';
import { PLATFORM_LEGAL_CONTACT_EMAIL, PLATFORM_LEGAL_VERSION } from '../../../config/platformLegal';

interface GenerateLicenseGateProps {
    userName: string;
    onActivated: () => void;
}

export const GenerateLicenseGate: React.FC<GenerateLicenseGateProps> = ({ userName, onActivated }) => {
    const { t } = useTranslation('portal');
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleActivate = async () => {
        if (!termsAccepted) {
            alert(t('generate_license_gate.accept_terms_required'));
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const result = await licenseService.activateFree({ termsAccepted: true });
            if (result.success) {
                onActivated();
            } else {
                setError(result.message || t('generate_license_gate.activate_error'));
            }
        } catch (err: any) {
            console.error('Activation error:', err);
            setError(err.message || t('generate_license_gate.connection_error'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white/[0.02] border border-orange-500/20 backdrop-blur-2xl rounded-[3rem] p-8 md:p-12 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] text-center animate-in fade-in zoom-in-95 duration-500 max-w-2xl mx-auto my-8">
            <div className="relative inline-block mb-10">
                <div className="absolute inset-0 bg-orange-500 blur-[40px] opacity-20 animate-pulse" />
                <div className="relative w-20 h-20 bg-gradient-to-br from-orange-500 to-amber-600 rounded-[2rem] flex items-center justify-center shadow-2xl hover:rotate-6 transition-transform duration-500">
                    <ShieldCheck className="w-10 h-10 text-white" />
                </div>
            </div>

            <h2 className="text-3xl md:text-5xl font-black text-white mb-6 leading-none tracking-tighter uppercase italic text-center">
                {t('generate_license_gate.title_prefix')} <span className="bg-gradient-to-r from-orange-500 to-amber-400 bg-clip-text text-transparent">{t('generate_license_gate.title_highlight')}</span>
            </h2>

            <p className="text-gray-400 mb-10 text-lg font-medium leading-relaxed max-w-md mx-auto">
                {t('generate_license_gate.description', {
                    name: userName.split(' ')[0] || t('generate_license_gate.fallback_name')
                })}
            </p>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-2xl mb-8 font-bold text-sm">
                    {error}
                </div>
            )}

            <div className="space-y-4 mb-8 text-left max-w-sm mx-auto">
                <label className="flex items-center gap-3 p-4 bg-white/[0.02] border border-white/5 rounded-2xl cursor-pointer group hover:bg-white/[0.05] transition-all">
                    <div className="relative">
                        <input
                            type="checkbox"
                            checked={termsAccepted}
                            onChange={(e) => setTermsAccepted(e.target.checked)}
                            className="peer sr-only"
                        />
                        <div className="w-6 h-6 border-2 border-white/10 rounded-lg group-hover:border-white/20 transition-colors peer-checked:bg-orange-500 peer-checked:border-orange-500" />
                        <Check className="w-4 h-4 text-white absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 opacity-0 peer-checked:opacity-100 transition-opacity" />
                    </div>
                    <span className="text-xs text-gray-400 font-bold uppercase tracking-wider leading-relaxed">
                        {t('generate_license_gate.accept_prefix')}
                        {' '}
                        <a href={getPlatformTermsUrl()} target="_blank" rel="noreferrer" className="text-white hover:text-orange-300 underline underline-offset-4">
                            {t('generate_license_gate.terms_link')}
                        </a>
                        {' '}
                        {t('generate_license_gate.and_privacy')}
                        {' '}
                        <a href={getPlatformPrivacyUrl()} target="_blank" rel="noreferrer" className="text-white hover:text-orange-300 underline underline-offset-4">
                            {t('generate_license_gate.privacy_link')}
                        </a>
                        {' '}
                        {t('generate_license_gate.platform_suffix', {
                            version: PLATFORM_LEGAL_VERSION,
                            channel: PLATFORM_LEGAL_CONTACT_EMAIL
                        })}
                    </span>
                </label>
            </div>

            <button
                onClick={handleActivate}
                disabled={loading || !termsAccepted}
                className="w-full max-w-sm mx-auto py-5 bg-white text-black hover:bg-orange-500 hover:text-white rounded-[2rem] transition-all duration-500 font-black uppercase italic tracking-tighter text-lg shadow-2xl disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-black flex items-center justify-center gap-3 relative group overflow-hidden"
            >
                {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <> <span className="relative z-10 transition-transform group-hover:-translate-x-1">{t('generate_license_gate.button')}</span> <ArrowRight className="w-5 h-5 relative z-10 group-hover:translate-x-2 transition-transform" /> <div className="absolute inset-0 bg-orange-500 translate-y-full group-hover:translate-y-0 transition-transform duration-500" /> </>}
            </button>
        </div>
    );
};

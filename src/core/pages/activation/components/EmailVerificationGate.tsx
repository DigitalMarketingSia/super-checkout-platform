import React, { useEffect, useState } from 'react';
import { Mail, ArrowRight, Loader2, RefreshCw, LogOut, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { openInboxForEmail } from '../../../utils/emailInbox';
import { resendRegistrationEmail, trackRegistrationEvent } from '../../../services/registerFlow';
import { RiskCaptcha } from '../../../components/auth/RiskCaptcha';

interface EmailVerificationGateProps {
    email: string;
    onResendSuccess: () => void;
    onLogout: () => void;
}

export const EmailVerificationGate: React.FC<EmailVerificationGateProps> = ({ email, onResendSuccess, onLogout }) => {
    const { t } = useTranslation('auth');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [requiresCaptcha, setRequiresCaptcha] = useState(false);
    const [captchaSiteKey, setCaptchaSiteKey] = useState<string | null>(null);
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);

    useEffect(() => {
        trackRegistrationEvent({
            event: 'activation_email_unconfirmed_viewed',
            email
        });
    }, [email]);

    const handleResend = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await resendRegistrationEmail({
                email,
                flow: 'activation_setup',
                captchaToken
            });

            if (response.success) {
                setRequiresCaptcha(false);
                setCaptchaSiteKey(null);
                setCaptchaToken(null);
                setSent(true);
                onResendSuccess();
                window.setTimeout(() => setSent(false), 5000);
            }
        } catch (err: any) {
            console.error('Error resending confirmation:', err);
            if (err?.requiresCaptcha) {
                setRequiresCaptcha(true);
                setCaptchaSiteKey(err?.captchaSiteKey || null);
                setCaptchaToken(null);
            }
            setError(err?.error || t('activation.email_gate.resend_error'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#020205] flex items-center justify-center p-4 relative overflow-hidden font-sans text-white text-center">
            <div className="absolute top-[-20%] right-[-10%] w-[70%] h-[70%] bg-primary/10 rounded-full blur-[150px] animate-pulse pointer-events-none" />
            <div className="absolute bottom-[-10%] left-[-20%] w-[60%] h-[60%] bg-indigo-500/10 rounded-full blur-[130px] pointer-events-none" />

            <div className="relative z-10 w-full max-w-xl animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="bg-white/[0.02] border border-white/10 backdrop-blur-2xl rounded-[3rem] p-8 md:p-16 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)]">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-10">
                        <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary italic">{t('activation.email_gate.badge')}</span>
                    </div>

                    <div className="relative inline-block mb-12">
                        <div className="absolute inset-0 bg-primary blur-[40px] opacity-20 animate-pulse" />
                        <div className="relative w-24 h-24 bg-gradient-to-br from-primary to-indigo-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl rotate-3 hover:rotate-0 transition-transform duration-500">
                            <Mail className="w-12 h-12 text-white" />
                        </div>
                    </div>

                    <h2 className="text-4xl md:text-5xl font-black text-white mb-6 leading-[0.9] tracking-tighter uppercase italic">
                        {t('activation.email_gate.title_prefix')} <br />
                        <span className="bg-gradient-to-r from-primary to-amber-400 bg-clip-text text-transparent">{t('activation.email_gate.title_highlight')}</span>
                    </h2>

                    <p className="text-gray-400 mb-12 text-lg font-medium leading-relaxed max-w-md mx-auto">
                        {t('activation.email_gate.description_before')}{' '}
                        <span className="text-white font-bold">{email}</span>.
                        {' '}
                        {t('activation.email_gate.description_after')}
                    </p>

                    <div className="space-y-4">
                        <button
                            onClick={() => openInboxForEmail(email)}
                            className="w-full py-6 bg-white text-black hover:bg-primary hover:text-white rounded-[2.5rem] transition-all duration-500 font-black uppercase italic tracking-tighter text-xl shadow-2xl flex items-center justify-center gap-3 relative group overflow-hidden"
                        >
                            <span className="relative z-10">{t('register.open_email_button')}</span>
                            <ArrowRight className="w-6 h-6 relative z-10 group-hover:translate-x-1 transition-transform" />
                            <div className="absolute inset-0 bg-primary translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                        </button>

                        <button
                            onClick={handleResend}
                            disabled={loading || sent || (requiresCaptcha && !captchaToken)}
                            className={`w-full py-6 rounded-[2.5rem] transition-all duration-500 font-black uppercase italic tracking-tighter text-xl shadow-2xl flex items-center justify-center gap-3 ${
                                sent
                                    ? 'bg-green-500 text-white'
                                    : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
                            }`}
                        >
                            {loading ? (
                                <Loader2 className="w-8 h-8 animate-spin" />
                            ) : sent ? (
                                <>
                                    <CheckCircle className="w-6 h-6" />
                                    <span>{t('activation.email_gate.resent')}</span>
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="w-6 h-6" />
                                    <span>{t('register.resend_email_button')}</span>
                            </>
                        )}
                        </button>

                        {requiresCaptcha && captchaSiteKey && (
                            <div className="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-3 text-left">
                                <p className="text-xs text-gray-300 font-bold uppercase tracking-[0.18em]">
                                    {t('register.captcha_title')}
                                </p>
                                <p className="text-sm text-gray-400 leading-relaxed">
                                    {t('register.captcha_desc')}
                                </p>
                                <RiskCaptcha siteKey={captchaSiteKey} onTokenChange={setCaptchaToken} />
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button
                                onClick={() => window.location.reload()}
                                className="w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-2xl transition-all font-bold uppercase text-sm tracking-widest flex items-center justify-center gap-2"
                            >
                                <span>{t('activation.email_gate.already_confirmed')}</span>
                                <ArrowRight className="w-4 h-4" />
                            </button>

                            <button
                                onClick={onLogout}
                                className="w-full py-4 bg-transparent border border-white/10 hover:border-white/20 text-gray-300 hover:text-white rounded-2xl transition-all font-bold uppercase text-sm tracking-widest flex items-center justify-center gap-2"
                            >
                                <LogOut className="w-4 h-4" />
                                <span>{t('register.change_email_button')}</span>
                            </button>
                        </div>
                    </div>

                    {error && (
                        <p className="mt-6 text-red-500 font-bold text-sm">{error}</p>
                    )}
                </div>

                <p className="mt-8 text-[10px] text-gray-600 font-bold uppercase tracking-[0.3em]">
                    {t('activation.email_gate.security_engine')}
                </p>
            </div>
        </div>
    );
};

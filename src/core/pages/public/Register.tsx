import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mail, Lock, User, Loader2, ArrowRight, AlertCircle, CheckCircle, Sparkles, RefreshCw, PencilLine, Zap, Globe, Fingerprint, Shield } from 'lucide-react';
import Aurora from '../../components/ui/Aurora';
import { useTranslation } from 'react-i18next';
import { sanitizeTranslationHtml } from '../../utils/sanitize';
import { openInboxForEmail } from '../../utils/emailInbox';
import { getRegistrationStatus, joinRegistrationWaitlist, registerAccount, resendRegistrationEmail, trackRegistrationEvent, validateInviteToken as validateRegistrationInvite } from '../../services/registerFlow';
import { RiskCaptcha } from '../../components/auth/RiskCaptcha';
import { PhoneInput } from '../../components/ui/PhoneInput';

export const Register = () => {
    const { t } = useTranslation('auth');
    const [searchParams] = useSearchParams();
    const partnerParam = searchParams.get('partner');
    const inviteToken = searchParams.get('invite')?.trim() || '';
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [resending, setResending] = useState(false);
    const [resendMessage, setResendMessage] = useState<string | null>(null);
    const [requiresCaptcha, setRequiresCaptcha] = useState(false);
    const [captchaSiteKey, setCaptchaSiteKey] = useState<string | null>(null);
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);
    const [hasStartedForm, setHasStartedForm] = useState(false);
    const [registrationOpen, setRegistrationOpen] = useState(true);
    const [manualApprovalEnabled, setManualApprovalEnabled] = useState(false);
    const [statusLoading, setStatusLoading] = useState(true);
    const [waitlistLoading, setWaitlistLoading] = useState(false);
    const [waitlistSuccess, setWaitlistSuccess] = useState<string | null>(null);
    const [approvalPending, setApprovalPending] = useState(false);
    const [inviteState, setInviteState] = useState<{
        loading: boolean;
        checked: boolean;
        valid: boolean;
        reason: string | null;
        expiresAt: string | null;
    }>({
        loading: false,
        checked: false,
        valid: false,
        reason: null,
        expiresAt: null
    });

    // Referral Tracking
    const [partnerId, setPartnerId] = useState<string | null>(null);

    useEffect(() => {
        if (partnerParam) {
            console.log('[Register] Partner referral detected:', partnerParam);
            setPartnerId(partnerParam);
        } else {
            setPartnerId(null);
        }
        trackRegistrationEvent({
            event: 'register_page_view',
            partnerId: partnerParam
        });
    }, [partnerParam]);

    useEffect(() => {
        let active = true;

        if (!inviteToken) {
            setInviteState({
                loading: false,
                checked: true,
                valid: false,
                reason: null,
                expiresAt: null
            });
            return () => {
                active = false;
            };
        }

        setInviteState({
            loading: true,
            checked: false,
            valid: false,
            reason: null,
            expiresAt: null
        });

        validateRegistrationInvite({ inviteToken })
            .then((response) => {
                if (!active) return;
                setInviteState({
                    loading: false,
                    checked: true,
                    valid: response.inviteValid === true,
                    reason: response.inviteReason || null,
                    expiresAt: response.inviteExpiresAt || null
                });
            })
            .catch((err) => {
                if (!active) return;
                setInviteState({
                    loading: false,
                    checked: true,
                    valid: false,
                    reason: err?.inviteReason || 'validation_failed',
                    expiresAt: err?.inviteExpiresAt || null
                });
            });

        return () => {
            active = false;
        };
    }, [inviteToken]);

    useEffect(() => {
        let active = true;

        getRegistrationStatus()
            .then((response) => {
                if (!active) return;
                setRegistrationOpen(response.registrationOpen !== false);
                setManualApprovalEnabled(Boolean(response.manualApprovalEnabled));
            })
            .catch((err) => {
                console.error('Registration status error:', err);
            })
            .finally(() => {
                if (active) {
                    setStatusLoading(false);
                }
            });

        return () => {
            active = false;
        };
    }, []);

    // Form State
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [whatsapp, setWhatsapp] = useState('');
    const [password, setPassword] = useState('');
    const [consent, setConsent] = useState(false);
    const [honeypot, setHoneypot] = useState('');

    useEffect(() => {
        if (!success || !email) return;
        trackRegistrationEvent({
            event: 'register_confirmation_viewed',
            email,
            partnerId
        });
    }, [email, partnerId, success]);

    const handleFieldActivity = () => {
        if (hasStartedForm) return;
        setHasStartedForm(true);
        trackRegistrationEvent({
            event: 'register_form_started',
            email: email || undefined,
            partnerId
        });
    };

    const applyApiErrorState = (err: any) => {
        if (err?.requiresCaptcha) {
            setRequiresCaptcha(true);
            setCaptchaSiteKey(err?.captchaSiteKey || null);
            setCaptchaToken(null);
        }

        if (err?.error_code === 'disposable_email_blocked') {
            return t('register.disposable_email_error', {
                defaultValue: 'Use um e-mail real e permanente para criar sua conta.'
            });
        }

        if (err?.error_code === 'rate_limited') {
            return t('register.rate_limit_error', {
                defaultValue: 'Muitas tentativas agora. Aguarde alguns minutos e tente novamente.'
            });
        }

        if (err?.error_code === 'captcha_required') {
            return t('register.captcha_error', {
                defaultValue: 'Confirme que voce e humano para continuar.'
            });
        }

        if (err?.error_code === 'suspicious_activity') {
            return t('register.suspicious_error', {
                defaultValue: 'Detectamos atividade suspeita. Aguarde alguns minutos e tente novamente.'
            });
        }

        if (err?.error_code === 'registration_closed') {
            return 'Os novos cadastros estao temporariamente fechados. Entre na lista de espera.';
        }

        if (err?.error_code === 'invalid_invite') {
            return 'Este convite nao e mais valido. Solicite um novo link ao time responsavel.';
        }

        if (err?.error_code === 'auth_email_rate_limited') {
            return t('register.confirmation_email_rate_limited', {
                defaultValue: 'O servico de e-mail do cadastro atingiu o limite temporario de envio. Aguarde alguns minutos e tente novamente.'
            });
        }

        if (err?.error_code === 'confirmation_email_failed') {
            return t('register.confirmation_email_failed', {
                defaultValue: 'Nao foi possivel enviar o e-mail de confirmacao agora. Tente novamente em alguns minutos.'
            });
        }

        if (err?.error_code === 'waitlist_failed') {
            return 'Nao foi possivel entrar na lista de espera agora.';
        }

        const message = err?.error || t('register.resend_error', {
            defaultValue: 'Nao foi possivel concluir esta etapa agora.'
        });

        return message;
    };

    const getInviteReasonLabel = (reason?: string | null) => {
        if (reason === 'used') return 'Este convite ja foi utilizado.';
        if (reason === 'expired') return 'Este convite expirou.';
        if (reason === 'not_found') return 'Nao encontramos este convite.';
        if (reason === 'missing') return 'Link de convite ausente.';
        return 'Nao foi possivel validar este convite.';
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();

        setLoading(true);
        setError(null);
        setResendMessage(null);
        setWaitlistSuccess(null);

        try {
            const response = await registerAccount({
                name,
                email,
                whatsapp,
                password,
                partnerId,
                partnerConsent: partnerId ? consent : false,
                honeypot,
                captchaToken,
                inviteToken: inviteToken || null
            });

            if (response.success) {
                setRequiresCaptcha(false);
                setCaptchaSiteKey(null);
                setCaptchaToken(null);
                setApprovalPending(Boolean(response.approvalPending));
                setSuccess(true);
            }
        } catch (err: any) {
            console.error('Registration Error:', err);
            let msg = applyApiErrorState(err);
            if (err?.error_code === 'email_exists') {
                msg = t('register.email_exists_error');
            }
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setResending(true);
        setResendMessage(null);

        try {
            const response = await resendRegistrationEmail({
                email,
                flow: 'register',
                captchaToken
            });

            if (response.success) {
                setRequiresCaptcha(false);
                setCaptchaSiteKey(null);
                setCaptchaToken(null);
                setResendMessage(
                    t('register.resend_success', {
                        defaultValue: 'Enviamos um novo link de confirmacao para {{email}}.',
                        email
                    })
                );
            }
        } catch (err: any) {
            setResendMessage(applyApiErrorState(err));
        } finally {
            setResending(false);
        }
    };

    const handleJoinWaitlist = async (e: React.FormEvent) => {
        e.preventDefault();
        setWaitlistLoading(true);
        setError(null);
        setWaitlistSuccess(null);

        try {
            const response = await joinRegistrationWaitlist({ email });
            setWaitlistSuccess(
                response.alreadyJoined
                    ? 'Seu e-mail ja estava na lista. Vamos avisar quando abrirmos.'
                    : 'Voce entrou na lista de espera. Vamos avisar assim que abrirmos.'
            );
        } catch (err: any) {
            console.error('Waitlist error:', err);
            setError(applyApiErrorState(err));
        } finally {
            setWaitlistLoading(false);
        }
    };

    const handleChangeEmail = () => {
        setSuccess(false);
        setApprovalPending(false);
        setError(null);
        setResendMessage(null);
        setEmail('');
        setPassword('');
        setRequiresCaptcha(false);
        setCaptchaSiteKey(null);
        setCaptchaToken(null);
    };

    if (success) {
        return (
            <div className="min-h-screen bg-[#05050A] flex items-center justify-center p-6 relative overflow-hidden">
                <div className="absolute inset-0 opacity-40">
                    <Aurora
                        colorStops={['#3B82F6', '#8B5CF6', '#3B82F6']}
                        amplitude={1.2}
                        blend={0.6}
                        speed={0.3}
                    />
                </div>

                <div className="relative z-10 bg-white/5 border border-white/10 rounded-[3rem] p-12 max-w-md w-full text-center backdrop-blur-3xl animate-in fade-in zoom-in duration-700 shadow-2xl">
                    <div className="w-24 h-24 bg-green-500/20 border border-green-500/20 rounded-[2rem] flex items-center justify-center mx-auto mb-8 text-green-400">
                        <CheckCircle className="w-12 h-12" />
                    </div>
                    <h2
                        className="text-4xl font-display font-black text-white mb-4 italic uppercase tracking-tighter"
                        dangerouslySetInnerHTML={{
                            __html: sanitizeTranslationHtml(
                                approvalPending
                                    ? 'Cadastro recebido'
                                    : t('register.success_title')
                            )
                        }}
                    />
                    <p className="text-gray-400 mb-10 text-lg font-medium leading-relaxed">
                        {approvalPending
                            ? `Seu e-mail ${email} ja foi recebido. Assim que sua conta for aprovada, liberaremos o acesso no portal.`
                            : t('register.success_desc', { email })}
                    </p>
                    <div className="space-y-4">
                        <button
                            type="button"
                            onClick={() => openInboxForEmail(email)}
                            className="flex items-center justify-center gap-3 w-full bg-white text-black font-black uppercase text-sm py-5 rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-xl shadow-white/5 tracking-tighter italic"
                        >
                            <span>{approvalPending ? 'Abrir meu e-mail' : t('register.open_email_button', { defaultValue: 'Abrir meu e-mail' })}</span>
                            <ArrowRight className="w-4 h-4" />
                        </button>

                        <button
                            type="button"
                            onClick={handleResend}
                            disabled={resending || (requiresCaptcha && !captchaToken)}
                            className="flex items-center justify-center gap-3 w-full bg-white/5 border border-white/10 text-white font-black uppercase text-sm py-5 rounded-2xl transition-all hover:bg-white/10 active:scale-95 tracking-tighter italic disabled:opacity-60"
                        >
                            {resending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <RefreshCw className="w-4 h-4" />
                            )}
                            <span>{t('register.resend_email_button', { defaultValue: 'Reenviar e-mail' })}</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleChangeEmail}
                            className="flex items-center justify-center gap-3 w-full bg-transparent text-gray-300 font-black uppercase text-sm py-4 rounded-2xl transition-all hover:text-white tracking-tighter italic"
                        >
                            <PencilLine className="w-4 h-4" />
                            <span>{t('register.change_email_button', { defaultValue: 'Trocar e-mail' })}</span>
                        </button>
                    </div>

                    {requiresCaptcha && captchaSiteKey && (
                        <div className="mt-6 bg-white/5 border border-white/10 rounded-3xl p-5 space-y-3 text-left">
                            <p className="text-xs text-gray-300 font-bold uppercase tracking-[0.18em]">
                                {t('register.captcha_title', { defaultValue: 'Confirme que voce e humano' })}
                            </p>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                {t('register.captcha_desc', {
                                    defaultValue: 'Detectamos um volume acima do normal neste fluxo. Confirme o desafio para continuar.'
                                })}
                            </p>
                            <RiskCaptcha siteKey={captchaSiteKey} onTokenChange={setCaptchaToken} />
                        </div>
                    )}

                    {resendMessage && (
                        <p className="mt-6 text-sm font-medium text-gray-400 leading-relaxed">
                            {resendMessage}
                        </p>
                    )}

                    {approvalPending && (
                        <div className="mt-6 bg-amber-500/10 border border-amber-500/20 rounded-3xl p-5 text-left">
                            <p className="text-xs text-amber-300 font-bold uppercase tracking-[0.18em]">
                                Aprovacao manual ativa
                            </p>
                            <p className="mt-2 text-sm text-gray-300 leading-relaxed">
                                Depois da confirmacao de e-mail, sua conta fica em analise ate liberacao do time interno.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (statusLoading || inviteState.loading) {
        return (
            <div className="min-h-screen bg-[#05050A] flex items-center justify-center text-white">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (inviteToken && inviteState.checked && !inviteState.valid) {
        return (
            <div className="min-h-screen bg-[#05050A] flex items-center justify-center p-6 relative overflow-hidden font-sans">
                <div className="absolute inset-0 opacity-40">
                    <Aurora
                        colorStops={['#EF4444', '#7C3AED', '#111827']}
                        amplitude={1.2}
                        blend={0.55}
                        speed={0.22}
                    />
                </div>

                <div className="relative z-10 w-full max-w-2xl bg-white/5 border border-white/10 rounded-[3.5rem] p-8 md:p-14 shadow-2xl backdrop-blur-3xl">
                    <div className="inline-flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 px-4 py-2 rounded-full mb-8">
                        <AlertCircle className="w-4 h-4 text-rose-300" />
                        <span className="text-[10px] font-black text-rose-200 uppercase tracking-[0.2em] italic">
                            Convite invalido
                        </span>
                    </div>

                    <h1 className="text-4xl md:text-6xl font-display font-black text-white italic uppercase tracking-tighter leading-[0.9] mb-6">
                        Este link <br />
                        <span className="text-rose-300">nao pode mais ser usado</span>
                    </h1>

                    <p className="text-gray-400 text-lg font-medium leading-relaxed max-w-xl mb-8">
                        {getInviteReasonLabel(inviteState.reason)}
                    </p>

                    {inviteState.expiresAt && (
                        <div className="bg-white/5 border border-white/10 rounded-3xl p-5 mb-8">
                            <p className="text-xs text-gray-300 font-bold uppercase tracking-[0.18em]">
                                Expiracao registrada
                            </p>
                            <p className="mt-2 text-sm text-gray-400 leading-relaxed">
                                {new Date(inviteState.expiresAt).toLocaleString()}
                            </p>
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-4">
                        <a
                            href="/activate"
                            className="flex-1 bg-white text-black font-black uppercase text-sm py-5 rounded-2xl text-center transition-all hover:scale-[1.02] active:scale-95 tracking-tighter italic"
                        >
                            Voltar ao portal
                        </a>
                        <button
                            type="button"
                            onClick={() => window.location.href = '/register'}
                            className="flex-1 bg-white/5 border border-white/10 text-white font-black uppercase text-sm py-5 rounded-2xl transition-all hover:bg-white/10 active:scale-95 tracking-tighter italic"
                        >
                            Abrir cadastro publico
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const benefitsArr = [
        { icon: Zap, text: t('register.benefits.checkout') },
        { icon: Globe, text: t('register.benefits.domain') },
        { icon: Fingerprint, text: t('register.benefits.members') },
        { icon: Shield, text: t('register.benefits.admin') }
    ];

    if (!registrationOpen && !inviteState.valid) {
        return (
            <div className="min-h-screen bg-[#05050A] flex items-center justify-center p-6 relative overflow-hidden font-sans">
                <div className="absolute inset-0 opacity-40">
                    <Aurora
                        colorStops={['#8A2BE2', '#4B0082', '#0000FF']}
                        amplitude={1.5}
                        blend={0.5}
                        speed={0.2}
                    />
                </div>

                <div className="relative z-10 w-full max-w-2xl bg-white/5 border border-white/10 rounded-[3.5rem] p-8 md:p-14 shadow-2xl backdrop-blur-3xl">
                    <div className="inline-flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-full mb-8">
                        <Sparkles className="w-4 h-4 text-amber-300" />
                        <span className="text-[10px] font-black text-amber-200 uppercase tracking-[0.2em] italic">
                            Lancamento controlado
                        </span>
                    </div>

                    <h1 className="text-4xl md:text-6xl font-display font-black text-white italic uppercase tracking-tighter leading-[0.9] mb-6">
                        Em breve <br />
                        <span className="text-amber-300">entre na lista de espera</span>
                    </h1>

                    <p className="text-gray-400 text-lg font-medium leading-relaxed max-w-xl mb-10">
                        Estamos liberando novas contas em ondas. Deixe seu e-mail para ser avisado assim que o cadastro abrir novamente.
                    </p>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-5 rounded-2xl mb-6 flex items-start gap-4">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                            <span className="text-sm font-bold tracking-tight">{error}</span>
                        </div>
                    )}

                    {waitlistSuccess && (
                        <div className="bg-green-500/10 border border-green-500/20 text-green-300 p-5 rounded-2xl mb-6 flex items-start gap-4">
                            <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                            <span className="text-sm font-bold tracking-tight">{waitlistSuccess}</span>
                        </div>
                    )}

                    <form onSubmit={handleJoinWaitlist} className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-2">
                                Seu melhor e-mail
                            </label>
                            <div className="relative group">
                                <Mail className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-all duration-300" />
                                <input
                                    type="email"
                                    required
                                    className="w-full bg-white/5 border border-white/5 rounded-2xl pl-16 pr-6 py-5 text-white font-bold outline-none transition-all placeholder:text-gray-700 placeholder:font-medium focus:ring-primary/40"
                                    placeholder="ex: seu@email.com"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={waitlistLoading}
                            className="w-full bg-primary text-white font-black uppercase text-lg py-6 rounded-[2rem] transition-all hover:scale-[1.03] active:scale-95 shadow-2xl shadow-primary/20 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group italic tracking-tighter"
                        >
                            {waitlistLoading ? (
                                <Loader2 className="w-6 h-6 animate-spin" />
                            ) : (
                                <>
                                    <span>Quero ser avisado</span>
                                    <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-transform" />
                                </>
                            )}
                        </button>
                    </form>

                    {manualApprovalEnabled && (
                        <div className="mt-6 bg-white/5 border border-white/10 rounded-3xl p-5">
                            <p className="text-xs text-gray-300 font-bold uppercase tracking-[0.18em]">
                                Modo de aprovacao manual preparado
                            </p>
                            <p className="mt-2 text-sm text-gray-400 leading-relaxed">
                                Quando o cadastro voltar, novas contas podem entrar em fila de aprovacao antes da liberacao final.
                            </p>
                        </div>
                    )}

                    <div className="mt-8 text-center">
                        <p className="text-gray-500 font-medium text-sm italic mb-2">{t('register.already_have_account')}</p>
                        <a
                            href="/activate"
                            className="text-white hover:text-primary font-black uppercase tracking-widest text-[10px] transition-all italic border-b border-white/10 hover:border-primary pb-1"
                        >
                            {t('register.login_link')}
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#05050A] flex items-center justify-center p-6 relative overflow-hidden font-sans">
            <div className="absolute inset-0 opacity-40">
                <Aurora
                    colorStops={['#8A2BE2', '#4B0082', '#0000FF']}
                    amplitude={1.5}
                    blend={0.5}
                    speed={0.2}
                />
            </div>

            <div className="absolute top-[10%] left-[5%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] pointer-events-none animate-pulse" />
            <div className="absolute bottom-[10%] right-[5%] w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[100px] pointer-events-none animate-pulse duration-5000" />

            <div className="relative z-10 w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                <div className="hidden lg:block animate-in fade-in slide-in-from-left-8 duration-1000">
                    <div className="inline-flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2 rounded-full mb-8 backdrop-blur-xl">
                        <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                        <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em] italic">
                            {t('register.hero_subtitle')}
                        </span>
                    </div>
                    <h1 className="text-6xl xl:text-8xl font-display font-black text-white italic uppercase tracking-tighter leading-[0.9] mb-8">
                        <span dangerouslySetInnerHTML={{ __html: sanitizeTranslationHtml(t('register.hero_title')) }} />
                    </h1>

                    <div className="grid grid-cols-1 gap-6 max-w-md">
                        {benefitsArr.map((benefit, i) => (
                            <div key={i} className="flex items-center gap-4 bg-white/5 border border-white/5 p-4 rounded-2xl backdrop-blur-md group hover:bg-white/10 transition-all border-l-2 border-l-primary/30">
                                <div className="p-3 rounded-xl bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                                    <benefit.icon className="w-6 h-6" />
                                </div>
                                <span className="text-white font-bold text-lg tracking-tight">{benefit.text}</span>
                            </div>
                        ))}
                    </div>

                    <div className="mt-12 flex items-center gap-4 animate-bounce">
                        <div className="flex -space-x-4">
                            {[1, 2, 3, 4].map(n => (
                                <div key={n} className="w-10 h-10 rounded-full border-2 border-[#05050A] bg-gray-800 overflow-hidden">
                                    <img src={`https://i.pravatar.cc/100?img=${n + 20}`} alt="User" />
                                </div>
                            ))}
                        </div>
                        <p className="text-gray-400 font-medium">
                            <span className="text-white font-bold">+1.240</span> {t('register.entrepreneurs_count').replace('{{count}}', '')}
                        </p>
                    </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-[3.5rem] p-8 md:p-14 shadow-2xl backdrop-blur-3xl relative overflow-hidden animate-in fade-in slide-in-from-right-8 duration-1000">
                    <div className="lg:hidden text-center mb-8">
                        <h1 className="text-4xl font-display font-black text-white italic uppercase tracking-tighter mb-2">
                             <span dangerouslySetInnerHTML={{ __html: sanitizeTranslationHtml(t('register.form_title')) }} />
                        </h1>
                        <p className="text-gray-400 font-medium">{t('register.form_subtitle')}</p>
                    </div>

                    {inviteState.valid && (
                        <div className="mb-8 inline-flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-full">
                            <CheckCircle className="w-4 h-4 text-emerald-300" />
                            <span className="text-[10px] font-black text-emerald-200 uppercase tracking-[0.2em] italic">
                                Convite validado
                            </span>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-5 rounded-2xl mb-8 flex items-start gap-4 animate-in fade-in zoom-in duration-300">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                            <span className="text-sm font-bold tracking-tight">{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleRegister} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-2">{t('register.name_label')}</label>
                            <div className="relative group">
                                <User className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-all duration-300" />
                                <input
                                    type="text"
                                    required
                                    className="w-full bg-white/5 border border-white/5 rounded-2xl pl-16 pr-6 py-5 text-white font-bold outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 focus:bg-white/[0.08] transition-all placeholder:text-gray-700 placeholder:font-medium"
                                    placeholder={t('register.name_placeholder')}
                                    value={name}
                                    onChange={e => {
                                        setName(e.target.value);
                                        handleFieldActivity();
                                    }}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-2">{t('register.email_label')}</label>
                            <div className="relative group">
                                <Mail className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-all duration-300" />
                                <input
                                    type="email"
                                    required
                                    className="w-full bg-white/5 border border-white/5 rounded-2xl pl-16 pr-6 py-5 text-white font-bold outline-none transition-all placeholder:text-gray-700 placeholder:font-medium focus:ring-primary/40"
                                    placeholder="ex: seu@email.com"
                                    value={email}
                                    onChange={e => {
                                        setEmail(e.target.value);
                                        handleFieldActivity();
                                    }}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-2">WhatsApp</label>
                            <div className="relative group">
                                <PhoneInput
                                    required
                                    variant="dark"
                                    className="w-full bg-white/5 border border-white/5 rounded-2xl pl-[100px] pr-6 py-5 text-white font-bold outline-none transition-all placeholder:text-gray-700 placeholder:font-medium focus:ring-primary/40"
                                    value={whatsapp}
                                    onChange={e => {
                                        setWhatsapp(e.target.value);
                                        handleFieldActivity();
                                    }}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-2">{t('activation.password')}</label>
                            <div className="relative group">
                                <Lock className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-all duration-300" />
                                <input
                                    type="password"
                                    required
                                    minLength={6}
                                    className="w-full bg-white/5 border border-white/5 rounded-2xl pl-16 pr-6 py-5 text-white font-bold outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 focus:bg-white/[0.08] transition-all placeholder:text-gray-700 placeholder:font-medium"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={e => {
                                        setPassword(e.target.value);
                                        handleFieldActivity();
                                    }}
                                />
                            </div>
                        </div>

                        <div className="absolute left-[-10000px] top-auto w-px h-px overflow-hidden" aria-hidden="true">
                            <label htmlFor="website">Website</label>
                            <input
                                id="website"
                                name="website"
                                type="text"
                                tabIndex={-1}
                                autoComplete="off"
                                value={honeypot}
                                onChange={e => setHoneypot(e.target.value)}
                            />
                        </div>

                        {partnerId && (
                            <div className="bg-primary/5 border border-primary/10 rounded-3xl p-6 flex items-start gap-4 animate-in slide-in-from-bottom-4 duration-500 group hover:bg-primary/10 transition-colors">
                                <div className="pt-1">
                                    <input
                                        type="checkbox"
                                        id="partner-consent"
                                        required
                                        checked={consent}
                                        onChange={e => setConsent(e.target.checked)}
                                        className="w-6 h-6 rounded-lg border-white/20 bg-white/5 text-primary focus:ring-primary/50 cursor-pointer"
                                    />
                                </div>
                                <label htmlFor="partner-consent" className="text-sm text-gray-400 leading-relaxed cursor-pointer select-none">
                                    <span className="font-black text-white block mb-1 uppercase tracking-tighter italic">{t('register.consent_label')}</span>
                                    {t('register.consent_desc')}
                                </label>
                            </div>
                        )}

                        {requiresCaptcha && captchaSiteKey && (
                            <div className="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-3">
                                <p className="text-xs text-gray-300 font-bold uppercase tracking-[0.18em]">
                                    {t('register.captcha_title', { defaultValue: 'Confirme que voce e humano' })}
                                </p>
                                <p className="text-sm text-gray-400 leading-relaxed">
                                    {t('register.captcha_desc', {
                                        defaultValue: 'Detectamos um volume acima do normal neste fluxo. Confirme o desafio para continuar.'
                                    })}
                                </p>
                                <RiskCaptcha siteKey={captchaSiteKey} onTokenChange={setCaptchaToken} />
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || (requiresCaptcha && !captchaToken)}
                            className="w-full bg-primary text-white font-black uppercase text-lg py-6 rounded-[2rem] transition-all hover:scale-[1.03] active:scale-95 shadow-2xl shadow-primary/20 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group italic tracking-tighter mt-4"
                        >
                            {loading ? (
                                <Loader2 className="w-6 h-6 animate-spin" />
                            ) : (
                                <>
                                    <span>{t('register.activate_free_button')}</span>
                                    <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-transform" />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-8 text-center">
                        <p className="text-gray-500 font-medium text-sm italic mb-2">{t('register.already_have_account')}</p>
                        <a
                            href="/activate"
                            className="text-white hover:text-primary font-black uppercase tracking-widest text-[10px] transition-all italic border-b border-white/10 hover:border-primary pb-1"
                        >
                            {t('register.login_link')}
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};

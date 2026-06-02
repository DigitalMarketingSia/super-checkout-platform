import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mail, Lock, User, Loader2, ArrowRight, AlertCircle, CheckCircle, Sparkles, RefreshCw, PencilLine, Zap, Globe, Fingerprint, Shield } from 'lucide-react';

import { useTranslation } from 'react-i18next';
import { sanitizeTranslationHtml } from '../../utils/sanitize';
import { openInboxForEmail } from '../../utils/emailInbox';
import { getRegistrationStatus, getWaitlistWhatsappGroupLink, joinRegistrationWaitlist, registerAccount, resendRegistrationEmail, trackRegistrationEvent, validateInviteToken as validateRegistrationInvite } from '../../services/registerFlow';
import { RiskCaptcha } from '../../components/auth/RiskCaptcha';
import { PhoneInput } from '../../components/ui/PhoneInput';
import { getPlatformPrivacyUrl, getPlatformTermsUrl } from '../../config/platformUrls';
import {
    formatPlatformLegalPublishedAt,
    PLATFORM_LEGAL_CONTACT_EMAIL,
    PLATFORM_LEGAL_VERSION,
} from '../../config/platformLegal';

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
    const [waitlistWhatsappGroupUrl, setWaitlistWhatsappGroupUrl] = useState<string | null>(null);
    const [statusLoading, setStatusLoading] = useState(true);
    const [waitlistLoading, setWaitlistLoading] = useState(false);
    const [waitlistGroupOpening, setWaitlistGroupOpening] = useState(false);
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
                setWaitlistWhatsappGroupUrl(response.waitlistWhatsappGroupUrl || null);
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
    const [platformLegalAccepted, setPlatformLegalAccepted] = useState(false);
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
            if (!platformLegalAccepted) {
                throw new Error(t('register.platform_legal_required', {
                    defaultValue: 'Voce precisa aceitar os Termos de Uso e a Politica de Privacidade da plataforma para criar sua conta.'
                }));
            }

            const response = await registerAccount({
                name,
                email,
                whatsapp,
                password,
                platformLegalAccepted,
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
            if (!platformLegalAccepted) {
                throw new Error(t('register.platform_legal_required', {
                    defaultValue: 'Voce precisa aceitar os Termos de Uso e a Politica de Privacidade da plataforma para continuar.'
                }));
            }

            const response = await joinRegistrationWaitlist({
                name,
                email,
                platformLegalAccepted
            });
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

    const handleOpenWaitlistGroup = async () => {
        if (!email) {
            setError('Informe seu e-mail para abrir o grupo.');
            return;
        }

        setWaitlistGroupOpening(true);
        setError(null);

        try {
            const response = await getWaitlistWhatsappGroupLink({ email });
            const groupUrl = response.waitlistGroupUrl || waitlistWhatsappGroupUrl;

            if (!groupUrl) {
                setError('Nenhum grupo VIP ativo foi configurado ainda. Fique de olho no seu e-mail.');
                return;
            }

            window.open(groupUrl, '_blank', 'noopener,noreferrer');
        } catch (err: any) {
            console.error('Waitlist group link error:', err);
            setError(applyApiErrorState(err));
        } finally {
            setWaitlistGroupOpening(false);
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

    const renderPlatformLegalAcceptance = () => (
        <div
            className={`relative overflow-hidden rounded-3xl p-5 flex items-start gap-4 animate-in slide-in-from-bottom-4 duration-500 transition-all ${
                platformLegalAccepted
                    ? 'border border-emerald-300/25 bg-emerald-500/[0.10] shadow-[0_0_28px_rgba(16,185,129,0.14)] backdrop-blur-xl'
                    : 'border border-white/8 bg-white/[0.03]'
            }`}
        >
            <div
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 rounded-3xl transition-all duration-500 ${
                    platformLegalAccepted ? 'opacity-100' : 'opacity-0'
                }`}
            >
                <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(16,185,129,0.18),rgba(255,255,255,0.04)_45%,rgba(16,185,129,0.10))]" />
                <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-emerald-100/70 to-transparent" />
            </div>

            <div className="relative pt-0.5">
                <input
                    type="checkbox"
                    id="platform-legal-acceptance"
                    required
                    checked={platformLegalAccepted}
                    onChange={e => setPlatformLegalAccepted(e.target.checked)}
                    className={`w-5 h-5 rounded-lg cursor-pointer transition-all duration-300 ${
                        platformLegalAccepted
                            ? 'border-emerald-100/50 bg-emerald-400/25 text-emerald-100 shadow-[0_0_0_6px_rgba(16,185,129,0.10)] focus:ring-emerald-300/40'
                            : 'border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500/50'
                    }`}
                />
            </div>

            <label
                htmlFor="platform-legal-acceptance"
                className={`relative cursor-pointer select-none text-[9px] font-black uppercase tracking-[0.18em] leading-[1.9] transition-colors ${
                    platformLegalAccepted ? 'text-emerald-100/85' : 'text-gray-500'
                }`}
            >
                <span className={`block mb-2 italic transition-colors ${platformLegalAccepted ? 'text-emerald-50' : 'text-white'}`}>
                    {t('register.platform_legal_label', { defaultValue: 'Aceite institucional da plataforma' })}
                </span>
                {t('register.platform_legal_desc_prefix', { defaultValue: 'Li e aceito os' })}
                {' '}
                <a
                    href={getPlatformTermsUrl()}
                    target="_blank"
                    rel="noreferrer"
                    className={`underline underline-offset-4 transition-colors ${
                        platformLegalAccepted ? 'text-emerald-50 hover:text-white' : 'text-white hover:text-emerald-300'
                    }`}
                >
                    {t('register.platform_terms_link', { defaultValue: 'Termos de Uso' })}
                </a>
                {' '}
                {t('register.platform_legal_desc_middle', { defaultValue: 'e a' })}
                {' '}
                <a
                    href={getPlatformPrivacyUrl()}
                    target="_blank"
                    rel="noreferrer"
                    className={`underline underline-offset-4 transition-colors ${
                        platformLegalAccepted ? 'text-emerald-50 hover:text-white' : 'text-white hover:text-emerald-300'
                    }`}
                >
                    {t('register.platform_privacy_link', { defaultValue: 'Politica de Privacidade' })}
                </a>
                {' '}
                {t('register.platform_legal_desc_suffix', {
                    defaultValue: 'da plataforma, na versao {{version}}.',
                    version: PLATFORM_LEGAL_VERSION
                })}
            </label>
        </div>
    );

    if (success) {
        return (
            <div className="min-h-screen bg-[#020205] flex items-center justify-center p-6 relative overflow-hidden font-sans">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-600/10 rounded-full blur-[120px] pointer-events-none" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />
                <div className="absolute top-[12%] left-[6%] w-[460px] h-[460px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse" />
                <div className="absolute bottom-[12%] right-[6%] w-[360px] h-[360px] bg-emerald-400/5 rounded-full blur-[100px] pointer-events-none animate-pulse duration-[5000ms]" />

                <div className="relative z-10 w-full max-w-md bg-black/50 border border-white/5 rounded-[3.5rem] p-8 md:p-12 shadow-2xl backdrop-blur-3xl overflow-hidden animate-in fade-in zoom-in duration-700 text-center group/card">
                    <div
                        className="absolute -inset-px rounded-[3.5rem] border border-transparent bg-gradient-to-br from-emerald-500/40 via-transparent to-transparent pointer-events-none z-10"
                        style={{ maskImage: 'linear-gradient(135deg, black, transparent 50%)', WebkitMaskImage: 'linear-gradient(135deg, black, transparent 50%)' }}
                    />

                    <div className="relative z-20">
                        <div className="inline-flex items-center gap-3 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full mb-8">
                            <img src="/logo.png" alt="Logo" className="w-3.5 h-3.5 object-contain grayscale brightness-200" />
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] italic">
                                Cadastro confirmado
                            </span>
                        </div>

                        <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-8 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.12)]">
                            <CheckCircle className="w-10 h-10" />
                        </div>

                        <h2
                            className="text-4xl md:text-5xl font-display font-black text-white mb-4 italic uppercase tracking-tighter leading-[0.9]"
                            dangerouslySetInnerHTML={{
                                __html: sanitizeTranslationHtml(
                                    approvalPending
                                        ? 'Cadastro recebido'
                                        : t('register.success_title')
                                )
                            }}
                        />
                        <p className="text-gray-400 mb-10 text-base font-medium leading-relaxed">
                            {approvalPending
                                ? `Seu e-mail ${email} ja foi recebido. Assim que sua conta for aprovada, liberaremos o acesso no portal.`
                                : t('register.success_desc', { email })}
                        </p>
                        <div className="space-y-4">
                            <button
                                type="button"
                                onClick={() => openInboxForEmail(email)}
                                className="relative flex items-center justify-center gap-3 w-full bg-gradient-to-r from-emerald-400 to-emerald-600 text-[#020205] font-black uppercase text-sm py-5 rounded-2xl transition-all hover:scale-[1.02] active:scale-95 shadow-[0_0_30px_rgba(16,185,129,0.24)] tracking-widest italic overflow-hidden group/btn"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover/btn:animate-[shimmer_1.5s_infinite] pointer-events-none" />
                                <span>{approvalPending ? 'Abrir meu e-mail' : t('register.open_email_button', { defaultValue: 'Abrir meu e-mail' })}</span>
                                <ArrowRight className="w-4 h-4" />
                            </button>

                            <button
                                type="button"
                                onClick={handleResend}
                                disabled={resending || (requiresCaptcha && !captchaToken)}
                                className="flex items-center justify-center gap-3 w-full bg-white/5 border border-white/10 text-white font-black uppercase text-sm py-5 rounded-2xl transition-all hover:bg-white/10 active:scale-95 tracking-widest italic disabled:opacity-60"
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
                                className="flex items-center justify-center gap-3 w-full bg-transparent text-gray-500 font-black uppercase text-sm py-4 rounded-2xl transition-all hover:text-white tracking-widest italic"
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

                <style dangerouslySetInnerHTML={{ __html: `
                    @keyframes shimmer {
                        100% {
                            transform: translateX(100%);
                        }
                    }
                `}} />
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
            <div className="min-h-screen bg-[#020205] flex items-center justify-center p-6 relative overflow-hidden font-sans">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-600/10 rounded-full blur-[120px] pointer-events-none" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />
                <div className="absolute top-[15%] right-[8%] w-[360px] h-[360px] bg-rose-500/10 rounded-full blur-[110px] pointer-events-none" />

                <div className="relative z-10 w-full max-w-2xl bg-black/50 border border-white/5 rounded-[3.5rem] p-8 md:p-14 shadow-2xl backdrop-blur-3xl overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-700 group/card">
                    <div
                        className="absolute -inset-px rounded-[3.5rem] border border-transparent bg-gradient-to-br from-rose-500/35 via-transparent to-emerald-500/10 pointer-events-none z-10"
                        style={{ maskImage: 'linear-gradient(135deg, black, transparent 55%)', WebkitMaskImage: 'linear-gradient(135deg, black, transparent 55%)' }}
                    />

                    <div className="relative z-20">
                        <div className="inline-flex items-center gap-3 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full mb-8">
                            <AlertCircle className="w-4 h-4 text-rose-300" />
                            <span className="text-[9px] font-black text-rose-200 uppercase tracking-[0.2em] italic">
                                Convite invalido
                            </span>
                        </div>

                        <h1 className="text-4xl md:text-6xl font-display font-black text-white italic uppercase tracking-tighter leading-[0.9] mb-6">
                            Este link <br />
                            <span className="bg-gradient-to-r from-rose-300 to-rose-500 bg-clip-text text-transparent">nao pode mais ser usado</span>
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
                                className="relative flex-1 bg-gradient-to-r from-emerald-400 to-emerald-600 text-[#020205] font-black uppercase text-sm py-5 rounded-2xl text-center transition-all hover:scale-[1.02] active:scale-95 tracking-widest italic overflow-hidden group/btn"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover/btn:animate-[shimmer_1.5s_infinite] pointer-events-none" />
                                Voltar ao portal
                            </a>
                            <button
                                type="button"
                                onClick={() => window.location.href = '/register'}
                                className="flex-1 bg-white/5 border border-white/10 text-white font-black uppercase text-sm py-5 rounded-2xl transition-all hover:bg-white/10 active:scale-95 tracking-widest italic"
                            >
                                Abrir cadastro publico
                            </button>
                        </div>
                    </div>
                </div>

                <style dangerouslySetInnerHTML={{ __html: `
                    @keyframes shimmer {
                        100% {
                            transform: translateX(100%);
                        }
                    }
                `}} />
            </div>
        );
    }
    const benefitsArr = [
        { icon: Zap, text: t('register.benefits.checkout') },
        { icon: Globe, text: 'Domínio Personalizado' },
        { icon: Fingerprint, text: t('register.benefits.members') },
        { icon: Shield, text: t('register.benefits.admin') }
    ];

    if (!registrationOpen && !inviteState.valid) {
        if (waitlistSuccess) {
            return (
                <div className="min-h-screen bg-[#020205] flex items-center justify-center p-6 relative overflow-hidden font-sans">
                    {/* Background Green Glows */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />

                    <div className="relative z-10 w-full max-w-md bg-black/60 border border-white/10 rounded-[2.5rem] p-10 md:p-12 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in duration-700 text-center overflow-hidden">
                        {/* Green Edge Light */}
                        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
                        
                        <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-8 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                            <CheckCircle className="w-10 h-10" />
                        </div>

                        <h1 className="text-3xl font-display font-black text-white italic uppercase tracking-tighter leading-tight mb-4">
                            Pronto, <span className="text-emerald-400">{name.split(' ')[0] || 'você'}</span>!
                        </h1>
                        <p className="text-gray-400 font-medium mb-10 leading-relaxed">
                            Você está na lista. Enquanto isso, entre no grupo VIP para receber o convite antes de todo mundo.
                        </p>

                        <div className="space-y-6">
                            <button
                                type="button"
                                disabled={waitlistGroupOpening}
                                onClick={handleOpenWaitlistGroup}
                                className="flex items-center justify-center gap-3 w-full bg-gradient-to-r from-[#25D366] to-[#128C7E] text-white font-black uppercase text-sm py-5 rounded-2xl transition-all hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(37,211,102,0.2)] active:scale-95 italic tracking-widest"
                            >
                                {waitlistGroupOpening ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-current" />}
                                <span>Entrar no Grupo VIP</span>
                            </button>

                            <div className="pt-4">
                                <a
                                    href="/activate"
                                    className="text-gray-600 hover:text-white font-black uppercase tracking-widest text-[10px] transition-all italic border-b border-white/5 hover:border-white pb-1"
                                >
                                    Fazer Login na Central
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="min-h-screen bg-[#020205] flex items-center justify-center p-6 relative overflow-hidden font-sans">
                {/* Background Ambient Green Light */}
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-600/10 rounded-full blur-[120px] pointer-events-none" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />

                <div className="relative z-10 w-full max-w-md bg-black/50 rounded-[3rem] p-8 md:p-12 shadow-2xl backdrop-blur-3xl animate-in fade-in slide-in-from-bottom-8 duration-1000 overflow-hidden group/card border border-white/5">
                    {/* Glowing Rim Light Effect (Corner Contour) */}
                    <div className="absolute -inset-px rounded-[3rem] border border-transparent bg-gradient-to-br from-emerald-500/40 via-transparent to-transparent pointer-events-none z-10" 
                         style={{ maskImage: 'linear-gradient(135deg, black, transparent 50%)', WebkitMaskImage: 'linear-gradient(135deg, black, transparent 50%)' }} />

                    <div className="relative z-20">
                        <div className="text-center mb-10">
                            <div className="inline-flex items-center gap-3 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full mb-6">
                                <img src="/logo.png" alt="Logo" className="w-3.5 h-3.5 object-contain grayscale brightness-200" />
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] italic">
                                    Convite Exclusivo
                                </span>
                            </div>
                            <h1 className="text-4xl md:text-5xl font-display font-black text-white italic uppercase tracking-tighter leading-[0.85] mb-3">
                                Acesso <br />
                                <span className="bg-gradient-to-r from-emerald-400 to-emerald-600 bg-clip-text text-transparent">Antecipado</span>
                            </h1>
                        </div>

                        <form onSubmit={handleJoinWaitlist} className="space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">Nome</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full bg-white/[0.04] border border-white/10 rounded-2xl px-6 py-4 text-white font-bold outline-none transition-all placeholder:text-gray-700 focus:bg-white focus:text-[#020205] focus:border-white shadow-inner"
                                        placeholder="Seu nome"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">E-mail</label>
                                    <input
                                        type="email"
                                        required
                                        className="w-full bg-white/[0.04] border border-white/10 rounded-2xl px-6 py-4 text-white font-bold outline-none transition-all placeholder:text-gray-700 focus:bg-white focus:text-[#020205] focus:border-white shadow-inner"
                                        placeholder="seu@email.com"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                    />
                                </div>
                            </div>

                            {renderPlatformLegalAcceptance()}

                            {error && (
                                <p className="text-red-500/80 text-[10px] font-bold text-center italic">{error}</p>
                            )}

                            <button
                                type="submit"
                                disabled={waitlistLoading}
                                className="relative w-full mt-2 bg-gradient-to-r from-emerald-400 to-emerald-600 text-[#020205] font-black uppercase text-sm py-5 rounded-2xl transition-all hover:scale-[1.02] active:scale-95 shadow-[0_0_30px_rgba(16,185,129,0.3)] flex items-center justify-center gap-2 italic tracking-widest disabled:opacity-50 overflow-hidden group/btn"
                            >
                                {/* Shine Effect */}
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover/btn:animate-[shimmer_1.5s_infinite] pointer-events-none" />
                                
                                {waitlistLoading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>
                                        <span>Quero meu acesso antecipado</span>
                                        <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </form>

                        <div className="mt-10 pt-8 border-t border-white/5 flex flex-col items-center gap-4">
                            <p className="text-gray-600 text-[10px] font-bold italic">
                                <span className="text-emerald-500/50">47 pessoas</span> já estão na lista
                            </p>
                            
                            <a
                                href="/activate"
                                className="text-gray-700 hover:text-white font-black uppercase tracking-widest text-[9px] transition-all italic"
                            >
                                Já possui conta? Fazer Login
                            </a>
                        </div>
                    </div>
                </div>

                <style dangerouslySetInnerHTML={{ __html: `
                    @keyframes shimmer {
                        100% {
                            transform: translateX(100%);
                        }
                    }
                `}} />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#020205] flex items-center justify-center p-6 relative overflow-hidden font-sans">
            {/* Background Ambient Green Light */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-600/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />

            <div className="absolute top-[10%] left-[5%] w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse" />
            <div className="absolute bottom-[10%] right-[5%] w-[400px] h-[400px] bg-emerald-400/5 rounded-full blur-[100px] pointer-events-none animate-pulse duration-[5000ms]" />

            <div className="relative z-10 w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                <div className="hidden lg:block animate-in fade-in slide-in-from-left-8 duration-1000">
                    <div className="inline-flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2 rounded-full mb-8 backdrop-blur-xl">
                        <img src="/logo.png" alt="Logo" className="w-4 h-4 object-contain grayscale brightness-200" />
                        <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em] italic">
                            {t('register.hero_subtitle')}
                        </span>
                    </div>
                    <h1 className="text-6xl xl:text-8xl font-display font-black text-white italic uppercase tracking-tighter leading-[0.9] mb-8">
                        <span dangerouslySetInnerHTML={{ __html: sanitizeTranslationHtml(t('register.hero_title')) }} />
                    </h1>

                    <div className="grid grid-cols-1 gap-6 max-w-md">
                        {benefitsArr.map((benefit, i) => (
                            <div key={i} className="flex items-center gap-4 bg-white/5 border border-white/5 p-4 rounded-2xl backdrop-blur-md group hover:bg-white/10 transition-all border-l-2 border-l-emerald-500/30">
                                <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform">
                                    <benefit.icon className="w-6 h-6" />
                                </div>
                                <span className="text-white font-bold text-lg tracking-tight">{benefit.text}</span>
                            </div>
                        ))}
                    </div>

                    <div className="mt-12 flex items-center gap-4">
                        <div className="flex -space-x-4">
                            {[1, 2, 3, 4].map(n => (
                                <div key={n} className="w-10 h-10 rounded-full border-2 border-[#020205] bg-gray-800 overflow-hidden">
                                    <img src={`https://i.pravatar.cc/100?img=${n + 20}`} alt="User" />
                                </div>
                            ))}
                        </div>
                        <p className="text-gray-400 font-medium italic">
                            <span className="text-white font-bold">+1.240</span> {t('register.entrepreneurs_count').replace('{{count}}', '')}
                        </p>
                    </div>
                </div>

                <div className="relative bg-black/50 border border-white/5 rounded-[3.5rem] p-8 md:p-14 shadow-2xl backdrop-blur-3xl overflow-hidden animate-in fade-in slide-in-from-right-8 duration-1000 group/card">
                    {/* Glowing Rim Light Effect (Corner Contour) */}
                    <div className="absolute -inset-px rounded-[3.5rem] border border-transparent bg-gradient-to-br from-emerald-500/40 via-transparent to-transparent pointer-events-none z-10" 
                         style={{ maskImage: 'linear-gradient(135deg, black, transparent 50%)', WebkitMaskImage: 'linear-gradient(135deg, black, transparent 50%)' }} />

                    <div className="relative z-20">
                        <div className="lg:hidden text-center mb-10">
                            <h1 className="text-4xl font-display font-black text-white italic uppercase tracking-tighter leading-none mb-2">
                                Sua jornada <br />
                                <span className="bg-gradient-to-r from-emerald-400 to-emerald-600 bg-clip-text text-transparent">está começando!</span>
                            </h1>
                            <p className="text-gray-400 font-medium italic text-sm">{t('register.form_subtitle')}</p>
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
                                <span className="text-sm font-bold tracking-tight italic">{error}</span>
                            </div>
                        )}

                        <form onSubmit={handleRegister} className="space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">{t('register.name_label')}</label>
                                    <div className="relative group">
                                        <User className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-700 group-focus-within:text-emerald-500 transition-all duration-300" />
                                        <input
                                            type="text"
                                            required
                                            className="w-full bg-white/[0.04] border border-white/10 rounded-2xl pl-16 pr-6 py-5 text-white font-bold outline-none transition-all placeholder:text-gray-700 focus:bg-white focus:text-[#020205] focus:border-white shadow-inner"
                                            placeholder={t('register.name_placeholder')}
                                            value={name}
                                            onChange={e => {
                                                setName(e.target.value);
                                                handleFieldActivity();
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">{t('register.email_label')}</label>
                                    <div className="relative group">
                                        <Mail className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-700 group-focus-within:text-emerald-500 transition-all duration-300" />
                                        <input
                                            type="email"
                                            required
                                            className="w-full bg-white/[0.04] border border-white/10 rounded-2xl pl-16 pr-6 py-5 text-white font-bold outline-none transition-all placeholder:text-gray-700 focus:bg-white focus:text-[#020205] focus:border-white shadow-inner"
                                            placeholder="ex: seu@email.com"
                                            value={email}
                                            onChange={e => {
                                                setEmail(e.target.value);
                                                handleFieldActivity();
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">WhatsApp</label>
                                    <div className="relative group">
                                        <PhoneInput
                                            required
                                            variant="dark"
                                            className="w-full bg-white/[0.04] border border-white/10 rounded-2xl pl-[100px] pr-6 py-5 text-white font-bold outline-none transition-all placeholder:text-gray-700 focus:bg-white focus:text-[#020205] focus:border-white shadow-inner"
                                            value={whatsapp}
                                            onChange={e => {
                                                setWhatsapp(e.target.value);
                                                handleFieldActivity();
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">{t('activation.password')}</label>
                                    <div className="relative group">
                                        <Lock className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-700 group-focus-within:text-emerald-500 transition-all duration-300" />
                                        <input
                                            type="password"
                                            required
                                            minLength={6}
                                            className="w-full bg-white/[0.04] border border-white/10 rounded-2xl pl-16 pr-6 py-5 text-white font-bold outline-none transition-all placeholder:text-gray-700 focus:bg-white focus:text-[#020205] focus:border-white shadow-inner"
                                            placeholder="••••••••"
                                            value={password}
                                            onChange={e => {
                                                setPassword(e.target.value);
                                                handleFieldActivity();
                                            }}
                                        />
                                    </div>
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
                                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-3xl p-6 flex items-start gap-4 animate-in slide-in-from-bottom-4 duration-500 group hover:bg-emerald-500/10 transition-colors">
                                    <div className="pt-1">
                                        <input
                                            type="checkbox"
                                            id="partner-consent"
                                            required
                                            checked={consent}
                                            onChange={e => setConsent(e.target.checked)}
                                            className="w-6 h-6 rounded-lg border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500/50 cursor-pointer"
                                        />
                                    </div>
                                    <label htmlFor="partner-consent" className="text-sm text-gray-400 leading-relaxed cursor-pointer select-none">
                                        <span className="font-black text-white block mb-1 uppercase tracking-tighter italic">{t('register.consent_label')}</span>
                                        {t('register.consent_desc')}
                                    </label>
                                </div>
                            )}

                            {renderPlatformLegalAcceptance()}

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
                                className="relative w-full bg-gradient-to-r from-emerald-400 to-emerald-600 text-[#020205] font-black uppercase text-sm py-6 rounded-[2rem] transition-all hover:scale-[1.03] active:scale-95 shadow-2xl shadow-emerald-500/20 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group/btn italic tracking-widest mt-4 overflow-hidden"
                            >
                                {/* Shine Effect */}
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover/btn:animate-[shimmer_1.5s_infinite] pointer-events-none" />

                                {loading ? (
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                ) : (
                                    <>
                                        <span>{t('register.activate_free_button')}</span>
                                        <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-2 transition-transform" />
                                    </>
                                )}
                            </button>
                        </form>

                        <div className="mt-10 text-center">
                            <p className="text-gray-500 font-medium text-sm italic mb-2">{t('register.already_have_account')}</p>
                            <a
                                href="/activate"
                                className="text-white hover:text-emerald-400 font-black uppercase tracking-widest text-[10px] transition-all italic border-b border-white/10 hover:border-emerald-400 pb-1"
                            >
                                {t('register.login_link')}
                            </a>
                        </div>

                        <div className="mt-8 rounded-2xl border border-white/5 bg-white/[0.03] p-5 text-left">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-2">
                                Base legal da plataforma
                            </p>
                            <p className="text-xs text-gray-400 leading-relaxed">
                                Ao criar sua conta, voce aceita os documentos oficiais da plataforma e registra a evidência desse aceite no fluxo de cadastro.
                                {' '}
                                <a href={getPlatformTermsUrl()} target="_blank" rel="noreferrer" className="text-white hover:text-emerald-300 underline underline-offset-4">
                                    Termos de Uso
                                </a>
                                {' '}e{' '}
                                <a href={getPlatformPrivacyUrl()} target="_blank" rel="noreferrer" className="text-white hover:text-emerald-300 underline underline-offset-4">
                                    Politica de Privacidade
                                </a>
                                {' '}vigentes em {PLATFORM_LEGAL_VERSION}, publicados em {formatPlatformLegalPublishedAt()}.
                                {' '}Canal oficial: <a href={`mailto:${PLATFORM_LEGAL_CONTACT_EMAIL}`} className="text-white hover:text-emerald-300 underline underline-offset-4">{PLATFORM_LEGAL_CONTACT_EMAIL}</a>.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes shimmer {
                    100% {
                        transform: translateX(100%);
                    }
                }
            `}} />
        </div>
    );
};

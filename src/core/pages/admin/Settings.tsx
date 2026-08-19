import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    AlertCircle,
    CheckCircle,
    Fingerprint,
    Globe,
    Loader2,
    Lock,
    QrCode,
    RefreshCw,
    Save,
    Settings as SettingsIcon,
    Shield,
    ShieldCheck,
    User,
    ChevronRight,
    Check,
    Activity,
} from 'lucide-react';
import { Layout } from '../../components/Layout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';
import { licenseService, type CentralInstallationTrustCredential } from '../../services/licenseService';
import { getApiUrl } from '../../utils/apiUtils';
import { logSecurityEvent } from '../../services/securityAuditClient';
import { getSupabaseAuthCaptchaSiteKey, isSupabaseAuthCaptchaEnabled } from '../../config/authCaptcha';

function maskEmail(email: string) {
    const value = String(email || '').trim();
    const [localPart, domain] = value.split('@');
    if (!localPart || !domain) return 'unknown';
    return `${localPart.slice(0, 2)}***@${domain}`;
}

async function readApiPayload(response: Response, fallbackMessage: string): Promise<any> {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        return response.json().catch(() => ({}));
    }

    const rawBody = await response.text().catch(() => '');
    return {
        error: rawBody.trim()
            ? `${fallbackMessage} Resposta inesperada do backend: ${rawBody.slice(0, 160)}`
            : fallbackMessage
    };
}

type SettingsTab = 'profile' | 'security' | 'regional' | 'captcha';

function getPasswordStrength(pwd: string): { score: number; label: string; color: string } {
    if (!pwd) return { score: 0, label: '', color: 'bg-white/10' };
    let score = 0;
    if (pwd.length >= 6) score += 1;
    if (pwd.length >= 10) score += 1;
    if (/[A-Z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

    if (score <= 2) return { score, label: 'Fraca', color: 'bg-rose-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]' };
    if (score <= 4) return { score, label: 'Média', color: 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.6)]' };
    return { score, label: 'Forte', color: 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]' };
}

export const Settings = () => {
    const { user, profile, refreshProfile } = useAuth();
    const { t, i18n } = useTranslation('admin');
    const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
    const [twoFactorCode, setTwoFactorCode] = useState('');
    const [twoFactorQrDataUrl, setTwoFactorQrDataUrl] = useState('');
    const [twoFactorSecret, setTwoFactorSecret] = useState('');
    const [twoFactorSetupLoading, setTwoFactorSetupLoading] = useState(false);
    const [twoFactorSubmitLoading, setTwoFactorSubmitLoading] = useState(false);
    const [twoFactorMessage, setTwoFactorMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [centralInstallationTrust, setCentralInstallationTrust] = useState<CentralInstallationTrustCredential | null>(null);
    const [centralInstallationTrustLoading, setCentralInstallationTrustLoading] = useState(false);
    const [centralInstallationTrustMessage, setCentralInstallationTrustMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const [defaultLocale, setDefaultLocale] = useState('en');
    const [defaultCurrency, setDefaultCurrency] = useState('USD');
    const [systemConfigId, setSystemConfigId] = useState<number | null>(null);

    const [showCaptchaDocs, setShowCaptchaDocs] = useState(false);

    const authCaptchaEnabled = isSupabaseAuthCaptchaEnabled();
    const authCaptchaSiteKey = getSupabaseAuthCaptchaSiteKey();
    const authCaptchaReady = Boolean(authCaptchaEnabled && authCaptchaSiteKey);
    const runtimeHostname = typeof window !== 'undefined' ? window.location.hostname : null;

    const pwdStrength = getPasswordStrength(password);

    useEffect(() => {
        setTwoFactorEnabled(Boolean((profile as any)?.totp_enabled));
        if (!(profile as any)?.totp_enabled) {
            setTwoFactorSecret('');
            setTwoFactorQrDataUrl('');
        }
    }, [profile]);

    useEffect(() => {
        if (user) {
            setName(user.user_metadata?.name || '');
            setEmail(user.email || '');
        }
    }, [user]);

    useEffect(() => {
        const fetchSystemConfig = async () => {
            try {
                const { data } = await supabase.from('system_config').select('*').single();
                if (data) {
                    setSystemConfigId(data.id || 1);
                    if (data.default_locale) setDefaultLocale(data.default_locale);
                    if (data.default_currency) setDefaultCurrency(data.default_currency);
                }
            } catch (err) {
                console.error('Error fetching system config', err);
            }
        };

        fetchSystemConfig();
    }, []);

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        try {
            const currentEmail = user?.email || '';
            const nextEmail = email.trim();
            const emailChanged = Boolean(nextEmail) && nextEmail.toLowerCase() !== currentEmail.trim().toLowerCase();

            const updatePayload: {
                data: { name: string };
                email?: string;
            } = {
                data: { name }
            };

            if (emailChanged) {
                updatePayload.email = nextEmail;
            }

            const { error } = await supabase.auth.updateUser(updatePayload);
            if (error) throw error;

            if (emailChanged) {
                await logSecurityEvent('email_changed', {
                    flow: 'account_settings',
                    previous_email: maskEmail(currentEmail),
                    new_email: maskEmail(nextEmail),
                    confirmation_required: true
                }, 'WARNING');

                setEmail(nextEmail);
                setMessage({
                    type: 'success',
                    text: t(
                        'account_settings.profile.email_change_success',
                        'Confira o e-mail para confirmar a alteração.'
                    )
                });
            } else {
                setMessage({ type: 'success', text: t('account_settings.profile.success', 'Perfil atualizado!') });
            }
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || t('account_settings.profile.error', 'Erro ao atualizar perfil') });
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateSystemPreferences = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        try {
            const payload = {
                id: systemConfigId || 1,
                default_locale: defaultLocale,
                default_currency: defaultCurrency
            };

            const { error } = await supabase.from('system_config').upsert(payload);
            if (error) throw error;

            i18n.changeLanguage(defaultLocale);
            localStorage.setItem('i18nextLng', defaultLocale);

            setMessage({ type: 'success', text: t('account_settings.system.success', 'Preferências atualizadas!') });
            setSystemConfigId(payload.id);
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || t('account_settings.system.error', 'Erro ao salvar preferências') });
        } finally {
            setLoading(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setMessage({ type: 'error', text: t('account_settings.security.mismatch_error', 'As senhas não coincidem') });
            return;
        }

        setLoading(true);
        setMessage(null);

        try {
            const { error } = await supabase.auth.updateUser({
                password: password
            });

            if (error) throw error;

            await logSecurityEvent('password_changed', { flow: 'account_settings' }, 'INFO');
            setMessage({ type: 'success', text: t('account_settings.security.success', 'Senha alterada com sucesso!') });
            setPassword('');
            setConfirmPassword('');
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || t('account_settings.security.error', 'Erro ao alterar senha') });
        } finally {
            setLoading(false);
        }
    };

    const getSessionToken = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token || '';
    };

    const handleStartTwoFactorSetup = async () => {
        setTwoFactorSetupLoading(true);
        setMessage(null);
        setTwoFactorMessage(null);

        try {
            const token = await getSessionToken();
            if (!token) throw new Error('Sessão expirada. Faça login novamente.');

            const response = await fetch(getApiUrl('/api/auth?route=2fa&action=setup'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ action: 'setup' }),
            });

            const payload = await readApiPayload(response, 'Não foi possível preparar a 2FA.');
            if (!response.ok) throw new Error(payload.error || 'Não foi possível preparar a 2FA.');

            setTwoFactorSecret(payload.secret || '');
            setTwoFactorQrDataUrl(payload.qr_code_data_url || '');
            setTwoFactorCode('');

            const successMessage = {
                type: 'success' as const,
                text: 'Escaneie o QR Code no app e digite o código de 6 dígitos.'
            };
            setMessage(successMessage);
            setTwoFactorMessage(successMessage);
        } catch (error: any) {
            const errorMessage = { type: 'error' as const, text: error.message || 'Erro ao preparar a 2FA.' };
            setMessage(errorMessage);
            setTwoFactorMessage(errorMessage);
        } finally {
            setTwoFactorSetupLoading(false);
        }
    };

    const handleSubmitTwoFactor = async (disable = false) => {
        const normalizedCode = twoFactorCode.replace(/[^\d]/g, '').trim();
        if (!normalizedCode || normalizedCode.length < 6) {
            const errorMessage = { type: 'error' as const, text: 'Digite o código TOTP de 6 dígitos.' };
            setMessage(errorMessage);
            setTwoFactorMessage(errorMessage);
            return;
        }

        setTwoFactorSubmitLoading(true);
        setMessage(null);
        setTwoFactorMessage(null);

        try {
            const token = await getSessionToken();
            if (!token) throw new Error('Sessão expirada. Faça login novamente.');

            const action = disable ? 'disable' : 'verify';
            const endpoint = `/api/auth?route=2fa&action=${action}`;
            const response = await fetch(getApiUrl(endpoint), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ action, code: normalizedCode }),
            });

            const payload = await readApiPayload(response, 'Não foi possível validar a 2FA.');
            if (!response.ok) throw new Error(payload.error || 'Não foi possível validar a 2FA.');

            setTwoFactorEnabled(!disable);
            setTwoFactorCode('');
            setTwoFactorSecret('');
            setTwoFactorQrDataUrl('');
            await refreshProfile();

            const successMessage = {
                type: 'success' as const,
                text: disable ? '2FA desativada.' : '2FA ativada.'
            };
            setMessage(successMessage);
            setTwoFactorMessage(successMessage);
        } catch (error: any) {
            const errorMessage = { type: 'error' as const, text: error.message || 'Erro ao validar a 2FA.' };
            setMessage(errorMessage);
            setTwoFactorMessage(errorMessage);
        } finally {
            setTwoFactorSubmitLoading(false);
        }
    };

    const handleIssueCentralInstallationTrust = async () => {
        const confirmed = window.confirm(t(
            'account_settings.security.central_trust.confirmation',
            'Esta credencial privada aparece uma única vez. Copie os três valores para a Vercel antes de fechar ou recarregar esta página. Deseja continuar?'
        ));
        if (!confirmed) return;

        setCentralInstallationTrustLoading(true);
        setCentralInstallationTrustMessage(null);

        try {
            const trust = await licenseService.issueExistingInstallationTrust();
            setCentralInstallationTrust(trust);
            setCentralInstallationTrustMessage({
                type: 'success',
                text: t(
                    'account_settings.security.central_trust.issued',
                    'Credencial emitida. Copie os tres valores abaixo antes de sair desta pagina.'
                ),
            });
        } catch (error: any) {
            setCentralInstallationTrustMessage({
                type: 'error',
                text: error?.message || t(
                    'account_settings.security.central_trust.error',
                    'Não foi possível emitir a credencial privada da Central.'
                ),
            });
        } finally {
            setCentralInstallationTrustLoading(false);
        }
    };

    const copyCentralInstallationTrustValue = async (value: string, label: string) => {
        try {
            await navigator.clipboard.writeText(value);
            setCentralInstallationTrustMessage({
                type: 'success',
                text: t('account_settings.security.central_trust.copied', '{{label}} copiado.', { label }),
            });
        } catch {
            setCentralInstallationTrustMessage({
                type: 'error',
                text: t(
                    'account_settings.security.central_trust.copy_error',
                    'Nao foi possivel copiar automaticamente. Mantenha esta pagina aberta e tente novamente.'
                ),
            });
        }
    };

    const navItems = [
        { id: 'profile' as const, label: t('account_settings.tabs.profile', 'Perfil & Acesso'), icon: User, desc: 'Nome, e-mail e senha' },
        { id: 'security' as const, label: 'Autenticação 2FA', icon: Fingerprint, desc: '2FA e credencial privada da Central' },
        { id: 'regional' as const, label: t('account_settings.system.title', 'Regional'), icon: Globe, desc: 'Idioma e moeda padrão' },
        { id: 'captcha' as const, label: 'Auth CAPTCHA', icon: Shield, desc: 'Filtro contra força bruta' },
    ];

    // Calculated dynamic security score
    const hasName = Boolean(name.trim());
    const hasEmail = Boolean(email.trim());
    const isMfaActive = twoFactorEnabled;
    const isCaptchaActive = authCaptchaReady;

    let securityScore = 0;
    if (hasName) securityScore += 25;
    if (hasEmail) securityScore += 25;
    if (isMfaActive) securityScore += 25;
    if (isCaptchaActive) securityScore += 25;

    // SVG circular indicator dimensions
    const radius = 46;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (securityScore / 100) * circumference;


    return (
        <Layout>
            <div className="space-y-6 pb-24 max-w-6xl mx-auto px-4 md:px-0 relative animate-in fade-in duration-500">
                {/* Premium Design Glows */}
                <div className="absolute top-10 left-1/4 w-[500px] h-[500px] bg-primary/10 blur-[150px] rounded-full pointer-events-none -z-10 animate-pulse-slow" />
                <div className="absolute top-40 right-1/4 w-[400px] h-[400px] bg-purple-500/5 blur-[120px] rounded-full pointer-events-none -z-10" />

                {/* Dashboard-Style Title & Info Bar */}
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-3xl lg:text-4xl font-portal-display text-white mb-1 leading-none uppercase italic tracking-tight">
                                {t('account_settings.header.title_prefix', 'Central de')} <span className="text-primary font-black">{t('account_settings.header.title_highlight', 'Configurações')}</span>
                            </h1>
                            <div className="flex items-center gap-2 mt-1">
                                <p className="text-gray-400 font-medium uppercase tracking-[0.15em] text-[9px] font-mono">
                                    Security Center
                                </p>
                                <div className="h-1.5 w-1.5 rounded-full bg-primary/45" />
                                <span className="text-[9px] text-[#10B981] font-black uppercase tracking-[0.2em] font-mono">Active Control</span>
                            </div>
                        </div>

                        {/* Tactical Status Tags */}
                        <div className="flex flex-row flex-wrap items-center gap-2.5">
                            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.12em] border bg-emerald-500/10 text-emerald-400 border-emerald-500/25 font-mono shadow-[0_2px_10px_rgba(16,185,129,0.05)]">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                                Verified Operator
                            </span>

                            <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.12em] border font-mono ${twoFactorEnabled ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25 shadow-[0_2px_10px_rgba(16,185,129,0.05)]' : 'bg-rose-500/10 text-rose-400 border-rose-500/25 shadow-[0_2px_10px_rgba(244,63,94,0.05)]'}`}>
                                <Fingerprint className="w-3.5 h-3.5" />
                                MFA: {twoFactorEnabled ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                    </div>
                    <p className="text-xs text-gray-300 max-w-2xl leading-relaxed italic border-l border-primary/30 pl-4 font-medium">
                        {t('account_settings.header.description', 'Gerencie as configurações de segurança, preferências regionais e parâmetros globais.')}
                    </p>
                </div>

                {/* Feedback Messages */}
                {message && (
                    <div className={`p-4 rounded-xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-3 duration-300 mx-auto ${message.type === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                        : 'bg-rose-500/10 border-rose-500/25 text-rose-400'
                        }`}>
                        <div className={`p-1.5 rounded-lg ${message.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                            {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        </div>
                        <span className="text-xs font-semibold tracking-tight">{message.text}</span>
                    </div>
                )}

                {/* Mobile Navigation Selector */}
                <div className="lg:hidden flex overflow-x-auto gap-2 pb-4 scrollbar-none -mx-4 px-4">
                    {navItems.map((item) => {
                        const isActive = activeTab === item.id;
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setActiveTab(item.id)}
                                className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${
                                    isActive
                                        ? 'bg-primary border-primary text-white shadow-lg'
                                        : 'bg-white/[0.02] border-white/10 text-gray-400 hover:text-white hover:border-white/20'
                                }`}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                {item.label}
                            </button>
                        );
                    })}
                </div>

                {/* Main Asymmetric Grid Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                    {/* Left Inner Sidebar (Desktop Navigation) */}
                    <div className="hidden lg:flex lg:col-span-3 flex-col gap-2.5">
                        {navItems.map((item) => {
                            const isActive = activeTab === item.id;
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setActiveTab(item.id)}
                                    className={`w-full text-left flex items-start gap-4 p-4 rounded-2xl border transition-all duration-500 ${
                                        isActive
                                            ? 'bg-primary border-primary text-white shadow-[0_4px_20px_rgba(138,43,226,0.25)]'
                                            : 'bg-white/[0.01] border-white/5 text-gray-400 hover:text-white hover:border-white/15 hover:bg-white/[0.03] group'
                                    }`}
                                >
                                    <div className={`p-2.5 rounded-xl transition-all duration-500 ${isActive ? 'bg-white/15 text-white' : 'bg-white/5 text-gray-500 group-hover:text-white group-hover:bg-white/10'}`}>
                                        <Icon className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className={`text-xs font-black uppercase tracking-wider leading-none transition-colors ${isActive ? 'text-white font-black' : 'text-gray-300 group-hover:text-white'}`}>
                                            {item.label}
                                        </p>
                                        <p className={`text-[10px] font-semibold mt-1.5 truncate ${isActive ? 'text-purple-200' : 'text-gray-500'}`}>
                                            {item.desc}
                                        </p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>


                    {/* Center Workspace (Form Area) */}
                    <div className="lg:col-span-6 space-y-6">

                        {activeTab === 'profile' && (
                            <div className="space-y-6 animate-in fade-in duration-500">
                                {/* Profile form */}
                                <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#0C0C14] p-8 shadow-2xl space-y-6">
                                    {/* Glass light reflection ray */}
                                    <div className="absolute -top-16 -left-16 w-44 h-44 bg-white/5 rounded-full blur-3xl pointer-events-none" />

                                    {/* Dash Indicators at the top */}
                                    <div className="flex justify-center gap-1.5 mb-8">
                                        <div className="w-8 h-1 rounded-full bg-primary" />
                                        <div className="w-8 h-1 rounded-full bg-white/10" />
                                        <div className="w-8 h-1 rounded-full bg-white/10" />
                                        <div className="w-8 h-1 rounded-full bg-white/10" />
                                        <div className="w-8 h-1 rounded-full bg-white/10" />
                                    </div>

                                    {/* Central Illustration Header */}
                                    <div className="flex flex-col items-center text-center mb-6">
                                        <div className="w-20 h-20 rounded-3xl bg-gradient-to-b from-white/10 to-white/5 border border-white/10 flex items-center justify-center shadow-xl mb-4 group hover:scale-105 transition-transform duration-300">
                                            <User className="w-9 h-9 text-white animate-pulse-slow" />
                                        </div>
                                        <h3 className="text-xl font-portal-display text-white uppercase italic tracking-tight mb-1">
                                            Dados Operacionais
                                        </h3>
                                        <p className="text-xs text-gray-400 max-w-sm font-medium">
                                            Gerencie o seu nome comercial e e-mail administrativo principal.
                                        </p>
                                    </div>

                                    <div className="space-y-4 border-t border-white/5 pt-6">
                                        <form onSubmit={handleUpdateProfile} className="space-y-4">
                                            <div className="space-y-2">
                                                <label className="block text-[9px] font-black text-gray-300 uppercase tracking-widest ml-1 font-mono">
                                                    {t('account_settings.profile.full_name', 'Nome Completo')}
                                                </label>
                                                <input
                                                    type="text"
                                                    value={name}
                                                    onChange={(e) => setName(e.target.value)}
                                                    className="w-full bg-[#07070F] border border-white/[0.12] rounded-xl px-4 py-3 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all duration-300 placeholder:text-gray-600 font-semibold shadow-inner"
                                                    placeholder={t('account_settings.profile.full_name_placeholder', 'Seu nome')}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="block text-[9px] font-black text-gray-300 uppercase tracking-widest ml-1 font-mono">
                                                    {t('account_settings.profile.email', 'E-mail')}
                                                </label>
                                                <input
                                                    type="email"
                                                    value={email}
                                                    onChange={(e) => setEmail(e.target.value)}
                                                    className="w-full bg-[#07070F] border border-white/[0.12] rounded-xl px-4 py-3 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all duration-300 placeholder:text-gray-600 font-semibold shadow-inner"
                                                    placeholder={t('account_settings.profile.email_placeholder', 'seu@email.com')}
                                                />
                                                <p className="text-[10px] text-gray-400 mt-1.5 italic px-1 font-medium leading-normal flex items-center gap-1.5">
                                                    <AlertCircle className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                                                    {t('account_settings.profile.email_hint', 'Alterações exigem confirmação por e-mail.')}
                                                </p>
                                            </div>
                                            <div className="pt-2">
                                                <Button type="submit" disabled={loading} className="w-full h-11 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold uppercase tracking-wider text-xs flex items-center justify-center gap-2 active:scale-[0.98] transition-all duration-300 shadow-[0_4px_16px_rgba(138,43,226,0.35)]">
                                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                    {t('account_settings.profile.save', 'Salvar Perfil')}
                                                </Button>
                                            </div>
                                        </form>
                                    </div>
                                </div>

                                {/* Password form */}
                                <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#0C0C14] p-8 shadow-2xl space-y-6 mt-6">
                                    {/* Glass light reflection ray */}
                                    <div className="absolute -top-16 -left-16 w-44 h-44 bg-white/5 rounded-full blur-3xl pointer-events-none" />

                                    {/* Dash Indicators at the top */}
                                    <div className="flex justify-center gap-1.5 mb-8">
                                        <div className="w-8 h-1 rounded-full bg-primary" />
                                        <div className="w-8 h-1 rounded-full bg-white/10" />
                                        <div className="w-8 h-1 rounded-full bg-white/10" />
                                        <div className="w-8 h-1 rounded-full bg-white/10" />
                                        <div className="w-8 h-1 rounded-full bg-white/10" />
                                    </div>

                                    {/* Central Illustration Header */}
                                    <div className="flex flex-col items-center text-center mb-6">
                                        <div className="w-20 h-20 rounded-3xl bg-gradient-to-b from-white/10 to-white/5 border border-white/10 flex items-center justify-center shadow-xl mb-4 group hover:scale-105 transition-transform duration-300">
                                            <Lock className="w-9 h-9 text-white animate-pulse-slow" />
                                        </div>
                                        <h3 className="text-xl font-portal-display text-white uppercase italic tracking-tight mb-1">
                                            Credenciais de Acesso
                                        </h3>
                                        <p className="text-xs text-gray-400 max-w-sm font-medium">
                                            Defina ou atualize a sua senha secreta de acesso ao painel.
                                        </p>
                                    </div>

                                    <div className="space-y-4 border-t border-white/5 pt-6">
                                        <form onSubmit={handleChangePassword} className="space-y-4">
                                            <div className="space-y-2">
                                                <label className="block text-[9px] font-black text-gray-300 uppercase tracking-widest ml-1 font-mono">
                                                    {t('account_settings.security.new_password', 'Nova Senha')}
                                                </label>
                                                <input
                                                    type="password"
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    className="w-full bg-[#07070F] border border-white/[0.12] rounded-xl px-4 py-3 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all duration-300 placeholder:text-gray-600 font-semibold shadow-inner"
                                                    placeholder="••••••••"
                                                    minLength={6}
                                                />
                                                {password && (
                                                    <div className="mt-2 space-y-1.5 px-1 animate-in fade-in duration-300">
                                                        <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest font-mono">
                                                            <span className="text-gray-400">Força da Senha</span>
                                                            <span className="text-white font-bold">{pwdStrength.label}</span>
                                                        </div>
                                                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden flex gap-1">
                                                            <div className={`h-full rounded-full transition-all duration-500 ${pwdStrength.color}`} style={{ width: `${(pwdStrength.score / 5) * 100}%` }} />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="space-y-2">
                                                <label className="block text-[9px] font-black text-gray-300 uppercase tracking-widest ml-1 font-mono">
                                                    {t('account_settings.security.confirm_password', 'Confirmar Senha')}
                                                </label>
                                                <input
                                                    type="password"
                                                    value={confirmPassword}
                                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                                    className="w-full bg-[#07070F] border border-white/[0.12] rounded-xl px-4 py-3 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all duration-300 placeholder:text-gray-600 font-semibold shadow-inner"
                                                    placeholder="••••••••"
                                                    minLength={6}
                                                />
                                            </div>
                                            <div className="pt-2">
                                                <Button type="submit" variant="outline" disabled={loading || !password} className="w-full h-11 rounded-xl border-white/10 hover:border-primary/50 hover:bg-primary/10 text-white font-bold uppercase tracking-wider text-xs flex items-center justify-center gap-2 active:scale-[0.98] transition-all duration-300 shadow-md">
                                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                                    {t('account_settings.security.change_password', 'Redefinir Senha')}
                                                </Button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'regional' && (
                            <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#0C0C14] p-8 shadow-2xl space-y-6 animate-in fade-in duration-500">
                                {/* Glass light reflection ray */}
                                <div className="absolute -top-16 -left-16 w-44 h-44 bg-white/5 rounded-full blur-3xl pointer-events-none" />

                                {/* Dash Indicators at the top */}
                                <div className="flex justify-center gap-1.5 mb-8">
                                    <div className="w-8 h-1 rounded-full bg-primary" />
                                    <div className="w-8 h-1 rounded-full bg-white/10" />
                                    <div className="w-8 h-1 rounded-full bg-white/10" />
                                    <div className="w-8 h-1 rounded-full bg-white/10" />
                                    <div className="w-8 h-1 rounded-full bg-white/10" />
                                </div>

                                {/* Central Illustration Header */}
                                <div className="flex flex-col items-center text-center mb-6">
                                    <div className="w-20 h-20 rounded-3xl bg-gradient-to-b from-white/10 to-white/5 border border-white/10 flex items-center justify-center shadow-xl mb-4 group hover:scale-105 transition-transform duration-300">
                                        <Globe className="w-9 h-9 text-white animate-pulse-slow" />
                                    </div>
                                    <h3 className="text-xl font-portal-display text-white uppercase italic tracking-tight mb-1">
                                        Definições Regionais
                                    </h3>
                                    <p className="text-xs text-gray-400 max-w-sm font-medium">
                                        Configure o idioma e a moeda padrão do seu painel e faturas.
                                    </p>
                                </div>

                                <div className="space-y-4 border-t border-white/5 pt-6">
                                    <form onSubmit={handleUpdateSystemPreferences} className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="block text-[9px] font-black text-gray-300 uppercase tracking-widest ml-1 font-mono">
                                                {t('account_settings.system.language', 'Idioma Padrão')}
                                            </label>
                                            <select
                                                value={defaultLocale}
                                                onChange={(e) => setDefaultLocale(e.target.value)}
                                                className="w-full bg-[#07070F] border border-white/[0.12] rounded-xl px-4 py-3 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all duration-300 font-semibold shadow-inner appearance-none cursor-pointer"
                                            >
                                                <option value="en">English (US)</option>
                                                <option value="pt">Português (BR)</option>
                                                <option value="es">Español</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="block text-[9px] font-black text-gray-300 uppercase tracking-widest ml-1 font-mono">
                                                {t('account_settings.system.currency', 'Moeda Padrão')}
                                            </label>
                                            <select
                                                value={defaultCurrency}
                                                onChange={(e) => setDefaultCurrency(e.target.value)}
                                                className="w-full bg-[#07070F] border border-white/[0.12] rounded-xl px-4 py-3 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none transition-all duration-300 font-semibold shadow-inner appearance-none cursor-pointer"
                                            >
                                                <option value="USD">USD ($)</option>
                                                <option value="BRL">BRL (R$)</option>
                                                <option value="EUR">EUR (€)</option>
                                            </select>
                                        </div>
                                        <div className="pt-2">
                                            <Button type="submit" disabled={loading} className="w-full h-11 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold uppercase tracking-wider text-xs flex items-center justify-center gap-2 active:scale-[0.98] transition-all duration-300 shadow-[0_4px_16px_rgba(138,43,226,0.35)]">
                                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                {t('account_settings.system.save', 'Atualizar Regional')}
                                            </Button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )}

                        {activeTab === 'security' && (
                            <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#0C0C14] p-8 shadow-2xl space-y-6 animate-in fade-in duration-500">
                                {/* Glass light reflection ray */}
                                <div className="absolute -top-16 -left-16 w-44 h-44 bg-white/5 rounded-full blur-3xl pointer-events-none" />

                                {/* Dash Indicators at the top */}
                                <div className="flex justify-center gap-1.5 mb-8">
                                    <div className="w-8 h-1 rounded-full bg-primary" />
                                    <div className="w-8 h-1 rounded-full bg-white/10" />
                                    <div className="w-8 h-1 rounded-full bg-white/10" />
                                    <div className="w-8 h-1 rounded-full bg-white/10" />
                                    <div className="w-8 h-1 rounded-full bg-white/10" />
                                </div>

                                {/* Central Illustration Header */}
                                <div className="flex flex-col items-center text-center mb-6">
                                    <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-b from-white/10 to-white/5 border border-white/10 flex items-center justify-center shadow-xl mb-4 group hover:scale-105 transition-transform duration-300">
                                        <Fingerprint className="w-9 h-9 text-white animate-pulse-slow" />
                                        <span className={`absolute -top-1 -right-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest border ${twoFactorEnabled ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/5 text-gray-500 border-white/10'}`}>
                                            {twoFactorEnabled ? 'Ativa' : 'Inativa'}
                                        </span>
                                    </div>
                                    <h3 className="text-xl font-portal-display text-white uppercase italic tracking-tight mb-1">
                                        Duas Etapas (MFA)
                                    </h3>
                                    <p className="text-xs text-gray-400 max-w-sm font-medium">
                                        Proteção extra exigindo código temporário no seu dispositivo autenticador.
                                    </p>
                                </div>

                                <div className="space-y-6 border-t border-white/5 pt-6">
                                    <p className="text-xs text-gray-400 font-medium leading-relaxed italic border-l border-primary/30 pl-3">
                                        Proteção extra exigindo código temporário no seu dispositivo.
                                    </p>

                                    {twoFactorMessage && (
                                        <div className={`p-4 rounded-xl border flex items-center gap-3 text-xs animate-in fade-in duration-500 ${twoFactorMessage.type === 'success'
                                            ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                                            : 'bg-rose-500/10 border-rose-500/25 text-rose-400'
                                            }`}>
                                            {twoFactorMessage.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                            <span className="font-bold">{twoFactorMessage.text}</span>
                                        </div>
                                    )}

                                    {!twoFactorEnabled && !twoFactorQrDataUrl && (
                                        <Button
                                            type="button"
                                            onClick={handleStartTwoFactorSetup}
                                            disabled={twoFactorSetupLoading}
                                            className="w-full h-11 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold uppercase italic tracking-wider text-xs flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(138,43,226,0.35)]"
                                        >
                                            {twoFactorSetupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                                            Configurar Duas Etapas
                                        </Button>
                                    )}

                                    {!twoFactorEnabled && twoFactorQrDataUrl && (
                                        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-700">
                                            <div className="flex flex-col items-center">
                                                <div className="p-3 bg-white rounded-2xl mb-4 shadow-xl shadow-black/40">
                                                    <img
                                                        src={twoFactorQrDataUrl}
                                                        alt="QR Code"
                                                        className="w-36 h-36"
                                                    />
                                                </div>
                                                <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest text-center max-w-[200px] font-mono leading-none">
                                                    Escaneie no app autenticador.
                                                </p>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <label className="block text-[9px] font-black text-gray-300 uppercase tracking-widest ml-1 font-mono">
                                                        Código de Verificação
                                                    </label>
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        maxLength={6}
                                                        value={twoFactorCode}
                                                        onChange={(e) => setTwoFactorCode(e.target.value)}
                                                        className="w-full bg-[#07070F] border border-white/[0.12] rounded-xl px-4 py-3 text-white text-2xl font-black text-center focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all tracking-[0.3em] font-mono shadow-inner"
                                                        placeholder="000000"
                                                    />
                                                </div>

                                                <div className="flex flex-col gap-3">
                                                    <Button
                                                        type="button"
                                                        onClick={() => handleSubmitTwoFactor(false)}
                                                        disabled={twoFactorSubmitLoading}
                                                        className="w-full h-11 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/10 text-xs uppercase"
                                                    >
                                                        {twoFactorSubmitLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1.5" />}
                                                        Confirmar Ativação
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        onClick={handleStartTwoFactorSetup}
                                                        disabled={twoFactorSetupLoading}
                                                        className="text-gray-400 hover:text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5"
                                                    >
                                                        <RefreshCw className="w-3.5 h-3.5" /> Gerar Novo Par
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {twoFactorEnabled && (
                                        <div className="space-y-4 animate-in fade-in duration-1000">
                                            <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl shadow-inner">
                                                <p className="text-xs text-emerald-400 font-semibold leading-relaxed italic">
                                                    Sua conta está protegida com autenticação em duas etapas. Mantenha seu app autenticador seguro.
                                                </p>
                                            </div>

                                            <div className="space-y-4 pt-4 border-t border-white/5">
                                                <div className="space-y-2">
                                                    <label className="block text-[9px] font-black text-gray-300 uppercase tracking-widest ml-1 font-mono">
                                                        Código p/ Desativar
                                                    </label>
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        maxLength={6}
                                                        value={twoFactorCode}
                                                        onChange={(e) => setTwoFactorCode(e.target.value)}
                                                        className="w-full bg-[#07070F] border border-white/[0.12] rounded-xl px-4 py-3 text-white text-center text-xl font-black tracking-[0.3em] font-mono shadow-inner"
                                                        placeholder="000000"
                                                    />
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    onClick={() => handleSubmitTwoFactor(true)}
                                                    disabled={twoFactorSubmitLoading}
                                                    className="text-rose-500 hover:bg-rose-500/10 font-bold text-xs uppercase tracking-wider h-11 w-full rounded-xl flex items-center justify-center gap-1.5 border border-rose-500/15 transition-all duration-300"
                                                >
                                                    {twoFactorSubmitLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4" />}
                                                    Interromper Segurança (2FA)
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-4 pt-6 border-t border-white/5">
                                        <div className="flex items-start gap-3">
                                            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-300 border border-sky-400/20">
                                                <ShieldCheck className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <h4 className="text-xs font-black uppercase tracking-wider text-white">
                                                    {t('account_settings.security.central_trust.title', 'Credencial privada da Central')}
                                                </h4>
                                                <p className="mt-1 text-xs text-gray-400 leading-relaxed">
                                                    {t(
                                                        'account_settings.security.central_trust.description',
                                                        'Use somente para migrar esta instalacao antiga. Cada valor pertence apenas a este projeto e nao pode ser recuperado depois.'
                                                    )}
                                                </p>
                                            </div>
                                        </div>

                                        {centralInstallationTrustMessage && (
                                            <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${centralInstallationTrustMessage.type === 'success'
                                                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                                                : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
                                                }`}>
                                                {centralInstallationTrustMessage.type === 'success'
                                                    ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
                                                    : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                                                <span>{centralInstallationTrustMessage.text}</span>
                                            </div>
                                        )}

                                        {!centralInstallationTrust ? (
                                            <Button
                                                type="button"
                                                onClick={handleIssueCentralInstallationTrust}
                                                disabled={centralInstallationTrustLoading}
                                                className="w-full h-11 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold uppercase tracking-wider text-xs flex items-center justify-center gap-2"
                                            >
                                                {centralInstallationTrustLoading
                                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                                    : <ShieldCheck className="w-4 h-4" />}
                                                {centralInstallationTrustLoading
                                                    ? t('account_settings.security.central_trust.issuing', 'Emitindo...')
                                                    : t('account_settings.security.central_trust.issue', 'Emitir credencial única')}
                                            </Button>
                                        ) : (
                                            <div className="space-y-3 rounded-xl border border-amber-400/25 bg-amber-400/5 p-4">
                                                <p className="text-xs text-amber-100 leading-relaxed">
                                                    {t(
                                                        'account_settings.security.central_trust.warning',
                                                        'Copie cada valor e cole na variavel Production correspondente da Vercel. Nao feche nem recarregue esta pagina ate terminar.'
                                                    )}
                                                </p>
                                                {[
                                                    ['CENTRAL_INSTALLATION_ID', centralInstallationTrust.installationId],
                                                    ['CENTRAL_INSTALLATION_CREDENTIAL_ID', centralInstallationTrust.credentialId],
                                                    ['CENTRAL_INSTALLATION_CREDENTIAL_SECRET', centralInstallationTrust.credentialSecret],
                                                ].map(([label, value]) => (
                                                    <Button
                                                        type="button"
                                                        key={label}
                                                        variant="outline"
                                                        onClick={() => copyCentralInstallationTrustValue(value, label)}
                                                        className="w-full min-h-11 justify-between border-white/10 bg-black/20 px-3 text-left font-mono text-[10px] text-white hover:bg-white/5"
                                                    >
                                                        <span className="truncate">{label}</span>
                                                        <span className="ml-3 flex-shrink-0 text-sky-300">
                                                            {t('account_settings.security.central_trust.copy', 'Copiar')}
                                                        </span>
                                                    </Button>
                                                ))}
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    onClick={() => {
                                                        setCentralInstallationTrust(null);
                                                        setCentralInstallationTrustMessage(null);
                                                    }}
                                                    className="w-full text-xs font-bold text-gray-300 hover:text-white"
                                                >
                                                    {t('account_settings.security.central_trust.done', 'Copiei os tres valores')}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'captcha' && (
                            <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#0C0C14] p-8 shadow-2xl space-y-6 animate-in fade-in duration-500">
                                {/* Glass light reflection ray */}
                                <div className="absolute -top-16 -left-16 w-44 h-44 bg-white/5 rounded-full blur-3xl pointer-events-none" />

                                {/* Dash Indicators at the top */}
                                <div className="flex justify-center gap-1.5 mb-8">
                                    <div className="w-8 h-1 rounded-full bg-primary" />
                                    <div className="w-8 h-1 rounded-full bg-white/10" />
                                    <div className="w-8 h-1 rounded-full bg-white/10" />
                                    <div className="w-8 h-1 rounded-full bg-white/10" />
                                    <div className="w-8 h-1 rounded-full bg-white/10" />
                                </div>

                                {/* Central Illustration Header */}
                                <div className="flex flex-col items-center text-center mb-6">
                                    <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-b from-white/10 to-white/5 border border-white/10 flex items-center justify-center shadow-xl mb-4 group hover:scale-105 transition-transform duration-300">
                                        <Shield className="w-9 h-9 text-white animate-pulse-slow" />
                                        <span className={`absolute -top-1 -right-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest border ${authCaptchaReady ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/5 text-gray-500 border-white/10'}`}>
                                            {authCaptchaReady ? 'Ativo' : 'Revisar'}
                                        </span>
                                    </div>
                                    <h3 className="text-xl font-portal-display text-white uppercase italic tracking-tight mb-1">
                                        Auth CAPTCHA
                                    </h3>
                                    <p className="text-xs text-gray-400 max-w-sm font-medium">
                                        Governança do CAPTCHA global do Supabase Auth (Cloudflare Turnstile).
                                    </p>
                                </div>

                                <div className="space-y-5 border-t border-white/5 pt-6">
                                    <p className="text-xs text-gray-400 font-medium leading-relaxed italic border-l border-primary/20 pl-3">
                                        Governança do CAPTCHA global do Supabase Auth (Cloudflare Turnstile).
                                    </p>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                        <div className="rounded-xl border border-white/5 bg-black/20 p-3.5 shadow-inner">
                                            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-500 font-mono">Flag Frontend</p>
                                            <p className={`mt-1 text-xs font-black uppercase tracking-tight ${authCaptchaEnabled ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                {authCaptchaEnabled ? 'Ativada' : 'Pendente'}
                                            </p>
                                        </div>
                                        <div className="rounded-xl border border-white/5 bg-black/20 p-3.5 shadow-inner">
                                            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-500 font-mono">Site Key</p>
                                            <p className={`mt-1 text-xs font-black uppercase tracking-tight ${authCaptchaSiteKey ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                {authCaptchaSiteKey ? 'Configurada' : 'Pendente'}
                                            </p>
                                        </div>
                                        <div className="rounded-xl border border-white/5 bg-black/20 p-3.5 shadow-inner">
                                            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-500 font-mono">Hostname Atual</p>
                                            <p className="mt-1 text-xs font-semibold text-white break-all font-mono leading-none">
                                                {runtimeHostname || 'Indisponível'}
                                            </p>
                                        </div>
                                        <div className="rounded-xl border border-white/5 bg-black/20 p-3.5 shadow-inner">
                                            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-500 font-mono">Ownership</p>
                                            <p className="mt-1 text-xs font-semibold text-white leading-normal">
                                                Chaves individuais por cliente.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setShowCaptchaDocs(!showCaptchaDocs)}
                                            className="w-full flex items-center justify-between p-3.5 bg-black/20 rounded-xl border border-white/5 hover:border-white/10 transition-all duration-300"
                                        >
                                    <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">Documentação e Instruções</span>
                                            <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform duration-300 ${showCaptchaDocs ? 'rotate-90 text-white' : ''}`} />
                                        </button>

                                        {showCaptchaDocs && (
                                            <div className="mt-4 space-y-4 border-t border-white/5 pt-4 animate-in slide-in-from-top-3 duration-300">
                                                <div className="rounded-xl border border-white/5 bg-[#0B0B12] p-4">
                                                    <p className="text-[8px] font-black uppercase tracking-[0.24em] text-gray-500 font-mono mb-2">Env mínimo na Vercel</p>
                                                    <div className="space-y-1.5 text-[11px] text-gray-300 font-mono">
                                                        <div><span className="text-primary">VITE_ENABLE_SUPABASE_AUTH_CAPTCHA</span>=true</div>
                                                        <div><span className="text-primary">VITE_TURNSTILE_SITE_KEY</span>=...site key pública...</div>
                                                        <div><span className="text-primary">TURNSTILE_SECRET_KEY</span>=...secret key privada...</div>
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <p className="text-[8px] font-black uppercase tracking-[0.24em] text-gray-500 font-mono">Ordem oficial de rollout</p>
                                                    <ol className="space-y-2 text-xs text-gray-300 list-decimal list-inside leading-relaxed">
                                                        <li>Crie o Turnstile no Cloudflare usando o domínio do projeto.</li>
                                                        <li>Salve as ENVs na Vercel e publique o deploy.</li>
                                                        <li>No Supabase, ative o CAPTCHA em Attack Protection.</li>
                                                        <li>Execute o smoke de login, cadastro e recuperação.</li>
                                                    </ol>
                                                </div>

                                                <div className="rounded-xl border border-amber-400/15 bg-amber-400/5 p-4 space-y-2">
                                                    <p className="text-[8px] font-black uppercase tracking-[0.22em] text-amber-300 font-mono">Modelo para instalações de cliente</p>
                                                    <ul className="space-y-1.5 text-xs text-amber-100/90 list-disc list-inside leading-relaxed">
                                                        <li>O cliente pode começar com hostname temporário vercel.app.</li>
                                                        <li>Depois adiciona o domínio final no widget dele.</li>
                                                        <li>Não centralize domínios de clientes no Cloudflare master da plataforma.</li>
                                                    </ul>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Sidebar (Security Health & Checklist) */}
                    <div className="lg:col-span-3">
                        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#0C0C14] p-8 shadow-2xl space-y-6">
                            {/* Glass light reflection ray */}
                            <div className="absolute -top-16 -left-16 w-44 h-44 bg-white/5 rounded-full blur-3xl pointer-events-none" />

                            {/* Dash Indicators at the top */}
                            <div className="flex justify-center gap-1.5 mb-8">
                                <div className="w-8 h-1 rounded-full bg-primary" />
                                <div className="w-8 h-1 rounded-full bg-white/10" />
                                <div className="w-8 h-1 rounded-full bg-white/10" />
                            </div>

                            {/* Central Illustration Header */}
                            <div className="flex flex-col items-center text-center mb-6">
                                <div className="relative flex items-center justify-center w-28 h-28 mx-auto mb-4">
                                    <svg className="w-full h-full transform -rotate-90">
                                        <defs>
                                            <filter id="glow-mfa" x="-20%" y="-20%" width="140%" height="140%">
                                                <feGaussianBlur stdDeviation="3" result="blur" />
                                                <feMerge>
                                                    <feMergeNode in="blur" />
                                                    <feMergeNode in="SourceGraphic" />
                                                </feMerge>
                                            </filter>
                                        </defs>
                                        <circle
                                            cx="56"
                                            cy="56"
                                            r={radius}
                                            className="text-white/5"
                                            strokeWidth="5"
                                            stroke="currentColor"
                                            fill="transparent"
                                        />
                                        <circle
                                            cx="56"
                                            cy="56"
                                            r={radius}
                                            className="text-primary transition-all duration-1000"
                                            strokeWidth="5"
                                            strokeDasharray={circumference}
                                            strokeDashoffset={offset}
                                            strokeLinecap="round"
                                            stroke="currentColor"
                                            fill="transparent"
                                            filter={securityScore > 0 ? "url(#glow-mfa)" : undefined}
                                        />
                                    </svg>
                                    <div className="absolute text-center">
                                        <span className="text-xl font-black text-white">{securityScore}%</span>
                                    </div>
                                </div>
                                <h3 className="text-sm font-portal-display text-white uppercase italic tracking-tight mb-1">
                                    Saúde da Conta
                                </h3>
                            </div>

                            <div className="space-y-4 border-t border-white/5 pt-6">
                                <div className="flex items-center justify-between text-[10px] font-semibold font-mono">
                                    <span className="text-gray-500">Checklist Operacional</span>
                                    <span className="text-primary font-bold">{(hasName?1:0) + (hasEmail?1:0) + (isMfaActive?1:0) + (isCaptchaActive?1:0)} / 4</span>
                                </div>

                                <div className="space-y-2.5 pt-2 border-t border-white/5 text-left">
                                    <div className="flex items-center gap-2 text-xs">
                                        {hasName ? <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" /> : <div className="w-4 h-4 rounded-full border border-white/15 flex-shrink-0" />}
                                        <span className={hasName ? 'text-gray-200 font-semibold font-sans' : 'text-gray-500 font-sans'}>Nome Cadastrado</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs">
                                        {hasEmail ? <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" /> : <div className="w-4 h-4 rounded-full border border-white/15 flex-shrink-0" />}
                                        <span className={hasEmail ? 'text-gray-200 font-semibold font-sans' : 'text-gray-500 font-sans'}>E-mail Configurado</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs">
                                        {isMfaActive ? <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" /> : <div className="w-4 h-4 rounded-full border border-white/15 flex-shrink-0" />}
                                        <span className={isMfaActive ? 'text-gray-200 font-semibold font-sans' : 'text-gray-500 font-sans'}>2FA TOTP Ativado</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs">
                                        {isCaptchaActive ? <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" /> : <div className="w-4 h-4 rounded-full border border-white/15 flex-shrink-0" />}
                                        <span className={isCaptchaActive ? 'text-gray-200 font-semibold font-sans' : 'text-gray-500 font-sans'}>Blindagem CAPTCHA</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </Layout>
    );
};

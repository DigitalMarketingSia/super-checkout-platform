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
} from 'lucide-react';
import { Layout } from '../../components/Layout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';
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

type SettingsTab = 'profile' | 'system';

interface SettingsShellCardProps {
    icon: React.ReactNode;
    title: string;
    accent?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}

const SettingsShellCard: React.FC<SettingsShellCardProps> = ({ icon, title, accent, className = '', children }) => (
    <Card className={`border border-white/5 backdrop-blur-3xl bg-black/40 hover:border-primary/20 transition-all duration-700 ${className}`.trim()}>
        <div className="p-8 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-white/5 rounded-2xl">
                    {icon}
                </div>
                <h2 className="text-xl font-portal-display text-white italic uppercase tracking-tighter">
                    {title}
                </h2>
            </div>
            {accent}
        </div>
        {children}
    </Card>
);

const StatusBadge: React.FC<{ active: boolean; activeLabel: string; inactiveLabel: string }> = ({
    active,
    activeLabel,
    inactiveLabel,
}) => (
    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border ${active
        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        : 'bg-white/5 text-gray-500 border-white/10'
        }`}>
        <span className={`w-2 h-2 rounded-full ${active ? 'bg-emerald-500' : 'bg-gray-600'}`} />
        {active ? activeLabel : inactiveLabel}
    </span>
);

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

    const [defaultLocale, setDefaultLocale] = useState('en');
    const [defaultCurrency, setDefaultCurrency] = useState('USD');
    const [systemConfigId, setSystemConfigId] = useState<number | null>(null);

    const authCaptchaEnabled = isSupabaseAuthCaptchaEnabled();
    const authCaptchaSiteKey = getSupabaseAuthCaptchaSiteKey();
    const authCaptchaReady = Boolean(authCaptchaEnabled && authCaptchaSiteKey);
    const runtimeHostname = typeof window !== 'undefined' ? window.location.hostname : null;

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
                        'Perfil atualizado. Confira o e-mail para confirmar a alteração.'
                    )
                });
            } else {
                setMessage({ type: 'success', text: t('account_settings.profile.success', 'Perfil atualizado com sucesso!') });
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

            setMessage({ type: 'success', text: t('account_settings.system.success', 'Preferências do sistema atualizadas!') });
            setSystemConfigId(payload.id);
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || t('account_settings.system.error', 'Erro ao atualizar preferências') });
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
                text: 'Escaneie o QR Code com seu app autenticador e confirme o código de 6 dígitos.'
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
                text: disable ? '2FA desativada com sucesso.' : '2FA ativada com sucesso.'
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

    const tabs: Array<{
        id: SettingsTab;
        icon: typeof User;
        label: string;
        description: string;
    }> = [
        {
            id: 'profile',
            icon: User,
            label: t('account_settings.tabs.profile', 'Perfil'),
            description: t('account_settings.tabs.profile_desc', 'Conta, e-mail e senha do operador'),
        },
        {
            id: 'system',
            icon: SettingsIcon,
            label: t('account_settings.tabs.system', 'Sistema'),
            description: t('account_settings.tabs.system_desc', 'Regional, 2FA e CAPTCHA de autenticação'),
        },
    ];

    return (
        <Layout>
            <div className="space-y-8 pb-24 max-w-6xl mx-auto">
                <div className="relative p-8 lg:p-10 rounded-[2rem] bg-[#0A0A15] border border-white/5 overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[100px] -translate-y-1/2 translate-x-1/2" />

                    <div className="relative z-20 flex flex-col gap-8">
                        <div>
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-primary/10 border border-primary/20 text-primary text-[9px] font-black uppercase tracking-[0.2em] mb-4">
                                <Shield className="w-3.5 h-3.5" /> Security Center
                            </div>
                            <h1 className="text-3xl lg:text-5xl font-portal-display text-white tracking-tighter italic leading-none mb-4">
                                CENTRAL DE <span className="text-primary font-black">CONFIGURAÇÕES</span>
                            </h1>
                            <p className="text-sm text-gray-500 font-medium max-w-3xl">
                                Use esta página como o centro oficial da conta e do sistema. As abas deixam pronto o caminho para crescer
                                com novas configurações operacionais sem espalhar controles pelo painel.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 pt-6 border-t border-white/5">
                            <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/[0.02] border border-white/5 h-10">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Account: Verified</span>
                            </div>

                            <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-white/[0.02] border border-white/5 h-10 group/item hover:border-emerald-500/30 transition-all">
                                <Fingerprint className="w-4 h-4 text-primary" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-hover/item:text-white transition-colors">2FA Security:</span>
                                <span className={`text-[9px] font-black uppercase tracking-widest ${twoFactorEnabled ? 'text-emerald-400' : 'text-rose-500'}`}>
                                    {twoFactorEnabled ? 'Enabled' : 'Disabled'}
                                </span>
                            </div>

                            <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-white/[0.02] border border-white/5 h-10 group/item hover:border-primary/30 transition-all">
                                <ShieldCheck className={`w-4 h-4 ${authCaptchaReady ? 'text-emerald-400' : 'text-amber-400'}`} />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-hover/item:text-white transition-colors">
                                    Auth CAPTCHA:
                                </span>
                                <span className={`text-[9px] font-black uppercase tracking-widest ${authCaptchaReady ? 'text-emerald-400' : 'text-amber-400'}`}>
                                    {authCaptchaReady ? 'Ready' : 'Review'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {message && (
                    <div className={`p-6 rounded-[1.8rem] border flex items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-500 mx-auto ${message.type === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                        }`}>
                        <div className={`p-2 rounded-xl ${message.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                            {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                        </div>
                        <span className="font-bold tracking-tight">{message.text}</span>
                    </div>
                )}

                <div className="rounded-[1.8rem] border border-white/5 bg-[#090912] p-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;

                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`text-left rounded-[1.4rem] border px-5 py-4 transition-all duration-300 ${isActive
                                        ? 'border-primary/30 bg-primary/10 shadow-[0_0_24px_rgba(138,43,226,0.14)]'
                                        : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10'
                                        }`}
                                >
                                    <div className="flex items-start gap-4">
                                        <div className={`mt-0.5 p-3 rounded-2xl ${isActive ? 'bg-primary/15 text-primary' : 'bg-white/5 text-gray-500'}`}>
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className={`text-[11px] font-black uppercase tracking-[0.24em] ${isActive ? 'text-primary' : 'text-gray-500'}`}>
                                                {tab.label}
                                            </p>
                                            <p className={`mt-2 text-sm font-medium ${isActive ? 'text-white' : 'text-gray-400'}`}>
                                                {tab.description}
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {activeTab === 'profile' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                        <SettingsShellCard
                            icon={<User className="w-5 h-5 text-primary" />}
                            title={t('account_settings.profile.title', 'Perfil')}
                            accent={<Fingerprint className="w-5 h-5 text-gray-800" />}
                        >
                            <form onSubmit={handleUpdateProfile} className="p-8 space-y-8">
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest ml-1">
                                            {t('account_settings.profile.full_name', 'Nome Completo')}
                                        </label>
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            className="w-full bg-white/[0.01] border border-white/5 rounded-2xl px-6 py-4 text-white focus:ring-2 focus:ring-primary/50 outline-none transition-all font-bold placeholder:text-gray-800"
                                            placeholder={t('account_settings.profile.full_name_placeholder', 'Seu nome')}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest ml-1">
                                            {t('account_settings.profile.email', 'E-mail')}
                                        </label>
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full bg-white/[0.01] border border-white/5 rounded-2xl px-6 py-4 text-white focus:ring-2 focus:ring-primary/50 outline-none transition-all font-bold placeholder:text-gray-800"
                                            placeholder={t('account_settings.profile.email_placeholder', 'seu@email.com')}
                                        />
                                        <p className="text-[10px] text-gray-600 font-medium mt-2 italic px-1">
                                            {t('account_settings.profile.email_hint', 'Alterações exigem confirmação via e-mail.')}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex justify-end pt-4">
                                    <Button type="submit" disabled={loading} className="w-full h-14 rounded-2xl bg-white/[0.05] hover:bg-primary text-white font-black uppercase tracking-tighter">
                                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
                                        {t('account_settings.profile.save', 'Salvar Alterações')}
                                    </Button>
                                </div>
                            </form>
                        </SettingsShellCard>

                        <SettingsShellCard
                            icon={<Lock className="w-5 h-5 text-primary" />}
                            title={t('account_settings.security.title', 'Senha')}
                            accent={<ShieldCheck className="w-5 h-5 text-gray-800" />}
                        >
                            <form onSubmit={handleChangePassword} className="p-8 space-y-8">
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest ml-1">
                                            {t('account_settings.security.new_password', 'Nova Senha')}
                                        </label>
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full bg-white/[0.01] border border-white/5 rounded-2xl px-6 py-4 text-white focus:ring-2 focus:ring-primary/50 outline-none transition-all font-bold placeholder:text-gray-800"
                                            placeholder="••••••••"
                                            minLength={6}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest ml-1">
                                            {t('account_settings.security.confirm_password', 'Confirmar Senha')}
                                        </label>
                                        <input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className="w-full bg-white/[0.01] border border-white/5 rounded-2xl px-6 py-4 text-white focus:ring-2 focus:ring-primary/50 outline-none transition-all font-bold placeholder:text-gray-800"
                                            placeholder="••••••••"
                                            minLength={6}
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end pt-4">
                                    <Button type="submit" variant="outline" disabled={loading || !password} className="w-full h-14 rounded-2xl border-white/5 hover:border-primary/50 hover:bg-primary text-white font-black uppercase tracking-tighter">
                                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5 mr-3" />}
                                        {t('account_settings.security.change_password', 'Redefinir Senha')}
                                    </Button>
                                </div>
                            </form>
                        </SettingsShellCard>
                    </div>
                )}

                {activeTab === 'system' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                        <SettingsShellCard
                            icon={<Globe className="w-5 h-5 text-primary" />}
                            title={t('account_settings.system.title', 'Regional')}
                            accent={<Globe className="w-5 h-5 text-gray-800" />}
                        >
                            <form onSubmit={handleUpdateSystemPreferences} className="p-8 space-y-8">
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest ml-1">
                                            {t('account_settings.system.language', 'Idioma Padrão')}
                                        </label>
                                        <select
                                            value={defaultLocale}
                                            onChange={(e) => setDefaultLocale(e.target.value)}
                                            className="w-full bg-white/[0.01] border border-white/5 rounded-2xl px-6 py-4 text-white focus:ring-2 focus:ring-primary/50 outline-none transition-all appearance-none font-bold"
                                        >
                                            <option value="en">English (US)</option>
                                            <option value="pt">Português (BR)</option>
                                            <option value="es">Español</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest ml-1">
                                            {t('account_settings.system.currency', 'Moeda Padrão')}
                                        </label>
                                        <select
                                            value={defaultCurrency}
                                            onChange={(e) => setDefaultCurrency(e.target.value)}
                                            className="w-full bg-white/[0.01] border border-white/5 rounded-2xl px-6 py-4 text-white focus:ring-2 focus:ring-primary/50 outline-none transition-all appearance-none font-bold"
                                        >
                                            <option value="USD">USD ($)</option>
                                            <option value="BRL">BRL (R$)</option>
                                            <option value="EUR">EUR (€)</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="flex justify-end pt-4">
                                    <Button type="submit" disabled={loading} className="w-full h-14 rounded-2xl bg-white/[0.05] hover:bg-primary text-white font-black uppercase tracking-tighter">
                                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5 mr-3" />}
                                        {t('account_settings.system.save', 'Atualizar Regional')}
                                    </Button>
                                </div>
                            </form>
                        </SettingsShellCard>

                        <SettingsShellCard
                            icon={<Shield className="w-5 h-5 text-primary" />}
                            title={t('account_settings.system.auth_captcha_title', 'Auth CAPTCHA')}
                            accent={<StatusBadge active={authCaptchaReady} activeLabel="Pronto" inactiveLabel="Revisar" />}
                        >
                            <div className="p-8 space-y-6">
                                <p className="text-sm text-gray-400 font-medium leading-relaxed">
                                    Centralize aqui a governança do CAPTCHA global do Supabase Auth. O fluxo oficial usa
                                    Cloudflare Turnstile, Vercel para os envs e o painel do Supabase em
                                    <span className="text-white font-semibold"> Authentication &gt; Attack Protection</span>.
                                </p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-600">Flag Frontend</p>
                                        <p className={`mt-2 text-sm font-black uppercase ${authCaptchaEnabled ? 'text-emerald-400' : 'text-amber-400'}`}>
                                            {authCaptchaEnabled ? 'Ativada' : 'Pendente'}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-600">Site Key</p>
                                        <p className={`mt-2 text-sm font-black uppercase ${authCaptchaSiteKey ? 'text-emerald-400' : 'text-amber-400'}`}>
                                            {authCaptchaSiteKey ? 'Configurada' : 'Pendente'}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-600">Hostname Atual</p>
                                        <p className="mt-2 text-sm font-semibold text-white break-all">
                                            {runtimeHostname || 'Indisponível'}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-600">Ownership</p>
                                        <p className="mt-2 text-sm font-semibold text-white">
                                            Cada cliente deve usar o próprio widget e as próprias chaves.
                                        </p>
                                    </div>
                                </div>

                                <div className="rounded-[1.6rem] border border-white/5 bg-[#0B0B12] p-5">
                                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-gray-600 mb-3">Env mínimo na Vercel</p>
                                    <div className="space-y-2 text-sm text-gray-300 font-mono">
                                        <div><span className="text-primary">VITE_ENABLE_SUPABASE_AUTH_CAPTCHA</span>=true</div>
                                        <div><span className="text-primary">VITE_TURNSTILE_SITE_KEY</span>=...site key pública...</div>
                                        <div><span className="text-primary">TURNSTILE_SECRET_KEY</span>=...secret key privada...</div>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-gray-600">Ordem oficial de rollout</p>
                                    <ol className="space-y-3 text-sm text-gray-300 list-decimal list-inside">
                                        <li>Crie o widget Turnstile no Cloudflare usando o domínio do projeto ou do cliente.</li>
                                        <li>Salve os três envs acima na Vercel e publique o deploy com este código.</li>
                                        <li>No Supabase, ative o CAPTCHA global em <span className="text-white font-semibold">Authentication &gt; Attack Protection</span>.</li>
                                        <li>Execute smoke de login, cadastro e recuperação antes de considerar o rollout concluído.</li>
                                    </ol>
                                </div>

                                <div className="rounded-2xl border border-amber-400/15 bg-amber-400/5 p-5 space-y-3">
                                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-300">Modelo para instalações de cliente</p>
                                    <ul className="space-y-2 text-sm text-amber-100/90 list-disc list-inside">
                                        <li>O cliente pode começar com um hostname temporário como <span className="font-mono">cliente.vercel.app</span>.</li>
                                        <li>Depois ele mesmo pode adicionar o domínio final, como <span className="font-mono">checkout.cliente.com</span>, no próprio widget dele.</li>
                                        <li>Não centralize domínios de clientes no Cloudflare master do Super Checkout.</li>
                                        <li>Quando o plano Supabase permitir, ative também a proteção contra senhas vazadas.</li>
                                    </ul>
                                </div>
                            </div>
                        </SettingsShellCard>

                        <SettingsShellCard
                            icon={<Fingerprint className="w-5 h-5 text-primary" />}
                            title="2FA (TOTP)"
                            accent={<StatusBadge active={twoFactorEnabled} activeLabel="Ativa" inactiveLabel="Inativa" />}
                            className="md:col-span-2"
                        >
                            <div className="p-8 space-y-8">
                                <div>
                                    <p className="text-sm text-gray-400 font-medium leading-relaxed mb-6">
                                        Adicione uma camada extra de proteção ao acesso administrativo. Além da senha,
                                        será solicitado um código temporário gerado no seu dispositivo.
                                    </p>

                                    <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5 flex items-center justify-between mb-8">
                                        <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest italic">Status Atual</span>
                                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${twoFactorEnabled ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/5 text-gray-700 border-white/5'}`}>
                                            {twoFactorEnabled ? 'Segurança Ativa' : 'Não Ativado'}
                                        </span>
                                    </div>
                                </div>

                                {twoFactorMessage && (
                                    <div className={`p-4 rounded-2xl border flex items-center gap-3 text-sm animate-in fade-in duration-500 ${twoFactorMessage.type === 'success'
                                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                        : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
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
                                        className="w-full h-16 rounded-2xl bg-primary hover:bg-primary/90 text-white font-black uppercase italic tracking-tighter shadow-xl shadow-primary/20"
                                    >
                                        {twoFactorSetupLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <QrCode className="w-5 h-5 mr-3" />}
                                        Configurar Duas Etapas
                                    </Button>
                                )}

                                {!twoFactorEnabled && twoFactorQrDataUrl && (
                                    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-700">
                                        <div className="flex flex-col items-center">
                                            <div className="p-4 bg-white rounded-3xl mb-6 shadow-2xl shadow-black/40">
                                                <img
                                                    src={twoFactorQrDataUrl}
                                                    alt="QR Code"
                                                    className="w-40 h-40"
                                                />
                                            </div>
                                            <p className="text-[10px] font-black text-gray-600 uppercase text-center max-w-[200px]">
                                                Escaneie com Google Authenticator ou Authy
                                            </p>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest ml-1 italic">
                                                    Código de Verificação
                                                </label>
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    maxLength={6}
                                                    value={twoFactorCode}
                                                    onChange={(e) => setTwoFactorCode(e.target.value)}
                                                    className="w-full bg-white/[0.01] border border-white/10 rounded-2xl px-6 py-5 text-white text-3xl font-black text-center focus:ring-2 focus:ring-primary/50 outline-none transition-all tracking-[0.5em]"
                                                    placeholder="000000"
                                                />
                                            </div>

                                            <div className="flex flex-col gap-3">
                                                <Button
                                                    type="button"
                                                    onClick={() => handleSubmitTwoFactor(false)}
                                                    disabled={twoFactorSubmitLoading}
                                                    className="w-full h-14 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-2xl shadow-xl shadow-emerald-500/10"
                                                >
                                                    {twoFactorSubmitLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5 mr-3" />}
                                                    Confirmar Ativação
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    onClick={handleStartTwoFactorSetup}
                                                    disabled={twoFactorSetupLoading}
                                                    className="text-gray-600 hover:text-white"
                                                >
                                                    <RefreshCw className="w-4 h-4 mr-2" /> Gerar Novo Par
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {twoFactorEnabled && (
                                    <div className="space-y-6 animate-in fade-in duration-1000">
                                        <div className="p-6 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                                            <p className="text-sm text-emerald-400 font-bold leading-relaxed italic">
                                                Sua conta está protegida com autenticação em duas etapas. Mantenha seu app autenticador seguro.
                                            </p>
                                        </div>

                                        <div className="space-y-4 pt-4 border-t border-white/5">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest ml-1">
                                                    Código p/ Desativar
                                                </label>
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    maxLength={6}
                                                    value={twoFactorCode}
                                                    onChange={(e) => setTwoFactorCode(e.target.value)}
                                                    className="w-full bg-white/[0.01] border border-white/5 rounded-2xl px-6 py-4 text-white text-center text-xl font-black tracking-[0.3em] font-mono"
                                                    placeholder="000000"
                                                />
                                            </div>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                onClick={() => handleSubmitTwoFactor(true)}
                                                disabled={twoFactorSubmitLoading}
                                                className="text-rose-500 hover:bg-rose-500/10 font-bold"
                                            >
                                                {twoFactorSubmitLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4 mr-2" />}
                                                Interromper Segurança (2FA)
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </SettingsShellCard>
                    </div>
                )}
            </div>
        </Layout>
    );
};

import React, { useState, useEffect } from 'react';
import { Layout } from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';
import { getApiUrl } from '../../utils/apiUtils';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { 
  User, 
  Lock, 
  Save, 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Settings as SettingsIcon, 
  ShieldCheck, 
  QrCode, 
  RefreshCw,
  ChevronRight,
  Shield,
  Fingerprint,
  Globe,
  Coins
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { logSecurityEvent } from '../../services/securityAuditClient';

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

export const Settings = () => {
    const { user, profile, refreshProfile } = useAuth();
    const { t, i18n } = useTranslation('admin');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Profile Form
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');

    // Password Form
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Two-Factor Authentication
    const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
    const [twoFactorCode, setTwoFactorCode] = useState('');
    const [twoFactorQrDataUrl, setTwoFactorQrDataUrl] = useState('');
    const [twoFactorSecret, setTwoFactorSecret] = useState('');
    const [twoFactorSetupLoading, setTwoFactorSetupLoading] = useState(false);
    const [twoFactorSubmitLoading, setTwoFactorSubmitLoading] = useState(false);
    const [twoFactorMessage, setTwoFactorMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // System Preferences Form
    const [defaultLocale, setDefaultLocale] = useState('en');
    const [defaultCurrency, setDefaultCurrency] = useState('USD');
    const [systemConfigId, setSystemConfigId] = useState<number | null>(null);

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
                const { data, error } = await supabase.from('system_config').select('*').single();
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

            const response = await fetch(getApiUrl('/api/auth/2fa?action=setup'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
            });

            const payload = await readApiPayload(response, 'Não foi possível preparar a 2FA.');
            if (!response.ok) throw new Error(payload.error || 'Não foi possível preparar a 2FA.');

            setTwoFactorSecret(payload.secret || '');
            setTwoFactorQrDataUrl(payload.qr_code_data_url || '');
            setTwoFactorCode('');
            const successMessage = {
                type: 'success',
                text: 'Escaneie o QR Code com seu app autenticador e confirme o código de 6 dígitos.'
            } as const;
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
        const normalizedCode = twoFactorCode.trim().replace(/\s+/g, '');
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

            const endpoint = disable ? '/api/auth/2fa?action=disable' : '/api/auth/2fa?action=verify';
            const response = await fetch(getApiUrl(endpoint), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ code: normalizedCode }),
            });

            const payload = await readApiPayload(response, 'Não foi possível validar a 2FA.');
            if (!response.ok) throw new Error(payload.error || 'Não foi possível validar a 2FA.');

            setTwoFactorEnabled(!disable);
            setTwoFactorCode('');
            setTwoFactorSecret('');
            setTwoFactorQrDataUrl('');
            await refreshProfile();

            const successMessage = {
                type: 'success',
                text: disable ? '2FA desativada com sucesso.' : '2FA ativada com sucesso.'
            } as const;
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

    return (
        <Layout>
            <div className="space-y-12 pb-24 max-w-6xl mx-auto">
                
                {/* Header Premium Section - Compact & Responsive */}
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
                            <p className="text-sm text-gray-500 font-medium max-w-2xl">
                                Gerencie sua identidade, preferências e segurança avançada em um único lugar.
                            </p>
                        </div>

                        {/* Horizontal Status Bar */}
                        <div className="flex flex-wrap items-center gap-4 pt-6 border-t border-white/5">
                           <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/[0.02] border border-white/5 h-10">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Account: Verified</span>
                           </div>

                           <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-white/[0.02] border border-white/5 h-10 group/item hover:border-emerald-500/30 transition-all">
                              <ShieldCheck className="w-4 h-4 text-emerald-500" />
                              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-hover/item:text-white transition-colors">Identity: Active</span>
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                           </div>

                           <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-white/[0.02] border border-white/5 h-10 group/item hover:border-primary/30 transition-all">
                              <Fingerprint className="w-4 h-4 text-primary" />
                              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-hover/item:text-white transition-colors">2FA Security:</span>
                              <span className={`text-[9px] font-black uppercase tracking-widest ${twoFactorEnabled ? 'text-emerald-400' : 'text-rose-500'}`}>
                                 {twoFactorEnabled ? 'Enabled' : 'Disabled'}
                              </span>
                              <div className={`w-2.5 h-2.5 rounded-full ${twoFactorEnabled ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}`} />
                           </div>
                        </div>
                    </div>
                </div>

                {/* Feedback Message */}
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                    
                    {/* Profile Settings */}
                    <Card className="border border-white/5 backdrop-blur-3xl bg-black/40 hover:border-primary/20 transition-all duration-700">
                        <div className="p-8 border-b border-white/5 flex items-center justify-between">
                           <div className="flex items-center gap-4">
                              <div className="p-3 bg-white/5 rounded-2xl">
                                 <User className="w-5 h-5 text-primary" />
                              </div>
                              <h2 className="text-xl font-portal-display text-white italic">
                                 {t('account_settings.profile.title', 'Perfil')}
                              </h2>
                           </div>
                           <Fingerprint className="w-5 h-5 text-gray-800" />
                        </div>
                        <form onSubmit={handleUpdateProfile} className="p-8 space-y-8">
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest ml-1">{t('account_settings.profile.full_name', 'Nome Completo')}</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full bg-white/[0.01] border border-white/5 rounded-2xl px-6 py-4 text-white focus:ring-2 focus:ring-primary/50 outline-none transition-all font-bold placeholder:text-gray-800"
                                        placeholder={t('account_settings.profile.full_name_placeholder', 'Seu nome')}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest ml-1">{t('account_settings.profile.email', 'E-mail')}</label>
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
                    </Card>

                    {/* System Preferences */}
                    <Card className="border border-white/5 backdrop-blur-3xl bg-black/40 hover:border-primary/20 transition-all duration-700">
                        <div className="p-8 border-b border-white/5 flex items-center justify-between">
                           <div className="flex items-center gap-4">
                              <div className="p-3 bg-white/5 rounded-2xl">
                                 <Globe className="w-5 h-5 text-primary" />
                              </div>
                              <h2 className="text-xl font-portal-display text-white italic uppercase tracking-tighter">
                                 Regional
                              </h2>
                           </div>
                           <Coins className="w-5 h-5 text-gray-800" />
                        </div>
                        <form onSubmit={handleUpdateSystemPreferences} className="p-8 space-y-8">
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest ml-1">{t('account_settings.system.language', 'Idioma Padrão')}</label>
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
                                    <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest ml-1">{t('account_settings.system.currency', 'Moeda Padrão')}</label>
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
                    </Card>

                    {/* Security Settings */}
                    <Card className="border border-white/5 backdrop-blur-3xl bg-black/40 hover:border-primary/20 transition-all duration-700">
                        <div className="p-8 border-b border-white/5 flex items-center justify-between">
                           <div className="flex items-center gap-4">
                              <div className="p-3 bg-white/5 rounded-2xl">
                                 <Lock className="w-5 h-5 text-primary" />
                              </div>
                              <h2 className="text-xl font-portal-display text-white italic uppercase tracking-tighter">
                                 Senha
                              </h2>
                           </div>
                           <ShieldCheck className="w-5 h-5 text-gray-800" />
                        </div>
                        <form onSubmit={handleChangePassword} className="p-8 space-y-8">
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest ml-1">{t('account_settings.security.new_password', 'Nova Senha')}</label>
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
                                    <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest ml-1">{t('account_settings.security.confirm_password', 'Confirmar Senha')}</label>
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
                    </Card>

                    {/* 2FA Section */}
                    <Card className="border border-white/5 backdrop-blur-3xl bg-black/40 hover:border-primary/20 transition-all duration-700">
                        <div className="p-8 border-b border-white/5 flex items-center justify-between">
                           <div className="flex items-center gap-4">
                              <div className="p-3 bg-white/5 rounded-2xl">
                                 <Fingerprint className="w-5 h-5 text-primary" />
                              </div>
                              <h2 className="text-xl font-portal-display text-white italic uppercase tracking-tighter">
                                 2FA (TOTP)
                              </h2>
                           </div>
                           <div className={`w-3 h-3 rounded-full ${twoFactorEnabled ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-gray-800'}`} />
                        </div>
                        <div className="p-8 space-y-8">
                            <div>
                                <p className="text-sm text-gray-400 font-medium leading-relaxed mb-6">
                                    Adicione uma camada extra de proteção. Além da senha, será solicitado um código temporário gerado no seu dispositivo.
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
                                       <p className="text-[10px] font-black text-gray-600 uppercase text-center max-w-[200px]">Escaneie com Google Authenticator ou Authy</p>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest ml-1 italic">Código de Verificação</label>
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
                                            <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest ml-1">Código p/ Desativar</label>
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
                    </Card>

                </div>
            </div>
        </Layout>
    );
};

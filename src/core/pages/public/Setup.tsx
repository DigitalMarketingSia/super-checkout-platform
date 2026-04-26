import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, User, Mail, Lock, ChevronRight, AlertCircle, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useInstallation } from '../../context/InstallationContext';

export default function Setup() {
    const { t } = useTranslation('auth');
    const navigate = useNavigate();
    const { installationId, loading: instLoading } = useInstallation();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [setupComplete, setSetupComplete] = useState(false);

    const checkIsSetupRequired = async (targetInstallationId: string) => {
        const { data, error } = await supabase.rpc('is_setup_required', {
            target_installation_id: targetInstallationId
        });

        if (!error) return data;

        const msg = error.message || '';
        if (msg.includes('is_setup_required') || msg.includes('schema cache')) {
            const fallback = await supabase.rpc('is_setup_required');
            if (!fallback.error) return fallback.data;
        }

        throw error;
    };

    useEffect(() => {
        if (instLoading) return;

        const checkSetup = async () => {
            if (!installationId) {
                console.warn('⚠️ No installation ID for Setup.');
                return;
            }

            try {
                const isRequired = await checkIsSetupRequired(installationId);
                if (!isRequired) {
                    navigate('/login');
                }
            } catch (err) {
                console.error('Error checking setup status:', err);
            }
        };
        checkSetup();
    }, [navigate, installationId, instLoading]);

    // Extract central_id from URL hash (injected by InstallerWizard)
    const getCentralIdFromHash = (): string | null => {
        try {
            const hash = window.location.hash;
            const match = hash.match(/installer_config=([^&]+)/);
            if (match) {
                const decoded = JSON.parse(atob(match[1]));
                return decoded.central_id || null;
            }
        } catch { /* ignore parse errors */ }
        return localStorage.getItem('installer_owner_id') || null;
    };

    const handleSetup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!installationId) {
            setError(t('setup.critical_error_no_id'));
            return;
        }

        setLoading(true);
        setError('');

        try {
            // double check if setup is still required
            const isRequired = await checkIsSetupRequired(installationId);

            if (!isRequired) {
                // Someone beat us to it, or it's already set up
                alert(t('setup.already_admin_error'));
                navigate('/login');
                return;
            }

            const centralUserId = getCentralIdFromHash();

            const response = await fetch('/api/setup-admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    email,
                    password,
                    installation_id: installationId,
                    central_user_id: centralUserId
                })
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.error || payload.message || 'Falha ao criar administrador.');
            }

            setSetupComplete(true);
        } catch (err: any) {
            console.error(err);
            if (err.message && err.message.includes('already registered')) {
                setError(t('setup.email_exists_error'));
            } else if (err.message && err.message.includes('Error sending confirmation email')) {
                setError(t('activation.errors.link_failed'));
            } else {
                setError(err.message || t('common:error'));
            }
        } finally {
            setLoading(false);
        }
    };

    // Show completion screen after server-side admin creation
    if (setupComplete) {
        return (
            <div className="min-h-screen bg-[#05050A] text-white selection:bg-primary/30 font-sans relative overflow-hidden flex items-center justify-center">
                <div className="fixed top-0 left-0 w-[500px] h-[500px] bg-[#3ECF8E]/10 rounded-full blur-[128px] pointer-events-none -translate-x-1/2 -translate-y-1/2 mix-blend-screen" />
                <div className="fixed bottom-0 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[128px] pointer-events-none translate-x-1/2 translate-y-1/2 mix-blend-screen" />

                <div className="w-full max-w-md p-8 relative z-10">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center p-3 mb-6 rounded-2xl bg-[#3ECF8E]/10 border border-[#3ECF8E]/20 shadow-2xl backdrop-blur-sm animate-in zoom-in duration-500">
                            <Check className="w-8 h-8 text-[#3ECF8E]" />
                        </div>
                        <h1 className="text-3xl font-extrabold tracking-tight mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-200 to-gray-400">
                            {t('setup.success_title')}
                        </h1>
                        <p className="text-gray-400">
                            {t('setup.success_desc')}
                        </p>
                    </div>

                    <div className="glass-panel border border-white/10 bg-white/5 backdrop-blur-xl rounded-2xl p-8 shadow-2xl animate-in fade-in slide-in-from-bottom-4">
                        <div className="space-y-4">
                            <div className="p-4 bg-[#3ECF8E]/10 border border-[#3ECF8E]/20 rounded-xl">
                                <div className="flex items-start gap-3">
                                    <Check className="w-5 h-5 text-[#3ECF8E] shrink-0 mt-0.5" />
                                    <div className="flex-1">
                                        <h3 className="font-semibold text-white mb-1">{t('setup.ready_login_title', 'Administrador confirmado')}</h3>
                                        <p className="text-sm text-gray-300 mb-2">
                                            {t('setup.ready_login_desc', 'Agora faca login com o e-mail e senha cadastrados.')}
                                        </p>
                                        <p className="text-sm font-mono bg-black/40 px-3 py-2 rounded-lg text-[#3ECF8E] break-all">
                                            {email}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => {
                                    window.location.assign('/login');
                                }}
                                className="w-full bg-[#3ECF8E] hover:bg-[#3ECF8E]/90 text-black font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#3ECF8E]/20 hover:shadow-[#3ECF8E]/40 hover:-translate-y-1 mt-6"
                            >
                                {t('setup.go_to_login')} <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    <p className="text-center text-gray-600 text-xs mt-8">
                        &copy; Super Checkout System
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#05050A] text-white selection:bg-primary/30 font-sans relative overflow-hidden flex items-center justify-center">
            <div className="fixed top-0 left-0 w-[500px] h-[500px] bg-[#3ECF8E]/10 rounded-full blur-[128px] pointer-events-none -translate-x-1/2 -translate-y-1/2 mix-blend-screen" />
            <div className="fixed bottom-0 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[128px] pointer-events-none translate-x-1/2 translate-y-1/2 mix-blend-screen" />

            <div className="w-full max-w-md p-8 relative z-10">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center p-3 mb-6 rounded-2xl bg-white/5 border border-white/10 shadow-2xl backdrop-blur-sm animate-in zoom-in duration-500">
                        <ShieldCheck className="w-8 h-8 text-[#3ECF8E]" />
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-tight mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-200 to-gray-400">
                        {t('setup.title')}
                    </h1>
                    <p className="text-gray-400">
                        {t('setup.desc')}
                    </p>
                </div>

                <div className="glass-panel border border-white/10 bg-white/5 backdrop-blur-xl rounded-2xl p-8 shadow-2xl animate-in fade-in slide-in-from-bottom-4">
                    <form onSubmit={handleSetup} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">{t('setup.full_name')}</label>
                            <div className="relative group">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-white transition-colors" />
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-gray-600 focus:border-[#3ECF8E]/50 focus:ring-1 focus:ring-[#3ECF8E]/50 outline-none transition-all"
                                    placeholder={t('setup.name_placeholder')}
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">{t('setup.email_label')}</label>
                            <div className="relative group">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-white transition-colors" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-gray-600 focus:border-[#3ECF8E]/50 focus:ring-1 focus:ring-[#3ECF8E]/50 outline-none transition-all"
                                    placeholder="seu@email.com"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">{t('setup.password_label')}</label>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-white transition-colors" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-gray-600 focus:border-[#3ECF8E]/50 focus:ring-1 focus:ring-[#3ECF8E]/50 outline-none transition-all"
                                    placeholder="••••••••"
                                    required
                                    minLength={6}
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2 animate-in slide-in-from-top-2">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-[#3ECF8E] hover:bg-[#3ECF8E]/90 text-black font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#3ECF8E]/20 hover:shadow-[#3ECF8E]/40 hover:-translate-y-1 mt-4"
                        >
                            {loading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                    {t('setup.creating_account')}
                                </>
                            ) : (
                                <>
                                    {t('setup.create_account_button')} <ChevronRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </form>
                </div>
                <p className="text-center text-gray-600 text-xs mt-8">
                    &copy; Super Checkout System
                </p>
            </div>
        </div>
    );
}

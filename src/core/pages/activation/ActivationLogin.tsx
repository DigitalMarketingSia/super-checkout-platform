import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, ArrowRight, ShieldCheck, Loader2, Lock } from 'lucide-react';
import { centralSupabase } from '../../services/centralClient';
import { CENTRAL_CONFIG } from '../../config/central';
import { getApiUrl } from '../../utils/apiUtils';
import { platformUrls } from '../../config/platformUrls';
import { licenseService } from '../../services/licenseService';

export const ActivationLogin = () => {
    const { t } = useTranslation(['auth', 'common']);
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const navigate = useNavigate();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [linkLoading, setLinkLoading] = useState(false);
    const [recoveryLoading, setRecoveryLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [verifyingToken, setVerifyingToken] = useState(!!token);

    useEffect(() => {
        const checkCentralSession = async () => {
            const { data: { session } } = await centralSupabase.auth.getSession();
            if (session) {
                navigate('/activate/setup');
            }
        };
        checkCentralSession();
    }, [navigate]);

    useEffect(() => {
        const checkKey = async () => {
            const { CENTRAL_SUPABASE_ANON_KEY } = await import('../../services/centralClient');
            if (!CENTRAL_SUPABASE_ANON_KEY || CENTRAL_SUPABASE_ANON_KEY.includes('MISSING')) {
                setError(`${t('common.error').toUpperCase()}: ${t('activation.errors.missing_config')}`);
            }
        };
        checkKey();

        if (token) {
            handleTokenLogin(token);
        }
    }, [token]);

    const handleTokenLogin = async (token: string) => {
        setVerifyingToken(true);
        try {
            const { CENTRAL_SUPABASE_ANON_KEY } = await import('../../services/centralClient');

            if (!CENTRAL_SUPABASE_ANON_KEY || CENTRAL_SUPABASE_ANON_KEY.includes('MISSING')) {
                throw new Error(t('activation.errors.missing_config'));
            }

            const response = await fetch(`${CENTRAL_CONFIG.API_URL}/validate-activation-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CENTRAL_SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    token,
                    origin: platformUrls.portal
                })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || t('activation.errors.server_error', { status: response.status }));
            }

            const data = await response.json();

            if (data.redirectUrl) {
                window.location.href = data.redirectUrl;
            } else {
                throw new Error(t('activation.errors.login_failed'));
            }

        } catch (err: any) {
            console.error('Token Login Error:', err);
            setError(err.message || t('activation.errors.invalid_token'));
            setVerifyingToken(false);
        }
    };

    const handlePasswordLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        const directCentralLogin = async () => {
            const { data, error } = await centralSupabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                throw error;
            }

            if (!data.session) {
                throw new Error(t('activation.errors.login_failed'));
            }

            navigate('/activate/setup');
        };

        try {
            const loginResponse = await fetch(getApiUrl('/api/auth/login'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, target: 'central' }),
            });

            const contentType = loginResponse.headers.get('content-type') || '';
            let loginData: any = {};

            if (contentType.includes('application/json')) {
                loginData = await loginResponse.json().catch(() => ({}));
            } else {
                const rawBody = await loginResponse.text().catch(() => '');
                throw new Error(
                    rawBody.trim()
                        ? `Backend de login respondeu algo inesperado: ${rawBody.slice(0, 160)}`
                        : 'Backend de login indisponivel no momento.'
                );
            }

            if (!loginResponse.ok) {
                if (loginResponse.status === 429) {
                    const mins = Math.ceil((loginData.retryAfterSec || 900) / 60);
                    throw new Error(`Muitas tentativas. Tente em ${mins} minutos.`);
                }
                throw new Error(loginData.error || t('activation.errors.login_failed'));
            }

            if (loginData.session) {
                await centralSupabase.auth.setSession({
                    access_token: loginData.session.access_token,
                    refresh_token: loginData.session.refresh_token,
                });
            }

            navigate('/activate/setup');
        } catch (err: any) {
            console.error(err);
            const shouldFallbackToDirectLogin =
                err?.message?.includes('Backend de login respondeu algo inesperado')
                || err?.message?.includes('Erro interno do servidor')
                || err?.message?.includes('Failed to fetch');

            if (shouldFallbackToDirectLogin) {
                try {
                    await directCentralLogin();
                    return;
                } catch (fallbackError: any) {
                    console.error('Direct central login fallback failed:', fallbackError);
                    setError(
                        fallbackError.message === 'Invalid login credentials'
                            ? t('activation.errors.invalid_credentials')
                            : (fallbackError.message || t('activation.errors.login_failed'))
                    );
                    return;
                }
            }

            setError(err.message === 'Invalid login credentials' ? t('activation.errors.invalid_credentials') : (err.message || t('activation.errors.login_failed')));
        } finally {
            setLoading(false);
        }
    };

    const handleRequestAccessLink = async () => {
        setError('');
        setSuccess('');

        if (!email.trim()) {
            setError('Informe seu e-mail para receber o link de acesso.');
            return;
        }

        setLinkLoading(true);

        try {
            await licenseService.requestActivationLink(email);
            setSuccess('Se houver uma licenca ativa para este e-mail, enviaremos um link de acesso em instantes.');
        } catch (err: any) {
            console.error('Activation link request failed:', err);
            setSuccess('Se houver uma licenca ativa para este e-mail, enviaremos um link de acesso em instantes.');
        } finally {
            setLinkLoading(false);
        }
    };

    const handleRequestRecoveryLink = async () => {
        setError('');
        setSuccess('');

        if (!email.trim()) {
            setError('Informe seu e-mail para receber o link de recuperacao.');
            return;
        }

        setRecoveryLoading(true);

        try {
            await licenseService.requestRecoveryLink(email);
            setSuccess('Se este e-mail existir, enviaremos um link de recuperacao em instantes.');
        } catch (err: any) {
            console.error('Recovery link request failed:', err);
            setSuccess('Se este e-mail existir, enviaremos um link de recuperacao em instantes.');
        } finally {
            setRecoveryLoading(false);
        }
    };

    if (verifyingToken) {
        return (
            <div className="min-h-screen bg-[#05050A] flex flex-col items-center justify-center p-4">
                <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
                <h2 className="text-xl font-bold text-white mb-2">{t('activation.verifying')}</h2>
                <p className="text-gray-400">{t('activation.wait')}</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#05050A] flex flex-col items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[128px] pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[128px] pointer-events-none" />

            <div className="z-10 w-full max-w-md">
                <div className="text-center mb-10">
                    <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1 rounded-full mb-6">
                        <ShieldCheck className="w-4 h-4 text-green-400" />
                        <span className="text-xs font-medium text-gray-300 uppercase tracking-wide">{t('activation.title')}</span>
                    </div>
                    <h1 className="text-4xl font-bold text-white mb-2">{t('activation.welcome')}</h1>
                    <p className="text-gray-400">{t('activation.desc')}</p>
                </div>

                <div className="bg-[#0F0F13] border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl text-sm mb-6">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-4 rounded-xl text-sm mb-6">
                            {success}
                        </div>
                    )}

                    <form onSubmit={handlePasswordLogin} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">{t('login.email')}</label>
                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                    placeholder="seu@email.com"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">{t('login.password')}</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                    placeholder="********"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-white text-black py-4 rounded-xl font-bold hover:bg-gray-200 transition-all flex items-center justify-center gap-2 group"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                            ) : (
                                <>
                                    {t('activation.password_btn', 'Acessar Portal')}
                                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={handleRequestAccessLink}
                            disabled={linkLoading || loading || recoveryLoading}
                            className="w-full border border-white/10 bg-white/5 text-white py-3.5 rounded-xl font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                        >
                            {linkLoading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    Receber link por e-mail
                                    <Mail className="w-4 h-4" />
                                </>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={handleRequestRecoveryLink}
                            disabled={recoveryLoading || loading || linkLoading}
                            className="mx-auto flex items-center justify-center text-sm font-medium text-gray-400 hover:text-white transition-colors disabled:opacity-60"
                        >
                            {recoveryLoading ? 'Enviando...' : 'Esqueci minha senha'}
                        </button>
                    </form>
                </div>

                <div className="text-center mt-8">
                    <p className="text-xs text-gray-600">
                        {t('activation.token_info')}
                    </p>
                </div>
            </div>
        </div>
    );
};

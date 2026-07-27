import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { Mail, ArrowRight, ShieldCheck, Loader2, Lock } from 'lucide-react';
import { AuthCaptchaPanel } from '../../components/auth/AuthCaptchaPanel';
import { getSupabaseAuthCaptchaSiteKey } from '../../config/authCaptcha';
import { centralSupabase, CENTRAL_SUPABASE_ANON_KEY } from '../../services/centralClient';
import { CENTRAL_CONFIG } from '../../config/central';
import { getApiUrl } from '../../utils/apiUtils';
import { platformUrls } from '../../config/platformUrls';
import { licenseService } from '../../services/licenseService';
import { PwaInstallBanner } from '../../components/ui/PwaInstallBanner';

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
    const [mode, setMode] = useState<'password' | 'two_factor'>('password');
    const [twoFactorToken, setTwoFactorToken] = useState('');
    const [twoFactorCode, setTwoFactorCode] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [verifyingToken, setVerifyingToken] = useState(!!token);
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);
    const [captchaWidgetKey, setCaptchaWidgetKey] = useState(0);
    const [serverCaptchaSiteKey, setServerCaptchaSiteKey] = useState<string | null>(null);
    const authCaptchaSiteKey = getSupabaseAuthCaptchaSiteKey();
    const effectiveAuthCaptchaSiteKey = authCaptchaSiteKey || serverCaptchaSiteKey;
    const requiresPasswordCaptcha = mode === 'password' && Boolean(effectiveAuthCaptchaSiteKey);

    const resetCaptcha = () => {
        setCaptchaToken(null);
        setCaptchaWidgetKey((current) => current + 1);
    };

    useEffect(() => {
        setCaptchaToken(null);
    }, [mode]);

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
            if (!CENTRAL_SUPABASE_ANON_KEY || CENTRAL_SUPABASE_ANON_KEY.includes('MISSING')) {
                throw new Error(t('activation.errors.missing_config'));
            }

            const response = await fetch(`${CENTRAL_CONFIG.API_URL}/validate-activation-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': CENTRAL_SUPABASE_ANON_KEY,
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

    const completeCentralLogin = async (loginData: any) => {
        if (!loginData?.session?.access_token || !loginData?.session?.refresh_token) {
            throw new Error(t('activation.errors.login_failed'));
        }

        const { error: sessionError } = await centralSupabase.auth.setSession({
            access_token: loginData.session.access_token,
            refresh_token: loginData.session.refresh_token,
        });

        if (sessionError) {
            throw sessionError;
        }

        const { data: { user }, error: userError } = await centralSupabase.auth.getUser();
        if (userError || !user) {
            throw new Error(userError?.message || t('activation.errors.session_not_saved'));
        }

        navigate('/activate/setup');
    };

    const handlePasswordLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const loginResponse = await fetch(getApiUrl('/api/auth/login'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    password,
                    target: 'central',
                    captchaToken: requiresPasswordCaptcha ? captchaToken : null,
                }),
            });

            const contentType = loginResponse.headers.get('content-type') || '';
            let loginData: any = {};

            if (contentType.includes('application/json')) {
                loginData = await loginResponse.json().catch(() => ({}));
            } else {
                const rawBody = await loginResponse.text().catch(() => '');
                throw new Error(
                    rawBody.trim()
                        ? t('activation.errors.backend_unexpected', { message: rawBody.slice(0, 160) })
                        : t('activation.errors.backend_unavailable')
                );
            }

            if (!loginResponse.ok) {
                const nextCaptchaSiteKey = typeof loginData.captchaSiteKey === 'string'
                    ? loginData.captchaSiteKey.trim()
                    : '';

                if (loginData.error_code === 'captcha_required') {
                    if (nextCaptchaSiteKey) {
                        setServerCaptchaSiteKey(nextCaptchaSiteKey);
                    } else if (!effectiveAuthCaptchaSiteKey) {
                        throw new Error('O Supabase exigiu CAPTCHA, mas a VITE_TURNSTILE_SITE_KEY nao esta configurada no ambiente local.');
                    }
                }

                if (loginResponse.status === 429) {
                    const mins = Math.ceil((loginData.retryAfterSec || 900) / 60);
                    throw new Error(t('activation.errors.too_many_attempts_retry', { minutes: mins }));
                }
                throw new Error(loginData.error || t('activation.errors.login_failed'));
            }

            if (loginData.requires_two_factor) {
                setTwoFactorToken(loginData.two_factor_token || '');
                setTwoFactorCode('');
                setPassword('');
                setMode('two_factor');
                setSuccess('Autenticacao em duas etapas exigida. Digite o codigo do seu app autenticador.');
                return;
            }

            await completeCentralLogin(loginData);
        } catch (err: any) {
            console.error(err);
            const normalizedMessage = String(err?.message || '').toLowerCase();
            if (normalizedMessage.includes('captcha') || normalizedMessage.includes('humano')) {
                setError(t('register.captcha_error', { ns: 'auth' }));
            } else {
                setError(err.message === 'Invalid login credentials' ? t('activation.errors.invalid_credentials') : (err.message || t('activation.errors.login_failed')));
            }
        } finally {
            if (requiresPasswordCaptcha) {
                resetCaptcha();
            }
            setLoading(false);
        }
    };

    const handleTwoFactorVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        try {
            if (!twoFactorToken) {
                throw new Error('Sessao de validacao expirada. Faca login novamente.');
            }

            const verifyResponse = await fetch(getApiUrl('/api/auth?route=2fa&action=verify'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'verify',
                    code: twoFactorCode.replace(/[^\d]/g, ''),
                    challenge_token: twoFactorToken,
                }),
            });

            const contentType = verifyResponse.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                const rawBody = await verifyResponse.text().catch(() => '');
                throw new Error(
                    rawBody.trim()
                        ? `Backend de 2FA respondeu algo inesperado: ${rawBody.slice(0, 160)}`
                        : 'Backend de 2FA indisponivel.'
                );
            }

            const verifyData = await verifyResponse.json().catch(() => ({}));
            if (!verifyResponse.ok) {
                throw new Error(verifyData.error || 'Nao foi possivel validar o codigo.');
            }

            await completeCentralLogin(verifyData);
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Nao foi possivel validar o codigo.');
        } finally {
            setLoading(false);
        }
    };

    const handleRequestAccessLink = async () => {
        setError('');
        setSuccess('');

        if (!email.trim()) {
            setError(t('activation.request_access_email_required'));
            return;
        }

        setLinkLoading(true);

        try {
            await licenseService.requestActivationLink(email);
            setSuccess(t('activation.request_access_success'));
        } catch (err: any) {
            console.error('Activation link request failed:', err);
            setSuccess(t('activation.request_access_success'));
        } finally {
            setLinkLoading(false);
        }
    };

    const handleRequestRecoveryLink = async () => {
        setError('');
        setSuccess('');

        if (!email.trim()) {
            setError(t('activation.request_recovery_email_required'));
            return;
        }

        setRecoveryLoading(true);

        try {
            await licenseService.requestRecoveryLink(email);
            setSuccess(t('activation.request_recovery_success'));
        } catch (err: any) {
            console.error('Recovery link request failed:', err);
            setSuccess(t('activation.request_recovery_success'));
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
                <PwaInstallBanner />

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

                    <form onSubmit={mode === 'two_factor' ? handleTwoFactorVerify : handlePasswordLogin} className="space-y-6">
                        {mode === 'password' && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">{t('login.email')}</label>
                                    <div className="relative group">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-black transition-colors w-5 h-5" />
                                        <input
                                            type="email"
                                            required
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            className="w-full bg-[#16161F] border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-white outline-none focus:bg-white focus:text-black focus:border-white focus:ring-0 transition-all placeholder:text-gray-600"
                                            placeholder={t('activation.email_placeholder')}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">{t('login.password')}</label>
                                    <div className="relative group">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-black transition-colors w-5 h-5" />
                                        <input
                                            type="password"
                                            required
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            className="w-full bg-[#16161F] border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-white outline-none focus:bg-white focus:text-black focus:border-white focus:ring-0 transition-all placeholder:text-gray-600"
                                            placeholder="********"
                                        />
                                    </div>
                                </div>

                                {requiresPasswordCaptcha && effectiveAuthCaptchaSiteKey && (
                                    <AuthCaptchaPanel
                                        siteKey={effectiveAuthCaptchaSiteKey}
                                        onTokenChange={setCaptchaToken}
                                        title={t('register.captcha_title', { ns: 'auth' })}
                                        description={t('register.captcha_desc', { ns: 'auth' })}
                                        widgetKey={captchaWidgetKey}
                                    />
                                )}
                            </>
                        )}

                        {mode === 'two_factor' && (
                            <div className="space-y-4">
                                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                                    <div className="flex items-center gap-2 text-emerald-300 text-sm font-bold mb-1">
                                        <ShieldCheck className="w-4 h-4" />
                                        Validacao em duas etapas
                                    </div>
                                    <p className="text-xs text-gray-400">
                                        Digite o codigo de 6 digitos do app autenticador para concluir o acesso ao portal.
                                    </p>
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="block text-sm font-medium text-gray-400">Codigo 2FA</label>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setMode('password');
                                                setTwoFactorToken('');
                                                setTwoFactorCode('');
                                                setPassword('');
                                                setError('');
                                                setSuccess('');
                                            }}
                                            className="text-xs font-bold text-gray-400 hover:text-white transition-colors"
                                        >
                                            Voltar
                                        </button>
                                    </div>
                                    <div className="relative group">
                                        <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-black transition-colors w-5 h-5" />
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={6}
                                            required
                                            value={twoFactorCode}
                                            onChange={e => setTwoFactorCode(e.target.value)}
                                            className="w-full bg-[#16161F] border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-white outline-none focus:bg-white focus:text-black focus:border-white focus:ring-0 transition-all placeholder:text-gray-600 tracking-[0.2em]"
                                            placeholder="123456"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || (requiresPasswordCaptcha && !captchaToken)}
                            className="w-full bg-white text-black py-4 rounded-xl font-bold hover:bg-gray-200 transition-all flex items-center justify-center gap-2 group disabled:opacity-60"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                            ) : (
                                <>
                                    {mode === 'two_factor' ? 'Verificar codigo' : t('activation.password_btn', 'Acessar Portal')}
                                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>

                        {mode === 'password' && (
                            <>
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
                                            {t('activation.request_access_button')}
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
                                    {recoveryLoading ? t('activation.processing') : t('activation.request_recovery_button')}
                                </button>
                            </>
                        )}
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

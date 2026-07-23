import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { storage } from '../../services/storageService';
import { MemberArea } from '../../types';
import { Button } from '../../components/ui/Button';
import { Lock, ArrowRight, Mail, User } from 'lucide-react';
import { AuthCaptchaPanel } from '../../components/auth/AuthCaptchaPanel';
import { getSupabaseAuthCaptchaSiteKey } from '../../config/authCaptcha';
import { getApiUrl } from '../../utils/apiUtils';
import { supabase } from '../../services/supabase';
import { useTranslation } from 'react-i18next';
import { getRuntimeMode } from '../../config/runtimeMode';
import { demoDataService } from '../../services/demoDataService';

export const MemberLogin = ({ forcedSlug }: { forcedSlug?: string }) => {
    const { t } = useTranslation(['member', 'auth']);
    const { slug: paramSlug } = useParams<{ slug: string }>();
    const slug = forcedSlug || paramSlug;
    const navigate = useNavigate();
    const location = useLocation();
    const [memberArea, setMemberArea] = useState<MemberArea | null>(null);
    const [loading, setLoading] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loggingIn, setLoggingIn] = useState(false);
    const [recovering, setRecovering] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);
    const [captchaWidgetKey, setCaptchaWidgetKey] = useState(0);
    const [serverCaptchaSiteKey, setServerCaptchaSiteKey] = useState<string | null>(null);
    const isDemoRuntime = getRuntimeMode() === 'demo';
    const authCaptchaSiteKey = getSupabaseAuthCaptchaSiteKey();
    const effectiveAuthCaptchaSiteKey = authCaptchaSiteKey || serverCaptchaSiteKey;

    const resetCaptcha = () => {
        setCaptchaToken(null);
        setCaptchaWidgetKey((current) => current + 1);
    };

    useEffect(() => {
        if (slug) {
            loadMemberArea(slug);
        }
    }, [slug]);

    const loadMemberArea = async (slug: string) => {
        try {
            const area = await storage.getMemberAreaBySlug(slug);
            if (area) {
                setMemberArea(area);
            } else {
                navigate('/app'); // Not found
            }
        } catch (error) {
            console.error('Error loading member area:', error);
        } finally {
            setLoading(false);
        }
    };

    const getSafeRedirectPath = useCallback(() => {
        const fallbackPath = forcedSlug ? '/' : `/app/${slug}`;
        const nextPath = new URLSearchParams(location.search).get('next');

        if (!nextPath || !nextPath.startsWith('/') || nextPath.startsWith('//')) {
            return fallbackPath;
        }

        if (forcedSlug) {
            return nextPath;
        }

        return nextPath.startsWith(`/app/${slug}`) ? nextPath : fallbackPath;
    }, [forcedSlug, location.search, slug]);

    const isMagicLinkCallback = new URLSearchParams(location.search).get('email_access') === '1';

    useEffect(() => {
        if (isDemoRuntime || !isMagicLinkCallback) return;

        let active = true;
        const finishMagicLinkLogin = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!active) return;

            if (session) {
                navigate(getSafeRedirectPath(), { replace: true });
            } else {
                setError('Este link de acesso e invalido ou expirou. Solicite um novo link.');
            }
        };

        void finishMagicLinkLogin();
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session && active) {
                navigate(getSafeRedirectPath(), { replace: true });
            }
        });

        return () => {
            active = false;
            subscription.unsubscribe();
        };
    }, [getSafeRedirectPath, isDemoRuntime, isMagicLinkCallback, navigate]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoggingIn(true);
        setError('');
        setSuccess('');

        try {
            if (isDemoRuntime) {
                await demoDataService.loginMember(email, password, slug);
                navigate(getSafeRedirectPath(), { replace: true });
                return;
            }

            // Fase 15.3 — Rate-limited login via Vercel Serverless proxy
            const loginResponse = await fetch(getApiUrl('/api/auth/login'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    password,
                    target: 'local',
                    captchaToken: effectiveAuthCaptchaSiteKey ? captchaToken : null,
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
                        ? t('login.errors.unexpected_backend', { message: rawBody.slice(0, 160) })
                        : t('login.errors.backend_unavailable')
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
                    throw new Error(t('login.errors.rate_limited', { count: mins }));
                }
                throw new Error(loginData.error || t('login.errors.invalid_credentials'));
            }

            // Inject session into local Supabase client
            if (loginData.session) {
                await supabase.auth.setSession({
                    access_token: loginData.session.access_token,
                    refresh_token: loginData.session.refresh_token,
                });
            }

            if (loginData.user) {
                navigate(getSafeRedirectPath(), { replace: true });
            }
        } catch (error: any) {
            console.error('Login error:', error);
            const normalizedMessage = String(error?.message || '').toLowerCase();
            if (normalizedMessage.includes('captcha') || normalizedMessage.includes('humano')) {
                setError(t('auth:register.captcha_error'));
            } else {
                setError(error.message || t('login.errors.invalid_credentials'));
            }
        } finally {
            if (effectiveAuthCaptchaSiteKey) {
                resetCaptcha();
            }
            setLoggingIn(false);
        }
    };

    const handlePasswordRecovery = async () => {
        if (!email) {
            setError(t('login.errors.email_required'));
            return;
        }

        setRecovering(true);
        setError('');
        setSuccess('');

        try {
            if (isDemoRuntime) {
                setSuccess('No modo demo, o acesso do aluno e liberado automaticamente apos a compra fake.');
                return;
            }

            const response = await fetch('/api/system?action=member-password-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    member_area_slug: slug,
                }),
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data?.error || t('login.errors.recovery_send_failed'));

            setSuccess(t('login.recovery_success'));
        } catch (error: any) {
            console.error('Password recovery error:', error);
            setError(error.message || t('login.errors.recovery_send_failed'));
        } finally {
            setRecovering(false);
        }
    };

    if (loading) {
        return <div className="min-h-screen bg-black flex items-center justify-center text-white">{t('common.loading')}</div>;
    }

    if (!memberArea) return null;

    const primaryColor = memberArea.primary_color || '#E50914';

    return (
        <div className="min-h-screen flex bg-[#05050A] text-white font-sans">
            {/* Left Side - Image */}
            <div className="hidden lg:block w-1/2 p-4 lg:p-6 select-none shrink-0">
                <div className="w-full h-full relative overflow-hidden rounded-[2.5rem] border border-white/5 shadow-2xl">
                    {memberArea.login_image_url ? (
                        <img
                            src={memberArea.login_image_url}
                            alt={t('login.background_alt')}
                            className="absolute inset-0 w-full h-full object-cover"
                        />
                    ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-black" />
                    )}
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-12 text-white">
                        {memberArea.logo_url && (
                            <img src={memberArea.logo_url} alt={memberArea.name} className="h-24 object-contain mb-8 drop-shadow-2xl" />
                        )}
                        <h1 className="text-4xl font-bold mb-4 drop-shadow-lg">{memberArea.name}</h1>
                        <p className="text-xl text-gray-200 max-w-md drop-shadow-md">
                            {t('login.hero_subtitle')}
                        </p>
                    </div>
                </div>
            </div>

            {/* Right Side - Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
                <div className="w-full max-w-md space-y-8">
                    <div className="text-center lg:hidden mb-8">
                        {memberArea.logo_url && (
                            <img src={memberArea.logo_url} alt={memberArea.name} className="h-16 object-contain mx-auto mb-4" />
                        )}
                        <h1 className="text-2xl font-bold">{memberArea.name}</h1>
                    </div>

                    <div>
                        <h2 className="text-3xl font-bold mb-2">{t('login.title')}</h2>
                        <p className="text-gray-400">{t('login.subtitle')}</p>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl text-sm">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl text-sm">
                            {success}
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">{t('profile.email')}</label>
                            <div className="relative group">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-black transition-colors w-5 h-5" />
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    className="w-full bg-[#16161F] border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-white outline-none focus:bg-white focus:text-black focus:border-white focus:ring-0 transition-all placeholder:text-gray-600"
                                    placeholder="seu@email.com"
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between gap-4 mb-2">
                                <label className="block text-sm font-medium text-gray-400">{t('profile.password')}</label>
                                <button
                                    type="button"
                                    onClick={handlePasswordRecovery}
                                    disabled={recovering}
                                    className="text-xs font-semibold text-gray-300 hover:text-white transition-colors disabled:opacity-50"
                                >
                                    {recovering ? t('profile.sending') : t('login.recover_password')}
                                </button>
                            </div>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-black transition-colors w-5 h-5" />
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="w-full bg-[#16161F] border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-white outline-none focus:bg-white focus:text-black focus:border-white focus:ring-0 transition-all placeholder:text-gray-600"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        {effectiveAuthCaptchaSiteKey && (
                            <AuthCaptchaPanel
                                siteKey={effectiveAuthCaptchaSiteKey}
                                onTokenChange={setCaptchaToken}
                                title={t('auth:register.captcha_title')}
                                description={t('auth:register.captcha_desc')}
                                widgetKey={captchaWidgetKey}
                            />
                        )}

                        <button
                            type="submit"
                            disabled={loggingIn || recovering || (effectiveAuthCaptchaSiteKey && !captchaToken)}
                            className="w-full bg-white hover:bg-gray-100 text-black font-bold py-4 rounded-xl transition-all shadow-lg hover:shadow-white/10 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-4 group"
                        >
                            {loggingIn ? (
                                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin text-black" />
                            ) : (
                                <>
                                    {t('nav.login')} <ArrowRight className="w-5 h-5 text-black group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

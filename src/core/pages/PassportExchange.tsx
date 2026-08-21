import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { AlertTriangle, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { CENTRAL_CONFIG } from '../config/central';
import { platformUrls } from '../config/platformUrls';
import { CENTRAL_SUPABASE_ANON_KEY, centralSupabase } from '../services/centralClient';
import { useTranslation } from 'react-i18next';

type ExchangeState = 'loading' | 'success' | 'error';

interface ExchangeResponse {
    success?: boolean;
    error?: string;
    reason?: string;
    target_origin?: string;
    target_path?: string;
    redirect_to?: string;
    auth?: {
        method?: 'verify_otp' | 'action_link';
        type?: string;
        token_hash?: string;
        email?: string;
        action_link?: string;
    };
}

const getFriendlyError = (reason: string | undefined, t: (key: string) => string) => {
    switch (reason) {
        case 'expired':
            return t('coverage.passport.expired');
        case 'invalid_status':
        case 'already_consumed':
            return t('coverage.passport.already_used');
        case 'origin_mismatch':
            return t('coverage.passport.origin_mismatch');
        case 'user_blocked':
            return t('coverage.passport.user_blocked');
        case 'rate_limited':
            return t('coverage.passport.rate_limited');
        case 'not_found':
        case 'user_not_found':
        default:
            return t('coverage.passport.invalid');
    }
};

const getSafeRedirectPath = (path?: string) => {
    if (!path || !path.startsWith('/') || path.startsWith('//')) {
        return '/activate';
    }

    return path;
};

const normalizeOrigin = (origin?: string) => {
    if (!origin) return null;

    try {
        return new URL(origin).origin;
    } catch {
        return null;
    }
};

const getTrustedPassportOrigins = () => {
    const origins = [
        platformUrls.marketing,
        platformUrls.app,
        platformUrls.portal,
        platformUrls.install,
        platformUrls.demo,
        window.location.origin,
        import.meta.env.VITE_SUPER_CHECKOUT_MARKETING_URL,
        import.meta.env.VITE_SUPER_CHECKOUT_APP_URL,
        import.meta.env.VITE_SUPER_CHECKOUT_PORTAL_URL,
        import.meta.env.VITE_SUPER_CHECKOUT_INSTALL_URL,
        import.meta.env.VITE_SUPER_CHECKOUT_DEMO_URL,
    ]
        .map((origin) => normalizeOrigin(origin))
        .filter(Boolean) as string[];

    if (import.meta.env.DEV) {
        origins.push('http://localhost:3000', 'http://localhost:5173');
    }

    return new Set(origins);
};

const assertTrustedPassportOrigin = (origin: string | undefined, t: (key: string) => string) => {
    const normalized = normalizeOrigin(origin);
    if (!normalized || !getTrustedPassportOrigins().has(normalized)) {
        throw new Error(t('coverage.passport.untrusted_destination'));
    }

    return normalized;
};

export const PassportExchange: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const ticket = useMemo(() => searchParams.get('ticket')?.trim() || '', [searchParams]);
    const [state, setState] = useState<ExchangeState>('loading');
    const [message, setMessage] = useState(t('coverage.passport.validating'));

    useEffect(() => {
        let canceled = false;

        const exchange = async () => {
            if (!ticket) {
                setState('error');
                setMessage(t('coverage.passport.incomplete'));
                return;
            }

            try {
                const response = await fetch(`${CENTRAL_CONFIG.API_URL}/exchange-passport-ticket`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        apikey: CENTRAL_SUPABASE_ANON_KEY,
                        Authorization: `Bearer ${CENTRAL_SUPABASE_ANON_KEY}`,
                    },
                    body: JSON.stringify({
                        ticket,
                        origin: window.location.origin,
                    }),
                });

                const data = (await response.json().catch(() => ({}))) as ExchangeResponse;

                if (!response.ok || !data.success) {
                    throw new Error(getFriendlyError(data.reason, t));
                }

                const redirectPath = getSafeRedirectPath(data.target_path);

                if (data.auth?.method === 'verify_otp' && data.auth.token_hash) {
                    const { error } = await centralSupabase.auth.verifyOtp({
                        type: (data.auth.type || 'magiclink') as any,
                        token_hash: data.auth.token_hash,
                    });

                    if (error) {
                        throw new Error(t('coverage.passport.session_error'));
                    }

                    if (canceled) return;
                    setState('success');
                    setMessage(t('coverage.passport.success'));

                    if (data.target_origin && data.target_origin !== window.location.origin) {
                        const targetOrigin = assertTrustedPassportOrigin(data.target_origin, t);
                        window.location.href = new URL(redirectPath, targetOrigin).toString();
                        return;
                    }

                    navigate(redirectPath, { replace: true });
                    return;
                }

                if (data.auth?.method === 'action_link' && data.auth.action_link) {
                    assertTrustedPassportOrigin(data.auth.action_link, t);
                    window.location.href = data.auth.action_link;
                    return;
                }

                throw new Error(t('coverage.passport.complete_error'));
            } catch (error: any) {
                if (canceled) return;
                setState('error');
                setMessage(error?.message || t('coverage.passport.invalid'));
            }
        };

        exchange();

        return () => {
            canceled = true;
        };
    }, [navigate, t, ticket]);

    const isLoading = state === 'loading';
    const isSuccess = state === 'success';

    return (
        <div className="min-h-screen bg-[#05050A] flex items-center justify-center px-6 text-white">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center shadow-2xl">
                <div className={`mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border ${
                    state === 'error'
                        ? 'border-red-500/30 bg-red-500/10 text-red-400'
                        : 'border-primary/30 bg-primary/10 text-primary'
                }`}>
                    {isLoading ? (
                        <Loader2 className="h-7 w-7 animate-spin" />
                    ) : isSuccess ? (
                        <ShieldCheck className="h-7 w-7" />
                    ) : (
                        <AlertTriangle className="h-7 w-7" />
                    )}
                </div>

                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.24em] text-gray-500">
                    {t('coverage.passport.label')}
                </p>
                <h1 className="mb-3 text-2xl font-black tracking-tight">
                    {state === 'error' ? t('coverage.passport.access_denied') : t('coverage.passport.checking')}
                </h1>
                <p className="mx-auto mb-8 max-w-sm text-sm leading-6 text-gray-400">
                    {message}
                </p>

                {state === 'error' && (
                    <button
                        type="button"
                        onClick={() => {
                            window.location.href = platformUrls.portal + '/activate';
                        }}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-black transition-colors hover:bg-gray-200"
                    >
                        {t('coverage.passport.back_to_portal')}
                        <ArrowRight className="h-4 w-4" />
                    </button>
                )}
            </div>
        </div>
    );
};

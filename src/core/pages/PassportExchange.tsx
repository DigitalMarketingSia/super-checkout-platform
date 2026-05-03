import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { CENTRAL_CONFIG } from '../config/central';
import { platformUrls } from '../config/platformUrls';
import { CENTRAL_SUPABASE_ANON_KEY, centralSupabase } from '../services/centralClient';

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

const getFriendlyError = (reason?: string) => {
    switch (reason) {
        case 'expired':
            return 'Este link expirou. Solicite um novo acesso para continuar.';
        case 'invalid_status':
        case 'already_consumed':
            return 'Este link ja foi usado. Para sua seguranca, cada link funciona apenas uma vez.';
        case 'origin_mismatch':
            return 'Este link nao pertence a este dominio. Abra o link original recebido no e-mail.';
        case 'user_blocked':
            return 'Nao foi possivel liberar o acesso desta conta. Entre em contato com o suporte.';
        case 'rate_limited':
            return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.';
        case 'not_found':
        case 'user_not_found':
        default:
            return 'Nao foi possivel validar este link. Solicite um novo acesso.';
    }
};

const getSafeRedirectPath = (path?: string) => {
    if (!path || !path.startsWith('/') || path.startsWith('//')) {
        return '/activate';
    }

    return path;
};

export const PassportExchange: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const ticket = useMemo(() => searchParams.get('ticket')?.trim() || '', [searchParams]);
    const [state, setState] = useState<ExchangeState>('loading');
    const [message, setMessage] = useState('Validando seu acesso...');

    useEffect(() => {
        let canceled = false;

        const exchange = async () => {
            if (!ticket) {
                setState('error');
                setMessage('Link incompleto. Solicite um novo acesso.');
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
                    throw new Error(getFriendlyError(data.reason));
                }

                const redirectPath = getSafeRedirectPath(data.target_path);

                if (data.auth?.method === 'verify_otp' && data.auth.token_hash) {
                    const { error } = await centralSupabase.auth.verifyOtp({
                        type: (data.auth.type || 'magiclink') as any,
                        token_hash: data.auth.token_hash,
                    });

                    if (error) {
                        throw new Error('O link foi validado, mas nao foi possivel abrir a sessao.');
                    }

                    if (canceled) return;
                    setState('success');
                    setMessage('Acesso liberado. Redirecionando...');

                    if (data.target_origin && data.target_origin !== window.location.origin) {
                        window.location.href = new URL(redirectPath, data.target_origin).toString();
                        return;
                    }

                    navigate(redirectPath, { replace: true });
                    return;
                }

                if (data.auth?.method === 'action_link' && data.auth.action_link) {
                    window.location.href = data.auth.action_link;
                    return;
                }

                throw new Error('Nao foi possivel concluir o acesso com este link.');
            } catch (error: any) {
                if (canceled) return;
                setState('error');
                setMessage(error?.message || 'Nao foi possivel validar este link.');
            }
        };

        exchange();

        return () => {
            canceled = true;
        };
    }, [navigate, ticket]);

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
                    Cross-Domain Passport
                </p>
                <h1 className="mb-3 text-2xl font-black tracking-tight">
                    {state === 'error' ? 'Acesso nao liberado' : 'Conferindo acesso'}
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
                        Voltar ao portal
                        <ArrowRight className="h-4 w-4" />
                    </button>
                )}
            </div>
        </div>
    );
};

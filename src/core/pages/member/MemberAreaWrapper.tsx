import React, { useState, useEffect } from 'react';
import { Outlet, useParams, useNavigate } from 'react-router-dom';
import { MemberAreaLayout } from './MemberAreaLayout';
import { supabase } from '../../services/supabase';
import { storage } from '../../services/storageService';
import { MemberArea } from '../../types';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { getRuntimeMode } from '../../config/runtimeMode';
import { demoDataService } from '../../services/demoDataService';
import { useTranslation } from 'react-i18next';

const PRIVILEGED_ROLES = new Set(['admin', 'owner', 'master_admin']);

function normalizeRole(role?: string | null) {
    return String(role || '').trim().toLowerCase();
}

function buildCurrentUrl(params: URLSearchParams) {
    const query = params.toString();
    return `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
}

function stripMemberAccessParams(params: URLSearchParams) {
    params.delete('login_token');
    params.delete('auth_token');
    params.delete('auth_email');
}

interface SessionSwitchGuardState {
    authEmail?: string;
    authToken?: string;
    currentUserEmail?: string;
    loginToken?: string;
}

export const MemberAreaWrapper = ({ forcedSlug }: { forcedSlug?: string }) => {
    const { slug: paramSlug } = useParams<{ slug: string }>();
    const slug = forcedSlug || paramSlug;
    const navigate = useNavigate();
    const { t } = useTranslation('member');
    const [memberArea, setMemberArea] = useState<MemberArea | null>(null);
    const [loading, setLoading] = useState(true);
    const [switchingSession, setSwitchingSession] = useState(false);
    const [sessionSwitchGuard, setSessionSwitchGuard] = useState<SessionSwitchGuardState | null>(null);
    const isDemoRuntime = getRuntimeMode() === 'demo';

    const resolveSessionAuthz = async (accessToken?: string | null) => {
        if (!accessToken) return null;

        try {
            const response = await fetch('/api/admin/session-authz', {
                headers: { Authorization: `Bearer ${accessToken}` },
            });

            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.warn('[Wrapper] Failed to resolve session authz:', error);
            return null;
        }
    };

    const resolveCurrentRole = async (userId?: string, accessToken?: string | null) => {
        const authz = await resolveSessionAuthz(accessToken);
        const authzRole = normalizeRole(authz?.role);
        if (authzRole) return authzRole;

        if (!userId) return '';

        const { data } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .maybeSingle();

        return normalizeRole(data?.role);
    };

    const authenticateWithLoginToken = async (loginToken: string) => {
        const params = new URLSearchParams(window.location.search);
        try {
            const res = await fetch('/api/system?action=auto-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: loginToken }),
            });

            if (res.ok) {
                const { access_token, refresh_token } = await res.json();
                if (access_token && refresh_token) {
                    const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
                    if (sessionError) {
                        throw sessionError;
                    }

                    console.log('[Wrapper] Server-side auto-login successful');
                    stripMemberAccessParams(params);
                    window.location.replace(buildCurrentUrl(params));
                    return true;
                }

                console.error('[Wrapper] Auto-login returned success without session tokens');
                return false;
            }

            const err = await res.json().catch(() => ({}));
            console.error('[Wrapper] Auto-login failed:', err);

            if (res.status === 401) {
                stripMemberAccessParams(params);
                window.history.replaceState({}, document.title, buildCurrentUrl(params));
            }
        } catch (error) {
            console.error('[Wrapper] Auto-login error:', error);
        }

        return false;
    };

    const authenticateWithLegacyToken = async (authToken: string, authEmail: string) => {
        const params = new URLSearchParams(window.location.search);
        try {
            const { data, error } = await supabase.auth.verifyOtp({
                token_hash: authToken,
                type: 'email' as any,
                email: authEmail,
            });

            if (error) throw error;
            if (!data?.session) throw new Error('Token verified but no session returned.');

            stripMemberAccessParams(params);
            window.location.replace(buildCurrentUrl(params));
            console.log('[Wrapper] Legacy auth successful');
            return true;
        } catch (error) {
            console.error('[Wrapper] Legacy auth failed:', error);
            return false;
        }
    };

    const continueWithMemberAccess = async (guard: SessionSwitchGuardState) => {
        setSwitchingSession(true);

        const succeeded = guard.loginToken
            ? await authenticateWithLoginToken(guard.loginToken)
            : guard.authToken && guard.authEmail
                ? await authenticateWithLegacyToken(guard.authToken, guard.authEmail)
                : false;

        if (!succeeded) {
            setSwitchingSession(false);
            setLoading(false);
        }
    };

    useEffect(() => {
        const loadMemberArea = async () => {
            console.log('[Wrapper] Loading Member Area for slug:', slug);

            const params = new URLSearchParams(window.location.search);
            const demoMemberTicket = params.get('demo_member_ticket');
            const loginToken = params.get('login_token');
            const authToken = params.get('auth_token');
            const authEmail = params.get('auth_email');

            if (isDemoRuntime && demoMemberTicket) {
                try {
                    const demoIdentity = await demoDataService.consumeMemberAccessTicket(demoMemberTicket);
                    if (!demoIdentity) {
                        console.warn('[Wrapper] Demo member ticket invalid or expired');
                    } else {
                        console.log('[Wrapper] Demo member session restored:', demoIdentity.user.id);
                    }
                } catch (ticketError) {
                    console.error('[Wrapper] Demo member ticket error:', ticketError);
                } finally {
                    params.delete('demo_member_ticket');
                    const cleanUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
                    window.history.replaceState({}, document.title, cleanUrl);
                }
            }

            const { data: currentSessionData } = await supabase.auth.getSession();
            const currentUser = currentSessionData.session?.user ?? null;
            const currentRole = await resolveCurrentRole(
                currentUser?.id,
                currentSessionData.session?.access_token,
            );
            const shouldWarnBeforeSessionSwitch = Boolean(currentUser?.id)
                && PRIVILEGED_ROLES.has(currentRole)
                && (Boolean(loginToken) || Boolean(authToken && authEmail));

            if (shouldWarnBeforeSessionSwitch) {
                setSessionSwitchGuard({
                    currentUserEmail: currentUser?.email || '',
                    loginToken: loginToken || undefined,
                    authToken: authToken || undefined,
                    authEmail: authEmail || undefined,
                });
                setLoading(false);
                return;
            }

            // NEW: Server-side auto-login (login_token from purchase emails)
            if (loginToken) {
                console.log('[Wrapper] Found login_token, authenticating via server...');
                const authenticated = await authenticateWithLoginToken(loginToken);
                if (authenticated) return;
            }
            // LEGACY FALLBACK: auth_token from older emails
            else if (authToken && authEmail) {
                console.log('[Wrapper] Found legacy auth_token, verifying...');
                const authenticated = await authenticateWithLegacyToken(authToken, authEmail);
                if (authenticated) return;
            }
            if (!slug) {
                setLoading(false);
                return;
            }
            try {
                const area = await storage.getMemberAreaBySlug(slug);
                console.log('[Wrapper] Found area:', area);
                if (area) {
                    setMemberArea(area);
                } else {
                    console.error('[Wrapper] Member Area not found for slug:', slug);
                    navigate('/app'); // Redirect if not found
                }
            } catch (error) {
                console.error('[Wrapper] Error loading member area:', error);
            } finally {
                setLoading(false);
            }
        };

        loadMemberArea();
    }, [isDemoRuntime, slug, navigate]);

    if (sessionSwitchGuard) {
        return (
            <div className="min-h-screen bg-[#0E1012] flex items-center justify-center px-6 py-10 text-white">
                <div className="w-full max-w-2xl rounded-2xl border border-amber-500/20 bg-[#14171A] p-8 shadow-2xl">
                    <div className="flex items-start gap-4">
                        <div className="mt-1 flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/10 text-amber-300">
                            <AlertTriangle className="h-6 w-6" />
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <p className="text-sm font-medium uppercase tracking-wide text-amber-300/90">
                                    {t('session_switch_guard.eyebrow', 'Sessao administrativa ativa')}
                                </p>
                                <h1 className="text-2xl font-semibold text-white">
                                    {t('session_switch_guard.title', 'Este link vai trocar sua sessao atual')}
                                </h1>
                                <p className="text-sm leading-6 text-gray-300">
                                    {t(
                                        'session_switch_guard.description',
                                        'Voce ja esta com uma conta administrativa aberta neste navegador. Se continuar, o acesso atual sera substituido pela conta do aluno deste link.',
                                    )}
                                </p>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-200">
                                <span className="block text-xs uppercase tracking-wide text-gray-400">
                                    {t('session_switch_guard.current_session_label', 'Sessao atual')}
                                </span>
                                <span className="mt-1 block font-medium text-white">
                                    {sessionSwitchGuard.currentUserEmail || t('session_switch_guard.current_session_fallback', 'Conta administrativa autenticada')}
                                </span>
                            </div>

                            <p className="text-sm leading-6 text-gray-400">
                                {t(
                                    'session_switch_guard.recommendation',
                                    'Para testar a experiencia do comprador sem sair do admin, abra esse link em uma janela anonima ou em outro navegador.',
                                )}
                            </p>

                            <div className="flex flex-wrap gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => void continueWithMemberAccess(sessionSwitchGuard)}
                                    disabled={switchingSession}
                                    className="inline-flex items-center justify-center rounded-lg bg-amber-500 px-5 py-3 text-sm font-medium text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                    {switchingSession
                                        ? t('session_switch_guard.switching', 'Entrando...')
                                        : t('session_switch_guard.continue', 'Continuar e trocar sessao')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => window.history.back()}
                                    disabled={switchingSession}
                                    className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                    {t('session_switch_guard.cancel', 'Voltar sem trocar')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0E1012] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-red-600" />
            </div>
        );
    }

    return (
        <MemberAreaLayout memberArea={memberArea}>
            <Outlet context={{ memberArea }} />
        </MemberAreaLayout>
    );
};

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, AlertTriangle } from 'lucide-react';
import { publicSupabase, supabase } from '../services/supabase';
import { Loading } from './ui/Loading';
import { isDemoHostname } from '../config/runtimeMode';

interface LicenseGuardProps {
    children: React.ReactNode;
}

import { useInstallation } from '../context/InstallationContext';

export const LicenseGuard: React.FC<LicenseGuardProps> = ({ children }) => {
    const { t } = useTranslation('common');
    const { setInstallationId } = useInstallation();
    const [isValid, setIsValid] = useState<boolean | null>(null);
    const [messageKey, setMessageKey] = useState<string | null>(null);
    const [messageText, setMessageText] = useState('');
    const [loading, setLoading] = useState(true);

    const setTranslatedMessage = (key: string | null, text = '') => {
        setMessageKey(key);
        setMessageText(text);
    };

    const resolvedMessage = (() => {
        if (messageKey === 'license_guard_validation_error') {
            return t('license_guard_validation_error', { message: messageText || t('config_loader_unknown_error') });
        }

        if (messageKey) {
            return t(messageKey);
        }

        return messageText;
    })();

    useEffect(() => {
        const validateLicense = async () => {
            const pathname = window.location.pathname;

            const publicBypassRoutes = [
                '/installer',
                '/activate',
                '/passport',
                '/demo',
                '/register',
                '/update-password',
                '/privacy-policy',
                '/terms-of-purchase',
                '/legal/privacy',
                '/legal/terms',
                '/preview/upsell',
                '/setup',
                ...(import.meta.env.DEV ? ['/debug-auth'] : []),
            ];

            const shouldBypassRoute = publicBypassRoutes.some((route) =>
                pathname === route || pathname.startsWith(`${route}/`)
            ) || pathname.startsWith('/c/')
                || pathname.startsWith('/pagamento/')
                || pathname.startsWith('/upsell/')
                || pathname.startsWith('/thank-you/');

            if (shouldBypassRoute || isDemoHostname(window.location.hostname)) {
                setIsValid(true);
                setLoading(false);
                return;
            }

            const currentDomain = window.location.hostname;
            console.log(`[LicenseGuard] Verifying access for: ${currentDomain}`);

            try {
                const supabaseUrl = (supabase as any).supabaseUrl || '';
                if (supabaseUrl.includes('placeholder')) {
                    console.warn('[LicenseGuard] App not configured (Placeholder URL). Redirecting to installer...');
                    window.location.href = '/installer';
                    return;
                }

                const { data: sessionData } = await supabase.auth.getSession();
                const expiresAt = sessionData.session?.expires_at;
                if (expiresAt && expiresAt * 1000 <= Date.now()) {
                    console.warn('[LicenseGuard] Expired Supabase session detected during bootstrap. Clearing stale auth state.');
                    await supabase.auth.signOut().catch((signOutError) => {
                        console.warn('[LicenseGuard] Failed to clear expired session during bootstrap:', signOutError);
                    });
                }

                const variations = [
                    currentDomain,
                    `https://${currentDomain}`,
                    `http://${currentDomain}`,
                    currentDomain.replace('www.', ''),
                    `www.${currentDomain}`
                ];

                const { data: domainData, error: domainError } = await publicSupabase
                    .from('domains')
                    .select('type, status, usage')
                    .in('domain', variations)
                    .maybeSingle();

                if (domainError) {
                    console.error('[LicenseGuard] DB verification failed:', domainError);

                    if (domainError.message.includes('Failed to fetch') || domainError.message.includes('Mismatched')) {
                        const localKey = localStorage.getItem('installer_supabase_url');
                        if (!localKey) {
                            console.warn('[LicenseGuard] Connection failed and no local config. potential fresh install. Redirecting...');
                            window.location.href = '/installer';
                            return;
                        }
                    }

                    const debugInfo = JSON.stringify(domainError, null, 2);
                    const errMsg = domainError?.message || domainError?.code || 'Unknown Error';
                    throw new Error(`Domain verification error (DB): ${errMsg} - ${debugInfo}`);
                }

                if (domainData && domainData.type !== 'installation') {
                    if (domainData.status === 'active' || domainData.status === 'verified') {
                        setIsValid(true);
                        setLoading(false);
                        return;
                    }

                    setIsValid(false);
                    setTranslatedMessage('dns_propagation_warn');
                    setLoading(false);
                    return;
                }

                let installationId = localStorage.getItem('installation_id');
                if (!installationId) {
                    const { data: configData } = await publicSupabase
                        .from('app_config')
                        .select('value')
                        .eq('key', 'installation_id')
                        .maybeSingle();

                    if (configData && configData.value) {
                        installationId = typeof configData.value === 'string'
                            ? configData.value.replace(/"/g, '')
                            : JSON.stringify(configData.value).replace(/"/g, '');

                        localStorage.setItem('installation_id', installationId);
                    } else {
                        installationId = crypto.randomUUID();
                        localStorage.setItem('installation_id', installationId);
                    }
                }

                const response = await fetch('/api/licenses/validate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        installation_id: installationId,
                        domain: currentDomain
                    }),
                });

                if (!response.ok) {
                    const text = await response.text();
                    console.error('License server error:', response.status, text);
                    if (currentDomain === 'localhost') {
                        setIsValid(true);
                        return;
                    }
                    throw new Error(`Server error: ${response.status} - ${text}`);
                }

                const data = await response.json();

                if (data?.valid) {
                    setIsValid(true);
                    if (data?.usage_type) localStorage.setItem('license_usage_type', data.usage_type);
                    if (data?.role) localStorage.setItem('license_role', data.role);
                    if (data?.installation_id) {
                        localStorage.setItem('installation_id', data.installation_id);
                        setInstallationId(data.installation_id);
                    }
                } else {
                    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                        console.warn('[LicenseGuard] LOCALHOST DETECTED: Bypassing invalid license check for development.');
                        setIsValid(true);
                        setLoading(false);
                        return;
                    }

                    setIsValid(false);
                    if (data?.message === 'Missing key or domain') {
                        setTranslatedMessage('license_guard_missing_license');
                    } else if (data?.message) {
                        setTranslatedMessage(null, String(data.message));
                    } else {
                        setTranslatedMessage('license_guard_invalid_license');
                    }

                    if (data?.message?.includes('revoked')) {
                        localStorage.removeItem('license_role');
                    }
                }
            } catch (error: any) {
                console.error('License validation exception:', error);

                if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                    setIsValid(true);
                    setTranslatedMessage('license_guard_dev_unknown_error');
                } else {
                    setIsValid(false);
                    setTranslatedMessage('license_guard_validation_error', error?.message || '');
                }
            } finally {
                setLoading(false);
            }
        };

        void validateLicense();
    }, [setInstallationId]);

    if (loading) {
        return <Loading label={t('license_guard_validating')} />;
    }

    if (isValid === false) {
        return (
            <div className="min-h-screen bg-[#0F0F13] flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-black/40 border border-red-500/20 rounded-2xl p-8 text-center backdrop-blur-xl">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500">
                        <Lock className="w-8 h-8" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">{t('license_guard_access_blocked')}</h1>
                    <p className="text-gray-400 mb-6">{resolvedMessage}</p>

                    <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-4 text-left mb-6">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                            <div className="text-sm text-gray-300">
                                <p className="font-bold text-red-400 mb-1">{t('license_guard_reason')}</p>
                                <p>{resolvedMessage}</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        <button
                            onClick={() => window.location.reload()}
                            className="w-full py-3 bg-primary hover:bg-primary-dark text-white rounded-xl transition-colors font-medium shadow-lg shadow-primary/20"
                        >
                            {t('license_guard_try_again')}
                        </button>

                        <button
                            onClick={() => {
                                if (confirm(t('license_guard_reset_confirm'))) {
                                    localStorage.removeItem('installer_license_key');
                                    localStorage.removeItem('installer_supabase_url');
                                    localStorage.removeItem('installer_supabase_anon_key');
                                    localStorage.removeItem('installer_supabase_service_key');
                                    localStorage.removeItem('installation_id');
                                    window.location.href = '/installer';
                                }
                            }}
                            className="w-full py-3 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-xl transition-colors font-medium text-sm"
                        >
                            {t('license_guard_reset_installation')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return <>{children}</>;
};

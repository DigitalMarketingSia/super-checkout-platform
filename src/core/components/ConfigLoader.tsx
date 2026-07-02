import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, AlertCircle, RefreshCw, Key } from 'lucide-react';
import { getEnv } from '../utils/env';

interface ConfigLoaderProps {
    onConfigLoaded: () => void;
}

export const ConfigLoader: React.FC<ConfigLoaderProps> = ({ onConfigLoaded }) => {
    const { t } = useTranslation('common');
    const [status, setStatus] = useState<'checking' | 'found' | 'error'>('checking');
    const [errorMsg, setErrorMsg] = useState('');
    const [manualLicense, setManualLicense] = useState('');
    const [showRecovery, setShowRecovery] = useState(false);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const envUrl = getEnv('VITE_SUPABASE_URL');
                const envAnon = getEnv('VITE_SUPABASE_ANON_KEY');
                const envLicense = getEnv('VITE_LICENSE_KEY');
                const shouldRefreshLegacyAnon = !!envAnon
                    && envAnon.startsWith('eyJ')
                    && window.location.hostname !== 'localhost'
                    && window.location.hostname !== '127.0.0.1';
                const legacyAnonRefreshAttempted = sessionStorage.getItem('config_legacy_anon_refresh_attempted') === 'true';

                if (envUrl && envAnon && (!shouldRefreshLegacyAnon || legacyAnonRefreshAttempted)) {
                    if (envLicense) {
                        if (!shouldRefreshLegacyAnon) {
                            sessionStorage.removeItem('config_legacy_anon_refresh_attempted');
                        }
                        setStatus('found');
                        return;
                    }

                    console.warn('[ConfigLoader] Missing License Key in Env. Enabling Manual Recovery.');
                    setShowRecovery(true);
                    setStatus('error');
                    setErrorMsg('');
                    return;
                }

                if (shouldRefreshLegacyAnon) {
                    console.warn('[ConfigLoader] Legacy Supabase anon key detected. Fetching runtime publishable key...');
                }

                console.log('[ConfigLoader] Fetching remote configuration...');
                const res = await fetch('/api/config');

                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({}));
                    throw new Error(errorData.message || errorData.error || `Server returned ${res.status}`);
                }

                const data = await res.json();

                if (!data.url || !data.anon) {
                    throw new Error('Invalid config response');
                }

                const serverReturnedLegacyAnon = typeof data.anon === 'string' && data.anon.startsWith('eyJ');
                localStorage.setItem('installer_supabase_url', data.url);
                localStorage.setItem('installer_supabase_anon_key', data.anon);

                if (data.license) {
                    localStorage.setItem('installer_license_key', data.license);
                    if (serverReturnedLegacyAnon) {
                        sessionStorage.setItem('config_legacy_anon_refresh_attempted', 'true');
                    } else {
                        sessionStorage.removeItem('config_legacy_anon_refresh_attempted');
                    }
                    console.log('[ConfigLoader] Config secured. Reloading...');
                    window.location.reload();
                    return;
                }

                console.warn('[ConfigLoader] Missing License Key from Server. Enabling Manual Recovery.');
                setShowRecovery(true);
                setStatus('error');
                setErrorMsg('');
            } catch (err: any) {
                console.error('[ConfigLoader] Failed to fetch config:', err);
                setStatus('error');
                setErrorMsg(err?.message || '');
            }
        };

        void fetchConfig();
    }, [onConfigLoaded]);

    const handleManualRecovery = () => {
        if (!manualLicense.trim()) return;
        localStorage.setItem('installer_license_key', manualLicense.trim());
        window.location.reload();
    };

    if (status === 'error') {
        const isRecoveryMode = showRecovery;

        return (
            <div className="fixed inset-0 bg-[#09090B] flex items-center justify-center p-4 z-[9999]">
                <div className="max-w-md w-full bg-[#18181B] border border-red-500/20 rounded-2xl p-8 text-center">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500">
                        {isRecoveryMode ? <Key className="w-8 h-8" /> : <AlertCircle className="w-8 h-8" />}
                    </div>

                    <h1 className="text-2xl font-bold text-white mb-2">
                        {isRecoveryMode ? t('config_loader_recovery_title') : t('config_loader_error_title')}
                    </h1>

                    <p className="text-gray-400 mb-6">
                        {isRecoveryMode
                            ? t('config_loader_recovery_description')
                            : t('config_loader_error_description')}
                    </p>

                    {isRecoveryMode ? (
                        <div className="mb-6 text-left">
                            <label className="text-xs text-gray-500 uppercase font-bold mb-2 block">{t('config_loader_license_label')}</label>
                            <input
                                type="text"
                                value={manualLicense}
                                onChange={(e) => setManualLicense(e.target.value)}
                                placeholder={t('config_loader_license_placeholder')}
                                className="w-full bg-black/40 border border-gray-800 rounded-lg p-3 text-white focus:border-red-500 outline-none font-mono text-sm"
                            />
                            <p className="text-xs text-gray-600 mt-2">
                                {t('config_loader_license_help')}
                            </p>
                        </div>
                    ) : (
                        <div className="bg-black/40 rounded-lg p-4 mb-6 font-mono text-xs text-red-400 text-left overflow-auto">
                            {errorMsg || t('config_loader_unknown_error')}
                        </div>
                    )}

                    {isRecoveryMode ? (
                        <button
                            onClick={handleManualRecovery}
                            disabled={!manualLicense}
                            className="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <RefreshCw className="w-4 h-4" /> {t('config_loader_save_and_enter')}
                        </button>
                    ) : (
                        <button
                            onClick={() => window.location.reload()}
                            className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                        >
                            <RefreshCw className="w-4 h-4" /> {t('config_loader_try_again')}
                        </button>
                    )}

                    <div className="mt-4">
                        <a href="/installer" className="text-xs text-gray-500 hover:text-white underline">
                            {t('config_loader_go_to_installer')}
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    if (status === 'found') {
        return null;
    }

    return (
        <div className="fixed inset-0 bg-[#09090B] flex items-center justify-center z-50">
            <div className="text-center">
                <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
                <h2 className="text-xl font-bold text-white mb-2">{t('config_loader_connecting')}</h2>
                <p className="text-gray-400 text-sm">{t('config_loader_fetching_server_config')}</p>
            </div>
        </div>
    );
};

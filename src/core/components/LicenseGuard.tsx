import React, { useEffect, useState } from 'react';
import { Lock, AlertTriangle } from 'lucide-react';
import { supabase } from '../services/supabase';
import { getEnv } from '../utils/env';

interface LicenseGuardProps {
    children: React.ReactNode;
}

import { useInstallation } from '../context/InstallationContext';

export const LicenseGuard: React.FC<LicenseGuardProps> = ({ children }) => {
    const { setInstallationId } = useInstallation();
    const [isValid, setIsValid] = useState<boolean | null>(null);
    const [message, setMessage] = useState<string>('');
    const [loading, setLoading] = useState(true);

    // Configuration
    // CRITICAL FIX: Prioritize localStorage key saved by Installer, fallback to Env Var
    const LOCAL_KEY = typeof window !== 'undefined' ? localStorage.getItem('installer_license_key') : null;
    const LICENSE_KEY = LOCAL_KEY || import.meta.env.VITE_LICENSE_KEY;

    // EMERGENCY BYPASS - SOU DONO
    // Uses Environment Variable for security instead of hardcoded string
    const MASTER_KEY = import.meta.env.VITE_MASTER_LICENSE_KEY;

    if (MASTER_KEY && LICENSE_KEY === MASTER_KEY) {
        useEffect(() => {
            console.log('🔓 MASTER KEY DETECTED (ENV) - BYPASSING ALL CHECKS');
            // Do NOT force 'owner' role. Let the actual profile role determine limits.
            setIsValid(true);
            setLoading(false);
        }, []);
    }

    useEffect(() => {
        const validateLicense = async () => {
            const pathname = window.location.pathname;

            // Public routes must stay accessible even when the runtime is not configured yet.
            const publicBypassRoutes = [
                '/installer',
                '/activate',
                '/register',
                '/update-password',
                '/privacy-policy',
                '/terms-of-purchase',
                '/legal/privacy',
                '/legal/terms',
                '/setup',
                '/debug-auth',
            ];

            const shouldBypassRoute = publicBypassRoutes.some((route) =>
                pathname === route || pathname.startsWith(`${route}/`)
            ) || pathname.startsWith('/c/')
                || pathname.startsWith('/pagamento/')
                || pathname.startsWith('/upsell/')
                || pathname.startsWith('/thank-you/');

            // BYPASS FOR PUBLIC/INSTALLER ROUTES: never lock auth, installer, or checkout entry points
            if (shouldBypassRoute) {
                setIsValid(true);
                setLoading(false);
                return;
            }


            const CURRENT_DOMAIN = window.location.hostname;
            console.log(`[LicenseGuard] Verifying access for: ${CURRENT_DOMAIN}`);

            try {
                // 0. CHECK CONFIGURATION: If using placeholders or missing key, we are not installed yet.
                // We should redirect to installer instead of trying to fetch and failing.
                // NOTE: 'placeholder.supabase.co' is defined in services/supabase.ts as fallback.
                const supabaseUrl = (supabase as any).supabaseUrl || '';
                if (supabaseUrl.includes('placeholder') || !LICENSE_KEY) {
                    console.warn('[LicenseGuard] App not configured (Placeholder URL or Missing Key). Redirecting to installer...');
                    window.location.href = '/installer';
                    return;
                }

                // 1. SECURITY: Query domains table (Source of Truth)
                const variations = [
                    CURRENT_DOMAIN,
                    `https://${CURRENT_DOMAIN}`,
                    `http://${CURRENT_DOMAIN}`,
                    CURRENT_DOMAIN.replace('www.', ''),
                    `www.${CURRENT_DOMAIN}`
                ];

                const { data: domainData, error: domainError } = await supabase
                    .from('domains')
                    .select('type, status, usage')
                    .in('domain', variations)
                    .maybeSingle();
                if (domainError) {
                    console.error('[LicenseGuard] DB verification failed:', domainError);

                    // Force redirect if connection failed completely (likely invalid URL/Key)
                    // and we are clearly in a fresh state (no localStorage cache)
                    if (domainError.message.includes('Failed to fetch') || domainError.message.includes('Mismatched')) {
                        const localKey = localStorage.getItem('installer_supabase_url');
                        if (!localKey) {
                            console.warn('[LicenseGuard] Connection failed and no local config. potential fresh install. Redirecting...');
                            window.location.href = '/installer';
                            return;
                        }
                    }

                    // Detailed Error for Debugging
                    const debugInfo = JSON.stringify(domainError, null, 2);
                    const errMsg = domainError?.message || domainError?.code || 'Unknown Error';
                    throw new Error(`Erro ao verificar domínio (DB): ${errMsg} - ${debugInfo}`);
                }

                // 2. DECISION LOGIC
                if (domainData) {
                    console.log(`[LicenseGuard] 🔍 Domain Found: Type=${domainData.type}, Status=${domainData.status}`);

                    // 3. ALLOW CUSTOM DOMAINS (Registered & Active)
                    if (domainData.type !== 'installation') {
                        if (domainData.status === 'active' || domainData.status === 'verified') {
                            console.log('[LicenseGuard] ✅ ALLOW: Custom domain is active.');
                            setIsValid(true);
                            setLoading(false);
                            return;
                        } else {
                            console.warn('[LicenseGuard] ⚠️ BLOCK: Custom domain found but not active.');
                            setIsValid(false);
                            setMessage('Domínio pendente de verificação.');
                            setLoading(false);
                            return;
                        }
                    }
                } else {
                    console.warn(`[LicenseGuard] ⚠️ Domain '${CURRENT_DOMAIN}' not found in DB. Attempting remote validation as fallback...`);
                }

                // 4. VALIDATE LICENSE FOR INSTALLATION DOMAIN
                console.log('[LicenseGuard] 🔒 Installation Domain detected. Proceeding to license validation...');

                // Get Installation ID from DB (The Anchor)
                let installationId = localStorage.getItem('installation_id');
                if (!installationId) {
                    const { data: configData } = await supabase
                        .from('app_config')
                        .select('value')
                        .eq('key', 'installation_id')
                        .maybeSingle();

                    if (configData && configData.value) {
                        installationId = typeof configData.value === 'string'
                            ? configData.value.replace(/"/g, '') // Remove extra quotes if JSON stringified
                            : JSON.stringify(configData.value).replace(/"/g, '');

                        localStorage.setItem('installation_id', installationId); // Cache it
                    } else {
                        // FALLBACK: If DB is empty (rare), generate one locally to allow binding
                        console.warn('[LicenseGuard] ⚠️ No installation_id in DB. Generating fallback...');
                        installationId = crypto.randomUUID();
                        localStorage.setItem('installation_id', installationId);
                    }
                }

                const AUTH_SERVER_URL = '/api/licenses/validate';

                const requestBody = {
                    key: LICENSE_KEY,
                    domain: CURRENT_DOMAIN,
                    skip_lock: true // Let the API handle locking if needed, but LicenseGuard is primarily for access check
                };
                console.log('[LicenseGuard] Validation Request:', requestBody);

                const response = await fetch(AUTH_SERVER_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                });

                if (!response.ok) {
                    const text = await response.text();
                    console.error('License server error:', response.status, text);
                    if (CURRENT_DOMAIN === 'localhost') {
                        setIsValid(true); // Dev fallback
                        return;
                    }
                    throw new Error(`Server error: ${response.status} - ${text}`);
                }

                const data = await response.json();
                console.log('[LicenseGuard] Server Response:', data);

                if (data?.valid) {
                    console.log('[LicenseGuard] ✅ License VALID');
                    setIsValid(true);
                    if (data?.usage_type) localStorage.setItem('license_usage_type', data.usage_type);
                    if (data?.role) localStorage.setItem('license_role', data.role);
                    // SYNC: Ensure local storage matches the server's truth (app_config)
                    if (data?.installation_id) {
                        localStorage.setItem('installation_id', data.installation_id);
                        setInstallationId(data.installation_id); // Update Authority
                    }
                } else {
                    console.log('[LicenseGuard] ❌ License INVALID');
                    
                    // DEV BYPASS: If on localhost, we allow access even if center says invalid
                    // (prevents lockouts during dev when center is strict about domain binding)
                    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                        console.warn('[LicenseGuard] 🔓 LOCALHOST DETECTED: Bypassing invalid license check for development.');
                        setIsValid(true);
                        setLoading(false);
                        return;
                    }

                    setIsValid(false);
                    setMessage(data?.message || 'Licença inválida.');

                    // If revoked, clear critical data to prevent loop but allowing installer to run if needed
                    if (data?.message?.includes('revoked')) {
                        localStorage.removeItem('license_role');
                        // Optional: Clear tokens if we want to force re-login/re-install? 
                        // For now, blocking access is enough.
                    }
                }

            } catch (error: any) {
                console.error('License validation exception:', error);

                // Dev fallback
                if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                    setIsValid(true);
                    setMessage('Modo Dev (Erro desconhecido)');
                } else {
                    setIsValid(false);
                    setMessage(`Erro de validação: ${error.message}`);
                }
            } finally {
                setLoading(false);
            }
        };

        validateLicense();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0F0F13] flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    if (isValid === false) {
        return (
            <div className="min-h-screen bg-[#0F0F13] flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-black/40 border border-red-500/20 rounded-2xl p-8 text-center backdrop-blur-xl">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500">
                        <Lock className="w-8 h-8" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Acesso Bloqueado</h1>
                    <p className="text-gray-400 mb-6">
                        {message === 'Missing key or domain'
                            ? 'Esta instalação não possui uma licença configurada.'
                            : message}
                    </p>

                    <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-4 text-left mb-6">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                            <div className="text-sm text-gray-300">
                                <p className="font-bold text-red-400 mb-1">Motivo:</p>
                                <p>{message}</p>
                                {LICENSE_KEY && (
                                    <p className="mt-2 text-xs text-gray-500 font-mono">Key: {LICENSE_KEY.substring(0, 8)}...</p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        <button
                            onClick={() => window.location.reload()}
                            className="w-full py-3 bg-primary hover:bg-primary-dark text-white rounded-xl transition-colors font-medium shadow-lg shadow-primary/20"
                        >
                            Tentar Novamente
                        </button>

                        <button
                            onClick={() => {
                                if (confirm('Isso irá limpar as configurações locais. Deseja continuar?')) {
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
                            Resetar Instalação (Limpar Dados)
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return <>{children}</>;
};

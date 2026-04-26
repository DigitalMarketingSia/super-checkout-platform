
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
// Checked validation logic
import { Check, ChevronRight, Database, Key, Server, AlertCircle, ExternalLink, Github, Globe, Copy, Info, X, ShieldCheck, ShieldAlert, Mail, Settings, Loader2, Sparkles, ArrowRight } from 'lucide-react';
import { AlertModal } from '../../components/ui/Modal';
import { CENTRAL_CONFIG } from '../../config/central';
import { supabase } from '../../services/supabase';
import { UpsellModal } from '../../components/ui/UpsellModal';

import SQL_SCHEMA from '../../../schemas/canonical_schema.sql?raw';


// Define the steps for the guided flow
type Step = 'license' | 'supabase' | 'supabase_migrations' | 'supabase_keys' | 'deploy' | 'success' | 'check_subscription' | 'supabase_setup' | 'vercel_config';

export default function InstallerWizard() {
    const { t } = useTranslation(['installer', 'common']);
    const [currentStep, setCurrentStep] = useState<Step>('check_subscription');
    const [logs, setLogs] = useState<string[]>([]);
    const [licenseKey, setLicenseKey] = useState('');
    const [organizationSlug, setOrganizationSlug] = useState('');

    // New States
    const [email, setEmail] = useState('');
    const [installationId, setInstallationId] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Supabase config

    const [supabaseUrl, setSupabaseUrl] = useState('');
    const [anonKey, setAnonKey] = useState('');
    const [serviceKey, setServiceKey] = useState('');

    // Vercel config
    const [vercelDomain, setVercelDomain] = useState('');
    const [vercelToken, setVercelToken] = useState('');
    const [vercelProjectId, setVercelProjectId] = useState('');
    const [vercelTeamId, setVercelTeamId] = useState('');

    const [showSqlModal, setShowSqlModal] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '', variant: 'success' as const });

    // UI States
    const [isConnectingSupabase, setIsConnectingSupabase] = useState(false);

    const [successAnim, setSuccessAnim] = useState<{ show: boolean; msg: string }>({ show: false, msg: '' });
    const [upsellSlug, setUpsellSlug] = useState<'unlimited_domains' | 'partner_rights' | 'whitelabel' | null>(null);

    // --- SAAS SECURITY HARDENING (TOKEN CHECK) ---
    const [installToken, setInstallToken] = useState<string | null>(null);
    const [accessDenied, setAccessDenied] = useState(false);
    const [accessError, setAccessError] = useState<string>('ERR_MISSING_TOKEN');
    const [isValidatingToken, setIsValidatingToken] = useState(true);

    useEffect(() => {
        const validateInstallationToken = async () => {
            const params = new URLSearchParams(window.location.search);
            let token = params.get('token');
            const devBypass = params.get('bypass') === 'true'; // TEMPORARY DEV BACKDOOR
            const savedToken = localStorage.getItem('install_token');
            const isFreshTokenFromUrl = !!token && token !== savedToken;

            // Tenta recuperar do localStorage se não estiver na URL (para voltar do OAuth)
            if (!token) {
                if (savedToken) {
                    token = savedToken;
                    // Opcional: recolocar na URL visualmente
                    // window.history.replaceState({}, '', `/installer?token=${token}`);
                }
            }

            if (!token && !devBypass) {
                // No token? Block immediately.
                setAccessDenied(true);
                setIsValidatingToken(false);
                return;
            }



            // ... inside component ...

            if (devBypass) {
                // SECURITY: Only allow bypass if user is authenticated as Admin
                // This allows existing owners to "Update/Repair" their installation
                // without needing a token (which they can't generate if installation is broken).
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (!session) {
                    throw new Error(t('errors.token_required'));
                    }
                    // Optional: Check if role is admin/owner via profile? 
                    // For now, any active session on the Admin Panel domain is trusted enough for "Updates".

                    addLog('🔓 Authenticated Upgrade Mode Active');
                    setIsValidatingToken(false);
                    return;
                } catch (e) {
                    console.error('Bypass Auth Failed', e);
                    setAccessDenied(true);
                    setAccessError(t('errors.bypass_auth_failed'));
                    return;
                }
            }

            try {
                // Validate token via dedicated validate-token endpoint
                const centralAnonKey = import.meta.env.VITE_CENTRAL_SUPABASE_ANON_KEY;
                const response = await fetch(`${CENTRAL_CONFIG.API_URL}${CENTRAL_CONFIG.ENDPOINTS.VALIDATE_TOKEN}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': centralAnonKey,
                        'Authorization': `Bearer ${centralAnonKey}`
                    },
                    body: JSON.stringify({
                        token
                    })
                });

                if (!response.ok) {
                    throw new Error(t('errors.invalid_token'));
                }

                const data = await response.json();

                if (!data.valid) {
                    throw new Error(data.message || t('errors.invalid_token'));
                }

                if (isFreshTokenFromUrl) {
                    const freshInstallId = crypto.randomUUID();
                    [
                        'super_checkout_install_id',
                        'installation_id',
                        'installer_step',
                        'installer_supabase_url',
                        'installer_supabase_anon_key',
                        'installer_supabase_service_key',
                        'installer_vercel_domain',
                        'installation_domain',
                        'installer_owner_id',
                    ].forEach((key) => localStorage.removeItem(key));

                    localStorage.setItem('super_checkout_install_id', freshInstallId);
                    localStorage.setItem('installation_id', freshInstallId);
                    setInstallationId(freshInstallId);
                    setCurrentStep('check_subscription');
                }

                if (data.license?.key) {
                    setLicenseKey(data.license.key);
                    localStorage.setItem('installer_license_key', data.license.key);
                }

                setInstallToken(token);
                if (token) localStorage.setItem('install_token', token); // Persist Token

                // Opcional: Salvar dados da licença retornados no state se quiser exibir "Bem vindo, Cliente X"
                setIsValidatingToken(false);

            } catch (err: any) {
                console.error('Token validation failed', err);
                setAccessError(err.message || t('errors.invalid_token'));
                setAccessDenied(true);
                setIsValidatingToken(false);
            }
        };

        validateInstallationToken();
    }, []);

    // Initialize Installation ID
    useEffect(() => {
        let id = localStorage.getItem('super_checkout_install_id');
        if (!id) {
            id = self.crypto.randomUUID();
            localStorage.setItem('super_checkout_install_id', id);
        }
        setInstallationId(id);
    }, []);

    const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg} `]);

    const showAlert = (title: string, message: string, variant: 'success' | 'error' = 'success') => {
        setAlertModal({ isOpen: true, title, message, variant });
    };

    const copyToClipboard = (text: string, id?: string) => {
        navigator.clipboard.writeText(text);
        if (id) {
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        } else {
            setCopiedId('generic');
            setTimeout(() => setCopiedId(null), 2000);
        }
    };

    const runSuccessAnim = (msg: string, callback: () => void) => {
        setSuccessAnim({ show: true, msg });
        setTimeout(() => {
            setSuccessAnim({ show: false, msg: '' });
            callback();
        }, 2000);
    };

    // --- LOGIC: License ---
    const handleLicenseSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        // Use licenseKey for validation
        const checkValue = licenseKey;

        // MASTER KEY BYPASS (Backdoor for Owner)
        if (checkValue === '03592c87-4b69-4381-9b3d-38b01d678c4c') {
            addLog('🔑 Master Key Recognized - Bypassing Validation');
            setTimeout(() => {
                setLoading(false);
                runSuccessAnim('Bem-vindo, Jean!', () => {
                    setCurrentStep('supabase_setup');
                    localStorage.setItem('installer_license_key', checkValue);
                });
            }, 1000);
            return;
        }

        try {
            const centralAnonKey = import.meta.env.VITE_CENTRAL_SUPABASE_ANON_KEY;
            // Updated to use validate-license endpoint
            const response = await fetch(`${CENTRAL_CONFIG.API_URL}/validate-license`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': centralAnonKey,
                    'Authorization': `Bearer ${centralAnonKey}`
                },
                body: JSON.stringify({
                    license_key: checkValue,
                    installation_id: installationId,
                    current_domain: window.location.hostname,
                    activate: true // Register this installation ID with the license
                })
            });

            if (!response.ok) {
                const status = response.status;
                let errorMsg = `${t('common:error')} (${status})`;
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.message || errorMsg;
                } catch (e) {
                    console.error('Non-JSON response:', e);
                }
                throw new Error(errorMsg);
            }

            const data = await response.json();

            if (data.valid) {
                addLog(t('keys.success_msg'));
                setTimeout(() => {
                    setLoading(false);
                    runSuccessAnim(t('license.validated_msg'), () => {
                        setCurrentStep('supabase_setup');
                        if (currentStep === 'license') {
                            localStorage.setItem('installer_license_key', licenseKey);
                            if (data.usage_type) {
                                localStorage.setItem('license_usage_type', data.usage_type);
                            }
                        }
                    });
                }, 500);
            } else {
                throw new Error(data.message || t('errors.invalid_license'));
            }

        } catch (error: any) {
            console.error(error);
            addLog(`Erro: ${error.message} `);
            showAlert('Erro de Licença', error.message, 'error');
            setLoading(false);
        }
    };



    // --- LOGIC: Supabase Setup ---


    // --- LOGIC: Supabase Manual ---
    const handleSupabaseManualSubmit = () => {
        if (!supabaseUrl) return setError(t('errors.url_required'));
        setCurrentStep('supabase_migrations');
    };



    const handleKeysSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        if (!anonKey || !serviceKey) {
            showAlert(t('common:error'), t('errors.keys_required'), 'error');
            setLoading(false);
            return;
        }

        // Simulate processing for better UX
        setTimeout(() => {
            localStorage.setItem('installer_supabase_anon_key', anonKey);
            localStorage.setItem('installer_supabase_service_key', serviceKey);

            addLog(t('keys.success_msg'));
            setLoading(false);

            runSuccessAnim(t('keys.configured_msg'), () => {
                setCurrentStep('deploy'); // Go to Deploy Step
            });
        }, 1500);
    };

    // --- LOGIC: Deploy (Final Activation) ---
    const handleDeploySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!vercelDomain) {
            showAlert(t('common:error'), t('errors.domain_required'), 'error');
            return;
        }

        let cleanDomain = vercelDomain.replace('https://', '').replace('http://', '').split('/')[0];
        // Remove trailing slashes
        if (cleanDomain.endsWith('/')) cleanDomain = cleanDomain.slice(0, -1);

        setLoading(true);

        try {
            // Final Activation: Lock to Vercel Domain
            const centralAnonKey = import.meta.env.VITE_CENTRAL_SUPABASE_ANON_KEY;
            const response = await fetch(`${CENTRAL_CONFIG.API_URL}/validate-license`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': centralAnonKey,
                    'Authorization': `Bearer ${centralAnonKey}`
                },
                body: JSON.stringify({
                    license_key: licenseKey,
                    installation_id: installationId,
                    current_domain: cleanDomain,
                    activate: true // This triggers domain update in validate-license if changed
                })
            });

            if (!response.ok) throw new Error('Falha ao ativar licença no domínio final.');
            const data = await response.json();
            if (!data.valid) throw new Error(data.message || 'Licença inválida para este domínio.');

            localStorage.setItem('installer_vercel_domain', cleanDomain);
            runSuccessAnim('Domínio Ativado!', () => {
                setCurrentStep('success');
            });

        } catch (error: any) {
            console.error(error);
            showAlert('Erro de Ativação', error.message, 'error');
        } finally {
            setLoading(false);
        }
    }

    // --- EFFECTS ---
    useEffect(() => {
        if (licenseKey) localStorage.setItem('installer_license_key', licenseKey);
        if (organizationSlug) localStorage.setItem('installer_org_slug', organizationSlug);
        if (currentStep) localStorage.setItem('installer_step', currentStep);
    }, [licenseKey, organizationSlug, currentStep]);

    useEffect(() => {
        const savedKey = localStorage.getItem('installer_license_key');
        if (savedKey) setLicenseKey(savedKey);

        // Restore keys if available
        setAnonKey(localStorage.getItem('installer_supabase_anon_key') || '');
        setServiceKey(localStorage.getItem('installer_supabase_service_key') || '');
        setSupabaseUrl(localStorage.getItem('installer_supabase_url') || '');

        const savedStep = localStorage.getItem('installer_step') as Step;
        if (savedStep && savedStep !== 'success') {
            if (savedStep === 'license') {
                setCurrentStep('check_subscription');
            } else {
                setCurrentStep(savedStep);
            }
        }


    }, []);

    // Helper to get step number
    const getStepStatus = (step: Step, position: number) => {
        // Updated flow: license -> supabase -> deploy -> success
        const stepsOrder = ['license', 'supabase', 'deploy', 'success'];
        const currentIndex = stepsOrder.indexOf(currentStep === 'supabase_migrations' || currentStep === 'supabase_keys' ? 'supabase' : currentStep);
        if (currentIndex > position) return 'completed';
        if (currentIndex === position) return 'active';
        return 'pending';
    };

    const deployUrl = `https://vercel.com/new/clone?repository-url=https://github.com/DigitalMarketingSia/super-checkout-platform&env=VITE_SUPABASE_URL,VITE_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,VITE_LICENSE_KEY,VITE_CENTRAL_API_URL,VITE_CENTRAL_SUPABASE_ANON_KEY&envDescription=Configuracao%20Super%20Checkout&project-name=super-checkout&repository-name=super-checkout`;

    // Navigation Helper
    const stepsOrder = ['check_subscription', 'supabase_setup', 'supabase_migrations', 'supabase_keys', 'deploy', 'vercel_config', 'success'];
    const currentStepIndex = stepsOrder.indexOf(currentStep);

    const goBack = () => {
        if (currentStepIndex > 0) {
            setCurrentStep(stepsOrder[currentStepIndex - 1] as any);
        }
    };

    const goNext = () => {
        if (currentStepIndex < stepsOrder.length - 1) {
            setCurrentStep(stepsOrder[currentStepIndex + 1] as any);
        }
    };


    if (isValidatingToken) {
        return (
            <div className="min-h-screen bg-[#05050A] flex flex-col items-center justify-center text-white font-sans">
                <Loader2 className="w-10 h-10 text-[#3ECF8E] animate-spin mb-4" />
                <p className="text-gray-400 animate-pulse">{t('verifying_permission')}</p>
            </div>
        );
    }

    if (accessDenied) {
        return (
            <div className="min-h-screen bg-[#0F0F13] flex items-center justify-center p-4 font-sans text-gray-300">
                <div className="max-w-md w-full bg-[#1A1A23] border border-red-500/20 rounded-2xl p-8 text-center shadow-2xl">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <ShieldAlert className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">{t('access_denied')}</h1>
                    <p className="text-gray-400 mb-6 text-sm">
                        {t('access_denied_desc')}
                    </p>
                    <div className="p-4 bg-red-500/5 rounded-xl border border-red-500/10">
                        <p className="text-xs text-red-400 font-mono">{accessError}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (

        <div className="min-h-screen bg-[#05050A] text-white selection:bg-primary/30 font-sans relative overflow-hidden">
            {/* Background Effects */}
            <div className="fixed top-0 left-0 w-[500px] h-[500px] bg-[#3ECF8E]/10 rounded-full blur-[128px] pointer-events-none -translate-x-1/2 -translate-y-1/2 mix-blend-screen" />
            <div className="fixed bottom-0 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[128px] pointer-events-none translate-x-1/2 translate-y-1/2 mix-blend-screen" />

            {/* --- SUCCESS ANIMATION OVERLAY --- */}
            {successAnim.show && (
                <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="relative">
                        <div className="w-24 h-24 bg-[#3ECF8E] rounded-full flex items-center justify-center mb-6 shadow-[0_0_50px_rgba(62,207,142,0.5)] animate-in zoom-in-50 duration-500">
                            <Check className="w-12 h-12 text-black animate-in spin-in-90 duration-700" strokeWidth={3} />
                        </div>
                        <div className="absolute inset-0 rounded-full border-2 border-[#3ECF8E] animate-ping opacity-20"></div>
                    </div>
                    <h2 className="text-3xl font-bold text-white animate-in slide-in-from-bottom-5 duration-500">{successAnim.msg}</h2>
                </div>
            )}

            {/* --- CONNECTING SUPABASE OVERLAY --- */}
            {isConnectingSupabase && (
                <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-[#05050A] animate-in fade-in">
                    <div className="w-20 h-20 border-4 border-[#3ECF8E]/30 border-t-[#3ECF8E] rounded-full animate-spin mb-8 shadow-[0_0_30px_rgba(62,207,142,0.2)]"></div>
                    <h2 className="text-2xl font-bold text-white mb-2">{t('database.connecting')}</h2>
                    <p className="text-gray-400">{t('database.connecting_desc')}</p>
                </div>
            )}


            <div className="container mx-auto px-4 py-12 relative z-10 max-w-4xl">
                {/* Header */}
                <div className="text-center mb-16">
                    <div className="inline-flex items-center justify-center p-3 mb-6 rounded-2xl bg-white/5 border border-white/10 shadow-2xl backdrop-blur-sm">
                        <img src="/logo.png" alt="Logo" className="w-12 h-12 object-contain" onError={(e) => e.currentTarget.src = 'https://via.placeholder.com/48'} />
                    </div>
                    <h1 className="text-5xl font-extrabold tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-200 to-gray-400">
                        {t('title')}
                    </h1>
                    <p className="text-xl text-gray-400 max-w-2xl mx-auto">
                        {t('subtitle')}
                    </p>
                </div>

                {/* Progress Bar */}
                <div className="max-w-xl mx-auto mb-16 relative">
                    <div className="h-1 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm">
                        <div
                            className="h-full bg-gradient-to-r from-[#3ECF8E] to-emerald-400 transition-all duration-700 ease-out relative"
                            style={{ width: `${((currentStepIndex) / (stepsOrder.length - 1)) * 100}%` }}
                        >
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
                        </div>
                    </div>
                    <div className="flex justify-between mt-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <span>{t('steps.license')}</span>
                        <span>{t('steps.database')}</span>
                        <span>{t('steps.config')}</span>
                        <span>{t('steps.conclusion')}</span>
                    </div>
                </div>

                {/* Step Content */}
                <div className="max-w-2xl mx-auto">

                    {/* --- STEP 1: LICENSE CHECK --- */}
                    {currentStep === 'check_subscription' && (
                        <div className="glass-panel border border-white/10 bg-white/5 backdrop-blur-xl rounded-2xl p-8 shadow-2xl animate-in fade-in slide-in-from-bottom-4">
                            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mb-6 text-white shadow-lg">
                                <ShieldCheck className="w-6 h-6" />
                            </div>
                            <h1 className="text-2xl font-bold mb-2 text-white">{t('license.title')}</h1>
                            <p className="text-gray-400 mb-6">{t('license.desc')}</p>

                            <form onSubmit={handleLicenseSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1.5">{t('license.label')}</label>
                                    <div className="relative group">
                                        <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-white transition-colors" />
                                        <input
                                            type="text"
                                            value={licenseKey}
                                            onChange={(e) => setLicenseKey(e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-white placeholder-gray-600 focus:border-white/30 focus:ring-1 focus:ring-white/30 outline-none transition-all font-mono"
                                            placeholder="XXXX-XXXX-XXXX-XXXX"
                                            required
                                        />
                                    </div>
                                </div>

                                {error && (
                                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2">
                                        <AlertCircle className="w-4 h-4 shrink-0" />
                                        {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-white text-black font-bold py-3.5 rounded-xl hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl shadow-white/5 flex items-center justify-center gap-2 mt-2"
                                >
                                    {loading ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                            {t('license.validating')}
                                        </>
                                    ) : (
                                        <>
                                            {t('common:continue')} <ChevronRight className="w-4 h-4" />
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>
                    )}

                    {/* --- STEP 2: SUPABASE SETUP --- */}
                    {currentStep === 'supabase_setup' && (
                        <div className="glass-panel border border-white/10 bg-white/5 backdrop-blur-xl rounded-2xl p-8 shadow-2xl animate-in fade-in slide-in-from-bottom-4">
                            <div className="w-12 h-12 bg-[#3ECF8E]/20 rounded-xl flex items-center justify-center mb-6 text-[#3ECF8E] shadow-lg shadow-[#3ECF8E]/10">
                                <Database className="w-6 h-6" />
                            </div>
                            <h1 className="text-2xl font-bold mb-2 text-white">{t('database.title')}</h1>
                            <p className="text-gray-400 mb-6">{t('database.desc')}</p>

                            <div className="space-y-4 animate-in fade-in">
                                <a
                                    href="https://database.new"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block p-4 bg-black/40 border border-white/10 rounded-xl hover:border-[#3ECF8E]/50 transition-all group"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-bold text-white group-hover:text-[#3ECF8E] transition-colors">{t('database.step1')}</span>
                                        <ExternalLink className="w-4 h-4 text-gray-500" />
                                    </div>
                                    <p className="text-sm text-gray-400">{t('database.step1_desc')}</p>
                                </a>

                                <div className="p-4 bg-black/40 border border-white/10 rounded-xl">
                                    <p className="text-sm font-medium text-gray-300 mb-3">{t('database.step2')}</p>
                                    <input
                                        type="text"
                                        value={supabaseUrl}
                                        onChange={(e) => setSupabaseUrl(e.target.value)}
                                        placeholder="https://xxx.supabase.co"
                                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mb-2 focus:border-[#3ECF8E]/50 outline-none transition-colors"
                                    />
                                    <p className="text-xs text-gray-500">
                                        Vá em: <strong>Project Settings</strong> {'>'} <strong>Data API</strong> {'>'} Copie o campo <strong>URL</strong>
                                    </p>
                                </div>

                                <button
                                    onClick={handleSupabaseManualSubmit}
                                    className="w-full bg-white hover:bg-gray-100 text-black font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 mt-4"
                                >
                                    <Database className="w-5 h-5" />
                                    {t('common:continue')}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* --- STEP 2.5: MIGRATIONS --- */}
                    {currentStep === 'supabase_migrations' && (
                        <div className="glass-panel border border-white/10 bg-white/5 backdrop-blur-xl rounded-2xl p-8 shadow-2xl animate-in fade-in slide-in-from-bottom-4">
                            <div className="w-12 h-12 bg-[#3ECF8E]/20 rounded-xl flex items-center justify-center mb-6 text-[#3ECF8E] shadow-lg shadow-[#3ECF8E]/10">
                                <Database className="w-6 h-6" />
                            </div>
                            <h1 className="text-2xl font-bold mb-2 text-white">{t('migrations.title')}</h1>
                            <p className="text-gray-400 mb-6">{t('migrations.desc')}</p>

                            <div className="space-y-4">
                                <button
                                    onClick={() => setShowSqlModal(true)}
                                    className="w-full bg-white hover:bg-gray-100 text-black font-medium py-4 rounded-xl transition-all flex items-center justify-center gap-2 border border-white/20"
                                >
                                    <Copy className="w-4 h-4" />
                                    {t('migrations.view_sql')}
                                </button>

                                <div className="text-center text-sm text-gray-500">
                                    {t('migrations.sql_desc')}
                                </div>

                                <button
                                    onClick={() => setCurrentStep('supabase_keys')}
                                    className="w-full bg-[#3ECF8E] hover:bg-[#3ECF8E]/90 text-black font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 mt-4"
                                >
                                    {t('migrations.executed_btn')} <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* --- STEP 2.75: KEYS --- */}
                    {currentStep === 'supabase_keys' && (
                        <div className="glass-panel border border-white/10 bg-white/5 backdrop-blur-xl rounded-2xl p-8 shadow-2xl animate-in fade-in slide-in-from-bottom-4">
                            <div className="w-12 h-12 bg-[#3ECF8E]/20 rounded-xl flex items-center justify-center mb-6 text-[#3ECF8E] shadow-lg shadow-[#3ECF8E]/10">
                                <Key className="w-6 h-6" />
                            </div>
                            <h1 className="text-2xl font-bold mb-2 text-white">{t('keys.title')}</h1>
                            <p className="text-gray-400 mb-6">{t('keys.desc')}</p>

                            <form onSubmit={async (e) => {
                                e.preventDefault();
                                setLoading(true); // Show loading animation immediately

                                try {
                                    // SAVE KEYS TO LOCALSTORAGE (CRITICAL FIX)
                                    localStorage.setItem('installer_supabase_anon_key', anonKey);
                                    localStorage.setItem('installer_supabase_service_key', serviceKey);
                                    localStorage.setItem('installer_supabase_url', supabaseUrl); // Ensure URL is also saved

                                    const { createClient } = await import('@supabase/supabase-js');

                                    // 1. Reload Schema Cache
                                    const tempClient = createClient(supabaseUrl, anonKey);
                                    console.log('🔄 Reloading schema cache...');
                                    const { error } = await tempClient.rpc('exec_sql', {
                                        sql: "NOTIFY pgrst, 'reload schema';"
                                    });
                                    if (error) {
                                        console.warn('⚠️ exec_sql not available, trying alternative method...');
                                        await tempClient.from('contents').select('id').limit(0);
                                    }
                                    console.log('✅ Schema cache reloaded successfully');

                                    // 2. VALIDATE & ACTIVATE LICENSE (PHASE 2: CENTRAL AUTHORITY)
                                    // The installer now consults the Central Auth Server instead of generating keys locally.
                                    console.log('🔒 Validating license with Central Authority...');
                                    const AUTH_SERVER_URL = 'https://bcmnryxjweiovrwmztpn.supabase.co/functions/v1/validate-license';

                                    let validationData;
                                    let currentInstallId = installationId;
                                    let retryCount = 0;

                                    while (retryCount < 2) {
                                        try {
                                            const centralAnonKey = import.meta.env.VITE_CENTRAL_SUPABASE_ANON_KEY;
                                            const validationRes = await fetch(AUTH_SERVER_URL, {
                                                method: 'POST',
                                                headers: {
                                                    'Content-Type': 'application/json',
                                                    'apikey': centralAnonKey,
                                                    'Authorization': `Bearer ${centralAnonKey}`
                                                },
                                                body: JSON.stringify({
                                                    license_key: licenseKey,
                                                    installation_id: currentInstallId,
                                                    current_domain: vercelDomain || window.location.hostname,
                                                    register: true // Always register on explicit setup
                                                })
                                            });

                                            validationData = await validationRes.json();
                                            console.log('🔍 Validation Response:', validationData);

                                            if (!validationRes.ok || !validationData.valid) {
                                                const msg = validationData.message || 'Licença inválida ou bloqueada pelo servidor central.';

                                                // AUTO-FIX: If Installation ID is duplicate (Collision with another license), regenerate and retry.
                                                if (msg.includes('installations_installation_id_key') || msg.includes('duplicate key')) {
                                                    console.warn('⚠️ Installation ID Collision detected. Regenerating ID...');
                                                    const newId = crypto.randomUUID();
                                                    localStorage.setItem('installation_id', newId);
                                                    currentInstallId = newId;
                                                    setInstallationId(newId);
                                                    retryCount++;
                                                    continue; // Retry with new ID
                                                }

                                                throw new Error(msg);
                                            }

                                            console.log('✅ License validated:', validationData);
                                            break; // Success

                                        } catch (valError: any) {
                                            // Pass through if it's the final attempt
                                            if (retryCount >= 1 || (!valError.message.includes('duplicate') && !valError.message.includes('installations_installation_id_key'))) {
                                                console.error('❌ Validation Failed:', valError);
                                                alert(`Falha na validação da licença: ${valError.message}`);
                                                setLoading(false);
                                                return;
                                            }
                                        }
                                    }

                                    // 2.1 Inject Validated License into Local DB
                                    console.log('💉 Injecting validated license into local database...');
                                    const adminClient = createClient(supabaseUrl, serviceKey);

                                    const licenseToInsert = {
                                        key: licenseKey, // The key from input
                                        client_email: email || 'admin@local.com',
                                        client_name: validationData.license.client_name || 'Admin User',
                                        status: 'active',
                                        plan: validationData.license.plan || 'commercial',
                                        max_instances: validationData.license.max_instances || validationData.license.max_installations || 1,
                                        owner_id: validationData.license.owner_id || null,
                                        created_at: new Date().toISOString(),
                                        activated_at: new Date().toISOString(),
                                        allowed_domain: vercelDomain || window.location.hostname, // Use client's domain
                                        expires_at: validationData.license.expires_at || null
                                    };

                                    const { error: licenseError } = await adminClient
                                        .from('licenses')
                                        .insert(licenseToInsert)
                                        .select()
                                        .maybeSingle();

                                    if (licenseError) {
                                        if (!licenseError.message.includes('duplicate')) {
                                            console.warn('⚠️ License injection warning:', licenseError.message);
                                        } else {
                                            console.log('✅ License already exists locally.');
                                        }
                                    } else {
                                        console.log('✅ License synced successfully.');
                                    }

                                    // 3. CREATE STORAGE BUCKETS (CRITICAL FIX)
                                    // Fixes "Error saving product" due to missing buckets
                                    console.log('📦 Creating storage buckets...');
                                    const buckets = ['products', 'contents', 'checkouts', 'member-areas', 'avatars'];
                                    for (const bucket of buckets) {
                                        const { error: bucketError } = await adminClient
                                            .storage
                                            .createBucket(bucket, { public: true }); // Ensure public

                                        if (bucketError && !bucketError.message.includes('already exists')) {
                                            console.warn(`⚠️ Failed to create bucket ${bucket}:`, bucketError.message);
                                            // Fallback: Try SQL insert if API fails (rare but possible)
                                            await adminClient.rpc('exec_sql', { sql: `INSERT INTO storage.buckets (id, name, public) VALUES ('${bucket}', '${bucket}', true) ON CONFLICT (id) DO UPDATE SET public = true;` });
                                        }
                                    }
                                    console.log('✅ Storage buckets verified.');

                                    // 4. SAVE INSTALLATION DOMAIN (CRITICAL FIX)
                                    // Save the installation domain to localStorage for license validation
                                    // This allows custom domains to bypass license checks
                                    const installationDomain = vercelDomain || window.location.hostname;
                                    localStorage.setItem('installation_domain', installationDomain);
                                    console.log(`✅ Installation domain saved: ${installationDomain}`);

                                    // 4.1 Register Installation Domain in Database
                                    // Add the main installation domain to the domains table
                                    // SECURITY: Type 'installation' is critical for LicenseGuard
                                    try {
                                        const { error: domainError } = await adminClient
                                            .from('domains')
                                            .insert({
                                                domain: installationDomain,
                                                status: 'active',
                                                type: 'installation',
                                                usage: 'admin',
                                                verified_at: new Date().toISOString()
                                            })
                                            .select()
                                            .maybeSingle();

                                        if (domainError && !domainError.message.includes('duplicate')) {
                                            console.warn('⚠️ Failed to register installation domain:', domainError.message);
                                        } else {
                                            console.log('✅ Installation domain registered in database.');
                                        }
                                    } catch (domainErr) {
                                        console.warn('⚠️ Error registering installation domain:', domainErr);
                                    }

                                    // 4.2 SAVE INSTALLATION ID TO DATABASE (CRITICAL FIX)
                                    // This ensures LicenseGuard can retrieve the installation_id
                                    try {
                                        console.log(`🆔 Saving Installation ID to database: ${currentInstallId}`);

                                        const { error: configError } = await adminClient
                                            .from('app_config')
                                            .insert({
                                                key: 'installation_id',
                                                value: JSON.stringify(currentInstallId)
                                            });

                                        if (configError && !configError.message.includes('duplicate')) {
                                            console.warn('⚠️ Failed to save installation_id:', configError.message);
                                        } else {
                                            console.log('✅ Installation ID secured in database.');
                                            localStorage.setItem('installation_id', currentInstallId);
                                            if (validationData?.license?.owner_id) {
                                                localStorage.setItem('installer_owner_id', validationData.license.owner_id);
                                            }
                                        }
                                    } catch (configErr) {
                                        console.warn('⚠️ Error saving installation config:', configErr);
                                    }

                                } catch (error) {
                                    console.warn('⚠️ Error during setup:', error);
                                    setLoading(false); // Reset loading state on error
                                }

                                setLoading(false); // Reset loading before changing step
                                setCurrentStep('deploy');
                            }} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1.5">{t('keys.anon_label')}</label>
                                    <input type="text" value={anonKey} onChange={e => setAnonKey(e.target.value)} required
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-mono" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1.5">{t('keys.service_label')}</label>
                                    <input type="text" value={serviceKey} onChange={e => setServiceKey(e.target.value)} required
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-mono" />
                                </div>
                                <button type="submit" className="w-full bg-[#3ECF8E] text-black font-bold py-3 rounded-xl mt-2 hover:bg-[#3ECF8E]/90 flex justify-center items-center gap-2">
                                    {loading ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                            {t('keys.processing')}
                                        </>
                                    ) : (
                                        <>
                                            {t('common.save')} & {t('common.continue')} <ChevronRight className="w-4 h-4" />
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>
                    )}

                    {/* --- STEP 3: DEPLOY --- */}
                    {currentStep === 'deploy' && (
                        <div className="glass-panel border border-white/10 bg-white/5 backdrop-blur-xl rounded-2xl p-8 shadow-2xl animate-in fade-in slide-in-from-bottom-4">
                            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mb-6 text-white shadow-lg">
                                <Globe className="w-6 h-6" />
                            </div>
                            <h1 className="text-2xl font-bold mb-2 text-white">{t('deploy.title')}</h1>
                            <p className="text-gray-400 mb-6">
                                {t('deploy.desc')}
                            </p>

                            <div className="space-y-6">
                                <div className="bg-black/40 rounded-xl p-6 border border-white/10">
                                    <p className="text-sm text-gray-300 mb-4 font-bold">
                                        {t('deploy.step1')}
                                    </p>
                                    <div className="bg-black/50 rounded-xl p-4 border border-white/10 space-y-3 mb-6">
                                        {[
                                            { k: 'VITE_SUPABASE_URL', v: supabaseUrl },
                                            { k: 'VITE_SUPABASE_ANON_KEY', v: anonKey },
                                            { k: 'SUPABASE_SERVICE_ROLE_KEY', v: serviceKey },
                                            { k: 'VITE_LICENSE_KEY', v: licenseKey },
                                            { k: 'VITE_CENTRAL_API_URL', v: CENTRAL_CONFIG.API_URL },
                                            { k: 'VITE_CENTRAL_SUPABASE_ANON_KEY', v: import.meta.env.VITE_CENTRAL_SUPABASE_ANON_KEY }
                                        ].map((env, i) => (
                                            <div key={i} className="flex items-center justify-between gap-3 bg-white/5 p-3 rounded-xl cursor-pointer hover:bg-white/10 group transition-all" onClick={() => copyToClipboard(env.v, env.k)}>
                                                <div className="overflow-hidden flex-1">
                                                    <div className="text-xs text-gray-400 font-mono mb-1">{env.k}</div>
                                                    <div className="text-xs text-green-400 font-mono truncate">{env.v || '...'}</div>
                                                </div>
                                                <div className={`p - 2 rounded - lg transition - all ${copiedId === env.k ? 'bg-green-500/20 text-green-500 scale-110' : 'bg-white/5 text-gray-500 group-hover:bg-white/10 group-hover:text-white'} `}>
                                                    {copiedId === env.k ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                                </div>
                                                <div className="text-xs text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {copiedId === env.k ? t('deploy.copy_success') : t('deploy.copy_btn')}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <a href={deployUrl} target="_blank" rel="noopener noreferrer"
                                        className="w-full bg-white text-black font-bold py-4 rounded-xl flex items-center justify-center gap-3 hover:bg-gray-100 transition-all shadow-xl shadow-white/10 group"
                                    >
                                        <svg className="w-5 h-5" viewBox="0 0 1155 1000" fill="black"><path d="M577.344 0L1154.69 1000H0L577.344 0Z" /></svg>
                                        Deploy to Vercel
                                        <ExternalLink className="w-4 h-4 opacity-50 group-hover:opacity-100" />
                                    </a>
                                </div>

                                <button onClick={() => setCurrentStep('vercel_config')} className="w-full bg-[#3ECF8E] hover:bg-[#3ECF8E]/90 text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                                    {t('deploy.already_deployed')} <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* --- STEP 4: VERCEL CONFIG (NEW) --- */}
                    {currentStep === 'vercel_config' && (
                        <div className="glass-panel border border-white/10 bg-white/5 backdrop-blur-xl rounded-2xl p-8 shadow-2xl animate-in fade-in slide-in-from-bottom-4">
                            <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center mb-6 text-purple-400 shadow-lg shadow-purple-500/10">
                                <Settings className="w-6 h-6" />
                            </div>
                            <h1 className="text-2xl font-bold mb-2 text-white">{t('vercel_config.title')}</h1>
                            <p className="text-gray-400 mb-6">{t('vercel_config.desc')}</p>

                            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl mb-8 flex items-start gap-3">
                                <Info className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                                <p className="text-sm text-yellow-200">
                                    {t('vercel_config.info')}
                                </p>
                            </div>

                            <div className="space-y-6">
                                {/* Token Section */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-white font-bold flex items-center gap-2">
                                                1. VERCEL_TOKEN
                                                <a href="https://vercel.com/account/settings/tokens" target="_blank" className="text-xs font-normal text-purple-400 hover:text-purple-300 bg-purple-500/10 px-2 py-1 rounded-full flex items-center gap-1 transition-colors">
                                                    {t('vercel_config.generate_token')} <ExternalLink className="w-3 h-3" />
                                                </a>
                                            </h3>
                                        </div>
                                    </div>
                                    <div className="flex gap-3">
                                        <div className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-gray-400 font-mono text-sm flex items-center">
                                            VERCEL_TOKEN
                                        </div>
                                        <button
                                            onClick={() => copyToClipboard('VERCEL_TOKEN', 'VERCEL_TOKEN')}
                                            className={`px-6 rounded-xl font-bold transition-all duration-200 flex items-center gap-2 ${copiedId === 'VERCEL_TOKEN' ? 'bg-[#38BB81] text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                                        >
                                            {copiedId === 'VERCEL_TOKEN' ? <Check className="w-5 h-5 animate-bounce" /> : <Copy className="w-5 h-5" />}
                                            {copiedId === 'VERCEL_TOKEN' ? t('deploy.copy_success') : t('deploy.copy_btn')}
                                        </button>
                                    </div>
                                </div>

                                <div className="h-px bg-white/5" />

                                {/* Project ID Section */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-white font-bold flex items-center gap-2">
                                                2. VERCEL_PROJECT_ID
                                                <a href="https://vercel.com/account/settings" target="_blank" className="text-xs font-normal text-purple-400 hover:text-purple-300 bg-purple-500/10 px-2 py-1 rounded-full flex items-center gap-1 transition-colors">
                                                    {t('vercel_config.view_settings')} <ExternalLink className="w-3 h-3" />
                                                </a>
                                            </h3>
                                        </div>
                                    </div>
                                    <div className="flex gap-3">
                                        <div className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-gray-400 font-mono text-sm flex items-center">
                                            VERCEL_PROJECT_ID
                                        </div>
                                        <button
                                            onClick={() => copyToClipboard('VERCEL_PROJECT_ID', 'VERCEL_PROJECT_ID')}
                                            className={`px-6 rounded-xl font-bold transition-all duration-200 flex items-center gap-2 ${copiedId === 'VERCEL_PROJECT_ID' ? 'bg-[#38BB81] text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                                        >
                                            {copiedId === 'VERCEL_PROJECT_ID' ? <Check className="w-5 h-5 animate-bounce" /> : <Copy className="w-5 h-5" />}
                                            {copiedId === 'VERCEL_PROJECT_ID' ? t('deploy.copy_success') : t('deploy.copy_btn')}
                                        </button>
                                    </div>
                                </div>

                                <div className="h-8" />

                                <form onSubmit={handleDeploySubmit} className="pt-4 border-t border-white/10">
                                    <label className="block text-sm font-medium text-gray-300 mb-3">
                                        {t('vercel_config.final_step')}
                                    </label>
                                    <div className="flex gap-3">
                                        <div className="relative flex-1">
                                            <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                            <input
                                                type="text"
                                                value={vercelDomain}
                                                onChange={e => setVercelDomain(e.target.value)}
                                                placeholder="minhaloja.vercel.app"
                                                className="w-full bg-black/40 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white focus:border-white/30 outline-none transition-all"
                                                required
                                            />
                                        </div>
                                        <button type="submit" className="bg-[#3ECF8E] hover:bg-[#3ECF8E]/90 text-black px-8 rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg shadow-[#3ECF8E]/20">
                                            {t('vercel_config.finish_btn')} <ArrowRight className="w-5 h-5" />
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}


                    {/* --- STEP 5: SUCCESS --- */}
                    {currentStep === 'success' && (
                        <div className="glass-panel border border-green-500/20 bg-green-500/5 backdrop-blur-xl rounded-2xl p-8 shadow-2xl animate-in fade-in slide-in-from-bottom-4 text-center">
                            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-6 text-green-500 shadow-lg shadow-green-500/20 mx-auto animate-in zoom-in duration-300">
                                <Check className="w-10 h-10" />
                            </div>
                            <h1 className="text-3xl font-bold mb-4 text-white">{t('success.title')}</h1>
                            <p className="text-gray-400 mb-8 max-w-md mx-auto">
                                {t('success.desc')}
                            </p>

                            <div className="bg-black/40 rounded-xl p-6 mb-6 border border-white/5 text-center">
                                <p className="text-sm text-gray-400 mb-2">{t('success.admin_panel')}</p>
                                <a
                                    href={`https://${localStorage.getItem('installer_vercel_domain') || vercelDomain}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xl font-bold text-primary hover:underline font-mono"
                                >
                                    {localStorage.getItem('installer_vercel_domain') || vercelDomain}
                                </a>
                            </div>

                            <button
                                onClick={() => {
                                    // If we are already on the target domain, reload.
                                    // If not, open new tab.
                                    const targetDomain = localStorage.getItem('installer_vercel_domain') || vercelDomain;
                                    const currentHost = window.location.host;

                                    // SECURITY: Cross-Domain Config Injection
                                    // Since "Closed Build" has empty env vars, we must pass the keys to the new domain.
                                    // We use a URL Hash Fragment which is NOT sent to the server.
                                    const configPayload = {
                                        url: localStorage.getItem('installer_supabase_url') || supabaseUrl,
                                        anon: localStorage.getItem('installer_supabase_anon_key') || anonKey,
                                        service: localStorage.getItem('installer_supabase_service_key') || serviceKey,
                                        license: localStorage.getItem('installer_license_key') || licenseKey,
                                        org: localStorage.getItem('installer_org_slug') || organizationSlug,
                                        install_id: localStorage.getItem('installation_id') || installationId, // Use state as fallback
                                        central_id: localStorage.getItem('installer_owner_id') || null
                                    };
                                    // Encode to Base64 to keep URL clean
                                    const encodedConfig = btoa(JSON.stringify(configPayload));
                                    const injectionHash = `#installer_config=${encodedConfig}`;

                                    if (targetDomain && !currentHost.includes(targetDomain)) {
                                        // Different domain (Cross-Domain): Open new tab WITH KEYS
                                        // The destination App.tsx must attempt to hydrate from this hash.
                                        // Update: Redirect to /setup to create admin user immediately
                                        window.open(`https://${targetDomain}/setup${injectionHash}`, '_blank');
                                    } else {
                                        // Same domain: Just reload (Installer logic already hydrated localStorage)
                                        window.location.href = '/setup';
                                    }
                                }}
                                className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-1"
                            >
                                {t('success.access_btn')}
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    )}


                </div>
            </div >


            {/* --- SQL MODAL --- */}
            {
                showSqlModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                        <div className="w-full max-w-4xl bg-[#0F0F13] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
                            {/* Header */}
                            <div className="flex items-center justify-between p-6 border-b border-white/10">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <Database className="w-5 h-5 text-[#3ECF8E]" />
                                    {t('sql_modal.title')}
                                </h2>
                                <button
                                    onClick={() => setShowSqlModal(false)}
                                    className="text-gray-400 hover:text-white transition-colors"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-auto p-6 bg-black/40">
                                <div className="relative">
                                    <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap break-all">
                                        {SQL_SCHEMA}
                                    </pre>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="p-6 border-t border-white/10 flex justify-end gap-3 bg-[#0F0F13] rounded-b-2xl">
                                <button
                                    onClick={() => setShowSqlModal(false)}
                                    className="px-6 py-3 rounded-xl font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                                >
                                    {t('sql_modal.close')}
                                </button>
                                <button
                                    onClick={() => copyToClipboard(SQL_SCHEMA, 'sql_modal')}
                                    className={`px-8 py-3 rounded-xl font-bold shadow-lg flex items-center gap-2 transition-all ${copiedId === 'sql_modal'
                                        ? 'bg-[#38BB81] text-white shadow-[#38BB81]/20 scale-105'
                                        : 'bg-primary hover:bg-primary/90 text-white shadow-primary/20 hover:shadow-primary/40'
                                        }`}
                                >
                                    {copiedId === 'sql_modal' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    {copiedId === 'sql_modal' ? t('deploy.copy_success') : t('sql_modal.copy_full')}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            <AlertModal
                isOpen={alertModal.isOpen}
                onClose={() => setAlertModal(prev => ({ ...prev, isOpen: false }))}
                title={alertModal.title}
                message={alertModal.message}
                variant={alertModal.variant}
                buttonText={t('common.ok')}
            />

            <UpsellModal
                isOpen={!!upsellSlug}
                onClose={() => {
                    // Force refresh or redirect if they close without upgrading? 
                    // For now, just close to allow them to see the error or maybe retry.
                    setUpsellSlug(null)
                }}
                offerSlug={upsellSlug}
            />
        </div >
    );
}

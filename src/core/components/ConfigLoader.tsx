
import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle, RefreshCw, Key } from 'lucide-react';
import { getEnv } from '../utils/env';

interface ConfigLoaderProps {
    onConfigLoaded: () => void;
}

export const ConfigLoader: React.FC<ConfigLoaderProps> = ({ onConfigLoaded }) => {
    const [status, setStatus] = useState<'checking' | 'found' | 'error'>('checking');
    const [errorMsg, setErrorMsg] = useState('');
    // State for manual recovery
    const [manualLicense, setManualLicense] = useState('');
    const [showRecovery, setShowRecovery] = useState(false);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                // Check for environment variables or localStorage via unified helper
                const envUrl = getEnv('VITE_SUPABASE_URL');
                const envAnon = getEnv('VITE_SUPABASE_ANON_KEY');
                const envLicense = getEnv('VITE_LICENSE_KEY');

                if (envUrl && envAnon) {
                    if (envLicense) {
                        setStatus('found');
                        return;
                    } else {
                        // Environment has Supabase config but NO LICENSE.
                        // We must trigger Recovery Mode to ask for the license,
                        // DO NOT attempt to fetch /api/config locally as it will crash.
                        console.warn('[ConfigLoader] Missing License Key in Env. Enabling Manual Recovery.');
                        setShowRecovery(true);
                        setStatus('error');
                        setErrorMsg('A licença não foi encontrada nas variáveis de ambiente.');
                        return;
                    }
                }

                console.log('[ConfigLoader] Fetching remote configuration...');
                const res = await fetch('/api/config');

                if (!res.ok) {
                    throw new Error(`Server returned ${res.status}`);
                }

                const data = await res.json();

                if (data.url && data.anon) {
                    // Save to localStorage so supabase.ts can pick it up on reload
                    localStorage.setItem('installer_supabase_url', data.url);
                    localStorage.setItem('installer_supabase_anon_key', data.anon);

                    if (data.license) {
                        localStorage.setItem('installer_license_key', data.license);
                        console.log('[ConfigLoader] Config secured. Reloading...');
                        window.location.reload();
                    } else {
                        // CRITICAL FIX: Server has config but NO LICENSE.
                        // Do NOT reload, or we loop forever.
                        // Enable Recovery Mode.
                        console.warn('[ConfigLoader] Missing License Key from Server. Enabling Manual Recovery.');
                        setShowRecovery(true);
                        setStatus('error');
                        setErrorMsg('A licença não foi encontrada nas variáveis de ambiente.');
                    }
                } else {
                    throw new Error('Invalid config response');
                }

            } catch (err: any) {
                console.error('[ConfigLoader] Failed to fetch config:', err);
                setStatus('error');
                setErrorMsg(err.message || 'Unknown error');
            }
        };

        fetchConfig();
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
                        {isRecoveryMode ? 'Recuperação de Acesso' : 'Erro de Configuração'}
                    </h1>

                    <p className="text-gray-400 mb-6">
                        {isRecoveryMode
                            ? 'A chave da licença não foi encontrada. Insira sua chave para restaurar o acesso.'
                            : 'Não foi possível carregar as configurações do sistema.'}
                    </p>

                    {isRecoveryMode ? (
                        <div className="mb-6 text-left">
                            <label className="text-xs text-gray-500 uppercase font-bold mb-2 block">Chave da Licença</label>
                            <input
                                type="text"
                                value={manualLicense}
                                onChange={(e) => setManualLicense(e.target.value)}
                                placeholder="Insira sua License Key (UUID)"
                                className="w-full bg-black/40 border border-gray-800 rounded-lg p-3 text-white focus:border-red-500 outline-none font-mono text-sm"
                            />
                            <p className="text-xs text-gray-600 mt-2">
                                Você pode encontrar essa chave no seu painel de controle ou no email de confirmação.
                            </p>
                        </div>
                    ) : (
                        <div className="bg-black/40 rounded-lg p-4 mb-6 font-mono text-xs text-red-400 text-left overflow-auto">
                            {errorMsg}
                        </div>
                    )}

                    {isRecoveryMode ? (
                        <button
                            onClick={handleManualRecovery}
                            disabled={!manualLicense}
                            className="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <RefreshCw className="w-4 h-4" /> Salvar e Entrar
                        </button>
                    ) : (
                        <button
                            onClick={() => window.location.reload()}
                            className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                        >
                            <RefreshCw className="w-4 h-4" /> Tentar Novamente
                        </button>
                    )}

                    <div className="mt-4">
                        <a href="/installer" className="text-xs text-gray-500 hover:text-white underline">
                            Ir para o Instalador
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
                <h2 className="text-xl font-bold text-white mb-2">Conectando ao Sistema...</h2>
                <p className="text-gray-400 text-sm">Obtendo configurações do servidor</p>
            </div>
        </div>
    );
};

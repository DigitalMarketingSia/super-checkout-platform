import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { licenseService, License, Installation } from '../../services/licenseService';
import {
    Shield,
    CheckCircle,
    AlertTriangle,
    Link as LinkIcon,
    Loader2,
    Copy,
    Globe,
    Calendar,
    ChevronDown,
    ChevronUp,
    RefreshCw
} from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';

export const SaaSLicenseWidget = () => {
    const { user } = useAuth();
    const [license, setLicense] = useState<License | null>(null);
    const [installations, setInstallations] = useState<Installation[]>([]);
    const [loading, setLoading] = useState(true);
    const [generatingLink, setGeneratingLink] = useState(false);
    const [installLink, setInstallLink] = useState<string | null>(null);
    const [showInstallations, setShowInstallations] = useState(false);

    // We try to find the license key in this order:
    // 1. LocalStorage (installed_license_key) - if valid
    // 2. Future: Query backend by user email to find their license (More secure)
    const [licenseKey, setLicenseKey] = useState<string | null>(
        localStorage.getItem('installer_license_key') || import.meta.env.VITE_LICENSE_KEY || null
    );

    useEffect(() => {
        fetchLicenseData();
    }, [licenseKey]); // Re-fetch if key changes

    const fetchLicenseData = async () => {
        if (!licenseKey) {
            // TODO: Here we should ask the backend "Hey, I am user X, do I have a license?"
            // For now, we rely on the key being present (injected via magic link login ideally)
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            // 1. Get License Details
            const licData = await licenseService.getDetails(licenseKey);
            setLicense(licData);

            // 2. Get Installations
            if (licData) {
                const installData = await licenseService.getInstallations(licenseKey);
                setInstallations(installData);
            }
        } catch (error) {
            console.error('[SaaSWidget] Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateLink = async () => {
        if (!license) return;
        setGeneratingLink(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();

            const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-install-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    license_key: license.key,
                    origin: window.location.origin
                })
            });

            if (!res.ok) throw new Error('Failed to generate token');

            const data = await res.json();
            setInstallLink(data.install_url);
        } catch (error) {
            alert('Erro ao gerar link. Contate o suporte.');
        } finally {
            setGeneratingLink(false);
        }
    };

    const copyLink = () => {
        if (installLink) {
            navigator.clipboard.writeText(installLink);
            alert('Link copiado!');
        }
    };

    if (loading) {
        return (
            <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl p-6 mb-8 flex justify-center">
                <Loader2 className="animate-spin text-primary w-6 h-6" />
            </div>
        );
    }

    if (!license) {
        return null; // Don't show anything if no license found (clean UI)
    }

    return (
        <div className="mb-12 animate-in fade-in slide-in-from-top-4">
            <div className="bg-gradient-to-br from-[#1E1E24] to-[#151518] border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative">
                {/* Decorative Elements */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>

                <div className="p-6 md:p-8">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] font-bold tracking-widest uppercase bg-white/10 text-white/80 px-2 py-0.5 rounded">
                                    Licença Oficial
                                </span>
                                {license.status === 'active'
                                    ? <span className="text-[10px] font-bold tracking-widest uppercase bg-green-500/20 text-green-400 px-2 py-0.5 rounded border border-green-500/20">Ativa</span>
                                    : <span className="text-[10px] font-bold tracking-widest uppercase bg-red-500/20 text-red-400 px-2 py-0.5 rounded border border-red-500/20">Suspensa</span>
                                }
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-1">
                                Plano {license.plan}
                            </h2>
                            <p className="text-gray-400 text-sm">
                                Obrigado por ser nosso cliente. Aqui você gerencia a instalação do seu software.
                            </p>
                        </div>

                        <div className="flex flex-col items-end gap-2">
                            <div className="text-right">
                                <div className="text-sm text-gray-400 uppercase font-bold text-[10px]">Instalações</div>
                                <div className="text-xl font-mono font-bold text-white">
                                    {installations.length} <span className="text-gray-500 text-sm">/ {license.max_instances > 9000 ? '∞' : license.max_instances}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Action Box */}
                        <div className="bg-black/20 border border-white/5 rounded-xl p-5">
                            <h3 className="font-bold text-white mb-2 flex items-center gap-2">
                                <LinkIcon className="w-4 h-4 text-primary" /> Instalar Software
                            </h3>
                            <p className="text-xs text-gray-400 mb-4">
                                Gere um link único para instalar o Super Checkout em um novo domínio.
                            </p>

                            {!installLink ? (
                                <Button
                                    onClick={handleGenerateLink}
                                    disabled={generatingLink || license.status !== 'active'}
                                    className="w-full bg-primary hover:bg-primary-dark text-white font-bold"
                                >
                                    {generatingLink ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LinkIcon className="w-4 h-4 mr-2" />}
                                    Gerar Link Seguro
                                </Button>
                            ) : (
                                <div className="space-y-3">
                                    <div className="bg-black/40 border border-green-500/30 rounded px-3 py-2">
                                        <code className="text-xs text-green-400 font-mono break-all">{installLink}</code>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={copyLink} size="sm" className="flex-1 bg-green-600 hover:bg-green-700">
                                            <Copy className="w-3 h-3 mr-2" /> Copiar
                                        </Button>
                                        <Button onClick={() => setInstallLink(null)} size="sm" variant="outline" className="flex-1 border-white/10 text-gray-400 hover:bg-white/5">
                                            Gerar Novo
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Installations List Toggle */}
                        <div className="bg-black/20 border border-white/5 rounded-xl p-5 flex flex-col justify-between">
                            <div>
                                <h3 className="font-bold text-white mb-2 flex items-center gap-2">
                                    <Globe className="w-4 h-4 text-blue-400" /> Domínios Ativos
                                </h3>
                                <p className="text-xs text-gray-400 mb-4">
                                    Veja onde sua licença está sendo utilizada atualmente.
                                </p>
                            </div>

                            <Button
                                variant="outline"
                                className="w-full border-white/10 hover:bg-white/5 text-gray-300 justify-between group"
                                onClick={() => setShowInstallations(!showInstallations)}
                            >
                                <span>Ver Lista ({installations.length})</span>
                                {showInstallations ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Expanded List */}
                {showInstallations && (
                    <div className="border-t border-white/5 bg-black/10 p-4 animate-in slide-in-from-top-2">
                        {installations.length === 0 ? (
                            <p className="text-center text-sm text-gray-500 py-2">Nenhuma instalação encontrada.</p>
                        ) : (
                            <div className="space-y-2">
                                {installations.map(inst => (
                                    <div key={inst.id} className="flex items-center justify-between bg-white/5 rounded px-3 py-2">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-1.5 h-1.5 rounded-full ${inst.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`} />
                                            <span className="text-sm text-gray-200 font-mono">{inst.domain}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] text-gray-500">{new Date(inst.installed_at).toLocaleDateString()}</span>
                                            <a
                                                href={`https://${inst.domain}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white"
                                            >
                                                <Globe className="w-3 h-3" />
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

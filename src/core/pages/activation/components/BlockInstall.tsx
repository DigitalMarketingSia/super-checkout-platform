import React, { useState, useEffect } from 'react';
import { Server, ArrowRight, Loader2, Copy, AlertTriangle, Zap, Clock } from 'lucide-react';
import { License, licenseService } from '../../../services/licenseService';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../services/supabase';
import { getInstallerUrl } from '../../../config/platformUrls';
import { GenerateLicenseGate } from './GenerateLicenseGate';
import { Product } from '../../../types';
import { openUpgradeCheckout } from '../../../services/upgradeCheckout';

interface BlockInstallProps {
    license: License;
    installations?: any[];
    onRefresh?: () => void;
    onNavigate?: (tab: string) => void;
    upgradeProduct?: Product | null;
}

export const BlockInstall: React.FC<BlockInstallProps> = ({ license, installations = [], onRefresh, onNavigate, upgradeProduct, userName = '' }) => {
    const { t } = useTranslation('portal');
    const [generating, setGenerating] = useState(false);
    const [revoking, setRevoking] = useState(false);
    const [installUrl, setInstallUrl] = useState<string | null>(null);
    const [error, setError] = useState('');

    if (!license) {
        return <GenerateLicenseGate userName={userName as string} onActivated={() => onRefresh && onRefresh()} />;
    }
    const [showConfirmReinstall, setShowConfirmReinstall] = useState(false);

    // If there is ANY installation (active, pending, failed), we might need to revoke it
    const activeInstall = installations.find(i => i.status === 'active');
    const anyInstall = installations[0]; // Gets the most recent or any installation
    const hasActiveInstall = !!activeInstall;

    useEffect(() => {
        // If we just revoked (installations went to empty) AND we have a new URL, keep showing it.
        const savedUrl = sessionStorage.getItem('activation_install_url');
        if (savedUrl) {
            setInstallUrl(savedUrl);
        }
    }, [installations]);

    const generateLink = async () => {
        setGenerating(true);
        setError('');
        try {
            const data = await licenseService.generateInstallToken(license.key);
            if (data.token) {
                const url = getInstallerUrl(data.token);
                setInstallUrl(url);
                sessionStorage.setItem('activation_install_url', url);
            } else {
                throw new Error(t('install.token_error'));
            }
        } catch (err: any) {
            setError(err.message || t('install.generic_error'));
        } finally {
            setGenerating(false);
        }
    };

    const handleReinstall = async () => {
        // We attempt to revoke ANY installation to ensure clean state
        setRevoking(true);
        try {
            if (anyInstall) {
                await licenseService.revokeInstallation(anyInstall.id);
            }
            // Installation revoked (or none existed). Now auto-generate new link.
            await generateLink();
            setShowConfirmReinstall(false);
            if (onRefresh) onRefresh(); // Refresh parent to clear "active" state
        } catch (err: any) {
            setError(err.message || t('install.revoke_error'));
        } finally {
            setRevoking(false);
        }
    };

    return (
        <div className="bg-white/5 border border-white/10 rounded-[2rem] p-8 backdrop-blur-xl relative overflow-hidden group">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 rounded-full blur-[100px] -mr-40 -mt-40 pointer-events-none transition-opacity group-hover:opacity-100 opacity-50" />

            <h3 className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] mb-8">{t('install.title')}</h3>

            <div className="flex flex-col md:flex-row items-start md:items-center gap-10">
                <div className="flex-1">
                    {hasActiveInstall && !installUrl ? (
                        <div className="animate-in slide-in-from-left duration-500">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.6)]" />
                                <h4 className="text-2xl font-black text-white font-display italic uppercase tracking-tighter">{t('install.active_title')}</h4>
                            </div>
                            <p className="text-gray-400 text-lg font-medium leading-relaxed mb-6">
                                {t('install.operating_at')} <strong className="text-white bg-white/5 px-2 py-0.5 rounded border border-white/5">{activeInstall.domain}</strong>
                            </p>
                            <div className="bg-white/5 border border-white/5 p-4 rounded-2xl text-gray-400 text-sm flex gap-3">
                                <AlertTriangle className="w-5 h-5 text-primary shrink-0" />
                                <span>{t('install.new_server_warn')}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="animate-in slide-in-from-left duration-500">
                            <h4 className="text-2xl font-black text-white mb-3 font-display italic uppercase tracking-tighter">{t('install.deploy_title')}</h4>
                            <p className="text-gray-400 text-lg font-medium leading-relaxed mb-6">
                                {t('install.deploy_desc')}
                            </p>
                            <div className="flex items-center gap-3 text-xs font-bold text-primary uppercase tracking-[0.1em]">
                                <Clock className="w-4 h-4" />
                                {t('install.expires_in')}
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="flex items-center gap-2 text-red-500 text-sm mt-6 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                            <AlertTriangle className="w-4 h-4" />
                            {error}
                        </div>
                    )}
                </div>

                <div className="w-full md:w-auto flex flex-col gap-4">
                    {/* STATE 1: ACTIVE INSTALL - SHOW REINSTALL BUTTON */}
                    {hasActiveInstall && !installUrl && !showConfirmReinstall && (
                        <button
                            onClick={() => setShowConfirmReinstall(true)}
                            className="w-full md:w-64 flex items-center justify-center gap-3 px-8 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-black transition-all border border-white/10 active:scale-95 group/btn"
                        >
                            <Server className="w-5 h-5 text-gray-500 group-hover/btn:text-primary transition-colors" />
                            <span>{t('install.reinstall_button')}</span>
                        </button>
                    )}

                    {/* CONFIRMATION FOR REINSTALL */}
                    {showConfirmReinstall && (
                        <div className="flex flex-col gap-4 bg-red-500/10 border border-red-500/20 p-6 rounded-[1.5rem] w-full md:w-80 animate-in zoom-in-95 duration-300">
                            <p className="text-red-200 text-sm font-bold leading-relaxed italic">{t('install.reinstall_confirm', { domain: activeInstall?.domain })}</p>
                            <div className="flex gap-3">
                                <button
                                    onClick={handleReinstall}
                                    disabled={revoking}
                                    className="flex-1 bg-red-500 hover:bg-red-600 text-white font-black py-3 rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 transition-all active:scale-95"
                                >
                                    {revoking ? <Loader2 className="w-4 h-4 animate-spin" /> : t('install.confirm_yes')}
                                </button>
                                <button
                                    onClick={() => setShowConfirmReinstall(false)}
                                    disabled={revoking}
                                    className="px-5 bg-white/5 text-white rounded-xl text-xs font-bold hover:bg-white/10 transition-all border border-white/5"
                                >
                                    {t('install.confirm_back')}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STATE 2: NO INSTALL (OR NEW LINK GENERATED) - SHOW INSTALL BUTTON/LINK */}
                    {(!hasActiveInstall || installUrl) && !showConfirmReinstall && (
                        !installUrl ? (
                            <button
                                onClick={generateLink}
                                disabled={generating || license.status !== 'active'}
                                className="w-full md:w-72 flex items-center justify-center gap-3 px-8 py-5 bg-primary hover:bg-primary-hover text-white rounded-[1.25rem] font-black transition-all shadow-2xl shadow-primary/30 active:scale-95 disabled:opacity-50"
                            >
                                {generating ? <Loader2 className="w-6 h-6 animate-spin" /> : <Zap className="w-6 h-6" />}
                                <span className="text-lg">{t('install.generate_token')}</span>
                            </button>
                        ) : (
                            <div className="w-full md:w-96 animate-in fade-in slide-in-from-right duration-500">
                                <div className="bg-white/5 border border-primary/30 rounded-2xl p-4 mb-4 backdrop-blur-md">
                                    <code className="text-primary text-xs break-all block font-bold leading-relaxed">{installUrl}</code>
                                </div>
                                <div className="flex flex-col gap-3">
                                    <div className="flex gap-3">
                                        <a
                                            href={installUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex-1 bg-white text-black hover:bg-gray-200 font-black py-4 rounded-xl text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
                                        >
                                            {t('install.open_panel')} <ArrowRight className="w-4 h-4" />
                                        </a>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(installUrl);
                                                alert(t('install.link_copied'));
                                            }}
                                            className="px-6 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/10 transition-all active:scale-90"
                                            title={t('install.copy_link')}
                                        >
                                            <Copy className="w-5 h-5" />
                                        </button>
                                    </div>
                                    <button
                                        onClick={handleReinstall}
                                        disabled={generating || revoking}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-400/5 hover:bg-red-400/10 text-red-400/60 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-colors border border-red-400/10"
                                    >
                                        {revoking ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                                        {t('install.reset_emergency')}
                                    </button>
                                </div>
                            </div>
                        )
                    )}
                </div>
            </div>

            {/* Limit Nudge for FREE Plan */}
            {license?.plan === 'free' && hasActiveInstall && !installUrl && (
                <div className="mt-12 p-1 bg-gradient-to-r from-primary/20 to-transparent rounded-[1.5rem] overflow-hidden">
                    <div className="p-6 bg-[#05050A]/60 backdrop-blur-3xl rounded-[1.4rem] flex flex-col md:flex-row items-center justify-between gap-6 border border-white/5">
                        <div className="flex items-center gap-5 text-center md:text-left flex-col md:flex-row">
                            <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center text-primary shrink-0 shadow-inner">
                                <Zap className="w-7 h-7" />
                            </div>
                            <div>
                                <p className="text-xl font-black text-white font-display italic uppercase tracking-tighter leading-none mb-1">{t('install.scaling_title')}</p>
                                <p className="text-gray-500 font-medium text-sm">{t('install.limit_nudge')}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                if (upgradeProduct?.checkout_url && upgradeProduct?.saas_plan_slug) {
                                    void openUpgradeCheckout({
                                        checkoutUrl: upgradeProduct.checkout_url,
                                        planSlug: upgradeProduct.saas_plan_slug as 'upgrade_domains' | 'whitelabel' | 'saas',
                                        productId: upgradeProduct.id,
                                        sourceSurface: 'portal',
                                        sourceContext: {
                                            trigger: 'install_tab_limit_nudge',
                                            location: 'portal_install_tab',
                                        },
                                    });
                                    return;
                                }

                                onNavigate?.('opportunity');
                            }}
                            className="whitespace-nowrap px-8 py-4 bg-primary hover:bg-primary-hover text-white text-sm font-black rounded-xl transition-all active:scale-95 shadow-lg shadow-primary/20 border-none uppercase tracking-widest italic"
                        >
                            {t('install.upgrade_button')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

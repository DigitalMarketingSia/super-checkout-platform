import React, { useState, useEffect } from 'react';
import {
  Plug,
  Webhook,
  BarChart,
  Check,
  Zap,
  ShieldCheck,
  Globe,
  Code,
  ChevronRight,
  Mail
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Layout } from '../components/Layout';
import { Card } from '../components/ui/Card';
import { ResendConfigModal } from '../components/modals/ResendConfigModal';
import { storage } from '../services/storageService';
import { Button } from '../components/ui/Button';

export const IntegrationsHub: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [isResendModalOpen, setIsResendModalOpen] = useState(false);
    const [isResendActive, setIsResendActive] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadIntegrationStatus();
    }, []);

    const loadIntegrationStatus = async () => {
        try {
            const resendIntegration = await storage.getIntegration('resend');
            setIsResendActive(resendIntegration?.active || false);
        } catch (error) {
            console.error('Error loading integration status:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleResendModalClose = () => {
        setIsResendModalOpen(false);
        loadIntegrationStatus();
    };

    return (
        <Layout>
            <div className="space-y-8 pb-24 max-w-6xl mx-auto px-4 md:px-0 relative animate-in fade-in duration-500">
                {/* Premium Design Glows */}
                <div className="absolute top-10 left-1/4 w-[500px] h-[500px] bg-primary/10 blur-[150px] rounded-full pointer-events-none -z-10 animate-pulse-slow" />
                <div className="absolute top-40 right-1/4 w-[400px] h-[400px] bg-purple-500/5 blur-[120px] rounded-full pointer-events-none -z-10" />

                {/* Dashboard-Style Title & Info Bar */}
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-3xl lg:text-4xl font-portal-display text-white mb-1 leading-none uppercase italic tracking-tight">
                                {t('coverage.integration.title_prefix')} <span className="text-primary font-black">{t('coverage.integration.title_suffix')}</span>
                            </h1>
                            <div className="flex items-center gap-2 mt-1">
                                <p className="text-gray-400 font-medium uppercase tracking-[0.15em] text-[9px] font-mono">
                                    {t('coverage.integration.center')}
                                </p>
                                <div className="h-1.5 w-1.5 rounded-full bg-primary/45"></div>
                                <span className="text-[9px] text-[#10B981] font-black uppercase tracking-[0.2em] font-mono">{t('coverage.integration.active_control')}</span>
                            </div>
                        </div>

                        {/* Tactical Status Tag */}
                        <div className="flex flex-row flex-wrap items-center gap-2.5 font-mono">
                            <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.12em] border ${isResendActive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25 shadow-[0_2px_10px_rgba(16,185,129,0.05)]' : 'bg-white/5 text-gray-500 border-white/10'}`}>
                                <Plug className="w-3.5 h-3.5" />
                                {t('coverage.integration.api_status')}: {isResendActive ? t('coverage.integration.connected') : t('coverage.integration.setup_required')}
                            </span>
                        </div>
                    </div>
                    <p className="text-xs text-gray-300 max-w-2xl leading-relaxed italic border-l border-primary/30 pl-4 font-medium">
                        {t('coverage.integration.description')}
                    </p>
                </div>

                {/* Grid layout */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">

                    {/* Resend Card */}
                    <div
                        className={`group relative overflow-hidden rounded-[2rem] bg-[#0C0C14] border border-white/10 shadow-xl transition-all duration-500 hover:border-primary/40 hover:shadow-[0_4px_24px_rgba(138,43,226,0.18)] hover:-translate-y-1 cursor-pointer`}
                        onClick={() => setIsResendModalOpen(true)}
                    >
                        {/* Status Badge */}
                        <div className="absolute top-6 right-6 z-10 font-mono">
                            {isResendActive ? (
                                <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 rounded-full text-[9px] font-black uppercase tracking-wider shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    {t('coverage.integration.connected')}
                                </span>
                            ) : (
                                <span className="px-3 py-1 bg-white/5 text-gray-400 border border-white/10 rounded-full text-[9px] font-black uppercase tracking-wider">
                                    {t('coverage.integration.email_api')}
                                </span>
                            )}
                        </div>

                        <div className="p-8">
                            <div className="mb-6">
                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-white/10 to-transparent flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform duration-500 shadow-xl shadow-black/20">
                                    <Mail className="w-7 h-7 text-white animate-pulse-slow" />
                                </div>
                            </div>

                            <h3 className="text-2xl font-portal-display text-white mb-2 group-hover:text-primary transition-colors italic">
                                Resend
                            </h3>
                            <p className="text-xs text-gray-400 mb-8 font-medium leading-relaxed">
                                {t('coverage.integration.resend_description')}
                            </p>

                            <div className="flex items-center justify-between pt-6 border-t border-white/5">
                                <div className="flex items-center gap-2 text-[9px] uppercase font-black tracking-widest text-gray-500 font-mono">
                                    <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                                    {t('coverage.integration.ssl_secure')}
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => setIsResendModalOpen(true)}
                                    className={`h-9 px-4 rounded-xl font-bold transition-all duration-300 ${
                                        isResendActive
                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20 shadow-none'
                                            : 'bg-primary hover:bg-primary-hover text-white shadow-[0_4px_12px_rgba(138,43,226,0.3)]'
                                    }`}
                                >
                                    {isResendActive ? t('coverage.integration.configure') : t('coverage.integration.connect')} <ChevronRight className="w-4 h-4 ml-1" />
                                </Button>
                            </div>
                        </div>
                        <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    </div>

                    {/* Webhooks Card */}
                    <div
                        className="group relative overflow-hidden rounded-[2rem] bg-[#0C0C14] border border-white/10 shadow-xl transition-all duration-500 hover:border-orange-500/40 hover:shadow-[0_4px_24px_rgba(249,115,22,0.12)] hover:-translate-y-1 cursor-pointer"
                        onClick={() => navigate('/admin/webhooks')}
                    >
                        <div className="absolute top-6 right-6 z-10 font-mono">
                            <span className="px-3 py-1 bg-white/5 text-gray-400 border border-white/10 rounded-full text-[9px] font-black uppercase tracking-wider">
                                {t('coverage.integration.webhook_hub')}
                            </span>
                        </div>

                        <div className="p-8">
                            <div className="mb-6">
                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500/20 to-transparent flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform duration-500 shadow-xl shadow-black/20">
                                    <Webhook className="w-7 h-7 text-orange-500 animate-pulse-slow" />
                                </div>
                            </div>

                            <h3 className="text-2xl font-portal-display text-white mb-2 group-hover:text-orange-500 transition-colors italic">
                                Webhooks
                            </h3>
                            <p className="text-xs text-gray-400 mb-8 font-medium leading-relaxed">
                                {t('coverage.integration.webhook_description')}
                            </p>

                            <div className="flex items-center justify-between pt-6 border-t border-white/5">
                                <div className="flex items-center gap-2 text-[9px] uppercase font-black tracking-widest text-gray-500 font-mono">
                                    <Code className="w-3.5 h-3.5 text-orange-500" />
                                    {t('coverage.integration.rest_api')}
                                </div>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-9 px-4 rounded-xl border border-white/10 hover:border-orange-500/50 hover:bg-orange-500/10 hover:text-orange-400 text-white font-bold transition-all duration-300"
                                >
                                    {t('coverage.integration.manage')} <ChevronRight className="w-4 h-4 ml-1" />
                                </Button>
                            </div>
                        </div>
                        <div className="absolute inset-0 bg-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    </div>

                    {/* Analytics Card */}
                    <div
                        className="group relative overflow-hidden rounded-[2rem] bg-[#0C0C14] border border-white/10 shadow-xl transition-all duration-500 hover:border-blue-500/40 hover:shadow-[0_4px_24px_rgba(59,130,246,0.12)] hover:-translate-y-1 cursor-pointer"
                        onClick={() => navigate('/admin/checkouts')}
                    >
                        <div className="absolute top-6 right-6 z-10 font-mono">
                            <span className="px-3 py-1 bg-white/5 text-gray-400 border border-white/10 rounded-full text-[9px] font-black uppercase tracking-wider">
                                {t('coverage.integration.pixel_hub')}
                            </span>
                        </div>

                        <div className="p-8">
                            <div className="mb-6">
                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-transparent flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform duration-500 shadow-xl shadow-black/20">
                                    <BarChart className="w-7 h-7 text-blue-500 animate-pulse-slow" />
                                </div>
                            </div>

                            <h3 className="text-2xl font-portal-display text-white mb-2 group-hover:text-blue-500 transition-colors italic">
                                Analytics
                            </h3>
                            <p className="text-xs text-gray-400 mb-8 font-medium leading-relaxed">
                                {t('coverage.integration.analytics_description')}
                            </p>

                            <div className="flex items-center justify-between pt-6 border-t border-white/5">
                                <div className="flex items-center gap-2 text-[9px] uppercase font-black tracking-widest text-gray-500 font-mono">
                                    <Globe className="w-3.5 h-3.5 text-blue-500" />
                                    {t('coverage.integration.global_tracking')}
                                </div>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-9 px-4 rounded-xl border border-white/10 hover:border-blue-500/50 hover:bg-blue-500/10 hover:text-blue-400 text-white font-bold transition-all duration-300"
                                >
                                    {t('coverage.integration.checkouts')} <ChevronRight className="w-4 h-4 ml-1" />
                                </Button>
                            </div>
                        </div>
                        <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    </div>

                </div>

                {/* Coming Soon Section */}
                <div className="mt-12 p-8 rounded-[2.5rem] bg-[#0C0C14] border border-dashed border-white/10 text-center relative overflow-hidden transition-all duration-300 hover:border-white/20 group">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-primary/5 blur-[80px] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                    <Zap className="w-10 h-10 text-primary mx-auto mb-4 animate-bounce" />
                    <h4 className="text-lg font-portal-display text-gray-400 italic">{t('coverage.integration.coming_soon_title')}</h4>
                    <p className="text-xs text-gray-500 font-semibold mt-2 leading-relaxed">{t('coverage.integration.coming_soon_description')}</p>
                </div>

                <ResendConfigModal
                    isOpen={isResendModalOpen}
                    onClose={handleResendModalClose}
                />
            </div>
        </Layout>
    );
};

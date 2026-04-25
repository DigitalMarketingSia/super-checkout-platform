import React, { useState, useEffect } from 'react';
import { 
  Plug, 
  Webhook, 
  BarChart, 
  Check, 
  ArrowRight, 
  Zap, 
  ShieldCheck, 
  Globe, 
  Code,
  ExternalLink,
  ChevronRight,
  Mail
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Card } from '../components/ui/Card';
import { ResendConfigModal } from '../components/modals/ResendConfigModal';
import { storage } from '../services/storageService';
import { Button } from '../components/ui/Button';
import Aurora from '../components/ui/Aurora';

export const IntegrationsHub: React.FC = () => {
    const navigate = useNavigate();
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
            <div className="space-y-12 pb-20">
                
                {/* Header Premium Section */}
                <div className="relative h-64 rounded-[2.5rem] overflow-hidden flex items-center px-10 lg:px-16 mb-12 shadow-2xl group bg-[#0A0A15]">
                    <div className="absolute inset-0 bg-gradient-to-r from-[#05050A] via-transparent to-transparent z-10" />
                    
                    <div className="relative z-20">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="p-3 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 shadow-xl">
                                <Plug className="w-8 h-8 text-white animate-pulse" />
                            </div>
                            <h1 className="text-4xl lg:text-7xl font-portal-display text-white tracking-tighter drop-shadow-2xl italic">
                                HUB DE <span className="text-primary">INTEGRAÇÕES</span>
                            </h1>
                        </div>
                        <p className="text-lg text-white/50 font-medium max-w-lg leading-relaxed">
                            Conecte o Super Checkout às suas ferramentas favoritas e automatize sua operação global.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    
                    {/* Resend Card */}
                    <div 
                        className={`group relative overflow-hidden rounded-[2rem] bg-[#0A0A15]/60 border border-white/5 backdrop-blur-md transition-all duration-500 hover:border-primary/30 hover:shadow-[0_0_30px_rgba(138,43,226,0.15)] hover:-translate-y-1 cursor-pointer ${
                            isResendActive ? 'ring-1 ring-emerald-500/30' : ''
                        }`}
                        onClick={() => setIsResendModalOpen(true)}
                    >
                        {/* Status Badge */}
                        <div className="absolute top-6 right-6 z-10">
                            {isResendActive ? (
                                <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[10px] font-black uppercase tracking-wider shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    Conectado
                                </span>
                            ) : (
                                <span className="px-3 py-1 bg-white/5 text-gray-500 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-wider">
                                    E-mail API
                                </span>
                            )}
                        </div>

                        <div className="p-8">
                            <div className="mb-6">
                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-white/10 to-transparent flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform duration-500 shadow-xl shadow-black/20">
                                    <Mail className="w-7 h-7 text-white" />
                                </div>
                            </div>

                            <h3 className="text-2xl font-portal-display text-white mb-2 group-hover:text-primary transition-colors italic">
                                Resend
                            </h3>
                            <p className="text-sm text-gray-400 mb-8 font-medium opacity-70 group-hover:opacity-100 transition-opacity leading-relaxed">
                                Envie e-mails transacionais com altíssima entregabilidade através da API premium do Resend.
                            </p>

                            <div className="flex items-center justify-between pt-6 border-t border-white/5">
                                <div className="flex items-center gap-2 text-[10px] uppercase font-black tracking-widest text-gray-500">
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    SSL Seguro
                                </div>
                                <Button 
                                    size="sm"
                                    className={`${isResendActive ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' : ''}`}
                                >
                                    {isResendActive ? 'Configurar' : 'Conectar'} <ChevronRight className="w-4 h-4 ml-1" />
                                </Button>
                            </div>
                        </div>

                        {/* Hover Overlay Glow */}
                        <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    </div>

                    {/* Webhooks Card */}
                    <div 
                        className="group relative overflow-hidden rounded-[2rem] bg-[#0A0A15]/60 border border-white/5 backdrop-blur-md transition-all duration-500 hover:border-orange-500/30 hover:shadow-[0_0_30px_rgba(249,115,22,0.1)] hover:-translate-y-1 cursor-pointer"
                        onClick={() => navigate('/admin/webhooks')}
                    >
                        <div className="absolute top-6 right-6 z-10">
                            <span className="px-3 py-1 bg-white/5 text-gray-500 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-wider">
                                Webhook Hub
                            </span>
                        </div>

                        <div className="p-8">
                            <div className="mb-6">
                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500/20 to-transparent flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform duration-500 shadow-xl shadow-black/20">
                                    <Webhook className="w-7 h-7 text-orange-500" />
                                </div>
                            </div>

                            <h3 className="text-2xl font-portal-display text-white mb-2 group-hover:text-orange-500 transition-colors italic">
                                Webhooks
                            </h3>
                            <p className="text-sm text-gray-400 mb-8 font-medium opacity-70 group-hover:opacity-100 transition-opacity leading-relaxed">
                                Sincronize dados em tempo real com plataformas externas através de triggers inteligentes.
                            </p>

                            <div className="flex items-center justify-between pt-6 border-t border-white/5">
                                <div className="flex items-center gap-2 text-[10px] uppercase font-black tracking-widest text-gray-500">
                                    <Code className="w-3.5 h-3.5" />
                                    REST API
                                </div>
                                <Button 
                                    size="sm"
                                    variant="ghost"
                                    className="border border-white/10 hover:border-orange-500/50 hover:text-orange-500"
                                >
                                    Gerenciar <ChevronRight className="w-4 h-4 ml-1" />
                                </Button>
                            </div>
                        </div>
                        <div className="absolute inset-0 bg-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    </div>

                    {/* Analytics Card */}
                    <div 
                        className="group relative overflow-hidden rounded-[2rem] bg-[#0A0A15]/60 border border-white/5 backdrop-blur-md transition-all duration-500 hover:border-blue-500/30 hover:shadow-[0_0_30px_rgba(59,130,246,0.1)] hover:-translate-y-1 cursor-pointer"
                        onClick={() => navigate('/admin/checkouts')}
                    >
                        <div className="absolute top-6 right-6 z-10">
                            <span className="px-3 py-1 bg-white/5 text-gray-500 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-wider">
                                Pixel Hub
                            </span>
                        </div>

                        <div className="p-8">
                            <div className="mb-6">
                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-transparent flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform duration-500 shadow-xl shadow-black/20">
                                    <BarChart className="w-7 h-7 text-blue-500" />
                                </div>
                            </div>

                            <h3 className="text-2xl font-portal-display text-white mb-2 group-hover:text-blue-500 transition-colors italic">
                                Analytics
                            </h3>
                            <p className="text-sm text-gray-400 mb-8 font-medium opacity-70 group-hover:opacity-100 transition-opacity leading-relaxed">
                                Rastreie conversões do Facebook, TikTok e Google de forma centralizada por checkout.
                            </p>

                            <div className="flex items-center justify-between pt-6 border-t border-white/5">
                                <div className="flex items-center gap-2 text-[10px] uppercase font-black tracking-widest text-gray-500">
                                    <Globe className="w-3.5 h-3.5" />
                                    Global Tracking
                                </div>
                                <Button 
                                    size="sm"
                                    variant="ghost"
                                    className="border border-white/10 hover:border-blue-500/50 hover:text-blue-500"
                                >
                                    Ir p/ Checkouts <ChevronRight className="w-4 h-4 ml-1" />
                                </Button>
                            </div>
                        </div>
                        <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                    </div>

                </div>

                {/* Coming Soon Section */}
                <div className="mt-12 p-8 lg:p-12 rounded-[3rem] bg-white/[0.02] border border-dashed border-white/10 text-center relative overflow-hidden group">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-primary/5 blur-[80px] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                    <Zap className="w-10 h-10 text-gray-700 mx-auto mb-4" />
                    <h4 className="text-xl font-portal-display text-gray-500 italic">Novas Integrações em Breve</h4>
                    <p className="text-sm text-gray-600 font-medium mt-2">Estamos trabalhando em conectores nativos para ActiveCampaign, Hotmart e muito mais.</p>
                </div>
            </div>

            <ResendConfigModal
                isOpen={isResendModalOpen}
                onClose={handleResendModalClose}
            />
        </Layout>
    );
};

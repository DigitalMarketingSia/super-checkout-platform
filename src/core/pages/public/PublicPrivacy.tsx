import React, { useEffect, useState } from 'react';
import { storage } from '../../services/storageService';
import { Loading } from '../../components/ui/Loading';
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import {
    buildDefaultPrivacyPolicy,
    getEffectiveLegalDocumentInfo,
    getBusinessLegalIdentity,
    type BusinessLegalSettingsLike,
} from '../../utils/legalDocuments';

const formatUpdatedAt = (value?: string | null) => {
    if (!value) return 'nao informado';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'nao informado';

    return date.toLocaleDateString('pt-BR');
};

export const PublicPrivacy = () => {
    const [settings, setSettings] = useState<BusinessLegalSettingsLike | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            const urlParams = new URLSearchParams(window.location.search);
            const checkoutId = urlParams.get('c');
            const memberAreaId = urlParams.get('ma');

            let data;
            if (checkoutId) {
                console.log('[PublicPrivacy] Loading settings for checkout:', checkoutId);
                data = await storage.getBusinessSettingsByCheckoutId(checkoutId);
            }

            if (!data && memberAreaId) {
                console.log('[PublicPrivacy] Loading settings for member area:', memberAreaId);
                data = await storage.getBusinessSettingsByMemberAreaId(memberAreaId);
            }

            if (!data) {
                console.log('[PublicPrivacy] Loading settings via hostname fallback');
                data = await storage.getBusinessSettingsByHostname(window.location.hostname);
            }

            setSettings(data);
            setLoading(false);
        };

        load();
    }, []);

    if (loading) return <Loading />;

    const handleClose = () => {
        if (window.history.length > 1) {
            window.history.back();
            return;
        }

        window.close();
    };

    const businessIdentity = getBusinessLegalIdentity(settings);
    const businessName = businessIdentity.businessName;
    const controllerName = businessIdentity.legalName;
    const privacyDocument = getEffectiveLegalDocumentInfo('privacy_policy', settings, buildDefaultPrivacyPolicy);
    const finalContent = privacyDocument.content;
    const sourceLabel = privacyDocument.sourceLabel;

    return (
        <div className="min-h-screen bg-[#05050A] text-white selection:bg-primary/30">
            <header className="border-b border-white/5 bg-white/[0.02] backdrop-blur-xl sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
                            <ShieldCheck className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold tracking-tight">Politica de Privacidade</h1>
                            <p className="text-xs text-gray-500 uppercase tracking-widest font-medium">{businessName}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="text-gray-400 hover:text-white transition-colors flex items-center gap-2 text-sm font-medium"
                    >
                        <ArrowLeft className="w-4 h-4" /> Fechar
                    </button>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-6 py-12">
                <div className="bg-[#0F0F13] border border-white/5 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32" />

                    <div className="relative z-10 mb-8 rounded-2xl border border-white/5 bg-white/[0.02] p-6 text-sm text-gray-300">
                        <p><span className="font-semibold text-white">Controlador informado:</span> {controllerName}</p>
                        <p><span className="font-semibold text-white">Canal de contato:</span> {businessIdentity.legalContact}</p>
                        <p><span className="font-semibold text-white">Origem do documento:</span> {sourceLabel}</p>
                        <p><span className="font-semibold text-white">Versao vigente:</span> {privacyDocument.version}</p>
                        <p><span className="font-semibold text-white">Publicado em:</span> {formatUpdatedAt(privacyDocument.publishedAt)}</p>
                        <p><span className="font-semibold text-white">Ultima atualizacao cadastrada:</span> {formatUpdatedAt(settings?.updated_at)}</p>
                        <p><span className="font-semibold text-white">Checkout hospedado:</span> quando o vendedor habilita mensuracao comercial, esta superficie pode registrar parametros de campanha e eventos de inicio ou conclusao da compra para analytics, atribuicao e deduplicacao.</p>
                        <p><span className="font-semibold text-white">Minimizacao operacional:</span> telefone e documento so devem ser exigidos quando necessarios para o metodo de pagamento, antifraude, conciliacao ou suporte da compra.</p>
                    </div>

                    <div className="relative z-10 prose prose-invert prose-purple max-w-none">
                        <div className="whitespace-pre-wrap leading-relaxed text-gray-300 text-base md:text-lg">
                            {finalContent}
                        </div>
                    </div>
                </div>

                <footer className="mt-12 text-center text-gray-600 text-sm pb-12">
                    <p>(c) 2026 {businessName}. Todos os direitos reservados.</p>
                </footer>
            </main>
        </div>
    );
};

import React, { useEffect, useState } from 'react';
import { storage } from '../../services/storageService';
import { Loading } from '../../components/ui/Loading';
import { ShieldCheck, ArrowLeft } from 'lucide-react';

export const PublicPrivacy = () => {
    const [settings, setSettings] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            const urlParams = new URLSearchParams(window.location.search);
            const checkoutId = urlParams.get('c');
            
            let data;
            if (checkoutId) {
                console.log('[PublicPrivacy] Loading settings for checkout:', checkoutId);
                data = await storage.getBusinessSettingsByCheckoutId(checkoutId);
            }
            
            // Fallback to hostname if no checkoutId or no data found via checkoutId
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

    const content = settings?.privacy_policy || 'A política de privacidade ainda não foi configurada por este vendedor.';
    const businessName = settings?.business_name || 'Este Vendedor';

    // Replace placeholders
    const finalContent = content
        .replace(/{{business_name}}/g, businessName)
        .replace(/{{support_email}}/g, settings?.support_email || '');

    return (
        <div className="min-h-screen bg-[#05050A] text-white selection:bg-primary/30">
            {/* Header */}
            <header className="border-b border-white/5 bg-white/[0.02] backdrop-blur-xl sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
                            <ShieldCheck className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold tracking-tight">Política de Privacidade</h1>
                            <p className="text-xs text-gray-500 uppercase tracking-widest font-medium">{businessName}</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => window.close()} 
                        className="text-gray-400 hover:text-white transition-colors flex items-center gap-2 text-sm font-medium"
                    >
                        <ArrowLeft className="w-4 h-4" /> Fechar
                    </button>
                </div>
            </header>

            {/* Content */}
            <main className="max-w-4xl mx-auto px-6 py-12">
                <div className="bg-[#0F0F13] border border-white/5 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32" />
                    
                    <div className="relative z-10 prose prose-invert prose-purple max-w-none">
                        <div className="whitespace-pre-wrap leading-relaxed text-gray-300 text-base md:text-lg">
                            {finalContent}
                        </div>
                    </div>
                </div>

                <footer className="mt-12 text-center text-gray-600 text-sm pb-12">
                    <p>© 2026 {businessName}. Todos os direitos reservados.</p>
                </footer>
            </main>
        </div>
    );
};

import React from 'react';
import { FileText, ArrowLeft } from 'lucide-react';
import {
    formatPlatformLegalPublishedAt,
    PLATFORM_LEGAL_CONTACT_EMAIL,
    PLATFORM_LEGAL_ENTITY,
    PLATFORM_LEGAL_NAME,
    PLATFORM_LEGAL_VERSION,
    PLATFORM_TERMS_SECTIONS,
} from '../../config/platformLegal';

export const PlatformTerms = () => {
    return (
        <div className="min-h-screen bg-[#05050A] text-white selection:bg-primary/30">
            <header className="border-b border-white/5 bg-white/[0.02] backdrop-blur-xl sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
                            <FileText className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold tracking-tight">Termos de Uso</h1>
                            <p className="text-xs text-gray-500 uppercase tracking-widest font-medium">{PLATFORM_LEGAL_NAME}</p>
                        </div>
                    </div>
                    <button
                        onClick={() => window.history.back()}
                        className="text-gray-400 hover:text-white transition-colors flex items-center gap-2 text-sm font-medium"
                    >
                        <ArrowLeft className="w-4 h-4" /> Voltar
                    </button>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-6 py-12">
                <div className="bg-[#0F0F13] border border-white/5 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32" />

                    <div className="relative z-10 mb-8 rounded-2xl border border-white/5 bg-white/[0.02] p-6 text-sm text-gray-300">
                        <p><span className="font-semibold text-white">Operador desta superficie:</span> {PLATFORM_LEGAL_ENTITY}</p>
                        <p><span className="font-semibold text-white">Versao vigente:</span> {PLATFORM_LEGAL_VERSION}</p>
                        <p><span className="font-semibold text-white">Publicado em:</span> {formatPlatformLegalPublishedAt()}</p>
                        <p><span className="font-semibold text-white">Canal oficial:</span> <a href={`mailto:${PLATFORM_LEGAL_CONTACT_EMAIL}`} className="underline underline-offset-4 hover:text-white transition-colors">{PLATFORM_LEGAL_CONTACT_EMAIL}</a></p>
                    </div>

                    <div className="relative z-10 space-y-8 text-gray-300 leading-relaxed">
                        {PLATFORM_TERMS_SECTIONS.map((section) => (
                            <section key={section.title} className="space-y-3">
                                <h2 className="text-xl font-bold text-white">{section.title}</h2>
                                {section.paragraphs.map((paragraph) => (
                                    <p key={paragraph}>{paragraph}</p>
                                ))}
                            </section>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
};

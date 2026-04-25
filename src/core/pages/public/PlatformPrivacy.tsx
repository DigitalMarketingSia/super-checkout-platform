import React from 'react';
import { ShieldCheck, ArrowLeft } from 'lucide-react';

export const PlatformPrivacy = () => {
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
                            <p className="text-xs text-gray-500 uppercase tracking-widest font-medium">Super Checkout</p>
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

                    <div className="relative z-10 space-y-8 text-gray-300 leading-relaxed">
                        <section className="space-y-3">
                            <h2 className="text-xl font-bold text-white">1. Dados coletados</h2>
                            <p>
                                O Super Checkout pode tratar dados informados no cadastro, como nome, e-mail, eventos de
                                acesso, informacoes tecnicas da sessao e dados operacionais necessarios para liberar e
                                proteger o uso da plataforma.
                            </p>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-xl font-bold text-white">2. Finalidade do tratamento</h2>
                            <p>
                                Esses dados sao utilizados para autenticacao, seguranca, prevencao de abuso, comunicacoes
                                transacionais, liberacao de licenca, suporte e melhoria continua da experiencia do portal.
                            </p>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-xl font-bold text-white">3. Compartilhamento</h2>
                            <p>
                                Os dados nao sao compartilhados de forma indiscriminada. Eles podem ser processados por
                                provedores de infraestrutura, autenticacao, envio de e-mail e analytics estritamente
                                necessarios para a operacao do servico.
                            </p>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-xl font-bold text-white">4. Seguranca e retencao</h2>
                            <p>
                                Adotamos controles tecnicos e operacionais para reduzir abuso, acesso indevido e uso
                                automatizado. Os dados sao mantidos pelo periodo necessario para cumprir obrigacoes
                                operacionais, legais e de seguranca.
                            </p>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-xl font-bold text-white">5. Direitos do usuario</h2>
                            <p>
                                O titular pode solicitar atualizacao, correcao ou revisao de dados conforme a legislacao
                                aplicavel e os canais oficiais disponibilizados pelo Super Checkout.
                            </p>
                        </section>
                    </div>
                </div>
            </main>
        </div>
    );
};

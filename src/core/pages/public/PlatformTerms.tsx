import React from 'react';
import { FileText, ArrowLeft } from 'lucide-react';

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
                            <h2 className="text-xl font-bold text-white">1. Uso da plataforma</h2>
                            <p>
                                O Super Checkout disponibiliza acesso ao portal, recursos de ativacao, instalacao e
                                administracao do sistema conforme o plano liberado para cada conta.
                            </p>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-xl font-bold text-white">2. Conta e responsabilidade</h2>
                            <p>
                                O titular da conta e responsavel pelas informacoes fornecidas, pelo uso do acesso e pela
                                seguranca das credenciais utilizadas no portal.
                            </p>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-xl font-bold text-white">3. Licenca gratuita</h2>
                            <p>
                                A licenca gratuita pode ser liberada somente apos confirmacao valida do e-mail e aceite
                                expresso destes termos. O acesso pode ser limitado, suspenso ou revisto em caso de abuso,
                                fraude, automacao indevida ou violacao das politicas da plataforma.
                            </p>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-xl font-bold text-white">4. Uso indevido</h2>
                            <p>
                                Nao e permitido utilizar o portal para fraude, tentativa de invasao, criacao massiva de
                                contas, distribuicao de spam ou qualquer atividade que comprometa a infraestrutura, a
                                operacao de terceiros ou a integridade do ecossistema.
                            </p>
                        </section>

                        <section className="space-y-3">
                            <h2 className="text-xl font-bold text-white">5. Contato</h2>
                            <p>
                                Dúvidas operacionais ou contratuais podem ser tratadas pelos canais oficiais do Super
                                Checkout informados no proprio ecossistema.
                            </p>
                        </section>
                    </div>
                </div>
            </main>
        </div>
    );
};

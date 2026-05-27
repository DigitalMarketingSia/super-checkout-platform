import React from 'react';
import { ShieldCheck, ArrowLeft } from 'lucide-react';

export const PlatformPrivacy = () => {
    const sections = [
        {
            title: '1. Escopo e papeis de tratamento',
            paragraphs: [
                'Esta politica descreve como o Super Checkout trata dados pessoais nas superficies de cadastro, autenticacao, portal administrativo, instalacao, licenciamento, checkout, webhooks, comunicacoes transacionais e area de membros.',
                'No relacionamento com a conta do lojista, o Super Checkout pode atuar como controlador dos dados cadastrais e operacionais do proprio usuario da plataforma. Nos checkouts operados para terceiros, o vendedor normalmente atua como controlador principal dos dados do comprador e o Super Checkout fornece a infraestrutura tecnica como operador ou suboperador.',
            ],
        },
        {
            title: '2. Dados que podem ser tratados',
            paragraphs: [
                'Podemos tratar nome, e-mail, telefone, dados de perfil, credenciais de autenticacao, logs de acesso, eventos de seguranca, dominio, configuracoes de negocio, licencas, historico operacional, pedidos, pagamentos, identificadores de transacao e dados tecnicos como IP, user agent, origem de campanha e cookies estritamente necessarios.',
                'Numeros completos de cartao nao sao armazenados pelo Super Checkout. Dados de pagamento sensiveis permanecem sob tratamento direto dos processadores contratados para a operacao.',
            ],
        },
        {
            title: '3. Finalidades e bases operacionais',
            paragraphs: [
                'Os dados sao utilizados para autenticar usuarios, habilitar licencas, publicar e operar checkouts, processar pedidos, liberar acessos, enviar e-mails transacionais, prevenir fraude, registrar eventos criticos, responder a incidentes, prestar suporte e cumprir obrigacoes legais, fiscais e regulatorias.',
                'Dependendo do contexto, o tratamento pode se apoiar na execucao contratual, no exercicio regular de direitos, em obrigacoes legais ou regulatorias e em interesses legitimos relacionados a seguranca, auditoria e continuidade operacional.',
            ],
        },
        {
            title: '4. Compartilhamento com terceiros',
            paragraphs: [
                'A infraestrutura atual pode envolver provedores como Supabase, Vercel, Resend, Stripe, Mercado Pago e Upstash. Quando o vendedor habilita mensuracao ou publicidade, integracoes como Google, Meta e TikTok tambem podem receber eventos vinculados a operacao sob responsabilidade do controlador aplicavel.',
                'O compartilhamento ocorre apenas na extensao necessaria para hospedagem, banco de dados, envio de e-mails, processamento de pagamento, antifraude, mensuracao, suporte tecnico e resposta a incidentes.',
            ],
        },
        {
            title: '5. Retencao e seguranca',
            paragraphs: [
                'Os dados sao mantidos pelo periodo necessario para operar a conta, executar pedidos, resguardar direitos, investigar abuso, cumprir obrigacoes legais e manter trilhas minimas de seguranca.',
                'Sao adotadas medidas tecnicas e organizacionais para restringir acessos, registrar eventos criticos e reduzir risco de fraude, abuso, exposicao indevida e uso automatizado da plataforma.',
            ],
        },
        {
            title: '6. Direitos do titular',
            paragraphs: [
                'O titular pode solicitar informacoes sobre os dados tratados, atualizacao, correcao, revisao de acessos e outras medidas cabiveis conforme a legislacao aplicavel e o papel exercido pelo Super Checkout em cada fluxo.',
                'Quando o Super Checkout estiver atuando apenas como operador de um vendedor, pedidos relacionados ao conteudo da venda, marketing ou cadastro do comprador podem depender do encaminhamento ao controlador principal da operacao.',
            ],
        },
        {
            title: '7. Incidentes e canais',
            paragraphs: [
                'Eventos relevantes de seguranca e abuso podem ser registrados para analise, contencao e evidencia tecnica. Comunicacoes formais sobre privacidade, seguranca ou exercicio de direitos devem usar os canais oficiais apresentados no ecossistema do Super Checkout e nos documentos do controlador aplicavel.',
            ],
        },
    ];

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
                        {sections.map((section) => (
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

import React from 'react';
import { FileText, ArrowLeft } from 'lucide-react';

export const PlatformTerms = () => {
    const sections = [
        {
            title: '1. Objeto do servico',
            paragraphs: [
                'O Super Checkout disponibiliza infraestrutura tecnica para autenticacao, licenciamento, administracao de checkouts, processamento operacional de pedidos, entrega de acessos e comunicacoes transacionais.',
                'O uso da plataforma nao transforma o Super Checkout em vendedor dos produtos cadastrados por terceiros, salvo quando isso estiver expressamente indicado em oferta propria do ecossistema.',
            ],
        },
        {
            title: '2. Conta, acesso e licenca',
            paragraphs: [
                'O titular da conta e responsavel por manter credenciais seguras, fornecer dados verdadeiros, revisar as configuracoes do negocio e controlar quem recebe acesso administrativo ao ambiente.',
                'Licencas, recursos e limites podem variar conforme o plano contratado, a instalacao ativa, o dominio autorizado e o historico de conformidade operacional da conta.',
            ],
        },
        {
            title: '3. Responsabilidades do vendedor',
            paragraphs: [
                'Quem publica checkouts e ofertas na plataforma responde pelo conteudo comercial, pela legalidade do produto, pelas politicas de privacidade e termos apresentados ao comprador, pelo atendimento ao titular e pelo cumprimento das regras fiscais, consumeristas e de protecao de dados aplicaveis ao seu negocio.',
                'O vendedor tambem deve revisar integracoes de pagamento, rastreamento, area de membros, webhooks e qualquer automacao que envie dados pessoais a terceiros.',
            ],
        },
        {
            title: '4. Uso proibido',
            paragraphs: [
                'Nao e permitido utilizar o Super Checkout para fraude, tentativa de invasao, envio massivo de spam, criacao artificial de contas, ocultacao de identidade, venda de conteudo ilicito ou qualquer pratica que exponha a infraestrutura, os compradores ou terceiros a risco indevido.',
                'Tambem e vedado contornar limites tecnicos, explorar falhas, manipular eventos de pagamento ou tentar burlar mecanismos de seguranca, antifraude ou auditoria.',
            ],
        },
        {
            title: '5. Integracoes, terceiros e dados',
            paragraphs: [
                'A operacao do sistema pode depender de provedores de infraestrutura, banco de dados, e-mail transacional, processamento de pagamento, cache e observabilidade. O uso dessas integracoes faz parte do funcionamento normal da plataforma.',
                'Quando o usuario habilita integracoes de analytics, anuncios, pixel, CRM externo ou outras conexoes, ele assume a responsabilidade por validar a necessidade, a base legal e os avisos publicos relacionados a esse compartilhamento.',
            ],
        },
        {
            title: '6. Suspensao, revisao e encerramento',
            paragraphs: [
                'Contas, instalacoes, dominios, checkouts ou recursos podem ser limitados, suspensos ou revistos em caso de abuso, risco de seguranca, violacao contratual, suspeita de fraude, exigencia regulatoria ou uso incompativel com a operacao do ecossistema.',
                'O encerramento do acesso nao afasta obrigacoes pendentes relacionadas a pedidos ja processados, disputas abertas, auditorias, logs tecnicos ou deveres legais de conservacao.',
            ],
        },
        {
            title: '7. Suporte, atualizacoes e canais oficiais',
            paragraphs: [
                'O Super Checkout pode atualizar rotas, fluxos, protecoes, provedores e componentes da infraestrutura para manter seguranca, compatibilidade e continuidade operacional.',
                'Duvidas contratuais, tecnicas ou operacionais devem ser tratadas pelos canais oficiais disponibilizados no proprio ecossistema do Super Checkout.',
            ],
        },
    ];

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

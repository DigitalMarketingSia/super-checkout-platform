export interface PlatformLegalSection {
    title: string;
    paragraphs: string[];
}

export const PLATFORM_LEGAL_NAME = 'Super Checkout';
export const PLATFORM_LEGAL_ENTITY = 'Super Checkout';
export const PLATFORM_LEGAL_CONTACT_EMAIL = 'suporte@supercheckout.app';
export const PLATFORM_LEGAL_VERSION = 'platform-core-2026.06.01-v1';
export const PLATFORM_LEGAL_PUBLISHED_AT = '2026-06-01T00:00:00.000Z';

export const formatPlatformLegalPublishedAt = (locale = 'pt-BR') => {
    const date = new Date(PLATFORM_LEGAL_PUBLISHED_AT);
    if (Number.isNaN(date.getTime())) return 'nao informado';
    return date.toLocaleDateString(locale);
};

export const PLATFORM_PRIVACY_SECTIONS: PlatformLegalSection[] = [
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
            'Podemos tratar nome, e-mail, telefone, dados de perfil, credenciais de autenticacao, logs de acesso, eventos de seguranca, dominio, configuracoes de negocio, licencas, historico operacional, pedidos, pagamentos, identificadores de transacao e dados tecnicos como IP, user agent, origem de campanha, identificadores de clique e cookies ou tecnologias de mensuracao quando habilitados no fluxo.',
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
            'Logs tecnicos e trilhas auxiliares podem seguir janelas operacionais menores e politicas internas de exclusao periodica, especialmente quando deixarem de ser necessarios para suporte, auditoria ou seguranca.',
            'Sao adotadas medidas tecnicas e organizacionais para restringir acessos, registrar eventos criticos e reduzir risco de fraude, abuso, exposicao indevida e uso automatizado da plataforma.',
        ],
    },
    {
        title: '6. Direitos do titular',
        paragraphs: [
            'O titular pode solicitar informacoes sobre os dados tratados, atualizacao, correcao, revisao de acessos e outras medidas cabiveis conforme a legislacao aplicavel e o papel exercido pelo Super Checkout em cada fluxo.',
            'As solicitacoes de privacidade podem ser registradas, acompanhadas e respondidas por trilha interna para garantir tratamento operacional, evidencia e eventual encaminhamento ao controlador principal aplicavel.',
            'Quando o Super Checkout estiver atuando apenas como operador de um vendedor, pedidos relacionados ao conteudo da venda, marketing ou cadastro do comprador podem depender do encaminhamento ao controlador principal da operacao.',
        ],
    },
    {
        title: '7. Canal oficial e incidentes',
        paragraphs: [
            `O canal institucional do ecossistema para privacidade, suporte operacional e assuntos legais desta politica e ${PLATFORM_LEGAL_CONTACT_EMAIL}. Esse e o ponto oficial para exercicio de direitos, duvidas sobre esta politica e comunicacoes iniciais sobre eventos relevantes de seguranca ligados a esta superficie.`,
            'Se o pedido estiver relacionado a uma compra feita em checkout de terceiro hospedado na plataforma, o Super Checkout pode orientar o titular e encaminhar a demanda ao vendedor responsavel pela operacao quando ele for o controlador principal daquele fluxo.',
        ],
    },
];

export const PLATFORM_TERMS_SECTIONS: PlatformLegalSection[] = [
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
        title: '7. Canais oficiais e atualizacoes',
        paragraphs: [
            'O Super Checkout pode atualizar rotas, fluxos, protecoes, provedores e componentes da infraestrutura para manter seguranca, compatibilidade e continuidade operacional.',
            `Duvidas contratuais, tecnicas ou operacionais sobre o uso desta plataforma devem ser tratadas pelo canal oficial ${PLATFORM_LEGAL_CONTACT_EMAIL}. Alteracoes relevantes nestes termos passam a valer a partir da publicacao da nova versao institucional.`,
        ],
    },
];

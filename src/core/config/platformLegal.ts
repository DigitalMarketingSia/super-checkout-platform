export interface PlatformLegalSection {
    title: string;
    paragraphs: string[];
}

export type PlatformLegalLocale = 'pt' | 'en' | 'es';

export const PLATFORM_LEGAL_NAME = 'Super Checkout';
export const PLATFORM_LEGAL_ENTITY = 'Super Checkout';
export const PLATFORM_LEGAL_CONTACT_EMAIL = 'suporte@supercheckout.app';
export const PLATFORM_LEGAL_VERSION = 'platform-core-2026.06.01-v1';
export const PLATFORM_LEGAL_PUBLISHED_AT = '2026-06-01T00:00:00.000Z';

export const resolvePlatformLegalLocale = (language: string): PlatformLegalLocale => {
    if (language.startsWith('es')) return 'es';
    if (language.startsWith('en')) return 'en';
    return 'pt';
};

export const resolvePlatformLegalDateLocale = (language: string) => {
    const locale = resolvePlatformLegalLocale(language);
    if (locale === 'es') return 'es-ES';
    if (locale === 'en') return 'en-US';
    return 'pt-BR';
};

export const formatPlatformLegalPublishedAt = (locale = 'pt-BR') => {
    const date = new Date(PLATFORM_LEGAL_PUBLISHED_AT);
    if (Number.isNaN(date.getTime())) {
        if (locale.startsWith('es')) return 'no informado';
        if (locale.startsWith('en')) return 'not informed';
        return 'nao informado';
    }

    return date.toLocaleDateString(locale);
};

const PLATFORM_PRIVACY_SECTIONS_BY_LOCALE: Record<PlatformLegalLocale, PlatformLegalSection[]> = {
    pt: [
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
    ],
    en: [
        {
            title: '1. Scope and processing roles',
            paragraphs: [
                'This policy describes how Super Checkout handles personal data across signup, authentication, administrative portal, installation, licensing, checkout, webhooks, transactional communications, and member area surfaces.',
                'In its relationship with the merchant account, Super Checkout may act as controller for the platform users own registration and operational data. In checkouts operated for third parties, the seller usually acts as the main controller of buyer data and Super Checkout provides the technical infrastructure as processor or subprocessor.',
            ],
        },
        {
            title: '2. Data that may be processed',
            paragraphs: [
                'We may process name, email, phone number, profile data, authentication credentials, access logs, security events, domain, business settings, licenses, operational history, orders, payments, transaction identifiers, and technical data such as IP, user agent, campaign source, click identifiers, and cookies or measurement technologies when enabled in the flow.',
                'Full card numbers are not stored by Super Checkout. Sensitive payment data remains under the direct processing of the providers contracted for the operation.',
            ],
        },
        {
            title: '3. Purposes and operational bases',
            paragraphs: [
                'Data is used to authenticate users, enable licenses, publish and operate checkouts, process orders, release access, send transactional emails, prevent fraud, record critical events, respond to incidents, provide support, and comply with legal, tax, and regulatory obligations.',
                'Depending on the context, processing may rely on contractual performance, the regular exercise of rights, legal or regulatory obligations, and legitimate interests related to security, auditing, and operational continuity.',
            ],
        },
        {
            title: '4. Sharing with third parties',
            paragraphs: [
                'The current infrastructure may involve providers such as Supabase, Vercel, Resend, Stripe, Mercado Pago, and Upstash. When the seller enables measurement or advertising, integrations such as Google, Meta, and TikTok may also receive events linked to the operation under the responsibility of the applicable controller.',
                'Sharing occurs only to the extent necessary for hosting, database, email delivery, payment processing, antifraud, measurement, technical support, and incident response.',
            ],
        },
        {
            title: '5. Retention and security',
            paragraphs: [
                'Data is kept for the period necessary to operate the account, execute orders, preserve rights, investigate abuse, comply with legal obligations, and maintain minimum security trails.',
                'Technical logs and auxiliary trails may follow shorter operational windows and periodic deletion policies, especially when they are no longer needed for support, auditing, or security.',
                'Technical and organizational measures are adopted to restrict access, record critical events, and reduce the risk of fraud, abuse, improper exposure, and automated misuse of the platform.',
            ],
        },
        {
            title: '6. Data subject rights',
            paragraphs: [
                'The data subject may request information about processed data, updates, corrections, access reviews, and other applicable measures according to the relevant legislation and the role exercised by Super Checkout in each flow.',
                'Privacy requests may be registered, tracked, and answered through an internal trail to ensure operational handling, evidence, and possible forwarding to the applicable main controller.',
                'When Super Checkout acts only as a sellers processor, requests related to sale content, marketing, or buyer registration may depend on being forwarded to the main controller of that operation.',
            ],
        },
        {
            title: '7. Official channel and incidents',
            paragraphs: [
                `The institutional ecosystem channel for privacy, operational support, and legal matters under this policy is ${PLATFORM_LEGAL_CONTACT_EMAIL}. This is the official point for exercising rights, clarifying this policy, and receiving initial communications about relevant security events linked to this surface.`,
                'If the request is related to a purchase made in a third-party checkout hosted on the platform, Super Checkout may guide the data subject and forward the request to the seller responsible for the operation when that seller is the main controller for that flow.',
            ],
        },
    ],
    es: [
        {
            title: '1. Alcance y roles de tratamiento',
            paragraphs: [
                'Esta politica describe como Super Checkout trata datos personales en las superficies de registro, autenticacion, portal administrativo, instalacion, licenciamiento, checkout, webhooks, comunicaciones transaccionales y area de miembros.',
                'En su relacion con la cuenta del comerciante, Super Checkout puede actuar como controlador de los datos de registro y operacion del propio usuario de la plataforma. En checkouts operados para terceros, el vendedor normalmente actua como controlador principal de los datos del comprador y Super Checkout proporciona la infraestructura tecnica como encargado o subencargado.',
            ],
        },
        {
            title: '2. Datos que pueden ser tratados',
            paragraphs: [
                'Podemos tratar nombre, correo electronico, telefono, datos de perfil, credenciales de autenticacion, logs de acceso, eventos de seguridad, dominio, configuraciones de negocio, licencias, historial operativo, pedidos, pagos, identificadores de transaccion y datos tecnicos como IP, user agent, origen de campana, identificadores de clic y cookies o tecnologias de medicion cuando se habiliten en el flujo.',
                'Los numeros completos de tarjeta no son almacenados por Super Checkout. Los datos de pago sensibles permanecen bajo el tratamiento directo de los proveedores contratados para la operacion.',
            ],
        },
        {
            title: '3. Finalidades y bases operativas',
            paragraphs: [
                'Los datos se utilizan para autenticar usuarios, habilitar licencias, publicar y operar checkouts, procesar pedidos, liberar accesos, enviar correos transaccionales, prevenir fraude, registrar eventos criticos, responder a incidentes, brindar soporte y cumplir obligaciones legales, fiscales y regulatorias.',
                'Segun el contexto, el tratamiento puede apoyarse en la ejecucion contractual, el ejercicio regular de derechos, obligaciones legales o regulatorias e intereses legitimos relacionados con seguridad, auditoria y continuidad operativa.',
            ],
        },
        {
            title: '4. Comparticion con terceros',
            paragraphs: [
                'La infraestructura actual puede involucrar proveedores como Supabase, Vercel, Resend, Stripe, Mercado Pago y Upstash. Cuando el vendedor habilita medicion o publicidad, integraciones como Google, Meta y TikTok tambien pueden recibir eventos vinculados a la operacion bajo la responsabilidad del controlador aplicable.',
                'La comparticion ocurre solo en la medida necesaria para hospedaje, base de datos, envio de correos, procesamiento de pagos, antifraude, medicion, soporte tecnico y respuesta a incidentes.',
            ],
        },
        {
            title: '5. Retencion y seguridad',
            paragraphs: [
                'Los datos se conservan durante el periodo necesario para operar la cuenta, ejecutar pedidos, resguardar derechos, investigar abusos, cumplir obligaciones legales y mantener trazas minimas de seguridad.',
                'Los logs tecnicos y las trazas auxiliares pueden seguir ventanas operativas mas cortas y politicas internas de eliminacion periodica, especialmente cuando dejen de ser necesarios para soporte, auditoria o seguridad.',
                'Se adoptan medidas tecnicas y organizativas para restringir accesos, registrar eventos criticos y reducir el riesgo de fraude, abuso, exposicion indebida y uso automatizado de la plataforma.',
            ],
        },
        {
            title: '6. Derechos del titular',
            paragraphs: [
                'El titular puede solicitar informacion sobre los datos tratados, actualizacion, correccion, revision de accesos y otras medidas aplicables conforme a la legislacion correspondiente y al rol ejercido por Super Checkout en cada flujo.',
                'Las solicitudes de privacidad pueden registrarse, seguirse y responderse mediante una traza interna para garantizar tratamiento operativo, evidencia y eventual remision al controlador principal aplicable.',
                'Cuando Super Checkout actua solo como encargado de un vendedor, las solicitudes relacionadas con el contenido de la venta, marketing o registro del comprador pueden depender de su remision al controlador principal de esa operacion.',
            ],
        },
        {
            title: '7. Canal oficial e incidentes',
            paragraphs: [
                `El canal institucional del ecosistema para privacidad, soporte operativo y asuntos legales de esta politica es ${PLATFORM_LEGAL_CONTACT_EMAIL}. Ese es el punto oficial para ejercer derechos, aclarar esta politica y recibir comunicaciones iniciales sobre eventos relevantes de seguridad vinculados a esta superficie.`,
                'Si la solicitud esta relacionada con una compra realizada en un checkout de terceros alojado en la plataforma, Super Checkout puede orientar al titular y remitir la demanda al vendedor responsable de la operacion cuando ese vendedor sea el controlador principal de ese flujo.',
            ],
        },
    ],
};

const PLATFORM_TERMS_SECTIONS_BY_LOCALE: Record<PlatformLegalLocale, PlatformLegalSection[]> = {
    pt: [
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
    ],
    en: [
        {
            title: '1. Service scope',
            paragraphs: [
                'Super Checkout provides technical infrastructure for authentication, licensing, checkout administration, operational order processing, access delivery, and transactional communications.',
                'Using the platform does not make Super Checkout the seller of products registered by third parties, except when this is expressly indicated in an offer from the ecosystem itself.',
            ],
        },
        {
            title: '2. Account, access, and license',
            paragraphs: [
                'The account holder is responsible for keeping credentials secure, providing truthful data, reviewing business settings, and controlling who receives administrative access to the environment.',
                'Licenses, features, and limits may vary according to the contracted plan, the active installation, the authorized domain, and the accounts operational compliance history.',
            ],
        },
        {
            title: '3. Seller responsibilities',
            paragraphs: [
                'Anyone publishing checkouts and offers on the platform is responsible for the commercial content, the legality of the product, the privacy policies and terms shown to the buyer, service to the data subject, and compliance with tax, consumer, and data protection rules applicable to their business.',
                'The seller must also review payment integrations, tracking, member area, webhooks, and any automation that sends personal data to third parties.',
            ],
        },
        {
            title: '4. Prohibited use',
            paragraphs: [
                'It is not allowed to use Super Checkout for fraud, intrusion attempts, mass spam, artificial account creation, identity concealment, sale of illegal content, or any practice that exposes the infrastructure, buyers, or third parties to undue risk.',
                'It is also forbidden to bypass technical limits, exploit flaws, manipulate payment events, or attempt to circumvent security, antifraud, or auditing mechanisms.',
            ],
        },
        {
            title: '5. Integrations, third parties, and data',
            paragraphs: [
                'System operation may depend on infrastructure, database, transactional email, payment processing, cache, and observability providers. The use of these integrations is part of the platforms normal operation.',
                'When the user enables analytics, ads, pixels, external CRM, or other connections, that user is responsible for validating the need, legal basis, and public notices related to that sharing.',
            ],
        },
        {
            title: '6. Suspension, review, and termination',
            paragraphs: [
                'Accounts, installations, domains, checkouts, or features may be limited, suspended, or reviewed in cases of abuse, security risk, contractual violation, suspected fraud, regulatory requirement, or use incompatible with ecosystem operations.',
                'Termination of access does not remove pending obligations related to already processed orders, open disputes, audits, technical logs, or legal retention duties.',
            ],
        },
        {
            title: '7. Official channels and updates',
            paragraphs: [
                'Super Checkout may update routes, flows, protections, providers, and infrastructure components to maintain security, compatibility, and operational continuity.',
                `Contractual, technical, or operational questions about the use of this platform must be handled through the official channel ${PLATFORM_LEGAL_CONTACT_EMAIL}. Relevant changes to these terms become effective from the publication of the new institutional version.`,
            ],
        },
    ],
    es: [
        {
            title: '1. Objeto del servicio',
            paragraphs: [
                'Super Checkout proporciona infraestructura tecnica para autenticacion, licenciamiento, administracion de checkouts, procesamiento operativo de pedidos, entrega de accesos y comunicaciones transaccionales.',
                'El uso de la plataforma no convierte a Super Checkout en vendedor de los productos registrados por terceros, salvo cuando esto este expresamente indicado en una oferta propia del ecosistema.',
            ],
        },
        {
            title: '2. Cuenta, acceso y licencia',
            paragraphs: [
                'El titular de la cuenta es responsable de mantener credenciales seguras, proporcionar datos veraces, revisar las configuraciones del negocio y controlar quien recibe acceso administrativo al entorno.',
                'Las licencias, recursos y limites pueden variar segun el plan contratado, la instalacion activa, el dominio autorizado y el historial de conformidad operativa de la cuenta.',
            ],
        },
        {
            title: '3. Responsabilidades del vendedor',
            paragraphs: [
                'Quien publica checkouts y ofertas en la plataforma responde por el contenido comercial, la legalidad del producto, las politicas de privacidad y terminos mostrados al comprador, la atencion al titular y el cumplimiento de las reglas fiscales, de consumo y de proteccion de datos aplicables a su negocio.',
                'El vendedor tambien debe revisar integraciones de pago, rastreo, area de miembros, webhooks y cualquier automatizacion que envie datos personales a terceros.',
            ],
        },
        {
            title: '4. Uso prohibido',
            paragraphs: [
                'No esta permitido utilizar Super Checkout para fraude, intentos de intrusion, envio masivo de spam, creacion artificial de cuentas, ocultacion de identidad, venta de contenido ilicito o cualquier practica que exponga la infraestructura, a los compradores o a terceros a un riesgo indebido.',
                'Tambien esta prohibido eludir limites tecnicos, explotar fallos, manipular eventos de pago o intentar burlar mecanismos de seguridad, antifraude o auditoria.',
            ],
        },
        {
            title: '5. Integraciones, terceros y datos',
            paragraphs: [
                'La operacion del sistema puede depender de proveedores de infraestructura, base de datos, correo transaccional, procesamiento de pagos, cache y observabilidad. El uso de estas integraciones forma parte del funcionamiento normal de la plataforma.',
                'Cuando el usuario habilita integraciones de analitica, anuncios, pixel, CRM externo u otras conexiones, asume la responsabilidad de validar la necesidad, la base legal y los avisos publicos relacionados con esa comparticion.',
            ],
        },
        {
            title: '6. Suspension, revision y cierre',
            paragraphs: [
                'Las cuentas, instalaciones, dominios, checkouts o recursos pueden ser limitados, suspendidos o revisados en caso de abuso, riesgo de seguridad, violacion contractual, sospecha de fraude, exigencia regulatoria o uso incompatible con la operacion del ecosistema.',
                'El cierre del acceso no elimina obligaciones pendientes relacionadas con pedidos ya procesados, disputas abiertas, auditorias, logs tecnicos o deberes legales de conservacion.',
            ],
        },
        {
            title: '7. Canales oficiales y actualizaciones',
            paragraphs: [
                'Super Checkout puede actualizar rutas, flujos, protecciones, proveedores y componentes de la infraestructura para mantener seguridad, compatibilidad y continuidad operativa.',
                `Las dudas contractuales, tecnicas u operativas sobre el uso de esta plataforma deben tratarse por el canal oficial ${PLATFORM_LEGAL_CONTACT_EMAIL}. Los cambios relevantes en estos terminos entran en vigor a partir de la publicacion de la nueva version institucional.`,
            ],
        },
    ],
};

export const getPlatformPrivacySections = (language: string) =>
    PLATFORM_PRIVACY_SECTIONS_BY_LOCALE[resolvePlatformLegalLocale(language)];

export const getPlatformTermsSections = (language: string) =>
    PLATFORM_TERMS_SECTIONS_BY_LOCALE[resolvePlatformLegalLocale(language)];

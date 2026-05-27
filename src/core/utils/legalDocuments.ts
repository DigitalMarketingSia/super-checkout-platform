export interface BusinessLegalSettingsLike {
  business_name?: string | null;
  legal_name?: string | null;
  legal_responsible_email?: string | null;
  support_email?: string | null;
  support_whatsapp?: string | null;
  privacy_policy?: string | null;
  privacy_policy_version?: string | null;
  privacy_policy_published_at?: string | null;
  terms_of_purchase?: string | null;
  terms_of_purchase_version?: string | null;
  terms_of_purchase_published_at?: string | null;
  updated_at?: string | null;
}

export type LegalDocumentKey = 'privacy_policy' | 'terms_of_purchase';
export type LegalDocumentSource = 'custom' | 'default';

export interface EffectiveLegalDocumentInfo {
  key: LegalDocumentKey;
  content: string;
  hasCustomDocument: boolean;
  source: LegalDocumentSource;
  sourceLabel: string;
  version: string;
  publishedAt: string | null;
}

export const DEFAULT_PUBLIC_LEGAL_VERSION = 'lgpd-baseline-2026.05';
export const DEFAULT_PUBLIC_LEGAL_PUBLISHED_AT = '2026-05-26T00:00:00.000Z';

const LEGAL_VERSION_KEYS = {
  privacy_policy: 'privacy_policy_version',
  terms_of_purchase: 'terms_of_purchase_version',
} as const;

const LEGAL_PUBLISHED_AT_KEYS = {
  privacy_policy: 'privacy_policy_published_at',
  terms_of_purchase: 'terms_of_purchase_published_at',
} as const;

const LEGAL_VERSION_PREFIX = {
  privacy_policy: 'privacy',
  terms_of_purchase: 'terms',
} as const;

const cleanText = (value: unknown, fallback: string) => {
  const normalized = String(value || '').trim();
  return normalized || fallback;
};

const normalizeIsoTimestamp = (value: unknown) => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
};

const buildCustomVersionFromDate = (key: LegalDocumentKey, publishedAt: string) => {
  const prefix = LEGAL_VERSION_PREFIX[key];
  const day = publishedAt.slice(0, 10).replace(/-/g, '.');
  return `${prefix}-${day}`;
};

export function buildNextCustomLegalVersion(key: LegalDocumentKey, referenceDate = new Date()) {
  const prefix = LEGAL_VERSION_PREFIX[key];
  const iso = referenceDate.toISOString();
  const stamp = `${iso.slice(0, 10).replace(/-/g, '.')}-${iso.slice(11, 16).replace(':', '')}`;
  return `${prefix}-${stamp}`;
}

export const getBusinessLegalIdentity = (settings?: BusinessLegalSettingsLike | null) => {
  const businessName = cleanText(settings?.business_name, 'Este vendedor');
  const legalName = cleanText(settings?.legal_name, businessName);
  const supportEmail = cleanText(settings?.support_email, 'nao informado');
  const legalContact = cleanText(settings?.legal_responsible_email, supportEmail);
  const supportWhatsapp = cleanText(settings?.support_whatsapp, '');

  return {
    businessName,
    legalName,
    supportEmail,
    legalContact,
    supportWhatsapp,
  };
};

const applyLegalPlaceholders = (content: string, settings?: BusinessLegalSettingsLike | null) => {
  const identity = getBusinessLegalIdentity(settings);

  return content
    .replace(/{{business_name}}/g, identity.businessName)
    .replace(/{{legal_name}}/g, identity.legalName)
    .replace(/{{support_email}}/g, identity.supportEmail)
    .replace(/{{legal_contact}}/g, identity.legalContact)
    .replace(/{{support_whatsapp}}/g, identity.supportWhatsapp);
};

export const buildDefaultPrivacyPolicy = (settings?: BusinessLegalSettingsLike | null) =>
  applyLegalPlaceholders(
    `1. Quem controla os dados
Esta politica explica como {{business_name}} trata dados pessoais em seu checkout, comunicacoes transacionais, suporte e entrega de produtos ou acessos. Para as compras realizadas nesta operacao, o vendedor identificado como {{legal_name}} atua como controlador principal dos dados do comprador. O Super Checkout e outros prestadores tecnicos podem atuar como operadores ou suboperadores para viabilizar a infraestrutura da venda.

2. Quais dados podem ser tratados
Podemos tratar dados de identificacao e contato, como nome, e-mail, telefone e documento quando solicitado; dados da compra, como produto, valor, tentativas, status, meio de pagamento e identificadores da transacao; e dados tecnicos e de seguranca, como IP, user agent, cookies tecnicos, origem de campanha, logs de acesso e eventos necessarios para proteger a operacao.

3. Como os dados sao coletados
Os dados podem ser fornecidos diretamente pelo comprador no checkout, coletados automaticamente pelo navegador ou recebidos de integracoes e processadores usados para pagamento, antifraude, atendimento, entrega e recuperacao de acesso. Quando o vendedor habilita mensuracao comercial, o checkout tambem pode registrar parametros de campanha, identificadores de clique e eventos de navegacao ou compra para atribuicao e performance.

4. Finalidades do tratamento
Os dados sao utilizados para processar o pedido, confirmar o pagamento, entregar o produto, liberar acessos, enviar e-mails transacionais, prestar suporte, prevenir fraude, auditar eventos criticos, cumprir obrigacoes legais e defender direitos em demandas administrativas ou judiciais. Quando o vendedor habilita pixels, analytics ou integracoes de publicidade, dados de navegacao e da transacao tambem podem ser usados para mensuracao comercial, atribuicao de campanhas e deduplicacao de eventos.

5. Compartilhamento com terceiros
Os dados podem ser compartilhados, na medida do necessario, com processadores de pagamento, provedores de hospedagem, banco de dados, envio de e-mail, antifraude, analytics, publicidade e suporte tecnico vinculados a esta operacao. Dados sensiveis de pagamento, como o numero completo do cartao, nao sao armazenados por este checkout e permanecem sob tratamento direto dos processadores utilizados.

6. Retencao e seguranca
Os dados sao mantidos pelo prazo necessario para executar a venda, prestar suporte, cumprir obrigacoes fiscais, regulatorias e de seguranca, ou resguardar direitos em disputas. Medidas tecnicas e organizacionais sao adotadas para reduzir acesso indevido, abuso, fraude e exposicao nao autorizada.

7. Direitos do titular e contato
O titular pode solicitar informacoes sobre tratamento, correcao, atualizacao, revogacao de consentimento quando aplicavel e demais direitos previstos em lei pelos canais oficiais do vendedor. Para temas de privacidade e atendimento, o contato informado para esta operacao e {{legal_contact}}.`,
    settings,
  );

export const buildDefaultTermsOfPurchase = (settings?: BusinessLegalSettingsLike | null) =>
  applyLegalPlaceholders(
    `1. Identificacao da oferta
Estes termos regulam a compra realizada com {{business_name}} por meio deste checkout. O vendedor identificado como {{legal_name}} e o responsavel comercial pela oferta, pelo conteudo vendido, pela entrega, pelo suporte e pelas informacoes publicadas na pagina de vendas.

2. Condicoes da compra
Antes de concluir o pagamento, o comprador deve verificar descricao da oferta, preco, forma de pagamento, recorrencia quando aplicavel, prazo de acesso, bonus, regras de entrega e eventuais restricoes informadas na oferta. Ao finalizar o pedido, o comprador declara que forneceu dados verdadeiros e possui capacidade legal para contratar.

3. Pagamento e aprovacao
O pagamento pode ser processado por provedores terceiros, como Stripe ou Mercado Pago. A aprovacao depende de validacoes do emissor, do processador e dos mecanismos de antifraude. A simples tentativa de pagamento nao garante aprovacao, reserva definitiva da oferta ou liberacao antecipada de acesso.

4. Entrega e acesso
A liberacao do produto, area de membros, arquivo, link, servico ou instrucoes de uso ocorre conforme a oferta adquirida e depende da confirmacao do pagamento. O comprador deve manter seus dados de contato atualizados para receber e-mails transacionais, acessos e orientacoes pos-compra.

5. Suporte e responsabilidade do comprador
O comprador e responsavel por revisar as informacoes da oferta, utilizar os canais corretos de atendimento e preservar as credenciais recebidas. O compartilhamento indevido de acessos, tentativas de fraude, chargeback abusivo ou uso ilicito do produto podem motivar bloqueio, suspensao ou medidas cabiveis.

6. Cancelamentos, reembolsos e arrependimento
Condicoes especificas de cancelamento, garantia ou reembolso devem ser apresentadas na propria oferta. Quando houver direito de arrependimento ou outra obrigacao legal aplicavel, ela sera observada nos termos da legislacao vigente e pelos canais oficiais do vendedor.

7. Infraestrutura tecnica e contato
O Super Checkout fornece a infraestrutura tecnica do checkout, mas nao substitui as obrigacoes comerciais e legais do vendedor perante o comprador. Quando houver mensuracao comercial habilitada, este checkout pode acionar tecnologias de analytics, pixel e atribuicao para registrar o inicio e a conclusao da compra. Para atendimento comercial, suporte e privacidade desta operacao, o canal informado pelo vendedor e {{support_email}}.`,
    settings,
  );

export const renderBusinessLegalContent = (
  template: string | null | undefined,
  settings: BusinessLegalSettingsLike | null | undefined,
  fallbackBuilder: (settings?: BusinessLegalSettingsLike | null) => string,
) => {
  const source = String(template || '').trim() ? String(template) : fallbackBuilder(settings);
  return applyLegalPlaceholders(source, settings);
};

export const hasCustomLegalContent = (content: string | null | undefined) => Boolean(String(content || '').trim());

export function getStoredLegalDocumentVersion(settings: BusinessLegalSettingsLike | null | undefined, key: LegalDocumentKey) {
  const rawValue = settings?.[LEGAL_VERSION_KEYS[key]];
  const normalized = String(rawValue || '').trim();
  return normalized || null;
}

export function getStoredLegalDocumentPublishedAt(settings: BusinessLegalSettingsLike | null | undefined, key: LegalDocumentKey) {
  const stored = normalizeIsoTimestamp(settings?.[LEGAL_PUBLISHED_AT_KEYS[key]]);
  if (stored) return stored;
  return normalizeIsoTimestamp(settings?.updated_at);
}

export function getEffectiveLegalDocumentInfo(
  key: LegalDocumentKey,
  settings: BusinessLegalSettingsLike | null | undefined,
  fallbackBuilder: (settings?: BusinessLegalSettingsLike | null) => string,
): EffectiveLegalDocumentInfo {
  const hasCustomDocument = hasCustomLegalContent(settings?.[key]);
  const content = renderBusinessLegalContent(settings?.[key], settings, fallbackBuilder);

  if (!hasCustomDocument) {
    return {
      key,
      content,
      hasCustomDocument: false,
      source: 'default',
      sourceLabel: `Modelo padrao do checkout (${DEFAULT_PUBLIC_LEGAL_VERSION}).`,
      version: DEFAULT_PUBLIC_LEGAL_VERSION,
      publishedAt: DEFAULT_PUBLIC_LEGAL_PUBLISHED_AT,
    };
  }

  const publishedAt = getStoredLegalDocumentPublishedAt(settings, key) || new Date().toISOString();
  const version = getStoredLegalDocumentVersion(settings, key) || buildCustomVersionFromDate(key, publishedAt);

  return {
    key,
    content,
    hasCustomDocument: true,
    source: 'custom',
    sourceLabel: 'Documento personalizado pelo vendedor.',
    version,
    publishedAt,
  };
}

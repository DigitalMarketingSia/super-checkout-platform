export const POST_PURCHASE_TEMPLATE_EVENT_TYPES = [
  'ORDER_COMPLETED',
  'ORDER_DIRECT_DELIVERY',
  'ORDER_MEMBER_ACCESS',
] as const;

export type PostPurchaseTemplateEventType = typeof POST_PURCHASE_TEMPLATE_EVENT_TYPES[number];
export type PostPurchaseTemplateLanguage = 'pt' | 'en' | 'es';

export interface PostPurchaseEmailTemplateDefinition {
  eventType: PostPurchaseTemplateEventType;
  name: string;
  purpose: string;
  subject: string;
  htmlBody: string;
  variables: string[];
}

interface PostPurchaseTemplateCopy {
  name: string;
  purpose: string;
  subject: string;
  title: string;
  intro: string;
}

const SHARED_VARIABLES = ['{{customer_name}}', '{{order_id}}', '{{product_names}}', '{{business_name}}'] as const;
const DELIVERY_VARIABLES = [...SHARED_VARIABLES, '{{deliverables_html}}', '{{deliverables_text}}'] as const;

const emailFrame = (content: string) => `
  <div style="background:#f3f4f6;padding:28px 12px;font-family:Arial,sans-serif;color:#111827;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
      ${content}
    </div>
  </div>
`;

const TEMPLATE_COPY: Record<PostPurchaseTemplateLanguage, Record<PostPurchaseTemplateEventType, PostPurchaseTemplateCopy>> = {
  pt: {
    ORDER_COMPLETED: {
      name: 'Compra Aprovada',
      purpose: 'Confirma o pagamento quando nao houver um e-mail especifico de entrega para enviar.',
      subject: 'Seu pedido {{order_id}} foi aprovado',
      title: 'Compra aprovada',
      intro: 'Seu pagamento foi confirmado e o pedido <strong>{{order_id}}</strong> esta aprovado.',
    },
    ORDER_DIRECT_DELIVERY: {
      name: 'Entrega Direta',
      purpose: 'Entrega links e materiais liberados apos a compra.',
      subject: 'Seus materiais estao disponiveis',
      title: 'Seus materiais estao disponiveis',
      intro: 'A compra do pedido <strong>{{order_id}}</strong> foi aprovada. Acesse seus materiais abaixo.',
    },
    ORDER_MEMBER_ACCESS: {
      name: 'Acesso a Area de Membros',
      purpose: 'Entrega o acesso a areas e conteudos liberados pela compra.',
      subject: 'Seu acesso foi liberado',
      title: 'Seu acesso foi liberado',
      intro: 'A compra do pedido <strong>{{order_id}}</strong> foi aprovada. Entre na area liberada abaixo.',
    },
  },
  en: {
    ORDER_COMPLETED: {
      name: 'Approved Purchase',
      purpose: 'Confirms the payment when there is no specific delivery email to send.',
      subject: 'Your order {{order_id}} was approved',
      title: 'Purchase approved',
      intro: 'Your payment was confirmed and order <strong>{{order_id}}</strong> is approved.',
    },
    ORDER_DIRECT_DELIVERY: {
      name: 'Direct Delivery',
      purpose: 'Delivers links and materials released after the purchase.',
      subject: 'Your materials are available',
      title: 'Your materials are available',
      intro: 'The purchase for order <strong>{{order_id}}</strong> was approved. Access your materials below.',
    },
    ORDER_MEMBER_ACCESS: {
      name: 'Members Area Access',
      purpose: 'Delivers access to areas and content unlocked by the purchase.',
      subject: 'Your access has been released',
      title: 'Your access has been released',
      intro: 'The purchase for order <strong>{{order_id}}</strong> was approved. Open the unlocked area below.',
    },
  },
  es: {
    ORDER_COMPLETED: {
      name: 'Compra Aprobada',
      purpose: 'Confirma el pago cuando no exista un correo especifico de entrega para enviar.',
      subject: 'Tu pedido {{order_id}} fue aprobado',
      title: 'Compra aprobada',
      intro: 'Tu pago fue confirmado y el pedido <strong>{{order_id}}</strong> esta aprobado.',
    },
    ORDER_DIRECT_DELIVERY: {
      name: 'Entrega Directa',
      purpose: 'Entrega enlaces y materiales liberados despues de la compra.',
      subject: 'Tus materiales estan disponibles',
      title: 'Tus materiales estan disponibles',
      intro: 'La compra del pedido <strong>{{order_id}}</strong> fue aprobada. Accede a tus materiales abajo.',
    },
    ORDER_MEMBER_ACCESS: {
      name: 'Acceso al Area de Miembros',
      purpose: 'Entrega el acceso a areas y contenidos liberados por la compra.',
      subject: 'Tu acceso ha sido liberado',
      title: 'Tu acceso ha sido liberado',
      intro: 'La compra del pedido <strong>{{order_id}}</strong> fue aprobada. Entra al area liberada abajo.',
    },
  },
};

export function normalizePostPurchaseTemplateLanguage(
  value?: string | null,
): PostPurchaseTemplateLanguage {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized.startsWith('en')) return 'en';
  if (normalized.startsWith('es')) return 'es';
  return 'pt';
}

export function getPostPurchaseEmailTemplates(
  language: string = 'pt',
): PostPurchaseEmailTemplateDefinition[] {
  const resolvedLanguage = normalizePostPurchaseTemplateLanguage(language);
  const copy = TEMPLATE_COPY[resolvedLanguage];

  return [
    {
      eventType: 'ORDER_COMPLETED',
      name: copy.ORDER_COMPLETED.name,
      purpose: copy.ORDER_COMPLETED.purpose,
      subject: copy.ORDER_COMPLETED.subject,
      variables: [...SHARED_VARIABLES],
      htmlBody: emailFrame(`
        <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;">${copy.ORDER_COMPLETED.title}</h1>
        <p style="margin:0 0 12px;color:#374151;">${resolvedLanguage === 'en' ? 'Hello' : resolvedLanguage === 'es' ? 'Hola' : 'Ola'}, {{customer_name}}.</p>
        <p style="margin:0 0 12px;color:#374151;">${copy.ORDER_COMPLETED.intro}</p>
        <p style="margin:0 0 20px;color:#374151;">${
          resolvedLanguage === 'en'
            ? 'Purchase items: <strong>{{product_names}}</strong>.'
            : resolvedLanguage === 'es'
              ? 'Articulos de la compra: <strong>{{product_names}}</strong>.'
              : 'Itens da compra: <strong>{{product_names}}</strong>.'
        }</p>
        <p style="margin:0;color:#6b7280;font-size:13px;">${
          resolvedLanguage === 'en'
            ? 'Sincerely,<br/>{{business_name}} Team'
            : resolvedLanguage === 'es'
              ? 'Atentamente,<br/>Equipo {{business_name}}'
              : 'Atenciosamente,<br/>Equipe {{business_name}}'
        }</p>
      `),
    },
    {
      eventType: 'ORDER_DIRECT_DELIVERY',
      name: copy.ORDER_DIRECT_DELIVERY.name,
      purpose: copy.ORDER_DIRECT_DELIVERY.purpose,
      subject: copy.ORDER_DIRECT_DELIVERY.subject,
      variables: [...DELIVERY_VARIABLES],
      htmlBody: emailFrame(`
        <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;">${copy.ORDER_DIRECT_DELIVERY.title}</h1>
        <p style="margin:0 0 12px;color:#374151;">${resolvedLanguage === 'en' ? 'Hello' : resolvedLanguage === 'es' ? 'Hola' : 'Ola'}, {{customer_name}}.</p>
        <p style="margin:0 0 20px;color:#374151;">${copy.ORDER_DIRECT_DELIVERY.intro}</p>
        {{deliverables_html}}
        <p style="margin:28px 0 0;color:#6b7280;font-size:13px;">${
          resolvedLanguage === 'en'
            ? 'Sincerely,<br/>{{business_name}} Team'
            : resolvedLanguage === 'es'
              ? 'Atentamente,<br/>Equipo {{business_name}}'
              : 'Atenciosamente,<br/>Equipe {{business_name}}'
        }</p>
      `),
    },
    {
      eventType: 'ORDER_MEMBER_ACCESS',
      name: copy.ORDER_MEMBER_ACCESS.name,
      purpose: copy.ORDER_MEMBER_ACCESS.purpose,
      subject: copy.ORDER_MEMBER_ACCESS.subject,
      variables: [...DELIVERY_VARIABLES],
      htmlBody: emailFrame(`
        <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;">${copy.ORDER_MEMBER_ACCESS.title}</h1>
        <p style="margin:0 0 12px;color:#374151;">${resolvedLanguage === 'en' ? 'Hello' : resolvedLanguage === 'es' ? 'Hola' : 'Ola'}, {{customer_name}}.</p>
        <p style="margin:0 0 20px;color:#374151;">${copy.ORDER_MEMBER_ACCESS.intro}</p>
        {{deliverables_html}}
        <p style="margin:28px 0 0;color:#6b7280;font-size:13px;">${
          resolvedLanguage === 'en'
            ? 'Sincerely,<br/>{{business_name}} Team'
            : resolvedLanguage === 'es'
              ? 'Atentamente,<br/>Equipo {{business_name}}'
              : 'Atenciosamente,<br/>Equipe {{business_name}}'
        }</p>
      `),
    },
  ];
}

export function getPostPurchaseEmailTemplate(
  eventType: string,
  language: string = 'pt',
) {
  return getPostPurchaseEmailTemplates(language).find((template) => template.eventType === eventType) || null;
}

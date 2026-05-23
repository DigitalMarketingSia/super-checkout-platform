export const POST_PURCHASE_TEMPLATE_EVENT_TYPES = [
  'ORDER_COMPLETED',
  'ORDER_DIRECT_DELIVERY',
  'ORDER_MEMBER_ACCESS',
] as const;

export type PostPurchaseTemplateEventType = typeof POST_PURCHASE_TEMPLATE_EVENT_TYPES[number];

export interface PostPurchaseEmailTemplateDefinition {
  eventType: PostPurchaseTemplateEventType;
  name: string;
  purpose: string;
  subject: string;
  htmlBody: string;
  variables: string[];
}

const emailFrame = (content: string) => `
  <div style="background:#f3f4f6;padding:28px 12px;font-family:Arial,sans-serif;color:#111827;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
      ${content}
    </div>
  </div>
`;

export const POST_PURCHASE_EMAIL_TEMPLATES: PostPurchaseEmailTemplateDefinition[] = [
  {
    eventType: 'ORDER_COMPLETED',
    name: 'Compra Aprovada',
    purpose: 'Confirma o pagamento quando nao houver um e-mail especifico de entrega para enviar.',
    subject: 'Seu pedido {{order_id}} foi aprovado',
    variables: ['{{customer_name}}', '{{order_id}}', '{{product_names}}', '{{business_name}}'],
    htmlBody: emailFrame(`
      <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;">Compra aprovada</h1>
      <p style="margin:0 0 12px;color:#374151;">Ola, {{customer_name}}.</p>
      <p style="margin:0 0 12px;color:#374151;">Seu pagamento foi confirmado e o pedido <strong>{{order_id}}</strong> esta aprovado.</p>
      <p style="margin:0 0 20px;color:#374151;">Itens da compra: <strong>{{product_names}}</strong>.</p>
      <p style="margin:0;color:#6b7280;font-size:13px;">Atenciosamente,<br/>Equipe {{business_name}}</p>
    `),
  },
  {
    eventType: 'ORDER_DIRECT_DELIVERY',
    name: 'Entrega Direta',
    purpose: 'Entrega links e materiais liberados apos a compra.',
    subject: 'Seus materiais estao disponiveis',
    variables: [
      '{{customer_name}}',
      '{{order_id}}',
      '{{product_names}}',
      '{{business_name}}',
      '{{deliverables_html}}',
      '{{deliverables_text}}',
    ],
    htmlBody: emailFrame(`
      <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;">Seus materiais estao disponiveis</h1>
      <p style="margin:0 0 12px;color:#374151;">Ola, {{customer_name}}.</p>
      <p style="margin:0 0 20px;color:#374151;">A compra do pedido <strong>{{order_id}}</strong> foi aprovada. Acesse seus materiais abaixo.</p>
      {{deliverables_html}}
      <p style="margin:28px 0 0;color:#6b7280;font-size:13px;">Atenciosamente,<br/>Equipe {{business_name}}</p>
    `),
  },
  {
    eventType: 'ORDER_MEMBER_ACCESS',
    name: 'Acesso a Area de Membros',
    purpose: 'Entrega o acesso a areas e conteudos liberados pela compra.',
    subject: 'Seu acesso foi liberado',
    variables: [
      '{{customer_name}}',
      '{{order_id}}',
      '{{product_names}}',
      '{{business_name}}',
      '{{deliverables_html}}',
      '{{deliverables_text}}',
    ],
    htmlBody: emailFrame(`
      <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;">Seu acesso foi liberado</h1>
      <p style="margin:0 0 12px;color:#374151;">Ola, {{customer_name}}.</p>
      <p style="margin:0 0 20px;color:#374151;">A compra do pedido <strong>{{order_id}}</strong> foi aprovada. Entre na area liberada abaixo.</p>
      {{deliverables_html}}
      <p style="margin:28px 0 0;color:#6b7280;font-size:13px;">Atenciosamente,<br/>Equipe {{business_name}}</p>
    `),
  },
];

export function getPostPurchaseEmailTemplate(eventType: string) {
  return POST_PURCHASE_EMAIL_TEMPLATES.find((template) => template.eventType === eventType) || null;
}

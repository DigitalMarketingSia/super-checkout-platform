export interface DemoWebhookEventOption {
  id: string;
  label: string;
  description: string;
}

export const DEMO_WEBHOOK_EVENT_OPTIONS: DemoWebhookEventOption[] = [
  {
    id: 'pedido.criado',
    label: 'Pedido criado',
    description: 'Dispara quando a compra demo e iniciada.',
  },
  {
    id: 'pagamento.aprovado',
    label: 'Pagamento aprovado',
    description: 'Dispara quando a compra e concluida com sucesso.',
  },
  {
    id: 'pagamento.rejeitado',
    label: 'Pagamento rejeitado',
    description: 'Dispara quando o cenario demo simula recusa.',
  },
  {
    id: 'pix.gerado',
    label: 'Pix gerado',
    description: 'Dispara quando o checkout demo gera um Pix pendente.',
  },
  {
    id: 'pix.pago',
    label: 'Pix pago',
    description: 'Dispara quando o Pix demo e compensado.',
  },
];

export const DEMO_WEBHOOK_SUPPORTED_EVENTS = DEMO_WEBHOOK_EVENT_OPTIONS.map((event) => event.id);

export const DEMO_WEBHOOK_DEFAULT_EVENTS = [...DEMO_WEBHOOK_SUPPORTED_EVENTS];

export const DEMO_WEBHOOK_LEGACY_EVENT_ALIASES: Record<string, string[]> = {
  'pagamento.aprovado': ['pedido.pago'],
  'pedido.criado': ['order.created'],
  'pix.gerado': ['payment.pending'],
  'pix.pago': ['order.paid'],
};

export const DEMO_WEBHOOK_ALLOWED_METHODS = ['POST', 'PUT', 'PATCH', 'GET'] as const;

export type DemoWebhookMethod = typeof DEMO_WEBHOOK_ALLOWED_METHODS[number];

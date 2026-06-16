import type { WebhookConfig, WebhookLog } from '../types';
import {
  DEMO_WEBHOOK_DEFAULT_EVENTS,
  DEMO_WEBHOOK_EVENT_OPTIONS,
  DEMO_WEBHOOK_LEGACY_EVENT_ALIASES,
  DEMO_WEBHOOK_SUPPORTED_EVENTS,
} from '../config/demoWebhooks';

export interface DemoWebhookDispatchPayload {
  event: string;
  payload: Record<string, unknown>;
  eventAliases?: string[];
  targetWebhookId?: string;
  bypassEventFilter?: boolean;
}

export interface DemoWebhookDispatchResult {
  success: boolean;
  matched: number;
  delivered: number;
  logs: WebhookLog[];
  error?: string;
}

const DEMO_WEBHOOK_ENDPOINT = '/api/system?action=demo-webhooks';

const safeJson = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const normalizeEventAliases = (event: string, aliases?: string[]) => {
  const mappedAliases = DEMO_WEBHOOK_LEGACY_EVENT_ALIASES[event] || [];
  return Array.from(new Set([...(aliases || []), ...mappedAliases]));
};

export const getDefaultDemoWebhookDraft = (): Pick<
  WebhookConfig,
  'events' | 'method' | 'active'
> => ({
  events: [...DEMO_WEBHOOK_DEFAULT_EVENTS],
  method: 'POST',
  active: true,
});

export const getDemoWebhookEventOptions = () => DEMO_WEBHOOK_EVENT_OPTIONS;

export const getSupportedDemoWebhookEvents = () => DEMO_WEBHOOK_SUPPORTED_EVENTS;

export const syncDemoWebhookSession = async (webhooks: WebhookConfig[]) => {
  const response = await fetch(DEMO_WEBHOOK_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    body: JSON.stringify({
      action: 'sync',
      webhooks,
    }),
  });

  const payload = await safeJson(response);
  if (!response.ok || payload?.success !== true) {
    throw new Error(payload?.error || 'Nao foi possivel sincronizar os webhooks demo.');
  }

  return payload as { success: true; active: number };
};

export const clearDemoWebhookSession = async () => {
  const response = await fetch(DEMO_WEBHOOK_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    body: JSON.stringify({
      action: 'clear',
    }),
  });

  const payload = await safeJson(response);
  if (!response.ok || payload?.success !== true) {
    throw new Error(payload?.error || 'Nao foi possivel limpar a sessao de webhooks demo.');
  }

  return payload as { success: true };
};

export const dispatchDemoWebhookEvent = async (
  input: DemoWebhookDispatchPayload,
): Promise<DemoWebhookDispatchResult> => {
  const response = await fetch(DEMO_WEBHOOK_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    body: JSON.stringify({
      action: 'dispatch',
      event: input.event,
      eventAliases: normalizeEventAliases(input.event, input.eventAliases),
      payload: input.payload,
      targetWebhookId: input.targetWebhookId,
      bypassEventFilter: input.bypassEventFilter === true,
    }),
  });

  const payload = await safeJson(response);
  if (!response.ok || payload?.success !== true) {
    throw new Error(payload?.error || 'Nao foi possivel disparar o webhook demo.');
  }

  return payload as DemoWebhookDispatchResult;
};

const generateDemoTestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `demo-${Date.now()}`;
};

export const buildDemoWebhookTestPayload = () => {
  const orderId = `demo-test-${generateDemoTestId()}`;
  const now = new Date().toISOString();

  return {
    event: 'pagamento.aprovado',
    demo: true,
    source: 'demo',
    workspace_mode: 'demo',
    scenario: 'approved',
    order_id: orderId,
    checkout_id: 'demo-checkout-preview',
    amount: 97,
    currency: 'BRL',
    status: 'paid',
    payment_method: 'credit_card',
    customer: {
      name: 'Cliente Demo',
      email: 'cliente.demo@supercheckout.app',
      phone: '5511999999999',
    },
    items: [
      {
        name: 'Mentoria Checkout Pro',
        price: 97,
        quantity: 1,
        type: 'main',
      },
    ],
    created_at: now,
    purchased_at: now,
  };
};

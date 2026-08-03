import {
  buildCentralControlPlaneTrustHeaders,
  getCentralControlPlaneHmacKey,
} from '../api/_central-control-plane-trust.js';

const OFFICIAL_CENTRAL_API_URL = 'https://bcmnryxjweiovrwmztpn.supabase.co/functions/v1';

type PlatformEventEmailDelivery = {
  deduplication_key: string;
  template_key: string;
  language?: string;
  sender_profile?: 'account' | 'upgrade' | 'installation' | 'notification';
  variables?: Record<string, string>;
  recipient_email: string;
  recipient_user_id?: string | null;
  recipient_role?: string | null;
  scope_type?: string | null;
  scope_id?: string | null;
  account_id?: string | null;
  order_id?: string | null;
  service_order_id?: string | null;
  license_key?: string | null;
  installation_id?: string | null;
};

type PlatformEventNotification = {
  deduplication_key: string;
  recipient_user_id?: string | null;
  recipient_email?: string | null;
  recipient_role?: string | null;
  scope_type?: string | null;
  scope_id?: string | null;
  category: 'commercial' | 'installation' | 'upgrade' | 'license' | 'security' | 'account';
  title: string;
  message: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  reference_type?: string | null;
  reference_id?: string | null;
  action_url?: string | null;
  expires_at?: string | null;
};

export type PublishPlatformEventInput = {
  eventType: string;
  source: string;
  sourceEventId?: string | null;
  deduplicationKey: string;
  payload?: Record<string, unknown>;
  aggregateType?: string | null;
  aggregateId?: string | null;
  emailDeliveries?: PlatformEventEmailDelivery[];
  notifications?: PlatformEventNotification[];
  dispatchNow?: boolean;
};

export type PublishPlatformEventResult = {
  ok: boolean;
  eventId: string | null;
  dispatched: boolean;
  error: string | null;
};

function resolveCentralApiUrl() {
  return String(
    process.env.CENTRAL_API_URL
    || process.env.VITE_CENTRAL_API_URL
    || process.env.NEXT_PUBLIC_CENTRAL_API_URL
    || OFFICIAL_CENTRAL_API_URL,
  ).replace(/\/+$/, '');
}

function normalizeErrorCode(value: unknown, fallback: string) {
  const code = String(value || '').trim();
  return /^[a-z0-9_.-]{1,100}$/i.test(code) ? code : fallback;
}

async function postTrustedCentral(input: {
  endpoint: 'platform-events' | 'platform-email-dispatcher';
  body: Record<string, unknown>;
}) {
  let key: string | null = null;
  try {
    key = getCentralControlPlaneHmacKey();
  } catch (error: any) {
    return { ok: false, status: 503, payload: { error: 'central_control_plane_key_invalid' }, error: error?.message || 'central_control_plane_key_invalid' };
  }
  if (!key) return { ok: false, status: 503, payload: { error: 'central_control_plane_key_missing' }, error: 'central_control_plane_key_missing' };

  const rawBody = JSON.stringify(input.body);
  const headers = buildCentralControlPlaneTrustHeaders({
    key,
    method: 'POST',
    endpoint: input.endpoint,
    rawBody,
  });

  try {
    const response = await fetch(`${resolveCentralApiUrl()}/${input.endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: rawBody,
    });
    const payload = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      payload,
      error: response.ok ? null : normalizeErrorCode(payload?.error, `central_${input.endpoint.replaceAll('-', '_')}_failed`),
    };
  } catch {
    return { ok: false, status: 502, payload: {}, error: `central_${input.endpoint.replaceAll('-', '_')}_unreachable` };
  }
}

export async function publishPlatformEvent(input: PublishPlatformEventInput): Promise<PublishPlatformEventResult> {
  const eventResponse = await postTrustedCentral({
    endpoint: 'platform-events',
    body: {
      event_type: input.eventType,
      source: input.source,
      source_event_id: input.sourceEventId || null,
      deduplication_key: input.deduplicationKey,
      payload: input.payload || {},
      aggregate_type: input.aggregateType || null,
      aggregate_id: input.aggregateId || null,
      email_deliveries: input.emailDeliveries || [],
      notifications: input.notifications || [],
    },
  });

  if (!eventResponse.ok) {
    return {
      ok: false,
      eventId: null,
      dispatched: false,
      error: eventResponse.error || 'central_platform_event_failed',
    };
  }

  const eventId = typeof eventResponse.payload?.event_id === 'string'
    ? eventResponse.payload.event_id
    : null;
  if (!eventId) {
    return { ok: false, eventId: null, dispatched: false, error: 'central_platform_event_id_missing' };
  }

  if (input.dispatchNow === false) {
    return { ok: true, eventId, dispatched: false, error: null };
  }

  const dispatchResponse = await postTrustedCentral({
    endpoint: 'platform-email-dispatcher',
    body: { limit: 20 },
  });
  return {
    ok: true,
    eventId,
    dispatched: dispatchResponse.ok,
    error: dispatchResponse.ok ? null : dispatchResponse.error || 'central_platform_email_dispatch_failed',
  };
}

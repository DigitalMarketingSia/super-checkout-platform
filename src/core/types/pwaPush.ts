export type PushSurfaceKey = 'admin' | 'portal';
export type PushPermissionState = 'default' | 'granted' | 'denied' | 'revoked';
export type PushDeliveryState =
  | 'registered'
  | 'sent'
  | 'received'
  | 'clicked'
  | 'error'
  | 'reset'
  | 'revoked';

export interface PushPreferences {
  enabled: boolean;
  sale_approved: boolean;
  payment_failed: boolean;
  lead_captured: boolean;
  system_alerts: boolean;
  updated_at?: string | null;
}

export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
  enabled: true,
  sale_approved: true,
  payment_failed: true,
  lead_captured: false,
  system_alerts: true,
};

export interface PushSubscriptionKeys {
  p256dh?: string | null;
  auth?: string | null;
}

export interface PushSubscriptionJson {
  endpoint: string;
  expirationTime?: number | null;
  keys?: PushSubscriptionKeys | null;
}

export interface StoredPushSubscriptionRecord {
  id: string;
  surface_key: PushSurfaceKey;
  endpoint: string;
  permission_state: PushPermissionState;
  device_label: string | null;
  user_agent: string | null;
  is_active: boolean;
  revoked_at: string | null;
  last_seen_at: string | null;
  last_test_sent_at: string | null;
  last_push_received_at: string | null;
  last_push_clicked_at: string | null;
  last_delivery_state: PushDeliveryState | null;
  last_delivery_tag: string | null;
  last_delivery_title: string | null;
  last_delivery_body: string | null;
  last_delivery_error: string | null;
  last_delivery_sw_version: string | null;
  created_at: string | null;
  updated_at: string | null;
}

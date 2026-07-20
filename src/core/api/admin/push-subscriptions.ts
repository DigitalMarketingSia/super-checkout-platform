import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireApiAuth } from '../_authz.js';
import { enforceApiRateLimit } from '../_rate-limit.js';
import {
  getLocalSupabaseServerKeyErrorMessage,
  resolveLocalSupabaseServerClient,
} from '../_supabase-server.js';
import { getPushServerConfig, sendPushNotification } from '../_push.js';
import {
  DEFAULT_PUSH_PREFERENCES,
  type PushDeliveryState,
  type PushPermissionState,
  type PushPreferences,
  type PushSubscriptionJson,
  type PushSurfaceKey,
} from '../../types/pwaPush.js';

const ALLOWED_PUSH_SURFACES = new Set<PushSurfaceKey>(['admin', 'portal']);
const ALLOWED_PERMISSION_STATES = new Set<PushPermissionState>(['default', 'granted', 'denied', 'revoked']);
const ALLOWED_DELIVERY_STATES = new Set<PushDeliveryState>(['registered', 'sent', 'received', 'clicked', 'error', 'reset', 'revoked']);
const PUSH_TRACKABLE_EVENT_TYPES = new Set<PushDeliveryState>(['received', 'clicked']);
const PUSH_SUBSCRIPTION_SELECT_COLUMNS = [
  'id',
  'surface_key',
  'endpoint',
  'permission_state',
  'device_label',
  'user_agent',
  'is_active',
  'revoked_at',
  'last_seen_at',
  'last_test_sent_at',
  'last_push_received_at',
  'last_push_clicked_at',
  'last_delivery_state',
  'last_delivery_tag',
  'last_delivery_title',
  'last_delivery_body',
  'last_delivery_error',
  'last_delivery_sw_version',
  'created_at',
  'updated_at',
].join(',');

function parseBody(req: VercelRequest) {
  if (!req.body) return {};

  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return req.body;
}

function normalizeText(value: unknown, maxLength: number) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maxLength) : '';
}

function normalizeSurfaceKey(value: unknown): PushSurfaceKey {
  const normalized = String(value || '').trim().toLowerCase();
  return ALLOWED_PUSH_SURFACES.has(normalized as PushSurfaceKey)
    ? normalized as PushSurfaceKey
    : 'admin';
}

function normalizePermissionState(value: unknown): PushPermissionState {
  const normalized = String(value || '').trim().toLowerCase();
  return ALLOWED_PERMISSION_STATES.has(normalized as PushPermissionState)
    ? normalized as PushPermissionState
    : 'default';
}

function normalizeDeliveryState(value: unknown, fallback: PushDeliveryState | null = null) {
  const normalized = String(value || '').trim().toLowerCase();
  return ALLOWED_DELIVERY_STATES.has(normalized as PushDeliveryState)
    ? normalized as PushDeliveryState
    : fallback;
}

function normalizeTrackableEventType(value: unknown) {
  const normalized = normalizeDeliveryState(value);
  return normalized && PUSH_TRACKABLE_EVENT_TYPES.has(normalized)
    ? normalized
    : null;
}

function normalizeEndpointList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(
    value
      .map((entry) => normalizeText(entry, 2048))
      .filter(Boolean),
  )).slice(0, 12);
}

function normalizePreferences(value: unknown, fallback: PushPreferences = DEFAULT_PUSH_PREFERENCES): PushPreferences {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};

  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : fallback.enabled,
    sale_approved: typeof source.sale_approved === 'boolean' ? source.sale_approved : fallback.sale_approved,
    payment_failed: typeof source.payment_failed === 'boolean' ? source.payment_failed : fallback.payment_failed,
    lead_captured: typeof source.lead_captured === 'boolean' ? source.lead_captured : fallback.lead_captured,
    system_alerts: typeof source.system_alerts === 'boolean' ? source.system_alerts : fallback.system_alerts,
    updated_at: fallback.updated_at || null,
  };
}

function sanitizePushSubscription(value: unknown): PushSubscriptionJson | null {
  const subscription = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : null;

  const endpoint = normalizeText(subscription?.endpoint, 2048);
  const keys = subscription?.keys && typeof subscription.keys === 'object'
    ? subscription.keys as Record<string, unknown>
    : null;

  const p256dh = normalizeText(keys?.p256dh, 512);
  const auth = normalizeText(keys?.auth, 512);

  if (!endpoint || !p256dh || !auth) {
    return null;
  }

  const expirationTime = Number(subscription?.expirationTime);

  return {
    endpoint,
    expirationTime: Number.isFinite(expirationTime) ? expirationTime : null,
    keys: {
      p256dh,
      auth,
    },
  };
}

async function loadPushPreferences(supabaseAdmin: SupabaseClient, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('push_notification_preferences')
    .select('enabled,sale_approved,payment_failed,lead_captured,system_alerts,updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return normalizePreferences(data, data
    ? {
        enabled: data.enabled !== false,
        sale_approved: data.sale_approved !== false,
        payment_failed: data.payment_failed !== false,
        lead_captured: data.lead_captured === true,
        system_alerts: data.system_alerts !== false,
        updated_at: data.updated_at || null,
      }
    : DEFAULT_PUSH_PREFERENCES);
}

async function loadPushSubscriptions(supabaseAdmin: SupabaseClient, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select(PUSH_SUBSCRIPTION_SELECT_COLUMNS)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = parseBody(req);
  const intent = normalizeText(body.intent || req.query.intent, 80) || req.method.toLowerCase();
  const rateLimit = enforceApiRateLimit(req, res, {
    scope: 'admin_push_subscriptions',
    identifiers: [intent],
    limit: 80,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  if (req.method === 'POST' && intent === 'track_delivery') {
    try {
      const { supabase: supabaseAdmin } = await resolveLocalSupabaseServerClient();
      if (!supabaseAdmin) {
        return res.status(500).json({ error: getLocalSupabaseServerKeyErrorMessage() });
      }

      const eventType = normalizeTrackableEventType(body.eventType);
      const endpoint = normalizeText(body.endpoint, 2048);
      const authKey = normalizeText(body.authKey, 512);
      const tag = normalizeText(body.tag, 180) || null;
      const title = normalizeText(body.title, 180) || null;
      const notificationBody = normalizeText(body.body, 320) || null;
      const swVersion = normalizeText(body.swVersion, 80) || null;
      const now = new Date().toISOString();

      if (!eventType || !endpoint || !authKey) {
        return res.status(400).json({ error: 'Invalid push delivery tracking payload.' });
      }

      const patch: Record<string, unknown> = {
        last_seen_at: now,
        last_delivery_state: eventType,
        last_delivery_tag: tag,
        last_delivery_title: title,
        last_delivery_body: notificationBody,
        last_delivery_error: null,
        last_delivery_sw_version: swVersion,
      };

      if (eventType === 'received') {
        patch.last_push_received_at = now;
      }

      if (eventType === 'clicked') {
        patch.last_push_clicked_at = now;
      }

      const { data, error } = await supabaseAdmin
        .from('push_subscriptions')
        .update(patch)
        .eq('endpoint', endpoint)
        .eq('auth_key', authKey)
        .eq('is_active', true)
        .select('id')
        .limit(1);

      if (error) {
        throw error;
      }

      return res.status(200).json({
        success: Array.isArray(data) && data.length > 0,
        matched: Array.isArray(data) ? data.length : 0,
        tracked_at: now,
      });
    } catch (error: any) {
      console.error('[admin_push_subscriptions] track_delivery failed:', error?.message || error);
      return res.status(500).json({ error: 'Failed to track push delivery.' });
    }
  }

  const auth = await requireApiAuth(req, res, {
    source: 'admin_push_subscriptions',
  });

  if (!auth) {
    return null;
  }

  const { supabaseAdmin, user, profile } = auth;
  const serverConfig = getPushServerConfig();

  try {
    if (req.method === 'GET') {
      const [preferences, subscriptions] = await Promise.all([
        loadPushPreferences(supabaseAdmin, user.id),
        loadPushSubscriptions(supabaseAdmin, user.id),
      ]);

      return res.status(200).json({
        success: true,
        serverConfigured: serverConfig.isConfigured,
        serverTime: new Date().toISOString(),
        preferences,
        subscriptions,
      });
    }

    if (req.method === 'POST' && intent === 'update_preferences') {
      const currentPreferences = await loadPushPreferences(supabaseAdmin, user.id);
      const nextPreferences = normalizePreferences(body.preferences, currentPreferences);

      const { data, error } = await supabaseAdmin
        .from('push_notification_preferences')
        .upsert({
          user_id: user.id,
          installation_id: profile.installation_id || null,
          enabled: nextPreferences.enabled,
          sale_approved: nextPreferences.sale_approved,
          payment_failed: nextPreferences.payment_failed,
          lead_captured: nextPreferences.lead_captured,
          system_alerts: nextPreferences.system_alerts,
        }, {
          onConflict: 'user_id',
        })
        .select('enabled,sale_approved,payment_failed,lead_captured,system_alerts,updated_at')
        .single();

      if (error) {
        throw error;
      }

      return res.status(200).json({
        success: true,
        preferences: normalizePreferences(data, {
          enabled: data.enabled !== false,
          sale_approved: data.sale_approved !== false,
          payment_failed: data.payment_failed !== false,
          lead_captured: data.lead_captured === true,
          system_alerts: data.system_alerts !== false,
          updated_at: data.updated_at || null,
        }),
      });
    }

    if (req.method === 'POST' && intent === 'upsert_subscription') {
      const subscription = sanitizePushSubscription(body.subscription);
      if (!subscription) {
        return res.status(400).json({ error: 'Invalid push subscription payload.' });
      }

      const surfaceKey = normalizeSurfaceKey(body.surfaceKey);
      const permissionState = normalizePermissionState(body.permission);
      const deviceLabel = normalizeText(body.deviceLabel, 120) || null;
      const userAgent = normalizeText(body.userAgent, 500) || null;
      const now = new Date().toISOString();

      const { data, error } = await supabaseAdmin
        .from('push_subscriptions')
        .upsert({
          user_id: user.id,
          installation_id: profile.installation_id || null,
          surface_key: surfaceKey,
          endpoint: subscription.endpoint,
          subscription_json: subscription,
          p256dh_key: subscription.keys?.p256dh || null,
          auth_key: subscription.keys?.auth || null,
          permission_state: permissionState,
          device_label: deviceLabel,
          user_agent: userAgent,
          is_active: permissionState === 'granted',
          revoked_at: permissionState === 'granted' ? null : now,
          last_seen_at: now,
        }, {
          onConflict: 'endpoint',
        })
        .select(PUSH_SUBSCRIPTION_SELECT_COLUMNS)
        .single();

      if (error) {
        throw error;
      }

      await supabaseAdmin
        .from('push_notification_preferences')
        .upsert({
          user_id: user.id,
          installation_id: profile.installation_id || null,
          ...DEFAULT_PUSH_PREFERENCES,
        }, {
          onConflict: 'user_id',
        });

      return res.status(200).json({
        success: true,
        subscription: data,
      });
    }

    if (req.method === 'POST' && intent === 'send_test') {
      if (!serverConfig.isConfigured) {
        return res.status(409).json({ error: 'Push server is not configured yet.' });
      }

      const surfaceKey = normalizeSurfaceKey(body.surfaceKey);
      const endpoint = normalizeText(body.endpoint, 2048);
      const testNotificationTitle = 'Push de teste do Super Checkout';
      const testNotificationBody = 'Aparelho conectado com sucesso. Os alertas do painel estao prontos.';
      let query = supabaseAdmin
        .from('push_subscriptions')
        .select('id,endpoint,auth_key,subscription_json')
        .eq('user_id', user.id)
        .eq('surface_key', surfaceKey)
        .eq('is_active', true)
        .eq('permission_state', 'granted');

      if (endpoint) {
        query = query.eq('endpoint', endpoint);
      }

      const { data: subscriptions, error } = await query;

      if (error) {
        throw error;
      }

      if (!subscriptions || subscriptions.length === 0) {
        return res.status(404).json({ error: 'No active device was found for test push.' });
      }

      let delivered = 0;
      let revoked = 0;
      const failures: string[] = [];
      const testNotificationTag = `sc-push-test-${Date.now()}`;
      const testNotificationTimestamp = Date.now();
      const sentAt = new Date().toISOString();

      for (const subscription of subscriptions) {
        try {
          await sendPushNotification({
            subscription: subscription.subscription_json as PushSubscriptionJson,
            payload: {
              title: testNotificationTitle,
              body: testNotificationBody,
              tag: testNotificationTag,
              icon: '/pwa-icon-192.png',
              badge: '/pwa-badge-monochrome.svg',
              renotify: true,
              requireInteraction: false,
              timestamp: testNotificationTimestamp,
              vibrate: [220, 120, 220],
              url: surfaceKey === 'portal'
                ? '/activate?source=push-test'
                : '/admin/notifications?source=push-test',
              data: {
                url: surfaceKey === 'portal'
                  ? '/activate?source=push-test'
                  : '/admin/notifications?source=push-test',
                surfaceKey,
                type: 'push_test',
              },
            },
            ttl: 120,
          });

          await supabaseAdmin
            .from('push_subscriptions')
            .update({
              last_test_sent_at: sentAt,
              last_delivery_state: 'sent',
              last_delivery_tag: testNotificationTag,
              last_delivery_title: testNotificationTitle,
              last_delivery_body: testNotificationBody,
              last_delivery_error: null,
              last_delivery_sw_version: null,
            })
            .eq('id', subscription.id);

          delivered += 1;
        } catch (pushError: any) {
          const statusCode = Number(pushError?.statusCode || pushError?.status || 0);
          const normalizedError = normalizeText(pushError?.body || pushError?.message || 'Unknown push error', 220);
          failures.push(normalizedError);

          if (statusCode === 404 || statusCode === 410) {
            revoked += 1;
            await supabaseAdmin
              .from('push_subscriptions')
              .update({
                is_active: false,
                permission_state: 'revoked',
                last_test_sent_at: sentAt,
                last_delivery_state: 'revoked',
                last_delivery_tag: testNotificationTag,
                last_delivery_title: testNotificationTitle,
                last_delivery_body: testNotificationBody,
                last_delivery_error: normalizedError,
                revoked_at: new Date().toISOString(),
              })
              .eq('id', subscription.id);
          } else {
            await supabaseAdmin
              .from('push_subscriptions')
              .update({
                last_test_sent_at: sentAt,
                last_delivery_state: 'error',
                last_delivery_tag: testNotificationTag,
                last_delivery_title: testNotificationTitle,
                last_delivery_body: testNotificationBody,
                last_delivery_error: normalizedError,
              })
              .eq('id', subscription.id);
          }
        }
      }

      return res.status(200).json({
        success: delivered > 0,
        delivered,
        revoked,
        failures: failures.filter(Boolean).slice(0, 3),
      });
    }

    if (req.method === 'POST' && intent === 'reset_device') {
      const surfaceKey = normalizeSurfaceKey(body.surfaceKey);
      const singleEndpoint = normalizeText(body.endpoint, 2048);
      const endpoints = Array.from(new Set([
        ...normalizeEndpointList(body.endpoints),
        ...(singleEndpoint ? [singleEndpoint] : []),
      ])).slice(0, 12);

      if (endpoints.length === 0) {
        return res.status(400).json({ error: 'Missing push endpoints for device reset.' });
      }

      const now = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from('push_subscriptions')
        .update({
          is_active: false,
          permission_state: 'revoked',
          revoked_at: now,
          last_seen_at: now,
          last_delivery_state: 'reset',
          last_delivery_error: null,
        })
        .eq('user_id', user.id)
        .eq('surface_key', surfaceKey)
        .in('endpoint', endpoints)
        .select('id,endpoint');

      if (error) {
        throw error;
      }

      return res.status(200).json({
        success: true,
        resetCount: Array.isArray(data) ? data.length : 0,
      });
    }

    if (req.method === 'DELETE') {
      const endpoint = normalizeText(body.endpoint, 2048);
      const surfaceKey = normalizeSurfaceKey(body.surfaceKey || req.query.surfaceKey);
      const now = new Date().toISOString();

      if (!endpoint) {
        return res.status(400).json({ error: 'Missing push subscription endpoint.' });
      }

      let query = supabaseAdmin
        .from('push_subscriptions')
        .update({
          is_active: false,
          permission_state: 'revoked',
          revoked_at: now,
          last_seen_at: now,
          last_delivery_state: 'revoked',
          last_delivery_error: null,
        })
        .eq('user_id', user.id)
        .eq('endpoint', endpoint);

      if (surfaceKey) {
        query = query.eq('surface_key', surfaceKey);
      }

      const { data, error } = await query
        .select('id,endpoint');

      if (error) {
        throw error;
      }

      return res.status(200).json({
        success: true,
        revoked: Array.isArray(data) ? data.length : 0,
      });
    }

    return res.status(400).json({ error: 'Invalid push action.' });
  } catch (error: any) {
    console.error('[admin_push_subscriptions] failed:', error?.message || error);
    return res.status(500).json({ error: 'Failed to manage push subscriptions.' });
  }
}

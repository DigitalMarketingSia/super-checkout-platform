import webpush from 'web-push';
import type { PushSubscriptionJson } from '../types/pwaPush.js';

const DEFAULT_PUSH_SUBJECT = 'mailto:support@supercheckout.app';
let configuredFingerprint = '';

function readFirstEnv(keys: string[]) {
  for (const key of keys) {
    const value = String(process.env[key] || '').trim();
    if (value) {
      return value;
    }
  }

  return '';
}

export function getPushServerConfig() {
  const publicKey = readFirstEnv(['VITE_PWA_PUSH_PUBLIC_KEY', 'PWA_PUSH_VAPID_PUBLIC_KEY']);
  const privateKey = readFirstEnv(['PWA_PUSH_VAPID_PRIVATE_KEY']);
  const subject = readFirstEnv(['PWA_PUSH_VAPID_SUBJECT']) || DEFAULT_PUSH_SUBJECT;

  return {
    publicKey,
    privateKey,
    subject,
    isConfigured: Boolean(publicKey && privateKey),
  };
}

function ensureWebPushConfigured() {
  const config = getPushServerConfig();
  if (!config.isConfigured) {
    throw new Error('Push server configuration is incomplete.');
  }

  const fingerprint = `${config.subject}|${config.publicKey}|${config.privateKey}`;
  if (configuredFingerprint === fingerprint) {
    return config;
  }

  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  configuredFingerprint = fingerprint;
  return config;
}

export async function sendPushNotification(params: {
  subscription: PushSubscriptionJson;
  payload: Record<string, unknown>;
  ttl?: number;
}) {
  ensureWebPushConfigured();

  return webpush.sendNotification(
    params.subscription as unknown as webpush.PushSubscription,
    JSON.stringify(params.payload),
    {
      TTL: Math.max(30, Math.min(params.ttl || 60, 3600)),
      urgency: 'normal',
    },
  );
}

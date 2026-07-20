const SW_VERSION = '2026-07-19-42.3C';
const STATIC_CACHE = `super-checkout-auth-static:${SW_VERSION}`;
const CACHEABLE_DESTINATIONS = new Set(['script', 'style', 'image', 'font', 'worker']);
const AUTHORIZED_CLIENT_PATTERNS = [
  /^\/admin(?:\/|$)/,
  /^\/activate(?:\/|$)/,
];
const CACHEABLE_PATH_PREFIXES = ['/assets/'];
const CACHEABLE_EXACT_PATHS = new Set([
  '/logo-light.png',
  '/logo-dark.png',
  '/print-flow.png',
  '/pwa-badge-monochrome.svg',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/apple-touch-icon.png',
]);
const DEFAULT_NOTIFICATION_TITLE = 'Super Checkout';
const DEFAULT_NOTIFICATION_BODY = 'Voce recebeu uma nova atualizacao operacional.';
const DEFAULT_NOTIFICATION_ICON = '/pwa-icon-192.png';
const DEFAULT_NOTIFICATION_BADGE = '/pwa-badge-monochrome.svg';
const DEFAULT_NOTIFICATION_TAG = 'sc-operational-notification';
const PUSH_DIAGNOSTIC_ENDPOINT = '/api/admin?action=push-subscriptions';

const isAuthorizedClientPath = (pathname) =>
  AUTHORIZED_CLIENT_PATTERNS.some((pattern) => pattern.test(pathname));

const isCacheableAssetPath = (pathname) =>
  CACHEABLE_EXACT_PATHS.has(pathname)
  || CACHEABLE_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));

const isCacheableRequest = (request) => {
  if (request.method !== 'GET') {
    return false;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return false;
  }

  if (!CACHEABLE_DESTINATIONS.has(request.destination)) {
    return false;
  }

  // Positive allowlist keeps HTML, API, checkout, auth, and setup flows on the network.
  return isCacheableAssetPath(url.pathname);
};

const getClientPathname = async (clientId) => {
  if (!clientId) {
    return null;
  }

  const client = await self.clients.get(clientId);
  if (!client || !client.url) {
    return null;
  }

  return new URL(client.url).pathname;
};

const cacheStaticResponse = async (request, response) => {
  if (!response || !response.ok) {
    return response;
  }

  const cache = await caches.open(STATIC_CACHE);
  await cache.put(request, response.clone());
  return response;
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(['/logo-light.png', '/logo-dark.png']))
      .catch(() => undefined)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheKeys = await caches.keys();
    await Promise.all(
      cacheKeys
        .filter((cacheKey) => cacheKey.startsWith('super-checkout-auth-static:') && cacheKey !== STATIC_CACHE)
        .map((cacheKey) => caches.delete(cacheKey))
    );

    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

const normalizePushUrl = (candidateUrl) => {
  try {
    const url = new URL(candidateUrl || '/admin?source=push', self.location.origin);
    if (url.origin !== self.location.origin) {
      return new URL('/admin?source=push', self.location.origin).toString();
    }

    return url.toString();
  } catch {
    return new URL('/admin?source=push', self.location.origin).toString();
  }
};

const normalizeNotificationActions = (candidateActions) => {
  if (!Array.isArray(candidateActions)) {
    return [];
  }

  return candidateActions
    .filter((action) => action && typeof action === 'object')
    .map((action) => ({
      action: String(action.action || '').trim().slice(0, 80),
      title: String(action.title || '').trim().slice(0, 80),
      icon: action.icon ? String(action.icon).trim().slice(0, 2048) : undefined,
    }))
    .filter((action) => action.action && action.title);
};

const broadcastWorkerMessage = async (payload) => {
  const clientList = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });

  await Promise.all(
    clientList.map((client) => client.postMessage(payload))
  );
};

const postPushDeliveryDiagnostic = async ({ eventType, tag, title, body }) => {
  if (!self.registration?.pushManager) {
    return;
  }

  try {
    const subscription = await self.registration.pushManager.getSubscription();
    const subscriptionJson = subscription?.toJSON ? subscription.toJSON() : null;
    const endpoint = subscription?.endpoint ? String(subscription.endpoint).trim() : '';
    const authKey = subscriptionJson?.keys?.auth ? String(subscriptionJson.keys.auth).trim() : '';

    if (!endpoint || !authKey) {
      return;
    }

    await fetch(PUSH_DIAGNOSTIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'track_delivery',
        eventType,
        endpoint,
        authKey,
        tag: String(tag || '').trim(),
        title: String(title || '').trim(),
        body: String(body || '').trim(),
        swVersion: SW_VERSION,
      }),
    });
  } catch {
    // Keep diagnostics best-effort so delivery never depends on telemetry.
  }
};

const buildNotificationOptions = (payload) => {
  const normalizedPayload = payload && typeof payload === 'object' ? payload : {};
  const data = normalizedPayload.data && typeof normalizedPayload.data === 'object'
    ? normalizedPayload.data
    : {};
  const actions = normalizeNotificationActions(normalizedPayload.actions);
  const image = normalizedPayload.image ? String(normalizedPayload.image).trim() : '';
  const badge = normalizedPayload.badge
    ? String(normalizedPayload.badge).trim()
    : DEFAULT_NOTIFICATION_BADGE;
  const vibrate = Array.isArray(normalizedPayload.vibrate)
    ? normalizedPayload.vibrate
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry) && entry > 0)
        .slice(0, 8)
    : [180, 80, 180];

  const options = {
    body: normalizedPayload.body || DEFAULT_NOTIFICATION_BODY,
    icon: normalizedPayload.icon || DEFAULT_NOTIFICATION_ICON,
    tag: normalizedPayload.tag || DEFAULT_NOTIFICATION_TAG,
    data: {
      ...data,
      url: normalizePushUrl(data.url || normalizedPayload.url),
      primaryAction: data.primaryAction || 'open',
    },
    renotify: Boolean(normalizedPayload.renotify),
    requireInteraction: Boolean(normalizedPayload.requireInteraction),
    lang: 'pt-BR',
    dir: 'ltr',
    timestamp: Number.isFinite(Number(normalizedPayload.timestamp))
      ? Number(normalizedPayload.timestamp)
      : Date.now(),
    vibrate,
  };

  if (badge) {
    options.badge = badge;
  }

  if (image) {
    options.image = image;
  }

  if (actions.length > 0) {
    options.actions = actions;
  }

  return options;
};

self.addEventListener('push', (event) => {
  const payloadText = event.data ? event.data.text() : '';
  let payload = {};

  if (payloadText) {
    try {
      payload = JSON.parse(payloadText);
    } catch {
      payload = { body: payloadText };
    }
  }

  const title = payload && typeof payload === 'object' && payload.title
    ? payload.title
    : DEFAULT_NOTIFICATION_TITLE;
  const options = buildNotificationOptions(payload);
  const receivedAt = new Date().toISOString();

  event.waitUntil(Promise.allSettled([
    self.registration.showNotification(title, options),
    postPushDeliveryDiagnostic({
      eventType: 'received',
      tag: options.tag,
      title,
      body: options.body,
    }),
    broadcastWorkerMessage({
      type: 'PWA_PUSH_DIAGNOSTIC',
      eventType: 'received',
      tag: options.tag,
      title,
      body: options.body,
      swVersion: SW_VERSION,
      trackedAt: receivedAt,
    }),
  ]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = String(event.action || event.notification?.data?.primaryAction || 'open').trim();
  const actionUrl = event.notification?.data?.actionUrls && typeof event.notification.data.actionUrls === 'object'
    ? event.notification.data.actionUrls[action]
    : '';
  const targetUrl = normalizePushUrl(actionUrl || event.notification?.data?.url);
  const clickedAt = new Date().toISOString();

  event.waitUntil((async () => {
    await Promise.allSettled([
      postPushDeliveryDiagnostic({
        eventType: 'clicked',
        tag: event.notification?.tag || '',
        title: event.notification?.title || DEFAULT_NOTIFICATION_TITLE,
        body: event.notification?.body || DEFAULT_NOTIFICATION_BODY,
      }),
      broadcastWorkerMessage({
        type: 'PWA_PUSH_DIAGNOSTIC',
        eventType: 'clicked',
        tag: event.notification?.tag || '',
        title: event.notification?.title || DEFAULT_NOTIFICATION_TITLE,
        body: event.notification?.body || DEFAULT_NOTIFICATION_BODY,
        swVersion: SW_VERSION,
        trackedAt: clickedAt,
      }),
    ]);

    const clientList = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    for (const client of clientList) {
      if (!client.url) {
        continue;
      }

      const currentUrl = new URL(client.url);
      if (currentUrl.origin !== self.location.origin) {
        continue;
      }

      await client.focus();
      if ('navigate' in client) {
        await client.navigate(targetUrl);
      }
      return undefined;
    }

    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl);
    }

    return undefined;
  })());
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    await Promise.all(
      clientList.map((client) => client.postMessage({ type: 'PWA_PUSH_SUBSCRIPTION_CHANGED' }))
    );
  })());
});

self.addEventListener('fetch', (event) => {
  if (!isCacheableRequest(event.request)) {
    return;
  }

  event.respondWith((async () => {
    const clientPathname = await getClientPathname(event.clientId);
    if (!clientPathname || !isAuthorizedClientPath(clientPathname)) {
      return fetch(event.request);
    }

    const cache = await caches.open(STATIC_CACHE);
    const cachedResponse = await cache.match(event.request);
    const networkResponsePromise = fetch(event.request)
      .then((response) => cacheStaticResponse(event.request, response))
      .catch((error) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        throw error;
      });

    return cachedResponse || networkResponsePromise;
  })());
});

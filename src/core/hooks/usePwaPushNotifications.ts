import {
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from 'react';
import { toast } from 'sonner';
import {
  getPwaPushPublicKey,
  getPwaServiceWorkerScriptUrl,
  PWA_SERVICE_WORKER_CACHE_PREFIX,
  PWA_SERVICE_WORKER_PATH,
  PWA_SERVICE_WORKER_VERSION,
  type PwaSurfaceKey,
} from '../config/pwa';
import { supabase } from '../services/supabase';
import { getApiUrl } from '../utils/apiUtils';
import {
  DEFAULT_PUSH_PREFERENCES,
  type PushDeliveryState,
  type PushPermissionState,
  type PushPreferences,
  type StoredPushSubscriptionRecord,
} from '../types/pwaPush';

type PushWorkerEventType = Extract<PushDeliveryState, 'received' | 'clicked'>;

interface PushWorkerEvent {
  eventType: PushWorkerEventType;
  tag: string | null;
  title: string | null;
  body: string | null;
  swVersion: string | null;
  trackedAt: string;
}

const PUSH_DIAGNOSTIC_POLL_ATTEMPTS = 5;
const PUSH_DIAGNOSTIC_POLL_INTERVAL_MS = 2000;

function canUsePushApi() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
    && (window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
}

function detectStandaloneDisplayMode() {
  if (typeof window === 'undefined') {
    return false;
  }

  const isIosStandalone = typeof navigator !== 'undefined'
    && 'standalone' in navigator
    && (navigator as Navigator & { standalone?: boolean }).standalone === true;

  return isIosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

function getManagedWorkerScriptUrl(registration: ServiceWorkerRegistration | null | undefined) {
  if (!registration) {
    return '';
  }

  return registration.active?.scriptURL
    || registration.waiting?.scriptURL
    || registration.installing?.scriptURL
    || '';
}

function isManagedWorkerRegistration(registration: ServiceWorkerRegistration) {
  return getManagedWorkerScriptUrl(registration).includes(PWA_SERVICE_WORKER_PATH);
}

function extractServiceWorkerVersion(scriptUrl: string) {
  if (!scriptUrl) {
    return null;
  }

  try {
    const url = new URL(scriptUrl);
    return url.searchParams.get('v') || null;
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function base64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const normalized = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalized);
  const output = new Uint8Array(raw.length);

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }

  return output;
}

interface PushActionOptions {
  endpoint?: string | null;
  surfaceKey?: PwaSurfaceKey | null;
  successMessage?: string;
  emptyMessage?: string;
  errorMessage?: string;
}

function buildDeviceLabel(surfaceKey: PwaSurfaceKey) {
  if (typeof navigator === 'undefined') {
    return surfaceKey === 'portal' ? 'Portal' : 'Painel';
  }

  const userAgent = navigator.userAgent.toLowerCase();
  const platform = /android/.test(userAgent)
    ? 'Android'
    : /iphone|ipad|ios/.test(userAgent)
      ? 'iPhone'
      : /windows/.test(userAgent)
        ? 'Windows'
        : /mac os/.test(userAgent)
          ? 'macOS'
          : 'Desktop';
  const browser = /edg\//.test(userAgent)
    ? 'Edge'
    : /chrome\//.test(userAgent)
      ? 'Chrome'
      : /firefox\//.test(userAgent)
        ? 'Firefox'
        : /safari\//.test(userAgent)
          ? 'Safari'
          : 'Browser';

  return `${surfaceKey === 'portal' ? 'Portal' : 'Painel'} - ${platform} / ${browser}`;
}

async function getBearerToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

async function requestJson(path: string, init?: RequestInit) {
  const token = await getBearerToken();
  if (!token) {
    throw new Error('Sessao expirada. Entre novamente para continuar.');
  }

  const response = await fetch(getApiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(payload?.error || response.statusText || 'Falha na requisicao de push.'));
  }

  return payload;
}

export const usePwaPushNotifications = (surfaceKey: PwaSurfaceKey | null, enabled: boolean) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [permission, setPermission] = useState<PushPermissionState>(() =>
    typeof Notification === 'undefined'
      ? 'default'
      : Notification.permission as PushPermissionState,
  );
  const [preferences, setPreferences] = useState<PushPreferences>(DEFAULT_PUSH_PREFERENCES);
  const [subscriptions, setSubscriptions] = useState<StoredPushSubscriptionRecord[]>([]);
  const [localSubscriptionEndpoint, setLocalSubscriptionEndpoint] = useState<string | null>(null);
  const [serverConfigured, setServerConfigured] = useState(false);
  const [serverTime, setServerTime] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const [isStandalone, setIsStandalone] = useState(() => detectStandaloneDisplayMode());
  const [isServiceWorkerRegistered, setIsServiceWorkerRegistered] = useState(false);
  const [serviceWorkerVersion, setServiceWorkerVersion] = useState<string | null>(null);
  const [controllerPresent, setControllerPresent] = useState(false);
  const [lastWorkerEvent, setLastWorkerEvent] = useState<PushWorkerEvent | null>(null);

  const isSupported = useMemo(() => canUsePushApi(), []);
  const hasPublicKey = useMemo(() => Boolean(getPwaPushPublicKey()), []);

  const syncLocalBrowserState = async () => {
    setIsStandalone(detectStandaloneDisplayMode());

    if (!isSupported) {
      setLocalSubscriptionEndpoint(null);
      setIsServiceWorkerRegistered(false);
      setServiceWorkerVersion(null);
      setControllerPresent(false);
      return null;
    }

    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const managedRegistration = registrations.find(isManagedWorkerRegistration) || null;
      const scriptUrl = getManagedWorkerScriptUrl(managedRegistration);
      const subscription = managedRegistration
        ? await managedRegistration.pushManager.getSubscription()
        : null;

      setIsServiceWorkerRegistered(Boolean(managedRegistration));
      setServiceWorkerVersion(extractServiceWorkerVersion(scriptUrl));
      setControllerPresent(Boolean(navigator.serviceWorker.controller));
      setLocalSubscriptionEndpoint(subscription?.endpoint?.trim() || null);

      return {
        managedRegistration,
        endpoint: subscription?.endpoint?.trim() || null,
      };
    } catch (error) {
      console.error('[PWA Push] Failed to inspect local browser state:', error);
      setLocalSubscriptionEndpoint(null);
      setIsServiceWorkerRegistered(false);
      setServiceWorkerVersion(null);
      setControllerPresent(Boolean(navigator.serviceWorker.controller));
      return null;
    }
  };

  const loadState = async () => {
    if (!surfaceKey) {
      setPreferences(DEFAULT_PUSH_PREFERENCES);
      setSubscriptions([]);
      setServerConfigured(false);
      setServerTime(null);
      await syncLocalBrowserState();
      if (typeof Notification !== 'undefined') {
        setPermission(Notification.permission as PushPermissionState);
      }
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const [payload] = await Promise.all([
        requestJson('/api/admin?action=push-subscriptions', {
          method: 'GET',
        }),
        syncLocalBrowserState(),
      ]);

      setPreferences({
        ...DEFAULT_PUSH_PREFERENCES,
        ...(payload?.preferences || {}),
      });
      setSubscriptions(Array.isArray(payload?.subscriptions) ? payload.subscriptions : []);
      setServerConfigured(payload?.serverConfigured === true);
      setServerTime(typeof payload?.serverTime === 'string' ? payload.serverTime : null);
      setLastLoadedAt(new Date().toISOString());
    } catch (error) {
      console.error('[PWA Push] Failed to load push state:', error);
      await syncLocalBrowserState();
    } finally {
      if (typeof Notification !== 'undefined') {
        setPermission(Notification.permission as PushPermissionState);
      }
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadState();
  }, [surfaceKey, isSupported]);

  const pollForDiagnostics = async () => {
    for (let attempt = 0; attempt < PUSH_DIAGNOSTIC_POLL_ATTEMPTS; attempt += 1) {
      await sleep(PUSH_DIAGNOSTIC_POLL_INTERVAL_MS);
      await loadState();
    }
  };

  const handleWorkerMessage = useEffectEvent((event: MessageEvent) => {
    const payload = event.data && typeof event.data === 'object'
      ? event.data as Record<string, unknown>
      : null;

    if (!payload || typeof payload.type !== 'string') {
      return;
    }

    if (payload.type === 'PWA_PUSH_SUBSCRIPTION_CHANGED') {
      void loadState();
      return;
    }

    if (payload.type === 'PWA_PUSH_DIAGNOSTIC') {
      startTransition(() => {
        setLastWorkerEvent({
          eventType: payload.eventType === 'clicked' ? 'clicked' : 'received',
          tag: typeof payload.tag === 'string' ? payload.tag : null,
          title: typeof payload.title === 'string' ? payload.title : null,
          body: typeof payload.body === 'string' ? payload.body : null,
          swVersion: typeof payload.swVersion === 'string' ? payload.swVersion : null,
          trackedAt: typeof payload.trackedAt === 'string'
            ? payload.trackedAt
            : new Date().toISOString(),
        });
      });

      void loadState();
    }
  });

  const handleVisibilityChange = useEffectEvent(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void loadState();
    }
  });

  useEffect(() => {
    if (!isSupported) {
      return;
    }

    const onMessage = (event: MessageEvent) => handleWorkerMessage(event);
    const onVisibilityChange = () => handleVisibilityChange();

    navigator.serviceWorker.addEventListener('message', onMessage);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isSupported]);

  const savePreferences = async (patch: Partial<PushPreferences>) => {
    if (!surfaceKey) {
      return;
    }

    setIsMutating(true);
    try {
      const nextPreferences = {
        ...preferences,
        ...patch,
      };

      const nextPayload = await requestJson('/api/admin?action=push-subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          intent: 'update_preferences',
          preferences: nextPreferences,
        }),
      });

      setPreferences({
        ...DEFAULT_PUSH_PREFERENCES,
        ...(nextPayload?.preferences || nextPreferences),
      });
      toast.success('Preferencias de push atualizadas.');
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel salvar as preferencias de push.');
    } finally {
      setIsMutating(false);
    }
  };

  const enablePush = async () => {
    if (!enabled || !surfaceKey || !isSupported) {
      toast.error('Push ainda nao esta liberado para este contexto.');
      return false;
    }

    if (!hasPublicKey) {
      toast.error('A chave publica do push ainda nao foi configurada.');
      return false;
    }

    setIsMutating(true);

    try {
      const nextPermission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();

      setPermission(nextPermission as PushPermissionState);

      if (nextPermission !== 'granted') {
        toast.error('Permissao de notificacao negada no navegador.');
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64ToUint8Array(getPwaPushPublicKey()),
        });
      }

      await requestJson('/api/admin?action=push-subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          intent: 'upsert_subscription',
          surfaceKey,
          permission: nextPermission,
          deviceLabel: buildDeviceLabel(surfaceKey),
          userAgent: navigator.userAgent,
          subscription: subscription.toJSON(),
        }),
      });

      setLocalSubscriptionEndpoint(subscription.endpoint || null);
      setPreferences((current) => ({
        ...current,
        enabled: true,
      }));
      setLastWorkerEvent(null);
      await loadState();
      toast.success('Push ativado neste aparelho.');
      return true;
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel ativar o push neste aparelho.');
      return false;
    } finally {
      setIsMutating(false);
    }
  };

  const disablePush = async (options?: PushActionOptions) => {
    const targetSurfaceKey = options?.surfaceKey || surfaceKey;
    const targetEndpoint = String(options?.endpoint || localSubscriptionEndpoint || '').trim();

    if (!targetSurfaceKey || !isSupported) {
      return false;
    }

    if (!targetEndpoint) {
      toast.error('Nao foi possivel localizar a assinatura deste aparelho.');
      return false;
    }

    setIsMutating(true);

    try {
      const isCurrentDeviceTarget = Boolean(
        localSubscriptionEndpoint
        && surfaceKey
        && targetSurfaceKey === surfaceKey
        && targetEndpoint === localSubscriptionEndpoint,
      );

      if (isCurrentDeviceTarget) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (subscription?.endpoint === targetEndpoint) {
          await subscription.unsubscribe();
        }

        setLocalSubscriptionEndpoint(null);
      }

      await requestJson('/api/admin?action=push-subscriptions', {
        method: 'DELETE',
        body: JSON.stringify({
          endpoint: targetEndpoint,
          surfaceKey: targetSurfaceKey,
        }),
      });

      await loadState();
      toast.success(options?.successMessage || (
        isCurrentDeviceTarget
          ? 'Push desativado neste aparelho.'
          : 'Assinatura do aparelho desativada com sucesso.'
      ));
      return true;
    } catch (error: any) {
      await syncLocalBrowserState();
      toast.error(error?.message || options?.errorMessage || 'Nao foi possivel desativar a assinatura deste aparelho.');
      return false;
    } finally {
      setIsMutating(false);
    }
  };

  const resetPushState = async () => {
    if (!surfaceKey || !isSupported) {
      toast.error('Este navegador nao suporta reset completo do push.');
      return false;
    }

    setIsMutating(true);

    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const managedRegistrations = registrations.filter(isManagedWorkerRegistration);
      const endpoints = new Set<string>();

      for (const registration of managedRegistrations) {
        try {
          const subscription = await registration.pushManager.getSubscription();
          if (subscription?.endpoint) {
            endpoints.add(subscription.endpoint);
          }
        } catch {
          // Keep reset resilient even if one registration is partially broken.
        }

        try {
          const notifications = await registration.getNotifications();
          notifications.forEach((notification) => notification.close());
        } catch {
          // Ignore close failures.
        }
      }

      if (localSubscriptionEndpoint) {
        endpoints.add(localSubscriptionEndpoint);
      }

      for (const registration of managedRegistrations) {
        try {
          const subscription = await registration.pushManager.getSubscription();
          if (subscription) {
            await subscription.unsubscribe();
          }
        } catch {
          // Ignore failed unsubscribe attempts during hard reset.
        }
      }

      if (endpoints.size > 0) {
        await requestJson('/api/admin?action=push-subscriptions', {
          method: 'POST',
          body: JSON.stringify({
            intent: 'reset_device',
            surfaceKey,
            endpoints: Array.from(endpoints),
          }),
        });
      }

      await Promise.all(managedRegistrations.map((registration) => registration.unregister()));

      if (typeof window !== 'undefined' && 'caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(
          cacheKeys
            .filter((cacheKey) => cacheKey.startsWith(PWA_SERVICE_WORKER_CACHE_PREFIX))
            .map((cacheKey) => caches.delete(cacheKey)),
        );
      }

      await navigator.serviceWorker.register(getPwaServiceWorkerScriptUrl(), {
        scope: '/',
        updateViaCache: 'none',
      });

      setLastWorkerEvent(null);
      await loadState();
      toast.success('Push deste aparelho foi resetado. Ative novamente para criar uma assinatura limpa.');
      return true;
    } catch (error: any) {
      await syncLocalBrowserState();
      toast.error(error?.message || 'Nao foi possivel resetar o push deste aparelho.');
      return false;
    } finally {
      setIsMutating(false);
    }
  };

  const sendTest = async (options?: PushActionOptions) => {
    const targetSurfaceKey = options?.surfaceKey || surfaceKey;
    const targetEndpoint = String(options?.endpoint || '').trim();

    if (!targetSurfaceKey) {
      return false;
    }

    setIsMutating(true);
    try {
      const payload = await requestJson('/api/admin?action=push-subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          intent: 'send_test',
          surfaceKey: targetSurfaceKey,
          endpoint: targetEndpoint || undefined,
        }),
      });

      if (Number(payload?.delivered || 0) > 0) {
        toast.success(options?.successMessage || (
          targetEndpoint
            ? 'Push de teste enviado para este aparelho.'
            : 'Push de teste enviado para os aparelhos ativos desta superficie.'
        ));
      } else {
        toast.error(options?.emptyMessage || (
          targetEndpoint
            ? 'Nenhum aparelho recebeu o push de teste.'
            : 'Nenhum aparelho ativo recebeu o push de teste.'
        ));
      }

      await loadState();
      void pollForDiagnostics();
      return true;
    } catch (error: any) {
      toast.error(error?.message || options?.errorMessage || 'Nao foi possivel enviar o push de teste.');
      return false;
    } finally {
      setIsMutating(false);
    }
  };

  const currentDeviceSubscription = useMemo(() => (
    localSubscriptionEndpoint
      ? subscriptions.find((entry) => entry.endpoint === localSubscriptionEndpoint) || null
      : null
  ), [localSubscriptionEndpoint, subscriptions]);

  return {
    controllerPresent,
    currentDeviceSubscription,
    disablePush,
    enablePush,
    hasPublicKey,
    isLoading,
    isMutating,
    isServiceWorkerRegistered,
    isStandalone,
    isSupported,
    lastLoadedAt,
    lastWorkerEvent,
    localSubscriptionEndpoint,
    loadState,
    permission,
    preferences,
    resetPushState,
    savePreferences,
    sendTest,
    serverConfigured,
    serverTime,
    serviceWorkerVersion,
    subscriptions,
    targetServiceWorkerVersion: PWA_SERVICE_WORKER_VERSION,
  };
};

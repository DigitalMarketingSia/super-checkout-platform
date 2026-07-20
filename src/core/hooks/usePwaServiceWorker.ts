import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getPwaServiceWorkerScriptUrl,
  PWA_SERVICE_WORKER_CACHE_PREFIX,
  PWA_SERVICE_WORKER_PATH,
  type PwaSurfaceKey,
} from '../config/pwa';

const SKIP_WAITING_MESSAGE = 'SKIP_WAITING';

export const canUsePwaServiceWorker = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  (window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const getManagedPwaRegistrationScriptUrl = (registration: ServiceWorkerRegistration) =>
  registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL || '';

export const isManagedPwaRegistration = (registration: ServiceWorkerRegistration) =>
  getManagedPwaRegistrationScriptUrl(registration).includes(PWA_SERVICE_WORKER_PATH);

export const clearManagedPwaCaches = async () => {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return;
  }

  const cacheKeys = await caches.keys();
  await Promise.all(
    cacheKeys
      .filter((cacheKey) => cacheKey.startsWith(PWA_SERVICE_WORKER_CACHE_PREFIX))
      .map((cacheKey) => caches.delete(cacheKey))
  );
};

export const getManagedPwaRegistrations = async () => {
  if (!canUsePwaServiceWorker()) {
    return [] as ServiceWorkerRegistration[];
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  return registrations.filter(isManagedPwaRegistration);
};

export const unregisterManagedPwaRegistrations = async () => {
  const managedRegistrations = await getManagedPwaRegistrations();
  await Promise.all(managedRegistrations.map((registration) => registration.unregister()));
  await clearManagedPwaCaches();
  return managedRegistrations;
};

export const registerManagedPwaServiceWorker = async () => {
  if (!canUsePwaServiceWorker()) {
    return null;
  }

  return navigator.serviceWorker.register(getPwaServiceWorkerScriptUrl(), {
    scope: '/',
    updateViaCache: 'none',
  });
};

export const usePwaServiceWorker = (surfaceKey: PwaSurfaceKey | null, enabled: boolean) => {
  const [isRegistered, setIsRegistered] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const shouldReloadOnControllerChangeRef = useRef(false);

  const isSupported = useMemo(() => canUsePwaServiceWorker(), []);

  useEffect(() => {
    if (!isSupported) {
      setIsRegistered(false);
      setUpdateAvailable(false);
      registrationRef.current = null;
      return;
    }

    let isDisposed = false;

    const unregisterManagedWorkers = async () => {
      await unregisterManagedPwaRegistrations();

      if (!isDisposed) {
        registrationRef.current = null;
        setIsRegistered(false);
        setUpdateAvailable(false);
      }
    };

    if (!enabled || !surfaceKey) {
      void unregisterManagedWorkers();
      return () => {
        isDisposed = true;
      };
    }

    const handleControllerChange = () => {
      if (!shouldReloadOnControllerChangeRef.current) {
        return;
      }

      shouldReloadOnControllerChangeRef.current = false;
      window.location.reload();
    };

    const watchRegistration = (registration: ServiceWorkerRegistration) => {
      registrationRef.current = registration;

      if (registration.waiting && navigator.serviceWorker.controller) {
        setUpdateAvailable(true);
      }

      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing;
        if (!installingWorker) {
          return;
        }

        installingWorker.addEventListener('statechange', () => {
          if (
            installingWorker.state === 'installed' &&
            navigator.serviceWorker.controller &&
            !isDisposed
          ) {
            registrationRef.current = registration;
            setUpdateAvailable(true);
          }
        });
      });
    };

    const registerWorker = async () => {
      try {
        const registration = await registerManagedPwaServiceWorker();

        if (isDisposed || !registration) {
          return;
        }

        setIsRegistered(Boolean(registration.active || registration.installing || registration.waiting));
        setUpdateAvailable(Boolean(registration.waiting && navigator.serviceWorker.controller));
        watchRegistration(registration);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn('[PWA] Failed to register auth service worker.', error);
        }

        if (!isDisposed) {
          setIsRegistered(false);
          setUpdateAvailable(false);
        }
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    void registerWorker();

    return () => {
      isDisposed = true;
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, [enabled, isSupported, surfaceKey]);

  const applyUpdate = async () => {
    const waitingWorker = registrationRef.current?.waiting;
    if (!waitingWorker) {
      return;
    }

    shouldReloadOnControllerChangeRef.current = true;
    waitingWorker.postMessage({ type: SKIP_WAITING_MESSAGE });
  };

  return {
    applyUpdate,
    isRegistered,
    isSupported,
    updateAvailable,
  };
};

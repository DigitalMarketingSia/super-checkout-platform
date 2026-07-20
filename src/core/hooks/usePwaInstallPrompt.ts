import { useEffect, useMemo, useState } from 'react';
import { getPwaInstallDismissStorageKey, type PwaSurfaceKey } from '../config/pwa';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const isBrowserStandalone = () => {
  if (typeof window === 'undefined') return false;

  return window.matchMedia('(display-mode: standalone)').matches;
};

const isNavigatorStandalone = () => {
  if (typeof navigator === 'undefined') return false;

  return Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
};

const isIosSafari = () => {
  if (typeof navigator === 'undefined') return false;

  const userAgent = navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(userAgent);
  const isSafari = userAgent.includes('safari')
    && !userAgent.includes('crios')
    && !userAgent.includes('fxios')
    && !userAgent.includes('edgios')
    && !userAgent.includes('chrome');

  return isIos && isSafari;
};

export const usePwaInstallPrompt = (surfaceKey: PwaSurfaceKey | null, enabled: boolean) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [manualInstallAvailable, setManualInstallAvailable] = useState(false);

  const dismissStorageKey = useMemo(
    () => (surfaceKey ? getPwaInstallDismissStorageKey(surfaceKey) : null),
    [surfaceKey]
  );

  useEffect(() => {
    if (!dismissStorageKey || typeof window === 'undefined') {
      setDismissed(false);
      return;
    }

    setDismissed(window.localStorage.getItem(dismissStorageKey) === '1');
  }, [dismissStorageKey]);

  useEffect(() => {
    if (!surfaceKey || !enabled || typeof window === 'undefined') {
      setDeferredPrompt(null);
      setIsStandalone(false);
      setManualInstallAvailable(false);
      return;
    }

    const mediaQuery = window.matchMedia('(display-mode: standalone)');

    const updateStandaloneState = () => {
      const nextStandalone = isBrowserStandalone() || isNavigatorStandalone();
      setIsStandalone(nextStandalone);
      setManualInstallAvailable(!nextStandalone && isIosSafari());
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      setManualInstallAvailable(false);

      if (dismissStorageKey) {
        window.localStorage.removeItem(dismissStorageKey);
      }

      setDismissed(false);
    };

    updateStandaloneState();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateStandaloneState);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(updateStandaloneState);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', updateStandaloneState);
      } else if (typeof mediaQuery.removeListener === 'function') {
        mediaQuery.removeListener(updateStandaloneState);
      }

      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [dismissStorageKey, enabled, surfaceKey]);

  const dismiss = () => {
    if (!dismissStorageKey || typeof window === 'undefined') return;

    window.localStorage.setItem(dismissStorageKey, '1');
    setDismissed(true);
  };

  const promptInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt || !dismissStorageKey || typeof window === 'undefined') {
      return 'unavailable';
    }

    await deferredPrompt.prompt();

    try {
      const choice = await deferredPrompt.userChoice;

      if (choice.outcome === 'accepted') {
        window.localStorage.removeItem(dismissStorageKey);
        setDismissed(false);
        setIsStandalone(true);
      } else {
        window.localStorage.setItem(dismissStorageKey, '1');
        setDismissed(true);
      }

      return choice.outcome;
    } finally {
      setDeferredPrompt(null);
    }
  };

  const canPromptInstall = Boolean(deferredPrompt);
  const canShowManualInstall = !canPromptInstall && manualInstallAvailable;
  const isVisible = enabled && Boolean(surfaceKey) && !isStandalone && !dismissed && (canPromptInstall || canShowManualInstall);

  return {
    canPromptInstall,
    canShowManualInstall,
    dismiss,
    isStandalone,
    isVisible,
    promptInstall,
  };
};

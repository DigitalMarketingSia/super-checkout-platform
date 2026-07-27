import React from 'react';
import { Download, RefreshCcw, Share2, Smartphone } from 'lucide-react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  getPwaSurfaceKey,
  isPwaCapabilityEnabledForContext,
  isPwaInstallSurface,
} from '../../config/pwa';
import { useInstallation } from '../../context/InstallationContext';
import { usePwaInstallPrompt } from '../../hooks/usePwaInstallPrompt';
import { usePwaManifestLink } from '../../hooks/usePwaManifestLink';
import { usePwaServiceWorker } from '../../hooks/usePwaServiceWorker';
import { Button } from './Button';

export const PwaInstallBanner: React.FC = () => {
  const location = useLocation();
  const { t } = useTranslation('common');
  const { installationId } = useInstallation();

  const surfaceKey = getPwaSurfaceKey(location.pathname);
  const isAuthorizedSurface = isPwaInstallSurface(location.pathname);
  const hostname = typeof window !== 'undefined' ? window.location.hostname : null;
  const rolloutContext = {
    hostname,
    installationId,
    surfaceKey,
  };
  const shellEnabled = isPwaCapabilityEnabledForContext('shell', rolloutContext);
  const serviceWorkerEnabled = isPwaCapabilityEnabledForContext('serviceWorker', rolloutContext);

  usePwaManifestLink(surfaceKey, isAuthorizedSurface && shellEnabled);

  const { applyUpdate, updateAvailable } = usePwaServiceWorker(
    surfaceKey,
    shellEnabled && serviceWorkerEnabled && isAuthorizedSurface
  );
  const { canPromptInstall, canShowManualInstall, dismiss, isVisible, promptInstall } = usePwaInstallPrompt(
    surfaceKey,
    shellEnabled && isAuthorizedSurface
  );

  if (!surfaceKey || !isAuthorizedSurface) {
    return null;
  }

  if (updateAvailable) {
    const updateTitle = surfaceKey === 'portal'
      ? t('pwa_update.portal_title')
      : t('pwa_update.admin_title');

    const updateDescription = surfaceKey === 'portal'
      ? t('pwa_update.portal_description')
      : t('pwa_update.admin_description');

    return (
      <div className="relative mb-4 overflow-hidden rounded-[1.5rem] border border-white/20 bg-gradient-to-br from-orange-600 to-yellow-500 p-4 text-white shadow-[0_24px_80px_-36px_rgba(234,88,12,0.7)] sm:mb-6 sm:p-5">
        <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-10 left-6 h-24 w-24 rounded-full bg-black/10 blur-2xl" />

        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/15 text-white backdrop-blur-sm">
                <RefreshCcw className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-orange-50/85">
                  {t('pwa_update.badge')}
                </p>
                <h3 className="truncate text-sm font-black uppercase tracking-[0.08em] text-white sm:text-base">
                  {updateTitle}
                </h3>
              </div>
            </div>

            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-orange-50/90">
              {updateDescription}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              onClick={() => void applyUpdate()}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-black/20 px-5 text-xs font-black uppercase tracking-widest text-white hover:bg-black/30 sm:w-auto"
            >
              <RefreshCcw className="h-4 w-4" />
              {t('pwa_update.action')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!shellEnabled || !isVisible) {
    return null;
  }

  const title = surfaceKey === 'portal'
    ? t('pwa_install.portal_title')
    : t('pwa_install.admin_title');

  const description = surfaceKey === 'portal'
    ? t('pwa_install.portal_description')
    : t('pwa_install.admin_description');

  return (
    <div className="mb-4 rounded-[1.5rem] border border-primary/20 bg-primary/10 p-4 text-primary-light shadow-[0_20px_60px_-30px_rgba(138,43,226,0.45)] sm:mb-6 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-black/20 text-primary">
              {canShowManualInstall ? <Share2 className="h-5 w-5" /> : <Smartphone className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary/80">
                {t('pwa_install.badge')}
              </p>
              <h3 className="truncate text-sm font-black uppercase tracking-[0.08em] text-white sm:text-base">
                {title}
              </h3>
            </div>
          </div>

          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-primary-light/80">
            {description}
          </p>

          {canShowManualInstall && (
            <p className="mt-2 text-xs font-medium leading-relaxed text-primary-light/70">
              {t('pwa_install.ios_hint')}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <Button
            variant="ghost"
            onClick={dismiss}
            className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-bold text-gray-200 hover:bg-white/10 sm:w-auto"
          >
            {t('pwa_install.dismiss')}
          </Button>

          {canPromptInstall && (
            <Button
              onClick={() => void promptInstall()}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl !bg-white px-5 text-xs font-black uppercase tracking-widest !text-black hover:!bg-white/90 sm:w-auto"
            >
              <Download className="h-4 w-4" />
              {t('pwa_install.action')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

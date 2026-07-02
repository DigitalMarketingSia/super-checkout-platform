import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { Button } from '../ui/Button';
import { useConsent } from '../../context/ConsentContext';

export const ConsentBanner: React.FC = () => {
  const { t } = useTranslation('public');
  const { isLoaded, hasPreference, acceptAll, rejectOptional, openPreferences } = useConsent();

  if (!isLoaded || hasPreference) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4">
      <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-[#0F0F13]/95 p-5 text-white shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {t('consent.banner_title')}
            </div>
            <p className="max-w-2xl text-sm leading-relaxed text-gray-300">
              {t('consent.banner_description')}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              onClick={rejectOptional}
              className="h-11 rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
            >
              {t('consent.reject_optional')}
            </Button>
            <Button
              type="button"
              onClick={openPreferences}
              className="h-11 rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
            >
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              {t('consent.customize')}
            </Button>
            <Button
              type="button"
              onClick={acceptAll}
              className="h-11 rounded-2xl bg-primary px-5 text-sm font-semibold text-white hover:bg-rose-600"
            >
              {t('consent.accept_all')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

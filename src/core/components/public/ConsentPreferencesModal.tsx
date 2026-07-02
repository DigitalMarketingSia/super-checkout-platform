import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useConsent } from '../../context/ConsentContext';

export const ConsentPreferencesModal: React.FC = () => {
  const { t } = useTranslation('public');
  const {
    isPreferencesOpen,
    closePreferences,
    preferences,
    savePreferences,
  } = useConsent();

  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    if (!isPreferencesOpen) return;

    setAnalytics(preferences?.categories.analytics === true);
    setMarketing(preferences?.categories.marketing === true);
  }, [isPreferencesOpen, preferences]);

  return (
    <Modal
      isOpen={isPreferencesOpen}
      onClose={closePreferences}
      title={t('consent.banner_title')}
      className="max-w-2xl"
    >
      <div className="space-y-6 text-sm text-gray-300">
        <p className="leading-relaxed">
          {t('consent.preferences_description')}
        </p>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-white">{t('consent.categories.necessary.title')}</p>
                <p className="mt-1 text-xs leading-relaxed text-gray-400">
                  {t('consent.categories.necessary.description')}
                </p>
              </div>
              <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
                {t('consent.categories.necessary.always_active')}
              </span>
            </div>
          </div>

          <label className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div>
              <p className="font-semibold text-white">{t('consent.categories.analytics.title')}</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-400">
                {t('consent.categories.analytics.description')}
              </p>
            </div>
            <input
              type="checkbox"
              checked={analytics}
              onChange={(event) => setAnalytics(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-white/10 bg-[#05050A] text-primary focus:ring-primary"
            />
          </label>

          <label className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div>
              <p className="font-semibold text-white">{t('consent.categories.marketing.title')}</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-400">
                {t('consent.categories.marketing.description')}
              </p>
            </div>
            <input
              type="checkbox"
              checked={marketing}
              onChange={(event) => setMarketing(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-white/10 bg-[#05050A] text-primary focus:ring-primary"
            />
          </label>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            onClick={closePreferences}
            className="h-11 rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
          >
            {t('consent.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => savePreferences({
              categories: {
                necessary: true,
                analytics,
                marketing,
              },
            })}
            className="h-11 rounded-2xl bg-primary px-5 text-sm font-semibold text-white hover:bg-rose-600"
          >
            {t('consent.save_preferences')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

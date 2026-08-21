import React, { useState } from 'react';
import {
  Bell,
  BellOff,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RefreshCcw,
  ShieldCheck,
  Smartphone,
  Sliders,
  TriangleAlert,
  Zap,
} from 'lucide-react';
import { useLocation } from 'react-router';
import {
  getPwaSurfaceKey,
  isPwaCapabilityEnabledForContext,
} from '../../config/pwa';
import { useInstallation } from '../../context/InstallationContext';
import { usePwaPushNotifications } from '../../hooks/usePwaPushNotifications';
import type { PushPreferences } from '../../types/pwaPush';
import { Button } from './Button';
import { useTranslation } from 'react-i18next';

const PREFERENCE_ROWS: Array<{
  key: keyof PushPreferences;
  titleKey: string;
  descriptionKey: string;
  badgeKey?: string;
}> = [
  {
    key: 'enabled',
    titleKey: 'coverage.pwa.preference.enabled_title',
    descriptionKey: 'coverage.pwa.preference.enabled_description',
  },
  {
    key: 'sale_approved',
    titleKey: 'coverage.pwa.preference.sale_approved_title',
    descriptionKey: 'coverage.pwa.preference.sale_approved_description',
    badgeKey: 'coverage.pwa.active',
  },
  {
    key: 'payment_failed',
    titleKey: 'coverage.pwa.preference.payment_failed_title',
    descriptionKey: 'coverage.pwa.preference.payment_failed_description',
    badgeKey: 'coverage.pwa.active',
  },
  {
    key: 'lead_captured',
    titleKey: 'coverage.pwa.preference.lead_captured_title',
    descriptionKey: 'coverage.pwa.preference.lead_captured_description',
  },
  {
    key: 'system_alerts',
    titleKey: 'coverage.pwa.preference.system_alerts_title',
    descriptionKey: 'coverage.pwa.preference.system_alerts_description',
  },
];

const SURFACE_LABEL: Record<'admin' | 'portal', string> = {
  admin: 'coverage.pwa.surface.admin',
  portal: 'coverage.pwa.surface.portal',
};

type TranslationFn = (key: string, options?: Record<string, unknown>) => string;

function getPermissionLabel(permission: string, t: TranslationFn) {
  switch (permission) {
    case 'granted':
      return t('coverage.pwa.permission.granted');
    case 'denied':
      return t('coverage.pwa.permission.denied');
    case 'revoked':
      return t('coverage.pwa.permission.revoked');
    default:
      return t('coverage.pwa.permission.pending');
  }
}

function getDeliveryStateLabel(state: string | null | undefined, t: TranslationFn) {
  switch (state) {
    case 'registered':
      return t('coverage.pwa.delivery.registered');
    case 'sent':
      return t('coverage.pwa.delivery.sent');
    case 'received':
      return t('coverage.pwa.delivery.received');
    case 'clicked':
      return t('coverage.pwa.delivery.clicked');
    case 'error':
      return t('coverage.pwa.delivery.error');
    case 'reset':
      return t('coverage.pwa.delivery.reset');
    case 'revoked':
      return t('coverage.pwa.delivery.revoked');
    default:
      return t('coverage.pwa.delivery.empty');
  }
}

function formatDateTime(value: string | null | undefined, t: TranslationFn) {
  if (!value) {
    return t('coverage.pwa.not_recorded');
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return t('coverage.pwa.invalid_date');
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(parsed);
}

function maskEndpoint(value: string | null | undefined, t: TranslationFn) {
  if (!value) {
    return t('coverage.pwa.no_endpoint');
  }

  return value.length > 52
    ? `${value.slice(0, 28)}...${value.slice(-16)}`
    : value;
}

export const PwaPushSettingsCard: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const { installationId } = useInstallation();
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const surfaceKey = getPwaSurfaceKey(location.pathname);
  const hostname = typeof window !== 'undefined' ? window.location.hostname : null;
  const rolloutContext = {
    surfaceKey,
    hostname,
    installationId,
  };

  const pushEnabled = isPwaCapabilityEnabledForContext('push', rolloutContext);
  const {
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
    targetServiceWorkerVersion,
  } = usePwaPushNotifications(surfaceKey, pushEnabled);

  if (!surfaceKey) {
    return null;
  }

  const activeSubscriptions = subscriptions.filter((entry) => entry.is_active);
  const activeSurfaceSubscriptions = activeSubscriptions.filter((entry) => entry.surface_key === surfaceKey);
  const activeOtherSurfaceSubscriptions = activeSubscriptions.filter((entry) => entry.surface_key !== surfaceKey);
  const hasCurrentDeviceSubscription = Boolean(currentDeviceSubscription);
  const canEnablePush = pushEnabled && isSupported && hasPublicKey && permission !== 'denied' && !hasCurrentDeviceSubscription;
  const canSendTest = pushEnabled && isSupported && hasPublicKey && serverConfigured && hasCurrentDeviceSubscription && preferences.enabled;
  const canSendSurfaceTest = pushEnabled && isSupported && hasPublicKey && serverConfigured && preferences.enabled && activeSurfaceSubscriptions.length > 1;
  const canDisablePush = Boolean(localSubscriptionEndpoint);
  const canResetPush = pushEnabled && isSupported;
  const currentSurfaceLabel = t(SURFACE_LABEL[surfaceKey]);
  const orderedActiveSubscriptions = [...activeSubscriptions].sort((left, right) => {
    const leftCurrent = left.endpoint === localSubscriptionEndpoint ? 1 : 0;
    const rightCurrent = right.endpoint === localSubscriptionEndpoint ? 1 : 0;

    if (leftCurrent !== rightCurrent) {
      return rightCurrent - leftCurrent;
    }

    if (left.surface_key !== right.surface_key) {
      return left.surface_key === surfaceKey ? -1 : 1;
    }

    return 0;
  });

  let operationalStatus = t('coverage.pwa.status.ready');
  if (!isSupported) {
    operationalStatus = t('coverage.pwa.status.unsupported');
  } else if (!pushEnabled) {
    operationalStatus = t('coverage.pwa.status.disabled');
  } else if (!hasPublicKey) {
    operationalStatus = t('coverage.pwa.status.no_public_key');
  } else if (!serverConfigured) {
    operationalStatus = t('coverage.pwa.status.no_server_key');
  } else if (permission === 'denied') {
    operationalStatus = t('coverage.pwa.status.permission_denied');
  } else if (!isServiceWorkerRegistered) {
    operationalStatus = t('coverage.pwa.status.worker_unstable');
  } else if (permission === 'granted' && !hasCurrentDeviceSubscription) {
    operationalStatus = t('coverage.pwa.status.ready_to_activate');
  } else if (currentDeviceSubscription?.last_delivery_state === 'error') {
    operationalStatus = t('coverage.pwa.status.last_failed');
  } else if (activeSurfaceSubscriptions.length > 1) {
    operationalStatus = t('coverage.pwa.status.multiple_devices', { count: activeSurfaceSubscriptions.length, surface: currentSurfaceLabel.toLowerCase() });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-in fade-in duration-500 sm:space-y-8">
      {/* Main Glass Card matching "Escolha o Template" */}
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0C0C14] p-5 shadow-2xl sm:rounded-[2.5rem] sm:p-8">
        {/* Glass light reflection ray */}
        <div className="absolute -top-16 -left-16 w-44 h-44 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Dash Indicators at top */}
        <div className="flex justify-center gap-1.5 mb-8">
          <div className="w-8 h-1 rounded-full bg-cyan-400" />
          <div className="w-8 h-1 rounded-full bg-white/10" />
          <div className="w-8 h-1 rounded-full bg-white/10" />
          <div className="w-8 h-1 rounded-full bg-white/10" />
          <div className="w-8 h-1 rounded-full bg-white/10" />
        </div>

        {/* Central Illustration Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-b from-cyan-500/20 to-cyan-500/5 border border-cyan-500/20 flex items-center justify-center shadow-xl mb-4 group hover:scale-105 transition-transform duration-300">
            <Bell className="w-9 h-9 text-cyan-400 animate-pulse-slow" />
          </div>
          <h3 className="text-xl font-portal-display text-white uppercase italic tracking-tight mb-1">
            {t('coverage.pwa.title')}
          </h3>
          <p className="text-xs text-gray-400 max-w-xs font-medium">
            {t('coverage.pwa.description')}
          </p>

          {/* Device Status Badge */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider border ${
              permission === 'granted' && hasCurrentDeviceSubscription
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
                : permission === 'denied'
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}>
              {permission === 'granted' && hasCurrentDeviceSubscription ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {t('coverage.pwa.active_on_device')}
                </>
              ) : permission === 'denied' ? (
                <>
                  <TriangleAlert className="w-3.5 h-3.5" />
                  {t('coverage.pwa.permission_blocked_browser')}
                </>
              ) : (
                <>
                  <Smartphone className="w-3.5 h-3.5" />
                  {t('coverage.pwa.device_pending')}
                </>
              )}
            </span>

            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-gray-300">
              {t('coverage.pwa.active_devices', { count: activeSurfaceSubscriptions.length })}
            </span>
          </div>
        </div>

        {/* Operational Banner Status */}
        <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-center">
          <p className="text-xs leading-relaxed text-gray-300 font-medium">
            {operationalStatus}
          </p>
        </div>

        {/* Main CTA Actions Row */}
        <div className="flex flex-wrap items-center justify-center gap-3 border-b border-white/5 pb-8 mb-8">
          {canEnablePush && (
            <Button
              onClick={() => void enablePush()}
              className="h-11 rounded-xl bg-cyan-400 px-5 text-xs font-black uppercase tracking-widest text-black hover:bg-cyan-300 shadow-lg shadow-cyan-400/20"
              disabled={isMutating}
            >
              <Smartphone className="mr-2 h-4 w-4" />
              {t('coverage.pwa.activate_device')}
            </Button>
          )}

          {canSendTest && (
            <Button
              onClick={() => void sendTest({
                endpoint: localSubscriptionEndpoint,
                surfaceKey,
                successMessage: t('coverage.pwa.test_sent_current'),
              })}
              className="h-11 rounded-xl bg-white px-5 text-xs font-black uppercase tracking-widest text-black hover:bg-white/90 shadow-lg"
              disabled={isMutating}
            >
              <Bell className="mr-2 h-4 w-4 text-black" />
              {t('coverage.pwa.test_device')}
            </Button>
          )}

          {canSendSurfaceTest && (
            <Button
              variant="ghost"
              onClick={() => void sendTest({
                surfaceKey,
                successMessage: t('coverage.pwa.test_sent_surface', { surface: currentSurfaceLabel.toLowerCase() }),
                emptyMessage: t('coverage.pwa.test_empty_surface', { surface: currentSurfaceLabel.toLowerCase() }),
              })}
              className="h-11 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 text-xs font-black uppercase tracking-widest text-cyan-100 hover:bg-cyan-400/15"
              disabled={isMutating}
            >
              <Bell className="mr-2 h-4 w-4" />
              {t('coverage.pwa.test_all')}
            </Button>
          )}

          <Button
            variant="ghost"
            onClick={() => void loadState()}
            className="h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-black uppercase tracking-widest text-gray-300 hover:bg-white/10"
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            {t('coverage.common.refresh')}
          </Button>

          {canDisablePush && (
            <Button
              variant="ghost"
              onClick={() => void disablePush()}
              className="h-11 rounded-xl border border-red-500/20 bg-red-500/10 px-4 text-xs font-black uppercase tracking-widest text-red-200 hover:bg-red-500/15"
              disabled={isMutating}
            >
              <BellOff className="mr-2 h-4 w-4" />
              {t('coverage.pwa.disable')}
            </Button>
          )}

          {canResetPush && (
            <Button
              variant="ghost"
              onClick={() => void resetPushState()}
              className="h-11 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 text-xs font-black uppercase tracking-widest text-amber-100 hover:bg-amber-400/15"
              disabled={isMutating}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              {t('coverage.common.reset')}
            </Button>
          )}
        </div>

        {/* SECTION 1: EVENT TOGGLES (WITH HIGHLIGHTED MASTER SWITCH CARD) */}
        <div className="space-y-4 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <h4 className="text-sm font-black uppercase tracking-wider text-white">
                {t('coverage.pwa.active_events')}
              </h4>
            </div>
            <span className="text-[10px] text-gray-500 font-mono">{t('coverage.pwa.saved_preferences')}</span>
          </div>

          <div className="space-y-3">
            {PREFERENCE_ROWS.map((row) => {
              const value = Boolean(preferences[row.key]);
              const isMaster = row.key === 'enabled';

              return (
                <div
                  key={row.key}
                  className={`group flex items-center justify-between gap-4 rounded-2xl p-4 transition-all duration-300 ${
                    isMaster
                      ? value
                        ? 'bg-gradient-to-r from-cyan-500/25 via-cyan-500/15 to-primary/20 border-2 border-cyan-400/50 shadow-[0_0_25px_rgba(6,182,212,0.2)]'
                        : 'bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent border-2 border-amber-500/40 text-amber-200'
                      : 'border border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="min-w-0 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`text-sm transition-colors ${
                        isMaster
                          ? value
                            ? 'text-cyan-200 font-black text-base'
                            : 'text-amber-200 font-bold text-base'
                          : 'text-white font-bold group-hover:text-cyan-300'
                      }`}>
                        {t(row.titleKey)}
                      </p>
                      {isMaster && (
                        <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                          value
                            ? 'bg-cyan-400 text-black shadow-md shadow-cyan-400/40 font-black'
                            : 'bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold'
                        }`}>
                          {value ? t('coverage.pwa.master_channel_active') : t('coverage.pwa.channel_disabled')}
                        </span>
                      )}
                      {!isMaster && row.badgeKey && (
                        <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[8px] font-black uppercase text-emerald-400">
                          {row.badgeKey ? t(row.badgeKey) : null}
                        </span>
                      )}
                    </div>
                    <p className={`mt-1 text-xs leading-normal ${
                      isMaster ? (value ? 'text-cyan-100/90 font-medium' : 'text-amber-200/80') : 'text-gray-400'
                    }`}>
                      {t(row.descriptionKey)}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={isMutating || isLoading}
                    onClick={() => void savePreferences({ [row.key]: !value } as Partial<PushPreferences>)}
                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      value
                        ? isMaster
                          ? 'bg-cyan-400 shadow-md shadow-cyan-400/40'
                          : 'bg-cyan-500'
                        : 'bg-gray-800'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        value ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* SECTION 2: CONNECTED DEVICES */}
        <div className="space-y-4 border-t border-white/5 pt-6 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-cyan-400" />
              <h4 className="text-sm font-black uppercase tracking-wider text-white">
                {t('coverage.pwa.connected_devices')}
              </h4>
            </div>
            <span className="text-[10px] text-gray-500 font-mono">{t('coverage.pwa.active_count', { count: activeSubscriptions.length })}</span>
          </div>

          {activeSubscriptions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-center text-xs text-gray-400">
              {t('coverage.pwa.no_connected_devices')}
            </div>
          ) : (
            <div className="space-y-3">
              {orderedActiveSubscriptions.map((subscription) => {
                const isCurrentDevice = subscription.endpoint === localSubscriptionEndpoint;

                return (
                  <div
                    key={subscription.id}
                    className={`rounded-2xl border p-4 transition-all ${
                      isCurrentDevice
                        ? 'border-cyan-500/30 bg-cyan-500/5'
                        : 'border-white/5 bg-white/[0.02]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 text-left">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold text-white">
                            {subscription.device_label || t('coverage.pwa.unnamed_device')}
                          </p>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-black uppercase text-gray-300">
                            {SURFACE_LABEL[subscription.surface_key]}
                          </span>
                          {isCurrentDevice && (
                            <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-black uppercase text-cyan-300">
                              {t('coverage.pwa.this_device')}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-gray-400">
                          {t('coverage.pwa.device_state', { state: getDeliveryStateLabel(subscription.last_delivery_state, t), date: formatDateTime(subscription.last_seen_at, t) })}
                        </p>
                      </div>

                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    </div>

                    <div className="mt-3 flex gap-2">
                      <Button
                        variant="ghost"
                        onClick={() => void sendTest({
                          endpoint: subscription.endpoint,
                          surfaceKey: subscription.surface_key,
                          successMessage: isCurrentDevice
                            ? t('coverage.pwa.test_resent_current')
                            : t('coverage.pwa.test_sent_selected'),
                        })}
                        className="h-8 rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 text-[10px] font-black uppercase tracking-wider text-cyan-200 hover:bg-cyan-400/15"
                        disabled={isMutating || !pushEnabled || !isSupported || !hasPublicKey || !serverConfigured || !preferences.enabled}
                      >
                        <Bell className="mr-1.5 h-3 w-3" />
                        {t('coverage.pwa.test')}
                      </Button>

                      <Button
                        variant="ghost"
                        onClick={() => void disablePush({
                          endpoint: subscription.endpoint,
                          surfaceKey: subscription.surface_key,
                          successMessage: isCurrentDevice
                            ? t('coverage.pwa.disabled_current')
                            : t('coverage.pwa.disabled_selected'),
                        })}
                        className="h-8 rounded-lg border border-red-500/20 bg-red-500/10 px-3 text-[10px] font-black uppercase tracking-wider text-red-200 hover:bg-red-500/15"
                        disabled={isMutating}
                      >
                        <BellOff className="mr-1.5 h-3 w-3" />
                        {t('coverage.pwa.disable')}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SECTION 3: TECHNICAL DIAGNOSTICS & DEBUG (SEGUNDO PLANO / ACCORDION COLAPSÁVEL) */}
        <div className="border-t border-white/5 pt-6">
          <button
            type="button"
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="w-full flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition-all hover:bg-white/[0.06]"
          >
            <div className="flex items-center gap-2.5">
              <Zap className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-black uppercase tracking-wider text-gray-300">
                {t('coverage.pwa.diagnostics.title')}
              </span>
            </div>
            {showDiagnostics ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {showDiagnostics && (
            <div className="mt-4 space-y-4 animate-in slide-in-from-top-2 duration-300">
              <div className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-2 text-left">
                <h5 className="text-xs font-bold text-white uppercase tracking-wider mb-3">
                  {t('coverage.pwa.local_device_state')}
                </h5>
                {[
                  [t('coverage.pwa.diagnostics.installed_mode'), isStandalone ? t('coverage.common.yes') : t('coverage.common.no')],
                  [t('coverage.pwa.diagnostics.worker_registered'), isServiceWorkerRegistered ? t('coverage.common.yes') : t('coverage.common.no')],
                  [t('coverage.pwa.diagnostics.controller_active'), controllerPresent ? t('coverage.common.yes') : t('coverage.common.no')],
                  [t('coverage.pwa.diagnostics.worker_version'), serviceWorkerVersion || t('coverage.pwa.not_detected')],
                  [t('coverage.pwa.diagnostics.expected_version'), targetServiceWorkerVersion],
                  [t('coverage.pwa.diagnostics.local_permission'), getPermissionLabel(permission, t)],
                  [t('coverage.pwa.diagnostics.local_endpoint'), maskEndpoint(localSubscriptionEndpoint, t)],
                  [t('coverage.pwa.diagnostics.server_subscription'), hasCurrentDeviceSubscription ? t('coverage.pwa.found') : t('coverage.pwa.not_found')],
                  [t('coverage.pwa.diagnostics.vapid_server'), serverConfigured ? t('coverage.pwa.configured') : t('coverage.pwa.no_private_key')],
                  [t('coverage.pwa.diagnostics.last_local_read'), formatDateTime(lastLoadedAt, t)],
                  [t('coverage.pwa.diagnostics.server_time'), formatDateTime(serverTime, t)],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between text-[11px] py-1 border-b border-white/5 last:border-0">
                    <span className="text-gray-400">{label}:</span>
                    <span className="font-mono text-gray-200">{value}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-2 text-left">
                <h5 className="text-xs font-bold text-white uppercase tracking-wider mb-3">
                  {t('coverage.pwa.last_delivery_history')}
                </h5>
                {[
                  [t('coverage.pwa.history.state'), getDeliveryStateLabel(currentDeviceSubscription?.last_delivery_state, t)],
                  [t('coverage.pwa.history.last_test'), formatDateTime(currentDeviceSubscription?.last_test_sent_at, t)],
                  [t('coverage.pwa.history.received'), formatDateTime(currentDeviceSubscription?.last_push_received_at, t)],
                  [t('coverage.pwa.history.clicked'), formatDateTime(currentDeviceSubscription?.last_push_clicked_at, t)],
                  [t('coverage.pwa.history.last_tag'), currentDeviceSubscription?.last_delivery_tag || t('coverage.pwa.no_tag')],
                  [t('coverage.pwa.history.confirming_worker'), currentDeviceSubscription?.last_delivery_sw_version || t('coverage.pwa.not_confirmed')],
                  [t('coverage.pwa.history.last_error'), currentDeviceSubscription?.last_delivery_error || t('coverage.pwa.no_saved_error')],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between text-[11px] py-1 border-b border-white/5 last:border-0">
                    <span className="text-gray-400">{label}:</span>
                    <span className="font-mono text-gray-200">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

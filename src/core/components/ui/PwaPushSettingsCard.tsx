import React from 'react';
import {
  Bell,
  BellOff,
  CheckCircle2,
  RefreshCcw,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import {
  getPwaSurfaceKey,
  isPwaCapabilityEnabledForContext,
} from '../../config/pwa';
import { useInstallation } from '../../context/InstallationContext';
import { usePwaPushNotifications } from '../../hooks/usePwaPushNotifications';
import type { PushPreferences } from '../../types/pwaPush';
import { Button } from './Button';

const PREFERENCE_ROWS: Array<{
  key: keyof PushPreferences;
  title: string;
  description: string;
}> = [
  {
    key: 'enabled',
    title: 'Canal push deste usuario',
    description: 'Liga ou desliga o recebimento de push operacional para este usuario.',
  },
  {
    key: 'sale_approved',
    title: 'Venda aprovada',
    description: 'Ja ativo: envia push automatico quando uma venda e aprovada.',
  },
  {
    key: 'payment_failed',
    title: 'Pagamento com falha',
    description: 'Preparado para avisar quando um pagamento relevante falhar.',
  },
  {
    key: 'lead_captured',
    title: 'Lead relevante',
    description: 'Preparado para avisar novas capturas que merecem acao rapida.',
  },
  {
    key: 'system_alerts',
    title: 'Alertas do sistema',
    description: 'Reservado para avisos operacionais e de infraestrutura.',
  },
];

const SURFACE_LABEL: Record<'admin' | 'portal', string> = {
  admin: 'Painel',
  portal: 'Portal',
};

function getPermissionLabel(permission: string) {
  switch (permission) {
    case 'granted':
      return 'Permissao liberada';
    case 'denied':
      return 'Permissao bloqueada';
    case 'revoked':
      return 'Permissao revogada';
    default:
      return 'Permissao pendente';
  }
}

function getDeliveryStateLabel(state: string | null | undefined) {
  switch (state) {
    case 'registered':
      return 'Assinatura registrada';
    case 'sent':
      return 'Push enviado pelo servidor';
    case 'received':
      return 'Recebido no aparelho';
    case 'clicked':
      return 'Notificacao clicada';
    case 'error':
      return 'Falha no envio';
    case 'reset':
      return 'Resetado manualmente';
    case 'revoked':
      return 'Assinatura revogada';
    default:
      return 'Sem historico ainda';
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return 'Ainda nao registrado';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Data invalida';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(parsed);
}

function maskEndpoint(value: string | null | undefined) {
  if (!value) {
    return 'Nenhum endpoint local encontrado';
  }

  return value.length > 52
    ? `${value.slice(0, 28)}...${value.slice(-16)}`
    : value;
}

export const PwaPushSettingsCard: React.FC = () => {
  const location = useLocation();
  const { installationId } = useInstallation();

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
  const currentSurfaceLabel = SURFACE_LABEL[surfaceKey];
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

  let operationalStatus = 'Push pronto para assinatura e teste real do aparelho.';
  if (!isSupported) {
    operationalStatus = 'Este navegador ainda nao oferece suporte completo a Push API + Service Worker.';
  } else if (!pushEnabled) {
    operationalStatus = 'O rollout de push ainda esta desligado por flag neste ambiente.';
  } else if (!hasPublicKey) {
    operationalStatus = 'Falta configurar a chave publica do push para o navegador poder assinar este aparelho.';
  } else if (!serverConfigured) {
    operationalStatus = 'A assinatura do aparelho pode ser preparada, mas o servidor ainda precisa da chave privada VAPID para enviar push real.';
  } else if (permission === 'denied') {
    operationalStatus = 'A permissao de notificacao foi bloqueada no navegador. Libere manualmente e tente de novo.';
  } else if (!isServiceWorkerRegistered) {
    operationalStatus = 'O service worker ainda nao ficou estavel neste aparelho. O reset completo agora ja pode corrigir esse estado.';
  } else if (permission === 'granted' && !hasCurrentDeviceSubscription) {
    operationalStatus = 'A permissao ja foi liberada, mas este aparelho esta sem assinatura ativa. Toque em ativar neste aparelho para reconectar o push.';
  } else if (currentDeviceSubscription?.last_delivery_state === 'error') {
    operationalStatus = 'O ultimo push falhou no servidor. Agora o painel mostra o erro tecnico para ajudar na depuracao.';
  } else if (activeSurfaceSubscriptions.length > 1) {
    operationalStatus = `Este usuario ja tem ${activeSurfaceSubscriptions.length} aparelhos ativos em ${currentSurfaceLabel.toLowerCase()}. O teste do topo continua individual para diagnostico, enquanto o push real vai para todos os aparelhos ativos desta superficie.`;
  }

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0C0C14] p-5 shadow-2xl sm:rounded-[2.5rem] sm:p-8">
      <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 left-10 h-52 w-52 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

      <div className="relative flex flex-col gap-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300/80">
                  Fase 42.3C
                </p>
                <h3 className="text-xl font-black uppercase tracking-[0.05em] text-white sm:text-2xl">
                  Push Operacional do Painel
                </h3>
              </div>
            </div>

            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-gray-300">
              Camada atual entregue para assinatura do aparelho, consentimento do usuario, teste individual por dispositivo,
              diagnostico de entrega, reset completo deste dispositivo e primeiro push automatico de venda aprovada no admin.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                isSupported
                  ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
                  : 'border-amber-400/25 bg-amber-400/10 text-amber-300'
              }`}>
                {isSupported ? 'Push API suportada' : 'Sem suporte de push'}
              </span>

              <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                permission === 'granted'
                  ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
                  : permission === 'denied'
                    ? 'border-red-400/25 bg-red-400/10 text-red-300'
                    : 'border-white/10 bg-white/5 text-gray-300'
              }`}>
                {getPermissionLabel(permission)}
              </span>

              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-gray-300">
                {activeSurfaceSubscriptions.length} aparelho(s) ativos em {currentSurfaceLabel.toLowerCase()}
              </span>

              {activeOtherSurfaceSubscriptions.length > 0 && (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-gray-300">
                  {activeOtherSurfaceSubscriptions.length} em outras superficies
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap xl:max-w-md xl:justify-end">
            <Button
              variant="ghost"
              onClick={() => void loadState()}
              className="h-11 rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-black uppercase tracking-widest text-gray-100 hover:bg-white/10"
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Atualizar estado
            </Button>

            {canEnablePush && (
              <Button
                onClick={() => void enablePush()}
                className="h-11 rounded-xl bg-white px-5 text-xs font-black uppercase tracking-widest text-black hover:bg-white/90"
                disabled={isMutating}
              >
                <Smartphone className="mr-2 h-4 w-4" />
                Ativar neste aparelho
              </Button>
            )}

            {canSendTest && (
              <Button
                onClick={() => void sendTest({
                  endpoint: localSubscriptionEndpoint,
                  surfaceKey,
                  successMessage: 'Push de teste enviado para este aparelho.',
                })}
                className="h-11 rounded-xl bg-cyan-400 px-5 text-xs font-black uppercase tracking-widest text-black hover:bg-cyan-300"
                disabled={isMutating}
              >
                <Bell className="mr-2 h-4 w-4" />
                Testar este aparelho
              </Button>
            )}

            {canSendSurfaceTest && (
              <Button
                variant="ghost"
                onClick={() => void sendTest({
                  surfaceKey,
                  successMessage: `Push de teste enviado para os aparelhos ativos de ${currentSurfaceLabel.toLowerCase()}.`,
                  emptyMessage: `Nenhum aparelho ativo de ${currentSurfaceLabel.toLowerCase()} recebeu o push de teste.`,
                })}
                className="h-11 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 text-xs font-black uppercase tracking-widest text-cyan-100 hover:bg-cyan-400/15"
                disabled={isMutating}
              >
                <Bell className="mr-2 h-4 w-4" />
                Testar todos de {currentSurfaceLabel.toLowerCase()}
              </Button>
            )}

            {canDisablePush && (
              <Button
                variant="ghost"
                onClick={() => void disablePush()}
                className="h-11 rounded-xl border border-red-500/20 bg-red-500/10 px-4 text-xs font-black uppercase tracking-widest text-red-200 hover:bg-red-500/15"
                disabled={isMutating}
              >
                <BellOff className="mr-2 h-4 w-4" />
                Desativar aparelho
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
                Resetar push deste aparelho
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-[1.6rem] border border-white/10 bg-black/20 p-4">
          <div className="flex items-start gap-3">
            {permission === 'denied' || !pushEnabled || !hasPublicKey || !serverConfigured ? (
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            ) : (
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
            )}
            <p className="text-sm leading-relaxed text-gray-200">
              {operationalStatus}
            </p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.05fr,0.95fr]">
          <div className="rounded-[1.7rem] border border-white/10 bg-[#090912] p-4 sm:p-5">
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300/70">
                Diagnostico vivo
              </p>
              <h4 className="mt-1 text-base font-black uppercase tracking-[0.06em] text-white">
                Estado deste aparelho
              </h4>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                Aqui a gente enxerga o lado local do PWA: modo instalado, worker ativo, endpoint atual e sincronizacao com o servidor.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-cyan-200/75">
                Este bloco sempre mostra apenas o aparelho aberto agora. O teste do topo usa este endpoint local; o push automatico real continua indo para todos os aparelhos ativos da superficie.
              </p>
            </div>

            <div className="space-y-3">
              {[
                ['Modo instalado', isStandalone ? 'Sim' : 'Nao'],
                ['Worker registrado', isServiceWorkerRegistered ? 'Sim' : 'Nao'],
                ['Controller ativo', controllerPresent ? 'Sim' : 'Nao'],
                ['Versao do worker ativa', serviceWorkerVersion || 'Ainda nao detectada'],
                ['Versao esperada', targetServiceWorkerVersion],
                ['Permissao local', getPermissionLabel(permission)],
                ['Endpoint local', maskEndpoint(localSubscriptionEndpoint)],
                ['Assinatura no servidor', hasCurrentDeviceSubscription ? 'Encontrada para este aparelho' : 'Nao encontrada'],
                ['Servidor do push', serverConfigured ? 'Pronto para envio real' : 'Ainda sem chave privada VAPID'],
                ['Ultima leitura local', formatDateTime(lastLoadedAt)],
                ['Horario do servidor', formatDateTime(serverTime)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                >
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-400">
                    {label}
                  </p>
                  <p className="max-w-full break-words text-left text-sm font-semibold text-white sm:max-w-[62%] sm:text-right">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[1.7rem] border border-white/10 bg-[#090912] p-4 sm:p-5">
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300/70">
                Ultimo fluxo
              </p>
              <h4 className="mt-1 text-base font-black uppercase tracking-[0.06em] text-white">
                Entrega do push testada
              </h4>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                Esse bloco mostra o que o servidor marcou como enviado e o que o proprio service worker conseguiu confirmar como recebido ou clicado.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-cyan-200/75">
                No celular instalado, aqui fica o diagnostico mais confiavel para aquele Android. No desktop, o bloco passa a refletir o navegador do desktop.
              </p>
            </div>

            <div className="space-y-3">
              {[
                ['Estado registrado', getDeliveryStateLabel(currentDeviceSubscription?.last_delivery_state)],
                ['Ultimo envio de teste', formatDateTime(currentDeviceSubscription?.last_test_sent_at)],
                ['Recebido confirmado', formatDateTime(currentDeviceSubscription?.last_push_received_at)],
                ['Clique confirmado', formatDateTime(currentDeviceSubscription?.last_push_clicked_at)],
                ['Tag do ultimo push', currentDeviceSubscription?.last_delivery_tag || 'Ainda sem tag'],
                ['Worker que confirmou', currentDeviceSubscription?.last_delivery_sw_version || 'Ainda nao confirmado'],
                ['Ultimo erro', currentDeviceSubscription?.last_delivery_error || 'Nenhum erro salvo'],
                ['Evento local nesta sessao', lastWorkerEvent
                  ? `${getDeliveryStateLabel(lastWorkerEvent.eventType)} em ${formatDateTime(lastWorkerEvent.trackedAt)}`
                  : 'Nenhum evento local recebido nesta sessao'],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                >
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-400">
                    {label}
                  </p>
                  <p className="max-w-full break-words text-left text-sm font-semibold text-white sm:max-w-[62%] sm:text-right">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.3fr,0.9fr]">
          <div className="rounded-[1.7rem] border border-white/10 bg-[#090912] p-4 sm:p-5">
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300/70">
                Escopo inicial
              </p>
              <h4 className="mt-1 text-base font-black uppercase tracking-[0.06em] text-white">
                Eventos ativos nesta fase
              </h4>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                Essas preferencias ja ficam salvas no banco. Venda aprovada e falha de pagamento ja disparam automaticamente; lead relevante continua reservado para a proxima camada operacional.
              </p>
            </div>

            <div className="space-y-3">
              {PREFERENCE_ROWS.map((row) => {
                const value = Boolean(preferences[row.key]);

                return (
                  <div
                    key={row.key}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white">
                        {row.title}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-gray-400">
                        {row.description}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={isMutating || isLoading}
                      onClick={() => void savePreferences({ [row.key]: !value } as Partial<PushPreferences>)}
                      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                        value ? 'bg-emerald-500' : 'bg-gray-800'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                          value ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-[1.7rem] border border-white/10 bg-[#090912] p-4 sm:p-5">
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300/70">
                Assinaturas
              </p>
              <h4 className="mt-1 text-base font-black uppercase tracking-[0.06em] text-white">
                Aparelhos conectados
              </h4>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                Aqui voce consegue inspecionar e agir sobre os aparelhos ativos desta conta. O teste do topo continua individual para o aparelho aberto agora, mas cada linha abaixo pode ser testada ou desativada separadamente.
              </p>
            </div>

            {activeSubscriptions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm leading-relaxed text-gray-400">
                Nenhum aparelho ativo ainda. Assim que voce liberar a permissao e assinar este dispositivo, ele aparece aqui.
              </div>
            ) : (
              <div className="space-y-3">
                {orderedActiveSubscriptions.map((subscription) => {
                  const isCurrentDevice = subscription.endpoint === localSubscriptionEndpoint;

                  return (
                    <div
                      key={subscription.id}
                      className={`rounded-2xl border px-4 py-3 ${
                        isCurrentDevice
                          ? 'border-cyan-400/25 bg-cyan-400/[0.08]'
                          : 'border-white/10 bg-white/[0.02]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-bold text-white">
                              {subscription.device_label || 'Aparelho sem nome'}
                            </p>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-gray-300">
                              {SURFACE_LABEL[subscription.surface_key]}
                            </span>
                            {isCurrentDevice && (
                              <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200">
                                Este aparelho
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-gray-400">
                            {SURFACE_LABEL[subscription.surface_key]} conectado com permissao {subscription.permission_state}.
                          </p>
                          <p className="mt-1 text-[11px] text-gray-500">
                            Estado: {getDeliveryStateLabel(subscription.last_delivery_state)}.
                          </p>
                          <div className="mt-2 space-y-1 text-[11px] leading-relaxed text-gray-500">
                            <p>Instalacao: {maskEndpoint(subscription.endpoint)}</p>
                            <p>Ultimo contato: {formatDateTime(subscription.last_seen_at)}</p>
                            <p>Ultimo teste: {formatDateTime(subscription.last_test_sent_at)}</p>
                            <p>Recebido: {formatDateTime(subscription.last_push_received_at)}</p>
                            <p>Clique: {formatDateTime(subscription.last_push_clicked_at)}</p>
                          </div>
                        </div>

                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                      </div>

                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <Button
                          variant="ghost"
                          onClick={() => void sendTest({
                            endpoint: subscription.endpoint,
                            surfaceKey: subscription.surface_key,
                            successMessage: isCurrentDevice
                              ? 'Push de teste reenviado para este aparelho.'
                              : 'Push de teste enviado para o aparelho selecionado.',
                          })}
                          className="h-10 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-100 hover:bg-cyan-400/15"
                          disabled={isMutating || !pushEnabled || !isSupported || !hasPublicKey || !serverConfigured || !preferences.enabled}
                        >
                          <Bell className="mr-2 h-4 w-4" />
                          {isCurrentDevice ? 'Testar este aparelho' : 'Testar aparelho'}
                        </Button>

                        <Button
                          variant="ghost"
                          onClick={() => void disablePush({
                            endpoint: subscription.endpoint,
                            surfaceKey: subscription.surface_key,
                            successMessage: isCurrentDevice
                              ? 'Push desativado neste aparelho.'
                              : 'Assinatura do aparelho desativada com sucesso.',
                          })}
                          className="h-10 rounded-xl border border-red-500/20 bg-red-500/10 px-4 text-[11px] font-black uppercase tracking-[0.18em] text-red-200 hover:bg-red-500/15"
                          disabled={isMutating}
                        >
                          <BellOff className="mr-2 h-4 w-4" />
                          {isCurrentDevice ? 'Desativar neste aparelho' : 'Desativar aparelho'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

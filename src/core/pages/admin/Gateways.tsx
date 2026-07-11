import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Lock, ShieldCheck, Zap, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BusinessSetupModal } from '../../components/admin/BusinessSetupModal';
import { Layout } from '../../components/Layout';
import { Card } from '../../components/ui/Card';
import { AlertModal, Modal } from '../../components/ui/Modal';
import Aurora from '../../components/ui/Aurora';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';
import { storage } from '../../services/storageService';
import { isDemoDataRuntime } from '../../services/demoDataService';
import { Gateway, GatewayProvider } from '../../types';
import { detectAsaasApiKeyEnvironment } from '../../utils/asaas';
import { sanitizeTranslationHtml } from '../../utils/sanitize';

type MercadoPagoConfigState = {
  public_key: string;
  private_key: string;
  webhook_secret: string;
  active: boolean;
  max_installments: number;
  min_installment_value: number;
  has_private_key: boolean;
  has_webhook_secret: boolean;
};

type StripeConfigState = MercadoPagoConfigState & {
  interest_rate: number;
};

type PagSeguroConfigState = MercadoPagoConfigState & {
  environment: 'production' | 'sandbox';
};

const DEFAULT_MP_CONFIG: MercadoPagoConfigState = {
  public_key: '',
  private_key: '',
  webhook_secret: '',
  active: false,
  max_installments: 12,
  min_installment_value: 5.0,
  has_private_key: false,
  has_webhook_secret: false,
};

const DEFAULT_STRIPE_CONFIG: StripeConfigState = {
  public_key: '',
  private_key: '',
  webhook_secret: '',
  active: false,
  max_installments: 12,
  min_installment_value: 5.0,
  interest_rate: 2.99,
  has_private_key: false,
  has_webhook_secret: false,
};

type AsaasConfigState = {
  private_key: string;
  webhook_secret: string;
  active: boolean;
  max_installments: number;
  min_installment_value: number;
  has_private_key: boolean;
  has_webhook_secret: boolean;
  sandbox: boolean;
};

const DEFAULT_ASAAS_CONFIG: AsaasConfigState = {
  private_key: '',
  webhook_secret: '',
  active: false,
  max_installments: 12,
  min_installment_value: 5.0,
  has_private_key: false,
  has_webhook_secret: false,
  sandbox: false,
};

const DEFAULT_PAGSEGURO_CONFIG: PagSeguroConfigState = {
  public_key: '',
  private_key: '',
  webhook_secret: '',
  active: false,
  environment: 'production',
  max_installments: 12,
  min_installment_value: 5.0,
  has_private_key: false,
  has_webhook_secret: false,
};

const PAGBANK_GATEWAY_ENABLED = false;

type PagbankStatusTone = 'success' | 'warning' | 'danger' | 'neutral';

const formatStatusDate = (value: unknown) => {
  const rawValue = typeof value === 'string' ? value.trim() : '';
  if (!rawValue) return null;

  const parsed = Date.parse(rawValue);
  if (!Number.isFinite(parsed)) return null;

  return new Date(parsed).toLocaleString('pt-BR');
};

const formatPagbankEnvironmentLabel = (value: unknown) => {
  return value === 'sandbox' ? 'Sandbox' : 'Producao';
};

const formatAsaasEnvironmentLabel = (value: unknown) => {
  return value === true ? 'Sandbox' : 'Producao';
};

const formatPagbankRefreshSource = (value: unknown) => {
  switch (String(value || '').trim()) {
    case 'central_refresh':
      return 'Refresh central';
    case 'local_refresh':
      return 'Refresh local';
    case 'oauth_connect':
      return 'Conexao oficial';
    case 'oauth_connect_sandbox':
      return 'Conexao sandbox';
    case 'oauth_callback':
      return 'Callback oficial';
    case 'oauth_callback_sandbox':
      return 'Callback sandbox';
    case 'admin_disconnect':
      return 'Desconexao manual';
    case 'fallback':
      return 'Fallback do token salvo';
    case 'failed':
      return 'Falha sem refresh';
    default:
      return String(value || '').trim() || null;
  }
};

const normalizeInlineMessage = (value: unknown, maxLength: number = 140) => {
  const message = String(value || '').replace(/\s+/g, ' ').trim();
  if (!message) return null;
  return message.length > maxLength ? `${message.slice(0, maxLength - 3)}...` : message;
};

export const Gateways = () => {
  const { t } = useTranslation(['admin', 'common']);
  const { compliance, user, session } = useAuth();
  const isDemoMode = isDemoDataRuntime();

  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [showComplianceModal, setShowComplianceModal] = useState(false);
  const [mpConfig, setMpConfig] = useState<MercadoPagoConfigState>(DEFAULT_MP_CONFIG);
  const [stripeConfig, setStripeConfig] = useState<StripeConfigState>(DEFAULT_STRIPE_CONFIG);
  const [pagSeguroConfig, setPagSeguroConfig] = useState<PagSeguroConfigState>(DEFAULT_PAGSEGURO_CONFIG);
  const [asaasConfig, setAsaasConfig] = useState<AsaasConfigState>(DEFAULT_ASAAS_CONFIG);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeModalApp, setActiveModalApp] = useState<'mp' | 'stripe' | 'pagseguro' | 'asaas' | null>(null);
  const [isConnectingOauth, setIsConnectingOauth] = useState(false);
  const [pagbankDisconnectRequested, setPagbankDisconnectRequested] = useState(false);
  const [pagbankDebugUnlocked, setPagbankDebugUnlocked] = useState(false);
  const [pagbankSandboxSellerEmail, setPagbankSandboxSellerEmail] = useState('');
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'success' | 'error' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'info',
  });

  const showAlert = (title: string, message: string, variant: 'success' | 'error' | 'info' = 'info') => {
    setAlertState({ isOpen: true, title, message, variant });
  };

  const closeAlert = () => {
    setAlertState(prev => ({ ...prev, isOpen: false }));
  };

  const syncGatewayConfigs = (all: Gateway[]) => {
    const mercadoPago = all.find(gateway => gateway.name === GatewayProvider.MERCADO_PAGO);
    const stripe = all.find(gateway => gateway.name === GatewayProvider.STRIPE);
    const pagSeguro = all.find(gateway => gateway.name === GatewayProvider.PAGSEGURO);
    const asaas = all.find(gateway => gateway.name === GatewayProvider.ASAAS);

    setMpConfig(
      mercadoPago
        ? {
            public_key: mercadoPago.public_key || '',
            private_key: '',
            webhook_secret: '',
            active: mercadoPago.active ?? (mercadoPago as any).is_active ?? false,
            max_installments: mercadoPago.config?.max_installments ?? DEFAULT_MP_CONFIG.max_installments,
            min_installment_value: mercadoPago.config?.min_installment_value ?? DEFAULT_MP_CONFIG.min_installment_value,
            has_private_key: Boolean(mercadoPago.private_key),
            has_webhook_secret: Boolean(mercadoPago.webhook_secret),
          }
        : DEFAULT_MP_CONFIG
    );

    setStripeConfig(
      stripe
        ? {
            public_key: stripe.public_key || '',
            private_key: '',
            webhook_secret: '',
            active: stripe.active ?? (stripe as any).is_active ?? false,
            max_installments: stripe.config?.max_installments ?? DEFAULT_STRIPE_CONFIG.max_installments,
            min_installment_value: stripe.config?.min_installment_value ?? DEFAULT_STRIPE_CONFIG.min_installment_value,
            interest_rate: stripe.config?.interest_rate ?? DEFAULT_STRIPE_CONFIG.interest_rate,
            has_private_key: Boolean(stripe.private_key),
            has_webhook_secret: Boolean(stripe.webhook_secret),
          }
        : DEFAULT_STRIPE_CONFIG
    );

    setPagSeguroConfig(
      pagSeguro
        ? {
            public_key: pagSeguro.public_key || '',
            private_key: '',
            webhook_secret: '',
            active: pagSeguro.active ?? (pagSeguro as any).is_active ?? false,
            environment: pagSeguro.config?.environment === 'sandbox' ? 'sandbox' : 'production',
            max_installments: pagSeguro.config?.max_installments ?? DEFAULT_PAGSEGURO_CONFIG.max_installments,
            min_installment_value: pagSeguro.config?.min_installment_value ?? DEFAULT_PAGSEGURO_CONFIG.min_installment_value,
            has_private_key: Boolean(pagSeguro.private_key),
            has_webhook_secret: Boolean(pagSeguro.webhook_secret),
          }
        : DEFAULT_PAGSEGURO_CONFIG
    );

    setAsaasConfig(
      asaas
        ? {
            private_key: '',
            webhook_secret: '',
            active: asaas.active ?? (asaas as any).is_active ?? false,
            max_installments: asaas.config?.max_installments ?? DEFAULT_ASAAS_CONFIG.max_installments,
            min_installment_value: asaas.config?.min_installment_value ?? DEFAULT_ASAAS_CONFIG.min_installment_value,
            has_private_key: Boolean(asaas.private_key),
            has_webhook_secret: Boolean(asaas.webhook_secret),
            sandbox: Boolean(asaas.config?.sandbox),
          }
        : DEFAULT_ASAAS_CONFIG
    );
  };

  const persistGatewayState = async (provider: GatewayProvider, gatewayData: Partial<Gateway>) => {
    const existing = gateways.find((gateway) => gateway.name === provider);
    const baseGateway = {
      id: existing?.id,
      name: provider,
      public_key: gatewayData.public_key ?? existing?.public_key ?? '',
      private_key: gatewayData.private_key ?? existing?.private_key ?? '',
      webhook_secret: gatewayData.webhook_secret ?? existing?.webhook_secret ?? '',
      active: gatewayData.active ?? existing?.active ?? false,
      config: {
        ...(existing?.config || {}),
        ...(gatewayData.config || {}),
        demo: true,
      },
    };

    if (existing?.id) {
      return storage.updateGateway({ ...baseGateway, id: existing.id });
    }

    const { id: _id, ...createPayload } = baseGateway;
    return storage.createGateway(createPayload);
  };

  useEffect(() => {
    const load = async () => {
      const all = await storage.getGateways();
      setGateways(all);
      syncGatewayConfigs(all);
    };

    load();

    const urlParams = new URLSearchParams(window.location.search);
    const successParam = urlParams.get('success');
    const errorParam = urlParams.get('error');
    const providerError = urlParams.get('provider_error');
    const providerErrorDescription = urlParams.get('provider_error_description');

    if (!PAGBANK_GATEWAY_ENABLED) {
      const hasLegacyPagbankCallback = successParam === 'pagbank_oauth' || String(errorParam || '').startsWith('pagbank_');
      if (hasLegacyPagbankCallback) {
        window.history.replaceState({}, '', window.location.pathname);
      }
      return;
    }

    if (successParam === 'pagbank_oauth') {
      setTimeout(() => showAlert('Conexão Concluída', 'Conta PagBank conectada com sucesso via autorização oficial.', 'success'), 500);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (errorParam === 'pagbank_oauth_denied') {
      setTimeout(() => showAlert('Conexão Cancelada', 'Você cancelou a autorização do PagBank.', 'info'), 500);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (errorParam === 'pagbank_oauth_provider_error') {
      const detail = providerErrorDescription || providerError || 'O PagBank recusou a autorizaÃ§Ã£o.';
      setTimeout(() => showAlert('Erro do PagBank', detail, 'error'), 500);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (errorParam === 'pagbank_oauth_failed') {
      setTimeout(() => showAlert('Erro na Conexão', 'Ocorreu um erro ao conectar com o PagBank.', 'error'), 500);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!PAGBANK_GATEWAY_ENABLED) {
      window.localStorage.removeItem('sc_unlock_pagbank');
      setPagbankDebugUnlocked(false);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const queryUnlock = params.get('unlock_pagbank');
    const storedUnlock = window.localStorage.getItem('sc_unlock_pagbank');
    const shouldUnlock = queryUnlock === '1' || storedUnlock === '1';

    if (queryUnlock === '1') {
      window.localStorage.setItem('sc_unlock_pagbank', '1');
    }

    setPagbankDebugUnlocked(shouldUnlock);
  }, []);

  const resolveAccessToken = async () => {
    const { data: authData, error: authError } = await supabase.auth.getSession();
    if (authError) {
      console.warn('[Gateways] getSession failed before save:', authError);
    }

    let accessToken = authData.session?.access_token || session?.access_token || '';
    if (accessToken) return accessToken;

    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      console.warn('[Gateways] refreshSession failed before save:', refreshError);
      throw new Error('Sua sessao expirou. Faca login novamente para salvar o gateway.');
    }

    accessToken = refreshData.session?.access_token || '';
    if (!accessToken) {
      throw new Error('Sua sessao expirou. Faca login novamente para salvar o gateway.');
    }

    return accessToken;
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!activeModalApp) {
      showAlert(t('common.error'), 'Nenhum gateway selecionado para sincronizacao.', 'error');
      return;
    }

    try {
      const provider = activeModalApp === 'mp'
        ? GatewayProvider.MERCADO_PAGO
        : activeModalApp === 'pagseguro'
          ? GatewayProvider.PAGSEGURO
          : activeModalApp === 'asaas'
            ? GatewayProvider.ASAAS
            : GatewayProvider.STRIPE;
      const configState = activeModalApp === 'mp'
        ? mpConfig
        : activeModalApp === 'pagseguro'
          ? pagSeguroConfig
          : activeModalApp === 'asaas'
            ? asaasConfig
            : stripeConfig;

      const {
        max_installments,
        min_installment_value,
        has_private_key: _hasPrivateKey,
        has_webhook_secret: _hasWebhookSecret,
        ...restConfigRaw
      } = configState;
      const interest_rate = 'interest_rate' in configState ? configState.interest_rate : undefined;
      const environment = 'environment' in configState ? configState.environment : undefined;
      const sandbox = 'sandbox' in restConfigRaw ? restConfigRaw.sandbox : undefined;
      const { sandbox: _sandbox, ...restConfig } = restConfigRaw as any;

      const gatewayData = {
        ...restConfig,
        config: {
          max_installments,
          min_installment_value,
          ...(environment ? { environment } : {}),
          ...(sandbox !== undefined ? { sandbox } : {}),
          ...(interest_rate !== undefined ? { interest_rate } : {}),
        },
        ...(activeModalApp === 'pagseguro' && pagbankDisconnectRequested ? {
          clear_private_key: true,
          clear_public_key: true,
          clear_oauth_credentials: true,
        } : {}),
      };

      const index = gateways.findIndex(gateway => gateway.name === provider);

      if (isDemoMode) {
        await persistGatewayState(provider, {
          public_key: gatewayData.clear_public_key ? '' : restConfig.public_key,
          private_key: gatewayData.clear_private_key ? '' : restConfig.private_key,
          webhook_secret: restConfig.webhook_secret,
          active: restConfig.active,
          config: {
            ...gatewayData.config,
            sync_mode: 'demo',
            external_effect: 'simulated',
          },
        });

        const updatedGateways = await storage.getGateways();
        setGateways(updatedGateways);
        syncGatewayConfigs(updatedGateways);
        setIsModalOpen(false);
        setActiveModalApp(null);
        setPagbankDisconnectRequested(false);
        setTimeout(() => showAlert(t('common.success'), 'Gateway salvo no workspace demo sem usar credenciais reais.', 'success'), 100);
        return;
      }

      const submitGatewaySave = (accessToken: string) => fetch('/api/admin?action=save-gateway', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          id: index >= 0 ? gateways[index].id : undefined,
          provider,
          name: provider,
          ...gatewayData,
          user_id: user?.id,
        }),
      });

      let accessToken = await resolveAccessToken();
      let saveResponse = await submitGatewaySave(accessToken);

      if (saveResponse.status === 401) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshData.session?.access_token) {
          throw new Error('Sua sessao expirou. Faca login novamente para salvar o gateway.');
        }

        accessToken = refreshData.session.access_token;
        saveResponse = await submitGatewaySave(accessToken);
      }

      const saveResult = await saveResponse.json().catch(() => null);

      if (saveResponse.status === 401) {
        throw new Error('Sua sessao expirou. Faca login novamente para salvar o gateway.');
      }

      if (!saveResponse.ok || !saveResult?.success) {
        throw new Error(saveResult?.error || 'Erro ao salvar gateway via API segura.');
      }

      const updatedGateways = await storage.getGateways();
      setGateways(updatedGateways);
      syncGatewayConfigs(updatedGateways);

      setIsModalOpen(false);
      setActiveModalApp(null);
      setPagbankDisconnectRequested(false);
      setTimeout(() => showAlert(t('common.success'), t('gateways.save_success'), 'success'), 100);
    } catch (error: any) {
      showAlert(t('common.error'), error.message || t('gateways.save_error'), 'error');
    }
  };

  const handlePagbankOauth = async () => {
    setIsConnectingOauth(true);
    setPagbankDisconnectRequested(false);
    try {
      if (isDemoMode) {
        showAlert('Fluxo Bloqueado no Demo', 'A autorizacao externa do PagBank fica bloqueada no demo. Use a conexao sandbox guiada para testar a tela.', 'info');
        return;
      }

      let accessToken = await resolveAccessToken();
      const isSandbox = pagSeguroConfig.environment === 'sandbox';
      const oauthEndpoint = isSandbox
        ? '/api/system?action=pagbank-oauth-start'
        : '/api/central/pagbank-oauth';

      const res = await fetch(oauthEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          action: 'start',
          sandbox: isSandbox
        })
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Erro ao iniciar autorizacao do PagBank');
      }
      window.location.href = data.url;
    } catch (err: any) {
      showAlert(t('common.error'), err.message || 'Erro de conexao Oauth', 'error');
    } finally {
      setIsConnectingOauth(false);
    }
  };

  const handlePagbankDisconnect = async () => {
    try {
      updateActiveConfig({
        public_key: '',
        private_key: '',
        has_private_key: false,
        active: false,
      });
      setPagbankDisconnectRequested(true);
      // We don't save immediately, the user needs to click 'Salvar Configurações'
      // or we can save it immediately to reflect visually. Let's just update the local state.
      showAlert(t('common.success'), 'Conta PagBank desconectada. Clique em Salvar para confirmar.', 'info');
    } catch (err: any) {
      showAlert(t('common.error'), 'Erro ao desconectar', 'error');
    }
  };

  const handlePagbankSandboxMockConnect = async () => {
    const sellerEmail = pagbankSandboxSellerEmail.trim().toLowerCase();
    if (!sellerEmail) {
      showAlert(t('common.error'), 'Informe o e-mail do vendedor teste do Sandbox.', 'error');
      return;
    }

    setIsConnectingOauth(true);
    setPagbankDisconnectRequested(false);

    try {
      if (isDemoMode) {
        await persistGatewayState(GatewayProvider.PAGSEGURO, {
          public_key: 'pagbank_sandbox_demo',
          private_key: '',
          webhook_secret: '',
          active: true,
          config: {
            environment: 'sandbox',
            seller_email: sellerEmail,
            sandbox_mode: 'simulated',
            external_effect: 'blocked',
          },
        });

        const updatedGateways = await storage.getGateways();
        setGateways(updatedGateways);
        syncGatewayConfigs(updatedGateways);
        showAlert('Sandbox Conectado', 'Conta sandbox conectada no workspace demo sem chamada externa.', 'success');
        return;
      }

      const accessToken = await resolveAccessToken();
      const res = await fetch('/api/system?action=pagbank-sandbox-connect-mock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email: sellerEmail,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Erro ao conectar o Sandbox via SMS Mock.');
      }

      const updatedGateways = await storage.getGateways();
      setGateways(updatedGateways);
      syncGatewayConfigs(updatedGateways);

      showAlert('Sandbox Conectado', 'Token sandbox do PagBank conectado com sucesso via SMS Mock.', 'success');
    } catch (error: any) {
      showAlert(t('common.error'), error?.message || 'Erro ao conectar o Sandbox via SMS Mock.', 'error');
    } finally {
      setIsConnectingOauth(false);
    }
  };

  const openGatewayModal = (provider: 'mp' | 'stripe' | 'pagseguro' | 'asaas') => {
    if (provider === 'pagseguro' && !PAGBANK_GATEWAY_ENABLED) {
      showAlert('PagBank indisponivel', 'A integracao com o PagBank foi removida porque a homologacao foi negada.', 'info');
      return;
    }

    setPagbankDisconnectRequested(false);
    if (!compliance?.is_ready) {
      setShowComplianceModal(true);
      return;
    }

    setActiveModalApp(provider);
    setIsModalOpen(true);
  };

  const isMercadoPagoModal = activeModalApp === 'mp';
  const isStripeModal = activeModalApp === 'stripe';
  const isPagSeguroModal = activeModalApp === 'pagseguro';
  const isAsaasModal = activeModalApp === 'asaas';
  const activeConfig = isMercadoPagoModal
    ? mpConfig
    : isPagSeguroModal
      ? pagSeguroConfig
      : isAsaasModal
        ? asaasConfig
        : stripeConfig;
  const activeModalTitle = isMercadoPagoModal
    ? 'Sincronizar Mercado Pago'
    : isPagSeguroModal
      ? 'Sincronizar PagSeguro / PagBank'
      : isAsaasModal
        ? 'Sincronizar Asaas'
        : 'Sincronizar Stripe';
  const activeHintHtml = isMercadoPagoModal
    ? sanitizeTranslationHtml(t('gateways.mp_hint'))
    : isPagSeguroModal
      ? sanitizeTranslationHtml(
          'Para integrar com o PagBank, use o botão "Conectar com PagBank" para autorizar nosso aplicativo oficial automaticamente.'
        )
      : isAsaasModal
        ? sanitizeTranslationHtml(
            'Sua API Key do Asaas é criptografada com AES-256 no momento em que você salva e nunca mais retorna para o navegador.'
          )
      : sanitizeTranslationHtml(
          'Para configurar o Stripe, acesse seu painel na aba Desenvolvedores, crie as chaves de API e configure o Webhook para apontar para seu sistema.'
        );
  const publicKeyPlaceholder = isMercadoPagoModal
    ? 'APP_USR-...'
    : isPagSeguroModal
      ? 'PAGSEGURO_PUBLIC_KEY'
      : 'pk_live_...';
  const privateKeyPlaceholder = isMercadoPagoModal
    ? 'APP_USR-...'
    : isPagSeguroModal
      ? 'PAGSEGURO_TOKEN'
      : isAsaasModal
        ? '$aact_prod_...'
      : 'sk_live_...';
  const webhookSecretPlaceholder = isStripeModal
    ? 'whsec_...'
    : isPagSeguroModal
      ? 'authenticity-token'
      : isAsaasModal
        ? 'asaas-access-token'
      : 'Opcional';
  const privateKeyStatusMessage = activeConfig.has_private_key && !activeConfig.private_key.trim()
    ? 'Segredo ja salvo. Deixe em branco para manter ou preencha para substituir.'
    : 'Digite este campo apenas se quiser gravar ou substituir o segredo atual.';
  const webhookSecretStatusMessage = activeConfig.has_webhook_secret && !activeConfig.webhook_secret.trim()
    ? 'Webhook secret ja salvo. Deixe em branco para manter ou preencha para substituir.'
    : 'Preencha apenas se quiser salvar ou substituir o token de webhook.';
  const inferredAsaasEnvironment = isAsaasModal
    ? detectAsaasApiKeyEnvironment(asaasConfig.private_key)
    : null;
  const pagbankGateway = gateways.find(gateway => {
    const gatewayName = String(gateway.name || '').trim().toLowerCase();
    const gatewayProvider = String(gateway.provider || '').trim().toLowerCase();
    return gatewayName === GatewayProvider.PAGSEGURO || gatewayProvider === GatewayProvider.PAGSEGURO;
  });
  const pagbankCredentials = pagbankGateway?.credentials && typeof pagbankGateway.credentials === 'object'
    ? pagbankGateway.credentials
    : {};
  const pagbankOauthConnected = pagbankCredentials.connected_via_oauth === true;
  const pagbankOauthEnvironment = pagbankCredentials.oauth_environment === 'sandbox'
    ? 'sandbox'
    : pagbankCredentials.oauth_environment === 'production'
      ? 'production'
      : null;
  const pagbankOauthStatus = String(pagbankCredentials.oauth_status || '').trim();
  const pagbankRefreshStatus = String(pagbankCredentials.oauth_last_refresh_status || '').trim();
  const pagbankRefreshSource = formatPagbankRefreshSource(pagbankCredentials.oauth_last_refresh_source);
  const pagbankRefreshError = normalizeInlineMessage(pagbankCredentials.oauth_last_refresh_error);
  const pagbankRefreshErrorCode = String(pagbankCredentials.oauth_last_refresh_error_code || '').trim();
  const pagbankAccountId = String(pagbankCredentials.oauth_account_id || '').trim();
  const pagbankExpiresAt = typeof pagbankCredentials.oauth_expires_at === 'string'
    ? pagbankCredentials.oauth_expires_at
    : null;
  const pagbankLastAttemptAt = typeof pagbankCredentials.oauth_last_refresh_attempt_at === 'string'
    ? pagbankCredentials.oauth_last_refresh_attempt_at
    : null;
  const pagbankReconnectRequiredAt = typeof pagbankCredentials.oauth_reconnect_required_at === 'string'
    ? pagbankCredentials.oauth_reconnect_required_at
    : null;
  const pagbankConnectedAt = typeof pagbankCredentials.oauth_last_connected_at === 'string'
    ? pagbankCredentials.oauth_last_connected_at
    : null;
  const pagbankHasRefreshToken = Boolean(pagbankCredentials.oauth_refresh_token);
  const pagbankExpiresAtMs = pagbankExpiresAt ? Date.parse(pagbankExpiresAt) : 0;
  const pagbankReconnectRequired = pagbankOauthStatus === 'reconnect_required';
  const pagbankFallbackMode = pagbankOauthStatus === 'attention' || pagbankRefreshStatus === 'fallback';
  const pagbankDisconnected = pagbankOauthStatus === 'disconnected';
  const pagbankEnvironmentMismatch = pagbankOauthConnected
    && Boolean(pagbankOauthEnvironment)
    && pagbankOauthEnvironment !== pagSeguroConfig.environment;
  const pagbankManualMode = pagSeguroConfig.has_private_key && !pagbankOauthConnected && !pagbankDisconnectRequested;
  const pagbankTokenExpired = Number.isFinite(pagbankExpiresAtMs) && pagbankExpiresAtMs > 0 && pagbankExpiresAtMs <= Date.now();
  const pagbankTokenExpiringSoon = Number.isFinite(pagbankExpiresAtMs)
    && pagbankExpiresAtMs > Date.now()
    && pagbankExpiresAtMs <= Date.now() + (24 * 60 * 60 * 1000);
  const pagbankIncompleteOauth = pagbankOauthConnected && !pagbankHasRefreshToken;
  const pagbankOperationalToneClasses: Record<PagbankStatusTone, string> = {
    success: 'border-emerald-500/30 bg-emerald-500/10',
    warning: 'border-amber-500/30 bg-amber-500/10',
    danger: 'border-red-500/30 bg-red-500/10',
    neutral: 'border-white/10 bg-white/5',
  };
  const pagbankOperationalStatus = (() => {
    if (pagbankDisconnectRequested) {
      return {
        tone: 'neutral' as PagbankStatusTone,
        badge: 'Desconexao pendente',
        title: 'Desconexao pronta para salvar',
        message: 'Ao salvar, o gateway sera desativado e os tokens OAuth do PagBank serao removidos desta conta.',
        actionLabel: 'Conectar com PagBank',
      };
    }

    if (pagbankEnvironmentMismatch) {
      return {
        tone: 'warning' as PagbankStatusTone,
        badge: 'Reautorizacao necessaria',
        title: 'Ambiente alterado apos a conexao',
        message: `A conta foi autorizada em ${formatPagbankEnvironmentLabel(pagbankOauthEnvironment)} e o gateway agora esta em ${formatPagbankEnvironmentLabel(pagSeguroConfig.environment)}. Reconecte para emitir um token no ambiente correto.`,
        actionLabel: 'Reautorizar com PagBank',
      };
    }

    if (pagbankReconnectRequired || pagbankIncompleteOauth) {
      return {
        tone: 'danger' as PagbankStatusTone,
        badge: 'Reconexao obrigatoria',
        title: 'O PagBank exige nova autorizacao',
        message: pagbankTokenExpired
          ? 'O token atual ja expirou e o PagBank pediu nova autorizacao. Reconecte antes de liberar novos pagamentos por este gateway.'
          : 'O refresh expirou, foi recusado ou ficou incompleto. Reconecte antes de liberar novos pagamentos por este gateway.',
        actionLabel: 'Reconectar com PagBank',
      };
    }

    if (pagbankFallbackMode) {
      return {
        tone: 'warning' as PagbankStatusTone,
        badge: 'Operando em fallback',
        title: 'Refresh falhou, mas o token atual segue em uso',
        message: 'O sistema manteve o ultimo token valido para evitar parada imediata. Reautorize o PagBank para restaurar a renovacao automatica.',
        actionLabel: 'Reautorizar com PagBank',
      };
    }

    if (pagbankManualMode) {
      return {
        tone: 'warning' as PagbankStatusTone,
        badge: 'Modo manual ativo',
        title: 'Gateway funcionando fora da conexao oficial',
        message: 'Existe um token salvo manualmente. O fluxo funciona, mas sem refresh automatico. Recomendado migrar para a conexao oficial do PagBank.',
        actionLabel: 'Migrar para Conexao Oficial',
      };
    }

    if (pagbankOauthConnected && pagSeguroConfig.has_private_key) {
      return {
        tone: 'success' as PagbankStatusTone,
        badge: 'Conexao oficial ativa',
        title: pagbankTokenExpiringSoon ? 'Conta conectada com renovacao proxima' : 'Conta conectada e pronta para uso',
        message: pagbankTokenExpiringSoon
          ? 'A conexao oficial esta ativa. O sistema deve renovar o token sozinho na proxima operacao, mas voce ja pode reautorizar se quiser antecipar.'
          : 'A conta esta autorizada via OAuth oficial, com refresh automatico e chaves operacionais mantidas pelo sistema.',
        actionLabel: 'Reautorizar com PagBank',
      };
    }

    if (pagbankDisconnected) {
      return {
        tone: 'neutral' as PagbankStatusTone,
        badge: 'Conta desconectada',
        title: 'Nenhum token oficial salvo',
        message: 'Esta conta foi desconectada do PagBank. Use a conexao oficial para gerar um novo token e reativar o gateway.',
        actionLabel: 'Conectar com PagBank',
      };
    }

    return {
      tone: 'neutral' as PagbankStatusTone,
      badge: 'Conta nao conectada',
      title: 'Conecte o PagBank para operar',
      message: 'A autorizacao oficial cria e renova o token automaticamente. Se preferir rollback, voce pode desconectar e salvar para desativar o gateway.',
      actionLabel: 'Conectar com PagBank',
    };
  })();
  const pagbankOperationalBadgeClass = pagbankOperationalStatus.tone === 'success'
    ? 'text-primary'
    : pagbankOperationalStatus.tone === 'danger'
      ? 'text-red-400'
      : pagbankOperationalStatus.tone === 'warning'
        ? 'text-amber-300'
        : 'text-gray-400';
  const pagbankOperationalMeta = [
    { label: 'Ambiente do gateway', value: formatPagbankEnvironmentLabel(pagSeguroConfig.environment) },
    ...(pagbankOauthEnvironment ? [{ label: 'Ambiente autorizado', value: formatPagbankEnvironmentLabel(pagbankOauthEnvironment) }] : []),
    ...(pagbankAccountId ? [{ label: 'Conta OAuth', value: pagbankAccountId }] : []),
    ...(pagbankConnectedAt ? [{ label: 'Ultima conexao', value: formatStatusDate(pagbankConnectedAt) }] : []),
    ...(pagbankExpiresAt ? [{ label: 'Expira em', value: formatStatusDate(pagbankExpiresAt) }] : []),
    ...(pagbankLastAttemptAt ? [{ label: 'Ultima tentativa de refresh', value: formatStatusDate(pagbankLastAttemptAt) }] : []),
    ...(pagbankRefreshSource ? [{ label: 'Origem da ultima atualizacao', value: pagbankRefreshSource }] : []),
    ...(pagbankReconnectRequiredAt ? [{ label: 'Reconexao exigida em', value: formatStatusDate(pagbankReconnectRequiredAt) }] : []),
    ...((pagbankRefreshErrorCode || pagbankRefreshError)
      ? [{
          label: 'Ultimo erro',
          value: [pagbankRefreshErrorCode, pagbankRefreshError].filter(Boolean).join(' - '),
        }]
      : []),
  ].filter(meta => Boolean(meta.value));

  const updateActiveConfig = (partial: Partial<MercadoPagoConfigState & StripeConfigState & PagSeguroConfigState & AsaasConfigState>) => {
    if (isMercadoPagoModal) {
      setMpConfig(prev => ({ ...prev, ...partial }));
      return;
    }

    if (isPagSeguroModal) {
      setPagSeguroConfig(prev => ({ ...prev, ...partial }));
      return;
    }

    if (isAsaasModal) {
      setAsaasConfig(prev => ({ ...prev, ...partial as AsaasConfigState }));
      return;
    }

    setStripeConfig(prev => ({ ...prev, ...partial as StripeConfigState }));
  };

  const sanitizeCurrencyInput = (value: string) => {
    const numeric = Number.parseFloat(value);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const renderGatewayCard = ({
    logoSrc,
    logoAlt,
    subtitle,
    isActive,
    onClick,
  }: {
    logoSrc: string;
    logoAlt: string;
    subtitle: string;
    isActive: boolean;
    onClick: () => void;
  }) => (
    <div
      onClick={onClick}
      className={`group relative h-64 rounded-[2.5rem] border transition-all duration-500 cursor-pointer overflow-hidden ${isActive ? 'bg-emerald-500/5 border-emerald-500/20 shadow-[0_0_50px_rgba(16,185,129,0.05)]' : 'bg-black/20 border-white/5 opacity-60 hover:opacity-100 hover:border-white/10'}`}
    >
      {isActive && (
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <Aurora colorStops={['#10B981', '#059669', '#10B981']} amplitude={0.2} />
        </div>
      )}

      <div className="absolute top-8 left-8">
        <div className={`px-4 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${isActive ? 'bg-emerald-500 text-black border-emerald-400 shadow-xl' : 'bg-white/5 text-gray-600 border-white/5'}`}>
          {isActive ? <CheckCircle className="w-3.5 h-3.5" /> : <div className="w-2 h-2 rounded-full bg-gray-800"></div>}
          {isActive ? 'Motor Ativo' : 'Offline'}
        </div>
      </div>

      <div className="h-full flex flex-col items-center justify-center p-12">
        <img src={logoSrc} alt={logoAlt} className="h-12 object-contain brightness-0 invert group-hover:scale-110 transition-transform duration-500" />
        <p className="mt-6 text-[10px] font-black text-gray-700 uppercase tracking-[0.3em] group-hover:text-gray-500 transition-colors">{subtitle}</p>
      </div>

      <div className="absolute bottom-6 right-8 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white">
          <ArrowRight className="w-5 h-5" />
        </div>
      </div>
    </div>
  );

  const renderComingSoonCard = ({
    logoSrc,
    logoAlt,
    subtitle,
    onClick,
  }: {
    logoSrc: string;
    logoAlt: string;
    subtitle: string;
    onClick: () => void;
  }) => (
    <div
      onClick={onClick}
      className="group relative h-64 rounded-[2.5rem] border bg-black/20 border-white/5 opacity-60 hover:opacity-100 hover:border-white/10 transition-all duration-500 cursor-pointer overflow-hidden"
    >
      <div className="absolute top-8 left-8">
        <div className="px-4 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest flex items-center gap-2 bg-white/5 text-gray-600 border-white/5">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
          {t('gateways.soon')}
        </div>
      </div>

      <div className="h-full flex flex-col items-center justify-center p-12">
        <img src={logoSrc} alt={logoAlt} className="h-12 object-contain brightness-0 invert group-hover:scale-110 transition-transform duration-500" />
        <p className="mt-6 text-[10px] font-black text-gray-700 uppercase tracking-[0.3em] group-hover:text-gray-500 transition-colors">{subtitle}</p>
      </div>

      <div className="absolute bottom-6 right-8 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white">
          <ArrowRight className="w-5 h-5" />
        </div>
      </div>
    </div>
  );

  return (
    <Layout>
      <div className="flex flex-col lg:flex-row justify-between lg:items-end mb-12 gap-8">
        <div>
          <h1 className="text-4xl lg:text-5xl font-portal-display text-white mb-2 uppercase leading-none">{t('gateways.title')}</h1>
          <div className="flex items-center gap-3">
            <p className="text-gray-600 font-medium uppercase tracking-[0.1em] text-[10px]">{t('gateways.subtitle')}</p>
            <div className="h-1 w-1 rounded-full bg-gray-800"></div>
            <span className="text-[10px] text-primary font-black uppercase tracking-[0.2em]">Transaction Core</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="px-6 py-3 rounded-2xl bg-black/40 border border-white/5 flex items-center gap-3">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Criptografia de Ponta-a-Ponta Ativa</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {renderGatewayCard({
          logoSrc: '/mercado-pago-logo.png',
          logoAlt: 'Mercado Pago',
          subtitle: 'Latin America Standard',
          isActive: mpConfig.active,
          onClick: () => openGatewayModal('mp'),
        })}

        {renderGatewayCard({
          logoSrc: '/stripe-logo.png',
          logoAlt: 'Stripe',
          subtitle: 'Global Infrastructure',
          isActive: stripeConfig.active,
          onClick: () => openGatewayModal('stripe'),
        })}

        {renderComingSoonCard({
          logoSrc: '/paypal-logo.png',
          logoAlt: 'PayPal',
          subtitle: 'Global Payments',
          onClick: () => showAlert('PayPal', 'A integracao com o PayPal estara disponivel em breve.', 'info'),
        })}

        {renderGatewayCard({
          logoSrc: '/asaas-logo.svg',
          logoAlt: 'Asaas',
          subtitle: 'Cashflow Automation',
          isActive: asaasConfig.active,
          onClick: () => openGatewayModal('asaas'),
        })}
      </div>

      <div className="mt-12 p-8 rounded-[2rem] bg-black/20 border border-white/5 flex flex-col md:flex-row items-center justify-between gap-8 group">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5 group-hover:border-primary/30 transition-all">
            <Lock className="w-7 h-7 text-gray-700 group-hover:text-primary transition-colors" />
          </div>
          <div>
            <h3 className="text-xl font-portal-display text-white uppercase tracking-tight">Cofre de Seguranca v4</h3>
            <p className="text-[10px] font-black text-gray-700 uppercase tracking-widest mt-1 leading-relaxed">
              Suas credenciais sao criptografadas com AES-256 e nunca sao armazenadas em texto plano. O processamento e direto via API segura.
            </p>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="px-5 py-3 rounded-xl bg-white/5 border border-white/5 text-[10px] font-black text-gray-500 uppercase tracking-widest">PCI DSS Compliant</div>
          <div className="px-5 py-3 rounded-xl bg-white/5 border border-white/5 text-[10px] font-black text-gray-500 uppercase tracking-widest">SSL Secure</div>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setActiveModalApp(null);
          setPagbankDisconnectRequested(false);
        }}
        title={activeModalTitle}
        className="max-w-2xl"
      >
        <form onSubmit={handleSave} className="space-y-8 p-1">
          <div className="bg-primary/5 border border-primary/20 p-6 rounded-[1.8rem] flex items-start gap-4">
            <Zap className="w-6 h-6 text-primary shrink-0 mt-0.5" />
            <p
              className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-relaxed"
              dangerouslySetInnerHTML={{ __html: activeHintHtml }}
            />
          </div>

          <div className="space-y-6">
            {!isPagSeguroModal && !isAsaasModal && (
              <div className="grid grid-cols-1 gap-6">
                <div>
                  <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest mb-3 block">Chave Publica (Public Key)</label>
                  <input
                    type="text"
                    className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 focus:border-primary/50 outline-none text-white font-mono text-sm transition-all"
                    placeholder={publicKeyPlaceholder}
                    value={activeConfig.public_key}
                    onChange={event => updateActiveConfig({ public_key: event.target.value })}
                    required={!isPagSeguroModal}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest mb-3 block">Chave Secreta (Secret Key)</label>
                  <input
                    type="password"
                    className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 focus:border-primary/50 outline-none text-white font-mono text-sm transition-all"
                    placeholder={privateKeyPlaceholder}
                    value={activeConfig.private_key}
                    onChange={event => updateActiveConfig({ private_key: event.target.value })}
                    required={!isPagSeguroModal && !activeConfig.has_private_key}
                  />
                  <p className="mt-3 text-[10px] font-black text-gray-600 uppercase tracking-widest leading-relaxed">
                    {privateKeyStatusMessage}
                  </p>
                </div>
              </div>
            )}

            {isAsaasModal && (
              <div className="grid grid-cols-1 gap-6">
                <div>
                  <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest mb-3 block">Access Token (API Key)</label>
                  <input
                    type="password"
                    className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 focus:border-primary/50 outline-none text-white font-mono text-sm transition-all"
                    placeholder="Insira a API Key do Asaas"
                    value={activeConfig.private_key}
                    onChange={event => {
                      const nextValue = event.target.value;
                      const inferredEnvironment = detectAsaasApiKeyEnvironment(nextValue);
                      updateActiveConfig({
                        private_key: nextValue,
                        ...(inferredEnvironment ? { sandbox: inferredEnvironment === 'sandbox' } : {}),
                      });
                    }}
                    required={!activeConfig.has_private_key}
                  />
                  <p className="mt-3 text-[10px] font-black text-gray-600 uppercase tracking-widest leading-relaxed">
                    {privateKeyStatusMessage}
                  </p>
                  {inferredAsaasEnvironment && (
                    <p className="mt-2 text-[10px] font-black text-gray-600 uppercase tracking-widest leading-relaxed">
                      Ambiente detectado pela chave: {formatAsaasEnvironmentLabel(inferredAsaasEnvironment === 'sandbox')}.
                    </p>
                  )}
                </div>
              </div>
            )}

            {isPagSeguroModal && (
              <div className="flex flex-col items-center justify-center p-8 bg-white/5 border border-white/5 rounded-[1.8rem] gap-6 text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                  <ShieldCheck className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg mb-2">Conexão Oficial PagBank</h3>
                  <p className="text-gray-400 text-xs max-w-sm mx-auto">
                    Ao conectar sua conta, nós configuraremos automaticamente as chaves e permissões necessárias com segurança.
                  </p>
                </div>
                
                <div className={`w-full max-w-xl rounded-[1.6rem] border p-5 text-left ${pagbankOperationalToneClasses[pagbankOperationalStatus.tone]}`}>
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${pagbankOperationalStatus.tone === 'success' ? 'bg-emerald-500/15 text-emerald-300' : pagbankOperationalStatus.tone === 'danger' ? 'bg-red-500/15 text-red-300' : pagbankOperationalStatus.tone === 'warning' ? 'bg-amber-500/15 text-amber-200' : 'bg-white/10 text-gray-300'}`}>
                      {pagbankOperationalStatus.tone === 'success' ? (
                        <CheckCircle className="w-5 h-5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className={`text-[10px] font-black uppercase tracking-[0.18em] ${pagbankOperationalBadgeClass}`}>
                        {pagbankOperationalStatus.badge}
                      </div>
                      <h4 className="mt-2 text-sm font-black uppercase tracking-[0.08em] text-white">
                        {pagbankOperationalStatus.title}
                      </h4>
                      <p className="mt-2 text-xs text-gray-300 leading-relaxed">
                        {pagbankOperationalStatus.message}
                      </p>
                    </div>
                  </div>

                  {pagbankOperationalMeta.length > 0 && (
                    <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {pagbankOperationalMeta.map(meta => (
                        <div key={meta.label} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-gray-500">
                            {meta.label}
                          </div>
                          <div className="mt-1 text-xs text-white leading-relaxed break-words">
                            {meta.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Button 
                  type="button" 
                  onClick={handlePagbankOauth} 
                  disabled={isConnectingOauth}
                  variant="primary" 
                  className="px-8 py-4 font-black uppercase text-xs tracking-widest rounded-full w-full max-w-sm"
                >
                  {isConnectingOauth ? 'Conectando...' : pagbankOperationalStatus.actionLabel}
                </Button>

                {pagbankDebugUnlocked && pagSeguroConfig.environment === 'sandbox' && (
                  <div className="w-full max-w-sm space-y-3">
                    <input
                      type="email"
                      className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 focus:border-primary/50 outline-none text-white text-sm transition-all"
                      placeholder="E-mail do vendedor teste Sandbox"
                      value={pagbankSandboxSellerEmail}
                      onChange={event => setPagbankSandboxSellerEmail(event.target.value)}
                    />
                    <Button
                      type="button"
                      onClick={handlePagbankSandboxMockConnect}
                      disabled={isConnectingOauth}
                      variant="secondary"
                      className="px-8 py-4 font-black uppercase text-xs tracking-widest rounded-full w-full"
                    >
                      {isConnectingOauth ? 'Conectando...' : 'Conectar Sandbox via SMS Mock'}
                    </Button>
                    <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest leading-relaxed">
                      Usa o fluxo oficial de Connect via SMS do sandbox para contornar instabilidades da tela de login do PagBank.
                    </p>
                  </div>
                )}
                
                {(pagSeguroConfig.has_private_key || pagbankOauthConnected || pagbankDisconnectRequested) && (
                  <div className="flex flex-col items-center gap-3 w-full mt-2">
                    <div className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${pagbankOperationalBadgeClass}`}>
                      {pagbankOperationalStatus.tone === 'success' ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : (
                        <AlertTriangle className="w-3 h-3" />
                      )}
                      {pagbankOperationalStatus.badge}
                    </div>
                    {!pagbankDisconnectRequested && (
                      <button
                        type="button"
                        onClick={handlePagbankDisconnect}
                        className="text-[10px] font-black text-red-500 uppercase tracking-widest hover:underline"
                      >
                        Desconectar
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {isPagSeguroModal && (
              <Card className="bg-white/5 border-white/5 rounded-[1.8rem]">
                <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest mb-4 block">Ambiente</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'production', label: 'Producao' },
                    { id: 'sandbox', label: 'Sandbox' },
                  ].map(option => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => updateActiveConfig({ environment: option.id as 'production' | 'sandbox' })}
                      className={`py-4 rounded-2xl text-[10px] font-black border uppercase tracking-widest transition-all ${pagSeguroConfig.environment === option.id ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20' : 'bg-black/20 border-white/5 text-gray-700 hover:bg-white/5'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="mt-4 text-[10px] font-black text-gray-600 uppercase tracking-widest leading-relaxed">
                  {pagbankOauthConnected
                    ? 'Se voce trocar o ambiente depois da conexao, reautorize o PagBank para emitir um token no destino correto.'
                    : 'Escolha o ambiente antes de conectar para gerar o token oficial certo.'}
                </p>
              </Card>
            )}

            {isAsaasModal && (
              <Card className="bg-white/5 border-white/5 rounded-[1.8rem]">
                <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest mb-4 block">Ambiente</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'production', label: 'Producao' },
                    { id: 'sandbox', label: 'Sandbox' },
                  ].map(option => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => updateActiveConfig({ sandbox: option.id === 'sandbox' })}
                      className={`py-4 rounded-2xl text-[10px] font-black border uppercase tracking-widest transition-all ${Boolean(asaasConfig.sandbox) === (option.id === 'sandbox') ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20' : 'bg-black/20 border-white/5 text-gray-700 hover:bg-white/5'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="mt-4 text-[10px] font-black text-gray-600 uppercase tracking-widest leading-relaxed">
                  Escolha o mesmo ambiente da sua chave do Asaas. Chaves com prefixo `$aact_hmlg_` usam Sandbox e chaves com `$aact_prod_` usam Producao.
                </p>
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-white/5 border-white/5 rounded-[1.8rem]">
                <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest mb-4 block">Parcelamento Maximo</label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 6, 8, 10, 12].map(installments => (
                    <button
                      key={installments}
                      type="button"
                      onClick={() => updateActiveConfig({ max_installments: installments })}
                      className={`py-3 rounded-xl text-[10px] font-black border transition-all ${activeConfig.max_installments === installments ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20' : 'bg-black/20 border-white/5 text-gray-700 hover:bg-white/5'}`}
                    >
                      {installments}X
                    </button>
                  ))}
                </div>
              </Card>

              <Card className="bg-white/5 border-white/5 rounded-[1.8rem]">
                <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest mb-4 block">Minimo por Parcela</label>
                <div className="relative">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-700 font-bold">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full bg-black/40 border border-white/5 rounded-xl pl-12 pr-6 py-3 focus:border-primary/50 outline-none text-white font-bold"
                    value={activeConfig.min_installment_value}
                    onChange={event => updateActiveConfig({ min_installment_value: sanitizeCurrencyInput(event.target.value) })}
                  />
                </div>
              </Card>
            </div>

            {isStripeModal && (
              <div className="p-6 rounded-[1.8rem] bg-white/5 border border-white/5">
                <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest mb-3 block">Taxa de Juros Mensal (%)</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 focus:border-primary/50 outline-none text-white font-bold"
                  value={stripeConfig.interest_rate}
                  onChange={event => setStripeConfig(prev => ({ ...prev, interest_rate: sanitizeCurrencyInput(event.target.value) }))}
                />
              </div>
            )}

            <div>
              <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest mb-3 block">Secret de Webhook (Opcional)</label>
              <input
                type="text"
                className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 focus:border-primary/50 outline-none text-white font-mono text-xs transition-all"
                placeholder={webhookSecretPlaceholder}
                value={activeConfig.webhook_secret}
                onChange={event => updateActiveConfig({ webhook_secret: event.target.value })}
              />
              <p className="mt-3 text-[10px] font-black text-gray-600 uppercase tracking-widest leading-relaxed">
                {webhookSecretStatusMessage}
              </p>
              {isPagSeguroModal && (
                <p className="mt-3 text-[10px] font-black text-gray-600 uppercase tracking-widest leading-relaxed">
                  Se voce configurar o token de autenticidade do webhook no PagBank, informe o mesmo valor aqui para validacao forte do evento.
                </p>
              )}
            </div>
          </div>

          <div className="pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => updateActiveConfig({ active: !activeConfig.active })}
                className={`w-14 h-8 rounded-full transition-all relative ${activeConfig.active ? 'bg-primary' : 'bg-gray-800'}`}
              >
                <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${activeConfig.active ? 'left-7 shadow-xl' : 'left-1'}`} />
              </button>
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Habilitar Gateway</span>
            </div>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setActiveModalApp(null);
                  setPagbankDisconnectRequested(false);
                }}
                className="px-6 py-4 text-[10px] font-black text-gray-600 uppercase tracking-widest"
              >
                Abortar
              </button>
              <Button type="submit" variant="primary" className="px-10 py-5 font-black uppercase text-xs tracking-widest rounded-3xl border-none shadow-2xl">
                {isPagSeguroModal ? 'Salvar Configurações' : 'Vincular Motor'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      <AlertModal
        isOpen={alertState.isOpen}
        onClose={closeAlert}
        title={alertState.title}
        message={alertState.message}
        variant={alertState.variant}
      />

      <BusinessSetupModal
        isOpen={showComplianceModal}
        onClose={() => setShowComplianceModal(false)}
      />
    </Layout>
  );
};

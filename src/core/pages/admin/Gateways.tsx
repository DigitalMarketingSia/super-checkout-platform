import React, { useEffect, useState } from 'react';
import { CheckCircle, Lock, ShieldCheck, Zap, ArrowRight } from 'lucide-react';
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
import { Gateway, GatewayProvider } from '../../types';
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

export const Gateways = () => {
  const { t } = useTranslation(['admin', 'common']);
  const { compliance, user, session } = useAuth();

  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [showComplianceModal, setShowComplianceModal] = useState(false);
  const [mpConfig, setMpConfig] = useState<MercadoPagoConfigState>(DEFAULT_MP_CONFIG);
  const [stripeConfig, setStripeConfig] = useState<StripeConfigState>(DEFAULT_STRIPE_CONFIG);
  const [pagSeguroConfig, setPagSeguroConfig] = useState<PagSeguroConfigState>(DEFAULT_PAGSEGURO_CONFIG);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeModalApp, setActiveModalApp] = useState<'mp' | 'stripe' | 'pagseguro' | null>(null);
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
          : GatewayProvider.STRIPE;
      const configState = activeModalApp === 'mp'
        ? mpConfig
        : activeModalApp === 'pagseguro'
          ? pagSeguroConfig
          : stripeConfig;

      const {
        max_installments,
        min_installment_value,
        has_private_key: _hasPrivateKey,
        has_webhook_secret: _hasWebhookSecret,
        ...restConfig
      } = configState;
      const interest_rate = 'interest_rate' in configState ? configState.interest_rate : undefined;
      const environment = 'environment' in configState ? configState.environment : undefined;

      const gatewayData = {
        ...restConfig,
        config: {
          max_installments,
          min_installment_value,
          ...(environment ? { environment } : {}),
          ...(interest_rate !== undefined ? { interest_rate } : {}),
        },
        ...(activeModalApp === 'pagseguro' && pagbankDisconnectRequested ? {
          clear_private_key: true,
          clear_public_key: true,
        } : {}),
      };

      const index = gateways.findIndex(gateway => gateway.name === provider);
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
        throw new Error(data.error || 'Erro ao iniciar autorização do PagBank');
      }
      window.location.href = data.url;
    } catch (err: any) {
      showAlert(t('common.error'), err.message || 'Erro de conexão Oauth', 'error');
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

  const openGatewayModal = (provider: 'mp' | 'stripe' | 'pagseguro') => {
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
  const activeConfig = isMercadoPagoModal
    ? mpConfig
    : isPagSeguroModal
      ? pagSeguroConfig
      : stripeConfig;
  const activeModalTitle = isMercadoPagoModal
    ? 'Sincronizar Mercado Pago'
    : isPagSeguroModal
      ? 'Sincronizar PagSeguro / PagBank'
      : 'Sincronizar Stripe';
  const activeHintHtml = isMercadoPagoModal
    ? sanitizeTranslationHtml(t('gateways.mp_hint'))
    : isPagSeguroModal
      ? sanitizeTranslationHtml(
          'Para integrar com o PagBank, use o botão "Conectar com PagBank" para autorizar nosso aplicativo oficial automaticamente.'
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
      : 'sk_live_...';
  const webhookSecretPlaceholder = isStripeModal
    ? 'whsec_...'
    : isPagSeguroModal
      ? 'authenticity-token'
      : 'Opcional';
  const privateKeyStatusMessage = activeConfig.has_private_key && !activeConfig.private_key.trim()
    ? 'Segredo ja salvo. Deixe em branco para manter ou preencha para substituir.'
    : 'Digite este campo apenas se quiser gravar ou substituir o segredo atual.';
  const webhookSecretStatusMessage = activeConfig.has_webhook_secret && !activeConfig.webhook_secret.trim()
    ? 'Webhook secret ja salvo. Deixe em branco para manter ou preencha para substituir.'
    : 'Preencha apenas se quiser salvar ou substituir o token de webhook.';

  const updateActiveConfig = (partial: Partial<MercadoPagoConfigState & StripeConfigState & PagSeguroConfigState>) => {
    if (isMercadoPagoModal) {
      setMpConfig(prev => ({ ...prev, ...partial }));
      return;
    }

    if (isPagSeguroModal) {
      setPagSeguroConfig(prev => ({ ...prev, ...partial }));
      return;
    }

    setStripeConfig(prev => ({ ...prev, ...partial }));
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

        {pagbankDebugUnlocked ? renderGatewayCard({
          logoSrc: '/pag-seguro-logoo.png',
          logoAlt: 'PagBank',
          subtitle: 'Sandbox / Producao',
          isActive: pagSeguroConfig.active,
          onClick: () => openGatewayModal('pagseguro'),
        }) : renderComingSoonCard({
          logoSrc: '/pag-seguro-logoo.png',
          logoAlt: 'PagBank',
          subtitle: 'Em validacao com o suporte',
          onClick: () => showAlert('PagBank', 'A integracao com o PagBank esta temporariamente em validacao e sera liberada em breve.', 'info'),
        })}

        {renderComingSoonCard({
          logoSrc: '/asaas-logo.svg',
          logoAlt: 'Asaas',
          subtitle: 'Cashflow Automation',
          onClick: () => showAlert('Asaas', 'A integracao com o Asaas estara disponivel em breve.', 'info'),
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
            {!isPagSeguroModal && (
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
                
                <Button 
                  type="button" 
                  onClick={handlePagbankOauth} 
                  disabled={isConnectingOauth}
                  variant="primary" 
                  className="px-8 py-4 font-black uppercase text-xs tracking-widest rounded-full w-full max-w-sm"
                >
                  {isConnectingOauth ? 'Conectando...' : (activeConfig.has_private_key ? 'Re-Conectar com PagBank' : 'Conectar com PagBank')}
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
                
                {activeConfig.has_private_key && (
                  <div className="flex flex-col items-center gap-3 w-full mt-2">
                    <div className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-2">
                      <CheckCircle className="w-3 h-3" /> Conta Conectada
                    </div>
                    <button
                      type="button"
                      onClick={handlePagbankDisconnect}
                      className="text-[10px] font-black text-red-500 uppercase tracking-widest hover:underline"
                    >
                      Desconectar
                    </button>
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
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-4 text-[10px] font-black text-gray-600 uppercase tracking-widest">Abortar</button>
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

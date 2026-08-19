
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Layout } from '../../components/Layout';
import { storage } from '../../services/storageService';
import { supabase } from '../../services/supabase';
import { Checkout, Product, Gateway, Domain, DomainStatus, CheckoutConfig, CheckoutPaymentRoutingConfig, GatewayProvider, DomainUsage, PaymentMethodType } from '../../types';
import { Button } from '../../components/ui/Button';
import { Loading } from '../../components/ui/Loading';
import {
   ArrowLeft,
   Save,
   Globe,
   ShoppingBag,
   CreditCard,
   Clock,
   Image as ImageIcon,
   Layers,
   AlertCircle,
   Check,
   Upload,
   Wallet,
   BarChart,
   Plus,
   ChevronRight,
   Loader2,
   X,
   User,
   Mail,
   Phone,
   Fingerprint,
   FileText,
   Smartphone,
   Zap,
   HelpCircle
} from 'lucide-react';
import { AlertModal } from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { BusinessSetupModal } from '../../components/admin/BusinessSetupModal';
import { useTranslation } from 'react-i18next';
import {
   normalizeCheckoutPaymentRouting,
   ROUTABLE_PAYMENT_METHODS,
   supportsGatewayPaymentMethod,
} from '../../config/paymentRouting';
import { deriveProductType, PRODUCT_TYPE_INSTALLATION_SERVICE } from '../../services/productCatalog';
import { syncInstallationServiceOffer } from '../../services/installationServiceOffer';

const isSelectableGateway = (gateway: Gateway) => gateway.name !== GatewayProvider.PAGSEGURO;

type CommercialPublicationRoute = {
   productId: string;
   active: boolean;
   domainId: string;
   slug: string;
};

// The Portal stores the product and checkout URL, not checkout-only options
// such as order bumps, payment routing or post-purchase copy. Re-publishing
// on those edits creates an avoidable external dependency and a false warning.
const hasCommercialPublicationRouteChanged = (
   previous: CommercialPublicationRoute | null,
   next: CommercialPublicationRoute,
) => (
   !previous
   || previous.productId !== next.productId
   || previous.active !== next.active
   || previous.domainId !== next.domainId
   || previous.slug !== next.slug
);

const DEFAULT_UPSELL_BENEFITS = [
   'Acesso vitalício sem pagar nada a mais depois',
   'Acesso imediato enviado para o seu e-mail',
];

const stripBenefitPrefix = (value?: string | null) => String(value || '').replace(/^-\s*/, '').trim();

const ensureMinimumUpsellBenefits = (benefits?: string[] | null, minimum: number = 2) => {
   const normalized = Array.isArray(benefits)
      ? benefits.map(item => String(item || ''))
      : [];

   while (normalized.length < minimum) {
      normalized.push(DEFAULT_UPSELL_BENEFITS[normalized.length] || '');
   }

   return normalized;
};

const resolveConfiguredUpsellBenefits = (benefits?: string[] | null, legacyDescription?: string | null) => {
   const normalizedBenefits = Array.isArray(benefits)
      ? benefits.map(item => stripBenefitPrefix(item)).filter(Boolean)
      : [];

   if (normalizedBenefits.length > 0) {
      return ensureMinimumUpsellBenefits(normalizedBenefits);
   }

   const legacyBenefits = String(legacyDescription || '')
      .split('\n')
      .map(line => stripBenefitPrefix(line))
      .filter(Boolean);

   if (legacyBenefits.length > 0) {
      return ensureMinimumUpsellBenefits(legacyBenefits);
   }

   return [...DEFAULT_UPSELL_BENEFITS];
};

const sanitizeUpsellBenefits = (benefits?: string[] | null) => (
   Array.isArray(benefits)
      ? benefits.map(item => stripBenefitPrefix(item)).filter(Boolean)
      : []
);

const initialConfig: CheckoutConfig = {
   fields: { name: true, email: true, phone: false, cpf: false },
   payment_methods: { pix: true, credit_card: true, boleto: true, apple_pay: false, google_pay: false, paypal: false },
   payment_routing: {},
   timer: { active: false, minutes: 15, bg_color: '#EF4444', text_color: '#FFFFFF' },
   header_image: '',
   upsell: {
      active: false,
      product_id: '',
      show_title: true,
      show_subtitle: true,
      show_description: true,
      show_media: true,
      benefits: [...DEFAULT_UPSELL_BENEFITS],
      media_type: 'video',
      button_text: 'Sim, quero adicionar ao meu pedido'
   }
};

const hydrateCheckoutConfig = (
   value?: Partial<CheckoutConfig> | null,
   fallbackUpsellProductId: string = ''
): CheckoutConfig => ({
   ...initialConfig,
   ...value,
   fields: {
      ...initialConfig.fields,
      ...value?.fields,
   },
   payment_methods: {
      ...initialConfig.payment_methods,
      ...value?.payment_methods,
   },
   timer: {
      ...initialConfig.timer,
      ...value?.timer,
   },
   pixels: value?.pixels ? {
      ...value.pixels,
   } : undefined,
   upsell: {
      ...initialConfig.upsell,
      ...value?.upsell,
      product_id: String(value?.upsell?.product_id || fallbackUpsellProductId || '').trim(),
      benefits: resolveConfiguredUpsellBenefits(value?.upsell?.benefits, value?.upsell?.description),
   },
});

const renderPixIcon = (active: boolean) => (
   <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" className={`w-7 h-7 transition-all ${active ? 'text-[#32BCAD] scale-105' : 'text-[#4B5563]'}`} xmlns="http://www.w3.org/2000/svg">
      <path fill="none" d="M0 0h24v24H0z"></path>
      <path d="M15.45 16.52l-3.01-3.01c-.11-.11-.24-.13-.31-.13s-.2.02-.31.13L8.8 16.53c-.34.34-.87.89-2.64.89l3.71 3.7a3 3 0 004.24 0l3.72-3.71c-.91 0-1.67-.18-2.38-.89zM8.8 7.47l3.02 3.02c.08.08.2.13.31.13s.23-.05.31-.13l2.99-2.99c.71-.74 1.52-.91 2.43-.91l-3.72-3.71a3 3 0 00-4.24 0l-3.71 3.7c1.76 0 2.3.58 2.61.89z"></path>
      <path d="M21.11 9.85l-2.25-2.26H17.6c-.54 0-1.08.22-1.45.61l-3 3c-.28.28-.65.42-1.02.42a1.5 1.5 0 01-1.02-.42L8.09 8.17c-.38-.38-.9-.6-1.45-.6H5.17l-2.29 2.3a3 3 0 000 4.24l2.29 2.3h1.48c.54 0 1.06-.22 1.45-.6l3.02-3.02c.28-.28.65-.42 1.02-.42s.74.14 1.02.42l3.01 3.01c.38.38.9.6 1.45.6h1.26l2.25-2.26a3.042 3.042 0 00-.02-4.29z"></path>
   </svg>
);

const renderCardIcon = (active: boolean) => (
   <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" className={`w-7 h-7 transition-all ${active ? 'text-[#8A2BE2] scale-105' : 'text-[#4B5563]'}`} xmlns="http://www.w3.org/2000/svg">
      <path d="M20 4H4c-1.103 0-2 .897-2 2v12c0 1.103.897 2 2 2h16c1.103 0 2-.897 2-2V6c0-1.103-.897-2-2-2zM4 18V6h16l.001 12H4z"></path>
      <path d="M6.5 11h3a.5.5 0 0 0 .5-.5v-2a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5v2a.5.5 0 0 0 .5.5zM6 14h6v2.001H6zm7 0h5v2.001h-5z"></path>
   </svg>
);

const renderBoletoIcon = (active: boolean) => (
   <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 5H5V19H3V5ZM6 5H8V19H6V5ZM9 5H10V19H9V5ZM11 5H13V19H11V5ZM14 5H15V19H14V5ZM16 5H18V19H16V5ZM19 5H21V19H19V5Z" fill={active ? "#D946EF" : "#4B5563"}/>
   </svg>
);

const renderApplePayIcon = (active: boolean) => (
   <svg viewBox="0 0 448 512" fill="currentColor" className={`w-7 h-7 transition-all ${active ? 'text-white scale-105' : 'text-[#4B5563]'}`} xmlns="http://www.w3.org/2000/svg">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.3 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.3zM344 86h-.4c-17.4 18.1-30.5 45.1-31.1 69.8 44.6 1.9 66.8-44.1 66.8-44.1-14.4-16.7-32.5-25.7-35.3-25.7z"/>
   </svg>
);

const renderGooglePayIcon = (active: boolean) => (
   <svg viewBox="0 0 48 48" className={`w-7 h-7 transition-all ${active ? 'scale-105' : ''}`} xmlns="http://www.w3.org/2000/svg">
      <path fill={!active ? '#4B5563' : '#4285F4'} d="M46.1 24.5c0-1.5-.1-3.2-.4-4.5H24v9h12.5c-.6 3-2.3 5.5-4.8 7.2v6h7.7c4.5-4.2 7.1-10.4 7.1-17.8z"/>
      <path fill={!active ? '#4B5563' : '#34A853'} d="M24 47c6.2 0 11.4-2 15.2-5.6l-7.7-6c-2 1.4-4.7 2.2-7.5 2.2-5.8 0-10.7-3.9-12.4-9.2H3.7v6.1C7.4 42 15 47 24 47z"/>
      <path fill={!active ? '#4B5563' : '#FBBC05'} d="M11.6 28.4c-.4-1.3-.7-2.7-.7-4.4s.3-3.1.7-4.4v-6.1H3.7C2.2 16.5 1.5 19.2 1.5 22s.7 5.5 2.2 8.5l7.9-2.1z"/>
      <path fill={!active ? '#4B5563' : '#EA4335'} d="M24 9.4c3.4 0 6.4 1.2 8.8 3.4l6.6-6.6C35.4 2.5 30.2.5 24 .5 15 .5 7.4 5.5 3.7 13.5l7.9 6.1C13.3 13.3 18.2 9.4 24 9.4z"/>
   </svg>
);

const PAYMENT_METHOD_DEFINITIONS: Array<{
   id: PaymentMethodType;
   translationKey: string;
   fallbackLabel: string;
   icon: typeof CreditCard;
   supportsAutomaticBackup: boolean;
}> = [
   { id: 'pix', translationKey: 'checkout_editor.pay_pix', fallbackLabel: 'Pix instantaneo', icon: Zap, supportsAutomaticBackup: true },
   { id: 'credit_card', translationKey: 'checkout_editor.pay_credit_card', fallbackLabel: 'Cartao de credito', icon: CreditCard, supportsAutomaticBackup: false },
   { id: 'boleto', translationKey: 'checkout_editor.pay_boleto', fallbackLabel: 'Boleto bancario', icon: FileText, supportsAutomaticBackup: false },
   { id: 'apple_pay', translationKey: 'checkout_editor.pay_apple', fallbackLabel: 'Apple Pay', icon: Smartphone, supportsAutomaticBackup: false },
   { id: 'google_pay', translationKey: 'checkout_editor.pay_google', fallbackLabel: 'Google Pay', icon: Smartphone, supportsAutomaticBackup: false },
   { id: 'paypal', translationKey: 'checkout_editor.pay_paypal', fallbackLabel: 'PayPal', icon: Smartphone, supportsAutomaticBackup: false },
];

const pushUniqueGatewayId = (values: string[], gatewayId?: string | null) => {
   const normalizedGatewayId = String(gatewayId || '').trim();
   if (!normalizedGatewayId || values.includes(normalizedGatewayId)) return;
   values.push(normalizedGatewayId);
};

const deriveLegacyGatewaySelection = (params: {
   paymentMethods: CheckoutConfig['payment_methods'];
   routing: CheckoutPaymentRoutingConfig;
   fallbackGatewayId?: string | null;
   fallbackBackupGatewayId?: string | null;
}) => {
   const primaryGatewayIds: string[] = [];
   const backupGatewayIds: string[] = [];

   for (const paymentMethod of ROUTABLE_PAYMENT_METHODS) {
      if (!params.paymentMethods[paymentMethod]) continue;
      const route = params.routing?.[paymentMethod];
      pushUniqueGatewayId(primaryGatewayIds, route?.primary_gateway_id);
      if (paymentMethod === 'pix') {
         pushUniqueGatewayId(backupGatewayIds, route?.backup_gateway_id);
      }
   }

   const fallbackGatewayId = String(params.fallbackGatewayId || '').trim();
   const fallbackBackupGatewayId = String(params.fallbackBackupGatewayId || '').trim();
   const primaryGatewayId = primaryGatewayIds[0] || fallbackGatewayId || '';
   const backupGatewayId = [
      ...backupGatewayIds,
      ...primaryGatewayIds.filter((gatewayId) => gatewayId !== primaryGatewayId),
      fallbackBackupGatewayId,
   ].find((gatewayId) => Boolean(gatewayId && gatewayId !== primaryGatewayId)) || '';

   return { primaryGatewayId, backupGatewayId };
};

export const CheckoutEditor = () => {
   const { t } = useTranslation(['admin', 'common']);
   const { user, compliance } = useAuth();
   const { id } = useParams<{ id: string }>();
   const navigate = useNavigate();
   const isNew = id === 'new';
   const fileInputRef = useRef<HTMLInputElement>(null);

   // Generate a temporary ID for new checkouts to allow file uploads before saving
   const [tempId] = useState(() => isNew ? crypto.randomUUID() : '');
   const checkoutId = isNew ? tempId : id!;

   // Data Sources
   const [products, setProducts] = useState<Product[]>([]);
   const [domains, setDomains] = useState<Domain[]>([]);
   const [gateways, setGateways] = useState<Gateway[]>([]);

   // Form State
   const [name, setName] = useState('');
   const [active, setActive] = useState(true);
   const [productId, setProductId] = useState('');
   const [gatewayId, setGatewayId] = useState('');
   const [domainId, setDomainId] = useState('');
   const [slug, setSlug] = useState('');
   const initialCommercialPublicationRouteRef = useRef<CommercialPublicationRoute | null>(null);

   const [orderBumpIds, setOrderBumpIds] = useState<string[]>([]);
   const [upsellProductId, setUpsellProductId] = useState('');

   // Multi-currency & Failover
   const [currency, setCurrency] = useState<'BRL' | 'USD' | 'EUR'>('BRL');
   const [backupGatewayId, setBackupGatewayId] = useState('');

   // Thank You Page Customization
   const [thankYouButtonUrl, setThankYouButtonUrl] = useState('');
   const [thankYouButtonText, setThankYouButtonText] = useState('');

   const [config, setConfig] = useState<CheckoutConfig>(initialConfig);
   const [loading, setLoading] = useState(true);

   const [isUploadingBanner, setIsUploadingBanner] = useState(false);
   const [pendingBannerFile, setPendingBannerFile] = useState<File | null>(null);
   const stagedBannerPreviewUrl = useRef<string | null>(null);
   const [showAdvancedRouting, setShowAdvancedRouting] = useState(false);

   const clearStagedBanner = () => {
      if (stagedBannerPreviewUrl.current) {
         URL.revokeObjectURL(stagedBannerPreviewUrl.current);
         stagedBannerPreviewUrl.current = null;
      }
      setPendingBannerFile(null);
   };

   useEffect(() => () => {
      if (stagedBannerPreviewUrl.current) URL.revokeObjectURL(stagedBannerPreviewUrl.current);
   }, []);

   const updateUpsellBenefits = (nextBenefits: string[]) => {
      setConfig(current => (
         current.upsell
            ? {
               ...current,
               upsell: {
                  ...current.upsell,
                  benefits: ensureMinimumUpsellBenefits(nextBenefits),
               },
            }
            : current
      ));
   };

   const [alertState, setAlertState] = useState<{ isOpen: boolean; title: string; message: string; variant: 'success' | 'error' | 'info' }>({
      isOpen: false,
      title: '',
      message: '',
      variant: 'info'
   });

   const [showComplianceModal, setShowComplianceModal] = useState(false);

   const showAlert = (title: string, message: string, variant: 'success' | 'error' | 'info' = 'info') => {
      setAlertState({ isOpen: true, title, message, variant });
   };

   const syncCentralPlanForSystemUpgrade = async (selectedProductId: string) => {
      const selectedProduct = products.find((product) => product.id === selectedProductId);
      if (selectedProduct?.product_type !== 'system_upgrade') return;

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
         throw new Error('Sua sessao expirou antes da publicacao do checkout no catalogo central. Entre novamente e salve o checkout mais uma vez.');
      }

      const response = await fetch('/api/admin?action=sync-saas-plan', {
         method: 'POST',
         headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
         },
         body: JSON.stringify({ productId: selectedProductId }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
         throw new Error(payload?.error || payload?.message || 'Falha ao publicar o checkout de upgrade no catalogo central.');
      }
   };

   const syncPortalInstallationOffer = async (selectedProductId: string) => {
      const selectedProduct = products.find((product) => product.id === selectedProductId);
      if (!selectedProduct || deriveProductType(selectedProduct) !== PRODUCT_TYPE_INSTALLATION_SERVICE) return;
      await syncInstallationServiceOffer(selectedProductId);
   };

   const closeAlert = () => {
      setAlertState(prev => ({ ...prev, isOpen: false }));
   };

   // Computed lists (Filtered by Active Status)
   const activeProducts = products.filter(p => p.active);
   const availableBumps = activeProducts.filter(p => p.is_order_bump && p.id !== productId);
   const availableUpsells = activeProducts.filter(p => p.is_upsell && p.id !== productId);
   const selectedGatewayName = gateways.find((gateway) => gateway.id === gatewayId)?.name;
   const selectableGateways = gateways.filter(isSelectableGateway);
   const activeSelectableGateways = selectableGateways.filter(g => g.active);
   const paymentMethodDefinitions = useMemo(
      () => PAYMENT_METHOD_DEFINITIONS.map((method) => ({
         ...method,
         label: t(method.translationKey, method.fallbackLabel),
      })),
      [t]
   );
   const currencyEligibleGateways = useMemo(
       () => activeSelectableGateways.filter((gateway) => (
          currency === 'BRL'
          || gateway.name === GatewayProvider.STRIPE
          || gateway.name === GatewayProvider.PAYPAL
       )),
      [activeSelectableGateways, currency]
   );
   const effectivePaymentRouting = useMemo(
      () => normalizeCheckoutPaymentRouting({
         config,
         gatewayId,
         backupGatewayId,
         gateways: activeSelectableGateways,
      }),
      [config, gatewayId, backupGatewayId, activeSelectableGateways]
   );
   const hasExplicitMethodRouting = useMemo(
      () => ROUTABLE_PAYMENT_METHODS.some((paymentMethod) => Boolean(config.payment_routing?.[paymentMethod])),
      [config.payment_routing]
   );
   const resolvedLegacyGatewaySelection = useMemo(
      () => deriveLegacyGatewaySelection({
         paymentMethods: config.payment_methods,
         routing: effectivePaymentRouting,
         fallbackGatewayId: gatewayId,
         fallbackBackupGatewayId: backupGatewayId,
      }),
      [backupGatewayId, config.payment_methods, effectivePaymentRouting, gatewayId]
   );
   const isAsaasSelected = paymentMethodDefinitions.some((method) => {
      if (!config.payment_methods[method.id]) return false;
      const routeGatewayId = effectivePaymentRouting[method.id]?.primary_gateway_id;
      return gateways.find((gateway) => gateway.id === routeGatewayId)?.name === GatewayProvider.ASAAS;
   });
   const isPagSeguroSelected = selectedGatewayName === GatewayProvider.PAGSEGURO;
   const hasUnavailableLegacyGateway = gatewayId
      ? gateways.find((gateway) => gateway.id === gatewayId)?.name === GatewayProvider.PAGSEGURO
      : false;

   const getMethodCompatibleGateways = (paymentMethod: PaymentMethodType) => {
      return currencyEligibleGateways.filter((gateway) => supportsGatewayPaymentMethod(gateway.name, paymentMethod));
   };

   const methodHasCompatibleGateway = (paymentMethod: PaymentMethodType) => {
      return getMethodCompatibleGateways(paymentMethod).length > 0;
   };

   const updatePaymentMethodToggle = (paymentMethod: PaymentMethodType, nextEnabled: boolean) => {
      const compatibleGateways = getMethodCompatibleGateways(paymentMethod);
      setConfig((prevConfig) => {
         const normalizedRouting = normalizeCheckoutPaymentRouting({
            config: prevConfig,
            gatewayId,
            backupGatewayId,
            gateways: activeSelectableGateways,
         });
         const currentRoute = normalizedRouting[paymentMethod] || {
            enabled: nextEnabled,
            primary_gateway_id: null,
            backup_gateway_id: null,
         };
         const nextPrimaryGatewayId = nextEnabled
            ? currentRoute.primary_gateway_id || compatibleGateways[0]?.id || null
            : currentRoute.primary_gateway_id;

         return {
            ...prevConfig,
            payment_methods: {
               ...prevConfig.payment_methods,
               [paymentMethod]: nextEnabled,
            },
            payment_routing: {
               ...(prevConfig.payment_routing || {}),
               [paymentMethod]: {
                  ...currentRoute,
                  enabled: nextEnabled,
                  primary_gateway_id: nextPrimaryGatewayId,
                  backup_gateway_id: paymentMethod === 'pix' ? currentRoute.backup_gateway_id : null,
               },
            },
         };
      });
   };

   const updatePaymentMethodRoute = (
      paymentMethod: PaymentMethodType,
      field: 'primary_gateway_id' | 'backup_gateway_id',
      value: string
   ) => {
      setConfig((prevConfig) => {
         const normalizedRouting = normalizeCheckoutPaymentRouting({
            config: prevConfig,
            gatewayId,
            backupGatewayId,
            gateways: activeSelectableGateways,
         });
         const currentRoute = normalizedRouting[paymentMethod] || {
            enabled: Boolean(prevConfig.payment_methods[paymentMethod]),
            primary_gateway_id: null,
            backup_gateway_id: null,
         };
         const normalizedValue = value || null;

         const nextRoute = {
            ...currentRoute,
            [field]: normalizedValue,
         };

         if (field === 'primary_gateway_id' && nextRoute.backup_gateway_id === normalizedValue) {
            nextRoute.backup_gateway_id = null;
         }

         if (field === 'backup_gateway_id' && nextRoute.primary_gateway_id === normalizedValue) {
            nextRoute.backup_gateway_id = null;
         }

         if (paymentMethod !== 'pix') {
            nextRoute.backup_gateway_id = null;
         }

         return {
            ...prevConfig,
            payment_routing: {
               ...(prevConfig.payment_routing || {}),
               [paymentMethod]: nextRoute,
            },
         };
      });
   };

   useEffect(() => {
      const load = async () => {
         // Load Dependencies
         setProducts(await storage.getProducts());
         setDomains(await storage.getDomains());
         setGateways(await storage.getGateways());

         if (!isNew && id) {
            const allCheckouts = await storage.getCheckouts();
            const found = allCheckouts.find(c => c.id === id);
            if (found) {
               const resolvedUpsellProductId = String(
                  found.config?.upsell?.product_id || found.upsell_product_id || ''
               ).trim();
               setName(found.name);
               setActive(found.active);
               setProductId(found.product_id);
               setGatewayId(found.gateway_id);
               setDomainId(found.domain_id || '');
               setSlug(found.custom_url_slug);
               initialCommercialPublicationRouteRef.current = {
                  productId: found.product_id,
                  active: Boolean(found.active),
                  domainId: found.domain_id || '',
                  slug: found.custom_url_slug || '',
               };
               setOrderBumpIds(found.order_bump_ids || []);
               setUpsellProductId(resolvedUpsellProductId);
               setThankYouButtonUrl((found as any).thank_you_button_url || '');
               setThankYouButtonText((found as any).thank_you_button_text || '');
               setCurrency(found.currency || 'BRL');
               setBackupGatewayId(found.backup_gateway_id || '');
               setConfig(hydrateCheckoutConfig(found.config, resolvedUpsellProductId));
            }
         }
         setLoading(false);
      };
      load();
   }, [id, isNew]);

   const handleSave = async () => {
      console.log('Debug - Form state:', { name, productId, gatewayId });

      // Compliance Check: Block saving if business is not ready
      if (!compliance?.is_ready) {
         setShowComplianceModal(true);
         return;
      }

      if (!name || !productId) {
         showAlert(t('common.info', 'Atencao'), 'Por favor, preencha o nome e selecione um produto.', 'info');
         return;
      }

      try {
         setLoading(true);
         const sanitizedPixels = config.pixels ? {
            ...config.pixels,
            gtm_id: config.pixels.gtm_id ? config.pixels.gtm_id.trim().toUpperCase() : undefined,
            facebook_pixel_id: config.pixels.facebook_pixel_id ? config.pixels.facebook_pixel_id.trim() : undefined,
            tiktok_pixel_id: config.pixels.tiktok_pixel_id ? config.pixels.tiktok_pixel_id.trim().toUpperCase() : undefined,
            google_analytics_id: config.pixels.google_analytics_id ? config.pixels.google_analytics_id.trim().toUpperCase() : undefined,
            google_ads_id: config.pixels.google_ads_id ? config.pixels.google_ads_id.trim().toUpperCase() : undefined,
         } : undefined;

         const normalizedUpsellProductId = String(
            config.upsell?.product_id || upsellProductId || ''
         ).trim();

         const sanitizedPaymentMethods = {
            ...config.payment_methods,
            pix: config.payment_methods.pix && methodHasCompatibleGateway('pix'),
            credit_card: config.payment_methods.credit_card && methodHasCompatibleGateway('credit_card'),
            boleto: config.payment_methods.boleto && methodHasCompatibleGateway('boleto'),
            apple_pay: config.payment_methods.apple_pay && methodHasCompatibleGateway('apple_pay'),
            google_pay: config.payment_methods.google_pay && methodHasCompatibleGateway('google_pay'),
            paypal: config.payment_methods.paypal && methodHasCompatibleGateway('paypal'),
         };
         const hasAnyActivePaymentMethod = ROUTABLE_PAYMENT_METHODS.some(
            (paymentMethod) => sanitizedPaymentMethods[paymentMethod]
         );
         if (!hasAnyActivePaymentMethod) {
            showAlert('Nenhum meio de pagamento ativo', 'Ative pelo menos um meio de pagamento compativel antes de salvar.', 'info');
            return;
         }

         const normalizedPaymentRouting = normalizeCheckoutPaymentRouting({
            config: {
               ...config,
               payment_methods: sanitizedPaymentMethods,
            },
            gatewayId,
            backupGatewayId,
            gateways: activeSelectableGateways,
         });
         const serializedPaymentRouting = ROUTABLE_PAYMENT_METHODS.reduce((acc, paymentMethod) => {
            const route = normalizedPaymentRouting[paymentMethod];
            if (!route) return acc;

            acc[paymentMethod] = {
               ...route,
               enabled: Boolean(sanitizedPaymentMethods[paymentMethod]),
               backup_gateway_id: paymentMethod === 'pix' ? route.backup_gateway_id : null,
            };
            return acc;
         }, {} as NonNullable<CheckoutConfig['payment_routing']>);
         const methodsMissingPrimaryRoute = ROUTABLE_PAYMENT_METHODS.filter(
            (paymentMethod) => sanitizedPaymentMethods[paymentMethod] && !serializedPaymentRouting[paymentMethod]?.primary_gateway_id
         );
         if (methodsMissingPrimaryRoute.length > 0) {
            showAlert('Rota de pagamento pendente', 'Defina o gateway principal de cada meio de pagamento ativo antes de salvar.', 'info');
            return;
         }
         const resolvedLegacyGatewaySelectionForSave = deriveLegacyGatewaySelection({
            paymentMethods: sanitizedPaymentMethods,
            routing: serializedPaymentRouting,
            fallbackGatewayId: gatewayId,
            fallbackBackupGatewayId: backupGatewayId,
         });
         const resolvedLegacyGatewayName = gateways.find((gateway) => gateway.id === resolvedLegacyGatewaySelectionForSave.primaryGatewayId)?.name;
         const resolvedLegacyBackupGatewayName = gateways.find((gateway) => gateway.id === resolvedLegacyGatewaySelectionForSave.backupGatewayId)?.name;
         if (!resolvedLegacyGatewaySelectionForSave.primaryGatewayId) {
            showAlert('Checkout sem rota valida', 'Ative pelo menos um meio de pagamento com gateway compativel antes de salvar.', 'info');
            return;
         }
         if (resolvedLegacyGatewayName === GatewayProvider.PAGSEGURO) {
            showAlert('Gateway indisponivel', 'O PagBank foi removido do sistema porque a homologacao foi negada. Escolha Mercado Pago, Stripe, Asaas ou Pix manual para salvar este checkout.', 'info');
            return;
         }

         const sanitizedConfig = {
            ...config,
            header_image: pendingBannerFile ? '' : config.header_image,
            payment_methods: sanitizedPaymentMethods,
            payment_routing: serializedPaymentRouting,
            pixels: sanitizedPixels,
            upsell: config.upsell ? {
               ...config.upsell,
               product_id: normalizedUpsellProductId,
               benefits: sanitizeUpsellBenefits(config.upsell.benefits),
            } : undefined,
         };

         const hasConfiguredUpsell = Boolean(
            sanitizedConfig.upsell?.active && normalizedUpsellProductId
         );

         const checkoutData = {
            name,
            active,
            product_id: productId,
            gateway_id: resolvedLegacyGatewaySelectionForSave.primaryGatewayId,
            domain_id: domainId || null, // Send null to clear the field in DB
            custom_url_slug: slug || (isNew ? `chk-${Date.now()}` : id!),
            order_bump_ids: orderBumpIds,
            upsell_product_id: hasConfiguredUpsell ? normalizedUpsellProductId : undefined,
            thank_you_button_url: thankYouButtonUrl || null,
            thank_you_button_text: thankYouButtonText || null,
            currency,
            backup_gateway_id: resolvedLegacyBackupGatewayName === GatewayProvider.PAGSEGURO
               ? null
               : resolvedLegacyGatewaySelectionForSave.backupGatewayId || null,
            config: sanitizedConfig,
            user_id: user?.id || '', // Requisito da interface
            offer_id: undefined // Legacy field, not used in current implementation
         };
         const nextCommercialPublicationRoute: CommercialPublicationRoute = {
            productId,
            active: Boolean(active),
            domainId: domainId || '',
            slug: checkoutData.custom_url_slug,
         };

         if (isNew) {
            await storage.createCheckout({
               id: checkoutId, // Use the pre-generated ID
               ...checkoutData
            });
         } else {
            await storage.updateCheckout({
               id: id!,
               ...checkoutData
            });
         }

         if (pendingBannerFile) {
            const bannerUrl = await storage.uploadCheckoutBanner(pendingBannerFile, checkoutId);
            await storage.updateCheckout({
               id: checkoutId,
               ...checkoutData,
               config: { ...sanitizedConfig, header_image: bannerUrl },
            });
            clearStagedBanner();
         }

         try {
            if (hasCommercialPublicationRouteChanged(
               initialCommercialPublicationRouteRef.current,
               nextCommercialPublicationRoute,
            )) {
               await syncCentralPlanForSystemUpgrade(productId);
               await syncPortalInstallationOffer(productId);
               initialCommercialPublicationRouteRef.current = nextCommercialPublicationRoute;
            }
         } catch (syncError) {
            console.error('Commercial publication sync failed after checkout save:', syncError);
            const safeDetail = syncError instanceof Error && syncError.message
               ? ` Motivo: ${syncError.message}`
               : '';
            showAlert(
               'Checkout salvo com ressalva',
               `O checkout foi salvo, mas a publicação comercial no Portal ainda não foi atualizada. Tente salvar novamente antes de divulgá-lo aos clientes.${safeDetail}`,
               'error',
            );
            return;
         }
         navigate('/admin/checkouts');
      } catch (error) {
         console.error('Error saving checkout:', error);
         showAlert(t('common.error', 'Erro'), t('checkout_editor.save_error', 'Erro ao salvar checkout.'), 'error');
      } finally {
         setLoading(false);
      }
   };

   const toggleBump = (pid: string) => {
      if (orderBumpIds.includes(pid)) {
         setOrderBumpIds(orderBumpIds.filter(i => i !== pid));
      } else {
         setOrderBumpIds([...orderBumpIds, pid]);
      }
   };

   // Image upload
   const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
         try {
            const file = e.target.files[0];
            if (isNew) {
               if (stagedBannerPreviewUrl.current) URL.revokeObjectURL(stagedBannerPreviewUrl.current);
               const previewUrl = URL.createObjectURL(file);
               stagedBannerPreviewUrl.current = previewUrl;
               setPendingBannerFile(file);
               setConfig((current) => ({ ...current, header_image: previewUrl }));
               return;
            }

            setIsUploadingBanner(true);
            const url = await storage.uploadCheckoutBanner(file, checkoutId);
            setConfig((current) => ({ ...current, header_image: url }));
         } catch (error) {
            console.error('Error uploading banner:', error);
            showAlert(t('common.error', 'Erro'), t('common.upload_error', 'Erro ao fazer upload da imagem. Tente novamente.'), 'error');
         } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
            setIsUploadingBanner(false);
         }
      }
   };

   // Helper to get gateway logo
   const getGatewayLogo = (provider: string) => {
      switch (provider) {
         case GatewayProvider.MERCADO_PAGO:
            return "/mercado-pago-logo.png";
         case GatewayProvider.STRIPE:
            return "/stripe-logo.png";
         case GatewayProvider.ASAAS:
            return "/Asaas-logo.png";
          case GatewayProvider.PAGSEGURO:
             return "/pag-seguro-logoo.png";
          case GatewayProvider.PAYPAL:
             return "/paypal-logo.png";
         default:
            return "";
      }
   };

   const getGatewayLabel = (gatewayId?: string | null) => {
      const gateway = gateways.find((entry) => entry.id === gatewayId);
      return gateway ? gateway.name.replace('_', ' ') : 'Nao definido';
   };

   const legacyPrimaryGateway = gateways.find((gateway) => gateway.id === resolvedLegacyGatewaySelection.primaryGatewayId) || null;
   const legacyBackupGateway = gateways.find((gateway) => gateway.id === resolvedLegacyGatewaySelection.backupGatewayId) || null;
   const activePaymentMethodCount = paymentMethodDefinitions.filter((method) => config.payment_methods[method.id]).length;
   const readyPaymentMethodCount = paymentMethodDefinitions.filter(
      (method) => config.payment_methods[method.id] && effectivePaymentRouting[method.id]?.primary_gateway_id
   ).length;

   return (
      <Layout>
         {loading ? (
            <Loading label={t('checkout_editor.loading')} className="min-h-[70vh]" />
         ) : (
            <>
               <div className="sticky top-0 z-40 bg-[#05050A]/60 backdrop-blur-xl py-6 border-b border-white/5 mb-10 -mx-4 px-8 lg:-mx-8">
                  <div className="max-w-[1200px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                     <div className="flex items-center gap-6">
                        <button 
                           onClick={() => navigate('/admin/checkouts')} 
                           className="group/back w-12 h-12 flex items-center justify-center bg-white/5 hover:bg-primary/20 rounded-2xl border border-white/5 hover:border-primary/30 text-gray-500 hover:text-primary transition-all duration-500"
                        >
                           <ArrowLeft className="w-5 h-5 group-hover/back:-translate-x-1 transition-transform" />
                        </button>
                        <div>
                           <div className="flex items-center gap-3 mb-1">
                              <span className="text-[10px] font-black text-primary uppercase tracking-[0.3em] flex items-center gap-2">
                                 <Plus className="w-3 h-3" /> {t('checkout_editor.architect_mode')}
                              </span>
                              <div className="w-1 h-1 rounded-full bg-gray-800" />
                              <span className="text-[10px] text-gray-700 font-bold uppercase tracking-[0.2em]">{isNew ? t('checkout_editor.new_protocol') : `ID: ${id?.slice(0,8)}`}</span>
                           </div>
                           <h1 className="text-2xl font-portal-display text-white uppercase tracking-tight leading-none italic">
                              {isNew ? t('checkout_editor.structure_checkout') : t('checkout_editor.optimize_checkout')}
                           </h1>
                        </div>
                     </div>
                     <div className="flex items-center gap-4">
                        <Button 
                           variant="ghost" 
                           onClick={() => navigate('/admin/checkouts')}
                           className="text-gray-600 hover:text-white uppercase font-black tracking-widest text-[10px] px-6 transition-colors"
                        >
                           {t('checkout_editor.discard')}
                        </Button>
                        <Button 
                           onClick={handleSave}
                           className="group/save bg-primary hover:bg-rose-600 text-white px-10 h-14 rounded-2xl shadow-xl shadow-primary/20 flex items-center gap-3 active:scale-95 transition-all duration-500"
                        >
                           <Save className="w-4 h-4 group-hover/save:rotate-12 transition-transform" />
                           <span className="font-black uppercase italic tracking-tighter text-sm">
                              {t('checkout_editor.save')}
                           </span>
                        </Button>
                     </div>
                  </div>
               </div>

               <div className="max-w-[1100px] mx-auto space-y-12 pb-32">

                  <section className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                     <div className="flex items-center gap-4 mb-8 ml-2">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-lg shadow-primary/10">
                           <Globe className="w-6 h-6" />
                        </div>
                        <div>
                           <h2 className="text-base font-portal-display text-white uppercase tracking-tight">{t('checkout_editor.identity_title')}</h2>
                           <p className="text-[10px] text-gray-700 font-bold uppercase tracking-[0.2em]">{t('checkout_editor.identity_desc')}</p>
                        </div>
                     </div>

                     <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-1 p-10 bg-[#0A0A15]/80 border border-white/5 rounded-[2.5rem] shadow-2xl">
                           <label className="block text-[10px] font-black text-gray-700 uppercase tracking-[0.3em] mb-4 ml-1 italic">{t('checkout_editor.strategic_label')}</label>
                           <input
                              type="text"
                              className="w-full bg-white/[0.02] border-2 border-white/5 rounded-2xl px-6 py-4 text-white font-bold placeholder:text-gray-800 focus:border-primary/50 focus:ring-0 outline-none transition-all"
                              placeholder={t('checkout_editor.internal_name_placeholder')}
                              value={name}
                              onChange={e => setName(e.target.value)}
                           />
                           <p className="mt-4 text-[9px] text-gray-800 font-medium leading-relaxed italic">{t('checkout_editor.strategic_hint')}</p>
                        </div>

                        <div className="lg:col-span-2 p-10 bg-[#0A0A15]/80 border border-white/10 rounded-[2.5rem] relative overflow-hidden group shadow-2xl">
                           <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-[50px] -translate-y-1/2 translate-x-1/2" />
                           
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 relative z-10">
                              <div>
                                 <label className="block text-[10px] font-black text-gray-700 uppercase tracking-[0.3em] mb-4 ml-1 italic">{t('checkout_editor.checkout_domain')}</label>
                                 <div className="relative group/select">
                                    <Globe className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary group-focus-within/select:text-white transition-colors" />
                                    <select
                                       className="w-full bg-white/[0.02] border-2 border-white/5 rounded-2xl pl-14 pr-6 py-4 text-white font-bold focus:border-primary/50 focus:ring-0 outline-none appearance-none transition-all cursor-pointer"
                                       value={domainId}
                                       onChange={e => setDomainId(e.target.value)}
                                    >
                                       <option value="" className="bg-[#0A0A15] text-white">supercheckout.app</option>
                                       {domains
                                          .filter(d => d.usage === DomainUsage.CHECKOUT)
                                          .map(d => (
                                             <option key={d.id} value={d.id} className="bg-[#0A0A15] text-white">
                                                {d.domain}
                                             </option>
                                          ))}
                                    </select>
                                    <ChevronRight className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-800 rotate-90 pointer-events-none" />
                                 </div>
                              </div>
                              <div>
                                 <label className="block text-[10px] font-black text-gray-700 uppercase tracking-[0.3em] mb-4 ml-1 italic">{t('checkout_editor.slug_label')}</label>
                                 <div className="flex group/url">
                                    <div className="bg-white/5 border-2 border-white/5 border-r-0 rounded-l-2xl min-w-[60px] flex items-center justify-center text-[10px] font-black text-gray-800 uppercase italic px-4">
                                       /{domainId ? '' : 'c/'}
                                    </div>
                                    <input
                                       type="text"
                                       className="w-full bg-white/[0.02] border-2 border-white/5 rounded-r-2xl px-6 py-4 text-white font-bold focus:border-primary/50 focus:ring-0 outline-none transition-all"
                                       placeholder="promocao-especial"
                                       value={slug}
                                       onChange={e => setSlug(e.target.value)}
                                    />
                                 </div>
                              </div>
                           </div>
                        </div>
                     </div>
                  </section>

                  <section className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
                     <div className="flex items-center gap-4 mb-8 ml-2">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-lg shadow-primary/10">
                           <ShoppingBag className="w-6 h-6" />
                        </div>
                        <div>
                           <h2 className="text-base font-portal-display text-white uppercase tracking-tight">{t('checkout_editor.main_product_title')}</h2>
                           <p className="text-[10px] text-gray-700 font-bold uppercase tracking-[0.2em]">{t('checkout_editor.main_product_desc')}</p>
                        </div>
                     </div>

                     <div className="p-10 bg-[#0A0A15]/80 border border-white/5 rounded-[2.5rem] shadow-2xl">
                        {activeProducts.length === 0 ? (
                           <div className="text-center py-16 border-2 border-dashed border-white/5 rounded-[2rem] bg-white/[0.01]">
                              <ShoppingBag className="w-12 h-12 text-gray-800 mx-auto mb-4" />
                              <p className="text-sm text-gray-700 font-bold uppercase tracking-widest italic">{t('checkout_editor.no_product_available')}</p>
                              <Button variant="ghost" size="sm" className="mt-6 text-primary font-black uppercase tracking-widest text-[9px]" onClick={() => navigate('/admin/products')}>{t('checkout_editor.register_product')}</Button>
                           </div>
                        ) : (
                           <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                              {activeProducts.map(prod => (
                                 <label
                                    key={prod.id}
                                    className={`relative group/prod cursor-pointer border-2 rounded-[2rem] p-6 flex items-center gap-5 transition-all duration-500 overflow-hidden ${productId === prod.id
                                       ? 'bg-primary/10 border-primary/50 shadow-[0_0_30px_rgba(138,43,226,0.15)] scale-[1.02]'
                                       : 'bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.04]'
                                       }`}
                                 >
                                    <input
                                       type="radio"
                                       name="product"
                                       className="hidden"
                                       checked={productId === prod.id}
                                       onChange={() => setProductId(prod.id)}
                                    />
                                    
                                    <div className="relative w-16 h-16 rounded-2xl bg-black/40 border border-white/5 flex-shrink-0 overflow-hidden shadow-inner group-hover/prod:border-primary/30 transition-colors">
                                       {prod.imageUrl ? (
                                          <img src={prod.imageUrl} className="w-full h-full object-cover group-hover/prod:scale-110 transition-transform duration-700" />
                                       ) : (
                                          <ShoppingBag className="w-full h-full p-4 text-gray-800 group-hover/prod:text-primary transition-colors" />
                                       )}
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                       <p className="font-black text-white text-sm uppercase tracking-tighter truncate italic group-hover/prod:text-primary transition-colors">{prod.name}</p>
                                       <div className="flex items-center gap-3 mt-2">
                                          <span className="text-emerald-500 text-[10px] font-black bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                                             R$ {prod.price_real?.toFixed(2)}
                                          </span>
                                          {prod.price_fake && (
                                             <span className="text-gray-800 text-[9px] line-through font-bold">
                                                R$ {prod.price_fake.toFixed(2)}
                                             </span>
                                          )}
                                       </div>
                                    </div>

                                    {productId === prod.id && (
                                       <div className="absolute top-4 right-4 w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-lg animate-in zoom-in duration-300">
                                          <Check className="w-4 h-4 text-white font-bold" />
                                       </div>
                                    )}
                                 </label>
                              ))}
                           </div>
                        )}
                     </div>
                  </section>

                  <section className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
                     <div className="flex items-center gap-4 mb-8 ml-2">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-lg shadow-primary/10">
                           <CreditCard className="w-6 h-6" />
                        </div>
                        <div>
                           <h2 className="text-base font-portal-display text-white uppercase tracking-tight">
                              {t('checkout_editor.payment_hub_title', 'Pagamentos e roteamento')}
                           </h2>
                           <p className="text-[10px] text-gray-700 font-bold uppercase tracking-[0.2em]">
                              {t('checkout_editor.payment_hub_desc', 'Meios ativos e seus respectivos provedores de processamento')}
                           </p>
                        </div>
                     </div>

                     <div className="p-10 bg-[#0A0A15]/80 border border-white/5 rounded-[2.5rem] shadow-2xl space-y-8">
                        {/* Cabeçalho de Controle: Moeda & Status */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-white/5">
                           <div className="flex items-center gap-3">
                              <span className="text-[10px] font-black text-gray-700 uppercase tracking-[0.25em] italic">
                                 {t('checkout_editor.currency_label', 'Moeda')}:
                              </span>
                              <div className="flex bg-black/40 rounded-xl p-1 border border-white/5">
                                 {[
                                    { id: 'BRL', symbol: 'R$' },
                                    { id: 'USD', symbol: '$' },
                                    { id: 'EUR', symbol: '€' }
                                 ].map((option) => (
                                    <button
                                       key={option.id}
                                       type="button"
                                       onClick={() => setCurrency(option.id as 'BRL' | 'USD' | 'EUR')}
                                       className={`py-1.5 px-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${currency === option.id
                                          ? 'bg-primary text-white shadow-md shadow-primary/20'
                                          : 'text-gray-700 hover:text-gray-400'
                                          }`}
                                    >
                                       {option.id} ({option.symbol})
                                    </button>
                                 ))}
                              </div>
                           </div>

                           <div className="flex items-center gap-3">
                              <span className="text-[10px] font-black text-gray-700 uppercase tracking-[0.25em] italic">
                                 {t('checkout_editor.routing_readiness_title', 'Status')}:
                              </span>
                              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.05)]">
                                 <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                                 {readyPaymentMethodCount}/{activePaymentMethodCount || paymentMethodDefinitions.length} {t('checkout_editor.ready_methods_badge', 'Configurados')}
                              </span>
                              <div className="group relative">
                                 <HelpCircle className="w-4 h-4 text-gray-700 hover:text-cyan-400 cursor-help transition-colors" />
                                 <div className="absolute right-0 bottom-6 hidden group-hover:block w-64 p-3 bg-black border border-white/10 rounded-xl text-[10px] text-gray-400 font-medium leading-relaxed shadow-2xl z-50">
                                    {t('checkout_editor.routing_readiness_desc', 'O checkout publico continua unico, mas cada metodo pode seguir sua propria rota operacional.')}
                                 </div>
                              </div>
                           </div>
                        </div>

                        {currency !== 'BRL' && currencyEligibleGateways.length === 0 && (
                           <div className="p-5 rounded-2xl bg-rose-500/5 border border-rose-500/10 flex gap-4 items-center animate-in fade-in duration-300">
                              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
                              <p className="text-[10px] text-rose-200/70 font-medium uppercase tracking-widest italic leading-relaxed">
                                 {t('checkout_editor.stripe_required_prefix')} <span className="text-rose-500 font-black">{currency}</span>, {t('checkout_editor.stripe_required_suffix')} <span className="text-white font-black">Stripe</span>.
                              </p>
                           </div>
                        )}

                        {activeSelectableGateways.length === 0 ? (
                           <div className="text-center py-12 bg-white/[0.01] border-2 border-dashed border-white/5 rounded-[2rem]">
                              <Wallet className="w-12 h-12 text-gray-800 mx-auto mb-4" />
                              <p className="text-sm text-gray-700 font-bold uppercase tracking-widest italic">{t('checkout_editor.no_gateway')}</p>
                              <Button variant="ghost" size="sm" className="mt-6 text-primary font-black uppercase tracking-widest text-[9px]" onClick={() => navigate('/admin/gateways')}>
                                 {t('checkout_editor.activate_gateways')}
                              </Button>
                           </div>
                        ) : (
                           <>
                               {/* Grid de Cards Compactos dos Métodos de Pagamento */}
                               <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                                  {paymentMethodDefinitions.map((method) => {
                                     const methodSelected = Boolean(config.payment_methods[method.id]);
                                     const compatibleGateways = getMethodCompatibleGateways(method.id);
                                     const methodCanToggle = compatibleGateways.length > 0 || methodSelected;

                                     return (
                                        <button
                                           key={`method-toggle-${method.id}`}
                                           type="button"
                                           disabled={!methodCanToggle}
                                           onClick={() => updatePaymentMethodToggle(method.id, !methodSelected)}
                                           className={`flex flex-col items-center justify-between p-4 rounded-2xl border-2 transition-all duration-300 relative group text-center min-h-[110px] ${methodSelected
                                              ? 'border-primary/40 bg-primary/5 text-white shadow-lg shadow-primary/5 scale-[1.01]'
                                              : 'border-white/5 bg-black/25 text-gray-500 hover:border-white/10 hover:bg-black/40'
                                              } ${!methodCanToggle ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                                        >
                                           {/* Switch Clássico de Bolinha Deslizante (iOS Style) no topo do card */}
                                           <div className="w-full flex justify-end mb-1">
                                              <div className={`relative w-8 h-4.5 rounded-full transition-colors duration-300 ${methodSelected ? 'bg-primary' : 'bg-gray-800'}`}>
                                                 <span className={`absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-300 ${methodSelected ? 'translate-x-3.5' : 'translate-x-0'}`} />
                                              </div>
                                           </div>

                                           {/* Ícone de Alta Fidelidade do Método de Pagamento */}
                                           <div className="flex-1 flex items-center justify-center mb-2">
                                              {method.id === 'pix' && renderPixIcon(methodSelected)}
                                              {method.id === 'credit_card' && renderCardIcon(methodSelected)}
                                              {method.id === 'boleto' && renderBoletoIcon(methodSelected)}
                                              {method.id === 'apple_pay' && renderApplePayIcon(methodSelected)}
                                              {method.id === 'google_pay' && renderGooglePayIcon(methodSelected)}
                                           </div>

                                           {/* Título do Método */}
                                           <span className="text-[10px] font-black uppercase tracking-widest leading-none">
                                              {method.label}
                                           </span>
                                        </button>
                                     );
                                  })}
                               </div>

                               {/* Painéis de Configuração dos Métodos de Pagamento Ativos */}
                               <div className="space-y-6 pt-2">
                                  {activePaymentMethodCount === 0 && (
                                     <div className="text-center py-10 bg-white/[0.01] border border-dashed border-white/5 rounded-3xl">
                                        <Wallet className="w-10 h-10 text-gray-800 mx-auto mb-3" />
                                        <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest italic">
                                           {t('checkout_editor.no_active_methods_hint', 'Ative um ou mais meios de pagamento acima para configurar as rotas de processamento.')}
                                        </p>
                                     </div>
                                  )}

                                  {paymentMethodDefinitions.map((method) => {
                                     const methodSelected = Boolean(config.payment_methods[method.id]);
                                     if (!methodSelected) return null;

                                     const route = effectivePaymentRouting[method.id];
                                     const compatibleGateways = getMethodCompatibleGateways(method.id);
                                     const primaryGatewayId = route?.primary_gateway_id || '';
                                     const backupGatewayIdForMethod = method.supportsAutomaticBackup ? route?.backup_gateway_id || '' : '';

                                     return (
                                        <div
                                           key={`method-panel-${method.id}`}
                                           className="p-6 bg-black/20 border border-white/5 rounded-3xl space-y-4 animate-in fade-in duration-300"
                                        >
                                           {/* Cabeçalho do Bloco de Configurações */}
                                           <div className="flex items-center justify-between pb-3 border-b border-white/5">
                                              <div className="flex items-center gap-2.5">
                                                 <div className="text-white shrink-0">
                                                    {method.id === 'pix' && renderPixIcon(true)}
                                                    {method.id === 'credit_card' && renderCardIcon(true)}
                                                    {method.id === 'boleto' && renderBoletoIcon(true)}
                                                    {method.id === 'apple_pay' && renderApplePayIcon(true)}
                                                    {method.id === 'google_pay' && renderGooglePayIcon(true)}
                                                 </div>
                                                 <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white italic">
                                                    {t('checkout_editor.routing_for_short', 'Configuração -')} {method.id === 'pix' ? 'PIX' : method.id === 'credit_card' ? 'CARTÃO DE CRÉDITO' : method.label.toUpperCase()}
                                                 </span>
                                                 {isAsaasSelected && method.id === 'pix' && (
                                                    <span className="text-[8px] font-black text-amber-500 uppercase tracking-[0.1em] px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                                                       {t('checkout_editor.pix_only_notice', 'Apenas Pix')}
                                                    </span>
                                                 )}
                                              </div>
                                              <span className="text-[9px] uppercase tracking-[0.15em] text-gray-600 font-bold">
                                                 {primaryGatewayId ? getGatewayLabel(primaryGatewayId) : t('checkout_editor.unconfigured_route', 'Sem gateway')}
                                              </span>
                                           </div>

                                           {/* Processador Principal */}
                                           <div className="space-y-2.5">
                                              <span className="text-[9px] font-black text-gray-600 uppercase tracking-[0.18em] italic">
                                                 {t('checkout_editor.primary_gateway_route', 'Processador Principal')}:
                                              </span>

                                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                                 {compatibleGateways.map((gateway) => {
                                                    const isSelected = primaryGatewayId === gateway.id;
                                                    return (
                                                       <button
                                                          key={`gate-select-${method.id}-${gateway.id}`}
                                                          type="button"
                                                          onClick={() => updatePaymentMethodRoute(method.id, 'primary_gateway_id', gateway.id)}
                                                          className={`h-16 w-full flex items-center justify-center p-3 rounded-2xl border-2 transition-all duration-300 relative ${isSelected
                                                             ? 'bg-primary/10 border-primary/50 text-white shadow-lg shadow-primary/20 scale-[1.02]'
                                                             : 'bg-black/30 border-white/5 text-gray-500 hover:border-white/10 hover:bg-black/40'
                                                             }`}
                                                       >
                                                          {getGatewayLogo(gateway.name) ? (
                                                             <img
                                                                src={getGatewayLogo(gateway.name)}
                                                                alt={gateway.name}
                                                                className="h-8 max-w-[85%] object-contain mx-auto filter brightness-100 transition-transform duration-300"
                                                             />
                                                          ) : (
                                                             <span className="text-[10px] font-black uppercase tracking-wider text-center">
                                                                {gateway.name.replace('_', ' ')}
                                                             </span>
                                                          )}
                                                          {isSelected && (
                                                             <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-lg animate-in zoom-in duration-300">
                                                                <Check className="w-3 h-3 text-white font-bold" />
                                                             </div>
                                                          )}
                                                       </button>
                                                    );
                                                 })}
                                              </div>
                                           </div>

                                           {/* Backup Automático para Pix */}
                                           {method.supportsAutomaticBackup && (
                                              <div className="pt-3 border-t border-white/5 space-y-2.5">
                                                 <div className="flex items-center justify-between">
                                                    <span className="text-[9px] font-black text-gray-600 uppercase tracking-[0.18em] italic">
                                                       {t('checkout_editor.backup_gateway_route', 'Redundância / Backup')}:
                                                    </span>
                                                    <div className="group relative">
                                                       <HelpCircle className="w-3.5 h-3.5 text-gray-700 hover:text-cyan-400 cursor-help transition-colors" />
                                                       <div className="absolute right-0 bottom-5 hidden group-hover:block w-52 p-3 bg-black border border-white/10 rounded-xl text-[9px] text-gray-400 font-medium leading-relaxed shadow-2xl z-50">
                                                          {t('checkout_editor.pix_backup_notice', 'Se o Pix principal falhar por indisponibilidade, o checkout tenta o backup sem expor a troca ao comprador.')}
                                                       </div>
                                                    </div>
                                                 </div>

                                                 <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                                    <button
                                                       type="button"
                                                       onClick={() => updatePaymentMethodRoute(method.id, 'backup_gateway_id', '')}
                                                       className={`h-16 w-full flex items-center justify-center px-4 rounded-2xl border-2 text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${!backupGatewayIdForMethod
                                                          ? 'bg-white/10 border-white/20 text-white shadow-md'
                                                          : 'bg-black/30 border-white/5 text-gray-500 hover:border-white/10'
                                                          }`}
                                                    >
                                                       {t('checkout_editor.backup_inactive_badge', 'Sem Backup')}
                                                    </button>
                                                    {compatibleGateways
                                                       .filter((g) => g.id !== primaryGatewayId)
                                                       .map((gateway) => {
                                                          const isSelected = backupGatewayIdForMethod === gateway.id;
                                                          return (
                                                             <button
                                                                key={`gate-backup-${method.id}-${gateway.id}`}
                                                                type="button"
                                                                onClick={() => updatePaymentMethodRoute(method.id, 'backup_gateway_id', gateway.id)}
                                                                className={`h-16 w-full flex items-center justify-center p-3 rounded-2xl border-2 transition-all duration-300 relative ${isSelected
                                                                   ? 'bg-primary/10 border-primary/50 text-white shadow-lg shadow-primary/20 scale-[1.02]'
                                                                   : 'bg-black/30 border-white/5 text-gray-500 hover:border-white/10 hover:bg-black/40'
                                                                   }`}
                                                             >
                                                                {getGatewayLogo(gateway.name) ? (
                                                                   <img
                                                                      src={getGatewayLogo(gateway.name)}
                                                                      alt={gateway.name}
                                                                      className="h-8 max-w-[85%] object-contain mx-auto filter brightness-100 transition-transform duration-300"
                                                                   />
                                                                ) : (
                                                                   <span className="text-[10px] font-black uppercase tracking-wider text-center">
                                                                      {gateway.name.replace('_', ' ')}
                                                                   </span>
                                                                )}
                                                                {isSelected && (
                                                                   <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center shadow-lg">
                                                                      <Check className="w-2.5 h-2.5 text-white font-bold" />
                                                                   </div>
                                                                )}
                                                             </button>
                                                          );
                                                       })}
                                                 </div>
                                              </div>
                                           )}
                                        </div>
                                     );
                                  })}
                               </div>

                               {/* Configurações Avançadas e Sincronização Legada */}
                               <div className="mt-8 border-t border-white/5 pt-6">
                                  <button
                                     type="button"
                                     onClick={() => setShowAdvancedRouting(!showAdvancedRouting)}
                                     className="flex items-center justify-between w-full group py-2"
                                  >
                                     <span className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-700 group-hover:text-primary transition-colors italic">
                                        {t('checkout_editor.advanced_settings_title', 'Configurações Avançadas & Sincronização Legada')}
                                     </span>
                                     <ChevronRight className={`w-4 h-4 text-gray-700 transition-transform duration-300 ${showAdvancedRouting ? 'rotate-90 text-primary' : ''}`} />
                                  </button>

                                  {showAdvancedRouting && (
                                     <div className="mt-6 space-y-6 animate-in slide-in-from-top-2 duration-500">
                                        <div className="p-5 bg-white/[0.01] border border-white/5 rounded-2xl">
                                           <p className="text-[9.5px] text-gray-600 font-medium uppercase tracking-widest leading-relaxed">
                                              {t('checkout_editor.legacy_compat_desc', 'O sistema continua preenchendo o gateway principal e o backup legado de forma automatica para manter a compatibilidade com a modelagem do banco de dados, porem a sua nova experiencia e governada pelas rotas por metodo configuradas acima.')}
                                           </p>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                           {[
                                              {
                                                 key: 'legacy-primary',
                                                 title: t('checkout_editor.primary_gateway', 'Gateway principal'),
                                                 gateway: legacyPrimaryGateway,
                                                 fallbackLabel: t('checkout_editor.unassigned_route_short', 'Sem base definida'),
                                              },
                                              {
                                                 key: 'legacy-backup',
                                                 title: t('checkout_editor.backup_gateway', 'Gateway backup'),
                                                 gateway: legacyBackupGateway,
                                                 fallbackLabel: t('checkout_editor.backup_inactive', 'Backup inativo'),
                                              },
                                           ].map((item) => (
                                              <div key={item.key} className="rounded-2xl border border-white/5 bg-black/40 p-4 flex items-center gap-4">
                                                 <div className="w-10 h-10 rounded-xl border border-white/5 bg-black/55 flex items-center justify-center overflow-hidden shrink-0">
                                                    {item.gateway && getGatewayLogo(item.gateway.name) ? (
                                                       <img src={getGatewayLogo(item.gateway.name)} alt={item.gateway.name} className="h-6 w-6 object-contain" />
                                                    ) : (
                                                       <Wallet className="w-4 h-4 text-gray-700" />
                                                    )}
                                                 </div>
                                                 <div className="min-w-0">
                                                    <p className="text-[8px] font-black uppercase tracking-[0.18em] text-gray-700 leading-none mb-1">{item.title}</p>
                                                    <p className="text-xs font-black uppercase tracking-[0.14em] text-white truncate">
                                                       {item.gateway ? getGatewayLabel(item.gateway.id) : item.fallbackLabel}
                                                    </p>
                                                 </div>
                                              </div>
                                           ))}
                                        </div>
                                     </div>
                                  )}
                               </div>
                            </>
                        )}
                     </div>
                  </section>

                  <section className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
                     <div className="flex items-center justify-between mb-8 ml-2">
                        <div className="flex items-center gap-4">
                           <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500 shadow-lg shadow-orange-500/10">
                              <Layers className="w-6 h-6" />
                           </div>
                           <div>
                              <h2 className="text-base font-portal-display text-white uppercase tracking-tight">{t('checkout_editor.order_bumps_title')}</h2>
                              <p className="text-[10px] text-gray-700 font-bold uppercase tracking-[0.2em]">{t('checkout_editor.order_bumps_desc')}</p>
                           </div>
                        </div>
                     </div>

                     <div className="p-10 bg-[#0A0A15]/80 border border-white/5 rounded-[2.5rem] shadow-2xl">
                        {availableBumps.length === 0 ? (
                           <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-[2rem] bg-white/[0.01]">
                              <AlertCircle className="w-10 h-10 text-gray-800 mx-auto mb-4 opacity-50" />
                              <p className="text-sm text-gray-800 font-bold uppercase tracking-widest italic">{t('checkout_editor.no_bumps')}</p>
                           </div>
                        ) : (
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                              {availableBumps.map(prod => (
                                 <label
                                    key={prod.id}
                                    className={`relative group/bump cursor-pointer border-2 rounded-[2rem] p-6 flex items-center gap-5 transition-all duration-500 ${orderBumpIds.includes(prod.id)
                                       ? 'bg-orange-500/10 border-orange-500/50 shadow-[0_0_30px_rgba(249,115,22,0.15)] scale-[1.02]'
                                       : 'bg-white/[0.01] border-white/5 hover:border-white/10 hover:bg-white/[0.03]'
                                       }`}
                                 >
                                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-500 ${orderBumpIds.includes(prod.id) ? 'bg-orange-500 border-orange-500 shadow-lg shadow-orange-500/30' : 'bg-transparent border-gray-800'}`}>
                                       {orderBumpIds.includes(prod.id) && <Check className="w-3 h-3 text-white font-black" />}
                                    </div>
                                    <input
                                       type="checkbox"
                                       className="hidden"
                                       checked={orderBumpIds.includes(prod.id)}
                                       onChange={() => toggleBump(prod.id)}
                                    />
                                    <div className="w-12 h-12 rounded-xl bg-black/40 border border-white/5 flex-shrink-0 overflow-hidden shadow-inner font-bold text-orange-500 flex items-center justify-center">
                                       {prod.imageUrl ? <img src={prod.imageUrl} className="w-full h-full object-cover" /> : <Layers className="w-5 h-5" />}
                                    </div>
                                    <div className="min-w-0">
                                       <p className="font-black text-white text-xs uppercase tracking-tighter truncate italic">{prod.name}</p>
                                       <p className="text-[10px] text-orange-500 font-black mt-1">R$ {prod.price_real?.toFixed(2)}</p>
                                    </div>
                                 </label>
                              ))}
                           </div>
                        )}
                     </div>
                  </section>

                  <section className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-[400ms]">
                     <div className="relative p-10 lg:p-12 bg-primary/5 rounded-[2.5rem] border-2 border-primary/20 group hover:border-primary/40 transition-all duration-700 overflow-hidden shadow-2xl">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[80px] -translate-y-1/2 translate-x-1/2 animate-pulse" />
                        
                        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
                           <div className="flex items-center gap-6">
                              <div className="w-16 h-16 rounded-[1.5rem] bg-primary/20 border-2 border-primary/30 flex items-center justify-center text-primary shadow-2xl shadow-primary/40">
                                 <Plus className="w-8 h-8 font-black shrink-0" />
                              </div>
                              <div>
                                 <div className="flex items-center gap-3 mb-2">
                                    <h2 className="text-xl font-portal-display text-white uppercase tracking-tight italic">{t('checkout_editor.upsell_title')}</h2>
                                    <span className="px-3 py-1 rounded-full bg-primary/20 text-primary text-[9px] font-black uppercase tracking-[0.2em] border border-primary/30">{t('checkout_editor.post_sale_logic')}</span>
                                 </div>
                                 <p className="text-xs text-gray-400 font-medium max-w-lg leading-relaxed italic">
                                    {t('checkout_editor.upsell_desc')}
                                 </p>
                                 <p className="text-[10px] text-primary/80 font-black uppercase tracking-[0.18em] mt-3">
                                    {t('checkout_editor.upsell_capability_notice')}
                                 </p>
                              </div>
                           </div>
                           <label className="relative inline-flex items-center cursor-pointer scale-110">
                              <input 
                                 type="checkbox" 
                                 className="sr-only peer"
                                 checked={config.upsell?.active}
                                 onChange={() => setConfig({
                                    ...config,
                                    upsell: { ...config.upsell!, active: !config.upsell?.active }
                                 })}
                              />
                              <div className="w-16 h-8 bg-white/5 border border-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-gray-800 after:rounded-full after:h-6 after:w-6 after:transition-all duration-500 peer-checked:after:bg-white peer-checked:bg-primary shadow-inner"></div>
                           </label>
                        </div>

                        {config.upsell?.active && (
                           <div className="mt-12 space-y-10 animate-in zoom-in-95 duration-700">
                              <div className="h-px bg-primary/10" />
                              
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                 <div className="space-y-6">
                                    <label className="block text-[10px] font-black text-primary uppercase tracking-[0.3em] ml-1 italic">{t('checkout_editor.upsell_product')}</label>
                                    <div className="relative">
                                       <ShoppingBag className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
                                       <select
                                          className="w-full bg-[#05050A] border-2 border-primary/20 rounded-[1.5rem] pl-14 pr-6 py-4 text-white font-bold focus:border-primary/50 focus:ring-0 outline-none appearance-none transition-all cursor-pointer"
                                          value={config.upsell?.product_id || ''}
                                          onChange={e => {
                                             const nextProductId = e.target.value;
                                             setUpsellProductId(nextProductId);
                                             setConfig({ ...config, upsell: { ...config.upsell!, product_id: nextProductId } });
                                          }}
                                       >
                                          <option value="" className="bg-[#0A0A15] text-white">{t('checkout_editor.select_upsell_product')}</option>
                                          {availableUpsells.map(prod => (
                                             <option key={prod.id} value={prod.id} className="bg-[#0A0A15] text-white">{prod.name} (R$ {prod.price_real?.toFixed(2)})</option>
                                          ))}
                                       </select>
                                       <ChevronRight className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40 rotate-90" />
                                    </div>
                                 </div>

                                 <div className="space-y-6">
                                    <label className="block text-[10px] font-black text-primary uppercase tracking-[0.3em] ml-1 italic">{t('checkout_editor.cta_label')}</label>
                                    <input
                                       type="text"
                                       className="w-full bg-[#05050A] border-2 border-primary/20 rounded-[1.5rem] px-6 py-4 text-white font-bold placeholder:text-gray-800 focus:border-primary/50 focus:ring-0 outline-none transition-all"
                                       placeholder={t('checkout_editor.cta_placeholder')}
                                       value={config.upsell?.button_text || ''}
                                       onChange={e => setConfig({ ...config, upsell: { ...config.upsell!, button_text: e.target.value } })}
                                    />
                                 </div>
                              </div>

                              <div className="grid grid-cols-1 gap-8">
                                 <div className="p-8 bg-black/40 border border-primary/20 rounded-[2rem] space-y-6">
                                    <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] flex items-center gap-2 italic">
                                       <ImageIcon className="w-4 h-4 text-primary" /> {t('checkout_editor.visual_copy')}
                                    </h3>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                       <div className="space-y-3">
                                          <div className="flex items-center justify-between px-1">
                                             <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{t('checkout_editor.headline_label')}</label>
                                             <button onClick={() => setConfig({ ...config, upsell: { ...config.upsell!, show_title: !config.upsell?.show_title } })} className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${config.upsell?.show_title ? 'bg-primary' : 'bg-gray-800'}`}>
                                                <div className={`w-3 h-3 bg-white rounded-full transition-transform ${config.upsell?.show_title ? 'translate-x-4' : 'translate-x-0'}`} />
                                             </button>
                                          </div>
                                          <input
                                             type="text"
                                             className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3 text-white text-sm font-bold placeholder:text-gray-800 focus:border-primary/30 outline-none transition-all"
                                             placeholder={t('checkout_editor.headline_placeholder')}
                                             value={config.upsell?.title || ''}
                                             disabled={!config.upsell?.show_title}
                                             onChange={e => setConfig({ ...config, upsell: { ...config.upsell!, title: e.target.value } })}
                                          />
                                       </div>
                                       <div className="space-y-3">
                                          <div className="flex items-center justify-between px-1">
                                             <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{t('checkout_editor.subtitle_label')}</label>
                                             <button onClick={() => setConfig({ ...config, upsell: { ...config.upsell!, show_subtitle: !config.upsell?.show_subtitle } })} className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${config.upsell?.show_subtitle ? 'bg-primary' : 'bg-gray-800'}`}>
                                                <div className={`w-3 h-3 bg-white rounded-full transition-transform ${config.upsell?.show_subtitle ? 'translate-x-4' : 'translate-x-0'}`} />
                                             </button>
                                          </div>
                                          <input
                                             type="text"
                                             className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3 text-white text-sm font-bold placeholder:text-gray-800 focus:border-primary/30 outline-none transition-all"
                                             placeholder={t('checkout_editor.subtitle_placeholder')}
                                             value={config.upsell?.subtitle || ''}
                                             disabled={!config.upsell?.show_subtitle}
                                             onChange={e => setConfig({ ...config, upsell: { ...config.upsell!, subtitle: e.target.value } })}
                                          />
                                       </div>
                                    </div>

                                    <div className="space-y-3">
                                       <div className="flex items-center justify-between px-1">
                                          <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{t('checkout_editor.media_url_label')}</label>
                                          <div className="flex bg-[#05050A] rounded-lg p-0.5 border border-white/5">
                                             <button onClick={() => setConfig({ ...config, upsell: { ...config.upsell!, media_type: 'video' } })} className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest rounded-md transition-all ${config.upsell?.media_type === 'video' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-600'}`}>{t('checkout_editor.video')}</button>
                                             <button onClick={() => setConfig({ ...config, upsell: { ...config.upsell!, media_type: 'image' } })} className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest rounded-md transition-all ${config.upsell?.media_type === 'image' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-600'}`}>{t('checkout_editor.image')}</button>
                                          </div>
                                       </div>
                                       <input
                                          type="text"
                                          className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3 text-white text-sm font-bold placeholder:text-gray-800 focus:border-primary/30 outline-none transition-all"
                                          placeholder="https://..."
                                          value={config.upsell?.media_url || ''}
                                          onChange={e => setConfig({ ...config, upsell: { ...config.upsell!, media_url: e.target.value } })}
                                       />
                                    </div>

                                    <div className="space-y-4">
                                       <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-1">
                                          <div>
                                             <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                                                {t('checkout_editor.upsell_benefits_label', 'Benefícios com check')}
                                             </label>
                                             <p className="mt-2 text-[11px] text-gray-500 leading-relaxed">
                                                {t('checkout_editor.upsell_benefits_hint', 'Os checks verdes continuam fixos no layout. Aqui você edita apenas os textos exibidos na oferta.')}
                                             </p>
                                          </div>
                                          <button
                                             type="button"
                                             onClick={() => updateUpsellBenefits([...(config.upsell?.benefits || []), ''])}
                                             className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-primary transition-all hover:border-primary/40 hover:bg-primary/15"
                                          >
                                             <Plus className="w-3.5 h-3.5" />
                                             {t('checkout_editor.upsell_add_benefit', 'Adicionar benefício')}
                                          </button>
                                       </div>

                                       <div className="space-y-3">
                                          {(config.upsell?.benefits || []).map((benefit, index) => (
                                             <div key={`upsell-benefit-${index}`} className="flex items-center gap-3">
                                                <div className="w-10 h-10 shrink-0 rounded-xl border border-emerald-500/20 bg-emerald-500/10 flex items-center justify-center">
                                                   <Check className="w-4 h-4 text-emerald-400" />
                                                </div>
                                                <input
                                                   type="text"
                                                   className="flex-1 bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3 text-white text-sm font-semibold placeholder:text-gray-700 focus:border-primary/30 outline-none transition-all"
                                                   placeholder={DEFAULT_UPSELL_BENEFITS[index] || t('checkout_editor.upsell_benefit_placeholder', 'Digite o benefício exibido no upsell')}
                                                   value={benefit}
                                                   onChange={e => {
                                                      const nextBenefits = [...(config.upsell?.benefits || [])];
                                                      nextBenefits[index] = e.target.value;
                                                      updateUpsellBenefits(nextBenefits);
                                                   }}
                                                />
                                                {index >= 2 ? (
                                                   <button
                                                      type="button"
                                                      onClick={() => updateUpsellBenefits((config.upsell?.benefits || []).filter((_, itemIndex) => itemIndex !== index))}
                                                      className="w-10 h-10 shrink-0 rounded-xl border border-white/10 bg-white/[0.03] text-gray-500 flex items-center justify-center transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
                                                      aria-label={t('checkout_editor.remove_benefit', 'Remover benefício')}
                                                   >
                                                      <X className="w-4 h-4" />
                                                   </button>
                                                ) : null}
                                             </div>
                                          ))}
                                       </div>
                                    </div>
                                 </div>
                              </div>
                           </div>
                        )}
                     </div>
                  </section>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                     <section className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-500 lg:col-span-3 space-y-8">
                        <div className="flex items-center gap-4 ml-2">
                           <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-lg shadow-primary/10">
                              <ShoppingBag className="w-5 h-5" />
                           </div>
                           <h2 className="text-sm font-portal-display text-white uppercase tracking-tight">{t('checkout_editor.data_grid')}</h2>
                        </div>
                        
                        <div className="p-8 bg-[#0A0A15]/80 border border-white/5 rounded-[2.5rem] shadow-2xl space-y-6">
                           {[
                              { id: 'name', label: t('checkout_editor.field_name'), icon: User },
                              { id: 'email', label: t('checkout_editor.field_email'), icon: Mail },
                              { id: 'phone', label: t('checkout_editor.field_phone'), icon: Phone },
                              { id: 'cpf', label: t('checkout_editor.field_cpf'), icon: Fingerprint }
                           ].map(field => (
                              <div key={field.id} className="group/field flex items-center justify-between p-3 transition-colors">
                                 <div className="flex items-center gap-3">
                                    <field.icon className="w-3.5 h-3.5 text-gray-700 group-hover/field:text-primary transition-colors" />
                                    <span className="text-[10px] text-gray-600 font-bold uppercase tracking-[0.2em] italic group-hover/field:text-gray-400 transition-colors">{field.label}</span>
                                 </div>
                                 <button
                                    onClick={() => setConfig({
                                       ...config,
                                       fields: { ...config.fields, [field.id]: !config.fields[field.id as keyof typeof config.fields] }
                                    })}
                                    className={`relative inline-flex h-5 w-10 items-center rounded-full transition-all duration-500 ${config.fields[field.id as keyof typeof config.fields] ? 'bg-emerald-500 shadow-lg shadow-emerald-500/20' : 'bg-white/5 border border-white/5'}`}
                                 >
                                    <div className={`h-3 w-3 rounded-full bg-white transition-transform duration-500 ${config.fields[field.id as keyof typeof config.fields] ? 'translate-x-6' : 'translate-x-1'}`} />
                                 </button>
                              </div>
                           ))}
                        </div>
                     </section>

                     {/* <section className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-[600ms] lg:col-span-2 space-y-8">
                        <div className="flex items-center gap-4 ml-2">
                           <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-500 shadow-lg shadow-purple-500/10">
                              <CreditCard className="w-5 h-5" />
                           </div>
                           <h2 className="text-sm font-portal-display text-white uppercase tracking-tight">{t('checkout_editor.payment_nodes')}</h2>
                        </div>

                        <div className="p-8 bg-[#0A0A15]/80 border border-white/5 rounded-[2.5rem] shadow-2xl">
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {[
                                 { id: 'pix', label: t('checkout_editor.pay_pix'), icon: Zap },
                                 { id: 'credit_card', label: t('checkout_editor.pay_credit_card'), icon: CreditCard },
                                 { id: 'boleto', label: t('checkout_editor.pay_boleto'), icon: FileText },
                                 { id: 'apple_pay', label: t('checkout_editor.pay_apple'), icon: Smartphone },
                                 { id: 'google_pay', label: t('checkout_editor.pay_google'), icon: Smartphone }
                              ].map(method => {
                                 const compatibleGateways = getMethodCompatibleGateways(method.id as PaymentMethodType);
                                 const isDisabled = compatibleGateways.length === 0;
                                 
                                 return (
                                    <button
                                       key={method.id}
                                       disabled={isDisabled}
                                       onClick={() => updatePaymentMethodToggle(
                                          method.id as PaymentMethodType,
                                          !config.payment_methods[method.id as keyof typeof config.payment_methods]
                                       )}
                                       className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all duration-500 ${isDisabled ? 'opacity-20 grayscale pointer-events-none' : ''} ${config.payment_methods[method.id as keyof typeof config.payment_methods] ? 'bg-purple-500/10 border-purple-500/40 shadow-lg shadow-purple-500/5' : 'bg-white/[0.01] border-white/5 hover:border-white/10'}`}
                                    >
                                       <div className="flex items-center gap-4">
                                          <method.icon className={`w-4 h-4 transition-colors ${config.payment_methods[method.id as keyof typeof config.payment_methods] ? 'text-primary' : 'text-gray-700'}`} />
                                          <span className="text-[10px] text-white font-black uppercase tracking-widest italic">{method.label}</span>
                                       </div>
                                       <div className={`w-2 h-2 rounded-full transition-all duration-500 ${config.payment_methods[method.id as keyof typeof config.payment_methods] ? 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]' : 'bg-gray-800'}`} />
                                    </button>
                                 );
                              })}
                           </div>
                           {isAsaasSelected && (
                              <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200">
                                 {t('checkout_editor.asaas_pix_only_hint', 'Asaas permanece temporariamente apenas com Pix no Super Checkout. Para oferecer cartao neste mesmo checkout, configure Stripe ou Mercado Pago na rota do cartao abaixo.')}
                              </div>
                           )}
                           <div className="mt-6 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-5 py-4 text-[11px] text-cyan-100">
                              <p className="font-black uppercase tracking-[0.18em] text-cyan-200 mb-2">
                                 {t('checkout_editor.method_routing_title', 'Roteamento por método')}
                              </p>
                              <p className="text-cyan-50/90 leading-relaxed">
                                 {t(
                                    'checkout_editor.method_routing_notice',
                                    'Use esta etapa para combinar gateways no mesmo checkout. Exemplo: Pix = Asaas, Cartao = Stripe e Pix backup = Mercado Pago.'
                                 )}
                              </p>
                           </div>
                           <div className="mt-6 space-y-4">
                              {([
                                 { id: 'pix', label: t('checkout_editor.pay_pix'), icon: Zap },
                                 { id: 'credit_card', label: t('checkout_editor.pay_credit_card'), icon: CreditCard },
                                 { id: 'boleto', label: t('checkout_editor.pay_boleto'), icon: FileText },
                                 { id: 'apple_pay', label: t('checkout_editor.pay_apple'), icon: Smartphone },
                                 { id: 'google_pay', label: t('checkout_editor.pay_google'), icon: Smartphone }
                              ] as Array<{ id: PaymentMethodType; label: string; icon: typeof CreditCard }>).map((method) => {
                                 const route = effectivePaymentRouting[method.id];
                                 const methodEnabled = Boolean(config.payment_methods[method.id]);
                                 const routeIsExplicit = Boolean(config.payment_routing?.[method.id]);
                                 const compatibleGateways = getMethodCompatibleGateways(method.id);
                                 const primaryGatewayId = route?.primary_gateway_id || '';
                                 const backupGatewayIdForMethod = route?.backup_gateway_id || '';

                                 return (
                                    <div
                                       key={`route-${method.id}`}
                                       className={`rounded-2xl border p-5 transition-all ${methodEnabled ? 'border-white/10 bg-white/[0.02]' : 'border-white/5 bg-white/[0.01] opacity-60'}`}
                                    >
                                       <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                          <div className="flex items-center gap-3">
                                             <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${methodEnabled ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20' : 'bg-white/[0.02] text-gray-600 border border-white/5'}`}>
                                                <method.icon className="w-4 h-4" />
                                             </div>
                                             <div>
                                                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white">{method.label}</p>
                                                <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500">
                                                   {routeIsExplicit
                                                      ? t('checkout_editor.method_route_explicit', 'Rota explicita por metodo')
                                                      : t('checkout_editor.method_route_derived', 'Derivado do gateway legado atual')}
                                                </p>
                                             </div>
                                          </div>
                                          <div className="flex items-center gap-2 flex-wrap">
                                             {compatibleGateways.length > 0 ? (
                                                compatibleGateways.map((gateway) => (
                                                   <span
                                                      key={`${method.id}-${gateway.id}`}
                                                      className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-gray-300"
                                                   >
                                                      {gateway.name.replace('_', ' ')}
                                                   </span>
                                                ))
                                             ) : (
                                                <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-rose-200">
                                                   {t('checkout_editor.no_compatible_gateway', 'Nenhum gateway compativel ativo')}
                                                </span>
                                             )}
                                          </div>
                                       </div>

                                       <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                          <div>
                                             <label className="block text-[9px] font-black text-gray-600 uppercase tracking-[0.18em] mb-2">
                                                {t('checkout_editor.primary_gateway', 'Gateway principal')}
                                             </label>
                                             <select
                                                disabled={!methodEnabled || compatibleGateways.length === 0}
                                                value={primaryGatewayId}
                                                onChange={(e) => updatePaymentMethodRoute(method.id, 'primary_gateway_id', e.target.value)}
                                                className="w-full bg-[#05050A] border-2 border-white/5 rounded-xl px-4 py-3 text-white text-xs font-bold focus:border-cyan-500/40 outline-none disabled:opacity-50"
                                             >
                                                <option value="">{t('checkout_editor.gateway_route_unassigned', 'Sem rota definida')}</option>
                                                {compatibleGateways.map((gateway) => (
                                                   <option key={`${method.id}-primary-${gateway.id}`} value={gateway.id}>
                                                      {gateway.name.replace('_', ' ')}
                                                   </option>
                                                ))}
                                             </select>
                                          </div>
                                          <div>
                                             <label className="block text-[9px] font-black text-gray-600 uppercase tracking-[0.18em] mb-2">
                                                {t('checkout_editor.backup_gateway', 'Gateway backup')}
                                             </label>
                                             <select
                                                disabled={!methodEnabled || compatibleGateways.length === 0}
                                                value={backupGatewayIdForMethod}
                                                onChange={(e) => updatePaymentMethodRoute(method.id, 'backup_gateway_id', e.target.value)}
                                                className="w-full bg-[#05050A] border-2 border-white/5 rounded-xl px-4 py-3 text-white text-xs font-bold focus:border-cyan-500/40 outline-none disabled:opacity-50"
                                             >
                                                <option value="">{t('checkout_editor.backup_inactive', 'Backup inativo')}</option>
                                                {compatibleGateways
                                                   .filter((gateway) => gateway.id !== primaryGatewayId)
                                                   .map((gateway) => (
                                                      <option key={`${method.id}-backup-${gateway.id}`} value={gateway.id}>
                                                         {gateway.name.replace('_', ' ')}
                                                      </option>
                                                   ))}
                                             </select>
                                          </div>
                                       </div>
                                    </div>
                                 );
                              })}
                           </div>
                        </div>
                     </section> */}
                  </div>

                  <section className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-700">
                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                        <div className="space-y-8">
                           <div className="flex items-center gap-4 ml-2">
                              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shadow-lg shadow-rose-500/10">
                                 <Clock className="w-5 h-5" />
                              </div>
                              <h2 className="text-sm font-portal-display text-white uppercase tracking-tight">{t('checkout_editor.scarcity_design')}</h2>
                           </div>

                           <div className="p-8 bg-[#0A0A15]/80 border border-white/5 rounded-[2.5rem] shadow-2xl space-y-8">
                              <div>
                                 <label className="block text-[10px] font-black text-gray-700 uppercase tracking-[0.3em] mb-4 italic">{t('checkout_editor.time_protocol')}</label>
                                 <div className="flex items-center justify-between p-6 bg-white/[0.02] border border-white/5 rounded-2xl">
                                    <div className="flex items-center gap-4">
                                       <div className={`w-3 h-3 rounded-full ${config.timer.active ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]' : 'bg-gray-800'}`} />
                                       <span className="text-xs text-white font-bold uppercase tracking-tight italic">{t('checkout_editor.countdown_timer')}</span>
                                    </div>
                                    <button
                                       onClick={() => setConfig({ ...config, timer: { ...config.timer, active: !config.timer.active } })}
                                       className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-500 ${config.timer.active ? 'bg-rose-500' : 'bg-gray-800'}`}
                                    >
                                       <div className={`h-4 w-4 rounded-full bg-white transition-transform duration-500 ${config.timer.active ? 'translate-x-[22px]' : 'translate-x-1'}`} />
                                    </button>
                                 </div>

                                 {config.timer.active && (
                                    <div className="mt-6 grid grid-cols-2 gap-6 p-6 bg-rose-500/5 border border-rose-500/10 rounded-2xl animate-in zoom-in-95 duration-500">
                                       <div>
                                          <label className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em] mb-2 block">{t('checkout_editor.timer_minutes')}</label>
                                          <input type="number" className="w-full bg-[#05050A] border-2 border-white/5 rounded-xl px-4 py-2 text-white font-bold focus:border-rose-500/50 outline-none" value={config.timer.minutes} onChange={e => setConfig({ ...config, timer: { ...config.timer, minutes: parseInt(e.target.value) } })} />
                                       </div>
                                       <div>
                                          <label className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em] mb-2 block">{t('checkout_editor.alert_color')}</label>
                                          <div className="flex items-center gap-3">
                                             <input type="color" className="h-10 w-10 rounded cursor-pointer border-none bg-transparent" value={config.timer.bg_color} onChange={e => setConfig({ ...config, timer: { ...config.timer, bg_color: e.target.value } })} />
                                             <span className="text-xs font-mono text-gray-500 font-bold">{config.timer.bg_color.toUpperCase()}</span>
                                          </div>
                                       </div>
                                    </div>
                                 )}
                              </div>

                              <div className="h-px bg-white/5" />

                              <div>
                                 <label className="block text-[10px] font-black text-gray-700 uppercase tracking-[0.3em] mb-4 italic">{t('checkout_editor.banner_label')}</label>
                                 <div className="flex gap-4">
                                    <input
                                       type="text"
                                       className="w-full bg-white/[0.02] border-2 border-white/5 rounded-xl px-5 py-3 text-white text-xs font-bold focus:border-primary/50 outline-none"
                                       placeholder={t('checkout_editor.banner_placeholder')}
                                       value={config.header_image || ''}
                                       onChange={e => { clearStagedBanner(); setConfig({ ...config, header_image: e.target.value }); }}
                                    />
                                    <Button
                                       variant="secondary"
                                       onClick={() => fileInputRef.current?.click()}
                                       className="bg-white/5 border border-white/10 hover:bg-white/10 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap h-12"
                                       disabled={isUploadingBanner}
                                    >
                                       {isUploadingBanner ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                    </Button>
                                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                                 </div>
                                 {config.header_image && (
                                    <div className="mt-4 relative group rounded-[1.5rem] overflow-hidden border border-white/10 aspect-video shadow-2xl">
                                       <img src={config.header_image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt={t('checkout_editor.banner_preview_alt')} />
                                       <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                          <button onClick={() => { clearStagedBanner(); setConfig({ ...config, header_image: '' }); }} className="bg-rose-500 p-3 rounded-full text-white shadow-xl hover:scale-110 active:scale-95 transition-all">
                                             <X className="w-5 h-5" />
                                          </button>
                                       </div>
                                    </div>
                                 )}
                              </div>
                           </div>
                        </div>

                        <div className="space-y-8">
                           <div className="flex items-center gap-4 ml-2">
                              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 shadow-lg shadow-blue-500/10">
                                 <BarChart className="w-5 h-5" />
                              </div>
                              <h2 className="text-sm font-portal-display text-white uppercase tracking-tight">{t('checkout_editor.monitoring_title')}</h2>
                           </div>

                           <div className="p-8 bg-[#0A0A15]/80 border border-white/5 rounded-[2.5rem] shadow-2xl space-y-8">
                              <div className="flex items-center justify-between p-6 bg-blue-500/5 border border-blue-500/10 rounded-[1.5rem]">
                                 <div className="flex items-center gap-4">
                                    <div className={`w-3 h-3 rounded-full ${config.pixels?.active ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'bg-gray-800'}`} />
                                    <span className="text-xs text-white font-bold uppercase tracking-tight italic">{t('checkout_editor.pixel_network')}</span>
                                 </div>
                                 <button
                                    onClick={() => setConfig({ ...config, pixels: { ...config.pixels, active: !config.pixels?.active } })}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-500 ${config.pixels?.active ? 'bg-blue-500' : 'bg-gray-800'}`}
                                 >
                                    <div className={`h-4 w-4 rounded-full bg-white transition-transform duration-500 ${config.pixels?.active ? 'translate-x-[22px]' : 'translate-x-1'}`} />
                                 </button>
                              </div>

                              {config.pixels?.active && (
                                 <div className="space-y-6 animate-in fade-in duration-700">
                                    <div className="p-6 bg-[#05050A] border-2 border-blue-500/20 rounded-[1.5rem] relative overflow-hidden">
                                       <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 blur-2xl" />
                                       <label className="block text-[9px] font-black text-blue-500/60 uppercase tracking-widest mb-3 italic">{t('checkout_editor.gtm_label')}</label>
                                       <input
                                          type="text"
                                          className="w-full bg-white/[0.01] border-2 border-blue-500/10 rounded-xl px-5 py-3 text-white font-bold text-xs focus:border-blue-500/50 outline-none transition-all"
                                          placeholder="Ex: GTM-T4CT1C4L"
                                          value={config.pixels?.gtm_id || ''}
                                          onChange={e => setConfig({ ...config, pixels: { ...config.pixels!, gtm_id: e.target.value } })}
                                       />
                                    </div>

                                    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-6 ${config.pixels?.gtm_id ? 'opacity-20 grayscale pointer-events-none' : ''}`}>
                                       <div className="space-y-2">
                                          <label className="text-[9px] font-black text-gray-700 uppercase tracking-widest ml-1 italic">Meta Pixel ID</label>
                                          <input type="text" className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3 text-white text-[10px] font-bold outline-none focus:border-blue-500/30 transition-all" placeholder="ID Facebook" value={config.pixels?.facebook_pixel_id || ''} onChange={e => setConfig({ ...config, pixels: { ...config.pixels!, facebook_pixel_id: e.target.value } })} />
                                       </div>
                                       <div className="space-y-2">
                                          <label className="text-[9px] font-black text-gray-700 uppercase tracking-widest ml-1 italic">TikTok Core ID</label>
                                          <input type="text" className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3 text-white text-[10px] font-bold outline-none focus:border-blue-500/30 transition-all" placeholder="ID TikTok" value={config.pixels?.tiktok_pixel_id || ''} onChange={e => setConfig({ ...config, pixels: { ...config.pixels!, tiktok_pixel_id: e.target.value } })} />
                                       </div>
                                    </div>
                                 </div>
                              )}
                           </div>
                        </div>
                     </div>
                  </section>

                  <section className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-[800ms]">
                     <div className="flex items-center gap-4 mb-8 ml-2">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-lg shadow-emerald-500/10">
                           <Check className="w-5 h-5" />
                        </div>
                        <h2 className="text-sm font-portal-display text-white uppercase tracking-tight">{t('checkout_editor.endpoint_title')}</h2>
                     </div>

                     <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                       <div className="lg:col-span-1 p-8 bg-[#0A0A15]/80 border border-white/5 rounded-[2.5rem] shadow-2xl flex flex-col justify-center">
                           <div className="flex items-center justify-between px-2">
                              <div>
                                 <p className="text-[10px] text-white font-black uppercase tracking-widest italic mb-1">{t('checkout_editor.global_status')}</p>
                                 <p className="text-[9px] text-gray-700 font-bold uppercase tracking-wider">{active ? t('checkout_editor.pipeline_on') : t('checkout_editor.protocol_offline')}</p>
                              </div>
                              <button
                                 onClick={() => setActive(!active)}
                                 className={`relative inline-flex h-8 w-16 items-center rounded-full transition-all duration-700 ${active ? 'bg-emerald-500 shadow-xl shadow-emerald-500/20' : 'bg-gray-800'}`}
                              >
                                 <div className={`h-6 w-6 rounded-full bg-white shadow-lg transition-transform duration-500 ${active ? 'translate-x-[32px]' : 'translate-x-1'}`} />
                              </button>
                           </div>
                       </div>
                       
                       <div className="lg:col-span-2 p-10 bg-[#0A0A15]/80 border border-white/5 rounded-[2.5rem] shadow-2xl space-y-8">
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                              <div>
                                 <label className="block text-[10px] font-black text-gray-700 uppercase tracking-[0.3em] mb-4 italic">{t('checkout_editor.thank_you_redirect')}</label>
                                 <input
                                    type="text"
                                    className="w-full bg-white/[0.02] border-2 border-white/5 rounded-2xl px-6 py-4 text-white font-bold text-xs placeholder:text-gray-900 focus:border-primary/50 outline-none transition-all"
                                    placeholder={t('checkout_editor.thank_you_url_placeholder')}
                                    value={thankYouButtonUrl}
                                    onChange={e => setThankYouButtonUrl(e.target.value)}
                                 />
                              </div>
                              <div>
                                 <label className="block text-[10px] font-black text-gray-700 uppercase tracking-[0.3em] mb-4 italic">{t('checkout_editor.thank_you_button_label')}</label>
                                 <input
                                    type="text"
                                    className="w-full bg-white/[0.02] border-2 border-white/5 rounded-2xl px-6 py-4 text-white font-bold text-xs placeholder:text-gray-900 focus:border-primary/50 outline-none transition-all"
                                    placeholder={t('checkout_editor.thank_you_button_placeholder')}
                                    value={thankYouButtonText}
                                    onChange={e => setThankYouButtonText(e.target.value)}
                                 />
                              </div>
                           </div>
                       </div>
                     </div>
                  </section>

                  <div className="flex flex-col sm:flex-row items-center justify-end gap-6 pt-12 border-t border-white/5">
                     <Button 
                        variant="ghost" 
                        onClick={() => navigate('/admin/checkouts')}
                        className="text-gray-700 hover:text-white uppercase font-black tracking-widest text-[10px] transition-colors"
                     >
                        {t('checkout_editor.cancel_structure')}
                     </Button>
                     <Button 
                        onClick={handleSave} 
                        className="w-full sm:w-auto px-12 h-16 rounded-[1.5rem] bg-primary hover:bg-rose-600 text-white font-black uppercase italic tracking-tighter shadow-2xl shadow-primary/40 flex items-center justify-center gap-4 active:scale-95 transition-all duration-500"
                     >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        <div className="flex flex-col items-start leading-none">
                           <span className="text-sm">{isNew ? t('checkout_editor.save_checkout') : t('checkout_editor.save_changes')}</span>
                           <span className="text-[8px] opacity-60 font-medium uppercase tracking-[0.2em]">{t('checkout_editor.deploy_live')}</span>
                        </div>
                     </Button>
                  </div>

               </div>
            </>
         )}
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

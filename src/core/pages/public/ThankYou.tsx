import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { CheckCircle, Package, Mail, ArrowRight, ExternalLink, LockKeyhole } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Loading } from '../../components/ui/Loading';
import { supabase } from '../../services/supabase';
import { storage } from '../../services/storageService';
import { Order } from '../../types';
import { TrackingProvider, useTracking } from '../../context/TrackingContext';
import { useTranslation } from 'react-i18next';
import { getApiUrl } from '../../utils/apiUtils';
import { getRuntimeMode } from '../../config/runtimeMode';
import { demoDataService } from '../../services/demoDataService';
import {
  captureCheckoutTrackingAttribution,
  type CheckoutTrackingAttribution,
} from '../../utils/trackingAttribution';

interface OrderDeliverable {
  id: string;
  title: string;
  delivery_type: 'external_link' | 'member_area' | 'file_download' | 'none';
  status: 'available' | 'not_configured';
  url: string | null;
  visual_url?: string | null;
  label: string;
  instructions?: string | null;
}

interface SignedOrderSnapshot {
  status: string;
  authorized: boolean;
  order: Order | null;
  deliverables: OrderDeliverable[];
}

function mergeDeliverables(...groups: Array<OrderDeliverable[] | null | undefined>) {
  const deduped = new Map<string, OrderDeliverable>();

  for (const group of groups) {
    for (const deliverable of group || []) {
      const key = deliverable.id || `${deliverable.title}:${deliverable.url || deliverable.visual_url || ''}`;
      const existing = deduped.get(key);

      if (!existing || (existing.status !== 'available' && deliverable.status === 'available')) {
        deduped.set(key, deliverable);
      }
    }
  }

  return Array.from(deduped.values());
}

function normalizeStoredDeliverables(value: unknown): OrderDeliverable[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item) => item && typeof item === 'object')
    .map((item: any): OrderDeliverable => {
      const deliveryType: OrderDeliverable['delivery_type'] =
        item.delivery_type === 'member_area' || item.delivery_type === 'external_link' || item.delivery_type === 'file_download'
          ? item.delivery_type
          : 'none';
      const status: OrderDeliverable['status'] = item.status === 'available' ? 'available' : 'not_configured';

      return {
        id: String(item.id || ''),
        title: String(item.title || 'Produto'),
        delivery_type: deliveryType,
        status,
        url: item.url || item.visual_url || null,
        visual_url: item.visual_url || null,
        label: String(item.label || 'Acessar'),
        instructions: item.instructions || null,
      };
    })
    .filter((item) => Boolean(item.id));
}

function isPaidStatus(status: unknown) {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'paid' || normalized === 'approved';
}

function normalizeSignedOrder(value: any): Order | null {
  if (!value || typeof value !== 'object') return null;

  const metadata = value.metadata && typeof value.metadata === 'object' ? value.metadata : {};
  return {
    id: String(value.id || ''),
    offer_id: String(value.offer_id || ''),
    checkout_id: String(value.checkout_id || ''),
    customer_name: String(value.customer_name || ''),
    customer_email: String(value.customer_email || ''),
    amount: Number(value.amount ?? value.total ?? 0) || 0,
    status: String(value.status || 'pending') as Order['status'],
    payment_method: String(value.payment_method || 'credit_card') as Order['payment_method'],
    items: Array.isArray(value.items) ? value.items : [],
    metadata,
    created_at: String(value.created_at || ''),
    customer_user_id: value.customer_user_id || undefined,
  };
}

function resolveOriginalOrderId(order: Order | null) {
  const metadata = order?.metadata && typeof order.metadata === 'object' ? order.metadata : {};
  const direct = typeof metadata.original_order_id === 'string' ? metadata.original_order_id.trim() : '';
  if (direct) return direct;

  const postPurchase = metadata.post_purchase && typeof metadata.post_purchase === 'object' ? metadata.post_purchase : {};
  return typeof postPurchase.original_order_id === 'string' ? postPurchase.original_order_id.trim() : '';
}

const PurchaseTracker: React.FC<{ order: Order; attribution?: CheckoutTrackingAttribution | null }> = ({ order, attribution }) => {
  const { trackPurchase, isInitialized } = useTracking();
  useEffect(() => {
    if (isInitialized && order && order.status === 'paid') {
      trackPurchase({
        id: order.id,
        amount: order.total || order.amount || 0,
        currency: order.metadata?.payment_context?.currency || 'BRL',
        items: Array.isArray(order.items)
          ? order.items.map((item: any) => ({
              id: item?.product_id || item?.id,
              name: item?.name,
              price: item?.price,
              quantity: item?.quantity,
              type: item?.type,
            }))
          : [],
        attribution,
      });
    }
  }, [attribution, order, isInitialized, trackPurchase]);
  return null;
};

export const ThankYou = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('public');
  const runtimeMode = getRuntimeMode();
  const isDemoRuntime = runtimeMode === 'demo';
  const [order, setOrder] = useState<Order | null>(null);
  const [originalOrder, setOriginalOrder] = useState<Order | null>(null);
  const [checkout, setCheckout] = useState<any>(null);
  const [deliverables, setDeliverables] = useState<OrderDeliverable[]>([]);
  const [businessName, setBusinessName] = useState('Super Checkout');
  const [loading, setLoading] = useState(true);
  const [trackingAttribution, setTrackingAttribution] = useState<CheckoutTrackingAttribution | null>(() => (
    typeof window !== 'undefined' ? captureCheckoutTrackingAttribution() : null
  ));

  useEffect(() => {
    setTrackingAttribution(captureCheckoutTrackingAttribution());

    const fetchSignedOrderSnapshot = async (targetOrderId: string, signature: string): Promise<SignedOrderSnapshot | null> => {
      if (!targetOrderId || !signature) return null;

      if (isDemoRuntime) {
        return await demoDataService.getOrderSnapshot(targetOrderId);
      }

      try {
        const response = await fetch(getApiUrl(`/api/system?action=order-deliverables&orderId=${encodeURIComponent(targetOrderId)}&sig=${encodeURIComponent(signature)}&t=${Date.now()}`));
        if (!response.ok) return null;

        const payload = await response.json().catch(() => ({}));
        return {
          status: String(payload?.status || 'pending'),
          authorized: payload?.authorized !== false,
          order: normalizeSignedOrder(payload?.order),
          deliverables: Array.isArray(payload?.deliverables) ? payload.deliverables : [],
        };
      } catch (snapshotError) {
        console.warn('[ThankYou] Failed to load signed order snapshot:', snapshotError);
        return null;
      }
    };

    const waitForOrderSnapshot = async (targetOrderId: string, signature: string) => {
      if (!targetOrderId || !signature) return null;

      let latestSnapshot: SignedOrderSnapshot | null = null;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const snapshot = await fetchSignedOrderSnapshot(targetOrderId, signature);
        if (snapshot) {
          latestSnapshot = snapshot;
          if (isPaidStatus(snapshot.status)) {
            return snapshot;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 1200));
      }

      return latestSnapshot;
    };

    const fetchPublicOrderById = async (targetOrderId: string) => {
      if (isDemoRuntime) {
        return await demoDataService.getOrderById(targetOrderId);
      }

      const { data, error } = await supabase
        .from('orders')
        .select('id, offer_id, checkout_id, customer_name, customer_email, status, payment_method, items, metadata, created_at, total, customer_user_id')
        .eq('id', targetOrderId)
        .maybeSingle();

        if (error) throw error;
      return data as Order | null;
    };

    const fetchOrder = async () => {
      if (!orderId) return;

      try {
        setDeliverables([]);
        setOriginalOrder(null);
        const sig = new URLSearchParams(location.search).get('sig') || '';
        const originalSig = new URLSearchParams(location.search).get('origSig') || '';
        let currentSnapshot = sig ? await waitForOrderSnapshot(orderId, sig) : null;
        let orderData = currentSnapshot?.order || await fetchPublicOrderById(orderId);

        if (!orderData) throw new Error('Order not found');
        setOrder(orderData);

        const storedDeliverables = normalizeStoredDeliverables(orderData?.metadata?.order_deliverables);
        const originalOrderId = resolveOriginalOrderId(orderData);
        let currentDeliverables = currentSnapshot?.deliverables?.length
          ? currentSnapshot.deliverables
          : storedDeliverables;
        let originalOrderData: Order | null = null;
        let originalStoredDeliverables: OrderDeliverable[] = [];

        if (originalOrderId && originalOrderId !== orderData.id) {
          const originalSnapshot = originalSig ? await waitForOrderSnapshot(originalOrderId, originalSig) : null;
          originalOrderData = originalSnapshot?.order || await fetchPublicOrderById(originalOrderId);

          if (originalOrderData) {
            originalStoredDeliverables = originalSnapshot?.deliverables?.length
              ? originalSnapshot.deliverables
              : normalizeStoredDeliverables(originalOrderData?.metadata?.order_deliverables);
            setOriginalOrder(originalOrderData);
          }
        }

        setDeliverables(mergeDeliverables(originalStoredDeliverables, currentDeliverables));

        // Fetch checkout
        if (orderData?.checkout_id) {
          if (isDemoRuntime) {
            const checkoutData = await storage.getPublicCheckout(orderData.checkout_id);
            if (checkoutData) {
              setCheckout(checkoutData);
            }
          } else {
            const { data: checkoutData, error: checkoutError } = await supabase
              .from('checkouts')
              .select('thank_you_button_url, thank_you_button_text, config')
              .eq('id', orderData.checkout_id)
              .single();

            if (!checkoutError && checkoutData) {
              setCheckout(checkoutData);
            }
          }

          try {
            const settings = await storage.getBusinessSettingsByCheckoutId(orderData.checkout_id);
            if (settings?.business_name) {
              setBusinessName(settings.business_name);
            } else if (typeof window !== 'undefined') {
              const hostnameSettings = await storage.getBusinessSettingsByHostname(window.location.hostname);
              if (hostnameSettings?.business_name) {
                setBusinessName(hostnameSettings.business_name);
              }
            }
          } catch (settingsError) {
            console.warn('[ThankYou] Failed to load business settings:', settingsError);
          }
        }
      } catch (error) {
        console.error('Error fetching order:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId, location.search]);

  if (loading) {
    return <Loading label={t('thank_you.loading', 'Carregando pedido')} />;
  }

  // Ensure config exists
  const config = checkout?.config || {};
  const displayedOrders = [originalOrder, order].filter((entry): entry is Order => Boolean(entry));
  const effectiveOrders = displayedOrders.length > 0 ? displayedOrders : (order ? [order] : []);
  const combinedItems = effectiveOrders.flatMap((entry) => Array.isArray(entry.items) ? entry.items : []);
  const paidTotal = effectiveOrders.reduce((sum, entry) => sum + Number(entry.total || entry.amount || 0), 0);
  const orderTimestamp = originalOrder?.created_at || order?.created_at || null;
  const actionableDeliverables = deliverables.filter((deliverable) => deliverable.status === 'available' && deliverable.url);
  const missingDeliverables = deliverables.filter((deliverable) => deliverable.status !== 'available' || !deliverable.url);
  const primaryMemberDeliverable = actionableDeliverables.find((deliverable) => deliverable.delivery_type === 'member_area');
  const primaryAccessUrl = primaryMemberDeliverable?.url || checkout?.thank_you_button_url || '';
  const primaryAccessLabel = primaryMemberDeliverable?.label || checkout?.thank_you_button_text || t('thank_you.access', 'Acessar');
  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      <TrackingProvider
        config={config}
        trackingPolicy="market_standard"
        attribution={trackingAttribution}
      >
        {order && <PurchaseTracker order={order} attribution={trackingAttribution} />}
        <main className="max-w-3xl mx-auto px-4 py-12 sm:py-20">

          {/* Success Card */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden text-center p-8 sm:p-12">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-in zoom-in duration-300">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              {t('thank_you.title', 'Pagamento confirmado!')}
            </h1>
            <p className="text-lg text-gray-600 mb-8 max-w-lg mx-auto">
              {t('thank_you.subtitle', 'Sua compra foi realizada com sucesso. Você receberá os detalhes do acesso no seu e-mail em instantes.')}
            </p>

            {/* Order Details Box */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 mb-8 text-left max-w-md mx-auto">
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-200">
                <div className="w-10 h-10 bg-white rounded-lg border border-gray-200 flex items-center justify-center">
                  <Package className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">{t('thank_you.order', 'Pedido #{{id}}', { id: orderId?.slice(0, 8) })}</p>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(orderTimestamp || Date.now()).toLocaleDateString('pt-BR', {
                      day: '2-digit', month: 'long', year: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {combinedItems.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-gray-600">{item.name}</span>
                    <span className="font-medium">R$ {item.price?.toFixed(2)}</span>
                  </div>
                ))}

                <div className="pt-3 mt-3 border-t border-gray-200 flex justify-between items-center">
                  <span className="font-bold text-gray-900">{t('thank_you.total_paid', 'Total pago')}</span>
                  <span className="font-bold text-green-600 text-lg">
                    R$ {paidTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {actionableDeliverables.length > 0 && (
              <div className="max-w-lg mx-auto mb-8 text-left">
                <div className="flex items-center gap-2 mb-3">
                  <LockKeyhole className="w-4 h-4 text-green-600" />
                  <h2 className="text-sm font-bold text-gray-900">
                    {t('thank_you.deliverables_title', 'Seus acessos')}
                  </h2>
                </div>
                <div className="space-y-3">
                  {actionableDeliverables.map((deliverable) => (
                    <div key={deliverable.id} className="rounded-xl border border-green-100 bg-green-50/60 p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-gray-900 truncate">{deliverable.title}</p>
                          <p className="text-xs text-gray-600 mt-1">
                            {deliverable.instructions || t('thank_you.deliverable_ready', 'Material liberado para acesso imediato.')}
                          </p>
                        </div>
                        <Button
                          onClick={() => {
                            const targetUrl = deliverable.url || '';
                            if (isDemoRuntime && targetUrl.includes('demo_member_ticket=')) {
                              window.open(targetUrl, '_blank', 'noopener,noreferrer');
                              return;
                            }
                            if (targetUrl.startsWith('http')) {
                              window.open(targetUrl, '_blank', 'noopener,noreferrer');
                            } else {
                              navigate(targetUrl);
                            }
                          }}
                          className="w-full sm:w-auto shrink-0"
                        >
                          {deliverable.label || t('thank_you.access', 'Acessar')}
                          <ExternalLink className="w-4 h-4 ml-2" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {missingDeliverables.length > 0 && actionableDeliverables.length === 0 && (
              <div className="max-w-lg mx-auto mb-8 rounded-xl border border-amber-100 bg-amber-50 p-4 text-left">
                <p className="text-sm font-bold text-amber-900">
                  {t('thank_you.delivery_pending_title', 'Entrega em processamento')}
                </p>
                <p className="text-xs text-amber-800 mt-1">
                  {t('thank_you.delivery_pending_desc', 'Seu pagamento foi aprovado, mas este produto ainda nao possui entrega automatica configurada. Verifique seu e-mail ou fale com o suporte.')}
                </p>
              </div>
            )}

            {/* Next Steps */}
            <div className="grid grid-cols-1 max-w-lg mx-auto">
              <div className="p-4 rounded-xl border border-gray-100 bg-blue-50/50 flex items-start gap-3 text-left">
                <Mail className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h3 className="font-bold text-sm text-gray-900">{t('thank_you.check_email_title', 'Verifique seu e-mail')}</h3>
                  <p className="text-xs text-gray-500 mt-1">{t('thank_you.check_email_desc', 'Enviamos o link de acesso e a nota fiscal para {{email}}.', { email: order?.customer_email })}</p>
                </div>
              </div>
            </div>

            <div className="mt-10 flex justify-center">
              {primaryAccessUrl ? (
                <Button
                  onClick={() => {
                    const buttonUrl = primaryAccessUrl;
                    if (isDemoRuntime && buttonUrl.includes('demo_member_ticket=')) {
                      window.open(buttonUrl, '_blank', 'noopener,noreferrer');
                      return;
                    }
                    if (buttonUrl.startsWith('http')) {
                      // External URL - open in new tab
                      window.open(buttonUrl, '_blank');
                    } else {
                      // Internal route - navigate
                      navigate(buttonUrl);
                    }
                  }}
                  className="w-full sm:w-auto min-w-[200px]"
                >
                  {primaryAccessLabel}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <p className="text-gray-400 text-sm">
                  {t('thank_you.thanks', 'Obrigado pela sua compra.')}
                </p>
              )}
            </div>

          </div>

          <p className="text-center text-gray-400 text-sm mt-4">
            {businessName} &copy; {new Date().getFullYear()}
          </p>
        </main>
      </TrackingProvider>
    </div>
  );
};

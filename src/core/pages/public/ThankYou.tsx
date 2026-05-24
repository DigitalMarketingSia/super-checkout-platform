import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { CheckCircle, Package, Mail, ArrowRight, ShoppingBag, ExternalLink, LockKeyhole } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Loading } from '../../components/ui/Loading';
import { supabase } from '../../services/supabase';
import { Order } from '../../types';
import { TrackingProvider, useTracking } from '../../context/TrackingContext';
import { useTranslation } from 'react-i18next';
import { getApiUrl } from '../../utils/apiUtils';

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

const PurchaseTracker: React.FC<{ order: Order }> = ({ order }) => {
  const { trackPurchase, isInitialized } = useTracking();
  useEffect(() => {
    if (isInitialized && order && order.status === 'paid') {
      trackPurchase({
        id: order.id,
        amount: order.total || order.amount || 0,
        currency: 'BRL'
      });
    }
  }, [order, isInitialized]);
  return null;
};

export const ThankYou = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('public');
  const [order, setOrder] = useState<Order | null>(null);
  const [checkout, setCheckout] = useState<any>(null);
  const [deliverables, setDeliverables] = useState<OrderDeliverable[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrder = async () => {
      if (!orderId) return;

      try {
        setDeliverables([]);
        // Fetch order
        const { data: orderData, error: orderError } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single();

        if (orderError) throw orderError;
        setOrder(orderData);

        const storedDeliverables = normalizeStoredDeliverables(orderData?.metadata?.order_deliverables);
        if (storedDeliverables.length > 0) {
          setDeliverables(storedDeliverables);
        }

        if (orderData?.status === 'paid' || orderData?.status === 'approved') {
          const sig = new URLSearchParams(location.search).get('sig') || '';
          const deliveryResponse = await fetch(getApiUrl(`/api/system?action=order-deliverables&orderId=${encodeURIComponent(orderId)}&sig=${encodeURIComponent(sig)}`));
          if (deliveryResponse.ok) {
            const deliveryData = await deliveryResponse.json().catch(() => ({}));
            if (Array.isArray(deliveryData?.deliverables)) {
              if (deliveryData.deliverables.length > 0) {
                setDeliverables(deliveryData.deliverables);
              } else if (!sig && storedDeliverables.length > 0) {
                setDeliverables(storedDeliverables);
              }
            }
          }
        }

        // Fetch checkout
        if (orderData?.checkout_id) {
          const { data: checkoutData, error: checkoutError } = await supabase
            .from('checkouts')
            .select('thank_you_button_url, thank_you_button_text, config')
            .eq('id', orderData.checkout_id)
            .single();

          if (!checkoutError && checkoutData) {
            setCheckout(checkoutData);
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
  const actionableDeliverables = deliverables.filter((deliverable) => deliverable.status === 'available' && deliverable.url);
  const missingDeliverables = deliverables.filter((deliverable) => deliverable.status !== 'available' || !deliverable.url);

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      <TrackingProvider config={config}>
        {order && <PurchaseTracker order={order} />}
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
                    {new Date().toLocaleDateString('pt-BR', {
                      day: '2-digit', month: 'long', year: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {order?.items?.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-gray-600">{item.name}</span>
                    <span className="font-medium">R$ {item.price?.toFixed(2)}</span>
                  </div>
                ))}

                <div className="pt-3 mt-3 border-t border-gray-200 flex justify-between items-center">
                  <span className="font-bold text-gray-900">{t('thank_you.total_paid', 'Total pago')}</span>
                  <span className="font-bold text-green-600 text-lg">
                    R$ {order?.total?.toFixed(2) || order?.amount?.toFixed(2)}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
              <div className="p-4 rounded-xl border border-gray-100 bg-blue-50/50 flex items-start gap-3 text-left">
                <Mail className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h3 className="font-bold text-sm text-gray-900">{t('thank_you.check_email_title', 'Verifique seu e-mail')}</h3>
                  <p className="text-xs text-gray-500 mt-1">{t('thank_you.check_email_desc', 'Enviamos o link de acesso e a nota fiscal para {{email}}.', { email: order?.customer_email })}</p>
                </div>
              </div>
              <div className="p-4 rounded-xl border border-gray-100 bg-purple-50/50 flex items-start gap-3 text-left">
                <ShoppingBag className="w-5 h-5 text-purple-600 mt-0.5" />
                <div>
                  <h3 className="font-bold text-sm text-gray-900">{t('thank_you.track_order_title', 'Acompanhe o pedido')}</h3>
                  <p className="text-xs text-gray-500 mt-1">{t('thank_you.track_order_desc', 'Você pode ver o status da sua compra a qualquer momento.')}</p>
                </div>
              </div>
            </div>

            <div className="mt-10 flex justify-center">
              {checkout?.thank_you_button_url ? (
                <Button
                  onClick={() => {
                    const buttonUrl = checkout.thank_you_button_url!;
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
                  {checkout?.thank_you_button_text || t('thank_you.access', 'Acessar')}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <p className="text-gray-400 text-sm">
                  {t('thank_you.thanks', 'Obrigado pela sua compra.')}
                </p>
              )}
            </div>

          </div>

          <p className="text-center text-gray-400 text-sm mt-8">
            Super Checkout &copy; {new Date().getFullYear()}
          </p>
        </main>
      </TrackingProvider>
    </div>
  );
};

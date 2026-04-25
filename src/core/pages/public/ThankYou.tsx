import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle, Package, Mail, ArrowRight, ShoppingBag } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { supabase } from '../../services/supabase';
import { Order } from '../../types';
import { TrackingProvider, useTracking } from '../../context/TrackingContext';

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
  const [order, setOrder] = useState<Order | null>(null);
  const [checkout, setCheckout] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrder = async () => {
      if (!orderId) return;

      try {
        // Fetch order
        const { data: orderData, error: orderError } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single();

        if (orderError) throw orderError;
        setOrder(orderData);

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
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
          <div className="h-4 w-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  // Ensure config exists
  const config = checkout?.config || {};

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
              Pagamento Confirmado!
            </h1>
            <p className="text-lg text-gray-600 mb-8 max-w-lg mx-auto">
              Sua compra foi realizada com sucesso. Você receberá os detalhes do acesso no seu e-mail em instantes.
            </p>

            {/* Order Details Box */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 mb-8 text-left max-w-md mx-auto">
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-200">
                <div className="w-10 h-10 bg-white rounded-lg border border-gray-200 flex items-center justify-center">
                  <Package className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Pedido #{orderId?.slice(0, 8)}</p>
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
                  <span className="font-bold text-gray-900">Total Pago</span>
                  <span className="font-bold text-green-600 text-lg">
                    R$ {order?.total?.toFixed(2) || order?.amount?.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Next Steps */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
              <div className="p-4 rounded-xl border border-gray-100 bg-blue-50/50 flex items-start gap-3 text-left">
                <Mail className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h3 className="font-bold text-sm text-gray-900">Verifique seu E-mail</h3>
                  <p className="text-xs text-gray-500 mt-1">Enviamos o link de acesso e a nota fiscal para {order?.customer_email}.</p>
                </div>
              </div>
              <div className="p-4 rounded-xl border border-gray-100 bg-purple-50/50 flex items-start gap-3 text-left">
                <ShoppingBag className="w-5 h-5 text-purple-600 mt-0.5" />
                <div>
                  <h3 className="font-bold text-sm text-gray-900">Acompanhe o Pedido</h3>
                  <p className="text-xs text-gray-500 mt-1">Você pode ver o status da sua compra a qualquer momento.</p>
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
                  {checkout?.thank_you_button_text || 'Acessar'}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <p className="text-gray-400 text-sm">
                  Obrigado pela sua compra.
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

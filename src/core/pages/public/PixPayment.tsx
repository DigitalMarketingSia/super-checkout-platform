
import React, { useEffect, useRef, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { Copy, Check, Clock, ShieldCheck, Smartphone, QrCode, AlertCircle, Loader2 } from 'lucide-react';
import { storage } from '../../services/storageService';
import { supabase } from '../../services/supabase';
import { Order, OrderStatus } from '../../types';

import { AlertModal } from '../../components/ui/Modal';
import { getApiUrl } from '../../utils/apiUtils';

// Mocks de segurança conforme solicitado
const FALLBACK_MOCK_ORDER = {
  items: [
    { name: "Master Pack Completo", price: 197.00, quantity: 1 }
  ],
  totalAmount: 197.00,
  customer: { name: "Cliente Visitante", email: "cliente@exemplo.com" }
};

const MOCK_PIX_DATA = {
  qr_code: "00020126330014BR.GOV.BCB.PIX0114+5511999999999520400005303986540510.005802BR5913SuperCheckout6008SaoPaulo62070503***63041D3D",
  transaction_amount: 197.00
};

const getPixSessionKey = (orderId?: string) => `pix-payment-context:${orderId || 'unknown'}`;
const toPixQrImageSrc = (value?: string | null) => {
  if (!value) return '';
  return value.startsWith('data:image') ? value : `data:image/png;base64,${value}`;
};

export const PixPayment = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const location = useLocation();
  const [timeLeft, setTimeLeft] = useState({ minutes: 14, seconds: 59 });
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  // State para dados
  const [orderData, setOrderData] = useState<any>(null);
  const [pixCode, setPixCode] = useState<string>("");
  const [pixQrImageSrc, setPixQrImageSrc] = useState<string>("");
  const [businessName, setBusinessName] = useState<string>("Super Checkout");
  const [redirectTarget, setRedirectTarget] = useState<string | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const hasRedirectedRef = useRef(false);

  const [alertState, setAlertState] = useState<{ isOpen: boolean; title: string; message: string; variant: 'success' | 'error' | 'info' }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'info'
  });

  const showAlert = (title: string, message: string, variant: 'success' | 'error' | 'info' = 'info') => {
    setAlertState({ isOpen: true, title, message, variant });
  };

  const closeAlert = () => {
    setAlertState(prev => ({ ...prev, isOpen: false }));
  };

  useEffect(() => {
    const load = async () => {
      const sessionKey = getPixSessionKey(orderId);

      try {
        const rawContext = sessionStorage.getItem(sessionKey);
        if (rawContext) {
          const savedContext = JSON.parse(rawContext);
          if (savedContext?.orderData) {
            setOrderData(savedContext.orderData);
          }
          if (savedContext?.pixCode) {
            setPixCode(savedContext.pixCode);
          }
          if (savedContext?.pixQrImageSrc) {
            setPixQrImageSrc(savedContext.pixQrImageSrc);
          }
          if (savedContext?.businessName) {
            setBusinessName(savedContext.businessName);
          }
        }
      } catch (storageError) {
        console.warn('[PixPayment] Failed to restore session context:', storageError);
      }

      // 1. Tentar recuperar dados do State (Navegação direta)
      // Se tivermos o pixData no state (vindo do checkout), usamos ele pois é o mais fresco
      if (location.state?.orderData && location.state?.pixData) {
        const freshOrderData = {
          ...location.state.orderData,
          currency: location.state.pixData.currency || 'BRL'
        };
        const freshPixCode = location.state.pixData.qr_code || MOCK_PIX_DATA.qr_code;
        const freshPixQrImageSrc = location.state.pixData.qr_code_base64
          ? toPixQrImageSrc(location.state.pixData.qr_code_base64)
          : '';
        const freshBusinessName = location.state?.businessName || businessName;

        setOrderData(freshOrderData);
        setPixCode(freshPixCode);
        setPixQrImageSrc(freshPixQrImageSrc);
        if (location.state?.businessName) {
          setBusinessName(location.state.businessName);
        }

        try {
          sessionStorage.setItem(sessionKey, JSON.stringify({
            orderData: freshOrderData,
            pixCode: freshPixCode,
            pixQrImageSrc: freshPixQrImageSrc,
            businessName: freshBusinessName
          }));
        } catch (storageError) {
          console.warn('[PixPayment] Failed to persist session context from navigation state:', storageError);
        }

        // Try to fetch business settings even if data comes from state (using checkoutId if available in state or orderId)
        // ... (Logic continues below)
      }

      // 2. Load Real Data from Supabase (always check to get Account ID -> Business Settings)
      if (orderId) {
        try {
          // Buscar pedido para pegar account_id (owner)
          // As we don't have account_id directly on orders (yet, maybe), we go through checkout -> product -> owner or direct relation
          // Actually, our schema update added account_id to orders? Let's assume we can traverse.
          const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('*, checkout_id, checkouts(user_id)')
            .eq('id', orderId)
            .single();

          if (order && !orderError) {
            const isAlreadyPaid = ['paid', 'approved'].includes((order.status || '').toLowerCase());

            // If we didn't have data from state, set it now
            if (!location.state?.orderData) {
              // Buscar dados do pagamento
              const { data: payments } = await supabase
                .from('payments')
                .select('raw_response')
                .eq('order_id', orderId)
                .order('created_at', { ascending: false })
                .limit(1);

              let realPixCode = MOCK_PIX_DATA.qr_code;
              let realPixQrImageSrc = '';
              if (payments && payments.length > 0 && payments[0].raw_response) {
                try {
                  const raw = typeof payments[0].raw_response === 'string' ? JSON.parse(payments[0].raw_response) : payments[0].raw_response;
                  const qrCode = raw.point_of_interaction?.transaction_data?.qr_code;
                  const qrCodeBase64 = raw.point_of_interaction?.transaction_data?.qr_code_base64;
                  if (qrCode) realPixCode = qrCode;
                  if (qrCodeBase64) realPixQrImageSrc = toPixQrImageSrc(qrCodeBase64);
                } catch (e) { console.warn('Erro PIX parse', e); }
              }

              const adaptedOrder = {
                items: order.items || [{ name: "Oferta Selecionada", price: order.amount, quantity: 1 }],
                totalAmount: order.amount,
                customer: { name: order.customer_name, email: order.customer_email }
              };
              setOrderData(adaptedOrder);
              setPixCode(realPixCode);
              setPixQrImageSrc(realPixQrImageSrc);

              try {
                sessionStorage.setItem(sessionKey, JSON.stringify({
                  orderData: adaptedOrder,
                  pixCode: realPixCode,
                  pixQrImageSrc: realPixQrImageSrc,
                  businessName
                }));
              } catch (storageError) {
                console.warn('[PixPayment] Failed to persist session context from order lookup:', storageError);
              }
            }

            const resolvedCheckoutId = location.state?.checkoutId || order.checkout_id;
            if (resolvedCheckoutId) {
              const settings = await storage.getBusinessSettingsByCheckoutId(resolvedCheckoutId);
              if (settings?.business_name) {
                setBusinessName(settings.business_name);
                try {
                  const rawExistingContext = sessionStorage.getItem(sessionKey);
                  const existingContext = rawExistingContext ? JSON.parse(rawExistingContext) : {};
                  sessionStorage.setItem(sessionKey, JSON.stringify({
                    ...existingContext,
                    businessName: settings.business_name
                  }));
                } catch (storageError) {
                  console.warn('[PixPayment] Failed to persist resolved business name:', storageError);
                }
              }
            }

            if (isAlreadyPaid) {
              setPaymentConfirmed(true);
              setRedirectTarget(`/thank-you/${orderId}`);
            }
          }
        } catch (err) {
          console.error('[PixPayment] Error loading order/settings:', err);
        }
      } else {
        // Fallback Mock if NO orderId (Testing)
        if (!location.state?.orderData) {
          setOrderData(FALLBACK_MOCK_ORDER);
          setPixCode(MOCK_PIX_DATA.qr_code);
        }
      }

      setLoading(false);
    };
    load();
  }, [orderId, location.state]);

  // Fetch Config for Upsell Logic
  const [upsellActive, setUpsellActive] = useState<boolean | null>(null);

  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 5;

    const checkUpsell = async () => {
      try {
        // 1. Check Location State first
        if (location.state?.checkoutId) {
          const chk = await storage.getPublicCheckout(location.state.checkoutId);
          if (chk?.config?.upsell?.active) {
            setUpsellActive(true);
            return;
          }
        }

        if (!orderId) {
          setUpsellActive(false);
          return;
        }

        // 2. Check Database (Direct Supabase Query)
        // Note: storage.getOrders() fails for anonymous users, so we use direct query.
        const { data: order, error } = await supabase
          .from('orders')
          .select('checkout_id')
          .eq('id', orderId)
          .single();

        if (order?.checkout_id) {
          const chk = await storage.getPublicCheckout(order.checkout_id);
          if (chk?.config?.upsell?.active) {
            setUpsellActive(true);
            return;
          }
        } else {
          // Retry if order not found yet
          if (attempts < maxAttempts) {
            attempts++;
            setTimeout(checkUpsell, 1000);
            return;
          }
        }
        setUpsellActive(false);
      } catch (err) {
        console.error('Error checking upsell:', err);
        setUpsellActive(false);
      }
    };
    // Initial delay for propagation
    setTimeout(checkUpsell, 500);

  }, [orderId, location.state]);

  // Polling para verificar status do pagamento
  useEffect(() => {
    if (!orderId) return;

    const statusSignature = new URLSearchParams(location.search).get('sig') || location.state?.statusSignature || '';

    const checkStatus = async () => {
      if (hasRedirectedRef.current || redirectTarget) return;

      try {
        const response = await fetch(getApiUrl(`/api/check-status?orderId=${orderId}&sig=${statusSignature}&t=${Date.now()}`));
        let isPaid = false;

        const contentType = response.headers.get('content-type');
        if (response.ok && contentType && contentType.includes('application/json')) {
          const data = await response.json();
          const status = (data && data.status) ? data.status.toLowerCase() : '';
          console.log('[PixPayment] Polling status:', status);
          if (status === 'paid' || status === 'approved') isPaid = true;
        } else {
          // Fallback Supabase
          const { data } = await supabase.from('orders').select('status').eq('id', orderId).single();
          const status = (data && data.status) ? data.status.toLowerCase() : '';
          console.log('[PixPayment] Fallback status:', status);
          if (status === 'paid' || status === 'approved') isPaid = true;
        }

        // Only navigate if we know the status.
        if (isPaid) {
          setPaymentConfirmed(true);
          console.log('[PixPayment] 💳 Payment CONFIRMED! Preparing redirect...');
          const isUpsell = upsellActive === true;
          const target = isUpsell ? `/upsell/${orderId}` : `/thank-you/${orderId}`;
          setRedirectTarget(target);
        }


      } catch (error) {
        console.error('Erro ao verificar status:', error);
      }
    };

    void checkStatus();
    const interval = setInterval(checkStatus, 3000);

    const handleVisibilityResume = () => {
      if (document.visibilityState === 'visible') {
        void checkStatus();
      }
    };

    window.addEventListener('focus', handleVisibilityResume);
    document.addEventListener('visibilitychange', handleVisibilityResume);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleVisibilityResume);
      document.removeEventListener('visibilitychange', handleVisibilityResume);
    };
  }, [orderId, location.search, location.state, upsellActive, redirectTarget]);

  useEffect(() => {
    if (!orderId || redirectTarget) return;

    const channel = supabase
      .channel(`pix-order-status-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`
        },
        (payload) => {
          const nextStatus = String(payload.new?.status || '').toLowerCase();
          if (nextStatus === 'paid' || nextStatus === 'approved') {
            setPaymentConfirmed(true);
            const target = upsellActive === true ? `/upsell/${orderId}` : `/thank-you/${orderId}`;
            setRedirectTarget(target);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orderId, redirectTarget, upsellActive]);

  useEffect(() => {
    if (!redirectTarget || hasRedirectedRef.current) return;

    hasRedirectedRef.current = true;
    const absoluteTarget = new URL(redirectTarget, window.location.origin).toString();
    console.log('[PixPayment] Redirecting to:', absoluteTarget);

    const firstAttempt = window.setTimeout(() => {
      window.location.assign(absoluteTarget);
    }, 150);

    const secondAttempt = window.setTimeout(() => {
      if (window.location.pathname.includes(`/pagamento/pix/${orderId}`)) {
        window.location.replace(absoluteTarget);
      }
    }, 1600);

    return () => {
      window.clearTimeout(firstAttempt);
      window.clearTimeout(secondAttempt);
    };
  }, [orderId, redirectTarget]);

  // Timer de expiração
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev.seconds === 0) {
          if (prev.minutes === 0) return prev;
          return { minutes: prev.minutes - 1, seconds: 59 };
        }
        return { ...prev, seconds: prev.seconds - 1 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(pixCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatCurrency = (value: number | undefined) => {
    if (value === undefined) return '';
    const currency = orderData?.currency || 'BRL';
    const locale = currency === 'BRL' ? 'pt-BR' : currency === 'USD' ? 'en-US' : 'es-ES';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
    }).format(value);
  };



  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F3F4F6] font-sans text-gray-800 pb-12">
      {/* Header Simplificado */}
      <header className="bg-white border-b border-gray-200 py-4">
        <div className="max-w-4xl mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary font-bold text-xl">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <span>Pagamento Seguro</span>
          </div>
          <div className="text-xs text-gray-500 hidden sm:block">
            ID do Pedido: <span className="font-mono font-medium text-gray-900">{orderId}</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Coluna Esquerda: Área do Pix */}
          <div className="md:col-span-2 space-y-6">

            {/* Card de Status */}
            <div className="bg-white rounded-xl shadow-sm border border-green-100 overflow-hidden">
              <div className="bg-green-50 p-4 border-b border-green-100 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center animate-pulse">
                  <QrCode className="w-5 h-5 text-[#10B981]" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900">Pix gerado com sucesso!</h1>
                  <p className="text-xs text-gray-500">Realize o pagamento para liberar seu acesso imediatamente.</p>
                </div>
              </div>

              <div className="p-6 flex flex-col items-center justify-center text-center">
                <p className="text-sm text-gray-500 mb-4">Escaneie o QR Code abaixo no app do seu banco:</p>

                {/* QR Code Visual */}
                <div className="bg-white p-2 border-2 border-gray-100 rounded-xl mb-6 shadow-sm">
                  <img
                    src={pixQrImageSrc || `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(pixCode)}`}
                    alt="QR Code Pix"
                    className="w-52 h-52 object-contain"
                  />
                </div>

                <div className="w-full max-w-md space-y-3">
                  <div className="flex items-center justify-between text-xs text-gray-500 px-1">
                    <span>Pix Copia e Cola</span>
                    <span className="flex items-center gap-1 text-orange-500 font-medium">
                      <Clock className="w-3 h-3" />
                      Expira em {timeLeft.minutes}:{timeLeft.seconds.toString().padStart(2, '0')}
                    </span>
                  </div>

                  <div className="relative group">
                    <input
                      type="text"
                      readOnly
                      value={pixCode}
                      className="w-full bg-gray-50 border border-gray-200 text-gray-500 text-xs rounded-lg pl-4 pr-24 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono truncate"
                    />
                    <button
                      onClick={handleCopy}
                      className={`absolute right-1 top-1 bottom-1 px-4 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${copied
                        ? 'bg-green-500 text-white'
                        : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm'
                        }`}
                    >
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>

                  <p className="text-[10px] text-gray-400 mt-4">
                    Após o pagamento, a aprovação ocorre em instantes e você receberá os dados de acesso no e-mail <span className="text-gray-600 font-medium">{orderData?.customer?.email}</span>.
                  </p>
                </div>
              </div>

              {/* Footer Loading */}
              <div className="bg-gray-50 p-4 border-t border-gray-100 flex items-center justify-center gap-3">
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                <span className="text-sm text-gray-500 font-medium">
                  {paymentConfirmed ? 'Pagamento confirmado. Redirecionando...' : 'Aguardando confirmação do banco...'}
                </span>
              </div>



            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Como pagar?</h3>
                  <ol className="text-xs text-gray-500 list-decimal list-inside mt-2 space-y-1">
                    <li>Abra o aplicativo do seu banco.</li>
                    <li>Escolha a opção <strong>Pix</strong>.</li>
                    <li>Selecione <strong>Ler QR Code</strong> ou <strong>Pix Copia e Cola</strong>.</li>
                    <li>Confira os dados e confirme o pagamento.</li>
                  </ol>
                </div>
              </div>
            </div>

          </div> {/* End Left Col */}

          {/* Coluna Direita: Resumo do Pedido */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="font-bold text-gray-900 mb-4 pb-4 border-b border-gray-100">Resumo da Compra</h3>

              <div className="space-y-3">
                {orderData?.items?.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-gray-600 w-2/3">{item.name}</span>
                    <span className="font-medium text-gray-900">{formatCurrency(item.price)}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t border-gray-100">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Total a pagar</span>
                  <span className="text-2xl font-bold text-[#10B981]">{formatCurrency(orderData?.totalAmount)}</span>
                </div>
              </div>
            </div>

            <div className="text-center space-y-2">
              <p className="text-xs text-gray-400">Vendido e entregue por</p>
              <div className="flex items-center justify-center gap-2 opacity-70">
                <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center text-[10px] font-bold text-gray-500">
                  {businessName.substring(0, 2).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-gray-600">{businessName}</span>
              </div>
            </div>
          </div>

        </div>
      </main>
      <AlertModal
        isOpen={alertState.isOpen}
        onClose={closeAlert}
        title={alertState.title}
        message={alertState.message}
        variant={alertState.variant}
      />
    </div>
  );
};

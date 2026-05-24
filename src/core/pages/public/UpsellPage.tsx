
import React, { useCallback, useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { storage } from '../../services/storageService';
import { paymentService } from '../../services/paymentService';
import { Order, Checkout, Product, CheckoutConfig, Gateway } from '../../types';
import { Button } from '../../components/ui/Button';
import { Loading } from '../../components/ui/Loading';
import { CheckCircle, X, Play, Image as ImageIcon, CreditCard, Lock, ShieldCheck } from 'lucide-react';

import { supabase } from '../../services/supabase';
import { useTranslation } from 'react-i18next';
import { getApiUrl } from '../../utils/apiUtils';
import { resolveUpsellGatewayCapability, type UpsellGatewayCapability } from '../../config/upsellCapabilities';

const getUpsellOrderSessionKey = (orderId?: string) => `upsell-original-order:${orderId || 'unknown'}`;

export const UpsellPage = () => {
    const { orderId } = useParams<{ orderId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useTranslation('public');
    const originalStatusSignature = new URLSearchParams(location.search).get('sig') || '';
    const appendOriginalSignature = useCallback((path: string) => {
        if (!originalStatusSignature) return path;
        const separator = path.includes('?') ? '&' : '?';
        return `${path}${separator}sig=${encodeURIComponent(originalStatusSignature)}`;
    }, [originalStatusSignature]);

    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [originalOrder, setOriginalOrder] = useState<Order | null>(null);
    const [checkout, setCheckout] = useState<Checkout | null>(null);
    const [gateway, setGateway] = useState<Gateway | null>(null);
    const [serverCapability, setServerCapability] = useState<UpsellGatewayCapability | null>(null);
    const [upsellProduct, setUpsellProduct] = useState<Product | null>(null);
    const [error, setError] = useState('');

    // Upsell Payment State
    const [pixCode, setPixCode] = useState('');
    const [showCardForm, setShowCardForm] = useState(false);

    // Simple Card Form (since we don't have true 1-click tokenization yet)
    const [cardData, setCardData] = useState({
        number: '',
        holderName: '',
        expiryMonth: '',
        expiryYear: '',
        cvc: ''
    });

    useEffect(() => {
        const load = async () => {
            try {
                if (!orderId) return;

                let order: any = null;
                let orderError: any = null;

                try {
                    const rawOrderContext = sessionStorage.getItem(getUpsellOrderSessionKey(orderId));
                    if (rawOrderContext) {
                        order = JSON.parse(rawOrderContext);
                    }
                } catch (storageError) {
                    console.warn('[UpsellPage] Failed to restore original order context:', storageError);
                }

                if (!order) {
                    // Fallback for older links. RLS may block anonymous reads, so the session context above is the preferred path.
                    const response = await supabase
                        .from('orders')
                        .select('*')
                        .eq('id', orderId)
                        .single();
                    order = response.data;
                    orderError = response.error;
                }

                if (orderError || !order) {
                    console.error('Order fetch error:', orderError);
                    setError(t('upsell.original_order_not_found', 'Pedido original não encontrado.'));
                    setLoading(false);
                    return;
                }

                // Map DB snake_case to CamelCase if needed, but Order type seems to match DB mostly 
                // except for 'amount' vs 'total'. Let's ensure compatibility.
                // The 'Order' type has 'amount' but DB has 'total' (based on previous sql error check, wait...)
                // In step 492, DB result had 'total': "0.01".
                // But storageService.ts maps 'total' to 'amount'. We should do the same.
                const mappedOrder: Order = {
                    ...order,
                    amount: order.total || order.amount, // handle both just in case
                };

                setOriginalOrder(mappedOrder);
                if (order?.upsell_capability_snapshot) {
                    setServerCapability(order.upsell_capability_snapshot);
                }

                // 2. Fetch Checkout Config
                const chk = await storage.getPublicCheckout(order.checkout_id);
                if (!chk || !chk.config.upsell?.active) {
                    // Redirect to Thank You if upsell not valid
                    navigate(appendOriginalSignature(`/thank-you/${orderId}`));
                    return;
                }
                setCheckout(chk);
                setGateway(chk.gateway_id ? await storage.getPublicGateway(chk.gateway_id) : null);

                // 3. Fetch Upsell Product
                const prod = await storage.getPublicProduct(chk.config.upsell.product_id);
                if (!prod) {
                    navigate(appendOriginalSignature(`/thank-you/${orderId}`));
                    return;
                }
                setUpsellProduct(prod);

            } catch (err) {
                console.error(err);
                setError(t('upsell.load_error', 'Erro ao carregar oferta.'));
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [orderId, navigate, t, appendOriginalSignature]);

    useEffect(() => {
        const loadEligibility = async () => {
            if (!orderId || !originalStatusSignature) return;

            try {
                const response = await fetch(
                    getApiUrl(`/api/upsell-eligibility?orderId=${encodeURIComponent(orderId)}&sig=${encodeURIComponent(originalStatusSignature)}`)
                );

                if (!response.ok) return;
                const payload = await response.json();
                if (payload?.authorized && payload?.capability) {
                    setServerCapability(payload.capability);
                }
            } catch (eligibilityError) {
                console.warn('[UpsellPage] Failed to load upsell eligibility:', eligibilityError);
            }
        };

        loadEligibility();
    }, [orderId, originalStatusSignature]);

    const fallbackCapability = resolveUpsellGatewayCapability({
        gatewayName: gateway?.name,
        paymentMethod: originalOrder?.payment_method,
    });
    const upsellCapability = serverCapability || fallbackCapability;

    const savedProfileLabel = upsellCapability.saved_profile?.wallet_type === 'apple_pay'
        ? 'Apple Pay'
        : upsellCapability.saved_profile?.wallet_type === 'google_pay'
            ? 'Google Pay'
            : upsellCapability.saved_profile?.brand && upsellCapability.saved_profile?.last4
                ? `${String(upsellCapability.saved_profile.brand).toUpperCase()} •••• ${upsellCapability.saved_profile.last4}`
                : null;

    const originalPaymentMethodLabel = originalOrder?.payment_method === 'pix'
        ? t('upsell.method_pix', 'Pix')
        : originalOrder?.payment_method === 'credit_card'
            ? t('upsell.method_credit_card', 'Cartão de crédito')
            : originalOrder?.payment_method === 'apple_pay'
                ? t('upsell.method_apple_pay', 'Apple Pay')
                : originalOrder?.payment_method === 'google_pay'
                    ? t('upsell.method_google_pay', 'Google Pay')
                    : originalOrder?.payment_method === 'boleto'
                        ? t('upsell.method_boleto', 'Boleto')
                        : t('upsell.method_unknown', 'Método não identificado');

    const originalGatewayLabel = gateway?.name === 'stripe'
        ? 'Stripe'
        : gateway?.name === 'mercado_pago'
            ? 'Mercado Pago'
            : t('upsell.gateway_unknown', 'Gateway padrão');

    const trustModeDescription = upsellCapability.mode === 'not_immediate'
        ? t('upsell.not_immediate_mode_desc', 'Este método não será oferecido imediatamente para evitar confusão ou dupla cobrança percebida após o pedido principal.')
        : upsellCapability.mode === 'one_click'
            ? t('upsell.one_click_mode_desc', 'Identificamos um método reutilizável elegível. Se você aceitar, o sistema tentará adicionar o item ao pedido com a menor fricção possível.')
            : upsellCapability.mode === 'light_confirmation'
                ? t(
                    'upsell.saved_method_mode_desc',
                    'Reconhecemos o método {{method}} usado no pedido principal. O gateway ainda pode solicitar uma confirmação adicional antes de concluir este item.',
                    { method: savedProfileLabel || originalPaymentMethodLabel }
                )
                : upsellCapability.original_payment_method === 'pix'
                    ? t('upsell.pix_mode_desc', 'Seu pedido principal já foi confirmado. Se você aceitar esta oferta, vamos gerar um novo Pix somente para o item adicional.')
                    : t('upsell.card_mode_desc', 'Seu pedido principal já foi confirmado. Para adicionar este item, confirme um novo pagamento somente do item adicional.');

    const primaryUpsellCta = upsellCapability.mode === 'not_immediate'
        ? t('upsell.not_immediate_cta', 'Oferta indisponível neste momento')
        : upsellCapability.mode === 'light_confirmation'
            ? t('upsell.review_saved_method_cta', 'Revisar pagamento adicional')
            : upsellCapability.original_payment_method === 'pix'
                ? t('upsell.generate_pix_cta', 'Gerar Pix do item adicional')
                : t('upsell.continue_card_cta', 'Continuar com pagamento adicional');

    const handleAccept = async () => {
        if (!originalOrder || !upsellProduct || !checkout) return;

        setProcessing(true);
        try {
            if (upsellCapability.mode === 'not_immediate') {
                alert(t('upsell.not_immediate_error', 'Este método de pagamento ainda não suporta oferta imediata com segurança.'));
                setProcessing(false);
                return;
            }

            if (originalOrder.payment_method === 'pix') {
                await processPurchase('pix');
            } else {
                setShowCardForm(true); // Open Modal/Form
                setProcessing(false);
            }

        } catch (err) {
            console.error(err);
            alert(t('upsell.process_error', 'Erro ao processar. Tente novamente.'));
            setProcessing(false);
        }
    };

    const processPurchase = async (method: 'credit_card' | 'pix', cardDetails?: any) => {
        if (!originalOrder || !upsellProduct || !checkout) return;

        setProcessing(true);

        try {
            // Create Payment Request
            const result = await paymentService.processPayment({
                checkoutId: checkout.id,
                offerId: 'upsell', // Marker
                amount: upsellProduct.price_real || 0,
                customerName: originalOrder.customer_name,
                customerEmail: originalOrder.customer_email,
                customerPhone: originalOrder.customer_phone,
                customerCpf: originalOrder.customer_cpf,
                gatewayId: checkout.gateway_id, // Use same gateway
                paymentMethod: method,
                currency: checkout.currency || 'BRL',
                items: [{
                    name: upsellProduct.name,
                    price: upsellProduct.price_real || 0,
                    quantity: 1,
                    type: 'upsell', // New type
                    product_id: upsellProduct.id
                }],
                customerUserId: originalOrder.customer_user_id,
                cardData: cardDetails
            });

            if (result.success) {
                if (result.pixData) {
                    setPixCode(result.pixData.qr_code);
                    // Stay on page to show Pix
                    setProcessing(false);
                } else {
                    // Approved (Card)
                    const signedQuery = result.statusSignature ? `&sig=${encodeURIComponent(result.statusSignature)}` : '';
                    navigate(`/thank-you/${result.orderId}?upsell=true${signedQuery}`);
                }
            } else {
                alert(t('upsell.payment_declined', 'Pagamento recusado: {{message}}', { message: result.message }));
                setProcessing(false);
            }

        } catch (err) {
            console.error(err);
            alert(t('upsell.payment_error', 'Erro ao processar pagamento.'));
            setProcessing(false);
        }
    };

    const handleDecline = () => {
        navigate(appendOriginalSignature(`/thank-you/${orderId}`));
    };

    if (loading) return <Loading label={t('upsell.loading', 'Carregando oferta')} />;
    if (error) return <div className="min-h-screen bg-black flex items-center justify-center text-white">{error}</div>;

    const config = checkout?.config.upsell!;

    // Pix Modal or State
    if (pixCode) {
        return (
            <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
                <div className="bg-[#111] p-8 rounded-2xl border border-white/10 max-w-md w-full text-center space-y-6">
                    <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
                        <CheckCircle className="w-8 h-8 text-green-500" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold mb-2">{t('upsell.reserved_title', 'Oferta reservada!')}</h2>
                        <p className="text-gray-400">{t('upsell.reserved_desc', 'Escaneie o QR Code abaixo para concluir o pagamento do item adicional.')}</p>
                    </div>

                    <div className="bg-white p-4 rounded-xl mx-auto w-64 h-64 flex items-center justify-center">
                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixCode)}`} className="w-full h-full" />
                    </div>

                    <textarea
                        readOnly
                        value={pixCode}
                        className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-xs text-gray-500 h-24 resize-none"
                    />

                    <Button onClick={() => navigate(appendOriginalSignature(`/thank-you/${orderId}`))} className="w-full">
                        {t('upsell.already_paid', 'Já realizei o pagamento')}
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#05050A] text-white">
            <div className="max-w-[800px] mx-auto px-4 py-8 md:py-12 flex flex-col items-center gap-8">

                {/* Progress Bar (Fake) */}
                <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                    <div className="bg-green-500 h-full w-[80%]"></div>
                </div>

                {/* Title */}
                {config.show_title && (
                    <h1 className="text-2xl md:text-4xl font-extrabold text-center leading-tight">
                        <span className="text-primary">{config.title || t('upsell.special_offer', 'Oferta especial')}</span>
                    </h1>
                )}

                {/* Subtitle */}
                {config.show_subtitle && (
                    <p className="text-lg md:text-xl text-gray-300 text-center max-w-2xl">
                        {config.subtitle || t('upsell.default_subtitle', 'Não feche essa página! Tenho algo exclusivo para você.')}
                    </p>
                )}

                {/* Media */}
                {config.show_media && config.media_url && (
                    <div className="w-full aspect-video bg-black rounded-2xl border border-white/10 overflow-hidden shadow-2xl relative group">
                        {config.media_type === 'video' ? (
                            <iframe
                                src={config.media_url.replace('watch?v=', 'embed/')}
                                className="w-full h-full"
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                            ></iframe>
                        ) : (
                            <img src={config.media_url} className="w-full h-full object-cover" />
                        )}
                    </div>
                )}

                {/* CTA Card */}
                <div className="w-full bg-[#111] border-2 border-primary/30 p-6 md:p-8 rounded-2xl flex flex-col items-center gap-6 shadow-[0_0_40px_rgba(138,43,226,0.1)]">
                    <div className="w-full rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 md:p-5 text-left">
                        <div className="flex items-center gap-2 text-emerald-300 text-[10px] font-black uppercase tracking-[0.3em] mb-3">
                            <ShieldCheck className="w-4 h-4" />
                            {t('upsell.main_order_confirmed', 'Pedido principal confirmado')}
                        </div>
                        <p className="text-sm text-white leading-relaxed">
                            {t('upsell.main_order_confirmed_desc', 'Sua compra anterior já está garantida. Esta oferta é opcional e não substitui o pedido que você acabou de pagar.')}
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                            <div className="rounded-xl bg-black/20 border border-white/5 p-3">
                                <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-black mb-1">{t('upsell.original_payment_method', 'Método original')}</p>
                                <p className="text-sm font-bold text-white">{originalPaymentMethodLabel}</p>
                            </div>
                            <div className="rounded-xl bg-black/20 border border-white/5 p-3">
                                <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-black mb-1">{t('upsell.gateway_label', 'Gateway')}</p>
                                <p className="text-sm font-bold text-white">{originalGatewayLabel}</p>
                            </div>
                        </div>
                        <p className="mt-4 text-xs text-gray-200 leading-relaxed">
                            {trustModeDescription}
                        </p>
                        {savedProfileLabel && (
                            <div className="mt-4 rounded-xl bg-black/20 border border-white/5 p-3">
                                <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-black mb-1">
                                    {t('upsell.saved_method_label', 'Método detectado')}
                                </p>
                                <p className="text-sm font-bold text-white">{savedProfileLabel}</p>
                            </div>
                        )}
                    </div>

                    <div className="text-center">
                        <p className="text-sm text-gray-400 uppercase tracking-widest mb-2 font-bold">{t('upsell.order_summary', 'Resumo do pedido')}</p>
                        <h3 className="text-xl font-bold">{upsellProduct?.name}</h3>
                        <p className="text-2xl font-black text-green-400 mt-2">
                            R$ {upsellProduct?.price_real?.toFixed(2)}
                        </p>
                    </div>

                    {!showCardForm ? (
                        <>
                            <button
                                onClick={handleAccept}
                                disabled={processing}
                                className="w-full md:w-auto px-8 py-4 bg-green-500 hover:bg-green-400 text-black font-black text-lg md:text-xl rounded-full shadow-lg hover:scale-105 transition-all flex items-center justify-center gap-2 animate-pulse"
                            >
                                {processing
                                    ? t('upsell.processing', 'Processando...')
                                    : (upsellCapability.mode === 'one_click'
                                        ? (config.button_text || t('upsell.accept_default', 'Sim, quero adicionar ao meu pedido'))
                                        : primaryUpsellCta)}
                            </button>

                            {/* Decline */}
                            <button
                                onClick={handleDecline}
                                className="text-sm text-gray-500 hover:text-white underline decoration-gray-700 underline-offset-4 transition-colors"
                            >
                                {t('upsell.decline', 'Não, obrigado. Vou perder essa oportunidade.')}
                            </button>
                            <p className="text-[11px] text-gray-500 text-center max-w-md">
                                {t('upsell.order_safe_notice', 'Seu pedido principal continuará confirmado mesmo se você recusar esta oferta.')}
                            </p>
                        </>
                    ) : (
                        <div className="w-full max-w-sm space-y-4 animate-in fade-in slide-in-from-bottom-4">
                            <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                                <h4 className="font-bold mb-4 flex items-center gap-2">
                                    <CreditCard className="w-4 h-4 text-primary" /> {t('upsell.card_details', 'Dados do cartão')}
                                </h4>
                                <p className="text-xs text-gray-400 leading-relaxed mb-4">
                                    {t('upsell.card_form_notice', 'Você está confirmando um pagamento adicional apenas para esta oferta. O pedido principal não será cobrado novamente.')}
                                </p>
                                <input
                                    className="w-full bg-black/30 border border-white/10 rounded mb-3 p-3 text-sm"
                                    placeholder={t('upsell.card_number', 'Número do cartão')}
                                    value={cardData.number}
                                    onChange={e => setCardData({ ...cardData, number: e.target.value })}
                                />
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    <input
                                        className="w-full bg-black/30 border border-white/10 rounded p-3 text-sm"
                                        placeholder="MM"
                                        value={cardData.expiryMonth}
                                        onChange={e => setCardData({ ...cardData, expiryMonth: e.target.value })}
                                    />
                                    <input
                                        className="w-full bg-black/30 border border-white/10 rounded p-3 text-sm"
                                        placeholder="AA"
                                        value={cardData.expiryYear}
                                        onChange={e => setCardData({ ...cardData, expiryYear: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <input
                                        className="w-full bg-black/30 border border-white/10 rounded p-3 text-sm"
                                        placeholder="CVC"
                                        value={cardData.cvc}
                                        onChange={e => setCardData({ ...cardData, cvc: e.target.value })}
                                    />
                                    <input
                                        className="w-full bg-black/30 border border-white/10 rounded p-3 text-sm"
                                        placeholder={t('upsell.cardholder', 'Nome no cartão')}
                                        value={cardData.holderName}
                                        onChange={e => setCardData({ ...cardData, holderName: e.target.value })}
                                    />
                                </div>
                            </div>
                            <Button
                                onClick={() => processPurchase('credit_card', cardData)}
                                className="w-full bg-green-500 hover:bg-green-400 text-black font-bold h-12"
                                disabled={processing}
                            >
                                {processing ? t('upsell.finalizing', 'Finalizando...') : t('upsell.confirm_payment', 'Confirmar pagamento')}
                            </Button>
                        </div>
                    )}
                </div>

                {/* Description */}
                {config.show_description && config.description && (
                    <div className="max-w-2xl text-center text-gray-400 text-sm md:text-base leading-relaxed">
                        {config.description}
                    </div>
                )}

                <div className="flex items-center gap-2 text-xs text-gray-600 mt-8">
                    <Lock className="w-3 h-3" /> {t('upsell.secure_environment', 'Ambiente seguro e criptografado')}
                </div>

            </div>
        </div>
    );
};

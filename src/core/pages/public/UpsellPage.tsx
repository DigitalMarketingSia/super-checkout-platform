import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { loadStripe, type Stripe, type StripeCardNumberElement } from '@stripe/stripe-js';
import { Elements, CardCvcElement, CardExpiryElement, CardNumberElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { useTranslation } from 'react-i18next';
import { CheckCircle, CreditCard, Lock, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Loading } from '../../components/ui/Loading';
import { resolveUpsellGatewayCapability, type UpsellGatewayCapability } from '../../config/upsellCapabilities';
import { paymentService } from '../../services/paymentService';
import { supabase } from '../../services/supabase';
import { storage } from '../../services/storageService';
import { Checkout, Gateway, Order, Product } from '../../types';
import { getApiUrl } from '../../utils/apiUtils';
import { translatePaymentError } from '../../utils/errorTranslator';

const getUpsellOrderSessionKey = (orderId?: string) => `upsell-original-order:${orderId || 'unknown'}`;

const stripeElementOptions = {
    style: {
        base: { color: '#FFFFFF', fontSize: '14px', '::placeholder': { color: '#9CA3AF' } },
        invalid: { color: '#F87171' },
    },
};

function StripeUpsellForm(props: {
    processing: boolean;
    holderName: string;
    customerEmail: string;
    customerPhone?: string;
    errorMessage: string;
    onHolderNameChange: (value: string) => void;
    onError: (message: string) => void;
    onSubmit: (paymentMethodId: string) => Promise<void>;
}) {
    const stripe = useStripe();
    const elements = useElements();
    const { t } = useTranslation('public');

    const submit = async () => {
        props.onError('');
        if (!stripe || !elements) {
            props.onError(t('upsell.gateway_init_error', 'O Stripe ainda está carregando. Tente novamente em alguns segundos.'));
            return;
        }
        const cardNumberElement = elements.getElement(CardNumberElement) as unknown as StripeCardNumberElement | null;
        if (!cardNumberElement) {
            props.onError(t('upsell.card_form_not_found', 'Não foi possível carregar o formulário seguro do cartão.'));
            return;
        }
        const { error, paymentMethod } = await stripe.createPaymentMethod({
            type: 'card',
            card: cardNumberElement,
            billing_details: {
                name: props.holderName || undefined,
                email: props.customerEmail || undefined,
                phone: props.customerPhone || undefined,
            },
        });
        if (error || !paymentMethod?.id) {
            props.onError(translatePaymentError(error?.code, error?.decline_code, error?.message || t('upsell.payment_error', 'Erro ao processar pagamento.')));
            return;
        }
        await props.onSubmit(paymentMethod.id);
    };

    return (
        <div className="w-full max-w-sm space-y-4">
            <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                <h4 className="font-bold mb-4 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-primary" /> {t('upsell.card_details', 'Dados do cartão')}
                </h4>
                <p className="text-xs text-gray-400 leading-relaxed mb-4">
                    {t('upsell.card_form_notice', 'Você está confirmando um pagamento adicional apenas para esta oferta. O pedido principal não será cobrado novamente.')}
                </p>
                <input className="w-full bg-black/30 border border-white/10 rounded mb-3 p-3 text-sm" placeholder={t('upsell.cardholder', 'Nome no cartão')} value={props.holderName} onChange={(e) => props.onHolderNameChange(e.target.value)} />
                <div className="w-full bg-black/30 border border-white/10 rounded mb-3 p-3"><CardNumberElement options={stripeElementOptions} /></div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="w-full bg-black/30 border border-white/10 rounded p-3"><CardExpiryElement options={stripeElementOptions} /></div>
                    <div className="w-full bg-black/30 border border-white/10 rounded p-3"><CardCvcElement options={stripeElementOptions} /></div>
                </div>
                {props.errorMessage && <p className="text-sm text-amber-300 leading-relaxed">{props.errorMessage}</p>}
            </div>
            <Button onClick={submit} className="w-full bg-green-500 hover:bg-green-400 text-black font-bold h-12" disabled={props.processing || !stripe}>
                {props.processing ? t('upsell.finalizing', 'Finalizando...') : t('upsell.confirm_payment', 'Confirmar pagamento')}
            </Button>
        </div>
    );
}

export const UpsellPage = () => {
    const { orderId } = useParams<{ orderId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useTranslation('public');
    const originalStatusSignature = new URLSearchParams(location.search).get('sig') || '';
    const appendOriginalSignature = useCallback((path: string) => {
        if (!originalStatusSignature) return path;
        return `${path}${path.includes('?') ? '&' : '?'}sig=${encodeURIComponent(originalStatusSignature)}`;
    }, [originalStatusSignature]);

    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [originalOrder, setOriginalOrder] = useState<Order | null>(null);
    const [checkout, setCheckout] = useState<Checkout | null>(null);
    const [gateway, setGateway] = useState<Gateway | null>(null);
    const [upsellProduct, setUpsellProduct] = useState<Product | null>(null);
    const [serverCapability, setServerCapability] = useState<UpsellGatewayCapability | null>(null);
    const [pixCode, setPixCode] = useState('');
    const [showCardForm, setShowCardForm] = useState(false);
    const [cardFormError, setCardFormError] = useState('');
    const [cardFormNotice, setCardFormNotice] = useState('');
    const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
    const [error, setError] = useState('');
    const [cardData, setCardData] = useState({ number: '', holderName: '', expiryMonth: '', expiryYear: '', cvc: '' });

    useEffect(() => {
        const load = async () => {
            try {
                if (!orderId) return;
                let order: any = null;
                try {
                    const cached = sessionStorage.getItem(getUpsellOrderSessionKey(orderId));
                    if (cached) order = JSON.parse(cached);
                } catch (storageError) {
                    console.warn('[UpsellPage] Failed to restore original order context:', storageError);
                }
                if (!order) {
                    const response = await supabase.from('orders').select('*').eq('id', orderId).single();
                    if (response.error || !response.data) throw response.error || new Error('Order not found');
                    order = response.data;
                }
                const mappedOrder: Order = { ...order, amount: order.total || order.amount };
                setOriginalOrder(mappedOrder);
                if (order?.upsell_capability_snapshot) setServerCapability(order.upsell_capability_snapshot);

                const chk = await storage.getPublicCheckout(order.checkout_id);
                if (!chk || !chk.config.upsell?.active) {
                    navigate(appendOriginalSignature(`/thank-you/${orderId}`));
                    return;
                }
                setCheckout(chk);
                setGateway(chk.gateway_id ? await storage.getPublicGateway(chk.gateway_id) : null);

                const prod = await storage.getPublicProduct(chk.config.upsell.product_id);
                if (!prod) {
                    navigate(appendOriginalSignature(`/thank-you/${orderId}`));
                    return;
                }
                setUpsellProduct(prod);
            } catch (loadError) {
                console.error(loadError);
                setError(t('upsell.load_error', 'Erro ao carregar oferta.'));
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [orderId, navigate, t, appendOriginalSignature]);

    useEffect(() => {
        if (gateway?.name === 'stripe' && gateway.public_key) {
            setStripePromise(loadStripe(gateway.public_key));
            return;
        }
        setStripePromise(null);
    }, [gateway?.name, gateway?.public_key]);

    const confirmStripeNextAction = useCallback(async (
        clientSecret?: string | null,
        paymentMethodId?: string | null,
        paymentOrderId?: string | null,
        paymentSignature?: string | null,
    ) => {
        const finalizeStripePayment = async (paymentIntentId?: string | null) => {
            if (!paymentOrderId || !paymentSignature || !paymentIntentId) {
                return {
                    ok: false,
                    message: t('upsell.payment_finalization_missing', 'O pagamento foi autenticado, mas faltam dados para concluir a liberação. Tente novamente.'),
                };
            }

            for (let attempt = 1; attempt <= 3; attempt += 1) {
                let payload: any = null;

                try {
                    const response = await fetch(getApiUrl('/api/system?action=finalize-stripe-payment'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            orderId: paymentOrderId,
                            sig: paymentSignature,
                            paymentIntentId,
                        }),
                    });

                    payload = await response.json().catch(() => null);
                    if (response.ok && payload?.status === 'paid') {
                        return { ok: true };
                    }

                    if (response.ok && payload?.status === 'failed') {
                        return {
                            ok: false,
                            message: t('upsell.payment_failed_after_auth', 'O pagamento adicional foi recusado depois da autenticação.'),
                        };
                    }
                } catch (finalizeError) {
                    console.error('[UpsellPage] Failed to finalize Stripe payment:', finalizeError);
                }

                if (attempt < 3) {
                    await new Promise((resolve) => window.setTimeout(resolve, attempt * 1200));
                    continue;
                }

                return {
                    ok: false,
                    message:
                        payload?.authorized === false
                            ? t('upsell.payment_finalization_denied', 'A confirmação final do pagamento foi bloqueada. Recarregue a página e tente novamente.')
                            : t('upsell.payment_finalization_pending', 'O pagamento foi autenticado, mas a confirmação final ainda não chegou. Aguarde alguns segundos e tente novamente.'),
                };
            }

            return {
                ok: false,
                message: t('upsell.payment_finalization_pending', 'O pagamento foi autenticado, mas a confirmação final ainda não chegou. Aguarde alguns segundos e tente novamente.'),
            };
        };

        if (!clientSecret) {
            setCardFormError(t('upsell.additional_auth_missing', 'O Stripe não retornou a confirmação necessária para concluir este pagamento.'));
            setShowCardForm(true);
            return false;
        }
        if (!stripePromise) {
            setCardFormError(t('upsell.gateway_init_error', 'O Stripe ainda está carregando. Tente novamente em alguns segundos.'));
            setShowCardForm(true);
            return false;
        }

        const stripe = await stripePromise;
        if (!stripe || typeof stripe.confirmCardPayment !== 'function') {
            setCardFormError(t('upsell.gateway_init_error', 'O Stripe ainda está carregando. Tente novamente em alguns segundos.'));
            setShowCardForm(true);
            return false;
        }

        const { error: confirmationError, paymentIntent } = await stripe.confirmCardPayment(
            clientSecret,
            paymentMethodId ? { payment_method: paymentMethodId } : undefined,
        );
        if (confirmationError) {
            setCardFormError(translatePaymentError(confirmationError.code, confirmationError.decline_code, confirmationError.message || t('upsell.payment_error', 'Erro ao processar pagamento.')));
            setShowCardForm(true);
            return false;
        }

        if (paymentIntent?.status !== 'succeeded' && paymentIntent?.status !== 'processing') {
            setCardFormError(t('upsell.payment_not_confirmed', 'O banco não confirmou este pagamento adicional. Revise os dados e tente novamente.'));
            setShowCardForm(true);
            return false;
        }

        const finalizationResult = await finalizeStripePayment(paymentIntent?.id);
        if (!finalizationResult.ok) {
            setCardFormError(finalizationResult.message || t('upsell.payment_finalization_pending', 'O pagamento foi autenticado, mas a confirmação final ainda não chegou. Aguarde alguns segundos e tente novamente.'));
            return false;
        }

        return true;
    }, [stripePromise, t]);

    useEffect(() => {
        const loadEligibility = async () => {
            if (!orderId || !originalStatusSignature) return;
            try {
                const response = await fetch(getApiUrl(`/api/upsell-eligibility?orderId=${encodeURIComponent(orderId)}&sig=${encodeURIComponent(originalStatusSignature)}`));
                if (!response.ok) return;
                const payload = await response.json();
                if (payload?.authorized && payload?.capability) setServerCapability(payload.capability);
            } catch (eligibilityError) {
                console.warn('[UpsellPage] Failed to load upsell eligibility:', eligibilityError);
            }
        };
        loadEligibility();
    }, [orderId, originalStatusSignature]);

    const upsellCapability = serverCapability || resolveUpsellGatewayCapability({ gatewayName: gateway?.name, paymentMethod: originalOrder?.payment_method });
    const configuredUpsellButtonText = checkout?.config?.upsell?.button_text?.trim();
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
    const originalGatewayLabel = gateway?.name === 'stripe' ? 'Stripe' : gateway?.name === 'mercado_pago' ? 'Mercado Pago' : t('upsell.gateway_unknown', 'Gateway padrão');
    const trustModeDescription = upsellCapability.mode === 'not_immediate'
        ? t('upsell.not_immediate_mode_desc', 'Este método não será oferecido imediatamente para evitar confusão ou dupla cobrança percebida após o pedido principal.')
        : upsellCapability.mode === 'one_click'
            ? t('upsell.one_click_mode_desc', 'Identificamos um método reutilizável elegível. Se você aceitar, o sistema tentará adicionar o item ao pedido com a menor fricção possível.')
            : upsellCapability.mode === 'light_confirmation'
                ? t('upsell.saved_method_mode_desc', 'Reconhecemos o método {{method}} usado no pedido principal. O gateway ainda pode solicitar uma confirmação adicional antes de concluir este item.', { method: savedProfileLabel || originalPaymentMethodLabel })
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
    const displayTrustModeDescription = upsellCapability.original_payment_method === 'pix' || upsellCapability.mode === 'not_immediate'
        ? trustModeDescription
        : t('upsell.card_mode_reconfirm_desc', 'Seu pedido principal jÃ¡ foi confirmado. Se vocÃª aceitar esta oferta, vamos abrir a confirmaÃ§Ã£o segura apenas do item adicional.');
    const canAttemptSavedStripeCharge = gateway?.name === 'stripe' && originalOrder?.payment_method === 'credit_card' && upsellCapability.reusable_profile_available && upsellCapability.supports_off_session_charge;

    const processPurchase = async (method: 'credit_card' | 'pix', cardDetails?: typeof cardData, options?: { stripePaymentMethodId?: string; useSavedPaymentMethod?: boolean }) => {
        if (!originalOrder || !upsellProduct || !checkout) return;
        setProcessing(true);
        setCardFormError('');
        try {
            const result = await paymentService.processPayment({
                checkoutId: checkout.id,
                offerId: 'upsell',
                amount: upsellProduct.price_real || 0,
                customerName: originalOrder.customer_name,
                customerEmail: originalOrder.customer_email,
                customerPhone: originalOrder.customer_phone,
                customerCpf: originalOrder.customer_cpf,
                gatewayId: checkout.gateway_id,
                paymentMethod: method,
                currency: checkout.currency || 'BRL',
                items: [{ name: upsellProduct.name, price: upsellProduct.price_real || 0, quantity: 1, type: 'upsell', product_id: upsellProduct.id }],
                customerUserId: originalOrder.customer_user_id,
                cardData: cardDetails,
                stripePaymentMethodId: options?.stripePaymentMethodId,
                originalOrderId: originalOrder.id,
                useSavedPaymentMethod: options?.useSavedPaymentMethod,
            });
            if (result.success) {
                if (result.upsellCapability) {
                    setServerCapability(result.upsellCapability);
                }
                if (result.requiresAction) {
                    const confirmed = await confirmStripeNextAction(
                        result.clientSecret,
                        result.paymentMethodId,
                        result.orderId,
                        result.statusSignature,
                    );
                    if (!confirmed) {
                        setProcessing(false);
                        return;
                    }
                }
                if (result.pixData) {
                    setPixCode(result.pixData.qr_code);
                    setProcessing(false);
                } else {
                    const signedQuery = result.statusSignature ? `&sig=${encodeURIComponent(result.statusSignature)}` : '';
                    const originalSignatureQuery = originalStatusSignature ? `&origSig=${encodeURIComponent(originalStatusSignature)}` : '';
                    navigate(`/thank-you/${result.orderId}?upsell=true${signedQuery}${originalSignatureQuery}`);
                }
                return;
            }
            if (result.requiresPaymentForm) {
                if (result.upsellCapability) {
                    setServerCapability(result.upsellCapability);
                }
                setCardFormNotice(result.message || t('upsell.saved_method_fallback_notice', 'O banco pediu uma confirmação adicional. Revise o cartão abaixo para concluir apenas este item adicional.'));
                setShowCardForm(true);
                setProcessing(false);
                return;
            }
            alert(t('upsell.payment_declined', 'Pagamento recusado: {{message}}', { message: result.message }));
            setProcessing(false);
        } catch (purchaseError) {
            console.error(purchaseError);
            alert(t('upsell.payment_error', 'Erro ao processar pagamento.'));
            setProcessing(false);
        }
    };

    const handleAccept = async () => {
        if (!originalOrder || !upsellProduct || !checkout) return;
        setProcessing(true);
        try {
            if (upsellCapability.mode === 'not_immediate') {
                alert(t('upsell.not_immediate_error', 'Este método de pagamento ainda não suporta oferta imediata com segurança.'));
                setProcessing(false);
                return;
            }
            setCardFormError('');
            setCardFormNotice('');
            if (originalOrder.payment_method === 'pix') {
                await processPurchase('pix');
            } else if (canAttemptSavedStripeCharge) {
                await processPurchase('credit_card', undefined, { useSavedPaymentMethod: true });
            } else {
                setCardData((current) => ({
                    ...current,
                    holderName: current.holderName || originalOrder.customer_name || '',
                }));
                setShowCardForm(true);
                setProcessing(false);
            }
        } catch (acceptError) {
            console.error(acceptError);
            alert(t('upsell.process_error', 'Erro ao processar. Tente novamente.'));
            setProcessing(false);
        }
    };

    if (loading) return <Loading label={t('upsell.loading', 'Carregando oferta')} />;
    if (error) return <div className="min-h-screen bg-black flex items-center justify-center text-white">{error}</div>;
    if (pixCode) {
        return (
            <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
                <div className="bg-[#111] p-8 rounded-2xl border border-white/10 max-w-md w-full text-center space-y-6">
                    <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto"><CheckCircle className="w-8 h-8 text-green-500" /></div>
                    <div>
                        <h2 className="text-2xl font-bold mb-2">{t('upsell.reserved_title', 'Oferta reservada!')}</h2>
                        <p className="text-gray-400">{t('upsell.reserved_desc', 'Escaneie o QR Code abaixo para concluir o pagamento do item adicional.')}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl mx-auto w-64 h-64 flex items-center justify-center">
                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixCode)}`} className="w-full h-full" />
                    </div>
                    <textarea readOnly value={pixCode} className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-xs text-gray-500 h-24 resize-none" />
                    <Button onClick={() => navigate(appendOriginalSignature(`/thank-you/${orderId}`))} className="w-full">{t('upsell.already_paid', 'Já realizei o pagamento')}</Button>
                </div>
            </div>
        );
    }

    const config = checkout?.config.upsell!;
    return (
        <div className="min-h-screen bg-[#05050A] text-white">
            <div className="max-w-[800px] mx-auto px-4 py-8 md:py-12 flex flex-col items-center gap-8">
                <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden"><div className="bg-green-500 h-full w-[80%]"></div></div>
                {config.show_title && <h1 className="text-2xl md:text-4xl font-extrabold text-center leading-tight"><span className="text-primary">{config.title || t('upsell.special_offer', 'Oferta especial')}</span></h1>}
                {config.show_subtitle && <p className="text-lg md:text-xl text-gray-300 text-center max-w-2xl">{config.subtitle || t('upsell.default_subtitle', 'Não feche essa página! Tenho algo exclusivo para você.')}</p>}
                {config.show_media && config.media_url && (
                    <div className="w-full aspect-video bg-black rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
                        {config.media_type === 'video'
                            ? <iframe src={config.media_url.replace('watch?v=', 'embed/')} className="w-full h-full" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
                            : <img src={config.media_url} className="w-full h-full object-cover" />}
                    </div>
                )}
                <div className="w-full bg-[#111] border-2 border-primary/30 p-6 md:p-8 rounded-2xl flex flex-col items-center gap-6 shadow-[0_0_40px_rgba(138,43,226,0.1)]">
                    <div className="w-full rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 md:p-5 text-left">
                        <div className="flex items-center gap-2 text-emerald-300 text-[10px] font-black uppercase tracking-[0.3em] mb-3"><ShieldCheck className="w-4 h-4" />{t('upsell.main_order_confirmed', 'Pedido principal confirmado')}</div>
                        <p className="text-sm text-white leading-relaxed">{t('upsell.main_order_confirmed_desc', 'Sua compra anterior já está garantida. Esta oferta é opcional e não substitui o pedido que você acabou de pagar.')}</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                            <div className="rounded-xl bg-black/20 border border-white/5 p-3"><p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-black mb-1">{t('upsell.original_payment_method', 'Método original')}</p><p className="text-sm font-bold text-white">{originalPaymentMethodLabel}</p></div>
                            <div className="rounded-xl bg-black/20 border border-white/5 p-3"><p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-black mb-1">{t('upsell.gateway_label', 'Gateway')}</p><p className="text-sm font-bold text-white">{originalGatewayLabel}</p></div>
                        </div>
                        <p className="mt-4 text-xs text-gray-200 leading-relaxed">{displayTrustModeDescription}</p>
                        {savedProfileLabel && <div className="mt-4 rounded-xl bg-black/20 border border-white/5 p-3"><p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-black mb-1">{t('upsell.saved_method_label', 'Método detectado')}</p><p className="text-sm font-bold text-white">{savedProfileLabel}</p></div>}
                    </div>
                    <div className="text-center">
                        <p className="text-sm text-gray-400 uppercase tracking-widest mb-2 font-bold">{t('upsell.order_summary', 'Resumo do pedido')}</p>
                        <h3 className="text-xl font-bold">{upsellProduct?.name}</h3>
                        <p className="text-2xl font-black text-green-400 mt-2">R$ {upsellProduct?.price_real?.toFixed(2)}</p>
                    </div>
                    {!showCardForm ? (
                        <>
                            <button onClick={handleAccept} disabled={processing} className="w-full md:w-auto px-8 py-4 bg-green-500 hover:bg-green-400 text-black font-black text-lg md:text-xl rounded-full shadow-lg hover:scale-105 transition-all flex items-center justify-center gap-2 animate-pulse">
                                {processing ? t('upsell.processing', 'Processando...') : (upsellCapability.original_payment_method === 'pix' || upsellCapability.mode === 'not_immediate' ? primaryUpsellCta : (configuredUpsellButtonText || t('upsell.accept_default', 'Sim, quero adicionar ao meu pedido')))}
                            </button>
                            <button onClick={() => navigate(appendOriginalSignature(`/thank-you/${orderId}`))} className="text-sm text-gray-500 hover:text-white underline decoration-gray-700 underline-offset-4 transition-colors">{t('upsell.decline', 'Não, obrigado. Vou perder essa oportunidade.')}</button>
                            <p className="text-[11px] text-gray-500 text-center max-w-md">{t('upsell.order_safe_notice', 'Seu pedido principal continuará confirmado mesmo se você recusar esta oferta.')}</p>
                        </>
                    ) : (
                        <>
                            {cardFormNotice && <div className="w-full max-w-sm rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100 leading-relaxed">{cardFormNotice}</div>}
                            {gateway?.name === 'stripe' ? (
                                stripePromise ? (
                                    <Elements stripe={stripePromise} options={{ mode: 'payment', currency: (checkout?.currency || 'BRL').toLowerCase(), amount: Math.max(100, Math.round((upsellProduct?.price_real || 0) * 100)), appearance: { theme: 'night', variables: { colorPrimary: '#22C55E', colorBackground: 'transparent', colorText: '#FFFFFF', colorDanger: '#F87171' } } }}>
                                        <StripeUpsellForm
                                            processing={processing}
                                            holderName={cardData.holderName || originalOrder?.customer_name || ''}
                                            customerEmail={originalOrder?.customer_email || ''}
                                            customerPhone={originalOrder?.customer_phone}
                                            errorMessage={cardFormError}
                                            onHolderNameChange={(value) => setCardData({ ...cardData, holderName: value })}
                                            onError={setCardFormError}
                                            onSubmit={async (stripePaymentMethodId) => processPurchase('credit_card', undefined, { stripePaymentMethodId })}
                                        />
                                    </Elements>
                                ) : <Loading label={t('upsell.loading_gateway', 'Carregando formulário seguro')} />
                            ) : (
                                <div className="w-full max-w-sm space-y-4">
                                    <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                                        <h4 className="font-bold mb-4 flex items-center gap-2"><CreditCard className="w-4 h-4 text-primary" /> {t('upsell.card_details', 'Dados do cartão')}</h4>
                                        <p className="text-xs text-gray-400 leading-relaxed mb-4">{t('upsell.card_form_notice', 'Você está confirmando um pagamento adicional apenas para esta oferta. O pedido principal não será cobrado novamente.')}</p>
                                        <input className="w-full bg-black/30 border border-white/10 rounded mb-3 p-3 text-sm" placeholder={t('upsell.card_number', 'Número do cartão')} value={cardData.number} onChange={(e) => setCardData({ ...cardData, number: e.target.value })} />
                                        <div className="grid grid-cols-2 gap-3 mb-3">
                                            <input className="w-full bg-black/30 border border-white/10 rounded p-3 text-sm" placeholder="MM" value={cardData.expiryMonth} onChange={(e) => setCardData({ ...cardData, expiryMonth: e.target.value })} />
                                            <input className="w-full bg-black/30 border border-white/10 rounded p-3 text-sm" placeholder="AA" value={cardData.expiryYear} onChange={(e) => setCardData({ ...cardData, expiryYear: e.target.value })} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <input className="w-full bg-black/30 border border-white/10 rounded p-3 text-sm" placeholder="CVC" value={cardData.cvc} onChange={(e) => setCardData({ ...cardData, cvc: e.target.value })} />
                                            <input className="w-full bg-black/30 border border-white/10 rounded p-3 text-sm" placeholder={t('upsell.cardholder', 'Nome no cartão')} value={cardData.holderName} onChange={(e) => setCardData({ ...cardData, holderName: e.target.value })} />
                                        </div>
                                        {cardFormError && <p className="text-sm text-amber-300 leading-relaxed mt-3">{cardFormError}</p>}
                                    </div>
                                    <Button onClick={() => processPurchase('credit_card', cardData)} className="w-full bg-green-500 hover:bg-green-400 text-black font-bold h-12" disabled={processing}>{processing ? t('upsell.finalizing', 'Finalizando...') : t('upsell.confirm_payment', 'Confirmar pagamento')}</Button>
                                </div>
                            )}
                        </>
                    )}
                </div>
                {config.show_description && config.description && <div className="max-w-2xl text-center text-gray-400 text-sm md:text-base leading-relaxed">{config.description}</div>}
                <div className="flex items-center gap-2 text-xs text-gray-600 mt-8"><Lock className="w-3 h-3" /> {t('upsell.secure_environment', 'Ambiente seguro e criptografado')}</div>
            </div>
        </div>
    );
};

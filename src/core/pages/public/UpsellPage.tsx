import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { loadStripe, type Stripe, type StripeCardNumberElement } from '@stripe/stripe-js';
import { Elements, CardCvcElement, CardExpiryElement, CardNumberElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { useTranslation } from 'react-i18next';
import { Check, CheckCircle, Clock, Copy, CreditCard, Loader2, Lock, Package, QrCode, ShieldCheck, Sliders } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Loading } from '../../components/ui/Loading';
import { collectCheckoutRoutingGatewayIds, getAllowedGatewayIdsForPaymentMethod } from '../../config/paymentRouting';
import { resolveUpsellGatewayCapability, type UpsellGatewayCapability } from '../../config/upsellCapabilities';
import { paymentService } from '../../services/paymentService';
import { supabase } from '../../services/supabase';
import { storage } from '../../services/storageService';
import { Checkout, Gateway, Order, PaymentMethodType, Product } from '../../types';
import { getApiUrl } from '../../utils/apiUtils';
import { formatPaymentCardNumberInput, formatPaymentCardSecurityCodeInput, MAX_PAYMENT_CARD_INPUT_LENGTH } from '../../utils/paymentCardFormatting';
import { translatePaymentError } from '../../utils/errorTranslator';
import { getRuntimeMode } from '../../config/runtimeMode';
import { demoDataService } from '../../services/demoDataService';

const debugUpsellPayment = (...args: unknown[]) => {
    if (import.meta.env.DEV) {
        console.debug(...args);
    }
};

const getUpsellOrderSessionKey = (orderId?: string) => `upsell-original-order:${orderId || 'unknown'}`;
const getUpsellPixSessionKey = (orderId?: string) => `upsell-pix-context:${orderId || 'unknown'}`;
const toPixQrImageSrc = (value?: string | null) => {
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    return value.startsWith('data:image') ? value : `data:image/png;base64,${value}`;
};

const extractYouTubeId = (url?: string | null) => {
    const value = String(url || '').trim();
    if (!value) return '';

    const match = value.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?/]+)/i);
    return match?.[1] || '';
};

const resolveYouTubeEmbedUrl = (url?: string | null) => {
    const value = String(url || '').trim();
    if (!value) return '';
    if (/youtube\.com\/embed\//i.test(value)) return value;

    const videoId = extractYouTubeId(value);
    if (videoId) return `https://www.youtube.com/embed/${videoId}`;

    return /^https?:\/\//i.test(value) ? value : '';
};

const resolveYouTubeThumbnailUrl = (url?: string | null) => {
    const videoId = extractYouTubeId(url);
    return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '';
};

const resolveUpsellCardImageUrl = (product?: Product | null, config?: Checkout['config']['upsell']) => {
    const productImageUrl = String(product?.imageUrl || '').trim();
    if (productImageUrl) return productImageUrl;

    const configuredMediaUrl = String(config?.media_url || '').trim();
    if (!configuredMediaUrl) return '';

    if (config?.media_type === 'image') {
        return configuredMediaUrl;
    }

    return resolveYouTubeThumbnailUrl(configuredMediaUrl);
};

const mergeUniqueGateways = (gateways: Array<Gateway | null | undefined>) => {
    const byId = new Map<string, Gateway>();

    gateways.forEach((gateway) => {
        if (!gateway?.id) return;
        byId.set(gateway.id, gateway);
    });

    return Array.from(byId.values());
};

const getUpsellGatewayMethodCandidates = (paymentMethod?: string | null): PaymentMethodType[] => {
    switch (String(paymentMethod || '').trim().toLowerCase()) {
        case 'pix':
            return ['pix'];
        case 'apple_pay':
            return ['apple_pay', 'credit_card'];
        case 'google_pay':
            return ['google_pay', 'credit_card'];
        case 'boleto':
            return ['boleto', 'credit_card'];
        case 'credit_card':
        default:
            return ['credit_card'];
    }
};

const resolvePreferredUpsellGateway = (params: {
    checkout?: Checkout | null;
    gateways: Gateway[];
    paymentMethod?: string | null;
    preferredGatewayId?: string | null;
    preferredGatewayName?: string | null;
}) => {
    if (!params.checkout || params.gateways.length === 0) {
        return null;
    }

    const preferredGatewayId = String(params.preferredGatewayId || '').trim();
    if (preferredGatewayId) {
        const exactGateway = params.gateways.find((gateway) => gateway.id === preferredGatewayId) || null;
        if (exactGateway) {
            return exactGateway;
        }
    }

    const candidateGatewayIds = getUpsellGatewayMethodCandidates(params.paymentMethod)
        .flatMap((paymentMethod) => getAllowedGatewayIdsForPaymentMethod({
            config: params.checkout?.config || null,
            gatewayId: params.checkout?.gateway_id || null,
            backupGatewayId: params.checkout?.backup_gateway_id || null,
            paymentMethod,
            gateways: params.gateways,
        }))
        .filter((gatewayId, index, array) => array.indexOf(gatewayId) === index);

    const preferredGatewayName = String(params.preferredGatewayName || '').trim().toLowerCase();
    if (preferredGatewayName && preferredGatewayName !== 'unknown') {
        const preferredByRoute = candidateGatewayIds
            .map((gatewayId) => params.gateways.find((gateway) => gateway.id === gatewayId) || null)
            .find((gateway) => String(gateway?.name || gateway?.provider || '').trim().toLowerCase() === preferredGatewayName);

        if (preferredByRoute) {
            return preferredByRoute;
        }
    }

    const routedGateway = candidateGatewayIds
        .map((gatewayId) => params.gateways.find((gateway) => gateway.id === gatewayId) || null)
        .find((gateway): gateway is Gateway => Boolean(gateway));

    if (routedGateway) {
        return routedGateway;
    }

    if (preferredGatewayName && preferredGatewayName !== 'unknown') {
        const fallbackByName = params.gateways.find(
            (gateway) => String(gateway.name || gateway.provider || '').trim().toLowerCase() === preferredGatewayName,
        ) || null;
        if (fallbackByName) {
            return fallbackByName;
        }
    }

    return params.gateways.find((gateway) => gateway.id === params.checkout?.gateway_id) || params.gateways[0] || null;
};

const stripeElementOptions = {
    style: {
        base: { color: '#FFFFFF', fontSize: '14px', '::placeholder': { color: '#9CA3AF' } },
        invalid: { color: '#F87171' },
    },
};

const mercadoPagoUpsellInputClassName = 'w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-gray-800 placeholder:text-gray-400 shadow-sm outline-none transition-all focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/20';
const upsellFormSubmitButtonClassName = 'w-full !bg-[#10B981] hover:!bg-[#059669] disabled:!bg-gray-400 !text-white font-bold h-12 shadow-lg shadow-green-500/30 focus:!ring-[#10B981]';

type UpsellCardBrand = 'visa' | 'mastercard' | 'elo' | 'amex' | 'hipercard' | 'diners' | 'discover' | 'default';

const upsellCardStyles: Record<UpsellCardBrand, { gradient: string; logo: string; textColor: string }> = {
    visa: { gradient: 'from-[#1A1F71] to-[#0D47A1]', logo: 'VISA', textColor: 'text-white' },
    mastercard: { gradient: 'from-[#EB001B] to-[#F79E1B]', logo: 'MASTERCARD', textColor: 'text-white' },
    elo: { gradient: 'from-[#FFCB05] to-[#000000]', logo: 'ELO', textColor: 'text-white' },
    amex: { gradient: 'from-[#006FCF] to-[#003366]', logo: 'AMEX', textColor: 'text-white' },
    hipercard: { gradient: 'from-[#D32F2F] to-[#B71C1C]', logo: 'HIPERCARD', textColor: 'text-white' },
    diners: { gradient: 'from-[#0079BE] to-[#00457C]', logo: 'DINERS', textColor: 'text-white' },
    discover: { gradient: 'from-[#FF6000] to-[#CC4D00]', logo: 'DISCOVER', textColor: 'text-white' },
    default: { gradient: 'from-gray-900 to-gray-800', logo: 'CARD', textColor: 'text-white' },
};

const normalizeUpsellCardBrand = (brand?: string | null): UpsellCardBrand => {
    const normalized = String(brand || '').trim().toLowerCase();
    switch (normalized) {
        case 'visa':
            return 'visa';
        case 'master':
        case 'mastercard':
            return 'mastercard';
        case 'elo':
            return 'elo';
        case 'amex':
        case 'american_express':
        case 'american express':
            return 'amex';
        case 'hipercard':
            return 'hipercard';
        case 'diners':
        case 'diners_club':
            return 'diners';
        case 'discover':
            return 'discover';
        default:
            return 'default';
    }
};

const detectUpsellCardBrand = (cardNumber: string): UpsellCardBrand => {
    const cleaned = cardNumber.replace(/\D/g, '');
    if (/^(636368|438935|504175|451416|636297|5067|4576|4011)/.test(cleaned)) return 'elo';
    if (/^(606282|3841)/.test(cleaned)) return 'hipercard';
    if (/^3[47]/.test(cleaned)) return 'amex';
    if (/^(36|38|30[0-5])/.test(cleaned)) return 'diners';
    if (/^5[1-5]/.test(cleaned) || /^2(22[1-9]|2[3-9][0-9]|[3-6][0-9]{2}|7[0-1][0-9]|720)/.test(cleaned)) return 'mastercard';
    if (/^(6011|65|64[4-9])/.test(cleaned)) return 'discover';
    if (/^4/.test(cleaned)) return 'visa';
    return 'default';
};

const formatUpsellCardPreviewNumber = (cardNumber?: string | null, last4?: string | null) => {
    const digits = String(cardNumber || '').replace(/\D/g, '');
    if (digits) {
        const padded = digits.padEnd(16, '•').slice(0, 16);
        return padded.match(/.{1,4}/g)?.join(' ') || '•••• •••• •••• ••••';
    }

    const maskedLast4 = String(last4 || '').replace(/\D/g, '').slice(-4);
    if (maskedLast4) {
        return `•••• •••• •••• ${maskedLast4}`;
    }

    return '•••• •••• •••• ••••';
};

const formatUpsellExpiryPreview = (month?: string | number | null, year?: string | number | null) => {
    const rawMonth = String(month ?? '').replace(/\D/g, '').slice(0, 2);
    const rawYear = String(year ?? '').replace(/\D/g, '');
    const normalizedMonth = rawMonth ? rawMonth.padStart(2, '0') : '••';
    const normalizedYear = rawYear ? rawYear.slice(-2).padStart(2, '0') : '••';
    return `${normalizedMonth}/${normalizedYear}`;
};

const formatUpsellInstallmentLabel = (amount: number, currency?: string | null) => {
    const normalizedCurrency = String(currency || 'BRL').trim().toUpperCase() || 'BRL';

    let formattedAmount = `${amount.toFixed(2)}`;
    try {
        formattedAmount = new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: normalizedCurrency,
            minimumFractionDigits: 2,
        }).format(amount || 0);
    } catch (formatError) {
        console.warn('[UpsellPage] Failed to format installment label currency:', formatError);
    }

    return normalizedCurrency === 'BRL'
        ? `1x de ${formattedAmount} (À vista)`
        : `1x de ${formattedAmount}`;
};

const formatUpsellExpiryInput = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
};

function UpsellCardPreview(props: {
    brand?: string | null;
    cardNumber?: string | null;
    last4?: string | null;
    holderName?: string | null;
    expMonth?: string | number | null;
    expYear?: string | number | null;
    cvc?: string | null;
    flipped?: boolean;
    onToggle?: () => void;
}) {
    const resolvedBrand = props.cardNumber ? detectUpsellCardBrand(props.cardNumber) : normalizeUpsellCardBrand(props.brand);
    const cardStyle = upsellCardStyles[resolvedBrand];
    const displayNumber = formatUpsellCardPreviewNumber(undefined, props.last4);
    const displayExpiry = formatUpsellExpiryPreview(props.expMonth, props.expYear);
    const displayHolder = String(props.holderName || '').trim().toUpperCase() || 'NOME DO TITULAR';
    const displayCvc = String(props.cvc || '').trim() || '123';

    return (
        <div className="w-full max-w-[280px] mx-auto">
            <div className="w-full h-[176px] relative cursor-pointer group" style={{ perspective: '1000px' }} onClick={props.onToggle}>
                <div
                    className="w-full h-full relative transition-transform duration-700"
                    style={{ transformStyle: 'preserve-3d', transform: props.flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
                >
                    <div className={`absolute w-full h-full bg-gradient-to-br ${cardStyle.gradient} rounded-xl shadow-xl p-4 text-white flex flex-col justify-between z-10 transition-all duration-500`} style={{ backfaceVisibility: 'hidden' }}>
                        <div className="flex justify-between items-start">
                            <div className="w-10 h-7 bg-yellow-500/80 rounded-md border-2 border-white" />
                            <span className={`font-mono text-base italic font-bold ${cardStyle.textColor}`}>{cardStyle.logo}</span>
                        </div>
                        <div>
                            <p className="font-mono text-base tracking-widest shadow-black drop-shadow-md flex items-center gap-2">
                                {displayNumber}
                                <ShieldCheck className="w-3.5 h-3.5 text-white/50" />
                            </p>
                        </div>
                        <div className="flex justify-between items-end">
                            <div>
                                <p className="text-[7px] uppercase text-gray-400">Titular</p>
                                <p className="font-medium uppercase text-xs tracking-wide">{displayHolder}</p>
                            </div>
                            <div>
                                <p className="text-[7px] uppercase text-gray-400">Validade</p>
                                <p className="font-medium text-xs tracking-widest">{displayExpiry}</p>
                            </div>
                        </div>
                    </div>
                    <div className="absolute w-full h-full bg-gray-800 rounded-xl shadow-xl overflow-hidden" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                        <div className="w-full h-8 bg-black mt-4" />
                        <div className="p-4">
                            <div className="bg-white h-6 w-full flex items-center justify-end px-2">
                                <span className="font-mono text-sm text-gray-900">{displayCvc}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

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
            <Button onClick={submit} className={upsellFormSubmitButtonClassName} disabled={props.processing || !stripe}>
                {props.processing ? t('upsell.finalizing', 'Finalizando...') : t('upsell.confirm_payment', 'Confirmar pagamento')}
            </Button>
        </div>
    );
}

function MercadoPagoSavedCardUpsellForm(props: {
    processing: boolean;
    publicKey: string;
    cardId: string;
    brand?: string | null;
    last4?: string | null;
    holderName?: string | null;
    expMonth?: number | null;
    expYear?: number | null;
    errorMessage: string;
    onError: (message: string) => void;
    onUseAnotherCard: () => void;
    onSubmit: (cardToken: string) => Promise<void>;
    amount: number;
    currency?: string | null;
}) {
    const { t } = useTranslation('public');
    const containerIdRef = useRef(`mp-upsell-security-code-${Math.random().toString(36).slice(2, 10)}`);
    const mpRef = useRef<any>(null);
    const securityFieldRef = useRef<any>(null);
    const [ready, setReady] = useState(false);
    const [cardFlipped, setCardFlipped] = useState(false);

    useEffect(() => {
        props.onError('');
        setReady(false);

        if (!props.publicKey || !props.cardId) {
            props.onError(t('upsell.gateway_init_error', 'O gateway ainda está carregando. Tente novamente em alguns segundos.'));
            return;
        }

        const MercadoPagoGlobal = (window as any).MercadoPago;
        if (!MercadoPagoGlobal) {
            props.onError(t('upsell.gateway_init_error', 'O gateway ainda está carregando. Tente novamente em alguns segundos.'));
            return;
        }

        try {
            const mp = new MercadoPagoGlobal(props.publicKey, { locale: 'pt-BR' });
            const securityField = mp.fields.create('securityCode', {
                placeholder: 'CVC',
                style: {
                    fontSize: '15px',
                    color: '#374151',
                    fontFamily: 'Inter, sans-serif',
                },
            });

            securityField.mount(containerIdRef.current);
            mpRef.current = mp;
            securityFieldRef.current = securityField;
            setReady(true);
        } catch (sdkError) {
            debugUpsellPayment('[UpsellPage] Failed to initialize Mercado Pago saved card field.', sdkError);
            props.onError(t('upsell.gateway_init_error', 'O gateway ainda está carregando. Tente novamente em alguns segundos.'));
        }

        return () => {
            try {
                securityFieldRef.current?.unmount?.();
                securityFieldRef.current?.destroy?.();
            } catch (cleanupError) {
                debugUpsellPayment('[UpsellPage] Failed to cleanup Mercado Pago security field.', cleanupError);
            } finally {
                securityFieldRef.current = null;
                mpRef.current = null;
            }
        };
    }, [props.cardId, props.onError, props.publicKey, t]);

    const submit = async () => {
        props.onError('');
        if (!ready || !mpRef.current?.fields?.createCardToken) {
            props.onError(t('upsell.gateway_init_error', 'O gateway ainda está carregando. Tente novamente em alguns segundos.'));
            return;
        }

        try {
            const tokenResponse = await mpRef.current.fields.createCardToken({
                cardId: props.cardId,
            });

            if (!tokenResponse?.id) {
                props.onError(t('upsell.payment_error', 'Erro ao processar pagamento.'));
                return;
            }

            await props.onSubmit(tokenResponse.id);
        } catch (sdkError: any) {
            debugUpsellPayment('[UpsellPage] Failed to tokenize Mercado Pago saved card.', sdkError);
            props.onError(t('upsell.payment_error', 'Erro ao processar pagamento.'));
        }
    };

    const savedCardLabel = props.brand && props.last4
        ? `${String(props.brand).toUpperCase()} •••• ${props.last4}`
        : t('upsell.saved_method_label', 'Cartão salvo');
    const expirationLabel = props.expMonth && props.expYear
        ? `${String(props.expMonth).padStart(2, '0')}/${String(props.expYear).slice(-2)}`
        : null;
    const installmentLabel = formatUpsellInstallmentLabel(props.amount, props.currency);

    return (
        <div className="w-full max-w-[280px] mx-auto space-y-3 pt-2">
            <p className="text-xs text-gray-400 leading-relaxed">
                {t('upsell.saved_card_cvv_notice', 'Confirme apenas o CVC para adicionar este item. O pedido principal não será cobrado novamente.')}
            </p>

            <UpsellCardPreview
                brand={props.brand}
                last4={props.last4}
                holderName={props.holderName}
                expMonth={props.expMonth}
                expYear={props.expYear}
                flipped={cardFlipped}
                onToggle={() => setCardFlipped((current) => !current)}
            />

            <div
                className={`${mercadoPagoUpsellInputClassName} bg-white shadow-sm`}
                onClick={() => setCardFlipped(true)}
                onFocusCapture={() => setCardFlipped(true)}
            >
                <div id={containerIdRef.current} className="w-full min-h-[24px]" />
            </div>

            <div className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-700 text-sm bg-gray-50">
                {installmentLabel}
            </div>

            <div className="text-[11px] text-gray-500 text-center">
                {savedCardLabel}
                {expirationLabel ? ` • ${t('upsell.saved_card_expires', 'Validade {{expiry}}', { expiry: expirationLabel })}` : ''}
            </div>

            {props.errorMessage && (
                <p className="text-sm text-amber-300 leading-relaxed">{props.errorMessage}</p>
            )}

            <Button onClick={submit} className={upsellFormSubmitButtonClassName} disabled={props.processing || !ready}>
                {props.processing ? t('upsell.finalizing', 'Finalizando...') : t('upsell.confirm_payment', 'Confirmar pagamento')}
            </Button>

            <button
                onClick={props.onUseAnotherCard}
                type="button"
                className="w-full text-sm text-gray-500 underline decoration-gray-700 underline-offset-4 transition-colors hover:text-white"
            >
                {t('upsell.use_another_card', 'Usar outro cartão')}
            </button>
        </div>
    );
}

function MercadoPagoManualUpsellForm(props: {
    processing: boolean;
    notice: string;
    errorMessage: string;
    cardData: { number: string; holderName: string; expiryMonth: string; expiryYear: string; cvc: string };
    onCardDataChange: (value: { number: string; holderName: string; expiryMonth: string; expiryYear: string; cvc: string }) => void;
    amount: number;
    currency?: string | null;
    onSubmit: () => void;
}) {
    const { t } = useTranslation('public');
    const installmentLabel = formatUpsellInstallmentLabel(props.amount, props.currency);
    const [cardFlipped, setCardFlipped] = useState(false);
    const expiryValue = props.cardData.expiryMonth || props.cardData.expiryYear
        ? `${props.cardData.expiryMonth}/${props.cardData.expiryYear}`.replace(/^\/|\/$/g, '')
        : '';
    const cardBrand = detectUpsellCardBrand(props.cardData.number);

    return (
        <div className="w-full max-w-[280px] mx-auto space-y-3 pt-2">
            {props.notice ? (
                <div className="text-xs text-gray-400 leading-relaxed text-left">
                    {props.notice}
                </div>
            ) : null}

            <UpsellCardPreview
                brand={cardBrand}
                cardNumber={props.cardData.number}
                holderName={props.cardData.holderName}
                expMonth={props.cardData.expiryMonth}
                expYear={props.cardData.expiryYear}
                cvc={props.cardData.cvc}
                flipped={cardFlipped}
                onToggle={() => setCardFlipped((current) => !current)}
            />

            <form autoComplete="off" data-form-type="other" onSubmit={(event) => event.preventDefault()} className="space-y-3">
                <div>
                <input
                    type="text"
                    className={mercadoPagoUpsellInputClassName}
                    placeholder={t('upsell.card_number', 'Número do cartão')}
                    value={props.cardData.number}
                    onChange={(e) => props.onCardDataChange({ ...props.cardData, number: formatPaymentCardNumberInput(e.target.value) })}
                    autoComplete="new-password"
                    name="upsell-billing-reference"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    inputMode="numeric"
                    maxLength={MAX_PAYMENT_CARD_INPUT_LENGTH}
                    onFocus={() => setCardFlipped(false)}
                />
                </div>

                <div className="grid grid-cols-[1fr_80px] gap-3">
                    <input
                        type="text"
                        className={mercadoPagoUpsellInputClassName}
                        placeholder="MM/AA"
                        maxLength={5}
                        value={expiryValue}
                        onChange={(e) => {
                            const formatted = formatUpsellExpiryInput(e.target.value);
                            const [expiryMonth = '', expiryYear = ''] = formatted.split('/');
                            props.onCardDataChange({ ...props.cardData, expiryMonth, expiryYear });
                        }}
                        autoComplete="new-password"
                        name="upsell-validity-reference"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        spellCheck={false}
                        autoCorrect="off"
                        autoCapitalize="off"
                        inputMode="numeric"
                        onFocus={() => setCardFlipped(false)}
                    />
                    <input
                        type="text"
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-800 placeholder:text-gray-400 shadow-sm outline-none transition-all focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/20"
                        placeholder="CVV"
                        maxLength={4}
                        value={props.cardData.cvc}
                        onChange={(e) => props.onCardDataChange({ ...props.cardData, cvc: formatPaymentCardSecurityCodeInput(e.target.value) })}
                        autoComplete="new-password"
                        name="upsell-security-reference"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        spellCheck={false}
                        autoCorrect="off"
                        autoCapitalize="off"
                        inputMode="numeric"
                        onFocus={() => setCardFlipped(true)}
                    />
                </div>
            </form>

            <div className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-700 text-sm bg-gray-50">
                {installmentLabel}
            </div>

            {props.errorMessage && (
                <p className="text-sm text-amber-300 leading-relaxed">{props.errorMessage}</p>
            )}

            <Button onClick={props.onSubmit} className={upsellFormSubmitButtonClassName} disabled={props.processing}>
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
    const runtimeMode = getRuntimeMode();
    const isDemoRuntime = runtimeMode === 'demo';
    const originalStatusSignature = new URLSearchParams(location.search).get('sig') || '';
    const appendOriginalSignature = useCallback((path: string) => {
        if (!originalStatusSignature) return path;
        return `${path}${path.includes('?') ? '&' : '?'}sig=${encodeURIComponent(originalStatusSignature)}`;
    }, [originalStatusSignature]);

    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [originalOrder, setOriginalOrder] = useState<Order | null>(null);
    const [checkout, setCheckout] = useState<Checkout | null>(null);
    const [checkoutGateways, setCheckoutGateways] = useState<Gateway[]>([]);
    const [upsellProduct, setUpsellProduct] = useState<Product | null>(null);
    const [serverCapability, setServerCapability] = useState<UpsellGatewayCapability | null>(null);
    const [serverGatewayId, setServerGatewayId] = useState('');
    const [pixCode, setPixCode] = useState('');
    const [pixQrImageSrc, setPixQrImageSrc] = useState('');
    const [pixOrderId, setPixOrderId] = useState('');
    const [pixStatusSignature, setPixStatusSignature] = useState('');
    const [pixRedirectTarget, setPixRedirectTarget] = useState('');
    const [pixCopied, setPixCopied] = useState(false);
    const [pixPaymentConfirmed, setPixPaymentConfirmed] = useState(false);
    const [showCardForm, setShowCardForm] = useState(false);
    const [cardFormError, setCardFormError] = useState('');
    const [cardFormNotice, setCardFormNotice] = useState('');
    const [useManualMercadoPagoForm, setUseManualMercadoPagoForm] = useState(false);
    const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
    const [error, setError] = useState('');
    const [cardData, setCardData] = useState({ number: '', holderName: '', expiryMonth: '', expiryYear: '', cvc: '' });
    const pixRedirectedRef = useRef(false);
    const [timeLeft, setTimeLeft] = useState(600); // 10 minutos para escassez

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const formatTimeLeft = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };
    const gateway = resolvePreferredUpsellGateway({
        checkout,
        gateways: checkoutGateways,
        paymentMethod: originalOrder?.payment_method,
        preferredGatewayId: serverGatewayId,
        preferredGatewayName: serverCapability?.gateway,
    });
    const buildUpsellThankYouTarget = useCallback((targetOrderId?: string | null, targetSignature?: string | null) => {
        if (!targetOrderId) {
            return appendOriginalSignature(`/thank-you/${orderId}`);
        }

        const signedQuery = targetSignature ? `&sig=${encodeURIComponent(targetSignature)}` : '';
        const originalSignatureQuery = originalStatusSignature ? `&origSig=${encodeURIComponent(originalStatusSignature)}` : '';
        return `/thank-you/${targetOrderId}?upsell=true${signedQuery}${originalSignatureQuery}`;
    }, [appendOriginalSignature, orderId, originalStatusSignature]);

    const syncUpsellEligibility = useCallback(async (payload: any) => {
        if (!payload?.authorized || !payload?.capability) {
            return null;
        }

        setServerCapability(payload.capability);

        const nextGatewayId = typeof payload.gatewayId === 'string' ? payload.gatewayId.trim() : '';
        setServerGatewayId(nextGatewayId);

        if (nextGatewayId) {
            try {
                const resolvedGateway = await storage.getPublicGateway(nextGatewayId);
                if (resolvedGateway?.id) {
                    setCheckoutGateways((current) => mergeUniqueGateways([...current, resolvedGateway]));
                }
            } catch (gatewayLoadError) {
                console.warn('[UpsellPage] Failed to load effective upsell gateway:', gatewayLoadError);
            }
        }

        return payload.capability as UpsellGatewayCapability;
    }, []);

    useEffect(() => {
        if (!orderId) return;

        try {
            const cached = sessionStorage.getItem(getUpsellPixSessionKey(orderId));
            if (!cached) return;

            const parsed = JSON.parse(cached);
            if (parsed?.pixCode) setPixCode(parsed.pixCode);
            if (parsed?.pixQrImageSrc) setPixQrImageSrc(parsed.pixQrImageSrc);
            if (parsed?.pixOrderId) setPixOrderId(parsed.pixOrderId);
            if (parsed?.pixStatusSignature) setPixStatusSignature(parsed.pixStatusSignature);
        } catch (storageError) {
            console.warn('[UpsellPage] Failed to restore Pix upsell context:', storageError);
        }
    }, [orderId]);

    useEffect(() => {
        if (!orderId || !pixCode || !pixOrderId) return;

        try {
            sessionStorage.setItem(getUpsellPixSessionKey(orderId), JSON.stringify({
            pixCode,
                pixQrImageSrc,
                pixOrderId,
                pixStatusSignature,
            }));
        } catch (storageError) {
            console.warn('[UpsellPage] Failed to persist Pix upsell context:', storageError);
        }
    }, [orderId, pixCode, pixOrderId, pixQrImageSrc, pixStatusSignature]);

    useEffect(() => {
        const load = async () => {
            try {
                if (!orderId) return;
                
                if (orderId === 'preview') {
                    const searchParams = new URLSearchParams(location.search);
                    const pm = searchParams.get('payment_method') || 'credit_card';
                    const gw = searchParams.get('gateway') || 'asaas';
                    const showSaved = searchParams.get('saved') !== 'false';
                    
                    setOriginalOrder({
                        id: 'preview',
                        checkout_id: 'preview-checkout',
                        payment_method: pm as any,
                        customer_name: 'João Silva',
                        customer_email: 'joao.silva@example.com',
                        total: 1.00,
                        amount: 1.00,
                        status: 'paid',
                        created_at: new Date().toISOString()
                    });
                    setCheckout({
                        id: 'preview-checkout',
                        gateway_id: 'preview-gateway',
                        name: 'Preview Checkout',
                        config: {
                            upsell: {
                                active: true,
                                product_id: 'preview-product',
                                show_title: true,
                                title: 'Oferta Especial Exclusiva',
                                show_subtitle: true,
                                subtitle: 'Não feche essa página! Tenho algo exclusivo para você.',
                                show_media: false,
                                show_description: true,
                                benefits: [
                                    'Acesso vitalício sem pagar nada a mais depois',
                                    'Acesso imediato enviado para o seu e-mail',
                                ],
                                description: "Acesso vitalício sem pagar nada a mais depois\nAcesso imediato enviado para o seu e-mail",
                                button_text: 'Sim, quero adicionar ao meu pedido'
                            }
                        } as any
                    });
                    setCheckoutGateways([
                        {
                            id: 'preview-gateway',
                            name: gw as any,
                            active: true,
                            provider: gw as any,
                            config: {}
                        } as any
                    ]);
                    setUpsellProduct({
                        id: 'preview-product',
                        name: 'Master Canva GO',
                        price_real: 10.00,
                        price_fake: 97.00
                    } as any);
                    setServerCapability({
                        authorized: true,
                        original_payment_method: pm as any,
                        mode: pm === 'pix' ? 'not_immediate' : (showSaved ? 'light_confirmation' : 'not_immediate'),
                        reusable_profile_available: showSaved && pm !== 'pix',
                        supports_off_session_charge: showSaved && pm !== 'pix',
                        gateway: gw,
                        saved_profile: showSaved && pm !== 'pix' ? {
                            brand: 'visa',
                            last4: '4242',
                            wallet_type: null,
                            gateway_payment_method_id: 'pm_preview',
                            exp_month: 12,
                            exp_year: 2030
                        } : null
                    });
                    setLoading(false);
                    return;
                }

                setCheckoutGateways([]);
                setServerCapability(null);
                setServerGatewayId('');
                let order: any = null;
                try {
                    const cached = sessionStorage.getItem(getUpsellOrderSessionKey(orderId));
                    if (cached) order = JSON.parse(cached);
                } catch (storageError) {
                    console.warn('[UpsellPage] Failed to restore original order context:', storageError);
                }
                if (!order) {
                    if (isDemoRuntime) {
                        order = await demoDataService.getOrderById(orderId);
                        if (!order) throw new Error('Order not found');
                    } else {
                        const response = await supabase.from('orders').select('*').eq('id', orderId).single();
                        if (response.error || !response.data) throw response.error || new Error('Order not found');
                        order = response.data;
                    }
                }
                const mappedOrder: Order = { ...order, amount: order.total || order.amount };
                setOriginalOrder(mappedOrder);
                if (order?.upsell_capability_snapshot) setServerCapability(order.upsell_capability_snapshot);

                const chk = await storage.getPublicCheckout(order.checkout_id);
                if (!chk || !chk.config.upsell?.active) {
                    navigate(buildUpsellThankYouTarget(orderId, null));
                    return;
                }
                setCheckout(chk);
                const checkoutGatewayIds = collectCheckoutRoutingGatewayIds({
                    config: chk.config || null,
                    gatewayId: chk.gateway_id,
                    backupGatewayId: chk.backup_gateway_id,
                });
                const loadedGateways = mergeUniqueGateways(await Promise.all(
                    checkoutGatewayIds.map((gatewayId) => storage.getPublicGateway(gatewayId)),
                ));
                setCheckoutGateways(loadedGateways);
                setServerGatewayId('');

                const prod = await storage.getPublicProduct(chk.config.upsell.product_id);
                if (!prod) {
                    navigate(buildUpsellThankYouTarget(orderId, null));
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
    }, [buildUpsellThankYouTarget, isDemoRuntime, navigate, orderId, t, location.search]);

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
                await syncUpsellEligibility(payload);
            } catch (eligibilityError) {
                console.warn('[UpsellPage] Failed to load upsell eligibility:', eligibilityError);
            }
        };
        loadEligibility();
    }, [orderId, originalStatusSignature, syncUpsellEligibility]);

    const refreshUpsellCapability = useCallback(async () => {
        if (!orderId || !originalStatusSignature) {
            return serverCapability;
        }

        try {
            const response = await fetch(getApiUrl(`/api/upsell-eligibility?orderId=${encodeURIComponent(orderId)}&sig=${encodeURIComponent(originalStatusSignature)}`));
            if (!response.ok) {
                return serverCapability;
            }

            const payload = await response.json().catch(() => null);
            return await syncUpsellEligibility(payload);
        } catch (eligibilityError) {
            console.warn('[UpsellPage] Failed to refresh upsell eligibility:', eligibilityError);
        }

        return serverCapability;
    }, [orderId, originalStatusSignature, serverCapability, syncUpsellEligibility]);

    const checkPixUpsellStatus = useCallback(async () => {
        if (!pixOrderId || pixRedirectedRef.current || pixRedirectTarget) {
            return;
        }

        try {
            let isPaid = false;

            if (isDemoRuntime) {
                const nextStatus = String(await demoDataService.getOrderStatus(pixOrderId) || '').toLowerCase();
                if (nextStatus === 'paid' || nextStatus === 'approved') {
                    isPaid = true;
                }
            } else {
                if (pixStatusSignature) {
                    const response = await fetch(getApiUrl(`/api/check-status?orderId=${encodeURIComponent(pixOrderId)}&sig=${encodeURIComponent(pixStatusSignature)}&t=${Date.now()}`));
                    const contentType = response.headers.get('content-type');
                    if (response.ok && contentType && contentType.includes('application/json')) {
                        const payload = await response.json().catch(() => null);
                        const nextStatus = String(payload?.status || '').toLowerCase();
                        if (nextStatus === 'paid' || nextStatus === 'approved') {
                            isPaid = true;
                        }
                    }
                }

                if (!isPaid) {
                    const { data } = await supabase.from('orders').select('status').eq('id', pixOrderId).single();
                    const nextStatus = String(data?.status || '').toLowerCase();
                    if (nextStatus === 'paid' || nextStatus === 'approved') {
                        isPaid = true;
                    }
                }
            }

            if (isPaid) {
                setPixPaymentConfirmed(true);
                setPixRedirectTarget(buildUpsellThankYouTarget(pixOrderId, pixStatusSignature));
            }
        } catch (statusError) {
            console.error('[UpsellPage] Failed to verify Pix upsell status:', statusError);
        }
    }, [buildUpsellThankYouTarget, isDemoRuntime, pixOrderId, pixRedirectTarget, pixStatusSignature]);

    useEffect(() => {
        if (!pixCode || !pixOrderId) return;

        void checkPixUpsellStatus();
        const interval = window.setInterval(() => {
            void checkPixUpsellStatus();
        }, 3000);

        const handleVisibilityResume = () => {
            if (document.visibilityState === 'visible') {
                void checkPixUpsellStatus();
            }
        };

        window.addEventListener('focus', handleVisibilityResume);
        document.addEventListener('visibilitychange', handleVisibilityResume);

        return () => {
            window.clearInterval(interval);
            window.removeEventListener('focus', handleVisibilityResume);
            document.removeEventListener('visibilitychange', handleVisibilityResume);
        };
    }, [checkPixUpsellStatus, pixCode, pixOrderId]);

    useEffect(() => {
        if (isDemoRuntime) return;
        if (!pixCode || !pixOrderId || pixRedirectTarget) return;

        const channel = supabase
            .channel(`upsell-pix-order-status-${pixOrderId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'orders',
                    filter: `id=eq.${pixOrderId}`,
                },
                (payload) => {
                    const nextStatus = String(payload.new?.status || '').toLowerCase();
                    if (nextStatus === 'paid' || nextStatus === 'approved') {
                        setPixPaymentConfirmed(true);
                        setPixRedirectTarget(buildUpsellThankYouTarget(pixOrderId, pixStatusSignature));
                    }
                },
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(channel);
        };
    }, [buildUpsellThankYouTarget, isDemoRuntime, pixCode, pixOrderId, pixRedirectTarget, pixStatusSignature]);

    useEffect(() => {
        if (!pixRedirectTarget || pixRedirectedRef.current) return;

        pixRedirectedRef.current = true;
        if (orderId) {
            try {
                sessionStorage.removeItem(getUpsellPixSessionKey(orderId));
            } catch (storageError) {
                console.warn('[UpsellPage] Failed to clear Pix upsell context:', storageError);
            }
        }

        const absoluteTarget = new URL(pixRedirectTarget, window.location.origin).toString();
        const firstAttempt = window.setTimeout(() => {
            window.location.assign(absoluteTarget);
        }, 150);

        const secondAttempt = window.setTimeout(() => {
            if (window.location.pathname.includes(`/upsell/${orderId}`)) {
                window.location.replace(absoluteTarget);
            }
        }, 1600);

        return () => {
            window.clearTimeout(firstAttempt);
            window.clearTimeout(secondAttempt);
        };
    }, [orderId, pixRedirectTarget]);

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
    const originalGatewayName = String(gateway?.name || serverCapability?.gateway || '').trim().toLowerCase();
    const originalGatewayLabel = originalGatewayName === 'stripe'
        ? 'Stripe'
        : originalGatewayName === 'mercado_pago'
            ? 'Mercado Pago'
            : originalGatewayName === 'asaas'
                ? 'Asaas'
                : t('upsell.gateway_unknown', 'Gateway padrão');

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
    const displayTrustModeDescription = upsellCapability.mode === 'not_immediate'
        ? trustModeDescription
        : t('upsell.order_confirmed_notice', 'Seu pedido principal está confirmado. Esta oferta cobra apenas o valor do item adicional.');
    const canAttemptSavedStripeCharge = gateway?.name === 'stripe' && originalOrder?.payment_method === 'credit_card' && upsellCapability.reusable_profile_available && upsellCapability.supports_off_session_charge;
    const canAttemptSavedMercadoPagoCharge = gateway?.name === 'mercado_pago'
        && originalOrder?.payment_method === 'credit_card'
        && upsellCapability.reusable_profile_available
        && Boolean(upsellCapability.saved_profile?.gateway_payment_method_id);

    const processPurchase = async (
        method: 'credit_card' | 'pix',
        cardDetails?: typeof cardData,
        options?: { stripePaymentMethodId?: string; useSavedPaymentMethod?: boolean; mercadoPagoCardToken?: string }
    ) => {
        if (!originalOrder || !upsellProduct || !checkout) return;
        const effectiveGatewayId = gateway?.id || '';
        if (!effectiveGatewayId && orderId !== 'preview') {
            alert(t('upsell.gateway_init_error', 'O gateway ainda está carregando. Tente novamente em alguns segundos.'));
            return;
        }
        if (orderId === 'preview') {
            alert(t('upsell.preview_success_alert', 'Sucesso! (Simulação de compra concluída no modo de visualização)'));
            return;
        }
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
                gatewayId: effectiveGatewayId,
                paymentMethod: method,
                currency: checkout.currency || 'BRL',
                items: [{ name: upsellProduct.name, price: upsellProduct.price_real || 0, quantity: 1, type: 'upsell', product_id: upsellProduct.id }],
                customerUserId: originalOrder.customer_user_id,
                cardData: cardDetails,
                stripePaymentMethodId: options?.stripePaymentMethodId,
                mercadoPagoCardToken: options?.mercadoPagoCardToken,
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
                if (result.redirectUrl) {
                    window.location.href = result.redirectUrl;
                    return;
                }
                if (result.pixData) {
                    setPixCode(result.pixData.qr_code);
                    setPixQrImageSrc(toPixQrImageSrc(result.pixData.qr_code_base64));
                    setPixOrderId(result.orderId || '');
                    setPixStatusSignature(result.statusSignature || '');
                    setPixCopied(false);
                    setPixPaymentConfirmed(false);
                    setPixRedirectTarget('');
                    pixRedirectedRef.current = false;
                    setProcessing(false);
                } else {
                    navigate(buildUpsellThankYouTarget(result.orderId, result.statusSignature || null));
                }
                return;
            }
            if (result.requiresPaymentForm) {
                if (result.upsellCapability) {
                    setServerCapability(result.upsellCapability);
                }
                if (gateway?.name === 'mercado_pago') {
                    setUseManualMercadoPagoForm(true);
                    setCardData((current) => ({
                        ...current,
                        holderName: current.holderName || originalOrder.customer_name || '',
                    }));
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
            let effectiveCapability = serverCapability || upsellCapability;
            if (originalOrder.payment_method === 'credit_card' && gateway?.name === 'mercado_pago' && !effectiveCapability.reusable_profile_available) {
                effectiveCapability = (await refreshUpsellCapability()) || effectiveCapability;
            }

            const shouldAttemptSavedStripeCharge = gateway?.name === 'stripe'
                && originalOrder.payment_method === 'credit_card'
                && effectiveCapability.reusable_profile_available
                && effectiveCapability.supports_off_session_charge;
            const shouldAttemptSavedMercadoPagoCharge = gateway?.name === 'mercado_pago'
                && originalOrder.payment_method === 'credit_card'
                && effectiveCapability.reusable_profile_available
                && Boolean(effectiveCapability.saved_profile?.gateway_payment_method_id);

            if (effectiveCapability.mode === 'not_immediate') {
                alert(t('upsell.not_immediate_error', 'Este método de pagamento ainda não suporta oferta imediata com segurança.'));
                setProcessing(false);
                return;
            }
            setCardFormError('');
            setCardFormNotice('');
            setUseManualMercadoPagoForm(false);
            if (originalOrder.payment_method === 'pix') {
                await processPurchase('pix');
            } else if (shouldAttemptSavedStripeCharge) {
                await processPurchase('credit_card', undefined, { useSavedPaymentMethod: true });
            } else if (shouldAttemptSavedMercadoPagoCharge) {
                setCardFormNotice(t('upsell.saved_card_cvv_notice', 'Confirme apenas o CVC para adicionar este item. O pedido principal não será cobrado novamente.'));
                setShowCardForm(true);
                setProcessing(false);
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

    const handleCopyPixCode = () => {
        navigator.clipboard.writeText(pixCode);
        setPixCopied(true);
        window.setTimeout(() => setPixCopied(false), 2000);
    };

    if (loading) return <Loading label={t('upsell.loading', 'Carregando oferta')} light />;
    if (error) return <div className="min-h-screen bg-black flex items-center justify-center text-white">{error}</div>;
    if (pixCode) {
        return (
            <div className="min-h-screen bg-[#05050A] text-white flex flex-col items-center justify-center p-4">
                <div className="bg-[#111] p-6 md:p-8 rounded-2xl border border-white/10 max-w-md w-full text-center space-y-6 shadow-[0_0_40px_rgba(0,0,0,0.25)]">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${pixPaymentConfirmed ? 'bg-green-500/20' : 'bg-primary/20'}`}>
                        {pixPaymentConfirmed ? <CheckCircle className="w-8 h-8 text-green-500" /> : <QrCode className="w-8 h-8 text-primary" />}
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold mb-2">{t('upsell.reserved_title', 'Oferta reservada!')}</h2>
                        <p className="text-gray-300 leading-relaxed">{t('upsell.reserved_desc', 'Seu pedido principal já foi confirmado. Escaneie o QR Code abaixo apenas para concluir o pagamento do item adicional.')}</p>
                    </div>
                    <div className={`rounded-xl border p-4 text-left ${pixPaymentConfirmed ? 'border-green-400/20 bg-green-400/10' : 'border-primary/20 bg-primary/10'}`}>
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            {pixPaymentConfirmed ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Clock className="w-4 h-4 text-primary" />}
                            {pixPaymentConfirmed ? t('pix.payment_confirmed', 'Pagamento confirmado') : t('pix.waiting_confirmation', 'Aguardando confirmação automática')}
                        </div>
                        <p className="mt-2 text-xs text-gray-300 leading-relaxed">
                            {pixPaymentConfirmed
                                ? t('upsell.pix_redirecting_notice', 'Pagamento detectado. Estamos liberando seus acessos e redirecionando automaticamente.')
                                : t('upsell.pix_auto_redirect_notice', 'Assim que o Pix for aprovado, esta página vai seguir sozinha para o resumo final com todos os acessos.')}
                        </p>
                    </div>
                    <div className="bg-white p-4 rounded-xl mx-auto w-64 h-64 flex items-center justify-center">
                        <img src={pixQrImageSrc || `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(pixCode)}`} className="w-full h-full" />
                    </div>
                    <div className="text-left space-y-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-gray-400">{t('pix.copy_and_paste', 'Pix copia e cola')}</p>
                        <div className="relative">
                            <textarea readOnly value={pixCode} className="w-full bg-black/50 border border-white/10 rounded-lg p-3 pr-28 text-xs text-gray-300 h-28 resize-none" />
                            <button
                                type="button"
                                onClick={handleCopyPixCode}
                                className={`absolute right-2 top-2 px-3 h-9 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${pixCopied ? 'bg-green-500 text-black' : 'bg-primary text-white hover:brightness-110'}`}
                            >
                                {pixCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                {pixCopied ? t('pix.copied', 'Copiado!') : t('pix.copy', 'Copiar')}
                            </button>
                        </div>
                    </div>
                    <div className="space-y-3">
                        <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
                            <Loader2 className={`w-4 h-4 ${pixPaymentConfirmed ? '' : 'animate-spin'}`} />
                            <span>{t('upsell.pix_monitoring_notice', 'Estamos acompanhando o pagamento em tempo real. Você não precisa clicar em nenhum botão.')}</span>
                        </div>
                        <Button onClick={() => void checkPixUpsellStatus()} className="w-full" variant="secondary">{t('upsell.verify_payment_now', 'Verificar pagamento agora')}</Button>
                    </div>
                </div>
            </div>
        );
    }



    const config = checkout?.config.upsell!;
    const currentPrice = Number(upsellProduct?.price_real || 0);
    const rawComparePrice = Number(upsellProduct?.price_fake ?? (config as any).compare_price ?? 0);
    const comparePrice = Number.isFinite(rawComparePrice) && rawComparePrice > currentPrice ? rawComparePrice : null;
    const discountPercentage = comparePrice && currentPrice > 0
        ? Math.max(1, Math.round(((comparePrice - currentPrice) / comparePrice) * 100))
        : null;
    const upsellCardImageUrl = resolveUpsellCardImageUrl(upsellProduct, config);
    const upsellHeroVideoUrl = config.show_media && config.media_type === 'video'
        ? resolveYouTubeEmbedUrl(config.media_url)
        : '';
    const upsellHeroImageUrl = config.show_media && config.media_type === 'image'
        ? String(config.media_url || '').trim() || upsellCardImageUrl
        : '';
    const benefits = config.description && config.description.includes('\n')
        ? config.description.split('\n').filter(Boolean).map(line => line.replace(/^-\s*/, ''))
        : [
            config.description || t('upsell.default_benefit_1', 'Acesso vitalício sem pagar nada a mais depois'),
            t('upsell.default_benefit_2', 'Acesso imediato enviado para o seu e-mail')
          ];
    const configuredBenefits = Array.isArray(config.benefits)
        ? config.benefits.map(item => String(item || '').replace(/^-\s*/, '').trim()).filter(Boolean)
        : [];
    const resolvedBenefits = configuredBenefits.length > 0 ? configuredBenefits : benefits;
    const ctaTextPattern = config.button_text || t('upsell.accept_default', 'Sim, quero adicionar ao meu pedido');
    const ctaTextDesktop = ctaTextPattern.includes('R$') 
        ? ctaTextPattern 
        : `${ctaTextPattern} por apenas R$ ${upsellProduct?.price_real?.toFixed(2)}`;
    const ctaTextMobile = ctaTextPattern.includes('R$') 
        ? ctaTextPattern 
        : `Sim, quero por R$ ${upsellProduct?.price_real?.toFixed(2)}`;

    return (
        <div className="min-h-screen bg-[#05050A] text-white flex flex-col">
            {/* Barra de escassez/urgência de alto contraste com temporizador em destaque */}
            <div className="w-full bg-gradient-to-r from-red-600 to-rose-600 text-white py-2.5 px-4 text-center text-xs font-semibold flex items-center justify-center gap-2 select-none shadow-md z-10">
                <Clock className="w-3.5 h-3.5 text-white animate-pulse" />
                <span className="tracking-wide hidden md:inline">
                    {t('upsell.one_time_alert_text', 'ATENÇÃO: Seu pedido principal está garantido! Esta oportunidade única expira em')}
                </span>
                <span className="tracking-wide inline md:hidden">
                    {t('upsell.one_time_alert_text_mobile', 'Oferta expira em')}
                </span>
                <span className="font-bold bg-white/20 px-2 py-0.5 rounded text-white animate-pulse inline-block tracking-wider font-mono">
                    {formatTimeLeft(timeLeft)}
                </span>
            </div>
            
            {/* Barra de progresso animada encostada de fora a fora */}
            <div className="w-full bg-white/5 h-1.5 overflow-hidden z-10">
                <div 
                    className="bg-gradient-to-r from-red-600 to-rose-600 h-full transition-all duration-1000 ease-out" 
                    style={{ width: `${(timeLeft / 600) * 100}%` }}
                />
            </div>

            <div className="max-w-[650px] mx-auto px-4 py-8 md:py-12 flex flex-col items-center gap-8 w-full flex-grow">
                <div className="flex flex-col items-center gap-2 text-center w-full">
                    {config.show_title && <h1 className="text-2xl md:text-4xl font-extrabold leading-tight text-white">{config.title || t('upsell.special_offer', 'Oferta especial')}</h1>}
                    {config.show_subtitle && <p className="text-lg md:text-xl text-gray-300 max-w-2xl">{config.subtitle || t('upsell.default_subtitle', 'Não feche essa página! Tenho algo exclusivo para você.')}</p>}
                </div>
                {config.show_media && (upsellHeroVideoUrl || upsellHeroImageUrl) && (
                    <div className="w-full aspect-video bg-black rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
                        {upsellHeroVideoUrl
                            ? <iframe src={upsellHeroVideoUrl} className="w-full h-full" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
                            : <img src={upsellHeroImageUrl} className="w-full h-full object-cover" />}
                    </div>
                )}
                {/* Bloco de Confiança Compacto e Elegante (Proporção equilibrada) */}
                <div className="w-full rounded-2xl border border-white/[0.06] bg-[#0A0A0E]/50 p-4 text-xs md:text-sm relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-[3px] h-full bg-gradient-to-b from-emerald-500 via-emerald-500/50 to-transparent" />
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <span className="flex-shrink-0 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="font-bold text-gray-200">
                                    {t('upsell.main_order_confirmed_short', 'Pedido Principal Confirmado')}
                                </span>
                                <span className="text-[9px] md:text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-black uppercase tracking-wider whitespace-nowrap text-center flex items-center justify-center">
                                    {originalGatewayLabel}
                                </span>
                            </div>
                            <div className="flex items-center gap-3 text-gray-400 text-xs">
                                <div className="flex items-center gap-1">
                                    {originalOrder?.payment_method === 'pix' ? <QrCode className="w-3.5 h-3.5" /> : <CreditCard className="w-3.5 h-3.5" />}
                                    <span className="whitespace-nowrap">{originalPaymentMethodLabel}</span>
                                </div>
                                {savedProfileLabel && (
                                    <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-white font-semibold whitespace-nowrap text-center justify-center">
                                        <Lock className="w-3 h-3 text-emerald-400/80 shrink-0" />
                                        <span className="text-[9px] md:text-[10px]">{savedProfileLabel}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <p className="mt-2.5 text-[10px] text-gray-400 leading-relaxed border-t border-white/[0.04] pt-2 flex items-center justify-center gap-1.5 text-center w-full">
                            <Lock className="w-3 h-3 text-gray-500 shrink-0" />
                            <span>{t('upsell.order_confirmed_notice_short', 'Esta oferta cobra apenas o valor desse item adicional.')}</span>
                        </p>
                    </div>

                    {/* Layout de Duas Colunas: Imagem na esquerda, Preço na direita */}
                    <div className="w-full flex flex-col md:flex-row gap-6 md:gap-8 items-center justify-center">
                        {/* Coluna da Esquerda: Imagem ou Mídia Quadrada Compacta */}
                        <div className="w-[140px] md:w-[180px] shrink-0 mx-auto md:mx-0">
                            {upsellCardImageUrl ? (
                                <div className="w-full aspect-square bg-black rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
                                    <img
                                        src={upsellCardImageUrl}
                                        alt={upsellProduct?.name || t('upsell.product_image_alt', 'Imagem do produto adicional')}
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                            ) : (
                                <div className="w-full aspect-square rounded-2xl bg-gradient-to-tr from-white/10 via-white/5 to-transparent border border-white/10 flex flex-col items-center justify-center gap-3 shadow-lg shadow-white/5 p-4 text-center">
                                    <Package className="w-12 h-12 text-gray-500 animate-pulse" />
                                    <span className="text-xs text-gray-500 font-medium">Imagem do Produto</span>
                                </div>
                            )}
                        </div>

                        {/* Coluna da Direita: Preços */}
                        <div className="w-full md:flex-grow flex flex-col gap-4 text-center md:text-left justify-center items-center md:items-start">
                            <div className="space-y-3 w-full flex flex-col items-center md:items-start">
                                <div className="text-center md:text-left">
                                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1 font-bold">{t('upsell.special_opportunity', 'Oportunidade Exclusiva')}</p>
                                    <h3 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-tight">{upsellProduct?.name}</h3>
                                </div>

                                {/* Bloco de Preços Empilhados (Desconto em cima -> Comparação no meio -> Final em baixo) */}
                                <div className="flex flex-col gap-2 items-center md:items-start w-full">
                                    {discountPercentage ? (
                                        <div className="flex justify-center md:justify-start">
                                            <span className="text-[10px] px-2 py-0.5 rounded bg-red-950/60 text-red-400 border border-red-500/20 font-black uppercase tracking-wider">
                                                -{discountPercentage}% DE DESCONTO
                                            </span>
                                        </div>
                                    ) : null}
                                    
                                    <div className="flex flex-col items-center md:items-start gap-1 mt-1.5 w-full">
                                        {comparePrice ? (
                                            <div className="flex items-center gap-1.5 text-xs md:text-sm text-gray-400 font-semibold justify-center md:justify-start">
                                                <span>De</span>
                                                <span className="line-through font-bold text-gray-400">
                                                    R$ {comparePrice.toFixed(2)}
                                                </span>
                                            </div>
                                        ) : null}
                                        <div className="flex items-center gap-1.5 justify-center md:justify-start">
                                            <span className="text-xs md:text-sm text-gray-400 font-semibold">por</span>
                                            <span className="text-3xl md:text-4xl font-black text-green-400">
                                                R$ {upsellProduct?.price_real?.toFixed(2)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {!showCardForm ? (
                        <>
                            <button onClick={handleAccept} disabled={processing} className="w-full md:w-auto px-6 md:px-8 py-3.5 md:py-4 bg-[#10B981] hover:bg-[#059669] text-white font-black text-sm md:text-base lg:text-lg rounded-full shadow-lg hover:scale-105 transition-all flex items-center justify-center gap-2.5 animate-pulse shadow-green-500/10 whitespace-nowrap">
                                {processing ? (
                                    t('upsell.processing', 'Processando...')
                                ) : (
                                    <>
                                        <Lock className="w-5 h-5 shrink-0" />
                                        <span className="hidden md:inline">{upsellCapability.original_payment_method === 'pix' || upsellCapability.mode === 'not_immediate' ? primaryUpsellCta : ctaTextDesktop}</span>
                                        <span className="inline md:hidden">{upsellCapability.original_payment_method === 'pix' || upsellCapability.mode === 'not_immediate' ? primaryUpsellCta : ctaTextMobile}</span>
                                    </>
                                )}
                            </button>
                            <button onClick={() => {
                                if (orderId === 'preview') {
                                    alert(t('upsell.preview_decline_alert', 'Você recusou a oferta no modo de visualização. Redirecionando para a página de obrigado simulada.'));
                                    navigate('/thank-you/preview');
                                    return;
                                }
                                navigate(appendOriginalSignature(`/thank-you/${orderId}`));
                            }} className="text-sm text-gray-500 hover:text-white underline decoration-gray-700 underline-offset-4 transition-colors">{t('upsell.decline', 'Não, obrigado. Vou perder essa oportunidade.')}</button>
                            <p className="text-[11px] text-gray-500 text-center max-w-md">{t('upsell.order_safe_notice', 'Seu pedido principal continuará confirmado mesmo se você recusar esta oferta.')}</p>
                        </>
                    ) : (
                        <>
                            {cardFormNotice && gateway?.name !== 'mercado_pago' && <div className="w-full max-w-sm rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100 leading-relaxed">{cardFormNotice}</div>}
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
                                ) : <Loading label={t('upsell.loading_gateway', 'Carregando formulário seguro')} light />
                            ) : gateway?.name === 'mercado_pago' ? (
                                canAttemptSavedMercadoPagoCharge && !useManualMercadoPagoForm && gateway.public_key && upsellCapability.saved_profile?.gateway_payment_method_id ? (
                                    <MercadoPagoSavedCardUpsellForm
                                        processing={processing}
                                        publicKey={gateway.public_key}
                                        cardId={upsellCapability.saved_profile.gateway_payment_method_id}
                                        brand={upsellCapability.saved_profile.brand}
                                        last4={upsellCapability.saved_profile.last4}
                                        holderName={cardData.holderName || originalOrder?.customer_name || ''}
                                        expMonth={upsellCapability.saved_profile.exp_month}
                                        expYear={upsellCapability.saved_profile.exp_year}
                                        amount={Number(upsellProduct?.price_real || 0)}
                                        currency={checkout?.currency || 'BRL'}
                                        errorMessage={cardFormError}
                                        onError={setCardFormError}
                                        onUseAnotherCard={() => {
                                            setUseManualMercadoPagoForm(true);
                                            setCardFormError('');
                                            setCardFormNotice(t('upsell.card_form_notice', 'Você está confirmando um pagamento adicional apenas para esta oferta. O pedido principal não será cobrado novamente.'));
                                        }}
                                        onSubmit={async (mercadoPagoCardToken) => processPurchase('credit_card', undefined, { useSavedPaymentMethod: true, mercadoPagoCardToken })}
                                    />
                                ) : (
                                    <MercadoPagoManualUpsellForm
                                        processing={processing}
                                        notice={cardFormNotice}
                                        errorMessage={cardFormError}
                                        cardData={cardData}
                                        onCardDataChange={setCardData}
                                        amount={Number(upsellProduct?.price_real || 0)}
                                        currency={checkout?.currency || 'BRL'}
                                        onSubmit={() => processPurchase('credit_card', cardData)}
                                    />
                                )
                            ) : gateway?.name === 'asaas' ? (
                                <div className="w-full max-w-sm space-y-4">
                                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-left">
                                        <h4 className="mb-3 flex items-center gap-2 font-bold"><CreditCard className="w-4 h-4 text-primary" /> {t('upsell.card_details', 'Dados do cartão')}</h4>
                                        <p className="text-sm leading-relaxed text-gray-300">
                                            {t('upsell.asaas_redirect_notice', 'Ao continuar, vamos abrir a etapa segura do Asaas para concluir o pagamento deste item adicional.')}
                                        </p>
                                    </div>
                                    <Button onClick={() => processPurchase('credit_card')} className="w-full bg-green-500 hover:bg-green-400 text-black font-bold h-12" disabled={processing}>{processing ? t('upsell.finalizing', 'Finalizando...') : t('upsell.continue_secure_payment', 'Continuar pagamento seguro')}</Button>
                                </div>
                            ) : (
                                <div className="w-full max-w-sm space-y-4">
                                    <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                                        <h4 className="font-bold mb-4 flex items-center gap-2"><CreditCard className="w-4 h-4 text-primary" /> {t('upsell.card_details', 'Dados do cartão')}</h4>
                                        <p className="text-xs text-gray-400 leading-relaxed mb-4">{t('upsell.card_form_notice', 'Você está confirmando um pagamento adicional apenas para esta oferta. O pedido principal não será cobrado novamente.')}</p>
                                        <input className="w-full bg-black/30 border border-white/10 rounded mb-3 p-3 text-sm" placeholder={t('upsell.card_number', 'Número do cartão')} value={cardData.number} maxLength={MAX_PAYMENT_CARD_INPUT_LENGTH} onChange={(e) => setCardData({ ...cardData, number: formatPaymentCardNumberInput(e.target.value) })} />
                                        <div className="grid grid-cols-2 gap-3 mb-3">
                                            <input className="w-full bg-black/30 border border-white/10 rounded p-3 text-sm" placeholder="MM" value={cardData.expiryMonth} onChange={(e) => setCardData({ ...cardData, expiryMonth: e.target.value })} />
                                            <input className="w-full bg-black/30 border border-white/10 rounded p-3 text-sm" placeholder="AA" value={cardData.expiryYear} onChange={(e) => setCardData({ ...cardData, expiryYear: e.target.value })} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <input className="w-full bg-black/30 border border-white/10 rounded p-3 text-sm" placeholder="CVC" maxLength={4} value={cardData.cvc} onChange={(e) => setCardData({ ...cardData, cvc: formatPaymentCardSecurityCodeInput(e.target.value) })} />
                                            <input className="w-full bg-black/30 border border-white/10 rounded p-3 text-sm" placeholder={t('upsell.cardholder', 'Nome no cartão')} value={cardData.holderName} onChange={(e) => setCardData({ ...cardData, holderName: e.target.value })} />
                                        </div>
                                        {cardFormError && <p className="text-sm text-amber-300 leading-relaxed mt-3">{cardFormError}</p>}
                                    </div>
                                    <Button onClick={() => processPurchase('credit_card', cardData)} className={upsellFormSubmitButtonClassName} disabled={processing}>{processing ? t('upsell.finalizing', 'Finalizando...') : t('upsell.confirm_payment', 'Confirmar pagamento')}</Button>
                                </div>
                            )}
                        </>
                    )}

                    {/* Caixa de Benefícios (Centralizada, com bulletpoints e garantia no rodapé integrado) */}
                    {config.show_description && resolvedBenefits.length > 0 && (
                        <div className="w-full text-left p-5 rounded-2xl bg-[#111] border border-white/[0.04] text-xs text-gray-300 shadow-sm flex flex-col gap-3">
                            <p className="font-bold text-[9px] text-gray-500 uppercase tracking-widest border-b border-white/[0.04] pb-2 text-center">
                                {t('upsell.benefits_included', 'Benefícios inclusos nesta oferta:')}
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1.5 mt-2.5 max-w-lg mx-auto w-full">
                                {resolvedBenefits.map((benefit, idx) => (
                                    <div key={idx} className="text-gray-300 text-[11px] font-semibold py-0.5 px-2 flex items-start justify-start gap-2 text-left md:whitespace-nowrap">
                                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0 mt-1.5" />
                                        <span>{benefit}</span>
                                    </div>
                                ))}
                            </div>
                            
                            {/* Linha de Garantia Integrada */}
                            <div className="border-t border-white/[0.04] pt-3.5 mt-2 flex items-center justify-center gap-2 text-emerald-400 font-bold text-[11px] w-full text-center">
                                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                                <span>
                                    <span className="hidden md:inline">{t('upsell.guarantee_notice', 'Garantia incondicional de satisfação de 7 dias')}</span>
                                    <span className="inline md:hidden">{t('upsell.guarantee_notice_mobile', 'Garantia de 7 dias')}</span>
                                </span>
                            </div>
                        </div>
                    )}
                <div className="flex items-center gap-2 text-xs text-gray-600 mt-8"><Lock className="w-3 h-3" /> {t('upsell.secure_environment', 'Ambiente seguro e criptografado')}</div>
            </div>

            {orderId === 'preview' && (
                <div className="fixed bottom-4 right-4 bg-[#111]/90 backdrop-blur-md border border-white/10 p-4 rounded-xl shadow-2xl z-50 text-left space-y-3 max-w-[280px]">
                    <div className="flex items-center gap-1.5 text-xs font-black uppercase text-emerald-400 tracking-wider">
                        <Sliders className="w-3.5 h-3.5" />
                        Controles do Preview
                    </div>
                    <div className="space-y-2 text-xs">
                        <div>
                            <label className="block text-[10px] text-gray-400 font-bold mb-1">Método Original</label>
                            <select 
                                value={originalOrder?.payment_method || 'credit_card'} 
                                onChange={(e) => {
                                    const pm = e.target.value;
                                    const params = new URLSearchParams(location.search);
                                    params.set('payment_method', pm);
                                    navigate(`?${params.toString()}`, { replace: true });
                                }}
                                className="w-full bg-black border border-white/10 p-1.5 rounded text-white font-semibold"
                            >
                                <option value="credit_card">Cartão de Crédito</option>
                                <option value="pix">Pix</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] text-gray-400 font-bold mb-1">Gateway</label>
                            <select 
                                value={gateway?.name || 'asaas'} 
                                onChange={(e) => {
                                    const gw = e.target.value;
                                    const params = new URLSearchParams(location.search);
                                    params.set('gateway', gw);
                                    navigate(`?${params.toString()}`, { replace: true });
                                }}
                                className="w-full bg-black border border-white/10 p-1.5 rounded text-white font-semibold"
                            >
                                <option value="asaas">Asaas</option>
                                <option value="stripe">Stripe</option>
                                <option value="mercado_pago">Mercado Pago</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] text-gray-400 font-bold mb-1">Cartão Salvo</label>
                            <select 
                                value={upsellCapability.reusable_profile_available ? 'true' : 'false'} 
                                onChange={(e) => {
                                    const saved = e.target.value;
                                    const params = new URLSearchParams(location.search);
                                    params.set('saved', saved);
                                    navigate(`?${params.toString()}`, { replace: true });
                                }}
                                className="w-full bg-black border border-white/10 p-1.5 rounded text-white font-semibold"
                            >
                                <option value="true">Sim (Visa 4242)</option>
                                <option value="false">Não</option>
                            </select>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

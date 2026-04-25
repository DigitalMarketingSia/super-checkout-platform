
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { storage } from '../../services/storageService';
import { paymentService } from '../../services/paymentService';
import { Order, Checkout, Product, CheckoutConfig } from '../../types';
import { Button } from '../../components/ui/Button';
import { CheckCircle, X, Play, Image as ImageIcon, CreditCard, Lock } from 'lucide-react';

import { supabase } from '../../services/supabase';

export const UpsellPage = () => {
    const { orderId } = useParams<{ orderId: string }>();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [originalOrder, setOriginalOrder] = useState<Order | null>(null);
    const [checkout, setCheckout] = useState<Checkout | null>(null);
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

                // 1. Fetch Original Order (Direct Supabase Query for Anon Access)
                // storage.getOrders() fails if user is not logged in (e.g. public checkout)
                const { data: order, error: orderError } = await supabase
                    .from('orders')
                    .select('*')
                    .eq('id', orderId)
                    .single();

                if (orderError || !order) {
                    console.error('Order fetch error:', orderError);
                    setError('Pedido original não encontrado.');
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

                // 2. Fetch Checkout Config
                const chk = await storage.getPublicCheckout(order.checkout_id);
                if (!chk || !chk.config.upsell?.active) {
                    // Redirect to Thank You if upsell not valid
                    navigate(`/thank-you/${orderId}`);
                    return;
                }
                setCheckout(chk);

                // 3. Fetch Upsell Product
                const prod = await storage.getPublicProduct(chk.config.upsell.product_id);
                if (!prod) {
                    navigate(`/thank-you/${orderId}`);
                    return;
                }
                setUpsellProduct(prod);

            } catch (err) {
                console.error(err);
                setError('Erro ao carregar oferta.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [orderId, navigate]);

    const handleAccept = async () => {
        if (!originalOrder || !upsellProduct || !checkout) return;

        setProcessing(true);
        try {
            // Determine Payment Method
            // For now, default to same as original if Pix, or Card Form if Card
            // If original was Boleto, maybe Pix?

            // Logic:
            // If Original = Pix -> Generate Pix immediately (One Click experience)
            // If Original = Card -> Show Card Form (User types CVV etc) -> effectively Two click

            if (originalOrder.payment_method === 'pix') {
                await processPurchase('pix');
            } else {
                setShowCardForm(true); // Open Modal/Form
                setProcessing(false);
            }

        } catch (err) {
            console.error(err);
            alert('Erro ao processar. Tente novamente.');
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
                    navigate(`/thank-you/${result.orderId}?upsell=true`);
                }
            } else {
                alert('Pagamento recusado: ' + result.message);
                setProcessing(false);
            }

        } catch (err) {
            console.error(err);
            alert('Erro ao processar pagamento.');
            setProcessing(false);
        }
    };

    const handleDecline = () => {
        navigate(`/thank-you/${orderId}`);
    };

    if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-white">Carregando oferta...</div>;
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
                        <h2 className="text-2xl font-bold mb-2">Oferta Reservada!</h2>
                        <p className="text-gray-400">Escaneie o QR Code abaixo para concluir o pagamento do item adicional.</p>
                    </div>

                    <div className="bg-white p-4 rounded-xl mx-auto w-64 h-64 flex items-center justify-center">
                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixCode)}`} className="w-full h-full" />
                    </div>

                    <textarea
                        readOnly
                        value={pixCode}
                        className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-xs text-gray-500 h-24 resize-none"
                    />

                    <Button onClick={() => navigate(`/thank-you/${orderId}`)} className="w-full">
                        Já realizei o pagamento
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
                        <span className="text-primary">{config.title || 'Oferta Especial'}</span>
                    </h1>
                )}

                {/* Subtitle */}
                {config.show_subtitle && (
                    <p className="text-lg md:text-xl text-gray-300 text-center max-w-2xl">
                        {config.subtitle || 'Não feche essa página! Tenho algo exclusivo para você.'}
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
                    <div className="text-center">
                        <p className="text-sm text-gray-400 uppercase tracking-widest mb-2 font-bold">Resumo do Pedido</p>
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
                                {processing ? 'Processando...' : (config.button_text || 'SIM, QUERO ADICIONAR AO MEU PEDIDO')}
                            </button>

                            {/* Decline */}
                            <button
                                onClick={handleDecline}
                                className="text-sm text-gray-500 hover:text-white underline decoration-gray-700 underline-offset-4 transition-colors"
                            >
                                Não, obrigado. Vou perder essa oportunidade.
                            </button>
                        </>
                    ) : (
                        <div className="w-full max-w-sm space-y-4 animate-in fade-in slide-in-from-bottom-4">
                            <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                                <h4 className="font-bold mb-4 flex items-center gap-2">
                                    <CreditCard className="w-4 h-4 text-primary" /> Dados do Cartão
                                </h4>
                                <input
                                    className="w-full bg-black/30 border border-white/10 rounded mb-3 p-3 text-sm"
                                    placeholder="Número do Cartão"
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
                                        placeholder="Nome no Cartão"
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
                                {processing ? 'Finalizando...' : 'Confirmar Pagamento'}
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
                    <Lock className="w-3 h-3" /> Ambiente Seguro e Criptografado
                </div>

            </div>
        </div>
    );
};

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { storage } from '../../services/storageService';
import { Checkout, Product, Gateway, Order, OrderStatus, OrderItem, InstallmentOption, GatewayProvider } from '../../types';
import { licenseService, UpgradeIntentContext } from '../../services/licenseService';
import {
  Barcode, Check, Clock, ShieldCheck, Lock, AlertCircle, ShoppingBag, Smartphone, Link2
} from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import type { PaymentRequest } from '@stripe/stripe-js';
import { PaymentRequestButtonElement, Elements, useStripe, useElements, CardNumberElement, CardExpiryElement, CardCvcElement, LinkAuthenticationElement } from '@stripe/react-stripe-js';
import { validateName, validateEmail, validatePhone, validateCPF, maskPhone, maskCPF } from '../../utils/validations';
import { PhoneInput } from '../../components/ui/PhoneInput';
import { AlertModal } from '../../components/ui/Modal';

import { TrackingProvider, useTracking } from '../../context/TrackingContext';
import { translatePaymentError } from '../../utils/errorTranslator';

// --- PREMIUM PAYMENT ICONS (INLINE SVG - EXTRAÍDOS DA TICTO) ---
const PixIcon = ({ className }: { className?: string }) => (
   <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
      <path fill="none" d="M0 0h24v24H0z"></path>
      <path d="M15.45 16.52l-3.01-3.01c-.11-.11-.24-.13-.31-.13s-.2.02-.31.13L8.8 16.53c-.34.34-.87.89-2.64.89l3.71 3.7a3 3 0 004.24 0l3.72-3.71c-.91 0-1.67-.18-2.38-.89zM8.8 7.47l3.02 3.02c.08.08.2.13.31.13s.23-.05.31-.13l2.99-2.99c.71-.74 1.52-.91 2.43-.91l-3.72-3.71a3 3 0 00-4.24 0l-3.71 3.7c1.76 0 2.3.58 2.61.89z"></path>
      <path d="M21.11 9.85l-2.25-2.26H17.6c-.54 0-1.08.22-1.45.61l-3 3c-.28.28-.65.42-1.02.42a1.5 1.5 0 01-1.02-.42L8.09 8.17c-.38-.38-.9-.6-1.45-.6H5.17l-2.29 2.3a3 3 0 000 4.24l2.29 2.3h1.48c.54 0 1.06-.22 1.45-.6l3.02-3.02c.28-.28.65-.42 1.02-.42s.74.14 1.02.42l3.01 3.01c.38.38.9.6 1.45.6h1.26l2.25-2.26a3.042 3.042 0 00-.02-4.29z"></path>
   </svg>
);

const CreditCardIcon = ({ className }: { className?: string }) => (
   <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M20 4H4c-1.103 0-2 .897-2 2v12c0 1.103.897 2 2 2h16c1.103 0 2-.897 2-2V6c0-1.103-.897-2-2-2zM4 18V6h16l.001 12H4z"></path>
      <path d="M6.5 11h3a.5.5 0 0 0 .5-.5v-2a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5v2a.5.5 0 0 0 .5.5zM6 14h6v2.001H6zm7 0h5v2.001h-5z"></path>
   </svg>
);

const AppleIcon = ({ className }: { className?: string }) => (
   <svg viewBox="0 0 448 512" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.3 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.3zM344 86h-.4c-17.4 18.1-30.5 45.1-31.1 69.8 44.6 1.9 66.8-44.1 66.8-44.1-14.4-16.7-32.5-25.7-35.3-25.7z"/>
   </svg>
);

const GoogleIcon = ({ className, monochrome }: { className?: string, monochrome?: boolean }) => (
   <svg viewBox="0 0 48 48" className={className} xmlns="http://www.w3.org/2000/svg">
      <path fill={monochrome ? 'currentColor' : '#4285F4'} d="M46.1 24.5c0-1.5-.1-3.2-.4-4.5H24v9h12.5c-.6 3-2.3 5.5-4.8 7.2v6h7.7c4.5-4.2 7.1-10.4 7.1-17.8z"/>
      <path fill={monochrome ? 'currentColor' : '#34A853'} d="M24 47c6.2 0 11.4-2 15.2-5.6l-7.7-6c-2 1.4-4.7 2.2-7.5 2.2-5.8 0-10.7-3.9-12.4-9.2H3.7v6.1C7.4 42 15 47 24 47z"/>
      <path fill={monochrome ? 'currentColor' : '#FBBC05'} d="M11.6 28.4c-.4-1.3-.7-2.7-.7-4.4s.3-3.1.7-4.4v-6.1H3.7C2.2 16.5 1.5 19.2 1.5 22s.7 5.5 2.2 8.5l7.9-2.1z"/>
      <path fill={monochrome ? 'currentColor' : '#EA4335'} d="M24 9.4c3.4 0 6.4 1.2 8.8 3.4l6.6-6.6C35.4 2.5 30.2.5 24 .5 15 .5 7.4 5.5 3.7 13.5l7.9 6.1C13.3 13.3 18.2 9.4 24 9.4z"/>
   </svg>
);

const CheckoutTracker = () => {
   const { trackPageView, trackInitiateCheckout, isInitialized } = useTracking();
   useEffect(() => {
      // Trigger events on mount (loaded) AND when initialized
      if (isInitialized) {
         trackPageView();
         trackInitiateCheckout();
      }
   }, [isInitialized]);
   return null;
};

type PaymentMethod = 'credit_card' | 'pix' | 'boleto' | 'apple_pay' | 'google_pay';
type ProcessState = 'idle' | 'processing' | 'error' | 'success';

// --- PROCESSING MODAL (UX ESTILO TICTO) ---
const ProcessingModal = ({ 
   isOpen, 
   state, 
   errorDetail, 
   onClose,
   businessName,
   paymentMethod
}: { 
   isOpen: boolean; 
   state: ProcessState; 
   errorDetail?: string | null;
   onClose: () => void;
   businessName: string;
   paymentMethod?: string;
}) => {
   if (!isOpen) return null;

   return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
         <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 relative flex flex-col items-center justify-center min-h-[220px] transform transition-all animate-in zoom-in-95">
            
            {state === 'processing' && (
               <>
                  <h2 className="text-2xl font-bold text-gray-800 mb-6 font-['Inter']">{businessName || 'Processando'}</h2> 
                  <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden mb-6">
                     <div className="w-1/2 h-full bg-gradient-to-r from-pink-500 to-purple-600 rounded-full animate-[progress_1s_ease-in-out_infinite]"></div>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 text-center">Por favor, aguarde...</h3>
                  <p className="text-sm text-gray-500 text-center mt-1">Estamos processando seu pagamento.</p>
               </>
            )}

            {state === 'error' && (
               <>
                  <button 
                     onClick={onClose}
                     className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full p-1.5 transition-colors"
                  >
                     <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                     </svg>
                  </button>
                  <div className="w-20 h-20 rounded-full border-4 border-red-500 flex items-center justify-center mb-6 animate-in zoom-in">
                     <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                     </svg>
                  </div>
                  <h3 className="text-xl font-medium text-[#EF4444] text-center mb-4">Não foi possível processar seu pagamento.</h3>
                  <div className="w-full border border-red-200 bg-red-50/50 rounded-xl p-4 text-center border-dashed">
                     <p className="text-sm text-gray-800 font-medium">{errorDetail || 'Erro desconhecido.'}</p>
                  </div>
               </>
            )}

            {state === 'success' && (
               <>
                  <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6 animate-in zoom-in">
                     <Check className="w-10 h-10 text-green-500" strokeWidth={3} />
                  </div>
                  <h3 className="text-xl font-medium text-green-600 text-center mb-2">
                     {paymentMethod === 'pix' ? 'Pix Gerado!' : 
                      paymentMethod === 'boleto' ? 'Boleto Gerado!' : 
                      'Pagamento Aprovado!'}
                  </h3>
                  <p className="text-sm text-gray-500 text-center">Redirecionando...</p>
               </>
            )}
         </div>

         <style dangerouslySetInnerHTML={{__html: `
            @keyframes progress {
               0% { transform: translateX(-100%); }
               50% { transform: translateX(100%); }
               100% { transform: translateX(-100%); }
            }
         `}} />
      </div>
   );
};

// --- STRIPE ELEMENTS COMPONENTS (SEPARATE FOR PREMIUM UI) ---
const StripeInputWrapper = ({ children, label }: { children: React.ReactNode, label?: string }) => (
   <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium text-gray-500 ml-1">{label}</label>}
      <div className="w-full border border-gray-200 rounded-lg px-4 py-3 outline-none focus-within:border-[#10B981] focus-within:ring-2 focus-within:ring-[#10B981]/20 transition-all bg-white shadow-sm">
         {children}
      </div>
   </div>
);

const strypeElementOptions = {
   style: {
      base: {
         fontSize: '15px',
         color: '#374151',
         fontFamily: 'Inter, sans-serif',
         '::placeholder': {
            color: '#9CA3AF',
         },
      },
      invalid: {
         color: '#EF4444',
      },
   },
};


// Wrapper Component for Stripe Elements
const StripeWrapper = ({ children, checkoutId: propId }: { children: React.ReactNode; checkoutId?: string }) => {
   const { id: paramId } = useParams<{ id: string }>();
   const id = propId || paramId;
   const [stripePromise, setStripePromise] = useState<any>(null);
   const [stripeOptions, setStripeOptions] = useState<any>(null);

   useEffect(() => {
      const loadGateway = async () => {
         if (!id) return;
         try {
            const checkout = await storage.getPublicCheckout(id);
            if (checkout?.gateway_id) {
               const gateway = await storage.getPublicGateway(checkout.gateway_id);
               const product = await storage.getPublicProduct(checkout.product_id);
               
               if (gateway?.name === GatewayProvider.STRIPE && gateway.public_key) {
                  setStripePromise(loadStripe(gateway.public_key));
                  setStripeOptions({
                     mode: 'payment',
                     currency: (product?.currency || 'BRL').toLowerCase(),
                     amount: Math.round((product?.price_real || 1) * 100),
                     appearance: { 
                        theme: 'stripe' as const,
                        variables: {
                           colorPrimary: '#10B981',
                           colorBackground: 'transparent',
                           colorText: '#374151',
                           fontFamily: 'Inter, sans-serif',
                           spacingUnit: '4px',
                           borderRadius: '4px',
                           fontSizeBase: '13.5px' 
                        },
                        labels: 'hidden',
                        rules: {
                           '.Input': {
                              backgroundColor: 'transparent',
                              border: 'none',
                              boxShadow: 'none'
                           },
                           '.Input:focus': {
                              boxShadow: 'none'
                           }
                        }
                     }
                  });
               } else {
                  // If not stripe, we still need to render the children without Elements
                  setStripePromise('not_stripe');
               }
            } else {
               setStripePromise('no_gateway');
            }
         } catch (e) {
            setStripePromise('error');
         }
      };
      loadGateway();
   }, [id]);

   if (!stripePromise) return <div className="min-h-screen flex items-center justify-center bg-[#f9fafb]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#10B981]"></div></div>;

   if (stripePromise === 'not_stripe' || stripePromise === 'no_gateway' || stripePromise === 'error') {
      return <>{children}</>;
   }

   return (
      <Elements stripe={stripePromise} options={stripeOptions}>
         {children}
      </Elements>
   );
};


// --- STRIPE HOOKS BRIDGE ---
const StripeHooksBridge = ({ children, gatewayName }: { children: (stripe: any, elements: any) => React.ReactNode, gatewayName?: string }) => {
   if (gatewayName === GatewayProvider.STRIPE) {
      return <StripeHooksLoader>{children}</StripeHooksLoader>;
   }
   return <>{children(null, null)}</>;
};

const StripeHooksLoader = ({ children }: { children: (stripe: any, elements: any) => React.ReactNode }) => {
   const stripe = useStripe();
   const elements = useElements();
   return <>{children(stripe, elements)}</>;
};

const PublicCheckoutUI = ({ checkoutId: propId, stripe, elements }: { checkoutId?: string, stripe: any, elements: any }) => {
   const { id: paramId } = useParams<{ id: string }>();
   const id = propId || paramId;
   const navigate = useNavigate();

   // Data State
   const [loading, setLoading] = useState(true);
   const [data, setData] = useState<{
      checkout: Checkout;
      product: Product;
      gateway: Gateway;
      bumps: Product[];
   } | null>(null);
   const [error, setError] = useState<string | null>(null);

   // Interaction State
   const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
   const [selectedBumps, setSelectedBumps] = useState<string[]>([]);
   const [timeLeft, setTimeLeft] = useState({ minutes: 15, seconds: 0 });
   const [cardFlipped, setCardFlipped] = useState(false);
   const [isProcessing, setIsProcessing] = useState(false);
   const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});
   const [installmentOptions, setInstallmentOptions] = useState<InstallmentOption[]>([]);
   const [loadingInstallments, setLoadingInstallments] = useState(false);
   const [processState, setProcessState] = useState<ProcessState>('idle');
   const [processError, setProcessError] = useState<string | null>(null);

   const [alertState, setAlertState] = useState<{ isOpen: boolean; title: string; message: string; variant: 'success' | 'error' | 'info' }>({
      isOpen: false,
      title: '',
      message: '',
      variant: 'info'
   });
   const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
   const [walletAvailability, setWalletAvailability] = useState<{applePay?: boolean, googlePay?: boolean, link?: boolean} | null>(null);

   const showAlert = (title: string, message: string, variant: 'success' | 'error' | 'info' = 'info') => {
      setAlertState({ isOpen: true, title, message, variant });
   };

   const closeAlert = () => {
      setAlertState(prev => ({ ...prev, isOpen: false }));
   };

   // Form State
   const [customer, setCustomer] = useState({
      name: '',
      email: '',
      cpf: '',
      phone: '',
      cardNumber: '',
      expiry: '',
      installments: '1',
      cvc: ''
   });

   // Validation State
   const [touched, setTouched] = useState<Record<string, boolean>>({});
   const [errors, setErrors] = useState<Record<string, string>>({});

   // Card Brand Detection
   type CardBrand = 'visa' | 'mastercard' | 'elo' | 'amex' | 'hipercard' | 'diners' | 'discover' | 'default';
   const [cardBrand, setCardBrand] = useState<CardBrand>('default');

   // Detect card brand based on card number
   const detectCardBrand = (cardNumber: string): CardBrand => {
      const cleaned = cardNumber.replace(/\D/g, '');

      // Check more specific patterns first before generic ones

      // Elo: Multiple BIN ranges (check before Visa since some start with 4)
      if (/^(636368|438935|504175|451416|636297|5067|4576|4011)/.test(cleaned)) return 'elo';

      // Hipercard: 606282 or 3841 (check before Diners/Amex)
      if (/^(606282|3841)/.test(cleaned)) return 'hipercard';

      // American Express: 34 or 37 (check before generic 3x patterns)
      if (/^3[47]/.test(cleaned)) return 'amex';

      // Diners: 36, 38, or 300-305
      if (/^(36|38|30[0-5])/.test(cleaned)) return 'diners';

      // Mastercard: 51-55 or 2221-2720 (check before generic 5x patterns)
      if (/^5[1-5]/.test(cleaned) || /^2(22[1-9]|2[3-9][0-9]|[3-6][0-9]{2}|7[0-1][0-9]|720)/.test(cleaned)) return 'mastercard';

      // Discover: 6011, 65, or 644-649
      if (/^(6011|65|64[4-9])/.test(cleaned)) return 'discover';

      // Visa: starts with 4 (generic pattern, check last)
      if (/^4/.test(cleaned)) return 'visa';

      return 'default';
   };

   // Card brand styling configuration
   const cardBrandConfig = {
      visa: {
         gradient: 'from-[#1A1F71] to-[#0D47A1]',
         logo: 'VISA',
         textColor: 'text-white'
      },
      mastercard: {
         gradient: 'from-[#EB001B] to-[#F79E1B]',
         logo: 'MASTERCARD',
         textColor: 'text-white'
      },
      elo: {
         gradient: 'from-[#FFCB05] to-[#000000]',
         logo: 'ELO',
         textColor: 'text-white'
      },
      amex: {
         gradient: 'from-[#006FCF] to-[#003366]',
         logo: 'AMEX',
         textColor: 'text-white'
      },
      hipercard: {
         gradient: 'from-[#D32F2F] to-[#B71C1C]',
         logo: 'HIPERCARD',
         textColor: 'text-white'
      },
      diners: {
         gradient: 'from-[#0079BE] to-[#00457C]',
         logo: 'DINERS',
         textColor: 'text-white'
      },
      discover: {
         gradient: 'from-[#FF6000] to-[#CC4D00]',
         logo: 'DISCOVER',
         textColor: 'text-white'
      },
      default: {
         gradient: 'from-gray-900 to-gray-800',
         logo: 'CARD',
         textColor: 'text-white'
      }
   };

   const currentCardStyle = cardBrandConfig[cardBrand];

   // User State
   const [userId, setUserId] = useState<string | undefined>(undefined);
   const [businessName, setBusinessName] = useState<string>("Super Checkout"); 
   const [supportEmail, setSupportEmail] = useState<string>("");
   const [showLegalFooter, setShowLegalFooter] = useState<boolean>(true);
   const [upgradeIntentToken, setUpgradeIntentToken] = useState<string>('');
   const [upgradeIntentContext, setUpgradeIntentContext] = useState<UpgradeIntentContext | null>(null);
   const [upgradeIntentLoading, setUpgradeIntentLoading] = useState(false);
   const [upgradeIntentError, setUpgradeIntentError] = useState<string | null>(null);

   // Helper to get currency symbol
   const getCurrencySymbol = () => {
      const currency = data?.checkout?.currency || 'BRL';
      switch (currency) {
         case 'USD': return '$';
         case 'EUR': return '€';
         default: return 'R$';
      }
   };

   // Load Data
   useEffect(() => {
      const load = async () => {
         try {
            // 0. Check for Logged In User
            const urlParams = new URLSearchParams(window.location.search);
            const intentToken = urlParams.get('upgrade_intent')?.trim() || '';
            setUpgradeIntentToken(intentToken);

            if (intentToken) {
               setUpgradeIntentLoading(true);
               try {
                  const intentContext = await licenseService.getUpgradeIntentContext(intentToken);
                  setUpgradeIntentContext(intentContext);
                  setUpgradeIntentError(null);
               } catch (intentError: any) {
                  setUpgradeIntentContext(null);
                  setUpgradeIntentError(intentError?.message || 'Nao foi possivel validar o upgrade desta conta.');
               } finally {
                  setUpgradeIntentLoading(false);
               }
            } else {
               setUpgradeIntentContext(null);
               setUpgradeIntentError(null);
               setUpgradeIntentLoading(false);
            }

            const user = await storage.getUser();
            if (user) {
               setUserId(user.id);
            } else {
               const urlUserId = urlParams.get('u');
               if (urlUserId) setUserId(urlUserId);
            }

            // 1. Get Checkout (Public)
            const checkout = await storage.getPublicCheckout(id!);

            if (!checkout) {
               setError("Checkout não encontrado.");
               setLoading(false);
               return;
            }

            if (!checkout.active) {
               setError("Este checkout está inativo no momento.");
               setLoading(false);
               return;
            }             // 1.5 Fetch Business Settings using Checkout's Account/User
             try {
                if (checkout.user_id) {
                   // Fetch Account
                   const { data: account } = await supabase
                      .from('accounts')
                      .select('id')
                      .eq('owner_user_id', checkout.user_id)
                      .single();
 
                   if (account?.id) {                       // Fetch Settings
                       const { data: settings } = await supabase
                          .from('business_settings')
                          .select('business_name, support_email, show_legal_footer')
                          .eq('account_id', account.id)
                          .single();
 
                       if (settings) {
                         if (settings.business_name) setBusinessName(settings.business_name);
                         if (settings.support_email) setSupportEmail(settings.support_email);
                         setShowLegalFooter(settings.show_legal_footer ?? true);
                       }
                   }
                }
             } catch (bsErr) {
                console.warn("Could not load business settings", bsErr);
             }

            // 2. Get Main Product (Public)
            const mainProduct = await storage.getPublicProduct(checkout.product_id);

            // 3. Get Gateway (Public)
            const gateway = await storage.getPublicGateway(checkout.gateway_id);

            if (!mainProduct || !gateway) {
               setError("Configuração inválida de produto ou gateway.");
               setLoading(false);
               return;
            }

            // 4. Resolve Bumps (Public)
            const resolvedBumps: Product[] = [];
            if (checkout.order_bump_ids && checkout.order_bump_ids.length > 0) {
               for (const bumpId of checkout.order_bump_ids) {
                  const bump = await storage.getPublicProduct(bumpId);
                  if (bump) resolvedBumps.push(bump);
               }
            }

            setData({ checkout, product: mainProduct, gateway, bumps: resolvedBumps });

            // Initialize Timer from Config
            if (checkout.config?.timer?.active) {
               setTimeLeft({ minutes: checkout.config.timer.minutes, seconds: 0 });
            }

             setLoading(false);

             // 5. Initialize Stripe Payment Request for Wallets
             if (gateway.name === GatewayProvider.STRIPE && gateway.public_key) {
                const stripeInstance = await loadStripe(gateway.public_key);
                if (stripeInstance) {
                   const pr = stripeInstance.paymentRequest({
                      country: 'BR', 
                      currency: (mainProduct.currency || 'BRL').toLowerCase(),
                      total: {
                         label: mainProduct.name,
                         amount: Math.round((mainProduct.price_real || 0) * 100),
                      },
                      requestPayerName: true,
                      requestPayerEmail: true,
                   });

                   const result = await pr.canMakePayment();
                   if (result) {
                      setPaymentRequest(pr);
                      setWalletAvailability(result);
                   } else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                      // Fake security bypass for localhost UX testing
                      setPaymentRequest(pr);
                      setWalletAvailability({ googlePay: true, applePay: true });
                   }
                }
             }
          } catch (err: any) {
             console.error('Error loading checkout:', err);
             setError("Erro ao carregar checkout. Tente novamente.");
             setLoading(false);
          }
      };
      if (id) {
         load();
      } else {
         setError("Checkout não especificado.");
         setLoading(false);
      }
   }, [id]);

   // Timer Logic
   useEffect(() => {
      if (!data?.checkout?.config?.timer?.active) return;

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
   }, [data]);

   // Validation Helper
   const validateField = (name: string, value: string) => {
      let error = '';
      switch (name) {
         case 'name':
            if (!validateName(value)) error = 'Digite seu nome completo (mínimo 2 palavras)';
            break;
         case 'email':
            if (!validateEmail(value)) error = 'Digite um e-mail válido';
            break;
         case 'phone':
            if (!validatePhone(value)) error = 'Número de WhatsApp inválido';
            break;
         case 'cpf':
            if (!validateCPF(value)) error = 'CPF inválido';
            break;
      }
      return error;
   };

   const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setTouched(prev => ({ ...prev, [name]: true }));
      const error = validateField(name, value);
      setErrors(prev => ({ ...prev, [name]: error }));
   };

   const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      let newValue = value;

      // Apply Masks
      // Phone mask is now handled by PhoneInput component
      if (name === 'cpf') newValue = maskCPF(value);

      setCustomer(prev => ({ ...prev, [name]: newValue }));

      // Real-time validation if touched
      if (touched[name]) {
         const error = validateField(name, newValue);
         setErrors(prev => ({ ...prev, [name]: error }));
      } else {
         // Clear error if user starts typing again (optional UX choice, or wait for blur)
         // For this request: "Enquanto ele digita (onChange)" -> we should validate immediately if touched
         // If not touched, we can wait, OR validate immediately to show success state?
         // Let's validate immediately to enable "Success" state logic
         const error = validateField(name, newValue);
         setErrors(prev => ({ ...prev, [name]: error }));
      }
   };

   const isFormValid = () => {
      if (!data) return false; // Ensure data is loaded before validating

      const requiredFields = [];
      if (config.fields.name) requiredFields.push('name');
      if (config.fields.email) requiredFields.push('email');
      if (config.fields.phone) requiredFields.push('phone');
      if (config.fields.cpf) requiredFields.push('cpf');

      for (const field of requiredFields) {
         // @ts-ignore
         if (!customer[field] || validateField(field, customer[field])) return false;
      }
      return true;
   };

   const toggleBump = (bumpId: string) => {
      setSelectedBumps(prev =>
         prev.includes(bumpId) ? prev.filter(id => id !== bumpId) : [...prev, bumpId]
      );
   };

   const formatCurrency = (value: number | undefined) => {
      if (value === undefined) return '';
      const currency = data?.product?.currency || 'BRL';
      const locale = currency === 'BRL' ? 'pt-BR' : currency === 'USD' ? 'en-US' : 'es-ES';
      return new Intl.NumberFormat(locale, {
         style: 'currency',
         currency: currency,
      }).format(value);
   };

   const calculateTotal = () => {
      if (!data) return 0;
      let total = data.product.price_real || 0;
      selectedBumps.forEach(bumpId => {
         const bump = data.bumps.find(b => b.id === bumpId);
         if (bump) total += (bump.price_real || 0);
      });
      return total;
   };

   const handleSubmit = async () => {
      if (isProcessing || !paymentMethod || !data) return;

      if (upgradeIntentToken && !upgradeIntentContext) {
         setUpgradeIntentError(prev => prev || 'O contexto deste upgrade nao esta valido para continuar.');
         return;
      }

      // 1. Validate Personal Fields (Name, Email, Phone, CPF)
      const newErrors: Record<string, string> = {};
      const newTouched: Record<string, boolean> = {};

      if (config.fields.name) {
         newTouched.name = true;
         const err = validateField('name', customer.name);
         if (err) newErrors.name = err;
      }
      if (config.fields.email) {
         newTouched.email = true;
         const err = validateField('email', customer.email);
         if (err) newErrors.email = err;
      }
      if (config.fields.phone) {
         newTouched.phone = true;
         const err = validateField('phone', customer.phone);
         if (err) newErrors.phone = err;
      }
      if (config.fields.cpf) {
         newTouched.cpf = true;
         const err = validateField('cpf', customer.cpf);
         if (err) newErrors.cpf = err;
      }

      setTouched(prev => ({ ...prev, ...newTouched }));
      setErrors(newErrors);

      if (Object.keys(newErrors).length > 0) {
         const firstErrorField = Object.keys(newErrors)[0];
         const element = document.getElementById(`input-${firstErrorField}`);
         element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
         element?.focus();
         return;
      }

      // --- GATEWAY SPECIFIC PREPARATION ---
      let stripePaymentMethodId: string | undefined = undefined;

      if (paymentMethod === 'credit_card') {
         if (data.gateway.name === GatewayProvider.STRIPE) {
            // ✅ STRIPE ELEMENTS FLOW (PCI-DSS COMPLIANT)
            if (!stripe || !elements) {
               showAlert('Erro', 'O gateway de pagamento não foi inicializado corretamente.', 'error');
               return;
            }

            setIsProcessing(true);

            const cardNumberElement = elements.getElement(CardNumberElement);
            if (!cardNumberElement) {
               showAlert('Erro', 'Formulário de cartão não encontrado.', 'error');
               setIsProcessing(false);
               return;
            }

            // @ts-ignore
            const { error: stripeError, paymentMethod: stripePM } = await stripe.createPaymentMethod({
               type: 'card',
               card: cardNumberElement,
               billing_details: {
                  name: customer.name,
                  email: customer.email,
                  phone: customer.phone,
               },
            });

            if (stripeError) {
               console.error('[Stripe] createPaymentMethod error:', stripeError);
               const translatedError = translatePaymentError(stripeError.code, stripeError.decline_code, stripeError.message);
               showAlert('Erro no Cartão', translatedError, 'error');
               setIsProcessing(false);
               return;
            }

            stripePaymentMethodId = stripePM.id;
         } else {
            // 🔒 LEGACY / MERCADO PAGO FLOW (Manual Validation)
            const cleanCardNumber = customer.cardNumber.replace(/\D/g, '');
            if (!cleanCardNumber || cleanCardNumber.length < 13) {
               showAlert('Erro', 'Por favor, verifique o número do cartão.', 'error');
               return;
            }

            if (!customer.expiry || !customer.expiry.includes('/')) {
               showAlert('Erro', 'Por favor, preencha a validade do cartão (MM/AA).', 'error');
               return;
            }

            const [month, year] = customer.expiry.split('/');
            if (!month || !year || parseInt(month) < 1 || parseInt(month) > 12 || year.length !== 2) {
               showAlert('Erro', 'Data de validade inválida.', 'error');
               return;
            }

            if (!customer.cvc || customer.cvc.length < 3) {
               showAlert('Erro', 'Por favor, verifique o código de segurança (CVC).', 'error');
               return;
            }
         }
      }

      setProcessState('processing');
      setProcessError(null);
      setIsProcessing(true);

      try {
         const totalAmount = calculateTotal();

         // Build items array
         const items: OrderItem[] = [
            {
               name: data.product.name,
               price: data.product.price_real || 0,
               quantity: 1,
               type: 'main',
               product_id: data.product.id
            }
         ];

         selectedBumps.forEach(bumpId => {
            const bump = data.bumps.find(b => b.id === bumpId);
            if (bump) {
               items.push({
                  name: bump.name,
                  price: bump.price_real || 0,
                  quantity: 1,
                  type: 'bump',
                  product_id: bump.id
               });
            }
         });

         // ✅ CALL PAYMENT SERVICE (TRANSPARENT CHECKOUT)
         const { paymentService } = await import('../../services/paymentService');

         const result = await paymentService.processPayment({
            checkoutId: data.checkout.id,
            offerId: data.checkout.offer_id || 'direct',
            amount: totalAmount,
            customerName: customer.name || 'Cliente',
            customerEmail: customer.email || 'cliente@email.com',
            customerPhone: customer.phone,
            customerCpf: customer.cpf,
            gatewayId: data.gateway.id,
            paymentMethod: paymentMethod,
            items: items,
            selectedBumps: selectedBumps, // Passando IDs para cálculo seguro no backend
            currency: data.product.currency || 'BRL',
            customerUserId: userId,
            upgradeIntentToken: upgradeIntentToken || undefined,
            stripePaymentMethodId: stripePaymentMethodId, // TOKEN PASSADO AQUI
            installments: Number(customer.installments || 1),
            // Pass Card Data only if it's NOT a Stripe payment
            cardData: (paymentMethod === 'credit_card' && !stripePaymentMethodId) ? {
               number: customer.cardNumber,
               holderName: customer.name,
               expiryMonth: customer.expiry.split('/')[0],
               expiryYear: customer.expiry.split('/')[1],
               cvc: customer.cvc
            } : undefined
         });

         console.log('[PublicCheckout] processPayment returned:', result);

         if (result.success) {
            console.log('[PublicCheckout] Payment success. Method:', paymentMethod);
            
            // Treat pending/in_process credit cards correctly (wait UI, redirect but maybe show feedback)
            if (paymentMethod === 'credit_card' && result.message === 'in_process') {
               // Optional: specific in_process message
            }
            
            setProcessState('success');
            
            // Artificial delay to show success state in the modal
            setTimeout(() => {
               // Handle Success Types
               if (paymentMethod === 'pix' && result.pixData) {
                  console.log('[PublicCheckout] Navigating to Pix page...');
                  const pixUrl = result.statusSignature
                     ? `/pagamento/pix/${result.orderId}?sig=${encodeURIComponent(result.statusSignature)}`
                     : `/pagamento/pix/${result.orderId}`;
                  navigate(pixUrl, {
                     state: {
                        checkoutId: data.checkout.id,
                        statusSignature: result.statusSignature,
                        businessName,
                        pixData: {
                           qr_code: result.pixData.qr_code,
                           qr_code_base64: result.pixData.qr_code_base64,
                           transaction_amount: totalAmount,
                           currency: data.product.currency || 'BRL'
                        },
                        orderData: {
                           items: items,
                           totalAmount: totalAmount,
                           customer: {
                              name: customer.name,
                              email: customer.email
                           }
                        }
                     }
                  });
               } else if (paymentMethod === 'boleto' && result.boletoData) {
                  window.location.href = result.boletoData.url;
               } else {
                  if (data.checkout.config?.upsell?.active) {
                     navigate(`/upsell/${result.orderId}`);
                  } else {
                     navigate(`/thank-you/${result.orderId}`);
                  }
               }
            }, 1000); // 1 second showing the green checkmark
         } else {
            setProcessState('error');
            setProcessError(result.message || 'Transação recusada. Verifique os dados do cartão.');
            setIsProcessing(false);
         }

      } catch (error: any) {
         console.error('Payment error:', error);
         console.error('Payment Error Details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
         });
         setProcessState('error');
         setProcessError(error.message || 'Erro ao processar pagamento. Verifique seus dados e tente novamente.');
         setIsProcessing(false);
      }
   };

   // Input Render Helper
   const renderInput = (field: 'name' | 'email' | 'phone' | 'cpf', placeholder: string, type: string = 'text') => {
      const hasError = touched[field] && errors[field];
      const isValid = touched[field] && !errors[field] && customer[field];

      return (
         <div className="space-y-1">
            <div className="relative">
               {field === 'phone' ? (
                  <PhoneInput
                     id={`input-${field}`}
                     name={field}
                     value={customer[field as keyof typeof customer]}
                     onChange={handleChange}
                     onBlur={handleBlur}
                     error={!!hasError}
                     isValid={!!isValid}
                     placeholder={placeholder}
                  />
               ) : (
                  <input
                     id={`input-${field}`}
                     type={type}
                     name={field}
                     placeholder={placeholder}
                     value={customer[field as keyof typeof customer]}
                     onChange={handleChange}
                     onBlur={handleBlur}
                     className={`w-full pl-4 pr-10 py-3 rounded-lg border bg-white focus:ring-2 focus:ring-opacity-50 transition-all outline-none ${hasError
                        ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                        : isValid
                           ? 'border-green-400 focus:border-green-500 focus:ring-green-200'
                           : 'border-gray-200 focus:border-[#10B981] focus:ring-[#10B981]/20'
                        }`}
                  />
               )}

               {/* Icons - Positioned absolutely over the input */}
               {hasError && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500 animate-pulse pointer-events-none">
                     <AlertCircle className="w-5 h-5" />
                  </div>
               )}
               {isValid && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 animate-in zoom-in pointer-events-none">
                     <Check className="w-5 h-5" />
                  </div>
               )}
            </div>
            {hasError && (
               <p className="text-xs text-red-500 flex items-center gap-1 animate-in slide-in-from-top-1">
                  {errors[field]}
               </p>
            )}
         </div>
      );
   };

   if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#f9fafb]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#10B981]"></div></div>;
   if (error || !data) return <div className="min-h-screen flex items-center justify-center bg-[#f9fafb] text-gray-500">{error}</div>;

   const totalAmount = calculateTotal();
   const config = data.checkout.config || { fields: { name: true, email: true, phone: true, cpf: true }, payment_methods: { pix: true, credit_card: true, boleto: true }, timer: { active: false, minutes: 0, bg_color: '', text_color: '' } };

   return (
      <TrackingProvider config={config}>
         <CheckoutTracker />
         <div className="checkout-padrao-container min-h-screen bg-[#f9fafb] font-sans text-gray-800 pb-12 pt-[3px]">

            {/* TIMER DE ESCASSEZ */}
            {config.timer?.active && (
               <div
                  className="py-3 shadow-lg transition-colors"
                  style={{ backgroundColor: config.timer.bg_color, color: config.timer.text_color }}
               >
                  <div className="max-w-2xl mx-auto px-4 flex items-center justify-between">
                     <div className="flex items-center gap-2 text-sm font-medium opacity-90">
                        <Clock className="w-4 h-4" />
                        <span className="hidden sm:inline">A oferta expira em:</span>
                        <span className="sm:hidden">Expira em:</span>
                     </div>
                     <div className="flex gap-2 text-gray-900">
                        <div className="time-box flex flex-col items-center bg-white rounded px-2 py-0.5 min-w-[36px]">
                           <span className="time-number font-bold text-sm">00</span>
                           <span className="time-label text-[8px] uppercase text-gray-500">Hrs</span>
                        </div>
                        <div className="time-box flex flex-col items-center bg-white rounded px-2 py-0.5 min-w-[36px]">
                           <span className="time-number font-bold text-sm">{timeLeft.minutes.toString().padStart(2, '0')}</span>
                           <span className="time-label text-[8px] uppercase text-gray-500">Min</span>
                        </div>
                        <div className="time-box flex flex-col items-center bg-white rounded px-2 py-0.5 min-w-[36px]">
                           <span className="time-number font-bold text-sm">{timeLeft.seconds.toString().padStart(2, '0')}</span>
                           <span className="time-label text-[8px] uppercase text-gray-500">Seg</span>
                        </div>
                     </div>
                  </div>
               </div>
            )}

            {/* CONTEÚDO PRINCIPAL - ESPAÇAMENTO AJUSTADO */}
            <div className={`max-w-2xl mx-auto px-4 space-y-6 ${config.timer?.active ? 'mt-3' : 'mt-6'}`}>

               {/* HEADER IMAGE - ALTURA DINÂMICA PARA NÃO CORTAR */}
               {config.header_image && (
                  <div className={`w-full rounded-2xl overflow-hidden shadow-sm ${!config.timer?.active ? 'mt-4' : ''}`}>
                     <img src={config.header_image} alt="Header" className="w-full h-auto block" />
                  </div>
               )}


               {/* CARD DO PRODUTO */}
               <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                  <div className="w-20 h-20 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
                     {data.product.imageUrl ? (
                        <img src={data.product.imageUrl} className="w-full h-full object-cover" />
                     ) : (
                        <ShoppingBag className="w-full h-full p-4 text-gray-400" />
                     )}
                  </div>
                   <div className="flex-1">
                      <h3 className="font-bold text-gray-900 leading-tight">{data.product.name}</h3>
                      {data.product.price_fake && (
                         <p className="text-xs text-gray-500 mt-1">De <span className="line-through">{formatCurrency(data.product.price_fake)}</span> por apenas</p>
                      )}
                      <p className="text-lg font-bold text-[#10B981]">{formatCurrency(data.product.price_real)}</p>
                   </div>
               </div>

               {/* FORMULÁRIO DO CLIENTE - CONDICIONAL AOS CAMPOS */}
               {upgradeIntentToken && (
                  <div className={`p-5 rounded-xl shadow-sm border ${upgradeIntentError ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                     <div className="flex items-start gap-3">
                        <div className={`mt-0.5 ${upgradeIntentError ? 'text-red-500' : 'text-emerald-600'}`}>
                           {upgradeIntentLoading ? (
                              <Clock className="w-5 h-5 animate-pulse" />
                           ) : (
                              <Link2 className="w-5 h-5" />
                           )}
                        </div>
                        <div className="flex-1">
                           <p className={`text-[11px] font-black uppercase tracking-[0.24em] ${upgradeIntentError ? 'text-red-600' : 'text-emerald-700'}`}>
                              Vinculo de upgrade
                           </p>
                           {upgradeIntentLoading ? (
                              <p className="mt-2 text-sm text-gray-600">
                                 Validando qual conta deve receber este upgrade...
                              </p>
                           ) : upgradeIntentError ? (
                              <p className="mt-2 text-sm text-red-700">
                                 {upgradeIntentError}
                              </p>
                           ) : (
                              <>
                                 <p className="mt-2 text-sm text-gray-700">
                                    Este upgrade sera aplicado automaticamente para:
                                 </p>
                                 <p className="mt-2 text-base font-bold text-gray-900">
                                    {upgradeIntentContext?.beneficiary.display_name || 'Conta atual'}
                                 </p>
                                 {upgradeIntentContext?.beneficiary.display_email_masked && (
                                    <p className="text-sm text-gray-600">
                                       {upgradeIntentContext.beneficiary.display_email_masked}
                                    </p>
                                 )}
                              </>
                           )}
                        </div>
                     </div>
                  </div>
               )}

               <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                     <div className="w-6 h-6 rounded-full bg-[#10B981] text-white flex items-center justify-center text-xs">1</div>
                     Dados Pessoais
                  </h3>

                  {config.fields.name && renderInput('name', 'Nome Completo')}
                  {config.fields.email && renderInput('email', 'Seu melhor E-mail', 'email')}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     {config.fields.cpf && renderInput('cpf', 'CPF/CNPJ')}
                     {config.fields.phone && renderInput('phone', 'DDD + Celular', 'tel')}
                  </div>
               </div>

               {/* FORMAS DE PAGAMENTO - CONDICIONAL */}
               <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                   <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-4">
                      <span className="bg-gray-900 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span>
                      Pagamento
                   </h3>

                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                     {config.payment_methods?.credit_card && (
                        <button
                           onClick={() => setPaymentMethod('credit_card')}
                           className={`relative flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${paymentMethod === 'credit_card'
                              ? 'bg-[#F0FDF4] border-[#10B981] text-[#10B981]'
                              : 'bg-gray-100 border-transparent text-gray-600 hover:bg-gray-200'
                              }`}
                        >
                           {paymentMethod === 'credit_card' && (
                              <div className="absolute -top-0.5 -right-0.5 bg-[#10B981] text-white rounded-bl-lg rounded-tr-lg p-0.5 shadow-sm animate-in zoom-in">
                                 <Check size={12} strokeWidth={3} />
                              </div>
                           )}
                           <CreditCardIcon className="w-6 h-6" />
                           <span className="text-sm font-bold">Cartão de Crédito</span>
                        </button>
                     )}

                     {config.payment_methods?.pix && (
                        <button
                           onClick={() => setPaymentMethod('pix')}
                           className={`relative flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${paymentMethod === 'pix'
                              ? 'bg-[#F0FDF4] border-[#10B981] text-[#10B981]'
                              : 'bg-gray-100 border-transparent text-gray-600 hover:bg-gray-200'
                              }`}
                        >
                           {paymentMethod === 'pix' && (
                              <div className="absolute -top-0.5 -right-0.5 bg-[#10B981] text-white rounded-bl-lg rounded-tr-lg p-0.5 shadow-sm animate-in zoom-in">
                                 <Check size={12} strokeWidth={3} />
                              </div>
                           )}
                           <PixIcon className="w-6 h-6" />
                           <span className="text-sm font-bold">Pix</span>
                        </button>
                     )}

                     {config.payment_methods?.boleto && (
                        <button
                           onClick={() => setPaymentMethod('boleto')}
                           className={`relative flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${paymentMethod === 'boleto'
                              ? 'bg-[#F0FDF4] border-[#10B981] text-[#10B981]'
                              : 'bg-gray-100 border-transparent text-gray-600 hover:bg-gray-200'
                              }`}
                        >
                           {paymentMethod === 'boleto' && (
                              <div className="absolute -top-0.5 -right-0.5 bg-[#10B981] text-white rounded-bl-lg rounded-tr-lg p-0.5 shadow-sm animate-in zoom-in">
                                 <Check size={12} strokeWidth={3} />
                              </div>
                           )}
                           <Barcode className="w-5 h-5" />
                           <span className="text-sm font-bold">Boleto</span>
                        </button>
                     )}

                     {config.payment_methods?.apple_pay && paymentRequest && walletAvailability && (
                        <WalletTabButton 
                           type="apple"
                           walletAvailability={walletAvailability}
                           paymentMethod={paymentMethod}
                           setPaymentMethod={setPaymentMethod}
                        />
                     )}

                     {config.payment_methods?.google_pay && paymentRequest && walletAvailability && (
                        <WalletTabButton 
                           type="google"
                           walletAvailability={walletAvailability}
                           paymentMethod={paymentMethod}
                           setPaymentMethod={setPaymentMethod}
                        />
                     )}
                  </div>
                  
                  {/* SEÇÃO CARTEIRA DIGITAL */}
                  {(paymentMethod === 'apple_pay' || paymentMethod === 'google_pay') && (
                     <div className="p-6 bg-gray-50 border border-gray-200 rounded-xl text-center animate-in fade-in duration-300">
                        {paymentMethod === 'apple_pay' ? (
                           <AppleIcon className="w-12 h-12 text-gray-900 mx-auto mb-3" />
                        ) : (
                           <GoogleIcon className="w-12 h-12 mx-auto mb-3" monochrome={false} />
                        )}
                        <h3 className="text-lg font-medium text-gray-900 mb-1">Pagamento Expresso</h3>
                        <p className="text-sm text-gray-500">
                           Verifique os itens extras abaixo se desejar e conclua sua compra tocando no botão do {paymentMethod === 'apple_pay' ? 'Apple Pay' : 'Google Pay'} ao final da página.
                        </p>
                     </div>
                  )}

                  {/* SEÇÃO CARTÃO */}
                  {paymentMethod === 'credit_card' && (
                     <div className="space-y-4 animate-in fade-in duration-300">
                        {/* Card Container - Centered and Constrained */}
                        <div className="w-full max-w-[280px] mx-auto">
                           <div className="perspective-1000 w-full h-[176px] relative cursor-pointer group" onClick={() => setCardFlipped(!cardFlipped)}>
                              <div className={`w-full h-full relative preserve-3d transition-transform duration-700 ${cardFlipped ? 'rotate-y-180' : ''}`} style={{ transformStyle: 'preserve-3d', transform: cardFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
                                 {/* Front */}
                                 <div className={`absolute w-full h-full backface-hidden bg-gradient-to-br ${currentCardStyle.gradient} rounded-xl shadow-xl p-4 text-white flex flex-col justify-between z-10 transition-all duration-500`} style={{ backfaceVisibility: 'hidden' }}>
                                    <div className="flex justify-between items-start">
                                       <div className="w-10 h-7 bg-yellow-500/80 rounded-md border-2 border-white"></div>
                                       <span className={`font-mono text-base italic font-bold ${currentCardStyle.textColor}`}>{currentCardStyle.logo}</span>
                                    </div>
                                    <div>
                                       <p className="font-mono text-base tracking-widest shadow-black drop-shadow-md flex items-center gap-2">
                                          {customer.cardNumber || '•••• •••• •••• ••••'}
                                          <ShieldCheck className="w-3.5 h-3.5 text-white/50" />
                                       </p>
                                    </div>
                                    <div className="flex justify-between items-end">
                                       <div>
                                          <p className="text-[7px] uppercase text-gray-400">Titular</p>
                                          <p className="font-medium uppercase text-xs tracking-wide">{customer.name || 'NOME DO TITULAR'}</p>
                                       </div>
                                       <div>
                                          <p className="text-[7px] uppercase text-gray-400">Validade</p>
                                          <p className="font-medium text-xs tracking-widest">{customer.expiry || '••/••'}</p>
                                       </div>
                                    </div>
                                 </div>
                                 {/* Back */}
                                 <div className="absolute w-full h-full backface-hidden bg-gray-800 rounded-xl shadow-xl overflow-hidden" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                                    <div className="w-full h-8 bg-black mt-4"></div>
                                    <div className="p-4">
                                       <div className="bg-white h-6 w-full flex items-center justify-end px-2">
                                          <span className="font-mono text-sm text-gray-900">{customer.cvc || '123'}</span>
                                       </div>
                                    </div>
                                 </div>
                              </div>
                           </div>
                        </div>

                        {/* Form Container - Matching Card Width */}
                        <div className="w-full max-w-[280px] mx-auto space-y-3 pt-2">
                           {data.gateway.name === GatewayProvider.STRIPE ? (
                              <div className="space-y-3 pt-2">
                                 <StripeInputWrapper label="Número do Cartão">
                                    <CardNumberElement 
                                       options={strypeElementOptions}
                                       onFocus={() => setCardFlipped(false)}
                                       onChange={(e) => {
                                          if (e.brand) {
                                             // Map Stripe brands to our internal brand types
                                             const brandMap: Record<string, CardBrand> = {
                                                'visa': 'visa',
                                                'mastercard': 'mastercard',
                                                'amex': 'amex',
                                                'discover': 'discover',
                                                'diners': 'diners',
                                                'jcb': 'default',
                                                'unionpay': 'default',
                                                'unknown': 'default'
                                             };
                                             setCardBrand(brandMap[e.brand] || 'default');
                                          }
                                          if (e.error) {
                                             setErrors(prev => ({ ...prev, stripe: e.error.message }));
                                          } else {
                                             setErrors(prev => {
                                                const newErrors = { ...prev };
                                                delete newErrors.stripe;
                                                return newErrors;
                                             });
                                          }
                                       }}
                                    />
                                 </StripeInputWrapper>
                                 
                                 <div className="grid grid-cols-2 gap-3">
                                    <StripeInputWrapper label="Validade">
                                       <CardExpiryElement 
                                          options={strypeElementOptions}
                                          onFocus={() => setCardFlipped(false)}
                                       />
                                    </StripeInputWrapper>
                                    
                                    <StripeInputWrapper label="CVC">
                                       <CardCvcElement 
                                          options={strypeElementOptions}
                                          onFocus={() => setCardFlipped(true)}
                                       />
                                    </StripeInputWrapper>
                                 </div>
                              </div>
                           ) : (
                              <>
                                 <div>
                                    <input
                                       type="text"
                                       className="w-full border border-gray-300 rounded-lg px-4 py-2.5 outline-none focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/20 transition-all"
                                       placeholder="Número do Cartão"
                                       value={customer.cardNumber}
                                       onChange={e => {
                                          const newValue = e.target.value;
                                          setCustomer({ ...customer, cardNumber: newValue });
                                          setCardBrand(detectCardBrand(newValue));

                                          // === MOTOR FINANCEIRO: Trigger BIN detection ===
                                          const cleanedBin = newValue.replace(/\D/g, '');
                                          if (cleanedBin.length >= 6 && data) {
                                             const bin = cleanedBin.substring(0, 6);
                                             const totalAmount = calculateTotal();
                                             const currency = data.product.currency || 'BRL';
                                             setLoadingInstallments(true);
                                             import('../../services/paymentService').then(({ paymentService }) => {
                                                paymentService.getPaymentOptions(data.gateway.id, totalAmount, currency, bin)
                                                   .then(options => {
                                                      setInstallmentOptions(options);
                                                      setCustomer(prev => ({ ...prev, installments: '1' }));
                                                   })
                                                   .catch(() => setInstallmentOptions([]))
                                                   .finally(() => setLoadingInstallments(false));
                                             });
                                          } else if (cleanedBin.length < 6) {
                                             setInstallmentOptions([]);
                                          }
                                       }}
                                       onFocus={() => setCardFlipped(false)}
                                    />
                                 </div>
                                 <div className="grid grid-cols-[1fr_80px] gap-3">
                                    <input
                                       type="text"
                                       className="w-full border border-gray-300 rounded-lg px-4 py-2.5 outline-none focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/20 transition-all"
                                       placeholder="MM/AA"
                                       maxLength={5}
                                       value={customer.expiry}
                                       onChange={e => {
                                          let value = e.target.value.replace(/\D/g, ''); // Remove non-digits
                                          if (value.length >= 2) {
                                             value = value.slice(0, 2) + '/' + value.slice(2, 4);
                                          }
                                          setCustomer({ ...customer, expiry: value });
                                       }}
                                       onFocus={() => setCardFlipped(false)}
                                    />
                                    <input
                                       type="text"
                                       className="w-full border border-gray-300 rounded-lg px-3 py-2.5 outline-none focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/20 transition-all"
                                       placeholder="CVV"
                                       maxLength={4}
                                       value={customer.cvc}
                                       onChange={e => setCustomer({ ...customer, cvc: e.target.value })}
                                       onFocus={() => setCardFlipped(true)}
                                    />
                                 </div>
                              </>
                           )}
                           <div>
                              {loadingInstallments ? (
                                  <div className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-400 text-sm animate-pulse bg-gray-50">
                                     Carregando parcelas...
                                  </div>
                               ) : installmentOptions.length > 1 ? (
                                  <select
                                     className="w-full border border-gray-300 rounded-lg px-4 py-2.5 outline-none focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/20 transition-all bg-white"
                                     value={customer.installments}
                                     onChange={e => setCustomer({ ...customer, installments: e.target.value })}
                                  >
                                     {installmentOptions.map(opt => (
                                        <option key={opt.installments} value={String(opt.installments)}>
                                           {opt.label}
                                        </option>
                                     ))}
                                  </select>
                               ) : installmentOptions.length === 1 ? (
                                  <div className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-700 text-sm bg-gray-50">
                                     {installmentOptions[0].label}
                                  </div>
                               ) : (
                                  <select
                                     className="w-full border border-gray-300 rounded-lg px-4 py-2.5 outline-none focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/20 transition-all bg-white"
                                     value={customer.installments}
                                     onChange={e => setCustomer({ ...customer, installments: e.target.value })}
                                  >
                                     <option value="1">1x sem juros</option>
                                     <option value="2">2x sem juros</option>
                                     <option value="3">3x sem juros</option>
                                     <option value="4">4x sem juros</option>
                                     <option value="5">5x sem juros</option>
                                     <option value="6">6x sem juros</option>
                                     <option value="7">7x sem juros</option>
                                     <option value="8">8x sem juros</option>
                                     <option value="9">9x sem juros</option>
                                     <option value="10">10x sem juros</option>
                                     <option value="11">11x sem juros</option>
                                     <option value="12">12x sem juros</option>
                                  </select>
                               )}
                           </div>

                           {/* LINK AUTHENTICATION (MOVIDO PARA BAIXO DOS JUROS) */}
                           {data.gateway.name === GatewayProvider.STRIPE && (
                              <div className="w-full mt-4 animate-in fade-in duration-500">
                                 <StripeInputWrapper>
                                    <LinkAuthenticationElement 
                                       options={{
                                          defaultValues: { email: customer.email }
                                       }}
                                    />
                                 </StripeInputWrapper>
                                 <p className="text-[10px] text-gray-400 text-center font-medium mt-1.5">
                                    Pagamento expresso com 1-Clique na rede Stripe
                                 </p>
                              </div>
                           )}
                        </div>
                     </div>
                  )}

                  {/* SEÇÃO PIX */}
                  {paymentMethod === 'pix' && (
                     <div className="bg-green-50 border border-green-200 rounded-xl p-4 animate-in fade-in duration-300">
                        <div className="flex items-center gap-2 text-green-800 font-bold mb-3">
                           <PixIcon className="w-5 h-5" /> Pague com Pix
                        </div>
                        <p className="text-sm text-green-900">Liberação imediata do acesso após o pagamento.</p>
                     </div>
                  )}

                  {/* SEÇÃO BOLETO */}
                  {paymentMethod === 'boleto' && (
                     <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 animate-in fade-in duration-300">
                        <div className="flex items-center gap-2 text-gray-800 font-bold mb-2">
                           <Barcode className="w-5 h-5" /> Informações do Boleto
                        </div>
                        <p className="text-sm text-gray-600">Vencimento em 2 dias úteis.</p>
                     </div>
                  )}

                  {!paymentMethod && (
                     <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-3 text-yellow-800 text-sm animate-pulse">
                        <AlertCircle className="w-5 h-5" />
                        Escolha uma forma de pagamento.
                     </div>
                  )}

               </div>

               {/* ORDER BUMPS */}
               {paymentMethod && data.bumps.length > 0 && (
                  <div className="space-y-4 animate-in zoom-in-95 duration-300">

                     {/* Header da Seção */}
                     <div className="bg-gradient-to-r from-yellow-400 to-orange-500 px-4 py-2 rounded-xl shadow-sm">
                        <h3 className="text-xs font-bold text-white uppercase tracking-wide text-center flex items-center justify-center gap-2">
                           ⚡ Oportunidade especial agora
                        </h3>
                     </div>

                     {/* Lista de Bumps */}
                     <div className="space-y-4">
                        {data.bumps.map(bump => {
                           const isCreditCard = paymentMethod === 'credit_card';
                           const installments = parseInt(customer.installments) || 1;
                           const price = bump.price_real || 0;

                           let priceValue = '';
                           let suffix = '';

                           if (isCreditCard) {
                              const interest = installments > 1 ? 1.2 : 1;
                              const val = (price * interest) / installments;
                              priceValue = val.toFixed(2);
                              suffix = ' na parcela';
                           } else {
                              priceValue = price.toFixed(2);
                           }

                           return (
                              <div
                                 key={bump.id}
                                 className={`p-4 rounded-xl border-2 border-dashed transition-all cursor-pointer relative overflow-hidden ${selectedBumps.includes(bump.id)
                                    ? 'border-[#10B981] bg-green-50/50'
                                    : 'border-[#D71A21] bg-white hover:border-[#B71520]'
                                    }`}
                                 onClick={() => toggleBump(bump.id)}
                              >
                                 <div className="flex items-start gap-4 relative z-10">
                                    {/* Image */}
                                    <div className="w-16 h-16 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden">
                                       {bump.imageUrl && <img src={bump.imageUrl} className="w-full h-full object-cover" />}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1">
                                       <div className="flex justify-between items-start">
                                          <h4 className="font-bold text-gray-900 text-sm">{bump.name}</h4>
                                       </div>
                                       <p className="text-xs text-gray-500 mt-1 leading-snug line-clamp-2">{bump.description}</p>

                                       {/* Dynamic Call to Action with Checkbox */}
                                       <div className="mt-3 flex items-center gap-2">
                                          <div className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${selectedBumps.includes(bump.id)
                                             ? 'bg-[#10B981] border-[#10B981]'
                                             : 'border-gray-400 bg-transparent'
                                             }`}>
                                             {selectedBumps.includes(bump.id) && <Check className="w-3.5 h-3.5 text-white" />}
                                          </div>
                                          <p className="text-sm font-bold text-gray-900 leading-tight">
                                             Sim, quero aproveitar por apenas <span className="text-[#10B981]">{getCurrencySymbol()} {priceValue}</span>{suffix}
                                          </p>
                                       </div>
                                    </div>
                                 </div>
                              </div>
                           );
                        })}
                     </div>
                  </div>
               )}

               {/* RESUMO DO PEDIDO */}
               <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <h3 className="font-bold text-gray-900 mb-4">Resumo</h3>

                  <div className="space-y-3 mb-4 text-sm">
                     <div className="flex justify-between gap-3 text-gray-600">
                        <span className="flex-1 break-words">{data.product.name}</span>
                        {data.product.price_fake ? (
                           <span className="line-through text-gray-400 whitespace-nowrap">{getCurrencySymbol()} {data.product.price_fake.toFixed(2)}</span>
                        ) : (
                           <span className="text-[#10B981] whitespace-nowrap">{getCurrencySymbol()} {data.product.price_real?.toFixed(2)}</span>
                        )}
                     </div>

                     {selectedBumps.map(bumpId => {
                        const bump = data.bumps.find(b => b.id === bumpId);
                        return bump ? (
                           <div key={bump.id} className="flex justify-between gap-3 text-[#10B981]">
                              <span className="flex items-center gap-1 flex-1 break-words"><Check className="w-3 h-3 flex-shrink-0" /> {bump.name}</span>
                              <span className="whitespace-nowrap">+ R$ {bump.price_real?.toFixed(2)}</span>
                           </div>
                        ) : null;
                     })}

                     <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
                        <span className="font-bold text-gray-900">Total</span>
                        <div className="text-right">
                           <p className="text-2xl font-bold text-[#10B981]">{getCurrencySymbol()} {totalAmount.toFixed(2)}</p>
                           {paymentMethod === 'credit_card' && (
                              <p className="text-xs text-gray-500">ou 12x de {getCurrencySymbol()} {(totalAmount / 12 * 1.2).toFixed(2)}</p>
                           )}
                        </div>
                     </div>
                  </div>

                  {(paymentMethod === 'apple_pay' || paymentMethod === 'google_pay') && paymentRequest ? (
                     <div className="w-full">
                        <WalletExpressButton 
                           paymentRequest={paymentRequest} 
                           type={paymentMethod === 'apple_pay' ? 'apple' : 'google'}
                           data={data}
                           selectedBumps={selectedBumps}
                           userId={userId}
                           showAlert={showAlert}
                           stripe={stripe}
                        />
                     </div>
                  ) : (
                     <button
                        onClick={handleSubmit}
                        disabled={isProcessing || !paymentMethod}
                        className="w-full bg-[#10B981] hover:bg-[#059669] disabled:bg-gray-400 text-white font-bold py-4 rounded-xl shadow-lg shadow-green-500/30 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                     >
                        {isProcessing ? 'Processando...' : (
                           <>
                              <Lock className="w-5 h-5" />
                              {paymentMethod === 'pix' ? 'Gerar Pix Copia e Cola' : 'Finalizar Compra Agora'}
                           </>
                        )}
                     </button>
                  )}
                  <div className="text-center py-6 border-t border-gray-100 mt-8">
                   <p className="text-[10px] text-gray-400 font-bold flex items-center justify-center gap-1 mb-1 uppercase tracking-widest">
                      <ShieldCheck className="w-4 h-4 text-[#10B981]" /> Compra 100% segura
                   </p>
                   
                   <div className="space-y-1 px-4 mt-[-4px]">
                       <p className="text-[9px] sm:text-[10px] text-gray-400 font-medium leading-tight text-center mb-6">
                          Criptografia 2048 bits com certificação <span className="font-bold text-gray-500 uppercase tracking-tighter">PCI-DSS Nível 1</span>
                       </p>

                      {showLegalFooter && (
                        <>
                          {supportEmail && (
                            <p className="text-[11px] text-gray-500">
                              Precisa de ajuda? <span className="text-gray-400">Fale com o vendedor pelo e-mail</span> <a href={`mailto:${supportEmail}`} className="text-gray-500 hover:text-gray-700 hover:underline transition-colors font-medium">{supportEmail}</a>
                            </p>
                          )}

                          <p className="text-[10px] text-gray-400 leading-relaxed max-w-sm mx-auto">
                            Estou ciente de que o pagamento será processado em nome do vendedor <span className="font-bold text-gray-500">{businessName}</span>, 
                            concordo com os <a href={`/terms-of-purchase?c=${id}`} target="_blank" className="text-gray-500 hover:text-gray-700 hover:underline transition-colors">Termos de Compra</a> e 
                            confirmo que li e entendi a <a href={`/privacy-policy?c=${id}`} target="_blank" className="text-gray-500 hover:text-gray-700 hover:underline transition-colors">Política de Privacidade</a>.
                          </p>

                          <div className="pt-4">
                            <p className="text-[10px] text-gray-400 font-medium">
                              <span className="font-bold">{businessName}</span> ® 2026 | Todos os direitos reservados
                            </p>
                          </div>
                        </>
                       )}
                    </div>
                </div>
               </div>

            </div>
            <ProcessingModal 
               isOpen={processState !== 'idle'} 
               state={processState} 
               errorDetail={processError} 
               onClose={() => setProcessState('idle')}
               businessName={businessName}
               paymentMethod={paymentMethod || undefined}
            />
            <AlertModal
               isOpen={alertState.isOpen}
               onClose={closeAlert}
               title={alertState.title}
               message={alertState.message}
               variant={alertState.variant}
            />
         </div>
      </TrackingProvider>
   );
};

const WalletTabButton = ({ 
   type,
   walletAvailability,
   paymentMethod,
   setPaymentMethod
}: { 
   type: 'apple' | 'google';
   walletAvailability: {applePay?: boolean, googlePay?: boolean, link?: boolean};
   paymentMethod: PaymentMethod | null;
   setPaymentMethod: (m: PaymentMethod) => void;
}) => {
   let isVisible = false;
   // Always show in localhost for testing UX
   if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      isVisible = true;
   } else {
      if (type === 'apple' && walletAvailability.applePay) isVisible = true;
      if (type === 'google' && walletAvailability.googlePay) isVisible = true;
      if (type === 'google' && !walletAvailability.applePay && !walletAvailability.googlePay && walletAvailability.link) isVisible = true;
   }

   if (!isVisible) return null;

   const isActive = paymentMethod === (type === 'apple' ? 'apple_pay' : 'google_pay');
   const methodValue = type === 'apple' ? 'apple_pay' : 'google_pay';
   const label = type === 'apple' ? 'Apple Pay' : 'Google Pay';

   return (
      <button
         onClick={() => setPaymentMethod(methodValue)}
         className={`relative flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${isActive
            ? 'bg-[#F0FDF4] border-[#10B981] text-[#10B981]'
            : 'bg-gray-100 border-transparent text-gray-600 hover:bg-gray-200'
            }`}
      >
         {isActive && (
            <div className="absolute -top-0.5 -right-0.5 bg-[#10B981] text-white rounded-bl-lg rounded-tr-lg p-0.5 shadow-sm animate-in zoom-in">
               <Check size={12} strokeWidth={3} />
            </div>
         )}
         {type === 'apple' ? (
            <AppleIcon className={`w-5 h-5 ${isActive ? 'text-gray-900' : 'text-gray-500'}`} />
         ) : (
            <GoogleIcon className={`w-5 h-5 ${isActive ? '' : 'text-gray-500'}`} monochrome={!isActive} />
         )}
         <span className="text-sm font-bold">{label}</span>
      </button>
   );
};

// isolated component to use useStripe hook safely
const WalletExpressButton = ({ 
   paymentRequest, 
   type,
   data, 
   selectedBumps, 
   userId, 
   showAlert,
   stripe
}: { 
   paymentRequest: PaymentRequest; 
   type: 'apple' | 'google';
   data: any; 
   selectedBumps: string[]; 
   userId: string | undefined;
   showAlert: (t: string, m: string, v?: any) => void;
   stripe: any;
}) => {
   const navigate = useNavigate();
   const [isVisible, setIsVisible] = useState(false);

   useEffect(() => {
      const checkAvailability = async () => {
         if (!paymentRequest) return;
         const result = await paymentRequest.canMakePayment();
         if (result) {
            if (type === 'apple' && result.applePay) setIsVisible(true);
            if (type === 'google' && result.googlePay) setIsVisible(true);
            if (result && !result.applePay && !result.googlePay) setIsVisible(true);
         }
      };
      checkAvailability();
   }, [paymentRequest, type]);

   // Dynamically update Stripe sheet total when Bumps are selected
   useEffect(() => {
      if (!paymentRequest || !data?.product) return;
      let total = data.product.price_real || 0;
      selectedBumps.forEach(bumpId => {
         const bump = data.bumps.find((b: any) => b.id === bumpId);
         if (bump) total += (bump.price_real || 0);
      });
      paymentRequest.update({
         total: {
            label: data.product.name,
            amount: Math.round(total * 100)
         }
      });
   }, [selectedBumps, data, paymentRequest]);

   useEffect(() => {
      if (!stripe || !paymentRequest) return;

      const handlePaymentMethod = async (ev: any) => {
         try {
            const calculateTotal = () => {
               let total = data.product.price_real || 0;
               selectedBumps.forEach(bumpId => {
                  const bump = data.bumps.find((b: any) => b.id === bumpId);
                  if (bump) total += (bump.price_real || 0);
               });
               return total;
            };

            const totalAmount = calculateTotal();
            const items: OrderItem[] = [
               {
                  name: data.product.name,
                  price: data.product.price_real || 0,
                  quantity: 1,
                  type: 'main',
                  product_id: data.product.id
               }
            ];
            selectedBumps.forEach(bumpId => {
               const bump = data.bumps.find((b: any) => b.id === bumpId);
               if (bump) items.push({ name: bump.name, price: bump.price_real || 0, quantity: 1, type: 'bump', product_id: bump.id });
            });

            const { paymentService } = await import('../../services/paymentService');
            const result = await paymentService.processPayment({
               checkoutId: data.checkout.id,
               offerId: data.checkout.offer_id || 'direct',
               amount: totalAmount,
               customerName: ev.payerName || 'Cliente Wallet',
               customerEmail: ev.payerEmail || 'cliente@wallet.com',
               customerPhone: ev.payerPhone || '',
               gatewayId: data.gateway.id,
               paymentMethod: 'credit_card',
               items: items,
               currency: data.product.currency || 'BRL',
               customerUserId: userId,
               stripePaymentMethodId: ev.paymentMethod.id
            });

            if (result.success) {
               ev.complete('success');
               if (data.checkout.config?.upsell?.active) {
                  navigate(`/upsell/${result.orderId}`);
               } else {
                  navigate(`/thank-you/${result.orderId}`);
               }
            } else {
               ev.complete('fail');
               showAlert('Erro', result.message || 'Falha no pagamento via carteira.', 'error');
            }
         } catch (err) {
            console.error('[StripeWallet] Error during capture:', err);
            ev.complete('fail');
         }
      };

      paymentRequest.on('paymentmethod', handlePaymentMethod);
      return () => {
         paymentRequest.off('paymentmethod', handlePaymentMethod);
      };
   }, [stripe, paymentRequest, data, selectedBumps, userId, navigate, showAlert]);

   if (!isVisible || !paymentRequest) return null;

   return (
      <div className="w-full h-[52px] overflow-hidden rounded-xl bg-black hover:opacity-90 transition-opacity relative group">
         <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] py-0.5 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10 border border-white/10 uppercase tracking-tighter font-bold">
            1-Clique
         </div>
         <PaymentRequestButtonElement 
            options={{
               paymentRequest,
               style: {
                  paymentRequestButton: {
                     type: 'buy',
                     theme: 'dark',
                     height: '52px',
                    },
                 },
              }} 
           />
        </div>
     );
};

// --- CORE CHECKOUT CONTENT ---

const PublicCheckoutContent = ({ checkoutId }: { checkoutId?: string }) => {
   const { id: paramId } = useParams<{ id: string }>();
   const id = checkoutId || paramId;
   const [gatewayName, setGatewayName] = useState<string | undefined>();
   const [loading, setLoading] = useState(true);

   useEffect(() => {
      const loadGateway = async () => {
         if (!id) return;
         try {
            const checkout = await storage.getPublicCheckout(id);
            if (checkout?.gateway_id) {
               const gateway = await storage.getPublicGateway(checkout.gateway_id);
               setGatewayName(gateway?.name);
            }
         } catch (e) {
            console.warn("Could not load gateway for bridge", e);
         } finally {
            setLoading(false);
         }
      };
      loadGateway();
   }, [id]);

   if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#f9fafb]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#10B981]"></div></div>;

   return (
      <StripeHooksBridge gatewayName={gatewayName}>
         {(stripe, elements) => (
            <PublicCheckoutUI checkoutId={checkoutId} stripe={stripe} elements={elements} />
         )}
      </StripeHooksBridge>
   );
};

export const PublicCheckout = ({ checkoutId: propId }: { checkoutId?: string }) => {
   return (
      <StripeWrapper checkoutId={propId}>
         <PublicCheckoutContent checkoutId={propId} />
      </StripeWrapper>
   );
};




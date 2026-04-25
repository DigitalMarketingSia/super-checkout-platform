
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '../../components/Layout';
import { storage } from '../../services/storageService';
import { Checkout, Product, Gateway, Domain, DomainStatus, CheckoutConfig, GatewayProvider, DomainUsage } from '../../types';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
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
   Zap
} from 'lucide-react';
import { AlertModal } from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { BusinessSetupModal } from '../../components/admin/BusinessSetupModal';
import { useTranslation } from 'react-i18next';

const initialConfig: CheckoutConfig = {
   fields: { name: true, email: true, phone: true, cpf: true },
   payment_methods: { pix: true, credit_card: true, boleto: true, apple_pay: false, google_pay: false },
   timer: { active: false, minutes: 15, bg_color: '#EF4444', text_color: '#FFFFFF' },
   header_image: '',
   upsell: {
      active: false,
      product_id: '',
      show_title: true,
      show_subtitle: true,
      show_description: true,
      show_media: true,
      media_type: 'video',
      button_text: 'Sim, quero adicionar ao meu pedido'
   }
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

   const closeAlert = () => {
      setAlertState(prev => ({ ...prev, isOpen: false }));
   };

   // Computed lists (Filtered by Active Status)
   const activeProducts = products.filter(p => p.active);
   const availableBumps = activeProducts.filter(p => p.is_order_bump && p.id !== productId);
   const availableUpsells = activeProducts.filter(p => p.is_upsell && p.id !== productId);

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
               setName(found.name);
               setActive(found.active);
               setProductId(found.product_id);
               setGatewayId(found.gateway_id);
               setDomainId(found.domain_id || '');
               setSlug(found.custom_url_slug);
               setOrderBumpIds(found.order_bump_ids || []);
               setUpsellProductId(found.upsell_product_id || '');
               setThankYouButtonUrl((found as any).thank_you_button_url || '');
               setThankYouButtonText((found as any).thank_you_button_text || '');
               setCurrency(found.currency || 'BRL');
               setBackupGatewayId(found.backup_gateway_id || '');
               setConfig(found.config || initialConfig);
            }
         }
         setLoading(false);
      };
      load();
   }, [id, isNew]);

   const handleSave = async () => {
      console.log('🔍 Debug - Form state:', { name, productId, gatewayId });

      // Compliance Check: Block saving if business is not ready
      if (!compliance?.is_ready) {
         setShowComplianceModal(true);
         return;
      }

      if (!name || !productId || !gatewayId) {
         showAlert(t('common.info', 'Atenção'), t('checkout_editor.fill_fields', 'Por favor, preencha o nome, selecione um produto e um gateway.'), 'info');
         return;
      }

      try {
         setLoading(true);
         const checkoutData = {
            name,
            active,
            product_id: productId,
            gateway_id: gatewayId,
            domain_id: domainId || null, // Send null to clear the field in DB
            custom_url_slug: slug || (isNew ? `chk-${Date.now()}` : id!),
            order_bump_ids: orderBumpIds,
            upsell_product_id: upsellProductId || undefined,
            thank_you_button_url: thankYouButtonUrl || null,
            thank_you_button_text: thankYouButtonText || null,
            currency,
            backup_gateway_id: backupGatewayId || null,
            config,
            user_id: user?.id || '', // Requisito da interface
            offer_id: undefined // Legacy field, not used in current implementation
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
            setIsUploadingBanner(true);
            // Pass checkoutId to upload function
            const url = await storage.uploadCheckoutBanner(e.target.files[0], checkoutId);
            setConfig({ ...config, header_image: url });
         } catch (error) {
            console.error('Error uploading banner:', error);
            showAlert(t('common.error', 'Erro'), t('common.upload_error', 'Erro ao fazer upload da imagem. Tente novamente.'), 'error');
         } finally {
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
         default:
            return "";
      }
   };

   return (
      <Layout>
         {loading ? (
            <div className="flex items-center justify-center min-h-[60vh]">
               <div className="flex flex-col items-center gap-4">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-gray-400 text-sm">Carregando editor...</p>
               </div>
            </div>
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
                                 <Plus className="w-3 h-3" /> Architect Mode
                              </span>
                              <div className="w-1 h-1 rounded-full bg-gray-800" />
                              <span className="text-[10px] text-gray-700 font-bold uppercase tracking-[0.2em]">{isNew ? 'Protocolo: Novo' : `ID: ${id?.slice(0,8)}`}</span>
                           </div>
                           <h1 className="text-2xl font-portal-display text-white uppercase tracking-tight leading-none italic">
                              {isNew ? 'Estruturar Checkout' : 'Otimizar Checkout'}
                           </h1>
                        </div>
                     </div>
                     <div className="flex items-center gap-4">
                        <Button 
                           variant="ghost" 
                           onClick={() => navigate('/admin/checkouts')}
                           className="text-gray-600 hover:text-white uppercase font-black tracking-widest text-[10px] px-6 transition-colors"
                        >
                           Descartar
                        </Button>
                        <Button 
                           onClick={handleSave}
                           className="group/save bg-primary hover:bg-rose-600 text-white px-10 h-14 rounded-2xl shadow-xl shadow-primary/20 flex items-center gap-3 active:scale-95 transition-all duration-500"
                        >
                           <Save className="w-4 h-4 group-hover/save:rotate-12 transition-transform" />
                           <span className="font-black uppercase italic tracking-tighter text-sm">
                              {isNew ? 'Efetivar Deploy' : 'Sincronizar Nodes'}
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
                           <h2 className="text-base font-portal-display text-white uppercase tracking-tight">Identidade & Protocolo de Acesso</h2>
                           <p className="text-[10px] text-gray-700 font-bold uppercase tracking-[0.2em]">Configuração de rotas e segmentação de mercado</p>
                        </div>
                     </div>

                     <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-1 p-10 bg-[#0A0A15]/80 border border-white/5 rounded-[2.5rem] shadow-2xl">
                           <label className="block text-[10px] font-black text-gray-700 uppercase tracking-[0.3em] mb-4 ml-1 italic">Rótulo Estratégico</label>
                           <input
                              type="text"
                              className="w-full bg-white/[0.02] border-2 border-white/5 rounded-2xl px-6 py-4 text-white font-bold placeholder:text-gray-800 focus:border-primary/50 focus:ring-0 outline-none transition-all"
                              placeholder="Nomenclatura Interna"
                              value={name}
                              onChange={e => setName(e.target.value)}
                           />
                           <p className="mt-4 text-[9px] text-gray-800 font-medium leading-relaxed italic">Use nomes que facilitem a identificação no CRM tático de vendas.</p>
                        </div>

                        <div className="lg:col-span-2 p-10 bg-[#0A0A15]/80 border border-white/10 rounded-[2.5rem] relative overflow-hidden group shadow-2xl">
                           <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-[50px] -translate-y-1/2 translate-x-1/2" />
                           
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 relative z-10">
                              <div>
                                 <label className="block text-[10px] font-black text-gray-700 uppercase tracking-[0.3em] mb-4 ml-1 italic">Domínio de Live-Stream</label>
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
                                 <label className="block text-[10px] font-black text-gray-700 uppercase tracking-[0.3em] mb-4 ml-1 italic">ID de Camada (Slug)</label>
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
                           <h2 className="text-base font-portal-display text-white uppercase tracking-tight">Ativo Principal</h2>
                           <p className="text-[10px] text-gray-700 font-bold uppercase tracking-[0.2em]">O que será transacionado neste protocolo</p>
                        </div>
                     </div>

                     <div className="p-10 bg-[#0A0A15]/80 border border-white/5 rounded-[2.5rem] shadow-2xl">
                        {activeProducts.length === 0 ? (
                           <div className="text-center py-16 border-2 border-dashed border-white/5 rounded-[2rem] bg-white/[0.01]">
                              <ShoppingBag className="w-12 h-12 text-gray-800 mx-auto mb-4" />
                              <p className="text-sm text-gray-700 font-bold uppercase tracking-widest italic">Nenhum ativo disponível</p>
                              <Button variant="ghost" size="sm" className="mt-6 text-primary font-black uppercase tracking-widest text-[9px]" onClick={() => navigate('/admin/products')}>Cadastrar Ativo</Button>
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
                           <h2 className="text-base font-portal-display text-white uppercase tracking-tight">Intelligence de Pagamento</h2>
                           <p className="text-[10px] text-gray-700 font-bold uppercase tracking-[0.2em]">Failover, fail-closed e redundância de gateway</p>
                        </div>
                     </div>

                     <div className="p-10 bg-[#0A0A15]/80 border border-white/5 rounded-[2.5rem] shadow-2xl space-y-10">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                           <div className="space-y-4">
                              <label className="block text-[10px] font-black text-gray-700 uppercase tracking-[0.3em] ml-1 italic">Moeda do Protocolo</label>
                              <div className="flex bg-black/40 rounded-2xl p-1.5 border border-white/5">
                                 {[
                                    { id: 'BRL', label: 'Real', symbol: 'R$' },
                                    { id: 'USD', label: 'Dólar', symbol: '$' },
                                    { id: 'EUR', label: 'Euro', symbol: '€' }
                                 ].map(m => (
                                    <button
                                       key={m.id}
                                       onClick={() => {
                                          setCurrency(m.id as any);
                                          if (m.id !== 'BRL' && gateways.find(g => g.id === gatewayId)?.name === GatewayProvider.MERCADO_PAGO) {
                                             setGatewayId('');
                                             setBackupGatewayId('');
                                          }
                                       }}
                                       className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-500 ${currency === m.id
                                          ? 'bg-primary text-white shadow-xl shadow-primary/20'
                                          : 'text-gray-700 hover:text-gray-400'
                                          }`}
                                    >
                                       {m.label} ({m.symbol})
                                    </button>
                                 ))}
                              </div>
                           </div>

                           <div className="space-y-4">
                              <label className="block text-[10px] font-black text-gray-700 uppercase tracking-[0.3em] ml-1 italic">Vigia de Failover (Backup)</label>
                              <div className="relative group/backup">
                                 <AlertCircle className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary group-focus-within/backup:text-white transition-colors" />
                                 <select
                                    className="w-full bg-white/[0.02] border-2 border-white/5 rounded-2xl pl-14 pr-6 py-4 text-white font-bold text-sm focus:border-primary/50 focus:ring-0 outline-none appearance-none transition-all cursor-pointer"
                                    value={backupGatewayId}
                                    onChange={e => setBackupGatewayId(e.target.value)}
                                 >
                                    <option value="" className="bg-[#0A0A15] text-white">Inativo (Apenas Principal)</option>
                                    {gateways
                                       .filter(g => g.active && g.id !== gatewayId)
                                       .filter(g => {
                                          if (currency !== 'BRL') return g.name === GatewayProvider.STRIPE;
                                          return true;
                                       })
                                       .map(g => (
                                          <option key={g.id} value={g.id} className="bg-[#0A0A15] text-white">
                                             {g.name.replace('_', ' ')} (Redundância)
                                          </option>
                                       ))}
                                 </select>
                                 <ChevronRight className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-800 rotate-90" />
                              </div>
                           </div>
                        </div>

                        <div className="pt-4 space-y-6">
                           <label className="block text-[10px] font-black text-gray-700 uppercase tracking-[0.3em] ml-1 italic">Deploy Principal de Transação</label>
                           
                           {gateways.filter(g => g.active).length === 0 ? (
                              <div className="text-center py-12 bg-white/[0.01] border-2 border-dashed border-white/5 rounded-[2rem]">
                                 <Wallet className="w-12 h-12 text-gray-800 mx-auto mb-4" />
                                 <p className="text-sm text-gray-700 font-bold uppercase tracking-widest italic">Nenhum pipeline de pagamento ativo</p>
                                 <Button variant="ghost" size="sm" className="mt-6 text-primary font-black uppercase tracking-widest text-[9px]" onClick={() => navigate('/admin/gateways')}>Ativar Nodes</Button>
                              </div>
                           ) : (
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                                 {gateways
                                    .filter(g => g.active)
                                    .filter(g => {
                                       if (currency !== 'BRL') return g.name === GatewayProvider.STRIPE;
                                       return true;
                                    })
                                    .map(g => (
                                       <button
                                          key={g.id}
                                          onClick={() => {
                                             setGatewayId(g.id);
                                             if (backupGatewayId === g.id) setBackupGatewayId('');
                                          }}
                                          className={`relative group/gate flex flex-col items-center justify-center p-8 rounded-[2rem] border-2 transition-all duration-500 overflow-hidden ${gatewayId === g.id
                                             ? 'border-primary/50 bg-primary/10 shadow-[0_0_20px_rgba(138,43,226,0.1)] scale-105'
                                             : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10'
                                             }`}
                                       >
                                          <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 blur-2xl group-hover/gate:bg-primary/10 transition-all" />
                                          <div className="w-12 h-12 mb-4 flex items-center justify-center relative z-10">
                                             <img src={getGatewayLogo(g.name)} alt={g.name} className="w-full h-full object-contain group-hover/gate:scale-110 transition-transform duration-500" />
                                          </div>
                                          <span className={`text-[10px] font-black uppercase tracking-widest z-10 transition-colors ${gatewayId === g.id ? 'text-white' : 'text-gray-700'}`}>
                                             {g.name.replace('_', ' ')}
                                          </span>

                                          {gatewayId === g.id && (
                                             <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-lg animate-in zoom-in duration-300">
                                                <Check className="w-3 h-3 text-white font-bold" />
                                             </div>
                                          )}
                                       </button>
                                    ))}
                              </div>
                           )}

                           {currency !== 'BRL' && gateways.filter(g => g.active && g.name === GatewayProvider.STRIPE).length === 0 && (
                              <div className="p-6 rounded-[1.5rem] bg-rose-500/5 border border-rose-500/10 flex gap-4 items-center">
                                 <AlertCircle className="w-6 h-6 text-rose-500 shrink-0" />
                                 <p className="text-[10px] text-rose-200/60 font-medium uppercase tracking-widest italic leading-relaxed">
                                    Atenção: Para transações em <span className="text-rose-500 font-black">{currency}</span>, o sistema exige ativação do cluster <span className="text-white font-black">Stripe</span>.
                                 </p>
                              </div>
                           )}
                        </div>
                     </div>
                  </section>

                  <section className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
                     <div className="flex items-center justify-between mb-8 ml-2">
                        <div className="flex items-center gap-4">
                           <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500 shadow-lg shadow-orange-500/10">
                              <Layers className="w-6 h-6" />
                           </div>
                           <div>
                              <h2 className="text-base font-portal-display text-white uppercase tracking-tight">Order Bumps (Aceleração)</h2>
                              <p className="text-[10px] text-gray-700 font-bold uppercase tracking-[0.2em]">Ofertas complementares no carrinho</p>
                           </div>
                        </div>
                     </div>

                     <div className="p-10 bg-[#0A0A15]/80 border border-white/5 rounded-[2.5rem] shadow-2xl">
                        {availableBumps.length === 0 ? (
                           <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-[2rem] bg-white/[0.01]">
                              <AlertCircle className="w-10 h-10 text-gray-800 mx-auto mb-4 opacity-50" />
                              <p className="text-sm text-gray-800 font-bold uppercase tracking-widest italic">Nenhum ativo de aceleração configurado</p>
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
                                    <h2 className="text-xl font-portal-display text-white uppercase tracking-tight italic">Upsell de Alta Conversão</h2>
                                    <span className="px-3 py-1 rounded-full bg-primary/20 text-primary text-[9px] font-black uppercase tracking-[0.2em] border border-primary/30">Lógica Pós-Venda</span>
                                 </div>
                                 <p className="text-xs text-gray-400 font-medium max-w-lg leading-relaxed italic">
                                    Ofereça um produto irresistível imediatamente após a aprovação do pedido primário. Protocolo <span className="text-white font-bold underline decoration-primary/50">One-Click</span>.
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
                                    <label className="block text-[10px] font-black text-primary uppercase tracking-[0.3em] ml-1 italic">Ativo da Oferta</label>
                                    <div className="relative">
                                       <ShoppingBag className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
                                       <select
                                          className="w-full bg-[#05050A] border-2 border-primary/20 rounded-[1.5rem] pl-14 pr-6 py-4 text-white font-bold focus:border-primary/50 focus:ring-0 outline-none appearance-none transition-all cursor-pointer"
                                          value={config.upsell?.product_id || ''}
                                          onChange={e => setConfig({ ...config, upsell: { ...config.upsell!, product_id: e.target.value } })}
                                       >
                                          <option value="" className="bg-[#0A0A15] text-white">-- Selecionar Produto do Vault --</option>
                                          {availableUpsells.map(prod => (
                                             <option key={prod.id} value={prod.id} className="bg-[#0A0A15] text-white">{prod.name} (R$ {prod.price_real?.toFixed(2)})</option>
                                          ))}
                                       </select>
                                       <ChevronRight className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40 rotate-90" />
                                    </div>
                                 </div>

                                 <div className="space-y-6">
                                    <label className="block text-[10px] font-black text-primary uppercase tracking-[0.3em] ml-1 italic">Chamada de Ação (CTA)</label>
                                    <input
                                       type="text"
                                       className="w-full bg-[#05050A] border-2 border-primary/20 rounded-[1.5rem] px-6 py-4 text-white font-bold placeholder:text-gray-800 focus:border-primary/50 focus:ring-0 outline-none transition-all"
                                       placeholder="Sim, quero aproveitar esta oferta!"
                                       value={config.upsell?.button_text || ''}
                                       onChange={e => setConfig({ ...config, upsell: { ...config.upsell!, button_text: e.target.value } })}
                                    />
                                 </div>
                              </div>

                              <div className="grid grid-cols-1 gap-8">
                                 <div className="p-8 bg-black/40 border border-primary/20 rounded-[2rem] space-y-6">
                                    <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] flex items-center gap-2 italic">
                                       <ImageIcon className="w-4 h-4 text-primary" /> Ativos Visuais & Copywriting
                                    </h3>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                       <div className="space-y-3">
                                          <div className="flex items-center justify-between px-1">
                                             <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Título (Headline)</label>
                                             <button onClick={() => setConfig({ ...config, upsell: { ...config.upsell!, show_title: !config.upsell?.show_title } })} className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${config.upsell?.show_title ? 'bg-primary' : 'bg-gray-800'}`}>
                                                <div className={`w-3 h-3 bg-white rounded-full transition-transform ${config.upsell?.show_title ? 'translate-x-4' : 'translate-x-0'}`} />
                                             </button>
                                          </div>
                                          <input
                                             type="text"
                                             className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3 text-white text-sm font-bold placeholder:text-gray-800 focus:border-primary/30 outline-none transition-all"
                                             placeholder="ESPERE! Oferta Única..."
                                             value={config.upsell?.title || ''}
                                             disabled={!config.upsell?.show_title}
                                             onChange={e => setConfig({ ...config, upsell: { ...config.upsell!, title: e.target.value } })}
                                          />
                                       </div>
                                       <div className="space-y-3">
                                          <div className="flex items-center justify-between px-1">
                                             <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Subtítulo (Auxiliar)</label>
                                             <button onClick={() => setConfig({ ...config, upsell: { ...config.upsell!, show_subtitle: !config.upsell?.show_subtitle } })} className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${config.upsell?.show_subtitle ? 'bg-primary' : 'bg-gray-800'}`}>
                                                <div className={`w-3 h-3 bg-white rounded-full transition-transform ${config.upsell?.show_subtitle ? 'translate-x-4' : 'translate-x-0'}`} />
                                             </button>
                                          </div>
                                          <input
                                             type="text"
                                             className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3 text-white text-sm font-bold placeholder:text-gray-800 focus:border-primary/30 outline-none transition-all"
                                             placeholder="Complete o seu kit estrategicamente..."
                                             value={config.upsell?.subtitle || ''}
                                             disabled={!config.upsell?.show_subtitle}
                                             onChange={e => setConfig({ ...config, upsell: { ...config.upsell!, subtitle: e.target.value } })}
                                          />
                                       </div>
                                    </div>

                                    <div className="space-y-3">
                                       <div className="flex items-center justify-between px-1">
                                          <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">URL de Mídia (Demo)</label>
                                          <div className="flex bg-[#05050A] rounded-lg p-0.5 border border-white/5">
                                             <button onClick={() => setConfig({ ...config, upsell: { ...config.upsell!, media_type: 'video' } })} className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest rounded-md transition-all ${config.upsell?.media_type === 'video' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-600'}`}>Vídeo</button>
                                             <button onClick={() => setConfig({ ...config, upsell: { ...config.upsell!, media_type: 'image' } })} className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest rounded-md transition-all ${config.upsell?.media_type === 'image' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-600'}`}>Imagem</button>
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
                                 </div>
                              </div>
                           </div>
                        )}
                     </div>
                  </section>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                     <section className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-500 lg:col-span-1 space-y-8">
                        <div className="flex items-center gap-4 ml-2">
                           <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-lg shadow-primary/10">
                              <ShoppingBag className="w-5 h-5" />
                           </div>
                           <h2 className="text-sm font-portal-display text-white uppercase tracking-tight">Data Grid</h2>
                        </div>
                        
                        <div className="p-8 bg-[#0A0A15]/80 border border-white/5 rounded-[2.5rem] shadow-2xl space-y-6">
                           {[
                              { id: 'name', label: 'Nome Completo', icon: User },
                              { id: 'email', label: 'E-mail Protocol', icon: Mail },
                              { id: 'phone', label: 'WhatsApp / Auth', icon: Phone },
                              { id: 'cpf', label: 'CPF / Legitimidade', icon: Fingerprint }
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

                     <section className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-[600ms] lg:col-span-2 space-y-8">
                        <div className="flex items-center gap-4 ml-2">
                           <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-500 shadow-lg shadow-purple-500/10">
                              <CreditCard className="w-5 h-5" />
                           </div>
                           <h2 className="text-sm font-portal-display text-white uppercase tracking-tight">Active Payments Nodes</h2>
                        </div>

                        <div className="p-8 bg-[#0A0A15]/80 border border-white/5 rounded-[2.5rem] shadow-2xl">
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {[
                                 { id: 'pix', label: 'Pix Instantâneo', icon: Zap },
                                 { id: 'credit_card', label: 'Cartão de Crédito', icon: CreditCard },
                                 { id: 'boleto', label: 'Boleto Bancário', icon: FileText },
                                 { id: 'apple_pay', label: 'Apple Pay Terminal', icon: Smartphone },
                                 { id: 'google_pay', label: 'Google Pay Sync', icon: Smartphone }
                              ].map(method => {
                                 const isStripeOnly = method.id === 'apple_pay' || method.id === 'google_pay';
                                 const isDisabled = isStripeOnly && gatewayId && gateways.find(g => g.id === gatewayId)?.name !== GatewayProvider.STRIPE;
                                 
                                 return (
                                    <button
                                       key={method.id}
                                       disabled={isDisabled}
                                       onClick={() => setConfig({
                                          ...config,
                                          payment_methods: { ...config.payment_methods, [method.id]: !config.payment_methods[method.id as keyof typeof config.payment_methods] }
                                       })}
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
                        </div>
                     </section>
                  </div>

                  <section className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-700">
                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                        <div className="space-y-8">
                           <div className="flex items-center gap-4 ml-2">
                              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shadow-lg shadow-rose-500/10">
                                 <Clock className="w-5 h-5" />
                              </div>
                              <h2 className="text-sm font-portal-display text-white uppercase tracking-tight">Escassez & Design</h2>
                           </div>

                           <div className="p-8 bg-[#0A0A15]/80 border border-white/5 rounded-[2.5rem] shadow-2xl space-y-8">
                              <div>
                                 <label className="block text-[10px] font-black text-gray-700 uppercase tracking-[0.3em] mb-4 italic">Protocolo de Tempo</label>
                                 <div className="flex items-center justify-between p-6 bg-white/[0.02] border border-white/5 rounded-2xl">
                                    <div className="flex items-center gap-4">
                                       <div className={`w-3 h-3 rounded-full ${config.timer.active ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]' : 'bg-gray-800'}`} />
                                       <span className="text-xs text-white font-bold uppercase tracking-tight italic">Timer Regressivo</span>
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
                                          <label className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em] mb-2 block">Célula de Tempo (Min)</label>
                                          <input type="number" className="w-full bg-[#05050A] border-2 border-white/5 rounded-xl px-4 py-2 text-white font-bold focus:border-rose-500/50 outline-none" value={config.timer.minutes} onChange={e => setConfig({ ...config, timer: { ...config.timer, minutes: parseInt(e.target.value) } })} />
                                       </div>
                                       <div>
                                          <label className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em] mb-2 block">Hex de Alerta</label>
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
                                 <label className="block text-[10px] font-black text-gray-700 uppercase tracking-[0.3em] mb-4 italic">Visual Node (Banner)</label>
                                 <div className="flex gap-4">
                                    <input
                                       type="text"
                                       className="w-full bg-white/[0.02] border-2 border-white/5 rounded-xl px-5 py-3 text-white text-xs font-bold focus:border-primary/50 outline-none"
                                       placeholder="URL da Imagem Central"
                                       value={config.header_image || ''}
                                       onChange={e => setConfig({ ...config, header_image: e.target.value })}
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
                                       <img src={config.header_image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="Banner Preview" />
                                       <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                          <button onClick={() => setConfig({ ...config, header_image: '' })} className="bg-rose-500 p-3 rounded-full text-white shadow-xl hover:scale-110 active:scale-95 transition-all">
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
                              <h2 className="text-sm font-portal-display text-white uppercase tracking-tight">Intelligence & Monitoring</h2>
                           </div>

                           <div className="p-8 bg-[#0A0A15]/80 border border-white/5 rounded-[2.5rem] shadow-2xl space-y-8">
                              <div className="flex items-center justify-between p-6 bg-blue-500/5 border border-blue-500/10 rounded-[1.5rem]">
                                 <div className="flex items-center gap-4">
                                    <div className={`w-3 h-3 rounded-full ${config.pixels?.active ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'bg-gray-800'}`} />
                                    <span className="text-xs text-white font-bold uppercase tracking-tight italic">Rede de Pixels Ativa</span>
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
                                       <label className="block text-[9px] font-black text-blue-500/60 uppercase tracking-widest mb-3 italic">Google Tag Manager (GTM)</label>
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
                        <h2 className="text-sm font-portal-display text-white uppercase tracking-tight">End-Point Strategy</h2>
                     </div>

                     <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                       <div className="lg:col-span-1 p-8 bg-[#0A0A15]/80 border border-white/5 rounded-[2.5rem] shadow-2xl flex flex-col justify-center">
                           <div className="flex items-center justify-between px-2">
                              <div>
                                 <p className="text-[10px] text-white font-black uppercase tracking-widest italic mb-1">Status Global</p>
                                 <p className="text-[9px] text-gray-700 font-bold uppercase tracking-wider">{active ? 'Pipeline Transacional On' : 'Protocolo em Offline'}</p>
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
                                 <label className="block text-[10px] font-black text-gray-700 uppercase tracking-[0.3em] mb-4 italic">Thank You Redirect</label>
                                 <input
                                    type="text"
                                    className="w-full bg-white/[0.02] border-2 border-white/5 rounded-2xl px-6 py-4 text-white font-bold text-xs placeholder:text-gray-900 focus:border-primary/50 outline-none transition-all"
                                    placeholder="Ex: /app/success ou WhatsApp"
                                    value={thankYouButtonUrl}
                                    onChange={e => setThankYouButtonUrl(e.target.value)}
                                 />
                              </div>
                              <div>
                                 <label className="block text-[10px] font-black text-gray-700 uppercase tracking-[0.3em] mb-4 italic">Label do Botão</label>
                                 <input
                                    type="text"
                                    className="w-full bg-white/[0.02] border-2 border-white/5 rounded-2xl px-6 py-4 text-white font-bold text-xs placeholder:text-gray-900 focus:border-primary/50 outline-none transition-all"
                                    placeholder="Acessar Conteúdo Agora"
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
                        Cancelar Estruturação
                     </Button>
                     <Button 
                        onClick={handleSave} 
                        className="w-full sm:w-auto px-12 h-16 rounded-[1.5rem] bg-primary hover:bg-rose-600 text-white font-black uppercase italic tracking-tighter shadow-2xl shadow-primary/40 flex items-center justify-center gap-4 active:scale-95 transition-all duration-500"
                     >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        <div className="flex flex-col items-start leading-none">
                           <span className="text-sm">{isNew ? 'Publicar Checkout' : 'Salvar Alterações'}</span>
                           <span className="text-[8px] opacity-60 font-medium uppercase tracking-[0.2em]">Deploy para infraestrutura live</span>
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

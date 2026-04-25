import React, { useState, useEffect } from 'react';
import { Layout } from '../../components/Layout';
import { storage } from '../../services/storageService';
import { Gateway, GatewayProvider } from '../../types';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { CheckCircle, AlertTriangle, Lock, Settings, CreditCard, ShieldCheck, Zap, ArrowRight, ArrowLeft } from 'lucide-react';
import { Modal, AlertModal } from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { BusinessSetupModal } from '../../components/admin/BusinessSetupModal';
import { useTranslation } from 'react-i18next';
import { sanitizeTranslationHtml } from '../../utils/sanitize';
import Aurora from '../../components/ui/Aurora';

export const Gateways = () => {
  const { t } = useTranslation(['admin', 'common']);
  const { compliance, user } = useAuth();
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [showComplianceModal, setShowComplianceModal] = useState(false);
  const [mpConfig, setMpConfig] = useState({
    public_key: '',
    private_key: '',
    webhook_secret: '',
    active: false,
    max_installments: 12,
    min_installment_value: 5.00
  });
  const [stripeConfig, setStripeConfig] = useState({
    public_key: '',
    private_key: '',
    webhook_secret: '',
    active: false,
    max_installments: 12,
    min_installment_value: 5.00,
    interest_rate: 2.99
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeModalApp, setActiveModalApp] = useState<'mp' | 'stripe' | null>(null);
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
      const all = await storage.getGateways();
      setGateways(all);

      const mp = all.find(g => g.name === GatewayProvider.MERCADO_PAGO);
      if (mp) {
        setMpConfig({
          public_key: mp.public_key || '',
          private_key: mp.private_key || '',
          webhook_secret: mp.webhook_secret || '',
          active: mp.active,
          max_installments: mp.config?.max_installments ?? 12,
          min_installment_value: mp.config?.min_installment_value ?? 5.00
        });
      }

      const stripe = all.find(g => g.name === GatewayProvider.STRIPE);
      if (stripe) {
        setStripeConfig({
          public_key: stripe.public_key || '',
          private_key: stripe.private_key || '',
          webhook_secret: stripe.webhook_secret || '',
          active: stripe.active,
          max_installments: stripe.config?.max_installments ?? 12,
          min_installment_value: stripe.config?.min_installment_value ?? 5.00,
          interest_rate: stripe.config?.interest_rate ?? 2.99
        });
      }
    };
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const provider = activeModalApp === 'mp' ? GatewayProvider.MERCADO_PAGO : GatewayProvider.STRIPE;
      const configState = activeModalApp === 'mp' ? mpConfig : stripeConfig;
      
      const { max_installments, min_installment_value, ...restConfig } = configState;
      const interest_rate = (configState as any).interest_rate;

      const gatewayData = {
        ...restConfig,
        config: {
          max_installments,
          min_installment_value,
          ...(interest_rate !== undefined ? { interest_rate } : {})
        }
      };

      const index = gateways.findIndex(g => g.name === provider);
      
      const saveResponse = await fetch(`/api/admin?action=save-gateway`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: index >= 0 ? gateways[index].id : undefined,
          provider: provider,
          name: provider,
          ...gatewayData,
          user_id: user?.id
        })
      });

      const saveResult = await saveResponse.json();

      if (!saveResponse.ok || !saveResult.success) {
        throw new Error(saveResult.error || 'Erro ao salvar gateway via API segura.');
      }

      const updatedGateways = await storage.getGateways();
      setGateways(updatedGateways);

      const mp = updatedGateways.find(g => g.name === GatewayProvider.MERCADO_PAGO);
      if (mp) setMpConfig({ ...mpConfig, active: mp.active, public_key: mp.public_key || '', private_key: mp.private_key || '' });

      const stripe = updatedGateways.find(g => g.name === GatewayProvider.STRIPE);
      if (stripe) setStripeConfig({ ...stripeConfig, active: stripe.active, public_key: stripe.public_key || '', private_key: stripe.private_key || '' });

      setIsModalOpen(false);
      setActiveModalApp(null);
      setTimeout(() => showAlert(t('common.success'), t('gateways.save_success'), 'success'), 100);
    } catch (error: any) {
      showAlert(t('common.error'), error.message || t('gateways.save_error'), 'error');
    }
  };

  return (
    <Layout>
      <div className="flex flex-col lg:flex-row justify-between lg:items-end mb-12 gap-8">
        <div>
          <h1 className="text-4xl lg:text-5xl font-portal-display text-white mb-2 uppercase leading-none">{t('gateways.title')}</h1>
          <div className="flex items-center gap-3">
             <p className="text-gray-600 font-medium uppercase tracking-[0.1em] text-[10px]">{t('gateways.subtitle')}</p>
             <div className="h-1 w-1 rounded-full bg-gray-800"></div>
             <span className="text-[10px] text-primary font-black uppercase tracking-[0.2em]">Transaction Core</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
           <div className="px-6 py-3 rounded-2xl bg-black/40 border border-white/5 flex items-center gap-3">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Criptografia de Ponta-a-Ponta Ativa</span>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Mercado Pago Card */}
        <div 
          onClick={() => {
            if (!compliance?.is_ready) { setShowComplianceModal(true); return; }
            setActiveModalApp('mp'); setIsModalOpen(true);
          }}
          className={`group relative h-64 rounded-[2.5rem] border transition-all duration-500 cursor-pointer overflow-hidden ${mpConfig.active ? 'bg-emerald-500/5 border-emerald-500/20 shadow-[0_0_50px_rgba(16,185,129,0.05)]' : 'bg-black/20 border-white/5 opacity-60 hover:opacity-100 hover:border-white/10'}`}
        >
          {mpConfig.active && <div className="absolute inset-0 opacity-10 pointer-events-none"><Aurora colorStops={['#10B981', '#059669', '#10B981']} amplitude={0.2} /></div>}
          
          <div className="absolute top-8 left-8">
             <div className={`px-4 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${mpConfig.active ? 'bg-emerald-500 text-black border-emerald-400 shadow-xl' : 'bg-white/5 text-gray-600 border-white/5'}`}>
                {mpConfig.active ? <CheckCircle className="w-3.5 h-3.5" /> : <div className="w-2 h-2 rounded-full bg-gray-800"></div>}
                {mpConfig.active ? 'Motor Ativo' : 'Offline'}
             </div>
          </div>

          <div className="h-full flex flex-col items-center justify-center p-12">
             <img src="/mercado-pago-logo.png" alt="MP" className="h-12 object-contain brightness-0 invert group-hover:scale-110 transition-transform duration-500" />
             <p className="mt-6 text-[10px] font-black text-gray-700 uppercase tracking-[0.3em] group-hover:text-gray-500 transition-colors">Latin America Standard</p>
          </div>

          <div className="absolute bottom-6 right-8 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
             <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white"><ArrowRight className="w-5 h-5" /></div>
          </div>
        </div>

        {/* Stripe Card */}
        <div 
          onClick={() => {
            if (!compliance?.is_ready) { setShowComplianceModal(true); return; }
            setActiveModalApp('stripe'); setIsModalOpen(true);
          }}
          className={`group relative h-64 rounded-[2.5rem] border transition-all duration-500 cursor-pointer overflow-hidden ${stripeConfig.active ? 'bg-emerald-500/5 border-emerald-500/20 shadow-[0_0_50px_rgba(16,185,129,0.05)]' : 'bg-black/20 border-white/5 opacity-60 hover:opacity-100 hover:border-white/10'}`}
        >
          {stripeConfig.active && <div className="absolute inset-0 opacity-10 pointer-events-none"><Aurora colorStops={['#10B981', '#059669', '#10B981']} amplitude={0.2} /></div>}
          
          <div className="absolute top-8 left-8">
             <div className={`px-4 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${stripeConfig.active ? 'bg-emerald-500 text-black border-emerald-400 shadow-xl' : 'bg-white/5 text-gray-600 border-white/5'}`}>
                {stripeConfig.active ? <CheckCircle className="w-3.5 h-3.5" /> : <div className="w-2 h-2 rounded-full bg-gray-800"></div>}
                {stripeConfig.active ? 'Motor Ativo' : 'Offline'}
             </div>
          </div>

          <div className="h-full flex flex-col items-center justify-center p-12">
             <img src="/stripe-logo.png" alt="Stripe" className="h-10 object-contain brightness-0 invert group-hover:scale-110 transition-transform duration-500" />
             <p className="mt-6 text-[10px] font-black text-gray-700 uppercase tracking-[0.3em] group-hover:text-gray-500 transition-colors">Global Infrastructure</p>
          </div>

          <div className="absolute bottom-6 right-8 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
             <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white"><ArrowRight className="w-5 h-5" /></div>
          </div>
        </div>
      </div>

      {/* Security Banner */}
      <div className="mt-12 p-8 rounded-[2rem] bg-black/20 border border-white/5 flex flex-col md:flex-row items-center justify-between gap-8 group">
         <div className="flex items-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5 group-hover:border-primary/30 transition-all">
               <Lock className="w-7 h-7 text-gray-700 group-hover:text-primary transition-colors" />
            </div>
            <div>
               <h3 className="text-xl font-portal-display text-white uppercase tracking-tight">Cofre de Segurança v4</h3>
               <p className="text-[10px] font-black text-gray-700 uppercase tracking-widest mt-1 leading-relaxed">Suas credenciais são criptografadas com AES-256 e nunca são armazenadas em texto plano. O processamento é direto via API Segura.</p>
            </div>
         </div>
         <div className="flex gap-4">
            <div className="px-5 py-3 rounded-xl bg-white/5 border border-white/5 text-[10px] font-black text-gray-500 uppercase tracking-widest">PCI DSS Compliant</div>
            <div className="px-5 py-3 rounded-xl bg-white/5 border border-white/5 text-[10px] font-black text-gray-500 uppercase tracking-widest">SSL Secure</div>
         </div>
      </div>

      {/* Config Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); setActiveModalApp(null); }}
        title={activeModalApp === 'mp' ? 'Sincronizar Mercado Pago' : 'Sincronizar Stripe'}
        className="max-w-2xl"
      >
        <form onSubmit={handleSave} className="space-y-8 p-1">
          <div className="bg-primary/5 border border-primary/20 p-6 rounded-[1.8rem] flex items-start gap-4">
            <Zap className="w-6 h-6 text-primary shrink-0 mt-0.5" />
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-relaxed" dangerouslySetInnerHTML={{ __html: sanitizeTranslationHtml(activeModalApp === 'mp' ? t('gateways.mp_hint') : 'Para configurar o Stripe, acesse seu painel na aba Desenvolvedores, crie as chaves de API e configure o Webhook para apontar para seu sistema.') }} />
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6">
               <div>
                  <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest mb-3 block">Chave Pública (Public Key)</label>
                  <input
                    type="text"
                    className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 focus:border-primary/50 outline-none text-white font-mono text-sm transition-all"
                    placeholder={activeModalApp === 'mp' ? "APP_USR-..." : "pk_live_..."}
                    value={activeModalApp === 'mp' ? mpConfig.public_key : stripeConfig.public_key}
                    onChange={e => {
                      if (activeModalApp === 'mp') setMpConfig({ ...mpConfig, public_key: e.target.value });
                      else setStripeConfig({ ...stripeConfig, public_key: e.target.value });
                    }}
                    required
                  />
               </div>

               <div>
                  <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest mb-3 block">Chave Secreta (Secret Key)</label>
                  <input
                    type="password"
                    className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 focus:border-primary/50 outline-none text-white font-mono text-sm transition-all"
                    placeholder={activeModalApp === 'mp' ? "APP_USR-..." : "sk_live_..."}
                    value={activeModalApp === 'mp' ? mpConfig.private_key : stripeConfig.private_key}
                    onChange={e => {
                      if (activeModalApp === 'mp') setMpConfig({ ...mpConfig, private_key: e.target.value });
                      else setStripeConfig({ ...stripeConfig, private_key: e.target.value });
                    }}
                    required
                  />
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <Card className="bg-white/5 border-white/5 rounded-[1.8rem]">
                  <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest mb-4 block">Parcelamento Máximo</label>
                  <div className="grid grid-cols-4 gap-2">
                     {[1, 3, 6, 12, 10, 8, 4, 1].slice(0, 4).sort((a,b)=>a-b).concat([2,4,6,12].slice(0,4).filter(n => ![1,3].includes(n))).slice(0,4).map(n => (
                        <button 
                          key={n}
                          type="button"
                          onClick={() => {
                            if (activeModalApp === 'mp') setMpConfig({ ...mpConfig, max_installments: n });
                            else setStripeConfig({ ...stripeConfig, max_installments: n });
                          }}
                          className={`py-3 rounded-xl text-[10px] font-black border transition-all ${(activeModalApp === 'mp' ? mpConfig.max_installments : stripeConfig.max_installments) === n ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20' : 'bg-black/20 border-white/5 text-gray-700 hover:bg-white/5'}`}
                        >
                           {n}X
                        </button>
                     ))}
                  </div>
               </Card>

               <Card className="bg-white/5 border-white/5 rounded-[1.8rem]">
                  <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest mb-4 block">Mínimo por Parcela</label>
                  <div className="relative">
                     <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-700 font-bold">R$</span>
                     <input
                       type="number" step="0.01"
                       className="w-full bg-black/40 border border-white/5 rounded-xl pl-12 pr-6 py-3 focus:border-primary/50 outline-none text-white font-bold"
                       value={activeModalApp === 'mp' ? mpConfig.min_installment_value : stripeConfig.min_installment_value}
                       onChange={e => {
                         const val = parseFloat(e.target.value);
                         if (activeModalApp === 'mp') setMpConfig({ ...mpConfig, min_installment_value: val });
                         else setStripeConfig({ ...stripeConfig, min_installment_value: val });
                       }}
                     />
                  </div>
               </Card>
            </div>

            {activeModalApp === 'stripe' && (
               <div className="p-6 rounded-[1.8rem] bg-white/5 border border-white/5">
                  <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest mb-3 block">Taxa de Juros Mensal (%)</label>
                  <input
                    type="number" step="0.01"
                    className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 focus:border-primary/50 outline-none text-white font-bold"
                    value={stripeConfig.interest_rate}
                    onChange={e => setStripeConfig({ ...stripeConfig, interest_rate: parseFloat(e.target.value) })}
                  />
               </div>
            )}

            <div>
               <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest mb-3 block">Secret de Webhook (Opcional)</label>
               <input
                 type="text"
                 className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 focus:border-primary/50 outline-none text-white font-mono text-xs transition-all"
                 placeholder="whsec_..."
                 value={activeModalApp === 'mp' ? mpConfig.webhook_secret : stripeConfig.webhook_secret}
                 onChange={e => {
                   if (activeModalApp === 'mp') setMpConfig({ ...mpConfig, webhook_secret: e.target.value });
                   else setStripeConfig({ ...stripeConfig, webhook_secret: e.target.value });
                 }}
               />
            </div>
          </div>

          <div className="pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-6">
             <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => {
                    if (activeModalApp === 'mp') setMpConfig({ ...mpConfig, active: !mpConfig.active });
                    else setStripeConfig({ ...stripeConfig, active: !stripeConfig.active });
                  }}
                  className={`w-14 h-8 rounded-full transition-all relative ${((activeModalApp === 'mp' ? mpConfig.active : stripeConfig.active)) ? 'bg-primary' : 'bg-gray-800'}`}
                >
                   <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${((activeModalApp === 'mp' ? mpConfig.active : stripeConfig.active)) ? 'left-7 shadow-xl' : 'left-1'}`} />
                </button>
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Habilitar Gateway</span>
             </div>
             <div className="flex gap-4">
               <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-4 text-[10px] font-black text-gray-600 uppercase tracking-widest">Abortar</button>
               <Button type="submit" className="px-10 py-5 bg-white text-black font-black uppercase text-xs tracking-widest rounded-3xl border-none shadow-2xl">Vincular Motor</Button>
             </div>
          </div>
        </form>
      </Modal>

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

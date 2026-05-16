import React, { useState, useEffect } from 'react';
import { Layout } from '../../components/Layout';
import { storage } from '../../services/storageService';
import { Offer, Product, PaymentType, RecurrenceType } from '../../types';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal, ConfirmModal, AlertModal } from '../../components/ui/Modal';
import { Plus, Trash2, Tag, ChevronRight, Check, X, DollarSign, Calendar, Zap, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Aurora from '../../components/ui/Aurora';

export const Offers = () => {
  const { t, i18n } = useTranslation(['admin', 'common']);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Modal States
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
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

  const [formData, setFormData] = useState({
    name: '',
    product_id: '',
    price: 0,
    payment_type: PaymentType.ONE_TIME,
    recurrence_type: RecurrenceType.NONE
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setOffers(await storage.getOffers());
    setProducts(await storage.getProducts());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await storage.createOffer({
        active: true,
        ...formData
      });

      await loadData();
      setIsModalOpen(false);
      setFormData({ name: '', product_id: '', price: 0, payment_type: PaymentType.ONE_TIME, recurrence_type: RecurrenceType.NONE });
      showAlert(t('common.success'), t('offers.create_success'), 'success');
    } catch (error) {
      console.error('Error creating offer:', error);
      showAlert(t('common.error'), t('offers.create_error'), 'error');
    }
  };

  const handleDeleteClick = (id: string) => setDeleteId(id);

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    try {
      setIsDeleting(true);
      await storage.deleteOffer(deleteId);
      await loadData();
      setDeleteId(null);
      showAlert(t('common.success'), t('offers.delete_success'), 'success');
    } catch (e) {
      console.error(e);
      showAlert(t('common.error'), t('offers.delete_error'), 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat(i18n.language === 'pt' ? 'pt-BR' : 'en-US', { style: 'currency', currency: i18n.language === 'pt' ? 'BRL' : 'USD' }).format(val);

  return (
    <Layout>
      <div className="flex flex-col lg:flex-row justify-between lg:items-end mb-12 gap-8">
        <div>
          <h1 className="text-4xl lg:text-5xl font-portal-display text-white mb-2 uppercase leading-none">{t('offers.title', 'Ofertas')}</h1>
          <div className="flex items-center gap-3">
             <p className="text-gray-600 font-medium uppercase tracking-[0.1em] text-[10px]">{t('offers.subtitle', 'Crie planos de preços para seus produtos.')}</p>
             <div className="h-1 w-1 rounded-full bg-gray-800"></div>
             <span className="text-[10px] text-primary font-black uppercase tracking-[0.2em]">Strategy Lab</span>
          </div>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="px-10 py-4 bg-primary text-white rounded-[1.5rem] shadow-2xl shadow-primary/30 border-none font-black uppercase tracking-widest text-xs flex items-center gap-3 active:scale-95 transition-all">
          <Plus className="w-5 h-5" /> {t('offers.create_btn', 'Nova Oferta')}
        </Button>
      </div>

      {offers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
           <div className="w-24 h-24 bg-white/5 rounded-[2rem] flex items-center justify-center mb-6 border border-white/5">
              <Tag className="w-10 h-10 text-gray-700" />
           </div>
           <h3 className="text-2xl font-portal-display text-white uppercase tracking-tight opacity-40">{t('offers.no_offers', 'Nenhuma oferta encontrada')}</h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4">
          {offers.map(offer => {
            const product = products.find(p => p.id === offer.product_id);
            const isRecurring = offer.payment_type === PaymentType.RECURRING;
            
            return (
              <div 
                key={offer.id}
                className="group relative bg-[#0F0F15]/40 hover:bg-[#151520]/60 border border-white/5 hover:border-primary/30 rounded-[2rem] p-6 lg:p-4 transition-all duration-300 overflow-hidden"
              >
                <div className="relative z-20 flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-10">
                   {/* Offer Icon & Name */}
                   <div className="flex items-center gap-4 lg:w-72 shrink-0">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all ${isRecurring ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-primary/10 border-primary/20 text-primary'}`}>
                         <Zap className="w-6 h-6" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-700 mb-1">Nome da Oferta</p>
                        <h3 className="text-lg font-bold text-white group-hover:text-primary transition-colors truncate">{offer.name}</h3>
                      </div>
                   </div>

                   {/* Product Linking */}
                   <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-700 mb-1">Produto Vinculado</p>
                      <div className="flex items-center gap-2">
                         <Layers className="w-3.5 h-3.5 text-gray-600" />
                         <span className="text-xs font-bold text-gray-400 truncate">{product?.name || 'Produto Desconhecido'}</span>
                      </div>
                   </div>

                   {/* Pricing */}
                   <div className="lg:w-48 shrink-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-700 mb-1">Valor do Plano</p>
                      <div className="flex items-baseline gap-1">
                         <span className="text-2xl font-portal-display text-white">{formatCurrency(offer.price)}</span>
                         {isRecurring && <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest">/ {offer.recurrence_type === RecurrenceType.MONTHLY ? 'Mês' : 'Ano'}</span>}
                      </div>
                   </div>

                   {/* Type Badge & Action */}
                   <div className="lg:w-64 flex items-center justify-between lg:justify-end gap-6 shrink-0">
                      <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border ${isRecurring ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-white/5 text-gray-500 border-white/5'}`}>
                         {isRecurring ? 'Recorrência' : 'Compra Única'}
                      </div>
                      
                      <div className="flex items-center gap-2">
                         <button 
                          onClick={() => handleDeleteClick(offer.id)} 
                          className="p-3 rounded-2xl bg-red-500/5 hover:bg-red-500/10 text-red-500/40 hover:text-red-500 border border-white/5 hover:border-red-500/20 transition-all"
                         >
                           <Trash2 className="w-4 h-4" />
                         </button>
                      </div>
                   </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Nova Configuração de Preço">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
           <Aurora colorStops={['#8A2BE2', '#4B0082', '#0000FF']} amplitude={0.5} speed={0.2} />
        </div>
        <form onSubmit={handleSubmit} className="relative z-10 space-y-6 p-2">
          <div>
            <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3">Nome da Oferta (Interno)</label>
            <input
              required type="text"
              className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 focus:border-primary/50 outline-none text-white text-sm font-medium transition-all"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Black Friday 2024"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3">Vincular ao Produto</label>
            <select
              required
              className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 focus:border-primary/50 outline-none text-white text-sm font-medium appearance-none cursor-pointer [&>option]:bg-[#0F0F15]"
              value={formData.product_id}
              onChange={e => setFormData({ ...formData, product_id: e.target.value })}
            >
              <option value="">Selecione...</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3">Valor Cobrado</label>
              <div className="relative">
                 <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-700 font-black text-xs">R$</span>
                 <input
                   required type="number" step="0.01"
                   className="w-full bg-black/40 border border-white/5 rounded-2xl pl-12 pr-5 py-4 focus:border-emerald-500/50 outline-none text-white text-lg font-portal-display transition-all"
                   value={formData.price}
                   onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                 />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3">Tipo de Ciclo</label>
              <select
                className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 focus:border-primary/50 outline-none text-white text-sm font-medium appearance-none cursor-pointer [&>option]:bg-[#0F0F15]"
                value={formData.payment_type}
                onChange={e => setFormData({ ...formData, payment_type: e.target.value as PaymentType })}
              >
                <option value={PaymentType.ONE_TIME}>Compra Única</option>
                <option value={PaymentType.RECURRING}>Assinatura</option>
              </select>
            </div>
          </div>

          {formData.payment_type === PaymentType.RECURRING && (
            <div className="animate-in fade-in slide-in-from-top-2">
              <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3">Frequência da Cobrança</label>
              <div className="grid grid-cols-2 gap-4">
                 {[RecurrenceType.MONTHLY, RecurrenceType.YEARLY].map(type => (
                   <button
                    key={type}
                    type="button"
                    onClick={() => setFormData({ ...formData, recurrence_type: type })}
                    className={`p-4 rounded-2xl border transition-all text-sm font-bold uppercase tracking-widest ${formData.recurrence_type === type ? 'bg-primary/20 border-primary text-primary shadow-lg shadow-primary/10' : 'bg-black/20 border-white/5 text-gray-700'}`}
                   >
                     {type === RecurrenceType.MONTHLY ? 'Mensal' : 'Anual'}
                   </button>
                 ))}
              </div>
            </div>
          )}

          <div className="pt-8 flex justify-end gap-4">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-3 text-[10px] font-black text-gray-600 uppercase tracking-widest hover:text-white transition-colors">Cancelar</button>
            <Button type="submit" className="px-8 py-4 bg-white text-black font-black uppercase text-xs tracking-widest rounded-2xl shadow-xl transition-all active:scale-95">Criar Estratégia</Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title="Excluir Plano"
        message="Tem certeza que deseja remover esta estratégia de preço? Esta ação não pode ser desfeita."
        confirmText="Confirmar Exclusão"
        cancelText="Manter Oferta"
        variant="danger"
        loading={isDeleting}
      />

      <AlertModal
        isOpen={alertState.isOpen}
        onClose={closeAlert}
        title={alertState.title}
        message={alertState.message}
        variant={alertState.variant}
      />
    </Layout>
  );
};

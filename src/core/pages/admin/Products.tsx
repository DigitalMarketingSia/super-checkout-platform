import React, { useState, useEffect, useRef } from 'react';
import { Layout } from '../../components/Layout';
import { storage } from '../../services/storageService';
import { Product, Content, Checkout, MemberArea } from '../../types';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmModal, AlertModal } from '../../components/ui/Modal';
import { 
  Plus, Edit2, Trash2, Image as ImageIcon, Search, Upload, ArrowLeft, Save, Layers, ArrowRight, Copy, Check, ChevronRight, Crown, Zap, Users 
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { BusinessSetupModal } from '../../components/admin/BusinessSetupModal';
import { useTranslation } from 'react-i18next';
import { useFeatures } from '../../hooks/useFeatures';
import { UpsellModal } from '../../components/ui/UpsellModal';
import Aurora from '../../components/ui/Aurora';

// Initial Form State
const initialFormState = {
  name: '',
  description: '',
  imageUrl: '',
  price_real: 0,
  price_fake: 0,
  sku: '',
  category: '',
  redirect_link: '',
  is_order_bump: false,
  is_upsell: false,
  active: true,
  member_area_action: 'checkout' as 'checkout' | 'sales_page',
  member_area_checkout_id: '',
  saas_plan_slug: '',
  member_area_id: null as string | null
};

export const Products = () => {
  const { t, i18n } = useTranslation(['admin', 'common']);
  const { profile, compliance, isWhiteLabel } = useAuth();
  const { getLimit, loading: checkingFeatures } = useFeatures();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'edit'>('grid');

  // Upsell Modal state
  const [isUpsellModalOpen, setIsUpsellModalOpen] = useState(false);
  const [upsellSlug, setUpsellSlug] = useState<string | null>(null);

  // Compliance Logic
  const [showComplianceModal, setShowComplianceModal] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentProductId, setCurrentProductId] = useState<string | null>(null);
  const [formData, setFormData] = useState(initialFormState);
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [availableContents, setAvailableContents] = useState<Content[]>([]);
  const [selectedContentIds, setSelectedContentIds] = useState<string[]>([]);
  const [checkouts, setCheckouts] = useState<Checkout[]>([]);
  const [memberAreas, setMemberAreas] = useState<MemberArea[]>([]);

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

  // Search and Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 9;

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const formatCurrency = (val: number | undefined) => {
    if (val === undefined || isNaN(val)) return i18n.language === 'pt' ? 'R$ 0,00' : '$ 0.00';
    return new Intl.NumberFormat(i18n.language === 'pt' ? 'pt-BR' : 'en-US', { 
      style: 'currency', 
      currency: i18n.language === 'pt' ? 'BRL' : 'USD' 
    }).format(val);
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const loadData = async () => {
    setLoading(true);
    const data = await storage.getProducts();
    setProducts(data);

    const contents = await storage.getContents();
    setAvailableContents(contents);

    const checkoutsData = await storage.getCheckouts();
    setCheckouts(checkoutsData);

    const areas = await storage.getMemberAreas();
    setMemberAreas(areas);

    setLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingId) {
        const productToUpdate: Product = { id: editingId, ...formData };
        await storage.updateProduct(productToUpdate);
      } else {
        await storage.createProduct({ id: currentProductId!, ...formData });
      }

      if (currentProductId) {
        await storage.setProductContents(currentProductId, selectedContentIds);
      }

      await loadData();
      setViewMode('grid');
      setEditingId(null);
      setCurrentProductId(null);
    } catch (error) {
      console.error('Error saving product:', error);
      const detailedError = error instanceof Error ? error.message : JSON.stringify(error);
      showAlert(t('products.error_saving'), detailedError, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (id: string) => setDeleteId(id);

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    try {
      setIsDeleting(true);
      await storage.deleteProduct(deleteId);
      await loadData();
      setDeleteId(null);
      showAlert(t('common.success'), t('products.delete_success'), 'success');
    } catch (error) {
      console.error('Error deleting product:', error);
      showAlert(t('common.error'), t('products.delete_error'), 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        setUploading(true);
        if (!currentProductId) throw new Error("No product ID available");
        const publicUrl = await storage.uploadProductImage(file, currentProductId);
        setFormData({ ...formData, imageUrl: publicUrl });
      } catch (error) {
        console.error('Error uploading image:', error);
        showAlert(t('common.error'), t('common.upload_error'), 'error');
      } finally {
        setUploading(false);
      }
    }
  };

  const openEdit = (product?: Product) => {
    if (product) {
      setEditingId(product.id);
      setCurrentProductId(product.id);
      setFormData({
        name: product.name,
        description: product.description,
        imageUrl: product.imageUrl || '',
        price_real: product.price_real || 0,
        price_fake: product.price_fake || 0,
        sku: product.sku || '',
        category: product.category || '',
        redirect_link: product.redirect_link || '',
        is_order_bump: product.is_order_bump || false,
        is_upsell: product.is_upsell || false,
        active: product.active,
        member_area_action: product.member_area_action || 'checkout',
        member_area_checkout_id: product.member_area_checkout_id || '',
        saas_plan_slug: product.saas_plan_slug || '',
        member_area_id: product.member_area_id || null
      });
      storage.getProductContents(product.id).then(ids => setSelectedContentIds(ids));
    } else {
      setEditingId(null);
      const newId = crypto.randomUUID();
      setCurrentProductId(newId);
      setFormData(initialFormState);
      setSelectedContentIds([]);
    }
    setViewMode('edit');
  };

  const handleActionWithCompliance = (action: () => void) => {
    if (!compliance?.is_ready) {
      setShowComplianceModal(true);
      return;
    }
    action();
  };

  const handleCreateProduct = async () => {
    if (checkingFeatures) return;

    const limit = getLimit('products') ?? 3;
    const allowed = limit === 'unlimited' || (limit && products.length < limit);
    if (!allowed) {
      setUpsellSlug('unlimited_domains');
      setIsUpsellModalOpen(true);
      return;
    }
    openEdit();
  };

  const renderGrid = () => {
    const productLimit = getLimit('products') ?? 3;
    const filteredProducts = products.filter(product =>
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (product.category && product.category.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedProducts = filteredProducts.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    return (
      <div className="animate-in fade-in duration-500">
        <div className="flex flex-col lg:flex-row justify-between lg:items-end mb-12 gap-8">
          <div>
            <h1 className="text-4xl lg:text-5xl font-portal-display text-white mb-2 uppercase leading-none">{t('products.title')}</h1>
            <div className="flex items-center gap-3">
               <p className="text-gray-600 font-medium uppercase tracking-[0.1em] text-[10px]">{t('products.subtitle')}</p>
               {!checkingFeatures && productLimit && (
                  <>
                    <div className="h-1 w-1 rounded-full bg-gray-800"></div>
                    <span className="text-[10px] text-primary font-black uppercase tracking-[0.2em]">
                       {products.length} / {productLimit === 'unlimited' ? '∞' : productLimit} {t('products.limit_label')}
                    </span>
                  </>
               )}
            </div>
          </div>
          <Button disabled={checkingFeatures} onClick={() => handleActionWithCompliance(handleCreateProduct)} className="px-10 py-4 bg-primary text-white rounded-[1.5rem] shadow-2xl shadow-primary/30 border-none font-black uppercase tracking-widest text-xs flex items-center gap-3 active:scale-95 transition-all">
            <Plus className="w-5 h-5" /> {t('products.create_btn')}
          </Button>
        </div>

        {/* Search Bar */}
        <div className="mb-12 relative group max-w-2xl">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-700 group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            placeholder={t('products.search_placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-black/40 border border-white/5 rounded-3xl pl-16 pr-6 py-5 text-white outline-none focus:border-primary/50 transition-all placeholder:text-gray-700 font-medium text-lg"
          />
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map(i => <Card key={i} className="h-96 animate-pulse opacity-50"><div /></Card>)}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
             <div className="w-24 h-24 bg-white/5 rounded-[2rem] flex items-center justify-center mb-6 border border-white/5">
                <Layers className="w-10 h-10 text-gray-700" />
             </div>
             <h3 className="text-2xl font-portal-display text-white uppercase tracking-tight opacity-40">{t('products.no_products')}</h3>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
              {paginatedProducts.map(product => (
                <div key={product.id} className="group relative flex flex-col bg-[#0F0F15]/40 hover:bg-[#151520]/60 border border-white/5 hover:border-primary/30 rounded-[2.5rem] overflow-hidden transition-all duration-300">
                  <div className="p-8 flex flex-col h-full">
                    <div className="flex justify-between items-start mb-6">
                      <div className="min-w-0">
                        <h3 className="text-xl font-portal-display text-white group-hover:text-primary transition-colors truncate mb-1">{product.name}</h3>
                        <div className="flex items-center gap-2">
                           <span className="text-[10px] text-gray-700 font-black uppercase tracking-widest">{product.category || 'General'}</span>
                           <div className="w-1 h-1 rounded-full bg-gray-800"></div>
                           <span className={`text-[10px] font-black uppercase tracking-widest ${product.active ? 'text-emerald-500' : 'text-gray-600'}`}>{product.active ? t('common.active') : t('common.inactive')}</span>
                        </div>
                      </div>
                      <button onClick={() => handleCopyId(product.id)} className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-600 hover:text-white transition-colors">
                        {copiedId === product.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>

                    <div className="relative w-full aspect-video rounded-[1.8rem] overflow-hidden bg-black/40 border border-white/5 mb-6">
                      {product.imageUrl ? <img src={product.imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-10 h-10 text-gray-800" /></div>}
                      
                      {/* Price Badge Over Image */}
                      <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 text-white font-portal-display text-lg">
                         {new Intl.NumberFormat(i18n.language === 'pt' ? 'pt-BR' : 'en-US', { style: 'currency', currency: i18n.language === 'pt' ? 'BRL' : 'USD' }).format(product.price_real || 0)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap mb-8">
                       {product.is_order_bump && <span className="text-[8px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-500 border border-emerald-500/10 px-2 py-1 rounded-md">Order Bump</span>}
                       {product.is_upsell && <span className="text-[8px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-500 border border-blue-500/10 px-2 py-1 rounded-md">Upsell</span>}
                    </div>

                    <div className="flex gap-3 mt-auto">
                       <button 
                        onClick={() => openEdit(product)} 
                        className="flex-1 bg-white/5 hover:bg-white/10 text-white py-4 rounded-2xl text-xs font-black uppercase tracking-widest border border-white/5 transition-all flex items-center justify-center gap-2"
                       >
                         <Edit2 className="w-4 h-4" /> {t('products.edit_btn')}
                       </button>
                       <button 
                        onClick={() => handleDeleteClick(product.id)} 
                        className="w-14 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-2xl flex items-center justify-center border border-red-500/10 transition-all"
                       >
                         <Trash2 className="w-5 h-5" />
                       </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3">
                <button onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="w-12 h-12 bg-black/40 border border-white/5 rounded-2xl flex items-center justify-center text-gray-700 hover:text-white disabled:opacity-20 transition-all">
                  <ChevronRight className="w-5 h-5 rotate-180" />
                </button>
                <div className="bg-black/40 px-6 py-3 rounded-2xl border border-white/5 text-[10px] font-black uppercase tracking-widest text-gray-500">
                   Page {currentPage} of {totalPages}
                </div>
                <button onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="w-12 h-12 bg-black/40 border border-white/5 rounded-2xl flex items-center justify-center text-gray-700 hover:text-white disabled:opacity-20 transition-all">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderEdit = () => (
    <div className="animate-in slide-in-from-right duration-500">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-12 gap-8">
        <div className="flex items-center gap-6">
          <button onClick={() => setViewMode('grid')} className="w-14 h-14 rounded-[1.5rem] bg-black/40 border border-white/5 flex items-center justify-center text-gray-500 hover:text-white transition-all shadow-xl">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-4xl font-portal-display text-white uppercase leading-none">{editingId ? t('products.edit_title') : t('products.new_title')}</h1>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-600 mt-2">Configuração de Produto</p>
          </div>
        </div>
        <Button onClick={handleSave} isLoading={loading} className="px-10 py-5 bg-white text-black font-black uppercase text-xs tracking-widest rounded-3xl border-none shadow-2xl transition-all active:scale-95 flex items-center gap-3">
          <Save className="w-5 h-5" /> {t('products.save_btn')}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-1 space-y-8">
          <Card className="p-8">
            <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-6">{t('products.image_label')}</h3>
            <div className="relative w-full aspect-square rounded-[2rem] bg-black/40 border-2 border-dashed border-white/5 overflow-hidden mb-8 group">
              {formData.imageUrl ? (
                <>
                  <img src={formData.imageUrl} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button onClick={() => fileInputRef.current?.click()} className="px-6 py-3 bg-white text-black rounded-xl text-xs font-black uppercase tracking-widest">{t('common.change')}</button>
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-10 h-10 text-gray-800 mb-4" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-700">{uploading ? t('products.uploading_msg') : t('products.upload_btn')}</span>
                </div>
              )}
            </div>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
            
            <div className="space-y-4">
               <div>
                  <label className="text-[10px] text-gray-600 font-black uppercase tracking-widest mb-2 block">{t('products.external_url_label')}</label>
                  <input type="text" className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-sm text-white focus:border-white/20 outline-none transition-all placeholder:text-gray-800" placeholder="https://..." value={formData.imageUrl} onChange={e => setFormData({ ...formData, imageUrl: e.target.value })} />
               </div>
            </div>
          </Card>

          {/* Pricing Summary Widget */}
          <Card className="relative overflow-hidden p-8 bg-black/40">
             <div className="absolute inset-0 opacity-10">
                <Aurora colorStops={['#8A2BE2', '#4B0082', '#0000FF']} amplitude={0.5} speed={0.2} />
             </div>
             <div className="relative z-10">
                <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-6 px-1">Resumo Financeiro</h3>
                <div className="space-y-6">
                   <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Preço Final</p>
                      <p className="text-4xl font-portal-display text-white">{formatCurrency(formData.price_real)}</p>
                   </div>
                   {formData.price_fake > 0 && (
                     <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-700 mb-1">Preço Comparativo</p>
                        <p className="text-2xl font-portal-display text-gray-800 line-through decoration-red-500/50">{formatCurrency(formData.price_fake)}</p>
                     </div>
                   )}
                </div>
             </div>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-10">
          {/* Informações Básicas */}
          <section className="space-y-6">
             <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                   <Layers className="w-5 h-5" />
                </div>
                <h2 className="text-2xl font-portal-display text-white uppercase tracking-tight">Informações Básicas</h2>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                   <label className="block text-[10px] text-gray-600 font-black uppercase tracking-widest mb-3">{t('products.name_label')}</label>
                   <input type="text" className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 text-white placeholder:text-gray-800 focus:border-white/20 transition-all" placeholder={t('products.name_placeholder')} value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                </div>

                <div>
                   <label className="block text-[10px] text-gray-600 font-black uppercase tracking-widest mb-3">{t('products.category_label')}</label>
                   <input type="text" className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 text-white placeholder:text-gray-800 focus:border-white/20 transition-all font-medium" placeholder={t('products.category_placeholder')} value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} />
                </div>

                <div>
                   <label className="block text-[10px] text-gray-600 font-black uppercase tracking-widest mb-3">SKU / Identificador Externo</label>
                   <input type="text" className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 text-white placeholder:text-gray-800 focus:border-white/20 transition-all font-mono text-xs uppercase" placeholder="PROD-001" value={formData.sku} onChange={e => setFormData({ ...formData, sku: e.target.value !== '' && e.target.value ? e.target.value : '' })} />
                </div>

                <div>
                   <label className="block text-[10px] text-gray-600 font-black uppercase tracking-widest mb-3">{t('products.price_real_label')}</label>
                   <div className="relative">
                      <span className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-800 font-black text-xs">{i18n.language === 'pt' ? 'R$' : '$'}</span>
                      <input type="number" step="0.01" className="w-full bg-black/40 border border-white/5 rounded-2xl pl-14 pr-6 py-4 text-white placeholder:text-gray-800 focus:border-emerald-500/50 transition-all font-bold" placeholder="0.00" value={formData.price_real} onChange={e => setFormData({ ...formData, price_real: parseFloat(e.target.value) })} />
                   </div>
                </div>

                <div>
                   <label className="block text-[10px] text-gray-600 font-black uppercase tracking-widest mb-3 text-red-500/50">{t('products.price_fake_label')}</label>
                   <div className="relative">
                      <span className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-800 font-black text-xs">{i18n.language === 'pt' ? 'R$' : '$'}</span>
                      <input type="number" step="0.01" className="w-full bg-black/40 border border-white/5 rounded-2xl pl-14 pr-6 py-4 text-white placeholder:text-gray-800 focus:border-red-500/20 transition-all opacity-60" placeholder="0.00" value={formData.price_fake} onChange={e => setFormData({ ...formData, price_fake: parseFloat(e.target.value) })} />
                   </div>
                </div>

                <div className="md:col-span-2">
                   <label className="block text-[10px] text-gray-600 font-black uppercase tracking-widest mb-3">{t('products.description_label')}</label>
                   <textarea className="w-full bg-black/40 border border-white/5 rounded-3xl px-6 py-5 text-white placeholder:text-gray-800 focus:border-white/20 transition-all resize-none font-medium h-40" placeholder={t('products.description_placeholder')} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                </div>
             </div>
          </section>

          {/* Configurações de Fluxo */}
          <section className="space-y-8 pt-10 border-t border-white/5">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                   <Zap className="w-5 h-5" />
                </div>
                <h2 className="text-2xl font-portal-display text-white uppercase tracking-tight">Fluxo & Estratégia</h2>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Switchers em formato de Cards Premium */}
                {[
                  { id: 'active', label: t('products.active_label'), desc: t('products.active_desc'), icon: Check, color: 'text-emerald-500' },
                  { id: 'is_order_bump', label: 'Order Bump', desc: 'Permitir que este produto seja ofertado no checkout', icon: Layers, color: 'text-blue-400' },
                  { id: 'is_upsell', label: 'One-Click Upsell', desc: 'Permitir que este produto seja ofertado após a compra', icon: ArrowRight, color: 'text-primary' }
                ].map(sw => (
                  <div key={sw.id} onClick={() => setFormData({ ...formData, [sw.id]: !(formData as any)[sw.id] })} className={`p-6 rounded-[2rem] border transition-all cursor-pointer flex items-center justify-between group ${ (formData as any)[sw.id] ? 'bg-white/5 border-white/20' : 'bg-black/20 border-white/5 opacity-50 hover:opacity-80'}`}>
                     <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl bg-black/40 border border-white/5 flex items-center justify-center ${sw.color}`}>
                           <sw.icon className="w-5 h-5" />
                        </div>
                        <div>
                           <p className="text-sm font-bold text-white mb-0.5">{sw.label}</p>
                           <p className="text-[10px] text-gray-700 leading-tight pr-4">{sw.desc}</p>
                        </div>
                     </div>
                     <div className={`w-12 h-6 rounded-full p-1 transition-colors ${(formData as any)[sw.id] ? 'bg-primary' : 'bg-gray-800'}`}>
                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${(formData as any)[sw.id] ? 'translate-x-6' : 'translate-x-0'}`} />
                     </div>
                  </div>
                ))}
             </div>
          </section>

          {/* Entrega Automática */}
          <section className="pt-10 border-t border-white/5">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                   <Users className="w-5 h-5" />
                </div>
                <h2 className="text-2xl font-portal-display text-white uppercase tracking-tight">Entrega Automática</h2>
             </div>

             <div className="space-y-6">
                <div className="p-8 rounded-[2rem] bg-black/40 border border-white/5">
                   <label className="text-[10px] text-gray-600 font-black uppercase tracking-widest mb-4 block">Página de Destino após Compra</label>
                   <div className="flex flex-col md:flex-row gap-4 mb-8">
                      {['checkout', 'sales_page'].map(act => (
                         <label key={act} className={`flex-1 flex items-center gap-4 p-5 rounded-[1.5rem] border transition-all cursor-pointer ${formData.member_area_action === act ? 'bg-primary/10 border-primary shadow-lg shadow-primary/10' : 'bg-black/40 border-white/5 hover:border-white/10'}`}>
                            <input type="radio" className="hidden" checked={formData.member_area_action === act} onChange={() => setFormData({ ...formData, member_area_action: act as any })} />
                            <div className={`w-5 h-5 rounded-full border border-gray-700 flex items-center justify-center ${formData.member_area_action === act ? 'border-primary' : ''}`}>
                               {formData.member_area_action === act && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                            </div>
                            <div>
                               <p className="text-sm font-bold text-white mb-0.5">{act === 'checkout' ? 'Painel de Membros' : 'Link Externo / PDF'}</p>
                               <p className="text-[10px] text-gray-700 line-clamp-1">{act === 'checkout' ? 'Direciona para o conteúdo' : 'Link customizado'}</p>
                            </div>
                         </label>
                      ))}
                   </div>

                   {formData.member_area_action === 'checkout' && (
                     <div className="space-y-6">
                        <div>
                           <label className="text-[10px] text-gray-600 font-black uppercase tracking-widest mb-3 block">Conteúdos Oferecidos (Multi-seleção)</label>
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                              {availableContents.map(cnt => (
                                <div key={cnt.id} onClick={() => {
                                   if (selectedContentIds.includes(cnt.id)) setSelectedContentIds(selectedContentIds.filter(id => id !== cnt.id));
                                   else setSelectedContentIds([...selectedContentIds, cnt.id]);
                                }} className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center gap-4 ${selectedContentIds.includes(cnt.id) ? 'bg-white/5 border-white/20' : 'bg-black/20 border-white/5 opacity-50 hover:opacity-100'}`}>
                                   <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${selectedContentIds.includes(cnt.id) ? 'bg-primary border-primary text-white' : 'border-gray-800'}`}>
                                      {selectedContentIds.includes(cnt.id) && <Check className="w-3.5 h-3.5" />}
                                   </div>
                                   <div className="min-w-0">
                                      <p className="text-xs font-bold text-white truncate">{cnt.title}</p>
                                      <p className="text-[8px] text-gray-700 uppercase font-black tracking-widest">{cnt.type}</p>
                                   </div>
                                </div>
                              ))}
                           </div>
                        </div>

                        <div>
                           <label className="text-[10px] text-gray-600 font-black uppercase tracking-widest mb-3 block">Direcionar para Checkout (Opcional)</label>
                           <select
                              className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 text-white outline-none focus:border-white/20 transition-all font-medium appearance-none cursor-pointer"
                              value={formData.member_area_checkout_id}
                              onChange={e => setFormData({ ...formData, member_area_checkout_id: e.target.value })}
                           >
                              <option value="">Nenhum</option>
                              {checkouts.map(ck => <option key={ck.id} value={ck.id}>{ck.name}</option>)}
                           </select>
                        </div>
                     </div>
                   )}

                   {formData.member_area_action === 'sales_page' && (
                     <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                        <label className="text-[10px] text-gray-600 font-black uppercase tracking-widest mb-3 block">Link de Redirecionamento</label>
                        <input type="text" className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 text-white focus:border-white/20" placeholder="https://..." value={formData.redirect_link || ''} onChange={e => setFormData({ ...formData, redirect_link: e.target.value })} />
                     </div>
                   )}
                </div>
             </div>
          </section>

          {/* ID Link Tracking */}
          <Card className="bg-black/40 border border-white/5 p-6">
             <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                   <p className="text-[10px] font-black uppercase tracking-widest text-gray-700 mb-1">Link de Tracking Base</p>
                   <p className="text-xs font-mono text-primary truncate max-w-[400px]">/checkout?p={editingId || 'new'}</p>
                </div>
                <button onClick={() => handleCopyId(editingId || '')} className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10 transition-all">Copiar Link</button>
             </div>
          </Card>
        </div>
      </div>
    </div>
  );

  return (
    <Layout>
      {viewMode === 'grid' ? renderGrid() : renderEdit()}

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title={t('products.delete_title')}
        message={t('products.delete_confirm')}
        confirmText={t('products.delete_btn')}
        cancelText={t('common.cancel')}
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

      <BusinessSetupModal
        isOpen={showComplianceModal}
        onClose={() => setShowComplianceModal(false)}
      />

      <UpsellModal
        isOpen={isUpsellModalOpen}
        onClose={() => setIsUpsellModalOpen(false)}
        offerSlug={upsellSlug as any || 'unlimited_domains'}
      />
    </Layout>
  );
};

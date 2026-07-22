import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import { isDemoDataRuntime } from '../../services/demoDataService';
import { storage } from '../../services/storageService';
import { Checkout, Product, Gateway, Domain } from '../../types';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import {
  Plus, Copy, Eye, Edit2, Trash2, ShoppingBag, AlertTriangle, Loader2, Globe, CreditCard, Layers, ExternalLink, ChevronRight, Check, X, Zap
} from 'lucide-react';

import { ConfirmModal, AlertModal, Modal } from '../../components/ui/Modal';
import { useTranslation } from 'react-i18next';
import { useFeatures } from '../../hooks/useFeatures';
import { UpsellModal } from '../../components/ui/UpsellModal';

export const Checkouts = () => {
  const { t, i18n } = useTranslation(['admin', 'common', 'sidebar']);
  const navigate = useNavigate();
  const demoRuntime = isDemoDataRuntime();
  const [checkouts, setCheckouts] = useState<Checkout[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);

  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [checkingUsageId, setCheckingUsageId] = useState<string | null>(null);
  const [usageWarning, setUsageWarning] = useState<{ products: any[], domains: any[] } | null>(null);
  const [alertState, setAlertState] = useState<{ isOpen: boolean; title: string; message: string; variant: 'success' | 'error' | 'info' }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'info'
  });
  const [isUpsellModalOpen, setIsUpsellModalOpen] = useState(false);
  const [upsellSlug, setUpsellSlug] = useState<'unlimited_domains' | 'partner_rights' | 'whitelabel' | null>(null);
  const { getLimit, loading: checkingFeatures } = useFeatures();

  const showAlert = (title: string, message: string, variant: 'success' | 'error' | 'info' = 'info') => {
    setAlertState({ isOpen: true, title, message, variant });
  };

  const closeAlert = () => {
    setAlertState(prev => ({ ...prev, isOpen: false }));
  };

  const buildCheckoutPublicUrl = (checkout: Checkout) => {
    const domain = domains.find(d => d.id === checkout.domain_id);
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const baseUrl = (domain && !isLocal && !demoRuntime) ? `https://${domain.domain}` : `${window.location.origin}/c`;
    return `${baseUrl}/${checkout.custom_url_slug}`;
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [c, p, g, d] = await Promise.all([
        storage.getCheckouts(),
        storage.getProducts(),
        storage.getGateways(),
        storage.getDomains()
      ]);
      setCheckouts(c);
      setProducts(p);
      setGateways(g);
      setDomains(d);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = async (id: string) => {
    setCheckingUsageId(id);
    try {
      const usage = await storage.getCheckoutUsage(id);
      if (usage.products.length > 0 || usage.domains.length > 0) {
        setUsageWarning(usage);
      } else {
        setDeleteId(id);
      }
    } catch (error) {
      console.error('Error checking checkout usage:', error);
      showAlert(t('common.error'), t('checkouts.check_usage_error'), 'error');
    } finally {
      setCheckingUsageId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    try {
      setIsDeleting(true);
      await storage.deleteCheckout(deleteId);
      await loadData();
      setDeleteId(null);
      showAlert(t('common.success'), t('checkouts.delete_success'), 'success');
    } catch (error) {
      console.error('Error deleting checkout:', error);
      showAlert(t('common.error'), t('checkouts.delete_error'), 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const getProductName = (productId: string) => {
    const product = products.find(p => p.id === productId);
    return product ? product.name : t('checkouts.unknown_product');
  };

  const getDomainNameStr = (domainId?: string) => {
    if (!domainId) return t('checkouts.default_subdomain');
    const domain = domains.find(d => d.id === domainId);
    return domain ? domain.domain : t('checkouts.removed_domain');
  };

  const getGatewayNameStr = (gatewayId: string) => {
    const gateway = gateways.find(g => g.id === gatewayId);
    return gateway ? gateway.name.replace('_', ' ') : t('checkouts.undefined_gateway');
  };

  const getActivePaymentMethodLabels = (checkout: Checkout) => {
    const methods = checkout.config?.payment_methods;
    if (!methods) return [];

    const labels: string[] = [];
    if (methods.pix) labels.push('PIX');
    if (methods.credit_card) labels.push(t('checkouts.card_short', 'CARTÃO'));
    if (methods.boleto) labels.push('BOLETO');
    if (methods.apple_pay) labels.push('APPLE PAY');
    if (methods.google_pay) labels.push('GOOGLE PAY');
    if (methods.paypal) labels.push('PAYPAL');
    return labels;
  };

  const hasMethodRoutingConfig = (checkout: Checkout) => {
    return Object.values(checkout.config?.payment_routing || {}).some((route) =>
      Boolean(route?.primary_gateway_id || route?.backup_gateway_id)
    );
  };

  const getCheckoutGatewaySummary = (checkout: Checkout) => {
    if (!hasMethodRoutingConfig(checkout)) {
      return getGatewayNameStr(checkout.gateway_id);
    }

    const routeGatewayIds = Object.values(checkout.config?.payment_routing || {}).flatMap((route) => [
      route?.primary_gateway_id || null,
      route?.backup_gateway_id || null,
    ]);
    const uniqueGatewayIds = routeGatewayIds.filter((gatewayId, index, array): gatewayId is string => {
      if (!gatewayId) return false;
      return array.indexOf(gatewayId) === index;
    });

    if (uniqueGatewayIds.length === 0) {
      return getGatewayNameStr(checkout.gateway_id);
    }

    if (uniqueGatewayIds.length === 1) {
      return getGatewayNameStr(uniqueGatewayIds[0]);
    }

    return t('checkouts.multi_gateway_summary', '{{count}} gateways', { count: uniqueGatewayIds.length });
  };

  const getCheckoutGatewayLabel = (checkout: Checkout) => {
    return hasMethodRoutingConfig(checkout)
      ? t('checkouts.payments_label', 'Pagamentos')
      : t('checkouts.processor');
  };

  const { compliance } = useAuth();
  const [showComplianceModal, setShowComplianceModal] = useState(false);

  const handleActionWithCompliance = (action: () => void) => {
    if (!compliance?.is_ready) {
      setShowComplianceModal(true);
      return;
    }
    action();
  };

  const handleCreateCheckout = () => {
    if (checkingFeatures) return;

    const limit = getLimit('checkouts');
    const allowed = limit === 'unlimited' || (limit && checkouts.length < limit);

    if (!allowed) {
      setUpsellSlug('unlimited_domains');
      setIsUpsellModalOpen(true);
      return;
    }

    navigate('/admin/checkouts/edit/new');
  };

  return (
    <Layout>
      <div className="mb-8 flex flex-col gap-6 sm:mb-12 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-4xl lg:text-5xl font-portal-display text-white mb-2 uppercase leading-none">Checkouts</h1>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
             <p className="text-gray-600 font-medium uppercase tracking-[0.1em] text-[10px]">{t('checkouts.subtitle')}</p>
             <div className="hidden h-1 w-1 rounded-full bg-gray-800 sm:block"></div>
             <span className="text-[10px] text-primary font-black uppercase tracking-[0.2em]">
               {getLimit('checkouts') ? t('checkouts.limit_status', { count: checkouts.length, limit: getLimit('checkouts') === 'unlimited' ? '∞' : getLimit('checkouts') }) : t('checkouts.active_control')}
             </span>
          </div>
        </div>
        <Button disabled={checkingFeatures} onClick={() => handleActionWithCompliance(handleCreateCheckout)} className="flex w-full items-center justify-center gap-3 rounded-[1.5rem] border-none bg-primary px-6 py-4 text-xs font-black uppercase tracking-widest text-white shadow-2xl shadow-primary/30 transition-all active:scale-95 sm:w-auto sm:px-10">
          {checkingFeatures ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />} {t('checkouts.new_checkout')}
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-6">
           {[1,2,3].map(i => <div key={i} className="h-24 bg-white/5 rounded-[2rem] animate-pulse"></div>)}
        </div>
      ) : checkouts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
           <div className="w-24 h-24 bg-white/5 rounded-[2rem] flex items-center justify-center mb-6 border border-white/5">
              <ShoppingBag className="w-10 h-10 text-gray-700" />
           </div>
           <h3 className="text-2xl font-portal-display text-white uppercase tracking-tight opacity-40">{t('checkouts.empty_title')}</h3>
           <p className="text-gray-600 font-medium uppercase tracking-widest text-[10px] mt-2 mb-8">{t('checkouts.empty_desc')}</p>
           <Button disabled={checkingFeatures} onClick={() => handleActionWithCompliance(handleCreateCheckout)} className="bg-white/5 hover:bg-white/10 text-white border border-white/10 px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px]">
             {checkingFeatures ? t('checkouts.checking_plan') : t('checkouts.create_now')}
           </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {checkouts.map(chk => {
            const hasActiveUpsell = Boolean(
               chk.config?.upsell?.active && String(chk.config?.upsell?.product_id || chk.upsell_product_id || '').trim()
            );

            return (
            <div key={chk.id} className="group relative overflow-hidden rounded-[1.5rem] border border-white/5 bg-[#0F0F15]/40 transition-all duration-300 hover:border-primary/30 hover:bg-[#151520]/60 sm:rounded-[2rem]">
               <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8 lg:px-8 lg:py-4">
                  
                  {/* Branding & Status - Column 1 */}
                  <div className="flex items-center gap-4 lg:w-[260px] shrink-0">
                     <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${chk.active ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-gray-800/10 border-white/5 text-gray-700'}`}>
                        {chk.active ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
                     </div>
                     <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                           <h3 className="text-base font-bold text-white group-hover:text-primary transition-colors truncate">{chk.name}</h3>
                           <span className={`text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${chk.active ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-gray-800 text-gray-600 border-white/5'}`}>{chk.active ? t('checkouts.status_live') : t('checkouts.status_off')}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[9px] text-gray-600 font-black uppercase tracking-widest">
                           <ShoppingBag className="w-2.5 h-2.5" />
                           <span className="truncate max-w-[130px]">{getProductName(chk.product_id)}</span>
                        </div>
                     </div>
                  </div>

                  {/* Domain & Gateway Info - Column 2 */}
                  <div className="flex flex-col gap-2 flex-1 min-w-0">
                     <div className="flex flex-wrap items-center gap-3 lg:flex-nowrap lg:gap-4">
                        <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-white/5 bg-black/40 px-3 py-2 sm:min-w-[130px]">
                           <Globe className="w-3.5 h-3.5 text-gray-700" />
                           <div className="min-w-0">
                              <p className="text-[7px] font-black uppercase text-gray-700 tracking-widest leading-none mb-0.5">{t('checkouts.domain')}</p>
                              <p className="text-[11px] font-bold text-gray-400 truncate">{getDomainNameStr(chk.domain_id)}</p>
                           </div>
                        </div>

                        <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-white/5 bg-black/40 px-3 py-2 sm:min-w-[130px]">
                           <CreditCard className="w-3.5 h-3.5 text-gray-700" />
                           <div className="min-w-0">
                              <p className="text-[7px] font-black uppercase text-gray-700 tracking-widest leading-none mb-0.5">{getCheckoutGatewayLabel(chk)}</p>
                              <p className="text-[11px] font-bold text-gray-400 truncate uppercase">{getCheckoutGatewaySummary(chk)}</p>
                           </div>
                        </div>
                     </div>
                      <div className="flex flex-wrap items-center gap-2">
                         {getActivePaymentMethodLabels(chk).map((label) => (
                            <div
                              key={`${chk.id}-${label}`}
                              className="flex items-center gap-2 px-3 py-1 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-emerald-300 whitespace-nowrap w-fit"
                            >
                              <CreditCard className="w-3 h-3" />
                              <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
                            </div>
                         ))}

                         {hasMethodRoutingConfig(chk) && (
                            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-cyan-500/5 border border-cyan-500/10 text-cyan-300 whitespace-nowrap w-fit">
                               <Zap className="w-3 h-3" />
                               <span className="text-[9px] font-black uppercase tracking-widest">{t('checkouts.method_routing_badge', 'Roteamento por método')}</span>
                            </div>
                         )}

                         {chk.order_bump_ids && chk.order_bump_ids.length > 0 && (
                            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-orange-500/5 border border-orange-500/10 text-orange-500 whitespace-nowrap w-fit">
                               <Layers className="w-3 h-3" />
                               <span className="text-[9px] font-black uppercase tracking-widest">{t('checkouts.bump_count', { count: chk.order_bump_ids.length })}</span>
                            </div>
                         )}

                         {hasActiveUpsell && (
                            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-blue-500/5 border border-blue-500/10 text-blue-400 whitespace-nowrap w-fit">
                               <Zap className="w-3 h-3" />
                               <span className="text-[9px] font-black uppercase tracking-widest">{t('checkouts.active_upsell')}</span>
                            </div>
                         )}
                      </div>
                  </div>

                  {/* Actions Bar - Column 3 */}
                  <div className="flex w-full shrink-0 items-center justify-between gap-3 border-t border-white/5 pt-4 lg:w-fit lg:justify-end lg:border-t-0 lg:pt-0">
                     <div className="flex flex-1 items-center gap-2 lg:flex-initial">
                        <button 
                          onClick={() => {
                            const url = buildCheckoutPublicUrl(chk);
                            window.open(url, '_blank');
                          }}
                          className="flex h-11 flex-1 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-gray-500 transition-all hover:bg-white/10 hover:text-white lg:h-auto lg:flex-none lg:p-2.5"
                          title={t('checkouts.preview')}
                        >
                           <Eye className="w-4.5 h-4.5" />
                        </button>
                        <button 
                          onClick={() => {
                             const url = buildCheckoutPublicUrl(chk);
                             navigator.clipboard.writeText(url);
                             showAlert(t('common.success'), t('checkouts.link_copied', { url }), 'success');
                          }}
                          className="flex h-11 flex-1 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-gray-500 transition-all hover:bg-white/10 hover:text-white lg:h-auto lg:flex-none lg:p-2.5"
                          title={t('checkouts.copy_link')}
                        >
                           <Copy className="w-4.5 h-4.5" />
                        </button>
                        <button 
                          onClick={() => navigate(`/admin/checkouts/edit/${chk.id}`)}
                          className="flex h-11 flex-1 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-white transition-all hover:bg-white/10 lg:h-auto lg:flex-none lg:p-2.5"
                          title={t('checkouts.edit')}
                        >
                           <Edit2 className="w-4.5 h-4.5" />
                        </button>
                     </div>
                     <div className="w-px h-6 bg-white/5 hidden lg:block mx-1"></div>
                     <button 
                        onClick={() => handleDeleteClick(chk.id)}
                        disabled={checkingUsageId === chk.id}
                         className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-500/10 bg-red-500/10 text-red-500 transition-all hover:bg-red-500/20 disabled:opacity-50"
                        title={t('checkouts.remove')}
                     >
                        {checkingUsageId === chk.id ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Trash2 className="w-4.5 h-4.5" />}
                     </button>
                  </div>

               </div>
            </div>
          )})}
        </div>
      )}

      {/* MODALS */}
      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title={t('checkouts.delete_title')}
        message={t('checkouts.delete_message')}
        confirmText={t('checkouts.delete_confirm')}
        cancelText={t('checkouts.keep_link')}
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

      <Modal
        isOpen={!!usageWarning}
        onClose={() => setUsageWarning(null)}
        title={t('checkouts.usage_title')}
        className="max-w-md"
      >
        <div className="space-y-6">
          <div className="bg-orange-500/10 border border-orange-500/20 p-5 rounded-3xl flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 text-orange-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-orange-500 font-bold text-sm mb-1 uppercase tracking-tight">{t('checkouts.security_block')}</h3>
              <p className="text-orange-200/60 text-[10px] leading-relaxed">
                {t('checkouts.usage_desc')}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {usageWarning?.products.length > 0 && (
              <div>
                <h4 className="text-[10px] font-black text-gray-700 uppercase tracking-widest mb-3">{t('sidebar.products')}</h4>
                <div className="flex flex-wrap gap-2">
                  {usageWarning.products.map((p: any) => (
                    <span key={p.id} className="px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-xs text-gray-400 font-medium">{p.name}</span>
                  ))}
                </div>
              </div>
            )}
            {usageWarning?.domains.length > 0 && (
              <div>
                <h4 className="text-[10px] font-black text-gray-700 uppercase tracking-widest mb-3">{t('sidebar.domains')}</h4>
                <div className="flex flex-wrap gap-2">
                  {usageWarning.domains.map((d: any) => (
                    <span key={d.id} className="px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-xs text-gray-400 font-medium">{d.domain}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={() => setUsageWarning(null)} className="w-full rounded-xl border-none bg-white px-8 py-3 text-[10px] font-black uppercase tracking-widest text-black sm:w-auto">{t('checkouts.done')}</Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showComplianceModal}
        onClose={() => setShowComplianceModal(false)}
        title={t('checkouts.compliance_title')}
      >
        <div className="space-y-6">
          <div className="bg-blue-500/10 border border-blue-500/20 p-5 rounded-3xl flex items-start gap-4">
            <ShoppingBag className="w-6 h-6 text-blue-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-blue-400 font-bold text-sm mb-1 uppercase tracking-tight">{t('checkouts.sales_identity')}</h3>
              <p className="text-blue-200/60 text-[10px] leading-relaxed">
                {t('checkouts.compliance_desc')}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
            <button onClick={() => setShowComplianceModal(false)} className="w-full px-6 py-2 text-[10px] font-black text-gray-600 uppercase tracking-widest sm:w-auto">{t('checkouts.later')}</button>
            <a href="/admin/business-settings" className="w-full rounded-xl bg-primary px-8 py-3 text-center text-[10px] font-black uppercase tracking-widest text-white shadow-xl shadow-primary/20 sm:w-auto">{t('checkouts.configure_now')}</a>
          </div>
        </div>
      </Modal>

      <UpsellModal
        isOpen={isUpsellModalOpen}
        onClose={() => setIsUpsellModalOpen(false)}
        offerSlug={upsellSlug}
      />
    </Layout>
  );
};

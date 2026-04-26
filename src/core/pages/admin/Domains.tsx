import React, { useState, useEffect } from 'react';
import { Layout } from '../../components/Layout';
import { storage } from '../../services/storageService';
import { Domain, DomainStatus, DomainType, DomainUsage } from '../../types';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal, ConfirmModal, AlertModal } from '../../components/ui/Modal';
import {
  Plus,
  Globe,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Server,
  ArrowRight,
  Copy,
  RotateCw,
  Trash2,
  ShoppingCart,
  Users,
  Layout as LayoutIcon,
  ChevronRight,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { useFeatures } from '../../hooks/useFeatures';
import { useAuth } from '../../context/AuthContext';
import { UpsellModal } from '../../components/ui/UpsellModal';
import { useTranslation } from 'react-i18next';
import Aurora from '../../components/ui/Aurora';

const TWO_PART_PUBLIC_SUFFIXES = new Set([
  'com.br',
  'net.br',
  'org.br',
  'gov.br',
  'edu.br',
  'co.uk',
  'org.uk',
  'com.au',
  'net.au',
  'co.jp'
]);

const getZoneDomain = (domain: string) => {
  const parts = domain.toLowerCase().split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');

  const lastTwo = parts.slice(-2).join('.');
  const lastThree = parts.slice(-3).join('.');

  return TWO_PART_PUBLIC_SUFFIXES.has(lastTwo) ? lastThree : lastTwo;
};

const getDnsHostLabel = (recordDomain: string, selectedDomain: string) => {
  if (!recordDomain || recordDomain === '@') return '@';
  if (!recordDomain.includes('.')) return recordDomain;

  const zone = getZoneDomain(selectedDomain);
  const normalized = recordDomain.toLowerCase();

  if (normalized === zone) return '@';
  if (normalized.endsWith(`.${zone}`)) {
    return normalized.slice(0, -zone.length - 1);
  }

  return recordDomain;
};

export const Domains = () => {
  const { t, i18n } = useTranslation(['admin', 'common']);
  const { profile, isWhiteLabel } = useAuth();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDnsModalOpen, setIsDnsModalOpen] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteDomainName, setDeleteDomainName] = useState<string>('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dnsLoading, setDnsLoading] = useState(false);
  const [checkingUsageId, setCheckingUsageId] = useState<string | null>(null);
  const [usageWarning, setUsageWarning] = useState<{ checkouts: any[], memberAreas: any[] } | null>(null);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; title: string; message: string; variant: 'success' | 'error' | 'info' }>({ isOpen: false, title: '', message: '', variant: 'info' });
  const [activeTab, setActiveTab] = useState<'all' | 'checkout' | 'member_area' | 'system'>('all');
  const { getLimit, loading: checkingFeatures } = useFeatures();

  // Governance
  const [upsellSlug, setUpsellSlug] = useState<'unlimited_domains' | 'partner_rights' | 'whitelabel' | null>(null);
  const [isUpsellModalOpen, setIsUpsellModalOpen] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    domain: '',
    type: DomainType.CNAME,
    usage: DomainUsage.CHECKOUT
  });

  // DNS Records State
  const [dnsRecords, setDnsRecords] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (domains.length > 0) {
      domains.forEach(domain => {
        if (domain.status === DomainStatus.PENDING) {
          verifyDomain(domain.id, domain.domain, true);
        }
      });
    }
  }, [domains.length]);

  const loadData = async () => {
    setDomains(await storage.getDomains());
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/domains/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: formData.domain })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('domains.vercel_error'));

      const newDomainData = {
        status: DomainStatus.PENDING,
        created_at: new Date().toISOString(),
        domain: formData.domain,
        type: formData.type,
        checkout_id: null,
        usage: formData.usage
      };

      const savedDomain = await storage.createDomain(newDomainData);
      setDomains([...domains, savedDomain]);
      setIsAddModalOpen(false);
      setFormData({ domain: '', type: DomainType.CNAME, usage: DomainUsage.CHECKOUT });
      openDnsModal(savedDomain);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const verifyDomain = async (id: string, domainName: string, silent = false) => {
    if (!silent) setVerifyingId(id);
    try {
      const res = await fetch(`/api/domains/verify?domain=${domainName}`);
      const data = await res.json();

      let newStatus = data.verified ? DomainStatus.ACTIVE : (data.error ? DomainStatus.ERROR : DomainStatus.PENDING);
      
      const currentDomain = domains.find(d => d.id === id);
      if (currentDomain && currentDomain.status !== newStatus) {
        setDomains(prev => prev.map(d => d.id === id ? { ...d, status: newStatus } : d));
      }

      return data.dnsRecords || data.verificationChallenges || [
        { type: 'CNAME', domain: domainName, value: 'cname.vercel-dns.com' },
        { type: 'A', domain: '@', value: '76.76.21.21' }
      ];
    } catch (err: any) {
      setDomains(prev => prev.map(d => d.id === id ? { ...d, status: DomainStatus.ERROR } : d));
      return null;
    } finally {
      if (!silent) setVerifyingId(null);
    }
  };

  const openDnsModal = async (domain: Domain) => {
    setSelectedDomain(domain);
    setDnsRecords(null);
    setDnsLoading(true);
    setIsDnsModalOpen(true);
    const records = await verifyDomain(domain.id, domain.domain, true);
    if (records) setDnsRecords(records);
    setDnsLoading(false);
  };

  const handleDeleteClick = async (id: string, domainName: string) => {
    setCheckingUsageId(id);
    try {
      const usage = await storage.getDomainUsage(id);
      if (usage.checkouts.length > 0 || usage.memberAreas.length > 0) {
        setUsageWarning(usage);
      } else {
        setDeleteId(id);
        setDeleteDomainName(domainName);
      }
    } catch (error) {
      setAlertModal({ isOpen: true, title: t('common.error'), message: t('domains.verify_error'), variant: 'error' });
    } finally {
      setCheckingUsageId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteId || !deleteDomainName) return;
    setRemovingId(deleteId);
    try {
      await fetch(`/api/domains/remove?domain=${deleteDomainName}`, { method: 'DELETE' });
      await storage.deleteDomain(deleteId);
      setDomains(domains.filter(d => d.id !== deleteId));
      setDeleteId(null);
    } catch (err) {
      setAlertModal({ isOpen: true, title: t('common.error'), message: t('domains.remove_error'), variant: 'error' });
    } finally {
      setRemovingId(null);
    }
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const customDomainsCount = domains.filter(d => !d.domain.endsWith('.vercel.app')).length;
  const filteredDomains = domains.filter(domain => {
    if (activeTab === 'all') return true;
    return domain.usage === activeTab;
  });

  return (
    <Layout>
      <div className="flex flex-col lg:flex-row justify-between lg:items-end mb-12 gap-8">
        <div>
          <h1 className="text-4xl lg:text-5xl font-portal-display text-white mb-2 uppercase leading-none">{t('domains.title')}</h1>
          <div className="flex items-center gap-3">
             <p className="text-gray-600 font-medium uppercase tracking-[0.1em] text-[10px]">{t('domains.subtitle')}</p>
             <div className="h-1 w-1 rounded-full bg-gray-800"></div>
             <span className="text-[10px] text-primary font-black uppercase tracking-[0.2em]">Network Control</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
           {getLimit('domains') && !isWhiteLabel && (
              <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-2xl bg-black/40 border border-white/5">
                 <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest leading-none">Status da Cota</span>
                 <span className="text-xs font-portal-display text-primary">{customDomainsCount} / {getLimit('domains') === 'unlimited' ? '∞' : getLimit('domains')}</span>
              </div>
           )}
           <Button 
            onClick={() => {
              const limit = getLimit('domains');
              if (limit === 'unlimited' || (limit && customDomainsCount < limit)) setIsAddModalOpen(true);
              else { setUpsellSlug('unlimited_domains'); setIsUpsellModalOpen(true); }
            }}
            className="px-10 py-4 bg-primary text-white rounded-[1.5rem] shadow-2xl shadow-primary/30 border-none font-black uppercase tracking-widest text-xs flex items-center gap-3 active:scale-95 transition-all"
           >
             <Plus className="w-5 h-5" /> {t('domains.add_btn')}
           </Button>
        </div>
      </div>

      {/* Modern Tabs */}
      <div className="flex items-center gap-2 mb-10 overflow-x-auto pb-2 custom-scrollbar">
        {[
          { id: 'all', label: t('domains.tabs.all'), icon: Globe },
          { id: 'checkout', label: t('domains.tabs.checkout'), icon: ShoppingCart },
          { id: 'member_area', label: t('domains.tabs.member_area'), icon: Users },
          { id: 'system', label: t('domains.tabs.system'), icon: LayoutIcon }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border ${activeTab === tab.id ? 'bg-white text-black border-white shadow-xl' : 'bg-black/20 text-gray-700 border-white/5 hover:bg-white/5'}`}
          >
            <tab.icon className="w-3.5 h-3.5" /> {tab.label}
          </button>
        ))}
      </div>

      {filteredDomains.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center bg-black/20 border border-dashed border-white/5 rounded-[3rem]">
           <div className="w-24 h-24 bg-white/5 rounded-[2rem] flex items-center justify-center mb-6 border border-white/5">
              <Globe className="w-10 h-10 text-gray-700" />
           </div>
           <h3 className="text-2xl font-portal-display text-white uppercase tracking-tight opacity-40">Tabela de Roteamento Vazia</h3>
           <p className="text-gray-600 font-medium uppercase tracking-widest text-[10px] mt-2">Conecte um domínio para personalizar seu ecossistema</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredDomains.map(domain => (
            <div key={domain.id} className="group relative bg-[#0F0F15]/40 hover:bg-[#151520]/60 border border-white/5 hover:border-primary/30 rounded-[2rem] p-4 lg:px-8 lg:py-4 transition-all duration-300">
               <div className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-8">
                  
                  {/* Domain Name & Status */}
                  <div className="flex items-center gap-4 lg:w-[320px] shrink-0">
                     <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${domain.status === DomainStatus.ACTIVE ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.1)]' : 'bg-white/5 border-white/5 text-gray-700'}`}>
                        <Globe className="w-5 h-5" />
                     </div>
                     <div className="min-w-0">
                        <h3 className="text-base font-bold text-white group-hover:text-primary transition-colors truncate mb-0.5">{domain.domain}</h3>
                        <div className="flex items-center gap-2">
                           <div className={`w-1.5 h-1.5 rounded-full ${domain.status === DomainStatus.ACTIVE ? 'bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-gray-800'}`}></div>
                           <span className="text-[9px] font-black uppercase tracking-widest text-gray-700">
                              {domain.status === DomainStatus.ACTIVE ? 'Conectado' : (domain.status === DomainStatus.PENDING ? 'Aguardando DNS' : 'Erro na Rede')}
                           </span>
                        </div>
                     </div>
                  </div>

                  {/* usage & created */}
                  <div className="flex-1 flex items-center gap-8 min-w-0">
                     <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-700 mb-0.5">Destinação</p>
                        <div className="flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/5 rounded-xl">
                           <div className="w-1.5 h-1.5 rounded-full bg-primary/40"></div>
                           <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-relaxed">
                              {domain.usage === DomainUsage.CHECKOUT ? 'E-Commerce' : (domain.usage === DomainUsage.MEMBER_AREA ? 'Membros' : 'Sistema Core')}
                           </span>
                        </div>
                     </div>
                     <div className="hidden sm:block">
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-700 mb-0.5">Registro</p>
                        <p className="text-[11px] font-bold text-gray-500">{new Date(domain.created_at).toLocaleDateString()}</p>
                     </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between lg:justify-end gap-3 shrink-0 pt-4 lg:pt-0 border-t lg:border-t-0 border-white/5 lg:w-fit w-full">
                     <button 
                      onClick={() => openDnsModal(domain)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-[9px] font-black uppercase tracking-widest border border-white/5 transition-all"
                     >
                        <Server className="w-4 h-4 text-primary" /> {t('common.setup') || 'Configurar'}
                     </button>
                     <div className="flex items-center gap-2">
                        <button 
                          onClick={() => verifyDomain(domain.id, domain.domain)}
                          disabled={verifyingId === domain.id}
                          className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-500 hover:text-white border border-white/5 transition-all"
                          title="Sincronizar"
                        >
                           {verifyingId === domain.id ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <RotateCw className="w-4.5 h-4.5" />}
                        </button>
                        <button 
                          onClick={() => handleDeleteClick(domain.id, domain.domain)}
                          disabled={removingId === domain.id || checkingUsageId === domain.id}
                          className="p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/10 transition-all opacity-40 hover:opacity-100 disabled:opacity-20"
                          title="Remover"
                        >
                           <Trash2 className="w-4.5 h-4.5" />
                        </button>
                     </div>
                  </div>

               </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Domain Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Novo Nó de Rede">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
           <Aurora colorStops={['#8A2BE2', '#4B0082', '#0000FF']} amplitude={0.5} speed={0.2} />
        </div>
        <form onSubmit={handleSave} className="relative z-10 space-y-8 p-1">
          {error && <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-2xl text-xs font-bold uppercase tracking-widest">{error}</div>}

          <div>
             <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-4 block">Finalidade do Domínio</label>
             <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                   { id: DomainUsage.CHECKOUT, label: 'Vendas', icon: ShoppingCart, color: 'text-blue-400' },
                   { id: DomainUsage.MEMBER_AREA, label: 'Membros', icon: Users, color: 'text-purple-400' },
                   { id: DomainUsage.SYSTEM, label: 'Sistema', icon: LayoutIcon, color: 'text-emerald-400' }
                ].map(u => (
                  <label key={u.id} className={`flex flex-col items-center justify-center p-6 rounded-[2rem] border transition-all cursor-pointer ${formData.usage === u.id ? 'bg-white/5 border-white/20' : 'bg-black/20 border-white/5 opacity-50 hover:opacity-100'}`}>
                     <input type="radio" className="hidden" checked={formData.usage === u.id} onChange={() => setFormData({ ...formData, usage: u.id as any })} />
                     <u.icon className={`w-8 h-8 mb-3 ${u.color}`} />
                     <span className="text-[10px] font-black uppercase tracking-widest text-white">{u.label}</span>
                  </label>
                ))}
             </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest mb-3">Nome do Domínio ou Subdomínio</label>
            <div className="relative">
               <Globe className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-700" />
               <input
                 required type="text"
                 className="w-full bg-black/40 border border-white/5 rounded-2xl pl-14 pr-6 py-5 focus:border-primary/50 outline-none text-white text-lg font-portal-display transition-all"
                 placeholder="pay.meusite.com"
                 value={formData.domain}
                 onChange={e => setFormData({ ...formData, domain: e.target.value })}
               />
            </div>
            <p className="text-[10px] text-gray-700 mt-4 leading-relaxed font-medium uppercase tracking-widest italic">O domínio deve estar apontado para nossos servidores para ativação automática.</p>
          </div>

          <div className="pt-4 flex justify-end gap-4">
             <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-6 py-3 text-[10px] font-black text-gray-600 uppercase tracking-widest">Abortar</button>
             <Button onClick={handleSave} disabled={isLoading} className="px-10 py-5 bg-white text-black font-black uppercase text-xs tracking-widest rounded-3xl border-none shadow-2xl transition-all">
               {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Registrar Domínio'}
             </Button>
          </div>
        </form>
      </Modal>

      {/* DNS Config Modal */}
      {selectedDomain && (
        <Modal isOpen={isDnsModalOpen} onClose={() => setIsDnsModalOpen(false)} title="Infraestrutura DNS" className="max-w-5xl">
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
               <div className="flex items-center gap-4 group">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${selectedDomain.status === DomainStatus.ACTIVE ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'}`}>
                     <ShieldCheck className="w-7 h-7" />
                  </div>
                  <div>
                     <h3 className="text-xl font-portal-display text-white uppercase tracking-tight">{selectedDomain.domain}</h3>
                     <p className="text-[10px] font-black text-gray-700 uppercase tracking-widest">
                        {selectedDomain.status === DomainStatus.ACTIVE ? 'Rede Ativa e Protegida' : 'Infraestrutura em Sincronização'}
                     </p>
                  </div>
               </div>
               
               <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-black/40 border border-white/5">
                  <div className={`w-2 h-2 rounded-full ${selectedDomain.status === DomainStatus.ACTIVE ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-yellow-500 animate-pulse'}`}></div>
                  <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Global Node Status</span>
               </div>
            </div>

            <div className="bg-[#0F0F15]/60 border border-white/5 rounded-[3rem] p-4 lg:p-8 space-y-10">
               {dnsLoading ? (
                 <div className="flex flex-col items-center justify-center py-24 gap-6">
                    <div className="relative">
                       <Loader2 className="w-12 h-12 animate-spin text-primary opacity-40" />
                       <Globe className="absolute inset-0 m-auto w-5 h-5 text-primary animate-pulse" />
                    </div>
                    <p className="text-[10px] font-black text-gray-700 uppercase tracking-[0.3em]">Varrendo DNS Global...</p>
                 </div>
               ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 px-1">
                      {dnsRecords?.map((record: any, idx: number) => (
                        <div key={idx} className="bg-[#12121A]/40 border border-white/5 p-4 lg:px-6 lg:py-3 rounded-[1.5rem] relative group hover:bg-white/[0.05] transition-all duration-300">
                           <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-8">
                              
                              {/* Type Label */}
                              <div className="flex items-center lg:w-[90px] shrink-0">
                                 <span className={`text-[9px] font-black px-3 py-1 rounded-lg tracking-[0.2em] border ${record.type === 'CNAME' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                                    {record.type}
                                 </span>
                              </div>

                              {/* Host Column */}
                              <div className="flex-1 min-w-0">
                                 <div className="flex items-center gap-2 mb-1">
                                    <ArrowRight className="w-2.5 h-2.5 text-gray-700" />
                                    <span className="text-[8px] font-black text-gray-700 uppercase tracking-widest">Host / Nome</span>
                                 </div>
                                 <p className="text-[11px] font-mono text-white/90 truncate bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
                                    {getDnsHostLabel(record.domain, selectedDomain.domain)}
                                 </p>
                              </div>

                              {/* Flow Indicator */}
                              <div className="hidden lg:block shrink-0 opacity-10">
                                 <ChevronRight className="w-4 h-4 text-white" />
                              </div>

                              {/* Value Column */}
                              <div className="flex-[1.5] min-w-0">
                                 <div className="flex items-center gap-2 mb-1">
                                    <Server className="w-2.5 h-2.5 text-gray-700" />
                                    <span className="text-[8px] font-black text-gray-700 uppercase tracking-widest">Valor / Destino</span>
                                 </div>
                                 <div className="relative group/val">
                                    <p className="text-[11px] font-mono text-white/90 break-all bg-black/40 px-3 py-1.5 rounded-lg border border-white/5 min-h-[30px] flex items-center">
                                       {record.value}
                                    </p>
                                 </div>
                              </div>

                              {/* Copy Action */}
                              <div className="flex items-center justify-end lg:w-fit shrink-0 gap-2">
                                 <button 
                                   onClick={() => handleCopy(record.value, `rec-${idx}`)} 
                                   className="p-2 gap-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-500 hover:text-white border border-white/5 transition-all flex items-center"
                                 >
                                    <span className="text-[7px] font-black uppercase tracking-widest ml-1 hidden sm:inline">Copiar</span>
                                    {copiedField === `rec-${idx}` ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                 </button>
                              </div>

                           </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="pt-10 border-t border-white/5 flex flex-col lg:flex-row items-center justify-between gap-8">
                       <div className="flex items-start gap-4 p-5 rounded-3xl bg-blue-500/5 border border-blue-500/10 max-w-2xl">
                          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center shrink-0">
                             <RotateCw className="w-6 h-6 text-blue-400/60" />
                          </div>
                          <div>
                             <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1 leading-none">Protocolo de Propagação</p>
                             <p className="text-[11px] font-medium text-gray-600 leading-relaxed">
                                Após a configuração no seu provedor (Cloudflare, GoDaddy, etc), os nós globais podem levar até <strong>24 horas</strong> para sincronizar totalmente a nova infraestrutura.
                             </p>
                          </div>
                       </div>
                       <Button 
                         onClick={() => setIsDnsModalOpen(false)} 
                         className="w-full lg:w-auto px-12 py-5 bg-white text-black font-black uppercase text-xs tracking-widest rounded-3xl border-none shadow-2xl hover:scale-105 active:scale-95 transition-all"
                       >
                          Painel Admin
                       </Button>
                    </div>
                  </>
               )}
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title="Desconectar Domínio"
        message="Esta operação irá remover o domínio da nossa rede global. Todos os checkouts vinculados a este domínio voltarão a usar o endereço padrão."
        confirmText="Confirmar Desconexão"
        cancelText="Manter na Rede"
        variant="danger"
        loading={removingId === deleteId}
      />

      {/* Usage Warning */}
      <Modal isOpen={!!usageWarning} onClose={() => setUsageWarning(null)} title="Domínio em Operação" className="max-w-md">
        <div className="space-y-6">
          <div className="bg-orange-500/10 border border-orange-500/20 p-5 rounded-3xl flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 text-orange-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-orange-500 font-bold text-sm mb-1 uppercase tracking-tight">Vínculos Ativos</h3>
              <p className="text-orange-200/40 text-[10px] leading-relaxed">Não é possível remover um domínio que ainda possui serviços roteados para ele.</p>
            </div>
          </div>
          <div className="space-y-2">
             {usageWarning?.checkouts.map((chk: any) => (
               <div key={chk.id} className="p-4 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-400">{chk.name}</span>
                  <span className="text-[8px] font-black text-gray-700 uppercase tracking-widest">Checkout</span>
               </div>
             ))}
          </div>
          <Button onClick={() => setUsageWarning(null)} className="w-full py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-black uppercase text-[10px]">Entendido</Button>
        </div>
      </Modal>

      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
        title={alertModal.title}
        message={alertModal.message}
        variant={alertModal.variant}
      />

      <UpsellModal
        isOpen={isUpsellModalOpen}
        onClose={() => setIsUpsellModalOpen(false)}
        offerSlug={upsellSlug}
      />
    </Layout>
  );
};

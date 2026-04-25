import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import { Layout } from '../../components/Layout';
import { 
  Building2, 
  Mail, 
  ShieldCheck, 
  AlertCircle, 
  FileText, 
  Shield, 
  CheckCircle, 
  FileSignature,
  Check,
  ChevronRight,
  Globe,
  Settings,
  Loader2,
  Save
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../components/ui/Modal';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

export const BusinessSettings = () => {
    const { user, refreshProfile } = useAuth();
    const { t } = useTranslation('admin');
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        business_name: '',
        support_email: user?.email || '',
        legal_name: '',
        privacy_policy: '',
        terms_of_purchase: '',
        show_legal_footer: true,
        agree_terms: false
    });
    const [editingDoc, setEditingDoc] = useState<'privacy' | 'terms' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        const loadSettings = async () => {
            if (!user) return;
            const { data: accounts } = await supabase.from('accounts').select('id').eq('owner_user_id', user.id).single();
            if (accounts) {
                const { data: settings } = await supabase.from('business_settings').select('*').eq('account_id', accounts.id).single();
                if (settings) {
                    setFormData(prev => ({
                        ...prev,
                        business_name: settings.business_name || '',
                        support_email: settings.support_email || user.email || '',
                        legal_name: settings.legal_name || '',
                        privacy_policy: settings.privacy_policy || '',
                        terms_of_purchase: settings.terms_of_purchase || '',
                        show_legal_footer: settings.show_legal_footer ?? true,
                        agree_terms: true // Assume true if data exists
                    }));
                }
            }
        };
        loadSettings();
    }, [user]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setLoading(true);
        setError(null);
        setSuccess(false);

        try {
            let { data: account, error: accError } = await supabase
                .from('accounts')
                .select('id')
                .eq('owner_user_id', user.id)
                .single();

            if (!account) {
                const { data: newAccount, error: createError } = await supabase
                    .from('accounts')
                    .insert({ owner_user_id: user.id, plan_type: 'free' })
                    .select()
                    .single();
                if (createError) throw createError;
                account = newAccount;
            }

            if (!formData.agree_terms) {
                throw new Error(t('business_settings.form.agree_error', 'Você precisa concordar com os termos.'));
            }

            const { error: settingsError } = await supabase
                .from('business_settings')
                .upsert({
                    account_id: account.id,
                    business_name: formData.business_name,
                    legal_name: formData.legal_name || formData.business_name,
                    support_email: formData.support_email,
                    privacy_policy: formData.privacy_policy,
                    terms_of_purchase: formData.terms_of_purchase,
                    show_legal_footer: formData.show_legal_footer,
                    sender_name: formData.business_name,
                    sender_email: formData.support_email,
                    compliance_status: 'verified',
                    is_ready_to_sell: true
                }, { onConflict: 'account_id' });

            if (settingsError) throw settingsError;

            await supabase.from('system_events').insert({
                account_id: account.id,
                type: 'business_info_updated',
                metadata: {
                    business_name: formData.business_name
                }
            });

            await refreshProfile();
            setSuccess(true);
            setTimeout(() => setSuccess(false), 5000);

        } catch (err: any) {
            console.error(err);
            setError(err.message || t('business_settings.error', 'Erro ao salvar configurações.'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Layout>
            <div className="space-y-12 pb-24 max-w-6xl mx-auto px-4 md:px-0">
                
                {/* Compact Premium Header */}
                <div className="relative p-8 lg:p-12 rounded-[2.5rem] bg-[#0A0A15] border border-white/5 overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-1000">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-primary/10 blur-[120px] -translate-y-1/2 translate-x-1/2 opacity-50" />
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/5 blur-[100px] translate-y-1/2 -translate-x-1/2 opacity-30" />
                    
                    <div className="relative z-20 flex flex-col lg:flex-row lg:items-end justify-between gap-10">
                        <div className="space-y-6">
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-[0.3em] animate-pulse">
                                <Building2 className="w-3.5 h-3.5" /> Commerce Core
                            </div>
                            <div>
                                <h1 className="text-4xl lg:text-6xl font-portal-display text-white tracking-tighter italic leading-none mb-6 uppercase">
                                    BUSINESS <span className="text-primary font-black">IDENTITY</span>
                                </h1>
                                <p className="text-sm text-gray-500 font-medium max-w-2xl leading-relaxed italic border-l-2 border-primary/20 pl-6">
                                    Configure as bases estratégicas do seu ecossistema. Estas informações definem a autoridade da sua marca no checkout e comunicações automáticas.
                                </p>
                            </div>
                        </div>

                        {/* Tactical Status Cards */}
                        <div className="flex flex-col sm:flex-row items-center gap-4">
                           <div className="flex items-center gap-4 px-6 py-4 rounded-[1.5rem] bg-white/[0.02] border border-white/5 group/item hover:border-emerald-500/30 transition-all duration-500">
                              <div className="p-2 bg-emerald-500/10 rounded-xl">
                                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                              </div>
                              <div className="flex flex-col">
                                 <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Compliance</span>
                                 <span className="text-[11px] font-black text-emerald-500 uppercase tracking-tighter italic">Verified Protocol</span>
                              </div>
                           </div>

                           <div className="flex items-center gap-4 px-6 py-4 rounded-[1.5rem] bg-white/[0.02] border border-white/5 group/item hover:border-primary/30 transition-all duration-500">
                              <div className="p-2 bg-primary/10 rounded-xl">
                                <CheckCircle className="w-5 h-5 text-primary" />
                              </div>
                              <div className="flex flex-col">
                                 <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Readiness</span>
                                 <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[11px] font-black text-white uppercase tracking-tighter italic">Ready to Scale</span>
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                                 </div>
                              </div>
                           </div>
                        </div>
                    </div>
                </div>

                <div className="max-w-5xl mx-auto">
                    {/* Feedback Messages */}
                    {error && (
                        <div className="bg-rose-500/10 border border-rose-500/20 p-6 rounded-[2rem] mb-8 flex items-center gap-4 animate-in zoom-in-95 duration-500">
                            <div className="p-3 bg-rose-500/20 rounded-2xl">
                                <AlertCircle className="w-6 h-6 text-rose-500" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-rose-500/50 uppercase tracking-widest mb-1">System Alert</p>
                                <p className="font-bold text-rose-500 tracking-tight">{error}</p>
                            </div>
                        </div>
                    )}

                    {success && (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-[2rem] mb-8 flex items-center gap-4 animate-in zoom-in-95 duration-500">
                            <div className="p-3 bg-emerald-500/20 rounded-2xl text-emerald-400">
                                <CheckCircle className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-emerald-500/50 uppercase tracking-widest mb-1">Execution Sync</p>
                                <p className="font-bold text-emerald-400 tracking-tight">{t('business_settings.success', 'Processamento concluído com sucesso. A identidade do seu negócio foi propagada.')}</p>
                            </div>
                        </div>
                    )}

                    <div className="relative group/main">
                        <div className="absolute -inset-1 bg-gradient-to-r from-primary/10 to-purple-500/10 rounded-[2.5rem] blur opacity-25 group-hover/main:opacity-50 transition duration-1000" />
                        
                        <Card className="relative border border-white/5 backdrop-blur-3xl bg-[#0A0A15]/80 shadow-2xl p-0 overflow-hidden rounded-[2.5rem]">
                            <div className="p-10 lg:p-12 border-b border-white/5 flex flex-col sm:flex-row items-center justify-between gap-6 bg-white/[0.01]">
                                <div className="flex items-center gap-5">
                                    <div className="p-4 bg-primary/10 border border-primary/20 rounded-[1.5rem] text-primary shadow-inner">
                                        <FileSignature className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-portal-display text-white italic uppercase tracking-tighter">
                                            Identidade de <span className="font-black">Negócio</span>
                                        </h2>
                                        <p className="text-[10px] text-gray-700 font-bold uppercase tracking-[0.2em] mt-1.5">Commerce Authority Configuration</p>
                                    </div>
                                </div>
                                <Building2 className="w-10 h-10 text-gray-800/30" />
                            </div>

                            <form onSubmit={handleSubmit} className="p-10 lg:p-12 space-y-12">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                    <div className="space-y-4">
                                        <label className="flex items-center gap-2 text-[10px] font-black text-gray-600 uppercase tracking-widest ml-1">
                                            <div className="w-1 h-1 rounded-full bg-primary" />
                                            {t('business_settings.form.business_name', 'Nome Comercial')}
                                        </label>
                                        <div className="relative group/input">
                                            <div className="absolute inset-0 bg-primary/5 rounded-2xl blur-sm opacity-0 group-focus-within/input:opacity-100 transition-opacity" />
                                            <Building2 className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-800 group-focus-within/input:text-primary transition-all duration-300" size={20} />
                                            <input
                                                type="text"
                                                required
                                                value={formData.business_name}
                                                onChange={e => setFormData({ ...formData, business_name: e.target.value })}
                                                className="relative w-full bg-white/[0.02] border border-white/5 rounded-2xl pl-16 pr-6 py-5 text-white focus:ring-2 focus:ring-primary/50 outline-none transition-all font-bold placeholder:text-gray-900 shadow-inner"
                                                placeholder={t('business_settings.form.business_name_placeholder', 'Nome da sua MARCA')}
                                            />
                                        </div>
                                        <p className="text-[10px] text-gray-700 font-medium mt-2 italic px-2 flex items-center gap-2">
                                            <AlertCircle className="w-3 h-3" /> {t('business_settings.form.business_name_hint', 'Exibido em faturas, checkout e remetente.')}
                                        </p>
                                    </div>

                                    <div className="space-y-4">
                                        <label className="flex items-center gap-2 text-[10px] font-black text-gray-600 uppercase tracking-widest ml-1">
                                            <div className="w-1 h-1 rounded-full bg-primary" />
                                            {t('business_settings.form.support_email', 'Suporte Técnico')}
                                        </label>
                                        <div className="relative group/input">
                                            <div className="absolute inset-0 bg-primary/5 rounded-2xl blur-sm opacity-0 group-focus-within/input:opacity-100 transition-opacity" />
                                            <Mail className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-800 group-focus-within/input:text-primary transition-all duration-300" size={20} />
                                            <input
                                                type="email"
                                                required
                                                value={formData.support_email}
                                                onChange={e => setFormData({ ...formData, support_email: e.target.value })}
                                                className="relative w-full bg-white/[0.02] border border-white/5 rounded-2xl pl-16 pr-6 py-5 text-white focus:ring-2 focus:ring-primary/50 outline-none transition-all font-bold placeholder:text-gray-900 shadow-inner"
                                                placeholder={t('business_settings.form.support_email_placeholder', 'suporte@empresa.com')}
                                            />
                                        </div>
                                        <p className="text-[10px] text-gray-700 font-medium mt-2 italic px-2 flex items-center gap-2">
                                            <AlertCircle className="w-3 h-3" /> {t('business_settings.form.support_email_hint', 'Usado em e-mails, suporte e rodapé legal do checkout.')}
                                        </p>
                                    </div>
                                </div>

                            <div className="p-8 lg:p-10 bg-white/[0.01] rounded-[2rem] border border-white/5 flex flex-col sm:flex-row items-center justify-between gap-8 group/toggle hover:border-primary/20 transition-all duration-700">
                                <div className="flex items-center gap-6">
                                    <div className="p-4 bg-white/5 rounded-2xl text-primary group-hover/toggle:bg-primary group-hover/toggle:text-white transition-all duration-500 shadow-lg">
                                        <Globe className="w-6 h-6" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-base font-bold text-white tracking-tight">Rodapé Estratégico de Checkout</p>
                                        <p className="text-[10px] text-gray-700 font-bold uppercase tracking-[0.2em]">Exibir compliance, termos e políticas em destaque</p>
                                    </div>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer scale-110">
                                    <input 
                                        type="checkbox" 
                                        className="sr-only peer"
                                        checked={formData.show_legal_footer}
                                        onChange={e => setFormData({ ...formData, show_legal_footer: e.target.checked })}
                                    />
                                    <div className="w-16 h-8 bg-white/5 border border-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-gray-800 after:rounded-full after:h-6 after:w-6 after:transition-all duration-500 peer-checked:after:bg-white peer-checked:bg-primary shadow-inner"></div>
                                </label>
                            </div>

                            <div className="space-y-8 pt-6">
                                <div className="flex items-center gap-3 ml-2">
                                    <div className="w-6 h-0.5 bg-primary/30 rounded-full" />
                                    <h3 className="text-[10px] font-black text-gray-700 uppercase tracking-[0.3em] flex items-center gap-3">
                                        <FileText className="w-4 h-4 text-primary" /> Ativos Legais (Protocolos)
                                    </h3>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                                    <button
                                        type="button"
                                        onClick={() => setEditingDoc('privacy')}
                                        className="relative overflow-hidden flex flex-col items-start gap-6 p-8 bg-white/[0.02] border border-white/5 rounded-[2rem] hover:border-primary/50 hover:bg-white/[0.04] transition-all duration-500 group/doc"
                                    >
                                        <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 blur-3xl -translate-y-1/2 translate-x-1/2 group-hover/doc:bg-primary/10 transition-colors" />
                                        
                                        <div className="w-full flex items-center justify-between">
                                            <div className="p-3 bg-white/5 rounded-xl text-gray-700 group-hover/doc:text-primary transition-colors">
                                                <Shield className="w-5 h-5" />
                                            </div>
                                            <ChevronRight size={20} className="text-gray-900 group-hover/doc:text-primary transform group-hover/doc:translate-x-1 transition-all" />
                                        </div>

                                        <div className="text-left w-full">
                                            <p className="text-sm font-black text-white uppercase tracking-tighter italic">Política de Privacidade</p>
                                            <div className="flex items-center justify-between mt-4 p-4 bg-black/20 rounded-2xl border border-white/5">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-2 h-2 rounded-full ${formData.privacy_policy ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500 animate-pulse'}`} />
                                                    <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest leading-none mt-0.5">
                                                       {formData.privacy_policy ? 'Configurada' : 'Pendente'}
                                                    </p>
                                                </div>
                                                <span className="text-[8px] font-bold text-gray-800 uppercase tracking-widest">v1.2</span>
                                            </div>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setEditingDoc('terms')}
                                        className="relative overflow-hidden flex flex-col items-start gap-6 p-8 bg-white/[0.02] border border-white/5 rounded-[2rem] hover:border-primary/50 hover:bg-white/[0.04] transition-all duration-500 group/doc"
                                    >
                                        <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 blur-3xl -translate-y-1/2 translate-x-1/2 group-hover/doc:bg-purple-500/10 transition-colors" />
                                        
                                        <div className="w-full flex items-center justify-between">
                                            <div className="p-3 bg-white/5 rounded-xl text-gray-700 group-hover/doc:text-purple-500 transition-colors">
                                                <FileText className="w-5 h-5" />
                                            </div>
                                            <ChevronRight size={20} className="text-gray-900 group-hover/doc:text-purple-500 transform group-hover/doc:translate-x-1 transition-all" />
                                        </div>

                                        <div className="text-left w-full">
                                            <p className="text-sm font-black text-white uppercase tracking-tighter italic">Termos de Compra</p>
                                            <div className="flex items-center justify-between mt-4 p-4 bg-black/20 rounded-2xl border border-white/5">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-2 h-2 rounded-full ${formData.terms_of_purchase ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500 animate-pulse'}`} />
                                                    <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest leading-none mt-0.5">
                                                       {formData.terms_of_purchase ? 'Configurado' : 'Pendente'}
                                                    </p>
                                                </div>
                                                <span className="text-[8px] font-bold text-gray-800 uppercase tracking-widest">v1.0</span>
                                            </div>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            <div className="relative p-8 lg:p-10 bg-primary/5 rounded-[2rem] border border-primary/20 group cursor-pointer hover:bg-primary/10 transition-all duration-700 overflow-hidden" onClick={() => setFormData({ ...formData, agree_terms: !formData.agree_terms })}>
                                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-[60px] -translate-y-1/2 translate-x-1/2" />
                                <label className="relative z-10 flex items-start gap-6 cursor-pointer">
                                    <div className={`mt-0.5 w-7 h-7 rounded-xl border flex items-center justify-center transition-all duration-500 ${formData.agree_terms ? 'bg-primary border-primary shadow-lg shadow-primary/30 rotate-0 scale-110' : 'bg-white/5 border-white/10 rotate-12'}`}>
                                        {formData.agree_terms && <Check className="w-4 h-4 text-white font-black" />}
                                    </div>
                                    <span className="text-xs text-gray-400 font-medium leading-relaxed italic pr-12">
                                        Certifico que as diretrizes comerciais e fiscais acima documentadas são legítimas e refletem a governança atual da minha operação. Estou ciente da responsabilidade jurídica sobre tais dados.
                                    </span>
                                </label>
                            </div>

                            <div className="pt-8">
                               <Button
                                   type="submit"
                                   disabled={loading}
                                   className="group/save w-full h-20 rounded-[2rem] bg-primary hover:bg-rose-600 text-white font-black uppercase italic tracking-tighter shadow-2xl shadow-primary/40 flex items-center justify-center gap-4 active:scale-[0.98] transition-all duration-500"
                               >
                                   {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Save className="w-6 h-6 group-hover/save:rotate-12 transition-transform" />}
                                   <div className="flex flex-col items-start leading-none gap-1">
                                      <span className="text-sm font-black uppercase tracking-widest">
                                         {loading ? 'Sincronizando...' : 'Efetivar Alterações'}
                                      </span>
                                      {!loading && <span className="text-[8px] opacity-60 font-medium uppercase tracking-[0.2em]">Deploy para infraestrutura live</span>}
                                   </div>
                               </Button>
                            </div>
                        </form>
                    </Card>
                </div>
            </div>

                <Modal
                    isOpen={!!editingDoc}
                    onClose={() => setEditingDoc(null)}
                    title={editingDoc === 'privacy' ? '📜 POLÍTICA DE PRIVACIDADE' : '📄 TERMOS DE COMPRA'}
                    className="max-w-4xl"
                >
                    <div className="space-y-8 p-2">
                        <div className="relative bg-[#0A0A15] border border-white/5 p-8 lg:p-10 rounded-[2.5rem] flex items-start gap-6 group overflow-hidden shadow-2xl">
                            <div className="absolute top-0 left-0 w-32 h-32 bg-primary/5 blur-[50px] -translate-y-1/2 -translate-x-1/2" />
                            <div className="p-4 bg-primary/10 border border-primary/20 rounded-2xl text-primary shadow-inner">
                               <Settings className="w-6 h-6 animate-pulse" />
                            </div>
                            <div className="relative z-10">
                               <p className="text-[10px] text-primary font-black uppercase tracking-[0.3em] mb-3 italic">Vault Automation System</p>
                               <p className="text-xs text-gray-500 leading-relaxed font-medium max-w-xl">
                                  O sistema de renderização suporta tags dinâmicas. Utilize <code className="bg-white/5 px-2.5 py-1 rounded-lg text-primary font-black italic">{"{{business_name}}"}</code> e <code className="bg-white/5 px-2.5 py-1 rounded-lg text-primary font-black italic">{"{{support_email}}"}</code> para paridade automática com seu perfil.
                               </p>
                            </div>
                        </div>
                        
                        <div className="relative">
                            <textarea
                                className="w-full h-[550px] bg-[#05050A] border-2 border-white/5 rounded-[2.5rem] p-10 text-white focus:border-primary/50 focus:ring-0 outline-none transition-all font-mono text-sm leading-relaxed scrollbar-hide shadow-inner"
                                placeholder="Redija aqui o conteúdo legal do seu negócio com linguagem estratégica..."
                                value={editingDoc === 'privacy' ? formData.privacy_policy : formData.terms_of_purchase}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    [editingDoc === 'privacy' ? 'privacy_policy' : 'terms_of_purchase']: e.target.value
                                })}
                            />
                            <div className="absolute top-6 right-6 px-4 py-1.5 rounded-full bg-white/5 border border-white/5 text-[9px] font-black text-gray-700 uppercase tracking-widest">
                                Live Editor
                            </div>
                        </div>

                        <div className="flex justify-end pt-4">
                            <Button
                                type="button"
                                onClick={() => setEditingDoc(null)}
                                className="px-12 h-16 rounded-2xl bg-primary hover:bg-rose-600 text-white font-black uppercase italic tracking-tighter shadow-xl shadow-primary/20 active:scale-95 transition-all"
                            >
                                Validar e Fechar
                            </Button>
                        </div>
                    </div>
                </Modal>
            </div>
        </Layout>
    );
};

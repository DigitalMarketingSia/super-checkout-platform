import React, { useState, useEffect } from 'react';
import { Layout } from '../../components/Layout';
import { Card } from '../../components/ui/Card';
import { Bell, Edit2, CheckCircle, XCircle, Mail, Info, ChevronRight, Zap, ArrowLeft, Terminal, Code, Plus, Copy, Globe, Search, RefreshCw, Layers } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { EmailTemplateModal } from '../../components/modals/EmailTemplateModal';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import Aurora from '../../components/ui/Aurora';


interface EmailTemplate {
    id: string;
    event_type: string;
    name: string;
    subject: string;
    html_body: string;
    active: boolean;
    updated_at: string;
    isVirtual?: boolean;
}

const DEFAULT_TEMPLATE: EmailTemplate = {
    id: 'virtual-default',
    event_type: 'ORDER_COMPLETED',
    name: 'Pedido Aprovado',
    subject: 'Seu pedido #{{order_id}} foi aprovado!',
    html_body: `<div style="font-family: sans-serif; color: #333;">
    <h1>Olá, {{customer_name}}!</h1>
    <p>Parabéns pela sua compra.</p>
    <p>Seu pedido <strong>#{{order_id}}</strong> foi confirmado com sucesso.</p>
    <p>Você adquiriu: {{product_names}}</p>
    <br/>
    <p>Acesse seu conteúdo agora:</p>
    <a href="{{members_area_url}}" style="background-color: #0070f3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Acessar Área de Membros</a>
    <br/><br/>
    <p>Atenciosamente,<br/>Sua Equipe Aqui</p>
  </div>`,
    active: false,
    updated_at: new Date().toISOString(),
    isVirtual: true
};

export const Notifications = () => {
    const { profile } = useAuth();
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [clientTemplate, setClientTemplate] = useState<EmailTemplate | null>(null);

    // Only 'super_admin' role sees the full grid. For this installation, we treat everyone as a client.
    // Fixed: Force isOwner to false to hide System tabs and show simplified Client view.
    const ownerEmail = 'contato.jeandamin@gmail.com';
    const isOwnerByEmail = profile?.email === ownerEmail || (profile as any)?.user_email === ownerEmail;
    const isOwner = profile?.role === 'owner' || profile?.role === 'super_admin' || isOwnerByEmail;

    const [activeTab, setActiveTab] = useState<'system' | 'business'>('business');
    const [systemTemplates, setSystemTemplates] = useState<EmailTemplate[]>([]);

    useEffect(() => {
        loadTemplates();
    }, [isOwner]);

    const loadTemplates = async () => {
        setLoading(true);
        try {
            if (isOwner) {
                // 1. Fetch System Templates
                const { data: sysData, error: sysError } = await supabase
                    .from('system_email_templates')
                    .select('*')
                    .order('name');

                if (sysError && sysError.code !== 'PGRST116') console.error('Error fetching system templates:', sysError);
                setSystemTemplates(sysData || []);

                // 2. Fetch Business Templates (Global/All)
                const { data: bizData, error: bizError } = await supabase
                    .from('email_templates')
                    .select('*')
                    .order('name');

                if (bizError) throw bizError;
                setTemplates(bizData || []);
            } else {
                // Client only sees ORDER_COMPLETED (Post-Sales)
                const { data, error } = await supabase
                    .from('email_templates')
                    .select('*')
                    .eq('event_type', 'ORDER_COMPLETED')
                    .maybeSingle();

                if (error && error.code !== 'PGRST116') throw error;

                if (data) {
                    setClientTemplate(data);
                } else {
                    // Use Default Virtual Template if none exists in DB
                    setClientTemplate(DEFAULT_TEMPLATE);
                }
            }
        } catch (error) {
            console.error('Error loading templates:', error);
            // Fallback to default on error for clients
            if (!isOwner) setClientTemplate(DEFAULT_TEMPLATE);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (template: EmailTemplate) => {
        setSelectedTemplate(template);
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        await loadTemplates();
        setIsModalOpen(false);
    };

    const toggleStatus = async (template: EmailTemplate, isSystemContext: boolean) => {
        if (template.isVirtual) {
            handleEdit(template);
            return;
        }

        const table = isSystemContext ? 'system_email_templates' : 'email_templates';

        try {
            const { error } = await supabase
                .from(table)
                .update({ active: !template.active })
                .eq('id', template.id);

            if (error) throw error;
            loadTemplates();
        } catch (error) {
            console.error('Error toggling status:', error);
        }
    };

    // Helper to render grid
    const renderTemplateGrid = (items: EmailTemplate[], isSystemContext: boolean) => (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {items.map((template) => (
                <div key={template.id} className="group relative bg-black/40 border border-white/5 rounded-[2rem] p-8 overflow-hidden backdrop-blur-xl transition-all duration-500 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/10">
                    {/* Aurora Glow */}
                    <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/10 rounded-full blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                    
                    <div className="relative z-10 flex justify-between items-start mb-8">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-2xl ${
                            template.active
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-emerald-500/5'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-rose-500/5'
                        }`}>
                            <Mail className="w-7 h-7" />
                        </div>
                        <div className="flex flex-col items-end">
                           <span className={`px-3 py-1 rounded-full text-[9px] font-black tracking-[0.2em] uppercase border ${
                              template.active
                                 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                 : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                           }`}>
                               {template.active ? 'Ativo' : 'Inativo'}
                           </span>
                           <p className="mt-2 text-[10px] text-gray-700 font-black tracking-widest uppercase">E-mail Template</p>
                        </div>
                    </div>

                    <div className="relative z-10 mb-8">
                        <h3 className="text-xl font-portal-display text-white mb-2 tracking-tight group-hover:text-primary transition-colors">
                            {template.name}
                        </h3>
                        <p className="text-xs text-gray-500 font-medium line-clamp-2 leading-relaxed h-[32px]" title={template.subject}>
                            {template.subject}
                        </p>
                    </div>

                    <div className="relative z-10 flex items-center gap-3">
                        <Button
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleEdit(template)}
                            className="flex-1 bg-white/5 hover:bg-white/10 text-white rounded-xl h-12 text-[10px] font-black uppercase tracking-widest border border-white/5"
                        >
                            <Edit2 className="w-3.5 h-3.5 mr-2" /> EDITAR CONTEÚDO
                        </Button>
                        <button
                            onClick={() => toggleStatus(template, isSystemContext)}
                            className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all border ${
                                template.active
                                    ? 'bg-rose-500/5 text-gray-700 border-white/5 hover:bg-rose-500/10 hover:text-rose-500 hover:border-rose-500/20'
                                    : 'bg-emerald-500/5 text-gray-700 border-white/5 hover:bg-emerald-500/10 hover:text-emerald-500 hover:border-emerald-500/20'
                            }`}
                        >
                            {template.active ? <XCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                        </button>
                    </div>
                </div>
            ))}
            {items.length === 0 && (
                <div className="col-span-full py-20 text-center border border-dashed border-white/5 rounded-[2.5rem] bg-white/[0.02]">
                    <p className="text-gray-600 font-bold uppercase tracking-widest text-xs">Nenhum rastro de template encontrado.</p>
                </div>
            )}
        </div>
    );

    // Client View Component
    const renderClientView = () => {
        const templateToShow = clientTemplate || DEFAULT_TEMPLATE;

        return (
            <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-1000">
                <div className="group relative bg-black/40 border border-white/5 rounded-[2.5rem] p-10 overflow-hidden backdrop-blur-2xl transition-all duration-500 hover:border-primary/20">

                    {/* Premium Aurora Glow */}
                    <div className="absolute -top-32 -right-32 w-64 h-64 bg-primary/10 rounded-full blur-[100px]" />
                    <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-blue-500/5 rounded-full blur-[100px]" />

                    <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-12 pb-12 border-b border-white/5">
                        <div className="flex items-center gap-6">
                            <div className={`w-20 h-20 rounded-[1.5rem] flex items-center justify-center transition-all duration-700 group-hover:scale-105 group-hover:rotate-3 shadow-2xl ${
                                templateToShow.active
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-emerald-500/10'
                                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-rose-500/10'
                            }`}>
                                <Mail className="w-10 h-10" />
                            </div>
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <h3 className="text-3xl font-portal-display text-white tracking-tight">E-mail de Pós-Venda</h3>
                                    <span className="text-[10px] font-black bg-primary/20 text-primary px-3 py-1 rounded-full uppercase tracking-widest border border-primary/20">Automated</span>
                                </div>
                                <p className="text-gray-500 font-medium max-w-md">Mensagem inteligente transmitida instantaneamente após a aprovação de cada pedido.</p>
                            </div>
                        </div>
                        <div className={`px-6 py-2 rounded-full text-[10px] font-black tracking-widest border transition-all ${
                            templateToShow.active
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}>
                            {templateToShow.active ? 'CENTRAL ATIVA' : 'SISTEMA EM PAUSA'}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 relative z-10">
                        <div className="space-y-10">
                            <div>
                                <div className="flex items-center gap-2 mb-4">
                                   <label className="text-[10px] text-gray-700 uppercase font-black tracking-[0.2em] mb-0">Assunto da Mensagem</label>
                                   <div className="h-px flex-1 bg-white/5" />
                                </div>
                                <div className="text-white font-bold bg-white/[0.02] p-6 rounded-2xl border border-white/5 group-hover:border-primary/20 transition-all leading-relaxed">
                                    {templateToShow.subject}
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center gap-2 mb-6">
                                   <label className="text-[10px] text-gray-700 uppercase font-black tracking-[0.2em] mb-0">Injeção Dinâmica</label>
                                   <div className="h-px flex-1 bg-white/5" />
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {['{{customer_name}}', '{{product_names}}', '{{members_area_url}}', '{{order_id}}'].map(v => (
                                        <code key={v} className="text-[11px] text-gray-400 font-bold bg-white/5 px-4 py-2 rounded-xl border border-white/5 font-mono hover:text-primary hover:border-primary/30 transition-all cursor-default group/var">
                                            {v}
                                        </code>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col justify-end gap-4 p-8 bg-primary/5 rounded-[2rem] border border-primary/10 relative overflow-hidden group/actions">
                           <div className="absolute top-0 right-0 p-4 opacity-10">
                              <Zap className="w-24 h-24 text-primary" />
                           </div>
                           <h4 className="text-white font-black uppercase italic tracking-tighter text-2xl mb-2 relative z-10">Controle de Fluxo</h4>
                           <p className="text-gray-400 text-xs font-medium mb-6 relative z-10 leading-relaxed">Personalize o HTML do seu e-mail ou gerencie o status de disparo global da sua loja.</p>
                           
                           <div className="flex flex-col gap-3 relative z-10">
                              <Button
                                 onClick={() => handleEdit(templateToShow)}
                                 className="w-full bg-primary hover:bg-primary-hover text-white font-black h-16 rounded-2xl transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-3 transform hover:-translate-y-1 active:translate-y-0"
                              >
                                 <Edit2 className="w-5 h-5" />
                                 EDITAR TEMPLATE
                              </Button>
                              <button
                                 onClick={() => toggleStatus(templateToShow, false)}
                                 className={`flex items-center justify-center h-16 rounded-2xl border font-black text-[10px] tracking-widest uppercase transition-all ${
                                    templateToShow.active
                                       ? 'bg-rose-500/5 border-rose-500/20 text-rose-400 hover:bg-rose-500/10'
                                       : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10'
                                 }`}
                              >
                                 {templateToShow.active ? (
                                    <><XCircle className="w-5 h-5 mr-3" /> DESATIVAR ENVIO</>
                                 ) : (
                                    <><CheckCircle className="w-5 h-5 mr-3" /> ATIVAR ENVIO</>
                                 )}
                              </button>
                           </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <Layout>
            <div className="relative min-h-[60vh] -mt-6 -mx-6 px-6 pt-12 pb-24 overflow-hidden rounded-b-[3rem]">
               <div className="absolute inset-0 bg-gradient-to-b from-[#05050A]/0 via-[#05050A]/40 to-[#05050A] z-0" />
               
               <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 w-full">
                  <div>
                     <div className="flex items-center gap-3 mb-4 animate-in fade-in slide-in-from-left-4 duration-500">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/5">
                           <Bell className="w-6 h-6 text-primary" />
                        </div>
                        <span className="text-[10px] font-black tracking-[0.3em] text-primary uppercase">Intelligence Center</span>
                     </div>
                     <h1 className="font-portal-display text-5xl md:text-7xl text-white italic tracking-tighter mb-4 animate-in fade-in slide-in-from-left-6 duration-700 leading-none">
                        CENTRAL DE <br/>
                        <span className="text-primary drop-shadow-[0_0_30px_rgba(var(--primary-rgb),0.3)]">NOTIFICAÇÕES</span>
                     </h1>
                     <p className="text-gray-400 text-sm md:text-base font-medium max-w-xl animate-in fade-in slide-in-from-left-8 duration-1000">
                        {isOwner
                           ? 'Orquestre a comunicação do seu ecossistema. Gerencie templates de sistema e modelos de negócio com precisão cirúrgica.'
                           : 'Personalize a experiência do seu cliente. Configure mensagens automáticas que encantam e convertem após cada venda.'}
                     </p>
                  </div>

                  <div className="flex items-center gap-4 animate-in fade-in slide-in-from-right-4 duration-700">
                     <div className="bg-white/5 backdrop-blur-xl border border-white/5 rounded-3xl p-6 min-w-[180px]">
                        <p className="text-[10px] font-black tracking-widest text-gray-700 uppercase mb-2">Status da Central</p>
                        <div className="flex items-center gap-3">
                           <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)] animate-pulse" />
                           <span className="text-white font-black text-sm uppercase tracking-tight">Sistema Online</span>
                        </div>
                     </div>
                  </div>
               </div>

               {isOwner && (
                  <div className="relative z-10 flex gap-1 p-1.5 bg-white/5 backdrop-blur-md rounded-2xl border border-white/5 w-fit animate-in fade-in slide-in-from-bottom-4 duration-500">
                     {[
                        { id: 'system', label: 'SISTEMA (OWNER)', icon: Zap },
                        { id: 'business', label: 'NEGÓCIO (CLIENTES)', icon: Layers }
                     ].map((tab) => (
                        <button
                           key={tab.id}
                           onClick={() => setActiveTab(tab.id as any)}
                           className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black tracking-widest transition-all duration-300 ${
                              activeTab === tab.id 
                                 ? 'bg-primary text-white shadow-lg shadow-primary/20 translate-y-[-1px]' 
                                 : 'text-gray-500 hover:text-white hover:bg-white/5'
                           }`}
                        >
                           <tab.icon className="w-3.5 h-3.5" />
                           {tab.label}
                        </button>
                     ))}
                  </div>
               )}
            </div>

            <div className="relative z-10 -mt-12">

            {loading ? (
                <div className="flex justify-center py-20">
                    <p className="text-gray-400 animate-pulse">Carregando configurações...</p>
                </div>
            ) : isOwner ? (
                // OWNER VIEW WITH TABS
                <div className="space-y-6">

                    {activeTab === 'system' ? (
                        <div>
                            <div className="mb-8 px-6 py-3 rounded-2xl bg-primary/5 border border-primary/10 flex items-center gap-3 w-fit animate-in fade-in duration-1000">
                                <Info className="w-4 h-4 text-primary" />
                                <p className="text-[10px] font-black text-primary uppercase tracking-[0.1em]">
                                    Fluxo de Saída: E-mails transmitidos pela sua licença para seus contratantes.
                                </p>
                            </div>
                            {renderTemplateGrid(systemTemplates, true)}
                        </div>
                    ) : (
                        <div>
                            <div className="mb-8 px-6 py-3 rounded-2xl bg-blue-500/5 border border-blue-500/10 flex items-center gap-3 w-fit animate-in fade-in duration-1000">
                                <Info className="w-4 h-4 text-blue-400" />
                                <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.1em]">
                                    Fluxo de Negócio: Modelos globais utilizados pelos seus clientes para os clientes finais.
                                </p>
                            </div>
                            {renderTemplateGrid(templates, false)}
                        </div>
                    )}
                </div>
            ) : (
                renderClientView()
            )}
            </div>

            <EmailTemplateModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                template={selectedTemplate}
                onSave={handleSave}
                isSystem={activeTab === 'system' && isOwner} // Context Prop
            />
        </Layout>
    );
};

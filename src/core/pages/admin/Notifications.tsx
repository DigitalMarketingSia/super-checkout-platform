import React, { useState, useEffect } from 'react';
import { Layout } from '../../components/Layout';
import { Bell, Edit2, CheckCircle, XCircle, Mail, Info, Zap, Layers } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { EmailTemplateModal } from '../../components/modals/EmailTemplateModal';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import {
    POST_PURCHASE_EMAIL_TEMPLATES,
    POST_PURCHASE_TEMPLATE_EVENT_TYPES,
} from '../../services/postPurchaseEmailTemplates';


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

const createVirtualTemplate = (template: typeof POST_PURCHASE_EMAIL_TEMPLATES[number]): EmailTemplate => ({
    id: `virtual-${template.eventType.toLowerCase()}`,
    event_type: template.eventType,
    name: template.name,
    subject: template.subject,
    html_body: template.htmlBody,
    active: true,
    updated_at: new Date().toISOString(),
    isVirtual: true
});

const DEFAULT_POST_PURCHASE_TEMPLATES = POST_PURCHASE_EMAIL_TEMPLATES.map(createVirtualTemplate);

export const Notifications = () => {
    const { profile } = useAuth();
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [clientTemplates, setClientTemplates] = useState<EmailTemplate[]>(DEFAULT_POST_PURCHASE_TEMPLATES);

    const effectiveRole = profile?.effective_role || profile?.role;
    const isOwner = effectiveRole === 'master_admin';

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
                // Clients manage the post-purchase templates that affect their buyers.
                const { data, error } = await supabase
                    .from('email_templates')
                    .select('*')
                    .in('event_type', [...POST_PURCHASE_TEMPLATE_EVENT_TYPES])
                    .eq('language', 'pt');

                if (error && error.code !== 'PGRST116') throw error;

                const templatesByType = new Map((data || []).map((template) => [template.event_type, template]));
                setClientTemplates(POST_PURCHASE_EMAIL_TEMPLATES.map((definition) =>
                    templatesByType.get(definition.eventType) || createVirtualTemplate(definition)
                ));
            }
        } catch (error) {
            console.error('Error loading templates:', error);
            // Fallback to default on error for clients
            if (!isOwner) setClientTemplates(DEFAULT_POST_PURCHASE_TEMPLATES);
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

    const renderClientView = () => (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="max-w-4xl px-6 py-4 rounded-2xl bg-primary/5 border border-primary/10 flex items-start gap-3">
                <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="text-sm text-gray-300 leading-relaxed">
                    Compra aprovada confirma o pedido. Entrega direta e acesso a area de membros enviam os acessos reais gerados no servidor.
                </p>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {clientTemplates.map((template) => {
                    const definition = POST_PURCHASE_EMAIL_TEMPLATES.find((item) => item.eventType === template.event_type);
                    const variables = definition?.variables || [];

                    return (
                        <div key={template.id} className="relative flex min-h-[390px] flex-col overflow-hidden rounded-[2rem] border border-white/5 bg-black/40 p-7 backdrop-blur-xl transition-all hover:border-primary/25">
                            <div className="flex items-start justify-between gap-4">
                                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${
                                    template.active
                                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                                        : 'border-rose-500/20 bg-rose-500/10 text-rose-400'
                                }`}>
                                    <Mail className="h-7 w-7" />
                                </div>
                                <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] ${
                                    template.active
                                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                                        : 'border-rose-500/20 bg-rose-500/10 text-rose-400'
                                }`}>
                                    {template.isVirtual ? 'Padrao' : template.active ? 'Ativo' : 'Fallback'}
                                </span>
                            </div>

                            <div className="mt-7 space-y-3">
                                <h3 className="text-xl font-portal-display text-white tracking-tight">{template.name}</h3>
                                <p className="min-h-[44px] text-sm leading-relaxed text-gray-400">
                                    {definition?.purpose || 'Template transacional do pos-compra.'}
                                </p>
                                <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4 text-sm font-semibold text-white">
                                    {template.subject}
                                </div>
                            </div>

                            <div className="mt-5 flex flex-wrap gap-2">
                                {variables.map((variable) => (
                                    <code key={variable} className="rounded-lg border border-white/5 bg-white/5 px-2.5 py-1.5 text-[10px] font-bold text-gray-400">
                                        {variable}
                                    </code>
                                ))}
                            </div>

                            <div className="mt-auto flex gap-3 pt-7">
                                <Button
                                    onClick={() => handleEdit(template)}
                                    className="h-12 flex-1 rounded-xl bg-primary text-[10px] font-black uppercase tracking-widest text-white hover:bg-primary-hover"
                                >
                                    <Edit2 className="mr-2 h-4 w-4" />
                                    Editar
                                </Button>
                                <button
                                    onClick={() => toggleStatus(template, false)}
                                    className={`flex h-12 w-12 items-center justify-center rounded-xl border transition-all ${
                                        template.active
                                            ? 'border-rose-500/20 bg-rose-500/5 text-rose-400 hover:bg-rose-500/10'
                                            : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10'
                                    }`}
                                    title={template.active ? 'Usar fallback do sistema' : 'Ativar template'}
                                >
                                    {template.active ? <XCircle className="h-5 w-5" /> : <CheckCircle className="h-5 w-5" />}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );

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

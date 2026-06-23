import React, { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCircle, Edit2, Info, Layers, Mail, XCircle, Zap } from 'lucide-react';
import { Layout } from '../../components/Layout';
import { Button } from '../../components/ui/Button';
import { EmailTemplateModal } from '../../components/modals/EmailTemplateModal';
import { useAuth } from '../../context/AuthContext';
import { demoWorkspaceService } from '../../services/demoWorkspaceService';
import { isDemoDataRuntime } from '../../services/demoDataService';
import { supabase } from '../../services/supabase';
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

interface BusinessEmailTemplateDefinition {
  eventType: string;
  name: string;
  purpose: string;
  subject: string;
  htmlBody: string;
  variables: string[];
}

const ORDER_MEMBER_ACCESS_DISPLAY_NAME = 'Entrega por Area de Membros';

const MANUAL_MEMBER_ACCESS_TEMPLATE: BusinessEmailTemplateDefinition = {
  eventType: 'ACCESS_GRANTED',
  name: 'Acesso Manual de Aluno',
  purpose: 'Usado apenas quando voce reenvia manualmente o acesso para um aluno ja liberado.',
  subject: 'Seu acesso foi liberado',
  variables: ['{{name}}', '{{email}}', '{{members_area_url}}'],
  htmlBody: `
    <div style="background:#f3f4f6;padding:28px 12px;font-family:Arial,sans-serif;color:#111827;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
        <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;">Seu acesso foi liberado</h1>
        <p style="margin:0 0 12px;color:#374151;">Ola, {{name}}.</p>
        <p style="margin:0 0 20px;color:#374151;">Seu acesso manual foi liberado. Entre usando o link abaixo.</p>
        <p style="margin:0;"><a href="{{members_area_url}}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:700;padding:11px 16px;border-radius:8px;">Acessar area de membros</a></p>
      </div>
    </div>
  `,
};

const BUSINESS_TEMPLATE_DEFINITIONS: BusinessEmailTemplateDefinition[] = [
  ...POST_PURCHASE_EMAIL_TEMPLATES.map((template) => ({
    eventType: template.eventType,
    name: template.eventType === 'ORDER_MEMBER_ACCESS'
      ? ORDER_MEMBER_ACCESS_DISPLAY_NAME
      : template.name,
    purpose: template.purpose,
    subject: template.subject,
    htmlBody: template.htmlBody,
    variables: template.variables,
  })),
  MANUAL_MEMBER_ACCESS_TEMPLATE,
];

const BUSINESS_TEMPLATE_DEFINITION_BY_EVENT = new Map(
  BUSINESS_TEMPLATE_DEFINITIONS.map((template) => [template.eventType, template]),
);

const BUSINESS_TEMPLATE_EVENT_TYPES = BUSINESS_TEMPLATE_DEFINITIONS.map((template) => template.eventType);

function createVirtualBusinessTemplate(template: BusinessEmailTemplateDefinition): EmailTemplate {
  return {
    id: `virtual-${template.eventType.toLowerCase()}`,
    event_type: template.eventType,
    name: template.name,
    subject: template.subject,
    html_body: template.htmlBody,
    active: true,
    updated_at: new Date().toISOString(),
    isVirtual: true,
  };
}

function applyBusinessDisplayTemplate(template: EmailTemplate): EmailTemplate {
  const definition = BUSINESS_TEMPLATE_DEFINITION_BY_EVENT.get(template.event_type);
  if (!definition) return template;

  return {
    ...template,
    name: definition.name,
    subject: template.subject || definition.subject,
    html_body: template.html_body || definition.htmlBody,
  };
}

function buildBusinessTemplateSet(data: EmailTemplate[] | null | undefined) {
  const templatesByType = new Map((data || []).map((template) => [template.event_type, template]));

  return BUSINESS_TEMPLATE_DEFINITIONS.map((definition) => {
    const existing = templatesByType.get(definition.eventType);
    return applyBusinessDisplayTemplate(existing || createVirtualBusinessTemplate(definition));
  });
}

function getTemplateDefinition(eventType: string) {
  return BUSINESS_TEMPLATE_DEFINITION_BY_EVENT.get(eventType) || null;
}

type DemoTemplateScope = 'business' | 'system';

function renderStatusBadge(template: EmailTemplate) {
  return template.isVirtual ? 'Padrao' : template.active ? 'Ativo' : 'Fallback';
}

function getDemoTemplateStorageKey(scope: DemoTemplateScope) {
  const workspaceId = demoWorkspaceService.getCachedWorkspace()?.workspace?.id || 'shared';
  return 'sc_demo_email_templates:' + scope + ':' + workspaceId;
}

function readDemoTemplates(scope: DemoTemplateScope): EmailTemplate[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(getDemoTemplateStorageKey(scope));
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((template) => template && typeof template === 'object' && 'id' in template && 'event_type' in template)
      .map((template) => ({
        id: String(template.id),
        event_type: String(template.event_type),
        name: String(template.name || ''),
        subject: String(template.subject || ''),
        html_body: String(template.html_body || ''),
        active: template.active !== false,
        updated_at: String(template.updated_at || new Date().toISOString()),
      }));
  } catch (error) {
    console.error('Error reading demo email templates:', error);
    return [];
  }
}

function writeDemoTemplates(scope: DemoTemplateScope, templates: EmailTemplate[]) {
  if (typeof window === 'undefined') return;

  const serialized = templates.map(({ isVirtual, ...template }) => template);
  window.localStorage.setItem(getDemoTemplateStorageKey(scope), JSON.stringify(serialized));
}

export const Notifications = () => {
  const { profile } = useAuth();
  const isDemoMode = isDemoDataRuntime();
  const effectiveRole = profile?.effective_role || profile?.role;
  const isOwner = effectiveRole === 'master_admin';

  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'system' | 'business'>('business');
  const [businessTemplates, setBusinessTemplates] = useState<EmailTemplate[]>(buildBusinessTemplateSet([]));
  const [systemTemplates, setSystemTemplates] = useState<EmailTemplate[]>([]);

  useEffect(() => {
    void loadTemplates();
  }, [isOwner]);

  const postPurchaseTemplates = useMemo(
    () => businessTemplates.filter((template) =>
      POST_PURCHASE_TEMPLATE_EVENT_TYPES.includes(template.event_type as typeof POST_PURCHASE_TEMPLATE_EVENT_TYPES[number])),
    [businessTemplates],
  );

  const manualAccessTemplates = useMemo(
    () => businessTemplates.filter((template) => template.event_type === 'ACCESS_GRANTED'),
    [businessTemplates],
  );

  async function loadTemplates() {
    setLoading(true);
    try {
      if (isDemoMode) {
        const businessData = readDemoTemplates('business');
        const systemData = readDemoTemplates('system');
        if (isOwner) {
          setSystemTemplates(systemData);
        }
        setBusinessTemplates(buildBusinessTemplateSet(businessData));
        return;
      }

      if (isOwner) {
        const { data: systemData, error: systemError } = await supabase
          .from('system_email_templates')
          .select('*')
          .order('name');

        if (systemError && systemError.code !== 'PGRST116') {
          console.error('Error fetching system templates:', systemError);
        }

        setSystemTemplates(systemData || []);
      }

      const { data: businessData, error: businessError } = await supabase
        .from('email_templates')
        .select('*')
        .in('event_type', BUSINESS_TEMPLATE_EVENT_TYPES)
        .eq('language', 'pt');

      if (businessError && businessError.code !== 'PGRST116') {
        throw businessError;
      }

      setBusinessTemplates(buildBusinessTemplateSet(businessData || []));
    } catch (error) {
      console.error('Error loading templates:', error);
      setBusinessTemplates(buildBusinessTemplateSet([]));
    } finally {
      setLoading(false);
    }
  }

  async function persistDemoTemplate(payload: { template: EmailTemplate; subject: string; htmlBody: string; isSystem: boolean }) {
    const scope: DemoTemplateScope = payload.isSystem ? 'system' : 'business';
    const currentTemplates = readDemoTemplates(scope);
    const nextTemplate: EmailTemplate = {
      id: payload.template.isVirtual ? 'demo-template-' + payload.template.event_type.toLowerCase() : payload.template.id,
      event_type: payload.template.event_type,
      name: payload.template.name,
      subject: payload.subject,
      html_body: payload.htmlBody,
      active: payload.template.active ?? true,
      updated_at: new Date().toISOString(),
    };

    const nextTemplates = [
      ...currentTemplates.filter((template) => template.id !== nextTemplate.id && template.event_type !== nextTemplate.event_type),
      nextTemplate,
    ];

    writeDemoTemplates(scope, nextTemplates);
  }

  function handleEdit(template: EmailTemplate) {
    setSelectedTemplate(template);
    setIsModalOpen(true);
  }

  async function handleSave() {
    await loadTemplates();
    setIsModalOpen(false);
  }

  async function toggleStatus(template: EmailTemplate, isSystemContext: boolean) {
    if (isDemoMode) {
      const scope: DemoTemplateScope = isSystemContext ? 'system' : 'business';
      const currentTemplates = readDemoTemplates(scope);
      const nextTemplate: EmailTemplate = {
        id: template.isVirtual ? 'demo-template-' + template.event_type.toLowerCase() : template.id,
        event_type: template.event_type,
        name: template.name,
        subject: template.subject,
        html_body: template.html_body,
        active: !template.active,
        updated_at: new Date().toISOString(),
      };

      writeDemoTemplates(scope, [
        ...currentTemplates.filter((entry) => entry.id !== nextTemplate.id && entry.event_type !== nextTemplate.event_type),
        nextTemplate,
      ]);
      await loadTemplates();
      return;
    }

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
      await loadTemplates();
    } catch (error) {
      console.error('Error toggling status:', error);
    }
  }

  function renderSystemTemplateGrid(items: EmailTemplate[]) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {items.map((template) => (
          <div key={template.id} className="group relative bg-black/40 border border-white/5 rounded-[2rem] p-8 overflow-hidden backdrop-blur-xl transition-all duration-500 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/10">
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
                <Edit2 className="w-3.5 h-3.5 mr-2" /> Editar Conteudo
              </Button>
              <button
                onClick={() => toggleStatus(template, true)}
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
  }

  function renderBusinessCards(items: EmailTemplate[]) {
    return (
      <div className={`grid gap-6 ${items.length > 1 ? 'grid-cols-1 xl:grid-cols-3' : 'grid-cols-1'}`}>
        {items.map((template) => {
          const definition = getTemplateDefinition(template.event_type);
          const variables = definition?.variables || [];

          return (
            <div key={template.id} className="relative flex min-h-[340px] flex-col overflow-hidden rounded-[2rem] border border-white/5 bg-black/40 p-7 backdrop-blur-xl transition-all hover:border-primary/25">
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
                  {renderStatusBadge(template)}
                </span>
              </div>

              <div className="mt-7 space-y-3">
                <h3 className="text-xl font-portal-display text-white tracking-tight">{template.name}</h3>
                <p className="min-h-[44px] text-sm leading-relaxed text-gray-400">
                  {definition?.purpose || 'Template transacional do negocio.'}
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
    );
  }

  function renderBusinessView() {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="max-w-4xl px-6 py-4 rounded-2xl bg-primary/5 border border-primary/10 flex items-start gap-3">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-sm text-gray-300 leading-relaxed">
            Compra aprovada funciona como fallback quando nao existe um e-mail especifico de entrega. Entrega direta e area de membros substituem a confirmacao generica e enviam apenas os acessos reais gerados no servidor.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-black text-white uppercase tracking-widest">Pos-compra</h2>
            <p className="text-sm text-gray-400 mt-2">
              Estes sao os 3 modelos unicos do fluxo de entrega apos pagamento.
            </p>
          </div>
          {renderBusinessCards(postPurchaseTemplates)}
        </div>

        <div className="space-y-4">
          <div className="max-w-4xl px-6 py-4 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-3">
            <Info className="w-4 h-4 text-blue-300 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-300 leading-relaxed">
              Acesso manual de aluno e um fluxo separado do pos-compra. Ele so entra quando voce reenvia manualmente o acesso de um membro.
            </p>
          </div>
          {renderBusinessCards(manualAccessTemplates)}
        </div>
      </div>
    );
  }

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
              CENTRAL DE <br />
              <span className="text-primary drop-shadow-[0_0_30px_rgba(var(--primary-rgb),0.3)]">NOTIFICACOES</span>
            </h1>
            <p className="text-gray-400 text-sm md:text-base font-medium max-w-xl animate-in fade-in slide-in-from-left-8 duration-1000">
              {isOwner
                ? 'Orquestre a comunicacao do seu ecossistema. O fluxo de negocio agora destaca apenas os modelos realmente usados no pos-compra.'
                : 'Personalize a experiencia do seu cliente. Configure os modelos de compra aprovada, entrega direta, area de membros e acesso manual.'}
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
              { id: 'business', label: 'NEGOCIO (CLIENTES)', icon: Layers },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'system' | 'business')}
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
            <p className="text-gray-400 animate-pulse">Carregando configuracoes...</p>
          </div>
        ) : isOwner ? (
          <div className="space-y-6">
            {activeTab === 'system' ? (
              <div>
                <div className="mb-8 px-6 py-3 rounded-2xl bg-primary/5 border border-primary/10 flex items-center gap-3 w-fit animate-in fade-in duration-1000">
                  <Info className="w-4 h-4 text-primary" />
                  <p className="text-[10px] font-black text-primary uppercase tracking-[0.1em]">
                    Fluxo de saida: e-mails transmitidos pela sua licenca para seus contratantes.
                  </p>
                </div>
                {renderSystemTemplateGrid(systemTemplates)}
              </div>
            ) : (
              <div>
                <div className="mb-8 px-6 py-3 rounded-2xl bg-blue-500/5 border border-blue-500/10 flex items-center gap-3 w-fit animate-in fade-in duration-1000">
                  <Info className="w-4 h-4 text-blue-400" />
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.1em]">
                    Fluxo de negocio: modelos realmente usados no pos-compra e no acesso manual de alunos.
                  </p>
                </div>
                {renderBusinessView()}
              </div>
            )}
          </div>
        ) : (
          renderBusinessView()
        )}
      </div>

      <EmailTemplateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        template={selectedTemplate}
        onSave={handleSave}
        isSystem={activeTab === 'system' && isOwner}
        onPersist={isDemoMode ? persistDemoTemplate : undefined}
      />
    </Layout>
  );
};

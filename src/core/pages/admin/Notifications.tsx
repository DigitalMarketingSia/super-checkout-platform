import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Edit2, Info, Layers, Mail, Zap, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Layout } from '../../components/Layout';
import { Button } from '../../components/ui/Button';
import { EmailTemplateModal } from '../../components/modals/EmailTemplateModal';
import { PwaPushSettingsCard } from '../../components/ui/PwaPushSettingsCard';
import { useAuth } from '../../context/AuthContext';
import { demoWorkspaceService } from '../../services/demoWorkspaceService';
import { isDemoDataRuntime } from '../../services/demoDataService';
import { supabase } from '../../services/supabase';
import { getMemberAccessEmailTemplates } from '../../services/memberAccessEmailTemplates';

interface EmailTemplate {
  id: string;
  event_type: string;
  name: string;
  subject: string;
  html_body: string;
  active: boolean;
  updated_at: string;
  isVirtual?: boolean;
  language?: string;
}

interface BusinessEmailTemplateDefinition {
  eventType: string;
  name: string;
  purpose: string;
  subject: string;
  htmlBody: string;
  variables: string[];
}

type DemoTemplateScope = 'business' | 'system';
type NotificationsTab = 'business' | 'system' | 'push';
type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

const buildEmailFrame = (content: string) => `
  <div style="background:#f3f4f6;padding:28px 12px;font-family:Arial,sans-serif;color:#111827;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
      ${content}
    </div>
  </div>
`;

function getTemplateLanguagePriority(language: string | undefined, preferredLanguage: string) {
  if (language === preferredLanguage) return 2;
  if (language === 'pt') return 1;
  return 0;
}

function buildBusinessTemplateDefinitions(t: TranslateFn, language: string): BusinessEmailTemplateDefinition[] {
  return [
    {
      eventType: 'ORDER_COMPLETED',
      name: t('notifications.templates.order_completed.name'),
      purpose: t('notifications.templates.order_completed.purpose'),
      subject: t('notifications.templates.order_completed.subject'),
      variables: ['{{customer_name}}', '{{order_id}}', '{{product_names}}', '{{business_name}}'],
      htmlBody: buildEmailFrame(`
        <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;">${t('notifications.templates.order_completed.body.title')}</h1>
        <p style="margin:0 0 12px;color:#374151;">${t('notifications.templates.common.greeting', { name: '{{customer_name}}' })}</p>
        <p style="margin:0 0 12px;color:#374151;">${t('notifications.templates.order_completed.body.payment_confirmed', { orderId: '{{order_id}}' })}</p>
        <p style="margin:0 0 20px;color:#374151;">${t('notifications.templates.order_completed.body.items', { productNames: '{{product_names}}' })}</p>
        <p style="margin:0;color:#6b7280;font-size:13px;">${t('notifications.templates.common.signature', { businessName: '{{business_name}}' })}</p>
      `),
    },
    {
      eventType: 'ORDER_DIRECT_DELIVERY',
      name: t('notifications.templates.order_direct_delivery.name'),
      purpose: t('notifications.templates.order_direct_delivery.purpose'),
      subject: t('notifications.templates.order_direct_delivery.subject'),
      variables: [
        '{{customer_name}}',
        '{{order_id}}',
        '{{product_names}}',
        '{{business_name}}',
        '{{deliverables_html}}',
        '{{deliverables_text}}',
      ],
      htmlBody: buildEmailFrame(`
        <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;">${t('notifications.templates.order_direct_delivery.body.title')}</h1>
        <p style="margin:0 0 12px;color:#374151;">${t('notifications.templates.common.greeting', { name: '{{customer_name}}' })}</p>
        <p style="margin:0 0 20px;color:#374151;">${t('notifications.templates.order_direct_delivery.body.delivery_ready', { orderId: '{{order_id}}' })}</p>
        {{deliverables_html}}
        <p style="margin:28px 0 0;color:#6b7280;font-size:13px;">${t('notifications.templates.common.signature', { businessName: '{{business_name}}' })}</p>
      `),
    },
    {
      eventType: 'ORDER_MEMBER_ACCESS',
      name: t('notifications.templates.order_member_access.name'),
      purpose: t('notifications.templates.order_member_access.purpose'),
      subject: t('notifications.templates.order_member_access.subject'),
      variables: [
        '{{customer_name}}',
        '{{order_id}}',
        '{{product_names}}',
        '{{business_name}}',
        '{{deliverables_html}}',
        '{{deliverables_text}}',
      ],
      htmlBody: buildEmailFrame(`
        <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;">${t('notifications.templates.order_member_access.body.title')}</h1>
        <p style="margin:0 0 12px;color:#374151;">${t('notifications.templates.common.greeting', { name: '{{customer_name}}' })}</p>
        <p style="margin:0 0 20px;color:#374151;">${t('notifications.templates.order_member_access.body.access_ready', { orderId: '{{order_id}}' })}</p>
        {{deliverables_html}}
        <p style="margin:28px 0 0;color:#6b7280;font-size:13px;">${t('notifications.templates.common.signature', { businessName: '{{business_name}}' })}</p>
      `),
    },
    {
      eventType: 'ACCESS_GRANTED',
      name: t('notifications.templates.access_granted.name'),
      purpose: t('notifications.templates.access_granted.purpose'),
      subject: t('notifications.templates.access_granted.subject'),
      variables: ['{{name}}', '{{email}}', '{{members_area_url}}'],
      htmlBody: buildEmailFrame(`
        <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;">${t('notifications.templates.access_granted.body.title')}</h1>
        <p style="margin:0 0 12px;color:#374151;">${t('notifications.templates.common.greeting', { name: '{{name}}' })}</p>
        <p style="margin:0 0 20px;color:#374151;">${t('notifications.templates.access_granted.body.manual_release')}</p>
        <p style="margin:0;"><a href="{{members_area_url}}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:700;padding:11px 16px;border-radius:8px;">${t('notifications.templates.access_granted.body.cta')}</a></p>
      `),
    },
    ...getMemberAccessEmailTemplates(language).map((template) => ({
      eventType: template.eventType,
      name: template.name,
      purpose: template.purpose,
      subject: template.subject,
      htmlBody: template.htmlBody,
      variables: template.variables,
    })),
  ];
}

function createVirtualBusinessTemplate(template: BusinessEmailTemplateDefinition, language: string): EmailTemplate {
  return {
    id: `virtual-${template.eventType.toLowerCase()}`,
    event_type: template.eventType,
    name: template.name,
    subject: template.subject,
    html_body: template.htmlBody,
    active: true,
    updated_at: new Date().toISOString(),
    isVirtual: true,
    language,
  };
}

function applyBusinessDisplayTemplate(
  template: EmailTemplate,
  definitionByEvent: Map<string, BusinessEmailTemplateDefinition>,
): EmailTemplate {
  const definition = definitionByEvent.get(template.event_type);
  if (!definition) return template;

  return {
    ...template,
    name: definition.name,
    subject: template.subject || definition.subject,
    html_body: template.html_body || definition.htmlBody,
  };
}

function buildBusinessTemplateSet(
  data: EmailTemplate[] | null | undefined,
  definitions: BusinessEmailTemplateDefinition[],
  definitionByEvent: Map<string, BusinessEmailTemplateDefinition>,
  preferredLanguage: string,
) {
  const templatesByType = new Map<string, EmailTemplate>();

  for (const template of data || []) {
    const current = templatesByType.get(template.event_type);
    if (
      !current ||
      getTemplateLanguagePriority(template.language, preferredLanguage) >
        getTemplateLanguagePriority(current.language, preferredLanguage)
    ) {
      templatesByType.set(template.event_type, template);
    }
  }

  return definitions.map((definition) => {
    const existing = templatesByType.get(definition.eventType);
    return applyBusinessDisplayTemplate(
      existing || createVirtualBusinessTemplate(definition, preferredLanguage),
      definitionByEvent,
    );
  });
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
        language: typeof template.language === 'string' ? template.language : undefined,
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
  const { t, i18n } = useTranslation(['admin', 'common']);
  const { profile } = useAuth();
  const isDemoMode = isDemoDataRuntime();
  const effectiveRole = profile?.effective_role || profile?.role;
  const isOwner = effectiveRole === 'master_admin';
  const preferredLanguage = i18n.language.startsWith('es') ? 'es' : i18n.language.startsWith('en') ? 'en' : 'pt';

  const businessTemplateDefinitions = useMemo(
    () => buildBusinessTemplateDefinitions((key, options) => t(key, options), preferredLanguage),
    [preferredLanguage, t],
  );
  const businessTemplateDefinitionByEvent = useMemo(
    () => new Map(businessTemplateDefinitions.map((template) => [template.eventType, template])),
    [businessTemplateDefinitions],
  );
  const businessTemplateEventTypes = useMemo(
    () => businessTemplateDefinitions.map((template) => template.eventType),
    [businessTemplateDefinitions],
  );

  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<NotificationsTab>('business');
  const [businessTemplates, setBusinessTemplates] = useState<EmailTemplate[]>(
    () =>
      buildBusinessTemplateSet(
        [],
        businessTemplateDefinitions,
        businessTemplateDefinitionByEvent,
        preferredLanguage,
      ),
  );
  const [systemTemplates, setSystemTemplates] = useState<EmailTemplate[]>([]);

  // Accordion help states
  const [showHelpCompleted, setShowHelpCompleted] = useState(false);
  const [showHelpManual, setShowHelpManual] = useState(false);

  useEffect(() => {
    void loadTemplates();
  }, [isOwner, preferredLanguage, businessTemplateDefinitions]);

  async function loadTemplates() {
    setLoading(true);
    try {
      if (isDemoMode) {
        const businessData = readDemoTemplates('business');
        const systemData = readDemoTemplates('system');
        if (isOwner) {
          setSystemTemplates(systemData);
        }
        setBusinessTemplates(
          buildBusinessTemplateSet(
            businessData,
            businessTemplateDefinitions,
            businessTemplateDefinitionByEvent,
            preferredLanguage,
          ),
        );
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

      const languageCandidates = preferredLanguage === 'pt' ? ['pt'] : [preferredLanguage, 'pt'];
      const { data: businessData, error: businessError } = await supabase
        .from('email_templates')
        .select('*')
        .in('event_type', businessTemplateEventTypes)
        .in('language', languageCandidates);

      if (businessError && businessError.code !== 'PGRST116') {
        throw businessError;
      }

      setBusinessTemplates(
        buildBusinessTemplateSet(
          businessData || [],
          businessTemplateDefinitions,
          businessTemplateDefinitionByEvent,
          preferredLanguage,
        ),
      );
    } catch (error) {
      console.error('Error loading templates:', error);
      setBusinessTemplates(
        buildBusinessTemplateSet(
          [],
          businessTemplateDefinitions,
          businessTemplateDefinitionByEvent,
          preferredLanguage,
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  async function persistDemoTemplate(payload: {
    template: EmailTemplate;
    subject: string;
    htmlBody: string;
    isSystem: boolean;
  }) {
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
      language: payload.isSystem ? undefined : preferredLanguage,
    };

    const nextTemplates = [
      ...currentTemplates.filter(
        (template) => template.id !== nextTemplate.id && template.event_type !== nextTemplate.event_type,
      ),
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
        language: isSystemContext ? undefined : preferredLanguage,
      };

      writeDemoTemplates(scope, [
        ...currentTemplates.filter(
          (entry) => entry.id !== nextTemplate.id && entry.event_type !== nextTemplate.event_type,
        ),
        nextTemplate,
      ]);
      await loadTemplates();
      return;
    }

    const table = isSystemContext ? 'system_email_templates' : 'email_templates';

    if (template.isVirtual) {
      try {
        const payload = {
          event_type: template.event_type,
          name: template.name,
          subject: template.subject,
          html_body: template.html_body,
          active: !template.active,
          ...(isSystemContext ? {} : { language: preferredLanguage }),
        };

        const { error } = await supabase.from(table).insert(payload);
        if (error) throw error;
        await loadTemplates();
      } catch (error) {
        console.error('Error toggling virtual template:', error);
      }
      return;
    }

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

  function renderTemplateRow(template: EmailTemplate, isSystem: boolean) {
    const definition = !isSystem ? businessTemplateDefinitionByEvent.get(template.event_type) : null;
    const isActive = template.active;

    return (
      <div
        key={template.id}
        onClick={() => handleEdit(template)}
        className="group flex cursor-pointer flex-col gap-4 rounded-2xl border border-transparent p-4 transition-all duration-300 hover:border-white/5 hover:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all duration-300 ${
            isActive
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
              : 'bg-white/5 border-white/10 text-gray-500'
          }`}>
            <Mail className="w-5.5 h-5.5" />
          </div>

          <div className="text-left">
            <span className={`block text-[8px] font-black uppercase tracking-widest font-mono leading-none mb-1 ${
              isActive ? 'text-emerald-400' : 'text-gray-500'
            }`}>
              {isSystem ? 'Sistema' : (template.event_type === 'ACCESS_GRANTED' ? 'Acesso Manual' : 'Pós-Compra')}
            </span>
            <h4 className="text-sm font-bold text-white transition-colors group-hover:text-primary leading-tight">
              {template.name}
            </h4>
            <p className="text-[11px] text-gray-400 mt-1 leading-normal max-w-[200px] sm:max-w-xs lg:max-w-md line-clamp-1 font-medium">
              {isSystem ? template.subject : (definition?.purpose || t('notifications.business.default_purpose'))}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 sm:justify-start" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => toggleStatus(template, isSystem)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isActive ? 'bg-emerald-500' : 'bg-gray-800'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                isActive ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>

          <button
            onClick={() => handleEdit(template)}
            className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-gray-400 group-hover:text-white group-hover:border-white/20 transition-all duration-300 hover:bg-white/5"
          >
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    );
  }

  function renderBusinessView() {
    return (
      <div className="mx-auto max-w-2xl space-y-6 animate-in fade-in duration-500 sm:space-y-8">

        {/* Main Glass Card inspired by mockup */}
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0C0C14] p-5 shadow-2xl sm:rounded-[2.5rem] sm:p-8">
          {/* Glass light reflection ray */}
          <div className="absolute -top-16 -left-16 w-44 h-44 bg-white/5 rounded-full blur-3xl pointer-events-none" />

          {/* Dash Indicators at the top */}
          <div className="flex justify-center gap-1.5 mb-8">
            <div className="w-8 h-1 rounded-full bg-primary" />
            <div className="w-8 h-1 rounded-full bg-white/10" />
            <div className="w-8 h-1 rounded-full bg-white/10" />
            <div className="w-8 h-1 rounded-full bg-white/10" />
            <div className="w-8 h-1 rounded-full bg-white/10" />
          </div>

          {/* Central Illustration Header */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-b from-white/10 to-white/5 border border-white/10 flex items-center justify-center shadow-xl mb-4 group hover:scale-105 transition-transform duration-300">
              <Layers className="w-9 h-9 text-white animate-pulse-slow" />
            </div>
            <h3 className="text-xl font-portal-display text-white uppercase italic tracking-tight mb-1">
              Escolha o Template
            </h3>
            <p className="text-xs text-gray-400 max-w-xs font-medium">
              Selecione o fluxo pós-venda ou controle de acesso que deseja gerenciar.
            </p>

            {/* Discreet inline help toggles */}
            <div className="mt-4 flex flex-col justify-center gap-2.5 sm:flex-row sm:flex-wrap">
              <button
                onClick={() => {
                  setShowHelpCompleted(!showHelpCompleted);
                  setShowHelpManual(false);
                }}
                className={`flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold transition-all sm:w-auto ${
                  showHelpCompleted
                    ? 'bg-primary/15 border border-primary/30 text-primary shadow-[0_0_10px_rgba(138,43,226,0.1)]'
                    : 'bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-white/20'
                }`}
              >
                <Info className="w-3.5 h-3.5" />
                Como Funciona: Compra Aprovada
              </button>
              <button
                onClick={() => {
                  setShowHelpManual(!showHelpManual);
                  setShowHelpCompleted(false);
                }}
                className={`flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold transition-all sm:w-auto ${
                  showHelpManual
                    ? 'bg-blue-500/15 border border-blue-500/30 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.1)]'
                    : 'bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-white/20'
                }`}
              >
                <Info className="w-3.5 h-3.5" />
                Como Funciona: Acesso Manual
              </button>
            </div>

            {/* Explanation Boxes */}
            {showHelpCompleted && (
              <div className="mt-4 p-4 rounded-2xl bg-primary/5 border border-primary/20 text-xs text-gray-300 text-left leading-relaxed animate-in slide-in-from-top-2 duration-200">
                Compra aprovada funciona como fallback quando não existe um e-mail específico de entrega. Entrega direta e área de membros substituem a confirmação genérica e enviam apenas os acessos reais gerados no servidor.
              </div>
            )}

            {showHelpManual && (
              <div className="mt-4 p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20 text-xs text-gray-300 text-left leading-relaxed animate-in slide-in-from-top-2 duration-200">
                Acesso manual de aluno é um fluxo separado do pós-compra. Ele só entra quando você reenvia manualmente o acesso de um membro.
              </div>
            )}
          </div>

          {/* Rows List */}
          <div className="space-y-2 border-t border-white/5 pt-6">
            {businessTemplates.map((template) => renderTemplateRow(template, false))}
          </div>
        </div>
      </div>
    );
  }

  function renderSystemTemplateGrid(items: EmailTemplate[]) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 animate-in fade-in duration-500 sm:space-y-8">
        {/* Main Glass Card */}
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0C0C14] p-5 shadow-2xl sm:rounded-[2.5rem] sm:p-8">
          {/* Glass light reflection ray */}
          <div className="absolute -top-16 -left-16 w-44 h-44 bg-white/5 rounded-full blur-3xl pointer-events-none" />

          {/* Dash Indicators at the top */}
          <div className="flex justify-center gap-1.5 mb-8">
            <div className="w-8 h-1 rounded-full bg-primary" />
            <div className="w-8 h-1 rounded-full bg-white/10" />
            <div className="w-8 h-1 rounded-full bg-white/10" />
            <div className="w-8 h-1 rounded-full bg-white/10" />
            <div className="w-8 h-1 rounded-full bg-white/10" />
          </div>

          {/* Central Folder Icon */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-b from-white/10 to-white/5 border border-white/10 flex items-center justify-center shadow-xl mb-4 group hover:scale-105 transition-transform duration-300">
              <Zap className="w-9 h-9 text-white animate-pulse-slow" />
            </div>
            <h3 className="text-xl font-portal-display text-white uppercase italic tracking-tight mb-1">
              Templates do Sistema
            </h3>
            <p className="text-xs text-gray-400 max-w-sm font-medium">
              Templates de e-mail de disparos internos e segurança da infraestrutura SAAS.
            </p>
          </div>

          {/* Rows List */}
          <div className="space-y-2 border-t border-white/5 pt-6">
            {items.map((template) => renderTemplateRow(template, true))}
            {items.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500 font-mono">
                  {t('notifications.system.empty')}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const navItems: Array<{ id: NotificationsTab; label: string; icon: React.FC<{ className?: string }>; desc: string }> = [
    {
      id: 'business',
      label: isOwner ? t('notifications.tabs.business') : t('notifications.tabs.business_user'),
      icon: Layers,
      desc: 'Templates pós-compra e entrega',
    },
    ...(isOwner
      ? [
          {
            id: 'system' as const,
            label: t('notifications.tabs.system'),
            icon: Zap,
            desc: 'Templates de infraestrutura e alertas',
          },
        ]
      : []),
    {
      id: 'push',
      label: 'Push Operacional',
      icon: Bell,
      desc: 'Notificações PWA no celular e desktop',
    },
  ];

  return (
    <Layout>
      <div className="relative mx-auto max-w-6xl space-y-6 px-4 pb-24 animate-in fade-in duration-500 sm:space-y-8 md:px-0">
        {/* Premium Design Glows */}
        <div className="absolute top-10 left-1/4 w-[500px] h-[500px] bg-primary/10 blur-[150px] rounded-full pointer-events-none -z-10 animate-pulse-slow" />
        <div className="absolute top-40 right-1/4 w-[400px] h-[400px] bg-purple-500/5 blur-[120px] rounded-full pointer-events-none -z-10" />

        {/* Dashboard-Style Title & Info Bar */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl lg:text-4xl font-portal-display text-white mb-1 leading-none uppercase italic tracking-tight">
                {t('notifications.hero.title_prefix')} <span className="text-primary font-black">{t('notifications.hero.title_highlight')}</span>
              </h1>
              <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                <p className="text-gray-400 font-medium uppercase tracking-[0.15em] text-[9px] font-mono">
                  {t('notifications.hero.badge')}
                </p>
                <div className="hidden h-1.5 w-1.5 rounded-full bg-primary/45 sm:block"></div>
                <span className="text-[9px] text-[#10B981] font-black uppercase tracking-[0.2em] font-mono">System Online</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-300 max-w-2xl leading-relaxed italic border-l border-primary/30 pl-4 font-medium">
            {isOwner ? t('notifications.hero.subtitle_owner') : t('notifications.hero.subtitle_user')}
          </p>
        </div>

        {/* Mobile Navigation Selector (Horizontal scrollable bar) */}
        <div className="lg:hidden flex overflow-x-auto gap-2 pb-4 scrollbar-none -mx-4 px-4">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${
                  isActive
                    ? item.id === 'push'
                      ? 'bg-cyan-500 border-cyan-500 text-black shadow-lg shadow-cyan-500/20'
                      : 'bg-primary border-primary text-white shadow-lg'
                    : 'bg-white/[0.02] border-white/10 text-gray-400 hover:text-white hover:border-white/20'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive && item.id === 'push' ? 'text-black' : ''}`} />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* 2-Column Asymmetric Grid Layout (Matching /admin/settings pattern) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Inner Sidebar (Desktop Navigation Buttons Stacked) */}
          <div className="hidden lg:flex lg:col-span-4 flex-col gap-3">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full text-left flex items-start gap-4 p-4 rounded-2xl border transition-all duration-300 group ${
                    isActive
                      ? item.id === 'push'
                        ? 'bg-cyan-500/10 border-cyan-400/40 text-white shadow-lg shadow-cyan-500/10'
                        : 'bg-primary/10 border-primary/40 text-white shadow-lg shadow-primary/10'
                      : 'bg-[#0C0C14] border-white/10 text-gray-400 hover:text-white hover:border-white/20 hover:bg-white/[0.03]'
                  }`}
                >
                  <div className={`p-3 rounded-xl border shrink-0 transition-all duration-300 ${
                    isActive
                      ? item.id === 'push'
                        ? 'bg-cyan-400/20 border-cyan-400/40 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                        : 'bg-primary/20 border-primary/40 text-primary shadow-[0_0_12px_rgba(138,43,226,0.3)]'
                      : 'bg-white/5 border-white/10 text-gray-400 group-hover:text-white'
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-bold leading-tight uppercase tracking-tight ${
                        isActive ? (item.id === 'push' ? 'text-cyan-300' : 'text-white font-black') : 'text-gray-200 group-hover:text-white'
                      }`}>
                        {item.label}
                      </span>
                      <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${
                        isActive ? 'translate-x-1 ' + (item.id === 'push' ? 'text-cyan-300' : 'text-primary') : 'text-gray-600 opacity-0 group-hover:opacity-100'
                      }`} />
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1 leading-relaxed font-medium">
                      {item.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Content Area */}
          <div className="lg:col-span-8 relative z-10">
            {loading ? (
              <div className="flex justify-center py-20">
                <p className="animate-pulse text-gray-400">{t('notifications.loading')}</p>
              </div>
            ) : activeTab === 'push' ? (
              <div className="animate-in fade-in duration-300">
                <PwaPushSettingsCard />
              </div>
            ) : activeTab === 'system' && isOwner ? (
              <div className="space-y-6 animate-in fade-in duration-300">
                {renderSystemTemplateGrid(systemTemplates)}
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in duration-300">
                {renderBusinessView()}
              </div>
            )}
          </div>
        </div>

        <EmailTemplateModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          template={selectedTemplate}
          onSave={handleSave}
          isSystem={activeTab === 'system' && isOwner}
          onPersist={isDemoMode ? persistDemoTemplate : undefined}
          language={preferredLanguage}
        />
      </div>
    </Layout>
  );
};

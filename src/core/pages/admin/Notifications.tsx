import React, { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCircle, Edit2, Info, Layers, Mail, XCircle, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Layout } from '../../components/Layout';
import { Button } from '../../components/ui/Button';
import { EmailTemplateModal } from '../../components/modals/EmailTemplateModal';
import { useAuth } from '../../context/AuthContext';
import { demoWorkspaceService } from '../../services/demoWorkspaceService';
import { isDemoDataRuntime } from '../../services/demoDataService';
import { supabase } from '../../services/supabase';
import { POST_PURCHASE_TEMPLATE_EVENT_TYPES } from '../../services/postPurchaseEmailTemplates';

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
type NotificationsTab = 'system' | 'business';
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

function buildBusinessTemplateDefinitions(t: TranslateFn): BusinessEmailTemplateDefinition[] {
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
    () => buildBusinessTemplateDefinitions((key, options) => t(key, options)),
    [t],
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

  useEffect(() => {
    void loadTemplates();
  }, [isOwner, preferredLanguage, businessTemplateDefinitions]);

  const postPurchaseTemplates = useMemo(
    () =>
      businessTemplates.filter((template) =>
        POST_PURCHASE_TEMPLATE_EVENT_TYPES.includes(
          template.event_type as (typeof POST_PURCHASE_TEMPLATE_EVENT_TYPES)[number],
        ),
      ),
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

  function renderStatusBadge(template: EmailTemplate) {
    if (template.isVirtual) return t('notifications.status.default');
    return template.active ? t('common.active') : t('notifications.status.fallback');
  }

  function renderSystemTemplateGrid(items: EmailTemplate[]) {
    return (
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
        {items.map((template) => (
          <div
            key={template.id}
            className="group relative overflow-hidden rounded-[2rem] border border-white/5 bg-black/40 p-8 backdrop-blur-xl transition-all duration-500 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/10"
          >
            <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary/10 blur-[60px] opacity-0 transition-opacity duration-700 group-hover:opacity-100" />

            <div className="relative z-10 mb-8 flex items-start justify-between">
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-2xl transition-all duration-500 group-hover:rotate-3 group-hover:scale-110 ${
                  template.active
                    ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 shadow-emerald-500/5'
                    : 'border border-rose-500/20 bg-rose-500/10 text-rose-400 shadow-rose-500/5'
                }`}
              >
                <Mail className="h-7 w-7" />
              </div>
              <div className="flex flex-col items-end">
                <span
                  className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] ${
                    template.active
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                      : 'border-rose-500/20 bg-rose-500/10 text-rose-400'
                  }`}
                >
                  {template.active ? t('common.active') : t('common.inactive')}
                </span>
                <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-gray-700">
                  {t('notifications.system.template_label')}
                </p>
              </div>
            </div>

            <div className="relative z-10 mb-8">
              <h3 className="mb-2 text-xl font-portal-display tracking-tight text-white transition-colors group-hover:text-primary">
                {template.name}
              </h3>
              <p className="line-clamp-2 h-[32px] text-xs font-medium leading-relaxed text-gray-500" title={template.subject}>
                {template.subject}
              </p>
            </div>

            <div className="relative z-10 flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleEdit(template)}
                className="h-12 flex-1 rounded-xl border border-white/5 bg-white/5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10"
              >
                <Edit2 className="mr-2 h-3.5 w-3.5" /> {t('notifications.actions.edit_content')}
              </Button>
              <button
                onClick={() => toggleStatus(template, true)}
                className={`flex h-12 w-12 items-center justify-center rounded-xl border transition-all ${
                  template.active
                    ? 'border-white/5 bg-rose-500/5 text-gray-700 hover:border-rose-500/20 hover:bg-rose-500/10 hover:text-rose-500'
                    : 'border-white/5 bg-emerald-500/5 text-gray-700 hover:border-emerald-500/20 hover:bg-emerald-500/10 hover:text-emerald-500'
                }`}
              >
                {template.active ? <XCircle className="h-5 w-5" /> : <CheckCircle className="h-5 w-5" />}
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="col-span-full rounded-[2.5rem] border border-dashed border-white/5 bg-white/[0.02] py-20 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-600">
              {t('notifications.system.empty')}
            </p>
          </div>
        )}
      </div>
    );
  }

  function renderBusinessCards(items: EmailTemplate[]) {
    return (
      <div className={`grid gap-6 ${items.length > 1 ? 'grid-cols-1 xl:grid-cols-3' : 'grid-cols-1'}`}>
        {items.map((template) => {
          const definition = businessTemplateDefinitionByEvent.get(template.event_type);
          const variables = definition?.variables || [];

          return (
            <div
              key={template.id}
              className="relative flex min-h-[340px] flex-col overflow-hidden rounded-[2rem] border border-white/5 bg-black/40 p-7 backdrop-blur-xl transition-all hover:border-primary/25"
            >
              <div className="flex items-start justify-between gap-4">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${
                    template.active
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                      : 'border-rose-500/20 bg-rose-500/10 text-rose-400'
                  }`}
                >
                  <Mail className="h-7 w-7" />
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] ${
                    template.active
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                      : 'border-rose-500/20 bg-rose-500/10 text-rose-400'
                  }`}
                >
                  {renderStatusBadge(template)}
                </span>
              </div>

              <div className="mt-7 space-y-3">
                <h3 className="text-xl font-portal-display tracking-tight text-white">{template.name}</h3>
                <p className="min-h-[44px] text-sm leading-relaxed text-gray-400">
                  {definition?.purpose || t('notifications.business.default_purpose')}
                </p>
                <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4 text-sm font-semibold text-white">
                  {template.subject}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {variables.map((variable) => (
                  <code
                    key={variable}
                    className="rounded-lg border border-white/5 bg-white/5 px-2.5 py-1.5 text-[10px] font-bold text-gray-400"
                  >
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
                  {t('notifications.actions.edit')}
                </Button>
                <button
                  onClick={() => toggleStatus(template, false)}
                  className={`flex h-12 w-12 items-center justify-center rounded-xl border transition-all ${
                    template.active
                      ? 'border-rose-500/20 bg-rose-500/5 text-rose-400 hover:bg-rose-500/10'
                      : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10'
                  }`}
                  title={
                    template.active
                      ? t('notifications.actions.use_system_fallback')
                      : t('notifications.actions.activate_template')
                  }
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
      <div className="animate-in space-y-8 fade-in slide-in-from-bottom-8 duration-700">
        <div className="flex max-w-4xl items-start gap-3 rounded-2xl border border-primary/10 bg-primary/5 px-6 py-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-sm leading-relaxed text-gray-300">{t('notifications.business.fallback_notice')}</p>
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-black uppercase tracking-widest text-white">
              {t('notifications.business.post_purchase_title')}
            </h2>
            <p className="mt-2 text-sm text-gray-400">{t('notifications.business.post_purchase_subtitle')}</p>
          </div>
          {renderBusinessCards(postPurchaseTemplates)}
        </div>

        <div className="space-y-4">
          <div className="flex max-w-4xl items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-6 py-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
            <p className="text-sm leading-relaxed text-gray-300">{t('notifications.business.manual_access_notice')}</p>
          </div>
          {renderBusinessCards(manualAccessTemplates)}
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <div className="relative -mx-6 -mt-6 min-h-[60vh] overflow-hidden rounded-b-[3rem] px-6 pb-24 pt-12">
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#05050A]/0 via-[#05050A]/40 to-[#05050A]" />

        <div className="relative z-10 mb-12 flex w-full flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <div className="animate-in mb-4 flex items-center gap-3 fade-in slide-in-from-left-4 duration-500">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 shadow-lg shadow-primary/5">
                <Bell className="h-6 w-6 text-primary" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
                {t('notifications.hero.badge')}
              </span>
            </div>
            <h1 className="animate-in mb-4 font-portal-display text-5xl italic leading-none tracking-tighter text-white fade-in slide-in-from-left-6 duration-700 md:text-7xl">
              {t('notifications.hero.title_prefix')} <br />
              <span className="text-primary drop-shadow-[0_0_30px_rgba(var(--primary-rgb),0.3)]">
                {t('notifications.hero.title_highlight')}
              </span>
            </h1>
            <p className="animate-in max-w-xl text-sm font-medium text-gray-400 fade-in slide-in-from-left-8 duration-1000 md:text-base">
              {isOwner ? t('notifications.hero.subtitle_owner') : t('notifications.hero.subtitle_user')}
            </p>
          </div>

          <div className="animate-in flex items-center gap-4 fade-in slide-in-from-right-4 duration-700">
            <div className="min-w-[180px] rounded-3xl border border-white/5 bg-white/5 p-6 backdrop-blur-xl">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-gray-700">
                {t('notifications.hero.status_label')}
              </p>
              <div className="flex items-center gap-3">
                <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]" />
                <span className="text-sm font-black uppercase tracking-tight text-white">
                  {t('notifications.hero.status_online')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {isOwner && (
          <div className="animate-in relative z-10 flex w-fit gap-1 rounded-2xl border border-white/5 bg-white/5 p-1.5 backdrop-blur-md fade-in slide-in-from-bottom-4 duration-500">
            {[
              { id: 'system' as const, label: t('notifications.tabs.system'), icon: Zap },
              { id: 'business' as const, label: t('notifications.tabs.business'), icon: Layers },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-xl px-6 py-3 text-[10px] font-black tracking-widest transition-all duration-300 ${
                  activeTab === tab.id
                    ? 'translate-y-[-1px] bg-primary text-white shadow-lg shadow-primary/20'
                    : 'text-gray-500 hover:bg-white/5 hover:text-white'
                }`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative z-10 -mt-12">
        {loading ? (
          <div className="flex justify-center py-20">
            <p className="animate-pulse text-gray-400">{t('notifications.loading')}</p>
          </div>
        ) : isOwner ? (
          <div className="space-y-6">
            {activeTab === 'system' ? (
              <div>
                <div className="animate-in mb-8 flex w-fit items-center gap-3 rounded-2xl border border-primary/10 bg-primary/5 px-6 py-3 fade-in duration-1000">
                  <Info className="h-4 w-4 text-primary" />
                  <p className="text-[10px] font-black uppercase tracking-[0.1em] text-primary">
                    {t('notifications.system.flow_banner')}
                  </p>
                </div>
                {renderSystemTemplateGrid(systemTemplates)}
              </div>
            ) : (
              <div>
                <div className="animate-in mb-8 flex w-fit items-center gap-3 rounded-2xl border border-blue-500/10 bg-blue-500/5 px-6 py-3 fade-in duration-1000">
                  <Info className="h-4 w-4 text-blue-400" />
                  <p className="text-[10px] font-black uppercase tracking-[0.1em] text-blue-400">
                    {t('notifications.business.flow_banner')}
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
        language={preferredLanguage}
      />
    </Layout>
  );
};

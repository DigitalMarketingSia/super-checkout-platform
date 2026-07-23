import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Save, Loader2, Info, Eye, Code, Type } from 'lucide-react';
import Editor from 'react-simple-wysiwyg';
import { supabase } from '../../services/supabase';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { sanitizeTranslationHtml } from '../../utils/sanitize';
import { Button } from '../ui/Button';

interface EmailTemplate {
  id: string;
  event_type: string;
  name: string;
  subject: string;
  html_body: string;
  active: boolean;
  isVirtual?: boolean;
}

interface EmailTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: EmailTemplate | null;
  onSave: () => void;
  isSystem?: boolean;
  onPersist?: (payload: { template: EmailTemplate; subject: string; htmlBody: string; isSystem: boolean }) => Promise<void> | void;
  language?: string;
}

const EVENT_VARIABLES: Record<string, string[]> = {
  ORDER_COMPLETED: ['{{order_id}}', '{{customer_name}}', '{{product_names}}', '{{business_name}}'],
  ORDER_DIRECT_DELIVERY: ['{{order_id}}', '{{customer_name}}', '{{product_names}}', '{{business_name}}', '{{deliverables_html}}', '{{deliverables_text}}'],
  ORDER_MEMBER_ACCESS: ['{{order_id}}', '{{customer_name}}', '{{product_names}}', '{{business_name}}', '{{deliverables_html}}', '{{deliverables_text}}'],
  ACCESS_GRANTED: ['{{name}}', '{{email}}', '{{members_area_url}}'],
  MEMBER_INVITATION: ['{{customer_name}}', '{{member_area_name}}', '{{access_url}}', '{{business_name}}'],
  MEMBER_MAGIC_LINK: ['{{customer_name}}', '{{member_area_name}}', '{{access_url}}', '{{business_name}}'],
  MEMBER_PASSWORD_SETUP: ['{{customer_name}}', '{{member_area_name}}', '{{access_url}}', '{{business_name}}'],
  SYSTEM_ORDER_COMPLETED: ['{{portal_url}}', '{{license_key}}', '{{plan_name}}', '{{customer_name}}', '{{order_id}}'],
  SYSTEM_ACCESS_GRANTED: ['{{portal_url}}', '{{customer_name}}'],
  WELCOME_FREE: ['{{name}}', '{{portal_url}}'],
  UPGRADE_UNLIMITED: ['{{name}}', '{{support_url}}'],
  UPGRADE_PARTNER: ['{{name}}', '{{partner_portal_url}}'],
};

export const EmailTemplateModal: React.FC<EmailTemplateModalProps> = ({
  isOpen,
  onClose,
  template,
  onSave,
  isSystem = false,
  onPersist,
  language = 'pt',
}) => {
  const { t } = useTranslation(['admin', 'common']);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'visual' | 'code' | 'preview'>('visual');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (template) {
      setSubject(template.subject);
      setBody(template.html_body);
    }
  }, [template]);

  if (!isOpen || !template) return null;

  const availableVariables =
    EVENT_VARIABLES[template.event_type] ||
    (isSystem ? EVENT_VARIABLES.SYSTEM_ORDER_COMPLETED : EVENT_VARIABLES.ORDER_COMPLETED);
  const isDeliverablesTemplate =
    template.event_type === 'ORDER_DIRECT_DELIVERY' || template.event_type === 'ORDER_MEMBER_ACCESS';
  const isPurchaseConfirmationTemplate = template.event_type === 'ORDER_COMPLETED';

  const insertVariable = (variable: string) => {
    if (viewMode === 'code') {
      if (!textareaRef.current) return;
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const before = body.substring(0, start);
      const after = body.substring(end);
      setBody(before + variable + after);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + variable.length;
        }
      }, 0);
    } else if (viewMode === 'visual') {
      setBody(body + ' ' + variable);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      if (onPersist) {
        await onPersist({
          template,
          subject,
          htmlBody: body,
          isSystem,
        });
        onSave();
        return;
      }

      const table = isSystem ? 'system_email_templates' : 'email_templates';

      if (template.isVirtual) {
        const payload = {
          event_type: template.event_type,
          name: template.name,
          subject,
          html_body: body,
          active: true,
          ...(isSystem ? {} : { language }),
        };

        const { error } = await supabase.from(table).insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from(table)
          .update({
            subject,
            html_body: body,
            updated_at: new Date().toISOString(),
          })
          .eq('id', template.id);

        if (error) throw error;
      }

      onSave();
    } catch (error) {
      console.error('Error updating/creating template:', error);
      alert(t('email_template_modal.errors.save'));
    } finally {
      setLoading(false);
    }
  };

  const getPreviewHtml = () => {
    let preview = body;
    const dummyData: Record<string, string> = {
      '{{order_id}}': '12345',
      '{{customer_name}}': t('email_template_modal.preview.mock.customer_name'),
      '{{product_names}}': t('email_template_modal.preview.mock.product_names'),
      '{{business_name}}': t('email_template_modal.preview.mock.business_name'),
      '{{deliverables_html}}': `<div style="border:1px solid #d1d5db;border-radius:10px;padding:16px;"><strong>${t('email_template_modal.preview.mock.product_names')}</strong><p>${t('email_template_modal.preview.mock.deliverable_hint')}</p><a href="https://demo.supercheckout.app/acesso">${t('email_template_modal.preview.mock.deliverable_cta')}</a></div>`,
      '{{deliverables_text}}': `${t('email_template_modal.preview.mock.product_names')} - ${t('email_template_modal.preview.mock.deliverable_cta')}: https://demo.supercheckout.app/acesso`,
      '{{members_area_url}}': 'https://demo.supercheckout.app',
      '{{member_area_name}}': 'Área de Membros Demo',
      '{{access_url}}': 'https://demo.supercheckout.app/app/area-demo',
      '{{portal_url}}': 'https://portal.supercheckout.app',
      '{{license_key}}': 'XXXX-XXXX-XXXX',
      '{{plan_name}}': t('email_template_modal.preview.mock.plan_name'),
      '{{name}}': t('email_template_modal.preview.mock.customer_name'),
      '{{email}}': 'joao@exemplo.com',
      '{{support_url}}': 'https://suporte.com',
    };

    Object.keys(dummyData).forEach((key) => {
      preview = preview.split(key).join(dummyData[key]);
    });

    return sanitizeTranslationHtml(preview);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm animate-in fade-in sm:items-center sm:p-4">
      <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden border border-white/10 bg-[#0C0C14] shadow-2xl animate-in zoom-in duration-300 sm:h-[95vh] sm:max-w-4xl sm:rounded-[2.5rem]">

        {/* Decorative Glow */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-[50px] pointer-events-none" />

        {/* Modal Header */}
        <div className="relative z-10 border-b border-white/5 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="mb-1.5 text-xl font-portal-display italic uppercase leading-none text-white">{t('email_template_modal.title')}</h2>
              <p className="text-xs font-mono tracking-wider text-gray-400">{template.name}</p>
            </div>

            <button onClick={onClose} className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-white/10 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* View Modes Segments Selector */}
          <div className="mt-4 flex w-full gap-1 rounded-2xl border border-white/10 bg-black/20 p-1 sm:mt-5 sm:w-fit">
            <button
              onClick={() => setViewMode('visual')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all duration-300 sm:flex-none sm:px-4 ${
                viewMode === 'visual' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Type className="h-4 w-4" /> {t('email_template_modal.view_modes.visual')}
            </button>
            <button
              onClick={() => setViewMode('code')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all duration-300 sm:flex-none sm:px-4 ${
                viewMode === 'code' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Code className="h-4 w-4" /> {t('email_template_modal.view_modes.code')}
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all duration-300 sm:flex-none sm:px-4 ${
                viewMode === 'preview' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Eye className="h-4 w-4" /> {t('email_template_modal.view_modes.preview')}
            </button>
          </div>
        </div>

        {/* Modal Scroll Content */}
        <div className="custom-scrollbar relative z-10 flex-1 space-y-5 overflow-y-auto px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:space-y-6 sm:p-6">

          {/* Variable Insert Box */}
          <div className="rounded-2xl border border-primary/20 bg-[#07070F] p-4 shadow-inner sm:p-5">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary animate-pulse" />
              <div>
                <h4 className="mb-1 text-sm font-semibold text-white">{t('email_template_modal.variables.title')}</h4>
                <p className="mb-3 text-xs text-gray-400 font-medium">{t('email_template_modal.variables.description')}</p>
                <div className="flex flex-wrap gap-2">
                  {availableVariables.map((variable) => (
                    <button
                      key={variable}
                      onClick={() => insertVariable(variable)}
                      className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-mono font-semibold text-primary transition-colors hover:bg-primary/20 hover:scale-[1.02] transition-transform"
                      title={t('email_template_modal.variables.insert_title', { variable })}
                    >
                      {variable}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {isPurchaseConfirmationTemplate && (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-xs font-medium leading-relaxed text-gray-300 sm:p-5">
              {t('email_template_modal.notices.purchase_confirmation')}
            </div>
          )}

          {isDeliverablesTemplate && (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-xs font-medium leading-relaxed text-gray-300 sm:p-5">
              {t('email_template_modal.notices.deliverables_prefix')}{' '}
              <code className="text-primary font-bold">{'{{deliverables_html}}'}</code>
              . {t('email_template_modal.notices.deliverables_suffix')}
            </div>
          )}

          <div className="space-y-6">
            {/* Subject Field */}
            <div className={viewMode === 'preview' ? 'hidden' : ''}>
              <label className="mb-1.5 block text-xs font-mono uppercase tracking-widest text-gray-400 font-bold">
                {t('email_template_modal.fields.subject_label')}
              </label>
              <input
                type="text"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="w-full rounded-2xl border border-white/[0.12] bg-[#07070F] px-4 py-3.5 text-white outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all font-sans text-sm shadow-inner"
                placeholder={t('email_template_modal.fields.subject_placeholder')}
              />
            </div>

            {/* Visual Mode (Rich Editor) */}
            {viewMode === 'visual' && (
              <div className="animate-in space-y-2 fade-in duration-300">
                <label className="block text-xs font-mono uppercase tracking-widest text-gray-400 font-bold">
                  {t('email_template_modal.fields.visual_label')}
                </label>
                <div className="min-h-[320px] overflow-hidden rounded-2xl border border-white/10 bg-white p-2 text-gray-900 shadow-lg sm:min-h-[400px]">
                  <Editor
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    containerProps={{ style: { height: '360px', border: 'none' } }}
                  />
                </div>
              </div>
            )}

            {/* HTML Code Editor Mode */}
            {viewMode === 'code' && (
              <div className="animate-in space-y-2 fade-in duration-300">
                <label className="block text-xs font-mono uppercase tracking-widest text-gray-400 font-bold">
                  {t('email_template_modal.fields.html_label')}
                </label>
                <div className="group/editor relative">
                  <textarea
                    ref={textareaRef}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    className="h-72 w-full resize-none rounded-2xl border border-white/[0.12] bg-[#07070F] px-4 py-3.5 font-mono text-xs leading-relaxed text-gray-200 shadow-inner outline-none transition-all focus:border-primary/50 focus:ring-1 focus:ring-primary/50 focus:shadow-[0_0_15px_rgba(138,43,226,0.1)] sm:h-96"
                    spellCheck={false}
                    placeholder={t('email_template_modal.fields.html_placeholder')}
                  />
                  <div className="absolute right-3 top-3 opacity-0 transition-opacity group-hover/editor:opacity-100 pointer-events-none">
                    <span className="rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-[9px] font-mono font-bold uppercase tracking-wider text-gray-400">
                      {t('email_template_modal.fields.html_badge')}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Live Preview Mode */}
            {viewMode === 'preview' && (
              <div className="animate-in flex h-full min-h-[450px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#07070F] fade-in slide-in-from-right-2 duration-300">
                <div className="flex items-center justify-between border-b border-white/5 bg-white/5 px-5 py-4">
                  <label className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-gray-300 font-bold">
                    <Eye className="h-4 w-4 text-primary animate-pulse" /> {t('email_template_modal.preview.title')}
                  </label>
                  <span className="rounded-lg bg-primary/20 border border-primary/30 px-2.5 py-0.5 text-[9px] font-mono font-black uppercase tracking-wider text-primary">
                    {t('email_template_modal.preview.badge')}
                  </span>
                </div>
                <div className="custom-scrollbar flex-1 overflow-auto p-6 bg-white rounded-b-2xl">
                  <div
                    dangerouslySetInnerHTML={{ __html: getPreviewHtml() }}
                    className="email-preview-content prose max-w-none text-gray-900"
                  />
                </div>
                <div className="border-t border-white/5 bg-yellow-500/5 p-4 rounded-b-2xl">
                  <p className="flex items-center gap-2 text-[10px] font-medium text-yellow-500/80 leading-none">
                    <Info className="h-3.5 w-3.5" /> {t('email_template_modal.preview.note')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="relative z-10 flex flex-col-reverse gap-3 border-t border-white/5 bg-black/45 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:p-6">
          <Button variant="ghost" onClick={onClose} disabled={loading} className="h-11 w-full rounded-xl px-5 text-xs font-bold text-gray-400 transition-all hover:text-white sm:w-auto">
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-xs font-bold text-white shadow-[0_4px_16px_rgba(138,43,226,0.35)] transition-all duration-300 hover:bg-primary-hover sm:w-auto"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t('email_template_modal.save')}
          </Button>
        </div>
      </div>
    </div>
  );
};

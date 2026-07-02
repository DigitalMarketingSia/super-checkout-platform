import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Save, Loader2, Info, Eye, Code, Type } from 'lucide-react';
import Editor from 'react-simple-wysiwyg';
import { supabase } from '../../services/supabase';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="flex h-[95vh] w-full max-w-4xl flex-col rounded-2xl border border-white/10 bg-[#0A0A0A] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/5 p-6">
          <div>
            <h2 className="text-xl font-bold text-white">{t('email_template_modal.title')}</h2>
            <p className="text-sm text-gray-400">{template.name}</p>
          </div>
          <div className="mr-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
            <button
              onClick={() => setViewMode('visual')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                viewMode === 'visual' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Type className="h-4 w-4" /> {t('email_template_modal.view_modes.visual')}
            </button>
            <button
              onClick={() => setViewMode('code')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                viewMode === 'code' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Code className="h-4 w-4" /> {t('email_template_modal.view_modes.code')}
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                viewMode === 'preview' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Eye className="h-4 w-4" /> {t('email_template_modal.view_modes.preview')}
            </button>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-white/5 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="custom-scrollbar flex-1 space-y-6 overflow-y-auto p-6">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <h4 className="mb-1 text-sm font-medium text-white">{t('email_template_modal.variables.title')}</h4>
                <p className="mb-2 text-xs text-gray-400">{t('email_template_modal.variables.description')}</p>
                <div className="flex flex-wrap gap-2">
                  {availableVariables.map((variable) => (
                    <button
                      key={variable}
                      onClick={() => insertVariable(variable)}
                      className="rounded border border-primary/20 bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/20"
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
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs leading-relaxed text-gray-300">
                {t('email_template_modal.notices.purchase_confirmation')}
              </p>
            </div>
          )}

          {isDeliverablesTemplate && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs leading-relaxed text-gray-300">
                {t('email_template_modal.notices.deliverables_prefix')}{' '}
                <code className="text-primary">{'{{deliverables_html}}'}</code>
                . {t('email_template_modal.notices.deliverables_suffix')}
              </p>
            </div>
          )}

          <div className="space-y-6">
            <div className={viewMode === 'preview' ? 'hidden' : ''}>
              <label className="mb-1.5 block text-sm font-medium text-gray-300">
                {t('email_template_modal.fields.subject_label')}
              </label>
              <input
                type="text"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition-all focus:ring-2 focus:ring-primary/50"
                placeholder={t('email_template_modal.fields.subject_placeholder')}
              />
            </div>

            {viewMode === 'visual' && (
              <div className="animate-in space-y-2 fade-in duration-300">
                <label className="block text-sm font-medium text-gray-300">
                  {t('email_template_modal.fields.visual_label')}
                </label>
                <div className="min-h-[400px] overflow-hidden rounded-xl bg-white text-gray-900">
                  <Editor
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    containerProps={{ style: { height: '350px', border: 'none' } }}
                  />
                </div>
              </div>
            )}

            {viewMode === 'code' && (
              <div className="animate-in space-y-2 fade-in duration-300">
                <label className="block text-sm font-medium text-gray-300">
                  {t('email_template_modal.fields.html_label')}
                </label>
                <div className="group/editor relative">
                  <textarea
                    ref={textareaRef}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    className="h-96 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-mono text-sm leading-relaxed text-gray-900 shadow-inner outline-none transition-all focus:ring-2 focus:ring-primary/50"
                    spellCheck={false}
                    placeholder={t('email_template_modal.fields.html_placeholder')}
                  />
                  <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover/editor:opacity-100">
                    <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gray-600">
                      {t('email_template_modal.fields.html_badge')}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {viewMode === 'preview' && (
              <div className="animate-in flex h-full min-h-[450px] flex-col overflow-hidden rounded-xl border border-white/5 bg-[#050505] fade-in slide-in-from-right-2 duration-300">
                <div className="flex items-center justify-between border-b border-white/5 bg-white/5 p-4">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                    <Eye className="h-4 w-4" /> {t('email_template_modal.preview.title')}
                  </label>
                  <span className="rounded bg-primary/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                    {t('email_template_modal.preview.badge')}
                  </span>
                </div>
                <div className="custom-scrollbar flex-1 overflow-auto p-8">
                  <div
                    dangerouslySetInnerHTML={{ __html: getPreviewHtml() }}
                    className="email-preview-content prose prose-invert max-w-none text-white"
                    style={{ color: 'inherit' }}
                  />
                </div>
                <div className="border-t border-white/5 bg-yellow-500/5 p-4">
                  <p className="flex items-center gap-2 text-[11px] text-yellow-500/80">
                    <Info className="h-3.5 w-3.5" /> {t('email_template_modal.preview.note')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 rounded-b-2xl border-t border-white/5 bg-black/40 p-6">
          <Button variant="ghost" onClick={onClose} disabled={loading} className="text-gray-400 hover:text-white">
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t('email_template_modal.save')}
          </Button>
        </div>
      </div>
    </div>
  );
};

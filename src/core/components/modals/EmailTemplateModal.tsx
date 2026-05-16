import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Loader2, Info, Eye, Code, Type } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { Button } from '../ui/Button';
import Editor from 'react-simple-wysiwyg';
import { sanitizeTranslationHtml } from '../../utils/sanitize';

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
}

// Variables Contract
const EVENT_VARIABLES: Record<string, string[]> = {
    // Business Events
    ORDER_COMPLETED: ['{{order_id}}', '{{customer_name}}', '{{product_names}}', '{{members_area_url}}'],
    ACCESS_GRANTED: ['{{name}}', '{{email}}', '{{members_area_url}}'],

    // System Events (Owner Only)
    SYSTEM_ORDER_COMPLETED: ['{{portal_url}}', '{{license_key}}', '{{plan_name}}', '{{customer_name}}', '{{order_id}}'],
    SYSTEM_ACCESS_GRANTED: ['{{portal_url}}', '{{customer_name}}'],
    WELCOME_FREE: ['{{name}}', '{{portal_url}}'],
    UPGRADE_UNLIMITED: ['{{name}}', '{{support_url}}'],
    UPGRADE_PARTNER: ['{{name}}', '{{partner_portal_url}}']
};

export const EmailTemplateModal: React.FC<EmailTemplateModalProps> = ({ isOpen, onClose, template, onSave, isSystem = false }) => {
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

    const availableVariables = EVENT_VARIABLES[template.event_type] ||
        (isSystem ? EVENT_VARIABLES['SYSTEM_ORDER_COMPLETED'] : EVENT_VARIABLES['ORDER_COMPLETED']);

    const insertVariable = (variable: string) => {
        if (viewMode === 'code') {
            if (!textareaRef.current) return;
            const start = textareaRef.current.selectionStart;
            const end = textareaRef.current.selectionEnd;
            const text = body;
            const before = text.substring(0, start);
            const after = text.substring(end);
            setBody(before + variable + after);
            setTimeout(() => {
                if (textareaRef.current) {
                    textareaRef.current.focus();
                    textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + variable.length;
                }
            }, 0);
        } else if (viewMode === 'visual') {
            // For react-simple-wysiwyg, it's harder to insert at cursor programmatically easily
            // So we'll append it for now or replace selection if we had selection state
            setBody(body + ' ' + variable);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const table = isSystem ? 'system_email_templates' : 'email_templates';

            if (template.isVirtual) {
                const { error } = await supabase
                    .from(table)
                    .insert({
                        event_type: template.event_type,
                        name: template.name,
                        subject: subject,
                        html_body: body,
                        active: true
                    });

                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from(table)
                    .update({
                        subject,
                        html_body: body,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', template.id);

                if (error) throw error;
            }

            onSave();
        } catch (error) {
            console.error('Error updating/creating template:', error);
            alert('Erro ao salvar template');
        } finally {
            setLoading(false);
        }
    };

    // Helper to render preview with dummy data
    const getPreviewHtml = () => {
        let preview = body;
        const dummyData: Record<string, string> = {
            '{{order_id}}': '12345',
            '{{customer_name}}': 'João Silva',
            '{{product_names}}': 'Curso Super Checkout',
            '{{members_area_url}}': 'https://demo.supercheckout.app',
            '{{portal_url}}': 'https://portal.supercheckout.app',
            '{{license_key}}': 'XXXX-XXXX-XXXX',
            '{{plan_name}}': 'Plano Pro',
            '{{name}}': 'João Silva',
            '{{email}}': 'joao@exemplo.com',
            '{{support_url}}': 'https://suporte.com'
        };

        Object.keys(dummyData).forEach(key => {
            preview = preview.split(key).join(dummyData[key]);
        });

        return sanitizeTranslationHtml(preview);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="w-full max-w-4xl bg-[#0A0A0A] border border-white/10 rounded-2xl shadow-2xl flex flex-col h-[95vh]">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/5">
                    <div>
                        <h2 className="text-xl font-bold text-white">Editar Template</h2>
                        <p className="text-sm text-gray-400">{template.name}</p>
                    </div>
                    <div className="flex items-center gap-2 mr-4 bg-white/5 p-1 rounded-xl border border-white/10">
                        <button
                            onClick={() => setViewMode('visual')}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${viewMode === 'visual' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-400 hover:text-white'}`}
                        >
                            <Type className="w-4 h-4" /> Visual
                        </button>
                        <button
                            onClick={() => setViewMode('code')}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${viewMode === 'code' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-400 hover:text-white'}`}
                        >
                            <Code className="w-4 h-4" /> Código
                        </button>
                        <button
                            onClick={() => setViewMode('preview')}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${viewMode === 'preview' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-400 hover:text-white'}`}
                        >
                            <Eye className="w-4 h-4" /> Preview
                        </button>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">

                    {/* Variables Helper */}
                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                            <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                            <div>
                                <h4 className="text-sm font-medium text-white mb-1">Injetor de Variáveis</h4>
                                <p className="text-xs text-gray-400 mb-2">Clique para inserir no editor:</p>
                                <div className="flex flex-wrap gap-2">
                                    {availableVariables.map(v => (
                                        <button
                                            key={v}
                                            onClick={() => insertVariable(v)}
                                            className="px-2.5 py-1.5 bg-primary/10 hover:bg-primary/20 rounded text-xs text-primary font-bold border border-primary/20 transition-colors"
                                            title={`Clique para inserir ${v}`}
                                        >
                                            {v}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        {/* Subject */}
                        <div className={viewMode === 'preview' ? 'hidden' : ''}>
                            <label className="block text-sm font-medium text-gray-300 mb-1.5">Assunto do E-mail</label>
                            <input
                                type="text"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                                placeholder="Ex: Seu pedido foi aprovado"
                            />
                        </div>

                        {viewMode === 'visual' && (
                            <div className="animate-in fade-in duration-300 space-y-2">
                                <label className="block text-sm font-medium text-gray-300">Mensagem (Visual)</label>
                                <div className="bg-white rounded-xl overflow-hidden min-h-[400px] text-gray-900">
                                    <Editor
                                        value={body}
                                        onChange={(e) => setBody(e.target.value)}
                                        containerProps={{ style: { height: '350px', border: 'none' } }}
                                    />
                                </div>
                            </div>
                        )}

                        {viewMode === 'code' && (
                            <div className="animate-in fade-in duration-300 space-y-2">
                                <label className="block text-sm font-medium text-gray-300">HTML do E-mail</label>
                                <div className="relative group/editor">
                                    <textarea
                                        ref={textareaRef}
                                        value={body}
                                        onChange={(e) => setBody(e.target.value)}
                                        className="w-full h-96 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 font-mono text-sm leading-relaxed focus:ring-2 focus:ring-primary/50 outline-none transition-all resize-none shadow-inner"
                                        spellCheck={false}
                                        placeholder="<h1>Olá...</h1>"
                                    />
                                    <div className="absolute top-2 right-2 opacity-0 group-hover/editor:opacity-100 transition-opacity">
                                        <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-bold uppercase">Editor HTML</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {viewMode === 'preview' && (
                            <div className="animate-in slide-in-from-right-2 fade-in duration-300 flex flex-col h-full min-h-[450px] bg-[#050505] rounded-xl border border-white/5 overflow-hidden">
                                <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
                                    <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                                        <Eye className="w-4 h-4" /> Visualização do E-mail
                                    </label>
                                    <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded font-bold uppercase tracking-wider">Preview Mode</span>
                                </div>
                                <div className="p-8 overflow-auto flex-1 custom-scrollbar">
                                    <div
                                        dangerouslySetInnerHTML={{ __html: getPreviewHtml() }}
                                        className="email-preview-content prose prose-invert max-w-none text-white"
                                        style={{ color: 'inherit' }}
                                    />
                                </div>
                                <div className="p-4 bg-yellow-500/5 border-t border-white/5">
                                    <p className="text-[11px] text-yellow-500/80 flex items-center gap-2">
                                        <Info className="w-3.5 h-3.5" /> Esta é uma prévia visual. As variáveis foram substituídas por dados fictícios.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/5 flex justify-end gap-3 bg-black/40 rounded-b-2xl">
                    <Button variant="ghost" onClick={onClose} disabled={loading} className="text-gray-400 hover:text-white">
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={loading}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Salvar Alterações
                    </Button>
                </div>
            </div>
        </div>
    );
};

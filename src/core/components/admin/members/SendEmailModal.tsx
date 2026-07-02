import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { Mail, Send, Loader2, Sparkles, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../services/supabase';

interface SendEmailModalProps {
    isOpen: boolean;
    onClose: () => void;
    userEmail: string;
    userName: string;
}

export const SendEmailModal: React.FC<SendEmailModalProps> = ({ isOpen, onClose, userEmail, userName }) => {
    const { t } = useTranslation('admin');
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [templateKey, setTemplateKey] = useState('');
    const [sending, setSending] = useState(false);

    const presets = [
        {
            id: 'welcome',
            templateKey: 'lead_welcome',
            label: t('members.modals.send_email.presets.welcome_label'),
            icon: Sparkles,
            subject: t('members.modals.send_email.presets.welcome_subject'),
            color: 'text-purple-400',
            body: t('members.modals.send_email.presets.welcome_body', { name: userName })
        },
        {
            id: 'help',
            templateKey: 'lead_setup_help',
            label: t('members.modals.send_email.presets.help_label'),
            icon: HelpCircle,
            subject: t('members.modals.send_email.presets.help_subject'),
            color: 'text-blue-400',
            body: t('members.modals.send_email.presets.help_body', { name: userName })
        }
    ];

    const resetForm = () => {
        setSubject('');
        setMessage('');
        setTemplateKey('');
    };

    const handleClose = () => {
        if (!sending) resetForm();
        onClose();
    };

    const applyPreset = (presetId: string) => {
        const preset = presets.find(p => p.id === presetId);
        if (preset) {
            setSubject(preset.subject);
            setMessage(preset.body);
            setTemplateKey(preset.templateKey);
        }
    };

    const handleSend = async () => {
        if (!templateKey) {
            toast.error(t('members.modals.send_email.select_template_error'));
            return;
        }

        try {
            setSending(true);

            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData.session?.access_token;

            const response = await fetch('/api/send-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
                },
                body: JSON.stringify({
                    to: userEmail,
                    template_key: templateKey,
                    variables: {
                        name: userName
                    }
                })
            });

            if (!response.ok) throw new Error(t('members.modals.send_email.send_error'));

            toast.success(t('members.modals.send_email.send_success'));
            resetForm();
            onClose();
        } catch (error: any) {
            toast.error(error.message || t('members.modals.send_email.send_error'));
        } finally {
            setSending(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={t('members.modals.send_email.title')}
            className="max-w-xl"
        >
            <div className="space-y-6">
                <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                        <Mail className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-white">{userName}</p>
                        <p className="text-xs text-gray-500">{userEmail}</p>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('members.modals.send_email.presets_title')}</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {presets.map((preset) => {
                            const active = templateKey === preset.templateKey;
                            return (
                                <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => applyPreset(preset.id)}
                                    className={`flex items-center gap-3 p-3 bg-black/20 hover:bg-white/5 border rounded-xl text-left transition-all group ${active ? 'border-primary/50 bg-primary/10' : 'border-white/5'}`}
                                >
                                    <div className={`w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center ${preset.color}`}>
                                        <preset.icon className="w-4 h-4" />
                                    </div>
                                    <span className="text-xs font-medium text-gray-300 group-hover:text-white">{preset.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{t('members.modals.send_email.subject')}</label>
                        <input
                            type="text"
                            value={subject}
                            readOnly
                            placeholder={t('members.modals.send_email.subject_placeholder')}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{t('members.modals.send_email.message')}</label>
                        <textarea
                            rows={6}
                            value={message}
                            readOnly
                            placeholder={t('members.modals.send_email.message_placeholder')}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:ring-2 focus:ring-primary/50 outline-none transition-all resize-none"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <Button variant="ghost" onClick={handleClose} disabled={sending}>
                        {t('members.modals.send_email.cancel')}
                    </Button>
                    <Button onClick={handleSend} disabled={sending || !templateKey} className="min-w-[140px]">
                        {sending ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Send className="w-4 h-4 text-white" />}
                        {t('members.modals.send_email.send_now')}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

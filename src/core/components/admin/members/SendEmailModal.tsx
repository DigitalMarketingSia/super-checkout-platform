import React, { useState } from 'react';
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

const PRESETS = [
    {
        id: 'welcome',
        templateKey: 'lead_welcome',
        label: 'Bem-vindo / Onboarding',
        icon: Sparkles,
        subject: 'Bem-vindo ao Super Checkout! 👋',
        color: 'text-purple-400',
        body: (name: string) => `Olá, ${name}!\n\nSeja muito bem-vindo ao Super Checkout. Estamos felizes em ter você conosco!\n\nVimos que você acabou de criar sua conta gratuita. O próximo passo é configurar seu primeiro domínio e gateway de pagamento.\n\nPrecisa de ajuda para começar? Basta responder a este email.\n\nAtenciosamente,\nEquipe Super Checkout`
    },
    {
        id: 'help',
        templateKey: 'lead_setup_help',
        label: 'Ajuda com Configuração',
        icon: HelpCircle,
        subject: 'Precisa de uma mãozinha com a configuração? 🛠️',
        color: 'text-blue-400',
        body: (name: string) => `Olá, ${name}!\n\nNotei que você ainda não finalizou a configuração do seu domínio ou gateway no Super Checkout.\n\nEssa etapa é fundamental para que você possa começar a vender. Caso esteja encontrando alguma dificuldade técnica, nossa equipe está à disposição para ajudar.\n\nPodemos marcar uma rápida conversa?\n\nAbs!`
    }
];

export const SendEmailModal: React.FC<SendEmailModalProps> = ({ isOpen, onClose, userEmail, userName }) => {
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [templateKey, setTemplateKey] = useState('');
    const [sending, setSending] = useState(false);

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
        const preset = PRESETS.find(p => p.id === presetId);
        if (preset) {
            setSubject(preset.subject);
            setMessage(preset.body(userName));
            setTemplateKey(preset.templateKey);
        }
    };

    const handleSend = async () => {
        if (!templateKey) {
            toast.error('Selecione um template aprovado');
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

            if (!response.ok) throw new Error('Falha ao enviar e-mail');

            toast.success('E-mail enviado com sucesso!');
            resetForm();
            onClose();
        } catch (error: any) {
            toast.error(error.message || 'Erro ao enviar e-mail');
        } finally {
            setSending(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Enviar Email ao Lead"
            className="max-w-xl"
        >
            <div className="space-y-6">
                {/* User Info Info */}
                <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                        <Mail className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-white">{userName}</p>
                        <p className="text-xs text-gray-500">{userEmail}</p>
                    </div>
                </div>

                {/* Presets */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Templates Rápidos</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {PRESETS.map((p) => {
                            const active = templateKey === p.templateKey;
                            return (
                                <button
                                    key={p.id}
                                    onClick={() => applyPreset(p.id)}
                                    className={`flex items-center gap-3 p-3 bg-black/20 hover:bg-white/5 border rounded-xl text-left transition-all group ${active ? 'border-primary/50 bg-primary/10' : 'border-white/5'}`}
                                >
                                    <div className={`w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center ${p.color}`}>
                                        <p.icon className="w-4 h-4" />
                                    </div>
                                    <span className="text-xs font-medium text-gray-300 group-hover:text-white">{p.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Form */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Assunto</label>
                        <input
                            type="text"
                            value={subject}
                            readOnly
                            placeholder="Selecione um template"
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Mensagem</label>
                        <textarea
                            rows={6}
                            value={message}
                            readOnly
                            placeholder="Selecione um template aprovado"
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:ring-2 focus:ring-primary/50 outline-none transition-all resize-none"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <Button variant="ghost" onClick={handleClose} disabled={sending}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSend} disabled={sending || !templateKey} className="min-w-[140px]">
                        {sending ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Send className="w-4 h-4 text-white" />}
                        Enviar Agora
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

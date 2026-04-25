import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { storage, supabase } from '../../services/storageService';
import { emailService } from '../../services/emailService';
import { Order, OrderStatus } from '../../types';
import { Check, Loader2, Key } from 'lucide-react';

interface ResendConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ResendConfigModal: React.FC<ResendConfigModalProps> = ({ isOpen, onClose }) => {
    const [apiKey, setApiKey] = useState('');
    const [senderEmail, setSenderEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [active, setActive] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadConfig();
        }
    }, [isOpen]);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const integration = await storage.getIntegration('resend');
            if (integration) {
                setApiKey(integration.config?.apiKey || '');
                setSenderEmail(integration.config?.senderEmail || '');
                setActive(integration.active);
            }
        } catch (error) {
            console.error('Error loading Resend config:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await storage.saveIntegration({
                name: 'resend',
                config: { apiKey, senderEmail },
                active: active
            });
            onClose();
        } catch (error) {
            console.error('Error saving Resend config:', error);
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        try {
            // 1. Save config first
            await storage.saveIntegration({
                name: 'resend',
                config: { apiKey, senderEmail },
                active: active
            });

            // 2. Get current user email to send tests to
            const { data: { user } } = await supabase.auth.getUser();
            const targetEmail = user?.email;

            if (!targetEmail) {
                throw new Error('Não foi possível identificar seu e-mail para envio dos testes.');
            }

            // 3. Create Mock Order
            const mockOrder: Order = {
                id: 'teste-123',
                checkout_id: 'chk_test',
                offer_id: 'offer_test',
                amount: 197.90,
                customer_email: targetEmail,
                customer_name: 'Cliente Teste',
                status: OrderStatus.PAID,
                payment_method: 'pix',
                items: [{ name: 'Produto Exemplo', price: 197.90, quantity: 1, type: 'main' }],
                created_at: new Date().toISOString()
            };

            // 4. Send the 2 relevant email types with verification
            const [approvedSent, boletoSent] = await Promise.all([
                emailService.sendPaymentApproved(mockOrder),
                emailService.sendBoletoGenerated(mockOrder, 'https://exemplo.com/boleto', '12345.67890 12345.67890 12345.67890 123456')
            ]);

            if (!approvedSent || !boletoSent) {
                throw new Error('Falha ao enviar e-mails. Verifique se a API Key está ativa e se o domínio de remetente é válido.');
            }

            alert(`Sucesso! Enviamos 2 e-mails de teste para: ${targetEmail}.`);
        } catch (error: any) {
            console.error('Test error:', error);
            alert(`Erro ao testar: ${error.message || 'Erro desconhecido'}`);
        } finally {
            setTesting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Configurar Resend"
            className="max-w-md"
        >
            <div className="space-y-6">
                <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-xl border border-gray-200 dark:border-white/10">
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-black dark:bg-white/10 rounded-lg flex items-center justify-center shrink-0">
                            <span className="text-white font-bold text-lg">R</span>
                        </div>
                        <div>
                            <h3 className="font-medium text-gray-900 dark:text-white">Resend Email API</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                Envie emails transacionais com alta entregabilidade.
                            </p>
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        API Key
                    </label>
                    <div className="relative">
                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="re_123456789..."
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-[#0f0f1a] border border-gray-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all text-gray-900 dark:text-white"
                        />
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                        Você pode gerar uma chave em <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer" className="text-primary hover:underline">resend.com/api-keys</a>
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        E-mail de Envio (Remetente)
                    </label>
                    <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 flex items-center justify-center">@</div>
                        <input
                            type="email"
                            value={senderEmail}
                            onChange={(e) => setSenderEmail(e.target.value)}
                            placeholder="ex: contato@suaempresa.com.br"
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-[#0f0f1a] border border-gray-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all text-gray-900 dark:text-white"
                        />
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                        Use um domínio verificado no Resend. Se deixar em branco, usaremos <strong>onboarding@resend.dev</strong> (apenas para testes).
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        id="active"
                        checked={active}
                        onChange={(e) => setActive(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <label htmlFor="active" className="text-sm text-gray-700 dark:text-gray-300 select-none">
                        Ativar integração
                    </label>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-gray-100 dark:border-white/5">
                    <button
                        onClick={handleTest}
                        disabled={testing || !apiKey}
                        className="text-sm text-primary hover:text-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {testing ? 'Enviando...' : 'Testar Conexão'}
                    </button>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || !apiKey}
                            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Salvando...
                                </>
                            ) : (
                                <>
                                    <Check className="w-4 h-4" />
                                    Salvar Configuração
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

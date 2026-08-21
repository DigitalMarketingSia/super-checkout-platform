import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { storage, supabase } from '../../services/storageService';
import { emailService } from '../../services/emailService';
import { isDemoDataRuntime } from '../../services/demoDataService';
import { Order, OrderStatus } from '../../types';
import { Check, Loader2, Key } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ResendConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ResendConfigModal: React.FC<ResendConfigModalProps> = ({ isOpen, onClose }) => {
    const { t } = useTranslation();
    const isDemoMode = isDemoDataRuntime();
    const [apiKey, setApiKey] = useState('');
    const [senderEmail, setSenderEmail] = useState('');
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [active, setActive] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadConfig();
        }
    }, [isOpen]);

    const loadConfig = async () => {
        try {
            const integration = await storage.getIntegration('resend');
            if (integration) {
                setApiKey(integration.config?.apiKey || '');
                setSenderEmail(integration.config?.senderEmail || '');
                setActive(integration.active);
            }
        } catch (error) {
            console.error('Error loading Resend config:', error);
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
            await storage.saveIntegration({
                name: 'resend',
                config: { apiKey, senderEmail },
                active: active
            });

            if (isDemoMode) {
                const simulatedTarget = senderEmail || 'lead.demo@supercheckout.app';
                alert(t('coverage.resend.demo_test', { email: simulatedTarget }));
                return;
            }

            const { data: { user } } = await supabase.auth.getUser();
            const targetEmail = user?.email;

            if (!targetEmail) {
                throw new Error(t('coverage.resend.target_email_error'));
            }

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

            const [approvedSent, boletoSent] = await Promise.all([
                emailService.sendPaymentApproved(mockOrder),
                emailService.sendBoletoGenerated(mockOrder, 'https://exemplo.com/boleto', '12345.67890 12345.67890 12345.67890 123456')
            ]);

            if (!approvedSent || !boletoSent) {
                throw new Error(t('coverage.resend.send_error'));
            }

            alert(t('coverage.resend.test_success', { email: targetEmail }));
        } catch (error: any) {
            console.error('Test error:', error);
            alert(t('coverage.resend.test_error', { message: error.message || t('coverage.common.unknown_error') }));
        } finally {
            setTesting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t('coverage.resend.configure')}
            className="max-w-md"
        >
            <div className="space-y-6">
                <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-xl border border-gray-200 dark:border-white/10">
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-black dark:bg-white/10 rounded-lg flex items-center justify-center shrink-0">
                            <span className="text-white font-bold text-lg">R</span>
                        </div>
                        <div>
                            <h3 className="font-medium text-gray-900 dark:text-white">{t('coverage.resend.api_title')}</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                {t('coverage.resend.api_description')}
                            </p>
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('coverage.resend.api_key')}
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
                        {t('coverage.resend.api_key_hint')} <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer" className="text-primary hover:underline">resend.com/api-keys</a>
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('coverage.resend.sender_label')}
                    </label>
                    <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 flex items-center justify-center">@</div>
                        <input
                            type="email"
                            value={senderEmail}
                            onChange={(e) => setSenderEmail(e.target.value)}
                            placeholder={t('coverage.resend.sender_placeholder')}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-[#0f0f1a] border border-gray-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all text-gray-900 dark:text-white"
                        />
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                        {t('coverage.resend.sender_hint_before')} <strong>onboarding@resend.dev</strong> {t('coverage.resend.sender_hint_after')}
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
                        {t('coverage.resend.enable')}
                    </label>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-gray-100 dark:border-white/5">
                    <button
                        onClick={handleTest}
                        disabled={testing || !apiKey}
                        className="text-sm text-primary hover:text-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {testing ? t('coverage.resend.sending') : t('coverage.resend.test_connection')}
                    </button>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                        >
                            {t('coverage.common.cancel')}
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || !apiKey}
                            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    {t('coverage.common.saving')}
                                </>
                            ) : (
                                <>
                                    <Check className="w-4 h-4" />
                                    {t('coverage.resend.save')}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

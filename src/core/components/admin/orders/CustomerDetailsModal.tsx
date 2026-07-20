import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, User, ShoppingBag, MessageCircle, FileText, Mail, Phone, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';
import { AlertModal } from '../../ui/Modal';
import { resendOrderAccessEmail } from '../../../services/orderAccessEmailService';
import { storage } from '../../../services/storageService';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';

interface CustomerProfile {
    email: string;
    name: string;
    phone?: string;
    totalSpent: number;
    orderCount: number;
    lastOrderDate: string;
    products: string[];
}

interface CustomerDetailsModalProps {
    customer: CustomerProfile | null;
    isOpen: boolean;
    onClose: () => void;
}

const resolveNumberLocale = (language: string) => (
    language.startsWith('es') ? 'es-ES' : language.startsWith('en') ? 'en-US' : 'pt-BR'
);

const resolveDefaultCurrency = (language: string) => (
    language.startsWith('es') ? 'EUR' : language.startsWith('en') ? 'USD' : 'BRL'
);

export const CustomerDetailsModal: React.FC<CustomerDetailsModalProps> = ({ customer, isOpen, onClose }) => {
    const { t, i18n } = useTranslation(['admin', 'common']);
    const [isResending, setIsResending] = useState(false);
    const [alertModal, setAlertModal] = useState<{ isOpen: boolean; title: string; message: string; variant: 'success' | 'error' | 'info' }>({
        isOpen: false,
        title: '',
        message: '',
        variant: 'info'
    });

    useBodyScrollLock(isOpen);

    if (!customer) return null;

    const numberLocale = resolveNumberLocale(i18n.language);
    const defaultCurrency = resolveDefaultCurrency(i18n.language);
    const customerProducts = customer.products ?? [];
    const customerInitial = customer.name?.trim().charAt(0).toUpperCase() || '?';

    const formatCurrency = (val: number) => new Intl.NumberFormat(numberLocale, {
        style: 'currency',
        currency: defaultCurrency,
    }).format(val);
    const formatDate = (dateStr: string) => new Intl.DateTimeFormat(numberLocale, {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
    }).format(new Date(dateStr));
    const emailService = {
        sendPaymentApproved: async (order: { id: string }) => {
            await resendOrderAccessEmail(order.id);
            return true;
        }
    };

    const openWhatsApp = () => {
        if (!customer.phone) return;
        const phone = customer.phone.replace(/\D/g, '');
        window.open(`https://wa.me/55${phone}`, '_blank');
    };

    const handleResendEmail = async () => {
        setIsResending(true);
        try {
            const orders = await storage.getOrders();
            const lastPaidOrder = orders
                .filter(order => order.customer_email === customer.email && order.status === 'paid')
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

            if (!lastPaidOrder) {
                setAlertModal({
                    isOpen: true,
                    title: t('info_title', { ns: 'common' }),
                    message: t('orders.modals.alerts.resend_missing_paid_order'),
                    variant: 'info'
                });
                return;
            }

            const success = await emailService.sendPaymentApproved(lastPaidOrder);
            if (success) {
                setAlertModal({
                    isOpen: true,
                    title: t('success_title', { ns: 'common' }),
                    message: t('orders.modals.alerts.resend_success'),
                    variant: 'success'
                });
            } else {
                throw new Error(t('orders.modals.alerts.resend_error'));
            }
        } catch (error) {
            setAlertModal({
                isOpen: true,
                title: t('error_title', { ns: 'common' }),
                message: t('orders.modals.alerts.resend_error'),
                variant: 'error'
            });
        } finally {
            setIsResending(false);
        }
    };

    return (
        <Dialog.Root open={isOpen} onOpenChange={onClose}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
                <Dialog.Content className="fixed inset-0 z-50 flex h-[100dvh] w-full flex-col overflow-hidden border border-purple-500/20 bg-[#12121A]/80 shadow-2xl outline-none backdrop-blur-xl animate-in zoom-in-95 duration-200 sm:left-[50%] sm:top-[50%] sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-2xl">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl -mr-16 -mt-16" />
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -ml-16 -mb-16" />

                    <div className="relative flex-none border-b border-white/10 bg-white/[0.02] px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] sm:p-6">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    <Dialog.Title asChild>
                                        <h2 className="text-xl font-bold text-white">{t('orders.modals.customer_details.title')}</h2>
                                    </Dialog.Title>
                                </div>
                                <p className="text-sm text-gray-500">
                                    {t('orders.modals.customer_details.customer_since', {
                                        date: formatDate(customer.lastOrderDate),
                                    })}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                                aria-label={t('close')}
                            >
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>
                    </div>

                    <div className="relative flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:p-6 space-y-6">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="p-4 rounded-xl bg-black/30 border border-purple-500/20 flex flex-col items-center text-center">
                                <div className="p-2 bg-green-500/10 rounded-full text-green-500 mb-2">
                                    <ShoppingBag className="w-5 h-5" />
                                </div>
                                <div className="text-xs text-gray-500 uppercase font-bold mb-1">{t('orders.table.total_spent')}</div>
                                <div className="text-xl font-bold text-white">{formatCurrency(customer.totalSpent)}</div>
                            </div>
                            <div className="p-4 rounded-xl bg-black/30 border border-purple-500/20 flex flex-col items-center text-center">
                                <div className="p-2 bg-blue-500/10 rounded-full text-blue-500 mb-2">
                                    <FileText className="w-5 h-5" />
                                </div>
                                <div className="text-xs text-gray-500 uppercase font-bold mb-1">{t('orders.table.orders_count')}</div>
                                <div className="text-xl font-bold text-white">{customer.orderCount}</div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                <User className="w-4 h-4 text-purple-400" /> {t('orders.modals.customer_details.contact_info')}
                            </h3>
                            <div className="bg-black/20 rounded-xl border border-purple-500/20 overflow-hidden p-4 space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-gray-500 font-bold">
                                        {customerInitial}
                                    </div>
                                    <div>
                                        <div className="font-bold text-white">{customer.name}</div>
                                        <div className="text-xs text-gray-500">{t('orders.modals.customer_details.registered_name_hint')}</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100 dark:border-white/5">
                                    <div className="flex items-center gap-2">
                                        <Mail className="w-4 h-4 text-gray-400" />
                                        <span className="text-sm text-gray-300">{customer.email}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Phone className="w-4 h-4 text-gray-400" />
                                        <span className="text-sm text-gray-300">{customer.phone || t('orders.modals.customer_details.not_informed')}</span>
                                        {customer.phone && (
                                            <button
                                                type="button"
                                                onClick={openWhatsApp}
                                                className="ml-auto text-green-500 text-xs font-bold hover:underline flex items-center gap-1"
                                                aria-label={t('orders.modals.customer_details.whatsapp_label')}
                                            >
                                                <MessageCircle className="w-3 h-3" /> {t('orders.modals.customer_details.whatsapp_label')}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                <ShoppingBag className="w-4 h-4 text-purple-400" /> {t('orders.table.acquired_products')}
                            </h3>
                            <div className="bg-black/20 rounded-xl border border-purple-500/20 overflow-hidden p-4">
                                {customerProducts.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {customerProducts.map((product, idx) => (
                                            <span key={idx} className="px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-400 text-sm border border-purple-500/20">
                                                {product}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-sm text-gray-400">{t('orders.modals.customer_details.no_products')}</div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="relative flex flex-col-reverse gap-3 border-t border-white/10 bg-white/[0.02] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:flex-row sm:items-center sm:justify-end sm:p-6">
                        <Button
                            variant="secondary"
                            onClick={handleResendEmail}
                            disabled={isResending}
                            className="w-full bg-white/5 text-white border-white/10 hover:bg-white/10 sm:w-auto"
                        >
                            {isResending ? (
                                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                                <Mail className="w-4 h-4 mr-2" />
                            )}
                            {t('orders.modals.customer_details.resend_access_email')}
                        </Button>
                        <Button variant="secondary" onClick={onClose} className="w-full border-none bg-purple-600 text-white hover:bg-purple-700 sm:w-auto">
                            {t('close')}
                        </Button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>

            <AlertModal
                isOpen={alertModal.isOpen}
                onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
                title={alertModal.title}
                message={alertModal.message}
                variant={alertModal.variant}
            />
        </Dialog.Root>
    );
};

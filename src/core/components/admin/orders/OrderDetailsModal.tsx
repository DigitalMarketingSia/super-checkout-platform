import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, User, ShoppingBag, MessageCircle, CreditCard, Calendar, Mail, FileText, CheckCircle, AlertCircle, Clock, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Order } from '../../../types';
import { Button } from '../../ui/Button';
import { AlertModal } from '../../ui/Modal';
import { resendOrderAccessEmail } from '../../../services/orderAccessEmailService';

interface OrderDetailsModalProps {
    order: Order | null;
    isOpen: boolean;
    onClose: () => void;
}

const resolveNumberLocale = (language: string) => (
    language.startsWith('es') ? 'es-ES' : language.startsWith('en') ? 'en-US' : 'pt-BR'
);

const resolveDefaultCurrency = (language: string) => (
    language.startsWith('es') ? 'EUR' : language.startsWith('en') ? 'USD' : 'BRL'
);

export const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({ order, isOpen, onClose }) => {
    const { t, i18n } = useTranslation(['admin', 'common']);
    const [isResending, setIsResending] = useState(false);
    const [alertModal, setAlertModal] = useState<{ isOpen: boolean; title: string; message: string; variant: 'success' | 'error' | 'info' }>({
        isOpen: false,
        title: '',
        message: '',
        variant: 'info'
    });

    if (!order) return null;

    const numberLocale = resolveNumberLocale(i18n.language);
    const defaultCurrency = resolveDefaultCurrency(i18n.language);
    const orderCurrency = typeof order.metadata?.payment_context?.currency === 'string' && order.metadata.payment_context.currency.trim()
        ? order.metadata.payment_context.currency.trim().toUpperCase()
        : defaultCurrency;
    const transactionId = (order as Order & { gateway_id?: string }).gateway_id || '-';
    const statusLabel = order.status === 'paid'
        ? t('orders.status.paid')
        : order.status === 'pending'
            ? t('orders.status.pending')
            : order.status === 'failed'
                ? t('orders.status.failed')
                : order.status === 'canceled'
                    ? t('orders.status.canceled')
                    : order.status === 'refunded'
                        ? t('orders.status.refunded')
                        : order.status;
    const paymentMethodLabel = order.payment_method === 'credit_card'
        ? t('orders.filters.method_credit_card')
        : order.payment_method === 'pix'
            ? t('orders.filters.method_pix')
            : order.payment_method === 'boleto'
                ? t('orders.modals.payment_methods.boleto')
                : order.payment_method === 'apple_pay'
                    ? t('orders.modals.payment_methods.apple_pay')
                    : order.payment_method === 'google_pay'
                        ? t('orders.modals.payment_methods.google_pay')
                        : order.payment_method;
    const formatCurrency = (val: number) => new Intl.NumberFormat(numberLocale, {
        style: 'currency',
        currency: orderCurrency,
    }).format(val);
    const emailService = {
        sendPaymentApproved: async (targetOrder: Order) => {
            await resendOrderAccessEmail(targetOrder.id);
            return true;
        }
    };

    const openWhatsApp = () => {
        if (!order.customer_phone) return;
        const phone = order.customer_phone.replace(/\D/g, '');
        const product = order.items?.[0]?.name || t('orders.modals.order_details.product_fallback');
        const message = t('orders.modals.order_details.whatsapp_message', {
            name: order.customer_name,
            product,
        });
        window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`, '_blank');
    };

    const handleResendEmail = async () => {
        setIsResending(true);
        try {
            const success = await emailService.sendPaymentApproved(order);
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
                <Dialog.Content className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-full max-w-2xl bg-[#12121A]/80 backdrop-blur-xl rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden outline-none animate-in zoom-in-95 duration-200 border border-purple-500/20 max-h-[90vh]">

                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl -mr-16 -mt-16" />
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -ml-16 -mb-16" />

                    <div className="relative flex-none p-6 border-b border-white/10 bg-white/[0.02] flex justify-between items-start">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <Dialog.Title asChild>
                                    <h2 className="text-xl font-bold text-white">{t('orders.modals.order_details.title')}</h2>
                                </Dialog.Title>
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                    #{order.id.slice(0, 8)}
                                </span>
                            </div>
                            <p className="text-sm text-gray-500 flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                {new Intl.DateTimeFormat(numberLocale, {
                                    dateStyle: 'medium',
                                    timeStyle: 'short',
                                }).format(new Date(order.created_at))}
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

                    <div className="relative flex-1 overflow-y-auto p-6 space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-xl bg-black/30 border border-purple-500/20">
                                <div className="text-xs text-gray-400 uppercase font-bold mb-1">{t('orders.filters.order_status')}</div>
                                <div className="flex items-center gap-2">
                                    {order.status === 'paid' ? <CheckCircle className="w-5 h-5 text-green-500" /> :
                                        order.status === 'pending' ? <Clock className="w-5 h-5 text-yellow-500" /> :
                                            <AlertCircle className="w-5 h-5 text-red-500" />}
                                    <span className={`font-bold ${order.status === 'paid' ? 'text-green-400' :
                                        order.status === 'pending' ? 'text-yellow-400' :
                                            'text-red-400'
                                        }`}>
                                        {statusLabel}
                                    </span>
                                </div>
                            </div>
                            <div className="p-4 rounded-xl bg-black/30 border border-purple-500/20">
                                <div className="text-xs text-gray-400 uppercase font-bold mb-1">{t('orders.modals.order_details.payment')}</div>
                                <div className="flex items-center gap-2 text-white font-medium capitalize">
                                    <CreditCard className="w-5 h-5 text-gray-400" />
                                    {paymentMethodLabel}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                <User className="w-4 h-4 text-purple-400" /> {t('orders.modals.order_details.customer_info')}
                            </h3>
                            <div className="bg-black/20 rounded-xl border border-purple-500/20 overflow-hidden">
                                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <div className="text-xs text-gray-500 mb-1">{t('orders.modals.order_details.full_name')}</div>
                                        <div className="font-medium text-white">{order.customer_name}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-gray-500 mb-1">{t('orders.modals.order_details.email')}</div>
                                        <div className="font-medium text-white flex items-center gap-2">
                                            {order.customer_email}
                                            <button
                                                type="button"
                                                onClick={() => void navigator.clipboard?.writeText(order.customer_email)}
                                                className="text-gray-400 hover:text-primary transition-colors"
                                                title={t('orders.modals.order_details.copy_email_title')}
                                                aria-label={t('orders.modals.order_details.copy_email_title')}
                                            >
                                                <FileText className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-gray-500 mb-1">{t('orders.modals.order_details.tax_id')}</div>
                                        <div className="font-medium text-white">{order.customer_cpf || '-'}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-gray-500 mb-1">{t('orders.modals.order_details.phone')}</div>
                                        <div className="font-medium text-white flex items-center gap-2">
                                            {order.customer_phone || '-'}
                                            {order.customer_phone && (
                                                <button
                                                    type="button"
                                                    onClick={openWhatsApp}
                                                    className="bg-green-500/10 hover:bg-green-500/20 text-green-500 p-1 rounded-md transition-colors"
                                                    title={t('orders.modals.order_details.whatsapp_title')}
                                                    aria-label={t('orders.modals.order_details.whatsapp_title')}
                                                >
                                                    <MessageCircle className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                <ShoppingBag className="w-4 h-4 text-purple-400" /> {t('orders.modals.order_details.items_title')}
                            </h3>
                            <div className="bg-black/20 rounded-xl border border-purple-500/20 overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 dark:bg-white/5 border-b border-gray-100 dark:border-white/5">
                                        <tr>
                                            <th className="px-4 py-3 font-medium text-gray-500">{t('orders.table.product')}</th>
                                            <th className="px-4 py-3 font-medium text-gray-500 text-right">{t('orders.modals.order_details.quantity_short')}</th>
                                            <th className="px-4 py-3 font-medium text-gray-500 text-right">{t('orders.modals.order_details.total')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                                        {order.items?.map((item, idx) => (
                                            <tr key={idx}>
                                                <td className="px-4 py-3 font-medium text-white">{item.name}</td>
                                                <td className="px-4 py-3 text-gray-500 text-right">{item.quantity}</td>
                                                <td className="px-4 py-3 text-white text-right font-medium">{formatCurrency(item.price)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-gray-50/50 dark:bg-white/5 border-t border-gray-100 dark:border-white/5">
                                        <tr>
                                            <td colSpan={2} className="px-4 py-3 font-bold text-white text-right">{t('orders.modals.order_details.order_total')}</td>
                                            <td className="px-4 py-3 font-bold text-purple-400 text-2xl text-right">{formatCurrency(order.total ?? order.amount)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div className="relative p-6 border-t border-white/10 bg-white/[0.02] flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="text-xs text-gray-400">
                            {t('orders.modals.order_details.transaction_id')}: <span className="font-mono select-all">{transactionId}</span>
                        </div>
                        <div className="flex gap-3">
                            {order.status === 'paid' && (
                                <Button
                                    variant="secondary"
                                    onClick={handleResendEmail}
                                    disabled={isResending}
                                    className="bg-white/5 hover:bg-white/10 text-white border-white/10"
                                >
                                    {isResending ? (
                                        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                                    ) : (
                                        <Mail className="w-4 h-4 mr-2" />
                                    )}
                                    {t('orders.modals.order_details.resend_access_email')}
                                </Button>
                            )}
                            <Button variant="secondary" onClick={onClose} className="bg-purple-600 hover:bg-purple-700 text-white border-none">
                                {t('close')}
                            </Button>
                        </div>
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

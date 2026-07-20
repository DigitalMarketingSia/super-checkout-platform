import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, User, ShoppingBag, MessageCircle, CreditCard, Calendar, Mail, FileText, CheckCircle, AlertCircle, Clock, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Order } from '../../../types';
import { Button } from '../../ui/Button';
import { AlertModal } from '../../ui/Modal';
import { resendOrderAccessEmail } from '../../../services/orderAccessEmailService';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';

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

    useBodyScrollLock(isOpen);

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
    const orderMetadata = order.metadata && typeof order.metadata === 'object' ? order.metadata : {};
    const rawEmailTypes = Array.isArray(orderMetadata.order_completed_email_types)
        ? orderMetadata.order_completed_email_types
        : [];
    const inferredEmailTypes = [
        ...(orderMetadata.purchase_confirmation_email_sent_at ? ['purchase_confirmation'] : []),
        ...(orderMetadata.direct_delivery_email_sent_at ? ['direct_delivery'] : []),
        ...(orderMetadata.member_access_email_sent_at ? ['member_access'] : []),
    ];
    const emailTypes = Array.from(new Set([...rawEmailTypes, ...inferredEmailTypes]));
    const deliverableSnapshot = Array.isArray(orderMetadata.order_deliverables_email_snapshot)
        ? orderMetadata.order_deliverables_email_snapshot
        : [];
    const lastEmailSentAt = typeof orderMetadata.order_completed_email_sent_at === 'string'
        ? orderMetadata.order_completed_email_sent_at
        : null;
    const emailSource = typeof orderMetadata.order_completed_email_source === 'string'
        ? orderMetadata.order_completed_email_source
        : null;
    const formatDateTime = (dateStr: string) => new Intl.DateTimeFormat(numberLocale, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(dateStr));
    const getEmailTypeLabel = (type: string) => {
        switch (type) {
            case 'purchase_confirmation':
                return t('orders.modals.order_details.email_type_purchase_confirmation');
            case 'direct_delivery':
                return t('orders.modals.order_details.email_type_direct_delivery');
            case 'member_access':
                return t('orders.modals.order_details.email_type_member_access');
            default:
                return type;
        }
    };
    const getDeliverableTypeLabel = (type: string) => {
        switch (type) {
            case 'member_area':
                return t('orders.modals.order_details.deliverable_member_area');
            case 'external_link':
                return t('orders.modals.order_details.deliverable_external_link');
            case 'file_download':
                return t('orders.modals.order_details.deliverable_file_download');
            default:
                return type;
        }
    };
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
                <Dialog.Content className="fixed inset-0 z-50 flex h-[100dvh] w-full flex-col overflow-hidden border border-purple-500/20 bg-[#12121A]/80 shadow-2xl outline-none backdrop-blur-xl animate-in zoom-in-95 duration-200 sm:left-[50%] sm:top-[50%] sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-2xl">

                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl -mr-16 -mt-16" />
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -ml-16 -mb-16" />

                    <div className="relative flex-none border-b border-white/10 bg-white/[0.02] px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] sm:p-6">
                        <div className="flex items-start justify-between gap-4">
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
                    </div>

                    <div className="relative flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:p-6 space-y-6">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                                <div className="overflow-x-auto">
                                <table className="w-full min-w-[480px] text-sm text-left">
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

                        <div className="space-y-3">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                <Mail className="w-4 h-4 text-purple-400" /> {t('orders.modals.order_details.email_delivery_title')}
                            </h3>
                            <div className="bg-black/20 rounded-xl border border-purple-500/20 overflow-hidden p-4 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                                        <div className="text-xs text-gray-500 mb-2">{t('orders.modals.order_details.email_delivery_status')}</div>
                                        <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${
                                            emailTypes.length > 0
                                                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                                                : 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400'
                                        }`}>
                                            {emailTypes.length > 0 ? (
                                                <>
                                                    <CheckCircle className="w-3.5 h-3.5" />
                                                    {t('orders.modals.order_details.email_delivery_sent')}
                                                </>
                                            ) : (
                                                <>
                                                    <Clock className="w-3.5 h-3.5" />
                                                    {t('orders.modals.order_details.email_delivery_not_sent')}
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                                        <div className="text-xs text-gray-500 mb-2">{t('orders.modals.order_details.email_delivery_last_sent')}</div>
                                        <div className="font-medium text-white text-sm">
                                            {lastEmailSentAt ? formatDateTime(lastEmailSentAt) : t('orders.modals.order_details.email_delivery_pending')}
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                                        <div className="text-xs text-gray-500 mb-2">{t('orders.modals.order_details.email_delivery_source')}</div>
                                        <div className="font-medium text-white text-sm uppercase">
                                            {emailSource || '-'}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <div className="text-xs text-gray-500 mb-2">{t('orders.modals.order_details.email_delivery_types')}</div>
                                    {emailTypes.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {emailTypes.map((type) => (
                                                <span
                                                    key={type}
                                                    className="px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-300 text-xs border border-purple-500/20"
                                                >
                                                    {getEmailTypeLabel(String(type))}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-sm text-gray-400">{t('orders.modals.order_details.email_delivery_pending')}</div>
                                    )}
                                </div>

                                <div>
                                    <div className="text-xs text-gray-500 mb-2">{t('orders.modals.order_details.email_delivery_snapshot')}</div>
                                    {deliverableSnapshot.length > 0 ? (
                                        <div className="space-y-2">
                                            {deliverableSnapshot.map((deliverable: any, index: number) => (
                                                <div
                                                    key={`${deliverable?.product_id || 'deliverable'}-${index}`}
                                                    className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
                                                >
                                                    <div className="font-medium text-white">
                                                        {deliverable?.title || t('orders.modals.order_details.product_fallback')}
                                                    </div>
                                                    <div className="mt-1 text-xs uppercase tracking-widest text-gray-500">
                                                        {getDeliverableTypeLabel(String(deliverable?.delivery_type || ''))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-sm text-gray-400">{t('orders.modals.order_details.email_delivery_no_snapshot')}</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="relative flex flex-col gap-3 border-t border-white/10 bg-white/[0.02] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                        <div className="text-xs text-gray-400">
                            {t('orders.modals.order_details.transaction_id')}: <span className="font-mono select-all">{transactionId}</span>
                        </div>
                        <div className="flex flex-col-reverse gap-3 sm:flex-row">
                            {order.status === 'paid' && (
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
                                    {t('orders.modals.order_details.resend_access_email')}
                                </Button>
                            )}
                            <Button variant="secondary" onClick={onClose} className="w-full border-none bg-purple-600 text-white hover:bg-purple-700 sm:w-auto">
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

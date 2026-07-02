import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import { useTranslation } from 'react-i18next';
import { ConfirmModal, AlertModal } from '../../ui/Modal';
import { X, ShoppingBag, Clock, FileText, Activity, Shield, Mail, Calendar, Key, Ban } from 'lucide-react';
import { memberService } from '../../../services/memberService';
import { emailService } from '../../../services/emailService';
import { ActivityLog } from '../../../types';

interface MemberDetailsModalProps {
    member: any;
    isOpen: boolean;
    onClose: () => void;
    memberAreaId?: string;
    onUpdate?: () => void;
}

const resolveNumberLocale = (language: string) => (
    language.startsWith('es') ? 'es-ES' : language.startsWith('en') ? 'en-US' : 'pt-BR'
);

const resolveDefaultCurrency = (language: string) => (
    language.startsWith('es') ? 'EUR' : language.startsWith('en') ? 'USD' : 'BRL'
);

export const MemberDetailsModal: React.FC<MemberDetailsModalProps> = ({ member, isOpen, onClose, memberAreaId, onUpdate }) => {
    const { t, i18n } = useTranslation(['admin', 'common']);
    const [activeTab, setActiveTab] = useState('overview');
    const [details, setDetails] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [currentStatus, setCurrentStatus] = useState<'active' | 'suspended' | 'disabled'>(member?.status || 'active');
    const [availableProducts, setAvailableProducts] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; action: string; productId?: string }>({ isOpen: false, action: '' });
    const [alertModal, setAlertModal] = useState<{ isOpen: boolean; title: string; message: string; variant: 'success' | 'error' }>({
        isOpen: false,
        title: '',
        message: '',
        variant: 'success'
    });
    const [isProcessing, setIsProcessing] = useState(false);

    const memberUserId = member?.user_id || member?.id;
    const memberName = member?.name || '-';
    const memberEmail = member?.email || '-';
    const memberInitial = memberName.trim().charAt(0).toUpperCase() || '?';
    const numberLocale = resolveNumberLocale(i18n.language);
    const defaultCurrency = resolveDefaultCurrency(i18n.language);

    const formatCurrency = (value: number, currency = defaultCurrency) => new Intl.NumberFormat(numberLocale, {
        style: 'currency',
        currency,
    }).format(value);

    const formatShortDate = (value?: string | null) => (
        value
            ? new Intl.DateTimeFormat(numberLocale, { dateStyle: 'short' }).format(new Date(value))
            : '-'
    );

    const formatDateTime = (value?: string | null) => (
        value
            ? new Intl.DateTimeFormat(numberLocale, {
                dateStyle: 'short',
                timeStyle: 'short',
            }).format(new Date(value))
            : '-'
    );

    const formatMemberSince = (value?: string | null) => (
        value
            ? new Intl.DateTimeFormat(numberLocale, { dateStyle: 'medium' }).format(new Date(value))
            : '-'
    );

    const formatRecentActivityDate = (value?: string | null) => (
        value
            ? new Intl.DateTimeFormat(numberLocale, {
                dateStyle: 'long',
                timeStyle: 'short',
            }).format(new Date(value))
            : '-'
    );

    const resolveOrderCurrency = (order: any) => (
        typeof order?.metadata?.payment_context?.currency === 'string' && order.metadata.payment_context.currency.trim()
            ? order.metadata.payment_context.currency.trim().toUpperCase()
            : defaultCurrency
    );

    const translateOrderStatus = (status: string) => (
        status === 'paid'
            ? t('orders.status.paid')
            : status === 'pending'
                ? t('orders.status.pending')
                : status === 'failed'
                    ? t('orders.status.failed')
                    : status === 'canceled'
                        ? t('orders.status.canceled')
                        : status === 'refunded'
                            ? t('orders.status.refunded')
                            : status
    );

    const translatePaymentMethod = (paymentMethod?: string | null) => (
        paymentMethod === 'credit_card'
            ? t('orders.filters.method_credit_card')
            : paymentMethod === 'pix'
                ? t('orders.filters.method_pix')
                : paymentMethod === 'boleto'
                    ? t('orders.modals.payment_methods.boleto')
                    : paymentMethod === 'apple_pay'
                        ? t('orders.modals.payment_methods.apple_pay')
                        : paymentMethod === 'google_pay'
                            ? t('orders.modals.payment_methods.google_pay')
                            : paymentMethod || '-'
    );

    const formatLogEvent = (event: string) => {
        switch (event) {
            case 'login':
                return t('members.modals.details.events.login');
            case 'member_area_access_changed_to_suspended':
                return t('members.modals.details.events.member_area_access_changed_to_suspended');
            case 'member_area_access_changed_to_active':
                return t('members.modals.details.events.member_area_access_changed_to_active');
            case 'member_area_access_removed':
                return t('members.modals.details.events.member_area_access_removed');
            case 'status_changed_to_suspended':
                return t('members.modals.details.events.status_changed_to_suspended');
            case 'status_changed_to_active':
                return t('members.modals.details.events.status_changed_to_active');
            case 'status_changed_to_disabled':
                return t('members.modals.details.events.status_changed_to_disabled');
            case 'access_granted':
                return t('members.modals.details.events.access_granted');
            case 'access_revoked':
                return t('members.modals.details.events.access_revoked');
            case 'create':
                return t('members.modals.details.events.create');
            case 'update':
                return t('members.modals.details.events.update');
            case 'delete':
                return t('members.modals.details.events.delete');
            default:
                return event.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
        }
    };

    const formatLogMetadata = (log: ActivityLog) => {
        const metadata = (log.metadata ?? {}) as Record<string, any>;
        const parts: string[] = [];

        if (metadata.p === 'admin') parts.push(t('members.modals.details.metadata.by_admin'));
        if (metadata.method) {
            const method = metadata.method === 'password'
                ? t('members.modals.details.metadata.method_password')
                : String(metadata.method);
            parts.push(t('members.modals.details.metadata.via_method', { method }));
        }
        if (metadata.productIds) {
            parts.push(t('members.modals.details.metadata.products_count', {
                count: Array.isArray(metadata.productIds) ? metadata.productIds.length : 1,
            }));
        }
        if (typeof metadata.productId === 'string') {
            parts.push(t('members.modals.details.metadata.product_id', {
                id: `${metadata.productId.slice(0, 8)}...`,
            }));
        }
        if (metadata.action) {
            parts.push(t('members.modals.details.metadata.action', {
                action: String(metadata.action),
            }));
        }
        if (metadata.mode === 'direct_db') {
            parts.push(t('members.modals.details.metadata.recovery_mode'));
        }

        if (parts.length === 0) return (JSON.stringify(metadata) || '').slice(0, 50);
        return parts.join(' | ');
    };

    const openSuccessAlert = (message: string) => {
        setAlertModal({
            isOpen: true,
            title: t('success_title', { ns: 'common' }),
            message,
            variant: 'success'
        });
    };

    const openErrorAlert = (message: string) => {
        setAlertModal({
            isOpen: true,
            title: t('error_title', { ns: 'common' }),
            message,
            variant: 'error'
        });
    };

    const loadProducts = async () => {
        try {
            const products = await memberService.getProducts();
            setAvailableProducts(products);
        } catch (loadError) {
            console.error('Error loading products:', loadError);
        }
    };

    const loadDetails = async () => {
        if (!memberUserId) return;

        setLoading(true);
        setError(null);

        try {
            const data = await memberService.getMemberDetails(memberUserId, {
                email: member?.email,
                name: member?.name,
                status: member?.status,
                joined_at: member?.joined_at
            });

            setDetails(data);
            if (data?.profile?.status) {
                setCurrentStatus(data.profile.status);
            }
        } catch (loadError: any) {
            console.error('Error loading member details:', loadError);
            setError(t('members.modals.details.alerts.load_error', {
                message: loadError?.message || t('members.modals.details.alerts.unknown_error'),
            }));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen && memberUserId) {
            setError(null);
            setCurrentStatus(member?.status || 'active');
            void loadDetails();
            void loadProducts();
        }
    }, [isOpen, memberUserId, member?.email, member?.joined_at, member?.name, member?.status]);

    const handleGrantAccess = (productId: string) => {
        setConfirmModal({ isOpen: true, action: 'grant', productId });
    };

    const handleRevokeAccess = (productId: string) => {
        setConfirmModal({ isOpen: true, action: 'revoke', productId });
    };

    const executeGrantAccess = async () => {
        if (!confirmModal.productId || !memberUserId) return;

        setIsProcessing(true);
        try {
            await memberService.grantAccess(memberUserId, [confirmModal.productId]);
            setConfirmModal({ isOpen: false, action: '' });
            openSuccessAlert(t('members.modals.details.alerts.grant_success'));
            void loadDetails();
        } catch (grantError: any) {
            console.error('Error granting access:', grantError);
            setConfirmModal({ isOpen: false, action: '' });
            openErrorAlert(t('members.modals.details.alerts.grant_error', {
                message: grantError?.message || t('members.modals.details.alerts.unknown_error'),
            }));
        } finally {
            setIsProcessing(false);
        }
    };

    const executeRevokeAccess = async () => {
        if (!confirmModal.productId || !memberUserId) return;

        setIsProcessing(true);
        try {
            await memberService.revokeAccess(memberUserId, confirmModal.productId);
            setConfirmModal({ isOpen: false, action: '' });
            openSuccessAlert(t('members.modals.details.alerts.revoke_success'));
            void loadDetails();
        } catch (revokeError: any) {
            console.error('Error revoking access:', revokeError);
            setConfirmModal({ isOpen: false, action: '' });
            openErrorAlert(t('members.modals.details.alerts.revoke_error', {
                message: revokeError?.message || t('members.modals.details.alerts.unknown_error'),
            }));
        } finally {
            setIsProcessing(false);
        }
    };

    const handleAction = (action: 'suspend' | 'activate' | 'email_reset' | 'email_welcome') => {
        if (action === 'suspend' || action === 'activate') {
            setConfirmModal({ isOpen: true, action });
            return;
        }

        void executeAction(action);
    };

    const executeAction = async (action: 'suspend' | 'activate' | 'email_reset' | 'email_welcome') => {
        if (!memberUserId) return;

        setIsProcessing(true);
        try {
            if (action === 'suspend') {
                setCurrentStatus('suspended');
                await memberService.updateMemberStatus(memberUserId, 'suspended', memberAreaId);
                setConfirmModal({ isOpen: false, action: '' });
                openSuccessAlert(t('members.modals.details.alerts.suspend_success'));
                onUpdate?.();
            } else if (action === 'activate') {
                setCurrentStatus('active');
                await memberService.updateMemberStatus(memberUserId, 'active', memberAreaId);
                setConfirmModal({ isOpen: false, action: '' });
                openSuccessAlert(t('members.modals.details.alerts.activate_success'));
                onUpdate?.();
            } else if (action === 'email_reset') {
                await memberService.resendMemberEmail(memberUserId, 'reset_password', memberAreaId);
                openSuccessAlert(t('members.modals.details.alerts.password_reset_success'));
            } else if (action === 'email_welcome') {
                await emailService.sendAccessEmail({
                    email: memberEmail,
                    name: memberName,
                });
                openSuccessAlert(t('members.modals.details.alerts.welcome_email_success'));
            }
        } catch (actionError: any) {
            console.error('Action failed:', actionError);
            setConfirmModal({ isOpen: false, action: '' });
            openErrorAlert(t('members.modals.details.alerts.action_error', {
                message: actionError?.message || t('members.modals.details.alerts.unknown_error'),
            }));
            void loadDetails();
        } finally {
            setIsProcessing(false);
        }
    };

    const totalSpent = details?.orders?.reduce((accumulator: number, order: any) => accumulator + (order.amount || 0), 0) || 0;
    const totalSpentCurrency = details?.orders?.length ? resolveOrderCurrency(details.orders[0]) : defaultCurrency;
    const activeProductsCount = details?.accessGrants?.filter((grant: any) => grant.status === 'active').length || 0;
    const suspendedBadge = currentStatus === 'suspended'
        ? 'bg-red-100 text-red-700 border-red-200'
        : currentStatus === 'disabled'
            ? 'bg-gray-200 text-gray-700 border-gray-300'
            : '';
    const suspendedLabel = currentStatus === 'suspended'
        ? t('members.status.suspended')
        : currentStatus === 'disabled'
            ? t('members.modals.details.statuses.disabled')
            : '';

    const confirmTitle = confirmModal.action === 'suspend'
        ? t('members.modals.details.confirm.suspend_title')
        : confirmModal.action === 'activate'
            ? t('members.modals.details.confirm.activate_title')
            : confirmModal.action === 'grant'
                ? t('members.modals.details.confirm.grant_title')
                : t('members.modals.details.confirm.revoke_title');

    const confirmMessage = confirmModal.action === 'suspend'
        ? t('members.modals.details.confirm.suspend_message')
        : confirmModal.action === 'activate'
            ? t('members.modals.details.confirm.activate_message')
            : confirmModal.action === 'grant'
                ? t('members.modals.details.confirm.grant_message')
                : t('members.modals.details.confirm.revoke_message');

    if (!isOpen) return null;

    return (
        <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
                <Dialog.Content className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-full max-w-5xl h-[90vh] bg-[#12121A]/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-purple-500/20 z-50 flex flex-col overflow-hidden outline-none animate-in zoom-in-95 duration-200">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl -mr-16 -mt-16" />
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -ml-16 -mb-16" />

                    <div className="relative flex-none p-6 border-b border-white/10 bg-white/[0.02] flex justify-between items-start">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-primary/20">
                                {memberInitial}
                            </div>
                            <div>
                                <Dialog.Title asChild>
                                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                                        {memberName}
                                        {currentStatus !== 'active' && (
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${suspendedBadge}`}>
                                                {suspendedLabel}
                                            </span>
                                        )}
                                    </h2>
                                </Dialog.Title>
                                <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                                    <span className="flex items-center gap-1.5">
                                        <Mail className="w-4 h-4" />
                                        {memberEmail}
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <Calendar className="w-4 h-4" />
                                        {t('members.modals.details.member_since', {
                                            date: formatMemberSince(member?.joined_at),
                                        })}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 hover:bg-white/10 rounded-full transition-colors"
                            aria-label={t('members.modals.details.close')}
                        >
                            <X className="w-6 h-6 text-gray-500" />
                        </button>
                    </div>

                    <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                        <div className="relative px-6 border-b border-white/10 bg-[#12121A]">
                            <Tabs.List className="flex gap-6">
                                {[
                                    { id: 'overview', label: t('members.modals.details.tabs.overview'), icon: Activity },
                                    { id: 'products', label: t('members.modals.details.tabs.products'), icon: ShoppingBag },
                                    { id: 'orders', label: t('members.modals.details.tabs.orders'), icon: FileText },
                                    { id: 'history', label: t('members.modals.details.tabs.history'), icon: Clock },
                                ].map((tab) => (
                                    <Tabs.Trigger
                                        key={tab.id}
                                        value={tab.id}
                                        className={`group flex items-center gap-2 py-4 text-sm font-medium border-b-2 transition-colors outline-none ${activeTab === tab.id
                                            ? 'border-purple-500 text-purple-400'
                                            : 'border-transparent text-gray-500 hover:text-gray-300'
                                            }`}
                                    >
                                        <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-purple-400' : 'text-gray-400 group-hover:text-gray-500'}`} />
                                        {tab.label}
                                    </Tabs.Trigger>
                                ))}
                            </Tabs.List>
                        </div>

                        <div className="relative flex-1 overflow-y-auto p-6 bg-black/20">
                            {loading ? (
                                <div className="flex items-center justify-center h-full">
                                    <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                                </div>
                            ) : error ? (
                                <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-4">
                                    <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                                        <Ban className="w-6 h-6 text-red-500" />
                                    </div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('members.modals.details.load_error_title')}</h3>
                                    <p className="text-gray-500 max-w-sm">{error}</p>
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="px-4 py-2 bg-gray-100 dark:bg-white/5 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                                    >
                                        {t('members.modals.details.close')}
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <Tabs.Content value="overview" className="space-y-6 outline-none animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="p-4 bg-white dark:bg-[#1A1A24] rounded-xl border border-gray-200 dark:border-white/5 shadow-sm">
                                                <div className="text-sm text-gray-500 mb-1">{t('orders.table.total_spent')}</div>
                                                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                                                    {formatCurrency(totalSpent, totalSpentCurrency)}
                                                </div>
                                            </div>
                                            <div className="p-4 bg-white dark:bg-[#1A1A24] rounded-xl border border-gray-200 dark:border-white/5 shadow-sm">
                                                <div className="text-sm text-gray-500 mb-1">{t('members.modals.details.summary.last_access')}</div>
                                                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                                                    {details?.profile?.last_seen_at
                                                        ? formatDateTime(details.profile.last_seen_at)
                                                        : t('members.modals.details.summary.never')}
                                                </div>
                                            </div>
                                            <div className="p-4 bg-white dark:bg-[#1A1A24] rounded-xl border border-gray-200 dark:border-white/5 shadow-sm">
                                                <div className="text-sm text-gray-500 mb-1">{t('members.modals.details.summary.active_products')}</div>
                                                <div className="text-2xl font-bold text-green-500">
                                                    {activeProductsCount}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                            <div className="space-y-6">
                                                <div className="bg-white dark:bg-[#1A1A24] rounded-xl border border-gray-200 dark:border-white/5 p-5 shadow-sm">
                                                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">{t('members.modals.details.quick_actions')}</h3>
                                                    <div className="space-y-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAction('email_reset')}
                                                            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg border border-gray-200 dark:border-white/10 transition-colors"
                                                        >
                                                            <Key className="w-4 h-4 text-gray-400" />
                                                            {t('members.modals.details.actions.send_password_reset')}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAction('email_welcome')}
                                                            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg border border-gray-200 dark:border-white/10 transition-colors"
                                                        >
                                                            <Mail className="w-4 h-4 text-gray-400" />
                                                            {t('members.modals.details.actions.resend_welcome_email')}
                                                        </button>
                                                        <hr className="border-gray-100 dark:border-white/5 my-2" />
                                                        {currentStatus === 'suspended' ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleAction('activate')}
                                                                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 transition-colors"
                                                            >
                                                                <Shield className="w-4 h-4" />
                                                                {t('members.modals.details.actions.reactivate_access')}
                                                            </button>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleAction('suspend')}
                                                                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 transition-colors"
                                                            >
                                                                <Ban className="w-4 h-4" />
                                                                {t('members.modals.details.actions.suspend_access')}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="lg:col-span-2 bg-white dark:bg-[#1A1A24] rounded-xl border border-gray-200 dark:border-white/5 p-5 shadow-sm">
                                                <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">{t('members.modals.details.recent_activity')}</h3>
                                                <div className="space-y-4">
                                                    {details?.logs?.slice(0, 5).map((log: ActivityLog) => (
                                                        <div key={log.id} className="flex gap-4 items-start">
                                                            <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${log.event.includes('suspend') || log.event.includes('revoke') ? 'bg-red-500' :
                                                                log.event.includes('active') || log.event.includes('grant') ? 'bg-green-500' :
                                                                    'bg-blue-500'
                                                                }`} />
                                                            <div>
                                                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                                                    {formatLogEvent(log.event)}
                                                                </div>
                                                                <div className="text-xs text-gray-500 mb-1">
                                                                    {formatRecentActivityDate(log.created_at)}
                                                                </div>
                                                                {log.metadata && Object.keys(log.metadata).length > 0 && (
                                                                    <div className="text-xs text-gray-500 bg-gray-50 dark:bg-white/5 p-1.5 rounded border border-gray-100 dark:border-white/5 inline-block">
                                                                        {formatLogMetadata(log)}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {(!details?.logs || details.logs.length === 0) && (
                                                        <div className="text-center py-8 text-gray-500">
                                                            {t('members.modals.details.no_recent_activity')}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </Tabs.Content>

                                    <Tabs.Content value="products" className="space-y-4 outline-none animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <div className="flex justify-between items-center bg-gray-50 dark:bg-white/5 p-4 rounded-xl border border-gray-100 dark:border-white/5">
                                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">{t('members.modals.details.granted_access')}</h3>
                                            <div className="flex gap-2">
                                                <select
                                                    id="product-select"
                                                    className="bg-white dark:bg-[#1A1A24] border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary"
                                                    onChange={(e) => {
                                                        const productId = e.target.value;
                                                        if (productId) handleGrantAccess(productId);
                                                        e.target.value = '';
                                                    }}
                                                >
                                                    <option value="">{t('members.modals.details.grant_access')}</option>
                                                    {availableProducts.map((product) => (
                                                        <option key={product.id} value={product.id}>{product.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="bg-white dark:bg-[#1A1A24] rounded-xl border border-gray-200 dark:border-white/5 overflow-hidden">
                                            <table className="w-full text-left">
                                                <thead className="bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-white/5">
                                                    <tr>
                                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase">{t('orders.table.product')}</th>
                                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase">{t('members.table.status')}</th>
                                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase">{t('members.modals.details.table.release_date')}</th>
                                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase">{t('members.modals.details.table.expires_at')}</th>
                                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase text-right">{t('members.table.actions')}</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                                                    {details?.accessGrants?.map((grant: any) => (
                                                        <tr key={grant.id}>
                                                            <td className="p-4 font-medium text-gray-900 dark:text-white">
                                                                {grant.product?.name || grant.content?.title || t('members.modals.details.fallbacks.unknown_product')}
                                                            </td>
                                                            <td className="p-4">
                                                                <span className={`px-2 py-1 rounded text-xs font-medium ${grant.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                                    {grant.status === 'active'
                                                                        ? t('members.modals.details.statuses.active')
                                                                        : t('members.modals.details.statuses.inactive')}
                                                                </span>
                                                            </td>
                                                            <td className="p-4 text-sm text-gray-500">
                                                                {formatShortDate(grant.granted_at)}
                                                            </td>
                                                            <td className="p-4 text-sm text-gray-500">
                                                                {grant.expires_at ? formatShortDate(grant.expires_at) : t('members.modals.details.fallbacks.lifetime')}
                                                            </td>
                                                            <td className="p-4 text-right">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRevokeAccess(grant.product_id)}
                                                                    className="text-red-500 hover:text-red-700 text-sm font-medium hover:bg-red-50 px-2 py-1 rounded transition-colors"
                                                                >
                                                                    {t('revoke')}
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            {(!details?.accessGrants || details.accessGrants.length === 0) && (
                                                <div className="p-8 text-center text-gray-500">{t('members.modals.details.fallbacks.no_products')}</div>
                                            )}
                                        </div>
                                    </Tabs.Content>

                                    <Tabs.Content value="orders" className="space-y-4 outline-none animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <div className="bg-white dark:bg-[#1A1A24] rounded-xl border border-gray-200 dark:border-white/5 overflow-hidden">
                                            <table className="w-full text-left">
                                                <thead className="bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-white/5">
                                                    <tr>
                                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase">{t('members.modals.details.table.id')}</th>
                                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase">{t('orders.table.value')}</th>
                                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase">{t('members.table.status')}</th>
                                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase">{t('members.modals.details.table.date')}</th>
                                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase">{t('members.modals.details.table.gateway')}</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                                                    {details?.orders?.map((order: any) => (
                                                        <tr key={order.id}>
                                                            <td className="p-4 font-mono text-xs text-gray-500">{order.id.slice(0, 8)}...</td>
                                                            <td className="p-4 font-medium text-gray-900 dark:text-white">
                                                                {formatCurrency(order.amount || 0, resolveOrderCurrency(order))}
                                                            </td>
                                                            <td className="p-4">
                                                                <span className={`px-2 py-1 rounded text-xs font-medium ${order.status === 'paid' ? 'bg-green-100 text-green-700' :
                                                                    order.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                                                        'bg-red-100 text-red-700'
                                                                    }`}>
                                                                    {translateOrderStatus(order.status)}
                                                                </span>
                                                            </td>
                                                            <td className="p-4 text-sm text-gray-500">
                                                                {formatDateTime(order.created_at)}
                                                            </td>
                                                            <td className="p-4 text-sm text-gray-500">
                                                                {translatePaymentMethod(order.payment_method)}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            {(!details?.orders || details.orders.length === 0) && (
                                                <div className="p-8 text-center text-gray-500">{t('members.modals.details.fallbacks.no_orders')}</div>
                                            )}
                                        </div>
                                    </Tabs.Content>

                                    <Tabs.Content value="history" className="outline-none animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <div className="bg-white dark:bg-[#1A1A24] rounded-xl border border-gray-200 dark:border-white/5 p-6 shadow-sm">
                                            <div className="relative border-l border-gray-200 dark:border-white/10 ml-3 space-y-8">
                                                {details?.logs?.map((log: ActivityLog) => (
                                                    <div key={log.id} className="relative pl-8">
                                                        <span className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ring-4 ring-white dark:ring-[#1A1A24] ${log.event.includes('suspend') || log.event.includes('revoke') ? 'bg-red-500' :
                                                            log.event.includes('active') || log.event.includes('grant') ? 'bg-green-500' :
                                                                'bg-blue-500'
                                                            }`} />
                                                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                                                            <div>
                                                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                                                    {formatLogEvent(log.event)}
                                                                </span>
                                                                {log.metadata && Object.keys(log.metadata).length > 0 && (
                                                                    <div className="text-xs text-gray-500 mt-0.5">
                                                                        {formatLogMetadata(log)}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <span className="text-xs text-gray-400 whitespace-nowrap">
                                                                {formatDateTime(log.created_at)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                                {(!details?.logs || details.logs.length === 0) && (
                                                    <div className="pl-6 text-gray-500">{t('members.modals.details.fallbacks.no_history')}</div>
                                                )}
                                            </div>
                                        </div>
                                    </Tabs.Content>
                                </>
                            )}
                        </div>
                    </Tabs.Root>

                    <ConfirmModal
                        isOpen={confirmModal.isOpen}
                        onClose={() => setConfirmModal({ isOpen: false, action: '' })}
                        onConfirm={() => {
                            if (confirmModal.action === 'suspend') void executeAction('suspend');
                            else if (confirmModal.action === 'activate') void executeAction('activate');
                            else if (confirmModal.action === 'grant') void executeGrantAccess();
                            else if (confirmModal.action === 'revoke') void executeRevokeAccess();
                        }}
                        title={confirmTitle}
                        message={confirmMessage}
                        confirmText={t('confirm', { ns: 'common' })}
                        variant={confirmModal.action === 'suspend' || confirmModal.action === 'revoke' ? 'danger' : 'primary'}
                        loading={isProcessing}
                    />

                    <AlertModal
                        isOpen={alertModal.isOpen}
                        onClose={() => setAlertModal({ isOpen: false, title: '', message: '', variant: 'success' })}
                        title={alertModal.title}
                        message={alertModal.message}
                        variant={alertModal.variant}
                    />
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
};

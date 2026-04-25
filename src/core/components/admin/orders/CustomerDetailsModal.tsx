import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, User, ShoppingBag, MessageCircle, Calendar, FileText, Mail, Phone, MapPin, RefreshCw } from 'lucide-react';
import { Button } from '../../ui/Button';
import { AlertModal } from '../../ui/Modal';
import { emailService } from '../../../services/emailService';
import { storage } from '../../../services/storageService';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

export const CustomerDetailsModal: React.FC<CustomerDetailsModalProps> = ({ customer, isOpen, onClose }) => {
    const [isResending, setIsResending] = useState(false);
    const [alertModal, setAlertModal] = useState<{ isOpen: boolean; title: string; message: string; variant: 'success' | 'error' | 'info' }>({
        isOpen: false,
        title: '',
        message: '',
        variant: 'info'
    });

    if (!customer) return null;

    const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

    const openWhatsApp = () => {
        if (!customer.phone) return;
        const phone = customer.phone.replace(/\D/g, '');
        window.open(`https://wa.me/55${phone}`, '_blank');
    };

    const handleResendEmail = async () => {
        setIsResending(true);
        try {
            // Fetch orders to find the latest paid one for this customer email
            const orders = await storage.getOrders();
            const lastPaidOrder = orders
                .filter(o => o.customer_email === customer.email && o.status === 'paid')
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

            if (!lastPaidOrder) {
                setAlertModal({
                    isOpen: true,
                    title: 'Aviso',
                    message: 'Nenhum pedido aprovado encontrado para este cliente.',
                    variant: 'info'
                });
                return;
            }

            const success = await emailService.sendPaymentApproved(lastPaidOrder);
            if (success) {
                setAlertModal({
                    isOpen: true,
                    title: 'Sucesso',
                    message: 'E-mail de confirmação de venda reenviado com sucesso!',
                    variant: 'success'
                });
            } else {
                throw new Error('Falha ao enviar e-mail');
            }
        } catch (error) {
            setAlertModal({
                isOpen: true,
                title: 'Erro',
                message: 'Não foi possível reenviar o e-mail. Tente novamente mais tarde.',
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

                    {/* Purple glow effects */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl -mr-16 -mt-16" />
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -ml-16 -mb-16" />

                    {/* Header */}
                    <div className="relative flex-none p-6 border-b border-white/10 bg-white/[0.02] flex justify-between items-start">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h2 className="text-xl font-bold text-white">Detalhes do Cliente</h2>
                            </div>
                            <p className="text-sm text-gray-500">
                                Cliente desde {formatDate(customer.lastOrderDate)} (Baseado no último pedido)
                            </p>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <X className="w-5 h-5 text-gray-500" />
                        </button>
                    </div>

                    <div className="relative flex-1 overflow-y-auto p-6 space-y-6">

                        {/* Summary Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-xl bg-black/30 border border-purple-500/20 flex flex-col items-center text-center">
                                <div className="p-2 bg-green-500/10 rounded-full text-green-500 mb-2">
                                    <ShoppingBag className="w-5 h-5" />
                                </div>
                                <div className="text-xs text-gray-500 uppercase font-bold mb-1">Total Gasto</div>
                                <div className="text-xl font-bold text-white">{formatCurrency(customer.totalSpent)}</div>
                            </div>
                            <div className="p-4 rounded-xl bg-black/30 border border-purple-500/20 flex flex-col items-center text-center">
                                <div className="p-2 bg-blue-500/10 rounded-full text-blue-500 mb-2">
                                    <FileText className="w-5 h-5" />
                                </div>
                                <div className="text-xs text-gray-500 uppercase font-bold mb-1">Total Pedidos</div>
                                <div className="text-xl font-bold text-white">{customer.orderCount}</div>
                            </div>
                        </div>

                        {/* Contact Info */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                <User className="w-4 h-4 text-purple-400" /> Dados de Contato
                            </h3>
                            <div className="bg-black/20 rounded-xl border border-purple-500/20 overflow-hidden p-4 space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-gray-500 font-bold">
                                        {customer.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="font-bold text-white">{customer.name}</div>
                                        <div className="text-xs text-gray-500">Nome registrado no checkout</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100 dark:border-white/5">
                                    <div className="flex items-center gap-2">
                                        <Mail className="w-4 h-4 text-gray-400" />
                                        <span className="text-sm text-gray-300">{customer.email}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Phone className="w-4 h-4 text-gray-400" />
                                        <span className="text-sm text-gray-300">{customer.phone || 'Não informado'}</span>
                                        {customer.phone && (
                                            <button onClick={openWhatsApp} className="ml-auto text-green-500 text-xs font-bold hover:underline flex items-center gap-1">
                                                <MessageCircle className="w-3 h-3" /> WhatsApp
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Products */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                <ShoppingBag className="w-4 h-4 text-purple-400" /> Produtos Adquiridos
                            </h3>
                            <div className="bg-black/20 rounded-xl border border-purple-500/20 overflow-hidden p-4">
                                <div className="flex flex-wrap gap-2">
                                    {customer.products.map((prod, idx) => (
                                        <span key={idx} className="px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-400 text-sm border border-purple-500/20">
                                            {prod}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* Actions Footer */}
                    <div className="relative p-6 border-t border-white/10 bg-white/[0.02] flex flex-col md:flex-row justify-end items-center gap-4">
                        <Button
                            variant="secondary"
                            onClick={handleResendEmail}
                            disabled={isResending}
                            className="w-full md:w-auto bg-white/5 hover:bg-white/10 text-white border-white/10"
                        >
                            {isResending ? (
                                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                                <Mail className="w-4 h-4 mr-2" />
                            )}
                            Reenviar E-mail de Venda
                        </Button>
                        <Button variant="secondary" onClick={onClose} className="w-full md:w-auto bg-purple-600 hover:bg-purple-700 text-white border-none">
                            Fechar
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

import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, User, ShoppingBag, MessageCircle, CreditCard, Calendar, Mail, FileText, CheckCircle, AlertCircle, Clock, RefreshCw } from 'lucide-react';
import { Order, OrderStatus } from '../../../types';
import { Button } from '../../ui/Button';
import { AlertModal } from '../../ui/Modal';
import { emailService } from '../../../services/emailService';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface OrderDetailsModalProps {
    order: Order | null;
    isOpen: boolean;
    onClose: () => void;
}

export const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({ order, isOpen, onClose }) => {
    const [isResending, setIsResending] = useState(false);
    const [alertModal, setAlertModal] = useState<{ isOpen: boolean; title: string; message: string; variant: 'success' | 'error' | 'info' }>({
        isOpen: false,
        title: '',
        message: '',
        variant: 'info'
    });

    if (!order) return null;

    const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    const openWhatsApp = () => {
        if (!order.customer_phone) return;
        const phone = order.customer_phone.replace(/\D/g, '');
        const product = order.items?.[0]?.name || 'Produto';
        const msg = `Olá ${order.customer_name}, vi que você adquiriu o produto ${product}. Precisa de ajuda em algo?`;
        window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    }; const handleResendEmail = async () => {
        setIsResending(true);
        try {
            const success = await emailService.sendPaymentApproved(order);
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
                                <h2 className="text-xl font-bold text-white">Detalhes do Pedido</h2>
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                    #{order.id.slice(0, 8)}
                                </span>
                            </div>
                            <p className="text-sm text-gray-500 flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                {format(new Date(order.created_at), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                            </p>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <X className="w-5 h-5 text-gray-500" />
                        </button>
                    </div>

                    <div className="relative flex-1 overflow-y-auto p-6 space-y-6">

                        {/* Status Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-xl bg-black/30 border border-purple-500/20">
                                <div className="text-xs text-gray-400 uppercase font-bold mb-1">Status do Pedido</div>
                                <div className="flex items-center gap-2">
                                    {order.status === 'paid' ? <CheckCircle className="w-5 h-5 text-green-500" /> :
                                        order.status === 'pending' ? <Clock className="w-5 h-5 text-yellow-500" /> :
                                            <AlertCircle className="w-5 h-5 text-red-500" />}
                                    <span className={`font-bold ${order.status === 'paid' ? 'text-green-400' :
                                        order.status === 'pending' ? 'text-yellow-400' :
                                            'text-red-400'
                                        }`}>
                                        {order.status === 'paid' ? 'Aprovado' :
                                            order.status === 'pending' ? 'Pendente' :
                                                order.status === 'failed' ? 'Falhou' : order.status}
                                    </span>
                                </div>
                            </div>
                            <div className="p-4 rounded-xl bg-black/30 border border-purple-500/20">
                                <div className="text-xs text-gray-400 uppercase font-bold mb-1">Pagamento</div>
                                <div className="flex items-center gap-2 text-white font-medium capitalize">
                                    <CreditCard className="w-5 h-5 text-gray-400" />
                                    {order.payment_method === 'credit_card' ? 'Cartão de Crédito' : order.payment_method}
                                </div>
                            </div>
                        </div>

                        {/* Customer Info */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                <User className="w-4 h-4 text-purple-400" /> Informações do Cliente
                            </h3>
                            <div className="bg-black/20 rounded-xl border border-purple-500/20 overflow-hidden">
                                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <div className="text-xs text-gray-500 mb-1">Nome Completo</div>
                                        <div className="font-medium text-white">{order.customer_name}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-gray-500 mb-1">E-mail</div>
                                        <div className="font-medium text-white flex items-center gap-2">
                                            {order.customer_email}
                                            <button className="text-gray-400 hover:text-primary transition-colors" title="Copiar">
                                                <FileText className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-gray-500 mb-1">CPF</div>
                                        <div className="font-medium text-white">{order.customer_cpf || '-'}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-gray-500 mb-1">Telefone</div>
                                        <div className="font-medium text-white flex items-center gap-2">
                                            {order.customer_phone || '-'}
                                            {order.customer_phone && (
                                                <button
                                                    onClick={openWhatsApp}
                                                    className="bg-green-500/10 hover:bg-green-500/20 text-green-500 p-1 rounded-md transition-colors"
                                                    title="Conversar no WhatsApp"
                                                >
                                                    <MessageCircle className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Order Items */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                <ShoppingBag className="w-4 h-4 text-purple-400" /> Itens do Pedido
                            </h3>
                            <div className="bg-black/20 rounded-xl border border-purple-500/20 overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 dark:bg-white/5 border-b border-gray-100 dark:border-white/5">
                                        <tr>
                                            <th className="px-4 py-3 font-medium text-gray-500">Produto</th>
                                            <th className="px-4 py-3 font-medium text-gray-500 text-right">Qtd</th>
                                            <th className="px-4 py-3 font-medium text-gray-500 text-right">Total</th>
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
                                            <td colSpan={2} className="px-4 py-3 font-bold text-white text-right">Total do Pedido</td>
                                            <td className="px-4 py-3 font-bold text-purple-400 text-2xl text-right">{formatCurrency(order.amount)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                    </div>

                    {/* Actions Footer */}
                    <div className="relative p-6 border-t border-white/10 bg-white/[0.02] flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="text-xs text-gray-400">
                            ID Transação: <span className="font-mono select-all">{order.gateway_id || '-'}</span>
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
                                    Reenviar E-mail de Venda
                                </Button>
                            )}
                            <Button variant="secondary" onClick={onClose} className="bg-purple-600 hover:bg-purple-700 text-white border-none">
                                Fechar
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

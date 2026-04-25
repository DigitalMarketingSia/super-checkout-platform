import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import { ConfirmModal, AlertModal } from '../../ui/Modal';
import { X, User, ShoppingBag, Clock, FileText, Activity, Shield, Mail, Calendar, Key, Ban, ExternalLink, Plus, Trash2, Tag, Save } from 'lucide-react';
import { memberService } from '../../../services/memberService';
import { Profile, ActivityLog, MemberNote, MemberTag } from '../../../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MemberDetailsModalProps {
    member: any; // Using enriched member type
    isOpen: boolean;
    onClose: () => void;
    onUpdate?: () => void;
}

const formatLogEvent = (event: string) => {
    switch (event) {
        case 'login': return 'Acesso ao Sistema';
        case 'status_changed_to_suspended': return 'Conta Suspensa';
        case 'status_changed_to_active': return 'Conta Ativada';
        case 'status_changed_to_disabled': return 'Conta Desativada';
        case 'access_granted': return 'Acesso Concedido';
        case 'access_revoked': return 'Acesso Revogado';
        case 'create': return 'Membro Criado';
        case 'update': return 'Dados Atualizados';
        case 'delete': return 'Membro Excluído';
        default: return event.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
};

const formatLogMetadata = (log: ActivityLog) => {
    const m = log.metadata || {};
    const parts = [];

    if (m.p === 'admin') parts.push('por Admin');
    if (m.method) parts.push(`via ${m.method === 'password' ? 'Senha' : m.method}`);
    if (m.productIds) parts.push(`Produtos: ${Array.isArray(m.productIds) ? m.productIds.length : 1}`);
    if (m.productId) parts.push(`Produto ID: ${m.productId.slice(0, 8)}...`);
    if (m.action) parts.push(`Ação: ${m.action}`);
    if (m.mode === 'direct_db') parts.push('(Modo Recuperação)');

    if (parts.length === 0) return JSON.stringify(m).slice(0, 50);
    return parts.join(' • ');
};

export const MemberDetailsModal: React.FC<MemberDetailsModalProps> = ({ member, isOpen, onClose, onUpdate }) => {
    const [activeTab, setActiveTab] = useState('overview');
    const [details, setDetails] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [currentStatus, setCurrentStatus] = useState<'active' | 'suspended' | 'disabled'>(member.status || 'active');
    const [availableProducts, setAvailableProducts] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Modal states
    const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; action: string; productId?: string }>({ isOpen: false, action: '' });
    const [alertModal, setAlertModal] = useState<{ isOpen: boolean; title: string; message: string; variant: 'success' | 'error' }>({ isOpen: false, title: '', message: '', variant: 'success' });
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        if (isOpen && member) {
            setError(null);
            loadDetails();
            loadProducts();
        }
    }, [isOpen, member]);

    const loadProducts = async () => {
        try {
            const products = await memberService.getProducts();
            setAvailableProducts(products);
        } catch (error) {
            console.error('Error loading products:', error);
        }
    };

    const handleGrantAccess = async (productId: string) => {
        setConfirmModal({ isOpen: true, action: 'grant', productId });
    };

    const handleRevokeAccess = async (productId: string) => {
        setConfirmModal({ isOpen: true, action: 'revoke', productId });
    };

    const executeGrantAccess = async () => {
        if (!confirmModal.productId) return;
        setIsProcessing(true);
        try {
            await memberService.grantAccess(member.user_id, [confirmModal.productId]);
            setConfirmModal({ isOpen: false, action: '' });
            setAlertModal({ isOpen: true, title: 'Sucesso', message: 'Acesso liberado com sucesso!', variant: 'success' });
            loadDetails();
        } catch (error: any) {
            console.error('Error granting access:', error);
            const msg = error.message || JSON.stringify(error);
            setConfirmModal({ isOpen: false, action: '' });
            setAlertModal({ isOpen: true, title: 'Erro', message: `Erro ao liberar acesso: ${msg}`, variant: 'error' });
        } finally {
            setIsProcessing(false);
        }
    };

    const executeRevokeAccess = async () => {
        if (!confirmModal.productId) return;
        setIsProcessing(true);
        try {
            await memberService.revokeAccess(member.user_id, confirmModal.productId);
            setConfirmModal({ isOpen: false, action: '' });
            setAlertModal({ isOpen: true, title: 'Sucesso', message: 'Acesso revogado com sucesso!', variant: 'success' });
            loadDetails();
        } catch (error) {
            console.error('Error revoking access:', error);
            setConfirmModal({ isOpen: false, action: '' });
            setAlertModal({ isOpen: true, title: 'Erro', message: 'Erro ao revogar acesso.', variant: 'error' });
        } finally {
            setIsProcessing(false);
        }
    };

    const loadDetails = async () => {
        setLoading(true);
        setError(null);
        try {
            console.log('Loading details for:', member.user_id);
            const data = await memberService.getMemberDetails(member.user_id);
            console.log('Loaded details:', data);
            setDetails(data);
            if (data?.profile?.status) {
                setCurrentStatus(data.profile.status);
            }
        } catch (error: any) {
            console.error('Error loading member details:', error);
            setError(`Erro ao carregar dados: ${error.message || 'Erro desconhecido'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (action: 'suspend' | 'activate' | 'email_reset' | 'email_welcome') => {
        if (action === 'suspend' || action === 'activate') {
            setConfirmModal({ isOpen: true, action });
        } else {
            executeAction(action);
        }
    };

    const executeAction = async (action: 'suspend' | 'activate' | 'email_reset' | 'email_welcome') => {
        setIsProcessing(true);
        try {
            if (action === 'suspend') {
                setCurrentStatus('suspended');
                await memberService.updateMemberStatus(member.user_id, 'suspended');
                setConfirmModal({ isOpen: false, action: '' });
                setAlertModal({ isOpen: true, title: 'Sucesso', message: 'Membro suspenso com sucesso.', variant: 'success' });
                if (onUpdate) onUpdate();
            }
            else if (action === 'activate') {
                setCurrentStatus('active');
                await memberService.updateMemberStatus(member.user_id, 'active');
                setConfirmModal({ isOpen: false, action: '' });
                setAlertModal({ isOpen: true, title: 'Sucesso', message: 'Membro reativado com sucesso.', variant: 'success' });
                if (onUpdate) onUpdate();
            }
            else if (action === 'email_reset') {
                const response = await fetch('/api/admin/members', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'resend_email', userId: member.user_id, type: 'reset_password' })
                });
                if (!response.ok) throw new Error(await response.text());
                setAlertModal({ isOpen: true, title: 'Sucesso', message: 'Email de redefinição de senha enviado.', variant: 'success' });
            }
            else if (action === 'email_welcome') {
                // Dynamic Import
                const { emailService } = await import('../../../services/emailService');

                await emailService.sendAccessEmail({
                    email: member.email,
                    name: member.name,
                    // We could resolve the members area URL here if needed, but the service has a fallback
                });
                setAlertModal({ isOpen: true, title: 'Sucesso', message: 'E-mail de acesso reenviado com sucesso!', variant: 'success' });
            }
        } catch (error: any) {
            console.error('Action failed:', error);
            setConfirmModal({ isOpen: false, action: '' });
            setAlertModal({ isOpen: true, title: 'Erro', message: `Erro ao executar ação: ${error.message || 'Erro desconhecido'}`, variant: 'error' });
            loadDetails();
        } finally {
            setIsProcessing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <Dialog.Root open={isOpen} onOpenChange={onClose}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
                <Dialog.Content className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-full max-w-5xl h-[90vh] bg-[#12121A]/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-purple-500/20 z-50 flex flex-col overflow-hidden outline-none animate-in zoom-in-95 duration-200">
                    {/* Purple glow effects */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl -mr-16 -mt-16" />
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -ml-16 -mb-16" />

                    {/* Header */}
                    <div className="relative flex-none p-6 border-b border-white/10 bg-white/[0.02] flex justify-between items-start">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-primary/20">
                                {member.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                                    {member.name}
                                    {currentStatus === 'suspended' && (
                                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium border border-red-200">Suspenso</span>
                                    )}
                                </h2>
                                <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                                    <span className="flex items-center gap-1.5">
                                        <Mail className="w-4 h-4" />
                                        {member.email}
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <Calendar className="w-4 h-4" />
                                        Desde {member.joined_at ? format(new Date(member.joined_at), "d MMM, yyyy", { locale: ptBR }) : '-'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <X className="w-6 h-6 text-gray-500" />
                        </button>
                    </div>

                    {/* Tabs & Content */}
                    <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                        <div className="relative px-6 border-b border-white/10 bg-[#12121A]">
                            <Tabs.List className="flex gap-6">
                                {[
                                    { id: 'overview', label: 'Visão Geral', icon: Activity },
                                    { id: 'products', label: 'Produtos e Acesso', icon: ShoppingBag },
                                    { id: 'orders', label: 'Histórico de Compras', icon: FileText },
                                    { id: 'history', label: 'Log de Atividades', icon: Clock },
                                ].map(tab => (
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
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Erro ao carregar dados</h3>
                                    <p className="text-gray-500 max-w-sm">{error}</p>
                                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 dark:bg-white/5 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">
                                        Fechar
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <Tabs.Content value="overview" className="space-y-6 outline-none animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        {/* Quick Stats Grid */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="p-4 bg-white dark:bg-[#1A1A24] rounded-xl border border-gray-200 dark:border-white/5 shadow-sm">
                                                <div className="text-sm text-gray-500 mb-1">Total Gasto</div>
                                                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                                                    {details?.orders ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(details.orders.reduce((acc: number, o: any) => acc + (o.amount || 0), 0)) : 'R$ 0,00'}
                                                </div>
                                            </div>
                                            <div className="p-4 bg-white dark:bg-[#1A1A24] rounded-xl border border-gray-200 dark:border-white/5 shadow-sm">
                                                <div className="text-sm text-gray-500 mb-1">Último Acesso</div>
                                                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                                                    {details?.profile?.last_seen_at ? format(new Date(details.profile.last_seen_at), "dd/MM/yyyy HH:mm") : 'Nunca'}
                                                </div>
                                            </div>
                                            <div className="p-4 bg-white dark:bg-[#1A1A24] rounded-xl border border-gray-200 dark:border-white/5 shadow-sm">
                                                <div className="text-sm text-gray-500 mb-1">Produtos Ativos</div>
                                                <div className="text-2xl font-bold text-green-500">
                                                    {details?.accessGrants?.filter((g: any) => g.status === 'active').length || 0}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                            {/* Actions Column */}
                                            <div className="space-y-6">
                                                <div className="bg-white dark:bg-[#1A1A24] rounded-xl border border-gray-200 dark:border-white/5 p-5 shadow-sm">
                                                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">Ações Rápidas</h3>
                                                    <div className="space-y-2">
                                                        <button onClick={() => handleAction('email_reset')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg border border-gray-200 dark:border-white/10 transition-colors">
                                                            <Key className="w-4 h-4 text-gray-400" />
                                                            Enviar Redefinição de Senha
                                                        </button>
                                                        <button onClick={() => handleAction('email_welcome')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg border border-gray-200 dark:border-white/10 transition-colors">
                                                            <Mail className="w-4 h-4 text-gray-400" />
                                                            Reenviar Email de Boas-vindas
                                                        </button>
                                                        <hr className="border-gray-100 dark:border-white/5 my-2" />
                                                        {currentStatus === 'suspended' ? (
                                                            <button onClick={() => handleAction('activate')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 transition-colors">
                                                                <Shield className="w-4 h-4" />
                                                                Reativar Acesso
                                                            </button>
                                                        ) : (
                                                            <button onClick={() => handleAction('suspend')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 transition-colors">
                                                                <Ban className="w-4 h-4" />
                                                                Suspender Acesso
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                            </div>

                                            {/* Recent Activity Column */}
                                            <div className="lg:col-span-2 bg-white dark:bg-[#1A1A24] rounded-xl border border-gray-200 dark:border-white/5 p-5 shadow-sm">
                                                <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4">Atividade Recente</h3>
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
                                                                    {format(new Date(log.created_at), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
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
                                                            Nenhuma atividade registrada.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </Tabs.Content>

                                    <Tabs.Content value="products" className="space-y-4 outline-none animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <div className="flex justify-between items-center bg-gray-50 dark:bg-white/5 p-4 rounded-xl border border-gray-100 dark:border-white/5">
                                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">Acessos Concedidos</h3>
                                            <div className="flex gap-2">
                                                <select
                                                    id="product-select"
                                                    className="bg-white dark:bg-[#1A1A24] border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary"
                                                    onChange={(e) => {
                                                        const pid = e.target.value;
                                                        if (pid) handleGrantAccess(pid);
                                                        e.target.value = ""; // Reset
                                                    }}
                                                >
                                                    <option value="">+ Liberar Acesso...</option>
                                                    {availableProducts.map(p => (
                                                        <option key={p.id} value={p.id}>{p.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="bg-white dark:bg-[#1A1A24] rounded-xl border border-gray-200 dark:border-white/5 overflow-hidden">
                                            <table className="w-full text-left">
                                                <thead className="bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-white/5">
                                                    <tr>
                                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Produto</th>
                                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Data Liberação</th>
                                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Expira em</th>
                                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase text-right">Ações</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                                                    {details?.accessGrants?.map((grant: any) => (
                                                        <tr key={grant.id}>
                                                            <td className="p-4 font-medium text-gray-900 dark:text-white">
                                                                {grant.product?.name || grant.content?.title || 'Produto Desconhecido'}
                                                            </td>
                                                            <td className="p-4">
                                                                <span className={`px-2 py-1 rounded text-xs font-medium ${grant.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                                    {grant.status === 'active' ? 'Ativo' : 'Inativo'}
                                                                </span>
                                                            </td>
                                                            <td className="p-4 text-sm text-gray-500">
                                                                {format(new Date(grant.granted_at), "dd/MM/yyyy")}
                                                            </td>
                                                            <td className="p-4 text-sm text-gray-500">
                                                                {grant.expires_at ? format(new Date(grant.expires_at), "dd/MM/yyyy") : 'Vitalício'}
                                                            </td>
                                                            <td className="p-4 text-right">
                                                                <button
                                                                    onClick={() => handleRevokeAccess(grant.product_id)}
                                                                    className="text-red-500 hover:text-red-700 text-sm font-medium hover:bg-red-50 px-2 py-1 rounded transition-colors"
                                                                >
                                                                    Revogar
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            {(!details?.accessGrants || details.accessGrants.length === 0) && (
                                                <div className="p-8 text-center text-gray-500">Nenhum produto liberado para este usuário.</div>
                                            )}
                                        </div>
                                    </Tabs.Content>

                                    <Tabs.Content value="orders" className="space-y-4 outline-none animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <div className="bg-white dark:bg-[#1A1A24] rounded-xl border border-gray-200 dark:border-white/5 overflow-hidden">
                                            <table className="w-full text-left">
                                                <thead className="bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-white/5">
                                                    <tr>
                                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase">ID</th>
                                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Valor</th>
                                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Data</th>
                                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Gateway</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                                                    {details?.orders?.map((order: any) => (
                                                        <tr key={order.id}>
                                                            <td className="p-4 font-mono text-xs text-gray-500">{order.id.slice(0, 8)}...</td>
                                                            <td className="p-4 font-medium text-gray-900 dark:text-white">
                                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.amount)}
                                                            </td>
                                                            <td className="p-4">
                                                                <span className={`px-2 py-1 rounded text-xs font-medium ${order.status === 'paid' ? 'bg-green-100 text-green-700' :
                                                                    order.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                                                        'bg-red-100 text-red-700'
                                                                    }`}>
                                                                    {order.status}
                                                                </span>
                                                            </td>
                                                            <td className="p-4 text-sm text-gray-500">
                                                                {format(new Date(order.created_at), "dd/MM/yyyy HH:mm")}
                                                            </td>
                                                            <td className="p-4 text-sm text-gray-500">
                                                                {order.payment_method || '-'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            {(!details?.orders || details.orders.length === 0) && (
                                                <div className="p-8 text-center text-gray-500">Nenhuma compra encontrada para este usuário.</div>
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
                                                                {format(new Date(log.created_at), "dd/MM/yyyy HH:mm")}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                                {(!details?.logs || details.logs.length === 0) && (
                                                    <div className="pl-6 text-gray-500">Sem histórico disponível.</div>
                                                )}
                                            </div>
                                        </div>
                                    </Tabs.Content>
                                </>
                            )}
                        </div>
                    </Tabs.Root>

                    {/* Confirm Modal */}
                    <ConfirmModal
                        isOpen={confirmModal.isOpen}
                        onClose={() => setConfirmModal({ isOpen: false, action: '' })}
                        onConfirm={() => {
                            if (confirmModal.action === 'suspend') executeAction('suspend');
                            else if (confirmModal.action === 'activate') executeAction('activate');
                            else if (confirmModal.action === 'grant') executeGrantAccess();
                            else if (confirmModal.action === 'revoke') executeRevokeAccess();
                        }}
                        title={
                            confirmModal.action === 'suspend' ? 'Suspender Membro' :
                                confirmModal.action === 'activate' ? 'Reativar Membro' :
                                    confirmModal.action === 'grant' ? 'Liberar Acesso' :
                                        'Revogar Acesso'
                        }
                        message={
                            confirmModal.action === 'suspend' ? 'Tem certeza que deseja suspender este membro? Ele perderá acesso imediato.' :
                                confirmModal.action === 'activate' ? 'Deseja reativar o acesso deste membro?' :
                                    confirmModal.action === 'grant' ? 'Deseja liberar o acesso a este produto para o usuário?' :
                                        'Deseja revogar o acesso a este produto?'
                        }
                        confirmText="Confirmar"
                        variant={confirmModal.action === 'suspend' || confirmModal.action === 'revoke' ? 'danger' : 'primary'}
                        loading={isProcessing}
                    />

                    {/* Alert Modal */}
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

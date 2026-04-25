import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../services/supabase';
import { CENTRAL_CONFIG } from '../../config/central';
import { getRegisterUrl } from '../../config/platformUrls';
import { useAuth } from '../../context/AuthContext';
import { Layout } from '../../components/Layout';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import {
    Users,
    Search,
    Filter,
    MoreVertical,
    Shield,
    Ban,
    CheckCircle,
    Clock,
    ArrowRight,
    Activity,
    Copy,
    Smartphone,
    Mail,
    Zap,
    TrendingUp,
    Layout as LayoutIcon,
    AlertCircle, Loader2, Globe, RefreshCw
} from 'lucide-react';

import { toast } from 'sonner';
import { Modal } from '../../components/ui/Modal';

// Define strict interface for the join query result
// Update interface to reflect CRM requirements
interface FreeUserRow {
    user_id: string;
    email: string;
    full_name: string;
    whatsapp?: string | null;
    partner_consent?: boolean;
    created_at: string;
    last_login_at: string | null;
    signup_source: string | null;
    is_blocked: boolean;
    account_status?: 'active' | 'pending_approval' | 'rejected' | null;
    partner_status?: 'active' | 'suspended' | 'revoked' | null;
    onboarding: {
        domain_configured: boolean;
        gateway_configured: boolean;
    } | null;
    lifecycle: {
        key: 'lead' | 'license_active' | 'installation_completed' | 'license_suspended' | 'blocked' | 'pending_approval' | 'rejected' | 'unconfirmed';
        label: string;
    };
    license: {
        key?: string | null;
        status: string | null;
        plan: string | null;
        plan_label: string;
        max_installations?: number | null;
        active_installations: number;
        total_installations: number;
        created_at?: string | null;
        activated_at?: string | null;
    } | null;
    partner_opportunity: {
        account_id: string | null;
        available: boolean;
        enabled: boolean;
        plan_type?: string | null;
        updated_at?: string | null;
        updated_by_email?: string | null;
        updated_by_name?: string | null;
        notification_sent_at?: string | null;
        notification_status?: 'sent' | 'failed' | 'skipped' | 'not_requested' | null;
        notification_error?: string | null;
    };
    referer?: {
        full_name: string;
        partner_status?: string | null;
    } | null;
    referer_id?: string | null;
}

interface LaunchSettingsState {
    registration_open: boolean;
    manual_approval_enabled: boolean;
}

interface ApprovalQueueRow {
    id: string;
    email: string;
    full_name: string;
    created_at: string;
    account_status: 'pending_approval';
    approval_notes?: string | null;
}

interface BlockTransitionState {
    userId: string;
    userName: string;
    mode: 'block' | 'unblock';
    stage: 'processing' | 'success';
}

const lifecycleBadgeClass: Record<FreeUserRow['lifecycle']['key'], string> = {
    lead: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    license_active: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    installation_completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    license_suspended: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    blocked: 'bg-red-500/10 text-red-400 border-red-500/20',
    pending_approval: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    rejected: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
    unconfirmed: 'bg-gray-500/10 text-gray-400 border-gray-500/20'
};

const getAccountStatusMeta = (user: FreeUserRow) => {
    if (user.is_blocked || user.lifecycle.key === 'blocked') {
        return { label: 'Bloqueado', iconClass: 'text-red-400', textClass: 'text-red-400' };
    }

    switch (user.account_status) {
        case 'active':
            return { label: 'Ativo', iconClass: 'text-emerald-400', textClass: 'text-emerald-400' };
        case 'pending_approval':
            return { label: 'Pendente', iconClass: 'text-yellow-400', textClass: 'text-yellow-400' };
        case 'rejected':
            return { label: 'Rejeitado', iconClass: 'text-zinc-400', textClass: 'text-zinc-400' };
        default:
            return { label: 'Sem Status', iconClass: 'text-gray-600', textClass: 'text-gray-600' };
    }
};

export const LeadCRM: React.FC = () => {
    const { isWhiteLabel, profile, user, session } = useAuth();
    const isAdmin = user?.email === 'contato.jeandamin@gmail.com';

    // CRM States
    const [users, setUsers] = useState<FreeUserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'setup_pending' | 'blocked'>('all');
    const [partnerFilter, setPartnerFilter] = useState<string>('all');
    const [partners, setPartners] = useState<{ id: string, full_name: string }[]>([]);
    const [actionMenuUserId, setActionMenuUserId] = useState<string | null>(null);
    const [contactedUsers, setContactedUsers] = useState<Set<string>>(new Set());
    const [launchSettings, setLaunchSettings] = useState<LaunchSettingsState>({
        registration_open: true,
        manual_approval_enabled: false
    });
    const [launchLoading, setLaunchLoading] = useState(true);
    const [launchSaving, setLaunchSaving] = useState(false);
    const [approvalQueue, setApprovalQueue] = useState<ApprovalQueueRow[]>([]);
    const [approvalLoading, setApprovalLoading] = useState(true);
    const [approvalProcessingId, setApprovalProcessingId] = useState<string | null>(null);
    const [inviteCreating, setInviteCreating] = useState(false);
    const [showInviteWidget, setShowInviteWidget] = useState(false);
    const [generatedInviteUrl, setGeneratedInviteUrl] = useState<string | null>(null);
    const [inviteExpirationDays, setInviteExpirationDays] = useState(7);
    const [linkCopied, setLinkCopied] = useState(false);
    const [isRefreshingLeads, setIsRefreshingLeads] = useState(false);
    const [lastLeadsSyncAt, setLastLeadsSyncAt] = useState<string | null>(null);
    const [blockingUserId, setBlockingUserId] = useState<string | null>(null);
    const [partnerOpportunityUpdatingId, setPartnerOpportunityUpdatingId] = useState<string | null>(null);
    const [blockTransition, setBlockTransition] = useState<BlockTransitionState | null>(null);
    const [selectedLead, setSelectedLead] = useState<FreeUserRow | null>(null);
    const blockTransitionTimerRef = useRef<number | null>(null);

    // Dashboard Metrics
    const [metrics, setMetrics] = useState({
        totalLeads: 0,
        activeInstallations: 0,
        pendingSetup: 0,
        conversionRate: 0,
        pendingApprovals: 0,
        waitlistCount: 0
    });

    // Pagination States
    const [page, setPage] = useState(1); // Changed to 1-indexed for consistency with Orders
    const [totalCount, setTotalCount] = useState(0);
    const pageSize = 50;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    useEffect(() => {
        if (!session?.access_token) return;
        fetchPartners();
        fetchLaunchControls();
        fetchApprovalQueue();
    }, [session?.access_token]);

    useEffect(() => {
        if (!session?.access_token) return;
        fetchUsers();
    }, [page, statusFilter, partnerFilter, session?.access_token]);

    useEffect(() => {
        return () => {
            if (blockTransitionTimerRef.current) {
                window.clearTimeout(blockTransitionTimerRef.current);
            }
        };
    }, []);

    const getAuthHeaders = async () => {
        const { data } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token || session?.access_token;

        return {
            'Content-Type': 'application/json',
            ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {})
        };
    };

    const fetchPartners = async () => {
        try {
            const response = await fetch('/api/central/manage-licenses', {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({ action: 'get_partners' })
            });

            const result = await response.json();
            if (result.success && result.data) {
                setPartners(result.data);
            }
        } catch (e) {
            console.error('Error fetching partners list:', e);
        }
    };

    const fetchLaunchControls = async () => {
        try {
            setLaunchLoading(true);
            const response = await fetch('/api/central/manage-licenses', {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({ action: 'get_launch_settings' })
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Erro ao carregar controles');

            if (result.settings) {
                setLaunchSettings({
                    registration_open: result.settings.registration_open !== false,
                    manual_approval_enabled: Boolean(result.settings.manual_approval_enabled)
                });
            }

            setMetrics(prev => ({
                ...prev,
                pendingApprovals: result.pendingApprovals || 0,
                waitlistCount: result.waitlistCount || 0
            }));
        } catch (error) {
            console.error('Error fetching launch controls:', error);
        } finally {
            setLaunchLoading(false);
        }
    };

    const fetchApprovalQueue = async () => {
        try {
            setApprovalLoading(true);
            const response = await fetch('/api/central/manage-licenses', {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({ action: 'get_registration_approval_queue' })
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Erro ao carregar fila');

            setApprovalQueue(result.data || []);
        } catch (error) {
            console.error('Error fetching approval queue:', error);
            toast.error('Nao foi possivel carregar a fila de aprovacao.');
        } finally {
            setApprovalLoading(false);
        }
    };

    const fetchUsers = async (options?: { silent?: boolean }) => {
        const silent = options?.silent === true;

        try {
            if (silent) {
                setIsRefreshingLeads(true);
            } else {
                setLoading(true);
            }

            const response = await fetch('/api/central/manage-licenses', {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({
                    action: 'get_crm_data',
                    page: page,
                    limit: pageSize,
                    partner_id: partnerFilter
                })
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Erro ao carregar dados');

            const { data, count, partners: partnersMap, metrics: resMetrics } = result;
            setTotalCount(count || 0);

            // 4. Map Data - No longer filtering by plan slug strictly since EF handles the scope
            let formatted: FreeUserRow[] = (data || []).map((item: any) => {
                const p = item.profile;
                if (!p) return null;

                const lifecycle = item.lifecycle || { key: 'lead', label: 'Lead (Sem Licenca)' };
                const onboarding = Array.isArray(p.onboarding) ? p.onboarding[0] : p.onboarding;

                return {
                    user_id: p.id,
                    email: p.email || 'N/A',
                    full_name: p.full_name || 'Usuário',
                    whatsapp: p.whatsapp,
                    partner_consent: p.partner_consent,
                    created_at: item.started_at || p.created_at,
                    last_login_at: p.last_login_at,
                    signup_source: p.signup_source,
                    is_blocked: p.is_blocked || false,
                    account_status: p.account_status,
                    onboarding: onboarding || null,
                    lifecycle,
                    license: item.license || null,
                    partner_opportunity: item.partner_opportunity || {
                        account_id: null,
                        available: false,
                        enabled: false,
                        plan_type: null,
                        updated_at: null,
                        updated_by_email: null,
                        updated_by_name: null,
                        notification_sent_at: null,
                        notification_status: null,
                        notification_error: null
                    },
                    referer_id: p.referred_by_partner_id,
                    referer: p.referred_by_partner_id && partnersMap?.[p.referred_by_partner_id] ? {
                        full_name: partnersMap[p.referred_by_partner_id].full_name,
                        partner_status: partnersMap[p.referred_by_partner_id].partner_status
                    } : null
                };
            }).filter(Boolean) as FreeUserRow[];

            setUsers(formatted);
            setLastLeadsSyncAt(new Date().toISOString());

            // 6. Update Metrics
            if (resMetrics) {
                setMetrics({
                    totalLeads: resMetrics.totalLeads,
                    activeInstallations: resMetrics.activeInstallations,
                    pendingSetup: resMetrics.pendingSetup,
                    conversionRate: resMetrics.totalLeads ? Math.round(resMetrics.activeInstallations / resMetrics.totalLeads * 100) : 0,
                    pendingApprovals: resMetrics.pendingApprovals || 0,
                    waitlistCount: resMetrics.waitlistCount || 0
                });
            }

        } catch (error: any) {
            console.error('Error fetching CRM users:', error);
            toast.error(`Erro ao carregar leads: ${error.message || 'Desconhecido'}`);
        } finally {
            if (silent) {
                setIsRefreshingLeads(false);
            } else {
                setLoading(false);
            }
        }
    };

    const handleRefreshLeads = async () => {
        await fetchUsers({ silent: true });
    };

    const handleWhatsAppContact = (user: FreeUserRow) => {
        if (!user.whatsapp) {
            toast.error('WhatsApp não informado');
            return;
        }

        const cleanPhone = user.whatsapp.replace(/\D/g, '');
        const message = encodeURIComponent(
            `Olá ${user.full_name}, sou da equipe do Super Checkout! 🚀\n\nVi que você se cadastrou recentemente e queria te dar as boas-vindas. Precisa de ajuda para configurar sua primeira instalação?`
        );
        window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
        setContactedUsers(prev => new Set(prev).add(user.user_id));
    };

    const handleEmailContact = (user: FreeUserRow) => {
        const subject = encodeURIComponent('Boas-vindas ao Super Checkout');
        const body = encodeURIComponent(`Olá ${user.full_name},\n\nSeja muito bem-vindo ao Super Checkout! Estamos à disposição para ajudar no que for preciso.`);
        window.location.href = `mailto:${user.email}?subject=${subject}&body=${body}`;
        setContactedUsers(prev => new Set(prev).add(user.user_id));
    };

    const handleCopyLeadField = async (label: string, value?: string | null) => {
        if (!value) {
            toast.error(`${label} indisponivel para este lead.`);
            return;
        }

        try {
            await navigator.clipboard.writeText(value);
            toast.success(`${label} copiado com sucesso.`);
        } catch {
            toast.error(`Nao foi possivel copiar ${label.toLowerCase()}.`);
        }
    };

    const formatLeadDateTime = (value?: string | null) => {
        if (!value) return 'Nao registrado';

        try {
            return new Date(value).toLocaleString('pt-BR');
        } catch {
            return value;
        }
    };

    const handleUpdatePartnerStatus = async (userId: string, newStatus: string, reason?: string) => {
        try {
            const response = await fetch('/api/central/manage-licenses', {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({
                    action: 'manage_partner_status',
                    target_partner_id: userId,
                    new_status: newStatus,
                    reason: reason || `Alteração manual via CRM por ${profile?.full_name}`
                })
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Erro ao atualizar status');

            toast.success(`Status do parceiro atualizado para ${newStatus}`);
            setActionMenuUserId(null);
            fetchUsers();
        } catch (error: any) {
            console.error('Error updating partner status:', error);
            toast.error(`Erro: ${error.message}`);
        }
    };

    const handleUpdateLaunchSettings = async (updates: Partial<LaunchSettingsState>) => {
        try {
            setLaunchSaving(true);
            const nextSettings = {
                ...launchSettings,
                ...updates
            };

            const response = await fetch('/api/central/manage-licenses', {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({
                    action: 'update_launch_settings',
                    settings: nextSettings
                })
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Erro ao salvar controles');

            setLaunchSettings({
                registration_open: result.settings?.registration_open !== false,
                manual_approval_enabled: Boolean(result.settings?.manual_approval_enabled)
            });

            toast.success('Controles operacionais atualizados.');
            fetchLaunchControls();
        } catch (error: any) {
            console.error('Error updating launch settings:', error);
            toast.error(error.message || 'Nao foi possivel atualizar os controles.');
        } finally {
            setLaunchSaving(false);
        }
    };

    const handleApprovalDecision = async (userId: string, decision: 'approve' | 'reject') => {
        const notes = decision === 'reject'
            ? window.prompt('Motivo da rejeicao (opcional):', '') || ''
            : '';

        try {
            setApprovalProcessingId(userId);
            const response = await fetch('/api/central/manage-licenses', {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({
                    action: 'process_registration_approval',
                    user_id: userId,
                    decision,
                    notes
                })
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Erro ao processar aprovacao');

            toast.success(decision === 'approve' ? 'Cadastro aprovado.' : 'Cadastro rejeitado.');
            fetchApprovalQueue();
            fetchUsers();
            fetchLaunchControls();
        } catch (error: any) {
            console.error('Error processing approval:', error);
            toast.error(error.message || 'Nao foi possivel atualizar a fila de aprovacao.');
        } finally {
            setApprovalProcessingId(null);
        }
    };

    const handleCreateInviteToken = async () => {
        try {
            setInviteCreating(true);
            const response = await fetch('/api/central/manage-licenses', {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({
                    action: 'create_invite_token',
                    expires_in_days: inviteExpirationDays
                })
            });

            const result = await response.json();
            if (!result.success || !result.data?.token) {
                throw new Error(result.error || 'Não foi possível gerar o convite.');
            }

            const inviteUrl = getRegisterUrl({ invite: result.data.token });
            setGeneratedInviteUrl(inviteUrl);
            
            // Auto-copy for convenience, but the widget stays open
            try {
                await navigator.clipboard.writeText(inviteUrl);
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
                toast.success('Link gerado e copiado automaticamente.');
            } catch {
                toast.success('Link de convite gerado com sucesso.');
            }

            fetchLaunchControls();
        } catch (error: any) {
            console.error('Error creating invite token:', error);
            toast.error(error.message || 'Não foi possível gerar o convite.');
        } finally {
            setInviteCreating(false);
        }
    };

    const closeBlockTransition = () => {
        if (blockTransition?.stage === 'processing') return;

        if (blockTransitionTimerRef.current) {
            window.clearTimeout(blockTransitionTimerRef.current);
            blockTransitionTimerRef.current = null;
        }

        setBlockTransition(null);
    };

    const toggleBlock = async (user: FreeUserRow) => {
        try {
            const nextBlockedState = !user.is_blocked;
            const nextMode: BlockTransitionState['mode'] = nextBlockedState ? 'block' : 'unblock';

            setBlockingUserId(user.user_id);
            setBlockTransition({
                userId: user.user_id,
                userName: user.full_name,
                mode: nextMode,
                stage: 'processing'
            });
            const response = await fetch('/api/central/manage-licenses', {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({
                    action: 'update_profile',
                    user_id: user.user_id,
                    updates: {
                        is_blocked: nextBlockedState,
                        blocked_at: nextBlockedState ? new Date().toISOString() : null,
                        status: nextBlockedState ? 'suspended' : 'active'
                    }
                })
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Erro ao alterar bloqueio');

            setBlockTransition({
                userId: user.user_id,
                userName: user.full_name,
                mode: nextMode,
                stage: 'success'
            });

            toast.success(user.is_blocked ? 'Usuário desbloqueado' : 'Usuário bloqueado');
            await fetchUsers({ silent: true });

            if (blockTransitionTimerRef.current) {
                window.clearTimeout(blockTransitionTimerRef.current);
            }

            blockTransitionTimerRef.current = window.setTimeout(() => {
                setBlockTransition((current) => (current?.userId === user.user_id ? null : current));
                blockTransitionTimerRef.current = null;
            }, 1400);
        } catch (error: any) {
            console.error('Error toggling block:', error);
            setBlockTransition(null);
            toast.error(`Erro: ${error.message}`);
        } finally {
            setBlockingUserId(null);
        }
    };

    const handleTogglePartnerOpportunity = async (user: FreeUserRow) => {
        if (!user.partner_opportunity.available) {
            toast.error('A conta deste usuario ainda nao foi provisionada para liberar a oportunidade parceiro.');
            return;
        }

        try {
            setPartnerOpportunityUpdatingId(user.user_id);

            const response = await fetch('/api/central/manage-licenses', {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({
                    action: 'update_partner_opportunity_visibility',
                    user_id: user.user_id,
                    enabled: !user.partner_opportunity.enabled
                })
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Erro ao atualizar oportunidade parceiro');

            const nextEnabled = Boolean(result.data?.enabled);
            const nextUpdatedAt = result.data?.updated_at || new Date().toISOString();
            const nextNotificationStatus = result.notification?.status || null;
            const nextNotificationError = result.notification?.error || null;

            setSelectedLead(current => {
                if (!current || current.user_id !== user.user_id) return current;

                return {
                    ...current,
                    partner_opportunity: {
                        ...current.partner_opportunity,
                        enabled: nextEnabled,
                        updated_at: nextUpdatedAt,
                        updated_by_email: result.data?.updated_by_email || current.partner_opportunity.updated_by_email || null,
                        notification_sent_at: result.data?.notification_sent_at ?? current.partner_opportunity.notification_sent_at ?? null,
                        notification_status: nextNotificationStatus,
                        notification_error: nextNotificationError
                    }
                };
            });

            if (nextEnabled) {
                toast.success('Oportunidade parceiro liberada para este usuario.');

                if (nextNotificationStatus === 'sent') {
                    toast.success('E-mail automatico enviado com sucesso.');
                } else if (nextNotificationStatus === 'failed') {
                    toast.error('A liberacao foi salva, mas o e-mail automatico falhou.');
                } else if (nextNotificationStatus === 'skipped') {
                    toast.info('A liberacao foi salva. O e-mail automatico foi apenas ignorado porque este ambiente ainda nao tem envio configurado.');
                }
            } else {
                toast.success('Oportunidade parceiro ocultada para este usuario.');
            }

            await fetchUsers({ silent: true });
        } catch (error: any) {
            console.error('Error updating partner opportunity visibility:', error);
            toast.error(error.message || 'Nao foi possivel atualizar a oportunidade parceiro.');
        } finally {
            setPartnerOpportunityUpdatingId(null);
        }
    };

    // Calculate Partner Performance for the summary
    const partnerPerformance = partners.map(p => {
        const leadCount = users.filter(u => u.referer_id === p.id).length;
        return { ...p, leadCount };
    }).sort((a, b) => b.leadCount - a.leadCount).slice(0, 4);

    // Client-side quick search (can be moved to server later if needed)
    const filteredUsers = users.filter(u => {
        const matchesSearch =
            u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            u.full_name.toLowerCase().includes(searchTerm.toLowerCase());

        if (statusFilter === 'blocked') return matchesSearch && u.is_blocked;
        if (statusFilter === 'setup_pending') {
            return matchesSearch && !u.is_blocked && u.lifecycle.key === 'license_active';
        }

        return matchesSearch;
    });

    if (isWhiteLabel || !isAdmin) {
        return <div className="min-h-screen bg-[#05050A] flex items-center justify-center text-gray-400">Acesso negado.</div>;
    }
    // Updated security check to use the new role if context provides it,

    // but the backend RLS will now handle the real enforcement.
    const allowedRoles = ['owner', 'master_admin', 'admin'];
    if (!profile?.role || !allowedRoles.includes(profile.role)) {
        return <div className="p-8 text-center text-gray-500">Acesso negado.</div>;
    }

    return (
        <Layout maxWidth="max-w-full">
            <div className="space-y-12 pb-24">
                
            {/* Tactical Header Architecture */}
            <div 
                className="flex flex-wrap items-start lg:items-center justify-between gap-8 mb-12 p-8 rounded-[2.5rem] border-2 border-dashed border-white/20 backdrop-blur-3xl relative transition-all shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
                style={{ 
                    background: 'linear-gradient(135deg, rgba(0,0,0,0.4) 0%, rgba(138,43,226,0.1) 100%)',
                }}
            >
                {/* Background Decor - Isolated Overflow */}
                <div className="absolute inset-0 overflow-hidden rounded-[2.5rem] pointer-events-none">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] -mr-32 -mt-32" />
                </div>
                
                <div className="flex flex-col gap-6 relative z-10">
                    <div>
                        <h1 className="text-3xl xl:text-5xl font-black text-white italic uppercase tracking-tighter leading-none mb-4">
                            GESTÃO DE <span className="text-primary">LEADS</span>
                        </h1>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 text-white/40 text-[10px] font-bold uppercase tracking-[0.3em]">
                                <Activity className="w-3.5 h-3.5" />
                                Intelligence Center
                            </div>
                            <div className="w-1 h-1 rounded-full bg-white/20" />
                            <div className="flex items-center gap-2 text-white/60 text-[10px] font-mono uppercase tracking-[0.2em]">
                                <Users className="w-3.5 h-3.5 text-primary" />
                                {totalCount} Leads Logged
                            </div>
                        </div>
                    </div>

                    {/* Quick Metrics Integrated - HUD Style */}
                    <div className="flex flex-row flex-nowrap overflow-x-auto gap-3 mt-2 pb-2 md:pb-0 custom-scrollbar">
                        <div className="bg-black/40 px-5 py-3 rounded-2xl border border-white/5 flex items-center gap-4 group hover:border-primary/30 transition-all shrink-0">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                <Users className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-[8px] font-black uppercase tracking-widest text-primary/60 mb-0.5 whitespace-nowrap">Total de Leads</p>
                                <p className="text-lg font-portal-display text-white whitespace-nowrap">{totalCount}</p>
                            </div>
                        </div>
                        <div className="bg-black/40 px-5 py-3 rounded-2xl border border-white/5 flex items-center gap-4 group hover:border-emerald-500/30 transition-all shrink-0">
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                                <Zap className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-[8px] font-black uppercase tracking-widest text-emerald-500/60 mb-0.5 whitespace-nowrap">Instalações Ativas</p>
                                <p className="text-lg font-portal-display text-white whitespace-nowrap">{metrics.activeInstallations}</p>
                            </div>
                        </div>
                        <div className="bg-black/40 px-5 py-3 rounded-2xl border border-white/5 flex items-center gap-4 group hover:border-blue-500/30 transition-all shrink-0">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                                <Activity className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-[8px] font-black uppercase tracking-widest text-blue-500/60 mb-0.5 whitespace-nowrap">SaaS Lifecycle</p>
                                <p className="text-lg font-portal-display text-white whitespace-nowrap">{metrics.pendingSetup} <span className="text-[9px] text-gray-600 font-sans">Wait</span></p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Registration Controls Integrated */}
                <div className="flex flex-col items-start lg:items-end gap-6 relative z-10 w-full lg:w-auto mt-4 lg:mt-0 pt-6 lg:pt-0 border-t lg:border-t-0 border-white/5">
                    <div className="flex items-center gap-2 bg-black/40 p-1.5 rounded-full border border-white/5 backdrop-blur-md shadow-2xl relative">
                        <div className="flex items-center gap-4 pl-4 pr-2">
                             <div className="flex flex-col items-end">
                                <div className="flex items-center gap-3">
                                    <div className="flex flex-col items-end">
                                        <span className={`text-[8px] font-black uppercase tracking-widest ${launchSettings.registration_open ? 'text-emerald-500/60' : 'text-red-500/60'}`}>
                                            {launchSettings.registration_open ? 'CAD_ABERTO' : 'CAD_FECHADO'}
                                        </span>
                                    </div>
                                    
                                    <label className="relative inline-flex items-center cursor-pointer group/sw">
                                        <input 
                                            type="checkbox" 
                                            className="sr-only peer"
                                            disabled={launchSaving}
                                            checked={launchSettings.registration_open}
                                            onChange={(e) => handleUpdateLaunchSettings({ registration_open: e.target.checked })}
                                        />
                                        <div className={`w-10 h-5 bg-white/5 border border-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-800 after:rounded-full after:h-4 after:w-4 after:transition-all duration-300 peer-checked:after:bg-white ${launchSettings.registration_open ? 'peer-checked:bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'peer-checked:bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]'}`}>
                                            {launchSaving && (
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <Loader2 className="w-3 h-3 text-white animate-spin opacity-40" />
                                                </div>
                                            )}
                                        </div>
                                    </label>
                                </div>
                             </div>
                             
                             <div className="h-8 w-px bg-white/10 mx-1"></div>
                             
                             <div className="relative">
                                <button 
                                    onClick={() => setShowInviteWidget(true)}
                                    title="Invite Link Management"
                                    className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${showInviteWidget ? 'bg-primary text-white shadow-[0_0_15px_rgba(138,43,226,0.4)]' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                                >
                                    <Copy className="w-4 h-4" />
                                </button>
                             </div>
                      </div>

                    <div className="hidden lg:flex flex-col items-end pr-4">
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] mb-2 leading-none">Security Protocol</span>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-mono text-emerald-500/60 uppercase tracking-widest">Active Scan</span>
                        </div>
                </div>
            </div>
        </div>
    </div>
</div>

            {/* TACTICAL FILTER OVERLAY */}
            <div className="mb-0 flex flex-col lg:flex-row gap-3 items-center justify-between bg-black/20 p-3 rounded-t-[2.5rem] border-x border-t border-white/5 backdrop-blur-xl">
                <div className="w-full lg:w-96 relative group">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-white/10 group-focus-within:text-primary transition-colors" />
                    <input 
                        type="text" 
                        placeholder="SCAN LEADS IDENTITY..."
                        className="w-full bg-black/40 border border-white/5 rounded-2xl pl-14 pr-6 py-4 text-sm text-white focus:outline-none focus:border-primary/50 transition-all font-black italic tracking-tighter placeholder:text-white/5"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-3 w-full lg:w-auto">
                    {/* Partner Filter */}
                    <div className="relative flex-1 lg:w-64 group/s">
                        <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/10 group-focus-within/s:text-primary transition-colors" />
                        <select
                            className="w-full bg-black/40 border border-white/5 rounded-2xl pl-12 pr-10 py-4 text-[10px] text-white/60 focus:outline-none focus:border-primary/50 appearance-none cursor-pointer font-black uppercase tracking-widest"
                            value={partnerFilter}
                            onChange={(e) => setPartnerFilter(e.target.value)}
                        >
                            <option value="all">ALL PARTNERS</option>
                            {partners.map(p => (
                                <option key={p.id} value={p.id}>{p.full_name.toUpperCase()}</option>
                            ))}
                        </select>
                        <MoreVertical className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/10 rotate-90 pointer-events-none group-hover/s:text-white/40 transition-colors" />
                    </div>

                    {/* Status Toggle */}
                    <div className="flex items-center gap-2 bg-black/40 p-1.5 rounded-full border border-white/5 backdrop-blur-md">
                        {['all', 'setup_pending', 'blocked'].map((f) => (
                            <button
                                key={f}
                                onClick={() => setStatusFilter(f as any)}
                                className={`px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
                                    statusFilter === f ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-500 hover:text-white'
                                }`}
                            >
                                {f === 'all' ? 'FULL LIST' : f === 'setup_pending' ? 'PENDING' : 'BLOCKED'}
                            </button>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={handleRefreshLeads}
                        disabled={loading || isRefreshingLeads}
                        className="shrink-0 inline-flex items-center gap-2 bg-black/40 border border-white/5 rounded-2xl px-4 py-4 text-[9px] font-black uppercase tracking-[0.25em] text-white/60 hover:text-white hover:border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        title="Atualizar apenas a grade de leads"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingLeads ? 'animate-spin text-primary' : 'text-white/30'}`} />
                        <span>{isRefreshingLeads ? 'Atualizando' : 'Atualizar'}</span>
                    </button>
                </div>
            </div>

             {/* MAIN DATA TABLE: PREMIUM GLASS */}
            <div className="bg-black/40 border-x border-b border-white/5 rounded-b-[2.5rem] backdrop-blur-3xl overflow-hidden min-h-[400px]">
                <div className="px-6 py-3 border-b border-white/[0.03] bg-white/[0.01] flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.25em]">
                        <div className={`w-2 h-2 rounded-full ${isRefreshingLeads ? 'bg-primary animate-pulse' : 'bg-emerald-500/70'}`} />
                        <span className={isRefreshingLeads ? 'text-primary/80' : 'text-white/30'}>
                            {isRefreshingLeads ? 'Synchronizing leads node' : 'Leads node synced'}
                        </span>
                    </div>
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/20">
                        {lastLeadsSyncAt
                            ? `Last sync ${new Date(lastLeadsSyncAt).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit'
                            })}`
                            : 'Last sync pending'}
                    </p>
                </div>
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-40">
                        <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                        <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em]">Synchronizing Registry...</p>
                    </div>
                ) : filteredUsers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-40 text-white/5 text-center">
                        <Users className="w-16 h-16 mb-4 opacity-10" />
                        <p className="text-[10px] font-black uppercase tracking-[0.4em]">No leads detected in current node</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/[0.03] bg-white/[0.01]">
                                    <th className="px-3 py-4 text-[9px] font-black text-white/10 uppercase tracking-[0.3em] font-mono whitespace-nowrap italic">Lead Identity</th>
                                    <th className="px-3 py-4 text-[9px] font-black text-white/10 uppercase tracking-[0.3em] font-mono whitespace-nowrap italic text-center">Plan & Context</th>
                                    <th className="px-3 py-4 text-[9px] font-black text-white/10 uppercase tracking-[0.3em] font-mono whitespace-nowrap italic text-center">Partner Opportunity</th>
                                    <th className="px-3 py-4 text-[9px] font-black text-white/10 uppercase tracking-[0.3em] font-mono whitespace-nowrap italic text-center">Onboarding</th>
                                    <th className="px-3 py-4 text-[9px] font-black text-white/10 uppercase tracking-[0.3em] font-mono whitespace-nowrap italic">Temporalidade</th>
                                    <th className="px-3 py-4 text-[9px] font-black text-white/10 uppercase tracking-[0.3em] font-mono whitespace-nowrap italic text-center">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.03]">
                                {filteredUsers.map((u) => {
                                    const isNewToday = new Date(u.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000);
                                    const accountMeta = getAccountStatusMeta(u);
                                    return (
                                        <tr key={u.user_id} className="group hover:bg-white/[0.02] transition-colors relative border-b border-white/[0.02]">
                                            <td className="px-3 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-portal-display group-hover:scale-110 transition-transform relative shrink-0">
                                                        {u.full_name.charAt(0).toUpperCase()}
                                                        {isNewToday && (
                                                            <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse border border-black" />
                                                        )}
                                                    </div>
                                                    <div className="max-w-[160px] min-w-0">
                                                        <p className="text-[12px] font-bold text-white uppercase italic group-hover:text-primary transition-colors truncate leading-tight">
                                                            {u.full_name}
                                                        </p>
                                                        <p className="text-[9px] font-mono text-white/20 truncate">{u.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-4">
                                                <div className="flex flex-col items-center gap-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${
                                                            lifecycleBadgeClass[u.lifecycle.key]
                                                        }`}>
                                                            {u.lifecycle.label}
                                                        </span>
                                                        {u.license && (
                                                            <span className="text-[7px] font-black text-white/35 uppercase tracking-widest truncate max-w-[72px]">
                                                                {u.license.plan_label}
                                                            </span>
                                                        )}
                                                        {u.referer && (
                                                            <span className="text-[7px] font-black text-white/20 uppercase tracking-widest truncate max-w-[60px]">
                                                                @{u.referer.full_name.split(' ')[0]}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1 opacity-20 group-hover:opacity-100 transition-opacity">
                                                        <Shield className={`w-2.5 h-2.5 ${accountMeta.iconClass}`} />
                                                        <p className={`text-[7px] font-black uppercase tracking-widest ${accountMeta.textClass}`}>{accountMeta.label}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-4">
                                                <div className="flex flex-col items-center gap-2 min-w-[160px]">
                                                    <span className={`text-[7px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${
                                                        !u.partner_opportunity.available
                                                            ? 'border-white/10 bg-white/[0.03] text-white/25'
                                                            : u.partner_opportunity.enabled
                                                                ? 'border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-300'
                                                                : 'border-white/10 bg-white/[0.03] text-white/45'
                                                    }`}>
                                                        {!u.partner_opportunity.available
                                                            ? 'Sem Conta'
                                                            : u.partner_opportunity.enabled
                                                                ? 'ON'
                                                                : 'OFF'}
                                                    </span>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleTogglePartnerOpportunity(u)}
                                                        disabled={!u.partner_opportunity.available || partnerOpportunityUpdatingId === u.user_id}
                                                        className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-[8px] font-black uppercase tracking-[0.24em] transition-all ${
                                                            !u.partner_opportunity.available
                                                                ? 'border-white/5 bg-black/20 text-white/20 cursor-not-allowed'
                                                                : u.partner_opportunity.enabled
                                                                    ? 'border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-200 hover:bg-fuchsia-500/15'
                                                                    : 'border-white/10 bg-white/[0.03] text-white/60 hover:text-white hover:border-primary/30'
                                                        } ${partnerOpportunityUpdatingId === u.user_id ? 'opacity-70 cursor-wait' : ''}`}
                                                        title={!u.partner_opportunity.available ? 'Disponivel apos a provisao da conta/licenca' : u.partner_opportunity.enabled ? 'Ocultar oportunidade parceiro' : 'Liberar oportunidade parceiro'}
                                                    >
                                                        {partnerOpportunityUpdatingId === u.user_id ? (
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        ) : (
                                                            <TrendingUp className="w-3.5 h-3.5" />
                                                        )}
                                                        <span>{u.partner_opportunity.enabled ? 'Ocultar' : 'Liberar'}</span>
                                                    </button>

                                                    <p className="text-[6px] font-black uppercase tracking-[0.18em] text-white/25 text-center">
                                                        {!u.partner_opportunity.available
                                                            ? 'Conta/licenca pendente'
                                                            : u.partner_opportunity.notification_status === 'sent'
                                                                ? 'Email enviado'
                                                                : u.partner_opportunity.enabled
                                                                    ? 'Portal liberado'
                                                                    : 'Oculto por padrao'}
                                                    </p>
                                                </div>
                                            </td>
                                            <td className="px-3 py-4">
                                                <div className="flex gap-1.5 justify-center">
                                                    <div className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all ${
                                                        u.onboarding?.domain_configured ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-gray-800 border-white/5 text-gray-600'
                                                    }`} title="Domain Configured">
                                                        <Globe className="w-3.5 h-3.5" />
                                                    </div>
                                                    <div className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all ${
                                                        u.onboarding?.gateway_configured ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-gray-800 border-white/5 text-gray-600'
                                                    }`} title="Gateway Configured">
                                                        <Zap className="w-3.5 h-3.5" />
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-4">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2 text-white/30 text-[9px] font-mono">
                                                        <Clock className="w-3 h-3 text-primary/40" />
                                                        <span>{new Date(u.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                                                    </div>
                                                    <p className="text-[6px] font-black text-gray-800 uppercase tracking-[0.1em] mt-0.5 italic">
                                                        {u.last_login_at ? 'Log: ' + new Date(u.last_login_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : 'LOG: NEVER'}
                                                    </p>
                                                </div>
                                            </td>
                                            <td className="px-3 py-4">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <button 
                                                        onClick={() => setSelectedLead(u)}
                                                        className="w-8 h-8 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all active:scale-90"
                                                        title="Detalhes do lead"
                                                    >
                                                        <LayoutIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                    {u.whatsapp && (
                                                        <button 
                                                            onClick={() => handleWhatsAppContact(u)}
                                                            className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 transition-all active:scale-90"
                                                            title="WhatsApp"
                                                        >
                                                            <Smartphone className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={() => handleEmailContact(u)}
                                                        className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 hover:bg-blue-500/20 transition-all active:scale-90"
                                                        title="Email"
                                                    >
                                                        <Mail className="w-3.5 h-3.5" />
                                                    </button>
                                                    <div className="w-px h-5 bg-white/5 mx-0.5" />
                                                    <button 
                                                        onClick={() => toggleBlock(u)}
                                                        disabled={blockingUserId === u.user_id}
                                                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90 ${
                                                            u.is_blocked 
                                                            ? 'bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20' 
                                                            : 'bg-white/5 border border-white/5 text-gray-600 hover:text-white hover:bg-white/10'
                                                        } ${blockingUserId === u.user_id ? 'opacity-70 cursor-wait' : ''}`}
                                                        title={u.is_blocked ? 'Desbloquear' : 'Bloquear'}
                                                    >
                                                        {blockingUserId === u.user_id ? (
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        ) : (
                                                            <Ban className="w-3.5 h-3.5" />
                                                        )}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* PREMIUM NUMERIC PAGINATION */}
                {!loading && totalPages > 1 && (
                    <div className="px-8 py-10 border-t border-white/[0.03] flex flex-col items-center gap-6 bg-black/20">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                                disabled={page === 1}
                                className="w-12 h-12 rounded-2xl border border-white/5 bg-black/40 flex items-center justify-center text-gray-500 hover:text-white disabled:opacity-20 transition-all active:scale-95"
                            >
                                <ArrowRight className="w-5 h-5 rotate-180" />
                            </button>

                            <div className="flex items-center gap-2">
                                {(() => {
                                    const range = [];
                                    const maxVisible = 5;

                                    if (totalPages <= maxVisible) {
                                      for (let i = 1; i <= totalPages; i++) range.push(i);
                                    } else {
                                      let start = Math.max(1, page - 1);
                                      let end = Math.min(totalPages, page + 1);

                                      if (page <= 3) end = Math.min(totalPages, 4);
                                      if (page >= totalPages - 2) start = Math.max(1, totalPages - 3);

                                      if (start > 1) {
                                        range.push(1);
                                        if (start > 2) range.push('...');
                                      }

                                      for (let i = start; i <= end; i++) range.push(i);

                                      if (end < totalPages) {
                                        if (end < totalPages - 1) range.push('...');
                                        range.push(totalPages);
                                      }
                                    }

                                    return range.map((p, idx) => (
                                      p === '...' ? (
                                        <span key={`dots-${idx}`} className="px-2 text-gray-700 font-black">...</span>
                                      ) : (
                                        <button
                                          key={p}
                                          onClick={() => setPage(p as number)}
                                          className={`w-12 h-12 rounded-2xl text-[10px] font-black uppercase transition-all border ${page === p
                                            ? 'bg-white text-black border-white shadow-xl'
                                            : 'bg-black/40 text-gray-500 border-white/5 hover:text-white'
                                            }`}
                                        >
                                          {p}
                                        </button>
                                      )
                                    ));
                                })()}
                            </div>

                            <button
                                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={page === totalPages}
                                className="w-12 h-12 rounded-2xl border border-white/5 bg-black/40 flex items-center justify-center text-gray-500 hover:text-white disabled:opacity-20 transition-all active:scale-95"
                            >
                                <ArrowRight className="w-5 h-5" />
                            </button>
                        </div>

                        <p className="text-[10px] text-gray-700 font-black uppercase tracking-[0.3em] font-mono">
                            NODE {page} // REGISTRY {totalCount} ENTRIES DETECTED
                        </p>
                    </div>
                )}
            </div>
            
            <Modal
                isOpen={Boolean(selectedLead)}
                onClose={() => setSelectedLead(null)}
                title={
                    selectedLead ? (
                        <div className="flex items-center gap-3 uppercase italic tracking-tighter">
                            <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-portal-display">
                                {selectedLead.full_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                                <p className="text-lg font-black text-white truncate">{selectedLead.full_name}</p>
                                <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/35 truncate">
                                    Lead Intelligence Card
                                </p>
                            </div>
                        </div>
                    ) : null
                }
                className="max-w-3xl border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.25)]"
            >
                {selectedLead && (
                    <div className="space-y-8">
                        <div className="grid gap-4 md:grid-cols-[1.3fr,0.9fr]">
                            <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-6 space-y-4">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={`text-[10px] font-black uppercase tracking-[0.28em] px-3 py-1 rounded-full border ${lifecycleBadgeClass[selectedLead.lifecycle.key]}`}>
                                        {selectedLead.lifecycle.label}
                                    </span>
                                    <span className={`text-[10px] font-black uppercase tracking-[0.28em] px-3 py-1 rounded-full border ${getAccountStatusMeta(selectedLead).textClass} border-white/10 bg-white/5`}>
                                        {getAccountStatusMeta(selectedLead).label}
                                    </span>
                                    {selectedLead.license && (
                                        <span className="text-[10px] font-black uppercase tracking-[0.28em] px-3 py-1 rounded-full border border-white/10 bg-white/5 text-white/60">
                                            {selectedLead.license.plan_label}
                                        </span>
                                    )}
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                        <p className="text-[9px] font-black uppercase tracking-[0.32em] text-white/25 mb-2">Cadastro</p>
                                        <p className="text-sm font-semibold text-white">{formatLeadDateTime(selectedLead.created_at)}</p>
                                    </div>
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                        <p className="text-[9px] font-black uppercase tracking-[0.32em] text-white/25 mb-2">Ultimo Login</p>
                                        <p className="text-sm font-semibold text-white">{formatLeadDateTime(selectedLead.last_login_at)}</p>
                                    </div>
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                        <p className="text-[9px] font-black uppercase tracking-[0.32em] text-white/25 mb-2">Origem</p>
                                        <p className="text-sm font-semibold text-white uppercase">{selectedLead.signup_source || 'Direct'}</p>
                                    </div>
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                        <p className="text-[9px] font-black uppercase tracking-[0.32em] text-white/25 mb-2">Parceiro</p>
                                        <p className="text-sm font-semibold text-white">
                                            {selectedLead.referer ? selectedLead.referer.full_name : 'Nao atribuido'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-6 space-y-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-primary/70">Contato Rapido</p>
                                <div className="grid gap-3">
                                    <button
                                        type="button"
                                        onClick={() => handleCopyLeadField('Nome', selectedLead.full_name)}
                                        className="w-full flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-white/80 hover:bg-white/[0.05] transition-all"
                                    >
                                        <span className="text-sm font-semibold">Copiar nome</span>
                                        <Copy className="w-4 h-4 text-white/35" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleCopyLeadField('E-mail', selectedLead.email)}
                                        className="w-full flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-white/80 hover:bg-white/[0.05] transition-all"
                                    >
                                        <span className="text-sm font-semibold">Copiar e-mail</span>
                                        <Mail className="w-4 h-4 text-blue-300/80" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleCopyLeadField('Telefone', selectedLead.whatsapp)}
                                        className="w-full flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-white/80 hover:bg-white/[0.05] transition-all"
                                    >
                                        <span className="text-sm font-semibold">Copiar telefone</span>
                                        <Smartphone className="w-4 h-4 text-emerald-300/80" />
                                    </button>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                    <button
                                        type="button"
                                        onClick={() => handleEmailContact(selectedLead)}
                                        className="rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm font-black uppercase tracking-[0.22em] text-blue-300 hover:bg-blue-500/15 transition-all"
                                    >
                                        Abrir E-mail
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleWhatsAppContact(selectedLead)}
                                        disabled={!selectedLead.whatsapp}
                                        className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-black uppercase tracking-[0.22em] text-emerald-300 hover:bg-emerald-500/15 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        Abrir WhatsApp
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
                                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/25 mb-4">Identidade</p>
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-white/20 mb-1">E-mail</p>
                                        <p className="text-sm text-white break-all">{selectedLead.email}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-white/20 mb-1">Telefone</p>
                                        <p className="text-sm text-white">{selectedLead.whatsapp || 'Nao informado'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-white/20 mb-1">Consentimento parceiro</p>
                                        <p className="text-sm text-white">{selectedLead.partner_consent ? 'Sim' : 'Nao'}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
                                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/25 mb-4">Operacao</p>
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-white/20 mb-1">Licenca</p>
                                        <p className="text-sm text-white">
                                            {selectedLead.license
                                                ? `${selectedLead.license.plan_label} • ${selectedLead.license.status || 'Sem status'}`
                                                : 'Sem licenca ativa'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-white/20 mb-1">Instalacoes</p>
                                        <p className="text-sm text-white">
                                            {selectedLead.license
                                                ? `${selectedLead.license.active_installations}/${selectedLead.license.total_installations} registradas`
                                                : 'Nenhuma instalacao vinculada'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-white/20 mb-1">Onboarding</p>
                                        <p className="text-sm text-white">
                                            Dominio: {selectedLead.onboarding?.domain_configured ? 'OK' : 'Pendente'} • Gateway: {selectedLead.onboarding?.gateway_configured ? 'OK' : 'Pendente'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-white/20 mb-1">Oportunidade Parceiro</p>
                                        <p className="text-sm text-white">
                                            {!selectedLead.partner_opportunity.available
                                                ? 'Conta ainda nao provisionada'
                                                : selectedLead.partner_opportunity.enabled
                                                    ? 'Liberada'
                                                    : 'Oculta por padrao'}
                                        </p>
                                        <p className="text-[10px] text-white/35 mt-1">
                                            {selectedLead.partner_opportunity.notification_status === 'sent'
                                                ? `E-mail enviado em ${formatLeadDateTime(selectedLead.partner_opportunity.notification_sent_at)}`
                                                : selectedLead.partner_opportunity.updated_at
                                                    ? `Ultima alteracao em ${formatLeadDateTime(selectedLead.partner_opportunity.updated_at)}`
                                                    : 'Sem alteracoes registradas'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>

            {/* TACTICAL INVITE FACTORY MODAL - ROOT POSITION FOR DEPTH INTEGRITY */}
            <Modal
                isOpen={showInviteWidget}
                onClose={() => setShowInviteWidget(false)}
                title={
                    <div className="flex items-center gap-3 italic uppercase font-black tracking-tighter">
                        <Zap className="w-5 h-5 text-primary stroke-[3]" />
                        <span>Invite <span className="text-primary italic">Factory</span></span>
                    </div>
                }
                className="max-w-md border-primary/20 shadow-[0_0_50px_rgba(138,43,226,0.15)]"
            >
                <div className="space-y-8">
                    <div className="bg-white/[0.03] border border-white/5 p-5 rounded-2xl">
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-3 italic">Operational Briefing</p>
                        <p className="text-[11px] text-white/80 leading-relaxed font-medium">
                            Gere chaves de acesso únicas para novos operadores. Cada link possui um protocolo de expiração rígido para segurança do ecossistema.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-1">
                            <label className="text-[9px] font-black text-primary uppercase tracking-[0.4em] italic">Protocolo de Tempo</label>
                            <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest">{inviteExpirationDays} Days Active</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {[7, 15, 30].map(d => (
                                <button 
                                    key={d}
                                    type="button"
                                    onClick={() => setInviteExpirationDays(d)}
                                    className={`relative overflow-hidden h-14 rounded-xl text-[10px] font-black transition-all border group ${
                                        inviteExpirationDays === d 
                                        ? 'bg-primary/20 border-primary text-white shadow-[0_0_20px_rgba(138,43,226,0.2)]' 
                                        : 'bg-black/40 border-white/5 text-gray-600 hover:border-white/20 hover:text-white'
                                    }`}
                                >
                                    <div className="relative z-10 uppercase italic tracking-widest">{d} Dias</div>
                                    {inviteExpirationDays === d && (
                                        <div className="absolute inset-0 bg-gradient-to-t from-primary/10 to-transparent pointer-events-none" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {generatedInviteUrl ? (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                            <div className="flex items-center justify-between px-1">
                                <label className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.4em] italic">Key Generated Successfully</label>
                            </div>
                            <div className="relative group/key">
                                <div className="absolute -inset-0.5 bg-emerald-500/20 rounded-2xl blur opacity-0 group-hover/key:opacity-100 transition duration-500" />
                                <div className="relative flex gap-2">
                                    <div className="flex-1 bg-black/60 border border-white/10 rounded-2xl px-5 py-4 focus-within:border-emerald-500/50 transition-all shadow-inner">
                                        <input 
                                            type="text" 
                                            readOnly 
                                            value={generatedInviteUrl}
                                            className="w-full bg-transparent text-[10px] text-emerald-400 font-mono tracking-wider focus:outline-none"
                                        />
                                    </div>
                                    <Button 
                                        variant="secondary"
                                        onClick={() => {
                                            navigator.clipboard.writeText(generatedInviteUrl);
                                            setLinkCopied(true);
                                            setTimeout(() => setLinkCopied(false), 2000);
                                            toast.success('Access Link Secured');
                                        }}
                                        className={`px-5 rounded-2xl border transition-all ${linkCopied ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white/5 border-white/5 text-emerald-500 hover:bg-emerald-500/20'}`}
                                    >
                                        {linkCopied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-20 flex items-center justify-center border-2 border-dashed border-white/5 rounded-2xl bg-black/20">
                            <p className="text-[8px] font-black text-gray-700 uppercase tracking-[0.5em] italic">Waiting for Protocol Generation...</p>
                        </div>
                    )}

                    <div className="pt-6 flex justify-end gap-4 border-t border-white/5 mt-4">
                        <button 
                            onClick={() => setShowInviteWidget(false)}
                            className="px-6 py-3 text-[10px] font-black text-gray-600 uppercase tracking-widest hover:text-white transition-colors italic"
                        >
                            Abort Operation
                        </button>
                        <Button 
                            variant="primary"
                            onClick={handleCreateInviteToken}
                            isLoading={inviteCreating}
                            className="px-8 h-12 rounded-[1rem] shadow-[0_10px_20px_rgba(138,43,226,0.3)] group"
                        >
                            <span className="flex items-center gap-2 italic font-black uppercase tracking-widest text-[10px]">
                                {generatedInviteUrl ? 'Generate New Key' : 'Initiate Protocol'}
                                <Zap className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
                            </span>
                        </Button>
                    </div>
                </div>
            </Modal>

            {blockTransition && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/80 backdrop-blur-md"
                        onClick={closeBlockTransition}
                    />

                    <div
                        className={`relative w-full max-w-xl overflow-hidden rounded-[2rem] border shadow-[0_30px_120px_rgba(0,0,0,0.55)] backdrop-blur-3xl ${
                            blockTransition.mode === 'block'
                                ? 'bg-[linear-gradient(135deg,rgba(24,4,8,0.92),rgba(127,29,29,0.38))] border-red-500/20'
                                : 'bg-[linear-gradient(135deg,rgba(3,18,13,0.92),rgba(16,185,129,0.20))] border-emerald-500/20'
                        }`}
                    >
                        <div
                            className={`absolute inset-0 opacity-80 ${
                                blockTransition.mode === 'block'
                                    ? 'bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.25),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(248,113,113,0.18),transparent_40%)]'
                                    : 'bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.25),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(52,211,153,0.18),transparent_40%)]'
                            }`}
                        />

                        <div className="relative px-8 py-8 sm:px-10 sm:py-10">
                            <div className="flex items-start justify-between gap-6 mb-8">
                                <div>
                                    <p
                                        className={`text-[10px] font-black uppercase tracking-[0.45em] mb-3 ${
                                            blockTransition.mode === 'block' ? 'text-red-300/70' : 'text-emerald-300/70'
                                        }`}
                                    >
                                        {blockTransition.mode === 'block' ? 'Security Lock Sequence' : 'Access Restore Sequence'}
                                    </p>
                                    <h3 className="text-2xl sm:text-3xl font-black uppercase italic tracking-tighter text-white">
                                        {blockTransition.mode === 'block' ? 'Bloqueio Operacional' : 'Desbloqueio Operacional'}
                                    </h3>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeBlockTransition}
                                    disabled={blockTransition.stage === 'processing'}
                                    className="w-11 h-11 rounded-2xl border border-white/10 bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <span className="sr-only">Fechar</span>
                                    <MoreVertical className="w-4 h-4 rotate-45 mx-auto" />
                                </button>
                            </div>

                            <div className="grid gap-8 sm:grid-cols-[120px,1fr] sm:items-center">
                                <div className="flex justify-center">
                                    {blockTransition.stage === 'processing' ? (
                                        <div className="relative flex items-center justify-center w-28 h-28">
                                            <div
                                                className={`absolute inset-0 rounded-full border ${
                                                    blockTransition.mode === 'block' ? 'border-red-500/20' : 'border-emerald-500/20'
                                                }`}
                                            />
                                            <div
                                                className={`absolute inset-4 rounded-full border animate-ping ${
                                                    blockTransition.mode === 'block' ? 'border-red-400/30' : 'border-emerald-400/30'
                                                }`}
                                            />
                                            <Loader2
                                                className={`w-12 h-12 animate-spin ${
                                                    blockTransition.mode === 'block' ? 'text-red-300' : 'text-emerald-300'
                                                }`}
                                            />
                                        </div>
                                    ) : (
                                        <div
                                            className={`w-28 h-28 rounded-full border flex items-center justify-center ${
                                                blockTransition.mode === 'block'
                                                    ? 'border-red-400/25 bg-red-500/10 text-red-200'
                                                    : 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
                                            }`}
                                        >
                                            <CheckCircle className="w-12 h-12" />
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-4">
                                    <p className="text-[11px] font-black uppercase tracking-[0.35em] text-white/25">
                                        Lead Target
                                    </p>
                                    <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-5 py-4">
                                        <p className="text-xl font-black text-white uppercase italic tracking-tight">
                                            {blockTransition.userName}
                                        </p>
                                        <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/30 mt-2">
                                            Registry synchronized with central profile
                                        </p>
                                    </div>

                                    {blockTransition.stage === 'processing' ? (
                                        <div className="space-y-2">
                                            <p className="text-base text-white/90 font-semibold">
                                                {blockTransition.mode === 'block'
                                                    ? 'Aplicando bloqueio e propagando a restricao para o portal.'
                                                    : 'Removendo bloqueio e restaurando o acesso operacional ao portal.'}
                                            </p>
                                            <p className="text-sm text-white/50 leading-relaxed">
                                                Aguarde alguns instantes enquanto o CRM confirma o estado do perfil e sincroniza a resposta visual da sessao.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <p className="text-base text-white/90 font-semibold">
                                                {blockTransition.mode === 'block'
                                                    ? 'Usuario bloqueado com sucesso.'
                                                    : 'Usuario desbloqueado com sucesso.'}
                                            </p>
                                            <p className="text-sm text-white/50 leading-relaxed">
                                                O CRM ja refletiu a alteracao e o portal respondera a esse novo estado na proxima validacao da sessao.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
    </Layout>
);
};


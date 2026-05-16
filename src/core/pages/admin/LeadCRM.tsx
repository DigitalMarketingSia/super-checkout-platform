import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../services/supabase';
import { CENTRAL_CONFIG } from '../../config/central';
import { getRegisterUrl } from '../../config/platformUrls';
import { useAuth } from '../../context/AuthContext';
import { useFeatures } from '../../hooks/useFeatures';
import { Layout } from '../../components/Layout';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
    AlertCircle, Loader2, Globe, RefreshCw, Plus, Trash2, MessageCircle, Lock
} from 'lucide-react';

import { toast } from 'sonner';
import { Modal } from '../../components/ui/Modal';
import { Loading } from '../../components/ui/Loading';

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
    waitlist_whatsapp_group_url: string;
    waitlist_whatsapp_groups: WaitlistWhatsappGroup[];
}

interface WaitlistWhatsappGroup {
    id: string;
    name: string;
    url: string;
    active: boolean;
    clickLimit: number;
    clicks: number;
}

interface RegistrationWaitlistLead {
    id: string;
    email: string;
    source: string;
    metadata?: {
        name?: string | null;
        ip?: string | null;
        user_agent?: string | null;
        invite_url?: string | null;
        invite_status?: 'draft' | 'sent' | string | null;
        invite_sent_at?: string | null;
        invite_email_provider?: string | null;
        invite_email_id?: string | null;
        invite_last_attempt_at?: string | null;
        last_invite_error?: string | null;
        archived_at?: string | null;
    } | null;
    created_at: string;
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

const getAccountStatusMeta = (user: FreeUserRow, translate: (key: string) => string) => {
    if (user.is_blocked || user.lifecycle.key === 'blocked') {
        return { label: translate('lead_crm.account_status.blocked'), iconClass: 'text-red-400', textClass: 'text-red-400' };
    }

    switch (user.account_status) {
        case 'active':
            return { label: translate('lead_crm.account_status.active'), iconClass: 'text-emerald-400', textClass: 'text-emerald-400' };
        case 'pending_approval':
            return { label: translate('lead_crm.account_status.pending'), iconClass: 'text-yellow-400', textClass: 'text-yellow-400' };
        case 'rejected':
            return { label: translate('lead_crm.account_status.rejected'), iconClass: 'text-zinc-400', textClass: 'text-zinc-400' };
        default:
            return { label: translate('lead_crm.account_status.no_status'), iconClass: 'text-gray-600', textClass: 'text-gray-600' };
    }
};

export const LeadCRM: React.FC = () => {
    const { t } = useTranslation('admin');
    const { isWhiteLabel, profile, user, session } = useAuth();
    const effectiveRole = profile?.effective_role || profile?.role;
    const isSystemOwner = effectiveRole === 'master_admin';
    const isAdmin = effectiveRole === 'master_admin' || isSystemOwner;
    const { hasFeature, isOwner, loading: featuresLoading } = useFeatures();
    const hasCrmAccess = isSystemOwner || isOwner || isAdmin || hasFeature('FEATURE_CRM_LEADS');
    const [crmSection, setCrmSection] = useState<'public' | 'private'>('public');

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
        manual_approval_enabled: false,
        waitlist_whatsapp_group_url: '',
        waitlist_whatsapp_groups: []
    });
    const [launchLoading, setLaunchLoading] = useState(true);
    const [launchSaving, setLaunchSaving] = useState(false);
    const [approvalQueue, setApprovalQueue] = useState<ApprovalQueueRow[]>([]);
    const [approvalLoading, setApprovalLoading] = useState(true);
    const [approvalProcessingId, setApprovalProcessingId] = useState<string | null>(null);
    const [waitlistLeads, setWaitlistLeads] = useState<RegistrationWaitlistLead[]>([]);
    const [waitlistLoading, setWaitlistLoading] = useState(true);
    const [waitlistPage, setWaitlistPage] = useState(1);
    const [waitlistTotalCount, setWaitlistTotalCount] = useState(0);
    const waitlistPageSize = 25;
    const [selectedWaitlistLead, setSelectedWaitlistLead] = useState<RegistrationWaitlistLead | null>(null);
    const [waitlistInviteUrl, setWaitlistInviteUrl] = useState('');
    const [waitlistLeadUpdating, setWaitlistLeadUpdating] = useState(false);
    const [waitlistInviteGenerating, setWaitlistInviteGenerating] = useState(false);
    const [waitlistInviteSending, setWaitlistInviteSending] = useState(false);
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
    const initialCrmMetaLoadedRef = useRef(false);
    const hasSession = Boolean(session?.access_token);

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
        if (!hasSession || initialCrmMetaLoadedRef.current) return;
        initialCrmMetaLoadedRef.current = true;
        fetchPartners();
        fetchLaunchControls();
        fetchApprovalQueue();
        fetchWaitlistLeads();
    }, [hasSession]);

    useEffect(() => {
        if (!hasSession) return;
        fetchUsers();
    }, [hasSession, page, statusFilter, partnerFilter]);

    useEffect(() => {
        if (!hasSession || !initialCrmMetaLoadedRef.current) return;
        fetchWaitlistLeads();
    }, [hasSession, waitlistPage]);

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
            if (!result.success) throw new Error(result.error || t('lead_crm.errors.load_controls'));

            if (result.settings) {
                setLaunchSettings({
                    registration_open: result.settings.registration_open !== false,
                    manual_approval_enabled: Boolean(result.settings.manual_approval_enabled),
                    waitlist_whatsapp_group_url: String(result.settings.waitlist_whatsapp_group_url || ''),
                    waitlist_whatsapp_groups: Array.isArray(result.settings.waitlist_whatsapp_groups)
                        ? result.settings.waitlist_whatsapp_groups
                        : []
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
            if (!result.success) throw new Error(result.error || t('lead_crm.errors.load_queue'));

            setApprovalQueue(result.data || []);
        } catch (error) {
            console.error('Error fetching approval queue:', error);
            toast.error(t('lead_crm.errors.load_approval_queue'));
        } finally {
            setApprovalLoading(false);
        }
    };

    const fetchWaitlistLeads = async () => {
        try {
            setWaitlistLoading(true);
            const response = await fetch('/api/central/manage-licenses', {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({
                    action: 'get_registration_waitlist',
                    page: waitlistPage,
                    limit: waitlistPageSize
                })
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error || t('lead_crm.errors.load_waitlist'));

            setWaitlistLeads(result.data || []);
            setWaitlistTotalCount(result.count || 0);
        } catch (error) {
            console.error('Error fetching registration waitlist:', error);
            toast.error(t('lead_crm.errors.load_waitlist_public'));
        } finally {
            setWaitlistLoading(false);
        }
    };

    const fetchUsers = async (options?: { silent?: boolean }) => {
        const silent = options?.silent === true;

        try {
            if (silent || users.length > 0) {
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
            if (!result.success) throw new Error(result.error || t('lead_crm.errors.load_data'));

            const { data, count, partners: partnersMap, metrics: resMetrics } = result;
            setTotalCount(count || 0);

            // 4. Map Data - No longer filtering by plan slug strictly since EF handles the scope
            let formatted: FreeUserRow[] = (data || []).map((item: any) => {
                const p = item.profile;
                if (!p) return null;

                const lifecycle = item.lifecycle || { key: 'lead', label: t('lead_crm.lifecycle.lead_without_license') };
                const onboarding = Array.isArray(p.onboarding) ? p.onboarding[0] : p.onboarding;

                return {
                    user_id: p.id,
                    email: p.email || 'N/A',
                    full_name: p.full_name || t('lead_crm.defaults.user'),
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
            toast.error(t('lead_crm.errors.load_leads', { message: error.message || t('lead_crm.defaults.unknown') }));
        } finally {
            if (silent || users.length > 0) {
                setIsRefreshingLeads(false);
            } else {
                setLoading(false);
            }
        }
    };

    const handleRefreshLeads = async () => {
        await Promise.all([
            fetchUsers({ silent: true }),
            fetchLaunchControls(),
            fetchWaitlistLeads()
        ]);
    };

    const handleWhatsAppContact = (user: FreeUserRow) => {
        if (!user.whatsapp) {
            toast.error(t('lead_crm.errors.whatsapp_missing'));
            return;
        }

        const cleanPhone = user.whatsapp.replace(/\D/g, '');
        const message = encodeURIComponent(
            t('lead_crm.messages.whatsapp_welcome', { name: user.full_name })
        );
        window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
        setContactedUsers(prev => new Set(prev).add(user.user_id));
    };

    const handleEmailContact = (user: FreeUserRow) => {
        const subject = encodeURIComponent(t('lead_crm.messages.email_subject'));
        const body = encodeURIComponent(t('lead_crm.messages.email_body', { name: user.full_name }));
        window.location.href = `mailto:${user.email}?subject=${subject}&body=${body}`;
        setContactedUsers(prev => new Set(prev).add(user.user_id));
    };

    const handleCopyLeadField = async (label: string, value?: string | null) => {
        if (!value) {
            toast.error(t('lead_crm.toasts.field_unavailable', { label }));
            return;
        }

        try {
            await navigator.clipboard.writeText(value);
            toast.success(t('lead_crm.toasts.field_copied', { label }));
        } catch {
            toast.error(t('lead_crm.toasts.copy_failed', { label: label.toLowerCase() }));
        }
    };

    const getWaitlistLeadName = (lead: RegistrationWaitlistLead) => {
        return lead.metadata?.name || t('lead_crm.waitlist.private_lead_default');
    };

    const getWaitlistInviteStatus = (lead: RegistrationWaitlistLead) => {
        const hasSystemDeliveryReceipt = Boolean(
            lead.metadata?.invite_status === 'sent'
            && lead.metadata?.invite_email_provider
            && (lead.metadata?.invite_email_id || lead.metadata?.invite_sent_at)
        );

        if (hasSystemDeliveryReceipt) {
            return {
                label: t('lead_crm.waitlist.invite_sent'),
                className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
            };
        }

        if (lead.metadata?.invite_url) {
            return {
                label: t('lead_crm.waitlist.invite_ready'),
                className: 'border-blue-500/20 bg-blue-500/10 text-blue-300'
            };
        }

        return {
            label: t('lead_crm.waitlist.new'),
            className: 'border-white/10 bg-white/[0.03] text-white/35'
        };
    };

    const openWaitlistLeadModal = (lead: RegistrationWaitlistLead) => {
        setSelectedWaitlistLead(lead);
        setWaitlistInviteUrl(lead.metadata?.invite_url || '');
    };

    const updateWaitlistLeadMetadata = async (
        lead: RegistrationWaitlistLead,
        metadataPatch: Record<string, unknown>,
        options?: { closeModal?: boolean; silent?: boolean }
    ) => {
        try {
            setWaitlistLeadUpdating(true);
            const response = await fetch('/api/central/manage-licenses', {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({
                    action: 'update_registration_waitlist_lead',
                    lead_id: lead.id,
                    metadata_patch: metadataPatch
                })
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error || t('lead_crm.errors.update_lead'));

            if (!options?.silent) {
                toast.success(t('lead_crm.toasts.private_lead_updated'));
            }

            if (options?.closeModal) {
                setSelectedWaitlistLead(null);
            } else if (result.data) {
                setSelectedWaitlistLead(result.data);
                setWaitlistInviteUrl(result.data.metadata?.invite_url || '');
            }

            await fetchWaitlistLeads();
            return result.data as RegistrationWaitlistLead;
        } catch (error: any) {
            console.error('Error updating waitlist lead:', error);
            toast.error(error.message || t('lead_crm.errors.update_private_lead'));
            return null;
        } finally {
            setWaitlistLeadUpdating(false);
        }
    };

    const buildInviteEmailBody = (lead: RegistrationWaitlistLead, inviteUrl: string) => {
        const firstName = getWaitlistLeadName(lead).split(' ')[0] || t('lead_crm.messages.invite_default_name');
        return [
            t('lead_crm.messages.invite_greeting', { name: firstName }),
            '',
            t('lead_crm.messages.invite_line_1'),
            '',
            t('lead_crm.messages.invite_link_line', { url: inviteUrl }),
            '',
            t('lead_crm.messages.invite_line_2'),
            '',
            t('lead_crm.messages.invite_closing'),
            t('lead_crm.messages.invite_signature')
        ].join('\n');
    };

    const handleGenerateWaitlistInvite = async () => {
        if (!selectedWaitlistLead) return;

        try {
            setWaitlistInviteGenerating(true);
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
                throw new Error(result.error || t('lead_crm.errors.generate_invite'));
            }

            const inviteUrl = getRegisterUrl({ invite: result.data.token });
            setWaitlistInviteUrl(inviteUrl);
            await updateWaitlistLeadMetadata(selectedWaitlistLead, {
                invite_url: inviteUrl,
                invite_status: 'draft',
                invite_token_id: result.data.id || null,
                invite_expires_at: result.data.expires_at || null
            }, { silent: true });
            toast.success(t('lead_crm.toasts.exclusive_invite_generated'));
        } catch (error: any) {
            console.error('Error generating waitlist invite:', error);
            toast.error(error.message || t('lead_crm.errors.generate_invite'));
        } finally {
            setWaitlistInviteGenerating(false);
        }
    };

    const handleSendWaitlistInviteEmail = async () => {
        if (!selectedWaitlistLead) return;
        const inviteUrl = waitlistInviteUrl.trim();

        if (!inviteUrl) {
            toast.error(t('lead_crm.errors.invite_link_required_send'));
            return;
        }

        try {
            setWaitlistInviteSending(true);
            const response = await fetch('/api/central/manage-licenses', {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({
                    action: 'send_registration_waitlist_invite',
                    lead_id: selectedWaitlistLead.id,
                    invite_url: inviteUrl
                })
            });

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || t('lead_crm.errors.send_invite'));
            }

            if (result.data) {
                setSelectedWaitlistLead(result.data);
                setWaitlistInviteUrl(result.data.metadata?.invite_url || inviteUrl);
            }

            await fetchWaitlistLeads();
            toast.success(t('lead_crm.toasts.invite_sent_system'));
        } catch (error: any) {
            console.error('Error sending waitlist invite:', error);
            toast.error(error.message || t('lead_crm.errors.send_invite'));
            await fetchWaitlistLeads();
        } finally {
            setWaitlistInviteSending(false);
        }
    };

    const handleCopyWaitlistInviteMessage = async () => {
        if (!selectedWaitlistLead) return;
        const inviteUrl = waitlistInviteUrl.trim();

        if (!inviteUrl) {
            toast.error(t('lead_crm.errors.invite_link_required_copy'));
            return;
        }

        await navigator.clipboard.writeText(buildInviteEmailBody(selectedWaitlistLead, inviteUrl));
        toast.success(t('lead_crm.toasts.invite_message_copied'));
    };

    const handleArchiveWaitlistLead = async (lead: RegistrationWaitlistLead) => {
        const confirmed = window.confirm(t('lead_crm.confirm.archive_private_lead'));
        if (!confirmed) return;

        await updateWaitlistLeadMetadata(lead, {
            archived_at: new Date().toISOString()
        }, { closeModal: selectedWaitlistLead?.id === lead.id });
    };

    const formatLeadDateTime = (value?: string | null) => {
        if (!value) return t('lead_crm.defaults.not_registered');

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
                    reason: reason || t('lead_crm.messages.manual_change_reason', { name: profile?.full_name || t('lead_crm.defaults.system') })
                })
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error || t('lead_crm.errors.update_status'));

            toast.success(t('lead_crm.toasts.partner_status_updated', { status: newStatus }));
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
            if (!result.success) throw new Error(result.error || t('lead_crm.errors.save_controls'));

            setLaunchSettings({
                registration_open: result.settings?.registration_open !== false,
                manual_approval_enabled: Boolean(result.settings?.manual_approval_enabled),
                waitlist_whatsapp_group_url: String(result.settings?.waitlist_whatsapp_group_url || ''),
                waitlist_whatsapp_groups: Array.isArray(result.settings?.waitlist_whatsapp_groups)
                    ? result.settings.waitlist_whatsapp_groups
                    : []
            });

            toast.success(t('lead_crm.toasts.controls_updated'));
            fetchLaunchControls();
        } catch (error: any) {
            console.error('Error updating launch settings:', error);
            toast.error(error.message || t('lead_crm.errors.update_controls'));
        } finally {
            setLaunchSaving(false);
        }
    };

    const handleAddWaitlistGroup = () => {
        setLaunchSettings(prev => ({
            ...prev,
            waitlist_whatsapp_groups: [
                ...prev.waitlist_whatsapp_groups,
                {
                    id: crypto.randomUUID(),
                    name: t('lead_crm.private.group_number', { number: prev.waitlist_whatsapp_groups.length + 1 }),
                    url: '',
                    active: true,
                    clickLimit: 1000,
                    clicks: 0
                }
            ]
        }));
    };

    const handleUpdateWaitlistGroup = (groupId: string, updates: Partial<WaitlistWhatsappGroup>) => {
        setLaunchSettings(prev => ({
            ...prev,
            waitlist_whatsapp_groups: prev.waitlist_whatsapp_groups.map(group => group.id === groupId
                ? { ...group, ...updates }
                : group
            )
        }));
    };

    const handleRemoveWaitlistGroup = (groupId: string) => {
        setLaunchSettings(prev => ({
            ...prev,
            waitlist_whatsapp_groups: prev.waitlist_whatsapp_groups.filter(group => group.id !== groupId)
        }));
    };

    const handleSaveWaitlistGroups = () => {
        handleUpdateLaunchSettings({
            waitlist_whatsapp_groups: launchSettings.waitlist_whatsapp_groups
        });
    };

    const handleApprovalDecision = async (userId: string, decision: 'approve' | 'reject') => {
        const notes = decision === 'reject'
            ? window.prompt(t('lead_crm.confirm.rejection_reason'), '') || ''
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
            if (!result.success) throw new Error(result.error || t('lead_crm.errors.process_approval'));

            toast.success(decision === 'approve' ? t('lead_crm.toasts.signup_approved') : t('lead_crm.toasts.signup_rejected'));
            fetchApprovalQueue();
            fetchUsers();
            fetchLaunchControls();
        } catch (error: any) {
            console.error('Error processing approval:', error);
            toast.error(error.message || t('lead_crm.errors.update_approval_queue'));
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
                throw new Error(result.error || t('lead_crm.errors.generate_invite'));
            }

            const inviteUrl = getRegisterUrl({ invite: result.data.token });
            setGeneratedInviteUrl(inviteUrl);
            
            // Auto-copy for convenience, but the widget stays open
            try {
                await navigator.clipboard.writeText(inviteUrl);
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
                toast.success(t('lead_crm.toasts.link_generated_copied'));
            } catch {
                toast.success(t('lead_crm.toasts.invite_link_generated'));
            }

            fetchLaunchControls();
        } catch (error: any) {
            console.error('Error creating invite token:', error);
            toast.error(error.message || t('lead_crm.errors.generate_invite'));
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
            if (!result.success) throw new Error(result.error || t('lead_crm.errors.toggle_block'));

            setBlockTransition({
                userId: user.user_id,
                userName: user.full_name,
                mode: nextMode,
                stage: 'success'
            });

            toast.success(user.is_blocked ? t('lead_crm.toasts.user_unblocked') : t('lead_crm.toasts.user_blocked'));
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
            toast.error(t('lead_crm.errors.generic_with_message', { message: error.message }));
        } finally {
            setBlockingUserId(null);
        }
    };

    const handleTogglePartnerOpportunity = async (user: FreeUserRow) => {
        if (!user.partner_opportunity.available) {
            toast.error(t('lead_crm.errors.partner_opportunity_unavailable'));
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
            if (!result.success) throw new Error(result.error || t('lead_crm.errors.update_partner_opportunity'));

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
                toast.success(t('lead_crm.toasts.partner_opportunity_enabled'));

                if (nextNotificationStatus === 'sent') {
                    toast.success(t('lead_crm.toasts.auto_email_sent'));
                } else if (nextNotificationStatus === 'failed') {
                    toast.error(t('lead_crm.toasts.auto_email_failed'));
                } else if (nextNotificationStatus === 'skipped') {
                    toast.info(t('lead_crm.toasts.auto_email_skipped'));
                }
            } else {
                toast.success(t('lead_crm.toasts.partner_opportunity_hidden'));
            }

            await fetchUsers({ silent: true });
        } catch (error: any) {
            console.error('Error updating partner opportunity visibility:', error);
            toast.error(error.message || t('lead_crm.errors.update_partner_opportunity_public'));
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

    const waitlistTotalPages = Math.max(1, Math.ceil(waitlistTotalCount / waitlistPageSize));

    const CrmSectionButton = ({
        id,
        label,
        description,
        icon: Icon
    }: {
        id: 'public' | 'private';
        label: string;
        description: string;
        icon: React.ElementType;
    }) => (
        <button
            type="button"
            onClick={() => setCrmSection(id)}
            className={`flex min-w-[240px] flex-1 items-center gap-4 rounded-2xl border px-5 py-4 text-left transition-all ${
                crmSection === id
                    ? 'border-primary/40 bg-primary/15 text-white shadow-[0_0_24px_rgba(138,43,226,0.18)]'
                    : 'border-white/5 bg-black/30 text-white/45 hover:border-white/15 hover:text-white'
            }`}
        >
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                crmSection === id ? 'border-primary/30 bg-primary/20 text-primary' : 'border-white/10 bg-white/[0.03] text-white/30'
            }`}>
                <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
                <p className="text-[11px] font-black uppercase italic tracking-[0.22em]">{label}</p>
                <p className="mt-1 text-[10px] font-semibold leading-snug text-white/35">{description}</p>
            </div>
        </button>
    );

    if (featuresLoading) {
        return <Loading label={t('lead_crm.loading')} />;
    }

    if (isWhiteLabel || !hasCrmAccess) {
        return <div className="min-h-screen bg-[#05050A] flex items-center justify-center text-gray-400">{t('lead_crm.access_denied')}</div>;
    }
    // Updated security check to use the new role if context provides it,

    // but the backend RLS will now handle the real enforcement.
    const allowedRoles = ['owner', 'master_admin', 'admin'];
    if (!hasCrmAccess && (!effectiveRole || !allowedRoles.includes(effectiveRole))) {
        return <div className="p-8 text-center text-gray-500">{t('lead_crm.access_denied')}</div>;
    }

    if (loading) {
        return <Loading label={t('lead_crm.loading')} />;
    }

    return (
        <Layout maxWidth="max-w-full">
            <div className="space-y-12 pb-24">
                
            {/* Tactical Header Architecture */}
            <div 
                className="sticky top-4 z-30 flex flex-wrap items-start lg:items-center justify-between gap-8 mb-12 p-8 rounded-[2.5rem] border-2 border-dashed border-white/20 backdrop-blur-3xl transition-all shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
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
                            {t('lead_crm.header.title_prefix')} <span className="text-primary">{t('lead_crm.header.title_highlight')}</span>
                        </h1>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 text-white/40 text-[10px] font-bold uppercase tracking-[0.3em]">
                                <Activity className="w-3.5 h-3.5" />
                                {t('lead_crm.header.intelligence_center')}
                            </div>
                            <div className="w-1 h-1 rounded-full bg-white/20" />
                            <div className="flex items-center gap-2 text-white/60 text-[10px] font-mono uppercase tracking-[0.2em]">
                                <Users className="w-3.5 h-3.5 text-primary" />
                                {t('lead_crm.header.leads_logged', { count: totalCount })}
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
                                <p className="text-[8px] font-black uppercase tracking-widest text-primary/60 mb-0.5 whitespace-nowrap">{t('lead_crm.metrics.total_leads')}</p>
                                <p className="text-lg font-portal-display text-white whitespace-nowrap">{totalCount}</p>
                            </div>
                        </div>
                        <div className="bg-black/40 px-5 py-3 rounded-2xl border border-white/5 flex items-center gap-4 group hover:border-emerald-500/30 transition-all shrink-0">
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                                <Zap className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-[8px] font-black uppercase tracking-widest text-emerald-500/60 mb-0.5 whitespace-nowrap">{t('lead_crm.metrics.active_installations')}</p>
                                <p className="text-lg font-portal-display text-white whitespace-nowrap">{metrics.activeInstallations}</p>
                            </div>
                        </div>
                        <div className="bg-black/40 px-5 py-3 rounded-2xl border border-white/5 flex items-center gap-4 group hover:border-blue-500/30 transition-all shrink-0">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                                <Activity className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-[8px] font-black uppercase tracking-widest text-blue-500/60 mb-0.5 whitespace-nowrap">{t('lead_crm.metrics.lifecycle')}</p>
                                <p className="text-lg font-portal-display text-white whitespace-nowrap">{metrics.pendingSetup} <span className="text-[9px] text-gray-600 font-sans">{t('lead_crm.metrics.wait')}</span></p>
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
                                            {launchSettings.registration_open ? t('lead_crm.launch.registration_open_short') : t('lead_crm.launch.registration_closed_short')}
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
                                    title={t('lead_crm.invite.manage_title')}
                                    className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${showInviteWidget ? 'bg-primary text-white shadow-[0_0_15px_rgba(138,43,226,0.4)]' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                                >
                                    <Copy className="w-4 h-4" />
                                </button>
                             </div>
                      </div>

                    <div className="hidden lg:flex flex-col items-end pr-4">
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] mb-2 leading-none">{t('lead_crm.header.security_protocol')}</span>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-mono text-emerald-500/60 uppercase tracking-widest">{t('lead_crm.header.active_scan')}</span>
                        </div>
                </div>
            </div>
        </div>
    </div>
</div>

            <div className="grid gap-3 md:grid-cols-2">
                <CrmSectionButton
                    id="public"
                    label={t('lead_crm.sections.public_label')}
                    description={t('lead_crm.sections.public_description')}
                    icon={Globe}
                />
                <CrmSectionButton
                    id="private"
                    label={t('lead_crm.sections.private_label')}
                    description={t('lead_crm.sections.private_description')}
                    icon={Lock}
                />
            </div>

            {crmSection === 'private' && (
                <div className="space-y-6">
                    <div className="rounded-[2rem] border border-white/10 bg-black/35 p-5 backdrop-blur-2xl">
                        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <p className="text-[9px] font-black uppercase tracking-[0.32em] text-emerald-400/70">{t('lead_crm.private.registry')}</p>
                                <h2 className="mt-1 text-xl font-black uppercase italic tracking-tighter text-white">{t('lead_crm.private.whatsapp_groups')}</h2>
                            </div>
                            <div className={`rounded-full border px-3 py-1 text-[8px] font-black uppercase tracking-widest ${
                                launchSettings.registration_open
                                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                                    : 'border-red-500/20 bg-red-500/10 text-red-300'
                            }`}>
                                {launchSettings.registration_open ? t('lead_crm.private.public_open') : t('lead_crm.private.private_active')}
                            </div>
                        </div>

                        <div className="grid gap-4 xl:grid-cols-2">
                            {launchSettings.waitlist_whatsapp_groups.map((group, index) => {
                                const percent = Math.min(100, Math.round((group.clicks / Math.max(1, group.clickLimit)) * 100));
                                return (
                                    <div key={group.id} className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
                                        <div className="mb-4 flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                                                    <MessageCircle className="h-4 w-4" />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/25">{t('lead_crm.private.group_number', { number: index + 1 })}</p>
                                                    <p className="text-sm font-black uppercase italic text-white">{group.name || t('lead_crm.private.unnamed_group')}</p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveWaitlistGroup(group.id)}
                                                className="h-9 w-9 rounded-xl border border-red-500/20 bg-red-500/10 text-red-300 transition-all hover:bg-red-500/15"
                                                title={t('lead_crm.private.remove_group')}
                                            >
                                                <Trash2 className="mx-auto h-4 w-4" />
                                            </button>
                                        </div>

                                        <div className="grid gap-3 md:grid-cols-[0.7fr,1.3fr]">
                                            <input
                                                type="text"
                                                value={group.name}
                                                onChange={(event) => handleUpdateWaitlistGroup(group.id, { name: event.target.value })}
                                                placeholder={t('lead_crm.private.group_name_placeholder')}
                                                className="rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none placeholder:text-white/10 focus:border-emerald-500/40"
                                            />
                                            <input
                                                type="url"
                                                value={group.url}
                                                onChange={(event) => handleUpdateWaitlistGroup(group.id, { url: event.target.value })}
                                                placeholder="https://chat.whatsapp.com/..."
                                                className="rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none placeholder:text-white/10 focus:border-emerald-500/40"
                                            />
                                            <input
                                                type="number"
                                                min={1}
                                                value={group.clickLimit}
                                                onChange={(event) => handleUpdateWaitlistGroup(group.id, { clickLimit: Number(event.target.value) || 1000 })}
                                                className="rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500/40"
                                            />
                                            <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-white/45">
                                                <span>{t('lead_crm.private.active')}</span>
                                                <input
                                                    type="checkbox"
                                                    checked={group.active}
                                                    onChange={(event) => handleUpdateWaitlistGroup(group.id, { active: event.target.checked })}
                                                />
                                            </label>
                                        </div>

                                        <div className="mt-4">
                                            <div className="mb-2 flex items-center justify-between text-[9px] font-black uppercase tracking-[0.22em] text-white/25">
                                                <span>{t('lead_crm.private.clicks_count', { clicks: group.clicks, limit: group.clickLimit })}</span>
                                                <span>{percent}%</span>
                                            </div>
                                            <div className="h-2 overflow-hidden rounded-full bg-white/5">
                                                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {launchSettings.waitlist_whatsapp_groups.length === 0 && (
                                <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-black/20 p-8 text-center text-[10px] font-black uppercase tracking-[0.28em] text-white/15 xl:col-span-2">
                                    {t('lead_crm.private.no_groups')}
                                </div>
                            )}
                        </div>

                        <div className="mt-5 flex flex-wrap justify-end gap-3 border-t border-white/5 pt-5">
                            <button
                                type="button"
                                onClick={handleAddWaitlistGroup}
                                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[9px] font-black uppercase tracking-[0.24em] text-white/60 hover:text-white"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                {t('lead_crm.private.new_group')}
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveWaitlistGroups}
                                disabled={launchSaving}
                                className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-3 text-[9px] font-black uppercase tracking-[0.24em] text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-50"
                            >
                                {launchSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                                {t('lead_crm.private.save_groups')}
                            </button>
                        </div>
                    </div>

                    <div className="rounded-[2rem] border border-white/10 bg-black/35 p-5 backdrop-blur-2xl">
                        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <p className="text-[9px] font-black uppercase tracking-[0.32em] text-orange-400/70">{t('lead_crm.waitlist.title')}</p>
                                <h2 className="mt-1 text-xl font-black uppercase italic tracking-tighter text-white">{t('lead_crm.waitlist.private_leads')}</h2>
                                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-white/20">{t('lead_crm.waitlist.captured_count', { count: waitlistTotalCount })}</p>
                            </div>
                            <button
                                type="button"
                                onClick={fetchWaitlistLeads}
                                disabled={waitlistLoading}
                                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[8px] font-black uppercase tracking-[0.22em] text-white/50 hover:text-white disabled:opacity-50"
                            >
                                <RefreshCw className={`h-3 w-3 ${waitlistLoading ? 'animate-spin text-orange-300' : ''}`} />
                                {t('lead_crm.actions.refresh')}
                            </button>
                        </div>

                        <div className="overflow-hidden rounded-[1.5rem] border border-white/5">
                            {waitlistLoading && waitlistLeads.length === 0 ? (
                                <div className="flex items-center justify-center py-16 text-white/25">
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                </div>
                            ) : waitlistLeads.length === 0 ? (
                                <div className="py-16 text-center text-[10px] font-black uppercase tracking-[0.3em] text-white/10">
                                    {t('lead_crm.waitlist.empty')}
                                </div>
                            ) : (
                                <div className="overflow-x-auto custom-scrollbar">
                                    <table className="w-full text-left">
                                        <thead className="border-b border-white/5 bg-white/[0.02]">
                                            <tr>
                                                <th className="px-5 py-4 text-[9px] font-black uppercase tracking-[0.28em] text-white/15">{t('lead_crm.table.lead')}</th>
                                                <th className="px-5 py-4 text-[9px] font-black uppercase tracking-[0.28em] text-white/15">{t('lead_crm.table.status')}</th>
                                                <th className="px-5 py-4 text-[9px] font-black uppercase tracking-[0.28em] text-white/15">{t('lead_crm.table.source')}</th>
                                                <th className="px-5 py-4 text-[9px] font-black uppercase tracking-[0.28em] text-white/15">{t('lead_crm.table.date')}</th>
                                                <th className="px-5 py-4 text-center text-[9px] font-black uppercase tracking-[0.28em] text-white/15">{t('lead_crm.table.actions')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {waitlistLeads.map((lead) => {
                                                const leadName = getWaitlistLeadName(lead);
                                                const inviteStatus = getWaitlistInviteStatus(lead);
                                                return (
                                                    <tr key={lead.id} className="bg-black/20 hover:bg-white/[0.02]">
                                                        <td className="px-5 py-4">
                                                            <p className="text-sm font-black uppercase italic text-white">{leadName}</p>
                                                            <p className="text-[11px] font-mono text-white/35">{lead.email}</p>
                                                        </td>
                                                        <td className="px-5 py-4">
                                                            <span className={`inline-flex rounded-full border px-3 py-1 text-[8px] font-black uppercase tracking-[0.22em] ${inviteStatus.className}`}>
                                                                {inviteStatus.label}
                                                            </span>
                                                        </td>
                                                        <td className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-white/30">{lead.source}</td>
                                                        <td className="px-5 py-4 text-[10px] font-mono text-white/30">{new Date(lead.created_at).toLocaleString('pt-BR')}</td>
                                                        <td className="px-5 py-4">
                                                            <div className="flex justify-center gap-2">
                                                                <button type="button" onClick={() => handleCopyLeadField(t('lead_crm.fields.email'), lead.email)} className="h-10 w-10 rounded-xl border border-white/10 bg-black/30 text-white/35 hover:text-white" title={t('lead_crm.actions.copy_email')}>
                                                                    <Copy className="mx-auto h-4 w-4" />
                                                                </button>
                                                                <button type="button" onClick={() => openWaitlistLeadModal(lead)} className="h-10 w-10 rounded-xl border border-primary/20 bg-primary/10 text-primary hover:bg-primary/15" title={t('lead_crm.actions.lead_details')}>
                                                                    <LayoutIcon className="mx-auto h-4 w-4" />
                                                                </button>
                                                                <button type="button" onClick={() => handleArchiveWaitlistLead(lead)} className="h-10 w-10 rounded-xl border border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/15" title={t('lead_crm.actions.archive_lead')}>
                                                                    <Trash2 className="mx-auto h-4 w-4" />
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
                        </div>

                        {waitlistTotalPages > 1 && (
                            <div className="mt-5 flex items-center justify-center gap-3">
                                <button type="button" onClick={() => setWaitlistPage(prev => Math.max(1, prev - 1))} disabled={waitlistPage === 1} className="h-11 w-11 rounded-xl border border-white/10 bg-black/30 text-white/40 disabled:opacity-25">
                                    <ArrowRight className="mx-auto h-4 w-4 rotate-180" />
                                </button>
                                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/25">
                                    {t('lead_crm.pagination.page_of', { page: waitlistPage, total: waitlistTotalPages })}
                                </span>
                                <button type="button" onClick={() => setWaitlistPage(prev => Math.min(waitlistTotalPages, prev + 1))} disabled={waitlistPage === waitlistTotalPages} className="h-11 w-11 rounded-xl border border-white/10 bg-black/30 text-white/40 disabled:opacity-25">
                                    <ArrowRight className="mx-auto h-4 w-4" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TACTICAL FILTER OVERLAY */}
            {crmSection === 'public' && (
            <>
            <div className="mb-0 flex flex-col lg:flex-row gap-3 items-center justify-between bg-black/20 p-3 rounded-t-[2.5rem] border-x border-t border-white/5 backdrop-blur-xl">
                <div className="w-full lg:w-96 relative group">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-white/10 group-focus-within:text-primary transition-colors" />
                    <input 
                        type="text" 
                        placeholder={t('lead_crm.filters.search_placeholder')}
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
                            <option value="all">{t('lead_crm.filters.all_partners')}</option>
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
                                {f === 'all' ? t('lead_crm.filters.full_list') : f === 'setup_pending' ? t('lead_crm.filters.pending') : t('lead_crm.filters.blocked')}
                            </button>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={handleRefreshLeads}
                        disabled={loading || isRefreshingLeads}
                        className="shrink-0 inline-flex items-center gap-2 bg-black/40 border border-white/5 rounded-2xl px-4 py-4 text-[9px] font-black uppercase tracking-[0.25em] text-white/60 hover:text-white hover:border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        title={t('lead_crm.actions.refresh_grid')}
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingLeads ? 'animate-spin text-primary' : 'text-white/30'}`} />
                        <span>{isRefreshingLeads ? t('lead_crm.actions.refreshing') : t('lead_crm.actions.refresh')}</span>
                    </button>
                </div>
            </div>

             {/* MAIN DATA TABLE: PREMIUM GLASS */}
            <div className="bg-black/40 border-x border-b border-white/5 rounded-b-[2.5rem] backdrop-blur-3xl overflow-hidden min-h-[400px]">
                <div className="px-6 py-3 border-b border-white/[0.03] bg-white/[0.01] flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.25em]">
                        <div className={`w-2 h-2 rounded-full ${isRefreshingLeads ? 'bg-primary animate-pulse' : 'bg-emerald-500/70'}`} />
                        <span className={isRefreshingLeads ? 'text-primary/80' : 'text-white/30'}>
                            {isRefreshingLeads ? t('lead_crm.sync.synchronizing') : t('lead_crm.sync.synced')}
                        </span>
                    </div>
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/20">
                        {lastLeadsSyncAt
                            ? t('lead_crm.sync.last_sync', { time: new Date(lastLeadsSyncAt).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit'
                            }) })
                            : t('lead_crm.sync.pending')}
                    </p>
                </div>
                {filteredUsers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-40 text-white/5 text-center">
                        <Users className="w-16 h-16 mb-4 opacity-10" />
                        <p className="text-[10px] font-black uppercase tracking-[0.4em]">{t('lead_crm.empty.no_leads')}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/[0.03] bg-white/[0.01]">
                                    <th className="px-3 py-4 text-[9px] font-black text-white/10 uppercase tracking-[0.3em] font-mono whitespace-nowrap italic">{t('lead_crm.table.lead_identity')}</th>
                                    <th className="px-3 py-4 text-[9px] font-black text-white/10 uppercase tracking-[0.3em] font-mono whitespace-nowrap italic text-center">{t('lead_crm.table.plan_context')}</th>
                                    <th className="px-3 py-4 text-[9px] font-black text-white/10 uppercase tracking-[0.3em] font-mono whitespace-nowrap italic text-center">{t('lead_crm.table.partner_opportunity')}</th>
                                    <th className="px-3 py-4 text-[9px] font-black text-white/10 uppercase tracking-[0.3em] font-mono whitespace-nowrap italic text-center">{t('lead_crm.table.onboarding')}</th>
                                    <th className="px-3 py-4 text-[9px] font-black text-white/10 uppercase tracking-[0.3em] font-mono whitespace-nowrap italic">{t('lead_crm.table.timeline')}</th>
                                    <th className="px-3 py-4 text-[9px] font-black text-white/10 uppercase tracking-[0.3em] font-mono whitespace-nowrap italic text-center">{t('lead_crm.table.actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.03]">
                                {filteredUsers.map((u) => {
                                    const isNewToday = new Date(u.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000);
                                    const accountMeta = getAccountStatusMeta(u, t);
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
                                                            ? t('lead_crm.partner.no_account')
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
                                                        title={!u.partner_opportunity.available ? t('lead_crm.partner.available_after_provision') : u.partner_opportunity.enabled ? t('lead_crm.partner.hide_opportunity') : t('lead_crm.partner.enable_opportunity')}
                                                    >
                                                        {partnerOpportunityUpdatingId === u.user_id ? (
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        ) : (
                                                            <TrendingUp className="w-3.5 h-3.5" />
                                                        )}
                                                        <span>{u.partner_opportunity.enabled ? t('lead_crm.partner.hide') : t('lead_crm.partner.enable')}</span>
                                                    </button>

                                                    <p className="text-[6px] font-black uppercase tracking-[0.18em] text-white/25 text-center">
                                                        {!u.partner_opportunity.available
                                                            ? t('lead_crm.partner.account_license_pending')
                                                            : u.partner_opportunity.notification_status === 'sent'
                                                                ? t('lead_crm.partner.email_sent')
                                                                : u.partner_opportunity.enabled
                                                                    ? t('lead_crm.partner.portal_enabled')
                                                                    : t('lead_crm.partner.hidden_by_default')}
                                                    </p>
                                                </div>
                                            </td>
                                            <td className="px-3 py-4">
                                                <div className="flex gap-1.5 justify-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedLead(u)}
                                                        className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all hover:border-primary/30 hover:text-white active:scale-95 ${
                                                        u.onboarding?.domain_configured ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-gray-800 border-white/5 text-gray-600'
                                                    }`}
                                                        title={u.onboarding?.domain_configured ? t('lead_crm.onboarding.domain_configured_title') : t('lead_crm.onboarding.domain_pending_title')}
                                                    >
                                                        <Globe className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedLead(u)}
                                                        className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all hover:border-primary/30 hover:text-white active:scale-95 ${
                                                        u.onboarding?.gateway_configured ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-gray-800 border-white/5 text-gray-600'
                                                    }`}
                                                        title={u.onboarding?.gateway_configured ? t('lead_crm.onboarding.gateway_configured_title') : t('lead_crm.onboarding.gateway_pending_title')}
                                                    >
                                                        <Zap className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="px-3 py-4">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2 text-white/30 text-[9px] font-mono">
                                                        <Clock className="w-3 h-3 text-primary/40" />
                                                        <span>{new Date(u.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                                                    </div>
                                                    <p className="text-[6px] font-black text-gray-800 uppercase tracking-[0.1em] mt-0.5 italic">
                                                        {u.last_login_at ? t('lead_crm.timeline.last_log', { date: new Date(u.last_login_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }) : t('lead_crm.timeline.never')}
                                                    </p>
                                                </div>
                                            </td>
                                            <td className="px-3 py-4">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <button 
                                                        onClick={() => setSelectedLead(u)}
                                                        className="w-8 h-8 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all active:scale-90"
                                                        title={t('lead_crm.actions.lead_details')}
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
                                                        title={t('lead_crm.fields.email')}
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
                                                        title={u.is_blocked ? t('lead_crm.actions.unblock') : t('lead_crm.actions.block')}
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
                            {t('lead_crm.pagination.registry_detected', { page, count: totalCount })}
                        </p>
                    </div>
                )}
            </div>
            </>
            )}
            
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
                                    {t('lead_crm.modal.intelligence_card')}
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
                                    <span className={`text-[10px] font-black uppercase tracking-[0.28em] px-3 py-1 rounded-full border ${getAccountStatusMeta(selectedLead, t).textClass} border-white/10 bg-white/5`}>
                                        {getAccountStatusMeta(selectedLead, t).label}
                                    </span>
                                    {selectedLead.license && (
                                        <span className="text-[10px] font-black uppercase tracking-[0.28em] px-3 py-1 rounded-full border border-white/10 bg-white/5 text-white/60">
                                            {selectedLead.license.plan_label}
                                        </span>
                                    )}
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                        <p className="text-[9px] font-black uppercase tracking-[0.32em] text-white/25 mb-2">{t('lead_crm.modal.signup')}</p>
                                        <p className="text-sm font-semibold text-white">{formatLeadDateTime(selectedLead.created_at)}</p>
                                    </div>
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                        <p className="text-[9px] font-black uppercase tracking-[0.32em] text-white/25 mb-2">{t('lead_crm.modal.last_login')}</p>
                                        <p className="text-sm font-semibold text-white">{formatLeadDateTime(selectedLead.last_login_at)}</p>
                                    </div>
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                        <p className="text-[9px] font-black uppercase tracking-[0.32em] text-white/25 mb-2">{t('lead_crm.table.source')}</p>
                                        <p className="text-sm font-semibold text-white uppercase">{selectedLead.signup_source || t('lead_crm.defaults.direct')}</p>
                                    </div>
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                        <p className="text-[9px] font-black uppercase tracking-[0.32em] text-white/25 mb-2">{t('lead_crm.modal.partner')}</p>
                                        <p className="text-sm font-semibold text-white">
                                            {selectedLead.referer ? selectedLead.referer.full_name : t('lead_crm.defaults.unassigned')}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-6 space-y-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-primary/70">{t('lead_crm.modal.quick_contact')}</p>
                                <div className="grid gap-3">
                                    <button
                                        type="button"
                                        onClick={() => handleCopyLeadField(t('lead_crm.fields.name'), selectedLead.full_name)}
                                        className="w-full flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-white/80 hover:bg-white/[0.05] transition-all"
                                    >
                                        <span className="text-sm font-semibold">{t('lead_crm.actions.copy_name')}</span>
                                        <Copy className="w-4 h-4 text-white/35" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleCopyLeadField(t('lead_crm.fields.email'), selectedLead.email)}
                                        className="w-full flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-white/80 hover:bg-white/[0.05] transition-all"
                                    >
                                        <span className="text-sm font-semibold">{t('lead_crm.actions.copy_email')}</span>
                                        <Mail className="w-4 h-4 text-blue-300/80" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleCopyLeadField(t('lead_crm.fields.phone'), selectedLead.whatsapp)}
                                        className="w-full flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-white/80 hover:bg-white/[0.05] transition-all"
                                    >
                                        <span className="text-sm font-semibold">{t('lead_crm.actions.copy_phone')}</span>
                                        <Smartphone className="w-4 h-4 text-emerald-300/80" />
                                    </button>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                    <button
                                        type="button"
                                        onClick={() => handleEmailContact(selectedLead)}
                                        className="rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm font-black uppercase tracking-[0.22em] text-blue-300 hover:bg-blue-500/15 transition-all"
                                    >
                                        {t('lead_crm.actions.open_email')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleWhatsAppContact(selectedLead)}
                                        disabled={!selectedLead.whatsapp}
                                        className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-black uppercase tracking-[0.22em] text-emerald-300 hover:bg-emerald-500/15 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        {t('lead_crm.actions.open_whatsapp')}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
                                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/25 mb-4">{t('lead_crm.modal.identity')}</p>
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-white/20 mb-1">{t('lead_crm.fields.email')}</p>
                                        <p className="text-sm text-white break-all">{selectedLead.email}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-white/20 mb-1">{t('lead_crm.fields.phone')}</p>
                                        <p className="text-sm text-white">{selectedLead.whatsapp || t('lead_crm.defaults.not_informed')}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-white/20 mb-1">{t('lead_crm.modal.partner_consent')}</p>
                                        <p className="text-sm text-white">{selectedLead.partner_consent ? t('lead_crm.defaults.yes') : t('lead_crm.defaults.no')}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
                                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/25 mb-4">{t('lead_crm.modal.operation')}</p>
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-white/20 mb-1">{t('lead_crm.modal.license')}</p>
                                        <p className="text-sm text-white">
                                            {selectedLead.license
                                                ? `${selectedLead.license.plan_label} • ${selectedLead.license.status || t('lead_crm.defaults.no_status')}`
                                                : t('lead_crm.modal.no_active_license')}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-white/20 mb-1">{t('lead_crm.modal.installations')}</p>
                                        <p className="text-sm text-white">
                                            {selectedLead.license
                                                ? t('lead_crm.modal.installations_registered', { active: selectedLead.license.active_installations, total: selectedLead.license.total_installations })
                                                : t('lead_crm.modal.no_installation')}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-white/20 mb-1">Onboarding</p>
                                        <p className="text-sm text-white">
                                            {t('lead_crm.modal.onboarding_status', {
                                                domain: selectedLead.onboarding?.domain_configured ? 'OK' : t('lead_crm.defaults.pending'),
                                                gateway: selectedLead.onboarding?.gateway_configured ? 'OK' : t('lead_crm.defaults.pending')
                                            })}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-white/20 mb-1">{t('lead_crm.table.partner_opportunity')}</p>
                                        <p className="text-sm text-white">
                                            {!selectedLead.partner_opportunity.available
                                                ? t('lead_crm.partner.account_not_provisioned')
                                                : selectedLead.partner_opportunity.enabled
                                                    ? t('lead_crm.partner.enabled')
                                                    : t('lead_crm.partner.hidden_by_default')}
                                        </p>
                                        <p className="text-[10px] text-white/35 mt-1">
                                            {selectedLead.partner_opportunity.notification_status === 'sent'
                                                ? t('lead_crm.partner.email_sent_at', { date: formatLeadDateTime(selectedLead.partner_opportunity.notification_sent_at) })
                                                : selectedLead.partner_opportunity.updated_at
                                                    ? t('lead_crm.partner.last_change_at', { date: formatLeadDateTime(selectedLead.partner_opportunity.updated_at) })
                                                    : t('lead_crm.partner.no_changes')}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal
                isOpen={Boolean(selectedWaitlistLead)}
                onClose={() => setSelectedWaitlistLead(null)}
                title={
                    selectedWaitlistLead ? (
                        <div className="flex items-center gap-3 uppercase italic tracking-tighter">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                                <Lock className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-lg font-black text-white">{getWaitlistLeadName(selectedWaitlistLead)}</p>
                                <p className="truncate text-[10px] font-mono uppercase tracking-[0.25em] text-white/35">
                                    {t('lead_crm.waitlist.private_lead')}
                                </p>
                            </div>
                        </div>
                    ) : null
                }
                className="max-w-3xl border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.25)]"
            >
                {selectedWaitlistLead && (
                    <div className="space-y-8">
                        <div className="grid gap-4 md:grid-cols-[1.1fr,0.9fr]">
                            <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-6 space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <p className="text-[10px] font-black uppercase tracking-[0.35em] text-emerald-300/70">{t('lead_crm.modal.identity')}</p>
                                    <span className={`rounded-full border px-3 py-1 text-[8px] font-black uppercase tracking-[0.22em] ${getWaitlistInviteStatus(selectedWaitlistLead).className}`}>
                                        {getWaitlistInviteStatus(selectedWaitlistLead).label}
                                    </span>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div>
                                        <p className="mb-1 text-[9px] font-black uppercase tracking-[0.28em] text-white/20">{t('lead_crm.fields.name')}</p>
                                        <p className="text-sm text-white">{getWaitlistLeadName(selectedWaitlistLead)}</p>
                                    </div>
                                    <div>
                                        <p className="mb-1 text-[9px] font-black uppercase tracking-[0.28em] text-white/20">{t('lead_crm.fields.email')}</p>
                                        <p className="break-all text-sm text-white">{selectedWaitlistLead.email}</p>
                                    </div>
                                    <div>
                                        <p className="mb-1 text-[9px] font-black uppercase tracking-[0.28em] text-white/20">{t('lead_crm.table.source')}</p>
                                        <p className="text-sm text-white">{selectedWaitlistLead.source}</p>
                                    </div>
                                    <div>
                                        <p className="mb-1 text-[9px] font-black uppercase tracking-[0.28em] text-white/20">{t('lead_crm.modal.entry')}</p>
                                        <p className="text-sm text-white">{formatLeadDateTime(selectedWaitlistLead.created_at)}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-6 space-y-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-primary/70">{t('lead_crm.modal.quick_actions')}</p>
                                <button
                                    type="button"
                                    onClick={() => handleCopyLeadField(t('lead_crm.fields.email'), selectedWaitlistLead.email)}
                                    className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-white/80 transition-all hover:bg-white/[0.05]"
                                >
                                    <span className="text-sm font-semibold">{t('lead_crm.actions.copy_email')}</span>
                                    <Copy className="h-4 w-4 text-white/35" />
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCopyWaitlistInviteMessage}
                                    disabled={!waitlistInviteUrl.trim()}
                                    className="flex w-full items-center justify-between rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-left text-blue-200 transition-all hover:bg-blue-500/15 disabled:opacity-40"
                                >
                                    <span className="text-sm font-semibold">{t('lead_crm.actions.copy_message')}</span>
                                    <Copy className="h-4 w-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleArchiveWaitlistLead(selectedWaitlistLead)}
                                    disabled={waitlistLeadUpdating}
                                    className="flex w-full items-center justify-between rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-left text-red-200 transition-all hover:bg-red-500/15 disabled:opacity-40"
                                >
                                    <span className="text-sm font-semibold">{t('lead_crm.actions.archive_lead')}</span>
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-6 space-y-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.35em] text-primary/70">{t('lead_crm.invite.exclusive')}</p>
                                    <p className="mt-1 text-[11px] font-semibold text-white/35">{t('lead_crm.invite.exclusive_desc')}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <select
                                        value={inviteExpirationDays}
                                        onChange={(event) => setInviteExpirationDays(Number(event.target.value))}
                                        className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/60 outline-none"
                                    >
                                        <option value={7}>{t('lead_crm.invite.days', { count: 7 })}</option>
                                        <option value={15}>{t('lead_crm.invite.days', { count: 15 })}</option>
                                        <option value={30}>{t('lead_crm.invite.days', { count: 30 })}</option>
                                    </select>
                                    <button
                                        type="button"
                                        onClick={handleGenerateWaitlistInvite}
                                        disabled={waitlistInviteGenerating || waitlistLeadUpdating}
                                        className="inline-flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-4 py-2 text-[9px] font-black uppercase tracking-[0.22em] text-primary transition-all hover:bg-primary/15 disabled:opacity-50"
                                    >
                                        {waitlistInviteGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                                        {t('lead_crm.actions.generate')}
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row">
                                <input
                                    type="url"
                                    value={waitlistInviteUrl}
                                    onChange={(event) => setWaitlistInviteUrl(event.target.value)}
                                    placeholder="https://portal.supercheckout.app/register?invite=..."
                                    className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none placeholder:text-white/10 focus:border-primary/40"
                                />
                                <button
                                    type="button"
                                    onClick={() => selectedWaitlistLead && updateWaitlistLeadMetadata(selectedWaitlistLead, {
                                        invite_url: waitlistInviteUrl.trim(),
                                        invite_status: waitlistInviteUrl.trim() ? 'draft' : null
                                    })}
                                    disabled={waitlistLeadUpdating}
                                    className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 text-[9px] font-black uppercase tracking-[0.24em] text-white/60 hover:text-white disabled:opacity-50"
                                >
                                    {t('lead_crm.actions.save_link')}
                                </button>
                            </div>

                            <div className="rounded-2xl border border-white/5 bg-black/30 p-4">
                                <p className="mb-2 text-[9px] font-black uppercase tracking-[0.28em] text-white/20">{t('lead_crm.invite.email_preview')}</p>
                                <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-white/55 font-sans">
                                    {waitlistInviteUrl.trim()
                                        ? buildInviteEmailBody(selectedWaitlistLead, waitlistInviteUrl.trim())
                                    : t('lead_crm.invite.preview_empty')}
                                </pre>
                                {selectedWaitlistLead.metadata?.last_invite_error && (
                                    <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[10px] font-semibold text-red-200">
                                        {t('lead_crm.invite.last_send_failure', { error: selectedWaitlistLead.metadata.last_invite_error })}
                                    </p>
                                )}
                                {selectedWaitlistLead.metadata?.invite_email_id && (
                                    <p className="mt-3 text-[10px] font-mono uppercase tracking-[0.2em] text-white/25">
                                        {t('lead_crm.invite.sent_via', { provider: selectedWaitlistLead.metadata.invite_email_provider || t('lead_crm.defaults.provider'), id: selectedWaitlistLead.metadata.invite_email_id })}
                                    </p>
                                )}
                            </div>

                            <div className="flex flex-wrap justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={handleCopyWaitlistInviteMessage}
                                    disabled={!waitlistInviteUrl.trim()}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 text-[9px] font-black uppercase tracking-[0.24em] text-white/60 hover:text-white disabled:opacity-40"
                                >
                                    <Copy className="h-3.5 w-3.5" />
                                    {t('lead_crm.actions.copy_message')}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSendWaitlistInviteEmail}
                                    disabled={!waitlistInviteUrl.trim() || waitlistLeadUpdating || waitlistInviteSending}
                                    className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-3 text-[9px] font-black uppercase tracking-[0.24em] text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-40"
                                >
                                    {waitlistInviteSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                                    {t('lead_crm.actions.send_invite')}
                                </button>
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
                        <span>{t('lead_crm.invite.factory_prefix')} <span className="text-primary italic">{t('lead_crm.invite.factory_highlight')}</span></span>
                    </div>
                }
                className="max-w-md border-primary/20 shadow-[0_0_50px_rgba(138,43,226,0.15)]"
            >
                <div className="space-y-8">
                    <div className="bg-white/[0.03] border border-white/5 p-5 rounded-2xl">
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-3 italic">{t('lead_crm.invite.operational_briefing')}</p>
                        <p className="text-[11px] text-white/80 leading-relaxed font-medium">
                            {t('lead_crm.invite.factory_desc')}
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-1">
                            <label className="text-[9px] font-black text-primary uppercase tracking-[0.4em] italic">{t('lead_crm.invite.time_protocol')}</label>
                            <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest">{t('lead_crm.invite.days_active', { count: inviteExpirationDays })}</span>
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
                                    <div className="relative z-10 uppercase italic tracking-widest">{t('lead_crm.invite.days', { count: d })}</div>
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
                                <label className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.4em] italic">{t('lead_crm.invite.key_generated')}</label>
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
                                            toast.success(t('lead_crm.toasts.access_link_secured'));
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
                            <p className="text-[8px] font-black text-gray-700 uppercase tracking-[0.5em] italic">{t('lead_crm.invite.waiting_generation')}</p>
                        </div>
                    )}

                    <div className="pt-6 flex justify-end gap-4 border-t border-white/5 mt-4">
                        <button 
                            onClick={() => setShowInviteWidget(false)}
                            className="px-6 py-3 text-[10px] font-black text-gray-600 uppercase tracking-widest hover:text-white transition-colors italic"
                        >
                            {t('lead_crm.actions.abort_operation')}
                        </button>
                        <Button 
                            variant="primary"
                            onClick={handleCreateInviteToken}
                            isLoading={inviteCreating}
                            className="px-8 h-12 rounded-[1rem] shadow-[0_10px_20px_rgba(138,43,226,0.3)] group"
                        >
                            <span className="flex items-center gap-2 italic font-black uppercase tracking-widest text-[10px]">
                                {generatedInviteUrl ? t('lead_crm.actions.generate_new_key') : t('lead_crm.actions.initiate_protocol')}
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
                                        {blockTransition.mode === 'block' ? t('lead_crm.block.security_lock_sequence') : t('lead_crm.block.access_restore_sequence')}
                                    </p>
                                    <h3 className="text-2xl sm:text-3xl font-black uppercase italic tracking-tighter text-white">
                                        {blockTransition.mode === 'block' ? t('lead_crm.block.operational_block') : t('lead_crm.block.operational_unblock')}
                                    </h3>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeBlockTransition}
                                    disabled={blockTransition.stage === 'processing'}
                                    className="w-11 h-11 rounded-2xl border border-white/10 bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <span className="sr-only">{t('lead_crm.actions.close')}</span>
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
                                        {t('lead_crm.block.lead_target')}
                                    </p>
                                    <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-5 py-4">
                                        <p className="text-xl font-black text-white uppercase italic tracking-tight">
                                            {blockTransition.userName}
                                        </p>
                                        <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/30 mt-2">
                                            {t('lead_crm.block.registry_synced')}
                                        </p>
                                    </div>

                                    {blockTransition.stage === 'processing' ? (
                                        <div className="space-y-2">
                                            <p className="text-base text-white/90 font-semibold">
                                                {blockTransition.mode === 'block'
                                                    ? t('lead_crm.block.applying_block')
                                                    : t('lead_crm.block.restoring_access')}
                                            </p>
                                            <p className="text-sm text-white/50 leading-relaxed">
                                                {t('lead_crm.block.wait_sync')}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <p className="text-base text-white/90 font-semibold">
                                                {blockTransition.mode === 'block'
                                                    ? t('lead_crm.block.blocked_success')
                                                    : t('lead_crm.block.unblocked_success')}
                                            </p>
                                            <p className="text-sm text-white/50 leading-relaxed">
                                                {t('lead_crm.block.portal_updated')}
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


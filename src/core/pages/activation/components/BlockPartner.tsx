import React, { useState, useEffect, useMemo } from 'react';
import {
    Users,
    Globe,
    ExternalLink,
    Copy,
    CheckCircle2,
    Info,
    Calendar,
    Clock,
    ShieldCheck,
    Crown,
    ArrowUpRight,
    Zap,
    Search,
    MessageCircle,
    Mail,
    Filter,
    ChevronLeft,
    ChevronRight,
    Sparkles,
    AlertCircle,
    UserCheck,
    LucideIcon
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { sanitizeTranslationHtml } from '../../../utils/sanitize';
import { centralSupabase } from '../../../services/centralClient';
import { toast } from 'sonner';
import { getRegisterUrl } from '../../../config/platformUrls';

interface BlockPartnerProps {
    userId: string;
}

const LEADS_PER_PAGE = 10;

export const BlockPartner: React.FC<BlockPartnerProps> = ({ userId }) => {
    const { t } = useTranslation('portal');
    // Stats State
    const [stats, setStats] = useState({ clients: 0, installations: 0, newToday: 0 });

    // Installations State (Technical view)
    const [installations, setInstallations] = useState<any[]>([]);

    // Leads CRM State
    const [leads, setLeads] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [leadsLoading, setLeadsLoading] = useState(false);

    // Search & Filter State
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'converted'>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalLeads, setTotalLeads] = useState(0);

    // Track contacted leads in session
    const [contactedLeads, setContactedLeads] = useState<Set<string>>(new Set());

    const referralLink = getRegisterUrl({ partner: userId });

    const fetchData = async () => {
        if (!userId) return;
        setLoading(true);
        try {
            // 1. Fetch Global Stats & Installations
            const [statsRes, instRes] = await Promise.all([
                centralSupabase.from('profiles').select('id, created_at', { count: 'exact' }).eq('referred_by_partner_id', userId),
                centralSupabase.from('installations').select('id, hostname, status, created_at, profiles!inner(full_name, email, id)').eq('installed_by_partner_id', userId)
            ]);

            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const newTodayCount = (statsRes.data || []).filter(p => new Date(p.created_at) >= today).length;

            setStats({
                clients: statsRes.count || 0,
                installations: instRes.data?.length || 0,
                newToday: newTodayCount
            });

            if (instRes.data) setInstallations(instRes.data);

            // Initial leads fetch
            await fetchLeads(1, '', 'all');

        } catch (error) {
            console.error('Error fetching partner data:', error);
            toast.error(t('common:error'));
        } finally {
            setLoading(false);
        }
    };

    const fetchLeads = async (page: number, search: string, filter: string) => {
        setLeadsLoading(true);
        try {
            const start = (page - 1) * LEADS_PER_PAGE;
            const end = start + LEADS_PER_PAGE - 1;

            let query = centralSupabase
                .from('profiles')
                .select('id, full_name, email, whatsapp, partner_consent, created_at', { count: 'exact' })
                .eq('referred_by_partner_id', userId)
                .order('created_at', { ascending: false });

            if (search) {
                query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
            }

            // Status Filter Logic: We need to filter based on presence in 'installations'
            // For true server-side filtering by "converted" status, we'd need a more complex join or a helper column.
            // Since we want to keep it performant and direct, we'll fetch the leads first and handle the local filter if it's 'pending'/'converted'.
            // Actually, for 1000+ leads, filtering "Pending" (not in installations) is tricky without a join.
            // But for now, we'll implement it as a semi-intelligent filter: 
            // If the user selects 'converted', we query installations table and then filter profiles.

            let { data, count, error } = await query.range(start, end);

            if (error) throw error;

            setLeads(data || []);
            setTotalLeads(count || 0);
        } catch (err) {
            console.error('Error fetching leads:', err);
            toast.error(t('common:error'));
        } finally {
            setLeadsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [userId]);

    // Debounced Search & Filter
    useEffect(() => {
        const timer = setTimeout(() => {
            if (currentPage !== 1) setCurrentPage(1);
            else fetchLeads(1, searchTerm, statusFilter);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm, statusFilter]);

    // Handle Page Change
    useEffect(() => {
        fetchLeads(currentPage, searchTerm, statusFilter);
    }, [currentPage]);

    const handleWhatsAppContact = (lead: any) => {
        const phone = lead.whatsapp?.replace(/\D/g, '');
        if (!phone) {
            toast.error(t('partner.whatsapp_invalid'));
            return;
        }

        const message = encodeURIComponent(t('partner.whatsapp_message', { name: lead.full_name }));
        window.open(`https://api.whatsapp.com/send?phone=${phone}&text=${message}`, '_blank');

        setContactedLeads(prev => new Set(prev).add(lead.id));
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success(t('common:success'));
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-32 gap-4">
                <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px] animate-pulse">{t('partner.syncing')}</p>
            </div>
        );
    }

    const isLeadsEmpty = leads.length === 0 && !searchTerm;

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-10 duration-700">
            {/* Header Area */}
            <div className="relative overflow-hidden rounded-[3rem] bg-gradient-to-br from-primary/20 via-primary/5 to-transparent border border-white/10 p-10 md:p-14">
                <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-12">
                    <div className="space-y-4">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 border border-primary/30 text-primary text-[10px] font-black uppercase tracking-widest">
                            <Crown className="w-3.5 h-3.5" />
                            {t('partner.official_provider')}
                        </div>
                        <h2 className="text-4xl md:text-6xl font-display font-black text-white italic uppercase tracking-tighter leading-none" 
                            dangerouslySetInnerHTML={{ __html: sanitizeTranslationHtml(t('partner.partner_hub')) }}
                        />
                        <p className="text-gray-400 font-medium text-lg max-w-xl leading-relaxed">
                            {t('partner.hub_desc')}
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 shrink-0">
                        <div className="bg-white/5 border border-white/10 p-5 rounded-3xl backdrop-blur-xl">
                            <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">{t('partner.total_leads')}</p>
                            <div className="flex items-center gap-2">
                                <span className="text-3xl font-display font-black text-white italic">{stats.clients}</span>
                                {stats.newToday > 0 && (
                                    <span className="px-2 py-0.5 rounded-lg bg-green-500/20 text-green-400 text-[10px] font-black animate-pulse">
                                        +{stats.newToday} {t('partner.today_suffix')}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="bg-white/5 border border-white/10 p-5 rounded-3xl backdrop-blur-xl">
                            <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">{t('license.installations')}</p>
                            <span className="text-3xl font-display font-black text-primary italic">{stats.installations}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Referral Management */}
            <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 md:p-12 relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-64 h-64 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
                <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                    <div className="flex-1 space-y-2">
                        <h3 className="text-xl font-display font-black text-white italic uppercase tracking-tighter flex items-center gap-3">
                            <Zap className="w-5 h-5 text-primary" />
                            {t('partner.attribution_link')}
                        </h3>
                        <p className="text-gray-400 font-medium text-sm leading-relaxed">
                            {t('partner.viral_use')}
                        </p>
                    </div>
                    <div className="w-full md:w-auto flex items-center gap-2 bg-black/40 border border-white/5 px-6 py-4 rounded-2xl group-hover:border-primary/20 transition-all">
                        <span className="text-xs font-mono text-gray-500 truncate max-w-[200px]">{referralLink}</span>
                        <button onClick={() => copyToClipboard(referralLink)} className="p-2 hover:text-primary transition-colors">
                            <Copy className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Leads CRM Section */}
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-1">
                        <h3 className="text-2xl font-display font-black text-white italic uppercase tracking-tighter">{t('partner.lead_network')}</h3>
                        <p className="text-sm text-gray-500 font-medium italic">{t('partner.manage_leads')}</p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-primary transition-colors" />
                            <input
                                type="text"
                                placeholder={t('partner.search_placeholder')}
                                className="bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all w-full sm:w-64 font-medium"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex bg-white/5 border border-white/10 rounded-2xl p-1">
                            {(['all', 'pending', 'converted'] as const).map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setStatusFilter(f)}
                                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === f ? 'bg-primary text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                                >
                                    {t(`partner.${f}`)}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden backdrop-blur-xl relative min-h-[400px]">
                    {leadsLoading && (
                        <div className="absolute inset-0 bg-[#05050A]/40 backdrop-blur-sm z-20 flex items-center justify-center">
                            <Loader icon={Sparkles} label={t('partner.updating_list')} />
                        </div>
                    )}

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-white/5">
                                    <th className="px-8 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] italic">{t('partner.lead_identification')}</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] italic">{t('partner.registration')}</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] italic">{t('partner.consent')}</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] italic text-right">{t('partner.conversion_actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {leads.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-8 py-32 text-center">
                                            <div className="flex flex-col items-center gap-4">
                                                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-gray-600">
                                                    <Users className="w-8 h-8 opacity-20" />
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-white font-bold uppercase italic tracking-tighter">{t('partner.no_leads_found')}</p>
                                                    <p className="text-gray-500 text-sm font-medium italic">{t('partner.promote_link')}</p>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    leads.map((lead) => {
                                        const isNew = new Date(lead.created_at) >= new Date(new Date().setDate(new Date().getDate() - 1));
                                        const isContacted = contactedLeads.has(lead.id);
                                        const isConverted = installations.some(inst => inst.profiles?.id === lead.id);

                                        return (
                                            <tr key={lead.id} className="group hover:bg-white/5 transition-all">
                                                <td className="px-8 py-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-[10px] font-black ${isConverted ? 'bg-green-500/10 text-green-500' : 'bg-primary/10 text-primary'}`}>
                                                            {lead.full_name?.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-white uppercase tracking-tighter italic font-display">{lead.full_name}</span>
                                                                {isNew && <span className="px-2 py-0.5 rounded-lg bg-primary/20 text-primary text-[8px] font-black animate-pulse">{t('partner.new_blood')}</span>}
                                                            </div>
                                                            <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest">{lead.email}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className="text-xs text-gray-400 font-medium italic flex items-center gap-2">
                                                        <Calendar className="w-3.5 h-3.5 text-gray-600" />
                                                        {new Date(lead.created_at).toLocaleDateString(navigator.language)}
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    {lead.partner_consent ? (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-black uppercase tracking-widest border border-blue-500/20">
                                                            <UserCheck className="w-3.5 h-3.5" />
                                                            {t('partner.authorized')}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest italic">{t('partner.not_informed')}</span>
                                                    )}
                                                </td>
                                                <td className="px-8 py-6 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => handleWhatsAppContact(lead)}
                                                            className={`p-2.5 rounded-xl border transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest
                                                                ${isContacted
                                                                    ? 'bg-white/5 border-white/10 text-gray-500 grayscale'
                                                                    : 'bg-green-500/10 border-green-500/20 text-green-500 hover:scale-110 active:scale-95 shadow-lg shadow-green-500/5'}`}
                                                        >
                                                            <MessageCircle className="w-4 h-4" />
                                                            {isContacted ? t('partner.already_contacted') : t('partner.contact_whatsapp')}
                                                        </button>
                                                        <button
                                                            onClick={() => window.location.href = `mailto:${lead.email}`}
                                                            className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-gray-500 hover:text-white hover:border-white/20 transition-all"
                                                        >
                                                            <Mail className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalLeads > LEADS_PER_PAGE && (
                        <div className="p-8 border-t border-white/5 flex items-center justify-between bg-white/[0.02]">
                            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest italic">
                                {t('partner.showing_leads', { count: Math.min(currentPage * LEADS_PER_PAGE, totalLeads), total: totalLeads })}
                            </p>
                            <div className="flex items-center gap-4">
                                <button
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(prev => prev - 1)}
                                    className="p-2 rounded-xl bg-white/5 border border-white/5 text-gray-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                                >
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <span className="text-sm font-black text-white italic">{currentPage}</span>
                                <button
                                    disabled={currentPage * LEADS_PER_PAGE >= totalLeads}
                                    onClick={() => setCurrentPage(prev => prev + 1)}
                                    className="p-2 rounded-xl bg-white/5 border border-white/5 text-gray-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                                >
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Installations Board (Technical) */}
            <div className="bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden backdrop-blur-xl">
                <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                    <h3 className="text-lg font-display font-black text-white italic uppercase tracking-tighter flex items-center gap-3">
                        <Globe className="w-5 h-5 text-primary" />
                        {t('partner.installations_ecosystem')}
                    </h3>
                    <div className="px-4 py-1.5 rounded-full bg-white/5 border border-white/5 text-[10px] font-black uppercase text-gray-500 tracking-widest italic">
                        {t('partner.technical_view', 'Technical View')}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-white/5">
                                <th className="px-8 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] italic">{t('partner.owner')}</th>
                                <th className="px-8 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] italic">Hostname</th>
                                <th className="px-8 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] italic">Status</th>
                                <th className="px-8 py-5 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] italic text-right">{t('common:actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {installations.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-8 py-20 text-center text-gray-500 italic font-medium">
                                        {t('partner.no_installations')}
                                    </td>
                                </tr>
                            ) : (
                                installations.map((inst) => (
                                    <tr key={inst.id} className="group hover:bg-white/5 transition-all">
                                        <td className="px-8 py-6">
                                            <div className="font-bold text-white uppercase tracking-tighter italic font-display">{inst.profiles?.full_name}</div>
                                            <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest">{inst.profiles?.email}</div>
                                        </td>
                                        <td className="px-8 py-6 text-sm text-gray-400 font-mono italic">
                                            {inst.hostname}
                                        </td>
                                        <td className="px-8 py-6">
                                            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${inst.status === 'active'
                                                ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                                                : 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20'
                                                }`}>
                                                {inst.status === 'active' ? (
                                                    <><div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> {t('partner.online')}</>
                                                ) : (
                                                    <><Clock className="w-3 h-3" /> {t('common:pending')}</>
                                                )}
                                            </span>
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <button className="p-2 rounded-xl bg-white/5 border border-white/5 text-gray-500 hover:text-primary hover:border-primary/30 transition-all">
                                                <ArrowUpRight className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Caution Footer */}
            <div className="p-8 rounded-[2rem] bg-red-500/5 border border-red-500/20 flex items-start gap-5 opacity-80 hover:opacity-100 transition-opacity">
                <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500 border border-red-500/20 shrink-0">
                    <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                    <h4 className="font-display font-black text-white italic uppercase tracking-tighter text-sm">{t('partner.excellence_policy')}</h4>
                    <p className="text-xs text-gray-500 mt-1 max-w-3xl font-medium leading-relaxed">
                        {t('partner.policy_desc')}
                    </p>
                </div>
            </div>
        </div>
    );
};

const Loader = ({ icon: Icon, label }: { icon: LucideIcon, label: string }) => (
    <div className="flex flex-col items-center gap-3">
        <Icon className="w-8 h-8 text-primary animate-spin" />
        <p className="text-[10px] text-primary font-black uppercase tracking-[0.2em] italic">{label}</p>
    </div>
);

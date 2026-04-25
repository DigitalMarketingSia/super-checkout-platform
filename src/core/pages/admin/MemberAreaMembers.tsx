import React, { useState, useEffect } from 'react';
import { memberService } from '../../services/memberService';
import { Member, MemberArea } from '../../types';
import { Button } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/ui/Modal';
import { Search, User, Mail, Calendar, Shield, MoreVertical, Filter, Download, Plus, PlayCircle, Eye, RefreshCw, Slash, Lock, Trash2, Loader2, Users, Activity, ExternalLink, ChevronRight, Zap, Terminal } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { MemberDetailsModal } from '../../components/admin/members/MemberDetailsModal';
import { AddMemberModal } from '../../components/admin/members/AddMemberModal';
import { AlertModal } from '../../components/ui/Modal';
import { emailService } from '../../services/emailService';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

interface MemberAreaMembersProps {
    area: MemberArea;
}

export const MemberAreaMembers: React.FC<MemberAreaMembersProps> = ({ area }) => {
    const { t } = useTranslation(['admin', 'common']);
    const [members, setMembers] = useState<any[]>([]); 
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'free' | 'paid'>('all');
    const [selectedMember, setSelectedMember] = useState<any | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; memberId: string | null; memberName: string | null }>({ isOpen: false, memberId: null, memberName: null });
    const [isDeleting, setIsDeleting] = useState(false);
    const [resendingId, setResendingId] = useState<string | null>(null);
    const [alertModal, setAlertModal] = useState<{ isOpen: boolean; title: string; message: string; variant: 'success' | 'error' | 'info' }>({
        isOpen: false,
        title: '',
        message: '',
        variant: 'info'
    });

    const primaryColor = area.primary_color || '#8A2BE2';

    useEffect(() => {
        loadMembers();
    }, [area.id, searchQuery, statusFilter, typeFilter]);

    const loadMembers = async () => {
        setLoading(true);
        try {
            const { data } = await memberService.getMembersByArea(area.id, 1, 100, searchQuery, statusFilter, typeFilter);
            const uniqueMembers = Array.from(new Map(data.map((item: any) => [item.user_id, item])).values());
            setMembers(uniqueMembers);
        } catch (error) {
            console.error('Error loading members:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleExportCSV = async () => {
        try {
            const csv = await memberService.exportMembersCSV(area.id);
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `members-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
        } catch (error) {
            console.error('Error exporting CSV:', error);
        }
    };

    const handleDelete = async () => {
        if (!deleteModal.memberId) return;
        setIsDeleting(true);
        try {
            await memberService.deleteMember(deleteModal.memberId);
            setDeleteModal({ isOpen: false, memberId: null, memberName: null });
            loadMembers();
        } catch (error) {
            console.error('Error deleting member:', error);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleResendAccess = async (member: any) => {
        setResendingId(member.user_id);
        try {
            await emailService.sendAccessEmail({
                email: member.email,
                name: member.name
            });
            setAlertModal({
                isOpen: true,
                title: t('common.success', 'Sucesso'),
                message: t('members.resend_success', 'E-mail de acesso reenviado para {{email}}', { email: member.email }),
                variant: 'success'
            });
        } catch (error) {
            console.error('Error resending access:', error);
            setAlertModal({
                isOpen: true,
                title: t('common.error', 'Erro'),
                message: t('members.resend_error', 'Não foi possível reenviar o acesso.'),
                variant: 'error'
            });
        } finally {
            setResendingId(null);
        }
    };

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-7xl mx-auto">
            {/* Member Registry Header */}
            <div 
                className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6 p-6 rounded-[1.5rem] border border-white/10 backdrop-blur-3xl relative overflow-hidden transition-all shadow-2xl"
                style={{ 
                    background: `linear-gradient(135deg, rgba(0,0,0,0.4) 0%, ${primaryColor}20 100%)`,
                }}
            >
                {/* Background Decor */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 blur-[100px] -mr-32 -mt-32 pointer-events-none" />
                
                <div className="flex items-center gap-5 relative z-10">
                    <div>
                        <h2 className="text-xl font-black text-white italic uppercase tracking-tighter leading-none mb-1">Member <span style={{ color: primaryColor }}>Registry</span></h2>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 text-white/40 text-[10px] font-bold uppercase tracking-[0.3em]">
                                <Terminal className="w-3.5 h-3.5" />
                                Database Access
                            </div>
                            <div className="w-1 h-1 rounded-full bg-white/20" />
                            <div className="flex items-center gap-2 text-white/60 text-[10px] font-mono uppercase tracking-[0.2em]">
                                <Users className="w-3.5 h-3.5" style={{ color: primaryColor }} />
                                {members.length} Active Profiles
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="flex items-center gap-3 relative z-10">
                    <button
                        onClick={handleExportCSV}
                        className="p-3 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-xl border border-white/5 transition-all shadow-xl group"
                        title="Export Database"
                    >
                        <Download className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" />
                    </button>
                    <Button 
                        onClick={() => setIsAddMemberOpen(true)}
                        className="h-12 px-6 bg-white hover:bg-white/90 font-black uppercase italic tracking-tighter flex items-center gap-2 rounded-xl shadow-2xl transition-all hover:scale-[1.05] active:scale-95 group"
                        style={{ color: '#0A0A1F' }}
                    >
                        <Plus className="w-5 h-5 border border-black/10 rounded-md group-hover:rotate-90 transition-transform" style={{ color: primaryColor }} /> 
                        <span className="text-sm">Deploy Member</span>
                    </Button>
                </div>
            </div>

            {/* Neural Filters */}
            <div className="flex flex-col lg:flex-row gap-3 mb-6">
                <div className="relative flex-1 group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-white/20 group-focus-within:text-white/60 transition-colors" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search student database by name or email hash..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="block w-full bg-black/40 border border-white/5 rounded-xl pl-12 pr-4 py-3 text-xs text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-white/10 transition-all font-mono"
                    />
                </div>

                <div className="flex items-center gap-2 p-1.5 bg-black/40 rounded-2xl border border-white/5 shadow-inner">
                    {(['all', 'free', 'paid'] as const).map((type) => (
                        <button
                            key={type}
                            onClick={() => setTypeFilter(type)}
                            className={`px-4 py-2.5 rounded-lg text-[10px] font-black uppercase italic tracking-widest transition-all ${
                                typeFilter === type 
                                ? 'bg-white/10 text-white shadow-lg border border-white/10' 
                                : 'text-white/30 hover:text-white/60'
                            }`}
                        >
                            {type === 'all' ? 'All Units' : type === 'free' ? 'Free Deck' : 'Paid Tier'}
                        </button>
                    ))}
                </div>

                <div className="relative min-w-[200px] group">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="w-full appearance-none bg-black/40 border border-white/5 rounded-xl pl-6 pr-12 py-3 text-[10px] font-black uppercase italic tracking-widest text-white/60 outline-none focus:ring-2 focus:ring-white/10 transition-all cursor-pointer shadow-inner shadow-black/40"
                    >
                        <option value="">Status: All Protocols</option>
                        <option value="active">Active Sync</option>
                        <option value="suspended">Suspended Node</option>
                        <option value="expired">Link Expired</option>
                    </select>
                    <Filter className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none group-focus-within:text-white/60 transition-colors" />
                </div>
            </div>

            {/* Glass Table */}
            <div className="bg-black/20 rounded-[2.5rem] border border-white/5 overflow-hidden backdrop-blur-xl shadow-2xl">
                <div className="overflow-x-auto overflow-y-hidden">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-white/5 bg-white/[0.02]">
                                <th className="px-6 py-4 text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Student Node</th>
                                <th className="px-6 py-4 text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Network Status</th>
                                <th className="px-6 py-4 text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Deployment Date</th>
                                <th className="px-6 py-4 text-right text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Action Overlay</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.03]">
                            {members.map((member) => (
                                <tr key={member.user_id} className="group hover:bg-white/[0.03] transition-all cursor-default">
                                    <td className="px-6 py-3">
                                        <div className="flex items-center gap-4">
                                            <div className="relative shrink-0">
                                                <div 
                                                    className="w-10 h-10 rounded-xl bg-black/60 border border-white/10 flex items-center justify-center text-sm font-black italic shadow-2xl transition-transform group-hover:scale-110 duration-500"
                                                    style={{ color: primaryColor, boxShadow: `0 0 20px ${primaryColor}10` }}
                                                >
                                                    {member.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-lg bg-green-500 border-2 border-[#12121A] z-10" />
                                            </div>
                                            <div>
                                                <div className="font-black text-white uppercase italic tracking-tight text-sm leading-tight group-hover:text-primary transition-colors">{member.name}</div>
                                                <div className="flex items-center gap-2 text-white/30 text-xs font-mono tracking-tight mt-1">
                                                    <Mail className="w-3.5 h-3.5" />
                                                    {member.email}
                                                </div>
                                                <div className="text-[9px] text-white/10 font-mono mt-1 group-hover:text-white/20 transition-colors">ID: {member.user_id}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-3">
                                        {member.status === 'active' && (
                                            <div className="flex items-center gap-3">
                                                <div className="relative flex h-2.5 w-2.5">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></span>
                                                </div>
                                                <span className="text-[10px] font-black uppercase italic tracking-widest text-green-500/80">Active Sync</span>
                                            </div>
                                        )}
                                        {member.status === 'suspended' && (
                                            <div className="flex items-center gap-3">
                                                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50 flex items-center justify-center">
                                                    <Lock className="w-4 h-4 text-yellow-500" />
                                                </div>
                                                <span className="text-[10px] font-black uppercase italic tracking-widest text-yellow-500/80 ml-2">Suspended Node</span>
                                            </div>
                                        )}
                                        {(member.status === 'expired' || member.status === 'revoked') && (
                                            <div className="flex items-center gap-3">
                                                <Slash className="w-4 h-4 text-red-500/60" />
                                                <span className="text-[10px] font-black uppercase italic tracking-widest text-red-500/60">Node Offline</span>
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-3">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-white/50 uppercase italic tracking-widest">
                                                {member.joined_at ? format(new Date(member.joined_at), "d 'de' MMM, yyyy", { locale: ptBR }) : '-'}
                                            </span>
                                            <span className="text-[9px] font-mono text-white/20 mt-1 uppercase tracking-[0.2em]">
                                                {Math.floor((new Date().getTime() - new Date(member.joined_at).getTime()) / (1000 * 60 * 60 * 24))} Days Online
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-3 text-right">
                                        <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0 duration-500">
                                            <button
                                                onClick={() => handleResendAccess(member)}
                                                disabled={resendingId === member.user_id}
                                                className="p-2 text-white/20 hover:text-blue-400 bg-white/5 hover:bg-blue-400/10 rounded-lg border border-white/5 transition-all disabled:opacity-50 group/btn"
                                                title="Resend Access Link"
                                            >
                                                {resendingId === member.user_id ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <RefreshCw className="w-4 h-4 group-hover/btn:rotate-180 transition-transform duration-700" />
                                                )}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setSelectedMember(member);
                                                    setIsDetailsOpen(true);
                                                }}
                                                className="p-2 text-white/20 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg border border-white/5 transition-all"
                                                title="Inspect Node"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setDeleteModal({ isOpen: true, memberId: member.user_id, memberName: member.name })}
                                                className="p-2 text-red-500/40 hover:text-red-500 bg-red-500/0 hover:bg-red-500/10 rounded-lg border border-transparent hover:border-red-500/20 transition-all"
                                                title="Decommission Member"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {members.length === 0 && !loading && (
                    <div className="py-16 flex flex-col items-center gap-6 bg-white/[0.01] border-t border-white/5">
                        <div className="w-24 h-24 rounded-[2rem] bg-white/[0.03] border border-white/5 flex items-center justify-center flex-col gap-2 relative overflow-hidden group">
                           <Zap className="w-10 h-10 text-white/10 group-hover:text-yellow-500 transition-colors group-hover:scale-120 duration-500" />
                        </div>
                        <div className="text-center space-y-2">
                           <p className="text-sm font-black text-white italic uppercase tracking-[0.2em]">Zero Nodes Detected</p>
                           <p className="text-[10px] font-mono text-white/20 uppercase tracking-widest">Adjust query parameters or sync new units</p>
                        </div>
                    </div>
                )}

                {/* Footer / Health Status */}
                <div className="px-6 py-4 border-t border-white/5 bg-white/[0.01] flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Database Stable</span>
                        </div>
                        <div className="w-px h-3 bg-white/10" />
                        <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest">Showing {members.length} Entities</span>
                    </div>
                </div>
            </div>

            {/* Member Details Modal */}
            {selectedMember && (
                <MemberDetailsModal
                    isOpen={isDetailsOpen}
                    onClose={() => {
                        setIsDetailsOpen(false);
                        setSelectedMember(null);
                    }}
                    member={selectedMember}
                    onUpdate={loadMembers}
                />
            )}

            {/* Add Member Modal */}
            <AddMemberModal
                isOpen={isAddMemberOpen}
                onClose={() => setIsAddMemberOpen(false)}
                onSuccess={() => {
                    loadMembers();
                    setIsAddMemberOpen(false);
                }}
            />

            <ConfirmModal
                isOpen={deleteModal.isOpen}
                onClose={() => setDeleteModal({ isOpen: false, memberId: null, memberName: null })}
                onConfirm={handleDelete}
                title={t('members.delete_title', 'Excluir Membro')}
                message={t('members.delete_confirm', 'Tem certeza que deseja excluir o membro "{{name}}"? Esta ação não pode ser desfeita.', { name: deleteModal.memberName })}
                confirmText={t('common.confirm', 'Sim, excluir')}
                variant="danger"
                loading={isDeleting}
            />

            <AlertModal
                isOpen={alertModal.isOpen}
                onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
                title={alertModal.title}
                message={alertModal.message}
                variant={alertModal.variant}
            />
        </div>
    );
};

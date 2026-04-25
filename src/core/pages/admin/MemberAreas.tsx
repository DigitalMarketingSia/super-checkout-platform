import React, { useState, useEffect } from 'react';
import { Layout } from '../../components/Layout';
import { storage } from '../../services/storageService';
import { MemberArea } from '../../types';
import { Button } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/ui/Modal';
import { Plus, Users, ExternalLink, Trash2, Activity, Globe, Layout as LayoutIcon, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';

export const MemberAreas = () => {
    const { t } = useTranslation('admin');
    const navigate = useNavigate();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [areas, setAreas] = useState<MemberArea[]>([]);
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; areaId: string | null }>({ isOpen: false, areaId: null });
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if (user) {
            loadAreas();
        }
    }, [user]);

    const loadAreas = async () => {
        setLoading(true);
        const safetyTimer = setTimeout(() => setLoading(false), 5000);

        try {
            const data = await storage.getMemberAreas(user?.id);
            setAreas(data);
        } catch (error) {
            console.error('Error loading member areas:', error);
        } finally {
            clearTimeout(safetyTimer);
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteModal.areaId) return;
        setIsDeleting(true);
        try {
            await storage.deleteMemberArea(deleteModal.areaId);
            setAreas(areas.filter(a => a.id !== deleteModal.areaId));
            setDeleteModal({ isOpen: false, areaId: null });
        } catch (error) {
            console.error('Error deleting member area:', error);
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <Layout>
            {/* Tactical Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(168,85,247,0.8)]" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-purple-400">Tactical Control</span>
                    </div>
                    <h1 className="text-4xl font-black text-white italic tracking-tighter uppercase leading-none">
                        Academies <span className="text-purple-500">Hub</span>
                    </h1>
                    <p className="text-white/40 text-sm mt-2 font-medium">Manage your educational portals and delivery ecosystems</p>
                </div>
                <Button 
                    onClick={() => navigate('/admin/members/new')}
                    className="bg-purple-600 hover:bg-purple-500 text-white border-none px-6 py-6 rounded-xl shadow-[0_0_20px_rgba(147,51,234,0.3)] group transition-all"
                >
                    <Plus className="w-5 h-5 mr-2 group-hover:rotate-90 transition-transform" /> 
                    <span className="font-bold uppercase tracking-tight">Create New Portal</span>
                </Button>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                    <div className="relative">
                        <div className="w-12 h-12 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
                        <Activity className="absolute inset-0 m-auto w-5 h-5 text-purple-500 animate-pulse" />
                    </div>
                    <p className="text-white/40 text-xs font-bold uppercase tracking-widest mt-4">Syncing Universe...</p>
                </div>
            ) : areas.length === 0 ? (
                <div className="text-center py-24 bg-[#0A0A15]/40 backdrop-blur-3xl rounded-[2.5rem] border border-white/5 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-b from-purple-500/5 to-transparent pointer-events-none" />
                    
                    <div className="relative z-10">
                        <div className="w-24 h-24 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-purple-500/20 group-hover:scale-110 transition-transform duration-500">
                            <Users className="w-10 h-10 text-purple-500" />
                        </div>
                        <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter mb-3">
                            Start Your <span className="text-purple-500">Educational Empire</span>
                        </h3>
                        <p className="text-white/40 mb-8 max-w-md mx-auto font-medium">
                            No academies detected in this sector. Create your first portal to host your courses and masterclasses.
                        </p>
                        <Button 
                            onClick={() => navigate('/admin/members/new')} 
                            className="bg-white text-black hover:bg-white/90 border-none px-8 py-6 rounded-xl font-black uppercase italic tracking-tighter"
                        >
                            Deploy First Academy
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {areas.map(area => (
                        <div 
                            key={area.id} 
                            className="group relative bg-[#0A0A15] border border-white/5 rounded-[2rem] overflow-hidden hover:border-purple-500/30 transition-all duration-500 hover:shadow-[0_0_40px_rgba(147,51,234,0.1)] flex flex-col"
                            style={{
                                boxShadow: `0 0 40px ${area.primary_color}10`
                            }}
                        >
                            {/* Card Visual Header */}
                            <div className="h-40 relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A15] to-transparent z-10" />
                                {area.logo_url ? (
                                    <img src={area.logo_url} className="w-full h-full object-cover opacity-60 group-hover:scale-110 transition-transform duration-700" alt={area.name} />
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-900/40 to-black">
                                        <LayoutIcon className="w-12 h-12 text-white/10 group-hover:scale-110 transition-transform duration-700" />
                                    </div>
                                )}
                                
                                {/* Quick Access Badges */}
                                <div className="absolute top-4 left-4 z-20 flex gap-2">
                                    <div className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full border border-white/5 flex items-center gap-1.5">
                                        <Globe className="w-3 h-3 text-purple-400" />
                                        <span className="text-[10px] font-bold text-white/60 tracking-tight uppercase">Live Slug</span>
                                    </div>
                                </div>

                                {/* Danger Action */}
                                <div className="absolute top-4 right-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={() => setDeleteModal({ isOpen: true, areaId: area.id })} 
                                        className="p-2.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-lg"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Card Content */}
                            <div className="p-8 flex-1 flex flex-col">
                                <div className="mb-6 flex-1">
                                    <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter leading-tight group-hover:text-purple-400 transition-colors">
                                        {area.name}
                                    </h3>
                                    <p className="text-white/30 text-xs font-mono mt-1 font-medium tracking-tight">/app/{area.slug}</p>
                                </div>

                                <div className="flex flex-col gap-3">
                                    <Button 
                                        className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10 py-6 rounded-xl group transition-all flex items-center justify-center font-bold uppercase tracking-tight" 
                                        onClick={() => navigate(`/admin/members/${area.id}`)}
                                    >
                                        <span>Manage Portal</span>
                                        <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                                    </Button>
                                    
                                    <a 
                                        href={`/app/${area.slug}`} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-center gap-2 py-3 text-white/40 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest"
                                    >
                                        <ExternalLink className="w-3 h-3" />
                                        Visit Public Access
                                    </a>
                                </div>
                            </div>

                            {/* Dynamic Glowing Border */}
                            {area.primary_color && (
                                <div 
                                    className="absolute bottom-0 left-0 right-0 h-[2px] opacity-20 group-hover:opacity-100 transition-opacity"
                                    style={{ background: `linear-gradient(to right, transparent, ${area.primary_color}, transparent)` }}
                                />
                            )}
                        </div>
                    ))}
                </div>
            )}

            <ConfirmModal
                isOpen={deleteModal.isOpen}
                onClose={() => setDeleteModal({ isOpen: false, areaId: null })}
                onConfirm={handleDelete}
                title={t('member_areas_page.delete_title', 'Excluir Área de Membros')}
                message={t('member_areas_page.delete_confirm', 'Tem certeza que deseja excluir esta área de membros? Esta ação não pode ser desfeita.')}
                confirmText={t('member_areas_page.delete_btn', 'Sim, excluir')}
                variant="danger"
                loading={isDeleting}
            />
        </Layout>
    );
};

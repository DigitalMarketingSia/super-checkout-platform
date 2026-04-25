import React, { useState, useEffect } from 'react';
import { Layout } from '../../components/Layout';
import { storage } from '../../services/storageService';
import { Content } from '../../types';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmModal, AlertModal } from '../../components/ui/Modal';
import {
    Plus, Edit2, Trash2, Image as ImageIcon, Search, BookOpen, Package, Monitor, FileText, Layers
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export const Contents = ({ memberAreaId, primaryColor }: { memberAreaId: string, primaryColor?: string }) => {
    const pColor = primaryColor || '#8A2BE2';
    const { t } = useTranslation(['admin', 'common']);
    const navigate = useNavigate();
    const [contents, setContents] = useState<Content[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // Modal States
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [alertState, setAlertState] = useState<{ isOpen: boolean; title: string; message: string; variant: 'success' | 'error' | 'info' }>({
        isOpen: false,
        title: '',
        message: '',
        variant: 'info'
    });

    useEffect(() => {
        if (memberAreaId) {
            loadData();
        }
    }, [memberAreaId]);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await storage.getContents(memberAreaId);
            setContents(data);
        } catch (error) {
            console.error('Error loading contents:', error);
            showAlert(t('common.error', 'Erro'), t('content.load_error', 'Erro ao carregar conteúdos.'), 'error');
        } finally {
            setLoading(false);
        }
    };

    const showAlert = (title: string, message: string, variant: 'success' | 'error' | 'info' = 'info') => {
        setAlertState({ isOpen: true, title, message, variant });
    };

    const handleDeleteClick = (id: string) => {
        setDeleteId(id);
    };

    const handleConfirmDelete = async () => {
        if (!deleteId) return;

        try {
            setIsDeleting(true);
            await storage.deleteContent(deleteId);
            await loadData();
            setDeleteId(null);
            showAlert(t('common.success', 'Sucesso'), t('content.delete_success', 'Conteúdo excluído com sucesso.'), 'success');
        } catch (error) {
            console.error('Error deleting content:', error);
            showAlert(t('common.error', 'Erro'), t('content.delete_error', 'Erro ao excluir conteúdo.'), 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    const getIconByType = (type: string) => {
        switch (type) {
            case 'course': return <BookOpen className="w-4 h-4" />;
            case 'pack': return <Package className="w-4 h-4" />;
            case 'software': return <Monitor className="w-4 h-4" />;
            case 'ebook': return <FileText className="w-4 h-4" />;
            default: return <Layers className="w-4 h-4" />;
        }
    };

    const filteredContents = contents.filter(content =>
        content.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        content.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="animate-in fade-in duration-500">
            <div 
                className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 p-6 rounded-[1.5rem] border border-white/10 backdrop-blur-3xl relative overflow-hidden transition-all shadow-2xl"
                style={{ 
                    background: `linear-gradient(135deg, rgba(0,0,0,0.4) 0%, ${pColor}20 100%)`,
                }}
            >
                <div className="relative z-10">
                    <h2 className="text-xl font-black text-white italic uppercase tracking-tighter leading-none mb-1">Conteúdos <span style={{ color: pColor }}>do Portal</span></h2>
                    <div className="flex items-center gap-2 text-white/40 text-[10px] font-bold uppercase tracking-[0.3em]">
                        <BookOpen className="w-3.5 h-3.5" />
                        Gerencie os cursos e materiais
                    </div>
                </div>
                <Button 
                    onClick={() => navigate(`/admin/contents/new?areaId=${memberAreaId}`)} 
                    className="h-10 px-6 bg-white hover:bg-white/90 font-black uppercase italic tracking-tighter flex items-center gap-2 rounded-xl shadow-xl transition-all hover:scale-[1.05] active:scale-95 group relative z-10"
                    style={{ color: '#0A0A1F' }}
                >
                    <Plus className="w-4 h-4 border border-black/10 rounded-md group-hover:rotate-90 transition-transform" /> 
                    <span className="text-xs">Novo Conteúdo</span>
                </Button>
            </div>

            {/* Search & Filter Bar SLIM */}
            <div className="mb-6 flex gap-4">
                <div className="relative flex-1 group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-white/60 transition-colors" />
                    <input
                        type="text"
                        placeholder="BUSCAR NO REPOSITÓRIO..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-black/40 border border-white/5 rounded-xl pl-12 pr-4 py-3 text-xs font-black text-white italic uppercase tracking-widest outline-none focus:border-white/20 transition-all placeholder:text-white/10"
                    />
                </div>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map(i => <Card key={i} className="h-[350px] animate-pulse"><div /></Card>)}
                </div>
            ) : contents.length === 0 ? (
                <Card className="text-center py-20 border-dashed border-white/10 bg-white/5">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Layers className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-medium text-white">Nenhum conteúdo criado</h3>
                    <div className="flex justify-center mt-4">
                        <Button onClick={() => navigate(`/admin/contents/new?areaId=${memberAreaId}`)}>Criar Conteúdo</Button>
                    </div>
                </Card>
            ) : filteredContents.length === 0 ? (
                <Card className="text-center py-20 border-dashed border-white/10 bg-white/5">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Search className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-medium text-white">Nenhum conteúdo encontrado</h3>
                </Card>
            ) : (
                <div className="flex flex-col gap-2">
                    {/* Slim Table Header */}
                    <div className="flex items-center px-6 py-2 text-[10px] font-black text-white/20 uppercase tracking-[0.3em] border-b border-white/5">
                        <span className="flex-1">Registro de Conteúdo</span>
                        <span className="w-32 text-center">Tipo</span>
                        <span className="w-48 text-center">Módulos / Atualização</span>
                        <span className="w-32 text-right">Controle</span>
                    </div>

                    {filteredContents.map(content => (
                        <div 
                            key={content.id} 
                            className="group flex items-center gap-4 bg-white/[0.01] hover:bg-white/[0.04] border border-white/5 rounded-2xl px-6 py-3 transition-all active:scale-[0.99]"
                        >
                            {/* Quick Preview Thumbnail */}
                            <div className="w-12 h-12 rounded-xl overflow-hidden bg-black/40 border border-white/10 flex-shrink-0 group-hover:border-white/20 transition-all">
                                {content.thumbnail_url ? (
                                    <img src={content.thumbnail_url} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" alt="" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <ImageIcon className="w-5 h-5 text-white/10" />
                                    </div>
                                )}
                            </div>

                            {/* Info Section */}
                            <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-black text-white uppercase italic tracking-tighter truncate leading-none mb-1 group-hover:text-white transition-colors">
                                    {content.title}
                                </h3>
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1 text-[8px] font-bold text-white/20 uppercase tracking-widest truncate">
                                        {content.description || 'Sem descrição tática.'}
                                    </div>
                                </div>
                            </div>

                            {/* Type Badge */}
                            <div className="w-32 flex justify-center">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/5 bg-white/5 text-[8px] font-black text-white/40 uppercase tracking-widest group-hover:border-white/10 group-hover:text-white/60 transition-all">
                                    {React.cloneElement(getIconByType(content.type) as React.ReactElement, { className: 'w-3 h-3' })}
                                    {content.type}
                                </span>
                            </div>

                            {/* Metrics */}
                            <div className="w-48 text-center">
                                <div className="text-[10px] font-black text-white italic tracking-tighter mb-0.5">
                                    {content.modules_count || 0} <span className="text-white/20 uppercase not-italic">Modules</span>
                                </div>
                                <div className="text-[8px] font-mono text-white/20 uppercase tracking-tighter">
                                    REV: {new Date(content.updated_at || content.created_at).toLocaleDateString()}
                                </div>
                            </div>

                            {/* Actions Controls */}
                            <div className="w-32 flex justify-end gap-2">
                                <button
                                    onClick={() => navigate(`/admin/contents/${content.id}`)}
                                    className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all"
                                    title="Editar Estrutura"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => handleDeleteClick(content.id)}
                                    className="w-10 h-10 rounded-xl bg-red-500/5 border border-red-500/10 flex items-center justify-center text-red-500/40 hover:text-red-500 hover:bg-red-500/10 hover:border-red-500/20 transition-all"
                                    title="Excluir Registro"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <ConfirmModal
                isOpen={!!deleteId}
                onClose={() => setDeleteId(null)}
                onConfirm={handleConfirmDelete}
                title="Excluir Conteúdo"
                message="Tem certeza que deseja excluir este conteúdo? Todos os módulos e aulas serão perdidos."
                confirmText="Sim, excluir"
                cancelText="Cancelar"
                variant="danger"
                loading={isDeleting}
            />

            <AlertModal
                isOpen={alertState.isOpen}
                onClose={() => setAlertState({ ...alertState, isOpen: false })}
                title={alertState.title}
                message={alertState.message}
                variant={alertState.variant}
            />
        </div>
    );
};

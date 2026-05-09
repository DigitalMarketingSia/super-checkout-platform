import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, GitBranch, Clock, ArrowRight, Trash2, Edit2, Loader2 } from 'lucide-react';
import { supabase } from '../../../../services/supabase';
import { toast } from 'sonner';
import { ConfirmModal, Modal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';

interface FunnelData {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export const Dashboard = () => {
  const navigate = useNavigate();
  const [funnels, setFunnels] = useState<FunnelData[]>([]);
  const [loading, setLoading] = useState(true);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [funnelToDelete, setFunnelToDelete] = useState<string | null>(null);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [funnelToEdit, setFunnelToEdit] = useState<FunnelData | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    fetchFunnels();
  }, []);

  const fetchFunnels = async () => {
    try {
      const { data, error } = await supabase
        .from('funnels')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setFunnels(data || []);
    } catch (error) {
      console.error('Erro ao carregar funis:', error);
      toast.error('Erro ao carregar seus projetos.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = async () => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const newFunnel = {
        user_id: user.user.id,
        name: `Novo Funil - ${new Date().toLocaleDateString()}`,
        state: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 0.7 } }
      };

      const { data, error } = await supabase
        .from('funnels')
        .insert([newFunnel])
        .select()
        .single();

      if (error) throw error;
      if (data) {
        toast.success('Projeto criado com sucesso!');
        navigate(`/admin/flow/editor/${data.id}`);
      }
    } catch (error) {
      console.error('Erro ao criar funil:', error);
      toast.error('Não foi possível criar um novo projeto.');
    }
  };

  const openDeleteModal = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setFunnelToDelete(id);
    setDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!funnelToDelete) return;
    try {
      const { error } = await supabase.from('funnels').delete().eq('id', funnelToDelete);
      if (error) throw error;
      toast.success('Projeto excluído com sucesso.');
      setFunnels(funnels.filter(f => f.id !== funnelToDelete));
    } catch (error) {
      console.error('Erro ao excluir:', error);
      toast.error('Erro ao excluir o projeto.');
    } finally {
      setDeleteModalOpen(false);
      setFunnelToDelete(null);
    }
  };

  const openEditModal = (e: React.MouseEvent, funnel: FunnelData) => {
    e.stopPropagation();
    setFunnelToEdit(funnel);
    setEditName(funnel.name);
    setEditDescription(funnel.description || '');
    setEditModalOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!funnelToEdit) return;
    if (!editName.trim()) {
      toast.error('O nome do projeto é obrigatório.');
      return;
    }

    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from('funnels')
        .update({ name: editName, description: editDescription, updated_at: new Date().toISOString() })
        .eq('id', funnelToEdit.id);

      if (error) throw error;
      toast.success('Projeto atualizado com sucesso.');
      setFunnels(funnels.map(f => f.id === funnelToEdit.id ? { ...f, name: editName, description: editDescription, updated_at: new Date().toISOString() } : f));
      setEditModalOpen(false);
      setFunnelToEdit(null);
    } catch (error) {
      console.error('Erro ao atualizar projeto:', error);
      toast.error('Erro ao atualizar o projeto.');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#05050A] text-white p-4 lg:p-12">
      <div className="max-w-[1400px] mx-auto space-y-12">
        
        {/* Header Section — Portal Style */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 animate-in fade-in slide-in-from-top-8 duration-700">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-500 leading-none italic">Flow Builder</span>
              <div className="h-px w-8 bg-cyan-500/20" />
            </div>
            <h1 className="font-portal-display italic font-black text-4xl md:text-6xl text-white uppercase tracking-tighter leading-none">
              Meus <span className="bg-gradient-to-r from-[#27CBEF] to-[#27CBEF]/60 bg-clip-text text-transparent">Funis</span>
            </h1>
            <p className="text-gray-400 text-lg font-medium leading-relaxed max-w-xl">
              Gerencie seus projetos e automações visuais com tecnologia de ponta.
            </p>
          </div>

          <button 
            onClick={handleCreateNew}
            className="group relative flex items-center gap-3 bg-white text-black px-8 py-5 rounded-2xl font-black uppercase italic tracking-tighter hover:bg-cyan-400 transition-all duration-500 hover:-translate-y-1 active:scale-95 shadow-2xl shadow-cyan-500/10"
          >
            <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
            Novo Projeto
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-shimmer" />
          </button>
        </div>

        {/* Funnels Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-32 text-cyan-500">
            <Loader2 className="w-12 h-12 animate-spin text-cyan-500" />
          </div>
        ) : funnels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 bg-[#0F0F13] border border-white/5 rounded-[2.5rem] animate-in fade-in duration-1000">
            <div className="w-24 h-24 bg-cyan-500/5 rounded-3xl flex items-center justify-center mb-8 border border-cyan-500/10">
              <GitBranch className="w-10 h-10 text-cyan-400" />
            </div>
            <h2 className="text-3xl font-portal-display text-white mb-4 italic tracking-tighter">Nada por aqui ainda</h2>
            <p className="text-gray-500 text-center max-w-md mb-10 font-medium">
              Comece agora a desenhar seu primeiro funil visual e escale suas automações.
            </p>
            <button 
              onClick={handleCreateNew}
              className="px-10 py-5 bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl font-black uppercase italic tracking-tighter transition-all"
            >
              Criar primeiro funil
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {funnels.map((funnel, index) => (
              <div 
                key={funnel.id}
                onClick={() => navigate(`/admin/flow/editor/${funnel.id}`)}
                className="group relative bg-[#0F0F13] border border-white/5 hover:border-cyan-500/30 rounded-[2rem] p-8 cursor-pointer overflow-hidden transition-all duration-500 hover:shadow-[0_0_50px_rgba(6,182,212,0.1)] hover:-translate-y-2 animate-in fade-in slide-in-from-bottom-8 duration-700"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Background Glow */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-8">
                    <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:bg-cyan-500/10 group-hover:border-cyan-500/20 transition-all duration-500">
                      <GitBranch className="w-7 h-7 text-gray-400 group-hover:text-cyan-400 transition-colors" />
                    </div>
                    
                    <div className="flex items-center gap-2 translate-x-4 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-500">
                      <button 
                        onClick={(e) => openEditModal(e, funnel)}
                        className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-gray-500 hover:text-white transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => openDeleteModal(e, funnel.id)}
                        className="p-3 bg-red-500/5 hover:bg-red-500/10 rounded-xl text-red-500/60 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-xl font-black text-white mb-3 uppercase tracking-tight italic group-hover:text-cyan-400 transition-colors">
                    {funnel.name}
                  </h3>
                  
                  <p className="text-gray-500 text-sm mb-8 line-clamp-2 font-medium">
                    {funnel.description || 'Automatize seus processos visuais agora.'}
                  </p>

                  <div className="pt-6 border-t border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-600">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(funnel.updated_at).toLocaleDateString('pt-BR')}
                    </div>
                    
                    <div className="flex items-center gap-2 text-xs font-black uppercase italic tracking-tighter text-cyan-400 group-hover:gap-3 transition-all duration-500">
                      Abrir Editor
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                {/* Shimmer Effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent -translate-x-full group-hover:animate-shimmer pointer-events-none" />
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Excluir Projeto"
        message="Tem certeza que deseja excluir este projeto permanentemente? Esta ação não pode ser desfeita e todos os dados associados serão perdidos."
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="danger"
      />

      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Editar Projeto"
      >
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-white uppercase tracking-wider">
              Nome do Projeto
            </label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full bg-[#05050A] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50 transition-colors"
              placeholder="Ex: Funil de Lançamento"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-white uppercase tracking-wider">
              Descrição
            </label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={3}
              className="w-full bg-[#05050A] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50 transition-colors resize-none"
              placeholder="Descreva o objetivo deste projeto..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
            <Button
              variant="ghost"
              onClick={() => setEditModalOpen(false)}
              disabled={savingEdit}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleEditSubmit}
              isLoading={savingEdit}
            >
              Salvar Alterações
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

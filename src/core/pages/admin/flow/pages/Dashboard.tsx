import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, GitBranch, Clock, ArrowRight, Trash2, Edit2 } from 'lucide-react';
import { supabase } from '../../../../services/supabase';
import { toast } from 'sonner';

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

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Tem certeza que deseja excluir este projeto?')) return;

    try {
      const { error } = await supabase.from('funnels').delete().eq('id', id);
      if (error) throw error;
      toast.success('Projeto excluído.');
      setFunnels(funnels.filter(f => f.id !== id));
    } catch (error) {
      console.error('Erro ao excluir:', error);
      toast.error('Erro ao excluir o projeto.');
    }
  };

  return (
    <div className="min-h-screen bg-[#05050A] text-white p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter italic text-cyan-400">Meus Funis</h1>
            <p className="text-gray-400 mt-2">Gerencie seus projetos e automações visuais.</p>
          </div>
          <button 
            onClick={handleCreateNew}
            className="flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 px-6 py-3 rounded-xl font-bold shadow-lg shadow-cyan-500/20 transition-all hover:-translate-y-0.5"
          >
            <Plus className="w-5 h-5" />
            Novo Projeto
          </button>
        </div>

        {/* Funnels Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-cyan-500 animate-pulse">
            <GitBranch className="w-8 h-8 animate-spin" />
          </div>
        ) : funnels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 bg-white/5 border border-white/10 rounded-3xl">
            <div className="w-20 h-20 bg-cyan-500/10 rounded-full flex items-center justify-center mb-6">
              <GitBranch className="w-10 h-10 text-cyan-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">Nenhum funil encontrado</h2>
            <p className="text-gray-400 text-center max-w-md mb-8">
              Você ainda não tem nenhum projeto criado. Comece desenhando seu primeiro funil visual!
            </p>
            <button 
              onClick={handleCreateNew}
              className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold transition-all"
            >
              Criar meu primeiro funil
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {funnels.map(funnel => (
              <div 
                key={funnel.id}
                onClick={() => navigate(`/admin/flow/editor/${funnel.id}`)}
                className="group relative bg-[#0a0a0b] border border-white/10 hover:border-cyan-500/30 rounded-2xl p-6 cursor-pointer overflow-hidden transition-all hover:shadow-[0_0_30px_rgba(6,182,212,0.1)] hover:-translate-y-1"
              >
                {/* Bg glow */}
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
                      <GitBranch className="w-6 h-6 text-cyan-400" />
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => handleDelete(e, funnel.id)}
                        className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-lg font-bold text-white mb-2 line-clamp-1">{funnel.name}</h3>
                  <p className="text-gray-500 text-sm mb-6 line-clamp-2">
                    {funnel.description || 'Nenhuma descrição adicionada.'}
                  </p>

                  <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(funnel.updated_at).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-1 text-cyan-400 group-hover:translate-x-1 transition-transform">
                      Abrir Editor <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

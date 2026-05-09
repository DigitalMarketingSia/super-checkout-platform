import { motion, AnimatePresence } from 'motion/react';
import { X, Maximize2, MessageSquare, Tag, Info, ExternalLink, Trash2, StickyNote } from 'lucide-react';
import { useFunnelStore } from '../store/useFunnelStore';
import { ICON_MAP } from '../lib/icons';
import { type NodeStatus } from '../types';
import { cn } from '../lib/utils';

export const SidePanel = () => {
  const { 
    nodes, 
    selectedNodeId, 
    setSelectedNodeId, 
    updateNodeData, 
    setIsConfigModalOpen,
    deleteNode 
  } = useFunnelStore();

  const node = nodes.find((n) => n.id === selectedNodeId);

  if (!node) return null;

  const statusColors: Record<NodeStatus, string> = {
    ativo: 'bg-emerald-500',
    em_teste: 'bg-amber-500',
    pausado: 'bg-slate-500',
  };

  return (
    <AnimatePresence>
      {selectedNodeId && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed top-0 right-0 h-full w-[380px] z-[100] glass border-l border-white/10 flex flex-col shadow-2xl"
        >
          {/* Header */}
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center glass shadow-lg', node.data.color)}>
                {node.data.icon?.startsWith('http') ? (
                  <img src={node.data.icon} alt={node.data.label} className="w-6 h-6 object-contain" referrerPolicy="no-referrer" />
                ) : (() => {
                  const IconComp = ICON_MAP[node.data.type] || StickyNote;
                  return <IconComp size={24} className="opacity-80" />;
                })()}
              </div>
              <div>
                <h2 className="text-sm font-black text-white leading-none">Configurações</h2>
                <p className="text-[10px] font-black text-[#27CBEF] uppercase tracking-widest mt-1">{node.data.category}</p>
              </div>
            </div>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setSelectedNodeId(null);
              }}
              className="w-8 h-8 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-all group shadow-lg shadow-red-500/20"
            >
              <X size={16} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
            {/* Basic Info */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Tag size={12} />
                  Nome da Etapa
                </label>
                <input
                  type="text"
                  value={node.data.label}
                  onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
                  className="w-full bg-white/5 border border-white/5 rounded-2xl px-4 py-3 text-sm text-white focus:border-[#27CBEF]/50 focus:ring-0 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Info size={12} />
                  Status Atual
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['ativo', 'em_teste', 'pausado'] as NodeStatus[]).map((status) => (
                    <button
                      key={status}
                      onClick={() => updateNodeData(node.id, { status })}
                      className={cn(
                        'px-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all border',
                        node.data.status === status 
                          ? cn('border-transparent text-white', statusColors[status]) 
                          : 'border-white/5 text-slate-500 hover:bg-white/5'
                      )}
                    >
                      {status.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <MessageSquare size={12} />
                Anotações Estratégicas
              </label>
              <textarea
                value={node.data.notes}
                onChange={(e) => updateNodeData(node.id, { notes: e.target.value })}
                placeholder="Descreva o objetivo desta etapa..."
                className="w-full bg-white/5 border border-white/5 rounded-2xl px-4 py-3 text-sm text-slate-300 focus:border-[#27CBEF]/50 focus:ring-0 transition-all h-32 resize-none no-scrollbar"
              />
            </div>

            {/* Action Buttons */}
            <div className="pt-4 space-y-3">
              <button
                onClick={() => setIsConfigModalOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-4 bg-[#27CBEF] hover:bg-[#27CBEF]/80 text-black rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-[#27CBEF]/20"
              >
                <Maximize2 size={16} />
                Configuração Avançada
              </button>
              
              <button
                onClick={() => {
                  if (confirm('Excluir este nó do funil?')) {
                    deleteNode(node.id);
                    setSelectedNodeId(null);
                  }
                }}
                className="w-full flex items-center justify-center gap-2 py-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
              >
                <Trash2 size={16} />
                Remover Nó
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-white/5">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-600">
              <span>ID: {node.id}</span>
              <span className="flex items-center gap-1">
                v1.0.4 <ExternalLink size={10} />
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

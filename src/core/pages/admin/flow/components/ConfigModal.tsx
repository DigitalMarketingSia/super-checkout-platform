import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Save, 
  Globe, 
  Link as LinkIcon, 
  BarChart3, 
  Settings2, 
  Zap, 
  CreditCard,
  Layout,
  Target,
  FileText,
  ChevronRight,
  Package,
  StickyNote,
  ArrowUpCircle,
  ArrowDownCircle,
  CheckCircle,
  Plus,
  Trash2,
  TrendingUp,
  DollarSign,
  RefreshCw,
  MousePointer2
} from 'lucide-react';
import { useFunnelStore } from '../store/useFunnelStore';
import { cn } from '../lib/utils';
import { NodeStatus } from '../types';

type TabType = 'general' | 'planning' | 'strategy';

export const ConfigModal = () => {
  const { 
    nodes, 
    edges,
    selectedNodeId, 
    isConfigModalOpen, 
    setIsConfigModalOpen,
    setSelectedNodeId,
    updateNodeData,
    deleteNode,
    unlinkNote
  } = useFunnelStore();

  const [activeTab, setActiveTab] = useState<TabType>('general');

  const node = nodes.find((n) => n.id === selectedNodeId);

  const isLinked = node ? edges.some(e => e.source === node.id || e.target === node.id) : false;

  const handleClose = () => {
    setIsConfigModalOpen(false);
    setSelectedNodeId(null);
  };

  const handleDelete = () => {
    if (selectedNodeId) {
      deleteNode(selectedNodeId);
      handleClose();
    }
  };

  if (!node || !isConfigModalOpen) return null;

  const tabs = [
    { id: 'general', label: 'Geral', icon: Layout, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { id: 'planning', label: 'Planejamento', icon: Target, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { id: 'strategy', label: 'Estratégia', icon: FileText, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  ];

  const statusOptions: { value: NodeStatus; label: string; color: string }[] = [
    { value: 'ativo', label: 'Ativo', color: 'bg-emerald-500' },
    { value: 'em_teste', label: 'Em Teste', color: 'bg-amber-500' },
    { value: 'pausado', label: 'Pausado', color: 'bg-slate-500' },
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-8">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
          className="absolute inset-0 bg-[#0a0a0b]/90 backdrop-blur-md"
        />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 10 }}
          className="relative w-full max-w-[95vw] h-[95vh] glass rounded-[32px] border border-white/10 shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header - Minimalist Single Line */}
          <div className="px-6 py-3 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
            <div className="flex items-center gap-4">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center glass border border-white/10', node.data.color)}>
                {node.data.icon.startsWith('http') ? (
                  <img src={node.data.icon} alt={node.data.label} className="w-5 h-5 object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <span className="text-sm">{node.data.icon}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-black text-white uppercase tracking-wider">{node.data.label}</h2>
                <span className="px-2 py-0.5 rounded-md bg-white/5 text-[9px] font-bold text-slate-500 uppercase tracking-widest border border-white/5">
                  {node.data.category} • {node.id}
                </span>
              </div>
            </div>
            
            <button 
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-lg text-slate-500 hover:text-white transition-all"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 flex overflow-hidden">
            {/* Sidebar Navigation - Slim & Integrated */}
            <div className="w-56 border-r border-white/5 bg-black/20 p-3 flex flex-col gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={cn(
                    "flex items-center gap-3 w-full p-3 rounded-xl transition-all group relative",
                    activeTab === tab.id 
                      ? "bg-white/10 text-white shadow-lg" 
                      : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                  )}
                >
                  <tab.icon size={16} className={activeTab === tab.id ? tab.color : "text-slate-500"} />
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {tab.label}
                  </span>
                  {activeTab === tab.id && (
                    <motion.div layoutId="tabIndicator" className="absolute left-0 w-1 h-4 bg-purple-500 rounded-r-full" />
                  )}
                </button>
              ))}
            </div>

            {/* Content Area - THE BIG SPACE */}
            <div className="flex-1 overflow-y-auto p-8 no-scrollbar">
              <AnimatePresence mode="wait">
                {activeTab === 'general' && (
                  <motion.div
                    key="general"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="w-full space-y-10"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nome do Elemento</label>
                          <input
                            type="text"
                            value={node.data.label}
                            onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
                            className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-6 py-4 text-lg text-white focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all outline-none"
                            placeholder="Nome do nó..."
                          />
                        </div>

                        {node.data.isNote ? (
                          <div className="space-y-6">
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Conteúdo da Nota</label>
                              <textarea
                                value={node.data.notes}
                                onChange={(e) => updateNodeData(node.id, { notes: e.target.value })}
                                className="w-full h-48 bg-white/[0.03] border border-white/10 rounded-2xl px-6 py-4 text-lg text-white focus:border-amber-500/50 focus:ring-4 focus:ring-amber-500/5 transition-all outline-none resize-none"
                                placeholder="Escreva sua estratégia aqui..."
                              />
                            </div>

                            {isLinked && (
                              <button
                                onClick={() => unlinkNote(node.id)}
                                className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 text-amber-500 hover:bg-amber-500/10 transition-all font-black text-[10px] uppercase tracking-widest"
                              >
                                <LinkIcon size={14} className="rotate-45" />
                                Desvincular Nota do Fluxo
                              </button>
                            )}
                          </div>
                        ) : node.data.type === 'product' ? (
                          <div className="space-y-6">
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Tipo de Produto</label>
                              <div className="grid grid-cols-2 gap-2">
                                {[
                                  { id: 'principal', label: 'Principal', color: 'bg-purple-500', icon: Package },
                                  { id: 'gratis', label: 'Grátis', color: 'bg-emerald-500', icon: CheckCircle },
                                  { id: 'upsell', label: 'Upsell', color: 'bg-orange-500', icon: ArrowUpCircle },
                                  { id: 'orderbump', label: 'Order Bump', color: 'bg-yellow-500', icon: Zap },
                                  { id: 'downsell', label: 'Downsell', color: 'bg-rose-500', icon: ArrowDownCircle },
                                ].map((type) => (
                                  <button
                                    key={type.id}
                                    onClick={() => updateNodeData(node.id, { productType: type.id })}
                                    className={cn(
                                      "flex items-center gap-3 p-3 rounded-xl border transition-all",
                                      node.data.productType === type.id
                                        ? "bg-white/10 border-white/20 shadow-xl"
                                        : "bg-white/[0.01] border-white/5 text-slate-500 hover:border-white/10"
                                    )}
                                  >
                                    <div className={cn("w-2 h-2 rounded-full", type.color)} />
                                    <span className={cn(
                                      "text-[9px] font-black uppercase tracking-widest",
                                      node.data.productType === type.id ? "text-white" : "text-slate-500"
                                    )}>
                                      {type.label}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Valor do Produto (R$)</label>
                              <div className="relative group">
                                <CreditCard size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-purple-500 transition-colors" />
                                <input
                                  type="number"
                                  value={node.data.price || 0}
                                  onChange={(e) => updateNodeData(node.id, { price: Number(e.target.value) })}
                                  placeholder="0.00"
                                  className="w-full bg-white/[0.03] border border-white/10 rounded-2xl pl-16 pr-6 py-4 text-lg text-white focus:border-purple-500/50 focus:ring-4 focus:ring-purple-500/5 transition-all outline-none"
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">% Recompra / LTV</label>
                              <div className="relative group">
                                <RefreshCw size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-emerald-500 transition-colors" />
                                <input
                                  type="number"
                                  value={node.data.recompra || 0}
                                  onChange={(e) => updateNodeData(node.id, { recompra: Number(e.target.value) })}
                                  placeholder="0"
                                  className="w-full bg-white/[0.03] border border-white/10 rounded-2xl pl-16 pr-6 py-4 text-lg text-white focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/5 transition-all outline-none"
                                />
                              </div>
                            </div>
                          </div>
                        ) : node.data.category === 'Rede Social' ? (
                          <div className="space-y-6">
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Volume Inicial de Visitas</label>
                              <div className="relative group">
                                <Zap size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-emerald-500 transition-colors" />
                                <input
                                  type="number"
                                  value={node.data.volume || 0}
                                  onChange={(e) => updateNodeData(node.id, { volume: Number(e.target.value) })}
                                  placeholder="Ex: 1000"
                                  className="w-full bg-white/[0.03] border border-white/10 rounded-2xl pl-16 pr-6 py-4 text-lg text-white focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/5 transition-all outline-none"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                              <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">CPC (Custo por Clique)</label>
                                <div className="relative group">
                                  <DollarSign size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-blue-500 transition-colors" />
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={node.data.cpc || 0}
                                    onChange={(e) => updateNodeData(node.id, { cpc: Number(e.target.value) })}
                                    placeholder="0.00"
                                    className="w-full bg-white/[0.03] border border-white/10 rounded-2xl pl-16 pr-6 py-4 text-lg text-white focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all outline-none"
                                  />
                                </div>
                              </div>
                              <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">CTR (%)</label>
                                <div className="relative group">
                                  <MousePointer2 size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-purple-500 transition-colors" />
                                  <input
                                    type="number"
                                    value={node.data.ctr || 0}
                                    onChange={(e) => updateNodeData(node.id, { ctr: Number(e.target.value) })}
                                    placeholder="0"
                                    className="w-full bg-white/[0.03] border border-white/10 rounded-2xl pl-16 pr-6 py-4 text-lg text-white focus:border-purple-500/50 focus:ring-4 focus:ring-purple-500/5 transition-all outline-none"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">URL de Destino</label>
                            <div className="relative group">
                              <LinkIcon size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-blue-500 transition-colors" />
                              <input
                                type="url"
                                value={node.data.url || ''}
                                onChange={(e) => updateNodeData(node.id, { url: e.target.value })}
                                placeholder="https://..."
                                className="w-full bg-white/[0.03] border border-white/10 rounded-2xl pl-16 pr-6 py-4 text-lg text-white focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all outline-none"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Status Operacional</label>
                        <div className="grid grid-cols-1 gap-3">
                          {statusOptions.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => updateNodeData(node.id, { status: opt.value })}
                              className={cn(
                                "flex items-center gap-4 p-5 rounded-2xl border transition-all",
                                node.data.status === opt.value
                                  ? "bg-white/10 border-white/20 shadow-xl"
                                  : "bg-white/[0.01] border-white/5 text-slate-500 hover:border-white/10"
                              )}
                            >
                              <div className={cn("w-3 h-3 rounded-full shadow-lg", opt.color)} />
                              <span className={cn(
                                "text-xs font-black uppercase tracking-widest",
                                node.data.status === opt.value ? "text-white" : "text-slate-500"
                              )}>
                                {opt.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'planning' && (
                  <motion.div
                    key="planning"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="w-full space-y-10"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      <div className="space-y-8">
                        <div className="p-8 glass rounded-[32px] border-white/10 bg-white/5 space-y-4">
                          <div className="flex items-center gap-3">
                            <Zap size={18} className="text-emerald-500" />
                            <h4 className="text-xs font-black text-white uppercase tracking-widest">Métricas de Fluxo</h4>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Volume Estimado</p>
                              <p className="text-2xl font-black text-white">{Math.round(node.data.volume || 0).toLocaleString()}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Valor Unitário</p>
                              <p className="text-2xl font-black text-white">R$ {(node.data.price || 0).toLocaleString()}</p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-6 glass rounded-[24px] border-white/10 bg-white/5 space-y-2">
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Investimento (Custo)</p>
                            <p className="text-xl font-black text-rose-500">R$ {((node.data.cost as number) || 0).toLocaleString()}</p>
                          </div>
                          <div className="p-6 glass rounded-[24px] border-white/10 bg-white/5 space-y-2">
                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">ROI</p>
                            <p className={cn(
                              "text-xl font-black",
                              ((node.data.roi as number) || 0) > 0 ? "text-emerald-500" : "text-rose-500"
                            )}>
                              {((node.data.roi as number) || 0).toFixed(2)}%
                            </p>
                          </div>
                        </div>

                        <div className="p-8 glass rounded-[32px] border-white/10 bg-white/5 space-y-4">
                          <div className="flex items-center gap-3">
                            <TrendingUp size={18} className="text-blue-500" />
                            <h4 className="text-xs font-black text-white uppercase tracking-widest">Ponto de Equilíbrio</h4>
                          </div>
                          <div className="space-y-2">
                            <p className="text-[10px] text-slate-400 leading-relaxed">
                              Para cobrir o custo de <strong>R$ {((node.data.cost as number) || 0).toLocaleString()}</strong> nesta etapa, 
                              você precisa de pelo menos <strong>{Math.ceil(((node.data.cost as number) || 0) / (node.data.price || 1))}</strong> vendas.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col justify-center">
                        <div className="p-12 glass rounded-[40px] border-emerald-500/20 bg-emerald-500/5 text-center space-y-4">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Receita Estimada (Total)</p>
                          <p className="text-7xl font-black text-white tracking-tighter">
                            <span className="text-emerald-500 mr-4 text-3xl">R$</span>
                            {((node.data.revenue as number) || 0).toLocaleString()}
                          </p>
                          <div className="w-20 h-1 bg-emerald-500/20 mx-auto rounded-full" />
                          <p className="text-[10px] text-slate-500 font-medium">
                            Incluindo projeção de recompra de {node.data.recompra || 0}%
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'strategy' && (
                  <motion.div
                    key="strategy"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="w-full h-full flex flex-col"
                  >
                    <textarea
                      value={node.data.notes || ''}
                      onChange={(e) => updateNodeData(node.id, { notes: e.target.value })}
                      placeholder="Digite aqui sua estratégia detalhada..."
                      className="w-full flex-1 bg-white/[0.02] border border-white/10 rounded-[32px] p-10 text-xl text-white focus:border-amber-500/50 transition-all outline-none resize-none no-scrollbar leading-relaxed shadow-inner"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Footer - Minimalist */}
          <div className="px-6 py-3 border-t border-white/5 bg-white/[0.01] flex items-center justify-between gap-4">
            <button 
              onClick={handleDelete}
              className="flex items-center gap-2 px-4 py-2 text-[10px] font-black text-rose-500 hover:text-rose-400 uppercase tracking-widest transition-colors"
            >
              <Trash2 size={14} />
              Excluir Elemento
            </button>
            
            <div className="flex items-center gap-4">
              <button 
                onClick={handleClose}
                className="px-4 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleClose}
                className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg active:scale-95 flex items-center gap-2"
              >
                <Save size={14} />
                Salvar Alterações
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

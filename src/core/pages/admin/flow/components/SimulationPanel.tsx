import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingUp, 
  DollarSign, 
  Target, 
  BarChart3,
  Zap,
  ArrowUpRight,
  PieChart,
  Calendar,
  ArrowDownRight,
  Activity,
  CheckCircle2,
  AlertCircle,
  Lightbulb
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import { useFunnelStore } from '../store/useFunnelStore';
import { cn } from '../lib/utils';

export const SimulationPanel = () => {
  const { nodes, isSimulationPanelOpen, setIsSimulationPanelOpen } = useFunnelStore();

  const metrics = useMemo(() => {
    const totalRevenue = nodes.reduce((acc, node) => acc + ((node.data.revenue as number) || 0), 0);
    const totalCost = nodes.reduce((acc, node) => acc + ((node.data.cost as number) || 0), 0);
    const netProfit = totalRevenue - totalCost;
    const globalROI = totalCost > 0 ? (netProfit / totalCost) * 100 : 0;
    const totalVolume = nodes.reduce((acc, node) => {
      if (node.data.category === 'Rede Social') return acc + (node.data.volume || 0);
      return acc;
    }, 0);

    // Data for the chart - Top 5 nodes by volume
    const chartData = nodes
      .filter(n => !n.data.isNote && (n.data.volume || 0) > 0)
      .sort((a, b) => (b.data.volume || 0) - (a.data.volume || 0))
      .slice(0, 5)
      .map(n => ({
        name: n.data.label.length > 10 ? n.data.label.substring(0, 10) + '...' : n.data.label,
        volume: Math.round(n.data.volume || 0),
        color: n.data.color.includes('bg-') ? n.data.color.replace('bg-', '') : '#8b5cf6'
      }));

    return { totalRevenue, totalCost, netProfit, globalROI, totalVolume, chartData };
  }, [nodes]);

  const { totalRevenue, totalCost, netProfit, globalROI, totalVolume, chartData } = metrics;

  const currentDate = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="fixed right-0 top-1/2 -translate-y-1/2 z-[60] flex items-center">
      {/* Toggle Button */}
      <button
        onClick={() => setIsSimulationPanelOpen(!isSimulationPanelOpen)}
        className={cn(
          "w-12 h-24 glass border border-white/10 rounded-l-3xl flex flex-col items-center justify-center gap-2 text-purple-400 hover:text-white transition-all group shadow-2xl",
          isSimulationPanelOpen ? "translate-x-0" : "translate-x-0"
        )}
      >
        <BarChart3 size={20} className={cn("transition-transform duration-500", isSimulationPanelOpen ? "rotate-180" : "")} />
        <div className="flex flex-col gap-0.5">
          {[1, 2, 3].map(i => (
            <div key={i} className="w-1 h-1 rounded-full bg-current opacity-40" />
          ))}
        </div>
      </button>

      {/* Panel Content */}
      <AnimatePresence>
        {isSimulationPanelOpen && (
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-[420px] h-[90vh] glass border-l border-white/10 shadow-[-20px_0_50px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden rounded-l-[40px]"
          >
            {/* Header - Report Style */}
            <div className="p-8 border-b border-white/5 bg-white/[0.02] relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5">
                <Activity size={120} />
              </div>
              
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center text-white shadow-lg shadow-purple-500/20">
                    <BarChart3 size={20} />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-white uppercase tracking-[0.2em]">Relatório Estratégico</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <Calendar size={10} className="text-slate-500" />
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{currentDate}</span>
                    </div>
                  </div>
                </div>
                <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Live Report</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Status do Funil</p>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-emerald-500" />
                    <span className="text-xs font-bold text-white">Otimizado</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Eficiência</p>
                  <div className="flex items-center gap-2">
                    <TrendingUp size={14} className="text-purple-400" />
                    <span className="text-xs font-bold text-white">{globalROI > 100 ? 'Alta' : 'Moderada'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-8 space-y-10 no-scrollbar custom-scrollbar">
              
              {/* Main Result Section */}
              <section className="space-y-4">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-2">Resultado Consolidado</h3>
                
                <div className="grid grid-cols-1 gap-4">
                  {/* Net Profit Card - The Star of the Show */}
                  <div className="p-8 rounded-[32px] bg-gradient-to-br from-emerald-500/20 via-emerald-500/5 to-transparent border border-emerald-500/20 relative overflow-hidden group">
                    <div className="absolute -right-8 -bottom-8 opacity-5 group-hover:opacity-10 transition-opacity">
                      <DollarSign size={160} />
                    </div>
                    <div className="relative z-10">
                      <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-2">Lucro Líquido</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black text-emerald-500/50">R$</span>
                        <p className="text-5xl font-black text-white tracking-tighter">
                          {netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </p>
                      </div>
                      <div className="mt-4 flex items-center gap-2">
                        <div className={cn(
                          "px-2 py-1 rounded-lg flex items-center gap-1.5",
                          netProfit > 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                        )}>
                          {netProfit > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                          <span className="text-[10px] font-black uppercase tracking-widest">
                            {globalROI.toFixed(1)}% ROI
                          </span>
                        </div>
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Margem de Lucro</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Charts Section */}
              <section className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Fluxo de Volume</h3>
                  <PieChart size={14} className="text-slate-600" />
                </div>
                
                <div className="h-48 w-full glass rounded-[32px] border-white/5 p-4 flex items-center justify-center">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 9, fontWeight: 700 }} 
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 9, fontWeight: 700 }} 
                        />
                        <Tooltip 
                          cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                          contentStyle={{ 
                            backgroundColor: '#0a0a0b', 
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '12px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            color: '#fff'
                          }}
                        />
                        <Bar dataKey="volume" radius={[6, 6, 0, 0]}>
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color === 'emerald-600' ? '#10b981' : entry.color === 'purple-600' ? '#8b5cf6' : '#6366f1'} opacity={0.8} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center space-y-2">
                      <AlertCircle size={24} className="text-slate-700 mx-auto" />
                      <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Sem dados para exibir</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Financial Breakdown */}
              <section className="space-y-4">
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-2">Detalhamento Financeiro</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-6 glass rounded-[28px] border-white/5 space-y-3 group hover:bg-white/[0.02] transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                      <DollarSign size={16} />
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Receita</p>
                      <p className="text-lg font-black text-white">R$ {totalRevenue.toLocaleString('pt-BR')}</p>
                    </div>
                  </div>

                  <div className="p-6 glass rounded-[28px] border-white/5 space-y-3 group hover:bg-white/[0.02] transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500">
                      <Target size={16} />
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Investimento</p>
                      <p className="text-lg font-black text-white">R$ {totalCost.toLocaleString('pt-BR')}</p>
                    </div>
                  </div>
                </div>

                <div className="p-6 glass rounded-[28px] border-white/5 flex items-center justify-between group hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                      <Zap size={18} />
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Tráfego Total</p>
                      <p className="text-xl font-black text-white">{Math.round(totalVolume).toLocaleString('pt-BR')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-0.5">Custo Médio</p>
                    <p className="text-xs font-black text-slate-400">R$ {totalVolume > 0 ? (totalCost / totalVolume).toFixed(2) : '0,00'}</p>
                  </div>
                </div>
              </section>

              {/* Executive Summary / Insights */}
              <section className="space-y-4 pb-4">
                <div className="flex items-center gap-2 ml-2">
                  <Lightbulb size={14} className="text-amber-400" />
                  <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Sumário Executivo</h3>
                </div>
                
                <div className="space-y-3">
                  {globalROI < 100 ? (
                    <div className="p-5 rounded-[24px] bg-rose-500/5 border border-rose-500/10 flex gap-4">
                      <div className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                      <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                        <strong className="text-rose-400">Atenção Necessária:</strong> Seu ROI está abaixo da meta ideal de 100%. Recomendamos revisar o CPC das fontes de tráfego ou implementar Order Bumps para elevar o ticket médio.
                      </p>
                    </div>
                  ) : (
                    <div className="p-5 rounded-[24px] bg-emerald-500/5 border border-emerald-500/10 flex gap-4">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                      <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                        <strong className="text-emerald-400">Performance Excelente:</strong> O funil apresenta uma margem saudável. Considere escalar o orçamento nas fontes de tráfego com melhor conversão.
                      </p>
                    </div>
                  )}

                  <div className="p-5 rounded-[24px] bg-blue-500/5 border border-blue-500/10 flex gap-4">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                    <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                      <strong className="text-blue-400">Oportunidade:</strong> Identificamos que a etapa de Checkout possui potencial de otimização. Testes A/B na página de pagamento podem aumentar o ROI em até 15%.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-white/5 bg-white/[0.01]">
              <button 
                onClick={() => setIsSimulationPanelOpen(false)}
                className="w-full py-4 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] hover:bg-white/10 hover:text-white transition-all active:scale-95"
              >
                Fechar Relatório
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};


import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  DollarSign, 
  Target, 
  BarChart3,
  ArrowUpRight,
  Calendar,
  ArrowDownRight,
  Activity,
  AlertCircle,
  Lightbulb,
  X
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
import { useTranslation } from 'react-i18next';

export const SimulationPanel = () => {
  const { t, i18n } = useTranslation('admin');
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
        color: n.data.color.includes('bg-') ? n.data.color.replace('bg-', '') : '#27CBEF'
      }));

    return { totalRevenue, totalCost, netProfit, globalROI, totalVolume, chartData };
  }, [nodes]);

  const { totalRevenue, totalCost, netProfit, globalROI, totalVolume, chartData } = metrics;

  const currentDate = new Date().toLocaleDateString(i18n.language === 'en' ? 'en-US' : i18n.language === 'es' ? 'es-ES' : 'pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="fixed right-6 top-1/2 -translate-y-1/2 z-[110] flex items-center h-[90vh] pointer-events-none">
      {/* Toggle Button - Only show if panel is closed */}
      {!isSimulationPanelOpen && (
        <button
          onClick={() => setIsSimulationPanelOpen(true)}
          className="w-12 h-24 glass border border-white/10 rounded-2xl flex flex-col items-center justify-center gap-2 text-cyan-400 hover:text-white transition-all group shadow-2xl hover:scale-105 active:scale-95 pointer-events-auto"
        >
          <BarChart3 size={20} />
          <div className="flex flex-col gap-0.5">
            {[1, 2, 3].map(i => (
              <div key={i} className="w-1 h-1 rounded-full bg-current opacity-40 group-hover:opacity-100 transition-opacity" />
            ))}
          </div>
        </button>
      )}

      {/* Panel Content */}
      <AnimatePresence>
        {isSimulationPanelOpen && (
          <motion.div
            initial={{ x: 40, opacity: 0, scale: 0.95 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ x: 40, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-[520px] h-[95vh] glass-card border border-white/10 shadow-[0_30px_100px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden rounded-[40px] relative pointer-events-auto"
          >
            {/* Close Button (X) */}
            <button 
              onClick={() => setIsSimulationPanelOpen(false)}
              className="absolute top-6 right-6 z-20 w-8 h-8 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-all group shadow-lg shadow-red-500/20"
            >
              <X size={16} />
            </button>

            {/* Header - Compact Style with Slim Tags */}
            <div className="p-8 pb-4 border-b border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#27CBEF] flex items-center justify-center text-black shadow-[0_0_15px_rgba(39,203,239,0.3)]">
                    <BarChart3 size={20} />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-white uppercase tracking-[0.2em] italic">{t('flow.simulation.title')}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <Calendar size={10} className="text-slate-500" />
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{currentDate}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="px-3 py-1 rounded-full bg-[#27CBEF]/10 border border-[#27CBEF]/20 flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-[#27CBEF] animate-pulse" />
                    <span className="text-[8px] font-black text-[#27CBEF] uppercase tracking-widest">{t('flow.simulation.optimization')}</span>
                  </div>
                  <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">{t('flow.simulation.live')}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar pb-10">
              
              {/* Main Result Section */}
              <section className="space-y-4">
                {/* Net Profit Card - More Compact & Impactful */}
                <div className="p-8 rounded-[32px] bg-gradient-to-br from-emerald-500/15 to-transparent border border-emerald-500/10 relative overflow-hidden group">
                  <div className="relative z-10 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-3">{t('flow.simulation.net_profit')}</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black text-emerald-500/40 italic">R$</span>
                        <p className="text-5xl font-black text-white tracking-tighter italic">
                          {netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </p>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className={cn(
                        "inline-flex items-center gap-2 px-4 py-2 rounded-2xl border shadow-lg mb-2",
                        netProfit > 0 ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-rose-500/10 border-rose-500/20 text-rose-400"
                      )}>
                        {netProfit > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        <span className="text-xs font-black uppercase tracking-widest">
                          {globalROI.toFixed(1)}% ROI
                        </span>
                      </div>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{t('flow.simulation.global_performance')}</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Financial Breakdown - Side by Side Grid */}
              <section className="grid grid-cols-2 gap-4">
                <div className="p-6 glass rounded-[24px] border border-white/5 space-y-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                    <DollarSign size={16} />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.1em] mb-0.5">{t('flow.simulation.total_revenue')}</p>
                    <p className="text-lg font-black text-white italic">R$ {totalRevenue.toLocaleString('pt-BR')}</p>
                  </div>
                </div>

                <div className="p-6 glass rounded-[24px] border border-white/5 space-y-3">
                  <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500">
                    <Target size={16} />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.1em] mb-0.5">{t('flow.simulation.total_cost')}</p>
                    <p className="text-lg font-black text-white italic">R$ {totalCost.toLocaleString('pt-BR')}</p>
                  </div>
                </div>
              </section>

              {/* Audience Summary - Wide Bar */}
              <div className="p-6 glass rounded-[24px] border border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#27CBEF]/10 flex items-center justify-center text-[#27CBEF]">
                    <Activity size={20} />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.1em] mb-0.5">{t('flow.simulation.estimated_audience')}</p>
                    <p className="text-xl font-black text-white italic">{Math.round(totalVolume).toLocaleString('pt-BR')}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-0.5">{t('flow.simulation.cost_per_lead')}</p>
                  <p className="text-xs font-black text-[#27CBEF]/80">R$ {totalVolume > 0 ? (totalCost / totalVolume).toFixed(2) : '0,00'}</p>
                </div>
              </div>

              {/* Charts Section - More Efficient Space */}
              <section className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">{t('flow.simulation.traffic_distribution')}</h3>
                  <BarChart3 size={14} className="text-slate-700" />
                </div>
                
                <div className="h-44 w-full glass rounded-[24px] border border-white/5 p-4">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" vertical={false} />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 8, fontWeight: 900 }} 
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 8, fontWeight: 900 }} 
                        />
                        <Tooltip 
                          cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                          contentStyle={{ 
                            backgroundColor: '#0a0a0b', 
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '12px',
                            fontSize: '9px',
                            fontWeight: '900',
                            color: '#fff'
                          }}
                        />
                        <Bar dataKey="volume" radius={[4, 4, 0, 0]}>
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color === 'emerald-600' ? '#10b981' : '#27CBEF'} opacity={0.6} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center space-y-2 opacity-20">
                      <AlertCircle size={20} />
                      <p className="text-[8px] font-black uppercase tracking-widest">{t('flow.simulation.no_data')}</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Executive Summary - Two Columns */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 ml-2">
                  <Lightbulb size={14} className="text-amber-500" />
                  <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">{t('flow.simulation.insights')}</h3>
                </div>
                
                <div className="grid grid-cols-1 gap-3">
                  <div className="p-4 rounded-[20px] bg-white/[0.02] border border-white/5 flex gap-4">
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                      globalROI < 100 ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]" : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                    )} />
                    <p className="text-[11px] text-slate-400 leading-tight font-bold uppercase">
                      {globalROI < 100 ? (
                        <><strong className="text-rose-400">{t('flow.simulation.warning_label')}</strong> {t('flow.simulation.warning_text')}</>
                      ) : (
                        <><strong className="text-emerald-400">{t('flow.simulation.excellent_label')}</strong> {t('flow.simulation.excellent_text')}</>
                      )}
                    </p>
                  </div>

                  <div className="p-4 rounded-[20px] bg-white/[0.02] border border-white/5 flex gap-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#27CBEF] mt-1.5 shrink-0 shadow-[0_0_8px_rgba(39,203,239,0.4)]" />
                    <p className="text-[11px] text-slate-400 leading-tight font-bold uppercase">
                      <strong className="text-[#27CBEF]">{t('flow.simulation.optimization_label')}</strong> {t('flow.simulation.optimization_text')}
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

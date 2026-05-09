import React, { useState } from 'react';
import { LayoutTemplate, ChevronLeft, ChevronRight, Zap, Plus, Settings, HelpCircle, Layers, Sparkles, ArrowRight, FolderOpen } from 'lucide-react';
import { useFunnelStore } from '../store/useFunnelStore';
import { FUNNEL_TEMPLATES } from '../constants/templates';
import { cn } from '../lib/utils';
import { ConfirmationModal } from './ConfirmationModal';
import { useNavigate } from 'react-router-dom';

export const Sidebar = () => {
  const { 
    isSidebarOpen, 
    setIsSidebarOpen, 
    activeSidebarTab, 
    setActiveSidebarTab,
    loadTemplate 
  } = useFunnelStore();
  const navigate = useNavigate();

  const [pendingTemplate, setPendingTemplate] = useState<any>(null);

  const tabs = [
    { id: 'templates', icon: LayoutTemplate, label: 'Templates' },
    { id: 'elements', icon: Plus, label: 'Elementos' },
    { id: 'layers', icon: Layers, label: 'Camadas' },
    { id: 'settings', icon: Settings, label: 'Ajustes' },
  ];

  const handleTabClick = (tabId: string) => {
    if (activeSidebarTab === tabId && isSidebarOpen) {
      setIsSidebarOpen(false);
    } else {
      setActiveSidebarTab(tabId);
      setIsSidebarOpen(true);
    }
  };

  return (
    <>
      <div className="fixed left-0 top-0 bottom-0 z-[60] flex pointer-events-none">
        {/* Icon Bar */}
        <div className="w-16 bg-[#0a0a0b] border-r border-white/5 flex flex-col items-center py-8 gap-6 pointer-events-auto shadow-2xl z-20">
          <button 
            onClick={() => window.location.href = '/admin'}
            className="relative w-10 h-10 group bg-black/20 rounded-xl flex items-center justify-center mb-4 border border-white/5 hover:border-cyan-500/50 hover:bg-cyan-500/10 transition-all hover:shadow-[0_0_15px_rgba(6,182,212,0.3)]"
            title="Voltar para o Painel"
          >
            <img src="/logo.png" alt="Super Checkout" className="w-6 h-6 object-contain relative z-10 group-hover:scale-110 transition-transform" />
          </button>

          <button
            onClick={() => navigate('/admin/flow')}
            className="w-12 h-12 rounded-xl flex items-center justify-center transition-all group relative text-cyan-500 hover:bg-cyan-500/10 hover:text-cyan-400 mb-2"
            title="Meus Projetos"
          >
            <FolderOpen size={20} />
          </button>

          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center transition-all group relative",
                activeSidebarTab === tab.id && isSidebarOpen 
                  ? "bg-purple-500/10 text-purple-400" 
                  : "text-slate-500 hover:bg-white/5 hover:text-slate-300"
              )}
              title={tab.label}
            >
              <tab.icon size={20} />
              {activeSidebarTab === tab.id && isSidebarOpen && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-purple-500 rounded-l-full" />
              )}
            </button>
          ))}

          <div className="mt-auto flex flex-col gap-6">
            <button className="text-slate-500 hover:text-slate-300 transition-colors">
              <HelpCircle size={20} />
            </button>
          </div>
        </div>

        {/* Content Panel */}
        <div className={cn(
          "w-80 bg-[#0a0a0b]/95 backdrop-blur-xl border-r border-white/5 transition-all duration-500 ease-in-out overflow-hidden flex flex-col shadow-2xl z-10",
          isSidebarOpen 
            ? "translate-x-0 opacity-100 pointer-events-auto" 
            : "-translate-x-full opacity-0 pointer-events-none"
        )}>
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                {tabs.find(t => t.id === activeSidebarTab)?.icon && React.createElement(tabs.find(t => t.id === activeSidebarTab)!.icon, { size: 16 })}
              </div>
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">
                {tabs.find(t => t.id === activeSidebarTab)?.label || 'Menu'}
              </h2>
            </div>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="p-2 hover:bg-white/5 rounded-lg text-slate-500 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {activeSidebarTab === 'templates' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-2 mb-6">
                  <Sparkles size={14} className="text-purple-400" />
                  <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest">
                    Estratégias Prontas
                  </p>
                </div>
                
                <div className="grid gap-3">
                  {FUNNEL_TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => setPendingTemplate(template)}
                      className="w-full text-left p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-purple-500/30 hover:bg-purple-500/5 transition-all group relative overflow-hidden"
                    >
                      {/* Hover effect background */}
                      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-xs font-black text-white group-hover:text-purple-400 transition-colors uppercase tracking-wider">
                            {template.name}
                          </h3>
                          <ArrowRight size={14} className="text-slate-600 group-hover:text-purple-500 transition-all -translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100" />
                        </div>
                        <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2">
                          {template.description}
                        </p>
                        
                        <div className="mt-4 flex items-center gap-2">
                          <div className="px-2 py-0.5 rounded-md bg-white/5 border border-white/5 text-[8px] font-black text-slate-400 uppercase tracking-widest">
                            {template.nodes.length} Blocos
                          </div>
                          <div className="px-2 py-0.5 rounded-md bg-white/5 border border-white/5 text-[8px] font-black text-slate-400 uppercase tracking-widest">
                            {template.edges.length} Conexões
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeSidebarTab !== 'templates' && (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center text-slate-700 mb-4">
                  <Zap size={32} />
                </div>
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">
                  Em breve...
                </p>
                <p className="text-[10px] text-slate-600 mt-2 max-w-[160px]">
                  Estamos preparando novos recursos incríveis para você.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmationModal
        isOpen={!!pendingTemplate}
        onClose={() => setPendingTemplate(null)}
        onConfirm={() => {
          if (pendingTemplate) {
            loadTemplate(pendingTemplate.nodes, pendingTemplate.edges);
            setIsSidebarOpen(false);
          }
        }}
        title="Substituir Funil?"
        message={`Você está prestes a carregar o template "${pendingTemplate?.name}". Isso irá remover todos os elementos atuais do seu canvas. Deseja continuar?`}
      />
    </>
  );
};

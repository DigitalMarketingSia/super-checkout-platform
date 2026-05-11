import React, { useState } from 'react';
import { LayoutTemplate, ChevronLeft, Zap, Plus, Settings, HelpCircle, Layers, Sparkles, ArrowRight, FolderOpen } from 'lucide-react';
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
                  ? "bg-[#27CBEF]/10 text-[#27CBEF]" 
                  : "text-slate-500 hover:bg-white/5 hover:text-slate-300"
              )}
              title={tab.label}
            >
              <tab.icon size={20} />
              {activeSidebarTab === tab.id && isSidebarOpen && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#27CBEF] rounded-l-full" />
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
              <div className="w-8 h-8 rounded-lg bg-[#27CBEF]/10 flex items-center justify-center text-[#27CBEF]">
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
              <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-500">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-[#27CBEF]" />
                    <p className="text-[10px] font-black text-[#27CBEF] uppercase tracking-[0.2em] italic">
                      Estratégias Prontas
                    </p>
                  </div>
                  <div className="px-2 py-1 bg-[#27CBEF]/10 rounded-md border border-[#27CBEF]/20">
                    <span className="text-[8px] font-black text-[#27CBEF] uppercase">{FUNNEL_TEMPLATES.length} Itens</span>
                  </div>
                </div>
                
                <div className="grid gap-4">
                  {FUNNEL_TEMPLATES.map((template, idx) => (
                    <button
                      key={template.id}
                      onClick={() => setPendingTemplate(template)}
                      className="group relative w-full text-left p-5 rounded-3xl bg-[#0F0F13] border border-white/5 hover:border-cyan-500/40 transition-all duration-500 hover:-translate-y-1 overflow-hidden animate-in fade-in slide-in-from-bottom-4"
                      style={{ animationDelay: `${idx * 100}ms` }}
                    >
                      {/* Premium Hover Glow */}
                      <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                      
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:bg-cyan-500/10 group-hover:border-cyan-500/20 transition-all">
                              <LayoutTemplate size={14} className="text-gray-500 group-hover:text-cyan-400" />
                            </div>
                            <h3 className="text-[11px] font-black text-white group-hover:text-cyan-400 transition-colors uppercase tracking-tight italic">
                              {template.name}
                            </h3>
                          </div>
                          <ArrowRight size={14} className="text-slate-700 group-hover:text-cyan-500 transition-all -translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100" />
                        </div>
                        
                        <p className="text-[10px] text-gray-500 leading-relaxed line-clamp-2 font-medium mb-4 group-hover:text-gray-400 transition-colors">
                          {template.description}
                        </p>
                        
                        <div className="flex items-center gap-2">
                          <div className="flex -space-x-1">
                            {[1, 2, 3].map(i => (
                              <div key={i} className="w-4 h-4 rounded-full border-2 border-[#0F0F13] bg-white/5 flex items-center justify-center">
                                <div className="w-1 h-1 rounded-full bg-cyan-500/50" />
                              </div>
                            ))}
                          </div>
                          <span className="text-[8px] font-black text-gray-600 uppercase tracking-widest group-hover:text-gray-500 transition-colors">
                            {template.nodes.length} Blocos • {template.edges.length} Conexões
                          </span>
                        </div>
                      </div>

                      {/* Shimmer on Hover */}
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent -translate-x-full group-hover:animate-shimmer pointer-events-none" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeSidebarTab !== 'templates' && (
              <div className="flex flex-col items-center justify-center h-full text-center p-8 animate-in fade-in zoom-in-95 duration-700">
                <div className="w-20 h-20 rounded-[2.5rem] bg-white/5 flex items-center justify-center text-slate-800 mb-6 border border-white/5 relative group">
                  <div className="absolute inset-0 bg-cyan-500/5 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Zap size={32} className="relative z-10" />
                </div>
                <p className="text-[10px] font-black text-white uppercase tracking-[0.3em] italic">
                  Recurso Premium
                </p>
                <p className="text-[9px] text-slate-600 mt-3 max-w-[200px] font-medium leading-relaxed uppercase tracking-widest">
                  Estamos lapidando ferramentas avançadas de {activeSidebarTab === 'elements' ? 'elementos visuais' : activeSidebarTab === 'layers' ? 'gestão de camadas' : 'configurações globais'} para sua conta.
                </p>
                
                <div className="mt-8 px-4 py-2 bg-cyan-500/5 rounded-xl border border-cyan-500/10">
                  <span className="text-[8px] font-black text-cyan-500/60 uppercase tracking-tighter">Em Desenvolvimento</span>
                </div>
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

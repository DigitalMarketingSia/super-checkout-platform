import React, { useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Globe, StickyNote, CreditCard, Users } from 'lucide-react';
import { ICON_MAP } from '../../lib/icons';
import { useFunnelStore } from '../../store/useFunnelStore';
import { type FunnelNodeData, type NodeStatus } from '../../types';
import { cn } from '../../lib/utils';


const PRODUCT_CONFIG = {
  principal: { color: 'bg-[#27CBEF]', label: 'Principal', border: 'border-[#27CBEF]/50' },
  gratis: { color: 'bg-emerald-500', label: 'Grátis', border: 'border-emerald-500/50' },
  upsell: { color: 'bg-orange-500', label: 'Upsell', border: 'border-orange-500/50' },
  orderbump: { color: 'bg-yellow-500', label: 'Order Bump', border: 'border-yellow-500/50' },
  downsell: { color: 'bg-rose-500', label: 'Downsell', border: 'border-rose-500/50' },
};

export const BaseNode = ({ id, data, selected }: { id: string; data: FunnelNodeData; selected?: boolean }) => {
  const { setSelectedNodeId, setContextMenu, edges, nodes, updateNodeData } = useFunnelStore();
  const [localVolume, setLocalVolume] = useState(data.volume || 0);
  const [localPrice, setLocalPrice] = useState(data.price || 0);

  useEffect(() => {
    setLocalVolume(data.volume || 0);
  }, [data.volume]);

  useEffect(() => {
    setLocalPrice(data.price || 0);
  }, [data.price]);

  // Check if this node has a linked note
  const linkedNote = data.isNote ? null : nodes.find(n => 
    n.data.isNote && edges.some(e => 
      (e.source === n.id && e.target === id) || (e.source === id && e.target === n.id)
    )
  );

  // Check if this is a note linked to something
  const isLinkedNote = data.isNote && edges.some(e => e.source === id || e.target === id);

  const statusColors: Record<NodeStatus, string> = {
    ativo: 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]',
    em_teste: 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]',
    pausado: 'bg-slate-500 shadow-[0_0_10px_rgba(100,116,139,0.5)]',
  };

  const renderIcon = (size: number) => {
    if (data.icon && data.icon.startsWith('http')) {
      return <img src={data.icon} alt={data.label} className="w-full h-full object-contain p-1" referrerPolicy="no-referrer" />;
    }
    const IconComp = ICON_MAP[data.type] || StickyNote;
    return <IconComp size={size} className="opacity-80" />;
  };

  // Determine Skin
  const isPage = ['landing', 'vsl', 'webinar', 'bio'].includes(data.type);
  const isSocial = ['instagram', 'tiktok', 'youtube', 'pinterest', 'youtube_short', 'facebook', 'kwai', 'linkedin', 'x', 'twitch', 'discord', 'threads'].includes(data.type);
  const isChat = ['whatsapp', 'telegram', 'grupo'].includes(data.type);
  const isEmail = data.type === 'email';
  const isProduct = data.type === 'product' || data.category === 'Produto';
  const isNote = data.isNote || data.type === 'note';

  const productConfig = isProduct ? (PRODUCT_CONFIG[data.productType as keyof typeof PRODUCT_CONFIG] || PRODUCT_CONFIG.principal) : null;

  if (isNote && isLinkedNote) {
    return (
      <div className="w-0 h-0 opacity-0 pointer-events-none">
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
      </div>
    );
  }

  const isSource = data.category === 'Rede Social';

  return (
    <div 
      onClick={() => setSelectedNodeId(id)}
      className={cn(
        'relative cursor-pointer transition-all duration-300 group',
        selected ? 'scale-110 z-10' : 'hover:scale-105'
      )}
    >
      {/* Direct Metrics Editor */}
      {!isNote && (
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-0 z-40 w-48 pointer-events-none">
          {/* Volume Label */}
          <div className="flex flex-col items-center pointer-events-auto">
            <input
              type="number"
              step="1"
              value={localVolume}
              onChange={(e) => {
                const val = e.target.value === '' ? 0 : Number(e.target.value);
                setLocalVolume(val);
                updateNodeData(id, { volume: val });
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              className="w-full bg-transparent border-none p-0 text-2xl font-black text-white text-center focus:ring-0 drop-shadow-[0_2px_8px_rgba(0,0,0,1)] cursor-text hover:bg-white/5 rounded-lg transition-colors"
            />
            <span className="text-[10px] font-black text-amber-500 uppercase tracking-[0.3em] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] -mt-1">
              Visitas
            </span>
          </div>

          {/* Price Label */}
          {!!(isProduct || (data.price && data.price > 0)) && data.price > 0 && (
            <div className="flex flex-col items-center mt-1 pointer-events-auto">
              <div className="flex items-center justify-center">
                <span className="text-emerald-500 font-black text-base drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] mr-1">R$</span>
                <input
                  type="number"
                  value={localPrice}
                  onChange={(e) => {
                    const val = e.target.value === '' ? 0 : Number(e.target.value);
                    setLocalPrice(val);
                    updateNodeData(id, { price: val });
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  className="w-24 bg-transparent border-none p-0 text-xl font-black text-emerald-400 text-center focus:ring-0 drop-shadow-[0_2px_8px_rgba(0,0,0,1)] cursor-text hover:bg-white/5 rounded-lg transition-colors hide-spin-buttons"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Linked Note Badge for regular nodes */}
      {linkedNote && (
        <div 
          className="absolute -top-4 -left-4 z-30 animate-bounce-slow cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedNodeId(linkedNote.id);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setContextMenu({
              x: e.clientX,
              y: e.clientY,
              nodeId: linkedNote.id,
            });
          }}
        >
          <div className="glass p-2 rounded-lg border border-amber-500/50 shadow-lg shadow-amber-500/20 hover:bg-amber-500/20 transition-colors">
            <StickyNote size={12} className="text-amber-500" />
          </div>
        </div>
      )}

      {/* Node Content */}
      <div className="flex flex-col items-center gap-3">
        
        {/* Visual Skin */}
        <div className="relative">
          {isPage ? (
            /* Browser Window Skin */
            <div className={cn(
              "w-32 h-24 glass rounded-xl border-2 overflow-hidden flex flex-col shadow-2xl transition-all",
              selected ? "border-[#27CBEF] ring-4 ring-[#27CBEF]/20" : "border-white/10 group-hover:border-white/30"
            )}>
              <div className="h-4 bg-white/10 flex items-center gap-1 px-2 border-b border-white/5">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500/50" />
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500/50" />
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" />
                <div className="flex-1" />
                <Globe size={8} className="text-white/20" />
              </div>
              <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-white/5 to-transparent">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center glass", data.color)}>
                  {renderIcon(20)}
                </div>
              </div>
            </div>
          ) : isSocial || isChat ? (
            /* Mobile Phone Skin */
            <div className={cn(
              "w-20 h-32 glass rounded-[24px] border-2 overflow-hidden flex flex-col shadow-2xl transition-all",
              selected ? "border-[#27CBEF] ring-4 ring-[#27CBEF]/20" : "border-white/10 group-hover:border-white/30"
            )}>
              <div className="h-3 flex justify-center pt-1">
                <div className="w-8 h-1 rounded-full bg-white/10" />
              </div>
              <div className="flex-1 flex items-center justify-center">
                <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center glass shadow-xl", data.color)}>
                  {renderIcon(24)}
                </div>
              </div>
              <div className="h-4 flex justify-center pb-2">
                <div className="w-2 h-2 rounded-full border border-white/10" />
              </div>
            </div>
          ) : isProduct ? (
            /* Product Card Skin */
            <div className={cn(
              "w-28 h-20 glass rounded-2xl border-2 overflow-hidden flex flex-col shadow-2xl transition-all",
              selected ? "border-[#27CBEF] ring-4 ring-[#27CBEF]/20" : cn("border-white/10 group-hover:border-white/30", productConfig?.border)
            )}>
              <div className={cn("h-3 flex items-center px-2 border-b border-white/5", productConfig?.color, "bg-opacity-20")}>
                <div className={cn("w-1 h-1 rounded-full", productConfig?.color)} />
                <span className="text-[7px] font-black uppercase tracking-widest ml-1.5 text-white/70">{productConfig?.label}</span>
              </div>
              <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-white/5 to-transparent">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center glass shadow-lg", data.color)}>
                  {renderIcon(20)}
                </div>
              </div>
            </div>
          ) : isNote ? (
            /* Note Skin */
            <div className={cn(
              "w-32 h-32 glass rounded-xl border-2 p-4 flex flex-col shadow-2xl transition-all bg-amber-500/5",
              selected ? "border-amber-500 ring-4 ring-amber-500/20" : "border-amber-500/20 group-hover:border-amber-500/40"
            )}>
              <div className="flex items-center gap-2 mb-2 border-b border-amber-500/10 pb-2">
                <StickyNote size={14} className="text-amber-500" />
                <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest">Nota Estratégica</span>
              </div>
              <p className="text-[9px] text-slate-300 line-clamp-4 leading-relaxed italic">
                {data.notes || 'Sem descrição...'}
              </p>
            </div>
          ) : (
            /* Stylized Icon Skin (Email, Notes, etc) */
            <div className={cn(
              "w-24 h-24 glass rounded-3xl border-2 flex items-center justify-center shadow-2xl transition-all",
              selected ? "border-[#27CBEF] ring-4 ring-[#27CBEF]/20" : "border-white/10 group-hover:border-white/30"
            )}>
              <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center glass shadow-xl", data.color)}>
                {renderIcon(32)}
              </div>
            </div>
          )}

          {/* Status Badge */}
          <div className={cn(
            "absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-[#0a0a0b] z-20",
            statusColors[data.status]
          )} />
        </div>

        {/* Label */}
        <div className="text-center max-w-[140px] space-y-1">
          <p className={cn(
            "text-[10px] font-black uppercase tracking-widest transition-colors",
            selected ? "text-[#27CBEF]" : "text-slate-400 group-hover:text-white"
          )}>
            {data.label}
          </p>
          
          {isProduct ? (
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#27CBEF]/10 border border-[#27CBEF]/20">
              <CreditCard size={8} className="text-[#27CBEF]" />
              <span className="text-[9px] font-black text-[#27CBEF]">
                R$ {(data.price || 0).toLocaleString()}
              </span>
            </div>
          ) : data.volume !== undefined && Math.round(data.volume) > 0 ? (
            <div className="flex flex-col gap-1 items-center">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <Users size={8} className="text-emerald-500" />
                <span className="text-[9px] font-black text-emerald-400">
                  {Math.round(data.volume).toLocaleString()}
                </span>
              </div>
              
              {data.price !== undefined && data.price > 0 && (
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#27CBEF]/10 border border-[#27CBEF]/20">
                  <CreditCard size={8} className="text-[#27CBEF]" />
                  <span className="text-[9px] font-black text-[#27CBEF]">
                    R$ {(data.volume * data.price).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Handles - Improved hit areas and visual cues */}
      <Handle
        type="target"
        position={Position.Left}
        className={cn(
          "!w-8 !h-16 !border-none !bg-transparent -left-4 !top-1/2 !-translate-y-1/2 flex items-center justify-center group/handle",
          "hover:!bg-[#27CBEF]/5 transition-colors rounded-full"
        )}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-[#27CBEF]/0 group-hover/handle:bg-[#27CBEF] transition-all scale-0 group-hover/handle:scale-100 shadow-[0_0_10px_rgba(39,203,239,0.8)]" />
      </Handle>
      
      <Handle
        type="source"
        position={Position.Right}
        className={cn(
          "!w-8 !h-16 !border-none !bg-transparent -right-4 !top-1/2 !-translate-y-1/2 flex items-center justify-center group/handle",
          "hover:!bg-[#27CBEF]/5 transition-colors rounded-full"
        )}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-[#27CBEF]/0 group-hover/handle:bg-[#27CBEF] transition-all scale-0 group-hover/handle:scale-100 shadow-[0_0_10px_rgba(39,203,239,0.8)]" />
      </Handle>
    </div>
  );
};

import { useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import { X, RefreshCw } from 'lucide-react';
import { useFunnelStore } from '../../store/useFunnelStore';
import { type FunnelEdge } from '../../types';
import { cn } from '../../lib/utils';

export const ConversionEdge = ({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}: EdgeProps<FunnelEdge>) => {
  const { deleteEdge, updateEdgeData, updateEdgeByVolume, nodes } = useFunnelStore();
  const [mode, setMode] = useState<'percent' | 'volume'>('percent');

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const conversionRate = data?.conversionRate ?? 0;

  const sourceNode = nodes.find(n => n.id === source);
  const targetNode = nodes.find(n => n.id === target);

  // If either node is a note, we hide the edge line and labels entirely
  if (sourceNode?.data.isNote || targetNode?.data.isNote || sourceNode?.data.type === 'note' || targetNode?.data.type === 'note') {
    return null;
  }

  // Calculate absolute volume for this edge
  const sourceVolume = sourceNode?.data.volume || 0;
  const absoluteVolume = Math.round((sourceVolume * conversionRate) / 100);

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={{ ...style, strokeWidth: 2, stroke: '#1e293b' }} />
      
      {/* Energy Flow Effect */}
      <path
        d={edgePath}
        fill="none"
        stroke="url(#energy-gradient)"
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray="10, 100"
        className="animate-energy-flow pointer-events-none"
        style={{ filter: 'blur(1px)' }}
      />

      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan flex items-center gap-1"
        >
          <div className="flex items-center glass border-white/10 rounded-lg px-1 py-0 shadow-2xl group hover:border-purple-500/50 transition-all scale-110">
            {/* Mode Toggle Button */}
            <button
              onClick={() => setMode(mode === 'percent' ? 'volume' : 'percent')}
              className="mr-1.5 p-0.5 rounded-md bg-white/5 text-slate-500 hover:text-purple-400 transition-colors"
              title={mode === 'percent' ? "Alternar para Volume Fixo" : "Alternar para Porcentagem"}
            >
              <RefreshCw size={8} className={cn("transition-transform", mode === 'volume' ? "rotate-180" : "")} />
            </button>

            {mode === 'percent' ? (
              <div className="flex items-center">
                <input
                  type="number"
                  value={conversionRate}
                  onChange={(e) => updateEdgeData(id, { conversionRate: Number(e.target.value) })}
                  onDoubleClick={(e) => e.stopPropagation()}
                  className="w-8 text-[10px] font-black text-center bg-transparent border-none focus:ring-0 p-0 text-white hide-spin-buttons"
                />
                <span className="text-[9px] font-black text-purple-400">%</span>
              </div>
            ) : (
              <div className="flex items-center">
                <input
                  type="number"
                  value={absoluteVolume}
                  onChange={(e) => updateEdgeByVolume(id, Number(e.target.value))}
                  onDoubleClick={(e) => e.stopPropagation()}
                  className="w-12 text-[10px] font-black text-center bg-transparent border-none focus:ring-0 p-0 text-white hide-spin-buttons"
                />
                <span className="text-[8px] font-black text-slate-500 ml-1 uppercase tracking-widest">Vnd</span>
              </div>
            )}
            
            <button
              onClick={() => deleteEdge(id)}
              className="ml-2 p-0.5 bg-white/5 rounded-full text-slate-500 hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"
            >
              <X size={8} />
            </button>
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

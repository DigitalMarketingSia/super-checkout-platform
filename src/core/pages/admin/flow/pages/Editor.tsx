import React, { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  useReactFlow,
  ReactFlowProvider,
  BackgroundVariant,
  ConnectionLineType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { toPng } from 'html-to-image';
import { Loader2, LayoutGrid, Zap, X } from 'lucide-react';

import { useFunnelStore } from '../store/useFunnelStore';
import { BaseNode } from '../components/nodes/BaseNode';
import { ConversionEdge } from '../components/edges/ConversionEdge';
import { Toolbar } from '../components/Toolbar';
import { SidePanel } from '../components/SidePanel';
import { ConfigModal } from '../components/ConfigModal';
import { ContextMenu } from '../components/ContextMenu';
import { SimulationPanel } from '../components/SimulationPanel';
import { useAutoSave, saveFunnelManually } from '../hooks/useAutoSave';
import { cn } from '../lib/utils';

import { Sidebar } from '../components/Sidebar';

const nodeTypes = {
  funnelNode: BaseNode,
};

const edgeTypes = {
  conversion: ConversionEdge,
};

const EditorContent = () => {
  const { 
    nodes, 
    edges, 
    onNodesChange, 
    onEdgesChange, 
    onConnect, 
    onNodeDragStop,
    setNodes, 
    viewport,
    setSelectedNodeId,
    setContextMenu,
    isSidebarOpen,
    funnelName,
    setFunnelName
  } = useFunnelStore();
  
  const [isSaving, setIsSaving] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [tempName, setTempName] = useState('');

  // Auto-save hook
  useAutoSave();

  const onAutoLayout = useCallback(() => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({ rankdir: 'LR', nodesep: 150, ranksep: 250 });

    nodes.forEach((node) => {
      dagreGraph.setNode(node.id, { width: 150, height: 150 });
    });

    edges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const newNodes = nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      return {
        ...node,
        position: {
          x: nodeWithPosition.x - 75,
          y: nodeWithPosition.y - 75,
        },
      };
    });

    setNodes(newNodes);
  }, [nodes, edges, setNodes]);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setContextMenu(null);
  }, [setSelectedNodeId, setContextMenu]);

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: any) => {
      event.preventDefault();
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        nodeId: node.id,
      });
    },
    [setContextMenu]
  );

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      setContextMenu(null);
    },
    [setContextMenu]
  );

  const onNodeDragStart = useCallback(() => {
    setContextMenu(null);
  }, [setContextMenu]);

  const onExportImage = async () => {
    const element = document.querySelector('.react-flow__viewport') as HTMLElement;
    if (element) {
      const dataUrl = await toPng(element, {
        backgroundColor: '#0a0a0b',
        quality: 1,
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      link.download = `meu-funil.png`;
      link.href = dataUrl;
      link.click();
    }
  };

  const onExportJson = () => {
    const data = { nodes, edges, viewport };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `meu-funil.json`;
    link.href = url;
    link.click();
  };

  const { id } = useParams();

  const onSaveClick = () => {
    setTempName(funnelName);
    setIsSaveModalOpen(true);
  };

  const onConfirmSave = async () => {
    setIsSaving(true);
    setIsSaveModalOpen(false);
    setFunnelName(tempName);
    const success = await saveFunnelManually(id, { nodes, edges, viewport }, tempName);
    if (success) {
      setTimeout(() => setIsSaving(false), 500);
    } else {
      setIsSaving(false);
      console.error('Erro ao salvar funil.');
    }
  };

  return (
    <div className="w-full h-screen bg-[#0a0a0b] overflow-hidden relative">
      {isSaving && (
        <div className="absolute top-8 right-8 z-50 flex items-center gap-3 px-5 py-2.5 glass rounded-2xl text-xs font-black uppercase tracking-widest text-[#27CBEF] shadow-2xl border-[#27CBEF]/20">
          <div className="w-2 h-2 rounded-full bg-[#27CBEF] animate-pulse" />
          Auto-Save
        </div>
      )}

      {/* Sidebar (Left) */}
      <Sidebar />

      {/* The Dock & Shelf (Bottom) */}
      <Toolbar 
        onAutoLayout={onAutoLayout} 
        onExportImage={onExportImage} 
        onExportJson={onExportJson}
        onSave={onSaveClick}
      />

      {isSaveModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0a0a0b] border border-white/10 p-6 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Salvar Projeto</h2>
              <button onClick={() => setIsSaveModalOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-400 mb-2">Nome do Funil</label>
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                placeholder="Ex: Lançamento Semente"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setIsSaveModalOpen(false)}
                className="px-5 py-2.5 rounded-xl font-medium text-gray-400 hover:bg-white/5 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={onConfirmSave}
                disabled={!tempName.trim()}
                className="px-5 py-2.5 bg-[#27CBEF] hover:bg-[#27CBEF]/80 text-black rounded-xl font-bold shadow-lg shadow-[#27CBEF]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={cn(
        "w-full h-full transition-all duration-500 ease-in-out",
        isSidebarOpen ? "pl-96" : "pl-16"
      )}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onPaneClick={onPaneClick}
          onNodeContextMenu={onNodeContextMenu}
          onEdgeContextMenu={onEdgeContextMenu}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onViewportChange={(v) => useFunnelStore.getState().setViewport(v)}
          fitView
          fitViewOptions={{ maxZoom: 0.7 }}
          snapToGrid
          snapGrid={[12, 12]}
          connectionLineType={ConnectionLineType.Bezier}
          connectionLineStyle={{ stroke: '#27CBEF', strokeWidth: 3, opacity: 0.6 }}
          defaultEdgeOptions={{
            type: 'conversion',
            animated: true,
          }}
          className="bg-[#0a0a0b]"
        >
          <svg style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0 }}>
            <defs>
              <linearGradient id="energy-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="transparent" />
                <stop offset="50%" stopColor="#27CBEF" />
                <stop offset="100%" stopColor="transparent" />
              </linearGradient>
            </defs>
          </svg>
          <Background 
            variant={BackgroundVariant.Dots} 
            gap={24} 
            size={1.5} 
            color="#27272a" 
          />
          <Controls 
            showInteractive={false} 
            position="bottom-right"
          />
        </ReactFlow>
      </div>

      <SidePanel />
      <ConfigModal />
      <ContextMenu />
      <SimulationPanel />
    </div>
  );
};

export const Editor = () => {
  return (
    <ReactFlowProvider>
      <EditorContent />
    </ReactFlowProvider>
  );
};

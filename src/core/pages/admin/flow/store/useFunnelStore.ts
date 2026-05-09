import { create } from 'zustand';
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Connection,
  type Viewport,
} from '@xyflow/react';
import { type FunnelNode, type FunnelEdge, type FunnelState, type NodeStatus } from '../types';

interface FunnelStore {
  nodes: FunnelNode[];
  edges: FunnelEdge[];
  viewport: Viewport;
  compactMode: boolean;
  currentFunnelId: string | null;
  funnelName: string;
  selectedNodeId: string | null;
  isConfigModalOpen: boolean;
  activeCategory: string | null;
  contextMenu: { x: number; y: number; nodeId: string } | null;
  isSimulationPanelOpen: boolean;
  isSidebarOpen: boolean;
  activeSidebarTab: string | null;
  
  setNodes: (nodes: FunnelNode[]) => void;
  setEdges: (edges: FunnelEdge[]) => void;
  setViewport: (viewport: Viewport) => void;
  setCompactMode: (compact: boolean) => void;
  setCurrentFunnelId: (id: string | null) => void;
  setFunnelName: (name: string) => void;
  setSelectedNodeId: (id: string | null) => void;
  setIsConfigModalOpen: (open: boolean) => void;
  setActiveCategory: (category: string | null) => void;
  setContextMenu: (menu: { x: number; y: number; nodeId: string } | null) => void;
  setIsSimulationPanelOpen: (open: boolean) => void;
  setIsSidebarOpen: (open: boolean) => void;
  setActiveSidebarTab: (tab: string | null) => void;
  
  onNodesChange: OnNodesChange<FunnelNode>;
  onEdgesChange: OnEdgesChange<FunnelEdge>;
  onConnect: OnConnect;
  
  addNode: (node: FunnelNode) => void;
  updateNodeData: (nodeId: string, data: Partial<any>) => void;
  deleteNode: (nodeId: string) => void;
  deleteEdge: (edgeId: string) => void;
  updateEdgeData: (edgeId: string, data: Partial<any>) => void;
  updateEdgeByVolume: (edgeId: string, targetVolume: number) => void;
  calculateProjections: () => void;
  loadTemplate: (nodes: FunnelNode[], edges: FunnelEdge[]) => void;
  undo: () => void;
  redo: () => void;
  unlinkNote: (nodeId: string) => void;
  onNodeDragStop: () => void;
}

const MAX_HISTORY = 50;

export const useFunnelStore = create<FunnelStore>((set, get) => {
  const saveToHistory = () => {
    const { nodes, edges, past } = get() as any;
    const currentState = JSON.stringify({ nodes, edges });
    
    // Only save if different from last state
    if (past.length > 0 && past[past.length - 1] === currentState) return;

    set({
      past: [...(past || []).slice(-MAX_HISTORY + 1), currentState],
      future: [],
    } as any);
  };

  return {
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    compactMode: false,
    currentFunnelId: null,
    funnelName: 'Meu Projeto',
    selectedNodeId: null,
    isConfigModalOpen: false,
    activeCategory: null,
    contextMenu: null,
    isSimulationPanelOpen: false,
    isSidebarOpen: false,
    activeSidebarTab: null,
    past: [],
    future: [],

    setNodes: (nodes) => set({ nodes }),
    setEdges: (edges) => set({ edges }),
    setViewport: (viewport) => set({ viewport }),
    setCompactMode: (compactMode) => {
      saveToHistory();
      set({ compactMode });
      set((state) => ({
        nodes: state.nodes.map((node) => ({
          ...node,
          data: { ...node.data, compactMode },
        })),
      }));
    },
    setCurrentFunnelId: (currentFunnelId) => set({ currentFunnelId }),
    setFunnelName: (funnelName) => set({ funnelName }),
    setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
    setIsConfigModalOpen: (isConfigModalOpen) => set({ isConfigModalOpen }),
    setActiveCategory: (activeCategory) => set({ activeCategory }),
    setContextMenu: (contextMenu) => set({ contextMenu }),
    setIsSimulationPanelOpen: (isSimulationPanelOpen) => set({ isSimulationPanelOpen }),
    setIsSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),
    setActiveSidebarTab: (activeSidebarTab) => set({ activeSidebarTab }),

    onNodesChange: (changes) => {
      // Save history if nodes are removed
      if (changes.some(c => c.type === 'remove')) {
        saveToHistory();
      }
      set({
        nodes: applyNodeChanges(changes, get().nodes),
      });
    },

    onEdgesChange: (changes) => {
      if (changes.some(c => c.type === 'remove')) {
        saveToHistory();
      }
      set({
        edges: applyEdgeChanges(changes, get().edges),
      });
    },

    onNodeDragStop: () => {
      saveToHistory();
    },

    onConnect: (connection: Connection) => {
      saveToHistory();
      set({
        edges: addEdge(
          { ...connection, type: 'conversion', data: { conversionRate: 0 } },
          get().edges
        ),
      });
      get().calculateProjections();
    },

    addNode: (node) => {
      saveToHistory();
      set({
        nodes: [...get().nodes, { ...node, data: { ...node.data, compactMode: get().compactMode } }],
      });
    },

    updateNodeData: (nodeId, data) => {
      saveToHistory();
      set({
        nodes: get().nodes.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
        ),
      });
      get().calculateProjections();
    },

    deleteNode: (nodeId) => {
      saveToHistory();
      set({
        nodes: get().nodes.filter((node) => node.id !== nodeId),
        edges: get().edges.filter(
          (edge) => edge.source !== nodeId && edge.target !== nodeId
        ),
      });
      get().calculateProjections();
    },

    deleteEdge: (edgeId) => {
      saveToHistory();
      set({
        edges: get().edges.filter((edge) => edge.id !== edgeId),
      });
      get().calculateProjections();
    },

    updateEdgeData: (edgeId, data) => {
      saveToHistory();
      set({
        edges: get().edges.map((edge) =>
          edge.id === edgeId ? { ...edge, data: { ...edge.data, ...data } } : edge
        ),
      });
      get().calculateProjections();
    },

    updateEdgeByVolume: (edgeId, targetVolume) => {
      const { edges, nodes } = get();
      const edge = edges.find(e => e.id === edgeId);
      if (!edge) return;

      const sourceNode = nodes.find(n => n.id === edge.source);
      if (!sourceNode || !sourceNode.data.volume) return;

      const newRate = (targetVolume / sourceNode.data.volume) * 100;
      get().updateEdgeData(edgeId, { conversionRate: Math.round(newRate * 100) / 100 });
    },

    unlinkNote: (nodeId) => {
      saveToHistory();
      set({
        edges: get().edges.filter(e => e.source !== nodeId && e.target !== nodeId)
      });
    },

    loadTemplate: (nodes, edges) => {
      saveToHistory();
      set({ 
        nodes, 
        edges, 
        viewport: { x: 0, y: 0, zoom: 1 },
        selectedNodeId: null,
        contextMenu: null
      });
      setTimeout(() => get().calculateProjections(), 100);
    },

    undo: () => {
      const { past, future, nodes, edges } = get() as any;
      if (past.length === 0) return;

      const previous = JSON.parse(past[past.length - 1]);
      const newPast = past.slice(0, past.length - 1);

      set({
        nodes: previous.nodes,
        edges: previous.edges,
        past: newPast,
        future: [JSON.stringify({ nodes, edges }), ...future],
      } as any);
    },

    redo: () => {
      const { past, future, nodes, edges } = get() as any;
      if (future.length === 0) return;

      const next = JSON.parse(future[0]);
      const newFuture = future.slice(1);

      set({
        nodes: next.nodes,
        edges: next.edges,
        past: [...past, JSON.stringify({ nodes, edges })],
        future: newFuture,
      } as any);
    },

    calculateProjections: () => {
      set((state) => {
        const { nodes, edges } = state;
        if (nodes.length === 0) return state;

        const nodeVolumes: Record<string, number> = {};
        const nodePrices: Record<string, number> = {};
        const nodeCosts: Record<string, number> = {};
        
        const isNoteNode = (node: any) => 
          node?.data?.isNote || 
          node?.data?.type === 'note' || 
          node?.data?.category === 'Nota';

        // 1. Identify "Real" edges (not involving notes)
        const realEdges = edges.filter(e => {
          const source = nodes.find(n => n.id === e.source);
          const target = nodes.find(n => n.id === e.target);
          return source && target && !isNoteNode(source) && !isNoteNode(target);
        });

        // 2. Identify nodes that have incoming "real" traffic
        const hasIncomingTraffic = new Set(realEdges.map(e => e.target));

        // 3. Initialize volumes, prices and costs
        nodes.forEach(node => {
          if (isNoteNode(node)) return;

          // If it's a source node (no incoming traffic), use its current volume
          if (!hasIncomingTraffic.has(node.id)) {
            nodeVolumes[node.id] = node.data.volume || 0;
            nodeCosts[node.id] = (node.data.volume || 0) * (node.data.cpc || 0);
          } else {
            // Target nodes start at 0 and accumulate from parents
            nodeVolumes[node.id] = 0;
            nodeCosts[node.id] = 0;
          }
          
          // Products always have their own price
          if (node.data.category === 'Produto' || node.data.type === 'product') {
            nodePrices[node.id] = node.data.price || 0;
          } else {
            nodePrices[node.id] = 0;
          }
        });

        // 4. Propagate Prices and Traffic iteratively
        let changed = true;
        let iterations = 0;
        const maxIterations = nodes.length * 2;

        while (changed && iterations < maxIterations) {
          changed = false;
          iterations++;

          nodes.forEach(node => {
            if (isNoteNode(node)) return;

            // Price Propagation (Forward)
            // If any parent has a price, it can flow to this node
            const incomingForPrice = edges.filter(e => e.target === node.id);
            let maxParentPrice = nodePrices[node.id] || 0;
            incomingForPrice.forEach(edge => {
              const sourceNode = nodes.find(n => n.id === edge.source);
              if (sourceNode && nodePrices[sourceNode.id] > maxParentPrice) {
                maxParentPrice = nodePrices[sourceNode.id];
              }
            });
            if (maxParentPrice > (nodePrices[node.id] || 0)) {
              nodePrices[node.id] = maxParentPrice;
              changed = true;
            }

            // Traffic Propagation
            if (hasIncomingTraffic.has(node.id)) {
              const incomingEdges = realEdges.filter(e => e.target === node.id);
              let newVolume = 0;
              let newCost = 0;

              incomingEdges.forEach(edge => {
                const sourceVolume = nodeVolumes[edge.source] || 0;
                const sourceCost = nodeCosts[edge.source] || 0;
                const rate = edge.data?.conversionRate || 0;
                
                const volumeToThisNode = (sourceVolume * rate) / 100;
                newVolume += volumeToThisNode;
                
                if (sourceVolume > 0) {
                  newCost += (sourceCost * (volumeToThisNode / sourceVolume));
                }
              });

              if (Math.abs((nodeVolumes[node.id] || 0) - newVolume) > 0.001) {
                nodeVolumes[node.id] = newVolume;
                nodeCosts[node.id] = newCost;
                changed = true;
              }
            }
          });
        }

        // 5. Update nodes with final calculated values
        const updatedNodes = nodes.map(node => {
          if (isNoteNode(node)) return node;

          const volume = Math.round((nodeVolumes[node.id] || 0) * 100) / 100;
          const price = (node.data.category === 'Produto' || node.data.type === 'product') 
            ? (node.data.price || 0) 
            : (nodePrices[node.id] || 0);
          
          const cost = nodeCosts[node.id] || 0;
          const revenue = volume * price * (1 + (node.data.recompra || 0) / 100);
          
          let roi = 0;
          if (cost > 0) {
            roi = ((revenue - cost) / cost) * 100;
          }

          return {
            ...node,
            data: {
              ...node.data,
              volume,
              price,
              revenue,
              cost,
              roi
            }
          };
        });

        return { nodes: updatedNodes };
      });
    },
};
});

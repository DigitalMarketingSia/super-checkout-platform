import { type Node, type Edge, type Viewport } from '@xyflow/react';

export type NodeStatus = 'ativo' | 'em_teste' | 'pausado';

export type ProductType = 'principal' | 'gratis' | 'upsell' | 'orderbump' | 'downsell';

export interface FunnelNodeData extends Record<string, unknown> {
  label: string;
  type: string;
  icon?: string;
  color: string;
  category: string;
  notes?: string;
  status: NodeStatus;
  compactMode?: boolean;
  url?: string;
  volume?: number;
  price?: number;
  productType?: ProductType;
  isNote?: boolean;
  // Simulation Metrics
  cpc?: number;
  ctr?: number;
  recompra?: number;
}

export interface FunnelEdgeData extends Record<string, unknown> {
  conversionRate: number;
  upsellRate?: number;
}

export type FunnelNode = Node<FunnelNodeData>;
export type FunnelEdge = Edge<FunnelEdgeData>;

export interface FunnelState {
  nodes: FunnelNode[];
  edges: FunnelEdge[];
  viewport: Viewport;
}

export interface Funnel {
  id: string;
  name: string;
  data: FunnelState;
  user_id: string;
  created_at: string;
  updated_at: string;
}

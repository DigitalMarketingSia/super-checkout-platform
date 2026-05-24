import { FunnelNode, FunnelEdge } from '../types';

export interface FunnelTemplate {
  id: string;
  name: string;
  description: string;
  nodes: FunnelNode[];
  edges: FunnelEdge[];
}

export const FUNNEL_TEMPLATES: FunnelTemplate[] = [
  {
    id: 'low-ticket',
    name: 'Infoproduto Low Ticket',
    description: 'Funil clássico para produtos de baixo ticket com foco em volume.',
    nodes: [
      { id: '1', type: 'funnelNode', position: { x: 100, y: 200 }, data: { label: 'Facebook Ads', type: 'facebook', category: 'Rede Social', volume: 1000, cpc: 0.5, color: 'bg-blue-600', status: 'ativo' } },
      { id: '2', type: 'funnelNode', position: { x: 400, y: 200 }, data: { label: 'Página de Vendas', type: 'landing', category: 'Página', color: 'bg-purple-600', status: 'ativo' } },
      { id: '3', type: 'funnelNode', position: { x: 700, y: 200 }, data: { label: 'Checkout', type: 'checkout', category: 'Página', color: 'bg-emerald-600', status: 'ativo' } },
      { id: '4', type: 'funnelNode', position: { x: 1000, y: 200 }, data: { label: 'Página de Obrigado', type: 'thankyou', category: 'Página', color: 'bg-blue-500', status: 'ativo' } },
      { id: '5', type: 'funnelNode', position: { x: 700, y: 400 }, data: { label: 'Ebook Low Ticket', type: 'product_main', category: 'Produto', price: 47, color: 'bg-purple-500', status: 'ativo' } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', type: 'conversion', data: { conversionRate: 100 } },
      { id: 'e2-3', source: '2', target: '3', type: 'conversion', data: { conversionRate: 10 } },
      { id: 'e3-4', source: '3', target: '4', type: 'conversion', data: { conversionRate: 30 } },
      { id: 'e5-3', source: '5', target: '3', type: 'conversion', data: { conversionRate: 0 } },
    ]
  },
  {
    id: 'high-ticket',
    name: 'Funil High Ticket',
    description: 'Focado em qualificação e fechamento via chamada de vendas.',
    nodes: [
      { id: '1', type: 'funnelNode', position: { x: 100, y: 200 }, data: { label: 'LinkedIn Ads', type: 'linkedin', category: 'Rede Social', volume: 500, cpc: 2.5, color: 'bg-blue-700', status: 'ativo' } },
      { id: '2', type: 'funnelNode', position: { x: 400, y: 200 }, data: { label: 'Landing Page VSL', type: 'vsl', category: 'Página', color: 'bg-red-600', status: 'ativo' } },
      { id: '3', type: 'funnelNode', position: { x: 700, y: 200 }, data: { label: 'Agendamento', type: 'sales_call', category: 'Página', color: 'bg-amber-600', status: 'ativo' } },
      { id: '4', type: 'funnelNode', position: { x: 1000, y: 200 }, data: { label: 'Mentoria High Ticket', type: 'product_main', category: 'Produto', price: 5000, color: 'bg-purple-500', status: 'ativo' } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', type: 'conversion', data: { conversionRate: 100 } },
      { id: 'e2-3', source: '2', target: '3', type: 'conversion', data: { conversionRate: 5 } },
      { id: 'e3-4', source: '3', target: '4', type: 'conversion', data: { conversionRate: 20 } },
    ]
  },
  {
    id: 'saas',
    name: 'Funil SaaS',
    description: 'Modelo de trial gratuito para conversão em assinatura.',
    nodes: [
      { id: '1', type: 'funnelNode', position: { x: 100, y: 200 }, data: { label: 'Google Ads', type: 'landing', category: 'Rede Social', volume: 2000, cpc: 1.2, color: 'bg-blue-500', status: 'ativo' } },
      { id: '2', type: 'funnelNode', position: { x: 400, y: 200 }, data: { label: 'Home Page', type: 'landing', category: 'Página', color: 'bg-indigo-600', status: 'ativo' } },
      { id: '3', type: 'funnelNode', position: { x: 700, y: 200 }, data: { label: 'Trial Grátis', type: 'trial', category: 'Página', color: 'bg-emerald-500', status: 'ativo' } },
      { id: '4', type: 'funnelNode', position: { x: 1000, y: 200 }, data: { label: 'Assinatura Mensal', type: 'subscription', category: 'Produto', price: 97, color: 'bg-purple-500', status: 'ativo' } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', type: 'conversion', data: { conversionRate: 100 } },
      { id: 'e2-3', source: '2', target: '3', type: 'conversion', data: { conversionRate: 15 } },
      { id: 'e3-4', source: '3', target: '4', type: 'conversion', data: { conversionRate: 10 } },
    ]
  },
  {
    id: 'lancamento',
    name: 'Lançamento',
    description: 'Estrutura completa de lançamento com CPLs e antecipação.',
    nodes: [
      { id: '1', type: 'funnelNode', position: { x: 100, y: 200 }, data: { label: 'Tráfego Pago', type: 'facebook', category: 'Rede Social', volume: 5000, cpc: 0.8, color: 'bg-blue-600', status: 'ativo' } },
      { id: '2', type: 'funnelNode', position: { x: 350, y: 200 }, data: { label: 'Captura (Opt-in)', type: 'landing', category: 'Página', color: 'bg-purple-600', status: 'ativo' } },
      { id: '3', type: 'funnelNode', position: { x: 600, y: 200 }, data: { label: 'CPL 1', type: 'vsl', category: 'Página', color: 'bg-red-500', status: 'ativo' } },
      { id: '4', type: 'funnelNode', position: { x: 850, y: 200 }, data: { label: 'CPL 2', type: 'vsl', category: 'Página', color: 'bg-red-500', status: 'ativo' } },
      { id: '5', type: 'funnelNode', position: { x: 1100, y: 200 }, data: { label: 'CPL 3', type: 'vsl', category: 'Página', color: 'bg-red-500', status: 'ativo' } },
      { id: '6', type: 'funnelNode', position: { x: 1350, y: 200 }, data: { label: 'Página de Vendas', type: 'landing', category: 'Página', color: 'bg-purple-700', status: 'ativo' } },
      { id: '7', type: 'funnelNode', position: { x: 1600, y: 200 }, data: { label: 'Checkout', type: 'checkout', category: 'Página', color: 'bg-emerald-600', status: 'ativo' } },
      { id: '8', type: 'funnelNode', position: { x: 1600, y: 400 }, data: { label: 'Curso Completo', type: 'product_main', category: 'Produto', price: 997, color: 'bg-purple-500', status: 'ativo' } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', type: 'conversion', data: { conversionRate: 100 } },
      { id: 'e2-3', source: '2', target: '3', type: 'conversion', data: { conversionRate: 70 } },
      { id: 'e3-4', source: '3', target: '4', type: 'conversion', data: { conversionRate: 80 } },
      { id: 'e4-5', source: '4', target: '5', type: 'conversion', data: { conversionRate: 80 } },
      { id: 'e5-6', source: '5', target: '6', type: 'conversion', data: { conversionRate: 90 } },
      { id: 'e6-7', source: '6', target: '7', type: 'conversion', data: { conversionRate: 5 } },
      { id: 'e8-7', source: '8', target: '7', type: 'conversion', data: { conversionRate: 0 } },
    ]
  },
  {
    id: 'perpetuo',
    name: 'Funil Perpétuo',
    description: 'Vendas automáticas rodando 24/7 com VSL direto.',
    nodes: [
      { id: '1', type: 'funnelNode', position: { x: 100, y: 200 }, data: { label: 'Instagram Ads', type: 'instagram', category: 'Rede Social', volume: 2000, cpc: 0.6, color: 'bg-pink-600', status: 'ativo' } },
      { id: '2', type: 'funnelNode', position: { x: 400, y: 200 }, data: { label: 'Página VSL', type: 'vsl', category: 'Página', color: 'bg-red-600', status: 'ativo' } },
      { id: '3', type: 'funnelNode', position: { x: 700, y: 200 }, data: { label: 'Checkout', type: 'checkout', category: 'Página', color: 'bg-emerald-600', status: 'ativo' } },
      { id: '4', type: 'funnelNode', position: { x: 1000, y: 200 }, data: { label: 'Obrigado', type: 'thankyou', category: 'Página', color: 'bg-blue-500', status: 'ativo' } },
      { id: '5', type: 'funnelNode', position: { x: 700, y: 400 }, data: { label: 'Produto Perpétuo', type: 'product_main', category: 'Produto', price: 197, color: 'bg-purple-500', status: 'ativo' } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', type: 'conversion', data: { conversionRate: 100 } },
      { id: 'e2-3', source: '2', target: '3', type: 'conversion', data: { conversionRate: 8 } },
      { id: 'e3-4', source: '3', target: '4', type: 'conversion', data: { conversionRate: 40 } },
      { id: 'e5-3', source: '5', target: '3', type: 'conversion', data: { conversionRate: 0 } },
    ]
  },
  {
    id: 'afiliados',
    name: 'Estrutura para Afiliados',
    description: 'Pre-sell para aquecimento antes da página do produtor.',
    nodes: [
      { id: '1', type: 'funnelNode', position: { x: 100, y: 200 }, data: { label: 'Tráfego Afiliado', type: 'facebook', category: 'Rede Social', volume: 1000, cpc: 0.7, color: 'bg-blue-600', status: 'ativo' } },
      { id: '2', type: 'funnelNode', position: { x: 400, y: 200 }, data: { label: 'Pre-sell (Quiz/Artigo)', type: 'landing', category: 'Página', color: 'bg-indigo-500', status: 'ativo' } },
      { id: '3', type: 'funnelNode', position: { x: 700, y: 200 }, data: { label: 'Página do Produtor', type: 'landing', category: 'Página', color: 'bg-purple-600', status: 'ativo' } },
      { id: '4', type: 'funnelNode', position: { x: 1000, y: 200 }, data: { label: 'Checkout Hotmart', type: 'checkout', category: 'Página', color: 'bg-orange-600', status: 'ativo' } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', type: 'conversion', data: { conversionRate: 100 } },
      { id: 'e2-3', source: '2', target: '3', type: 'conversion', data: { conversionRate: 30 } },
      { id: 'e3-4', source: '3', target: '4', type: 'conversion', data: { conversionRate: 5 } },
    ]
  },
  {
    id: 'bump-upsell',
    name: 'Order Bump + Upsell',
    description: 'Maximizar o LTV com ofertas complementares no fluxo.',
    nodes: [
      { id: '1', type: 'funnelNode', position: { x: 100, y: 200 }, data: { label: 'Anúncios', type: 'facebook', category: 'Rede Social', volume: 1500, cpc: 0.5, color: 'bg-blue-600', status: 'ativo' } },
      { id: '2', type: 'funnelNode', position: { x: 400, y: 200 }, data: { label: 'Página de Vendas', type: 'landing', category: 'Página', color: 'bg-purple-600', status: 'ativo' } },
      { id: '3', type: 'funnelNode', position: { x: 700, y: 200 }, data: { label: 'Checkout + Bump', type: 'checkout', category: 'Página', color: 'bg-emerald-600', status: 'ativo' } },
      { id: '4', type: 'funnelNode', position: { x: 1000, y: 200 }, data: { label: 'Upsell pós-compra', type: 'upsell', category: 'Página', color: 'bg-orange-500', status: 'ativo' } },
      { id: '5', type: 'funnelNode', position: { x: 1300, y: 200 }, data: { label: 'Obrigado', type: 'thankyou', category: 'Página', color: 'bg-blue-500', status: 'ativo' } },
      { id: '6', type: 'funnelNode', position: { x: 700, y: 400 }, data: { label: 'Produto Principal', type: 'product_main', category: 'Produto', price: 97, color: 'bg-purple-500', status: 'ativo' } },
      { id: '7', type: 'funnelNode', position: { x: 1000, y: 400 }, data: { label: 'Upsell Oferta', type: 'product_upsell', category: 'Produto', price: 197, color: 'bg-orange-500', status: 'ativo' } },
    ],
    edges: [
      { id: 'e1-2', source: '1', target: '2', type: 'conversion', data: { conversionRate: 100 } },
      { id: 'e2-3', source: '2', target: '3', type: 'conversion', data: { conversionRate: 12 } },
      { id: 'e3-4', source: '3', target: '4', type: 'conversion', data: { conversionRate: 100 } },
      { id: 'e4-5', source: '4', target: '5', type: 'conversion', data: { conversionRate: 20 } },
      { id: 'e6-3', source: '6', target: '3', type: 'conversion', data: { conversionRate: 0 } },
      { id: 'e7-4', source: '7', target: '4', type: 'conversion', data: { conversionRate: 0 } },
    ]
  },
];

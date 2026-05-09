import { type FunnelState } from '../types';
import { supabase } from '../../../../services/supabase';
import { toast } from 'sonner';

const DEFAULT_STATE: FunnelState = {
  nodes: [
    {
      id: 'start-1',
      type: 'funnelNode',
      position: { x: 100, y: 100 },
      data: {
        label: 'Instagram Ads',
        type: 'instagram',
        icon: 'https://cdn.simpleicons.org/instagram/E4405F',
        color: 'bg-pink-500/10 text-pink-500',
        category: 'Rede Social',
        notes: 'Campanha de tráfego pago para público frio',
        status: 'ativo',
      },
    },
    {
      id: 'page-1',
      type: 'funnelNode',
      position: { x: 500, y: 100 },
      data: {
        label: 'Landing Page',
        type: 'landing',
        icon: 'landing', 
        color: 'bg-blue-500/10 text-blue-500',
        category: 'Página',
        notes: 'Página de captura com oferta principal',
        status: 'ativo',
      },
    },
  ],
  edges: [
    {
      id: 'e1-2',
      source: 'start-1',
      target: 'page-1',
      type: 'conversion',
      data: { conversionRate: 15 },
    },
  ],
  viewport: { x: 0, y: 0, zoom: 0.7 },
};

export const loadFunnel = async (id?: string): Promise<{ state: FunnelState, name: string }> => {
  if (!id) return { state: DEFAULT_STATE, name: 'Meu Projeto' };

  try {
    const { data, error } = await supabase
      .from('funnels')
      .select('state, name')
      .eq('id', id)
      .single();

    if (error) throw error;

    if (data?.state?.nodes && data?.state?.nodes.length > 0) {
      return { state: data.state as FunnelState, name: data.name };
    }
  } catch (error) {
    console.error('Error parsing saved funnel:', error);
    toast.error('Erro ao carregar o funil salvo.');
  }
  
  return { state: DEFAULT_STATE, name: 'Meu Projeto' };
};

export const saveFunnel = async (id: string, state: FunnelState, name?: string, showToast: boolean = false) => {
  try {
    const updateData: any = { state, updated_at: new Date().toISOString() };
    if (name) updateData.name = name;

    const { error } = await supabase
      .from('funnels')
      .update(updateData)
      .eq('id', id);

    if (error) throw error;
    
    if (showToast) {
      toast.success('Projeto salvo com sucesso!');
    }
  } catch (error) {
    console.error('Erro ao salvar:', error);
    if (showToast) {
      toast.error('Erro ao salvar o projeto.');
    }
  }
};

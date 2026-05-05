import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const id = String(req.query.id || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ error: 'Invalid gateway id' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from('gateways')
    .select('id, name, provider, public_key, active, is_active, config')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[public-gateway] lookup failed:', error.message);
    return res.status(500).json({ error: 'Failed to load gateway' });
  }

  if (!data || (data.active === false && data.is_active === false)) {
    return res.status(404).json({ error: 'Gateway not found' });
  }

  return res.status(200).json({
    id: data.id,
    name: data.name || data.provider,
    provider: data.provider || data.name,
    public_key: data.public_key,
    active: data.active,
    is_active: data.is_active,
    config: data.config || {},
  });
}

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const CURRENT_SCHEMA_VERSION = '1.0.2';

function parseBody(req: VercelRequest) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

async function validateLocalUser(supabaseUrl: string, anonKey: string, jwt: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${jwt}`
    }
  });

  if (!response.ok) return null;
  const user = await response.json();
  return user?.id ? user : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : '';
  if (!jwt) return res.status(401).json({ error: 'Missing authorization' });

  const user = await validateLocalUser(supabaseUrl, anonKey, jwt);
  if (!user?.id) return res.status(401).json({ error: 'Invalid session' });

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !['admin', 'owner'].includes(profile?.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const { data: info, error: infoError } = await supabase
      .from('system_info')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (infoError) throw infoError;

    if (req.method === 'GET') {
      if (info) return res.status(200).json({ success: true, data: info });

      const created = await supabase
        .from('system_info')
        .insert({ db_version: CURRENT_SCHEMA_VERSION })
        .select('*')
        .single();

      if (created.error) throw created.error;
      return res.status(200).json({ success: true, data: created.data });
    }

    const body = parseBody(req);
    const githubInstallationId = String(body.github_installation_id || '').trim();
    const githubRepository = String(body.github_repository || '').trim();

    if (!/^\d+$/.test(githubInstallationId)) {
      return res.status(400).json({ error: 'GitHub Installation ID invalido.' });
    }

    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(githubRepository)) {
      return res.status(400).json({ error: 'Repository Name deve usar owner/repo.' });
    }

    const payload = {
      github_installation_id: githubInstallationId,
      github_repository: githubRepository,
      last_update_at: new Date().toISOString()
    };

    const result = info?.id
      ? await supabase.from('system_info').update(payload).eq('id', info.id).select('*').single()
      : await supabase.from('system_info').insert({ db_version: CURRENT_SCHEMA_VERSION, ...payload }).select('*').single();

    if (result.error) throw result.error;
    return res.status(200).json({ success: true, data: result.data });
  } catch (error: any) {
    console.error('[system-info] update failed:', error);
    return res.status(500).json({ error: error.message || 'Falha ao atualizar integracao.' });
  }
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enforceApiRateLimit } from '../_rate-limit.js';
import {
  getLocalSupabasePublicConfig,
  getLocalSupabaseServerKeyErrorMessage,
  isLocalSupabaseServerKeyFailure,
  resolveLocalSupabaseServerClient,
  validateLocalUserWithPublicKey,
} from '../_supabase-server.js';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const parsedBody = parseBody(req);
  const rateLimit = enforceApiRateLimit(req, res, {
    scope: 'admin_update_log',
    identifiers: [String(parsedBody.action || req.method || '')],
    limit: 60,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const { supabaseUrl, publicKey } = getLocalSupabasePublicConfig();
  if (!supabaseUrl || !publicKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : '';
  if (!jwt) return res.status(401).json({ error: 'Missing authorization' });

  const user = await validateLocalUserWithPublicKey(jwt);
  if (!user?.id) return res.status(401).json({ error: 'Invalid session' });

  const { supabase, probeError } = await resolveLocalSupabaseServerClient();
  if (!supabase) {
    return res.status(500).json({ error: getLocalSupabaseServerKeyErrorMessage() });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (isLocalSupabaseServerKeyFailure(profileError || probeError)) {
    return res.status(500).json({ error: getLocalSupabaseServerKeyErrorMessage() });
  }

  if (profileError || !['admin', 'owner', 'master_admin'].includes(profile?.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    if (req.method === 'GET') {
      const result = await supabase
        .from('system_updates_log')
        .select('*')
        .order('executed_at', { ascending: false })
        .limit(10);

      if (result.error) throw result.error;
      return res.status(200).json({ success: true, data: result.data || [] });
    }

    const body = parsedBody;
    const action = String(body.action || '').trim();
    const status = String(body.status || '').trim();
    const message = String(body.message || '').trim();

    if (!action || !status) {
      return res.status(400).json({ error: 'Missing update log action or status.' });
    }

    const safeFilesAffected = body.files_affected && typeof body.files_affected === 'object'
      ? body.files_affected
      : {};

    const result = await supabase
      .from('system_updates_log')
      .insert({
        action,
        status,
        message,
        files_affected: {
          ...safeFilesAffected,
          actor_user_id: user.id,
          actor_role: profile?.role || null
        }
      })
      .select('*')
      .single();

    if (result.error) throw result.error;
    return res.status(200).json({ success: true, data: result.data });
  } catch (error: any) {
    console.error('[update-log] insert failed:', error?.message || error);
    return res.status(500).json({ error: 'Falha ao registrar historico de atualizacao.' });
  }
}

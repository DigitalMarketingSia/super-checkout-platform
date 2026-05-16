import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enforceApiRateLimit } from '../_rate-limit.js';

function isSystemOwnerEmail(email?: string | null): boolean {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return false;

  return (process.env.MASTER_ADMIN_EMAILS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalized);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const rateLimit = enforceApiRateLimit(req, res, {
    scope: 'admin_security_events',
    identifiers: [String(req.query.limit || '')],
    limit: 30,
    windowMs: 15 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Security audit is not configured.' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Missing bearer token.' });

  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return res.status(401).json({ error: 'Invalid session.' });

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !['admin', 'owner', 'master_admin'].includes(profile?.role)) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  if (!isSystemOwnerEmail(userData.user.email)) {
    return res.status(403).json({ error: 'System owner access required.' });
  }

  const limit = Math.min(Number(req.query.limit || 100), 250);
  const { data, error } = await supabaseAdmin
    .from('security_events')
    .select('id,event_type,severity,ip_address,user_id,metadata,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[AdminSecurityEvents] Query failed:', error.message);
    return res.status(500).json({ error: 'Failed to load security events.' });
  }

  return res.status(200).json({ events: data || [] });
}

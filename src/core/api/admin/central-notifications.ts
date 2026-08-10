import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireApiAuth } from '../_authz.js';

const CENTRAL_URL = String(
  process.env.CENTRAL_SUPABASE_URL
  || process.env.VITE_CENTRAL_SUPABASE_URL
  || process.env.NEXT_PUBLIC_CENTRAL_SUPABASE_URL
  || 'https://bcmnryxjweiovrwmztpn.supabase.co',
).replace(/\/+$/, '');

const ADMIN_NOTIFICATION_CATEGORIES = ['security', 'license', 'account'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLUMNS = 'id,event_id,deduplication_key,recipient_user_id,category,title,message,priority,reference_type,reference_id,action_url,read_at,expires_at,created_at';

function getCentralSecret() {
  return String(
    process.env.CENTRAL_SUPABASE_SECRET_KEY
    || process.env.CENTRAL_SUPABASE_SECRET_KEY_NEW
    || process.env.CENTRAL_SUPABASE_SERVICE_ROLE_KEY
    || process.env.CENTRAL_SUPABASE_SERVICE_ROLE_KEY_NEW
    || '',
  ).trim();
}

function isExpired(value: unknown) {
  return Boolean(value && new Date(String(value)).getTime() <= Date.now());
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!['GET', 'POST'].includes(req.method || '')) return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireApiAuth(req, res, {
    source: 'central-notifications',
    allowedRoles: ['owner', 'admin', 'master_admin'],
  });
  if (!auth) return;

  const centralUserId = String(auth.profile.central_user_id || '').trim();
  if (!UUID_PATTERN.test(centralUserId)) return res.status(200).json({ notifications: [], unread_count: 0 });

  const centralSecret = getCentralSecret();
  if (!centralSecret) return res.status(503).json({ error: 'Central notification service is not configured.' });
  const central = createClient(CENTRAL_URL, centralSecret, { auth: { autoRefreshToken: false, persistSession: false } });
  const action = String(req.query.notification_action || (req.method === 'GET' ? 'list' : '')).trim().toLowerCase();

  try {
    if (action === 'list') {
      const { data, error } = await central
        .from('platform_notifications')
        .select(COLUMNS)
        .eq('recipient_user_id', centralUserId)
        .in('category', ADMIN_NOTIFICATION_CATEGORIES)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      const notifications = (data || []).filter((item: any) => !isExpired(item.expires_at));
      return res.status(200).json({ notifications, unread_count: notifications.filter((item: any) => !item.read_at).length });
    }

    if (action === 'mark_read') {
      const notificationId = String((req.body as any)?.notification_id || req.query.notification_id || '').trim();
      if (!UUID_PATTERN.test(notificationId)) return res.status(400).json({ error: 'Invalid notification id.' });
      const { data, error } = await central
        .from('platform_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('recipient_user_id', centralUserId)
        .in('category', ADMIN_NOTIFICATION_CATEGORIES)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      return res.status(200).json({ success: Boolean(data?.id) });
    }

    if (action === 'mark_all') {
      const { data, error } = await central
        .from('platform_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('recipient_user_id', centralUserId)
        .is('read_at', null)
        .in('category', ADMIN_NOTIFICATION_CATEGORIES)
        .select('id');
      if (error) throw error;
      return res.status(200).json({ success: true, updated: data?.length || 0 });
    }

    return res.status(400).json({ error: 'Invalid notification action.' });
  } catch (error: any) {
    console.error('[CentralNotifications] Request failed:', error?.message || error);
    return res.status(500).json({ error: 'Unable to load platform notifications.' });
  }
}

import { centralSupabase } from './centralClient';

export type PlatformNotificationCategory = 'commercial' | 'installation' | 'upgrade' | 'license' | 'security' | 'account';

export type PlatformNotification = {
  id: string;
  event_id: string;
  deduplication_key: string;
  recipient_user_id: string | null;
  recipient_email: string | null;
  recipient_role: string | null;
  scope_type: string | null;
  scope_id: string | null;
  category: PlatformNotificationCategory;
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  reference_type: string | null;
  reference_id: string | null;
  action_url: string | null;
  read_at: string | null;
  expires_at: string | null;
  created_at: string;
};

const notificationColumns = [
  'id',
  'event_id',
  'deduplication_key',
  'recipient_user_id',
  'recipient_email',
  'recipient_role',
  'scope_type',
  'scope_id',
  'category',
  'title',
  'message',
  'priority',
  'reference_type',
  'reference_id',
  'action_url',
  'read_at',
  'expires_at',
  'created_at',
].join(', ');

function isExpired(notification: PlatformNotification) {
  return Boolean(notification.expires_at && new Date(notification.expires_at).getTime() <= Date.now());
}

export async function listPlatformNotifications(userId: string, limit = 50) {
  const { data, error } = await centralSupabase
    .from('platform_notifications')
    .select(notificationColumns)
    .eq('recipient_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));

  if (error) throw error;
  return ((data || []) as unknown as PlatformNotification[]).filter((notification) => !isExpired(notification));
}

export async function markPlatformNotificationRead(notificationId: string) {
  const { data, error } = await centralSupabase.rpc('mark_platform_notification_read', {
    p_notification_id: notificationId,
  });
  if (error) throw error;
  return data === true;
}

export async function markAllPlatformNotificationsRead() {
  const { data, error } = await centralSupabase.rpc('mark_platform_notifications_read');
  if (error) throw error;
  return Number(data || 0);
}

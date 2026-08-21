import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Check, CheckCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { PlatformNotification } from '../../services/platformNotifications';

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

export const AdminNotificationInbox: React.FC<{ accessToken: string | null }> = ({ accessToken }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<PlatformNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const request = useCallback(async (action = 'list', body?: Record<string, unknown>) => {
    if (!accessToken) return null;
    const response = await fetch(`/api/admin?action=central-notifications&notification_action=${encodeURIComponent(action)}`, {
      method: action === 'list' ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || t('coverage.notifications.load_error'));
    return payload;
  }, [accessToken]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const payload = await request('list');
      setNotifications(Array.isArray(payload?.notifications) ? payload.notifications : []);
    } catch (error) {
      console.warn('[Admin] Unable to load Central notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [accessToken, request]);

  useEffect(() => { void load(); }, [load]);

  const unreadCount = useMemo(() => notifications.filter((item) => !item.read_at).length, [notifications]);

  const markRead = async (notification: PlatformNotification) => {
    if (notification.read_at) return;
    try {
      await request('mark_read', { notification_id: notification.id });
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item));
    } catch {
      toast.error(t('coverage.notifications.mark_read_error'));
    }
  };

  const markAll = async () => {
    if (!unreadCount) return;
    setBusy(true);
    try {
      await request('mark_all');
      setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
    } catch {
      toast.error(t('coverage.notifications.mark_all_error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((current) => !current)} title={t('coverage.notifications.technical_title')} className={`relative rounded-xl p-2.5 transition-all ${open ? 'bg-primary/10 text-primary' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-[#05050A] bg-primary px-1 text-[8px] font-black text-white">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-white/10 bg-[#0C0C12] shadow-2xl shadow-black/50">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white">{t('coverage.notifications.technical_alerts')}</p><p className="mt-1 text-[9px] text-gray-500">{t('coverage.notifications.technical_description')}</p></div><button type="button" onClick={() => void markAll()} disabled={!unreadCount || busy} className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-primary disabled:opacity-40">{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />} {t('coverage.notifications.mark_all')}</button></div>
          <div className="max-h-[min(60vh,420px)] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-10 text-xs text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin text-primary" /> {t('coverage.common.loading')}
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <Bell className="mx-auto h-6 w-6 text-gray-700" />
                <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-gray-500">{t('coverage.notifications.no_technical_alerts')}</p>
              </div>
            ) : notifications.map((notification) => (
              <div key={notification.id} className={`border-b border-white/5 px-4 py-3 ${notification.read_at ? 'opacity-70' : 'bg-primary/[0.04]'}`}>
                <div className="flex gap-2.5">
                  <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${notification.read_at ? 'bg-white/5 text-gray-500' : 'bg-primary/15 text-primary'}`}>
                    {notification.read_at ? <Check className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[11px] font-black text-white">{notification.title}</p>
                      <span className="shrink-0 text-[8px] text-gray-600">{formatDate(notification.created_at)}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-gray-400">{notification.message}</p>
                    {!notification.read_at && <button type="button" onClick={() => void markRead(notification)} className="mt-2 text-[9px] font-black uppercase tracking-widest text-gray-500 hover:text-white">{t('coverage.notifications.mark_read')}</button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Check, CheckCheck, ExternalLink, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  listPlatformNotifications,
  markAllPlatformNotificationsRead,
  markPlatformNotificationRead,
  type PlatformNotification,
} from '../../../services/platformNotifications';
import { centralSupabase } from '../../../services/centralClient';

type NotificationFilter = 'all' | 'unread' | 'installation' | 'upgrade' | 'commercial';

function formatNotificationDate(value: string) {
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

function isSafePortalAction(actionUrl: string | null) {
  if (!actionUrl) return false;
  try {
    const target = new URL(actionUrl, window.location.origin);
    return target.origin === window.location.origin || target.origin === 'https://portal.supercheckout.app';
  } catch {
    return false;
  }
}

export const PlatformNotificationInbox: React.FC<{ userId: string }> = ({ userId }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [notifications, setNotifications] = useState<PlatformNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      setNotifications(await listPlatformNotifications(userId));
    } catch (error) {
      console.warn('[Portal] Unable to load Central notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadNotifications();
    const channel = centralSupabase
      .channel(`platform-notifications:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'platform_notifications',
        filter: `recipient_user_id=eq.${userId}`,
      }, () => void loadNotifications())
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [loadNotifications, userId]);

  const unreadCount = useMemo(() => notifications.filter((notification) => !notification.read_at).length, [notifications]);
  const visibleNotifications = useMemo(() => notifications.filter((notification) => {
    if (filter === 'unread') return !notification.read_at;
    if (filter === 'installation' || filter === 'upgrade' || filter === 'commercial') return notification.category === filter;
    return true;
  }), [filter, notifications]);

  const handleRead = async (notification: PlatformNotification) => {
    if (notification.read_at) return;
    setBusyId(notification.id);
    try {
      await markPlatformNotificationRead(notification.id);
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item));
    } catch {
      toast.error('Não foi possível marcar a notificação como lida.');
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkAll = async () => {
    if (!unreadCount) return;
    setBusyId('all');
    try {
      await markAllPlatformNotificationsRead();
      setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
    } catch {
      toast.error('Não foi possível atualizar as notificações.');
    } finally {
      setBusyId(null);
    }
  };

  const handleOpenNotification = async (notification: PlatformNotification) => {
    await handleRead(notification);
    if (!isSafePortalAction(notification.action_url)) return;
    const target = new URL(notification.action_url as string, window.location.origin);
    navigate(`${target.pathname}${target.search}${target.hash}`);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        title="Notificações"
        className={`relative rounded-2xl border p-3 transition-all ${open ? 'border-primary/20 bg-primary/10 text-primary' : 'border-white/5 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'}`}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#05050A] bg-primary px-1 text-[9px] font-black text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-14 z-50 w-[min(92vw,420px)] overflow-hidden rounded-3xl border border-white/10 bg-[#0C0C12] shadow-2xl shadow-black/50">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white">Central de notificações</p>
              <p className="mt-1 text-[10px] text-gray-500">{unreadCount ? `${unreadCount} não lida${unreadCount === 1 ? '' : 's'}` : 'Tudo em dia'}</p>
            </div>
            <button type="button" onClick={() => void handleMarkAll()} disabled={!unreadCount || busyId === 'all'} className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-primary disabled:opacity-40">
              {busyId === 'all' ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />} Marcar todas
            </button>
          </div>

          <div className="flex gap-1 overflow-x-auto border-b border-white/5 px-4 py-3">
            {([
              ['all', 'Todas'],
              ['unread', 'Não lidas'],
              ['installation', 'Instalação'],
              ['upgrade', 'Upgrade'],
              ['commercial', 'Comercial'],
            ] as Array<[NotificationFilter, string]>).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setFilter(value)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition ${filter === value ? 'bg-primary/15 text-primary' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}>
                {label}
              </button>
            ))}
          </div>

          <div className="max-h-[min(65vh,520px)] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-5 py-12 text-xs text-gray-500"><Loader2 className="h-4 w-4 animate-spin text-primary" /> Carregando...</div>
            ) : visibleNotifications.length === 0 ? (
              <div className="px-6 py-12 text-center"><Bell className="mx-auto h-7 w-7 text-gray-700" /><p className="mt-3 text-xs font-black uppercase tracking-widest text-gray-500">Nenhuma notificação</p></div>
            ) : (
              visibleNotifications.map((notification) => (
                <div key={notification.id} className={`border-b border-white/5 px-5 py-4 transition hover:bg-white/[0.03] ${notification.read_at ? 'opacity-70' : 'bg-primary/[0.04]'}`}>
                  <div className="flex gap-3">
                    <div className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${notification.read_at ? 'bg-white/5 text-gray-500' : 'bg-primary/15 text-primary'}`}>
                      {notification.read_at ? <Check className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3"><p className="text-xs font-black text-white">{notification.title}</p><span className="shrink-0 text-[9px] text-gray-600">{formatNotificationDate(notification.created_at)}</span></div>
                      <p className="mt-1 text-xs leading-relaxed text-gray-400">{notification.message}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {!notification.read_at && <button type="button" onClick={() => void handleRead(notification)} disabled={busyId === notification.id} className="text-[9px] font-black uppercase tracking-widest text-gray-500 hover:text-white">Marcar lida</button>}
                        {isSafePortalAction(notification.action_url) && <button type="button" onClick={() => void handleOpenNotification(notification)} className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-primary hover:text-primary/80"><ExternalLink className="h-3 w-3" /> Abrir</button>}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};


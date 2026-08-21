import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  ShoppingBag,
  ShieldAlert,
  Sparkles,
  UserRound,
  Wrench,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
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

function getSafeNotificationTarget(notification: PlatformNotification) {
  const isInstallationNotification = notification.category === 'installation' || notification.reference_type === 'service_order';
  const rawActionUrl = notification.action_url || (isInstallationNotification && notification.reference_id ? '/activate/setup?tab=services' : null);
  if (!rawActionUrl) return null;
  try {
    const target = new URL(rawActionUrl, window.location.origin);
    const isSafeOrigin = target.origin === window.location.origin || target.origin === 'https://portal.supercheckout.app';
    if (!isSafeOrigin) return null;

    if (isInstallationNotification && ['/activate', '/activate/'].includes(target.pathname)) {
      target.pathname = '/activate/setup';
      target.searchParams.set('tab', 'services');
    }
    if (isInstallationNotification && notification.reference_id) {
      target.searchParams.set('order_id', notification.reference_id);
    }
    return target;
  } catch {
    return null;
  }
}

function getNotificationPresentation(notification: PlatformNotification, t: (key: string) => string) {
  if (notification.category === 'installation') return { label: t('coverage.notifications.installation'), icon: Wrench, tone: 'text-amber-300 bg-amber-400/10 border-amber-300/20' };
  if (notification.category === 'upgrade') return { label: t('coverage.notifications.upgrade'), icon: Sparkles, tone: 'text-[#C77DFF] bg-[#8A2BE2]/10 border-[#8A2BE2]/20' };
  if (notification.category === 'commercial') return { label: t('coverage.notifications.commercial'), icon: ShoppingBag, tone: 'text-emerald-300 bg-emerald-400/10 border-emerald-300/20' };
  if (notification.category === 'security' || notification.category === 'license') return { label: t('coverage.notifications.security'), icon: ShieldAlert, tone: 'text-red-300 bg-red-400/10 border-red-300/20' };
  if (notification.category === 'account') return { label: t('coverage.notifications.account'), icon: UserRound, tone: 'text-sky-300 bg-sky-400/10 border-sky-300/20' };
  return { label: t('coverage.notifications.update'), icon: Bell, tone: 'text-gray-300 bg-white/5 border-white/10' };
}

function getNotificationSummary(notification: PlatformNotification) {
  const title = String(notification.title || '').trim();
  const message = String(notification.message || '').trim();
  if (title.length > 0 && title.length <= 96) return title;

  const firstSentence = message.split(/[.!?]\s+/)[0]?.trim() || message || title;
  if (firstSentence.length <= 120) return firstSentence;
  return `${firstSentence.slice(0, 117).trimEnd()}...`;
}

export const PlatformNotificationInbox: React.FC<{ userId: string }> = ({ userId }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
      toast.error(t('coverage.notifications.mark_read_error'));
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
      toast.error(t('coverage.notifications.mark_all_error'));
    } finally {
      setBusyId(null);
    }
  };

  const handleOpenNotification = async (notification: PlatformNotification) => {
    await handleRead(notification);
    const target = getSafeNotificationTarget(notification);
    if (!target) {
      toast.error(t('coverage.notifications.no_target'));
      return;
    }
    navigate(`${target.pathname}${target.search}${target.hash}`);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        title={t('coverage.notifications.title')}
        className={`relative z-[51] rounded-2xl border p-3 transition-all ${open ? 'border-primary/30 bg-[#111116] text-primary' : 'border-white/5 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'}`}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#05050A] bg-primary px-1 text-[9px] font-black text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <>
          <button
            type="button"
            aria-label={t('coverage.notifications.close_panel')}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[100] cursor-default bg-[#05050A]/80 backdrop-blur-[3px]"
          />
          <div role="dialog" aria-label={t('coverage.notifications.title')} className="fixed left-1/2 top-[4.75rem] z-[101] w-[min(94vw,460px)] max-w-[calc(100vw-1.5rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-white/15 bg-[#0B0B12] shadow-2xl shadow-black/70 sm:top-[5.5rem]">
            <div className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white">{t('coverage.notifications.title')}</p>
                <p className="mt-1 text-[9px] font-medium uppercase tracking-wider text-gray-600">{unreadCount ? t('coverage.notifications.unread_count', { count: unreadCount }) : t('coverage.notifications.all_read')}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={() => void handleMarkAll()} disabled={!unreadCount || busyId === 'all'} className="inline-flex items-center gap-1 rounded-lg border border-transparent px-1.5 py-1 text-[8px] font-black uppercase tracking-widest text-primary transition hover:border-primary/20 hover:bg-primary/10 disabled:opacity-40">
                  {busyId === 'all' ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />} {t('coverage.notifications.read_all')}
                </button>
                <button type="button" onClick={() => setOpen(false)} aria-label={t('coverage.notifications.close')} className="rounded-lg border border-white/5 bg-[#111116] p-1.5 text-gray-500 transition hover:bg-[#15151e] hover:text-white"><X className="h-3.5 w-3.5" /></button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1 border-b border-white/5 px-4 py-2.5">
              {([
                ['all', t('coverage.notifications.all')],
                ['unread', t('coverage.notifications.unread')],
                ['installation', t('coverage.notifications.installation')],
                ['upgrade', t('coverage.notifications.upgrade')],
                ['commercial', t('coverage.notifications.commercial')],
              ] as Array<[NotificationFilter, string]>).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-lg px-2.5 py-1.5 text-[8px] font-black uppercase tracking-wider transition ${filter === value ? 'border border-primary/25 bg-primary/10 text-primary' : 'border border-transparent text-gray-600 hover:border-white/5 hover:bg-white/5 hover:text-gray-300'}`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="max-h-[min(60vh,380px)] overflow-x-hidden overflow-y-auto px-4 py-3">
              {loading ? (
                <div className="flex items-center justify-center gap-2 px-5 py-12 text-xs text-gray-500"><Loader2 className="h-4 w-4 animate-spin text-primary" /> {t('coverage.common.loading')}</div>
              ) : visibleNotifications.length === 0 ? (
                <div className="px-6 py-12 text-center"><Bell className="mx-auto h-7 w-7 text-gray-700" /><p className="mt-3 text-xs font-black uppercase tracking-widest text-gray-500">{t('coverage.notifications.empty')}</p></div>
              ) : (
                <div className="space-y-2">
                  {visibleNotifications.map((notification) => {
                    const presentation = getNotificationPresentation(notification, t);
                    const Icon = presentation.icon;
                    const target = getSafeNotificationTarget(notification);
                    const isInstallationNotification = notification.category === 'installation' || notification.reference_type === 'service_order';
                    const priorityLabel = notification.priority === 'critical' ? 'Urgente' : notification.priority === 'high' ? 'Importante' : null;
                    const isExpanded = expandedId === notification.id;
                    const summary = getNotificationSummary(notification);

                    return (
                      <article key={notification.id} className={`min-w-0 overflow-hidden rounded-xl border border-l-2 transition ${notification.read_at ? 'border-white/5 border-l-white/10 bg-[#0F0F15] hover:border-white/15 hover:bg-[#14141B]' : 'border-primary/35 border-l-primary bg-[#171520] shadow-[0_4px_18px_rgba(0,0,0,0.18)] hover:border-primary/50 hover:bg-[#1B1925]'} ${notification.priority === 'critical' ? 'border-red-400/40 border-l-red-400' : ''}`}>
                        <div className="flex min-w-0 items-center gap-3 px-3.5 py-3">
                          <div className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${presentation.tone} ${notification.read_at ? 'opacity-60' : ''}`}>
                            <Icon className="h-3.5 w-3.5" />
                            {!notification.read_at && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full border-2 border-[#111116] bg-primary" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                              <p className={`min-w-0 flex-1 truncate text-[11px] font-black leading-tight ${notification.read_at ? 'text-gray-300' : 'text-white'}`}>{summary}</p>
                              <time className="shrink-0 text-[8px] font-medium text-gray-600">{formatNotificationDate(notification.created_at)}</time>
                            </div>
                            <p className="mt-1 truncate text-[9px] font-black uppercase tracking-[0.12em] text-gray-600">{presentation.label}{!notification.read_at ? ` · ${t('coverage.notifications.new')}` : ''}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setExpandedId((current) => current === notification.id ? null : notification.id)}
                            aria-expanded={isExpanded}
                            aria-controls={`notification-details-${notification.id}`}
                            aria-label={isExpanded ? t('coverage.notifications.collapse') : t('coverage.notifications.expand')}
                            className="shrink-0 rounded-lg border border-white/10 bg-white/[0.03] p-1.5 text-gray-500 transition hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                          >
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                        </div>

                        {isExpanded && (
                          <div id={`notification-details-${notification.id}`} className="border-t border-white/5 px-3.5 pb-3.5 pt-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`rounded-md border px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wider ${presentation.tone}`}>{presentation.label}</span>
                              {notification.read_at && <span className="rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wider text-gray-500">{t('coverage.notifications.read')}</span>}
                              {priorityLabel && <span className="rounded-md border border-amber-300/15 bg-amber-300/5 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wider text-amber-300">{notification.priority === 'critical' ? t('coverage.notifications.urgent') : t('coverage.notifications.important')}</span>}
                            </div>
                            <p className="mt-2 text-[11px] font-black leading-tight text-white">{notification.title}</p>
                            <p className="mt-2 break-words text-[10px] leading-relaxed text-[#E1E7F0]">{notification.message}</p>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-2.5">
                              <div className="flex items-center gap-3">
                                {!notification.read_at && <button type="button" onClick={() => void handleRead(notification)} disabled={busyId === notification.id} className="text-[8px] font-black uppercase tracking-wider text-gray-600 transition hover:text-white disabled:opacity-40">{t('coverage.notifications.mark_read')}</button>}
                                {notification.read_at && <span className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-gray-600"><Check className="h-3 w-3" /> {t('coverage.notifications.read')}</span>}
                              </div>
                              {target && <button type="button" onClick={() => void handleOpenNotification(notification)} className="inline-flex items-center gap-1 rounded-lg border border-primary/25 bg-primary/10 px-2 py-1.5 text-[8px] font-black uppercase tracking-wider text-primary transition hover:bg-primary/20"><ExternalLink className="h-3 w-3" /> {isInstallationNotification ? t('coverage.notifications.open_request') : t('coverage.notifications.open')}</button>}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
};

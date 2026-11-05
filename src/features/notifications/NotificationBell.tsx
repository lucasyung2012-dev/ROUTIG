import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, BellOff, Check } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { IconButton } from '@/ui/IconButton';
import { cn } from '@/ui/cn';
import { useNotifications } from './NotificationsProvider';

/** Central de avisos no topo: o que vale agora, com um toque para abrir ou dispensar. */
export function NotificationBell() {
  const { t, settings } = useSettings();
  const n = useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  const muted = !!n.config.muteUntil && new Date(n.config.muteUntil) > new Date();
  const count = n.unread.length;
  return (
    <div ref={box} className="relative">
      <IconButton label={count ? t('notif.bellCount', { count }) : t('notif.bell')} icon={muted ? <BellOff className="h-[18px] w-[18px]" /> : <Bell className="h-[18px] w-[18px]" />} onClick={() => setOpen((o) => !o)} aria-expanded={open} />
      {count > 0 && <span className="pointer-events-none absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.625rem] font-bold text-white">{count > 9 ? '9+' : count}</span>}
      {open && (
        <div className="absolute right-0 top-12 z-40 flex max-h-[70vh] w-80 max-w-[calc(100vw-2rem)] animate-scale-in flex-col overflow-hidden rounded-2xl bg-surface shadow-lift ring-1 ring-line">
          <div className="flex items-center gap-2 border-b border-line/70 px-4 py-3">
            <h2 className="min-w-0 flex-1 text-sm font-semibold text-fg">{t('notif.title')}</h2>
            {count > 0 && (
              <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={n.dismissAll}>
                {t('notif.dismissAll')}
              </button>
            )}
          </div>
          {muted && <p className="border-b border-line/70 px-4 py-2 text-xs text-muted">{t('notif.mutedUntil', { time: new Intl.DateTimeFormat(settings.locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(n.config.muteUntil!)) })}</p>}
          <ul className="min-h-0 flex-1 overflow-y-auto p-1.5" data-private="notifications">
            {n.active.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted">{t('notif.empty')}</li>
            ) : (
              n.active.map((a) => {
                const { title, body } = n.textOf(a);
                const read = !n.unread.includes(a);
                return (
                  <li key={a.key} className="flex items-start gap-2 rounded-xl px-2 py-2 hover:bg-surface-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        n.dismiss(a.key);
                        setOpen(false);
                        navigate(a.path);
                      }}
                    >
                      <span className={cn('block text-sm', read ? 'text-muted' : 'font-semibold text-fg')}>{title}</span>
                      <span className="block text-sm text-muted">{body}</span>
                    </button>
                    {!read && <IconButton label={t('notif.dismiss')} icon={<Check className="h-4 w-4" />} onClick={() => n.dismiss(a.key)} />}
                  </li>
                );
              })
            )}
          </ul>
          <Link to="/settings/notifications" onClick={() => setOpen(false)} className="border-t border-line/70 px-4 py-2.5 text-center text-xs font-medium text-accent hover:underline">
            {t('notif.settings')}
          </Link>
        </div>
      )}
    </div>
  );
}

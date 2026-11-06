import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { archive, captureText, InboxRuleError, reopen } from '@/data/inboxRepo';
import { suggest, type InboxItem } from '@/domain/inbox';
import { normalizeSearch } from '@/domain/tasks';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Input, Textarea } from '@/ui/Field';
import { DEST_COLORS, DESTINATIONS, type InboxSector, type ReceptionData } from '../interiors/inbox';

/** Painéis dos setores da Central de Recepção: leem e gravam os itens reais do Inbox. */
export function InboxPanel({ id, items, data, today, onError, onDone }: { id: InboxSector; items: InboxItem[]; data: ReceptionData | null; today: string; onError: (m: string) => void; onDone: (m: string) => void }) {
  const { t, settings } = useSettings();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const open = items.filter((i) => i.status === 'open' && (!i.snoozedUntil || i.snoozedUntil <= today));
  const title = (i: InboxItem) => i.text || i.fileName || t('park.inbox.untitled');

  if (id === 'atrium')
    return (
      <div className="flex flex-col gap-3">
        <Textarea aria-label={t('inbox.capturePlaceholder')} placeholder={t('inbox.capturePlaceholder')} value={text} maxLength={20000} rows={3} onChange={(e) => setText(e.target.value)} />
        <Button
          variant="primary"
          disabled={!text.trim()}
          onClick={() =>
            void captureText(text).then(
              () => {
                setText('');
                onDone(t('inbox.captured'));
              },
              (e) => onError(e instanceof InboxRuleError && e.code === 'empty' ? t('park.inbox.emptyCapture') : t('errors.title')),
            )
          }
        >
          {t('inbox.capture')}
        </Button>
        <h3 className="mt-2 text-xs font-semibold uppercase tracking-wide text-subtle">{t('park.inbox.recent')}</h3>
        <ItemList items={items.slice(0, 5)} empty={t('inbox.empty.open')} title={title} />
      </div>
    );

  if (id === 'triage')
    return (
      <div className="flex flex-col gap-2">
        {data && data.snoozed > 0 && <p className="text-xs text-muted">{t('park.inbox.snoozedCount', { count: data.snoozed })}</p>}
        {open.length === 0 ? (
          <p className="text-sm text-muted">{t('inbox.empty.open')}</p>
        ) : (
          open.slice(0, 20).map((i) => {
            const s = suggest(i);
            return (
              <div key={i.id} className="rounded-xl bg-surface-2 p-3 ring-1 ring-inset ring-line/60">
                <div className="line-clamp-2 text-sm text-fg">{title(i)}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">{t('inbox.suggestion')}:</span>
                  <Badge tone="accent">{t(`inbox.types.${s.type}`)}</Badge>
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void archive(i.id).then(() => onDone(t('inbox.archived')), () => onError(t('errors.title')))}>
                    {t('inbox.archive')}
                  </Button>
                </div>
              </div>
            );
          })
        )}
        <Link to="/inbox" className="mt-1 inline-flex h-10 items-center justify-center rounded-xl text-sm font-medium text-accent ring-1 ring-inset ring-line hover:bg-surface-2">
          {t('park.inbox.openInbox')}
        </Link>
      </div>
    );

  if (id === 'distribution') {
    const total = data ? DESTINATIONS.reduce((n, d) => n + data.byType[d], 0) : 0;
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">{t('park.inbox.destTotal', { count: total })}</p>
        <ul className="flex flex-col gap-2">
          {DESTINATIONS.map((d) => {
            const n = data?.byType[d] ?? 0;
            return (
              <li key={d} className="flex items-center gap-3">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: DEST_COLORS[d] }} aria-hidden />
                <span className="w-24 shrink-0 text-sm text-fg">{d === 'library' ? t('modules.library') : t(`inbox.types.${d}`)}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <span className="block h-full rounded-full" style={{ width: `${total ? (n / total) * 100 : 0}%`, background: DEST_COLORS[d] }} />
                </span>
                <span className="w-8 text-right text-sm tabular-nums text-fg">{n}</span>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-subtle">{t('park.inbox.tubesHint')}</p>
      </div>
    );
  }

  if (id === 'archive') {
    const archived = items.filter((i) => i.status === 'archived');
    return archived.length === 0 ? (
      <p className="text-sm text-muted">{t('inbox.empty.archived')}</p>
    ) : (
      <ul className="flex flex-col gap-2">
        {archived.slice(0, 30).map((i) => (
          <li key={i.id} className="flex items-center gap-2 rounded-xl bg-surface-2 p-3 ring-1 ring-inset ring-line/60">
            <span className="line-clamp-2 min-w-0 flex-1 text-sm text-fg">{title(i)}</span>
            <Button size="sm" variant="ghost" onClick={() => void reopen(i.id).then(() => onDone(t('park.inbox.reopened')), () => onError(t('errors.title')))}>
              {t('inbox.reopen')}
            </Button>
          </li>
        ))}
      </ul>
    );
  }

  // Galeria: busca em tudo o que passou pelo Inbox.
  const nq = normalizeSearch(q);
  const found = nq ? items.filter((i) => normalizeSearch(`${i.text} ${i.fileName ?? ''} ${i.url ?? ''}`).includes(nq)) : [];
  const fmt = new Intl.DateTimeFormat(settings.locale, { dateStyle: 'medium' });
  return (
    <div className="flex flex-col gap-3">
      <label className="relative block">
        <span className="sr-only">{t('park.inbox.searchLabel')}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
        <Input className="pl-9" placeholder={t('park.inbox.searchLabel')} value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {nq && found.length === 0 && <p className="text-sm text-muted">{t('park.inbox.noneFound')}</p>}
      <ul className="flex flex-col gap-2">
        {found.slice(0, 30).map((i) => (
          <li key={i.id} className="rounded-xl bg-surface-2 p-3 ring-1 ring-inset ring-line/60">
            <div className="line-clamp-2 text-sm text-fg">{title(i)}</div>
            <div className="mt-1 text-xs text-subtle">
              {t(`inbox.tabs.${i.status === 'open' ? 'open' : i.status}`)} · {fmt.format(new Date(i.createdAt))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemList({ items, empty, title }: { items: InboxItem[]; empty: string; title: (i: InboxItem) => string }) {
  if (items.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((i) => (
        <li key={i.id} className="line-clamp-1 rounded-lg bg-surface-2 px-3 py-2 text-sm text-fg">
          {title(i)}
        </li>
      ))}
    </ul>
  );
}

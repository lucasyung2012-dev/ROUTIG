import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, CloudRain, Home, LogIn, LogOut, Search, X } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { archive, captureText, InboxRuleError, reopen } from '@/data/inboxRepo';
import { suggest, type InboxItem } from '@/domain/inbox';
import { todayKey } from '@/domain/dates';
import { normalizeSearch } from '@/domain/tasks';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { Input, Textarea } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { useToast } from '@/ui/toast';
import type { ParkQuality, ParkStats } from './parkScene';
import { createReception, type ReceptionController, type ReceptionMode } from './receptionScene';
import { DEST_COLORS, DESTINATIONS, SECTORS, type ReceptionData, type SectorId } from './receptionInterior';
import type { TimeOfDay } from './receptionExterior';
import { receptionData } from './receptionData';

function autoQuality(): ParkQuality {
  return window.matchMedia?.('(pointer: coarse)').matches ? 'medium' : 'high';
}

function timeNow(): TimeOfDay {
  const h = new Date().getHours();
  return h >= 6 && h < 17 ? 'day' : h >= 17 && h < 19 ? 'dusk' : 'night';
}

/**
 * Fatia vertical da V2 (Etapa 0): praça central, fonte ROUTIG e Central de Recepção por fora
 * e por dentro, no nível de detalhe final, com os setores lendo e gravando os dados reais do Inbox.
 * Página de teste em #/lab/recepcao, fora do menu.
 */
export default function ReceptionLab() {
  const { t, settings } = useSettings();
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const ctl = useRef<ReceptionController | null>(null);
  const [quality, setQuality] = useState<ParkQuality>(autoQuality);
  const [time, setTime] = useState<TimeOfDay>(timeNow);
  const [rain, setRain] = useState(false);
  const [stats, setStats] = useState<ParkStats | null>(null);
  const [picked, setPicked] = useState(false);
  const [mode, setMode] = useState<ReceptionMode>('outside');
  const [sector, setSector] = useState<SectorId | null>(null);
  const [failed, setFailed] = useState(false);

  const items = useLiveQuery(() => getDb().inbox.orderBy('createdAt').reverse().toArray(), []);
  const today = todayKey();
  const live = useMemo(() => (items ?? []).filter((i) => !i.deletedAt), [items]);
  const data = useMemo<ReceptionData | null>(() => (items ? receptionData(items, today) : null), [items, today]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      ctl.current = createReception(canvas, {
        quality,
        reduceMotion: settings.reduceMotion,
        labels: {
          sectors: Object.fromEntries(SECTORS.map((s) => [s, t(`lab.reception.sectors.${s}`)])) as Record<SectorId, string>,
          title: t('lab.reception.holoTitle'),
          open: t('lab.reception.holoOpen'),
          processed: t('lab.reception.holoProcessed'),
          archived: t('lab.reception.holoArchived'),
          today: t('lab.reception.holoToday'),
          emptyFrame: t('lab.reception.emptyFrame'),
        },
        onStats: setStats,
        onPick: (w) => setPicked(w === 'inbox'),
        onSector: setSector,
        onMode: setMode,
      });
      ctl.current.setTime(time);
    } catch {
      setFailed(true);
    }
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = labelRef.current;
      if (!el || !ctl.current) return;
      const p = ctl.current.projectTop();
      el.style.transform = `translate(-50%, -100%) translate(${p.x}px, ${p.y}px)`;
      el.style.opacity = p.visible ? '1' : '0';
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ctl.current?.dispose();
      ctl.current = null;
    };
    // A cena nasce uma vez; o resto muda pelo controlador.
  }, []);

  useEffect(() => ctl.current?.setQuality(quality), [quality]);
  useEffect(() => ctl.current?.setTime(time), [time]);
  useEffect(() => ctl.current?.setRain(rain), [rain]);
  useEffect(() => {
    if (data) ctl.current?.setData(data);
  }, [data]);

  const chooseSector = (id: SectorId) => {
    setSector(id);
    ctl.current?.focusSector(id);
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0B1026] text-fg" style={{ touchAction: 'none' }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label={t('lab.reception.canvas')} />
      <span ref={labelRef} aria-hidden className="pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white opacity-0 transition-opacity">
        {t('lab.reception.building')}
      </span>

      {failed && (
        <div role="alert" className="absolute inset-0 flex items-center justify-center p-6 text-center text-white">
          {t('lab.park.noWebgl')}
        </div>
      )}

      {/* Barra de cima e, dentro do prédio, os setores logo abaixo (sem sobrepor no iPhone) */}
      <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent safe-top">
      <div className="flex flex-wrap items-center gap-2 p-3">
        {mode === 'outside' ? (
          <Link to="/settings" className="inline-flex h-11 items-center gap-2 rounded-xl bg-surface/90 px-3 text-sm font-medium text-fg shadow-soft">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t('lab.park.back')}
          </Link>
        ) : (
          <Button variant="secondary" icon={<LogOut className="h-4 w-4" />} onClick={() => ctl.current?.exit()} className="bg-surface/90">
            {t('lab.reception.exit')}
          </Button>
        )}
        <span className="hidden rounded-xl bg-surface/80 px-3 py-2 text-xs font-semibold text-fg sm:inline">{t('lab.reception.title')}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <IconButton label={t('lab.reception.home')} icon={<Home className="h-5 w-5" />} onClick={() => ctl.current?.home()} className="bg-surface/90" />
          {mode === 'outside' && (
            <>
              <Segmented<TimeOfDay> label={t('lab.reception.time')} value={time} onChange={setTime} options={(['day', 'dusk', 'night'] as const).map((v) => ({ value: v, label: t(`lab.reception.times.${v}`) }))} className="bg-surface/90" />
              <IconButton label={t('lab.reception.rain')} icon={<CloudRain className="h-5 w-5" />} active={rain} onClick={() => setRain((r) => !r)} className="bg-surface/90" />
            </>
          )}
          <Segmented<ParkQuality> label={t('lab.park.quality')} value={quality} onChange={setQuality} options={(['low', 'medium', 'high'] as const).map((q) => ({ value: q, label: t(`lab.park.q.${q}`) }))} className="bg-surface/90" />
        </div>
      </div>
      {mode === 'inside' && (
        <nav aria-label={t('lab.reception.sectorsNav')} className="flex gap-2 overflow-x-auto px-3 pb-2">
          {SECTORS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => chooseSector(s)}
              aria-pressed={sector === s}
              className={`h-10 shrink-0 rounded-full px-4 text-sm font-medium shadow-soft ${sector === s ? 'bg-accent text-accent-fg' : 'bg-surface/90 text-fg'}`}
            >
              {t(`lab.reception.sectors.${s}`)}
            </button>
          ))}
        </nav>
      )}
      </div>

      {/* Medições */}
      <div className="absolute bottom-3 left-3 rounded-xl bg-black/60 px-3 py-2 font-mono text-[0.7rem] leading-relaxed text-white safe-bottom">
        {stats ? (
          <>
            <div>{t('lab.park.fps', { fps: stats.fps })}</div>
            <div>{t('lab.park.calls', { calls: stats.calls })}</div>
            <div>{t('lab.park.tris', { tris: stats.triangles.toLocaleString(settings.locale) })}</div>
          </>
        ) : (
          t('common.loading')
        )}
      </div>
      {!sector && !picked && <p className="absolute bottom-3 right-3 hidden max-w-xs rounded-xl bg-black/50 px-3 py-2 text-[0.7rem] text-white sm:block">{t('lab.reception.gestures')}</p>}

      {/* Prédio tocado (fora) */}
      {mode === 'outside' && picked && (
        <div className="absolute inset-x-3 bottom-20 mx-auto max-w-sm rounded-2xl bg-surface p-4 shadow-lift ring-1 ring-line" role="dialog" aria-label={t('lab.reception.building')}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold text-fg">{t('lab.reception.building')}</div>
              <div className="text-xs text-muted">{t('lab.reception.buildingSub')}</div>
              {data && <div className="mt-1 text-sm text-muted">{t('lab.reception.summary', { open: data.open, today: data.today })}</div>}
            </div>
            <IconButton size="sm" label={t('common.close')} icon={<X className="h-4 w-4" />} onClick={() => setPicked(false)} />
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="primary" icon={<LogIn className="h-4 w-4" />} onClick={() => ctl.current?.enter()}>
              {t('lab.reception.enter')}
            </Button>
            <Link to="/inbox" className="inline-flex h-9 items-center rounded-xl px-3 text-sm font-medium text-fg ring-1 ring-inset ring-line hover:bg-surface-2">
              {t('lab.reception.openInbox')}
            </Link>
          </div>
        </div>
      )}

      {/* Painel do setor (dentro) */}
      {mode === 'inside' && sector && (
        <section className="absolute inset-x-3 bottom-3 mx-auto flex max-h-[46vh] max-w-lg flex-col rounded-2xl bg-surface shadow-lift ring-1 ring-line safe-bottom sm:bottom-auto sm:left-auto sm:right-3 sm:top-[8.5rem] sm:mx-0 sm:max-h-[calc(100%-10rem)] sm:w-96" aria-label={t(`lab.reception.sectors.${sector}`)}>
          <header className="flex items-start gap-2 border-b border-line/70 p-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-fg">{t(`lab.reception.sectors.${sector}`)}</h2>
              <p className="text-xs text-muted">{t(`lab.reception.hints.${sector}`)}</p>
            </div>
            <IconButton
              size="sm"
              label={t('common.close')}
              icon={<X className="h-4 w-4" />}
              onClick={() => {
                setSector(null);
                ctl.current?.focusSector('overview');
              }}
            />
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4" style={{ touchAction: 'pan-y' }}>
            <SectorPanel id={sector} items={live} data={data} today={today} onError={(m) => toast.show(m, 'error')} onDone={(m) => toast.show(m, 'success')} />
          </div>
        </section>
      )}
    </div>
  );
}

function SectorPanel({ id, items, data, today, onError, onDone }: { id: SectorId; items: InboxItem[]; data: ReceptionData | null; today: string; onError: (m: string) => void; onDone: (m: string) => void }) {
  const { t, settings } = useSettings();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const open = items.filter((i) => i.status === 'open' && (!i.snoozedUntil || i.snoozedUntil <= today));
  const title = (i: InboxItem) => i.text || i.fileName || t('lab.reception.untitled');

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
              (e) => onError(e instanceof InboxRuleError && e.code === 'empty' ? t('lab.reception.emptyCapture') : t('errors.title')),
            )
          }
        >
          {t('inbox.capture')}
        </Button>
        <h3 className="mt-2 text-xs font-semibold uppercase tracking-wide text-subtle">{t('lab.reception.recent')}</h3>
        <ItemList items={items.slice(0, 5)} empty={t('inbox.empty.open')} title={title} />
      </div>
    );

  if (id === 'triage')
    return (
      <div className="flex flex-col gap-2">
        {data && data.snoozed > 0 && <p className="text-xs text-muted">{t('lab.reception.snoozedCount', { count: data.snoozed })}</p>}
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
          {t('lab.reception.openInbox')}
        </Link>
      </div>
    );

  if (id === 'distribution') {
    const total = data ? DESTINATIONS.reduce((n, d) => n + data.byType[d], 0) : 0;
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">{t('lab.reception.destTotal', { count: total })}</p>
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
        <p className="text-xs text-subtle">{t('lab.reception.tubesHint')}</p>
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
            <Button size="sm" variant="ghost" onClick={() => void reopen(i.id).then(() => onDone(t('lab.reception.reopened')), () => onError(t('errors.title')))}>
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
        <span className="sr-only">{t('lab.reception.searchLabel')}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
        <Input className="pl-9" placeholder={t('lab.reception.searchLabel')} value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {nq && found.length === 0 && <p className="text-sm text-muted">{t('lab.reception.noneFound')}</p>}
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

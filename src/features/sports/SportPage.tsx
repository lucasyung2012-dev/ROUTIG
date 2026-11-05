import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, NotebookPen, PenLine, Plus, Trash2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { createNote, emptyNoteInput, linkNote } from '@/data/notesRepo';
import { restoreSport, restoreSportItem, softDeleteSport, sportHistory, updateSport } from '@/data/sportsRepo';
import { addDays, formatDateKey, startOfWeek, todayKey } from '@/domain/dates';
import { SPORT_ITEM_CATEGORIES, SPORT_TABS, sportStats, type ActivityType, type Sport, type SportActivity, type SportItem, type SportItemCategory } from '@/domain/sports';
import { notePreview } from '@/domain/notes';
import { LinkedGoals } from '@/features/goals/goalsUi';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { ColorPicker } from '@/ui/ColorPicker';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Textarea } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { EmptyState, LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { ActivityDialog, SportItemDialog } from './sportsUi';
import { useSports, type SportsData } from './useSports';
import { LibraryLinked } from '@/features/library/libraryUi';

const ACTIVITY_TABS: Record<string, ActivityType> = { training: 'training', match: 'match', tournament: 'tournament', event: 'event' };

export function SportPage() {
  const { id } = useParams();
  const { t } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const data = useSports();
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [activity, setActivity] = useState<{ activity?: SportActivity; type?: ActivityType } | null>(null);
  if (data.loading) return <LoadingState label={t('common.loading')} lines={5} />;
  const sport = id ? data.byId.get(id) : undefined;
  if (!sport || sport.deletedAt)
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <Surface tone="flat">
          <EmptyState title={t('sports.notFound')} />
        </Surface>
      </div>
    );
  const tabs = SPORT_TABS[sport.kind];
  const trash = async () => {
    await softDeleteSport(sport.id);
    toast.show(t('sports.moved'), 'success', { label: t('notes.undo'), run: () => void restoreSport(sport.id) });
    navigate('/sports');
  };
  const quickType: ActivityType = ACTIVITY_TABS[tab] ?? (sport.kind === 'football' ? 'match' : 'training');

  return (
    <div className="flex flex-col gap-5">
      <BackLink />
      <div className="overflow-hidden rounded-3xl bg-surface shadow-soft ring-1 ring-line/70">
        <div className="h-2" style={{ background: sport.color }} aria-hidden />
        <div className="flex flex-wrap items-center gap-3 p-5 sm:p-6">
          <div className="min-w-0 flex-1 basis-56">
            <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{sport.name}</h1>
            <p className="text-sm text-muted">{t(`sports.kindHints.${sport.kind}`)}</p>
          </div>
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setActivity({ type: quickType })}>
            {t('sports.quickLog')}
          </Button>
          <IconButton label={t('sports.editSport')} icon={<PenLine className="h-4 w-4" />} onClick={() => setEditing(true)} />
          <IconButton label={t('sports.moveSportToTrash')} icon={<Trash2 className="h-4 w-4" />} onClick={() => void trash()} />
        </div>
      </div>

      <div className="-mx-1 overflow-x-auto px-1">
        <div role="tablist" aria-label={sport.name} className="inline-flex gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-line">
          {tabs.map((tb) => (
            <button
              key={tb}
              type="button"
              role="tab"
              aria-selected={tab === tb}
              onClick={() => setTab(tb)}
              className={cn('h-9 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition', tab === tb ? 'bg-surface text-fg shadow-soft ring-1 ring-line' : 'text-muted hover:text-fg')}
            >
              {t(`sports.tabs.${tb as TabKey}`)}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && <Overview sport={sport} data={data} onOpen={(a) => setActivity({ activity: a })} />}
      {ACTIVITY_TABS[tab] && <Activities key={tab} sport={sport} data={data} type={ACTIVITY_TABS[tab]!} onOpen={(a) => setActivity({ activity: a })} onNew={() => setActivity({ type: ACTIVITY_TABS[tab] })} />}
      {(SPORT_ITEM_CATEGORIES as readonly string[]).includes(tab) && <Items key={tab} sport={sport} data={data} category={tab as SportItemCategory} />}
      {tab === 'evolution' && <Evolution sport={sport} data={data} />}
      {tab === 'goals' && <LinkedGoals refType="sport" refId={sport.id} preset={{ area: 'sports' }} />}
      {tab === 'notes' && <Observations sport={sport} />}
      {tab === 'materials' && <Materials sport={sport} />}
      {tab === 'history' && <History sport={sport} data={data} />}

      {editing && <EditSportDialog sport={sport} onClose={() => setEditing(false)} />}
      {activity && <ActivityDialog sport={sport} activity={activity.activity} type={activity.type} items={data.itemsOf(sport.id)} onClose={() => setActivity(null)} />}
    </div>
  );
}

type TabKey = 'overview' | 'training' | 'match' | 'tournament' | 'event' | 'technique' | 'fundamental' | 'skill' | 'position' | 'evolution' | 'goals' | 'notes' | 'history' | 'materials';

function BackLink() {
  const { t } = useSettings();
  return (
    <Link to="/sports" className="inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-fg">
      <ChevronLeft className="h-4 w-4" aria-hidden />
      {t('sports.back')}
    </Link>
  );
}

/* ---------- Visão geral ---------- */

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <Surface className="flex flex-col gap-1">
      <span className="text-2xl font-semibold tabular text-fg">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </Surface>
  );
}

function ActivityRow({ a, sport, data, onOpen }: { a: SportActivity; sport: Sport; data: SportsData; onOpen: (a: SportActivity) => void }) {
  const { t, settings } = useSettings();
  const names = new Map(data.itemsOf(sport.id).map((i) => [i.id, i.name]));
  return (
    <li>
      <button type="button" onClick={() => onOpen(a)} className="flex w-full flex-col gap-1 rounded-2xl bg-surface p-4 text-left shadow-soft ring-1 ring-line/70 transition hover:shadow-lift">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-fg">{formatDateKey(a.date, settings.locale, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          <Badge>{t(`sports.types.${a.type}`)}</Badge>
          {a.outcome && <Badge tone={a.outcome === 'win' ? 'success' : a.outcome === 'loss' ? 'danger' : 'neutral'}>{t(`sports.outcomes.${a.outcome}`)}</Badge>}
          {a.score && <span className="text-sm font-medium tabular text-fg">{a.score}</span>}
          {a.durationMin && <span className="text-sm text-muted">{a.durationMin} min</span>}
        </div>
        {(a.title || a.opponent || a.location) && <span className="text-sm text-fg">{[a.title, a.opponent && t('sports.vs', { name: a.opponent }), a.location].filter(Boolean).join(' · ')}</span>}
        {(a.itemIds.length > 0 || a.positionId) && (
          <div className="flex flex-wrap gap-1">
            {a.positionId && <Badge tone="info">{names.get(a.positionId) ?? '—'}</Badge>}
            {a.itemIds.map((x) => (
              <Badge key={x}>{names.get(x) ?? '—'}</Badge>
            ))}
          </div>
        )}
        {a.evolution && <span className="text-sm text-success">{t('sports.evolutionLabel', { text: a.evolution })}</span>}
        {a.difficulties && <span className="text-sm text-warning">{t('sports.difficultiesLabel', { text: a.difficulties })}</span>}
        {a.notes && <span className="whitespace-pre-wrap text-sm text-muted">{a.notes}</span>}
      </button>
    </li>
  );
}

function Overview({ sport, data, onOpen }: { sport: Sport; data: SportsData; onOpen: (a: SportActivity) => void }) {
  const { t } = useSettings();
  const today = todayKey();
  const acts = data.activitiesOf(sport.id);
  const month = sportStats(acts.filter((a) => a.date >= addDays(today, -29)));
  const all = sportStats(acts);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={month.total} label={t('sports.stats.activities30')} />
        <Stat value={t('focus.min', { min: month.minutes })} label={t('sports.stats.time30')} />
        <Stat value={`${all.record.win}-${all.record.loss}${all.record.draw ? `-${all.record.draw}` : ''}`} label={sport.kind === 'football' ? t('sports.stats.recordWithDraws') : t('sports.stats.record')} />
        <Stat value={data.itemsOf(sport.id).filter((i) => i.category !== 'position').length} label={t('sports.stats.skills')} />
      </div>
      <Surface className="flex flex-col gap-2">
        <h2 className="font-semibold text-fg">{t('sports.recent')}</h2>
        {acts.length === 0 ? (
          <p className="text-sm text-muted">{t('sports.noActivities')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {acts.slice(0, 5).map((a) => (
              <ActivityRow key={a.id} a={a} sport={sport} data={data} onOpen={onOpen} />
            ))}
          </ul>
        )}
      </Surface>
      <p className="text-xs text-muted">{t('sports.healthNote')}</p>
    </div>
  );
}

/* ---------- Treinos, partidas, torneios, eventos ---------- */

function Activities({ sport, data, type, onOpen, onNew }: { sport: Sport; data: SportsData; type: ActivityType; onOpen: (a: SportActivity) => void; onNew: () => void }) {
  const { t } = useSettings();
  const acts = data.activitiesOf(sport.id).filter((a) => a.type === type);
  const st = sportStats(acts);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={onNew}>
          {t(`sports.new.${type}`)}
        </Button>
        {(type === 'match' || type === 'tournament') && acts.length > 0 && <span className="text-sm text-muted">{t('sports.recordLine', { win: st.record.win, loss: st.record.loss, draw: st.record.draw })}</span>}
        {type === 'training' && acts.length > 0 && <span className="text-sm text-muted">{t('sports.trainingLine', { count: acts.length, min: st.minutes })}</span>}
      </div>
      {acts.length === 0 ? (
        <Surface tone="flat">
          <EmptyState title={t('sports.noneTitle')} body={t(`sports.none.${type}`)} />
        </Surface>
      ) : (
        <ul className="flex flex-col gap-2">
          {acts.map((a) => (
            <ActivityRow key={a.id} a={a} sport={sport} data={data} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Técnicas, fundamentos, habilidades, posições ---------- */

function Items({ sport, data, category }: { sport: Sport; data: SportsData; category: SportItemCategory }) {
  const { t } = useSettings();
  const [editing, setEditing] = useState<{ item?: SportItem } | null>(null);
  const items = data.itemsOf(sport.id).filter((i) => i.category === category);
  const used = sportStats(data.activitiesOf(sport.id));
  const trash = data.itemTrash(sport.id).filter((i) => i.category === category);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({})}>
          {t(`sports.newItem.${category}`)}
        </Button>
        <p className="text-sm text-muted">{t(`sports.itemHints.${category}`)}</p>
      </div>
      {items.length === 0 ? (
        <Surface tone="flat">
          <EmptyState title={t('sports.noneTitle')} body={t(`sports.itemPlaceholder.${sport.kind}.${category}`)} />
        </Surface>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {items.map((i) => {
            const count = category === 'position' ? used.positions.get(i.id) : used.items.get(i.id);
            return (
              <li key={i.id}>
                <button type="button" onClick={() => setEditing({ item: i })} className="flex h-full w-full flex-col gap-2 rounded-2xl bg-surface p-4 text-left shadow-soft ring-1 ring-line/70 transition hover:shadow-lift">
                  <span className="font-semibold text-fg">{i.name}</span>
                  {i.confidence !== null && (
                    <div className="flex items-center gap-2">
                      <span className="flex flex-1 gap-1" aria-label={`${i.confidence}/5`}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <span key={n} className={cn('h-1.5 flex-1 rounded-full', n <= i.confidence! ? 'bg-brand' : 'bg-surface-3')} />
                        ))}
                      </span>
                      <span className="text-xs tabular text-muted">{i.confidence}/5</span>
                    </div>
                  )}
                  <span className="text-xs text-muted">{count ? t(category === 'position' ? 'sports.playedTimes' : 'sports.practicedTimes', { count }) : t('sports.notYet')}</span>
                  {i.difficulties && <span className="text-xs text-warning">{t('sports.difficultiesLabel', { text: i.difficulties })}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {trash.length > 0 && (
        <Surface tone="flat" className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-fg">{t('sports.trash')}</h2>
          {trash.map((i) => (
            <div key={i.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-muted">{i.name}</span>
              <Button size="sm" variant="secondary" onClick={() => void restoreSportItem(i.id)}>
                {t('academy.assessment.restore')}
              </Button>
            </div>
          ))}
        </Surface>
      )}
      {editing && <SportItemDialog sport={sport} category={category} item={editing.item} onClose={() => setEditing(null)} />}
    </div>
  );
}

/* ---------- Evolução ---------- */

function Evolution({ sport, data }: { sport: Sport; data: SportsData }) {
  const { t, settings } = useSettings();
  const today = todayKey();
  const acts = data.activitiesOf(sport.id);
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const start = startOfWeek(addDays(today, -7 * (11 - i)), settings.weekStartsOn);
    const end = addDays(start, 6);
    const inside = acts.filter((a) => a.date >= start && a.date <= end);
    return { start, count: inside.length, min: inside.reduce((x, a) => x + (a.durationMin ?? 0), 0) };
  });
  const top = Math.max(1, ...weeks.map((w) => w.count));
  const changes = useLiveQuery(() => sportHistory(sport.id), [sport.id, data.itemsOf(sport.id).map((i) => i.rev).join()]) ?? [];
  const items = new Map([...data.itemsOf(sport.id), ...data.itemTrash(sport.id)].map((i) => [i.id, i.name]));
  const confidence = changes.filter((c) => c.note?.startsWith('confidence:') && items.has(c.entityId));
  const perceived = acts.filter((a) => a.evolution);
  return (
    <div className="flex flex-col gap-4">
      <Surface className="flex flex-col gap-3">
        <h2 className="font-semibold text-fg">{t('sports.evolution.weeks')}</h2>
        <div className="flex h-36 items-end gap-1.5" role="img" aria-label={weeks.map((w) => `${formatDateKey(w.start, settings.locale)}: ${w.count}`).join('; ')}>
          {weeks.map((w) => (
            <div key={w.start} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[0.625rem] tabular text-muted">{w.count || ''}</span>
              <span className="w-full rounded-t-md" style={{ height: `${(w.count / top) * 100}%`, minHeight: w.count ? 3 : 0, background: sport.color }} />
              <span className="w-full truncate text-center text-[0.625rem] text-subtle">{formatDateKey(w.start, settings.locale)}</span>
            </div>
          ))}
        </div>
      </Surface>
      <div className="grid gap-4 lg:grid-cols-2">
        <Surface className="flex flex-col gap-2">
          <h2 className="font-semibold text-fg">{t('sports.evolution.confidence')}</h2>
          {confidence.length === 0 ? (
            <p className="text-sm text-muted">{t('sports.evolution.noConfidence')}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {confidence.slice(0, 30).map((c) => (
                <li key={c.seq ?? c.at} className="flex gap-3 text-sm">
                  <span className="w-24 shrink-0 text-muted">{new Intl.DateTimeFormat(settings.locale, { dateStyle: 'medium' }).format(new Date(c.at))}</span>
                  <span className="text-fg">
                    {items.get(c.entityId)}: {c.note?.split(':')[1]}/5
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Surface>
        <Surface className="flex flex-col gap-2">
          <h2 className="font-semibold text-fg">{t('sports.evolution.perceived')}</h2>
          {perceived.length === 0 ? (
            <p className="text-sm text-muted">{t('sports.evolution.noPerceived')}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {perceived.slice(0, 30).map((a) => (
                <li key={a.id} className="flex gap-3 text-sm">
                  <span className="w-24 shrink-0 text-muted">{formatDateKey(a.date, settings.locale)}</span>
                  <span className="text-fg">{a.evolution}</span>
                </li>
              ))}
            </ul>
          )}
        </Surface>
      </div>
    </div>
  );
}

/* ---------- Observações (futebol) ---------- */

function Observations({ sport }: { sport: Sport }) {
  const { t } = useSettings();
  const toast = useToast();
  const [text, setText] = useState(sport.notes);
  const save = async () => {
    try {
      await updateSport(sport.id, { name: sport.name, kind: sport.kind, color: sport.color, notes: text });
      toast.show(t('sports.saved'));
    } catch {
      toast.show(t('sports.errors.invalid'), 'error');
    }
  };
  return (
    <Surface className="flex flex-col gap-3">
      <Field label={t('sports.tabs.notes')} hint={t('sports.observationsHint')}>
        {(id, d) => <Textarea id={id} aria-describedby={d} rows={10} maxLength={20000} value={text} onChange={(e) => setText(e.target.value)} />}
      </Field>
      <Button variant="primary" className="w-fit" disabled={text === sport.notes} onClick={() => void save()}>
        {t('common.save')}
      </Button>
    </Surface>
  );
}

/* ---------- Materiais ---------- */

function Materials({ sport }: { sport: Sport }) {
  const { t } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const [linking, setLinking] = useState(false);
  const notes = useLiveQuery(async () => (await getDb().notes.filter((n) => !n.deletedAt && n.links.some((l) => l.type === 'sport' && l.id === sport.id)).toArray()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [sport.id]);
  const all = useLiveQuery(() => getDb().notes.filter((n) => !n.deletedAt).toArray(), []) ?? [];
  const ids = new Set((notes ?? []).map((n) => n.id));
  const others = all.filter((n) => !ids.has(n.id));
  const newNote = async () => {
    try {
      const n = await createNote(emptyNoteInput({ title: sport.name, links: [{ type: 'sport', id: sport.id }] }));
      navigate(`/notes/${n.id}`);
    } catch {
      toast.show(t('errors.saveFailed'), 'error');
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<NotebookPen className="h-4 w-4" />} onClick={() => void newNote()}>
          {t('sports.newNote')}
        </Button>
        <Button variant="secondary" onClick={() => setLinking(true)}>
          {t('profile.sections.linkNote')}
        </Button>
      </div>
      <LibraryLinked refType="sport" refId={sport.id} />
      {!notes?.length ? (
        <Surface tone="flat">
          <EmptyState title={t('academy.materials.emptyTitle')} body={t('sports.materialsEmpty')} />
        </Surface>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {notes.map((n) => (
            <li key={n.id}>
              <Link to={`/notes/${n.id}`} className="block h-full rounded-2xl bg-surface p-4 shadow-soft ring-1 ring-line/70 transition hover:-translate-y-0.5 hover:shadow-lift">
                <span className="block truncate font-medium text-fg">{n.title || t('notes.untitled')}</span>
                <span className="mt-1 line-clamp-2 block text-sm text-muted">{notePreview(n, 140) || '—'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {linking && (
        <Dialog open onClose={() => setLinking(false)} closeLabel={t('common.close')} title={t('profile.sections.linkNote')} footer={<Button onClick={() => setLinking(false)}>{t('common.close')}</Button>}>
          {others.length === 0 ? (
            <p className="text-sm text-muted">{t('academy.materials.nothingToLink')}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {others.map((n) => (
                <li key={n.id}>
                  <button type="button" className="w-full rounded-xl px-2 py-2 text-left text-sm text-fg hover:bg-surface-2" onClick={() => void linkNote(n.id, { type: 'sport', id: sport.id }).then(() => setLinking(false))}>
                    {n.title || t('notes.untitled')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Dialog>
      )}
    </div>
  );
}

/* ---------- Histórico ---------- */

function History({ sport, data }: { sport: Sport; data: SportsData }) {
  const { t, settings } = useSettings();
  const acts = data.activitiesOf(sport.id);
  const changes = useLiveQuery(() => sportHistory(sport.id), [sport.id, sport.rev, acts.length, data.itemsOf(sport.id).length]) ?? [];
  const names = new Map<string, string>([[sport.id, sport.name], ...[...data.itemsOf(sport.id), ...data.itemTrash(sport.id)].map((i) => [i.id, i.name] as [string, string]), ...acts.map((a) => [a.id, `${t(`sports.types.${a.type}`)} ${formatDateKey(a.date, settings.locale)}`] as [string, string])]);
  const describe = (action: string, note?: string) => (note?.startsWith('confidence:') ? t('sports.history.confidence', { n: note.split(':')[1] ?? '' }) : t(`sports.history.${action === 'create' || action === 'delete' || action === 'restore' ? action : 'update'}`));
  return (
    <Surface className="flex flex-col gap-2">
      <h2 className="font-semibold text-fg">{t('sports.tabs.history')}</h2>
      {changes.length === 0 ? (
        <p className="text-sm text-muted">{t('sports.noHistory')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {changes.slice(0, 200).map((c) => (
            <li key={c.seq ?? c.at} className="flex gap-3 text-sm">
              <span className="w-28 shrink-0 text-muted">{new Intl.DateTimeFormat(settings.locale, { dateStyle: 'medium' }).format(new Date(c.at))}</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium text-fg">{names.get(c.entityId) ?? t('sports.removedItem')}</span>
                <span className="text-muted"> · {describe(c.action, c.note)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}

/* ---------- Editar esporte ---------- */

function EditSportDialog({ sport, onClose }: { sport: Sport; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [name, setName] = useState(sport.name);
  const [color, setColor] = useState(sport.color);
  const save = async () => {
    try {
      await updateSport(sport.id, { name, kind: sport.kind, color, notes: sport.notes });
      toast.show(t('sports.saved'));
      onClose();
    } catch {
      toast.show(t('sports.errors.invalid'), 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      title={t('sports.editSport')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('sports.fields.sportName')}>{(id) => <Input id={id} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />}</Field>
        <ColorPicker value={color} onChange={setColor} label={t('sports.fields.color')} showLabel />
      </div>
    </Dialog>
  );
}

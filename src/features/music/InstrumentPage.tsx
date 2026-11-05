import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, ChevronLeft, Music2, NotebookPen, PenLine, Plus, Timer, Trash2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { instrumentHistory, restoreInstrument, restoreItem, restorePractice, restoreSong, softDeleteInstrument, softDeletePractice, updateInstrument } from '@/data/musicRepo';
import { createNote, emptyNoteInput, linkNote } from '@/data/notesRepo';
import { addDays, formatDateKey, todayKey } from '@/domain/dates';
import { instrumentInputOf, MUSIC_CATEGORIES, practiceStats, SONG_STATUSES, type Instrument, type InstrumentInput, type MusicCategory, type MusicItem, type PracticeSession, type Song, type SongStatus } from '@/domain/music';
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
import { ChordDiagram, ChordSheetView, ItemDialog, PracticeDialog, SongDialog, VideoLink } from './musicUi';
import { useMusic, type MusicData } from './useMusic';

/** O ambiente do instrumento (Parte 11.2): as 12 áreas da especificação. */
const TABS = ['overview', 'repertoire', ...MUSIC_CATEGORIES, 'practice', 'goals', 'materials', 'history'] as const;
type Tab = (typeof TABS)[number];

export function InstrumentPage() {
  const { id } = useParams();
  const { t , settings } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const data = useMusic();
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [practice, setPractice] = useState<{ session?: PracticeSession } | null>(null);
  if (data.loading) return <LoadingState label={t('common.loading')} lines={5} />;
  const ins = id ? data.byId.get(id) : undefined;
  if (!ins || ins.deletedAt)
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <Surface tone="flat">
          <EmptyState title={t('music.notFound')} />
        </Surface>
      </div>
    );

  const trash = async () => {
    await softDeleteInstrument(ins.id);
    toast.show(t('music.moved'), 'success', { label: t('notes.undo'), run: () => void restoreInstrument(ins.id) });
    navigate('/music');
  };

  return (
    <div className="flex flex-col gap-5">
      <BackLink />
      <div className="overflow-hidden rounded-3xl bg-surface shadow-soft ring-1 ring-line/70">
        <div className="h-2" style={{ background: ins.color }} aria-hidden />
        <div className="flex flex-wrap items-center gap-3 p-5 sm:p-6">
          <div className="min-w-0 flex-1 basis-56">
            <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{ins.name}</h1>
            <p className="text-sm text-muted">{[ins.tuning && t('music.tuningLabel', { tuning: ins.tuning }), ins.startedOn && t('music.since', { date: formatDateKey(ins.startedOn, settings.locale, { month: 'short', year: 'numeric' }) })].filter(Boolean).join(' · ')}</p>
          </div>
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setPractice({})}>
            {t('music.newPractice')}
          </Button>
          <Link to="/focus" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-surface-2 px-3 text-sm text-fg ring-1 ring-inset ring-line hover:bg-surface-3">
            <Timer className="h-4 w-4" aria-hidden />
            {t('music.useFocus')}
          </Link>
          <IconButton label={t('music.editInstrument')} icon={<PenLine className="h-4 w-4" />} onClick={() => setEditing(true)} />
          <IconButton label={t('music.moveInstrumentToTrash')} icon={<Trash2 className="h-4 w-4" />} onClick={() => void trash()} />
        </div>
      </div>

      <div className="-mx-1 overflow-x-auto px-1">
        <div role="tablist" aria-label={ins.name} className="inline-flex gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-line">
          {TABS.map((tb) => (
            <button
              key={tb}
              type="button"
              role="tab"
              aria-selected={tab === tb}
              onClick={() => setTab(tb)}
              className={cn('h-9 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition', tab === tb ? 'bg-surface text-fg shadow-soft ring-1 ring-line' : 'text-muted hover:text-fg')}
            >
              {t(`music.tabs.${tb}`)}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && <Overview ins={ins} data={data} onTab={setTab} onPractice={() => setPractice({})} />}
      {tab === 'repertoire' && <Repertoire ins={ins} data={data} />}
      {(MUSIC_CATEGORIES as readonly string[]).includes(tab) && <ItemsTab key={tab} ins={ins} data={data} category={tab as MusicCategory} />}
      {tab === 'practice' && <PracticeTab ins={ins} data={data} onEdit={(session) => setPractice({ session })} onNew={() => setPractice({})} />}
      {tab === 'goals' && <LinkedGoals refType="instrument" refId={ins.id} preset={{ area: 'creative' }} />}
      {tab === 'materials' && <Materials ins={ins} data={data} />}
      {tab === 'history' && <History ins={ins} data={data} />}

      {editing && <EditInstrumentDialog ins={ins} onClose={() => setEditing(false)} />}
      {practice && <PracticeDialog instrument={ins} session={practice.session} songs={data.songsOf(ins.id)} items={data.itemsOf(ins.id)} onClose={() => setPractice(null)} />}
    </div>
  );
}

function BackLink() {
  const { t } = useSettings();
  return (
    <Link to="/music" className="inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-fg">
      <ChevronLeft className="h-4 w-4" aria-hidden />
      {t('music.back')}
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

function Overview({ ins, data, onTab, onPractice }: { ins: Instrument; data: MusicData; onTab: (t: Tab) => void; onPractice: () => void }) {
  const { t, settings } = useSettings();
  const today = todayKey();
  const sessions = data.practiceOf(ins.id);
  const week = practiceStats(sessions.filter((s) => s.date >= addDays(today, -6)));
  const month = practiceStats(sessions.filter((s) => s.date >= addDays(today, -29)));
  const songs = data.songsOf(ins.id);
  const inProgress = songs.filter((s) => s.status === 'learning' || s.status === 'reviewing');
  const items = data.itemsOf(ins.id);
  const counts = MUSIC_CATEGORIES.map((c) => [c, items.filter((i) => i.category === c).length] as const);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={t('focus.min', { min: week.minutes })} label={t('music.stats.week')} />
        <Stat value={t('focus.min', { min: month.minutes })} label={t('music.stats.month')} />
        <Stat value={songs.filter((s) => s.status === 'mastered').length} label={t('music.stats.masteredSongs')} />
        <Stat value={sessions.length} label={t('music.stats.sessions')} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Surface className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 flex-1 font-semibold text-fg">{t('music.inProgress')}</h2>
            <button type="button" className="text-sm font-medium text-accent hover:underline" onClick={() => onTab('repertoire')}>
              {t('music.tabs.repertoire')}
            </button>
          </div>
          {inProgress.length === 0 ? (
            <p className="text-sm text-muted">{t('music.noneInProgress')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {inProgress.map((s) => (
                <li key={s.id} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium text-fg">{s.name}</span>
                    <Badge>{t(`music.songStatuses.${s.status}`)}</Badge>
                  </div>
                  {s.progress !== null && (
                    <span className="block h-1.5 overflow-hidden rounded-full bg-surface-3" aria-label={`${s.progress}%`}>
                      <span className="block h-full rounded-full" style={{ width: `${s.progress}%`, background: ins.color }} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Surface>
        <Surface className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 flex-1 font-semibold text-fg">{t('music.recentPractice')}</h2>
            <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={onPractice}>
              {t('music.newPractice')}
            </Button>
          </div>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted">{t('music.noPractice')}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {sessions.slice(0, 5).map((p) => (
                <li key={p.id} className="flex gap-3 text-sm">
                  <span className="w-20 shrink-0 text-muted">{formatDateKey(p.date, settings.locale)}</span>
                  <span className="min-w-0 flex-1 truncate text-fg">{p.goal || p.practiced || t('music.practiceSession')}</span>
                  <span className="tabular text-muted">{p.durationMin} min</span>
                </li>
              ))}
            </ul>
          )}
        </Surface>
      </div>
      <Surface className="flex flex-wrap gap-2">
        {counts.map(([c, n]) => (
          <button key={c} type="button" onClick={() => onTab(c)} className="rounded-xl bg-surface-2 px-3 py-2 text-left text-sm ring-1 ring-inset ring-line transition hover:bg-surface-3">
            <span className="block text-lg font-semibold tabular text-fg">{n}</span>
            <span className="text-xs text-muted">{t(`music.tabs.${c}`)}</span>
          </button>
        ))}
      </Surface>
      {ins.notes && (
        <Surface className="flex flex-col gap-2">
          <h2 className="font-semibold text-fg">{t('music.fields.notes')}</h2>
          <p className="whitespace-pre-wrap text-sm text-fg">{ins.notes}</p>
        </Surface>
      )}
    </div>
  );
}

/* ---------- Repertório ---------- */

function Repertoire({ ins, data }: { ins: Instrument; data: MusicData }) {
  const { t, settings } = useSettings();
  const [editing, setEditing] = useState<{ song?: Song } | null>(null);
  const [reading, setReading] = useState<Song | null>(null);
  const [filter, setFilter] = useState<SongStatus | 'all'>('all');
  const songs = data.songsOf(ins.id);
  const times = practiceStats(data.practiceOf(ins.id)).times;
  const shown = filter === 'all' ? songs.filter((s) => s.status !== 'archived') : songs.filter((s) => s.status === filter);
  const trash = data.songTrash(ins.id);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({})}>
          {t('music.newSong')}
        </Button>
        <div className="flex flex-wrap gap-1">
          {(['all', ...SONG_STATUSES] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={filter === s}
              onClick={() => setFilter(s)}
              className={cn('rounded-full px-3 py-1.5 text-sm ring-1 ring-inset transition', filter === s ? 'bg-accent/15 text-accent ring-accent/40' : 'bg-surface-2 text-muted ring-line hover:text-fg')}
            >
              {s === 'all' ? t('music.allActive') : t(`music.songStatuses.${s}`)} ({s === 'all' ? songs.filter((x) => x.status !== 'archived').length : songs.filter((x) => x.status === s).length})
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <Surface tone="flat">
          <EmptyState icon={<Music2 className="h-6 w-6" />} title={t('music.noSongsTitle')} body={songs.length ? t('music.noSongsFilter') : t('music.noSongs')} />
        </Surface>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {shown.map((s) => {
            const used = times.get(s.id);
            return (
              <li key={s.id} className="flex flex-col gap-2 rounded-2xl bg-surface p-4 shadow-soft ring-1 ring-line/70">
                <button type="button" className="flex items-start gap-2 text-left" onClick={() => setEditing({ song: s })}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-fg">{s.name}</span>
                    <span className="block truncate text-sm text-muted">{[s.artist, s.genre].filter(Boolean).join(' · ') || '—'}</span>
                  </span>
                  <Badge tone={s.status === 'mastered' ? 'success' : s.status === 'learning' ? 'accent' : 'neutral'}>{t(`music.songStatuses.${s.status}`)}</Badge>
                </button>
                {s.progress !== null && (
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                      <span className="block h-full rounded-full" style={{ width: `${s.progress}%`, background: ins.color }} />
                    </span>
                    <span className="text-xs tabular text-muted">{s.progress}%</span>
                  </div>
                )}
                {s.chords.length > 0 && <p className="font-mono text-sm text-accent">{s.chords.join('  ')}</p>}
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                  {s.difficulty !== null && <span>{t('music.difficultyShort', { n: s.difficulty })}</span>}
                  {used && <span>{t('music.practicedTimes', { count: used.count, date: formatDateKey(used.last, settings.locale) })}</span>}
                  {s.chordSheet && (
                    <button type="button" className="inline-flex items-center gap-1 font-medium text-accent hover:underline" onClick={() => setReading(s)}>
                      <BookOpen className="h-3.5 w-3.5" aria-hidden />
                      {t('music.readSheet')}
                    </button>
                  )}
                  {s.files.length > 0 && <span>{t('music.filesCount', { count: s.files.length })}</span>}
                  <VideoLink url={s.videoUrl} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {trash.length > 0 && <TrashList items={trash} onRestore={(id) => void restoreSong(id)} />}
      {editing && <SongDialog instrument={ins} song={editing.song} onClose={() => setEditing(null)} />}
      {reading && <ChordSheetView song={reading} onClose={() => setReading(null)} />}
    </div>
  );
}

function TrashList({ items, onRestore }: { items: Array<{ id: string; name: string }>; onRestore: (id: string) => void }) {
  const { t } = useSettings();
  return (
    <Surface tone="flat" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-fg">{t('music.trash')}</h2>
      {items.map((i) => (
        <div key={i.id} className="flex items-center gap-2 text-sm">
          <span className="min-w-0 flex-1 truncate text-muted">{i.name}</span>
          <Button size="sm" variant="secondary" onClick={() => onRestore(i.id)}>
            {t('academy.assessment.restore')}
          </Button>
        </div>
      ))}
    </Surface>
  );
}

/* ---------- Técnicas, acordes, ritmos, escalas, dedilhados, teoria ---------- */

function ItemsTab({ ins, data, category }: { ins: Instrument; data: MusicData; category: MusicCategory }) {
  const { t, settings } = useSettings();
  const [editing, setEditing] = useState<{ item?: MusicItem } | null>(null);
  const items = data.itemsOf(ins.id).filter((i) => i.category === category);
  const times = practiceStats(data.practiceOf(ins.id)).times;
  const trash = data.itemTrash(ins.id).filter((i) => i.category === category);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({})}>
          {t(`music.newItem.${category}`)}
        </Button>
        <p className="text-sm text-muted">{t(`music.categoryHints.${category}`)}</p>
      </div>
      {items.length === 0 ? (
        <Surface tone="flat">
          <EmptyState title={t('music.noItemsTitle')} body={t(`music.noItems.${category}`)} />
        </Surface>
      ) : (
        <ul className={cn('grid gap-3', category === 'chord' ? 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4' : 'lg:grid-cols-2')}>
          {items.map((i) => {
            const used = times.get(i.id);
            return (
              <li key={i.id}>
                <button type="button" onClick={() => setEditing({ item: i })} className="flex h-full w-full flex-col gap-2 rounded-2xl bg-surface p-4 text-left shadow-soft ring-1 ring-line/70 transition hover:-translate-y-0.5 hover:shadow-lift">
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 font-semibold text-fg">{i.name}</span>
                    <Badge tone={i.status === 'mastered' ? 'success' : i.status === 'todo' ? 'neutral' : 'accent'}>{t(`music.itemStatuses.${i.status}`)}</Badge>
                  </div>
                  {category === 'chord' && i.frets && <ChordDiagram frets={i.frets} strings={ins.strings} label={i.name} />}
                  {i.pattern && <p className="whitespace-pre-wrap font-mono text-sm text-accent">{i.pattern}</p>}
                  {i.description && <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted">{i.description}</p>}
                  <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                    {i.confidence !== null && <span>{t('music.confidenceShort', { n: i.confidence })}</span>}
                    {i.difficulty !== null && <span>{t('music.difficultyShort', { n: i.difficulty })}</span>}
                    {used && <span>{t('music.practicedTimes', { count: used.count, date: formatDateKey(used.last, settings.locale) })}</span>}
                  </div>
                  {i.difficulties && <p className="text-xs text-warning">{t('music.difficultiesLabel', { text: i.difficulties })}</p>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {trash.length > 0 && <TrashList items={trash} onRestore={(id) => void restoreItem(id)} />}
      {editing && <ItemDialog instrument={ins} category={category} item={editing.item} onClose={() => setEditing(null)} />}
    </div>
  );
}

/* ---------- Prática ---------- */

function PracticeTab({ ins, data, onEdit, onNew }: { ins: Instrument; data: MusicData; onEdit: (p: PracticeSession) => void; onNew: () => void }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const sessions = data.practiceOf(ins.id);
  const names = new Map<string, string>([...data.songsOf(ins.id), ...data.itemsOf(ins.id)].map((x) => [x.id, x.name]));
  const focusMin = useLiveQuery(async () => (await getDb().focusSessions.filter((f) => !f.deletedAt && f.ref?.type === 'instrument' && f.ref.id === ins.id).toArray()).reduce((a, f) => a + f.actualMin, 0), [ins.id]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={onNew}>
          {t('music.newPractice')}
        </Button>
        {!!focusMin && <span className="text-sm text-muted">{t('music.focusMinutes', { min: focusMin })}</span>}
      </div>
      {sessions.length === 0 ? (
        <Surface tone="flat">
          <EmptyState title={t('music.noPracticeTitle')} body={t('music.noPracticeBody')} />
        </Surface>
      ) : (
        <ul className="flex flex-col gap-3">
          {sessions.map((p) => (
            <li key={p.id} className="flex gap-3 rounded-2xl bg-surface p-4 shadow-soft ring-1 ring-line/70">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onEdit(p)}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-semibold text-fg">{formatDateKey(p.date, settings.locale, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <span className="text-sm tabular text-muted">{p.durationMin} min</span>
                  {p.goal && <span className="text-sm text-fg">· {p.goal}</span>}
                </div>
                {[...p.songIds, ...p.itemIds].length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {[...p.songIds, ...p.itemIds].map((x) => (
                      <Badge key={x}>{names.get(x) ?? t('music.removed')}</Badge>
                    ))}
                  </div>
                )}
                {p.practiced && <p className="mt-1 whitespace-pre-wrap text-sm text-fg">{p.practiced}</p>}
                {p.difficulties && <p className="mt-1 text-sm text-warning">{t('music.difficultiesLabel', { text: p.difficulties })}</p>}
                {p.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{p.notes}</p>}
              </button>
              <IconButton label={t('music.removePractice')} icon={<Trash2 className="h-4 w-4" />} onClick={() => void softDeletePractice(p.id).then(() => toast.show(t('music.practiceRemoved'), 'success', { label: t('notes.undo'), run: () => void restorePractice(p.id) }))} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Materiais ---------- */

function Materials({ ins, data }: { ins: Instrument; data: MusicData }) {
  const { t } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const [linking, setLinking] = useState(false);
  const fromPractice = new Set(data.practiceOf(ins.id).flatMap((p) => p.noteIds));
  const notes = useLiveQuery(async () => (await getDb().notes.filter((n) => !n.deletedAt && (n.links.some((l) => l.type === 'instrument' && l.id === ins.id) || fromPractice.has(n.id))).toArray()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [ins.id, [...fromPractice].join()]);
  const all = useLiveQuery(() => getDb().notes.filter((n) => !n.deletedAt).toArray(), []) ?? [];
  const ids = new Set((notes ?? []).map((n) => n.id));
  const others = all.filter((n) => !ids.has(n.id));
  const newNote = async () => {
    try {
      const n = await createNote(emptyNoteInput({ title: ins.name, links: [{ type: 'instrument', id: ins.id }] }));
      navigate(`/notes/${n.id}`);
    } catch {
      toast.show(t('errors.saveFailed'), 'error');
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={<NotebookPen className="h-4 w-4" />} onClick={() => void newNote()}>
          {t('music.newNote')}
        </Button>
        <Button variant="secondary" onClick={() => setLinking(true)}>
          {t('profile.sections.linkNote')}
        </Button>
      </div>
      <p className="text-sm text-muted">{t('music.materialsHint')}</p>
      {!notes?.length ? (
        <Surface tone="flat">
          <EmptyState title={t('academy.materials.emptyTitle')} body={t('music.materialsEmpty')} />
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
                  <button type="button" className="w-full rounded-xl px-2 py-2 text-left text-sm text-fg hover:bg-surface-2" onClick={() => void linkNote(n.id, { type: 'instrument', id: ins.id }).then(() => setLinking(false))}>
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

function History({ ins, data }: { ins: Instrument; data: MusicData }) {
  const { t, settings } = useSettings();
  const changes = useLiveQuery(() => instrumentHistory(ins.id), [ins.id, ins.rev, data.songsOf(ins.id).length, data.itemsOf(ins.id).length]) ?? [];
  const names = new Map<string, string>([[ins.id, ins.name], ...[...data.songsOf(ins.id), ...data.itemsOf(ins.id), ...data.songTrash(ins.id), ...data.itemTrash(ins.id)].map((x) => [x.id, x.name] as [string, string])]);
  const describe = (entityType: string, action: string, note: string | undefined): string => {
    const [k, v] = (note ?? '').split(':');
    if (k === 'status' && v) return entityType === 'song' ? t('music.history.songStatus', { status: t(`music.songStatuses.${v as SongStatus}`) }) : t('music.history.itemStatus', { status: t(`music.itemStatuses.${v as MusicItem['status']}`) });
    if (k === 'confidence' && v) return t('music.history.confidence', { n: v });
    if (k === 'progress' && v) return t('music.history.progress', { pct: v });
    return t(`music.history.${action === 'create' || action === 'delete' || action === 'restore' ? action : 'update'}`);
  };
  return (
    <Surface className="flex flex-col gap-2">
      <h2 className="font-semibold text-fg">{t('music.tabs.history')}</h2>
      <p className="text-sm text-muted">{t('music.historyHint')}</p>
      {changes.length === 0 ? (
        <p className="text-sm text-muted">{t('music.noHistory')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {changes.slice(0, 200).map((c) => (
            <li key={c.seq ?? c.at} className="flex gap-3 text-sm">
              <span className="w-28 shrink-0 text-muted">{new Intl.DateTimeFormat(settings.locale, { dateStyle: 'medium' }).format(new Date(c.at))}</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium text-fg">{names.get(c.entityId) ?? '—'}</span>
                <span className="text-muted"> · {describe(c.entityType, c.action, c.note)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}

/* ---------- Editar instrumento ---------- */

function EditInstrumentDialog({ ins, onClose }: { ins: Instrument; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [input, setInput] = useState<InstrumentInput>(() => instrumentInputOf(ins));
  const set = (p: Partial<InstrumentInput>) => setInput((i) => ({ ...i, ...p }));
  const save = async () => {
    try {
      await updateInstrument(ins.id, input);
      toast.show(t('music.saved'));
      onClose();
    } catch {
      toast.show(t('music.errors.invalid'), 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      title={t('music.editInstrument')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!input.name.trim()} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('music.fields.instrumentName')}>{(id) => <Input id={id} value={input.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('music.fields.tuning')} optionalLabel={t('common.optional')}>
            {(id) => <Input id={id} value={input.tuning} maxLength={60} onChange={(e) => set({ tuning: e.target.value })} />}
          </Field>
          <Field label={t('music.fields.strings')} hint={t('music.stringsHint')}>
            {(id, d) => <Input id={id} aria-describedby={d} type="number" inputMode="numeric" min={0} max={12} value={input.strings} onChange={(e) => set({ strings: Math.max(0, Math.min(12, Math.round(Number(e.target.value) || 0))) })} />}
          </Field>
          <Field label={t('music.fields.startedOn')} optionalLabel={t('common.optional')}>
            {(id) => <Input id={id} type="date" value={input.startedOn ?? ''} onChange={(e) => set({ startedOn: e.target.value || null })} />}
          </Field>
        </div>
        <ColorPicker value={input.color} onChange={(color) => set({ color })} label={t('music.fields.color')} showLabel />
        <Field label={t('music.fields.notes')} optionalLabel={t('common.optional')}>
          {(id) => <Textarea id={id} rows={3} maxLength={20000} value={input.notes} onChange={(e) => set({ notes: e.target.value })} />}
        </Field>
      </div>
    </Dialog>
  );
}

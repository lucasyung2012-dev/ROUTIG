import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, CheckCircle2, EyeOff, Eye, History, Lock, PenLine, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import {
  addHistoryEntry,
  createCategory,
  createInterest,
  deleteHistoryEntry,
  InterestRuleError,
  loadTimeline,
  purgeInterest,
  restoreInterest,
  setOverride,
  updateHistoryEntry,
} from '@/data/interestsRepo';
import { storeNoteFile } from '@/data/notesRepo';
import { formatDateKey, toDateKey, todayKey } from '@/domain/dates';
import { countByWeek, emptyInterestInput, INTEREST_STATUSES, type Interest, type InterestStatus, type TimelineItem, type WeekBucket } from '@/domain/interests';
import { completionTimes } from '@/domain/tasks';
import { useObjectUrl } from '@/features/files/useObjectUrl';
import { useTasksData } from '@/features/tasks/useTasksData';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { PageHeader } from '@/ui/PageHeader';
import { Segmented } from '@/ui/Segmented';
import { EmptyState, LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { INTEREST_STATUS_TONE, InterestBadgeIcon, InterestCover, useInterestCategories } from './interestUi';

const TABS = ['interests', 'evolution', 'history'] as const;
type Tab = (typeof TABS)[number];

/** Profile (Parte 21): perfil privado, interesses, Minha evolução e Minha história. */
export function ProfilePage() {
  const { t } = useSettings();
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const saved = sessionStorage.getItem('routig.profileTab');
      return (TABS as readonly string[]).includes(saved ?? '') ? (saved as Tab) : 'interests';
    } catch {
      return 'interests';
    }
  });
  const choose = (v: Tab) => {
    setTab(v);
    try {
      sessionStorage.setItem('routig.profileTab', v);
    } catch {
      /* sem armazenamento: só não lembra a aba */
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={t('modules.profile')} title={t('profile.title')} description={t('moduleSummary.profile')} />
      <ProfileCard />
      <Segmented value={tab} onChange={choose} label={t('profile.title')} options={TABS.map((v) => ({ value: v, label: t(`profile.tabs.${v}`) }))} className="w-full sm:w-fit" />
      {tab === 'interests' && <InterestsTab />}
      {tab === 'evolution' && <EvolutionTab />}
      {tab === 'history' && <HistoryTab />}
    </div>
  );
}

/* ---------- Cartão do perfil (nome, avatar, descrição) ---------- */

function ProfileCard() {
  const { settings, t, update } = useSettings();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const url = useObjectUrl(settings.profile.avatarFileId);
  const name = settings.profile.displayName.trim();
  const initial = (name[0] ?? 'R').toUpperCase();
  const setAvatar = (avatarFileId: string | null) => update((s) => ({ ...s, profile: { ...s.profile, avatarFileId } }));

  return (
    <Surface className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
      <div className="relative shrink-0">
        {url ? (
          <img src={url} alt={t('profile.avatar.alt')} className="h-20 w-20 rounded-3xl object-cover shadow-soft" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-brand text-3xl font-semibold text-white shadow-glow" aria-hidden>
            {initial}
          </div>
        )}
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void storeNoteFile(f, f.name).then((s) => setAvatar(s.id), () => toast.show(t('errors.saveFailed'), 'error'));
          }}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-surface text-fg shadow-lift ring-1 ring-line hover:bg-surface-2"
          aria-label={url ? t('profile.avatar.change') : t('profile.avatar.add')}
        >
          <Camera className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xl font-semibold tracking-tight text-fg">{name || t('profile.noName')}</div>
        {settings.profile.bio && <p className="mt-1 max-w-prose text-[0.9375rem] leading-relaxed text-muted">{settings.profile.bio}</p>}
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-subtle">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          {t('profile.private')}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {url && (
          <Button variant="ghost" size="sm" onClick={() => void setAvatar(null)}>
            {t('profile.avatar.remove')}
          </Button>
        )}
        <Link
          to="/settings/profile"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-surface-2 px-3 text-sm font-medium text-fg ring-1 ring-inset ring-line transition hover:bg-surface-3"
        >
          <PenLine className="h-4 w-4" aria-hidden />
          {t('profile.editInSettings')}
        </Link>
      </div>
    </Surface>
  );
}

/* ---------- Interesses ---------- */

function InterestsTab() {
  const { t } = useSettings();
  const all = useLiveQuery(() => getDb().interests.toArray(), []);
  const cats = useInterestCategories();
  const [filter, setFilter] = useState<InterestStatus | 'all'>('all');
  const [creating, setCreating] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  if (!all) return <LoadingState label={t('common.loading')} lines={3} />;
  const active = all.filter((i) => !i.deletedAt).sort((a, b) => a.name.localeCompare(b.name));
  const trashed = all.filter((i) => i.deletedAt);
  const shown = filter === 'all' ? active : active.filter((i) => i.status === filter);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-44">
          <Select aria-label={t('profile.fields.status')} value={filter} onChange={(e) => setFilter(e.target.value as InterestStatus | 'all')}>
            <option value="all">{t('profile.interests.all')}</option>
            {INTEREST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`profile.status.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex-1" />
        {trashed.length > 0 && (
          <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => setTrashOpen(true)}>
            {t('profile.interests.trash')} ({trashed.length})
          </Button>
        )}
        <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
          {t('profile.interests.new')}
        </Button>
      </div>

      {active.length === 0 ? (
        <Surface tone="flat">
          <EmptyState
            title={t('profile.interests.emptyTitle')}
            body={t('profile.interests.empty')}
            action={
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
                {t('profile.interests.new')}
              </Button>
            }
          />
        </Surface>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted">{t('profile.interests.noneWithStatus')}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((i) => (
            <li key={i.id}>
              <Link to={`/profile/interests/${i.id}`} className="group block h-full overflow-hidden rounded-3xl bg-surface shadow-soft ring-1 ring-line/70 transition hover:-translate-y-0.5 hover:shadow-lift">
                <InterestCover interest={i} className="h-20" />
                <div className="flex items-start gap-3 p-4">
                  <InterestBadgeIcon interest={i} className="-mt-9 ring-4 ring-surface" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-fg">{i.name}</div>
                    <div className="truncate text-xs text-muted">{cats.nameOf(i.categoryId)}</div>
                  </div>
                  <Badge tone={INTEREST_STATUS_TONE[i.status]}>{t(`profile.status.${i.status}`)}</Badge>
                </div>
                {i.description && <p className="line-clamp-2 px-4 pb-4 text-sm text-muted">{i.description}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {creating && <NewInterestDialog onClose={() => setCreating(false)} />}
      {trashOpen && <InterestsTrashDialog items={trashed} onClose={() => setTrashOpen(false)} />}
    </section>
  );
}

/** Lista de categorias com a opção "Nova categoria…" no fim. */
export function CategorySelect({ id, value, onChange }: { id: string; value: string; onChange: (id: string) => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const cats = useInterestCategories();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const add = async () => {
    try {
      const c = await createCategory(name);
      onChange(c.id);
      setAdding(false);
      setName('');
    } catch {
      toast.show(t('profile.interests.invalid'), 'error');
    }
  };
  if (adding)
    return (
      <div className="flex gap-2">
        <Input id={id} autoFocus value={name} maxLength={40} placeholder={t('profile.fields.newCategoryName')} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && void add()} />
        <Button variant="secondary" disabled={!name.trim()} onClick={() => void add()}>
          {t('common.save')}
        </Button>
        <IconButton label={t('common.cancel')} icon={<X className="h-4 w-4" />} onClick={() => setAdding(false)} />
      </div>
    );
  return (
    <Select id={id} value={value} onChange={(e) => (e.target.value === '__new' ? setAdding(true) : onChange(e.target.value))}>
      {cats.list.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
      <option value="__new">{t('profile.fields.newCategory')}</option>
    </Select>
  );
}

function NewInterestDialog({ onClose }: { onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const [input, setInput] = useState(emptyInterestInput());
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    if (!input.name.trim()) return;
    try {
      const i = await createInterest(input);
      toast.show(t('profile.interests.created'));
      onClose();
      navigate(`/profile/interests/${i.id}`);
    } catch (e) {
      setError(e instanceof InterestRuleError && e.code === 'duplicate' ? t('profile.interests.duplicate') : t('profile.interests.invalid'));
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.cancel')}
      title={t('profile.interests.new')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!input.name.trim()} onClick={() => void create()}>
            {t('profile.interests.create')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('profile.fields.name')} error={error ?? undefined}>
          {(id) => (
            <Input
              id={id}
              autoFocus
              value={input.name}
              maxLength={80}
              placeholder={t('profile.fields.namePlaceholder')}
              onChange={(e) => {
                setInput({ ...input, name: e.target.value });
                setError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && void create()}
            />
          )}
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('profile.fields.category')}>{(id) => <CategorySelect id={id} value={input.categoryId} onChange={(categoryId) => setInput({ ...input, categoryId })} />}</Field>
          <Field label={t('profile.fields.status')} hint={t('profile.statusHint')}>
            {(id, d) => (
              <Select id={id} aria-describedby={d} value={input.status} onChange={(e) => setInput({ ...input, status: e.target.value as InterestStatus })}>
                {INTEREST_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`profile.status.${s}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

function InterestsTrashDialog({ items, onClose }: { items: Interest[]; onClose: () => void }) {
  const { t } = useSettings();
  const [purging, setPurging] = useState<Interest | null>(null);
  return (
    <Dialog open onClose={onClose} closeLabel={t('common.close')} title={t('profile.interests.trash')} footer={<Button onClick={onClose}>{t('common.close')}</Button>}>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{t('profile.interests.trashEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-2 rounded-xl px-2 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{i.name}</span>
              <Button size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => void restoreInterest(i.id)}>
                {t('profile.interests.restore')}
              </Button>
              <IconButton label={t('profile.interests.purge')} icon={<Trash2 className="h-4 w-4" />} onClick={() => setPurging(i)} />
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!purging}
        title={t('profile.interests.purgeTitle')}
        body={t('profile.interests.purgeBody', { name: purging?.name ?? '' })}
        confirmLabel={t('profile.interests.purge')}
        cancelLabel={t('common.cancel')}
        danger
        onConfirm={() => {
          if (purging) void purgeInterest(purging.id);
          setPurging(null);
        }}
        onCancel={() => setPurging(null)}
      />
    </Dialog>
  );
}

/* ---------- Minha evolução ---------- */

function EvolutionTab() {
  const { t, settings } = useSettings();
  const tasks = useTasksData();
  const extra = useLiveQuery(async () => {
    const db = getDb();
    const [notes, projects, interests] = await Promise.all([db.notes.filter((n) => !n.deletedAt).toArray(), db.projects.filter((p) => !p.deletedAt).toArray(), db.interests.filter((i) => !i.deletedAt).toArray()]);
    return { notes, projects, interests };
  }, []);
  if (tasks.loading || !extra) return <LoadingState label={t('common.loading')} lines={4} />;

  const today = todayKey();
  const doneDates = tasks.active.flatMap((x) => completionTimes(x)).map((c) => toDateKey(new Date(c)));
  const taskWeeks = countByWeek(doneDates, today, 8);
  const noteWeeks = countByWeek(
    extra.notes.map((n) => toDateKey(new Date(n.createdAt))),
    today,
    8,
  );
  const nothing = doneDates.length === 0 && extra.notes.length === 0 && extra.projects.length === 0 && extra.interests.length === 0;
  if (nothing)
    return (
      <Surface tone="flat">
        <EmptyState title={t('profile.evolution.emptyTitle')} body={t('profile.evolution.empty')} />
      </Surface>
    );

  const stats: { label: string; value: number }[] = [
    { label: t('profile.evolution.tasksDone'), value: doneDates.length },
    { label: t('profile.evolution.tasksDoneWeek'), value: taskWeeks.at(-1)?.count ?? 0 },
    { label: t('profile.evolution.projectsDone'), value: extra.projects.filter((p) => p.status === 'done').length },
    { label: t('profile.evolution.projectsActive'), value: extra.projects.filter((p) => p.status === 'active').length },
    { label: t('profile.evolution.notesCreated'), value: extra.notes.length },
    { label: t('profile.evolution.interestsCount'), value: extra.interests.length },
  ];

  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t('profile.evolution.source')}</p>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {stats.map((s) => (
          <li key={s.label} className="rounded-2xl bg-surface p-4 shadow-soft ring-1 ring-line/70">
            <div className="text-sm text-muted">{s.label}</div>
            <div className="mt-1 text-3xl font-semibold tabular tracking-tight text-fg">{s.value}</div>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WeekBars title={t('profile.evolution.chartTasks')} weeks={taskWeeks} color="rgb(var(--violet))" locale={settings.locale} />
        <WeekBars title={t('profile.evolution.chartNotes')} weeks={noteWeeks} color="rgb(var(--amber))" locale={settings.locale} />
      </div>
      {extra.interests.length > 0 && (
        <Surface>
          <h3 className="mb-3 font-semibold text-fg">{t('profile.evolution.byStatus')}</h3>
          <ul className="flex flex-col gap-2">
            {INTEREST_STATUSES.map((s) => {
              const n = extra.interests.filter((i) => i.status === s).length;
              return (
                <li key={s} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 text-muted">{t(`profile.status.${s}`)}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${(n / extra.interests.length) * 100}%` }} />
                  </span>
                  <span className="w-6 text-right tabular font-medium text-fg">{n}</span>
                </li>
              );
            })}
          </ul>
        </Surface>
      )}
    </section>
  );
}

function WeekBars({ title, weeks, color, locale }: { title: string; weeks: WeekBucket[]; color: string; locale: string }) {
  const { t } = useSettings();
  const max = Math.max(1, ...weeks.map((w) => w.count));
  return (
    <Surface>
      <h3 className="font-semibold text-fg">{title}</h3>
      <ul className="mt-4 flex h-36 items-end gap-2">
        {weeks.map((w) => {
          const label = t('profile.evolution.weekOf', { date: formatDateKey(w.start, locale, { day: 'numeric', month: 'short' }), count: w.count });
          return (
            <li key={w.start} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={label} aria-label={label}>
              <span className="text-xs tabular text-muted">{w.count || ''}</span>
              <span className="w-full rounded-t-md" style={{ height: `${Math.max(w.count ? 6 : 2, (w.count / max) * 100)}%`, background: w.count ? color : 'rgb(var(--surface-3))' }} />
              <span className="text-[0.6875rem] text-subtle">{formatDateKey(w.start, locale, { day: 'numeric', month: 'numeric' })}</span>
            </li>
          );
        })}
      </ul>
    </Surface>
  );
}

/* ---------- Minha história ---------- */

function HistoryTab() {
  const { t, settings } = useSettings();
  const toast = useToast();
  const items = useLiveQuery(() => loadTimeline(), []);
  const [showHidden, setShowHidden] = useState(false);
  const [date, setDate] = useState(todayKey());
  const [title, setTitle] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<TimelineItem | null>(null);

  const add = async () => {
    if (!title.trim()) return;
    const text = title;
    setTitle('');
    try {
      await addHistoryEntry(date, text);
      toast.show(t('profile.history.added'));
    } catch {
      setTitle(text);
      toast.show(t('errors.saveFailed'), 'error');
    }
  };

  if (!items) return <LoadingState label={t('common.loading')} lines={4} />;
  const hiddenCount = items.filter((i) => i.hidden).length;
  const list = items.filter((i) => showHidden || !i.hidden);
  const years = [...new Set(list.map((i) => i.date.slice(0, 4)))];

  return (
    <section className="flex flex-col gap-4">
      <Surface className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="lg:w-44">
          <Field label={t('profile.history.date')}>{(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value || todayKey())} />}</Field>
        </div>
        <div className="min-w-0 flex-1">
          <Field label={t('profile.history.what')}>
            {(id) => <Input id={id} value={title} maxLength={140} placeholder={t('profile.history.titlePlaceholder')} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} />}
          </Field>
        </div>
        <Button variant="primary" icon={<Plus className="h-4 w-4" />} disabled={!title.trim()} onClick={() => void add()}>
          {t('profile.history.add')}
        </Button>
      </Surface>

      {hiddenCount > 0 && (
        <Button variant="ghost" size="sm" className="w-fit" icon={showHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} onClick={() => setShowHidden(!showHidden)}>
          {showHidden ? t('profile.history.hideHidden') : t('profile.history.showHidden', { count: hiddenCount })}
        </Button>
      )}

      {list.length === 0 ? (
        <Surface tone="flat">
          <EmptyState icon={<History className="h-6 w-6" />} title={t('profile.history.emptyTitle')} body={t('profile.history.empty')} />
        </Surface>
      ) : (
        years.map((y) => (
          <div key={y}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-subtle">{y}</h3>
            <ol className="relative ml-3 flex flex-col gap-1 border-l-2 border-line pl-5">
              {list
                .filter((i) => i.date.startsWith(y))
                .map((i) => (
                  <TimelineRow key={i.key} item={i} locale={settings.locale} editing={editing === i.key} onEdit={() => setEditing(i.key)} onDone={() => setEditing(null)} onDelete={() => setDeleting(i)} />
                ))}
            </ol>
          </div>
        ))
      )}

      <ConfirmDialog
        open={!!deleting}
        title={t('profile.history.deleteTitle')}
        body={t('profile.history.deleteBody', { title: deleting?.title ?? '' })}
        confirmLabel={t('profile.history.delete')}
        cancelLabel={t('common.cancel')}
        danger
        onConfirm={() => {
          if (deleting) void deleteHistoryEntry(deleting.key.slice('manual:'.length));
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </section>
  );
}

const KIND_DOT: Record<TimelineItem['kind'], string> = {
  manual: 'bg-rose',
  interestStart: 'bg-violet',
  projectCreated: 'bg-amber',
  projectDone: 'bg-success',
  milestoneDone: 'bg-teal',
};

function TimelineRow({ item, locale, editing, onEdit, onDone, onDelete }: { item: TimelineItem; locale: string; editing: boolean; onEdit: () => void; onDone: () => void; onDelete: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [title, setTitle] = useState(item.title);
  const [date, setDate] = useState(item.date);
  const manual = item.kind === 'manual';

  const save = async () => {
    try {
      if (manual) await updateHistoryEntry(item.key.slice('manual:'.length), date, title);
      else await setOverride(item.key, { title });
      onDone();
    } catch {
      toast.show(t('errors.saveFailed'), 'error');
    }
  };

  return (
    <li className={cn('relative rounded-xl px-2 py-2', item.hidden && 'opacity-50')}>
      <span className={cn('absolute -left-[1.6rem] top-4 h-3 w-3 rounded-full ring-4 ring-bg', KIND_DOT[item.kind])} aria-hidden />
      {editing ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {manual && <Input type="date" aria-label={t('profile.history.date')} value={date} onChange={(e) => setDate(e.target.value || item.date)} className="sm:w-44" />}
          <Input autoFocus aria-label={t('profile.history.what')} value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} />
          <div className="flex gap-1">
            <Button size="sm" variant="primary" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => void save()}>
              {t('common.save')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDone}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted">
              {formatDateKey(item.date, locale, { day: 'numeric', month: 'long' })} · {t(`profile.history.kind.${item.kind}`)}
              {item.edited && ` · ${t('profile.history.edited')}`}
              {item.hidden && ` · ${t('profile.history.hiddenTag')}`}
            </div>
            {item.href ? (
              <Link to={item.href} className="block truncate font-medium text-fg hover:underline">
                {item.title}
              </Link>
            ) : (
              <div className="truncate font-medium text-fg">{item.title}</div>
            )}
            {item.context && <div className="truncate text-xs text-muted">{item.context}</div>}
          </div>
          <div className="flex shrink-0 gap-0.5">
            <IconButton
              size="sm"
              label={t('profile.history.edit')}
              icon={<PenLine className="h-4 w-4" />}
              onClick={() => {
                setTitle(item.title);
                setDate(item.date);
                onEdit();
              }}
            />
            {!manual && item.edited && <IconButton size="sm" label={t('profile.history.resetTitle')} icon={<RotateCcw className="h-4 w-4" />} onClick={() => void setOverride(item.key, { title: '' })} />}
            {manual ? (
              <IconButton size="sm" label={t('profile.history.delete')} icon={<Trash2 className="h-4 w-4" />} onClick={onDelete} />
            ) : (
              <IconButton
                size="sm"
                label={item.hidden ? t('profile.history.show') : t('profile.history.hide')}
                icon={item.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                onClick={() => void setOverride(item.key, { hidden: !item.hidden })}
              />
            )}
          </div>
        </div>
      )}
    </li>
  );
}

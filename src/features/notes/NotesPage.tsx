import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BookOpen, ChevronLeft, FolderClosed, Layers, LayoutTemplate, NotebookPen, Plus, RotateCcw, Search, Star, Trash2, X } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import {
  createCollection,
  createNote,
  createNotebook,
  deleteCollection,
  deleteNotebook,
  deleteTemplate,
  emptyNoteInput,
  purgeNote,
  restoreNote,
} from '@/data/notesRepo';
import { cloneBlocks, matchesNote, notePreview, type Note, type Notebook, type NoteTemplate } from '@/domain/notes';
import { LIST_COLORS } from '@/features/tasks/useTasksData';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Dialog } from '@/ui/Dialog';
import { Input } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { PageHeader } from '@/ui/PageHeader';
import { EmptyState, LoadingState } from '@/ui/States';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { NoteEditor } from './NoteEditor';
import { useNotesData, type NotesData } from './useNotesData';

type Filter = { kind: 'all' } | { kind: 'favorites' } | { kind: 'notebook'; id: string | null } | { kind: 'collection'; id: string };

export function NotesPage() {
  const { t, settings } = useSettings();
  const { id } = useParams();
  const navigate = useNavigate();
  const data = useNotesData();
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const [query, setQuery] = useState('');
  const [trashOpen, setTrashOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const toast = useToast();

  const list = useMemo(
    () =>
      data.notes.filter((n) => {
        if (filter.kind === 'favorites' && !n.favorite) return false;
        if (filter.kind === 'notebook' && n.notebookId !== filter.id) return false;
        if (filter.kind === 'collection' && !n.collectionIds.includes(filter.id)) return false;
        return matchesNote(n, query);
      }),
    [data.notes, filter, query],
  );
  const current = id ? data.notes.find((n) => n.id === id) : undefined;

  const create = async (tpl?: NoteTemplate) => {
    try {
      const note = await createNote(
        emptyNoteInput({
          ...(tpl ? { title: tpl.title, blocks: cloneBlocks(tpl.blocks), mode: 'blocks' as const } : {}),
          notebookId: filter.kind === 'notebook' ? filter.id : null,
          collectionIds: filter.kind === 'collection' ? [filter.id] : [],
          favorite: filter.kind === 'favorites',
        }),
      );
      setTemplatesOpen(false);
      navigate(`/notes/${note.id}`);
    } catch {
      toast.show(t('errors.saveFailed'), 'error');
    }
  };

  const fmt = new Intl.DateTimeFormat(settings.locale, { day: 'numeric', month: 'short' });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber/10 text-amber">
            <NotebookPen className="h-7 w-7" aria-hidden />
          </div>
        }
        title={t('modules.notes')}
        description={t('moduleSummary.notes')}
        actions={
          <>
            <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={() => setTrashOpen(true)}>
              {t('notes.trash')}
              {data.trash.length > 0 && <span className="rounded-full bg-surface-3 px-1.5 text-xs tabular">{data.trash.length}</span>}
            </Button>
            <Button variant="secondary" size="sm" icon={<LayoutTemplate className="h-4 w-4" aria-hidden />} onClick={() => setTemplatesOpen(true)}>
              {t('notes.fromTemplate')}
            </Button>
            <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => void create()}>
              {t('notes.newNote')}
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[13rem_18rem_1fr]">
        {/* Filtros: no iPad em pé e no celular somem quando uma nota está aberta. */}
        <aside className={cn('flex flex-col gap-5', current && 'hidden lg:flex')}>
          <Sidebar data={data} filter={filter} onFilter={setFilter} />
        </aside>

        <section aria-label={t('modules.notes')} className={cn('flex min-w-0 flex-col gap-3', current && 'hidden lg:flex')}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('notes.searchPlaceholder')} aria-label={t('notes.searchPlaceholder')} className="pl-9" />
          </div>
          {data.loading ? (
            <LoadingState label={t('common.loading')} lines={4} />
          ) : list.length === 0 ? (
            <EmptyState
              icon={<NotebookPen className="h-6 w-6" aria-hidden />}
              title={data.notes.length === 0 ? t('notes.emptyTitle') : t('notes.emptyFiltered')}
              body={data.notes.length === 0 ? t('notes.emptyBody') : undefined}
            />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {list.map((n) => (
                <li key={n.id}>
                  <Link
                    to={`/notes/${n.id}`}
                    aria-current={n.id === id ? 'page' : undefined}
                    className={cn('block rounded-xl px-3 py-2.5 ring-1 transition', n.id === id ? 'bg-accent/10 ring-accent/40' : 'bg-surface ring-line/60 hover:bg-surface-2')}
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium text-fg">{n.title || t('notes.untitled')}</span>
                      {n.favorite && <Star className="h-3.5 w-3.5 shrink-0 fill-amber text-amber" aria-label={t('notes.favorites')} />}
                      <span className="shrink-0 text-xs tabular text-subtle">{fmt.format(new Date(n.updatedAt))}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">{notePreview(n) || '—'}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={cn('min-w-0', !current && 'hidden lg:block')}>
          {current ? (
            <>
              <Link to="/notes" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-fg lg:hidden">
                <ChevronLeft className="h-4 w-4" aria-hidden />
                {t('notes.back')}
              </Link>
              <NoteEditor key={current.id} note={current} data={data} onDeleted={() => navigate('/notes')} />
            </>
          ) : (
            <div className="flex h-full min-h-[16rem] items-center justify-center rounded-2xl bg-surface-2/40 p-8 text-center text-sm text-muted ring-1 ring-line/50">
              {id && !data.loading ? t('errors.notFoundBody') : t('notes.selectHint')}
            </div>
          )}
        </section>
      </div>

      {templatesOpen && <TemplatesDialog data={data} onPick={(tpl) => void create(tpl)} onClose={() => setTemplatesOpen(false)} />}
      {trashOpen && <NotesTrashDialog data={data} onClose={() => setTrashOpen(false)} />}
    </div>
  );
}

function Sidebar({ data, filter, onFilter }: { data: NotesData; filter: Filter; onFilter: (f: Filter) => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [newNotebook, setNewNotebook] = useState('');
  const [newCollection, setNewCollection] = useState('');
  const [deletingNb, setDeletingNb] = useState<Notebook | null>(null);
  const count = (pred: (n: Note) => boolean) => data.notes.filter(pred).length;
  const item = (active: boolean, label: string, n: number, onClick: () => void, icon: ReactNode, extra?: ReactNode) => (
    <li className="group flex items-center gap-1">
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={cn('flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 text-left text-sm font-medium transition', active ? 'bg-accent/10 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg')}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="text-xs tabular text-subtle">{n}</span>
      </button>
      {extra}
    </li>
  );
  const fail = () => toast.show(t('errors.saveFailed'), 'error');

  return (
    <>
      <ul className="flex flex-col gap-0.5">
        {item(filter.kind === 'all', t('notes.all'), data.notes.length, () => onFilter({ kind: 'all' }), <BookOpen className="h-4 w-4" aria-hidden />)}
        {item(filter.kind === 'favorites', t('notes.favorites'), count((n) => n.favorite), () => onFilter({ kind: 'favorites' }), <Star className="h-4 w-4" aria-hidden />)}
      </ul>

      <div>
        <h2 className="px-3 pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-subtle">{t('notes.notebooks')}</h2>
        <ul className="flex flex-col gap-0.5">
          {data.notebooks.map((nb) =>
            item(
              filter.kind === 'notebook' && filter.id === nb.id,
              nb.name,
              count((n) => n.notebookId === nb.id),
              () => onFilter({ kind: 'notebook', id: nb.id }),
              <FolderClosed className="h-4 w-4" style={{ color: nb.color }} aria-hidden />,
              <IconButton size="sm" label={t('notes.deleteNotebook', { name: nb.name })} icon={<X className="h-3.5 w-3.5" />} className="opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => setDeletingNb(nb)} />,
            ),
          )}
          {item(filter.kind === 'notebook' && filter.id === null, t('notes.noNotebook'), count((n) => !n.notebookId), () => onFilter({ kind: 'notebook', id: null }), <FolderClosed className="h-4 w-4" aria-hidden />)}
        </ul>
        <form
          className="mt-1 flex gap-1 px-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (newNotebook.trim()) void createNotebook(newNotebook, LIST_COLORS[data.notebooks.length % LIST_COLORS.length]!).then(() => setNewNotebook(''), fail);
          }}
        >
          <Input value={newNotebook} onChange={(e) => setNewNotebook(e.target.value)} placeholder={t('notes.addNotebook')} aria-label={t('notes.notebookName')} className="h-9 text-sm" />
        </form>
      </div>

      <div>
        <h2 className="px-3 pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-subtle">{t('notes.collections')}</h2>
        <ul className="flex flex-col gap-0.5">
          {data.collections.map((c) =>
            item(
              filter.kind === 'collection' && filter.id === c.id,
              c.name,
              count((n) => n.collectionIds.includes(c.id)),
              () => onFilter({ kind: 'collection', id: c.id }),
              <Layers className="h-4 w-4" aria-hidden />,
              <IconButton
                size="sm"
                label={t('notes.deleteCollection', { name: c.name })}
                icon={<X className="h-3.5 w-3.5" />}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                onClick={() => {
                  void deleteCollection(c.id).catch(fail);
                  if (filter.kind === 'collection' && filter.id === c.id) onFilter({ kind: 'all' });
                }}
              />,
            ),
          )}
        </ul>
        <form
          className="mt-1 flex gap-1 px-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (newCollection.trim()) void createCollection(newCollection).then(() => setNewCollection(''), fail);
          }}
        >
          <Input value={newCollection} onChange={(e) => setNewCollection(e.target.value)} placeholder={t('notes.addCollection')} aria-label={t('notes.collectionName')} className="h-9 text-sm" />
        </form>
      </div>

      <ConfirmDialog
        open={!!deletingNb}
        danger
        title={deletingNb ? t('notes.deleteNotebookTitle', { name: deletingNb.name }) : ''}
        body={t('notes.deleteNotebookBody')}
        confirmLabel={deletingNb ? t('notes.deleteNotebook', { name: deletingNb.name }) : ''}
        cancelLabel={t('common.cancel')}
        onCancel={() => setDeletingNb(null)}
        onConfirm={() => {
          const target = deletingNb;
          setDeletingNb(null);
          if (target) {
            void deleteNotebook(target.id).catch(fail);
            if (filter.kind === 'notebook' && filter.id === target.id) onFilter({ kind: 'all' });
          }
        }}
      />
    </>
  );
}

function TemplatesDialog({ data, onPick, onClose }: { data: NotesData; onPick: (tpl: NoteTemplate) => void; onClose: () => void }) {
  const { t } = useSettings();
  return (
    <Dialog open onClose={onClose} closeLabel={t('common.close')} title={t('notes.templates')}>
      <ul className="grid gap-2 sm:grid-cols-2">
        {data.templates.map((tpl) => (
          <li key={tpl.id} className="flex items-stretch gap-1">
            <button type="button" onClick={() => onPick(tpl)} className="flex min-h-[3.5rem] flex-1 flex-col justify-center rounded-xl bg-surface-2 px-4 py-3 text-left ring-1 ring-line/60 hover:bg-surface-3">
              <span className="font-medium text-fg">{tpl.name}</span>
              <span className="mt-0.5 line-clamp-1 text-xs text-muted">{notePreview({ title: '', blocks: tpl.blocks }, 60) || tpl.blocks.length}</span>
            </button>
            {!tpl.builtin && <IconButton size="sm" label={t('notes.deleteTemplate', { name: tpl.name })} icon={<X className="h-4 w-4" />} className="self-center" onClick={() => void deleteTemplate(tpl.id)} />}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

function NotesTrashDialog({ data, onClose }: { data: NotesData; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [purging, setPurging] = useState<Note | null>(null);
  return (
    <>
      <Dialog open onClose={onClose} closeLabel={t('common.close')} title={t('notes.trash')}>
        {data.trash.length === 0 ? (
          <EmptyState icon={<Trash2 className="h-6 w-6" aria-hidden />} title={t('notes.trashEmpty')} />
        ) : (
          <ul className="flex flex-col divide-y divide-line/60">
            {data.trash.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-2 py-3">
                <span className="min-w-0 flex-1 truncate font-medium text-fg">{n.title || t('notes.untitled')}</span>
                <Button size="sm" icon={<RotateCcw className="h-4 w-4" aria-hidden />} onClick={() => void restoreNote(n.id)}>
                  {t('notes.restoreNote')}
                </Button>
                <Button size="sm" variant="danger" onClick={() => setPurging(n)}>
                  {t('notes.purge')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!purging}
        danger
        title={purging ? t('notes.purgeTitle', { title: purging.title || t('notes.untitled') }) : ''}
        body={t('notes.purgeBody')}
        confirmLabel={t('notes.purge')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setPurging(null)}
        onConfirm={() => {
          const target = purging;
          setPurging(null);
          if (target) void purgeNote(target.id).then(() => toast.show(t('notes.purge')));
        }}
      />
    </>
  );
}

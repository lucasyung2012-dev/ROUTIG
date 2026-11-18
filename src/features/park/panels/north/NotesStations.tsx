import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, History, LayoutTemplate, NotebookPen, PenTool, Plus, RotateCcw, Search, Star } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { createNote, createNotebook, emptyNoteInput, noteVersions, restoreVersion, saveNote, type NoteInput } from '@/data/notesRepo';
import { cloneBlocks, matchesNote, newBlock, notePreview, textToBlocks, type Note, type NoteTemplate } from '@/domain/notes';
import { NoteEditor } from '@/features/notes/NoteEditor';
import { useNotesData, type NotesData } from '@/features/notes/useNotesData';
import { LIST_COLORS } from '@/features/tasks/useTasksData';
import { Button } from '@/ui/Button';
import { Input, Select, Textarea } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { LoadingState } from '@/ui/States';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { ControlRoomLink, Empty, Pane, Station, useStationState } from './station';
import { handwrittenNotes } from './stationData';

/** Estações do Ateliê de Conhecimento: as mesmas notas do Notes, criadas e editadas aqui dentro. */
export type NotesStationId = 'reception' | 'writing' | 'advanced' | 'handwriting' | 'organize' | 'versions';

/** Os campos editáveis da nota, para gravar pelo mesmo `saveNote` do editor. */
function inputOf(n: Note): NoteInput {
  const { title, mode, blocks, notebookId, collectionIds, category, tags, favorite, links } = n;
  return { title, mode, blocks, notebookId, collectionIds, category, tags, favorite, links };
}

export function NotesStation({ id }: { id: NotesStationId }) {
  const { t } = useSettings();
  const data = useNotesData();
  // A nota aberta na mesa continua aberta ao sair e voltar à estação.
  const [openId, setOpenId] = useStationState<string | null>(`notes.open.${id}`, null);
  const label = t(`park.notes.sectors.${id}`);
  if (data.loading) return <LoadingState label={t('common.loading')} lines={3} />;
  const open = openId ? data.notes.find((n) => n.id === openId) : undefined;

  // Mesa de escrita: o editor real do Notes (salvamento automático e histórico), dentro da estação. No
  // Ateliê Manuscrito, o mesmo editor abre a página com o bloco de desenho (DrawingBlock: Apple Pencil,
  // com o botão de tela cheia, que cobre o 3D enquanto se escreve).
  if (open && id !== 'versions')
    return (
      <Station building="notes" label={label}>
        <Button size="sm" variant="ghost" className="w-fit" icon={<ChevronLeft className="h-4 w-4" />} onClick={() => setOpenId(null)}>
          {t('park.native.north.notes.backToDesk')}
        </Button>
        <NoteEditor key={open.id} note={open} data={data} onDeleted={() => setOpenId(null)} />
        <ControlRoomLink to={`/notes/${open.id}`} />
      </Station>
    );

  return (
    <Station building="notes" label={label}>
      <p className="text-sm text-muted">{t(`park.native.north.notes.hints.${id}`)}</p>
      {id === 'reception' && <Reception data={data} onOpen={setOpenId} />}
      {id === 'writing' && <Writing data={data} onOpen={setOpenId} />}
      {id === 'advanced' && <Advanced data={data} onOpen={setOpenId} />}
      {id === 'handwriting' && <Handwriting data={data} onOpen={setOpenId} />}
      {id === 'organize' && <Organize data={data} onOpen={setOpenId} />}
      {id === 'versions' && <Versions data={data} selected={openId} onSelect={setOpenId} />}
      <ControlRoomLink to="/notes" />
    </Station>
  );
}

function NoteList({ notes, onOpen, empty, extra }: { notes: Note[]; onOpen: (id: string) => void; empty: string; extra?: (n: Note) => ReactNode }) {
  const { t, settings } = useSettings();
  const fmt = new Intl.DateTimeFormat(settings.locale, { day: 'numeric', month: 'short' });
  if (notes.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="flex flex-col gap-1.5">
      {notes.map((n) => (
        <li key={n.id} className="flex items-center gap-2 rounded-xl bg-surface/70 px-3 py-2 ring-1 ring-inset ring-line/50">
          <button type="button" onClick={() => onOpen(n.id)} className="min-w-0 flex-1 text-left">
            <span className="flex items-center gap-1.5">
              {n.favorite && <Star className="h-3.5 w-3.5 shrink-0 fill-warning text-warning" aria-hidden />}
              <span className="truncate text-sm font-medium text-fg">{n.title || t('notes.untitled')}</span>
            </span>
            <span className="block truncate text-xs text-muted">{[fmt.format(new Date(n.updatedAt)), notePreview(n, 70)].filter(Boolean).join(' · ')}</span>
          </button>
          {extra?.(n)}
        </li>
      ))}
    </ul>
  );
}

/* ---------- Recepção de Cadernos: captura rápida e busca ---------- */

function Reception({ data, onOpen }: { data: NotesData; onOpen: (id: string) => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [text, setText] = useStationState('notes.capture', '');
  const [q, setQ] = useState('');
  const capture = async () => {
    try {
      await createNote(emptyNoteInput({ title: title.trim(), blocks: textToBlocks(text) }));
      setTitle('');
      setText('');
      toast.show(t('park.native.north.notes.captured'));
    } catch {
      toast.show(t('errors.saveFailed'), 'error');
    }
  };
  const list = q.trim() ? data.notes.filter((n) => matchesNote(n, q)) : data.notes;
  return (
    <>
      <Pane title={t('park.native.north.notes.quickCapture')}>
        <Input aria-label={t('notes.titlePlaceholder')} placeholder={t('notes.titlePlaceholder')} value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />
        <Textarea aria-label={t('park.native.north.notes.captureText')} placeholder={t('notes.quickPlaceholder')} rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        <Button variant="primary" size="sm" icon={<NotebookPen className="h-4 w-4" />} disabled={!title.trim() && !text.trim()} onClick={() => void capture()}>
          {t('park.native.north.notes.saveNote')}
        </Button>
      </Pane>
      <Pane title={t('park.inbox.recent')}>
        <label className="relative block">
          <span className="sr-only">{t('notes.searchPlaceholder')}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input className="pl-9" placeholder={t('notes.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <NoteList notes={list.slice(0, 8)} onOpen={onOpen} empty={q.trim() ? t('notes.emptyFiltered') : t('park.notes.empty')} />
      </Pane>
    </>
  );
}

/* ---------- Estúdio de Escrita: nova nota no modo rápido e as recentes ---------- */

function useCreateAndOpen(onOpen: (id: string) => void) {
  const { t } = useSettings();
  const toast = useToast();
  return async (input: NoteInput) => {
    try {
      const n = await createNote(input);
      onOpen(n.id);
    } catch {
      toast.show(t('errors.saveFailed'), 'error');
    }
  };
}

function Writing({ data, onOpen }: { data: NotesData; onOpen: (id: string) => void }) {
  const { t } = useSettings();
  const create = useCreateAndOpen(onOpen);
  return (
    <>
      <Button variant="primary" size="sm" className="w-fit" icon={<NotebookPen className="h-4 w-4" />} onClick={() => void create(emptyNoteInput())}>
        {t('notes.newNote')}
      </Button>
      <Pane title={t('park.native.north.notes.continueWriting')}>
        <NoteList notes={data.notes.filter((n) => n.mode === 'quick').slice(0, 8)} onOpen={onOpen} empty={t('park.notes.empty')} />
      </Pane>
    </>
  );
}

/* ---------- Oficina de Edição: blocos e modelos ---------- */

function Advanced({ data, onOpen }: { data: NotesData; onOpen: (id: string) => void }) {
  const { t } = useSettings();
  const create = useCreateAndOpen(onOpen);
  const fromTemplate = (tpl: NoteTemplate) => void create(emptyNoteInput({ title: tpl.title, blocks: cloneBlocks(tpl.blocks), mode: 'blocks' }));
  return (
    <>
      <Button variant="primary" size="sm" className="w-fit" icon={<Plus className="h-4 w-4" />} onClick={() => void create(emptyNoteInput({ mode: 'blocks' }))}>
        {t('park.native.north.notes.newBlocks')}
      </Button>
      <Pane title={t('notes.templates')}>
        <ul className="flex flex-wrap gap-1.5">
          {data.templates.map((tpl) => (
            <li key={tpl.id}>
              <button type="button" onClick={() => fromTemplate(tpl)} className="inline-flex items-center gap-1.5 rounded-full bg-surface/70 px-3 py-1.5 text-sm text-fg ring-1 ring-inset ring-line hover:bg-surface-3">
                <LayoutTemplate className="h-3.5 w-3.5 text-muted" aria-hidden />
                {tpl.name}
              </button>
            </li>
          ))}
        </ul>
      </Pane>
      <Pane title={t('park.native.north.notes.blockNotes')}>
        <NoteList notes={data.notes.filter((n) => n.mode === 'blocks').slice(0, 8)} onOpen={onOpen} empty={t('park.native.north.notes.noBlockNotes')} />
      </Pane>
    </>
  );
}

/* ---------- Ateliê Manuscrito: Apple Pencil no editor do Notes, dentro da estação ---------- */

function Handwriting({ data, onOpen }: { data: NotesData; onOpen: (id: string) => void }) {
  const { t } = useSettings();
  // A nota nova é a mesma do Notes (modo blocos com um bloco de desenho) e abre na mesa da estação.
  const create = useCreateAndOpen(onOpen);
  return (
    <>
      <Button variant="primary" size="sm" className="w-fit" icon={<PenTool className="h-4 w-4" />} onClick={() => void create(emptyNoteInput({ mode: 'blocks', blocks: [newBlock('drawing')] }))}>
        {t('park.native.north.notes.newDrawing')}
      </Button>
      <Pane title={t('park.native.north.notes.drawings')}>
        <NoteList notes={handwrittenNotes(data.notes).slice(0, 8)} onOpen={onOpen} empty={t('park.native.north.notes.noDrawings')} />
      </Pane>
    </>
  );
}

/* ---------- Sala de Organização: cadernos e favoritas ---------- */

function Organize({ data, onOpen }: { data: NotesData; onOpen: (id: string) => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [name, setName] = useState('');
  const [shelf, setShelf] = useStationState<string>('notes.shelf', 'all');
  const save = (n: Note, patch: Partial<NoteInput>) => void saveNote(n.id, { ...inputOf(n), ...patch }).catch(() => toast.show(t('errors.saveFailed'), 'error'));
  const addNotebook = async () => {
    try {
      await createNotebook(name, LIST_COLORS[data.notebooks.length % LIST_COLORS.length]!);
      setName('');
    } catch {
      toast.show(t('errors.saveFailed'), 'error');
    }
  };
  const shown = data.notes.filter((n) => (shelf === 'all' ? true : shelf === 'fav' ? n.favorite : shelf === 'none' ? n.notebookId === null : n.notebookId === shelf));
  const chip = (key: string, label: string, count: number, color?: string) => (
    <button key={key} type="button" aria-pressed={shelf === key} onClick={() => setShelf(key)} className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ring-1 ring-inset', shelf === key ? 'bg-accent/15 text-accent ring-accent/40' : 'bg-surface/70 text-muted ring-line hover:text-fg')}>
      {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />}
      {label}
      <span className="tabular-nums text-xs opacity-70">{count}</span>
    </button>
  );
  return (
    <>
      <Pane title={t('notes.notebooks')}>
        <div className="flex flex-wrap gap-1.5">
          {chip('all', t('notes.all'), data.notes.length)}
          {chip('fav', t('notes.favorites'), data.notes.filter((n) => n.favorite).length)}
          {data.notebooks.map((b) => chip(b.id, b.name, data.notes.filter((n) => n.notebookId === b.id).length, b.color))}
          {chip('none', t('notes.noNotebook'), data.notes.filter((n) => n.notebookId === null).length)}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void addNotebook();
          }}
        >
          <Input aria-label={t('notes.notebookName')} placeholder={t('notes.addNotebook')} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" size="sm" variant="secondary" className="h-11" icon={<Plus className="h-4 w-4" />} disabled={!name.trim()}>
            {t('park.native.north.create')}
          </Button>
        </form>
      </Pane>
      <Pane>
        <NoteList
          notes={shown.slice(0, 20)}
          onOpen={onOpen}
          empty={t('notes.emptyFiltered')}
          extra={(n) => (
            <>
              <Select aria-label={`${t('notes.notebook')}: ${n.title || t('notes.untitled')}`} value={n.notebookId ?? ''} onChange={(e) => save(n, { notebookId: e.target.value || null })} className="h-9 w-32 shrink-0 text-xs">
                <option value="">{t('notes.noNotebook')}</option>
                {data.notebooks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
              <IconButton size="sm" label={n.favorite ? t('notes.unfavorite') : t('notes.favorite')} icon={<Star className={cn('h-4 w-4', n.favorite && 'fill-warning text-warning')} />} onClick={() => save(n, { favorite: !n.favorite })} />
            </>
          )}
        />
      </Pane>
    </>
  );
}

/* ---------- Arquivo de Versões: histórico e restauração ---------- */

function Versions({ data, selected, onSelect }: { data: NotesData; selected: string | null; onSelect: (id: string | null) => void }) {
  const { t } = useSettings();
  const [q, setQ] = useState('');
  const note = selected ? data.notes.find((n) => n.id === selected) : undefined;
  if (note)
    return (
      <>
        <Button size="sm" variant="ghost" className="w-fit" icon={<ChevronLeft className="h-4 w-4" />} onClick={() => onSelect(null)}>
          {t('park.native.north.notes.otherNote')}
        </Button>
        <VersionList note={note} />
      </>
    );
  const list = q.trim() ? data.notes.filter((n) => matchesNote(n, q)) : data.notes;
  return (
    <Pane title={t('park.native.north.notes.pickNote')}>
      <Input aria-label={t('notes.searchPlaceholder')} placeholder={t('notes.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
      <NoteList notes={list.slice(0, 12)} onOpen={onSelect} empty={q.trim() ? t('notes.emptyFiltered') : t('park.notes.empty')} />
    </Pane>
  );
}

function VersionList({ note }: { note: Note }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const versions = useLiveQuery(() => noteVersions(note.id), [note.id, note.rev]);
  const fmt = new Intl.DateTimeFormat(settings.locale, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <Pane title={note.title || t('notes.untitled')} action={<History className="h-4 w-4 text-muted" aria-hidden />}>
      <p className="text-xs text-muted">{t('notes.historyHint')}</p>
      {!versions ? (
        <LoadingState label={t('common.loading')} lines={2} />
      ) : versions.length === 0 ? (
        <Empty>{t('notes.noVersions')}</Empty>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {versions.map((v) => (
            <li key={v.id} className="flex items-center gap-2 rounded-xl bg-surface/70 px-3 py-2 ring-1 ring-inset ring-line/50">
              <span className="min-w-0 flex-1">
                <span className="block text-sm tabular-nums text-fg">{fmt.format(new Date(v.at))}</span>
                <span className="block truncate text-xs text-muted">{v.title || t('notes.untitled')} · {notePreview(v, 60)}</span>
              </span>
              <Button
                size="sm"
                variant="secondary"
                icon={<RotateCcw className="h-4 w-4" />}
                onClick={() => void restoreVersion(note.id, v.id).then(() => toast.show(t('notes.restored')), () => toast.show(t('errors.saveFailed'), 'error'))}
              >
                {t('park.native.north.notes.restore')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Pane>
  );
}

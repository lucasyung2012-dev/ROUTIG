import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarDays, FolderKanban, History, ImagePlus, LayoutTemplate, ListTodo, Paperclip, PenTool, Star, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getDb } from '@/data/db';
import { useSettings } from '@/app/SettingsProvider';
import { noteVersions, restoreNote, restoreVersion, saveAsTemplate, saveNote, softDeleteNote, type NoteInput } from '@/data/notesRepo';
import { blocksToText, newBlock, noteText, textToBlocks, type Block, type Note } from '@/domain/notes';
import { normalizeTags } from '@/domain/tasks';
import { useEventEditor } from '@/features/calendar/EventEditor';
import { useCalendarData } from '@/features/calendar/useCalendarData';
import { useTaskEditor } from '@/features/tasks/TaskEditor';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { Segmented } from '@/ui/Segmented';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { AutoTextarea, BlockEditor } from './BlockEditor';
import type { NotesData } from './useNotesData';

function inputOf(n: Note): NoteInput {
  const { title, mode, blocks, notebookId, collectionIds, category, tags, favorite, links } = n;
  return { title, mode, blocks, notebookId, collectionIds, category, tags, favorite, links };
}

/** Editor de uma nota: salva sozinho (Parte 17.4) e guarda versões no histórico. */
export function NoteEditor({ note, data, onDeleted }: { note: Note; data: NotesData; onDeleted: () => void }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const [draft, setDraft] = useState<NoteInput>(() => inputOf(note));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const dirty = useRef(false);
  const timer = useRef<number>();
  const lastRev = useRef(note.rev);
  const latest = useRef(draft);
  latest.current = draft;

  // Mudança vinda de fora (outra aba, restaurar versão): atualiza se não houver edição pendente.
  useEffect(() => {
    if (note.rev !== lastRev.current && !dirty.current) {
      lastRev.current = note.rev;
      setDraft(inputOf(note));
    }
  }, [note]);

  const flush = async () => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    setStatus('saving');
    try {
      const saved = await saveNote(note.id, latest.current);
      lastRev.current = saved.rev;
      dirty.current = false;
      setStatus('saved');
    } catch {
      toast.show(t('errors.saveFailed'), 'error');
      setStatus('idle');
    }
  };

  // Salva ao sair da nota ou fechar o app.
  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
      void flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  const change = (patch: Partial<NoteInput>) => {
    setDraft((d) => ({ ...d, ...patch }));
    dirty.current = true;
    setStatus('idle');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 700);
  };

  const trash = async () => {
    await flush();
    await softDeleteNote(note.id);
    onDeleted();
    toast.show(t('notes.movedToTrash'), 'success', { label: t('notes.undo'), run: () => void restoreNote(note.id) });
  };

  const { text, rest } = blocksToText(draft.blocks);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label={t('notes.modeLabel')}
          value={draft.mode}
          onChange={(mode) => change({ mode })}
          options={[
            { value: 'quick', label: t('notes.modeQuick') },
            { value: 'blocks', label: t('notes.modeBlocks') },
          ]}
        />
        <span className="ml-1 text-xs text-subtle" aria-live="polite">
          {status === 'saving' ? t('notes.saving') : status === 'saved' ? t('notes.saved') : ''}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <IconButton
            label={draft.favorite ? t('notes.unfavorite') : t('notes.favorite')}
            active={draft.favorite}
            icon={<Star className={cn('h-[18px] w-[18px]', draft.favorite && 'fill-amber text-amber')} />}
            onClick={() => change({ favorite: !draft.favorite })}
          />
          <IconButton label={t('notes.history')} icon={<History className="h-[18px] w-[18px]" />} onClick={() => void flush().then(() => setHistoryOpen(true))} />
          <IconButton label={t('notes.saveAsTemplate')} icon={<LayoutTemplate className="h-[18px] w-[18px]" />} onClick={() => setTemplateOpen(true)} />
          <IconButton label={t('notes.moveToTrash')} icon={<Trash2 className="h-[18px] w-[18px]" />} className="hover:text-danger" onClick={() => void trash()} />
        </div>
      </div>

      <AutoTextarea
        value={draft.title}
        maxLength={300}
        aria-label={t('notes.titlePlaceholder')}
        placeholder={t('notes.titlePlaceholder')}
        onChange={(e) => change({ title: e.target.value.replace(/\n/g, ' ') })}
        className="text-2xl font-semibold tracking-tight text-fg placeholder:text-subtle sm:text-3xl"
      />

      <MetaRow draft={draft} data={data} onChange={change} />

      <div className="min-h-[16rem] rounded-2xl bg-surface p-3 ring-1 ring-line/60 sm:p-5">
        {draft.mode === 'quick' ? (
          <div className="flex flex-col gap-4">
            <AutoTextarea
              value={text}
              aria-label={t('notes.modeQuick')}
              placeholder={t('notes.quickPlaceholder')}
              onChange={(e) => change({ blocks: [...textToBlocks(e.target.value), ...rest] })}
              className="min-h-[12rem] text-[0.9375rem] leading-relaxed text-fg placeholder:text-subtle"
            />
            {rest.length > 0 && <BlockEditor blocks={rest} hideAddBar allowEmpty onChange={(r) => change({ blocks: [...textToBlocks(text), ...r] })} />}
            <div className="flex flex-wrap gap-1.5 border-t border-line/60 pt-3">
              {([
                ['image', ImagePlus],
                ['file', Paperclip],
                ['drawing', PenTool],
              ] as const).map(([type, Icon]) => (
                <Button key={type} size="sm" variant="ghost" icon={<Icon className="h-4 w-4" aria-hidden />} onClick={() => change({ blocks: [...draft.blocks, newBlock(type)] })}>
                  {t(`notes.blocks.${type}`)}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <BlockEditor blocks={draft.blocks} onChange={(blocks: Block[]) => change({ blocks })} />
        )}
      </div>

      <p className="text-xs text-subtle">{t('notes.updatedAt', { date: new Intl.DateTimeFormat(settings.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(note.updatedAt)) })}</p>

      {historyOpen && <HistoryDialog note={note} onClose={() => setHistoryOpen(false)} />}
      {templateOpen && <TemplateDialog title={draft.title} blocks={draft.blocks} onClose={() => setTemplateOpen(false)} />}
    </div>
  );
}

function MetaRow({ draft, data, onChange }: { draft: NoteInput; data: NotesData; onChange: (p: Partial<NoteInput>) => void }) {
  const { t } = useSettings();
  const cal = useCalendarData();
  const tasks = useTaskEditor();
  const events = useEventEditor();
  const [tags, setTags] = useState(draft.tags.join(', '));
  useEffect(() => setTags(draft.tags.join(', ')), [draft.tags]);

  const navigate = useNavigate();
  const projects = useLiveQuery(() => getDb().projects.filter((p) => !p.deletedAt).toArray(), []);
  const linkLabel = (type: string, id: string) =>
    type === 'task'
      ? cal.tasks.byId.get(id)?.title
      : type === 'event'
        ? cal.events.find((e) => e.id === id)?.title
        : type === 'project'
          ? projects?.find((p) => p.id === id)?.name
          : undefined;
  const openLink = (type: string, id: string) => {
    if (type === 'task') tasks.openTask(id);
    else if (type === 'event') events.openEvent(id, cal.events.find((e) => e.id === id)?.start ?? '');
    else if (type === 'project') navigate(`/projects/${id}`);
  };

  return (
    <details className="group rounded-2xl bg-surface-2/50 ring-1 ring-line/60 open:bg-surface-2/70">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3 text-sm text-muted">
        <span className="font-medium text-fg">{data.notebooks.find((n) => n.id === draft.notebookId)?.name ?? t('notes.noNotebook')}</span>
        {draft.category && <span>· {draft.category}</span>}
        {draft.tags.map((tag) => (
          <span key={tag} className="rounded-md bg-surface-3 px-1.5 py-0.5 text-xs">
            #{tag}
          </span>
        ))}
        {draft.links.length > 0 && <span>· {t('notes.links')}: {draft.links.length}</span>}
        <span className="ml-auto text-xs text-accent group-open:hidden">▾</span>
      </summary>
      <div className="grid gap-4 border-t border-line/60 p-4 sm:grid-cols-2">
        <Field label={t('notes.notebook')}>
          {(id) => (
            <Select id={id} value={draft.notebookId ?? ''} onChange={(e) => onChange({ notebookId: e.target.value || null })}>
              <option value="">{t('notes.noNotebook')}</option>
              {data.notebooks.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('notes.category')}>
          {(id) => (
            <>
              <Input id={id} list="note-categories" value={draft.category} maxLength={60} onChange={(e) => onChange({ category: e.target.value })} />
              <datalist id="note-categories">
                {data.categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label={t('notes.tags')} hint="#escola, #alemão">
          {(id, d) => <Input id={id} aria-describedby={d} value={tags} onChange={(e) => setTags(e.target.value)} onBlur={() => onChange({ tags: normalizeTags(tags.split(',')) })} />}
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-fg">{t('notes.collectionsField')}</span>
          <div className="flex flex-wrap gap-1.5">
            {data.collections.map((c) => {
              const on = draft.collectionIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange({ collectionIds: on ? draft.collectionIds.filter((x) => x !== c.id) : [...draft.collectionIds, c.id] })}
                  className={cn('h-9 rounded-lg px-3 text-sm font-medium ring-1 transition', on ? 'bg-accent/15 text-accent ring-accent/40' : 'bg-surface text-muted ring-line')}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-sm font-medium text-fg">{t('notes.links')}</span>
          <div className="flex flex-wrap gap-1.5">
            {draft.links.map((l) => (
              <span key={`${l.type}:${l.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2 py-1 text-sm ring-1 ring-line">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-fg hover:text-accent"
                  onClick={() => openLink(l.type, l.id)}
                >
                  {l.type === 'task' ? (
                    <ListTodo className="h-3.5 w-3.5 text-violet" aria-hidden />
                  ) : l.type === 'project' ? (
                    <FolderKanban className="h-3.5 w-3.5 text-amber" aria-hidden />
                  ) : (
                    <CalendarDays className="h-3.5 w-3.5 text-blue" aria-hidden />
                  )}
                  {linkLabel(l.type, l.id) ?? '—'}
                </button>
                <button type="button" aria-label={t('notes.removeLink')} className="text-subtle hover:text-danger" onClick={() => onChange({ links: draft.links.filter((x) => x !== l) })}>
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </span>
            ))}
          </div>
          <Select
            aria-label={t('notes.addLink')}
            value=""
            onChange={(e) => {
              const [type, id] = e.target.value.split(':');
              if (type && id && !draft.links.some((l) => l.type === type && l.id === id)) onChange({ links: [...draft.links, { type, id }] });
            }}
          >
            <option value="">{t('notes.addLink')}</option>
            {(projects ?? []).map((x) => (
              <option key={x.id} value={`project:${x.id}`}>
                {t('quick.project')}: {x.name}
              </option>
            ))}
            {cal.tasks.active.map((x) => (
              <option key={x.id} value={`task:${x.id}`}>
                {t('calendar.kindTask')}: {x.title}
              </option>
            ))}
            {cal.events.map((x) => (
              <option key={x.id} value={`event:${x.id}`}>
                {t('quick.event')}: {x.title}
              </option>
            ))}
          </Select>
          <p className="text-xs text-subtle">{t('notes.linksLater')}</p>
        </div>
      </div>
    </details>
  );
}

function HistoryDialog({ note, onClose }: { note: Note; onClose: () => void }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const versions = useLiveQuery(() => noteVersions(note.id), [note.id, note.rev]);
  const [selected, setSelected] = useState<string | null>(null);
  const fmt = new Intl.DateTimeFormat(settings.locale, { dateStyle: 'medium', timeStyle: 'short' });
  const current = versions?.find((v) => v.id === selected);

  return (
    <Dialog open size="lg" onClose={onClose} closeLabel={t('common.close')} title={t('notes.history')} description={t('notes.historyHint')}>
      {!versions?.length ? (
        <p className="py-6 text-center text-sm text-muted">{t('notes.noVersions')}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {versions.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  aria-pressed={selected === v.id}
                  onClick={() => setSelected(v.id)}
                  className={cn('w-full rounded-lg px-3 py-2 text-left text-sm tabular', selected === v.id ? 'bg-accent/15 text-fg' : 'text-muted hover:bg-surface-2')}
                >
                  {fmt.format(new Date(v.at))}
                </button>
              </li>
            ))}
          </ul>
          <div className="min-w-0 rounded-xl bg-surface-2/60 p-4 ring-1 ring-line/60">
            {current ? (
              <>
                <div className="text-xs font-semibold uppercase tracking-wider text-subtle">{t('notes.preview')}</div>
                <div className="mt-2 font-semibold text-fg">{current.title || t('notes.untitled')}</div>
                <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap font-sans text-sm text-muted">{noteText({ title: '', blocks: current.blocks })}</pre>
                <Button
                  className="mt-4"
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    void restoreVersion(note.id, current.id).then(() => {
                      toast.show(t('notes.restored'));
                      onClose();
                    })
                  }
                >
                  {t('notes.restore')}
                </Button>
              </>
            ) : (
              <p className="text-sm text-subtle">{t('notes.selectHint')}</p>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}

function TemplateDialog({ title, blocks, onClose }: { title: string; blocks: Block[]; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [name, setName] = useState(title);
  return (
    <Dialog
      open
      size="sm"
      onClose={onClose}
      closeLabel={t('common.cancel')}
      title={t('notes.saveAsTemplate')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim()}
            onClick={() =>
              void saveAsTemplate(name, title, blocks).then(() => {
                toast.show(t('notes.templateSaved'));
                onClose();
              })
            }
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Field label={t('notes.templateName')}>{(id) => <Input id={id} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />}</Field>
    </Dialog>
  );
}

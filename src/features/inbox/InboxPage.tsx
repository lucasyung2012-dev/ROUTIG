import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Archive,
  CalendarPlus,
  Clock,
  FileText,
  Image as ImageIcon,
  Inbox as InboxIcon,
  Link2,
  ListTodo,
  Mic,
  NotebookPen,
  Paperclip,
  RotateCcw,
  Square,
  Trash2,
} from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import {
  archive,
  captureFile,
  captureText,
  convertToEvent,
  convertToNote,
  convertToTask,
  InboxRuleError,
  reopen,
  restoreItem,
  snooze,
  softDeleteItem,
  unsnooze,
} from '@/data/inboxRepo';
import { addDays, formatDateKey, todayKey, type DateKey } from '@/domain/dates';
import { emptyEventInput } from '@/domain/events';
import { findDuplicates, suggest, type InboxItem, type Suggestion } from '@/domain/inbox';
import { emptyTaskInput, normalizeTags } from '@/domain/tasks';
import { useEventEditor } from '@/features/calendar/EventEditor';
import { useCalendarData } from '@/features/calendar/useCalendarData';
import { useTaskEditor } from '@/features/tasks/TaskEditor';
import { useObjectUrl } from '@/features/files/useObjectUrl';
import { useNavigate } from 'react-router-dom';
import { textToBlocks, type Block } from '@/domain/notes';
import { emptyNoteInput } from '@/data/notesRepo';
import { formatBytes } from '@/services/storage';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field, Input } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { EmptyState, LoadingState } from '@/ui/States';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';

type Tab = 'open' | 'snoozed' | 'processed' | 'archived';
const TABS: Tab[] = ['open', 'snoozed', 'processed', 'archived'];

export function InboxPage() {
  const { t } = useSettings();
  const items = useLiveQuery(() => getDb().inbox.orderBy('createdAt').reverse().toArray(), []);
  const [tab, setTab] = useState<Tab>('open');
  const today = todayKey();

  const groups = useMemo(() => {
    const list = (items ?? []).filter((i) => !i.deletedAt);
    return {
      open: list.filter((i) => i.status === 'open' && (!i.snoozedUntil || i.snoozedUntil <= today)),
      snoozed: list.filter((i) => i.status === 'open' && i.snoozedUntil && i.snoozedUntil > today),
      processed: list.filter((i) => i.status === 'processed'),
      archived: list.filter((i) => i.status === 'archived'),
    } satisfies Record<Tab, InboxItem[]>;
  }, [items, today]);

  const shown = groups[tab];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface-3 text-muted">
            <InboxIcon className="h-7 w-7" aria-hidden />
          </div>
        }
        title={t('modules.inbox')}
        description={t('moduleSummary.inbox')}
      />

      <CaptureBox />

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div role="tablist" aria-label={t('modules.inbox')} className="inline-flex gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-inset ring-line">
          {TABS.map((id) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn('inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition', tab === id ? 'bg-surface text-fg shadow-soft ring-1 ring-line' : 'text-muted hover:text-fg')}
            >
              {t(`inbox.tabs.${id}`)}
              <span className="rounded-full bg-surface-3 px-1.5 text-xs tabular">{groups[id].length}</span>
            </button>
          ))}
        </div>
      </div>

      {!items ? (
        <LoadingState label={t('common.loading')} lines={4} />
      ) : shown.length === 0 ? (
        <EmptyState icon={<InboxIcon className="h-6 w-6" aria-hidden />} title={t(`inbox.empty.${tab}`)} body={tab === 'open' ? t('inbox.empty.openBody') : undefined} />
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((item) => (
            <li key={item.id}>
              <ItemCard item={item} openItems={groups.open} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Captura ---------- */

function CaptureBox() {
  const { t } = useSettings();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const recorder = useAudioRecorder(async (blob, name) => {
    await saveFile(blob, name);
  });

  const reportError = (e: unknown) => {
    if (e instanceof InboxRuleError && e.code === 'too_large') toast.show(t('inbox.fileTooLarge'), 'error');
    else if (e instanceof InboxRuleError && e.code === 'quota') toast.show(t('inbox.quota'), 'error');
    else toast.show(t('errors.saveFailed'), 'error');
  };

  const saveText = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await captureText(text);
      setText('');
      toast.show(t('inbox.captured'));
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  };

  const saveFile = async (blob: Blob, name: string) => {
    setBusy(true);
    try {
      const r = await captureFile(blob, name, text);
      setText('');
      toast.show(r.reusedFile ? t('inbox.fileReused') : t('inbox.captured'), r.reusedFile ? 'info' : 'success');
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-3xl bg-surface p-3 shadow-soft ring-1 ring-line/70 sm:p-4">
      <label htmlFor="inbox-capture" className="sr-only">
        {t('inbox.capturePlaceholder')}
      </label>
      <textarea
        id="inbox-capture"
        value={text}
        rows={2}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void saveText();
          }
        }}
        placeholder={t('inbox.capturePlaceholder')}
        className="w-full resize-none bg-transparent px-2 py-1.5 text-base leading-relaxed text-fg placeholder:text-subtle focus:outline-none"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line/60 pt-3">
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void saveFile(f, f.name);
            e.target.value = '';
          }}
        />
        <Button size="sm" variant="ghost" icon={<Paperclip className="h-4 w-4" aria-hidden />} onClick={() => fileInput.current?.click()} disabled={busy}>
          {t('inbox.addFile')}
        </Button>
        {recorder.supported ? (
          recorder.recording ? (
            <Button size="sm" variant="danger" icon={<Square className="h-4 w-4" aria-hidden />} onClick={recorder.stop}>
              {t('inbox.stopRecording')} · {t('inbox.recording', { seconds: recorder.seconds })}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              icon={<Mic className="h-4 w-4" aria-hidden />}
              disabled={busy}
              onClick={() => void recorder.start().catch(() => toast.show(t('inbox.micDenied'), 'error'))}
            >
              {t('inbox.record')}
            </Button>
          )
        ) : (
          <span className="text-xs text-subtle">{t('inbox.audioUnsupported')}</span>
        )}
        <span className="hidden text-xs text-subtle md:inline">{t('inbox.captureHint')}</span>
        <Button size="sm" variant="primary" className="ml-auto" onClick={() => void saveText()} disabled={!text.trim()} loading={busy}>
          {t('inbox.capture')}
        </Button>
      </div>
    </div>
  );
}

/** Gravação de áudio com MediaRecorder, quando o navegador permite. */
function useAudioRecorder(onDone: (blob: Blob, name: string) => Promise<void>) {
  const supported = typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<number>();

  useEffect(() => () => window.clearInterval(timer.current), []);

  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream);
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop());
      window.clearInterval(timer.current);
      setRecording(false);
      const type = r.mimeType || 'audio/webm';
      const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      void onDone(new Blob(chunks, { type }), `audio-${stamp}.${ext}`);
    };
    r.start();
    rec.current = r;
    setSeconds(0);
    setRecording(true);
    timer.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
  };

  return { supported, recording, seconds, start, stop: () => rec.current?.stop() };
}

/* ---------- Item ---------- */

function ItemCard({ item, openItems }: { item: InboxItem; openItems: InboxItem[] }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const tasks = useTaskEditor();
  const events = useEventEditor();
  const navigate = useNavigate();
  const fileUrl = useObjectUrl(item.fileId);
  const s = useMemo(() => suggest(item), [item]);
  const [converting, setConverting] = useState<'task' | 'event' | 'note' | null>(null);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const fmt = new Intl.DateTimeFormat(settings.locale, { dateStyle: 'medium', timeStyle: 'short' });
  const KindIcon = item.kind === 'image' ? ImageIcon : item.kind === 'audio' ? Mic : item.kind === 'file' ? FileText : item.kind === 'link' ? Link2 : InboxIcon;

  const act = (p: Promise<unknown>, msg: string, undo?: () => Promise<unknown>) =>
    p.then(
      () => toast.show(msg, 'success', undo ? { label: t('inbox.undo'), run: () => void undo() } : undefined),
      () => toast.show(t('errors.saveFailed'), 'error'),
    );

  const reasons = s.reasons.map((r) => t(`inbox.reasons.${r}`)).join(', ');

  return (
    <article className="rounded-2xl bg-surface p-4 shadow-soft ring-1 ring-line/70" aria-label={t('inbox.actions', { title: item.text.slice(0, 60) })}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
          <KindIcon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap break-words text-[0.9375rem] leading-relaxed text-fg">{item.text}</p>
          {item.url && (
            <a href={item.url} target="_blank" rel="noreferrer noopener" className="mt-1 block truncate text-sm text-accent hover:underline">
              {item.url}
            </a>
          )}
          {item.kind === 'image' && fileUrl && <img src={fileUrl} alt={item.fileName ?? ''} className="mt-3 max-h-64 rounded-xl object-contain ring-1 ring-line" />}
          {item.kind === 'audio' && fileUrl && <audio controls src={fileUrl} className="mt-3 w-full max-w-md" />}
          {item.kind === 'file' && fileUrl && (
            <a href={fileUrl} download={item.fileName ?? undefined} className="mt-2 inline-flex items-center gap-2 text-sm text-accent hover:underline">
              <FileText className="h-4 w-4" aria-hidden />
              {item.fileName} · {formatBytes(item.size, settings.locale)}
            </a>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
            <span>{t('inbox.capturedAt', { date: fmt.format(new Date(item.createdAt)) })}</span>
            {item.snoozedUntil && item.status === 'open' && <span className="text-warning">{t('inbox.snoozeUntil', { date: formatDateKey(item.snoozedUntil, settings.locale) })}</span>}
          </div>
        </div>
      </div>

      {item.status === 'processed' && item.processedTo ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/60 pt-3">
          <Badge tone="success">{t('inbox.processedTo', { type: t(`inbox.types.${item.processedTo.type === 'event' ? 'event' : item.processedTo.type === 'note' ? 'note' : 'task'}`).toLocaleLowerCase(settings.locale) })}</Badge>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (item.processedTo?.type === 'task') tasks.openTask(item.processedTo.id);
              if (item.processedTo?.type === 'event') events.openEvent(item.processedTo.id, '');
              if (item.processedTo?.type === 'note') navigate(`/notes/${item.processedTo.id}`);
            }}
          >
            {t('inbox.open')}
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3 border-t border-line/60 pt-3">
          {item.status === 'open' && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-muted">{t('inbox.suggestion')}:</span>
              <Badge tone="accent">{t(`inbox.types.${s.type}`)}</Badge>
              {s.date && <Badge>{formatDateKey(s.date, settings.locale, { weekday: 'short', day: 'numeric', month: 'short' })}</Badge>}
              {s.time && <Badge>{s.time}</Badge>}
              {s.tags.map((tag) => (
                <Badge key={tag}>#{tag}</Badge>
              ))}
              {reasons && <span className="text-xs text-subtle">{t('inbox.because', { reasons })}</span>}
            </div>
          )}
          {(s.type === 'link' || item.kind !== 'text') && item.status === 'open' && <p className="text-xs text-subtle">{t('inbox.libraryLater')}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {item.status === 'open' && (
              <>
                <Button size="sm" variant={s.type === 'task' ? 'primary' : 'secondary'} icon={<ListTodo className="h-4 w-4" aria-hidden />} onClick={() => setConverting('task')}>
                  {t('inbox.toTask')}
                </Button>
                <Button size="sm" variant={s.type === 'event' ? 'primary' : 'secondary'} icon={<CalendarPlus className="h-4 w-4" aria-hidden />} onClick={() => setConverting('event')}>
                  {t('inbox.toEvent')}
                </Button>
                <Button size="sm" variant={s.type === 'note' || s.type === 'idea' ? 'primary' : 'secondary'} icon={<NotebookPen className="h-4 w-4" aria-hidden />} onClick={() => setConverting('note')}>
                  {t('inbox.toNote')}
                </Button>
                {item.snoozedUntil && item.snoozedUntil > todayKey() ? (
                  <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" aria-hidden />} onClick={() => void act(unsnooze(item.id), t('inbox.reopen'))}>
                    {t('inbox.unsnooze')}
                  </Button>
                ) : (
                  <div className="relative">
                    <Button size="sm" variant="ghost" icon={<Clock className="h-4 w-4" aria-hidden />} aria-expanded={snoozeOpen} onClick={() => setSnoozeOpen((o) => !o)}>
                      {t('inbox.snooze')}
                    </Button>
                    {snoozeOpen && (
                      <div role="menu" className="absolute left-0 top-10 z-20 w-52 rounded-xl bg-surface p-1 shadow-lift ring-1 ring-line">
                        {[
                          { label: t('inbox.snoozeTomorrow'), date: addDays(todayKey(), 1) },
                          { label: t('inbox.snoozeWeek'), date: addDays(todayKey(), 7) },
                        ].map((o) => (
                          <button
                            key={o.date}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setSnoozeOpen(false);
                              void act(snooze(item.id, o.date), t('inbox.snoozed'), () => unsnooze(item.id));
                            }}
                            className="flex h-10 w-full items-center rounded-lg px-3 text-left text-sm text-fg hover:bg-surface-2"
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <Button size="sm" variant="ghost" icon={<Archive className="h-4 w-4" aria-hidden />} onClick={() => void act(archive(item.id), t('inbox.archived'), () => reopen(item.id))}>
                  {t('inbox.archive')}
                </Button>
              </>
            )}
            {item.status === 'archived' && (
              <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" aria-hidden />} onClick={() => void act(reopen(item.id), t('inbox.reopen'))}>
                {t('inbox.reopen')}
              </Button>
            )}
            <Button size="sm" variant="ghost" className="ml-auto text-danger hover:text-danger" icon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={() => void act(softDeleteItem(item.id), t('inbox.removed'), () => restoreItem(item.id))}>
              {t('inbox.remove')}
            </Button>
          </div>
        </div>
      )}

      {converting && <ConvertDialog item={item} suggestion={s} type={converting} openItems={openItems} onClose={() => setConverting(null)} />}
    </article>
  );
}

/* ---------- Conversão com prévia e confirmação (Parte 20.2) ---------- */

function ConvertDialog({ item, suggestion, type, openItems, onClose }: { item: InboxItem; suggestion: Suggestion; type: 'task' | 'event' | 'note'; openItems: InboxItem[]; onClose: () => void }) {
  const { t, settings } = useSettings();
  const navigate = useNavigate();
  const toast = useToast();
  const cal = useCalendarData();
  const taskEditor = useTaskEditor();
  const eventEditor = useEventEditor();
  // Arquivo sem texto (ex.: áudio gravado): o nome do arquivo não serve de título; o campo começa vazio.
  const onlyFileName = !!item.fileName && item.text === item.fileName;
  const [title, setTitle] = useState(onlyFileName ? '' : suggestion.title || item.text.slice(0, 120));
  const audioUrl = useObjectUrl(item.kind === 'audio' ? item.fileId : null);
  const [date, setDate] = useState<DateKey | ''>(suggestion.date ?? (type === 'event' ? todayKey() : ''));
  const [time, setTime] = useState(suggestion.time ?? (type === 'event' ? '09:00' : ''));
  const [tags, setTags] = useState(suggestion.tags.join(', '));
  const [error, setError] = useState<string | null>(null);

  const duplicates = useMemo(
    () =>
      findDuplicates(title, [
        ...cal.tasks.active.map((x) => ({ ref: { type: 'task', id: x.id }, title: x.title })),
        ...cal.events.map((x) => ({ ref: { type: 'event', id: x.id }, title: x.title })),
        ...openItems.filter((x) => x.id !== item.id).map((x) => ({ ref: { type: 'inbox', id: x.id }, title: x.text })),
      ]),
    [title, cal, openItems, item.id],
  );

  const create = async () => {
    if (!title.trim()) {
      setError(t('tasks.editor.titleRequired'));
      return;
    }
    const description = item.text !== title ? item.text : '';
    try {
      if (type === 'note') {
        // A nota leva o texto e o arquivo (foto, áudio ou documento) do item, sem copiar o arquivo.
        const blocks: Block[] = item.kind === 'text' || item.kind === 'link' ? textToBlocks(item.text) : [];
        if (item.fileId && item.kind === 'image') blocks.push({ id: `blk_${item.id}`, type: 'image', fileId: item.fileId, caption: '' });
        else if (item.fileId) blocks.push({ id: `blk_${item.id}`, type: 'file', fileId: item.fileId, name: item.fileName ?? '', size: item.size ?? 0 });
        if (item.url && item.kind !== 'link') blocks.push({ id: `lnk_${item.id}`, type: 'link', url: item.url, title: '' });
        const id = await convertToNote(item.id, emptyNoteInput({ title: title.trim(), tags: normalizeTags(tags.split(',')), ...(blocks.length ? { blocks } : {}) }));
        toast.show(t('inbox.convertedNote'), 'success', { label: t('inbox.open'), run: () => navigate(`/notes/${id}`) });
      } else if (type === 'task') {
        const id = await convertToTask(
          item.id,
          emptyTaskInput({
            title: title.trim(),
            description,
            dueDate: date || null,
            dueTime: date && time ? time : null,
            tags: normalizeTags(tags.split(',')),
            attachments: suggestion.url ? [{ id: `att_${item.id}`, name: suggestion.url, url: suggestion.url }] : [],
          }),
        );
        toast.show(t('inbox.convertedTask'), 'success', { label: t('inbox.open'), run: () => taskEditor.openTask(id) });
      } else {
        const start = date || todayKey();
        const id = await convertToEvent(item.id, emptyEventInput({ title: title.trim(), description, start, endDate: start, startTime: time || '09:00', allDay: false }));
        toast.show(t('inbox.convertedEvent'), 'success', { label: t('inbox.open'), run: () => eventEditor.openEvent(id, start) });
      }
      onClose();
    } catch {
      setError(t('tasks.editor.invalid'));
    }
  };

  const typeName = t(`inbox.types.${type}`).toLocaleLowerCase(settings.locale);
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.cancel')}
      title={t('inbox.convertTitle', { type: typeName })}
      description={t('inbox.convertBody')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void create()}>
            {t('inbox.confirm')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {audioUrl && <audio controls src={audioUrl} className="w-full" aria-label={item.fileName ?? undefined} />}
        <Field label={t('inbox.titleLabel')}>{(id) => <Input id={id} value={title} maxLength={300} autoFocus={onlyFileName} onChange={(e) => setTitle(e.target.value)} />}</Field>
        {type !== 'note' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('inbox.dateLabel')} optionalLabel={type === 'task' ? t('common.optional') : undefined}>
            {(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
          <Field label={t('inbox.timeLabel')} optionalLabel={type === 'task' ? t('common.optional') : undefined}>
            {(id) => <Input id={id} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}
          </Field>
        </div>
        )}
        {type !== 'event' && <Field label={t('inbox.tagsLabel')}>{(id) => <Input id={id} value={tags} onChange={(e) => setTags(e.target.value)} />}</Field>}
        {duplicates.length > 0 && (
          <div role="status" className="rounded-xl bg-warning/10 px-3 py-2.5 text-sm ring-1 ring-warning/30">
            <div className="font-medium text-fg">{t('inbox.duplicates')}</div>
            <ul className="mt-1 list-inside list-disc text-muted">
              {duplicates.map((d) => (
                <li key={`${d.ref.type}:${d.ref.id}`}>
                  {d.title}{' '}
                  <span className="text-xs text-subtle">
                    ({d.ref.type === 'event' ? t('inbox.types.event') : d.ref.type === 'task' ? t('inbox.types.task') : t('modules.inbox')})
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-1 text-xs text-subtle">{t('inbox.duplicatesHint')}</div>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

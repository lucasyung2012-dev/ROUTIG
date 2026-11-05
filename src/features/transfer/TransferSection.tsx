import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarDays, ClipboardPaste, Download, FileUp, ListTodo, NotebookPen } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { loadCalendarConfig } from '@/data/eventsRepo';
import {
  buildExport,
  EXPORT_KINDS,
  exportCounts,
  importEvents,
  importNotes,
  importTasks,
  previewIcsImport,
  previewNoteImport,
  previewTaskImport,
  type ExportKind,
  type ExportLabels,
} from '@/data/transferRepo';
import type { IcsEventRow, NoteImportRow, TaskImportRow } from '@/domain/transfer';
import { useCategoryName } from '@/features/calendar/useCalendarData';
import { saveFile } from '@/features/files/saveFile';
import { useStatusName } from '@/features/tasks/useTasksData';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Dialog } from '@/ui/Dialog';
import { Field, Select, Textarea } from '@/ui/Field';
import { Surface } from '@/ui/Surface';
import { useToast } from '@/ui/toast';

/** Lê o texto de um arquivo (com FileReader quando o navegador não tem file.text). */
function readText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

type Preview =
  | { kind: 'events'; rows: IcsEventRow[]; source: string }
  | { kind: 'tasks'; rows: TaskImportRow[]; source: string }
  | { kind: 'notes'; rows: NoteImportRow[]; source: string };

/** Settings → Importar e exportar (Etapa 5): arquivos que outros apps entendem. */
export function TransferSection() {
  const { t, tl } = useSettings();
  const toast = useToast();
  const statusName = useStatusName();
  const counts = useLiveQuery(() => exportCounts(), []);
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [financeAsk, setFinanceAsk] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pasting, setPasting] = useState(false);
  const ics = useRef<HTMLInputElement>(null);
  const tasks = useRef<HTMLInputElement>(null);
  const notes = useRef<HTMLInputElement>(null);

  const labels: ExportLabels = {
    headers: { tasks: tl('transfer.headers.tasks'), habits: tl('transfer.headers.habits'), focus: tl('transfer.headers.focus'), finance: tl('transfer.headers.finance') },
    statusName,
    priority: (p) => t(`tasks.priority.${p}`),
    yes: t('transfer.yes'),
    no: t('transfer.no'),
    txType: (x) => t(`finance.txTypes.${x as 'buy'}`),
    focusKind: (k) => t(`focus.kinds.${k as 'study'}`),
    md: { image: t('transfer.md.image'), file: t('transfer.md.file'), drawing: t('transfer.md.drawing'), untitled: t('notes.untitled') },
  };

  const doExport = async (kind: ExportKind) => {
    setBusy(kind);
    try {
      const f = await buildExport(kind, labels);
      if ((await saveFile(new File([f.text], f.name, { type: f.mime }))) === 'saved') toast.show(t('transfer.exported', { count: f.count }), 'success');
    } catch {
      toast.show(t('transfer.exportFailed'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const open = async (kind: Preview['kind'], files: File[]) => {
    if (!files.length) return;
    try {
      if (kind === 'notes') {
        const read = await Promise.all(files.map(async (f) => ({ name: f.name, text: await readText(f) })));
        setPreview({ kind, rows: await previewNoteImport(read), source: files.length === 1 ? files[0]!.name : t('transfer.nFiles', { count: files.length }) });
      } else {
        const f = files[0]!;
        const text = await readText(f);
        if (kind === 'events') setPreview({ kind, rows: await previewIcsImport(text), source: f.name });
        else setPreview({ kind, rows: await previewTaskImport(text, f.name), source: f.name });
      }
    } catch {
      toast.show(t('transfer.readFailed'), 'error');
    }
  };

  const picker = (ref: RefObject<HTMLInputElement>, kind: Preview['kind'], accept: string, multiple = false) => (
    <input
      ref={ref}
      type="file"
      accept={accept}
      multiple={multiple}
      className="hidden"
      onChange={(e) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = '';
        void open(kind, files);
      }}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <Surface className="flex flex-col gap-3">
        <div>
          <h2 className="font-semibold text-fg">{t('transfer.export.title')}</h2>
          <p className="text-sm text-muted">{t('transfer.export.hint')}</p>
        </div>
        <ul className="flex flex-col divide-y divide-line/70">
          {EXPORT_KINDS.map((k) => (
            <li key={k} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1 basis-52">
                <div className="text-sm font-medium text-fg">{t(`transfer.export.kinds.${k}`)}</div>
                <div className="text-xs text-muted">
                  {t(`transfer.export.formats.${k}`)} · {counts ? t('transfer.records', { count: counts[k] }) : '…'}
                </div>
              </div>
              <Button size="sm" variant="secondary" icon={<Download className="h-4 w-4" />} loading={busy === k} disabled={!counts || counts[k] === 0} onClick={() => (k === 'finance' ? setFinanceAsk(true) : void doExport(k))}>
                {t('transfer.export.button')}
              </Button>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">{t('transfer.export.backupNote')}</p>
      </Surface>

      <Surface className="flex flex-col gap-3">
        <div>
          <h2 className="font-semibold text-fg">{t('transfer.import.title')}</h2>
          <p className="text-sm text-muted">{t('transfer.import.hint')}</p>
        </div>
        {picker(ics, 'events', '.ics,text/calendar')}
        {picker(tasks, 'tasks', '.txt,.csv,.tsv,text/plain,text/csv')}
        {picker(notes, 'notes', '.md,.markdown,.txt,text/plain,text/markdown', true)}
        <ImportRow icon={<CalendarDays className="h-5 w-5" />} title={t('transfer.import.events')} hint={t('transfer.import.eventsHint')}>
          <Button size="sm" variant="secondary" icon={<FileUp className="h-4 w-4" />} onClick={() => ics.current?.click()}>
            {t('transfer.import.choose')}
          </Button>
        </ImportRow>
        <ImportRow icon={<ListTodo className="h-5 w-5" />} title={t('transfer.import.tasks')} hint={t('transfer.import.tasksHint')}>
          <Button size="sm" variant="secondary" icon={<FileUp className="h-4 w-4" />} onClick={() => tasks.current?.click()}>
            {t('transfer.import.choose')}
          </Button>
          <Button size="sm" variant="ghost" icon={<ClipboardPaste className="h-4 w-4" />} onClick={() => setPasting(true)}>
            {t('transfer.import.paste')}
          </Button>
        </ImportRow>
        <ImportRow icon={<NotebookPen className="h-5 w-5" />} title={t('transfer.import.notes')} hint={t('transfer.import.notesHint')}>
          <Button size="sm" variant="secondary" icon={<FileUp className="h-4 w-4" />} onClick={() => notes.current?.click()}>
            {t('transfer.import.chooseMany')}
          </Button>
        </ImportRow>
        <div className="rounded-2xl bg-surface-2/60 p-3 text-sm text-fg">
          <p className="font-medium">{t('transfer.import.elsewhere')}</p>
          <ul className="mt-1 flex flex-col gap-1 text-muted">
            <li>
              <Link to="/academy" className="text-accent hover:underline">
                Academy
              </Link>
              {' · '}
              {t('transfer.import.academy')}
            </li>
            <li>
              <Link to="/finance" className="text-accent hover:underline">
                {t('modules.finance')}
              </Link>
              {' · '}
              {t('transfer.import.finance')}
            </li>
            <li>
              <Link to="/library" className="text-accent hover:underline">
                Library
              </Link>
              {' · '}
              {t('transfer.import.library')}
            </li>
          </ul>
        </div>
      </Surface>

      <ConfirmDialog
        open={financeAsk}
        title={t('transfer.financeAsk.title')}
        body={t('transfer.financeAsk.body')}
        confirmLabel={t('transfer.financeAsk.confirm')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setFinanceAsk(false)}
        onConfirm={() => {
          setFinanceAsk(false);
          void doExport('finance');
        }}
      />
      {pasting && (
        <PasteDialog
          onClose={() => setPasting(false)}
          onRead={(text) => {
            setPasting(false);
            void previewTaskImport(text, '').then((rows) => setPreview({ kind: 'tasks', rows, source: t('transfer.import.pasted') }));
          }}
        />
      )}
      {preview && <PreviewDialog preview={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function ImportRow({ icon, title, hint, children }: { icon: ReactNode; title: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl px-1 py-1.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">{icon}</span>
      <div className="min-w-0 flex-1 basis-52">
        <div className="text-sm font-medium text-fg">{title}</div>
        <div className="text-xs text-muted">{hint}</div>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function PasteDialog({ onClose, onRead }: { onClose: () => void; onRead: (text: string) => void }) {
  const { t } = useSettings();
  const [text, setText] = useState('');
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.cancel')}
      title={t('transfer.import.pasteTitle')}
      description={t('transfer.import.pasteHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!text.trim()} onClick={() => onRead(text)}>
            {t('transfer.import.review')}
          </Button>
        </>
      }
    >
      <Field label={t('transfer.import.pasteLabel')}>{(id) => <Textarea id={id} rows={8} value={text} onChange={(e) => setText(e.target.value)} />}</Field>
    </Dialog>
  );
}

/** Prévia: nada é criado sem confirmar; o que parece repetido começa desmarcado. */
function PreviewDialog({ preview, onClose }: { preview: Preview; onClose: () => void }) {
  const rows: Array<IcsEventRow | TaskImportRow | NoteImportRow> = preview.rows;
  const { t, settings } = useSettings();
  const toast = useToast();
  const categoryName = useCategoryName();
  const [picked, setPicked] = useState<Set<string>>(() => new Set(rows.filter((r) => !r.duplicate).map((r) => r.key)));
  const [target, setTarget] = useState<string>('');
  const [running, setRunning] = useState(false);
  const options = useLiveQuery(async () => {
    if (preview.kind === 'events') return (await loadCalendarConfig()).categories.map((c) => ({ id: c.id, name: categoryName(c) }));
    if (preview.kind === 'tasks') return (await getDb().taskLists.orderBy('order').toArray()).map((l) => ({ id: l.id, name: l.name }));
    return (await getDb().notebooks.orderBy('order').toArray()).map((n) => ({ id: n.id, name: n.name }));
  }, [preview.kind]);
  const fmt = (d: string) => new Intl.DateTimeFormat(settings.locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${d}T12:00`));
  const chosen = rows.filter((r) => picked.has(r.key));

  const run = async () => {
    setRunning(true);
    try {
      let n = 0;
      if (preview.kind === 'events') n = await importEvents(chosen as IcsEventRow[], target || 'other');
      else if (preview.kind === 'tasks') n = await importTasks(chosen as TaskImportRow[], target || null);
      else n = await importNotes(chosen as NoteImportRow[], target || null);
      toast.show(t('transfer.imported', { count: n }), 'success');
      onClose();
    } catch {
      setRunning(false);
      toast.show(t('transfer.importFailed'), 'error');
    }
  };

  const detail = (r: IcsEventRow | TaskImportRow | NoteImportRow) => {
    if (preview.kind === 'events') {
      const e = r as IcsEventRow;
      return [e.allDay ? (e.endDate > e.start ? `${fmt(e.start)} – ${fmt(e.endDate)}` : fmt(e.start)) : `${fmt(e.start)} · ${e.startTime}`, e.recurrence ? t('transfer.repeats') : '', e.location].filter(Boolean).join(' · ');
    }
    if (preview.kind === 'tasks') {
      const k = r as TaskImportRow;
      return [k.dueDate ? fmt(k.dueDate) + (k.dueTime ? ` · ${k.dueTime}` : '') : '', k.done ? t('transfer.done') : '', k.tags.map((x) => `#${x}`).join(' ')].filter(Boolean).join(' · ');
    }
    return (r as NoteImportRow).preview;
  };

  return (
    <Dialog
      open
      onClose={running ? () => undefined : onClose}
      closeLabel={t('common.cancel')}
      title={t(`transfer.preview.${preview.kind}`)}
      description={t('transfer.preview.from', { source: preview.source })}
      size="lg"
      footer={
        <>
          <Button variant="ghost" disabled={running} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={running} disabled={chosen.length === 0} onClick={() => void run()}>
            {t('transfer.preview.confirm', { count: chosen.length })}
          </Button>
        </>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{t('transfer.preview.empty')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <Field label={t(`transfer.preview.target.${preview.kind}`)}>
            {(id) => (
              <Select id={id} value={target} onChange={(e) => setTarget(e.target.value)} className="max-w-xs">
                <option value="">{t(`transfer.preview.none.${preview.kind}`)}</option>
                {(options ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex items-center gap-3 text-xs">
            <button type="button" className="font-medium text-accent hover:underline" onClick={() => setPicked(new Set(rows.map((r) => r.key)))}>
              {t('transfer.preview.all')}
            </button>
            <button type="button" className="font-medium text-accent hover:underline" onClick={() => setPicked(new Set())}>
              {t('transfer.preview.noneSel')}
            </button>
            <span className="text-muted">{t('transfer.preview.count', { count: chosen.length, total: rows.length })}</span>
          </div>
          <ul className="flex max-h-[45vh] flex-col divide-y divide-line/60 overflow-y-auto rounded-2xl ring-1 ring-line/70">
            {rows.map((r) => (
              <li key={r.key}>
                <label className="flex items-start gap-3 px-3 py-2 text-sm hover:bg-surface-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]"
                    checked={picked.has(r.key)}
                    onChange={(e) => {
                      const next = new Set(picked);
                      if (e.target.checked) next.add(r.key);
                      else next.delete(r.key);
                      setPicked(next);
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-medium text-fg">
                      {r.title}
                      {r.duplicate && <Badge tone="warning">{t('transfer.preview.duplicate')}</Badge>}
                      {preview.kind === 'events' && (r as IcsEventRow).recurrenceNote && <Badge tone="neutral">{t('transfer.preview.partialRepeat')}</Badge>}
                    </span>
                    {detail(r) && <span className="block truncate text-xs text-muted">{detail(r)}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">{t(`transfer.preview.note.${preview.kind}`)}</p>
        </div>
      )}
    </Dialog>
  );
}

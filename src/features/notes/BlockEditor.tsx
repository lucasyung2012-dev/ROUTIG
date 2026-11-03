import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type TextareaHTMLAttributes } from 'react';
import {
  ArrowDown,
  ArrowUp,
  FileText,
  Heading2,
  ImagePlus,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Paperclip,
  PenTool,
  Plus,
  Quote,
  Table,
  Trash2,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { NoteRuleError, storeNoteFile } from '@/data/notesRepo';
import { newBlock, type Block, type BlockType, type TextBlock } from '@/domain/notes';
import { useObjectUrl } from '@/features/files/useObjectUrl';
import { formatBytes } from '@/services/storage';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { Input } from '@/ui/Field';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { DrawingBlock } from './DrawingBlock';

export const BLOCK_MENU: Array<{ type: BlockType; icon: LucideIcon }> = [
  { type: 'paragraph', icon: Type },
  { type: 'heading', icon: Heading2 },
  { type: 'bullet', icon: List },
  { type: 'numbered', icon: ListOrdered },
  { type: 'todo', icon: ListChecks },
  { type: 'quote', icon: Quote },
  { type: 'divider', icon: Minus },
  { type: 'table', icon: Table },
  { type: 'image', icon: ImagePlus },
  { type: 'file', icon: Paperclip },
  { type: 'link', icon: LinkIcon },
  { type: 'drawing', icon: PenTool },
];

const TEXT_TYPES: BlockType[] = ['paragraph', 'heading', 'bullet', 'numbered', 'todo', 'quote'];

/** Campo de texto que cresce com o conteúdo. */
export function AutoTextarea({
  value,
  className,
  inputRef,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; inputRef?: (el: HTMLTextAreaElement | null) => void }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={(el) => {
        ref.current = el;
        inputRef?.(el);
      }}
      rows={1}
      value={value}
      className={cn('w-full resize-none overflow-hidden bg-transparent focus:outline-none', className)}
      {...rest}
    />
  );
}

function convert(b: Block, type: BlockType): Block {
  const text = 'text' in b ? b.text : '';
  const fresh = newBlock(type);
  return 'text' in fresh ? ({ ...fresh, id: b.id, text } as Block) : { ...fresh, id: b.id };
}

/** Editor por blocos (Parte 17.1, modo avançado). */
export function BlockEditor({
  blocks,
  onChange,
  hideAddBar = false,
  allowEmpty = false,
}: {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  hideAddBar?: boolean;
  /** No modo rápido, a lista de anexos pode ficar vazia. */
  allowEmpty?: boolean;
}) {
  const { t } = useSettings();
  const [focusId, setFocusId] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLTextAreaElement>());

  useEffect(() => {
    if (!focusId) return;
    const el = refs.current.get(focusId);
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
    setFocusId(null);
  }, [focusId, blocks]);

  const update = (id: string, next: Block) => onChange(blocks.map((b) => (b.id === id ? next : b)));
  const insertAfter = (id: string | null, b: Block) => {
    const i = id ? blocks.findIndex((x) => x.id === id) : blocks.length - 1;
    const next = [...blocks];
    next.splice(i + 1, 0, b);
    onChange(next);
    if ('text' in b) setFocusId(b.id);
  };
  const remove = (id: string) => {
    const i = blocks.findIndex((x) => x.id === id);
    const next = blocks.filter((b) => b.id !== id);
    onChange(next.length || allowEmpty ? next : [newBlock('paragraph')]);
    const prev = next[Math.max(0, i - 1)];
    if (prev && 'text' in prev) setFocusId(prev.id);
  };
  const move = (id: string, delta: -1 | 1) => {
    const i = blocks.findIndex((x) => x.id === id);
    const j = i + delta;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>, b: TextBlock) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const continues = b.type === 'bullet' || b.type === 'numbered' || b.type === 'todo';
      // Enter numa lista vazia termina a lista.
      if (continues && b.text === '') {
        update(b.id, convert(b, 'paragraph'));
        return;
      }
      insertAfter(b.id, newBlock(continues ? b.type : 'paragraph'));
    }
    if (e.key === 'Backspace' && b.text === '' && blocks.length > 1) {
      e.preventDefault();
      remove(b.id);
    }
  };

  let numbered = 0;

  return (
    <div className="flex flex-col gap-0.5">
      {blocks.map((b, index) => {
        numbered = b.type === 'numbered' ? numbered + 1 : 0;
        return (
          <div key={b.id} className="group relative flex items-start gap-1 rounded-xl py-0.5 pl-0 pr-1 transition hover:bg-surface-2/40 focus-within:bg-surface-2/40 sm:pl-1">
            <BlockMenu
              block={b}
              first={index === 0}
              last={index === blocks.length - 1}
              onMove={(d) => move(b.id, d)}
              onRemove={() => remove(b.id)}
              onConvert={(type) => update(b.id, convert(b, type))}
              onInsert={(type) => insertAfter(b.id, newBlock(type))}
            />
            <div className="min-w-0 flex-1 py-1">
              <BlockBody
                block={b}
                number={numbered}
                onChange={(next) => update(b.id, next)}
                textRef={(el) => {
                  if (el) refs.current.set(b.id, el);
                  else refs.current.delete(b.id);
                }}
                onKeyDown={onKey}
              />
            </div>
          </div>
        );
      })}
      {!hideAddBar && <AddBlockBar onAdd={(type) => insertAfter(null, newBlock(type))} label={t('notes.blocks.add')} />}
    </div>
  );
}

function AddBlockBar({ onAdd, label }: { onAdd: (type: BlockType) => void; label: string }) {
  const { t } = useSettings();
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" aria-hidden />} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}
      </Button>
      {open && (
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="menu">
          {BLOCK_MENU.map(({ type, icon: Icon }) => (
            <button
              key={type}
              type="button"
              role="menuitem"
              onClick={() => {
                onAdd(type);
                setOpen(false);
              }}
              className="flex h-11 items-center gap-2 rounded-xl bg-surface-2 px-3 text-sm font-medium text-fg ring-1 ring-line/60 hover:bg-surface-3"
            >
              <Icon className="h-4 w-4 text-accent" aria-hidden />
              {t(`notes.blocks.${type}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BlockMenu({
  block,
  first,
  last,
  onMove,
  onRemove,
  onConvert,
  onInsert,
}: {
  block: Block;
  first: boolean;
  last: boolean;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
  onConvert: (type: BlockType) => void;
  onInsert: (type: BlockType) => void;
}) {
  const { t } = useSettings();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        aria-label={`${t('notes.blocks.turnInto')} / ${t('notes.blocks.add')}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="mt-1 flex h-8 w-6 items-center justify-center rounded-md text-subtle opacity-60 transition hover:bg-surface-3 hover:text-fg group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <span aria-hidden className="text-base leading-none">⋮⋮</span>
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-9 z-30 w-60 rounded-2xl bg-surface p-1.5 shadow-lift ring-1 ring-line">
          <div className="flex gap-1 border-b border-line/60 pb-1.5">
            <IconButton size="sm" label={t('notes.blocks.moveUp')} icon={<ArrowUp className="h-4 w-4" />} disabled={first} onClick={() => onMove(-1)} />
            <IconButton size="sm" label={t('notes.blocks.moveDown')} icon={<ArrowDown className="h-4 w-4" />} disabled={last} onClick={() => onMove(1)} />
            <IconButton
              size="sm"
              label={t('notes.blocks.remove')}
              icon={<Trash2 className="h-4 w-4" />}
              className="ml-auto text-danger hover:text-danger"
              onClick={() => {
                setOpen(false);
                onRemove();
              }}
            />
          </div>
          {'text' in block && (
            <>
              <div className="px-2 pb-1 pt-2 text-[0.68rem] font-semibold uppercase tracking-wider text-subtle">{t('notes.blocks.turnInto')}</div>
              {BLOCK_MENU.filter((m) => TEXT_TYPES.includes(m.type) && m.type !== block.type).map(({ type, icon: Icon }) => (
                <button
                  key={type}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onConvert(type);
                  }}
                  className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-fg hover:bg-surface-2"
                >
                  <Icon className="h-4 w-4 text-muted" aria-hidden />
                  {t(`notes.blocks.${type}`)}
                </button>
              ))}
            </>
          )}
          <div className="px-2 pb-1 pt-2 text-[0.68rem] font-semibold uppercase tracking-wider text-subtle">{t('notes.blocks.add')}</div>
          <div className="grid grid-cols-2 gap-0.5">
            {BLOCK_MENU.map(({ type, icon: Icon }) => (
              <button
                key={type}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onInsert(type);
                }}
                className="flex h-9 items-center gap-2 rounded-lg px-2 text-left text-xs text-fg hover:bg-surface-2"
              >
                <Icon className="h-3.5 w-3.5 text-muted" aria-hidden />
                {t(`notes.blocks.${type}`)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BlockBody({
  block: b,
  number,
  onChange,
  textRef,
  onKeyDown,
}: {
  block: Block;
  number: number;
  onChange: (b: Block) => void;
  textRef: (el: HTMLTextAreaElement | null) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>, b: TextBlock) => void;
}) {
  const { t } = useSettings();
  const textProps = (bb: TextBlock, cls: string, placeholder?: string) => ({
    inputRef: textRef,
    value: bb.text,
    placeholder,
    'aria-label': t(`notes.blocks.${bb.type}`),
    onChange: (e: { target: { value: string } }) => onChange({ ...bb, text: e.target.value } as Block),
    onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => onKeyDown(e, bb),
    className: cls,
  });

  switch (b.type) {
    case 'paragraph':
      return <AutoTextarea {...textProps(b, 'text-[0.9375rem] leading-relaxed text-fg placeholder:text-subtle', t('notes.quickPlaceholder'))} />;
    case 'heading':
      return (
        <div className="flex items-start gap-2">
          <select
            aria-label={t('notes.blocks.headingLevel')}
            value={b.level}
            onChange={(e) => onChange({ ...b, level: Number(e.target.value) as 1 | 2 | 3 })}
            className="mt-1 h-7 rounded-md bg-surface-2 px-1 text-xs text-muted"
          >
            <option value={1}>H1</option>
            <option value={2}>H2</option>
            <option value={3}>H3</option>
          </select>
          <AutoTextarea
            {...textProps(
              b,
              cn('font-semibold tracking-tight text-fg placeholder:text-subtle', b.level === 1 ? 'text-2xl' : b.level === 2 ? 'text-xl' : 'text-lg'),
              t('notes.blocks.heading'),
            )}
          />
        </div>
      );
    case 'bullet':
      return (
        <div className="flex items-start gap-2">
          <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-fg" aria-hidden />
          <AutoTextarea {...textProps(b, 'text-[0.9375rem] leading-relaxed text-fg')} />
        </div>
      );
    case 'numbered':
      return (
        <div className="flex items-start gap-2">
          <span className="mt-0.5 w-5 shrink-0 text-right text-[0.9375rem] tabular text-muted">{number}.</span>
          <AutoTextarea {...textProps(b, 'text-[0.9375rem] leading-relaxed text-fg')} />
        </div>
      );
    case 'todo':
      return (
        <div className="flex items-start gap-2.5">
          <input type="checkbox" checked={b.checked} aria-label={b.text || t('notes.blocks.todo')} onChange={() => onChange({ ...b, checked: !b.checked })} className="mt-1 h-5 w-5 shrink-0 rounded accent-[rgb(var(--accent))]" />
          <AutoTextarea {...textProps(b, cn('text-[0.9375rem] leading-relaxed', b.checked ? 'text-subtle line-through' : 'text-fg'))} />
        </div>
      );
    case 'quote':
      return (
        <div className="border-l-4 border-accent/50 pl-3">
          <AutoTextarea {...textProps(b, 'text-[0.9375rem] italic leading-relaxed text-muted')} />
        </div>
      );
    case 'divider':
      return <hr className="my-3 border-line" />;
    case 'table':
      return <TableBlock rows={b.rows} onChange={(rows) => onChange({ ...b, rows })} />;
    case 'image':
      return <ImageBlock fileId={b.fileId} caption={b.caption} onChange={(patch) => onChange({ ...b, ...patch })} />;
    case 'file':
      return <FileBlock fileId={b.fileId} name={b.name} size={b.size} onChange={(patch) => onChange({ ...b, ...patch })} />;
    case 'link':
      return <LinkBlock url={b.url} title={b.title} onChange={(patch) => onChange({ ...b, ...patch })} />;
    case 'drawing':
      return <DrawingBlock strokes={b.strokes} height={b.height} onChange={(strokes) => onChange({ ...b, strokes })} onResize={(height) => onChange({ ...b, height })} />;
  }
}

function TableBlock({ rows, onChange }: { rows: string[][]; onChange: (rows: string[][]) => void }) {
  const { t } = useSettings();
  const cols = rows[0]?.length ?? 1;
  const set = (r: number, c: number, v: string) => onChange(rows.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? v : cell)) : row)));
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] border-collapse text-sm">
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c} className={cn('border border-line p-0', r === 0 && 'bg-surface-2 font-semibold')}>
                    <input
                      value={cell}
                      aria-label={`${t('notes.blocks.table')} ${r + 1}×${c + 1}`}
                      onChange={(e) => set(r, c, e.target.value)}
                      className="h-10 w-full min-w-[6rem] bg-transparent px-2 text-fg focus:bg-surface focus:outline-none"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => onChange([...rows, Array(cols).fill('')])}>
          {t('notes.blocks.addRow')}
        </Button>
        <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => onChange(rows.map((row) => [...row, '']))}>
          {t('notes.blocks.addCol')}
        </Button>
        <Button size="sm" variant="ghost" disabled={rows.length <= 1} onClick={() => onChange(rows.slice(0, -1))}>
          {t('notes.blocks.removeRow')}
        </Button>
        <Button size="sm" variant="ghost" disabled={cols <= 1} onClick={() => onChange(rows.map((row) => row.slice(0, -1)))}>
          {t('notes.blocks.removeCol')}
        </Button>
      </div>
    </div>
  );
}

function useFilePicker(accept: string, onPicked: (fileId: string, name: string, size: number) => void) {
  const { t } = useSettings();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const element = (
    <input
      ref={input}
      type="file"
      accept={accept}
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        void storeNoteFile(f, f.name).then(
          (stored) => onPicked(stored.id, f.name, f.size),
          (err) =>
            toast.show(
              err instanceof NoteRuleError && err.code === 'too_large' ? t('notes.blocks.fileTooLarge') : err instanceof NoteRuleError && err.code === 'quota' ? t('notes.blocks.quota') : t('errors.saveFailed'),
              'error',
            ),
        );
      }}
    />
  );
  return { element, open: () => input.current?.click() };
}

function ImageBlock({ fileId, caption, onChange }: { fileId: string; caption: string; onChange: (p: { fileId?: string; caption?: string }) => void }) {
  const { t } = useSettings();
  const url = useObjectUrl(fileId || null);
  const picker = useFilePicker('image/*', (id) => onChange({ fileId: id }));
  return (
    <div className="flex flex-col gap-2">
      {picker.element}
      {fileId && url ? (
        <img src={url} alt={caption} className="max-h-[28rem] w-auto max-w-full rounded-xl object-contain ring-1 ring-line" />
      ) : (
        <Button variant="secondary" icon={<ImagePlus className="h-4 w-4" aria-hidden />} onClick={picker.open} className="w-fit">
          {t('notes.blocks.chooseImage')}
        </Button>
      )}
      {fileId && <Input value={caption} placeholder={t('notes.blocks.caption')} aria-label={t('notes.blocks.caption')} onChange={(e) => onChange({ caption: e.target.value })} className="h-9 text-sm" />}
    </div>
  );
}

function FileBlock({ fileId, name, size, onChange }: { fileId: string; name: string; size: number; onChange: (p: { fileId?: string; name?: string; size?: number }) => void }) {
  const { t, settings } = useSettings();
  const url = useObjectUrl(fileId || null);
  const picker = useFilePicker('*/*', (id, n, s) => onChange({ fileId: id, name: n, size: s }));
  return (
    <div>
      {picker.element}
      {fileId && url ? (
        <a href={url} download={name} className="inline-flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm font-medium text-fg ring-1 ring-line hover:bg-surface-3">
          <FileText className="h-4 w-4 text-accent" aria-hidden />
          {name}
          <span className="text-xs text-subtle">{formatBytes(size, settings.locale)}</span>
        </a>
      ) : (
        <Button variant="secondary" icon={<Paperclip className="h-4 w-4" aria-hidden />} onClick={picker.open}>
          {t('notes.blocks.chooseFile')}
        </Button>
      )}
    </div>
  );
}

function LinkBlock({ url, title, onChange }: { url: string; title: string; onChange: (p: { url?: string; title?: string }) => void }) {
  const { t } = useSettings();
  const [draft, setDraft] = useState(url);
  const [error, setError] = useState(false);
  const valid = (u: string) => {
    try {
      return /^https?:$/.test(new URL(u).protocol);
    } catch {
      return false;
    }
  };
  if (url && valid(url)) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <a href={url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 text-[0.9375rem] font-medium text-accent hover:underline">
          <LinkIcon className="h-4 w-4" aria-hidden />
          {title || url}
        </a>
        <Input value={title} placeholder={t('notes.blocks.linkTitle')} aria-label={t('notes.blocks.linkTitle')} onChange={(e) => onChange({ title: e.target.value })} className="h-9 max-w-xs text-sm" />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <Input
          type="url"
          value={draft}
          placeholder={t('notes.blocks.linkUrl')}
          aria-label={t('notes.blocks.linkUrl')}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(false);
          }}
          onBlur={() => {
            if (!draft.trim()) return;
            if (valid(draft.trim())) onChange({ url: draft.trim() });
            else setError(true);
          }}
          className="min-w-0 flex-1"
        />
      </div>
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {t('notes.blocks.invalidUrl')}
        </p>
      )}
    </div>
  );
}

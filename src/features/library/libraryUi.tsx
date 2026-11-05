import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AudioLines, BookOpen, Copy, Download, ExternalLink, FileSpreadsheet, FileText, FileUp, Film, Image as ImageIcon, Link2, Presentation, Quote, Star, Trash2, X } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { createItem, importFiles, LibraryRuleError, linkItem, prepareImport, softDeleteItem, restoreItem, unlinkItem, updateItem, type ImportCandidate } from '@/data/libraryRepo';
import type { EntityRef } from '@/domain/entity';
import { formatBytes, LIBRARY_KINDS, metaOf, READ_STATUSES, type ItemMeta, type LibraryCollection, type LibraryItem, type LibraryKind } from '@/domain/library';
import { isOpenGoal } from '@/domain/goals';
import { saveFile } from '@/features/files/saveFile';
import { useObjectUrl } from '@/features/files/useObjectUrl';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';

export const KIND_ICON: Record<LibraryKind, typeof FileText> = {
  pdf: FileText,
  document: FileText,
  presentation: Presentation,
  spreadsheet: FileSpreadsheet,
  image: ImageIcon,
  video: Film,
  audio: AudioLines,
  link: Link2,
  book: BookOpen,
  reference: Quote,
};

/* ---------- Ligações com os módulos (Parte 18.4) ---------- */

export const LIB_REF_TYPES = ['subject', 'language', 'project', 'goal', 'instrument', 'sport', 'habit'] as const;
export type LibRefType = (typeof LIB_REF_TYPES)[number];
export const LIB_REF_PATH: Record<LibRefType, string> = { subject: '/academy/subjects/', language: '/languages/', project: '/projects/', goal: '/goals/', instrument: '/music/', sport: '/sports/', habit: '/habits/' };

export function useRefOptions() {
  return useLiveQuery(async () => {
    const db = getDb();
    const years = new Map((await db.academicYears.toArray()).map((y) => [y.id, y.label]));
    const out: Record<LibRefType, Array<{ id: string; name: string }>> = {
      subject: (await db.subjects.filter((s) => !s.deletedAt).toArray()).map((s) => ({ id: s.id, name: `${s.name}${years.get(s.yearId) ? ` · ${years.get(s.yearId)}` : ''}` })),
      language: (await db.languages.filter((l) => !l.deletedAt).toArray()).map((l) => ({ id: l.id, name: l.name })),
      project: (await db.projects.filter((p) => !p.deletedAt).toArray()).map((p) => ({ id: p.id, name: p.name })),
      goal: (await db.goals.filter((g) => !g.deletedAt && isOpenGoal(g)).toArray()).map((g) => ({ id: g.id, name: g.name })),
      instrument: (await db.instruments.filter((i) => !i.deletedAt).toArray()).map((i) => ({ id: i.id, name: i.name })),
      sport: (await db.sports.filter((s) => !s.deletedAt).toArray()).map((s) => ({ id: s.id, name: s.name })),
      habit: (await db.habits.filter((h) => !h.deletedAt).toArray()).map((h) => ({ id: h.id, name: h.name })),
    };
    for (const k of LIB_REF_TYPES) out[k].sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, []);
}

/** Abre o arquivo guardado (nova aba) ou baixa (Parte 18.5: exportação). */
export function FileActions({ item }: { item: LibraryItem }) {
  const { t } = useSettings();
  const url = useObjectUrl(item.fileId);
  const toast = useToast();
  if (!item.fileId) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-surface-2 px-3 text-sm text-fg ring-1 ring-inset ring-line hover:bg-surface-3">
          <ExternalLink className="h-4 w-4" aria-hidden />
          {t('library.open')}
        </a>
      )}
      <Button
        size="sm"
        variant="secondary"
        icon={<Download className="h-4 w-4" />}
        onClick={() =>
          void getDb()
            .files.get(item.fileId!)
            .then(async (f) => {
              if (f) await saveFile(new File([f.blob], item.fileName || f.name, { type: f.mime }));
              else toast.show(t('library.errors.missingFile'), 'error');
            })
        }
      >
        {t('library.download')}
      </Button>
    </div>
  );
}

/** Miniatura: foto para imagens, ícone para o resto. */
export function Thumb({ item, className }: { item: LibraryItem; className?: string }) {
  const url = useObjectUrl(item.kind === 'image' ? item.fileId : null);
  const Icon = KIND_ICON[item.kind];
  if (url) return <img src={url} alt="" className={cn('object-cover', className)} />;
  return (
    <span className={cn('flex items-center justify-center bg-surface-2 text-muted', className)}>
      <Icon className="h-6 w-6" aria-hidden />
    </span>
  );
}

/* ---------- Editar material ---------- */

export function ItemDialog({ item, collections, folders, preset, refs, onClose }: { item?: LibraryItem; collections: LibraryCollection[]; folders: string[]; preset?: Partial<ItemMeta>; refs?: EntityRef[]; onClose: () => void }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const options = useRefOptions();
  const [meta, setMeta] = useState<ItemMeta>(() => (item ? metaOf(item) : { kind: 'link', title: '', author: '', url: '', folder: '', category: '', tags: [], collectionIds: [], favorite: false, readStatus: null, notes: '', ...preset }));
  const [tags, setTags] = useState(() => meta.tags.join(', '));
  const set = (p: Partial<ItemMeta>) => setMeta((m) => ({ ...m, ...p }));
  const live = useLiveQuery(() => (item ? getDb().libraryItems.get(item.id) : undefined), [item?.id]);
  const save = async () => {
    const data = { ...meta, tags: tags.split(',').map((x) => x.trim()) };
    try {
      if (item) await updateItem(item.id, data);
      else await createItem(data, refs);
      toast.show(t('library.saved'));
      onClose();
    } catch (e) {
      const code = e instanceof LibraryRuleError ? e.code : 'invalid';
      toast.show(code === 'duplicate' ? t('library.errors.duplicateLink') : meta.url && !/^https?:\/\//i.test(meta.url) ? t('library.errors.url') : t('library.errors.invalid'), 'error');
    }
  };
  const remove = async () => {
    if (!item) return;
    await softDeleteItem(item.id);
    toast.show(t('library.moved'), 'success', { label: t('notes.undo'), run: () => void restoreItem(item.id) });
    onClose();
  };
  const withFile = !!item?.fileId;
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      size="lg"
      title={item ? t('library.edit') : t(`library.newOf.${meta.kind === 'book' || meta.kind === 'reference' ? meta.kind : 'link'}`)}
      description={item?.fileId ? `${item.fileName} · ${formatBytes(item.size, settings.locale)}` : undefined}
      footer={
        <>
          {item && (
            <Button variant="danger" className="mr-auto" icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove()}>
              {t('library.moveToTrash')}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!meta.title.trim()} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {item && <FileActions item={item} />}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('library.fields.title')}>{(id) => <Input id={id} autoFocus={!item} value={meta.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} />}</Field>
          <Field label={t('library.fields.kind')}>
            {(id) => (
              <Select id={id} value={meta.kind} onChange={(e) => set({ kind: e.target.value as LibraryKind })}>
                {LIBRARY_KINDS.filter((k) => (withFile ? k !== 'link' : ['link', 'book', 'reference', 'video', 'audio', 'document'].includes(k) || k === meta.kind)).map((k) => (
                  <option key={k} value={k}>
                    {t(`library.kinds.${k}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {(meta.kind === 'book' || meta.kind === 'reference') && (
            <Field label={t('library.fields.author')} optionalLabel={t('common.optional')}>
              {(id) => <Input id={id} value={meta.author} maxLength={200} onChange={(e) => set({ author: e.target.value })} />}
            </Field>
          )}
          {meta.kind === 'book' && (
            <Field label={t('library.fields.readStatus')}>
              {(id) => (
                <Select id={id} value={meta.readStatus ?? ''} onChange={(e) => set({ readStatus: (e.target.value || null) as ItemMeta['readStatus'] })}>
                  <option value="">—</option>
                  {READ_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`library.readStatuses.${s}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          {!withFile && (
            <Field label={t('library.fields.url')} optionalLabel={meta.kind === 'link' ? undefined : t('common.optional')}>
              {(id) => <Input id={id} type="url" inputMode="url" value={meta.url} placeholder="https://" onChange={(e) => set({ url: e.target.value.trim() })} />}
            </Field>
          )}
          <Field label={t('library.fields.folder')} optionalLabel={t('common.optional')} hint={t('library.folderHint')}>
            {(id, d) => (
              <>
                <Input id={id} aria-describedby={d} list={`${id}-folders`} value={meta.folder} maxLength={120} placeholder={t('library.folderPlaceholder')} onChange={(e) => set({ folder: e.target.value })} />
                <datalist id={`${id}-folders`}>
                  {folders.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Field label={t('library.fields.category')} optionalLabel={t('common.optional')}>
            {(id) => <Input id={id} value={meta.category} maxLength={60} onChange={(e) => set({ category: e.target.value })} />}
          </Field>
          <Field label={t('library.fields.tags')} optionalLabel={t('common.optional')} hint={t('library.tagsHint')}>
            {(id, d) => <Input id={id} aria-describedby={d} value={tags} onChange={(e) => setTags(e.target.value)} />}
          </Field>
        </div>
        {collections.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-fg">{t('library.fields.collections')}</span>
            <div className="flex flex-wrap gap-1.5">
              {collections.map((c) => {
                const on = meta.collectionIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ collectionIds: on ? meta.collectionIds.filter((x) => x !== c.id) : [...meta.collectionIds, c.id] })}
                    className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ring-1 ring-inset', on ? 'bg-accent/15 text-accent ring-accent/40' : 'bg-surface-2 text-muted ring-line')}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: c.color }} aria-hidden />
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <label className="inline-flex w-fit items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={meta.favorite} onChange={(e) => set({ favorite: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--accent))]" />
          <Star className="h-4 w-4 text-warning" aria-hidden />
          {t('library.fields.favorite')}
        </label>
        <Field label={t('library.fields.notes')} optionalLabel={t('common.optional')}>
          {(id) => <Textarea id={id} rows={3} maxLength={20000} value={meta.notes} onChange={(e) => set({ notes: e.target.value })} />}
        </Field>
        {item && live && (
          <section className="flex flex-col gap-2">
            <span className="text-sm font-medium text-fg">{t('library.usedIn')}</span>
            <p className="text-xs text-muted">{t('library.usedInHint')}</p>
            <div className="flex flex-wrap gap-1.5">
              {live.refs.map((r) => {
                const type = r.type as LibRefType;
                const name = options?.[type]?.find((o) => o.id === r.id)?.name;
                return (
                  <span key={`${r.type}:${r.id}`} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-sm ring-1 ring-line">
                    {name ? (
                      <Link to={`${LIB_REF_PATH[type] ?? '/'}${r.id}`} className="hover:text-accent">
                        {name}
                      </Link>
                    ) : (
                      <span className="text-muted">{t('library.refMissing')}</span>
                    )}
                    <span className="text-xs text-subtle">{t(`library.refTypes.${type}`)}</span>
                    <IconButton label={t('library.unlink')} icon={<X className="h-3.5 w-3.5" />} onClick={() => void unlinkItem(item.id, r)} className="h-7 w-7" />
                  </span>
                );
              })}
            </div>
            <Select
              aria-label={t('library.linkTo')}
              value=""
              onChange={(e) => {
                const [type, id] = e.target.value.split('|');
                if (type && id) void linkItem(item.id, { type, id });
              }}
              className="h-9 max-w-80"
            >
              <option value="">{t('library.linkTo')}</option>
              {LIB_REF_TYPES.map((type) =>
                options?.[type]?.length ? (
                  <optgroup key={type} label={t(`library.refTypes.${type}`)}>
                    {options[type]
                      .filter((o) => !live.refs.some((r) => r.type === type && r.id === o.id))
                      .map((o) => (
                        <option key={o.id} value={`${type}|${o.id}`}>
                          {o.name}
                        </option>
                      ))}
                  </optgroup>
                ) : null,
              )}
            </Select>
          </section>
        )}
        {item && <p className="text-xs text-subtle">{t('library.originLine', { origin: t(`library.origins.${item.origin}`), date: new Intl.DateTimeFormat(settings.locale, { dateStyle: 'medium' }).format(new Date(item.importedAt)) })}</p>}
      </div>
    </Dialog>
  );
}

/* ---------- Importação com prévia (Parte 18.3) ---------- */

export function ImportDialog({ collections, folders, onClose, refs }: { collections: LibraryCollection[]; folders: string[]; onClose: () => void; refs?: EntityRef }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [cands, setCands] = useState<ImportCandidate[] | null>(null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [folder, setFolder] = useState('');
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [tags, setTags] = useState('');
  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setReading(true);
    try {
      setCands(await prepareImport(Array.from(files)));
    } finally {
      setReading(false);
    }
  };
  const chosen = useMemo(() => cands?.filter((c) => c.include && !c.tooLarge) ?? [], [cands]);
  const confirm = async () => {
    if (!cands) return;
    setBusy(true);
    try {
      const before = new Set((await getDb().libraryItems.toCollection().primaryKeys()) as string[]);
      const n = await importFiles(cands, { folder, collectionIds, tags: tags.split(',').map((x) => x.trim()).filter(Boolean) });
      if (refs) for (const id of (await getDb().libraryItems.toCollection().primaryKeys()) as string[]) if (!before.has(id)) await linkItem(id, refs);
      toast.show(t('library.imported', { count: n }));
      onClose();
    } catch (e) {
      toast.show(e instanceof LibraryRuleError && e.code === 'quota' ? t('library.errors.quota') : t('library.errors.import'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      size="lg"
      title={t('library.import')}
      description={t('library.importHint')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          {cands && (
            <Button variant="primary" loading={busy} disabled={!chosen.length || busy} onClick={() => void confirm()}>
              {t('library.importConfirm', { count: chosen.length })}
            </Button>
          )}
        </>
      }
    >
      <input ref={input} type="file" multiple className="hidden" onChange={(e) => void pick(e.target.files).then(() => (e.target.value = ''))} />
      {!cands ? (
        <div className="flex flex-col items-start gap-3">
          <Button variant="primary" icon={<FileUp className="h-4 w-4" />} loading={reading} onClick={() => input.current?.click()}>
            {t('library.chooseFiles')}
          </Button>
          <p className="text-sm text-muted">{t('library.importTypes')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <ul className="flex max-h-[40vh] flex-col divide-y divide-line/60 overflow-auto rounded-xl ring-1 ring-line">
            {cands.map((c, i) => (
              <li key={`${c.name}-${i}`} className={cn('flex items-center gap-3 px-3 py-2 text-sm', (c.duplicateOf || c.tooLarge) && 'bg-warning/5')}>
                <input type="checkbox" aria-label={c.name} checked={c.include} disabled={c.tooLarge} onChange={(e) => setCands((cs) => cs && cs.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))} className="h-4 w-4 accent-[rgb(var(--accent))]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-fg">{c.name}</span>
                  <span className="block text-xs text-muted">
                    {t(`library.kinds.${c.kind}`)} · {formatBytes(c.size, settings.locale)}
                  </span>
                </span>
                {c.tooLarge ? (
                  <Badge tone="danger">{t('library.tooLarge')}</Badge>
                ) : c.duplicateOf ? (
                  <span className="inline-flex items-center gap-1 text-xs text-warning" title={c.duplicateOf.title}>
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                    {c.duplicateOf.id ? t('library.alreadyIn', { title: c.duplicateOf.title }) : t('library.repeatedHere')}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {cands.some((c) => c.duplicateOf) && <p className="text-xs text-muted">{t('library.duplicateHint')}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('library.fields.folder')} optionalLabel={t('common.optional')}>
              {(id) => (
                <>
                  <Input id={id} list={`${id}-f`} value={folder} maxLength={120} placeholder={t('library.folderPlaceholder')} onChange={(e) => setFolder(e.target.value)} />
                  <datalist id={`${id}-f`}>
                    {folders.map((f) => (
                      <option key={f} value={f} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            <Field label={t('library.fields.tags')} optionalLabel={t('common.optional')}>
              {(id) => <Input id={id} value={tags} placeholder={t('library.tagsHint')} onChange={(e) => setTags(e.target.value)} />}
            </Field>
          </div>
          {collections.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {collections.map((c) => {
                const on = collectionIds.includes(c.id);
                return (
                  <button key={c.id} type="button" aria-pressed={on} onClick={() => setCollectionIds(on ? collectionIds.filter((x) => x !== c.id) : [...collectionIds, c.id])} className={cn('rounded-full px-3 py-1.5 text-sm ring-1 ring-inset', on ? 'bg-accent/15 text-accent ring-accent/40' : 'bg-surface-2 text-muted ring-line')}>
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-xs text-subtle">{t('library.originNote')}</p>
        </div>
      )}
    </Dialog>
  );
}

/* ---------- Da Library (nos Materiais de cada módulo) ---------- */

/** Materiais da Library ligados a um registro de outro módulo: ligar um que já existe ou enviar um novo. */
export function LibraryLinked({ refType, refId }: { refType: LibRefType; refId: string }) {
  const { t } = useSettings();
  const all = useLiveQuery(() => getDb().libraryItems.filter((i) => !i.deletedAt).toArray(), []) ?? [];
  const collections = (useLiveQuery(() => getDb().libraryCollections.toArray(), []) ?? []).filter((c) => !c.deletedAt);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<LibraryItem | null>(null);
  const linked = all.filter((i) => i.refs.some((r) => r.type === refType && r.id === refId));
  const others = all.filter((i) => !linked.includes(i)).sort((a, b) => a.title.localeCompare(b.title));
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 text-sm font-semibold text-fg">{t('library.fromLibrary')}</h3>
        {others.length > 0 && (
          <Select aria-label={t('library.addFromLibrary')} value="" onChange={(e) => e.target.value && void linkItem(e.target.value, { type: refType, id: refId })} className="h-9 w-auto max-w-56">
            <option value="">{t('library.addFromLibrary')}</option>
            {others.map((i) => (
              <option key={i.id} value={i.id}>
                {i.title}
              </option>
            ))}
          </Select>
        )}
        <Button size="sm" variant="secondary" icon={<FileUp className="h-4 w-4" />} onClick={() => setImporting(true)}>
          {t('library.uploadHere')}
        </Button>
      </div>
      {linked.length === 0 ? (
        <p className="text-sm text-muted">{t('library.noneLinked')}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {linked.map((i) => (
            <li key={i.id} className="flex items-center gap-2 rounded-2xl bg-surface p-2 shadow-soft ring-1 ring-line/70">
              <button type="button" onClick={() => setEditing(i)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Thumb item={i} className="h-11 w-11 shrink-0 rounded-lg" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-fg">{i.title}</span>
                  <span className="block truncate text-xs text-muted">{t(`library.kinds.${i.kind}`)}</span>
                </span>
              </button>
              {i.url && (
                <a href={i.url} target="_blank" rel="noreferrer" aria-label={t('library.open')} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              <IconButton label={t('library.unlink')} icon={<X className="h-4 w-4" />} onClick={() => void unlinkItem(i.id, { type: refType, id: refId })} />
            </li>
          ))}
        </ul>
      )}
      {importing && <ImportDialog collections={collections} folders={[]} refs={{ type: refType, id: refId }} onClose={() => setImporting(false)} />}
      {editing && <ItemDialog item={editing} collections={collections} folders={[]} onClose={() => setEditing(null)} />}
    </section>
  );
}

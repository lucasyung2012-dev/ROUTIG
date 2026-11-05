import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, FileUp, FolderTree, HardDrive, Library, Link2, Plus, Quote, RotateCcw, Star, Trash2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { deleteCollection, purgeItem, restoreItem, saveCollection, storageUsage, toggleFavorite } from '@/data/libraryRepo';
import { EMPTY_LIBRARY_FILTER, folderTree, formatBytes, LIBRARY_KINDS, matchesLibrary, type ItemMeta, type LibraryCollection, type LibraryFilter, type LibraryItem, type LibraryKind } from '@/domain/library';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { ColorPicker, PALETTE } from '@/ui/ColorPicker';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Dialog } from '@/ui/Dialog';
import { Field, Input, Select } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { PageHeader } from '@/ui/PageHeader';
import { EmptyState, LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { ImportDialog, ItemDialog, Thumb } from './libraryUi';

/** Library (Parte 18): um lugar para todos os materiais, usados em vários módulos sem enviar de novo. */
export function LibraryPage() {
  const { t } = useSettings();
  const all = useLiveQuery(() => getDb().libraryItems.toArray(), []);
  const collections = (useLiveQuery(() => getDb().libraryCollections.toArray(), []) ?? []).filter((c) => !c.deletedAt).sort((a, b) => a.name.localeCompare(b.name));
  const [filter, setFilter] = useState<LibraryFilter>(EMPTY_LIBRARY_FILTER);
  const [editing, setEditing] = useState<{ item?: LibraryItem; preset?: Partial<ItemMeta> } | null>(null);
  const [importing, setImporting] = useState(false);
  const [collectionDialog, setCollectionDialog] = useState<{ c?: LibraryCollection } | null>(null);
  const live = useMemo(() => (all ?? []).filter((i) => !i.deletedAt), [all]);
  const folders = useMemo(() => folderTree(live), [live]);
  const tags = useMemo(() => [...new Set(live.flatMap((i) => i.tags))].sort((a, b) => a.localeCompare(b)), [live]);
  if (!all) return <LoadingState label={t('common.loading')} lines={5} />;
  const shown = live.filter((i) => matchesLibrary(i, filter)).sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.updatedAt.localeCompare(a.updatedAt));
  const trash = all.filter((i) => i.deletedAt);
  const set = (p: Partial<LibraryFilter>) => setFilter((f) => ({ ...f, ...p }));
  const filtered = JSON.stringify(filter) !== JSON.stringify(EMPTY_LIBRARY_FILTER);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('modules.library')}
        title={t('modules.library')}
        description={t('moduleSummary.library')}
        icon={<Library className="h-7 w-7" aria-hidden />}
        actions={
          <>
            <Button variant="primary" size="sm" icon={<FileUp className="h-4 w-4" />} onClick={() => setImporting(true)}>
              {t('library.import')}
            </Button>
            <Button variant="secondary" size="sm" icon={<Link2 className="h-4 w-4" />} onClick={() => setEditing({ preset: { kind: 'link' } })}>
              {t('library.newOf.link')}
            </Button>
            <Button variant="secondary" size="sm" icon={<BookOpen className="h-4 w-4" />} onClick={() => setEditing({ preset: { kind: 'book', readStatus: 'want' } })}>
              {t('library.newOf.book')}
            </Button>
            <Button variant="secondary" size="sm" icon={<Quote className="h-4 w-4" />} onClick={() => setEditing({ preset: { kind: 'reference' } })}>
              {t('library.newOf.reference')}
            </Button>
          </>
        }
      />

      <Surface className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input aria-label={t('library.search')} placeholder={t('library.search')} value={filter.text} onChange={(e) => set({ text: e.target.value })} className="h-10 min-w-48 flex-1" />
          <Select aria-label={t('library.fields.kind')} value={filter.kind ?? ''} onChange={(e) => set({ kind: (e.target.value || null) as LibraryKind | null })} className="h-10 w-auto">
            <option value="">{t('library.allKinds')}</option>
            {LIBRARY_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`library.kinds.${k}`)}
              </option>
            ))}
          </Select>
          {folders.length > 0 && (
            <Select aria-label={t('library.fields.folder')} value={filter.folder ?? ''} onChange={(e) => set({ folder: e.target.value || null })} className="h-10 w-auto max-w-48">
              <option value="">{t('library.allFolders')}</option>
              {folders.map((f) => (
                <option key={f} value={f}>
                  {'  '.repeat(f.split('/').length - 1)}
                  {f.split('/').pop()}
                </option>
              ))}
            </Select>
          )}
          {tags.length > 0 && (
            <Select aria-label={t('library.fields.tags')} value={filter.tag ?? ''} onChange={(e) => set({ tag: e.target.value || null })} className="h-10 w-auto max-w-40">
              <option value="">{t('library.allTags')}</option>
              {tags.map((x) => (
                <option key={x} value={x}>
                  #{x}
                </option>
              ))}
            </Select>
          )}
          <button type="button" aria-pressed={filter.favorites} onClick={() => set({ favorites: !filter.favorites })} className={cn('inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm ring-1 ring-inset', filter.favorites ? 'bg-warning/15 text-warning ring-warning/40' : 'bg-surface-2 text-muted ring-line')}>
            <Star className="h-4 w-4" aria-hidden />
            {t('library.favorites')}
          </button>
          {filtered && (
            <Button size="sm" variant="ghost" onClick={() => setFilter(EMPTY_LIBRARY_FILTER)}>
              {t('library.clearFilters')}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-subtle">{t('library.collections')}:</span>
          {collections.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={filter.collectionId === c.id}
              onClick={() => set({ collectionId: filter.collectionId === c.id ? null : c.id })}
              onDoubleClick={() => setCollectionDialog({ c })}
              className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ring-1 ring-inset', filter.collectionId === c.id ? 'bg-accent/15 text-accent ring-accent/40' : 'bg-surface-2 text-muted ring-line hover:text-fg')}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: c.color }} aria-hidden />
              {c.name}
            </button>
          ))}
          <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setCollectionDialog({})}>
            {t('library.newCollection')}
          </Button>
          {filter.collectionId && (
            <Button size="sm" variant="ghost" onClick={() => setCollectionDialog({ c: collections.find((c) => c.id === filter.collectionId) })}>
              {t('library.editCollection')}
            </Button>
          )}
        </div>
      </Surface>

      {live.length === 0 ? (
        <Surface tone="flat">
          <EmptyState icon={<Library className="h-6 w-6" />} title={t('library.emptyTitle')} body={t('library.empty')} />
        </Surface>
      ) : shown.length === 0 ? (
        <Surface tone="flat">
          <EmptyState title={t('library.noMatch')} />
        </Surface>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((i) => (
            <li key={i.id} className="relative">
              <button type="button" onClick={() => setEditing({ item: i })} className="flex h-full w-full gap-3 rounded-2xl bg-surface p-3 text-left shadow-soft ring-1 ring-line/70 transition hover:shadow-lift">
                <Thumb item={i} className="h-16 w-16 shrink-0 rounded-xl" />
                <span className="min-w-0 flex-1 pr-7">
                  <span className="line-clamp-2 font-medium text-fg">{i.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted">{[t(`library.kinds.${i.kind}`), i.author, i.folder].filter(Boolean).join(' · ')}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {i.readStatus && <Badge tone={i.readStatus === 'read' ? 'success' : i.readStatus === 'reading' ? 'accent' : 'neutral'}>{t(`library.readStatuses.${i.readStatus}`)}</Badge>}
                    {i.refs.length > 0 && <Badge tone="info">{t('library.usedInCount', { count: i.refs.length })}</Badge>}
                    {i.tags.slice(0, 3).map((x) => (
                      <Badge key={x}>#{x}</Badge>
                    ))}
                  </span>
                </span>
              </button>
              <IconButton label={i.favorite ? t('library.unfavorite') : t('library.favorite')} icon={<Star className={cn('h-4 w-4', i.favorite && 'fill-warning text-warning')} />} onClick={() => void toggleFavorite(i.id)} className="absolute right-2 top-2" />
            </li>
          ))}
        </ul>
      )}

      {folders.length > 0 && !filter.folder && (
        <p className="flex items-center gap-1.5 text-xs text-subtle">
          <FolderTree className="h-3.5 w-3.5" aria-hidden />
          {t('library.foldersLine', { count: folders.length })}
        </p>
      )}

      <Storage />

      {trash.length > 0 && <Trash items={trash} />}

      {editing && <ItemDialog item={editing.item} preset={editing.preset} collections={collections} folders={folders} onClose={() => setEditing(null)} />}
      {importing && <ImportDialog collections={collections} folders={folders} onClose={() => setImporting(false)} />}
      {collectionDialog && <CollectionDialog collection={collectionDialog.c} used={collections.length} onClose={() => setCollectionDialog(null)} onDeleted={() => set({ collectionId: null })} />}
    </div>
  );
}

/* ---------- Armazenamento (Parte 18.5) ---------- */

function Storage() {
  const { t, settings } = useSettings();
  const usage = useLiveQuery(() => storageUsage(), []);
  const [quota, setQuota] = useState<{ usage: number; quota: number } | null>(null);
  useEffect(() => {
    void navigator.storage
      ?.estimate?.()
      .then((e) => e.quota && setQuota({ usage: e.usage ?? 0, quota: e.quota }))
      .catch(() => undefined);
  }, [usage]);
  if (!usage) return null;
  return (
    <Surface className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 font-semibold text-fg">
        <HardDrive className="h-4 w-4 text-accent" aria-hidden />
        {t('library.storage')}
      </h2>
      <p className="text-sm text-fg">{t('library.storageLibrary', { size: formatBytes(usage.library, settings.locale), count: usage.libraryFiles })}</p>
      <p className="text-sm text-muted">{t('library.storageAll', { size: formatBytes(usage.allFiles, settings.locale), count: usage.allCount })}</p>
      {quota && (
        <>
          <span className="block h-2 overflow-hidden rounded-full bg-surface-3">
            <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (quota.usage / quota.quota) * 100)}%` }} />
          </span>
          <p className="text-xs text-muted">{t('library.storageDevice', { used: formatBytes(quota.usage, settings.locale), total: formatBytes(quota.quota, settings.locale) })}</p>
        </>
      )}
      <p className="text-xs text-subtle">{t('library.storageHint')}</p>
    </Surface>
  );
}

/* ---------- Lixeira ---------- */

function Trash({ items }: { items: LibraryItem[] }) {
  const { t } = useSettings();
  const toast = useToast();
  const [purging, setPurging] = useState<LibraryItem | null>(null);
  return (
    <Surface tone="flat" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-fg">{t('library.trash')}</h2>
      {items.map((i) => (
        <div key={i.id} className="flex items-center gap-2 text-sm">
          <span className="min-w-0 flex-1 truncate text-muted">{i.title}</span>
          <Button size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => void restoreItem(i.id)}>
            {t('academy.assessment.restore')}
          </Button>
          <IconButton label={t('library.purge')} icon={<Trash2 className="h-4 w-4" />} onClick={() => setPurging(i)} />
        </div>
      ))}
      <ConfirmDialog
        open={!!purging}
        title={t('library.purgeTitle')}
        body={purging?.fileId ? t('library.purgeBodyFile') : t('library.purgeBody')}
        confirmLabel={t('library.purge')}
        cancelLabel={t('common.cancel')}
        danger
        onCancel={() => setPurging(null)}
        onConfirm={() => {
          const p = purging;
          setPurging(null);
          if (p) void purgeItem(p.id).then((r) => toast.show(r.fileRemoved ? t('library.purgedFile') : p.fileId ? t('library.purgedKept') : t('library.purged')));
        }}
      />
    </Surface>
  );
}

/* ---------- Coleções ---------- */

function CollectionDialog({ collection, used, onClose, onDeleted }: { collection?: LibraryCollection; used: number; onClose: () => void; onDeleted: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [name, setName] = useState(collection?.name ?? '');
  const [color, setColor] = useState<string>(collection?.color ?? PALETTE[(used + 10) % PALETTE.length]!);
  const save = async () => {
    try {
      await saveCollection(collection?.id ?? null, name, color);
      toast.show(t('library.saved'));
      onClose();
    } catch {
      toast.show(t('library.errors.collection'), 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      title={collection ? t('library.editCollection') : t('library.newCollection')}
      footer={
        <>
          {collection && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={() =>
                void deleteCollection(collection.id).then(() => {
                  toast.show(t('library.collectionRemoved'));
                  onDeleted();
                  onClose();
                })
              }
            >
              {t('library.removeCollection')}
            </Button>
          )}
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
        <Field label={t('library.collectionName')}>{(id) => <Input id={id} autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />}</Field>
        <ColorPicker value={color} onChange={setColor} label={t('library.fields.color')} showLabel />
        {collection && <p className="text-xs text-muted">{t('library.removeCollectionHint')}</p>}
      </div>
    </Dialog>
  );
}

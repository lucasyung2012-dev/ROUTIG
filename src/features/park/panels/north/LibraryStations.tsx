import { useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, ExternalLink, FileUp, Link2, Plus, Quote, Search, Star } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { createItem, LibraryRuleError, saveCollection, toggleFavorite, updateItem } from '@/data/libraryRepo';
import { EMPTY_LIBRARY_FILTER, folderTree, LIBRARY_KINDS, matchesLibrary, metaOf, READ_STATUSES, type ItemMeta, type LibraryCollection, type LibraryItem, type LibraryKind, type ReadStatus } from '@/domain/library';
import { FileActions, ImportDialog, ItemDialog, Thumb } from '@/features/library/libraryUi';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { PALETTE } from '@/ui/ColorPicker';
import { Input, Select } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { Segmented } from '@/ui/Segmented';
import { LoadingState } from '@/ui/States';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { ControlRoomLink, Empty, Pane, Station, useStationState } from './station';

/** Estações da Biblioteca Digital: catálogo, coleções, consulta e pesquisa sobre os materiais da Library. */
export type LibraryStationId = 'atrium' | 'collections' | 'consult' | 'search';

function useLibrary() {
  const all = useLiveQuery(() => getDb().libraryItems.toArray(), []);
  const cols = useLiveQuery(() => getDb().libraryCollections.toArray(), []);
  return useMemo(() => {
    const live = (all ?? []).filter((i) => !i.deletedAt);
    return {
      loading: all === undefined || cols === undefined,
      live,
      collections: (cols ?? []).filter((c) => !c.deletedAt).sort((a, b) => a.name.localeCompare(b.name)),
      folders: folderTree(live),
    };
  }, [all, cols]);
}
type Lib = ReturnType<typeof useLibrary>;

export function LibraryStation({ id }: { id: LibraryStationId }) {
  const { t } = useSettings();
  const lib = useLibrary();
  const [editing, setEditing] = useState<LibraryItem | null>(null);
  const label = t(`park.library.sectors.${id}`);
  if (lib.loading) return <LoadingState label={t('common.loading')} lines={3} />;
  const open = (i: LibraryItem) => setEditing(i);
  return (
    <Station building="library" label={label}>
      {id === 'atrium' && <Atrium lib={lib} onOpen={open} />}
      {id === 'collections' && <Collections lib={lib} onOpen={open} />}
      {id === 'consult' && <Consult lib={lib} onOpen={open} />}
      {id === 'search' && <SearchRoom lib={lib} onOpen={open} />}
      <ControlRoomLink to="/library" />
      {editing && <ItemDialog item={editing} collections={lib.collections} folders={lib.folders} onClose={() => setEditing(null)} />}
    </Station>
  );
}

/* ---------- Linha de material (comum às estações) ---------- */

function ItemRow({ item, onOpen, extra }: { item: LibraryItem; onOpen: (i: LibraryItem) => void; extra?: ReactNode }) {
  const { t } = useSettings();
  return (
    <li className="flex items-center gap-3 rounded-xl bg-surface/70 p-2 ring-1 ring-inset ring-line/50">
      <Thumb item={item} className="h-10 w-10 shrink-0 rounded-lg" />
      <button type="button" onClick={() => onOpen(item)} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium text-fg">{item.title}</span>
        <span className="block truncate text-xs text-muted">{[t(`library.kinds.${item.kind}`), item.author, item.folder].filter(Boolean).join(' · ')}</span>
      </button>
      {extra}
      {item.url && (
        <a href={item.url} target="_blank" rel="noreferrer" aria-label={t('library.open')} title={t('library.open')} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg">
          <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      )}
      <IconButton size="sm" label={item.favorite ? t('library.unfavorite') : t('library.favorite')} icon={<Star className={cn('h-4 w-4', item.favorite && 'fill-warning text-warning')} />} onClick={() => void toggleFavorite(item.id)} />
    </li>
  );
}

function ItemList({ items, onOpen, empty, extra }: { items: LibraryItem[]; onOpen: (i: LibraryItem) => void; empty: string; extra?: (i: LibraryItem) => ReactNode }) {
  if (items.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((i) => (
        <ItemRow key={i.id} item={i} onOpen={onOpen} extra={extra?.(i)} />
      ))}
    </ul>
  );
}

const newest = (a: LibraryItem, b: LibraryItem) => b.importedAt.localeCompare(a.importedAt) || b.createdAt.localeCompare(a.createdAt);

/* ---------- Grande Átrio: entrada rápida, novos e favoritos ---------- */

type QuickKind = 'link' | 'book' | 'reference';
const QUICK_ICON = { link: <Link2 className="h-4 w-4" aria-hidden />, book: <BookOpen className="h-4 w-4" aria-hidden />, reference: <Quote className="h-4 w-4" aria-hidden /> } as const;

function Atrium({ lib, onOpen }: { lib: Lib; onOpen: (i: LibraryItem) => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [kind, setKind] = useStationState<QuickKind>('library.quickKind', 'link');
  const [title, setTitle] = useState('');
  const [extra, setExtra] = useState('');
  const [importing, setImporting] = useState(false);
  const recent = [...lib.live].sort(newest).slice(0, 6);
  const favs = lib.live.filter((i) => i.favorite).sort(newest).slice(0, 6);
  const add = async () => {
    const meta: ItemMeta = {
      kind,
      title,
      author: kind === 'link' ? '' : extra,
      url: kind === 'link' ? extra.trim() : '',
      folder: '',
      category: '',
      tags: [],
      collectionIds: [],
      favorite: false,
      readStatus: kind === 'book' ? 'want' : null,
      notes: '',
    };
    try {
      await createItem(meta);
      setTitle('');
      setExtra('');
      toast.show(t('library.saved'));
    } catch (e) {
      const code = e instanceof LibraryRuleError ? e.code : 'invalid';
      toast.show(code === 'duplicate' ? t('library.errors.duplicateLink') : kind === 'link' && extra && !/^https?:\/\//i.test(extra.trim()) ? t('library.errors.url') : t('library.errors.invalid'), 'error');
    }
  };
  return (
    <>
      <Pane title={t('park.native.north.library.quickAdd')}>
        <Segmented<QuickKind> label={t('library.fields.kind')} value={kind} onChange={setKind} options={(['link', 'book', 'reference'] as const).map((k) => ({ value: k, label: t(`library.kinds.${k}`), icon: QUICK_ICON[k] }))} />
        <Input aria-label={t('library.fields.title')} placeholder={t('library.fields.title')} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        <Input
          aria-label={kind === 'link' ? t('library.fields.url') : t('library.fields.author')}
          placeholder={kind === 'link' ? 'https://…' : t('library.fields.author')}
          inputMode={kind === 'link' ? 'url' : undefined}
          value={extra}
          maxLength={kind === 'link' ? 1000 : 200}
          onChange={(e) => setExtra(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} disabled={!title.trim() || (kind === 'link' && !extra.trim())} onClick={() => void add()}>
            {t('park.native.north.library.addToCatalog')}
          </Button>
          <Button variant="secondary" size="sm" icon={<FileUp className="h-4 w-4" />} onClick={() => setImporting(true)}>
            {t('library.import')}
          </Button>
        </div>
      </Pane>
      <Pane title={t('park.native.north.library.newest')}>
        <ItemList items={recent} onOpen={onOpen} empty={t('library.emptyTitle')} />
      </Pane>
      {favs.length > 0 && (
        <Pane title={t('library.favorites')}>
          <ItemList items={favs} onOpen={onOpen} empty="" />
        </Pane>
      )}
      {importing && <ImportDialog collections={lib.collections} folders={lib.folders} onClose={() => setImporting(false)} />}
    </>
  );
}

/* ---------- Galeria de Coleções ---------- */

function Collections({ lib, onOpen }: { lib: Lib; onOpen: (i: LibraryItem) => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const [selected, setSelected] = useStationState<string | null>('library.collection', null);
  const [name, setName] = useState('');
  const [adding, setAdding] = useState('');
  const current: LibraryCollection | undefined = lib.collections.find((c) => c.id === selected) ?? lib.collections[0];
  const inside = current ? lib.live.filter((i) => i.collectionIds.includes(current.id)).sort(newest) : [];
  const outside = current ? lib.live.filter((i) => !i.collectionIds.includes(current.id)).sort((a, b) => a.title.localeCompare(b.title)) : [];
  const setCollections = async (i: LibraryItem, ids: string[]) => {
    try {
      await updateItem(i.id, { ...metaOf(i), collectionIds: ids });
    } catch {
      toast.show(t('library.errors.invalid'), 'error');
    }
  };
  const create = async () => {
    try {
      const c = await saveCollection(null, name, PALETTE[(lib.collections.length + 10) % PALETTE.length]!);
      setName('');
      setSelected(c.id);
      toast.show(t('library.saved'));
    } catch {
      toast.show(t('library.errors.collection'), 'error');
    }
  };
  return (
    <>
      <Pane title={t('library.collections')}>
        {lib.collections.length === 0 ? (
          <Empty>{t('park.native.north.library.noCollections')}</Empty>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {lib.collections.map((c) => {
              const on = current?.id === c.id;
              const n = lib.live.filter((i) => i.collectionIds.includes(c.id)).length;
              return (
                <button key={c.id} type="button" aria-pressed={on} onClick={() => setSelected(c.id)} className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ring-1 ring-inset', on ? 'bg-accent/15 text-accent ring-accent/40' : 'bg-surface/70 text-muted ring-line hover:text-fg')}>
                  <span className="h-2 w-2 rounded-full" style={{ background: c.color }} aria-hidden />
                  {c.name}
                  <span className="tabular-nums text-xs opacity-70">{n}</span>
                </button>
              );
            })}
          </div>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void create();
          }}
        >
          <Input aria-label={t('library.collectionName')} placeholder={t('library.newCollection')} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" size="sm" variant="secondary" className="h-11" icon={<Plus className="h-4 w-4" />} disabled={!name.trim()}>
            {t('park.native.north.create')}
          </Button>
        </form>
      </Pane>
      {current && (
        <Pane title={current.name}>
          <ItemList
            items={inside}
            onOpen={onOpen}
            empty={t('park.native.north.library.collectionEmpty')}
            extra={(i) => (
              <Button size="sm" variant="ghost" onClick={() => void setCollections(i, i.collectionIds.filter((x) => x !== current.id))}>
                {t('park.native.north.library.removeFrom')}
              </Button>
            )}
          />
          {outside.length > 0 && (
            <div className="flex gap-2">
              <Select aria-label={t('park.native.north.library.addMaterial')} value={adding} onChange={(e) => setAdding(e.target.value)}>
                <option value="">{t('park.native.north.library.addMaterial')}</option>
                {outside.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.title}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="secondary"
                className="h-11"
                disabled={!adding}
                onClick={() => {
                  const i = outside.find((x) => x.id === adding);
                  if (i) void setCollections(i, [...i.collectionIds, current.id]).then(() => setAdding(''));
                }}
              >
                {t('park.native.north.add')}
              </Button>
            </div>
          )}
        </Pane>
      )}
    </>
  );
}

/* ---------- Centro de Consulta: leitura em andamento e materiais para abrir ---------- */

function Consult({ lib, onOpen }: { lib: Lib; onOpen: (i: LibraryItem) => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const books = lib.live.filter((i) => i.readStatus !== null);
  const reading = books.filter((i) => i.readStatus === 'reading').sort(newest);
  const want = books.filter((i) => i.readStatus === 'want').sort(newest);
  const files = lib.live.filter((i) => i.fileId).sort(newest).slice(0, 5);
  const setStatus = async (i: LibraryItem, s: ReadStatus) => {
    try {
      await updateItem(i.id, { ...metaOf(i), readStatus: s });
    } catch {
      toast.show(t('library.errors.invalid'), 'error');
    }
  };
  const statusPicker = (i: LibraryItem) => (
    <Select aria-label={`${t('library.fields.readStatus')}: ${i.title}`} value={i.readStatus ?? ''} onChange={(e) => void setStatus(i, e.target.value as ReadStatus)} className="h-9 w-auto shrink-0 text-xs">
      {READ_STATUSES.map((s) => (
        <option key={s} value={s}>
          {t(`library.readStatuses.${s}`)}
        </option>
      ))}
    </Select>
  );
  return (
    <>
      <Pane title={t('library.readStatuses.reading')}>
        <ItemList items={reading} onOpen={onOpen} empty={t('park.native.north.library.noneReading')} extra={statusPicker} />
      </Pane>
      <Pane title={t('library.readStatuses.want')}>
        <ItemList items={want.slice(0, 8)} onOpen={onOpen} empty={t('park.native.north.library.noneWant')} extra={statusPicker} />
      </Pane>
      <Pane title={t('park.native.north.library.files')}>
        {files.length === 0 ? (
          <Empty>{t('park.native.north.library.noFiles')}</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {files.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 rounded-xl bg-surface/70 p-2 ring-1 ring-inset ring-line/50">
                <button type="button" onClick={() => onOpen(i)} className="truncate text-left text-sm font-medium text-fg">
                  {i.title}
                </button>
                <FileActions item={i} />
              </li>
            ))}
          </ul>
        )}
      </Pane>
    </>
  );
}

/* ---------- Sala de Pesquisa: a mesma busca da Library ---------- */

function SearchRoom({ lib, onOpen }: { lib: Lib; onOpen: (i: LibraryItem) => void }) {
  const { t } = useSettings();
  const [text, setText] = useStationState('library.search.text', '');
  const [kind, setKind] = useStationState<LibraryKind | null>('library.search.kind', null);
  const [favorites, setFavorites] = useStationState('library.search.fav', false);
  const filter = { ...EMPTY_LIBRARY_FILTER, text, kind, favorites };
  const active = !!text.trim() || !!kind || favorites;
  const found = active ? lib.live.filter((i) => matchesLibrary(i, filter)).sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.updatedAt.localeCompare(a.updatedAt)) : [];
  return (
    <Pane>
      <label className="relative block">
        <span className="sr-only">{t('library.search')}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
        <Input className="pl-9" placeholder={t('library.search')} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label={t('library.fields.kind')} value={kind ?? ''} onChange={(e) => setKind((e.target.value || null) as LibraryKind | null)} className="h-10 w-auto">
          <option value="">{t('library.allKinds')}</option>
          {LIBRARY_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`library.kinds.${k}`)}
            </option>
          ))}
        </Select>
        <button type="button" aria-pressed={favorites} onClick={() => setFavorites(!favorites)} className={cn('inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm ring-1 ring-inset', favorites ? 'bg-warning/15 text-warning ring-warning/40' : 'bg-surface/70 text-muted ring-line')}>
          <Star className="h-4 w-4" aria-hidden />
          {t('library.favorites')}
        </button>
      </div>
      {!active ? (
        <Empty>{t('park.native.north.library.searchHint', { count: lib.live.length })}</Empty>
      ) : (
        <>
          <p className="text-xs text-muted">{t('park.native.north.found', { count: found.length })}</p>
          <ItemList items={found.slice(0, 40)} onOpen={onOpen} empty={t('library.noMatch')} extra={(i) => (i.readStatus ? <Badge>{t(`library.readStatuses.${i.readStatus}`)}</Badge> : null)} />
        </>
      )}
    </Pane>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Inbox, ListTodo, LogIn, Monitor, Search, Star, Timer, X } from 'lucide-react';
import { MODULES, type ModuleId } from '@/app/modules';
import { useSettings } from '@/app/SettingsProvider';
import { PARK_BUILDINGS, PARK_REGIONS, buildingById } from '@/domain/park';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { Input } from '@/ui/Field';
import { cn } from '@/ui/cn';
import { readFavorites, readRecents, writeFavorites } from './parkContext';

/** Só foca a busca sozinho com mouse e sem toque: no iPad o foco abre o teclado por cima da Central. */
const keyboardFirst = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches && (navigator.maxTouchPoints ?? 0) === 0;

const ALL: ModuleId[] = PARK_REGIONS.flatMap((r) => PARK_BUILDINGS.filter((b) => b.region === r).map((b) => b.id));
const SHORTCUTS: Array<{ id: ModuleId; icon: typeof Inbox }> = [
  { id: 'inbox', icon: Inbox },
  { id: 'calendar', icon: CalendarDays },
  { id: 'tasks', icon: ListTodo },
  { id: 'focus', icon: Timer },
];

/**
 * Central de Módulos (V2.1, seção 4): acesso rápido aos 18 módulos sem sair do parque.
 * Lista lateral, busca, favoritos, recentes e atalhos; cada módulo abre a interface 2D clássica
 * ou leva para dentro do prédio. Ao voltar do 2D, o parque retoma de onde a pessoa estava.
 */
export function ModuleCenter({ inside, onClose, onEnter, onOpen2D }: { inside: ModuleId | null; onClose: () => void; onEnter: (id: ModuleId) => void; onOpen2D: (id: ModuleId) => void }) {
  const { t } = useSettings();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ModuleId | null>(inside);
  const [favorites, setFavorites] = useState<ModuleId[]>(readFavorites);
  const recents = useMemo(readRecents, []);
  const search = useRef<HTMLInputElement>(null);
  const autoFocus = useMemo(keyboardFirst, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleFav = (id: ModuleId) => {
    const next = favorites.includes(id) ? favorites.filter((x) => x !== id) : [...favorites, id];
    setFavorites(next);
    writeFavorites(next);
  };

  const q = query.trim().toLocaleLowerCase();
  const found = q ? ALL.filter((id) => `${t(`modules.${id}`)} ${t(`park.names.${id}`)} ${t(`moduleSummary.${id}`)}`.toLocaleLowerCase().includes(q)) : [];

  const card = (id: ModuleId, big = false) => {
    const Icon = MODULES[id].icon;
    const b = buildingById(id)!;
    const fav = favorites.includes(id);
    return (
      <article key={id} className={cn('flex flex-col gap-2 rounded-2xl bg-surface-2 p-3 ring-1 ring-inset ring-line', big && 'p-4 ring-2 ring-accent/50')}>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-accent ring-1 ring-line">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-fg">{t(`modules.${id}`)}</h3>
            <p className="truncate text-xs text-muted">
              {t(`park.names.${id}`)} · {t(`park.regions.${b.region}`)}
            </p>
          </div>
          <IconButton size="sm" label={fav ? t('park.center.unfav') : t('park.center.fav')} active={fav} icon={<Star className={cn('h-4 w-4', fav && 'fill-current')} />} onClick={() => toggleFav(id)} />
        </div>
        {big && <p className="text-xs text-muted">{t(`moduleSummary.${id}`)}</p>}
        {inside === id && <p className="text-xs font-medium text-accent">{t('park.center.here')}</p>}
        <div className="mt-auto flex flex-wrap gap-2">
          <Button size="sm" variant="primary" icon={<Monitor className="h-4 w-4" />} onClick={() => onOpen2D(id)}>
            {t('park.center.open2d')}
          </Button>
          {inside !== id && (
            <Button size="sm" variant="secondary" icon={<LogIn className="h-4 w-4" />} onClick={() => onEnter(id)}>
              {t('park.center.enter')}
            </Button>
          )}
        </div>
      </article>
    );
  };

  const section = (title: string, ids: ModuleId[], empty?: string) => (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {ids.length ? <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{ids.map((id) => card(id))}</div> : empty && <p className="text-xs text-subtle">{empty}</p>}
    </section>
  );

  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label={t('park.center.title')} className="relative flex w-full max-w-5xl overflow-hidden bg-surface shadow-lift ring-1 ring-line safe-top sm:rounded-3xl">
        {/* Lista lateral: os 18 módulos por região */}
        <nav aria-label={t('park.center.all')} className="hidden w-56 shrink-0 overflow-y-auto border-r border-line/70 p-2 md:block">
          {PARK_REGIONS.map((r) => (
            <div key={r} className="mb-2">
              <p className="px-2 pb-1 pt-2 text-[0.68rem] font-semibold uppercase tracking-wide text-subtle">{t(`park.regions.${r}`)}</p>
              {ALL.filter((id) => buildingById(id)!.region === r).map((id) => {
                const Icon = MODULES[id].icon;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={selected === id}
                    onClick={() => setSelected(id)}
                    className={cn('flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm', selected === id ? 'bg-accent/15 font-semibold text-fg' : 'text-fg hover:bg-surface-2')}
                  >
                    <Icon className="h-4 w-4 text-muted" aria-hidden />
                    <span className="truncate">{t(`modules.${id}`)}</span>
                    {favorites.includes(id) && <Star className="ml-auto h-3 w-3 fill-current text-warning" aria-hidden />}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-2 border-b border-line/70 p-3">
            <h1 className="hidden shrink-0 text-base font-semibold text-fg sm:block">{t('park.center.title')}</h1>
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
              <Input ref={search} autoFocus={autoFocus} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('park.center.search')} aria-label={t('park.center.search')} className="pl-9" />
            </label>
            <IconButton label={t('common.close')} icon={<X className="h-5 w-5" />} onClick={onClose} />
          </header>

          <div className="flex-1 space-y-5 overflow-y-auto p-4" style={{ touchAction: 'pan-y' }}>
            {q ? (
              section(t('park.center.results'), found, t('park.center.noResults'))
            ) : (
              <>
                {selected && <div className="max-w-md">{card(selected, true)}</div>}
                <section className="flex flex-col gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{t('park.center.shortcuts')}</h2>
                  <div className="flex flex-wrap gap-2">
                    {SHORTCUTS.map(({ id, icon: Icon }) => (
                      <button key={id} type="button" onClick={() => onOpen2D(id)} className="flex h-10 items-center gap-2 rounded-full bg-surface-2 px-4 text-sm font-medium text-fg ring-1 ring-inset ring-line hover:bg-surface">
                        <Icon className="h-4 w-4 text-accent" aria-hidden />
                        {t(`park.center.sc.${id as 'inbox' | 'calendar' | 'tasks' | 'focus'}`)}
                      </button>
                    ))}
                  </div>
                </section>
                {section(t('park.center.favorites'), favorites, t('park.center.emptyFav'))}
                {recents.length > 0 && section(t('park.center.recents'), recents)}
                {section(t('park.center.all'), ALL)}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

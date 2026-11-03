import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { MODULES, NAV_MODULE_IDS, SYSTEM_MODULE_IDS, type ModuleId } from '@/app/modules';
import { useSettings } from '@/app/SettingsProvider';
import { SETTINGS_SECTIONS } from '@/features/settings/sections';
import { cn } from '@/ui/cn';

interface Result {
  key: string;
  group: 'modules' | 'settings';
  label: string;
  detail: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
}

export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Busca global da Etapa 0: navega entre módulos e seções de Settings. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useSettings();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const all = useMemo<Result[]>(() => {
    const modules = [...NAV_MODULE_IDS, ...SYSTEM_MODULE_IDS].map((id: ModuleId) => ({
      key: `m:${id}`,
      group: 'modules' as const,
      label: t(`modules.${id}`),
      detail: t(`moduleSummary.${id}`),
      path: MODULES[id].path,
      icon: MODULES[id].icon,
    }));
    const sections = SETTINGS_SECTIONS.map((s) => ({
      key: `s:${s.id}`,
      group: 'settings' as const,
      label: t(`settings.sections.${s.id}`),
      detail: t('modules.settings'),
      path: `/settings/${s.id}`,
      icon: s.icon,
    }));
    return [...modules, ...sections];
  }, [t]);

  const results = useMemo(() => {
    const q = normalizeText(query.trim());
    if (!q) return all;
    return all.filter((r) => normalizeText(`${r.label} ${r.detail}`).includes(q));
  }, [all, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      window.setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;
  const activeKey = results[active]?.key;

  const go = (r: Result | undefined) => {
    if (!r) return;
    navigate(r.path);
    onClose();
  };

  const groups: Array<{ id: Result['group']; label: string }> = [
    { id: 'modules', label: t('search.groupModules') },
    { id: 'settings', label: t('search.groupSettings') },
  ];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 bg-bg/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('search.open')}
        className="relative w-full max-w-xl animate-scale-in overflow-hidden rounded-3xl bg-surface shadow-lift ring-1 ring-line"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            go(results[active]);
          }
        }}
      >
        <div className="flex items-center gap-3 border-b border-line/70 px-5">
          <Search className="h-5 w-5 text-subtle" aria-hidden />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.placeholder')}
            aria-label={t('common.search')}
            aria-controls="palette-results"
            aria-activedescendant={activeKey ? `palette-${activeKey}` : undefined}
            className="h-14 flex-1 bg-transparent text-base text-fg placeholder:text-subtle focus:outline-none"
          />
          <kbd className="hidden rounded-md bg-surface-2 px-1.5 py-0.5 text-[0.7rem] text-subtle ring-1 ring-line sm:block">Esc</kbd>
        </div>
        <ul id="palette-results" role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">{t('search.empty', { query })}</li>}
          {groups.map((g) => {
            const items = results.filter((r) => r.group === g.id);
            if (items.length === 0) return null;
            return (
              <li key={g.id} role="presentation">
                <div className="px-3 pb-1 pt-3 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-subtle">{g.label}</div>
                <ul role="presentation">
                  {items.map((r) => {
                    const index = results.indexOf(r);
                    const Icon = r.icon;
                    return (
                      <li
                        key={r.key}
                        id={`palette-${r.key}`}
                        role="option"
                        aria-selected={index === active}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => go(r)}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5',
                          index === active ? 'bg-accent/10' : 'hover:bg-surface-2',
                        )}
                      >
                        <Icon className={cn('h-[18px] w-[18px] shrink-0', index === active ? 'text-accent' : 'text-muted')} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-fg">{r.label}</div>
                          <div className="truncate text-xs text-muted">{r.detail}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-line/70 px-5 py-3 text-xs text-subtle">{t('search.contentLater')}</div>
      </div>
    </div>,
    document.body,
  );
}

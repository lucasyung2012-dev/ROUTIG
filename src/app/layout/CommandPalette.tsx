import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, FolderKanban, ListTodo, NotebookPen, Search } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/data/db';
import { matchesNote, notePreview } from '@/domain/notes';
import { formatDateKey } from '@/domain/dates';
import { taskSearchText } from '@/domain/tasks';
import { useTaskEditor } from '@/features/tasks/TaskEditor';
import { useTasksData } from '@/features/tasks/useTasksData';
import { useEventEditor } from '@/features/calendar/EventEditor';
import { useCalendarData } from '@/features/calendar/useCalendarData';
import { addDays, todayKey } from '@/domain/dates';
import { occurrencesInRange } from '@/domain/events';
import { MODULES, NAV_MODULE_IDS, SYSTEM_MODULE_IDS, type ModuleId } from '@/app/modules';
import { useSettings } from '@/app/SettingsProvider';
import { SETTINGS_SECTIONS } from '@/features/settings/sections';
import { cn } from '@/ui/cn';

interface Result {
  key: string;
  group: 'modules' | 'settings' | 'tasks' | 'events' | 'notes' | 'projects';
  /** Evento e data da ocorrência a abrir no editor. */
  event?: { id: string; seriesDate: string };
  /** Tarefa a abrir no editor, em vez de navegar. */
  taskId?: string;
  label: string;
  detail: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
}

export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Busca global: tarefas (título, descrição, tags, checklist, observações), módulos e seções de Settings. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, settings } = useSettings();
  const navigate = useNavigate();
  const tasks = useTasksData();
  const editor = useTaskEditor();
  const eventEditor = useEventEditor();
  const cal = useCalendarData();
  const allNotes = useLiveQuery(() => getDb().notes.toArray(), []);
  const allProjects = useLiveQuery(() => getDb().projects.toArray(), []);
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
    const words = q.split(/\s+/);
    const taskHits: Result[] = tasks.active
      .filter((x) => {
        const hay = taskSearchText(x);
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 8)
      .map((x) => ({
        key: `t:${x.id}`,
        group: 'tasks' as const,
        taskId: x.id,
        label: x.title,
        detail: [t('modules.tasks'), x.dueDate ? formatDateKey(x.dueDate, settings.locale) : '', ...x.tags.map((g) => `#${g}`)].filter(Boolean).join(' · '),
        path: '/tasks',
        icon: ListTodo,
      }));
    const today = todayKey();
    const eventHits: Result[] = cal.events
      .filter((e) => {
        const hay = normalizeText(`${e.title} ${e.location} ${e.description} ${e.notes}`);
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 8)
      .map((e) => {
        const next = occurrencesInRange(e, today, addDays(today, 366))[0];
        const date = next?.date ?? e.start;
        return {
          key: `e:${e.id}`,
          group: 'events' as const,
          event: { id: e.id, seriesDate: next?.seriesDate ?? e.start },
          label: e.title,
          detail: [t('modules.calendar'), formatDateKey(date, settings.locale), e.location].filter(Boolean).join(' · '),
          path: '/calendar',
          icon: CalendarDays,
        };
      });
    const noteHits: Result[] = (allNotes ?? [])
      .filter((n) => !n.deletedAt && matchesNote(n, query))
      .slice(0, 8)
      .map((n) => ({
        key: `n:${n.id}`,
        group: 'notes' as const,
        label: n.title || t('notes.untitled'),
        detail: [t('modules.notes'), notePreview(n, 60)].filter(Boolean).join(' · '),
        path: `/notes/${n.id}`,
        icon: NotebookPen,
      }));
    const projectHits: Result[] = (allProjects ?? [])
      .filter((p) => {
        if (p.deletedAt) return false;
        const hay = normalizeText(`${p.name} ${p.description} ${p.tags.join(' ')} ${p.milestones.map((m) => m.title).join(' ')}`);
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 6)
      .map((p) => ({ key: `p:${p.id}`, group: 'projects' as const, label: p.name, detail: t('modules.projects'), path: `/projects/${p.id}`, icon: FolderKanban }));
    return [...projectHits, ...taskHits, ...eventHits, ...noteHits, ...all.filter((r) => normalizeText(`${r.label} ${r.detail}`).includes(q))];
  }, [all, query, tasks.active, cal.events, allNotes, allProjects, settings.locale, t]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      // No toque (iPad, celular) não abre o teclado sozinho: ele cobriria metade da lista.
      const coarse = window.matchMedia?.('(pointer: coarse)').matches;
      if (!coarse) window.setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  // Altura realmente visível (desconta o teclado na tela do iPad e do celular).
  const [viewportH, setViewportH] = useState(() => (typeof window === 'undefined' ? 800 : window.visualViewport?.height ?? window.innerHeight));
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    const onResize = () => setViewportH(vv?.height ?? window.innerHeight);
    onResize();
    vv?.addEventListener('resize', onResize);
    window.addEventListener('resize', onResize);
    return () => {
      vv?.removeEventListener('resize', onResize);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  if (!open) return null;
  const activeKey = results[active]?.key;

  const go = (r: Result | undefined) => {
    if (!r) return;
    if (r.taskId) editor.openTask(r.taskId);
    else if (r.event) eventEditor.openEvent(r.event.id, r.event.seriesDate);
    else navigate(r.path);
    onClose();
  };

  const groups: Array<{ id: Result['group']; label: string }> = [
    { id: 'projects', label: t('search.groupProjects') },
    { id: 'tasks', label: t('search.groupTasks') },
    { id: 'events', label: t('search.groupEvents') },
    { id: 'notes', label: t('search.groupNotes') },
    { id: 'modules', label: t('search.groupModules') },
    { id: 'settings', label: t('search.groupSettings') },
  ];

  return createPortal(
    <div className="fixed inset-x-0 top-0 z-50 flex items-start justify-center p-4 pt-[6vh] sm:pt-[10vh]" style={{ height: viewportH }}>
      <div className="absolute inset-0 bg-bg/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('search.open')}
        className="relative flex max-h-full w-full max-w-xl animate-scale-in flex-col overflow-hidden rounded-3xl bg-surface shadow-lift ring-1 ring-line"
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
        <ul id="palette-results" role="listbox" className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-2">
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

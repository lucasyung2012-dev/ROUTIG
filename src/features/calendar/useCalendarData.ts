import { useMemo, type CSSProperties } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { loadCalendarConfig, migrateCalendarConfig, type CalendarConfig } from '@/data/eventsRepo';
import type { DateKey } from '@/domain/dates';
import { findConflicts, occurrencesInRange, toMinutes, type CalendarEvent, type EventCategory, type EventOccurrence, type EventTone } from '@/domain/events';
import { isClosedKind, statusKind, type Task } from '@/domain/tasks';
import { useTasksData, type TasksData } from '@/features/tasks/useTasksData';

/** Um item no calendário: ocorrência de evento ou tarefa com prazo (o registro original, nunca uma cópia). */
export interface CalendarItem {
  key: string;
  kind: 'event' | 'task' | 'milestone';
  date: DateKey;
  endDate: DateKey;
  allDay: boolean;
  /** Minutos desde 0h; null em dia inteiro. */
  start: number | null;
  end: number | null;
  title: string;
  location: string;
  tone: EventTone;
  /** Cor própria (categoria com cor da paleta, ou a cor do projeto no marco). */
  color?: string;
  categoryId: string | null;
  done: boolean;
  occurrence?: EventOccurrence;
  task?: Task;
  /** Marco de projeto: abre o projeto. */
  projectId?: string;
  conflictWith: string[];
}

export interface CalendarData {
  loading: boolean;
  events: CalendarEvent[];
  trash: CalendarEvent[];
  config: CalendarConfig;
  tasks: TasksData;
  itemsInRange: (from: DateKey, to: DateKey, opts: { showTasks: boolean; categoryId: string | null }) => CalendarItem[];
}

const TASK_DURATION = 30;

export function useCalendarData(): CalendarData {
  const all = useLiveQuery(() => getDb().events.toArray(), []);
  const config = useLiveQuery(() => loadCalendarConfig(), []);
  const projects = useLiveQuery(() => getDb().projects.filter((p) => !p.deletedAt).toArray(), []);
  const tasks = useTasksData();

  return useMemo(() => {
    const events = (all ?? []).filter((e) => !e.deletedAt);
    const cfg = config ?? migrateCalendarConfig(undefined);
    const toneOf = (id: string) => cfg.categories.find((c) => c.id === id)?.tone ?? 'neutral';
    const colorOf = (id: string) => cfg.categories.find((c) => c.id === id)?.color ?? undefined;

    const itemsInRange: CalendarData['itemsInRange'] = (from, to, opts) => {
      const items: CalendarItem[] = [];
      for (const e of events) {
        if (opts.categoryId && e.categoryId !== opts.categoryId) continue;
        for (const o of occurrencesInRange(e, from, to)) {
          const start = o.startTime ? toMinutes(o.startTime) : null;
          items.push({
            key: `e:${e.id}:${o.seriesDate}`,
            kind: 'event',
            date: o.date,
            endDate: o.endDate,
            allDay: o.allDay,
            start,
            end: start === null ? null : Math.min(start + o.durationMin, 24 * 60),
            title: o.title,
            location: o.location,
            tone: toneOf(e.categoryId),
            color: colorOf(e.categoryId),
            categoryId: e.categoryId,
            done: false,
            occurrence: o,
            conflictWith: [],
          });
        }
      }
      if (opts.showTasks && !opts.categoryId) {
        for (const t of tasks.active) {
          if (!t.dueDate || t.dueDate < from || t.dueDate > to) continue;
          const start = t.dueTime ? toMinutes(t.dueTime) : null;
          items.push({
            key: `t:${t.id}`,
            kind: 'task',
            date: t.dueDate,
            endDate: t.dueDate,
            allDay: start === null,
            start,
            end: start === null ? null : Math.min(start + TASK_DURATION, 24 * 60),
            title: t.title,
            location: '',
            tone: 'violet',
            categoryId: null,
            done: isClosedKind(statusKind(tasks.config, t.statusId)),
            task: t,
            conflictWith: [],
          });
        }
      }
      // Marcos de projetos (dia inteiro), lidos do próprio projeto, sem cópia.
      if (!opts.categoryId) {
        for (const p of projects ?? []) {
          for (const m of p.milestones) {
            if (!m.date || m.date < from || m.date > to) continue;
            items.push({
              key: `m:${p.id}:${m.id}`,
              kind: 'milestone',
              date: m.date,
              endDate: m.date,
              allDay: true,
              start: null,
              end: null,
              title: `◆ ${m.title} · ${p.name}`,
              location: '',
              tone: 'amber',
              color: p.color,
              categoryId: null,
              done: m.done,
              projectId: p.id,
              conflictWith: [],
            });
          }
        }
      }
      // Conflitos: só entre eventos com horário (tarefas não ocupam agenda).
      const slots = items
        .filter((i) => i.kind === 'event' && i.start !== null && i.end !== null)
        .map((i) => ({ key: i.key, date: i.date, start: i.start!, end: i.end!, title: i.title }));
      const byKey = new Map(items.map((i) => [i.key, i]));
      for (const [a, b] of findConflicts(slots)) {
        byKey.get(a.key)?.conflictWith.push(b.title);
        byKey.get(b.key)?.conflictWith.push(a.title);
      }
      return items.sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? -1) - (b.start ?? -1) || a.title.localeCompare(b.title));
    };

    return {
      loading: all === undefined || config === undefined || tasks.loading,
      events,
      trash: (all ?? []).filter((e) => e.deletedAt).sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? '')),
      config: cfg,
      tasks,
      itemsInRange,
    };
  }, [all, config, tasks, projects]);
}

export function useCategoryName() {
  const { t } = useSettings();
  return (c: EventCategory | undefined): string => {
    if (!c) return '—';
    if (c.name) return c.name;
    switch (c.id) {
      case 'appointment':
      case 'class':
      case 'exam':
      case 'deadline':
      case 'holiday':
      case 'vacation':
      case 'extracurricular':
      case 'other':
        return t(`calendar.categories.${c.id}`);
      default:
        return c.id;
    }
  };
}

/** Classes por cor (literais, para o Tailwind encontrar). */
export const TONE_ITEM: Record<EventTone, { chip: string; bar: string; dot: string }> = {
  violet: { chip: 'bg-violet/15 text-fg', bar: 'bg-violet', dot: 'bg-violet' },
  blue: { chip: 'bg-blue/15 text-fg', bar: 'bg-blue', dot: 'bg-blue' },
  teal: { chip: 'bg-teal/15 text-fg', bar: 'bg-teal', dot: 'bg-teal' },
  amber: { chip: 'bg-amber/15 text-fg', bar: 'bg-amber', dot: 'bg-amber' },
  rose: { chip: 'bg-rose/15 text-fg', bar: 'bg-rose', dot: 'bg-rose' },
  neutral: { chip: 'bg-surface-3 text-fg', bar: 'bg-subtle', dot: 'bg-subtle' },
};

export const EVENT_TONES: EventTone[] = ['violet', 'blue', 'teal', 'amber', 'rose', 'neutral'];

type Look = { className: string; style?: CSSProperties };

/** Classes e estilo de um item: tom do tema (claro/escuro) ou a cor própria da paleta. */
export function toneLook(tone: EventTone, color?: string | null): { chip: Look; bar: Look; dot: Look } {
  if (!color) return { chip: { className: TONE_ITEM[tone].chip }, bar: { className: TONE_ITEM[tone].bar }, dot: { className: TONE_ITEM[tone].dot } };
  const solid = { className: 'ring-1 ring-inset ring-line/60', style: { background: color } };
  // Fundo do pedaço: a cor com 15% de opacidade, igual aos tons do tema.
  return { chip: { className: 'text-fg', style: { background: `${color}26` } }, bar: solid, dot: solid };
}

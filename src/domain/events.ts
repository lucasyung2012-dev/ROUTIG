import { z } from 'zod';
import type { BaseEntity } from './entity';
import { addDays, diffDays, isBetween, todayKey, type DateKey } from './dates';
import { isPaused, nextOccurrence, recurrenceSchema, type Recurrence } from './tasks';

/* ---------- Tipos ---------- */

export type EventTone = 'violet' | 'blue' | 'teal' | 'amber' | 'rose' | 'neutral';

export interface EventCategory {
  id: string;
  /** Vazio nas categorias de fábrica: o nome vem da tradução. */
  name: string;
  tone: EventTone;
  /** Cor da paleta (ou "Outra cor"); quando existe, vale no lugar do tom do tema. */
  color?: string | null;
  builtin: boolean;
}

/** Mudanças numa única ocorrência de um evento recorrente ("somente esta"). */
export interface OccurrenceOverride {
  title?: string;
  startTime?: string | null;
  durationMin?: number;
  location?: string;
  description?: string;
  categoryId?: string;
  notes?: string;
  /** Ocorrência movida para outro dia. */
  date?: DateKey;
}

export interface ModuleRef {
  module: string;
  id: string;
}

export interface CalendarEvent extends BaseEntity {
  title: string;
  description: string;
  location: string;
  notes: string;
  categoryId: string;
  allDay: boolean;
  /** Primeiro dia (da série, se for recorrente). */
  start: DateKey;
  /** Último dia de um evento de dia inteiro com vários dias (ex.: férias). Igual a `start` nos outros. */
  endDate: DateKey;
  startTime: string | null;
  durationMin: number;
  recurrence: Recurrence | null;
  overrides: Record<DateKey, OccurrenceOverride>;
  /** Minutos antes do início para lembrar. Os avisos chegam com Notificações (Etapa 5). */
  reminders: number[];
  moduleRef: ModuleRef | null;
  /** Série de origem, quando o evento nasceu de "esta e as próximas". */
  seriesOf: string | null;
}

export const DEFAULT_EVENT_CATEGORIES: EventCategory[] = [
  { id: 'appointment', name: '', tone: 'blue', builtin: true },
  { id: 'class', name: '', tone: 'violet', builtin: true },
  { id: 'exam', name: '', tone: 'rose', builtin: true },
  { id: 'deadline', name: '', tone: 'amber', builtin: true },
  { id: 'holiday', name: '', tone: 'teal', builtin: true },
  { id: 'vacation', name: '', tone: 'teal', builtin: true },
  { id: 'extracurricular', name: '', tone: 'amber', builtin: true },
  { id: 'other', name: '', tone: 'neutral', builtin: true },
];

export const REMINDER_PRESETS = [0, 5, 15, 30, 60, 120, 1440, 2880] as const;

/* ---------- Validação ---------- */

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeKey = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const eventInputSchema = z
  .object({
    title: z.string().trim().min(1, 'title_required').max(300),
    description: z.string().max(20_000),
    location: z.string().max(300),
    notes: z.string().max(20_000),
    categoryId: z.string().min(1),
    allDay: z.boolean(),
    start: dateKey,
    endDate: dateKey,
    startTime: timeKey.nullable(),
    durationMin: z.number().int().min(5).max(24 * 60),
    recurrence: recurrenceSchema.nullable(),
    overrides: z.record(
      dateKey,
      z.object({
        title: z.string().max(300).optional(),
        startTime: timeKey.nullable().optional(),
        durationMin: z.number().int().min(5).max(24 * 60).optional(),
        location: z.string().max(300).optional(),
        description: z.string().max(20_000).optional(),
        categoryId: z.string().min(1).optional(),
        notes: z.string().max(20_000).optional(),
        date: dateKey.optional(),
      }),
    ),
    reminders: z.array(z.number().int().min(0).max(40_320)).max(10),
    moduleRef: z.object({ module: z.string(), id: z.string() }).nullable(),
    seriesOf: z.string().nullable(),
  })
  .refine((e) => e.endDate >= e.start, { message: 'end_before_start', path: ['endDate'] })
  .refine((e) => e.allDay || e.startTime !== null, { message: 'time_required', path: ['startTime'] });

export type EventInput = z.infer<typeof eventInputSchema>;

export function emptyEventInput(overrides: Partial<EventInput> = {}): EventInput {
  const start = overrides.start ?? todayKey();
  return {
    title: '',
    description: '',
    location: '',
    notes: '',
    categoryId: 'appointment',
    allDay: false,
    start,
    endDate: start,
    startTime: '09:00',
    durationMin: 60,
    recurrence: null,
    overrides: {},
    reminders: [],
    moduleRef: null,
    seriesOf: null,
    ...overrides,
  };
}

/* ---------- Horários ---------- */

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function fromMinutes(total: number): string {
  const t = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/* ---------- Ocorrências ---------- */

/** Uma ocorrência concreta de um evento num dia. */
export interface EventOccurrence {
  event: CalendarEvent;
  /** Data original na série (chave das exceções e overrides). */
  seriesDate: DateKey;
  date: DateKey;
  endDate: DateKey;
  allDay: boolean;
  startTime: string | null;
  durationMin: number;
  title: string;
  location: string;
  description: string;
  /** Categoria e observações desta ocorrência (a da série, se não mudou só aqui). */
  categoryId: string;
  notes: string;
  overridden: boolean;
}

function materialize(event: CalendarEvent, seriesDate: DateKey): EventOccurrence {
  const o = event.overrides[seriesDate] ?? {};
  const date = o.date ?? seriesDate;
  const span = diffDays(event.endDate, event.start);
  return {
    event,
    seriesDate,
    date,
    endDate: addDays(date, span),
    allDay: event.allDay,
    startTime: event.allDay ? null : o.startTime !== undefined ? o.startTime : event.startTime,
    durationMin: o.durationMin ?? event.durationMin,
    title: o.title ?? event.title,
    location: o.location ?? event.location,
    description: o.description ?? event.description,
    categoryId: o.categoryId ?? event.categoryId,
    notes: o.notes ?? event.notes,
    overridden: Object.keys(o).length > 0,
  };
}

/**
 * Ocorrências de um evento que tocam o intervalo [from, to] (inclusive).
 * Respeita exceções, pausas, fim da série e ocorrências movidas.
 */
export function occurrencesInRange(event: CalendarEvent, from: DateKey, to: DateKey): EventOccurrence[] {
  if (event.deletedAt) return [];
  const span = diffDays(event.endDate, event.start);
  const touches = (o: EventOccurrence) => o.date <= to && o.endDate >= from;

  if (!event.recurrence) {
    const occ = materialize(event, event.start);
    return touches(occ) ? [occ] : [];
  }

  const r = event.recurrence;
  const out: EventOccurrence[] = [];
  // Começa um pouco antes para pegar ocorrências movidas para dentro do intervalo.
  const scanFrom = addDays(from, -Math.max(span, 0) - 31);
  let date: DateKey | null = event.start;
  const first = event.start;
  if (!(r.exceptions.includes(first) || isPaused(first, r))) {
    if (first >= scanFrom) {
      const occ = materialize(event, first);
      if (touches(occ)) out.push(occ);
    }
  }
  for (let guard = 0; date && guard < 5000; guard++) {
    date = nextOccurrence(date, r, event.start);
    if (!date || date > addDays(to, 31)) break;
    if (date < scanFrom) continue;
    const occ = materialize(event, date);
    if (touches(occ)) out.push(occ);
  }
  return out;
}

/* ---------- Conflitos ---------- */

export interface TimedSlot {
  key: string;
  date: DateKey;
  start: number;
  end: number;
  title: string;
}

/** Pares de compromissos com horário que se sobrepõem no mesmo dia. Só avisa; nada é alterado. */
export function findConflicts(slots: TimedSlot[]): Array<[TimedSlot, TimedSlot]> {
  const byDay = new Map<DateKey, TimedSlot[]>();
  for (const s of slots) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);
  const out: Array<[TimedSlot, TimedSlot]> = [];
  for (const list of byDay.values()) {
    const sorted = [...list].sort((a, b) => a.start - b.start);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]!;
        const b = sorted[j]!;
        if (b.start >= a.end) break;
        out.push([a, b]);
      }
    }
  }
  return out;
}

/**
 * Distribui itens com horário em colunas para desenhar lado a lado quando se sobrepõem.
 * Retorna, para cada chave, a coluna e o total de colunas do grupo.
 */
export function layoutColumns(slots: Array<{ key: string; start: number; end: number }>): Map<string, { col: number; cols: number }> {
  const sorted = [...slots].sort((a, b) => a.start - b.start || b.end - a.end);
  const result = new Map<string, { col: number; cols: number }>();
  let group: Array<{ key: string; end: number; col: number }> = [];
  let groupEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...group.map((g) => g.col + 1));
    for (const g of group) result.set(g.key, { col: g.col, cols });
    group = [];
  };
  for (const s of sorted) {
    if (s.start >= groupEnd && group.length) flush();
    const used = new Set(group.filter((g) => g.end > s.start).map((g) => g.col));
    let col = 0;
    while (used.has(col)) col++;
    group.push({ key: s.key, end: s.end, col });
    groupEnd = Math.max(groupEnd, s.end);
  }
  if (group.length) flush();
  return result;
}

/* ---------- Edição de séries ---------- */

export type EditScope = 'this' | 'following' | 'all';

/** Dias de um intervalo, para eventos de vários dias. */
export function daysOf(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

export function coversDay(o: Pick<EventOccurrence, 'date' | 'endDate'>, day: DateKey): boolean {
  return isBetween(day, o.date, o.endDate);
}

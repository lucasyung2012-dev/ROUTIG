/**
 * "3D de verdade" (prompt, seção 28): a ação do dia acontece no próprio objeto 3D. Aqui só a parte
 * pura (sem three.js nem React, testável): quais hábitos ganham um canteiro hoje e em que estado,
 * quais tarefas viram cartões no quadro (com limite e "+N") e onde cada compromisso de hoje cai na
 * parede do dia (pela hora, com a linha de agora). Tudo sai dos mesmos dados e regras dos módulos
 * (domain/habits, domain/tasks); nada é inventado: sem dado, o objeto fica vazio.
 */
import type { DateKey } from '@/domain/dates';
import { logMeets, openPause, scheduleAt, todayStatus, type Habit, type HabitLog } from '@/domain/habits';
import { compareTasks, isClosedKind, statusKind, type Task, type TasksConfig } from '@/domain/tasks';

/* ---------- Hábitos: um canteiro por hábito esperado hoje ---------- */

export interface HabitBed {
  habitId: string;
  name: string;
  color: string;
  /** Feito hoje (o registro de hoje cumpre o hábito) ou ainda para fazer. */
  done: boolean;
  /** Quantidade, duração ou escala: precisa de um valor (abre o registro do próprio módulo). */
  needsValue: boolean;
}

export interface HabitBeds {
  beds: HabitBed[];
  /** Hábitos de hoje que não couberam (o último canteiro vira "+N"). */
  more: number;
}

/**
 * Canteiros de hoje: os hábitos que a estação de hoje mostra com o registro rápido (esperados hoje
 * pelo `todayStatus`, sem pausa aberta e já começados), na ordem do módulo. Com mais hábitos que
 * canteiros, os primeiros `slots - 1` ganham canteiro e o último diz quantos faltam.
 */
export function habitBeds(habits: readonly Habit[], logsOf: (habitId: string) => ReadonlyMap<DateKey, Pick<HabitLog, 'value'>>, today: DateKey, weekStartsOn: 0 | 1, slots = 8): HabitBeds {
  const due = habits.filter((h) => !h.archived && !h.deletedAt && !openPause(h) && h.startDate <= today && todayStatus(h, logsOf(h.id), today, weekStartsOn).due);
  const shown = due.length > slots ? due.slice(0, Math.max(0, slots - 1)) : due;
  return {
    beds: shown.map((h) => {
      const log = logsOf(h.id).get(today);
      return { habitId: h.id, name: h.name, color: h.color, done: !!log && logMeets(h.method, scheduleAt(h, today), log.value), needsValue: h.method !== 'check' };
    }),
    more: due.length - shown.length,
  };
}

/* ---------- Tarefas: cartões do quadro (atrasadas, hoje, feitas hoje) ---------- */

export type TaskCol = 'late' | 'today' | 'done';
export const TASK_COLS: readonly TaskCol[] = ['late', 'today', 'done'];

export interface TaskCard {
  id: string;
  title: string;
  col: TaskCol;
}

export interface TaskBoard {
  cols: Record<TaskCol, TaskCard[]>;
  /** Quantas não couberam em cada coluna (o último lugar da coluna vira "+N"). */
  more: Record<TaskCol, number>;
  /** Nada atrasado, nada para hoje e nada feito hoje. */
  empty: boolean;
}

/**
 * Cartões do quadro: abertas atrasadas e de hoje (na ordem padrão do módulo: prazo, prioridade,
 * ordem manual) e as concluídas hoje (a mais recente primeiro). Cada coluna mostra até `cap`
 * cartões; passando disso, `cap - 1` cartões e o "+N". `dayOf` diz o dia (local) de um instante ISO.
 */
export function taskBoard(tasks: readonly Task[], config: TasksConfig, today: DateKey, dayOf: (iso: string) => DateKey, cap = 4): TaskBoard {
  const live = tasks.filter((x) => !x.deletedAt);
  const open = live.filter((x) => x.dueDate !== null && x.dueDate <= today && !isClosedKind(statusKind(config, x.statusId))).sort(compareTasks(config));
  const done = live
    .filter((x) => statusKind(config, x.statusId) === 'done' && x.completedAt !== null && dayOf(x.completedAt) === today)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  const lists: Record<TaskCol, Task[]> = { late: open.filter((x) => (x.dueDate ?? today) < today), today: open.filter((x) => x.dueDate === today), done };
  const cols = { late: [], today: [], done: [] } as Record<TaskCol, TaskCard[]>;
  const more = { late: 0, today: 0, done: 0 } as Record<TaskCol, number>;
  for (const col of TASK_COLS) {
    const list = lists[col];
    const shown = list.length > cap ? list.slice(0, Math.max(0, cap - 1)) : list;
    cols[col] = shown.map((x) => ({ id: x.id, title: x.title, col }));
    more[col] = list.length - shown.length;
  }
  return { cols, more, empty: open.length + done.length === 0 };
}

/* ---------- Calendar: o dia de hoje na parede, pela hora ---------- */

export interface DayItem {
  key: string;
  title: string;
  /** Minutos desde 0h (null = dia inteiro). */
  start: number | null;
  end: number | null;
  allDay: boolean;
  color: string;
  done: boolean;
  /** Tocar abre o editor do próprio módulo (evento ou tarefa); os outros só aparecem. */
  open: boolean;
}

export interface DayBlock {
  item: DayItem;
  start: number;
  end: number;
  /** Coluna dentro do grupo de itens que se sobrepõem, e quantas colunas o grupo tem. */
  col: number;
  cols: number;
  /** Posição na parede, de 0 (início da janela) a 1 (fim). */
  y0: number;
  y1: number;
}

export interface DayLayout {
  /** Janela de horas mostrada (minutos). */
  from: number;
  to: number;
  blocks: DayBlock[];
  allDay: DayItem[];
  /** Itens de dia inteiro que não couberam na faixa de cima. */
  allDayMore: number;
  /** Itens com hora que não couberam (mais sobrepostos do que colunas). */
  hidden: number;
  /** Linha de agora (0 a 1), ou null fora da janela ou sem hora. */
  now: number | null;
  empty: boolean;
}

/**
 * Onde cada item de hoje cai na parede: a janela vai das 7h às 22h e cresce para caber todos os
 * itens e uma hora antes e depois de agora; itens que se sobrepõem dividem a largura (até
 * `maxCols` colunas; o resto conta em `hidden`). Sem fim, o item dura 30 min (no mínimo 15 na parede).
 */
export function dayLayout(items: readonly DayItem[], nowMin: number | null, o: { from?: number; to?: number; maxCols?: number; maxAllDay?: number } = {}): DayLayout {
  const maxCols = Math.max(1, o.maxCols ?? 3);
  const maxAll = Math.max(1, o.maxAllDay ?? 3);
  const allDay = items.filter((i) => i.allDay || i.start === null);
  const timed = items
    .filter((i) => !(i.allDay || i.start === null))
    .map((i) => {
      const start = Math.max(0, Math.min(1425, i.start ?? 0));
      const end = Math.min(1440, Math.max(start + 15, i.end ?? start + 30));
      return { item: i, start, end };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);
  let from = o.from ?? 7 * 60;
  let to = o.to ?? 22 * 60;
  for (const x of timed) {
    from = Math.min(from, Math.floor(x.start / 60) * 60);
    to = Math.max(to, Math.ceil(x.end / 60) * 60);
  }
  if (nowMin !== null) {
    from = Math.min(from, Math.floor((nowMin - 60) / 60) * 60);
    to = Math.max(to, Math.ceil((nowMin + 60) / 60) * 60);
  }
  from = Math.max(0, from);
  to = Math.min(1440, Math.max(from + 60, to));
  const span = to - from;

  const blocks: DayBlock[] = [];
  let hidden = 0;
  let group: Array<{ item: DayItem; start: number; end: number; col: number }> = [];
  let ends: number[] = [];
  let groupEnd = -1;
  const flush = () => {
    const cols = Math.min(maxCols, Math.max(1, ends.length));
    for (const g of group) {
      if (g.col >= maxCols) hidden++;
      else blocks.push({ item: g.item, start: g.start, end: g.end, col: g.col, cols, y0: (g.start - from) / span, y1: (g.end - from) / span });
    }
    group = [];
    ends = [];
    groupEnd = -1;
  };
  for (const x of timed) {
    if (group.length && x.start >= groupEnd) flush();
    let col = ends.findIndex((e) => e <= x.start);
    if (col < 0) {
      col = ends.length;
      ends.push(x.end);
    } else ends[col] = x.end;
    group.push({ ...x, col });
    groupEnd = Math.max(groupEnd, x.end);
  }
  flush();

  const shownAll = allDay.length > maxAll ? allDay.slice(0, maxAll - 1) : allDay;
  return {
    from,
    to,
    blocks,
    allDay: shownAll,
    allDayMore: allDay.length - shownAll.length,
    hidden,
    now: nowMin !== null && nowMin >= from && nowMin <= to ? (nowMin - from) / span : null,
    empty: items.length === 0,
  };
}

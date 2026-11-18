/**
 * "3D de verdade" (prompt, seção 28): a ação do dia acontece no próprio objeto 3D. Aqui só a parte
 * pura (sem three.js nem React, testável): quais hábitos ganham um canteiro hoje e em que estado,
 * quais tarefas viram cartões no quadro (com limite e "+N") e onde cada compromisso de hoje cai na
 * parede do dia (pela hora, com a linha de agora). Tudo sai dos mesmos dados e regras dos módulos
 * (domain/habits, domain/tasks); nada é inventado: sem dado, o objeto fica vazio.
 */
import type { ModuleId } from '@/app/modules';
import type { StudySession } from '@/domain/academy';
import type { DateKey } from '@/domain/dates';
import { phaseElapsed, phaseRemaining, type FocusTimer } from '@/domain/focus';
import { compareGoals, goalProgress, isGoalOverdue, isOpenGoal, type Goal, type GoalCheckin, type GoalProgress } from '@/domain/goals';
import { logMeets, openPause, scheduleAt, todayStatus, type Habit, type HabitLog } from '@/domain/habits';
import type { InboxItem } from '@/domain/inbox';
import { sessionStats, type Language, type LanguageSession, type VocabEntry } from '@/domain/languages';
import type { LibraryItem } from '@/domain/library';
import type { Instrument, PracticeSession } from '@/domain/music';
import type { Currency, FinAsset, Position } from '@/domain/finance';
import type { Note } from '@/domain/notes';
import { isClosedProject, type Milestone, type Project, type ProjectProgress } from '@/domain/projects';
import type { Sport, SportActivity } from '@/domain/sports';
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

/* =====================================================================
 * Paredes de ação dos outros prédios: uma parede por prédio, numa sala que já existe (na parede de
 * telas das salas de dados ou no quadro/parede do fundo das outras), com os dados reais do módulo.
 * Aqui só a escolha da sala, os cortes ("+N") e a forma dos dados; o texto e as ações reais ficam
 * no LiveFeed (os mesmos hooks e repositórios das estações).
 * ===================================================================== */

/** Sala (chave de FLOOR_PLANS) de cada prédio com parede de ação e o setor que ela abre. */
export const LIVE_WALL_ROOMS: Partial<Record<ModuleId, { key: string; sector: string }>> = {
  goals: { key: 'tracking', sector: 'analysis' },
  projects: { key: 'tracking', sector: 'studio' },
  focus: { key: 'history', sector: 'history' },
  inbox: { key: 'flow', sector: 'distribution' },
  insights: { key: 'indicators', sector: 'overview' },
  academy: { key: 'cabins', sector: 'plan' },
  notes: { key: 'handwriting', sector: 'handwriting' },
  library: { key: 'research', sector: 'search' },
  languages: { key: 'lang1', sector: 'spaces' },
  music: { key: 'practice1', sector: 'instruments' },
  sports: { key: 'sport1', sector: 'modalities' },
};

/** Prefixo dos ids de ação de cada parede ("goal:<id>"); id com a parte depois do ":" vazia abre a estação. */
export const WALL_KIND: Partial<Record<ModuleId, string>> = {
  goals: 'goal',
  projects: 'proj',
  focus: 'focus',
  inbox: 'arrival',
  insights: 'metric',
  academy: 'study',
  notes: 'note',
  library: 'lib',
  languages: 'lang',
  music: 'instr',
  sports: 'sport',
};

/** Prédio de um prefixo de ação de parede (null: não é de parede). */
export function wallBuilding(kind: string): ModuleId | null {
  for (const [id, k] of Object.entries(WALL_KIND) as Array<[ModuleId, string]>) if (k === kind) return id;
  return null;
}

export interface Capped<T> {
  shown: T[];
  /** Quantos não couberam (a última linha vira "+N"). */
  more: number;
}

/** Até `cap` linhas; passando disso, `cap - 1` e o "+N" (como as colunas do quadro de tarefas). */
export function capList<T>(list: readonly T[], cap: number): Capped<T> {
  const shown = list.length > cap ? list.slice(0, Math.max(0, cap - 1)) : list.slice();
  return { shown, more: list.length - shown.length };
}

/* ---------- Goals: o progresso real de cada objetivo aberto ---------- */

/** Fração do progresso (0 a 1) que dá para desenhar; qualitativo ou sem como medir: null. */
export function goalShare(p: GoalProgress): number | null {
  if (p.kind === 'percent') return p.percent / 100;
  if (p.kind === 'stages') return p.percent === null ? null : p.percent / 100;
  if (p.kind === 'level') return p.current !== null && p.target ? Math.min(1, p.current / p.target) : null;
  return null;
}

export interface GoalRow {
  id: string;
  name: string;
  share: number | null;
  deadline: DateKey | null;
  overdue: boolean;
}

/** Objetivos abertos na ordem do módulo (compareGoals), com o progresso de goalProgress. */
export function goalWall(goals: readonly Goal[], checkinsOf: (goalId: string) => GoalCheckin[], today: DateKey, cap = 5): Capped<GoalRow> {
  const open = goals.filter((g) => !g.deletedAt && isOpenGoal(g)).sort(compareGoals);
  return capList(
    open.map((g) => ({ id: g.id, name: g.name, share: goalShare(goalProgress(g, checkinsOf(g.id))), deadline: g.deadline, overdue: isGoalOverdue(g, today) })),
    cap,
  );
}

/* ---------- Projects: os projetos ativos e o próximo marco ---------- */

/** Próximo marco em aberto (o de data mais próxima; sem data, por último). */
export function nextMilestone(p: Pick<Project, 'milestones'>): Milestone | null {
  return p.milestones.filter((m) => !m.done).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))[0] ?? null;
}

export interface ProjectRow {
  id: string;
  name: string;
  color: string;
  percent: number | null;
  next: { id: string; title: string; date: DateKey | null } | null;
}

/** Projetos não encerrados, na ordem recebida (a do módulo: os mexidos por último primeiro). */
export function projectWall(projects: readonly Project[], progressOf: (p: Project) => Pick<ProjectProgress, 'percent'>, cap = 5): Capped<ProjectRow> {
  const active = projects.filter((p) => !p.deletedAt && !isClosedProject(p.status));
  return capList(
    active.map((p) => {
      const m = nextMilestone(p);
      return { id: p.id, name: p.name, color: p.color, percent: progressOf(p).percent, next: m ? { id: m.id, title: m.title, date: m.date } : null };
    }),
    cap,
  );
}

/* ---------- Notes, Library e Inbox: o que mexeu ou chegou por último ---------- */

/** Notas mexidas por último (lixeira fora). */
export function recentNotes(notes: readonly Note[], cap = 5): Capped<Pick<Note, 'id' | 'title' | 'updatedAt'>> {
  const live = notes.filter((n) => !n.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return capList(
    live.map((n) => ({ id: n.id, title: n.title, updatedAt: n.updatedAt })),
    cap,
  );
}

/** Materiais adicionados por último. */
export function recentLibrary(items: readonly LibraryItem[], cap = 5): Capped<Pick<LibraryItem, 'id' | 'title' | 'kind' | 'favorite' | 'createdAt'>> {
  const live = items.filter((i) => !i.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return capList(
    live.map((i) => ({ id: i.id, title: i.title, kind: i.kind, favorite: i.favorite, createdAt: i.createdAt })),
    cap,
  );
}

/** Chegadas em aberto do Inbox (as adiadas para depois de hoje ficam fora), a mais nova primeiro. */
export function inboxTray(items: readonly InboxItem[], today: DateKey, cap = 5): Capped<{ id: string; title: string; createdAt: string }> {
  const open = items.filter((i) => !i.deletedAt && i.status === 'open' && !(i.snoozedUntil && i.snoozedUntil > today)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return capList(
    open.map((i) => ({ id: i.id, title: i.text || i.fileName || i.url || '', createdAt: i.createdAt })),
    cap,
  );
}

/* ---------- Academy: as sessões de estudo de hoje ---------- */

export interface StudyRow {
  id: string;
  subjectId: string;
  time: string | null;
  min: number;
  done: boolean;
}

/** Sessões de hoje planejadas ou feitas (puladas ficam fora), pela hora (sem hora, no fim). */
export function studyToday(sessions: readonly StudySession[], today: DateKey, cap = 5): Capped<StudyRow> {
  const list = sessions
    .filter((s) => !s.deletedAt && s.date === today && (s.status === 'planned' || s.status === 'done'))
    .sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'));
  return capList(
    list.map((s) => ({ id: s.id, subjectId: s.subjectId, time: s.time, min: s.status === 'done' ? (s.actualMin ?? s.durationMin) : s.durationMin, done: s.status === 'done' })),
    cap,
  );
}

/* ---------- Focus: o relógio da sessão compartilhada ---------- */

export type FocusTap = 'open' | 'pause' | 'resume' | 'next';

/**
 * O que o toque no relógio faz: sem sessão (ou terminada, esperando ser salva) abre a estação (lá se
 * escolhe o modo e se salva); correndo pausa; pausada continua; entre fases começa a próxima.
 */
export function focusTap(timer: Pick<FocusTimer, 'waiting' | 'runningSince'> | null, ended: boolean): FocusTap {
  if (!timer || ended) return 'open';
  if (timer.waiting) return 'next';
  return timer.runningSince === null ? 'resume' : 'pause';
}

export interface FocusFace {
  state: 'idle' | 'running' | 'paused' | 'waiting';
  /** O que o relógio mostra (ms): o que falta na fase ou, na contínua, o tempo corrido. */
  ms: number;
  /** Parte da fase já corrida (0 a 1); null na contínua ou sem sessão. */
  progress: number | null;
}

/** O mostrador do relógio no instante `now` (as mesmas contas da estação). */
export function focusFace(timer: FocusTimer | null, now: number): FocusFace {
  if (!timer) return { state: 'idle', ms: 0, progress: null };
  if (timer.waiting) return { state: 'waiting', ms: timer.phaseMs ?? 0, progress: null };
  const elapsed = phaseElapsed(timer, now);
  return {
    state: timer.runningSince === null ? 'paused' : 'running',
    ms: phaseRemaining(timer, now) ?? elapsed,
    progress: timer.phaseMs ? Math.min(1, elapsed / timer.phaseMs) : null,
  };
}

/* ---------- Idiomas, Música e Esportes ---------- */

export interface LanguageRow {
  id: string;
  name: string;
  color: string;
  /** Palavras com revisão vencida (até hoje). */
  due: number;
  weekMin: number;
  /** Dias com estudo nesta semana. */
  days: number;
}

/** Idiomas estudados (o nativo fica fora), com a semana (sessionStats) e as palavras para revisar. */
export function languagesWall(languages: readonly Language[], sessions: readonly LanguageSession[], dueOf: (languageId: string) => number, weekFrom: DateKey, today: DateKey, cap = 5): Capped<LanguageRow> {
  const studied = languages.filter((l) => !l.deletedAt && !l.native);
  return capList(
    studied.map((l) => {
      const st = sessionStats(sessions.filter((s) => !s.deletedAt && s.languageId === l.id && s.date >= weekFrom && s.date <= today));
      return { id: l.id, name: l.name, color: l.color, due: dueOf(l.id), weekMin: st.total, days: st.days };
    }),
    cap,
  );
}

export interface InstrumentRow {
  id: string;
  name: string;
  color: string;
  weekMin: number;
  /** Último dia de prática (null: nunca). */
  last: DateKey | null;
}

/** Instrumentos com o tempo de prática da semana e o último dia praticado. */
export function musicWall(instruments: readonly Instrument[], practiceOf: (instrumentId: string) => readonly PracticeSession[], weekFrom: DateKey, today: DateKey, cap = 5): Capped<InstrumentRow> {
  const live = instruments.filter((i) => !i.deletedAt);
  return capList(
    live.map((i) => {
      const ps = practiceOf(i.id).filter((p) => !p.deletedAt && p.date <= today);
      const last = ps.reduce<DateKey | null>((a, p) => (a === null || p.date > a ? p.date : a), null);
      return { id: i.id, name: i.name, color: i.color, weekMin: ps.filter((p) => p.date >= weekFrom).reduce((a, p) => a + p.durationMin, 0), last };
    }),
    cap,
  );
}

export interface SportRow {
  id: string;
  sport: string;
  color: string;
  title: string;
  type: SportActivity['type'];
  min: number | null;
  outcome: SportActivity['outcome'];
}

/** As atividades de hoje de todas as modalidades (na ordem das modalidades). */
export function sportsToday(sports: readonly Sport[], activitiesOf: (sportId: string) => readonly SportActivity[], today: DateKey, cap = 5): Capped<SportRow> {
  const rows: SportRow[] = [];
  for (const s of sports) {
    if (s.deletedAt) continue;
    for (const a of activitiesOf(s.id)) if (!a.deletedAt && a.date === today) rows.push({ id: a.id, sport: s.name, color: s.color, title: a.title, type: a.type, min: a.durationMin, outcome: a.outcome });
  }
  return capList(rows, cap);
}

/* =====================================================================
 * Objetos de ação no próprio 3D (sem parede): o balcão de criação rápida do Tasks, a placa "Novo
 * objetivo", a maquete dos projetos, a luminária das cabines do Focus, a bandeja de chegadas do
 * Inbox, o caderno aberto do Notes, as lombadas dos novos da Library, o baralho do Idiomas, as
 * faixas das modalidades do Sports, as esferas do Insights e o quadro de saldos dentro do cofre.
 * Aqui só os prefixos dos ids, a estação de cada um (toque longo) e as contas puras de cada objeto.
 * ===================================================================== */

/** Prédio de cada prefixo de objeto ("tnew:new", "maq:<projeto>"…). */
export const OBJECT_KIND: Readonly<Record<string, ModuleId>> = {
  tnew: 'tasks',
  hour: 'calendar',
  gnew: 'goals',
  maq: 'projects',
  lamp: 'focus',
  tray: 'inbox',
  nb: 'notes',
  spine: 'library',
  deck: 'languages',
  court: 'sports',
  orb: 'insights',
  bal: 'finance',
};

/** Prédio de um prefixo de objeto (null: não é objeto). */
export function objectBuilding(kind: string): ModuleId | null {
  return Object.prototype.hasOwnProperty.call(OBJECT_KIND, kind) ? (OBJECT_KIND[kind] ?? null) : null;
}

/** Estação que o toque longo (ou o "abrir a estação" da dica) abre: setor e sala do andar (null = térreo). */
export const OBJECT_STATION: Readonly<Record<string, { sector: string; key: string | null }>> = {
  tnew: { sector: 'capture', key: null },
  hour: { sector: 'daily', key: 'daily' },
  gnew: { sector: 'analysis', key: 'tracking' },
  maq: { sector: 'studio', key: 'tracking' },
  lamp: { sector: 'garden', key: null },
  tray: { sector: 'distribution', key: null },
  nb: { sector: 'writing', key: null },
  spine: { sector: 'collections', key: null },
  deck: { sector: 'spaces', key: null },
  court: { sector: 'modalities', key: null },
  orb: { sector: 'overview', key: null },
  bal: { sector: 'investments', key: null },
};

/* ---------- Calendar: as horas da parede do dia (tocar numa hora vazia cria um evento) ---------- */

export interface HourRow {
  /** Hora cheia (0 a 23). */
  hour: number;
  /** Faixa da hora na parede (0 = início da janela, 1 = fim). */
  y0: number;
  y1: number;
}

/** As horas cheias inteiras dentro da janela [from, to) (minutos) e onde cada uma cai na parede. */
export function hourRows(from: number, to: number): HourRow[] {
  const span = to - from;
  if (span <= 0) return [];
  const out: HourRow[] = [];
  for (let m = Math.ceil(from / 60) * 60; m + 60 <= to && m < 1440; m += 60) out.push({ hour: m / 60, y0: (m - from) / span, y1: (m + 60 - from) / span });
  return out;
}

/** "HH:00" de uma hora cheia (o início do evento criado na parede). */
export const hourLabel = (hour: number): string => `${String(Math.max(0, Math.min(23, Math.floor(hour)))).padStart(2, '0')}:00`;

/* ---------- Projects: a maquete (a altura de cada bloco é o progresso real) ---------- */

/** Altura (m) do bloco de um projeto na maquete: sem como medir, uma base baixa; senão, pelo progresso. */
export function blockHeight(percent: number | null): number {
  if (percent === null) return 0.03;
  return 0.05 + 0.35 * Math.max(0, Math.min(100, percent)) / 100;
}

/** Marcos de um projeto na ordem da maquete: os em aberto (pela data; sem data, no fim) e depois os feitos. */
export function milestoneList(p: Pick<Project, 'milestones'>): Milestone[] {
  const open = p.milestones.filter((m) => !m.done).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
  return [...open, ...p.milestones.filter((m) => m.done)];
}

/* ---------- Focus: a luminária da cabine segue a sessão compartilhada ---------- */

export type LampState = 'off' | 'on' | 'paused';
export type LampTap = 'start' | FocusTap;

/** Luminária acesa com a sessão correndo, meio acesa pausada ou entre fases, apagada sem sessão. */
export function lampState(timer: Pick<FocusTimer, 'waiting' | 'runningSince'> | null): LampState {
  if (!timer) return 'off';
  return timer.runningSince !== null && !timer.waiting ? 'on' : 'paused';
}

/** O que o toque na luminária faz: sem sessão começa uma; com sessão, o mesmo que o relógio da parede. */
export function lampTap(timer: Pick<FocusTimer, 'waiting' | 'runningSince'> | null, ended: boolean): LampTap {
  return !timer ? 'start' : focusTap(timer, ended);
}

/* ---------- Idiomas: o baralho de hoje (as palavras com revisão vencida) ---------- */

/**
 * As palavras de hoje, na ordem em que o baralho mostra: vencidas até hoje (as mais atrasadas
 * primeiro), dos idiomas estudados que existem; apagadas e de idioma apagado ficam fora.
 */
export function deckQueue(vocab: readonly VocabEntry[], languages: readonly Pick<Language, 'id' | 'deletedAt'>[], today: DateKey): VocabEntry[] {
  const live = new Set(languages.filter((l) => !l.deletedAt).map((l) => l.id));
  return vocab
    .filter((v) => !v.deletedAt && live.has(v.languageId) && v.srs.due !== null && v.srs.due <= today)
    .sort((a, b) => (a.srs.due ?? '').localeCompare(b.srs.due ?? '') || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/* ---------- Música: quanto se tocou de verdade no instrumento ---------- */

/** Minutos tocados entre a primeira e a última nota (arredondados); menos de meio minuto: null (nada a registrar). */
export function practiceMinutes(firstMs: number, lastMs: number): number | null {
  const ms = lastMs - firstMs;
  if (!Number.isFinite(ms) || ms < 30_000) return null;
  return Math.min(1440, Math.max(1, Math.round(ms / 60_000)));
}

/** Instrumento do módulo que já vem escolhido para a prática do instrumento do Estúdio (o usuário confirma). */
export function practiceInstrument(kind: 'piano' | 'drums' | 'guitar', instruments: readonly Pick<Instrument, 'id' | 'name' | 'kind' | 'deletedAt'>[]): string | null {
  const live = instruments.filter((i) => !i.deletedAt);
  const byName = (re: RegExp) => live.find((i) => re.test(i.name))?.id ?? null;
  if (kind === 'guitar') return live.find((i) => i.kind === 'guitar')?.id ?? byName(/viol|guitar/i);
  if (kind === 'piano') return byName(/piano|teclado|keyboard|synth/i);
  return byName(/bateria|drum|percuss/i);
}

/* ---------- Insights: as esferas do núcleo ---------- */

/** Ângulos (rad) de `n` esferas em volta do núcleo, deixando livre a frente (a porta da escada e as placas). */
export function orbAngles(n: number, gap = 0.75): number[] {
  if (n <= 0) return [];
  const span = Math.PI * 2 - gap * 2;
  return Array.from({ length: n }, (_, i) => gap + (n === 1 ? span / 2 : (i * span) / (n - 1)));
}

/* ---------- Finance: os saldos dentro do cofre (só leitura) ---------- */

export interface VaultLine {
  currency: Currency;
  /** Custo do que está na carteira. */
  invested: number;
  /** Valor atual dos ativos com valor informado (null: nenhum informado). */
  value: number | null;
  /** Ativos com posição e quantos têm valor informado. */
  held: number;
  quoted: number;
}

/** As mesmas contas do resumo de Finanças por moeda: o valor atual só soma o que tem valor informado. */
export function vaultLines(assets: readonly Pick<FinAsset, 'id' | 'currency' | 'archived' | 'deletedAt'>[], positionOf: (id: string) => Pick<Position, 'quantity' | 'invested' | 'currentValue'>, order: readonly Currency[]): VaultLine[] {
  const live = assets.filter((a) => !a.deletedAt && !a.archived);
  const out: VaultLine[] = [];
  for (const cur of order) {
    const pos = live.filter((a) => a.currency === cur).map((a) => positionOf(a.id));
    if (!pos.length) continue;
    const held = pos.filter((p) => p.quantity > 0);
    const quoted = held.filter((p) => p.currentValue !== null);
    out.push({
      currency: cur,
      invested: pos.reduce((s, p) => s + p.invested, 0),
      value: quoted.length ? quoted.reduce((s, p) => s + (p.currentValue ?? 0), 0) : null,
      held: held.length,
      quoted: quoted.length,
    });
  }
  return out;
}

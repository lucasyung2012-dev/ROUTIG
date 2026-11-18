/**
 * Quadros dos andares do Campus (sem three.js nem React: testável). Cada prédio recebe os dados reais
 * que as estações já leem (nada inventado) e devolve o texto de cada quadro: um por sala (pela chave
 * de FLOOR_PLANS) e as séries de salas iguais ("class1", "class2"…: uma disciplina, um idioma, um
 * projeto ou uma modalidade por sala). Sem dados, o quadro diz isso (estado vazio honesto). Finanças
 * trancado pelo PIN: todos os quadros escuros, sem nenhum valor.
 */
import type { MessageKey } from '@/i18n';
import { formatDateKey, type DateKey } from '@/domain/dates';
import { formatMoney, type Currency } from '@/domain/finance';
import type { LibraryKind, ReadStatus } from '@/domain/library';

export type Tr = (key: MessageKey, vars?: Record<string, string | number>) => string;

export interface BoardCtx {
  t: Tr;
  locale: string;
  today: DateKey;
}

/** Barra de um quadro (pilar de objetivo, progresso de projeto, mês do ano): `value` de 0 a 1; null = sem altura (qualitativo). */
export interface Bar {
  label: string;
  value: number | null;
}

export interface Board {
  title: string;
  lines: string[];
  /** Estado vazio: o texto aparece apagado. */
  empty?: boolean;
  /** Trancado (Finanças com PIN): tela escura, sem valor nenhum. */
  locked?: boolean;
  bars?: Bar[];
  /** Texto das barras sem altura (ex.: "qualitativo"). */
  nullLabel?: string;
  /** Cor própria (a da disciplina, do idioma, do projeto). */
  color?: string;
}

/** Salas iguais em série: um item por sala; sobra vira "Mais…"; sala sem item fica livre. */
export interface Series {
  items: Board[];
  free: Board;
  more: string;
}

export interface FloorBoards {
  rooms: Record<string, Board>;
  series: Record<string, Series>;
}

/** "class2" → série "class", posição 2; chave sem número no fim → null. */
export function seriesOf(key: string): { name: string; n: number } | null {
  const m = /^([a-z]+)(\d+)$/i.exec(key);
  return m ? { name: m[1]!, n: Number(m[2]) } : null;
}

/** Quadro de cada uma das `slots` salas de uma série (as que existem no andar, na ordem). */
export function distribute(s: Series, slots: number): Board[] {
  if (slots <= 0) return [];
  if (s.items.length <= slots) return Array.from({ length: slots }, (_, i) => s.items[i] ?? s.free);
  const head = s.items.slice(0, slots - 1);
  const rest = s.items.slice(slots - 1);
  return [...head, { title: s.more, lines: rest.map((b) => b.title) }];
}

const empty = (title: string, line: string): Board => ({ title, lines: [line], empty: true });
const list = (title: string, lines: string[], none: string): Board => (lines.length ? { title, lines } : empty(title, none));
const dayOf = (c: BoardCtx, d: DateKey) => (d === c.today ? c.t('tasks.due.today') : formatDateKey(d, c.locale, { day: 'numeric', month: 'short' }));
const countOf = (c: BoardCtx, name: string, count: number) => c.t('park.floorBoards.countOf', { name, count });

/* ---------- Academy ---------- */

export interface AcademyFloorInput {
  /** Período atual (nome), quando o ano tem. */
  period: string | null;
  /** Disciplinas do ano aberto, na ordem; `grade` já formatada (null = pendente). */
  subjects: Array<{ name: string; color: string; grade: string | null; next: { name: string; date: DateKey } | null }>;
  /** Sessões de estudo planejadas para hoje. */
  sessions: Array<{ subject: string; time: string | null; min: number }>;
  /** Baralhos de flashcards e quantos cartões vencem hoje. */
  decks: Array<{ name: string; due: number }>;
  /** Avaliações do período e a nota registrada (já formatada; null = sem nota). */
  exams: Array<{ subject: string; name: string; date: DateKey | null; score: string | null }>;
}

export function academyBoards(x: AcademyFloorInput, c: BoardCtx): FloorBoards {
  const { t } = c;
  const gradeLine = (g: string | null) => {
    const v = g === null ? t('park.floorBoards.academy.noGrade') : t('park.floorBoards.academy.grade', { grade: g });
    return x.period ? `${x.period} · ${v}` : v;
  };
  return {
    series: {
      class: {
        items: x.subjects.map((s) => ({
          title: s.name,
          color: s.color,
          lines: [gradeLine(s.grade), s.next ? t('park.floorBoards.academy.next', { name: s.next.name, date: dayOf(c, s.next.date) }) : t('park.floorBoards.academy.noNext')],
        })),
        free: empty(t('park.floorBoards.freeRoom'), t('park.floorBoards.academy.noSubject')),
        more: t('park.floorBoards.academy.moreSubjects'),
      },
    },
    rooms: {
      cabins: list(
        t('park.floorBoards.academy.cabins'),
        x.sessions.map((s) => `${s.time ? `${s.time} · ` : ''}${s.subject} · ${t('focus.min', { min: s.min })}`),
        t('park.floorBoards.academy.noSessions'),
      ),
      practice: list(
        t('park.floorBoards.academy.decks'),
        x.decks.map((d) => t('park.floorBoards.academy.deckDue', { name: d.name, count: d.due })),
        t('park.floorBoards.academy.noDecks'),
      ),
      exams: list(
        x.period ? `${t('park.floorBoards.academy.exams')} · ${x.period}` : t('park.floorBoards.academy.exams'),
        x.exams.map((e) => `${e.date ? dayOf(c, e.date) : '—'} · ${e.subject} · ${e.name}: ${e.score ?? t('park.floorBoards.academy.noScore')}`),
        t('park.floorBoards.academy.noExams'),
      ),
    },
  };
}

/* ---------- Idiomas ---------- */

export interface LanguagesFloorInput {
  langs: Array<{ name: string; color: string; level: string | null; native: boolean; weekMin: number; weekSessions: number; wordsDue: number }>;
  /** Gramática do idioma escolhido (o mesmo que a estação abre). */
  grammar: { language: string; rules: string[] } | null;
  /** Minutos de conversação e fala nesta semana. */
  speakingMin: number;
  /** Sessões de pronúncia nesta semana. */
  pronunciation: number;
}

export function languagesBoards(x: LanguagesFloorInput, c: BoardCtx): FloorBoards {
  const { t } = c;
  const studied = x.langs.filter((l) => !l.native);
  return {
    series: {
      lang: {
        items: x.langs.map((l) => ({
          title: l.name,
          color: l.color,
          lines: [l.native ? t('languages.native') : (l.level ?? t('languages.noLevel')), t('languages.weekSummary', { min: l.weekMin, sessions: l.weekSessions })],
        })),
        free: empty(t('park.floorBoards.freeRoom'), t('park.floorBoards.languages.noLanguage')),
        more: t('park.floorBoards.languages.moreLanguages'),
      },
    },
    rooms: {
      grammar: x.grammar
        ? list(t('park.floorBoards.languages.grammar', { language: x.grammar.language }), x.grammar.rules, t('park.floorBoards.languages.noGrammar'))
        : empty(t('park.floorBoards.languages.grammarAll'), t('park.floorBoards.languages.noLanguage')),
      conversation: { title: t('park.floorBoards.languages.conversation'), lines: [t('park.floorBoards.weekMin', { min: x.speakingMin })], empty: x.speakingMin === 0 },
      booths: { title: t('park.floorBoards.languages.booths'), lines: [t('park.floorBoards.languages.pronunciation', { count: x.pronunciation })], empty: x.pronunciation === 0 },
      vocab: list(
        t('park.floorBoards.languages.vocab'),
        studied.map((l) => t('park.floorBoards.languages.wordsDue', { name: l.name, count: l.wordsDue })),
        t('park.floorBoards.languages.noLanguage'),
      ),
    },
  };
}

/* ---------- Notes ---------- */

export interface NotesFloorInput {
  notebooks: Array<{ name: string; count: number }>;
  /** Notas fora de caderno. */
  loose: number;
  /** Notas com desenho (Apple Pencil) e as mais recentes delas. */
  drawings: number;
  drawingTitles: string[];
  /** Versões guardadas e as notas das mais recentes. */
  versions: number;
  versionTitles: string[];
}

export function notesBoards(x: NotesFloorInput, c: BoardCtx): FloorBoards {
  const { t } = c;
  const books = x.notebooks.map((n) => countOf(c, n.name, n.count));
  if (x.loose > 0) books.push(t('park.floorBoards.notes.loose', { count: x.loose }));
  return {
    series: {},
    rooms: {
      organize: list(t('park.floorBoards.notes.notebooks'), books, t('park.floorBoards.notes.noNotes')),
      handwriting: x.drawings ? { title: t('park.floorBoards.notes.drawings', { count: x.drawings }), lines: x.drawingTitles } : empty(t('park.floorBoards.notes.drawingsTitle'), t('park.floorBoards.notes.noDrawings')),
      versions: x.versions ? { title: t('park.floorBoards.notes.versions', { count: x.versions }), lines: x.versionTitles } : empty(t('park.floorBoards.notes.versionsTitle'), t('park.floorBoards.notes.noVersions')),
    },
  };
}

/* ---------- Library ---------- */

export interface LibraryFloorInput {
  kinds: Array<{ kind: LibraryKind; count: number }>;
  total: number;
  favorites: number;
  reading: string[];
  statuses: Record<ReadStatus, number>;
  /** Arquivos e PDFs mais recentes (título e dia). */
  files: Array<{ title: string; date: DateKey }>;
}

export function libraryBoards(x: LibraryFloorInput, c: BoardCtx): FloorBoards {
  const { t } = c;
  const shelves = x.kinds.filter((k) => k.count > 0).map((k) => countOf(c, t(`library.kinds.${k.kind}`), k.count));
  return {
    series: {},
    rooms: {
      collection: list(t('park.floorBoards.library.shelves'), shelves, t('park.floorBoards.library.noItems')),
      research: x.total ? { title: t('park.floorBoards.library.items', { count: x.total }), lines: [t('park.floorBoards.library.favorites', { count: x.favorites })] } : empty(t('park.floorBoards.library.shelves'), t('park.floorBoards.library.noItems')),
      reading: list(t('park.floorBoards.library.readingNow'), x.reading, t('park.floorBoards.library.noReading')),
      deep: x.total
        ? { title: t('park.floorBoards.library.statuses'), lines: (['want', 'reading', 'read'] as const).map((s) => countOf(c, t(`library.readStatuses.${s}`), x.statuses[s])) }
        : empty(t('park.floorBoards.library.statuses'), t('park.floorBoards.library.noItems')),
      documents: list(t('park.floorBoards.library.recentFiles'), x.files.map((f) => `${dayOf(c, f.date)} · ${f.title}`), t('park.floorBoards.library.noFiles')),
    },
  };
}

/* ---------- Inbox ---------- */

export interface InboxFloorInput {
  open: number;
  /** Itens na entrada (os mais novos) e os mais antigos esperando. */
  openTitles: string[];
  oldest: Array<{ title: string; date: DateKey }>;
  snoozed: number;
  /** #tags dos itens abertos, com quantos têm cada uma. */
  tags: Array<{ tag: string; count: number }>;
  /** Para onde foram os processados (rótulo já traduzido) e quantos arquivados. */
  flow: Array<{ label: string; count: number }>;
  archived: number;
}

export function inboxBoards(x: InboxFloorInput, c: BoardCtx): FloorBoards {
  const { t } = c;
  const flow = x.flow.filter((f) => f.count > 0).map((f) => countOf(c, f.label, f.count));
  if (flow.length && x.archived) flow.push(countOf(c, t('park.inbox.archived'), x.archived));
  const pending = x.oldest.map((o) => `${dayOf(c, o.date)} · ${o.title}`);
  if (x.snoozed) pending.push(t('park.floorBoards.inbox.snoozed', { count: x.snoozed }));
  return {
    series: {},
    rooms: {
      triage: x.open ? { title: t('park.floorBoards.inbox.open', { count: x.open }), lines: x.openTitles } : empty(t('park.floorBoards.inbox.triage'), t('inbox.empty.open')),
      tags: list(t('park.floorBoards.inbox.tags'), x.tags.map((g) => countOf(c, `#${g.tag}`, g.count)), t('park.floorBoards.inbox.noTags')),
      flow: list(t('park.floorBoards.inbox.flow'), flow, t('park.floorBoards.inbox.noFlow')),
      pending: list(t('park.floorBoards.inbox.pending'), pending, t('inbox.empty.open')),
    },
  };
}

/* ---------- Calendar ---------- */

export interface CalItem {
  title: string;
  date: DateKey;
  /** Minutos desde 0h; null = dia inteiro. */
  start: number | null;
}

export interface CalendarFloorInput {
  today: CalItem[];
  week: CalItem[];
  month: CalItem[];
  /** Próximos 30 dias e últimos 7 (revisão da agenda). */
  upcoming: CalItem[];
  past: CalItem[];
  /** Ano: quantos eventos, marcos e prazos de objetivos em cada mês (12 números). */
  year: number;
  months: number[];
  /** Marcos de projetos e prazos de objetivos que vêm aí. */
  deadlines: CalItem[];
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function calendarBoards(x: CalendarFloorInput, c: BoardCtx): FloorBoards {
  const { t } = c;
  const timed = (i: CalItem) => `${i.start === null ? t('park.floorBoards.calendar.allDay') : hhmm(i.start)} · ${i.title}`;
  const dated = (i: CalItem) => `${dayOf(c, i.date)} · ${i.title}`;
  const top = Math.max(1, ...x.months);
  const monthName = (k: number) => formatDateKey(`${x.year}-${String(k + 1).padStart(2, '0')}-01`, c.locale, { month: 'short' });
  const total = x.months.reduce((a, n) => a + n, 0);
  return {
    series: {},
    rooms: {
      daily: list(t('park.floorBoards.calendar.today'), x.today.map(timed), t('park.floorBoards.calendar.nothingToday')),
      weekly: list(t('park.floorBoards.calendar.week', { count: x.week.length }), x.week.map(dated), t('park.floorBoards.calendar.nothingWeek')),
      monthly: list(t('park.floorBoards.calendar.month', { count: x.month.length }), x.month.map(dated), t('park.floorBoards.calendar.nothingMonth')),
      events: list(t('park.floorBoards.calendar.next'), x.upcoming.map(dated), t('park.floorBoards.calendar.nothingNext')),
      timeline: total
        ? { title: t('park.floorBoards.calendar.year', { year: x.year, count: total }), lines: [], bars: x.months.map((n, k) => ({ label: monthName(k), value: n / top })) }
        : empty(t('park.floorBoards.calendar.year', { year: x.year, count: 0 }), t('park.floorBoards.calendar.nothingYear')),
      agenda: list(t('park.floorBoards.calendar.agenda'), [...x.past.map(dated), ...x.upcoming.slice(0, 3).map(dated)], t('park.floorBoards.calendar.nothingNext')),
      links: list(t('park.floorBoards.calendar.deadlines'), x.deadlines.map(dated), t('park.floorBoards.calendar.noDeadlines')),
    },
  };
}

/* ---------- Tasks ---------- */

export interface TasksFloorInput {
  /** Colunas do quadro (status abertos) com quantas tarefas e as primeiras de cada uma. */
  columns: Array<{ name: string; count: number; top: string[] }>;
  dueToday: string[];
  priority: string[];
  overdue: Array<{ title: string; due: DateKey }>;
  doneWeek: string[];
  lists: Array<{ name: string; count: number }>;
  recurring: string[];
}

export function tasksBoards(x: TasksFloorInput, c: BoardCtx): FloorBoards {
  const { t } = c;
  const kanban = x.columns.flatMap((col) => [countOf(c, col.name, col.count), ...col.top.map((s) => `   ${s}`)]);
  return {
    series: {},
    rooms: {
      organize: x.columns.some((col) => col.count > 0) ? { title: t('park.floorBoards.tasks.kanban'), lines: kanban } : empty(t('park.floorBoards.tasks.kanban'), t('park.floorBoards.tasks.noOpen')),
      stations: list(t('park.floorBoards.tasks.dueToday', { count: x.dueToday.length }), x.dueToday, t('park.floorBoards.tasks.nothingToday')),
      priorities: list(t('park.floorBoards.tasks.priorities'), x.priority, t('park.floorBoards.tasks.noPriority')),
      late: list(t('park.floorBoards.tasks.overdue', { count: x.overdue.length }), x.overdue.map((o) => `${dayOf(c, o.due)} · ${o.title}`), t('park.floorBoards.tasks.noOverdue')),
      done: list(t('park.floorBoards.tasks.doneWeek', { count: x.doneWeek.length }), x.doneWeek, t('park.floorBoards.tasks.noneDone')),
      review: list(t('park.floorBoards.tasks.lists'), x.lists.map((l) => countOf(c, l.name, l.count)), t('park.floorBoards.tasks.noLists')),
      execution: list(t('park.floorBoards.tasks.recurring', { count: x.recurring.length }), x.recurring, t('park.floorBoards.tasks.noRecurring')),
    },
  };
}

/* ---------- Projects ---------- */

export interface ProjectsFloorInput {
  active: Array<{ name: string; color: string; next: { title: string; date: DateKey | null } | null; done: number; total: number; refs: number }>;
  done: Array<{ name: string; date: DateKey }>;
}

export function projectsBoards(x: ProjectsFloorInput, c: BoardCtx): FloorBoards {
  const { t } = c;
  const materials = x.active.filter((p) => p.refs > 0).map((p) => countOf(c, p.name, p.refs));
  return {
    series: {
      proj: {
        items: x.active.map((p) => ({
          title: p.name,
          color: p.color,
          lines: [
            p.next ? t('park.floorBoards.projects.next', { title: p.next.title, date: p.next.date ? dayOf(c, p.next.date) : '—' }) : t('park.floorBoards.projects.noNext'),
            t('park.floorBoards.projects.milestones', { done: p.done, total: p.total }),
          ],
        })),
        free: empty(t('park.floorBoards.freeRoom'), t('park.floorBoards.projects.noProject')),
        more: t('park.floorBoards.projects.moreProjects'),
      },
    },
    rooms: {
      tracking: x.active.length
        ? { title: t('park.floorBoards.projects.tracking'), lines: [], bars: x.active.map((p) => ({ label: p.name, value: p.total ? p.done / p.total : null })), nullLabel: t('park.floorBoards.projects.noMilestones') }
        : empty(t('park.floorBoards.projects.tracking'), t('park.floorBoards.projects.noProject')),
      materials: list(t('park.floorBoards.projects.materials'), materials, t('park.floorBoards.projects.noMaterials')),
      done: list(t('park.floorBoards.projects.done', { count: x.done.length }), x.done.map((p) => `${dayOf(c, p.date)} · ${p.name}`), t('park.floorBoards.projects.noneDone')),
    },
  };
}

/* ---------- Goals ---------- */

export interface GoalsFloorInput {
  /** Objetivos ativos: progresso real de 0 a 1 (null = qualitativo ou sem como medir). */
  active: Array<{ name: string; progress: number | null; deadline: DateKey | null }>;
  /** Concluídos, com a data em que foram concluídos. */
  achieved: Array<{ name: string; date: DateKey | null }>;
  checkinsWeek: number;
  recent: Array<{ goal: string; date: DateKey }>;
}

export function goalsBoards(x: GoalsFloorInput, c: BoardCtx): FloorBoards {
  const { t } = c;
  const deadlines = x.active.filter((g) => g.deadline).sort((a, b) => a.deadline!.localeCompare(b.deadline!));
  return {
    series: {},
    rooms: {
      planning: x.active.length
        ? { title: t('park.floorBoards.goals.pillars'), lines: [], bars: x.active.map((g) => ({ label: g.name, value: g.progress })), nullLabel: t('park.floorBoards.goals.qualitative') }
        : empty(t('park.floorBoards.goals.pillars'), t('park.floorBoards.goals.noActive')),
      links: list(t('park.floorBoards.goals.deadlines'), deadlines.map((g) => `${dayOf(c, g.deadline!)} · ${g.name}`), t('park.floorBoards.goals.noDeadlines')),
      tracking: { title: t('park.floorBoards.goals.checkinsWeek', { count: x.checkinsWeek }), lines: [], empty: x.checkinsWeek === 0 },
      updates: list(t('park.floorBoards.goals.updates'), x.recent.map((r) => `${dayOf(c, r.date)} · ${r.goal}`), t('park.floorBoards.goals.noUpdates')),
      history: list(t('park.floorBoards.goals.achieved', { count: x.achieved.length }), x.achieved.map((g) => (g.date ? `${dayOf(c, g.date)} · ${g.name}` : g.name)), t('park.floorBoards.goals.noneAchieved')),
    },
  };
}

/* ---------- Insights ---------- */

export const INSIGHT_MODS = ['focus', 'tasks', 'habits', 'projects', 'goals', 'academy', 'languages', 'music', 'sports', 'finance'] as const;
export type InsightMod = (typeof INSIGHT_MODS)[number];

/** O indicador que o Insights já calcula para um módulo, nesta semana e na anterior. */
export interface InsightMetric {
  mod: InsightMod;
  /** Rótulo do indicador (ex.: "minutos de foco"). */
  label: string;
  now: number;
  before: number;
  /** O módulo tem registros. */
  has: boolean;
  /** Finanças trancado pelo PIN: nenhum número. */
  locked?: boolean;
}

/** Dá para comparar esta semana com a anterior? Só com dados nas duas semanas. */
export function canCompare(m: InsightMetric): boolean {
  return !m.locked && m.has && m.now > 0 && m.before > 0;
}

export function insightsBoards(metrics: InsightMetric[], c: BoardCtx): FloorBoards {
  const { t } = c;
  const name = (m: InsightMetric) => t(`modules.${m.mod}`);
  const show = (m: InsightMetric) => `${name(m)}: ${m.locked ? t('park.floorBoards.lockedShort') : m.has ? `${m.now} ${m.label}` : t('insights.noData')}`;
  const compare = (m: InsightMetric) => `${name(m)}: ${m.locked ? t('park.floorBoards.lockedShort') : canCompare(m) ? t('park.floorBoards.insights.versus', { now: m.now, before: m.before, label: m.label }) : t('park.floorBoards.insights.cantCompare')}`;
  const half = Math.ceil(metrics.length / 2);
  const a = metrics.slice(0, half);
  const b = metrics.slice(half);
  const cmp = (title: string, ms: InsightMetric[]): Board => (ms.some(canCompare) ? { title, lines: ms.map(compare) } : empty(title, t('park.floorBoards.insights.cantCompareYet')));
  return {
    series: {},
    rooms: {
      indicators: list(t('park.floorBoards.insights.thisWeek'), a.map(show), t('insights.allPrivate')),
      charts: list(t('park.floorBoards.insights.thisWeek'), b.map(show), t('insights.allPrivate')),
      comparisons: cmp(t('park.floorBoards.insights.compare'), a),
      deep: cmp(t('park.floorBoards.insights.compare'), b),
    },
  };
}

/* ---------- Música ---------- */

export interface MusicFloorInput {
  instruments: Array<{ name: string; color: string; weekMin: number; songs: string[] }>;
  /** Repertório em andamento (aprendendo ou revisando). */
  repertoire: Array<{ name: string; instrument: string; progress: number | null }>;
  weekMin: number;
  weekSessions: number;
}

export function musicBoards(x: MusicFloorInput, c: BoardCtx): FloorBoards {
  const { t } = c;
  const top = Math.max(1, ...x.instruments.map((i) => i.weekMin));
  const week: Board = x.weekSessions
    ? { title: t('park.floorBoards.music.week', { min: x.weekMin, count: x.weekSessions }), lines: [], bars: x.instruments.map((i) => ({ label: `${i.name} · ${t('focus.min', { min: i.weekMin })}`, value: i.weekMin / top })) }
    : empty(t('park.floorBoards.music.weekTitle'), t('park.floorBoards.music.noPractice'));
  return {
    series: {
      practice: {
        items: x.instruments.map((i) => ({ title: i.name, color: i.color, lines: [t('park.floorBoards.weekMin', { min: i.weekMin }), ...(i.songs.length ? i.songs : [t('park.floorBoards.music.noSongs')])] })),
        free: empty(t('park.floorBoards.freeRoom'), t('park.floorBoards.music.noInstrument')),
        more: t('park.floorBoards.music.moreInstruments'),
      },
    },
    rooms: {
      study: week,
      practiceTime: week,
      repertoire: list(t('park.floorBoards.music.repertoire'), x.repertoire.map((s) => `${s.name} · ${s.instrument}${s.progress !== null ? ` · ${s.progress}%` : ''}`), t('park.floorBoards.music.noSongs')),
    },
  };
}

/* ---------- Esportes ---------- */

export interface SportsFloorInput {
  sports: Array<{ name: string; color: string; record: { win: number; loss: number; draw: number }; games: number; last: { date: DateKey; what: string } | null }>;
}

export function sportsBoards(x: SportsFloorInput, c: BoardCtx): FloorBoards {
  const { t } = c;
  return {
    series: {
      sport: {
        items: x.sports.map((s) => ({
          title: s.name,
          color: s.color,
          lines: [s.games ? t('park.floorBoards.sports.record', { ...s.record }) : t('park.floorBoards.sports.noGames'), s.last ? t('park.floorBoards.sports.last', { date: dayOf(c, s.last.date), what: s.last.what }) : t('park.floorBoards.sports.noSessions')],
        })),
        free: empty(t('park.floorBoards.freeRoom'), t('park.floorBoards.sports.noSport')),
        more: t('park.floorBoards.sports.moreSports'),
      },
    },
    rooms: {},
  };
}

/* ---------- Finanças (atrás do PIN) ---------- */

export interface FinanceFloorInput {
  /** Trancado pelo PIN (ou ainda lendo o PIN): nada aparece. */
  locked: boolean;
  /** "Ocultar valores" ligado (ou a privacidade rápida): valores trocados por •••••. */
  hidden: boolean;
  currency: Currency;
  budgetEnabled: boolean;
  /** Mês atual e os dois anteriores (o primeiro é o atual), com o nome já formatado. */
  months: Array<{ label: string; income: { planned: number; actual: number }; expense: { planned: number; actual: number } }>;
  /** Maiores categorias de despesa do mês. */
  top: Array<{ name: string; planned: number; actual: number }>;
  categories: number;
  /** Investimentos por moeda: quanto foi investido e em quantos ativos. */
  invest: Array<{ currency: Currency; invested: number; assets: number }>;
  /** Ativos da carteira (sem arquivados), pelo nome. */
  assets: Array<{ name: string; currency: Currency }>;
}

export const FINANCE_ROOMS = ['budget', 'records', 'history', 'charts'] as const;

export function financeBoards(x: FinanceFloorInput, c: BoardCtx): FloorBoards {
  const { t } = c;
  if (x.locked) {
    const dark: Board = { title: t('park.floorBoards.locked'), lines: [], locked: true };
    return { series: {}, rooms: Object.fromEntries(FINANCE_ROOMS.map((k) => [k, dark])) };
  }
  const money = (v: number, cur: Currency = x.currency) => (x.hidden ? '•••••' : formatMoney(v, cur, c.locale));
  const m0 = x.months[0];
  const noBudget = t('park.floorBoards.finance.noBudget');
  const budgetTitle = t('park.floorBoards.finance.budget', { month: m0?.label ?? '' });
  return {
    series: {},
    rooms: {
      budget:
        x.budgetEnabled && m0 && x.categories
          ? {
              title: budgetTitle,
              lines: [
                t('park.floorBoards.finance.income', { actual: money(m0.income.actual), planned: money(m0.income.planned) }),
                t('park.floorBoards.finance.expense', { actual: money(m0.expense.actual), planned: money(m0.expense.planned) }),
                // Os meses anteriores: quanto foi gasto em cada um.
                ...x.months.slice(1).map((m) => `${m.label}: ${t('park.floorBoards.finance.spent', { value: money(m.expense.actual) })}`),
              ],
            }
          : empty(budgetTitle, noBudget),
      records: x.budgetEnabled && x.top.length ? { title: t('park.floorBoards.finance.categories'), lines: x.top.map((r) => `${r.name}: ${money(r.actual)} / ${money(r.planned)}`) } : empty(t('park.floorBoards.finance.categories'), noBudget),
      history: list(t('park.floorBoards.finance.portfolio'), x.assets.map((a) => `${a.name} · ${a.currency}`), t('park.floorBoards.finance.noAssets')),
      charts: list(t('park.floorBoards.finance.invested'), x.invest.map((i) => `${i.currency}: ${money(i.invested, i.currency)} · ${t('park.floorBoards.finance.assets', { count: i.assets })}`), t('park.floorBoards.finance.noAssets')),
    },
  };
}

/* ---------- Focus ---------- */

export interface FocusFloorInput {
  sessions: Array<{ date: DateKey; min: number; kind: string; completed: boolean }>;
}

export function focusBoards(x: FocusFloorInput, c: BoardCtx): FloorBoards {
  const { t } = c;
  return {
    series: {},
    rooms: {
      history: list(t('park.floorBoards.focus.latest'), x.sessions.map((s) => `${dayOf(c, s.date)} · ${t('focus.min', { min: s.min })} · ${s.kind}${s.completed ? '' : ` · ${t('park.floorBoards.focus.stopped')}`}`), t('park.floorBoards.focus.none')),
    },
  };
}

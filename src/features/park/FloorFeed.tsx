import { useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ModuleId } from '@/app/modules';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { loadHideValues } from '@/data/financeRepo';
import { loadPlanPrefs } from '@/data/financePlanRepo';
import { loadPrivacy } from '@/data/privacyRepo';
import { addDays, addMonths, capitalizeFirst, startOfWeek, toDateKey, todayKey, type DateKey } from '@/domain/dates';
import { budgetMonth, CURRENCIES } from '@/domain/finance';
import { goalProgress, isOpenGoal } from '@/domain/goals';
import { extractTags, type InboxItem } from '@/domain/inbox';
import { academyInsights, financeInsights, focusInsights, goalsInsights, habitsInsights, languagesInsights, musicInsights, previousRange, projectsInsights, rangeFor, sportsInsights, tasksInsights } from '@/domain/insights';
import { sessionStats } from '@/domain/languages';
import { LIBRARY_KINDS } from '@/domain/library';
import { isClosedProject } from '@/domain/projects';
import { sportStats } from '@/domain/sports';
import { isClosedKind, isOverdue, statusKind } from '@/domain/tasks';
import { currentPeriodId } from '@/features/academy/AcademyPage';
import { useFlashcards } from '@/features/academy/flashcards';
import { formatGrade, useAcademyData } from '@/features/academy/useAcademyData';
import { useCalendarData, type CalendarItem } from '@/features/calendar/useCalendarData';
import { useFinance } from '@/features/finance/useFinance';
import { useGoals } from '@/features/goals/useGoals';
import { useInsightsData } from '@/features/insights/useInsightsData';
import { useLanguages } from '@/features/languages/useLanguages';
import { useMusic } from '@/features/music/useMusic';
import { useNotesData } from '@/features/notes/useNotesData';
import { useProjectsData } from '@/features/projects/useProjectsData';
import { useQuickPrivacy } from '@/features/security/QuickPrivacy';
import { useSports } from '@/features/sports/useSports';
import { useStatusName, useTasksData } from '@/features/tasks/useTasksData';
import {
  academyBoards,
  calendarBoards,
  financeBoards,
  focusBoards,
  goalsBoards,
  inboxBoards,
  insightsBoards,
  languagesBoards,
  libraryBoards,
  musicBoards,
  notesBoards,
  projectsBoards,
  sportsBoards,
  tasksBoards,
  INSIGHT_MODS,
  type BoardCtx,
  type CalItem,
  type FloorBoards,
  type InsightMetric,
  type InsightMod,
} from './interiors/boards';
import { goalShare, nextMilestone } from './live';

/**
 * Dados reais dos andares do prédio em que se está (V2.1): lê o mesmo que as estações do prédio
 * (os mesmos hooks e cálculos), monta o texto de cada quadro (interiors/boards.ts) e entrega ao
 * ParkPage, que manda para o interior junto com os dados do térreo. Só o prédio aberto lê os dados
 * dele; o quadro só é entregue de novo quando o texto muda.
 */
export function FloorFeed({ id, financeLocked, onBoards }: { id: ModuleId; financeLocked: boolean; onBoards: (fb: FloorBoards) => void }) {
  switch (id) {
    case 'academy':
      return <AcademyFeed onBoards={onBoards} />;
    case 'languages':
      return <LanguagesFeed onBoards={onBoards} />;
    case 'notes':
      return <NotesFeed onBoards={onBoards} />;
    case 'library':
      return <LibraryFeed onBoards={onBoards} />;
    case 'inbox':
      return <InboxFeed onBoards={onBoards} />;
    case 'calendar':
      return <CalendarFeed onBoards={onBoards} />;
    case 'tasks':
      return <TasksFeed onBoards={onBoards} />;
    case 'projects':
      return <ProjectsFeed onBoards={onBoards} />;
    case 'goals':
      return <GoalsFeed onBoards={onBoards} />;
    case 'insights':
      return <InsightsFeed onBoards={onBoards} financeLocked={financeLocked} />;
    case 'music':
      return <MusicFeed onBoards={onBoards} />;
    case 'sports':
      return <SportsFeed onBoards={onBoards} />;
    case 'finance':
      return <FinanceFeed onBoards={onBoards} locked={financeLocked} />;
    case 'focus':
      return <FocusFeed onBoards={onBoards} />;
    default:
      return null;
  }
}

interface FeedProps {
  onBoards: (fb: FloorBoards) => void;
}

function useBoardCtx(): BoardCtx & { weekStartsOn: 0 | 1; weekFrom: DateKey } {
  const { t, settings } = useSettings();
  const today = todayKey();
  return { t, locale: settings.locale, today, weekStartsOn: settings.weekStartsOn, weekFrom: startOfWeek(today, settings.weekStartsOn) };
}

/** Entrega os quadros (null = ainda lendo) só quando o texto muda. */
function useSend(fb: FloorBoards | null, onBoards: (fb: FloorBoards) => void) {
  const key = fb ? JSON.stringify(fb) : '';
  useEffect(() => {
    if (fb) onBoards(fb);
    // O texto dos quadros (key) decide; a função muda a cada render do ParkPage.
  }, [key]);
}

const dayOfIso = (iso: string) => toDateKey(new Date(iso));

/* ---------- Academy ---------- */

function AcademyFeed({ onBoards }: FeedProps) {
  const c = useBoardCtx();
  const data = useAcademyData();
  const fc = useFlashcards();
  const sessions = useLiveQuery(() => getDb().studySessions.where('date').equals(c.today).filter((s) => !s.deletedAt && s.status === 'planned').toArray(), [c.today]);
  const fb = useMemo(() => {
    if (data.loading || fc.loading || !sessions) return null;
    const periodId = currentPeriodId(data.year);
    const period = data.year?.periods.find((p) => p.id === periodId) ?? null;
    const gradeText = (r: ReturnType<typeof data.gradeOf>) => (r.status === 'ok' ? formatGrade(r.value, c.locale) : null);
    const name = (subjectId: string) => data.subjectById.get(subjectId)?.name ?? '';
    return academyBoards(
      {
        period: period?.name ?? null,
        subjects: data.subjects.map((s) => {
          const next = data.assessments.find((a) => a.subjectId === s.id && a.date && a.date >= c.today);
          return { name: s.name, color: s.color, grade: periodId ? gradeText(data.gradeOf(s, periodId)) : null, next: next?.date ? { name: next.name, date: next.date } : null };
        }),
        sessions: sessions
          .filter((s) => data.subjectById.has(s.subjectId))
          .sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'))
          .map((s) => ({ subject: name(s.subjectId), time: s.time, min: s.durationMin })),
        decks: fc.decks.map((d) => ({ name: d.name, due: fc.cardsOf(d.id).filter((k) => k.srs.due !== null && k.srs.due <= c.today).length })),
        exams: data.assessments
          .filter((a) => !periodId || a.periodId === periodId)
          .map((a) => ({ subject: name(a.subjectId), name: a.name, date: a.date, score: a.score === null ? null : `${formatGrade(a.score, c.locale)}/${formatGrade(a.maxScore, c.locale)}` })),
      },
      c,
    );
  }, [data, fc, sessions, c.today, c.locale, c.t]);
  useSend(fb, onBoards);
  return null;
}

/* ---------- Idiomas ---------- */

function LanguagesFeed({ onBoards }: FeedProps) {
  const c = useBoardCtx();
  const data = useLanguages();
  const vocab = useLiveQuery(() => getDb().vocab.where('srs.due').belowOrEqual(c.today).filter((v) => !v.deletedAt).toArray(), [c.today]);
  // O idioma que a estação abre (o primeiro estudado): a gramática dele no mural.
  const current = data.languages.find((l) => !l.native) ?? data.languages[0];
  const grammar = useLiveQuery(async () => (current ? (await getDb().grammarRules.where('languageId').equals(current.id).toArray()).filter((g) => !g.deletedAt) : []), [current?.id]);
  const fb = useMemo(() => {
    if (data.loading || !vocab || !grammar) return null;
    const week = data.sessions.filter((s) => s.date >= c.weekFrom && s.date <= c.today);
    return languagesBoards(
      {
        langs: data.languages.map((l) => {
          const st = sessionStats(week.filter((s) => s.languageId === l.id));
          return { name: l.name, color: l.color, level: l.level, native: l.native, weekMin: st.total, weekSessions: st.sessions, wordsDue: vocab.filter((v) => v.languageId === l.id).length };
        }),
        grammar: current ? { language: current.name, rules: grammar.map((g) => (g.topic ? `${g.title} · ${g.topic}` : g.title)) } : null,
        speakingMin: week.filter((s) => s.activity === 'conversation' || s.activity === 'speaking').reduce((a, s) => a + s.durationMin, 0),
        pronunciation: week.filter((s) => s.activity === 'pronunciation').length,
      },
      c,
    );
  }, [data, vocab, grammar, current, c.today, c.weekFrom, c.locale, c.t]);
  useSend(fb, onBoards);
  return null;
}

/* ---------- Notes ---------- */

function NotesFeed({ onBoards }: FeedProps) {
  const c = useBoardCtx();
  const data = useNotesData();
  const versions = useLiveQuery(async () => {
    const db = getDb();
    return { count: await db.noteVersions.count(), recent: await db.noteVersions.orderBy('at').reverse().limit(5).toArray() };
  }, []);
  const fb = useMemo(() => {
    if (data.loading || !versions) return null;
    const drawings = data.notes.filter((n) => n.blocks.some((b) => b.type === 'drawing'));
    const titles = [...new Set(versions.recent.map((v) => v.title).filter(Boolean))];
    return notesBoards(
      {
        notebooks: data.notebooks.map((nb) => ({ name: nb.name, count: data.notes.filter((n) => n.notebookId === nb.id).length })),
        loose: data.notes.filter((n) => !n.notebookId || !data.notebooks.some((nb) => nb.id === n.notebookId)).length,
        drawings: drawings.length,
        drawingTitles: drawings.slice(0, 4).map((n) => n.title).filter(Boolean),
        versions: versions.count,
        versionTitles: titles.slice(0, 4),
      },
      c,
    );
  }, [data, versions, c.locale, c.t]);
  useSend(fb, onBoards);
  return null;
}

/* ---------- Library ---------- */

function LibraryFeed({ onBoards }: FeedProps) {
  const c = useBoardCtx();
  const items = useLiveQuery(async () => (await getDb().libraryItems.toArray()).filter((i) => !i.deletedAt), []);
  const fb = useMemo(() => {
    if (!items) return null;
    const files = items.filter((i) => i.fileId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return libraryBoards(
      {
        kinds: LIBRARY_KINDS.map((kind) => ({ kind, count: items.filter((i) => i.kind === kind).length })),
        total: items.length,
        favorites: items.filter((i) => i.favorite).length,
        reading: items.filter((i) => i.readStatus === 'reading').map((i) => i.title),
        statuses: { want: items.filter((i) => i.readStatus === 'want').length, reading: items.filter((i) => i.readStatus === 'reading').length, read: items.filter((i) => i.readStatus === 'read').length },
        files: files.slice(0, 6).map((i) => ({ title: i.title, date: dayOfIso(i.updatedAt) })),
      },
      c,
    );
  }, [items, c.today, c.locale, c.t]);
  useSend(fb, onBoards);
  return null;
}

/* ---------- Inbox ---------- */

function InboxFeed({ onBoards }: FeedProps) {
  const c = useBoardCtx();
  const items = useLiveQuery(async () => (await getDb().inbox.toArray()).filter((i) => !i.deletedAt), []);
  const fb = useMemo(() => {
    if (!items) return null;
    const { t } = c;
    const title = (i: InboxItem) => i.text || i.fileName || i.url || '';
    const snoozed = (i: InboxItem) => !!i.snoozedUntil && i.snoozedUntil > c.today;
    const open = items.filter((i) => i.status === 'open' && !snoozed(i));
    const newest = [...open].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const tags = new Map<string, number>();
    for (const i of open) for (const g of new Set(extractTags(i.text))) tags.set(g, (tags.get(g) ?? 0) + 1);
    const flow = new Map<string, number>();
    for (const i of items) if (i.status === 'processed' && i.processedTo) flow.set(i.processedTo.type, (flow.get(i.processedTo.type) ?? 0) + 1);
    const label = (type: string) => {
      switch (type) {
        case 'task':
          return t('inbox.types.task');
        case 'event':
          return t('inbox.types.event');
        case 'note':
          return t('inbox.types.note');
        case 'library':
          return t('modules.library');
        case 'project':
          return t('modules.projects');
        default:
          return type;
      }
    };
    return inboxBoards(
      {
        open: open.length,
        openTitles: newest.slice(0, 6).map(title),
        oldest: [...newest].reverse().slice(0, 5).map((i) => ({ title: title(i), date: dayOfIso(i.createdAt) })),
        snoozed: items.filter((i) => i.status === 'open' && snoozed(i)).length,
        tags: [...tags.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, count]) => ({ tag, count })),
        flow: [...flow.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ label: label(type), count })),
        archived: items.filter((i) => i.status === 'archived').length,
      },
      c,
    );
  }, [items, c.today, c.locale, c.t]);
  useSend(fb, onBoards);
  return null;
}

/* ---------- Calendar ---------- */

function CalendarFeed({ onBoards }: FeedProps) {
  const c = useBoardCtx();
  const cal = useCalendarData();
  const fb = useMemo(() => {
    if (cal.loading) return null;
    const year = Number(c.today.slice(0, 4));
    const monthFrom = `${c.today.slice(0, 7)}-01`;
    const monthTo = addDays(addMonths(monthFrom, 1), -1);
    const all = cal.itemsInRange(`${year}-01-01`, `${year}-12-31`, { showTasks: false, categoryId: null }).filter((i) => i.kind !== 'task');
    const around = cal.itemsInRange(addDays(c.today, -7), addDays(c.today, 30), { showTasks: false, categoryId: null }).filter((i) => i.kind !== 'task');
    const pool = [...new Map([...all, ...around].map((i) => [i.key, i] as const)).values()].sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? -1) - (b.start ?? -1));
    const item = (i: CalendarItem): CalItem => ({ title: i.title, date: i.date, start: i.allDay ? null : i.start });
    const between = (from: DateKey, to: DateKey) => pool.filter((i) => i.date >= from && i.date <= to).map(item);
    const months = Array.from({ length: 12 }, () => 0);
    for (const i of all) {
      if (i.kind !== 'event' && i.kind !== 'milestone' && i.kind !== 'goal') continue;
      const k = Number(i.date.slice(5, 7)) - 1;
      months[k] = (months[k] ?? 0) + 1;
    }
    return calendarBoards(
      {
        today: between(c.today, c.today),
        week: between(c.weekFrom, addDays(c.weekFrom, 6)),
        month: between(monthFrom, monthTo),
        upcoming: between(addDays(c.today, 1), addDays(c.today, 30)),
        past: between(addDays(c.today, -7), addDays(c.today, -1)).slice(-3),
        year,
        months,
        deadlines: pool.filter((i) => (i.kind === 'milestone' || i.kind === 'goal') && i.date >= c.today).map(item),
      },
      c,
    );
  }, [cal, c.today, c.weekFrom, c.locale, c.t]);
  useSend(fb, onBoards);
  return null;
}

/* ---------- Tasks ---------- */

function TasksFeed({ onBoards }: FeedProps) {
  const c = useBoardCtx();
  const data = useTasksData();
  const statusName = useStatusName();
  const fb = useMemo(() => {
    if (data.loading) return null;
    const cfg = data.config;
    const open = data.active.filter((x) => !isClosedKind(statusKind(cfg, x.statusId))).sort((a, b) => a.order - b.order);
    const top = open.filter((x) => !x.parentId);
    return tasksBoards(
      {
        columns: cfg.statuses
          .filter((s) => !isClosedKind(s.kind))
          .map((s) => {
            const inCol = top.filter((x) => x.statusId === s.id);
            return { name: statusName(s), count: inCol.length, top: inCol.slice(0, 2).map((x) => x.title) };
          }),
        dueToday: open.filter((x) => x.dueDate === c.today).map((x) => x.title),
        priority: open.filter((x) => x.priority === 'urgent' || x.priority === 'high').map((x) => x.title),
        overdue: open
          .filter((x) => isOverdue(x, c.today, cfg))
          .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
          .map((x) => ({ title: x.title, due: x.dueDate! })),
        doneWeek: data.active.filter((x) => statusKind(cfg, x.statusId) === 'done' && x.completedAt && dayOfIso(x.completedAt) >= c.weekFrom).map((x) => x.title),
        lists: data.lists.map((l) => ({ name: l.name, count: open.filter((x) => x.listId === l.id).length })),
        recurring: open.filter((x) => x.recurrence !== null).map((x) => x.title),
      },
      c,
    );
  }, [data, statusName, c.today, c.weekFrom, c.locale, c.t]);
  useSend(fb, onBoards);
  return null;
}

/* ---------- Projects ---------- */

function ProjectsFeed({ onBoards }: FeedProps) {
  const c = useBoardCtx();
  const data = useProjectsData();
  const fb = useMemo(() => {
    if (data.loading) return null;
    const active = data.projects.filter((p) => !isClosedProject(p.status));
    return projectsBoards(
      {
        active: active.map((p) => {
          const next = nextMilestone(p);
          return { name: p.name, color: p.color, next: next ? { title: next.title, date: next.date } : null, done: p.milestones.filter((m) => m.done).length, total: p.milestones.length, refs: p.references.length };
        }),
        done: data.projects.filter((p) => p.status === 'done').map((p) => ({ name: p.name, date: dayOfIso(p.updatedAt) })),
      },
      c,
    );
  }, [data, c.today, c.locale, c.t]);
  useSend(fb, onBoards);
  return null;
}

/* ---------- Goals ---------- */

function GoalsFeed({ onBoards }: FeedProps) {
  const c = useBoardCtx();
  const data = useGoals();
  const fb = useMemo(() => {
    if (data.loading) return null;
    const checkins = data.goals.flatMap((g) => data.checkinsOf(g.id).map((k) => ({ goal: g.name, date: k.date })));
    return goalsBoards(
      {
        active: data.goals.filter(isOpenGoal).map((g) => ({ name: g.name, progress: goalShare(goalProgress(g, data.checkinsOf(g.id))), deadline: g.deadline })),
        achieved: data.goals
          .filter((g) => g.status === 'done')
          .map((g) => ({ name: g.name, date: g.doneAt ? dayOfIso(g.doneAt) : null }))
          .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
        checkinsWeek: checkins.filter((k) => k.date >= c.weekFrom && k.date <= c.today).length,
        recent: checkins.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
      },
      c,
    );
  }, [data, c.today, c.weekFrom, c.locale, c.t]);
  useSend(fb, onBoards);
  return null;
}

/* ---------- Insights ---------- */

function InsightsFeed({ onBoards, financeLocked }: FeedProps & { financeLocked: boolean }) {
  const c = useBoardCtx();
  const metrics = useInsightMetrics(financeLocked);
  const fb = useMemo(() => (metrics ? insightsBoards(metrics, c) : null), [metrics, c.today, c.locale, c.t]);
  useSend(fb, onBoards);
  return null;
}

/**
 * O indicador principal de cada módulo nesta semana e na anterior, como na estação (domain/insights),
 * sem os módulos escondidos na privacidade; Finanças trancado pelo PIN nem é calculado. null: lendo.
 * (Os quadros dos andares e a parede de indicadores usam a mesma conta.)
 */
export function useInsightMetrics(financeLocked: boolean): InsightMetric[] | null {
  const c = useBoardCtx();
  const raw = useInsightsData();
  const privacy = useLiveQuery(() => loadPrivacy(), []);
  return useMemo(() => {
    if (!raw || !privacy) return null;
    const { t } = c;
    const ws = c.weekStartsOn;
    const week = rangeFor('week', c.today, ws);
    const prev = previousRange(week);
    // O indicador principal de cada módulo, como na estação (domain/insights), nesta semana e na anterior.
    const one = (mod: InsightMod, r: typeof week): { value: number; has: boolean } => {
      switch (mod) {
        case 'focus': {
          const x = focusInsights(raw.focus, r);
          return { value: x.minutes, has: x.has };
        }
        case 'tasks': {
          const x = tasksInsights(raw.tasks, r);
          return { value: x.completed, has: x.has };
        }
        case 'habits': {
          const x = habitsInsights(raw.habits, raw.habitLogs, r, c.today, ws);
          return { value: x.logs, has: x.has };
        }
        case 'projects': {
          const x = projectsInsights(raw.projects, r);
          return { value: x.milestones.length, has: x.has };
        }
        case 'goals': {
          const x = goalsInsights(raw.goals, raw.goalCheckins, r);
          return { value: x.checkins, has: x.has };
        }
        case 'academy': {
          const x = academyInsights(raw.subjects, raw.years, raw.assessments, raw.contents, raw.studySessions, r);
          return { value: x.studyMinutes, has: x.has };
        }
        case 'languages': {
          const x = languagesInsights(raw.languages, raw.languageSessions, raw.vocab, raw.grammar, raw.cardReviews, r);
          return { value: x.minutes, has: x.has };
        }
        case 'music': {
          const x = musicInsights(raw.instruments, raw.practice, raw.songs, raw.songChanges, r);
          return { value: x.minutes, has: x.has };
        }
        case 'sports': {
          const x = sportsInsights(raw.sports, raw.sportActivities, r);
          return { value: x.activities, has: x.has };
        }
        case 'finance': {
          const x = financeInsights(raw.finAssets, raw.finTransactions, raw.finQuotes, r);
          return { value: x.transactions, has: x.has };
        }
      }
    };
    const LABEL: Record<InsightMod, string> = {
      focus: t('insights.minutesFocus'),
      tasks: t('insights.tasksDone'),
      habits: t('insights.habitLogs'),
      projects: t('insights.milestonesDone'),
      goals: t('insights.checkins'),
      academy: t('insights.studyMinutes'),
      languages: t('insights.minutesStudy'),
      music: t('insights.practiceMinutes'),
      sports: t('insights.activities'),
      finance: t('park.floorBoards.insights.transactions'),
    };
    return INSIGHT_MODS.filter((m) => !privacy.insightsHidden.includes(m)).map((mod): InsightMetric => {
      // Finanças trancado pelo PIN: nem a conta é feita.
      if (mod === 'finance' && financeLocked) return { mod, label: LABEL[mod], now: 0, before: 0, has: false, locked: true };
      const now = one(mod, week);
      return { mod, label: LABEL[mod], now: now.value, before: one(mod, prev).value, has: now.has };
    });
  }, [raw, privacy, financeLocked, c.today, c.weekStartsOn, c.locale, c.t]);
}

/* ---------- Música ---------- */

function MusicFeed({ onBoards }: FeedProps) {
  const c = useBoardCtx();
  const data = useMusic();
  const fb = useMemo(() => {
    if (data.loading) return null;
    const live = data.instruments.filter((i) => !i.deletedAt);
    const inWeek = (d: DateKey) => d >= c.weekFrom && d <= c.today;
    const playing = (s: { status: string }) => s.status === 'learning' || s.status === 'reviewing';
    const week = live.flatMap((i) => data.practiceOf(i.id).filter((p) => inWeek(p.date)));
    return musicBoards(
      {
        instruments: live.map((i) => ({
          name: i.name,
          color: i.color,
          weekMin: data.practiceOf(i.id).filter((p) => inWeek(p.date)).reduce((a, p) => a + p.durationMin, 0),
          songs: data.songsOf(i.id).filter(playing).map((s) => (s.progress !== null ? `${s.name} · ${s.progress}%` : s.name)),
        })),
        repertoire: live.flatMap((i) => data.songsOf(i.id).filter(playing).map((s) => ({ name: s.name, instrument: i.name, progress: s.progress }))),
        weekMin: week.reduce((a, p) => a + p.durationMin, 0),
        weekSessions: week.length,
      },
      c,
    );
  }, [data, c.today, c.weekFrom, c.locale, c.t]);
  useSend(fb, onBoards);
  return null;
}

/* ---------- Esportes ---------- */

function SportsFeed({ onBoards }: FeedProps) {
  const c = useBoardCtx();
  const data = useSports();
  const fb = useMemo(() => {
    if (data.loading) return null;
    const { t } = c;
    return sportsBoards(
      {
        sports: data.sports.map((s) => {
          const acts = data.activitiesOf(s.id);
          const st = sportStats(acts);
          const last = acts[0];
          return {
            name: s.name,
            color: s.color,
            record: st.record,
            games: st.record.win + st.record.loss + st.record.draw,
            last: last ? { date: last.date, what: last.title || t(`sports.types.${last.type}`) } : null,
          };
        }),
      },
      c,
    );
  }, [data, c.today, c.locale, c.t]);
  useSend(fb, onBoards);
  return null;
}

/* ---------- Finanças (atrás do PIN) ---------- */

function FinanceFeed({ onBoards, locked }: FeedProps & { locked: boolean }) {
  const c = useBoardCtx();
  const data = useFinance();
  const prefs = useLiveQuery(() => loadPlanPrefs(), []);
  const hideValues = useLiveQuery(() => loadHideValues(), []);
  const forced = useQuickPrivacy().hides('finance');
  const cats = useLiveQuery(() => getDb().budgetCategories.toArray(), []);
  const entries = useLiveQuery(() => getDb().budgetEntries.toArray(), []);
  const fb = useMemo(() => {
    // Trancado: nada é lido para o quadro (todos escuros), nem enquanto o resto carrega.
    if (locked) return financeBoards({ locked: true, hidden: true, currency: 'BRL', budgetEnabled: false, months: [], top: [], categories: 0, invest: [], assets: [] }, c);
    if (data.loading || !prefs || hideValues === undefined || !cats || !entries) return null;
    const liveCats = cats.filter((k) => !k.deletedAt);
    const liveEntries = entries.filter((e) => !e.deletedAt);
    const m0 = c.today.slice(0, 7);
    const monthKeys = [0, -1, -2].map((n) => addMonths(`${m0}-01`, n).slice(0, 7));
    const label = (m: string) => capitalizeFirst(new Intl.DateTimeFormat(c.locale, { month: 'long' }).format(new Date(`${m}-15T12:00`)));
    const months = monthKeys.map((m) => {
      const b = budgetMonth(liveCats, liveEntries, m);
      return { label: label(m), income: b.income, expense: b.expense };
    });
    const now = budgetMonth(liveCats, liveEntries, m0);
    const top = now.rows
      .filter((r) => r.category.kind === 'expense')
      .sort((a, b) => b.actual - a.actual)
      .slice(0, 4)
      .map((r) => ({ name: r.category.name, planned: r.planned, actual: r.actual }));
    return financeBoards(
      {
        locked: false,
        hidden: hideValues || forced,
        currency: prefs.currency,
        budgetEnabled: prefs.budgetEnabled,
        months,
        top,
        categories: liveCats.length,
        invest: CURRENCIES.filter((cur) => data.assets.some((a) => a.currency === cur)).map((cur) => {
          const mine = data.assets.filter((a) => a.currency === cur);
          return { currency: cur, invested: mine.reduce((s, a) => s + data.positionOf(a.id).invested, 0), assets: mine.length };
        }),
        assets: data.assets.map((a) => ({ name: a.name, currency: a.currency })),
      },
      c,
    );
  }, [locked, data, prefs, hideValues, forced, cats, entries, c.today, c.locale, c.t]);
  useSend(fb, onBoards);
  return null;
}

/* ---------- Focus ---------- */

function FocusFeed({ onBoards }: FeedProps) {
  const c = useBoardCtx();
  const sessions = useLiveQuery(() => getDb().focusSessions.orderBy('date').reverse().filter((s) => !s.deletedAt).limit(6).toArray(), []);
  const fb = useMemo(() => {
    if (!sessions) return null;
    const { t } = c;
    return focusBoards({ sessions: sessions.map((s) => ({ date: s.date, min: s.actualMin, kind: t(`focus.kinds.${s.kind}`), completed: s.completed })) }, c);
  }, [sessions, c.today, c.locale, c.t]);
  useSend(fb, onBoards);
  return null;
}

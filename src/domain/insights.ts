import { addDays, diffDays, startOfMonth, startOfWeek, toDateKey, type DateKey } from './dates';
import type { Assessment, Content, StudySession, Subject, AcademicYear } from './academy';
import type { FocusKind, FocusSession } from './focus';
import { FOCUS_KINDS } from './focus';
import type { Goal, GoalCheckin } from './goals';
import { consistency, habitPeriods, type Habit, type HabitLog } from './habits';
import type { Language, LanguageSession, VocabEntry, GrammarRule } from './languages';
import type { PracticeSession, Song, Instrument } from './music';
import type { Project } from './projects';
import type { Sport, SportActivity } from './sports';
import type { Task } from './tasks';
import type { FinAsset, FinTransaction, FinQuote, Currency } from './finance';
import { computePosition } from './finance';
import type { CardReview } from './academy';
import type { ChangeEntry } from './entity';

/* ---------- Insights (Parte 19): só dados reais, sem inventar ---------- */

export interface Range {
  from: DateKey;
  to: DateKey;
}

export type PeriodKind = 'week' | 'month' | 'year' | 'custom';

/** O período que contém `anchor` (Parte 19.2). */
export function rangeFor(kind: Exclude<PeriodKind, 'custom'>, anchor: DateKey, weekStartsOn: 0 | 1): Range {
  if (kind === 'week') {
    const from = startOfWeek(anchor, weekStartsOn);
    return { from, to: addDays(from, 6) };
  }
  if (kind === 'month') {
    const from = startOfMonth(anchor);
    const [y, m] = from.split('-').map(Number);
    const next = m === 12 ? `${y! + 1}-01-01` : `${y}-${String(m! + 1).padStart(2, '0')}-01`;
    return { from, to: addDays(next, -1) };
  }
  return { from: `${anchor.slice(0, 4)}-01-01`, to: `${anchor.slice(0, 4)}-12-31` };
}

/** O período imediatamente anterior, do mesmo tamanho (para comparar). */
export function previousRange(r: Range): Range {
  const len = diffDays(r.to, r.from) + 1;
  return { from: addDays(r.from, -len), to: addDays(r.from, -1) };
}

export const inRange = (d: DateKey | null | undefined, r: Range) => !!d && d >= r.from && d <= r.to;
/** Data local do instante (no fuso do aparelho), não a data de Greenwich. */
const isoDay = (iso: string | null | undefined) => (iso ? toDateKey(new Date(iso)) : null);

/** Agrupa valores por dia, semana ou mês dentro do período, com zeros onde não houve registro. */
export function series(points: Array<{ date: DateKey; value: number }>, r: Range, weekStartsOn: 0 | 1): Array<{ start: DateKey; value: number }> {
  const days = diffDays(r.to, r.from) + 1;
  const unit: 'day' | 'week' | 'month' = days <= 31 ? 'day' : days <= 120 ? 'week' : 'month';
  const keyOf = (d: DateKey) => (unit === 'day' ? d : unit === 'week' ? startOfWeek(d, weekStartsOn) : startOfMonth(d));
  const buckets = new Map<DateKey, number>();
  for (let d = keyOf(r.from); d <= r.to; d = unit === 'day' ? addDays(d, 1) : unit === 'week' ? addDays(d, 7) : rangeFor('month', addDays(rangeFor('month', d, 0).to, 1), 0).from) buckets.set(d, 0);
  for (const p of points) if (inRange(p.date, r)) buckets.set(keyOf(p.date), (buckets.get(keyOf(p.date)) ?? 0) + p.value);
  return [...buckets.entries()].map(([start, value]) => ({ start, value }));
}

/* ---------- Focus ---------- */

export function focusInsights(sessions: FocusSession[], r: Range) {
  const all = sessions.filter((s) => !s.deletedAt);
  const inR = all.filter((s) => inRange(s.date, r));
  const byKind = Object.fromEntries(FOCUS_KINDS.map((k) => [k, 0])) as Record<FocusKind, number>;
  for (const s of inR) byKind[s.kind] += s.actualMin;
  return { has: all.length > 0, sessions: inR.length, minutes: inR.reduce((a, s) => a + s.actualMin, 0), byKind, points: inR.map((s) => ({ date: s.date, value: s.actualMin })) };
}

/* ---------- Habits ---------- */

export function habitsInsights(habits: Habit[], logs: HabitLog[], r: Range, today: DateKey, weekStartsOn: 0 | 1) {
  const live = habits.filter((h) => !h.deletedAt);
  const liveLogs = logs.filter((l) => !l.deletedAt);
  const end = r.to < today ? r.to : today;
  const rows = live.map((h) => {
    const mine = liveLogs.filter((l) => l.habitId === h.id);
    const map = new Map(mine.map((l) => [l.date, l]));
    const inR = mine.filter((l) => inRange(l.date, r));
    const c = r.from <= end ? consistency(habitPeriods(h, map, r.from, end, today, weekStartsOn)) : { met: 0, total: 0 };
    return { habit: h, logs: inR.length, total: inR.reduce((a, l) => a + l.value, 0), consistency: c };
  });
  return { has: live.length > 0, logs: rows.reduce((a, x) => a + x.logs, 0), rows, points: liveLogs.filter((l) => inRange(l.date, r)).map((l) => ({ date: l.date, value: 1 })) };
}

/* ---------- Tasks, Projects e Goals ---------- */

export function tasksInsights(tasks: Task[], r: Range) {
  const all = tasks.filter((t) => !t.deletedAt);
  const done = all.filter((t) => inRange(isoDay(t.completedAt), r));
  return { has: all.length > 0, completed: done.length, created: all.filter((t) => inRange(isoDay(t.createdAt), r)).length, points: done.map((t) => ({ date: isoDay(t.completedAt)!, value: 1 })) };
}

export function projectsInsights(projects: Project[], r: Range) {
  const all = projects.filter((p) => !p.deletedAt);
  const milestones = all.flatMap((p) => p.milestones.filter((m) => m.done && inRange(isoDay(m.doneAt), r)).map((m) => ({ project: p, title: m.title, date: isoDay(m.doneAt)! })));
  return { has: all.length > 0, milestones: milestones.sort((a, b) => b.date.localeCompare(a.date)), points: milestones.map((m) => ({ date: m.date, value: 1 })) };
}

export function goalsInsights(goals: Goal[], checkins: GoalCheckin[], r: Range) {
  const all = goals.filter((g) => !g.deletedAt);
  const done = all.filter((g) => g.status === 'done' && inRange(isoDay(g.doneAt), r));
  const ck = checkins.filter((c) => !c.deletedAt && inRange(c.date, r));
  const milestones = all.flatMap((g) => g.milestones.filter((m) => m.done && inRange(isoDay(m.doneAt), r)));
  return { has: all.length > 0, done, checkins: ck.length, milestones: milestones.length };
}

/* ---------- Academy ---------- */

/** Nota de cada avaliação na escala da disciplina (score ÷ máximo × escala). Média simples do período, não a nota oficial. */
export function academyInsights(subjects: Subject[], years: AcademicYear[], assessments: Assessment[], contents: Content[], sessions: StudySession[], r: Range) {
  const liveSubjects = subjects.filter((s) => !s.deletedAt);
  const scaleOf = (s: Subject) => (s.model ?? years.find((y) => y.id === s.yearId)?.model)?.scale ?? 10;
  const graded = assessments.filter((a) => !a.deletedAt && a.score !== null && a.maxScore > 0 && inRange(a.date, r));
  const bySubject = liveSubjects
    .map((s) => {
      const mine = graded.filter((a) => a.subjectId === s.id);
      const grades = mine.map((a) => ({ name: a.name, date: a.date!, value: Math.round(((a.score! / a.maxScore) * scaleOf(s)) * 100) / 100 }));
      const cs = contents.filter((c) => !c.deletedAt && c.subjectId === s.id);
      return {
        subject: s,
        scale: scaleOf(s),
        grades,
        average: grades.length ? Math.round((grades.reduce((x, g) => x + g.value, 0) / grades.length) * 100) / 100 : null,
        contents: cs.length,
        withMastery: cs.filter((c) => c.mastery !== null).length,
        masterySum: cs.reduce((x, c) => x + (c.mastery ?? 0), 0),
      };
    })
    .filter((x) => x.grades.length || x.contents);
  const study = sessions.filter((s) => !s.deletedAt && s.status === 'done' && inRange(s.date, r));
  return {
    has: liveSubjects.length > 0,
    assessments: graded.length,
    bySubject,
    studyMinutes: study.reduce((x, s) => x + (s.actualMin ?? s.durationMin), 0),
    studySessions: study.length,
    points: study.map((s) => ({ date: s.date, value: s.actualMin ?? s.durationMin })),
  };
}

/* ---------- Idiomas ---------- */

export function languagesInsights(langs: Language[], sessions: LanguageSession[], vocab: VocabEntry[], grammar: GrammarRule[], reviews: CardReview[], r: Range) {
  const live = langs.filter((l) => !l.deletedAt);
  const inR = sessions.filter((s) => !s.deletedAt && inRange(s.date, r));
  const ids = new Set([...vocab, ...grammar].filter((x) => !x.deletedAt).map((x) => x.id));
  const rev = reviews.filter((x) => ids.has(x.cardId) && inRange(isoDay(x.at), r));
  const rows = live.map((l) => ({
    language: l,
    minutes: inR.filter((s) => s.languageId === l.id).reduce((a, s) => a + s.durationMin, 0),
    sessions: inR.filter((s) => s.languageId === l.id).length,
    newWords: vocab.filter((v) => !v.deletedAt && v.languageId === l.id && inRange(isoDay(v.createdAt), r)).length,
    words: vocab.filter((v) => !v.deletedAt && v.languageId === l.id).length,
  }));
  return { has: live.length > 0, minutes: rows.reduce((a, x) => a + x.minutes, 0), sessions: inR.length, reviews: rev.length, newWords: rows.reduce((a, x) => a + x.newWords, 0), rows, points: inR.map((s) => ({ date: s.date, value: s.durationMin })) };
}

/* ---------- Música ---------- */

export function musicInsights(instruments: Instrument[], practice: PracticeSession[], songs: Song[], changes: ChangeEntry[], r: Range) {
  const live = instruments.filter((i) => !i.deletedAt);
  const inR = practice.filter((p) => !p.deletedAt && inRange(p.date, r));
  const songIds = new Set(songs.map((s) => s.id));
  const masteredInR = changes.filter((c) => c.entityType === 'song' && songIds.has(c.entityId) && c.note === 'status:mastered' && inRange(isoDay(c.at), r)).length;
  const liveSongs = songs.filter((s) => !s.deletedAt);
  return {
    has: live.length > 0,
    minutes: inR.reduce((a, p) => a + p.durationMin, 0),
    sessions: inR.length,
    masteredInPeriod: masteredInR,
    repertoire: { total: liveSongs.length, mastered: liveSongs.filter((s) => s.status === 'mastered').length, learning: liveSongs.filter((s) => s.status === 'learning' || s.status === 'reviewing').length },
    points: inR.map((p) => ({ date: p.date, value: p.durationMin })),
  };
}

/* ---------- Esportes ---------- */

export function sportsInsights(sports: Sport[], acts: SportActivity[], r: Range) {
  const live = sports.filter((s) => !s.deletedAt);
  const inR = acts.filter((a) => !a.deletedAt && inRange(a.date, r));
  const record = { win: 0, loss: 0, draw: 0 };
  for (const a of inR) if (a.outcome) record[a.outcome]++;
  return {
    has: live.length > 0,
    activities: inR.length,
    trainings: inR.filter((a) => a.type === 'training').length,
    games: inR.filter((a) => a.type !== 'training').length,
    activeDays: new Set(inR.map((a) => a.date)).size,
    minutes: inR.reduce((a, x) => a + (x.durationMin ?? 0), 0),
    record,
    points: inR.map((a) => ({ date: a.date, value: 1 })),
  };
}

/* ---------- Finanças ---------- */

/** Patrimônio só com valores informados, por moeda (sem converter câmbio); rendimentos registrados no período. */
export function financeInsights(assets: FinAsset[], txs: FinTransaction[], quotes: FinQuote[], r: Range) {
  const live = assets.filter((a) => !a.deletedAt);
  const liveTx = txs.filter((t) => !t.deletedAt);
  const liveQ = quotes.filter((q) => !q.deletedAt);
  const byCur = new Map<Currency, { invested: number; value: number; quoted: number; held: number; income: number }>();
  for (const a of live) {
    const mine = liveTx.filter((t) => t.assetId === a.id);
    const p = computePosition(mine, liveQ.filter((q) => q.assetId === a.id));
    const row = byCur.get(a.currency) ?? { invested: 0, value: 0, quoted: 0, held: 0, income: 0 };
    row.invested += p.invested;
    if (p.quantity > 0) row.held++;
    if (p.currentValue !== null && p.quantity > 0) {
      row.value += p.currentValue;
      row.quoted++;
    }
    row.income += mine.filter((t) => t.type === 'income' && inRange(t.date, r)).reduce((x, t) => x + t.amount, 0);
    byCur.set(a.currency, row);
  }
  return { has: live.length > 0, byCurrency: [...byCur.entries()].map(([currency, v]) => ({ currency, ...v })), transactions: liveTx.filter((t) => inRange(t.date, r)).length };
}

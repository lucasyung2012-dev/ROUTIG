import { addDays, capitalizeFirst, formatDateKey, toDateKey, type DateKey } from '@/domain/dates';
import { occurrencesInRange, type CalendarEvent } from '@/domain/events';
import { FOCUS_KINDS } from '@/domain/focus';
import { compareGoals, goalProgress, type Goal, type GoalProgress } from '@/domain/goals';
import { logMeets, scheduleAt } from '@/domain/habits';
import {
  academyInsights,
  financeInsights,
  focusInsights,
  goalsInsights,
  habitsInsights,
  inRange,
  languagesInsights,
  musicInsights,
  projectsInsights,
  sportsInsights,
  tasksInsights,
  type Range,
} from '@/domain/insights';
import type { PdfLine } from '@/domain/pdf';
import { completionTimes, isClosedKind, statusKind, type TasksConfig } from '@/domain/tasks';
import { REPORT_SECTIONS, type ReportPeriodKind, type ReportSection } from '@/domain/weeklyReport';
import type { MessageKey } from '@/i18n';

/* ---------- Relatório da semana: o texto, montado só com o que foi registrado ---------- */

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * Os registros que o relatório lê: os mesmos do Insights (useInsightsData), mais os eventos e as
 * configurações de Tarefas. Os tipos vêm das próprias funções do Insights, para nunca divergirem.
 */
export interface ReportData {
  tasks: Parameters<typeof tasksInsights>[0];
  projects: Parameters<typeof projectsInsights>[0];
  goals: Parameters<typeof goalsInsights>[0];
  goalCheckins: Parameters<typeof goalsInsights>[1];
  habits: Parameters<typeof habitsInsights>[0];
  habitLogs: Parameters<typeof habitsInsights>[1];
  focus: Parameters<typeof focusInsights>[0];
  subjects: Parameters<typeof academyInsights>[0];
  years: Parameters<typeof academyInsights>[1];
  assessments: Parameters<typeof academyInsights>[2];
  contents: Parameters<typeof academyInsights>[3];
  studySessions: Parameters<typeof academyInsights>[4];
  languages: Parameters<typeof languagesInsights>[0];
  languageSessions: Parameters<typeof languagesInsights>[1];
  vocab: Parameters<typeof languagesInsights>[2];
  grammar: Parameters<typeof languagesInsights>[3];
  cardReviews: Parameters<typeof languagesInsights>[4];
  instruments: Parameters<typeof musicInsights>[0];
  practice: Parameters<typeof musicInsights>[1];
  songs: Parameters<typeof musicInsights>[2];
  songChanges: Parameters<typeof musicInsights>[3];
  sports: Parameters<typeof sportsInsights>[0];
  sportActivities: Parameters<typeof sportsInsights>[1];
  finAssets: Parameters<typeof financeInsights>[0];
  finTransactions: Parameters<typeof financeInsights>[1];
  finQuotes: Parameters<typeof financeInsights>[2];
  events: CalendarEvent[];
  tasksConfig: TasksConfig;
}

export interface ReportOptions {
  kind: ReportPeriodKind;
  range: Range;
  today: DateKey;
  weekStartsOn: 0 | 1;
  locale: string;
  sections: readonly ReportSection[];
  name: string;
  /** Comentário pessoal (null ou vazio = sem comentário). */
  comment: string | null;
}

export interface ReportBlock {
  id: ReportSection;
  title: string;
  lines: string[];
}

export interface ReportModel {
  title: string;
  period: string;
  /** "Semana em andamento": o período ainda não acabou. */
  partial: string | null;
  blocks: ReportBlock[];
  comment: string | null;
  footer: string;
}

export const BULLET = '• ';
const MAX_ITEMS = 8;

const dayOf = (iso: string | null | undefined): DateKey | null => (iso ? toDateKey(new Date(iso)) : null);

function fmtMin(min: number, t: Translate): string {
  const m = Math.round(min);
  return m >= 60 ? t('weeklyReport.time.hm', { h: Math.floor(m / 60), m: m % 60 }) : t('weeklyReport.time.m', { m });
}

function fmtMoney(value: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
  } catch {
    return `${value.toLocaleString(locale)} ${currency}`;
  }
}

/** Lista com no máximo MAX_ITEMS itens e uma linha "e mais N". */
function bullets(items: string[], t: Translate, max = MAX_ITEMS): string[] {
  const out = items.slice(0, max).map((x) => BULLET + x);
  if (items.length > max) out.push(BULLET + t('weeklyReport.more', { count: items.length - max }));
  return out;
}

function delta(n: number, t: Translate, pct = false): string {
  if (n === 0) return t('weeklyReport.goals.same');
  return t(pct ? 'weeklyReport.goals.deltaPct' : 'weeklyReport.goals.delta', { sign: n > 0 ? '+' : '−', n: Math.abs(n) });
}

/* ---------- Seções ---------- */

function habitsLines(d: ReportData, o: ReportOptions, t: Translate): string[] {
  const ins = habitsInsights(d.habits, d.habitLogs, o.range, o.today, o.weekStartsOn);
  if (!ins.has) return [t('weeklyReport.empty.noModule')];
  const end = o.range.to < o.today ? o.range.to : o.today;
  const upTo = { from: o.range.from, to: end };
  const lines: string[] = [];
  for (const row of ins.rows) {
    const h = row.habit;
    if (h.startDate > end) continue;
    const doneDays = d.habitLogs.filter((l) => !l.deletedAt && l.habitId === h.id && inRange(l.date, upTo) && logMeets(h.method, scheduleAt(h, l.date), l.value)).length;
    if (h.archived && !doneDays) continue;
    const s = scheduleAt(h, end);
    if (!s || s.period === 'day' || s.period === 'interval') {
      const { met, total } = row.consistency;
      lines.push(total ? t('weeklyReport.habits.days', { name: h.name, met, total }) : t('weeklyReport.habits.noneExpected', { name: h.name }));
    } else {
      lines.push(t('weeklyReport.habits.perPeriod', { name: h.name, count: doneDays, times: s.times, per: t(`weeklyReport.per.${s.period}`) }));
    }
  }
  return lines.length ? lines.map((l) => BULLET + l) : [t('weeklyReport.empty.none')];
}

function tasksLines(d: ReportData, o: ReportOptions, t: Translate): string[] {
  const all = d.tasks.filter((x) => !x.deletedAt);
  if (!all.length) return [t('weeklyReport.empty.noModule')];
  const ins = tasksInsights(d.tasks, o.range);
  const done = all.filter((x) => completionTimes(x).some((c) => inRange(dayOf(c), o.range))).map((x) => x.title);
  const open = all.filter((x) => !isClosedKind(statusKind(d.tasksConfig, x.statusId)));
  const overdue = open.filter((x) => !!x.dueDate && x.dueDate < o.today).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  const pending = open.filter((x) => !(x.dueDate && x.dueDate < o.today)).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const due = (date: DateKey | null) => (date ? ` (${t('weeklyReport.tasks.due', { date: formatDateKey(date, o.locale) })})` : '');
  return [
    t('weeklyReport.tasks.done', { count: ins.completed }),
    ...bullets(done, t),
    t('weeklyReport.tasks.overdue', { count: overdue.length }),
    ...bullets(overdue.map((x) => x.title + due(x.dueDate)), t, 5),
    t('weeklyReport.tasks.pending', { count: pending.length }),
    ...bullets(pending.map((x) => x.title + due(x.dueDate)), t, 5),
  ];
}

/** O objetivo como estava num dia: só acompanhamentos e etapas registrados até ali. */
function goalAt(g: Goal, checkins: ReportData['goalCheckins'], day: DateKey): GoalProgress {
  const milestones = g.milestones.map((m) => ({ ...m, done: m.done && (!m.doneAt || (dayOf(m.doneAt) ?? '') <= day) }));
  return goalProgress({ ...g, milestones }, checkins.filter((c) => c.date <= day));
}

function goalsLines(d: ReportData, o: ReportOptions, t: Translate): string[] {
  const all = d.goals.filter((g) => !g.deletedAt);
  if (!all.length) return [t('weeklyReport.empty.noModule')];
  const before = addDays(o.range.from, -1);
  const end = o.range.to < o.today ? o.range.to : o.today;
  const lines: string[] = [];
  for (const g of [...all].sort(compareGoals)) {
    const mine = d.goalCheckins.filter((c) => !c.deletedAt && c.goalId === g.id);
    const inPeriod = mine.filter((c) => inRange(c.date, o.range)).length;
    const doneDay = g.status === 'done' ? dayOf(g.doneAt) : null;
    const doneHere = !!doneDay && inRange(doneDay, o.range);
    const tracked = g.status === 'active' || g.status === 'planned' || g.status === 'paused';
    if (!tracked && !doneHere && !inPeriod) continue;
    const now = goalAt(g, mine, end);
    const was = goalAt(g, mine, before);
    let line: string;
    if (now.kind === 'percent') line = t('weeklyReport.goals.percent', { name: g.name, pct: now.percent, change: delta(now.percent - (was.kind === 'percent' ? was.percent : 0), t, true) });
    else if (now.kind === 'stages')
      line = now.total ? t('weeklyReport.goals.stages', { name: g.name, done: now.done, total: now.total, change: delta(now.done - (was.kind === 'stages' ? was.done : 0), t) }) : t('weeklyReport.goals.noStages', { name: g.name });
    else if (now.kind === 'level')
      line =
        now.current === null
          ? t('weeklyReport.goals.levelNone', { name: g.name })
          : t('weeklyReport.goals.level', { name: g.name, level: now.current, max: now.max, change: was.kind === 'level' && was.current !== null ? delta(now.current - was.current, t) : t('weeklyReport.goals.firstLevel') });
    else line = t('weeklyReport.goals.qualitative', { name: g.name });
    const extra: string[] = [];
    if (doneHere && doneDay) extra.push(t('weeklyReport.goals.doneOn', { date: formatDateKey(doneDay, o.locale) }));
    else if (g.status === 'paused') extra.push(t('weeklyReport.goals.paused'));
    if (inPeriod) extra.push(t('weeklyReport.goals.checkins', { count: inPeriod }));
    lines.push(BULLET + [line, ...extra].join(' · '));
  }
  return lines.length ? lines : [t('weeklyReport.empty.none')];
}

function focusLines(d: ReportData, o: ReportOptions, t: Translate): string[] {
  const ins = focusInsights(d.focus, o.range);
  if (!ins.has) return [t('weeklyReport.empty.noModule')];
  if (!ins.sessions) return [t('weeklyReport.empty.none')];
  return [
    t('weeklyReport.focus.total', { time: fmtMin(ins.minutes, t), count: ins.sessions }),
    ...FOCUS_KINDS.filter((k) => ins.byKind[k] > 0).map((k) => `${BULLET}${t(`focus.kinds.${k}`)}: ${fmtMin(ins.byKind[k], t)}`),
  ];
}

function academyLines(d: ReportData, o: ReportOptions, t: Translate): string[] {
  const ins = academyInsights(d.subjects, d.years, d.assessments, d.contents, d.studySessions, o.range);
  if (!ins.has) return [t('weeklyReport.empty.noModule')];
  const lines: string[] = [];
  if (ins.studySessions) lines.push(t('weeklyReport.academy.study', { count: ins.studySessions, time: fmtMin(ins.studyMinutes, t) }));
  const grades = ins.bySubject.flatMap((s) => s.grades.map((g) => t('weeklyReport.academy.grade', { subject: s.subject.name, name: g.name, value: g.value.toLocaleString(o.locale), scale: s.scale })));
  if (grades.length) lines.push(t('weeklyReport.academy.grades', { count: grades.length }), ...bullets(grades, t, 12));
  return lines.length ? lines : [t('weeklyReport.empty.none')];
}

function sportsLines(d: ReportData, o: ReportOptions, t: Translate): string[] {
  const ins = sportsInsights(d.sports, d.sportActivities, o.range);
  if (!ins.has) return [t('weeklyReport.empty.noModule')];
  if (!ins.activities) return [t('weeklyReport.empty.none')];
  const lines = [t('weeklyReport.sports.total', { count: ins.activities, days: ins.activeDays })];
  if (ins.minutes) lines.push(t('weeklyReport.sports.time', { time: fmtMin(ins.minutes, t) }));
  if (ins.games) lines.push(t('weeklyReport.sports.games', { count: ins.games, win: ins.record.win, loss: ins.record.loss, draw: ins.record.draw }));
  const live = d.sports.filter((s) => !s.deletedAt);
  const per = live
    .map((s) => ({ name: s.name, n: d.sportActivities.filter((a) => !a.deletedAt && a.sportId === s.id && inRange(a.date, o.range)).length }))
    .filter((x) => x.n > 0)
    .map((x) => t('weeklyReport.sports.per', { name: x.name, count: x.n }));
  return [...lines, ...bullets(per, t)];
}

function musicLines(d: ReportData, o: ReportOptions, t: Translate): string[] {
  const ins = musicInsights(d.instruments, d.practice, d.songs, d.songChanges, o.range);
  if (!ins.has) return [t('weeklyReport.empty.noModule')];
  if (!ins.sessions && !ins.masteredInPeriod) return [t('weeklyReport.empty.none')];
  const lines: string[] = [];
  if (ins.sessions) lines.push(t('weeklyReport.music.practice', { count: ins.sessions, time: fmtMin(ins.minutes, t) }));
  if (ins.masteredInPeriod) lines.push(t('weeklyReport.music.mastered', { count: ins.masteredInPeriod }));
  return lines;
}

function languagesLines(d: ReportData, o: ReportOptions, t: Translate): string[] {
  const ins = languagesInsights(d.languages, d.languageSessions, d.vocab, d.grammar, d.cardReviews, o.range);
  if (!ins.has) return [t('weeklyReport.empty.noModule')];
  if (!ins.sessions && !ins.newWords && !ins.reviews) return [t('weeklyReport.empty.none')];
  const rows = ins.rows.filter((r) => r.sessions || r.newWords).map((r) => t('weeklyReport.languages.row', { name: r.language.name, time: fmtMin(r.minutes, t), count: r.sessions, words: r.newWords }));
  const lines = [...bullets(rows, t)];
  if (ins.reviews) lines.push(t('weeklyReport.languages.reviews', { count: ins.reviews }));
  return lines;
}

function projectsLines(d: ReportData, o: ReportOptions, t: Translate): string[] {
  const ins = projectsInsights(d.projects, o.range);
  if (!ins.has) return [t('weeklyReport.empty.noModule')];
  if (!ins.milestones.length) return [t('weeklyReport.empty.none')];
  return [t('weeklyReport.projects.milestones', { count: ins.milestones.length }), ...bullets(ins.milestones.map((m) => `${m.title} (${m.project.name})`), t)];
}

function calendarLines(d: ReportData, o: ReportOptions, t: Translate): string[] {
  const live = d.events.filter((e) => !e.deletedAt);
  if (!live.length) return [t('weeklyReport.empty.noModule')];
  const occ = live.flatMap((e) => occurrencesInRange(e, o.range.from, o.range.to)).sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  if (!occ.length) return [t('weeklyReport.empty.none')];
  const items = occ.map((x) => `${capitalizeFirst(formatDateKey(x.date, o.locale, { weekday: 'short', day: 'numeric', month: 'numeric' }))}${x.startTime ? ` ${x.startTime}` : ''} – ${x.title}`);
  return [t('weeklyReport.calendar.count', { count: occ.length }), ...bullets(items, t, 12)];
}

function financeLines(d: ReportData, o: ReportOptions, t: Translate): string[] {
  const ins = financeInsights(d.finAssets, d.finTransactions, d.finQuotes, o.range);
  if (!ins.has) return [t('weeklyReport.empty.noModule')];
  const lines = [t('weeklyReport.finance.tx', { count: ins.transactions })];
  for (const c of ins.byCurrency) if (c.income) lines.push(BULLET + t('weeklyReport.finance.income', { value: fmtMoney(c.income, c.currency, o.locale) }));
  return lines;
}

const BUILDERS: Record<ReportSection, (d: ReportData, o: ReportOptions, t: Translate) => string[]> = {
  habits: habitsLines,
  tasks: tasksLines,
  goals: goalsLines,
  focus: focusLines,
  academy: academyLines,
  sports: sportsLines,
  music: musicLines,
  languages: languagesLines,
  projects: projectsLines,
  calendar: calendarLines,
  finance: financeLines,
};

/** Título de cada seção (em português de verdade: Hábitos, Tarefas, Objetivos…). */
export function sectionTitle(s: ReportSection, t: Translate): string {
  return t(`weeklyReport.sections.${s}`);
}

/** O texto do período (com as datas exatas). */
export function periodLabel(kind: ReportPeriodKind, r: Range, locale: string): string {
  if (kind === 'week') {
    const from = formatDateKey(r.from, locale, { weekday: 'short', day: 'numeric', month: 'short' });
    const to = formatDateKey(r.to, locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    return capitalizeFirst(`${from} – ${to}`);
  }
  if (kind === 'month') return capitalizeFirst(new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(`${r.from}T12:00`)));
  return r.from.slice(0, 4);
}

/** Monta o relatório inteiro, só com as seções escolhidas, na ordem fixa. */
export function buildReport(d: ReportData, o: ReportOptions, t: Translate): ReportModel {
  const name = o.name.trim();
  const blocks = REPORT_SECTIONS.filter((s) => o.sections.includes(s)).map((s) => ({ id: s, title: sectionTitle(s, t), lines: BUILDERS[s](d, o, t) }));
  const comment = o.comment?.trim() ? o.comment.trim() : null;
  return {
    title: name ? t(`weeklyReport.out.titleNamed.${o.kind}`, { name }) : t(`weeklyReport.out.title.${o.kind}`),
    period: periodLabel(o.kind, o.range, o.locale),
    partial: o.range.to > o.today ? t('weeklyReport.out.partial', { date: formatDateKey(o.today, o.locale) }) : null,
    blocks,
    comment,
    footer: t('weeklyReport.out.footer', { date: formatDateKey(o.today, o.locale, { day: 'numeric', month: 'long', year: 'numeric' }) }),
  };
}

/** Texto para o WhatsApp: *negrito* nos títulos e _itálico_ no período. */
export function reportToText(m: ReportModel, t: Translate): string {
  const parts = [`*${m.title}*`, `_${m.period}_${m.partial ? ` (${m.partial})` : ''}`];
  for (const b of m.blocks) parts.push('', `*${b.title}*`, ...b.lines);
  if (m.comment) parts.push('', `*${t('weeklyReport.out.comment')}*`, m.comment);
  parts.push('', `_${m.footer}_`);
  return parts.join('\n');
}

/** As linhas do PDF (título, período, seções, comentário, rodapé). */
export function reportToPdfLines(m: ReportModel, t: Translate): PdfLine[] {
  const lines: PdfLine[] = [
    { text: m.title, bold: true, size: 18 },
    { text: m.partial ? `${m.period} (${m.partial})` : m.period, size: 11, gapBefore: 2 },
  ];
  for (const b of m.blocks) {
    lines.push({ text: b.title, bold: true, size: 13, gapBefore: 12 });
    for (const l of b.lines) lines.push({ text: l, size: 11 });
  }
  if (m.comment) {
    lines.push({ text: t('weeklyReport.out.comment'), bold: true, size: 13, gapBefore: 12 });
    lines.push({ text: m.comment, size: 11 });
  }
  lines.push({ text: m.footer, size: 9, gapBefore: 18 });
  return lines;
}

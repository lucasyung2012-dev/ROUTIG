import { addDays, addMonths, weekday, type DateKey } from './dates';
import { rangeFor, type Range } from './insights';

/* ---------- Relatório da semana: período, escolhas guardadas ---------- */

/** Seções do relatório. As três primeiras são as principais; as outras, opcionais. */
export const REPORT_SECTIONS = ['habits', 'tasks', 'goals', 'focus', 'academy', 'sports', 'music', 'languages', 'projects', 'calendar', 'finance'] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number];
export const CORE_SECTIONS: readonly ReportSection[] = ['habits', 'tasks', 'goals'];
export const OPTIONAL_SECTIONS: readonly ReportSection[] = REPORT_SECTIONS.filter((s) => !CORE_SECTIONS.includes(s));

export type ReportPeriodKind = 'week' | 'month' | 'year';

/** Sexta-feira (0 = domingo). */
export const REPORT_WEEKDAY = 5;

/**
 * A semana do relatório: de sábado 00:00 a sexta 23:59 (7 dias, cada dia em uma semana só).
 * `offset` 0 é a semana que termina na sexta mais recente (hoje, se hoje é sexta);
 * -1 é a anterior, +1 a seguinte (a que ainda está em andamento, se hoje não é sexta).
 */
export function reportWeek(today: DateKey, offset = 0): Range {
  const sinceFriday = (weekday(today) - REPORT_WEEKDAY + 7) % 7;
  const to = addDays(today, -sinceFriday + 7 * offset);
  return { from: addDays(to, -6), to };
}

/** O período do relatório: semana (sábado → sexta), mês ou ano do calendário, deslocado por `offset`. */
export function reportRange(kind: ReportPeriodKind, today: DateKey, offset = 0): Range {
  if (kind === 'week') return reportWeek(today, offset);
  if (kind === 'month') return rangeFor('month', addMonths(`${today.slice(0, 7)}-01`, offset), 1);
  return rangeFor('year', `${Number(today.slice(0, 4)) + offset}-06-15`, 1);
}

/** Dá para avançar? Só até o período que contém hoje (o futuro ainda não tem registro). */
export function canGoNext(kind: ReportPeriodKind, today: DateKey, offset: number): boolean {
  return reportRange(kind, today, offset + 1).from <= today;
}

/** As escolhas do relatório, reaproveitadas na próxima sexta. Ficam no `kv` e sincronizam como as outras configurações. */
export interface ReportPrefs {
  sections: ReportSection[];
  /** Texto do comentário pessoal: fica como ponto de partida para a próxima semana. */
  comment: string;
  includeComment: boolean;
  /** Última sexta (fim da semana) em que o relatório foi enviado: o lembrete da noite não repete. */
  lastSentFor: DateKey | null;
}

export const DEFAULT_REPORT_PREFS: ReportPrefs = {
  sections: ['habits', 'tasks', 'goals', 'focus', 'academy'],
  comment: '',
  includeComment: true,
  lastSentFor: null,
};

export const COMMENT_MAX = 2000;

export function migrateReportPrefs(raw: unknown): ReportPrefs {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const sections = Array.isArray(r.sections)
    ? [...new Set(r.sections.filter((s): s is ReportSection => typeof s === 'string' && (REPORT_SECTIONS as readonly string[]).includes(s)))]
    : [...DEFAULT_REPORT_PREFS.sections];
  return {
    // Sempre na ordem do relatório, seja qual for a ordem em que foram marcadas.
    sections: REPORT_SECTIONS.filter((s) => sections.includes(s)),
    comment: typeof r.comment === 'string' ? r.comment.slice(0, COMMENT_MAX) : '',
    includeComment: typeof r.includeComment === 'boolean' ? r.includeComment : DEFAULT_REPORT_PREFS.includeComment,
    lastSentFor: typeof r.lastSentFor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.lastSentFor) ? r.lastSentFor : null,
  };
}

/** Hoje é dia de mandar o relatório e ele ainda não foi enviado? (para os lembretes de sexta) */
export function reportDueToday(today: DateKey, prefs: Pick<ReportPrefs, 'lastSentFor'>): boolean {
  return weekday(today) === REPORT_WEEKDAY && prefs.lastSentFor !== today;
}

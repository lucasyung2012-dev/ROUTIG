import { toDateKey, type DateKey } from '@/domain/dates';
import type { FocusKind, FocusSession } from '@/domain/focus';
import type { Language, LanguageActivity, LanguageSession } from '@/domain/languages';
import type { ActivityType, Outcome, Sport, SportActivity } from '@/domain/sports';
import type { CalendarItem } from './useCalendarData';

/* Itens de Esportes, Idiomas e Focus no Calendar: lidos do próprio registro, nunca copiados. */

const DAY_MIN = 24 * 60;
const inRange = (d: DateKey, from: DateKey, to: DateKey) => d >= from && d <= to;

export interface SportLabels {
  type: (t: ActivityType) => string;
  outcome: (o: Outcome) => string;
}

/** Atividades esportivas (treino, partida, torneio, evento) no dia delas, com o resultado quando houver. Sem horário: dia inteiro. */
export function sportCalendarItems(sports: Sport[], activities: SportActivity[], from: DateKey, to: DateKey, labels: SportLabels): CalendarItem[] {
  const byId = new Map(sports.filter((s) => !s.deletedAt).map((s) => [s.id, s]));
  const out: CalendarItem[] = [];
  for (const a of activities) {
    const s = byId.get(a.sportId);
    if (!s || a.deletedAt || !inRange(a.date, from, to)) continue;
    let title = `${s.name}: ${labels.type(a.type).toLocaleLowerCase()}`;
    if (a.title.trim()) title += ` · ${a.title.trim()}`;
    if (a.outcome) title += ` · ${labels.outcome(a.outcome)}${a.score.trim() ? ` ${a.score.trim()}` : ''}`;
    else if (a.score.trim()) title += ` · ${a.score.trim()}`;
    out.push({
      key: `sp:${a.id}`,
      kind: 'sport',
      date: a.date,
      endDate: a.date,
      allDay: true,
      start: null,
      end: null,
      title,
      location: a.location,
      tone: 'teal',
      color: s.color,
      categoryId: null,
      done: false,
      sportId: s.id,
      conflictWith: [],
    });
  }
  return out;
}

/** Sessões de prática de idioma no dia delas, com a atividade e os minutos. Sem horário: dia inteiro. */
export function languageCalendarItems(languages: Language[], sessions: LanguageSession[], from: DateKey, to: DateKey, activityLabel: (a: LanguageActivity) => string): CalendarItem[] {
  const byId = new Map(languages.filter((l) => !l.deletedAt).map((l) => [l.id, l]));
  const out: CalendarItem[] = [];
  for (const ss of sessions) {
    const l = byId.get(ss.languageId);
    if (!l || ss.deletedAt || !inRange(ss.date, from, to)) continue;
    out.push({
      key: `ls:${ss.id}`,
      kind: 'language',
      date: ss.date,
      endDate: ss.date,
      allDay: true,
      start: null,
      end: null,
      title: `${l.name}: ${activityLabel(ss.activity)} · ${ss.durationMin} min`,
      location: '',
      tone: 'teal',
      color: l.color,
      categoryId: null,
      done: false,
      languageId: l.id,
      conflictWith: [],
    });
  }
  return out;
}

/** Minutos desde 0h no horário local, ou null se o instante for inválido ou cair em outro dia. */
function localMinutes(iso: string, date: DateKey): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || toDateKey(d) !== date) return null;
  return d.getHours() * 60 + d.getMinutes();
}

/** Sessões de foco registradas, no horário em que começaram, com os minutos de foco. */
export function focusCalendarItems(sessions: FocusSession[], from: DateKey, to: DateKey, title: (kind: FocusKind, min: number) => string): CalendarItem[] {
  const out: CalendarItem[] = [];
  for (const s of sessions) {
    if (s.deletedAt || s.actualMin <= 0 || !inRange(s.date, from, to)) continue;
    const start = localMinutes(s.startedAt, s.date);
    let end: number | null = null;
    if (start !== null) {
      const span = Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60_000);
      const length = Number.isFinite(span) && span > 0 ? span : s.actualMin + s.breakMin;
      end = Math.min(start + Math.max(length, 1), DAY_MIN);
    }
    out.push({
      key: `f:${s.id}`,
      kind: 'focus',
      date: s.date,
      endDate: s.date,
      allDay: start === null,
      start,
      end,
      title: title(s.kind, s.actualMin),
      location: '',
      tone: 'violet',
      categoryId: null,
      done: false,
      conflictWith: [],
    });
  }
  return out;
}

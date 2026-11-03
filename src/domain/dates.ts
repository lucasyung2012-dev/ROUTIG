/**
 * Datas de calendário sem fuso: "AAAA-MM-DD" no horário local do aparelho.
 * Prazos de tarefas, provas e eventos de dia inteiro usam este formato.
 */
export type DateKey = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(now = new Date()): DateKey {
  return toDateKey(now);
}

export function parseDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

export function isDateKey(value: unknown): value is DateKey {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toDateKey(parseDateKey(value)) === value;
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Soma meses mantendo o dia; se o mês não tem esse dia, usa o último (31/01 + 1 mês = 28 ou 29/02). */
export function addMonths(key: DateKey, months: number, anchorDay?: number): DateKey {
  const d = parseDateKey(key);
  const day = anchorDay ?? d.getDate();
  const total = d.getFullYear() * 12 + d.getMonth() + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  return toDateKey(new Date(year, month, Math.min(day, daysInMonth(year, month)), 12));
}

export function addYears(key: DateKey, years: number, anchor?: { month: number; day: number }): DateKey {
  const d = parseDateKey(key);
  const month = anchor?.month ?? d.getMonth();
  const day = anchor?.day ?? d.getDate();
  const year = d.getFullYear() + years;
  return toDateKey(new Date(year, month, Math.min(day, daysInMonth(year, month)), 12));
}

/** 0 = domingo … 6 = sábado. */
export function weekday(key: DateKey): number {
  return parseDateKey(key).getDay();
}

export function diffDays(a: DateKey, b: DateKey): number {
  return Math.round((parseDateKey(a).getTime() - parseDateKey(b).getTime()) / 86_400_000);
}

export function startOfWeek(key: DateKey, weekStartsOn: 0 | 1): DateKey {
  const offset = (weekday(key) - weekStartsOn + 7) % 7;
  return addDays(key, -offset);
}

export function startOfMonth(key: DateKey): DateKey {
  return `${key.slice(0, 7)}-01`;
}

/** As 6 semanas (42 dias) que cobrem o mês na grade de calendário. */
export function monthGrid(key: DateKey, weekStartsOn: 0 | 1): DateKey[] {
  const first = startOfWeek(startOfMonth(key), weekStartsOn);
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export function isBetween(key: DateKey, from: DateKey, to: DateKey): boolean {
  return key >= from && key <= to;
}

export function formatDateKey(key: DateKey, locale: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  return new Intl.DateTimeFormat(locale, opts).format(parseDateKey(key));
}

export function isTimeKey(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

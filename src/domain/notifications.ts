import { z } from 'zod';
import { addDays, diffDays, toDateKey, type DateKey } from './dates';

/* ---------- Notificações (Parte 23) ---------- */

/** Categorias (Parte 23.1). Compromissos são os eventos do Calendar; metas são os objetivos do Goals. */
export const NOTIF_CATEGORIES = ['tasks', 'assessments', 'events', 'habits', 'goals', 'focus', 'backup', 'storage'] as const;
export type NotifCategory = (typeof NOTIF_CATEGORIES)[number];

const time = z.string().regex(/^\d{2}:\d{2}$/);

/** Configuração (Parte 23.2): tipo, horário, antecedência, módulo, frequência, silêncio e concentração. */
export const notifConfigSchema = z.object({
  enabled: z.record(z.enum(NOTIF_CATEGORIES), z.boolean()),
  /** Horário do resumo do dia (tarefas de hoje, provas e prazos chegando, backup). */
  dailyTime: time,
  /** Horário do lembrete dos hábitos que faltam hoje. */
  habitTime: time,
  /** Avisar provas com quantos dias de antecedência. */
  assessmentDays: z.number().int().min(0).max(30),
  /** Avisar prazos de objetivos com quantos dias de antecedência. */
  goalDays: z.number().int().min(0).max(60),
  /** Eventos sem lembrete próprio: avisar com esta antecedência em minutos (0 = só os que têm lembrete). */
  eventDefaultMin: z.number().int().min(0).max(1440),
  /** Silêncio diário (ex.: 22:00 às 07:00). */
  quiet: z.object({ on: z.boolean(), from: time, to: time }),
  /** Silenciar tudo até este instante (ISO). */
  muteUntil: z.string().nullable(),
  /** Não avisar com uma sessão do Focus em andamento (Parte 23.2: períodos de concentração). */
  pauseDuringFocus: z.boolean(),
  /** Avisos do aparelho sem o conteúdo (Parte 23.3). */
  hideContent: z.boolean(),
  /** Usar os avisos do aparelho (além da central dentro do app). */
  system: z.boolean(),
});
export type NotifConfig = z.infer<typeof notifConfigSchema>;

export const DEFAULT_NOTIF_CONFIG: NotifConfig = {
  enabled: { tasks: true, assessments: true, events: true, habits: true, goals: true, focus: true, backup: true, storage: true },
  dailyTime: '07:30',
  habitTime: '19:00',
  assessmentDays: 3,
  goalDays: 7,
  eventDefaultMin: 0,
  quiet: { on: true, from: '22:00', to: '07:00' },
  muteUntil: null,
  pauseDuringFocus: true,
  hideContent: false,
  system: false,
};

export function migrateNotifConfig(raw: unknown): NotifConfig {
  const r = raw && typeof raw === 'object' ? (raw as Partial<NotifConfig>) : {};
  const merged = { ...DEFAULT_NOTIF_CONFIG, ...r, enabled: { ...DEFAULT_NOTIF_CONFIG.enabled, ...(r.enabled ?? {}) }, quiet: { ...DEFAULT_NOTIF_CONFIG.quiet, ...(r.quiet ?? {}) } };
  const p = notifConfigSchema.safeParse(merged);
  return p.success ? p.data : { ...DEFAULT_NOTIF_CONFIG };
}

/** Um aviso: quando passa a valer, o que diz e para onde leva. */
export interface Alert {
  /** Chave estável: o mesmo aviso não aparece duas vezes. */
  key: string;
  category: NotifCategory;
  /** Chave de tradução e variáveis do título e do texto. */
  title: { key: string; vars?: Record<string, string | number> };
  body: { key: string; vars?: Record<string, string | number> };
  /** A partir de quando o aviso vale (ISO local). */
  at: string;
  path: string;
}

const atTime = (date: DateKey, hhmm: string) => `${date}T${hhmm}:00`;
const minus = (date: DateKey, hhmm: string, min: number) => {
  const d = new Date(`${date}T${hhmm}:00`);
  d.setMinutes(d.getMinutes() - min);
  return localIso(d);
};
export function localIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${toDateKey(d)}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

export interface AlertInput {
  today: DateKey;
  /** Tarefas em aberto (o chamador já tirou as concluídas e as da lixeira). */
  openTasks: Array<{ id: string; title: string; dueDate: DateKey | null; dueTime: string | null }>;
  /** Provas e trabalhos sem nota, com data. */
  assessments: Array<{ id: string; name: string; subject: string; date: DateKey; time: string | null }>;
  /** Ocorrências de eventos de ontem a amanhã, com horário e lembretes (minutos antes). */
  events: Array<{ id: string; title: string; date: DateKey; startTime: string | null; reminders: number[] }>;
  /** Hábitos esperados hoje e ainda sem registro. */
  habitsDue: Array<{ id: string; name: string }>;
  /** Objetivos em aberto com prazo. */
  goals: Array<{ id: string; name: string; deadline: DateKey }>;
  backupStale: boolean;
  /** Fração usada do armazenamento do aparelho (0 a 1), quando o aparelho informa. */
  storageUse: number | null;
}

/**
 * Todos os avisos que valem até `nowIso` (e os próximos de hoje), a partir dos dados reais.
 * Nada é guardado aqui: a central decide o que já foi visto.
 */
export function computeAlerts(input: AlertInput, cfg: NotifConfig): Alert[] {
  const { today } = input;
  const out: Alert[] = [];
  const on = (c: NotifCategory) => cfg.enabled[c];
  if (on('tasks')) {
    const overdue = input.openTasks.filter((t) => t.dueDate && t.dueDate < today);
    if (overdue.length) out.push({ key: `tasks-overdue:${today}`, category: 'tasks', title: { key: 'notif.a.overdueTitle' }, body: { key: 'notif.a.overdueBody', vars: { count: overdue.length } }, at: atTime(today, cfg.dailyTime), path: '/tasks' });
    for (const t of input.openTasks.filter((x) => x.dueDate === today))
      out.push({ key: `task:${t.id}:${today}`, category: 'tasks', title: { key: 'notif.a.taskTitle' }, body: { key: t.dueTime ? 'notif.a.taskAt' : 'notif.a.taskToday', vars: { title: t.title, time: t.dueTime ?? '' } }, at: t.dueTime ? minus(today, t.dueTime, 15) : atTime(today, cfg.dailyTime), path: '/tasks' });
  }
  if (on('assessments'))
    for (const a of input.assessments) {
      const days = diffDays(a.date, today);
      if (days < 0 || days > cfg.assessmentDays) continue;
      out.push({ key: `assessment:${a.id}:${today}`, category: 'assessments', title: { key: 'notif.a.assessmentTitle' }, body: { key: days === 0 ? 'notif.a.assessmentToday' : 'notif.a.assessmentIn', vars: { name: a.name, subject: a.subject, count: days } }, at: atTime(today, cfg.dailyTime), path: `/academy/assessments/${a.id}` });
    }
  if (on('events'))
    for (const e of input.events) {
      if (!e.startTime) continue;
      const leads = e.reminders.length ? e.reminders : cfg.eventDefaultMin > 0 ? [cfg.eventDefaultMin] : [];
      for (const m of leads) out.push({ key: `event:${e.id}:${e.date}:${m}`, category: 'events', title: { key: 'notif.a.eventTitle' }, body: { key: 'notif.a.eventBody', vars: { title: e.title, time: e.startTime, count: m } }, at: minus(e.date, e.startTime, m), path: '/calendar' });
    }
  if (on('habits') && input.habitsDue.length)
    out.push({ key: `habits:${today}`, category: 'habits', title: { key: 'notif.a.habitsTitle' }, body: { key: 'notif.a.habitsBody', vars: { count: input.habitsDue.length, names: input.habitsDue.slice(0, 3).map((h) => h.name).join(', ') } }, at: atTime(today, cfg.habitTime), path: '/habits' });
  if (on('goals'))
    for (const g of input.goals) {
      const days = diffDays(g.deadline, today);
      if (days < 0 || days > cfg.goalDays) continue;
      out.push({ key: `goal:${g.id}:${today}`, category: 'goals', title: { key: 'notif.a.goalTitle' }, body: { key: days === 0 ? 'notif.a.goalToday' : 'notif.a.goalIn', vars: { name: g.name, count: days } }, at: atTime(today, cfg.dailyTime), path: `/goals/${g.id}` });
    }
  if (on('backup') && input.backupStale) out.push({ key: `backup:${today}`, category: 'backup', title: { key: 'notif.a.backupTitle' }, body: { key: 'notif.a.backupBody' }, at: atTime(today, cfg.dailyTime), path: '/settings/backup' });
  if (on('storage') && input.storageUse !== null && input.storageUse >= 0.8)
    out.push({ key: `storage:${today}`, category: 'storage', title: { key: 'notif.a.storageTitle' }, body: { key: 'notif.a.storageBody', vars: { pct: Math.round(input.storageUse * 100) } }, at: atTime(today, cfg.dailyTime), path: '/library' });
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** Está no silêncio diário? O período pode virar a noite (22:00 → 07:00). */
export function inQuietHours(cfg: NotifConfig, now: Date): boolean {
  if (!cfg.quiet.on) return false;
  const p = (n: number) => String(n).padStart(2, '0');
  const hm = `${p(now.getHours())}:${p(now.getMinutes())}`;
  const { from, to } = cfg.quiet;
  return from <= to ? hm >= from && hm < to : hm >= from || hm < to;
}

/** Pode avisar pelo aparelho agora? Silêncio, "silenciar até" e concentração seguram o aviso (ele continua na central). */
export function canDeliver(cfg: NotifConfig, now: Date, focusRunning: boolean): boolean {
  if (!cfg.system) return false;
  if (cfg.muteUntil && new Date(cfg.muteUntil) > now) return false;
  if (inQuietHours(cfg, now)) return false;
  if (cfg.pauseDuringFocus && focusRunning) return false;
  return true;
}

/** Chaves velhas saem do registro de vistos (as chaves terminam com a data). */
export function pruneKeys(keys: Record<string, string>, today: DateKey, keepDays = 14): Record<string, string> {
  const limit = addDays(today, -keepDays);
  return Object.fromEntries(Object.entries(keys).filter(([, d]) => d >= limit));
}

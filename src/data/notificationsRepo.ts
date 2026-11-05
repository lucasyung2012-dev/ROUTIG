import { getDb } from './db';
import { nowIso } from '@/domain/ids';
import { addDays, todayKey, type DateKey } from '@/domain/dates';
import { occurrencesInRange } from '@/domain/events';
import { isClosedKind, statusKind } from '@/domain/tasks';
import { todayStatus } from '@/domain/habits';
import { isOpenGoal } from '@/domain/goals';
import { hasUserData, isBackupStale } from '@/domain/backup';
import { migrateNotifConfig, pruneKeys, type AlertInput, type NotifConfig } from '@/domain/notifications';
import { loadTasksConfig } from './tasksRepo';
import { currentCounts, listExports, loadBackupPrefs } from './backupRepo';

const CONFIG_KEY = 'notifications';
const STATE_KEY = 'notifications.state';

export async function loadNotifConfig(): Promise<NotifConfig> {
  return migrateNotifConfig((await getDb().kv.get(CONFIG_KEY))?.value);
}

export async function saveNotifConfig(cfg: NotifConfig): Promise<void> {
  await getDb().kv.put({ key: CONFIG_KEY, value: migrateNotifConfig(cfg), updatedAt: nowIso() });
}

/** O que já foi visto (dispensado na central) e o que já foi avisado pelo aparelho: cada aviso, uma vez só. */
export interface NotifState {
  dismissed: Record<string, DateKey>;
  delivered: Record<string, DateKey>;
}

export async function loadNotifState(): Promise<NotifState> {
  const v = (await getDb().kv.get(STATE_KEY))?.value as Partial<NotifState> | undefined;
  return { dismissed: v?.dismissed ?? {}, delivered: v?.delivered ?? {} };
}

export async function saveNotifState(s: NotifState): Promise<void> {
  const today = todayKey();
  await getDb().kv.put({ key: STATE_KEY, value: { dismissed: pruneKeys(s.dismissed, today), delivered: pruneKeys(s.delivered, today) }, updatedAt: nowIso() });
}

/** Junta os dados reais de cada módulo para calcular os avisos de hoje. */
export async function gatherAlertInput(weekStartsOn: 0 | 1, now = new Date()): Promise<AlertInput> {
  const db = getDb();
  const today = todayKey(now);
  const [tasks, tasksCfg, events, assessments, subjects, habits, habitLogs, goals, backupPrefs, exports, counts] = await Promise.all([
    db.tasks.filter((t) => !t.deletedAt).toArray(),
    loadTasksConfig(),
    db.events.filter((e) => !e.deletedAt).toArray(),
    db.assessments.filter((a) => !a.deletedAt && a.score === null && !!a.date).toArray(),
    db.subjects.toArray(),
    db.habits.filter((h) => !h.deletedAt && !h.archived).toArray(),
    db.habitLogs.filter((l) => !l.deletedAt && l.date === today).toArray(),
    db.goals.filter((g) => !g.deletedAt).toArray(),
    loadBackupPrefs(),
    listExports(),
    currentCounts(),
  ]);
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
  const logsByHabit = new Map(habitLogs.map((l) => [l.habitId, new Map([[l.date, l]])]));
  let storageUse: number | null = null;
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.quota) storageUse = (est.usage ?? 0) / est.quota;
  } catch {
    storageUse = null;
  }
  return {
    today,
    openTasks: tasks.filter((t) => !isClosedKind(statusKind(tasksCfg, t.statusId))).map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate, dueTime: t.dueTime })),
    assessments: assessments.filter((a) => a.date! >= today && a.date! <= addDays(today, 30)).map((a) => ({ id: a.id, name: a.name, subject: subjectName.get(a.subjectId) ?? '', date: a.date!, time: a.time })),
    events: events.flatMap((e) => occurrencesInRange(e, addDays(today, -1), addDays(today, 1)).map((o) => ({ id: e.id, title: o.title, date: o.date, startTime: o.startTime, reminders: e.reminders }))),
    habitsDue: habits.filter((h) => {
      const st = todayStatus(h, logsByHabit.get(h.id) ?? new Map(), today, weekStartsOn);
      return st.due && !st.loggedToday;
    }),
    goals: goals.filter((g) => isOpenGoal(g) && !!g.deadline).map((g) => ({ id: g.id, name: g.name, deadline: g.deadline! })),
    backupStale: isBackupStale(exports[0]?.at ?? null, backupPrefs, hasUserData(counts), now),
    storageUse,
  };
}

/* ---------- Avisos do aparelho (Parte 23.4) ---------- */

export type DeviceSupport = 'unsupported' | 'default' | 'granted' | 'denied';

/** O que este navegador permite. No iPad e no iPhone, só com o app adicionado à Tela de Início (iOS 16.4 ou mais novo). */
export function deviceSupport(): DeviceSupport {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as DeviceSupport;
}

export async function requestDevicePermission(): Promise<DeviceSupport> {
  if (deviceSupport() === 'unsupported') return 'unsupported';
  try {
    return (await Notification.requestPermission()) as DeviceSupport;
  } catch {
    return deviceSupport();
  }
}

/** Mostra um aviso do aparelho (pelo service worker, quando houver). Devolve se conseguiu. */
export async function showDeviceNotification(title: string, body: string, tag: string): Promise<boolean> {
  if (deviceSupport() !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) await reg.showNotification(title, { body, tag, icon: `${import.meta.env.BASE_URL}brand/routig-logo-original.png` });
    else new Notification(title, { body, tag });
    return true;
  } catch {
    return false;
  }
}

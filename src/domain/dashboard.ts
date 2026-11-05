import { z } from 'zod';
import type { ModuleId } from '@/app/modules';

/* ---------- Cartões ---------- */

export const KPI_METRICS = ['tasksOverdue', 'tasksToday', 'tasksDoneWeek', 'projectsActive', 'eventsWeek', 'inboxOpen', 'notesTotal'] as const;
export type KpiMetric = (typeof KPI_METRICS)[number];

/** Cartões que já mostram dados reais. */
export const LIVE_CARDS = ['today', 'events', 'tasks', 'academy', 'languages', 'habits', 'goals', 'focus', 'music', 'sports', 'finance', 'projects', 'milestones', 'notes', 'inbox', 'activity', 'modules'] as const;
/** Cartões de módulos ainda não construídos: aparecem no catálogo como "em breve", nunca no painel. */
export const PLANNED_CARDS = ['insights'] as const;

export type LiveCard = (typeof LIVE_CARDS)[number];
export type PlannedCard = (typeof PLANNED_CARDS)[number];
/** Id de cartão no painel: um cartão "vivo" ou um indicador (`kpi:metrica`). */
export type CardId = LiveCard | `kpi:${KpiMetric}`;

export type CardSize = 'sm' | 'md' | 'lg';

export interface CardSlot {
  id: CardId;
  size: CardSize;
}

export interface DashboardProfile {
  id: string;
  /** Vazio nos perfis de fábrica: o nome vem da tradução. */
  name: string;
  builtin: boolean;
  cards: CardSlot[];
}

export interface DashboardConfig {
  activeId: string;
  profiles: DashboardProfile[];
}

/** Módulo de onde vêm os dados de cada cartão (ocultar o módulo esconde o cartão). */
export const CARD_MODULE: Record<LiveCard | PlannedCard, ModuleId | null> = {
  today: null,
  events: 'calendar',
  tasks: 'tasks',
  projects: 'projects',
  milestones: 'projects',
  notes: 'notes',
  inbox: 'inbox',
  activity: null,
  modules: null,
  academy: 'academy',
  languages: 'languages',
  habits: 'habits',
  goals: 'goals',
  sports: 'sports',
  music: 'music',
  focus: 'focus',
  finance: 'finance',
  insights: 'insights',
};

export const KPI_MODULE: Record<KpiMetric, ModuleId> = {
  tasksOverdue: 'tasks',
  tasksToday: 'tasks',
  tasksDoneWeek: 'tasks',
  projectsActive: 'projects',
  eventsWeek: 'calendar',
  inboxOpen: 'inbox',
  notesTotal: 'notes',
};

export const DEFAULT_SIZE: Record<LiveCard, CardSize> = {
  today: 'lg',
  events: 'md',
  tasks: 'md',
  academy: 'md',
  languages: 'md',
  habits: 'md',
  goals: 'md',
  focus: 'sm',
  music: 'md',
  sports: 'md',
  finance: 'sm',
  projects: 'md',
  milestones: 'md',
  notes: 'md',
  inbox: 'sm',
  activity: 'md',
  modules: 'lg',
};

export function isKpi(id: CardId): id is `kpi:${KpiMetric}` {
  return id.startsWith('kpi:');
}

export function isValidCardId(id: string): id is CardId {
  if (id.startsWith('kpi:')) return (KPI_METRICS as readonly string[]).includes(id.slice(4));
  return (LIVE_CARDS as readonly string[]).includes(id);
}

const slot = (id: CardId, size?: CardSize): CardSlot => ({ id, size: size ?? (isKpi(id) ? 'sm' : DEFAULT_SIZE[id as LiveCard]) });

/** Perfis de fábrica (Parte 5.2): Completo, Estudos e Projetos. */
export function builtinProfiles(): DashboardProfile[] {
  return [
    {
      id: 'complete',
      name: '',
      builtin: true,
      cards: [
        slot('today'),
        slot('kpi:tasksOverdue'),
        slot('kpi:tasksToday'),
        slot('kpi:inboxOpen'),
        slot('events'),
        slot('tasks'),
        slot('academy'),
        slot('habits'),
        slot('goals'),
        slot('projects'),
        slot('milestones'),
        slot('notes'),
        slot('activity'),
        slot('modules'),
      ],
    },
    {
      id: 'studies',
      name: '',
      builtin: true,
      cards: [slot('today'), slot('kpi:tasksToday'), slot('kpi:tasksDoneWeek'), slot('kpi:eventsWeek'), slot('academy'), slot('languages'), slot('events'), slot('tasks'), slot('notes'), slot('inbox', 'md')],
    },
    {
      id: 'projects',
      name: '',
      builtin: true,
      cards: [slot('kpi:projectsActive'), slot('kpi:tasksOverdue'), slot('kpi:tasksDoneWeek'), slot('projects', 'lg'), slot('milestones'), slot('tasks'), slot('activity', 'lg')],
    },
  ];
}

export function defaultDashboardConfig(): DashboardConfig {
  return { activeId: 'complete', profiles: builtinProfiles() };
}

const slotSchema = z.object({ id: z.string(), size: z.enum(['sm', 'md', 'lg']) });

/** Lê a configuração salva; cartões desconhecidos saem, perfis de fábrica sempre existem. */
export function migrateDashboardConfig(raw: unknown): DashboardConfig {
  const base = defaultDashboardConfig();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<DashboardConfig>;
  const profiles: DashboardProfile[] = [];
  for (const p of Array.isArray(r.profiles) ? r.profiles : []) {
    if (!p || typeof p.id !== 'string') continue;
    const cards = (Array.isArray(p.cards) ? p.cards : [])
      .map((c) => slotSchema.safeParse(c))
      .filter((c) => c.success && isValidCardId(c.data.id))
      .map((c) => (c as { data: CardSlot }).data);
    profiles.push({ id: p.id, name: typeof p.name === 'string' ? p.name.slice(0, 40) : '', builtin: base.profiles.some((b) => b.id === p.id), cards: dedupe(cards) });
  }
  for (const b of base.profiles) if (!profiles.some((p) => p.id === b.id)) profiles.push(b);
  const activeId = typeof r.activeId === 'string' && profiles.some((p) => p.id === r.activeId) ? r.activeId : 'complete';
  return { activeId, profiles };
}

function dedupe(cards: CardSlot[]): CardSlot[] {
  const seen = new Set<string>();
  return cards.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}

/* ---------- Operações de edição (usadas na prévia) ---------- */

export function moveCard(cards: CardSlot[], id: CardId, delta: -1 | 1): CardSlot[] {
  const i = cards.findIndex((c) => c.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= cards.length) return cards;
  const next = [...cards];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

export function cycleSize(size: CardSize): CardSize {
  return size === 'sm' ? 'md' : size === 'md' ? 'lg' : 'sm';
}

export function addCard(cards: CardSlot[], id: CardId): CardSlot[] {
  return cards.some((c) => c.id === id) ? cards : [...cards, slot(id)];
}

export function removeCard(cards: CardSlot[], id: CardId): CardSlot[] {
  return cards.filter((c) => c.id !== id);
}

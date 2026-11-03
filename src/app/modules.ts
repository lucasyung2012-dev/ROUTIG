import {
  CalendarDays,
  ChartLine,
  FolderKanban,
  GraduationCap,
  Guitar,
  Inbox,
  Languages,
  LayoutDashboard,
  Library,
  ListTodo,
  NotebookPen,
  Repeat,
  Settings,
  Target,
  Timer,
  Trophy,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/** Os 16 módulos do menu principal, na ordem da especificação (Parte 4.1). */
export const NAV_MODULE_IDS = [
  'dashboard',
  'calendar',
  'academy',
  'languages',
  'tasks',
  'projects',
  'music',
  'sports',
  'focus',
  'habits',
  'goals',
  'finance',
  'notes',
  'library',
  'insights',
  'inbox',
] as const;

/** Profile e Settings têm acesso próprio, fora do menu principal. */
export const SYSTEM_MODULE_IDS = ['profile', 'settings'] as const;

export type NavModuleId = (typeof NAV_MODULE_IDS)[number];
export type SystemModuleId = (typeof SYSTEM_MODULE_IDS)[number];
export type ModuleId = NavModuleId | SystemModuleId;

export type Tone = 'violet' | 'blue' | 'teal' | 'amber' | 'rose' | 'neutral';

/** Etapa do roadmap (Parte 32) em que o módulo é construído. */
export type Stage = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ModuleDef {
  id: ModuleId;
  icon: LucideIcon;
  tone: Tone;
  stage: Stage;
  /** Caminho da rota. */
  path: string;
  /** Pode ser ocultado pelo usuário. Dashboard, Profile e Settings não. */
  hideable: boolean;
}

export const MODULES: Record<ModuleId, ModuleDef> = {
  dashboard: { id: 'dashboard', icon: LayoutDashboard, tone: 'violet', stage: 1, path: '/', hideable: false },
  calendar: { id: 'calendar', icon: CalendarDays, tone: 'blue', stage: 1, path: '/calendar', hideable: true },
  academy: { id: 'academy', icon: GraduationCap, tone: 'violet', stage: 2, path: '/academy', hideable: true },
  languages: { id: 'languages', icon: Languages, tone: 'teal', stage: 2, path: '/languages', hideable: true },
  tasks: { id: 'tasks', icon: ListTodo, tone: 'violet', stage: 1, path: '/tasks', hideable: true },
  projects: { id: 'projects', icon: FolderKanban, tone: 'amber', stage: 1, path: '/projects', hideable: true },
  music: { id: 'music', icon: Guitar, tone: 'rose', stage: 3, path: '/music', hideable: true },
  sports: { id: 'sports', icon: Trophy, tone: 'teal', stage: 3, path: '/sports', hideable: true },
  focus: { id: 'focus', icon: Timer, tone: 'violet', stage: 3, path: '/focus', hideable: true },
  habits: { id: 'habits', icon: Repeat, tone: 'teal', stage: 3, path: '/habits', hideable: true },
  goals: { id: 'goals', icon: Target, tone: 'amber', stage: 3, path: '/goals', hideable: true },
  finance: { id: 'finance', icon: Wallet, tone: 'blue', stage: 4, path: '/finance', hideable: true },
  notes: { id: 'notes', icon: NotebookPen, tone: 'amber', stage: 1, path: '/notes', hideable: true },
  library: { id: 'library', icon: Library, tone: 'blue', stage: 4, path: '/library', hideable: true },
  insights: { id: 'insights', icon: ChartLine, tone: 'rose', stage: 4, path: '/insights', hideable: true },
  inbox: { id: 'inbox', icon: Inbox, tone: 'neutral', stage: 1, path: '/inbox', hideable: true },
  profile: { id: 'profile', icon: UserRound, tone: 'violet', stage: 1, path: '/profile', hideable: false },
  settings: { id: 'settings', icon: Settings, tone: 'neutral', stage: 1, path: '/settings', hideable: false },
};

export function isNavModuleId(value: string): value is NavModuleId {
  return (NAV_MODULE_IDS as readonly string[]).includes(value);
}

/** Classes de cor por tom (literais, para o Tailwind encontrar). */
export const TONE_CLASSES: Record<Tone, { text: string; soft: string; ring: string; dot: string }> = {
  violet: { text: 'text-violet', soft: 'bg-violet/10', ring: 'ring-violet/30', dot: 'bg-violet' },
  blue: { text: 'text-blue', soft: 'bg-blue/10', ring: 'ring-blue/30', dot: 'bg-blue' },
  teal: { text: 'text-teal', soft: 'bg-teal/10', ring: 'ring-teal/30', dot: 'bg-teal' },
  amber: { text: 'text-amber', soft: 'bg-amber/10', ring: 'ring-amber/30', dot: 'bg-amber' },
  rose: { text: 'text-rose', soft: 'bg-rose/10', ring: 'ring-rose/30', dot: 'bg-rose' },
  neutral: { text: 'text-muted', soft: 'bg-surface-3', ring: 'ring-line', dot: 'bg-subtle' },
};

import { useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as RPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, ChevronsUp, FastForward, Footprints, Hand, Home, LogIn, LogOut, Menu, Navigation, SlidersHorizontal, UserRound, X } from 'lucide-react';
import { MODULES, NAV_MODULE_IDS, type ModuleId } from '@/app/modules';
import { useSettings } from '@/app/SettingsProvider';
import type { MessageKey } from '@/i18n';
import { getDb } from '@/data/db';
import { capitalizeFirst, todayKey } from '@/domain/dates';
import { isClosedKind, statusKind } from '@/domain/tasks';
import { PARK_BUILDINGS, buildingById } from '@/domain/park';
import { useCalendarData } from '@/features/calendar/useCalendarData';
import { greetingKey } from '@/features/dashboard/DashboardPage';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { Select } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { Switch } from '@/ui/Switch';
import { useFocus } from '@/features/focus/FocusProvider';
import { sound } from '@/features/focus/sound';
import { Minimap } from './Minimap';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import type { CamMode, MoveSettings, Posture } from './camera';
import { createEngine, type Engine, type Hint, type InteriorFactory, type Stats } from './engine';
import { festiveOn, seasonOf, type Quality, type Season, type TimeOfDay, type Weather } from './world';
import { createInboxInterior, DESTINATIONS, INBOX_SECTORS, type InboxSector } from './interiors/inbox';
import { createDashboardInterior, createProfileInterior, createSettingsInterior, DASHBOARD_SECTORS, PROFILE_SECTORS, SETTINGS_ROOMS, type DashboardData, type DashboardSector, type ProfileSector, type SettingsRoom } from './interiors/central';
import { InboxPanel } from './panels/InboxPanel';
import { DashboardPanel, ProfilePanel, SettingsPanel } from './panels/CentralPanels';
import { AcademyPanel, InsightsPanel, LanguagesPanel, LibraryPanel, NotesPanel } from './panels/NorthPanels';
import { CalendarPanel, FinancePanel, ProjectsPanel, TasksPanel } from './panels/EastPanels';
import { FocusPanel, GoalsPanel, HabitsPanel, MusicPanel, SportsPanel } from './panels/WestSouthPanels';
import { FOCUS_SECTORS, GOALS_SECTORS, HABITS_SECTORS, MUSIC_SECTORS, SPORTS_SECTORS, createFocusInterior, createGoalsInterior, createHabitsInterior, createMusicInterior, createSportsInterior, type FocusSector, type GoalsSector, type HabitsSector, type MusicSector, type SportsSector } from './interiors/westsouth';
import { useHabits } from '@/features/habits/useHabits';
import { useGoals } from '@/features/goals/useGoals';
import { useMusic } from '@/features/music/useMusic';
import { useSports } from '@/features/sports/useSports';
import { CALENDAR_SECTORS, FINANCE_SECTORS, PROJECTS_SECTORS, TASKS_SECTORS, createCalendarInterior, createFinanceInterior, createProjectsInterior, createTasksInterior, type CalendarSector, type FinanceSector, type ProjectsSector, type TasksSector } from './interiors/east';
import { ACADEMY_SECTORS, INSIGHTS_SECTORS, LANGUAGES_SECTORS, LIBRARY_SECTORS, NOTES_SECTORS, createAcademyInterior, createInsightsInterior, createLanguagesInterior, createLibraryInterior, createNotesInterior, type AcademySector, type InsightsSector, type LanguagesSector, type LibrarySector, type NotesSector } from './interiors/north';
import { useAcademyData } from '@/features/academy/useAcademyData';
import { useLanguages } from '@/features/languages/useLanguages';
import { receptionData } from './receptionData';

/** Preferências do parque neste aparelho (qualidade é do aparelho; o resto é gosto pessoal). */
interface ParkPrefs {
  quality?: Quality;
  labels?: boolean;
  stats?: boolean;
  weather?: Weather;
  season?: Season | 'auto';
  sound?: boolean;
  minimap?: boolean;
  cam?: CamMode;
  move?: MoveSettings;
  stick?: Stick;
  people?: People;
}
type Stick = { size: 's' | 'm' | 'l'; side: 'left' | 'right' };
type People = 'off' | 'few' | 'normal';
const DEFAULT_MOVE: MoveSettings = { sensitivity: 1, speed: 1, invertY: false };
const DEFAULT_STICK: Stick = { size: 'm', side: 'left' };
const CAM_ORDER: CamMode[] = ['walk', 'third', 'orbit'];
const CAM_ICON = { walk: Footprints, third: UserRound, orbit: Camera } as const;
const HOUR_OF: Record<TimeOfDay, number> = { day: 12, dusk: 18.2, night: 21.5 };

/** Quantas pessoas desenhar: iPhone 6–12, iPad 12–24 (V2.1, seção 6), menos no modo econômico. */
function crowdCap(people: People, quality: Quality): number {
  if (people === 'off') return 0;
  const small = Math.min(window.innerWidth, window.innerHeight) < 500;
  const base = small ? 12 : 24;
  const k = (people === 'few' ? 0.5 : 1) * (quality === 'low' ? 0.5 : 1);
  return Math.max(small ? 6 : 12, Math.round(base * k));
}
const PREFS_KEY = 'routig.park.prefs';
function readPrefs(): ParkPrefs {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as ParkPrefs;
  } catch {
    return {};
  }
}
function writePrefs(p: ParkPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

function autoQuality(): Quality {
  return window.matchMedia?.('(pointer: coarse)').matches ? 'medium' : 'high';
}

function timeNow(): TimeOfDay {
  const h = new Date().getHours();
  return h >= 6 && h < 17 ? 'day' : h >= 17 && h < 19 ? 'dusk' : 'night';
}

/** Setores de cada prédio com interior (os demais chegam nos próximos blocos). */
const SECTORS: Partial<Record<ModuleId, readonly string[]>> = {
  inbox: INBOX_SECTORS,
  dashboard: DASHBOARD_SECTORS,
  profile: PROFILE_SECTORS,
  settings: SETTINGS_ROOMS,
  library: LIBRARY_SECTORS,
  notes: NOTES_SECTORS,
  academy: ACADEMY_SECTORS,
  languages: LANGUAGES_SECTORS,
  insights: INSIGHTS_SECTORS,
  calendar: CALENDAR_SECTORS,
  tasks: TASKS_SECTORS,
  projects: PROJECTS_SECTORS,
  finance: FINANCE_SECTORS,
  focus: FOCUS_SECTORS,
  habits: HABITS_SECTORS,
  goals: GOALS_SECTORS,
  music: MUSIC_SECTORS,
  sports: SPORTS_SECTORS,
};
/** Setores cujo painel é uma tela grande (o módulo inteiro dentro do ambiente). */
const WIDE = new Set(['dashboard:overview', 'dashboard:panels', 'profile:interests', 'profile:trajectory', 'profile:personalize', 'settings:identity', 'settings:appearance', 'settings:modules', 'settings:privacy', 'settings:data', 'settings:help', 'library:atrium', 'library:collections', 'library:consult', 'library:search', 'library:preserve', 'library:transfer', 'academy:hall', 'academy:review', 'academy:plan', 'languages:garden', ...INSIGHTS_SECTORS.map((s) => `insights:${s}`),
  ...CALENDAR_SECTORS.filter((s) => s !== 'atrium').map((s) => `calendar:${s}`),
  ...TASKS_SECTORS.map((s) => `tasks:${s}`),
  'projects:studio',
  ...FINANCE_SECTORS.map((s) => `finance:${s}`),
  'focus:garden',
  'focus:history',
  ...HABITS_SECTORS.map((s) => `habits:${s}`),
  'goals:garden',
  'goals:analysis',
  'music:atrium',
  'music:analysis',
  'sports:atrium',
  'sports:analysis',
]);

/**
 * Parque 3D — tela principal do ROUTIG (V2). Um mundo único com os prédios dos módulos;
 * entrar num prédio abre o interior com os painéis reais do módulo. O menu 2D continua
 * disponível (botão Menu), e nada exige andar pelo parque.
 */
export default function ParkPage() {
  const { t, settings } = useSettings();
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const saved = useMemo(readPrefs, []);
  const [quality, setQuality] = useState<Quality>(() => saved.quality ?? autoQuality());
  const [time, setTime] = useState<TimeOfDay>(timeNow);
  const [weather, setWeather] = useState<Weather>(saved.weather ?? 'clear');
  const [seasonMode, setSeasonMode] = useState<Season | 'auto'>(saved.season ?? 'auto');
  const [ambient, setAmbient] = useState(saved.sound ?? false);
  const [minimap, setMinimap] = useState(saved.minimap ?? true);
  const [labels, setLabels] = useState(saved.labels ?? true);
  const [camMode, setCamMode] = useState<CamMode>(saved.cam ?? 'walk');
  const [move, setMoveSet] = useState<MoveSettings>({ ...DEFAULT_MOVE, ...saved.move });
  const [stick, setStick] = useState<Stick>({ ...DEFAULT_STICK, ...saved.stick });
  const [people, setPeople] = useState<People>(saved.people ?? 'normal');
  const [hint, setHint] = useState<Hint | null>(null);
  const [posture, setPosture] = useState<Posture>('stand');
  const [census, setCensus] = useState<{ outside: number; total: number } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [showStats, setShowStats] = useState(saved.stats ?? true);
  const [picked, setPicked] = useState<ModuleId | null>(null);
  const [inside, setInside] = useState<ModuleId | null>(null);
  const [sector, setSector] = useState<string | null>(null);
  const [near, setNear] = useState<ModuleId | null>(null);
  const [failed, setFailed] = useState(false);
  const [menu, setMenu] = useState(false);
  const [options, setOptions] = useState(false);

  /* ---------- Dados reais para os interiores ---------- */
  const today = todayKey();
  const items = useLiveQuery(() => getDb().inbox.orderBy('createdAt').reverse().toArray(), []);
  const live = useMemo(() => (items ?? []).filter((i) => !i.deletedAt), [items]);
  const inboxData = useMemo(() => (items ? receptionData(items, today) : null), [items, today]);
  const cal = useCalendarData();
  const dashData = useMemo<DashboardData | null>(() => {
    if (cal.loading || !items) return null;
    const now = new Date();
    const events = cal.itemsInRange(today, today, { showTasks: false, categoryId: null }).filter((i) => i.kind === 'event').length;
    const open = cal.tasks.active.filter((x) => !isClosedKind(statusKind(cal.tasks.config, x.statusId)));
    const name = settings.profile.displayName.trim();
    const greeting = t(greetingKey(now.getHours()));
    return {
      greeting: name ? t('dashboard.greetingNamed', { greeting, name }) : greeting,
      date: capitalizeFirst(new Intl.DateTimeFormat(settings.locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(now)),
      stats: [
        [t('park.dashboard.stats.events'), events],
        [t('park.dashboard.stats.dueToday'), open.filter((x) => x.dueDate === today).length],
        [t('park.dashboard.stats.overdue'), open.filter((x) => x.dueDate && x.dueDate < today).length],
        [t('park.dashboard.stats.inbox'), inboxData?.open ?? 0],
      ],
    };
  }, [cal, items, inboxData, today, settings.locale, settings.profile.displayName, t]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sectorLabels = <T extends string>(prefix: string, ids: readonly T[]) => Object.fromEntries(ids.map((s) => [s, t(`${prefix}.${s}` as MessageKey)])) as Record<T, string>;
    const interiors: Partial<Record<ModuleId, InteriorFactory>> = {
      inbox: (kit) =>
        createInboxInterior(kit, {
          sectors: sectorLabels<InboxSector>('park.inbox.sectors', INBOX_SECTORS),
          flowTitle: t('park.inbox.flowTitle'),
          received: t('park.inbox.received'),
          open: t('park.inbox.open'),
          processed: t('park.inbox.processed'),
          archived: t('park.inbox.archived'),
          today: t('park.inbox.today'),
          destinations: Object.fromEntries(DESTINATIONS.map((d) => [d, d === 'library' ? t('modules.library') : t(`inbox.types.${d}`)])) as Record<(typeof DESTINATIONS)[number], string>,
          emptyFrame: t('park.inbox.emptyFrame'),
        }),
      dashboard: (kit) => createDashboardInterior(kit, sectorLabels<DashboardSector>('park.dashboard.sectors', DASHBOARD_SECTORS)),
      profile: (kit) => createProfileInterior(kit, sectorLabels<ProfileSector>('park.profile.sectors', PROFILE_SECTORS)),
      settings: (kit) => createSettingsInterior(kit, sectorLabels<SettingsRoom>('park.settings.rooms', SETTINGS_ROOMS)),
      library: (kit) => createLibraryInterior(kit, sectorLabels<LibrarySector>('park.library.sectors', LIBRARY_SECTORS)),
      notes: (kit) => createNotesInterior(kit, sectorLabels<NotesSector>('park.notes.sectors', NOTES_SECTORS)),
      academy: (kit) => createAcademyInterior(kit, sectorLabels<AcademySector>('park.academy.sectors', ACADEMY_SECTORS)),
      languages: (kit) => createLanguagesInterior(kit, sectorLabels<LanguagesSector>('park.languages.sectors', LANGUAGES_SECTORS)),
      insights: (kit) => createInsightsInterior(kit, sectorLabels<InsightsSector>('park.insights.sectors', INSIGHTS_SECTORS)),
      calendar: (kit) => createCalendarInterior(kit, sectorLabels<CalendarSector>('park.calendar.sectors', CALENDAR_SECTORS)),
      tasks: (kit) => createTasksInterior(kit, sectorLabels<TasksSector>('park.tasks.sectors', TASKS_SECTORS)),
      projects: (kit) => createProjectsInterior(kit, sectorLabels<ProjectsSector>('park.projects.sectors', PROJECTS_SECTORS)),
      finance: (kit) => createFinanceInterior(kit, sectorLabels<FinanceSector>('park.finance.sectors', FINANCE_SECTORS)),
      focus: (kit) => createFocusInterior(kit, sectorLabels<FocusSector>('park.focus.sectors', FOCUS_SECTORS)),
      habits: (kit) => createHabitsInterior(kit, sectorLabels<HabitsSector>('park.habits.sectors', HABITS_SECTORS)),
      goals: (kit) => createGoalsInterior(kit, sectorLabels<GoalsSector>('park.goals.sectors', GOALS_SECTORS)),
      music: (kit) => createMusicInterior(kit, sectorLabels<MusicSector>('park.music.sectors', MUSIC_SECTORS)),
      sports: (kit) => createSportsInterior(kit, sectorLabels<SportsSector>('park.sports.sectors', SPORTS_SECTORS)),
    };
    try {
      engine.current = createEngine(canvas, {
        quality,
        reduceMotion: settings.reduceMotion,
        interiors,
        onStats: setStats,
        onPick: setPicked,
        onSector: setSector,
        onInside: (id) => {
          setInside(id);
          setSector(null);
        },
        onNear: setNear,
        onMode: setCamMode,
        onHint: setHint,
        onPosture: setPosture,
        startMode: camMode,
      });
      engine.current.setTime(time);
    } catch {
      setFailed(true);
    }
    // Nomes dos prédios em HTML, posicionados direto no DOM (sem re-render a cada quadro).
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const box = labelsRef.current;
      if (!box || !engine.current) return;
      for (const p of engine.current.project()) {
        const el = box.querySelector<HTMLElement>(`[data-id="${p.id}"]`);
        if (!el) continue;
        el.style.transform = `translate(-50%, -100%) translate(${p.x}px, ${p.y}px)`;
        el.style.opacity = p.visible ? '1' : '0';
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      engine.current?.dispose();
      engine.current = null;
    };
    // O parque nasce uma vez; o resto muda pelo motor.
  }, []);

  useEffect(() => engine.current?.setQuality(quality), [quality]);
  useEffect(() => engine.current?.setTime(time), [time]);
  useEffect(() => engine.current?.setWeather(weather), [weather]);
  useEffect(() => engine.current?.setSeason(seasonMode === 'auto' ? seasonOf(new Date()) : seasonMode), [seasonMode]);
  useEffect(() => engine.current?.setFestive(festiveOn(new Date())), []);
  useEffect(() => writePrefs({ quality, labels, stats: showStats, weather, season: seasonMode, sound: ambient, minimap, cam: camMode, move, stick, people }), [quality, labels, showStats, weather, seasonMode, ambient, minimap, camMode, move, stick, people]);
  useEffect(() => engine.current?.setMoveSettings(move), [move]);
  useEffect(() => engine.current?.setCrowd(crowdCap(people, quality)), [people, quality]);
  useEffect(() => engine.current?.setHour(HOUR_OF[time]), [time]);
  useEffect(() => {
    if (!options) return;
    const read = () => setCensus(engine.current?.census() ?? null);
    read();
    const id = window.setInterval(read, 2000);
    return () => window.clearInterval(id);
  }, [options]);
  // Teclado: E interage, V troca a câmera.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      if (e.code === 'KeyE') engine.current?.interact();
      if (e.code === 'KeyV' && !e.ctrlKey && !e.metaKey) setCamMode((m) => CAM_ORDER[(CAM_ORDER.indexOf(m) + 1) % CAM_ORDER.length]!);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Som ambiente do parque: o mesmo motor de sons do Focus (sem duplicar). Durante uma sessão de foco, o Focus manda no som.
  const focus = useFocus();
  const focusRunning = !!focus.timer;
  useEffect(() => {
    if (!ambient || focusRunning) {
      if (!focusRunning) sound.stop();
      return;
    }
    sound.play(weather === 'rain' ? 'rain' : 'waves', weather === 'rain' ? 0.14 : 0.08);
    // Pássaros de vez em quando, de dia e sem chuva.
    const id = window.setInterval(() => {
      if (time !== 'night' && (weather === 'clear' || weather === 'cloudy') && Math.random() < 0.6) sound.chirp(0.05);
    }, 5000);
    return () => window.clearInterval(id);
  }, [ambient, focusRunning, weather, time]);
  useEffect(() => () => {
    if (!focusRunning) sound.stop();
  }, []);
  useEffect(() => engine.current?.setCamMode(camMode), [camMode]);
  useEffect(() => {
    if (inboxData) engine.current?.setData('inbox', inboxData);
  }, [inboxData]);
  // Só redesenha a tela do Dashboard quando os números mudam.
  const dashKey = JSON.stringify(dashData);
  useEffect(() => {
    if (dashData) engine.current?.setData('dashboard', dashData);
  }, [dashKey]);
  // Nomes das salas da Academy e dos quiosques de Idiomas: as disciplinas e os idiomas reais.
  const academy = useAcademyData();
  const langs = useLanguages();
  const subjectsKey = academy.subjects.map((s) => s.name).join('|');
  const langsKey = langs.languages.map((l) => l.name).join('|');
  useEffect(() => engine.current?.setData('academy', { subjects: subjectsKey ? subjectsKey.split('|') : [] }), [subjectsKey]);
  useEffect(() => engine.current?.setData('languages', { languages: langsKey ? langsKey.split('|') : [] }), [langsKey]);
  // Mesa digital do Tasks: as tarefas reais de hoje e atrasadas; estandes do Projects: os projetos ativos.
  const tasksKey = JSON.stringify(
    cal.loading
      ? null
      : cal.tasks.active.filter((x) => !isClosedKind(statusKind(cal.tasks.config, x.statusId)) && x.dueDate && x.dueDate <= today).map((x) => x.title),
  );
  useEffect(() => {
    const list = JSON.parse(tasksKey) as string[] | null;
    if (list) engine.current?.setData('tasks', { title: t('park.tasks.tableTitle', { count: list.length }), today: list, overdue: 0 });
  }, [tasksKey]);
  const projects = useLiveQuery(async () => (await getDb().projects.toArray()).filter((p) => !p.deletedAt && p.status !== 'archived' && p.status !== 'cancelled' && p.status !== 'done').map((p) => ({ name: p.name, color: p.color })), []);
  const projectsKey = JSON.stringify(projects ?? null);
  useEffect(() => {
    if (projects) engine.current?.setData('projects', { projects });
  }, [projectsKey]);

  // Placas com os nomes reais: hábitos, metas ativas, instrumentos e modalidades.
  const habitsData = useHabits();
  const goalsData = useGoals();
  const musicData = useMusic();
  const sportsData = useSports();
  const namesKey = JSON.stringify([
    habitsData.habits.map((h) => h.name),
    goalsData.goals.filter((g) => g.status !== 'done' && g.status !== 'cancelled' && g.status !== 'archived').map((g) => g.name),
    musicData.instruments.filter((i) => !i.deletedAt).map((i) => i.name),
    sportsData.sports.map((s) => s.name),
  ]);
  useEffect(() => {
    const [h, g, m, sp] = JSON.parse(namesKey) as string[][];
    engine.current?.setData('habits', { names: h ?? [] });
    engine.current?.setData('goals', { names: g ?? [] });
    engine.current?.setData('music', { names: m ?? [] });
    engine.current?.setData('sports', { names: sp ?? [] });
  }, [namesKey]);

  const pick = picked ? buildingById(picked) : null;
  const sectors = inside ? (SECTORS[inside] ?? []) : [];
  const wide = inside && sector ? WIDE.has(`${inside}:${sector}`) : false;
  const sectorName = (b: ModuleId, s: string) => t((b === 'settings' ? `park.settings.rooms.${s}` : `park.${b}.sectors.${s}`) as MessageKey);
  const chooseSector = (s: string) => {
    setSector(s);
    engine.current?.focusSector(s);
  };

  if (failed) return <NoWebgl />;

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0B1026] text-fg" style={{ touchAction: 'none' }} onScroll={(e) => e.currentTarget.scrollTo(0, 0)}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label={t('park.canvas')} />

      <div ref={labelsRef} className={labels && !inside ? 'pointer-events-none absolute inset-0 overflow-hidden' : 'hidden'} aria-hidden>
        {PARK_BUILDINGS.map((b) => (
          <span key={b.id} data-id={b.id} className="absolute left-0 top-0 whitespace-nowrap rounded-full bg-black/55 px-2.5 py-1 text-[0.72rem] font-semibold text-white opacity-0 transition-opacity">
            {t(`park.names.${b.id}`)}
          </span>
        ))}
      </div>

      {/* Barra de cima e, dentro de um prédio, os setores logo abaixo. */}
      <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent safe-top">
        <div className="flex flex-wrap items-center gap-2 p-3">
          {inside ? (
            <Button variant="secondary" icon={<LogOut className="h-4 w-4" />} onClick={() => engine.current?.exit()} className="bg-surface/90">
              {t('park.exit')}
            </Button>
          ) : (
            <IconButton label={t('park.menu')} icon={<Menu className="h-5 w-5" />} onClick={() => setMenu(true)} className="bg-surface/90" />
          )}
          <span className="hidden truncate rounded-xl bg-surface/80 px-3 py-2 text-xs font-semibold text-fg sm:inline">{inside ? t(`park.names.${inside}`) : t('park.title')}</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {!inside && (
              <Select aria-label={t('park.goTo')} value="" onChange={(e) => e.target.value && engine.current?.flyTo(e.target.value as ModuleId | 'plaza')} className="h-11 w-auto max-w-[10rem] bg-surface/90">
                <option value="">{t('park.goTo')}</option>
                <option value="plaza">{t('park.plaza')}</option>
                {PARK_BUILDINGS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {t(`park.names.${b.id}`)}
                  </option>
                ))}
              </Select>
            )}
            <IconButton label={inside ? t('park.entryView') : t('park.plaza')} icon={<Home className="h-5 w-5" />} onClick={() => (inside ? (setSector(null), engine.current?.focusSector('entry')) : engine.current?.flyTo('plaza'))} className="bg-surface/90" />
            <CamButton mode={camMode} label={t('park.nextCam', { mode: t(`park.camModes.${camMode}`) })} onClick={() => setCamMode((m) => CAM_ORDER[(CAM_ORDER.indexOf(m) + 1) % CAM_ORDER.length]!)} />
            <IconButton label={t('park.options')} icon={<SlidersHorizontal className="h-5 w-5" />} active={options} onClick={() => setOptions((o) => !o)} className="bg-surface/90" />
          </div>
        </div>
        {inside && sectors.length > 0 && (
          <nav aria-label={t('park.sectorsNav')} className="flex gap-2 overflow-x-auto px-3 pb-2">
            {sectors.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => chooseSector(s)}
                aria-pressed={sector === s}
                className={cn('h-10 shrink-0 rounded-full px-4 text-sm font-medium shadow-soft', sector === s ? 'bg-accent text-accent-fg' : 'bg-surface/90 text-fg')}
              >
                {sectorName(inside, s)}
              </button>
            ))}
          </nav>
        )}
      </div>

      {/* Opções do ambiente */}
      {options && (
        <div className="absolute right-3 top-[4.25rem] z-10 flex max-h-[calc(100%-6rem)] w-72 flex-col gap-3 overflow-y-auto rounded-2xl bg-surface p-4 shadow-lift ring-1 ring-line safe-top" role="dialog" aria-label={t('park.options')}>
          <Segmented<CamMode> label={t('park.camMode')} value={camMode} onChange={setCamMode} options={CAM_ORDER.map((v) => ({ value: v, label: t(`park.camModes.${v}`) }))} className="w-full" />
          <Segmented<TimeOfDay> label={t('park.time')} value={time} onChange={setTime} options={(['day', 'dusk', 'night'] as const).map((v) => ({ value: v, label: t(`park.times.${v}`) }))} className="w-full" />
          <Segmented<Quality> label={t('park.quality')} value={quality} onChange={setQuality} options={(['low', 'medium', 'high'] as const).map((q) => ({ value: q, label: t(`park.q.${q}`) }))} className="w-full" />
          <Segmented<Weather> label={t('park.weather')} value={weather} onChange={setWeather} options={(['clear', 'cloudy', 'rain', 'fog'] as const).map((v) => ({ value: v, label: t(`park.weathers.${v}`) }))} className="w-full" />
          <label className="flex items-center justify-between gap-3 text-sm text-fg">
            <span>{t('park.season')}</span>
            <Select value={seasonMode} onChange={(e) => setSeasonMode(e.target.value as Season | 'auto')} className="h-9 w-40">
              {(['auto', 'spring', 'summer', 'autumn', 'winter'] as const).map((v) => (
                <option key={v} value={v}>
                  {t(`park.seasons.${v}`)}
                </option>
              ))}
            </Select>
          </label>
          <Switch
            label={t('park.sound')}
            hint={t('park.soundHint')}
            checked={ambient}
            onChange={(on) => {
              // O iPad só libera som depois de um toque: este é o toque.
              if (on) sound.unlock();
              setAmbient(on);
            }}
          />
          <Switch label={t('park.minimapToggle')} checked={minimap} onChange={setMinimap} />
          <Switch label={t('park.labels')} checked={labels} onChange={setLabels} />
          <Switch label={t('park.showStats')} checked={showStats} onChange={setShowStats} />
          <Segmented<People> label={t('park.people')} value={people} onChange={setPeople} options={(['off', 'few', 'normal'] as const).map((v) => ({ value: v, label: t(`park.peopleLevels.${v}`) }))} className="w-full" />
          {census && people !== 'off' && <p className="-mt-2 text-xs text-muted">{t('park.peopleNow', { count: census.outside, total: census.total })}</p>}
          <h3 className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted">{t('park.controls')}</h3>
          <Range label={t('park.sensitivity')} min={0.5} max={2} value={move.sensitivity} onChange={(v) => setMoveSet({ ...move, sensitivity: v })} />
          <Range label={t('park.speed')} min={0.6} max={1.6} value={move.speed} onChange={(v) => setMoveSet({ ...move, speed: v })} />
          <Switch label={t('park.invertY')} checked={move.invertY} onChange={(on) => setMoveSet({ ...move, invertY: on })} />
          <Segmented<Stick['size']> label={t('park.stickSize')} value={stick.size} onChange={(v) => setStick({ ...stick, size: v })} options={(['s', 'm', 'l'] as const).map((v) => ({ value: v, label: t(`park.stickSizes.${v}`) }))} className="w-full" />
          <Segmented<Stick['side']> label={t('park.stickSide')} value={stick.side} onChange={(v) => setStick({ ...stick, side: v })} options={(['left', 'right'] as const).map((v) => ({ value: v, label: t(`park.sides.${v}`) }))} className="w-full" />
        </div>
      )}

      {/* Medições (para os testes de desempenho) */}
      {showStats && (
        <div className={cn('pointer-events-none absolute bottom-3 rounded-xl bg-black/60 px-3 py-2 font-mono text-[0.7rem] leading-relaxed text-white safe-bottom', camMode !== 'orbit' ? 'right-3 bottom-auto top-[4.5rem] sm:top-auto sm:bottom-3' : 'left-3')}>
          {stats ? (
            <>
              <div>{t('park.fps', { fps: stats.fps })}</div>
              <div>{t('park.calls', { calls: stats.calls })}</div>
              <div>{t('park.tris', { tris: stats.triangles.toLocaleString(settings.locale) })}</div>
            </>
          ) : (
            t('common.loading')
          )}
        </div>
      )}

      {/* Andando (primeira e terceira pessoa): controle, botões de correr, pular e interagir, e dica */}
      {camMode !== 'orbit' && <Joystick onMove={(x, y) => engine.current?.setMove(x, y)} label={t('park.joystick')} size={stick.size} side={stick.side} />}
      {camMode !== 'orbit' && <ActionButtons side={stick.side === 'left' ? 'right' : 'left'} engine={engine} canInteract={!!hint || posture !== 'stand' || (!!near && !inside)} />}
      {camMode !== 'orbit' && !inside && (hint || posture !== 'stand') && !near && (
        <div className="pointer-events-none absolute inset-x-0 bottom-44 flex justify-center">
          <span className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white">
            {posture !== 'stand' ? t('park.standUp') : hint?.kind === 'person' ? t('park.hints.person', { name: hint.name, activity: t(`park.activities.${hint.activity}` as MessageKey) }) : hint ? t(`park.hints.${hint.kind}`) : ''} · E
          </span>
        </div>
      )}
      {camMode !== 'orbit' && !near && !hint && <p className="pointer-events-none absolute bottom-24 right-3 hidden max-w-xs rounded-xl bg-black/50 px-3 py-2 text-[0.7rem] text-white md:block">{t('park.walkHint')}</p>}
      {camMode !== 'orbit' && near && !inside && (
        <div className="absolute inset-x-0 bottom-36 flex justify-center">
          <Button variant="primary" icon={<LogIn className="h-4 w-4" />} onClick={() => engine.current?.enter(near)}>
            {t('park.enterNamed', { name: t(`park.names.${near}`) })}
          </Button>
        </div>
      )}
      {camMode === 'orbit' && !picked && !sector && <p className="pointer-events-none absolute bottom-3 right-3 hidden max-w-xs rounded-xl bg-black/50 px-3 py-2 text-[0.7rem] text-white md:block">{t(inside ? 'park.gesturesInside' : 'park.gestures')}</p>}

      {/* Prédio tocado */}
      {!inside && pick && (
        <div className="absolute inset-x-3 bottom-20 mx-auto max-w-sm rounded-2xl bg-surface p-4 shadow-lift ring-1 ring-line" role="dialog" aria-label={t(`park.names.${pick.id}`)}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold text-fg">{t(`park.names.${pick.id}`)}</div>
              <div className="text-xs text-muted">
                {t(`modules.${pick.id}`)} · {t(`park.regions.${pick.region}`)}
              </div>
              {!SECTORS[pick.id] && <p className="mt-1 text-xs text-subtle">{t('park.comingSoon')}</p>}
            </div>
            <IconButton size="sm" label={t('common.close')} icon={<X className="h-4 w-4" />} onClick={() => setPicked(null)} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {SECTORS[pick.id] && (
              <Button size="sm" variant="primary" icon={<LogIn className="h-4 w-4" />} onClick={() => engine.current?.enter(pick.id)}>
                {t('park.enter')}
              </Button>
            )}
            <Button size="sm" variant="secondary" icon={<Navigation className="h-4 w-4" />} onClick={() => engine.current?.flyTo(pick.id)}>
              {t('park.flyTo')}
            </Button>
            <Link to={MODULES[pick.id].path} className="inline-flex h-9 items-center rounded-xl px-3 text-sm font-medium text-fg ring-1 ring-inset ring-line hover:bg-surface-2">
              {t('park.openModule')}
            </Link>
          </div>
        </div>
      )}

      {/* Painel do setor (dentro): a interface real do módulo, presa ao ambiente */}
      {inside && sector && (
        <section
          className={cn(
            'absolute inset-x-3 bottom-3 mx-auto flex flex-col rounded-2xl bg-surface shadow-lift ring-1 ring-line safe-bottom',
            wide ? 'max-h-[70vh] max-w-4xl md:inset-x-6 md:bottom-4 md:max-h-[calc(100%-10rem)]' : 'max-h-[50vh] max-w-lg sm:bottom-auto sm:left-auto sm:right-3 sm:top-[8.5rem] sm:mx-0 sm:max-h-[calc(100%-10rem)] sm:w-[26rem]',
          )}
          aria-label={sectorName(inside, sector)}
        >
          <header className="flex items-start gap-2 border-b border-line/70 p-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-fg">{sectorName(inside, sector)}</h2>
              {inside === 'inbox' && <p className="text-xs text-muted">{t(`park.inbox.hints.${sector}` as MessageKey)}</p>}
            </div>
            <IconButton
              size="sm"
              label={t('common.close')}
              icon={<X className="h-4 w-4" />}
              onClick={() => {
                setSector(null);
                engine.current?.focusSector('entry');
              }}
            />
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4" style={{ touchAction: 'pan-y' }}>
            {inside === 'inbox' && <InboxPanel id={sector as InboxSector} items={live} data={inboxData} today={today} onError={(m) => toast.show(m, 'error')} onDone={(m) => toast.show(m, 'success')} />}
            {inside === 'dashboard' && <DashboardPanel id={sector as DashboardSector} />}
            {inside === 'profile' && <ProfilePanel id={sector as ProfileSector} />}
            {inside === 'settings' && <SettingsPanel id={sector as SettingsRoom} />}
            {inside === 'library' && <LibraryPanel id={sector as LibrarySector} />}
            {inside === 'notes' && <NotesPanel id={sector as NotesSector} />}
            {inside === 'academy' && <AcademyPanel id={sector as AcademySector} />}
            {inside === 'languages' && <LanguagesPanel id={sector as LanguagesSector} />}
            {inside === 'insights' && <InsightsPanel id={sector as InsightsSector} />}
            {inside === 'calendar' && <CalendarPanel id={sector as CalendarSector} />}
            {inside === 'tasks' && <TasksPanel id={sector as TasksSector} />}
            {inside === 'projects' && <ProjectsPanel id={sector as ProjectsSector} />}
            {inside === 'finance' && <FinancePanel id={sector as FinanceSector} />}
            {inside === 'focus' && <FocusPanel id={sector as FocusSector} />}
            {inside === 'habits' && <HabitsPanel id={sector as HabitsSector} />}
            {inside === 'goals' && <GoalsPanel id={sector as GoalsSector} />}
            {inside === 'music' && <MusicPanel id={sector as MusicSector} />}
            {inside === 'sports' && <SportsPanel id={sector as SportsSector} />}
          </div>
        </section>
      )}

      {minimap && !inside && !options && (
        <div className="absolute right-3 top-[4.5rem] safe-top">
          <Minimap engine={engine} onPick={setPicked} />
        </div>
      )}

      {menu && <ModuleMenu onClose={() => setMenu(false)} />}
    </div>
  );
}

/** Navegação 2D: todos os módulos sem passar pelo 3D (acessibilidade e atalho). */
function ModuleMenu({ onClose }: { onClose: () => void }) {
  const { t } = useSettings();
  const ids: ModuleId[] = ['dashboard', ...NAV_MODULE_IDS.filter((id) => id !== 'dashboard'), 'profile', 'settings'];
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <nav aria-label={t('park.menu')} className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-lift safe-top">
        <div className="flex items-center justify-between border-b border-line/70 p-3">
          <span className="text-sm font-semibold text-fg">{t('park.menu')}</span>
          <IconButton label={t('common.close')} icon={<X className="h-5 w-5" />} onClick={onClose} />
        </div>
        <ul className="flex-1 overflow-y-auto p-2">
          {ids.map((id) => {
            const Icon = MODULES[id].icon;
            return (
              <li key={id}>
                <Link to={MODULES[id].path} className="flex h-11 items-center gap-3 rounded-xl px-3 text-[0.9rem] font-medium text-fg hover:bg-surface-2">
                  <Icon className="h-5 w-5 text-muted" aria-hidden />
                  {t(`modules.${id}`)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/** Controle de andar na tela (primeira pessoa). */
function Joystick({ onMove, label, size, side }: { onMove: (x: number, y: number) => void; label: string; size: Stick['size']; side: Stick['side'] }) {
  const px = size === 's' ? 104 : size === 'l' ? 160 : 128;
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const id = useRef<number | null>(null);
  const update = (e: RPointerEvent<HTMLDivElement>) => {
    const r = base.current!.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    setKnob({ x, y });
    onMove(x, -y);
  };
  const end = () => {
    id.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };
  return (
    <div
      ref={base}
      role="application"
      aria-label={label}
      className={cn('absolute bottom-8 rounded-full bg-black/35 ring-2 ring-white/40 backdrop-blur-sm safe-bottom', side === 'left' ? 'left-6' : 'right-6')}
      style={{ touchAction: 'none', width: px, height: px }}
      onPointerDown={(e) => {
        id.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => id.current === e.pointerId && update(e)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full bg-white/80 shadow-lift" style={{ transform: `translate(calc(-50% + ${knob.x * px * 0.28}px), calc(-50% + ${knob.y * px * 0.28}px))` }} />
    </div>
  );
}

/** Botão que troca a câmera (1ª pessoa → 3ª pessoa → livre). */
function CamButton({ mode, label, onClick }: { mode: CamMode; label: string; onClick: () => void }) {
  const Icon = CAM_ICON[mode];
  return <IconButton label={label} icon={<Icon className="h-5 w-5" />} active={mode !== 'orbit'} onClick={onClick} className="bg-surface/90" />;
}

/** Correr (liga e desliga), pular e interagir: do lado oposto ao controle de andar. */
function ActionButtons({ side, engine, canInteract }: { side: 'left' | 'right'; engine: MutableRefObject<Engine | null>; canInteract: boolean }) {
  const { t } = useSettings();
  const [running, setRunning] = useState(false);
  const btn = 'flex h-14 w-14 items-center justify-center rounded-full bg-black/40 text-white ring-2 ring-white/40 backdrop-blur-sm active:bg-white/30';
  return (
    <div className={cn('absolute bottom-8 flex items-end gap-3 safe-bottom', side === 'right' ? 'right-6' : 'left-6')}>
      <button
        type="button"
        aria-label={t('park.run')}
        aria-pressed={running}
        className={cn(btn, running && 'bg-white/40')}
        onClick={() => {
          engine.current?.setRun(!running);
          setRunning(!running);
        }}
      >
        <FastForward className="h-6 w-6" />
      </button>
      <button type="button" aria-label={t('park.jump')} className={btn} onClick={() => engine.current?.jump()}>
        <ChevronsUp className="h-6 w-6" />
      </button>
      <button type="button" aria-label={t('park.interact')} disabled={!canInteract} className={cn(btn, 'h-16 w-16', !canInteract && 'opacity-40')} onClick={() => engine.current?.interact()}>
        <Hand className="h-7 w-7" />
      </button>
    </div>
  );
}

function Range({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-fg">
      <span className="flex justify-between">
        {label}
        <span className="tabular-nums text-muted">{value.toFixed(1)}×</span>
      </span>
      <input type="range" min={min} max={max} step={0.1} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[rgb(var(--accent))]" />
    </label>
  );
}

/** Aparelho sem 3D: a navegação 2D continua completa. */

function NoWebgl() {
  const { t } = useSettings();
  const ids: ModuleId[] = ['dashboard', ...NAV_MODULE_IDS.filter((id) => id !== 'dashboard'), 'profile', 'settings'];
  return (
    <div className="ambient min-h-full p-6">
      <div className="mx-auto max-w-xl">
        <h1 className="text-xl font-semibold text-fg">{t('park.title')}</h1>
        <p role="alert" className="mt-2 text-sm text-muted">
          {t('park.noWebgl')}
        </p>
        <nav aria-label={t('park.menu')} className="mt-4">
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ids.map((id) => (
              <li key={id}>
                <Link to={MODULES[id].path} className="flex h-11 items-center rounded-xl bg-surface px-4 text-sm font-medium text-fg ring-1 ring-line hover:bg-surface-2">
                  {t(`modules.${id}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

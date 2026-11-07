import { useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as RPointerEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Armchair, ArrowUpDown, Camera, ChevronsUp, FastForward, Footprints, Hand, Home, LogIn, Mountain, Smile, TreePine, Waves, LogOut, Monitor, Navigation, RotateCcw, SlidersHorizontal, UserRound, X } from 'lucide-react';
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
import { CLEAR_SKY, SKY_PRESETS, autoSky, festiveOn, phaseOf, seasonOf, type Quality, type Season, type Sky, type SkyPreset } from './world';
import { AUDIO_CATS, DEFAULT_MIX, createParkAudio, type AudioMix, type ParkAudio } from './audio';
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
import { ModuleCenter } from './ModuleCenter';
import { DEFAULT_FAB, FloatingCenterButton, PlacesMenu, type FabPlace } from './ParkUi';
import { withFloors } from './interiors/floors';
import { DRUM_PADS, PIANO_KEYS } from './interiors/things';
import { clearParkContext, pushRecent, readParkContext, saveParkContext } from './parkContext';

/** Preferências do parque neste aparelho (qualidade é do aparelho; o resto é gosto pessoal). */
interface ParkPrefs {
  graphics?: Quality | 'auto';
  clockAuto?: boolean;
  hour?: number;
  skyAuto?: boolean;
  sky?: Sky;
  mix?: AudioMix;
  labels?: boolean;
  stats?: boolean;
  season?: Season | 'auto';
  sound?: boolean;
  minimap?: boolean;
  cam?: CamMode;
  move?: MoveSettings;
  stick?: Stick;
  people?: People;
  fab?: FabPlace;
}
type Stick = { size: 's' | 'm' | 'l'; side: 'left' | 'right'; hidden?: boolean };
type People = 'off' | 'few' | 'normal';
const DEFAULT_MOVE: MoveSettings = { sensitivity: 1, speed: 1, invertY: false };
const DEFAULT_STICK: Stick = { size: 'm', side: 'left' };
const CAM_ORDER: CamMode[] = ['walk', 'third', 'orbit'];
const CAM_ICON = { walk: Footprints, third: UserRound, orbit: Camera } as const;

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

function hourNow(): number {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

const fmtHour = (h: number) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
const SKY_PARTS = ['cloud', 'rain', 'fog', 'wind'] as const;

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
  const [graphics, setGraphics] = useState<Quality | 'auto'>(saved.graphics ?? 'auto');
  const [quality, setQuality] = useState<Quality>(() => (saved.graphics && saved.graphics !== 'auto' ? saved.graphics : autoQuality()));
  const [clockAuto, setClockAuto] = useState(saved.clockAuto ?? true);
  const [manualHour, setManualHour] = useState(saved.hour ?? 12);
  const [realHour, setRealHour] = useState(hourNow);
  const [skyAuto, setSkyAuto] = useState(saved.skyAuto ?? true);
  const [manualSky, setManualSky] = useState<Sky>(saved.sky ?? CLEAR_SKY);
  const [autoNow, setAutoNow] = useState(() => autoSky(new Date()));
  const [mix, setMix] = useState<AudioMix>({ ...DEFAULT_MIX, ...saved.mix });
  const hour = clockAuto ? realHour : manualHour;
  const sky = skyAuto ? autoNow : manualSky;

  const [seasonMode, setSeasonMode] = useState<Season | 'auto'>(saved.season ?? 'auto');
  const [ambient, setAmbient] = useState(saved.sound ?? false);
  const [minimap, setMinimap] = useState(saved.minimap ?? true);
  const [labels, setLabels] = useState(saved.labels ?? true);
  const [camMode, setCamMode] = useState<CamMode>(() => readParkContext()?.mode ?? saved.cam ?? 'walk');
  const [move, setMoveSet] = useState<MoveSettings>({ ...DEFAULT_MOVE, ...saved.move });
  const [stick, setStick] = useState<Stick>({ ...DEFAULT_STICK, ...saved.stick });
  const [people, setPeople] = useState<People>(saved.people ?? 'normal');
  const [hint, setHint] = useState<Hint | null>(null);
  const [posture, setPosture] = useState<Posture>('stand');
  const [census, setCensus] = useState<{ outside: number; total: number } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  // Desempenho e gráficos ficam em Configurações → Parque 3D.
  const showStats = saved.stats ?? false;
  const [fab, setFab] = useState<FabPlace>({ ...DEFAULT_FAB, ...saved.fab });
  const [picked, setPicked] = useState<ModuleId | null>(null);
  const [inside, setInside] = useState<ModuleId | null>(null);
  const [sector, setSector] = useState<string | null>(null);
  const [near, setNear] = useState<ModuleId | null>(null);
  const [failed, setFailed] = useState(false);
  const [center, setCenter] = useState(false);
  const [floors, setFloors] = useState({ count: 1, current: 0 });
  const [zoneKey, setZoneKey] = useState<string | null>(null);
  const [elevator, setElevator] = useState(false);
  const [instrument, setInstrument] = useState<'piano' | 'drums' | null>(null);
  // Painel no celular: só o título, meia tela ou tela cheia.
  const [sheet, setSheet] = useState<'peek' | 'half' | 'full'>('half');
  const [riding, setRiding] = useState(false);
  const [talk, setTalk] = useState<{ name: string; activity: string; line: number; at: number } | null>(null);
  const reopened = useRef(false);
  const navigate = useNavigate();
  const restore = useMemo(readParkContext, []);
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
    const interiors: Partial<Record<ModuleId, InteriorFactory>> = {};
    const base: Partial<Record<ModuleId, InteriorFactory>> = {
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
    // Andares da V2.1 em cima de cada térreo (salas ligadas aos painéis reais).
    for (const [id, make] of Object.entries(base) as Array<[ModuleId, InteriorFactory]>)
      interiors[id] = (kit) => withFloors(kit, make(kit), id, (key) => t(`park.floorRooms.${id}.${key}` as MessageKey), t('park.terrace'), (n) => t(`park.floorNames.f${n}` as MessageKey), t('park.elevators'));
    try {
      engine.current = createEngine(canvas, {
        quality,
        reduceMotion: settings.reduceMotion,
        interiors,
        onStats: setStats,
        onPick: setPicked,
        onSector: (s) => {
          setSector(s);
          setZoneKey(null);
        },
        onInside: (id) => {
          setInside(id);
          setSector(null);
          setZoneKey(null);
        },
        onFloors: (count, current) => setFloors({ count, current }),
        onElevator: () => setElevator(true),
        onInstrument: setInstrument,
        onRiding: setRiding,
        onTalk: (x) => setTalk({ ...x, at: Date.now() }),
        onZone: (z) => {
          if (z?.sector === '@options') {
            setOptions(true);
            return;
          }
          setZoneKey(z?.key ?? null);
          setSector(z?.sector ?? null);
        },
        onNear: setNear,
        restore,
        onMode: setCamMode,
        onHint: setHint,
        onPosture: setPosture,
        startMode: camMode,
      });
      clearParkContext();
      engine.current.setHour(clockAuto ? hourNow() : manualHour);
      engine.current.setWeather(skyAuto ? autoSky(new Date()) : manualSky);
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
  useEffect(() => engine.current?.setHour(hour), [hour]);
  const skyKey = JSON.stringify(sky);
  useEffect(() => engine.current?.setWeather(sky), [skyKey]);
  // Relógio e clima automáticos: conferidos a cada 30 s.
  useEffect(() => {
    const id = window.setInterval(() => {
      setRealHour(hourNow());
      setAutoNow(autoSky(new Date()));
    }, 30000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (graphics !== 'auto') setQuality(graphics);
  }, [graphics]);
  // Gráficos automáticos: baixa um nível se ficar lento por alguns segundos; sobe se sobrar folga por bastante tempo.
  const perf = useRef({ slow: 0, fast: 0, hold: 0 });
  useEffect(() => {
    if (graphics !== 'auto' || !stats) return;
    const p = perf.current;
    p.slow = stats.fps < 38 ? p.slow + 1 : 0;
    p.fast = stats.fps >= 57 ? p.fast + 1 : 0;
    const order: Quality[] = ['low', 'medium', 'high'];
    const i = order.indexOf(quality);
    if (p.slow >= 4 && i > 0) {
      setQuality(order[i - 1]!);
      p.slow = 0;
      p.hold = Date.now() + 60000;
    } else if (p.fast >= 12 && i < 2 && Date.now() > p.hold) {
      setQuality(order[i + 1]!);
      p.fast = 0;
    }
  }, [stats, graphics]);
  useEffect(() => engine.current?.setSeason(seasonMode === 'auto' ? seasonOf(new Date()) : seasonMode), [seasonMode]);
  useEffect(() => engine.current?.setFestive(festiveOn(new Date())), []);
  useEffect(() => writePrefs({ ...readPrefs(), graphics, labels, stats: showStats, fab, clockAuto, hour: manualHour, skyAuto, sky: manualSky, season: seasonMode, sound: ambient, minimap, cam: camMode, move, stick, people, mix }), [graphics, labels, showStats, fab, clockAuto, manualHour, skyAuto, manualSky, seasonMode, ambient, minimap, camMode, move, stick, people, mix]);
  useEffect(() => engine.current?.setMoveSettings(move), [move]);
  useEffect(() => engine.current?.setCrowd(crowdCap(people, quality)), [people, quality]);
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

  // Som espacial do parque, no mesmo contexto de áudio do Focus (sem duplicar). Durante uma sessão de foco, o Focus manda no som.
  const focus = useFocus();
  const focusRunning = !!focus.timer;
  const audioRef = useRef<ParkAudio | null>(null);
  useEffect(() => {
    if (!ambient || focusRunning) return;
    const a = createParkAudio(mix);
    audioRef.current = a;
    engine.current?.setAudio(a);
    // O iPad só libera som depois de um toque: qualquer toque no parque serve.
    const wake = () => sound.unlock();
    window.addEventListener('pointerdown', wake);
    return () => {
      window.removeEventListener('pointerdown', wake);
      engine.current?.setAudio(null);
      a?.dispose();
      audioRef.current = null;
    };
  }, [ambient, focusRunning]);
  useEffect(() => audioRef.current?.setMix(mix), [mix]);
  // Interface 2D a partir do parque: guarda onde a pessoa está para retomar ao voltar.
  const open2D = (id: ModuleId) => {
    if (engine.current) saveParkContext({ ...engine.current.snapshot(), sector, zone: zoneKey });
    pushRecent(id);
    navigate(MODULES[id].path);
  };
  const enterFromCenter = (id: ModuleId) => {
    setCenter(false);
    pushRecent(id);
    if (inside === id) return;
    if (inside) {
      engine.current?.exit();
      window.setTimeout(() => engine.current?.enter(id), 700);
    } else engine.current?.enter(id);
  };
  // Volta do 2D: reabre o painel que estava aberto no mesmo prédio.
  useEffect(() => {
    if (reopened.current || !restore?.inside || inside !== restore.inside || !restore.sector) return;
    reopened.current = true;
    setSector(restore.sector);
    setZoneKey(restore.zone ?? null);
  }, [inside]);
  const restoreDefaults = () => {
    setCamMode('walk');
    setMoveSet(DEFAULT_MOVE);
    setStick(DEFAULT_STICK);
    setPeople('normal');
    setClockAuto(true);
    setManualHour(12);
    setSkyAuto(true);
    setManualSky(CLEAR_SKY);
    setSeasonMode('auto');
    setAmbient(false);
    setMix(DEFAULT_MIX);
    setGraphics('auto');
    setMinimap(true);
    setLabels(true);
    toast.show(t('park.restored'), 'success');
  };
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
    setZoneKey(null);
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
          ) : null}
          {inside && (
            <PlacesMenu
              title={t(`park.names.${inside}`)}
              floors={Array.from({ length: floors.count }, (_, n) => ({
                name: t(`park.floorNames.f${n}` as MessageKey),
                current: floors.current === n,
                onGo: () => (camMode === 'orbit' ? engine.current?.setFloor(n) : engine.current?.rideTo(n)),
                rooms:
                  n === 0
                    ? sectors.map((s) => ({ id: s, label: sectorName(inside, s), active: !zoneKey && sector === s, onPick: () => (floors.current !== 0 && engine.current?.setFloor(0), chooseSector(s)) }))
                    : (engine.current?.zones() ?? [])
                        .map((z, i) => ({ ...z, i }))
                        .filter((z) => z.level === n)
                        .map((z) => ({ id: z.key, label: t(`park.floorRooms.${inside}.${z.key}` as MessageKey), active: zoneKey === z.key, onPick: () => engine.current?.focusZone(z.i) })),
              }))}
            />
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
      </div>

      {/* Opções do ambiente */}
      {options && (
        <div className="absolute right-3 top-[4.25rem] z-10 flex max-h-[calc(100%-6rem)] w-72 flex-col gap-3 overflow-y-auto rounded-2xl bg-surface p-4 shadow-lift ring-1 ring-line safe-top" role="dialog" aria-label={t('park.options')}>
          <Segmented<CamMode> label={t('park.camMode')} value={camMode} onChange={setCamMode} options={CAM_ORDER.map((v) => ({ value: v, label: t(`park.camModes.${v}`) }))} className="w-full" />
          <h3 className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted">{t('park.env')}</h3>
          <Switch label={t('park.clockAuto')} checked={clockAuto} onChange={setClockAuto} />
          <label className="flex flex-col gap-1 text-sm text-fg">
            <span className="flex justify-between">
              {t('park.time')}
              <span className="tabular-nums text-muted">{t('park.hourLabel', { time: fmtHour(hour), phase: t(`park.phases.${phaseOf(hour)}`) })}</span>
            </span>
            <input
              type="range"
              min={0}
              max={23.75}
              step={0.25}
              value={hour}
              onChange={(e) => {
                setClockAuto(false);
                setManualHour(Number(e.target.value));
              }}
              className="w-full accent-[rgb(var(--accent))]"
            />
          </label>
          <Switch label={t('park.skyAuto')} checked={skyAuto} onChange={setSkyAuto} />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('park.weather')}>
            {(Object.keys(SKY_PRESETS) as SkyPreset[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setSkyAuto(false);
                  setManualSky(SKY_PRESETS[p]);
                }}
                className={cn('h-8 rounded-full px-3 text-xs font-medium ring-1 ring-inset ring-line', !skyAuto && JSON.stringify(manualSky) === JSON.stringify(SKY_PRESETS[p]) ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg')}
              >
                {t(`park.skyPresets.${p}`)}
              </button>
            ))}
          </div>
          {SKY_PARTS.map((k) => (
            <Range
              key={k}
              label={t(`park.skyParts.${k}`)}
              min={0}
              max={1}
              value={sky[k]}
              unit="%"
              onChange={(v) => {
                setSkyAuto(false);
                setManualSky({ ...sky, [k]: v });
              }}
            />
          ))}
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
          <h3 className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted">{t('park.audio')}</h3>
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
          {ambient && (
            <>
              <Switch label={t('park.mute')} checked={mix.muted} onChange={(on) => setMix({ ...mix, muted: on })} />
              <Range label={t('park.master')} min={0} max={1} value={mix.master} unit="%" onChange={(v) => setMix({ ...mix, master: v })} />
              {AUDIO_CATS.map((c) => (
                <Range key={c} label={t(`park.audioCats.${c}`)} min={0} max={1} value={mix[c]} unit="%" onChange={(v) => setMix({ ...mix, [c]: v })} />
              ))}
            </>
          )}
          <h3 className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted">{t('park.display')}</h3>
          <Switch label={t('park.minimapToggle')}
 checked={minimap} onChange={setMinimap} />
          <Switch label={t('park.labels')} checked={labels} onChange={setLabels} />
          <Segmented<People> label={t('park.people')} value={people} onChange={setPeople} options={(['off', 'few', 'normal'] as const).map((v) => ({ value: v, label: t(`park.peopleLevels.${v}`) }))} className="w-full" />
          {census && people !== 'off' && <p className="-mt-2 text-xs text-muted">{t('park.peopleNow', { count: census.outside, total: census.total })}</p>}
          <h3 className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted">{t('park.controls')}</h3>
          <Range label={t('park.sensitivity')} min={0.5} max={2} value={move.sensitivity} onChange={(v) => setMoveSet({ ...move, sensitivity: v })} />
          <Range label={t('park.speed')} min={0.6} max={1.6} value={move.speed} onChange={(v) => setMoveSet({ ...move, speed: v })} />
          <Switch label={t('park.invertY')} checked={move.invertY} onChange={(on) => setMoveSet({ ...move, invertY: on })} />
          <Segmented<Stick['size']> label={t('park.stickSize')} value={stick.size} onChange={(v) => setStick({ ...stick, size: v })} options={(['s', 'm', 'l'] as const).map((v) => ({ value: v, label: t(`park.stickSizes.${v}`) }))} className="w-full" />
          <Segmented<Stick['side']> label={t('park.stickSide')} value={stick.side} onChange={(v) => setStick({ ...stick, side: v })} options={(['left', 'right'] as const).map((v) => ({ value: v, label: t(`park.sides.${v}`) }))} className="w-full" />
          <Switch label={t('park.hideControls')} hint={t('park.hideControlsHint')} checked={!!stick.hidden} onChange={(on) => setStick({ ...stick, hidden: on })} />
          <Button variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={restoreDefaults}>
            {t('park.restore')}
          </Button>
        </div>
      )}

      {/* Medições (para os testes de desempenho) */}
      {showStats && (
        <div className={cn('pointer-events-none absolute bottom-3 rounded-xl bg-black/60 px-3 py-2 font-mono text-[0.7rem] leading-relaxed text-white safe-bottom', camMode !== 'orbit' ? 'bottom-auto right-3 top-[15rem]' : 'left-3')}>
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
      {camMode !== 'orbit' && !riding && !instrument && !stick.hidden && <Joystick onMove={(x, y) => engine.current?.setMove(x, y)} onRun={(on) => engine.current?.setRun(on, 'stick')} label={t('park.joystick')} size={stick.size} side={stick.side} />}
      {camMode !== 'orbit' && !riding && !instrument && !stick.hidden && <ActionButtons side={stick.side === 'left' ? 'right' : 'left'} engine={engine} canInteract={!!hint || posture !== 'stand' || (!!near && !inside)} />}
      {camMode !== 'orbit' && !riding && !elevator && !instrument && (hint || posture !== 'stand') && (!near || !!inside) && (
        <InteractPrompt
          kind={posture !== 'stand' ? 'stand' : (hint?.kind ?? 'sit')}
          title={
            posture !== 'stand'
              ? t('park.standUp')
              : hint?.kind === 'person'
                ? t('park.hints.greet', { name: hint.name })
                : hint?.kind === 'use'
                  ? hint.what === 'room'
                    ? t('park.use.room', { name: inside && hint.key ? t(`park.floorRooms.${inside}.${hint.key}` as MessageKey) : '' })
                    : hint.what === 'stairs'
                      ? t(hint.up ? 'park.use.stairsUp' : 'park.use.stairsDown')
                      : t(`park.use.${hint.what}` as MessageKey)
                  : hint
                    ? t(`park.hints.${hint.kind}`)
                    : ''
          }
          detail={posture === 'stand' && hint?.kind === 'person' ? t('park.hints.person', { name: hint.name, activity: t(`park.activities.${hint.activity}` as MessageKey) }) : undefined}
          onAct={() => engine.current?.interact()}
        />
      )}
      {camMode !== 'orbit' && !near && !hint && <p className="pointer-events-none absolute bottom-24 right-3 hidden max-w-xs rounded-xl bg-black/50 px-3 py-2 text-[0.7rem] text-white md:block">{t('park.walkHint')}</p>}
      {camMode !== 'orbit' && near && !inside && <InteractPrompt kind="enter" title={t('park.enterNamed', { name: t(`park.names.${near}`) })} detail={t(`modules.${near}`)} onAct={() => engine.current?.enter(near)} />}
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
            <Button size="sm" variant="ghost" icon={<Monitor className="h-4 w-4" />} onClick={() => open2D(pick.id)}>
              {t('park.openModule')}
            </Button>
          </div>
        </div>
      )}

      {/* Painel do setor (dentro): a interface real do módulo, presa ao ambiente */}
      {inside && sector && (
        <section
          className={cn(
            'absolute inset-x-2 bottom-2 z-20 mx-auto flex flex-col rounded-2xl bg-surface shadow-lift ring-1 ring-line safe-bottom',
            sheet === 'peek' ? 'max-h-[4.5rem]' : sheet === 'full' ? 'max-h-[85vh]' : 'max-h-[42vh]',
            wide ? 'max-w-4xl md:inset-x-6 md:bottom-4 md:max-h-[calc(100%-10rem)]' : 'max-w-lg sm:bottom-auto sm:left-auto sm:right-3 sm:top-[4.5rem] sm:mx-0 sm:max-h-[calc(100%-6rem)] sm:w-[26rem]',
          )}
          aria-label={sectorName(inside, sector)}
        >
          <header className="flex items-start gap-2 border-b border-line/70 px-4 py-3">
            <button type="button" onClick={() => setSheet((x) => (x === 'peek' ? 'half' : x === 'half' ? 'full' : 'peek'))} aria-label={t('park.sheetSize')} className="min-w-0 flex-1 text-left">
              <span className="mx-auto mb-1.5 block h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden />
              <h2 className="truncate text-base font-semibold text-fg">{zoneKey ? t(`park.floorRooms.${inside}.${zoneKey}` as MessageKey) : sectorName(inside, sector)}</h2>
              {zoneKey && <p className="text-xs text-muted">{t('park.zoneOpens', { name: sectorName(inside, sector) })}</p>}
              {inside === 'inbox' && sheet !== 'peek' && <p className="text-xs text-muted">{t(`park.inbox.hints.${sector}` as MessageKey)}</p>}
            </button>
            <IconButton
              size="sm"
              label={t('common.close')}
              icon={<X className="h-4 w-4" />}
              onClick={() => {
                setSector(null);
                // Só volta à vista da entrada na câmera livre e no térreo; andando, fica onde está.
                if (camMode === 'orbit' && floors.current === 0 && !zoneKey) engine.current?.focusSector('entry');
                setZoneKey(null);
              }}
            />
          </header>
          <div className={cn('min-h-0 flex-1 overflow-y-auto p-4', sheet === 'peek' && 'hidden sm:block')} style={{ touchAction: 'pan-y' }}>
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

      {instrument && inside && <InstrumentPanel kind={instrument} onPlay={(i) => engine.current?.play(i)} onClose={() => setInstrument(null)} />}
      {elevator && inside && (
        <ElevatorPanel
          floors={Array.from({ length: floors.count }, (_, n) => ({
            name: t(`park.floorNames.f${n}` as MessageKey),
            rooms: n === 0 ? sectors.map((s) => sectorName(inside, s)) : (engine.current?.zones() ?? []).filter((z) => z.level === n).map((z) => t(`park.floorRooms.${inside}.${z.key}` as MessageKey)),
          }))}
          current={floors.current}
          onPick={(n) => {
            setElevator(false);
            engine.current?.rideTo(n);
          }}
          onClose={() => setElevator(false)}
        />
      )}
      {talk && <TalkBubble key={talk.at} name={talk.name} text={`${t(`park.talk.hi${talk.line}` as MessageKey)} ${t(`park.talk.${talk.activity}` as MessageKey)}`} onDone={() => setTalk(null)} />}
      {/* Central de Módulos: botão flutuante (arraste para mudar de lugar) */}
      <FloatingCenterButton hidden={!!(inside && sector)} place={fab} onMove={setFab} onOpen={() => setCenter(true)} label={t('park.center.open')} />
      {center && <ModuleCenter inside={inside} onClose={() => setCenter(false)} onEnter={enterFromCenter} onOpen2D={open2D} />}

    </div>
  );
}

/** Controle de andar na tela (primeira pessoa). */
function Joystick({ onMove, onRun, label, size, side }: { onMove: (x: number, y: number) => void; onRun?: (on: boolean) => void; label: string; size: Stick['size']; side: Stick['side'] }) {
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
    onRun?.(Math.hypot(x, y) > 0.95);
  };
  const end = () => {
    id.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
    onRun?.(false);
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

/**
 * Correr (segure), pular e interagir: do lado oposto ao controle de andar. Respondem no toque
 * (sem esperar soltar) e correr para quando o dedo sai do botão.
 */
function ActionButtons({ side, engine, canInteract }: { side: 'left' | 'right'; engine: MutableRefObject<Engine | null>; canInteract: boolean }) {
  const { t } = useSettings();
  const [running, setRunning] = useState(false);
  const run = (on: boolean) => {
    engine.current?.setRun(on);
    setRunning(on);
  };
  useEffect(() => () => engine.current?.setRun(false), []);
  const btn = 'flex h-14 w-14 select-none items-center justify-center rounded-full bg-black/40 text-white ring-2 ring-white/40 backdrop-blur-sm transition active:scale-95';
  return (
    <div className={cn('absolute bottom-8 flex items-end gap-3 safe-bottom', side === 'right' ? 'right-6' : 'left-6')} style={{ touchAction: 'none' }}>
      <button
        type="button"
        aria-label={t('park.run')}
        aria-pressed={running}
        className={cn(btn, running && 'bg-white/45 ring-white')}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          run(true);
        }}
        onPointerUp={() => run(false)}
        onPointerCancel={() => run(false)}
        onLostPointerCapture={() => run(false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <FastForward className="h-6 w-6" />
      </button>
      <button type="button" aria-label={t('park.jump')} className={btn} onPointerDown={() => engine.current?.jump()}>
        <ChevronsUp className="h-6 w-6" />
      </button>
      <button type="button" aria-label={t('park.interact')} disabled={!canInteract} className={cn(btn, 'h-16 w-16', canInteract ? 'bg-accent/80 ring-white' : 'opacity-40')} onPointerDown={() => canInteract && engine.current?.interact()}>
        <Hand className="h-7 w-7" />
      </button>
    </div>
  );
}

/** Painel do elevador: os andares (com as salas de cada um) como botões de um painel de cabine. */
function ElevatorPanel({ floors, current, onPick, onClose }: { floors: Array<{ name: string; rooms: string[] }>; current: number; onPick: (n: number) => void; onClose: () => void }) {
  const { t } = useSettings();
  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/30 p-3 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label={t('park.elevatorTitle')} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm animate-fade-up overflow-hidden rounded-3xl bg-[#1C2230] text-white shadow-lift ring-1 ring-white/15">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ArrowUpDown className="h-4 w-4 text-accent" aria-hidden />
            {t('park.elevatorTitle')}
          </span>
          <button type="button" aria-label={t('common.close')} onClick={onClose} className="rounded-lg p-1 text-white/70 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="flex max-h-[55vh] flex-col-reverse gap-2 overflow-y-auto p-3">
          {floors.map((f, n) => (
            <li key={n}>
              <button
                type="button"
                disabled={n === current}
                onClick={() => onPick(n)}
                className={cn('flex w-full items-start gap-3 rounded-2xl p-3 text-left ring-1 transition', n === current ? 'bg-white/5 ring-white/10' : 'bg-white/10 ring-white/20 hover:bg-white/15 active:scale-[0.99]')}
              >
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ring-2', n === current ? 'bg-accent text-accent-fg ring-accent' : 'ring-white/40')}>{n === 0 ? t('park.floorNames.f0').slice(0, 1) : n}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {f.name}
                    {n === current && <span className="ml-2 text-xs font-normal text-white/60">{t('park.youAreHere')}</span>}
                  </span>
                  <span className="block text-xs leading-snug text-white/65">{f.rooms.join(' · ')}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Balão de fala de um morador que respondeu ao cumprimento; some sozinho. */
function TalkBubble({ name, text, onDone }: { name: string; text: string; onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, 4500);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[5.5rem] z-10 flex justify-center px-3">
      <div role="status" className="flex max-w-sm animate-fade-up items-start gap-3 rounded-2xl bg-surface/95 px-3 py-2.5 shadow-lift ring-1 ring-line">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">{name.slice(0, 1)}</span>
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-muted">{name}</span>
          <span className="block text-sm text-fg">{text}</span>
        </span>
      </div>
    </div>
  );
}

const HINT_ICON = { use: Hand, sit: Armchair, view: Mountain, tree: TreePine, water: Waves, person: Smile, elevator: ArrowUpDown, enter: LogIn, stand: Footprints } as const;

/** Teclas do computador para o piano (Z…M = 1ª oitava, Q…U = 2ª, I = Dó agudo) e para os pads. */
const PIANO_KEYMAP = 'zsxdcvgbhnjmq2w3er5t6y7ui';
const DRUM_KEYMAP = 'asdf';

/** Piano (duas oitavas) ou bateria (quatro pads) na tela: cada toque soa e mexe a tecla/peça no 3D. */
function InstrumentPanel({ kind, onPlay, onClose }: { kind: 'piano' | 'drums'; onPlay: (i: number) => void; onClose: () => void }) {
  const { t } = useSettings();
  const [down, setDown] = useState<number | null>(null);
  const hit = (i: number) => {
    onPlay(i);
    setDown(i);
    window.setTimeout(() => setDown((d) => (d === i ? null : d)), 160);
  };
  useEffect(() => {
    const map = kind === 'piano' ? PIANO_KEYMAP : DRUM_KEYMAP;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        return onClose();
      }
      const i = map.indexOf(e.key.toLowerCase());
      if (i < 0 || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      hit(i);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [kind]);
  const whites = PIANO_KEYS.map((k, i) => ({ ...k, i })).filter((k) => !k.black);
  return (
    <div className="absolute inset-x-0 bottom-3 z-20 mx-auto w-[calc(100%-1.5rem)] max-w-2xl rounded-2xl bg-black/75 p-3 text-white shadow-lift ring-1 ring-white/20 backdrop-blur-md" role="dialog" aria-label={t(`park.instrument.${kind}`)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t(`park.instrument.${kind}`)}</p>
          <p className="hidden truncate text-xs text-white/70 sm:block">{t(kind === 'piano' ? 'park.instrument.pianoHint' : 'park.instrument.drumsHint')}</p>
        </div>
        <button type="button" onClick={onClose} className="flex items-center gap-1 rounded-xl bg-white/15 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/25">
          <X className="h-4 w-4" aria-hidden />
          {t('park.instrument.close')}
        </button>
      </div>
      {kind === 'piano' ? (
        <div className="relative h-36 select-none touch-none sm:h-40">
          <div className="flex h-full gap-[2px]">
            {whites.map((k) => (
              <button
                key={k.i}
                type="button"
                aria-label={`${k.midi}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  hit(k.i);
                }}
                className={`flex-1 rounded-b-md bg-[#F7F5EF] shadow-inner ring-1 ring-black/30 transition-transform ${down === k.i ? 'translate-y-0.5 bg-[#E2DED3]' : ''}`}
              />
            ))}
          </div>
          {PIANO_KEYS.map((k, i) => {
            if (!k.black) return null;
            const before = PIANO_KEYS.slice(0, i).filter((x) => !x.black).length;
            const w = 100 / whites.length;
            return (
              <button
                key={i}
                type="button"
                aria-label={`${k.midi}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  hit(i);
                }}
                style={{ left: `calc(${before * w}% - ${w * 0.3}%)`, width: `${w * 0.6}%` }}
                className={`absolute top-0 h-[60%] rounded-b-md bg-[#111] ring-1 ring-black ${down === i ? 'bg-[#333]' : ''}`}
              />
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2 select-none touch-none">
          {DRUM_PADS.map((p, i) => (
            <button
              key={p}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                hit(i);
              }}
              className={`h-24 rounded-2xl text-sm font-semibold ring-1 ring-white/30 transition-transform ${down === i ? 'scale-95 bg-brand' : 'bg-white/15'}`}
            >
              {t(`park.instrument.pads.${p}` as MessageKey)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Cartão "o que dá para fazer aqui": ícone, ação e quem/onde; tocar no cartão faz a ação. */
function InteractPrompt({ kind, title, detail, onAct }: { kind: keyof typeof HINT_ICON; title: string; detail?: string; onAct: () => void }) {
  const Icon = HINT_ICON[kind];
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-32 flex justify-center px-3 sm:bottom-36">
      <button
        type="button"
        onClick={onAct}
        className="pointer-events-auto flex max-w-sm animate-fade-up items-center gap-3 rounded-2xl bg-black/65 py-2 pl-2 pr-3 text-left text-white shadow-lift ring-1 ring-white/25 backdrop-blur-md"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand shadow-glow">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{title}</span>
          {detail && <span className="block truncate text-xs text-white/75">{detail}</span>}
        </span>
        <kbd className="ml-1 hidden rounded-md bg-white/15 px-1.5 py-0.5 text-[0.7rem] font-semibold ring-1 ring-white/30 md:block">E</kbd>
      </button>
    </div>
  );
}

function Range({ label, min, max, value, onChange, unit = '×' }: { label: string; min: number; max: number; value: number; onChange: (v: number) => void; unit?: '×' | '%' }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-fg">
      <span className="flex justify-between">
        {label}
        <span className="tabular-nums text-muted">{unit === '%' ? `${Math.round(value * 100)}%` : `${value.toFixed(1)}×`}</span>
      </span>
      <input type="range" min={min} max={max} step={unit === '%' ? 0.05 : 0.1} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[rgb(var(--accent))]" />
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

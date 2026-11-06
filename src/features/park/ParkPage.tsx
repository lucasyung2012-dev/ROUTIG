import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Footprints, Home, LogIn, LogOut, Menu, Navigation, SlidersHorizontal, X } from 'lucide-react';
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
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import type { CamMode } from './camera';
import { createEngine, type Engine, type InteriorFactory, type Stats } from './engine';
import type { Quality, TimeOfDay } from './world';
import { createInboxInterior, DESTINATIONS, INBOX_SECTORS, type InboxSector } from './interiors/inbox';
import { createDashboardInterior, createProfileInterior, createSettingsInterior, DASHBOARD_SECTORS, PROFILE_SECTORS, SETTINGS_ROOMS, type DashboardData, type DashboardSector, type ProfileSector, type SettingsRoom } from './interiors/central';
import { InboxPanel } from './panels/InboxPanel';
import { DashboardPanel, ProfilePanel, SettingsPanel } from './panels/CentralPanels';
import { receptionData } from './receptionData';

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
};
/** Setores cujo painel é uma tela grande (o módulo inteiro dentro do ambiente). */
const WIDE = new Set(['dashboard:overview', 'dashboard:panels', 'profile:interests', 'profile:trajectory', 'profile:personalize', 'settings:identity', 'settings:appearance', 'settings:modules', 'settings:privacy', 'settings:data', 'settings:help']);

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
  const [quality, setQuality] = useState<Quality>(autoQuality);
  const [time, setTime] = useState<TimeOfDay>(timeNow);
  const [rain, setRain] = useState(false);
  const [labels, setLabels] = useState(true);
  const [camMode, setCamMode] = useState<CamMode>('orbit');
  const [stats, setStats] = useState<Stats | null>(null);
  const [showStats, setShowStats] = useState(true);
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
  useEffect(() => engine.current?.setRain(rain), [rain]);
  useEffect(() => engine.current?.setCamMode(camMode), [camMode]);
  useEffect(() => {
    if (inboxData) engine.current?.setData('inbox', inboxData);
  }, [inboxData]);
  // Só redesenha a tela do Dashboard quando os números mudam.
  const dashKey = JSON.stringify(dashData);
  useEffect(() => {
    if (dashData) engine.current?.setData('dashboard', dashData);
  }, [dashKey]);

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
    <div className="fixed inset-0 overflow-hidden bg-[#0B1026] text-fg" style={{ touchAction: 'none' }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label={t('park.canvas')} />

      <div ref={labelsRef} className={labels && !inside ? 'pointer-events-none absolute inset-0' : 'hidden'} aria-hidden>
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
            <IconButton label={camMode === 'walk' ? t('park.freeCam') : t('park.walk')} icon={<Footprints className="h-5 w-5" />} active={camMode === 'walk'} onClick={() => setCamMode((m) => (m === 'walk' ? 'orbit' : 'walk'))} className="bg-surface/90" />
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
        <div className="absolute right-3 top-[4.25rem] z-10 flex w-72 flex-col gap-3 rounded-2xl bg-surface p-4 shadow-lift ring-1 ring-line safe-top" role="dialog" aria-label={t('park.options')}>
          <Segmented<TimeOfDay> label={t('park.time')} value={time} onChange={setTime} options={(['day', 'dusk', 'night'] as const).map((v) => ({ value: v, label: t(`park.times.${v}`) }))} className="w-full" />
          <Segmented<Quality> label={t('park.quality')} value={quality} onChange={setQuality} options={(['low', 'medium', 'high'] as const).map((q) => ({ value: q, label: t(`park.q.${q}`) }))} className="w-full" />
          <Switch label={t('park.rain')} checked={rain} onChange={setRain} />
          <Switch label={t('park.labels')} checked={labels} onChange={setLabels} />
          <Switch label={t('park.showStats')} checked={showStats} onChange={setShowStats} />
        </div>
      )}

      {/* Medições (para os testes de desempenho) */}
      {showStats && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-xl bg-black/60 px-3 py-2 font-mono text-[0.7rem] leading-relaxed text-white safe-bottom">
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

      {/* Primeira pessoa: controle de andar (toque) e dica */}
      {camMode === 'walk' && <Joystick onMove={(x, y) => engine.current?.setMove(x, y)} label={t('park.joystick')} />}
      {camMode === 'walk' && !near && <p className="pointer-events-none absolute bottom-3 right-3 hidden max-w-xs rounded-xl bg-black/50 px-3 py-2 text-[0.7rem] text-white md:block">{t('park.walkHint')}</p>}
      {camMode === 'walk' && near && !inside && (
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
            wide ? 'max-h-[70vh] max-w-4xl md:inset-x-6 md:bottom-4 md:top-[8.5rem] md:max-h-none' : 'max-h-[50vh] max-w-lg sm:bottom-auto sm:left-auto sm:right-3 sm:top-[8.5rem] sm:mx-0 sm:max-h-[calc(100%-10rem)] sm:w-[26rem]',
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
          </div>
        </section>
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
function Joystick({ onMove, label }: { onMove: (x: number, y: number) => void; label: string }) {
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
      className="absolute bottom-8 left-6 h-32 w-32 rounded-full bg-black/35 ring-2 ring-white/40 backdrop-blur-sm safe-bottom"
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        id.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => id.current === e.pointerId && update(e)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full bg-white/80 shadow-lift" style={{ transform: `translate(calc(-50% + ${knob.x * 36}px), calc(-50% + ${knob.y * 36}px))` }} />
    </div>
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

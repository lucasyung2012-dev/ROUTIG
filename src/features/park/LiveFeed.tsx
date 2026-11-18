import { useEffect, useMemo, useState, type MutableRefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ModuleId } from '@/app/modules';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { archive, convertToLibrary, reopen } from '@/data/inboxRepo';
import { answerVocab } from '@/data/languagesRepo';
import { createNote, emptyNoteInput, softDeleteNote } from '@/data/notesRepo';
import { projectInputOf, updateProject } from '@/data/projectsRepo';
import { saveActivity, softDeleteActivity } from '@/data/sportsRepo';
import { setSessionStatus } from '@/data/studyPlanRepo';
import { formatDateKey, startOfWeek, toDateKey, todayKey, type DateKey } from '@/domain/dates';
import { isOpenGoal, type Goal } from '@/domain/goals';
import { suggest, type InboxItem } from '@/domain/inbox';
import { folderTree, type LibraryItem } from '@/domain/library';
import { textToBlocks } from '@/domain/notes';
import { buildingById } from '@/domain/park';
import { isClosedProject, type Milestone } from '@/domain/projects';
import { ACTIVITY_TYPES, emptyActivityInput, type ActivityType } from '@/domain/sports';
import { useAcademyData } from '@/features/academy/useAcademyData';
import { useFocus } from '@/features/focus/FocusProvider';
import { CheckinDialog, GoalDialog } from '@/features/goals/goalsUi';
import { useGoals } from '@/features/goals/useGoals';
import { ConvertDialog } from '@/features/inbox/InboxPage';
import { useLanguages } from '@/features/languages/useLanguages';
import { displayTerm } from '@/features/languages/vocabUtils';
import { ItemDialog } from '@/features/library/libraryUi';
import { useMusic } from '@/features/music/useMusic';
import { useNotesData } from '@/features/notes/useNotesData';
import { useProjectsData } from '@/features/projects/useProjectsData';
import { useSports } from '@/features/sports/useSports';
import { cn } from '@/ui/cn';
import { useToast } from '@/ui/toast';
import { useInsightMetrics } from './FloorFeed';
import { canCompare } from './interiors/boards';
import type { WallLive, WallRowView } from './interiors/live3d';
import type { DeckObj, LampObj, MaquetteObj, NotebookObj, OrbObj, ShelfObj, TrayObj } from './interiors/objects3d';
import { CalendarObjects, FinanceObjects, ObjectPop, popBtn, popChip, popInput, TasksObjects, useObjHandler, useObjSend, type ObjProps } from './ObjectFeed';
import { presetStationState } from './panels/north/station';
import {
  deckQueue,
  focusTap,
  goalWall,
  inboxTray,
  lampState,
  lampTap,
  languagesWall,
  milestoneList,
  musicWall,
  nextMilestone,
  projectWall,
  recentLibrary,
  recentNotes,
  sportsToday,
  studyToday,
  WALL_KIND,
  type Capped,
  type FocusTap,
  type LampTap,
} from './live';

/**
 * "3D de verdade" nos outros prédios (seção 28): os dados reais da parede de ação do prédio em que se
 * está (live3d.ts, `listWall`) e a ação de cada linha. Lê o mesmo que as estações (os mesmos hooks) e
 * age pelos mesmos repositórios: acompanhamento do objetivo (CheckinDialog), marco do projeto
 * (updateProject), relógio do Focus compartilhado (useFocus), arquivar do Inbox (com desfazer),
 * sessão de estudo (setSessionStatus), nota aberta na mesa do Notes e material no ItemDialog. As
 * paredes de Idiomas, Música, Esportes e Insights só mostram (o toque abre a estação da sala).
 * Só o prédio aberto lê os dados dele; a parede só é entregue de novo quando o texto muda.
 *
 * Os objetos de ação do mesmo prédio (interiors/objects3d.ts; ObjectFeed.tsx) ficam junto da parede,
 * com os mesmos dados: a placa "Novo objetivo" (GoalDialog), a maquete dos projetos (os marcos, pelo
 * mesmo caminho da parede), as luminárias do Focus (a sessão compartilhada), a bandeja de chegadas
 * (a conversão do Inbox: ConvertDialog, arquivar e Library), o caderno do Notes (createNote), as
 * lombadas dos novos (ItemDialog), o baralho do Idiomas (answerVocab), as faixas das modalidades
 * (saveActivity) e as esferas do Insights (o detalhe do indicador). Tasks, Calendar e Finanças não
 * têm parede: os objetos deles moram no ObjectFeed.
 */

/** Ação de uma linha da parede (kind = prefixo de WALL_KIND, ref = id do registro). */
export interface WallHandler {
  /** Faz a ação real; false = não há o que fazer aqui (o ParkPage abre a estação da sala). */
  act: (kind: string, ref: string) => boolean;
  /** Texto da dica da linha; null = o genérico "abrir a estação". */
  title: (kind: string, ref: string) => string | null;
}

interface WallProps extends ObjProps {
  onWall: (w: WallLive) => void;
  handler: MutableRefObject<WallHandler | null>;
  openRoom: (sector: string, zone: string | null, fresh?: boolean) => void;
}

export function LiveFeed({ id, financeLocked, vaultOpen, ...p }: WallProps & { id: ModuleId; financeLocked: boolean; vaultOpen: boolean }) {
  switch (id) {
    case 'goals':
      return <GoalsWall {...p} />;
    case 'projects':
      return <ProjectsWall {...p} />;
    case 'focus':
      return <FocusWall {...p} />;
    case 'inbox':
      return <InboxWall {...p} />;
    case 'insights':
      return <InsightsWall {...p} financeLocked={financeLocked} />;
    case 'academy':
      return <AcademyWall {...p} />;
    case 'notes':
      return <NotesWall {...p} />;
    case 'library':
      return <LibraryWall {...p} />;
    case 'languages':
      return <LanguagesWall {...p} />;
    case 'music':
      return <MusicWall {...p} />;
    case 'sports':
      return <SportsWall {...p} />;
    case 'tasks':
      return <TasksObjects {...p} />;
    case 'calendar':
      return <CalendarObjects {...p} />;
    case 'finance':
      // Os saldos só com a porta do cofre aberta (PIN digitado): trancado ou sem PIN, o quadro apaga.
      return <FinanceObjects {...p} financeLocked={financeLocked || !vaultOpen} />;
    default:
      return null;
  }
}

/* ---------- Peças comuns ---------- */

const accentOf = (id: ModuleId) => buildingById(id)?.color ?? '#94A3B8';
const dayOfIso = (iso: string) => toDateKey(new Date(iso));

function row(id: string, title: string, sub: string, color: string, over: Partial<WallRowView> = {}): WallRowView {
  return { id, title, sub, color, bar: null, check: null, more: false, ...over };
}

function useWallCtx() {
  const { t, settings } = useSettings();
  const today = todayKey();
  const day = (d: DateKey) => (d === today ? t('tasks.due.today') : formatDateKey(d, settings.locale, { day: 'numeric', month: 'short' }));
  return { t, settings, today, day, weekFrom: startOfWeek(today, settings.weekStartsOn) };
}

/** Linhas de uma lista cortada: as reais e, se sobrou, o "+N" (abre a estação). */
function rowsOf<T>(c: Capped<T>, kind: string, map: (x: T) => WallRowView, more: (n: number) => string, open: string): WallRowView[] {
  const rows = c.shown.map(map);
  if (c.more > 0) rows.push(row(`${kind}:`, more(c.more), open, '#64748B', { more: true }));
  return rows;
}

/** Entrega a parede (null = ainda lendo) só quando o texto muda. */
function useWallSend(w: WallLive | null, onWall: (w: WallLive) => void) {
  const key = w ? JSON.stringify(w) : '';
  useEffect(() => {
    if (w) onWall(w);
    // O texto (key) decide; a função muda a cada render do ParkPage.
  }, [key]);
}

/** Deixa a ação desta parede com o ParkPage (a de agora, com os dados de agora). */
function useHandler(handler: MutableRefObject<WallHandler | null>, h: WallHandler) {
  useEffect(() => {
    handler.current = h;
    return () => {
      if (handler.current === h) handler.current = null;
    };
  });
}

/* ---------- Goals: o progresso real; tocar registra um acompanhamento ---------- */

function GoalsWall({ onWall, handler, onObj, objHandler }: WallProps) {
  const c = useWallCtx();
  const { t } = c;
  const data = useGoals();
  const [checkin, setCheckin] = useState<Goal | null>(null);
  const [creating, setCreating] = useState(false);
  const kind = WALL_KIND.goals!;
  const wall = useMemo((): WallLive | null => {
    if (data.loading) return null;
    const g = goalWall(data.goals, data.checkinsOf, c.today);
    const accent = accentOf('goals');
    return {
      title: t('park.live.goalsTitle'),
      side: t('park.live.openCount', { count: g.shown.length + g.more }),
      rows: rowsOf(
        g,
        kind,
        (x) =>
          row(
            `${kind}:${x.id}`,
            x.name,
            [x.share === null ? t('park.live.noMeasure') : `${Math.round(x.share * 100)}%`, x.deadline ? t(x.overdue ? 'park.live.overdueSince' : 'park.live.until', { date: c.day(x.deadline) }) : ''].filter(Boolean).join(' · '),
            x.overdue ? '#F87171' : accent,
            { bar: x.share },
          ),
        (n) => t('park.live.more', { count: n }),
        t('park.live.openStation'),
      ),
      empty: t('park.live.goalsEmpty'),
      accent,
      clock: null,
    };
  }, [data, c.today, c.settings.locale, t]);
  useWallSend(wall, onWall);
  useHandler(handler, {
    act: (_k, ref) => {
      const g = data.byId.get(ref);
      if (!g || g.deletedAt || !isOpenGoal(g)) return false;
      // O mesmo acompanhamento da estação (valor do indicador, nível ou reflexão).
      setCheckin(g);
      return true;
    },
    title: (_k, ref) => {
      const g = data.byId.get(ref);
      return g ? t('park.live.hintGoal', { name: g.name }) : null;
    },
  });
  // Placa "Novo objetivo" ao lado da parede: o mesmo diálogo de criar da estação e do módulo.
  useObjSend({ title: t('park.live.goalNew'), sub: t('park.live.goalNewSub') }, onObj);
  useObjHandler(objHandler, {
    act: (k) => {
      if (k !== 'gnew') return false;
      setCreating(true);
      return true;
    },
    title: (k) => (k === 'gnew' ? t('park.live.hintGoalNew') : null),
  });
  return (
    <>
      {checkin && <CheckinDialog goal={checkin} onClose={() => setCheckin(null)} />}
      {creating && <GoalDialog onClose={() => setCreating(false)} />}
    </>
  );
}

/* ---------- Projects: os ativos; tocar conclui o próximo marco ---------- */

function ProjectsWall({ onWall, handler, onObj, objHandler, project, openRoom }: WallProps) {
  const c = useWallCtx();
  const { t } = c;
  const toast = useToast();
  const data = useProjectsData();
  const [pop, setPop] = useState<string | null>(null);
  const kind = WALL_KIND.projects!;
  const wall = useMemo((): WallLive | null => {
    if (data.loading) return null;
    const p = projectWall(data.projects, data.progressOf);
    return {
      title: t('park.live.projectsTitle'),
      side: t('park.live.activeCount', { count: p.shown.length + p.more }),
      rows: rowsOf(
        p,
        kind,
        (x) =>
          row(
            `${kind}:${x.id}`,
            x.percent === null ? x.name : `${x.name} · ${x.percent}%`,
            x.next ? [t('park.live.nextMilestone', { title: x.next.title }), x.next.date ? c.day(x.next.date) : ''].filter(Boolean).join(' · ') : x.percent === null ? t('park.live.noProgress') : t('park.live.noMilestone'),
            x.color,
            { bar: x.percent === null ? null : x.percent / 100 },
          ),
        (n) => t('park.live.more', { count: n }),
        t('park.live.openStation'),
      ),
      empty: t('park.live.projectsEmpty'),
      accent: accentOf('projects'),
      clock: null,
    };
  }, [data, c.today, c.settings.locale, t]);
  useWallSend(wall, onWall);
  const fail = () => toast.show(t('errors.saveFailed'), 'error');
  /** Marca (ou desmarca) o marco pelo mesmo caminho da estação e da página do projeto. */
  const setDone = async (projectId: string, m: Pick<Milestone, 'id'>, done: boolean) => {
    const cur = await getDb().projects.get(projectId);
    if (!cur || cur.deletedAt) return;
    await updateProject(cur.id, { ...projectInputOf(cur), milestones: cur.milestones.map((x) => (x.id === m.id ? { ...x, done } : x)) });
  };
  useHandler(handler, {
    act: (_k, ref) => {
      const pr = data.byId.get(ref);
      const m = pr && !pr.deletedAt && !isClosedProject(pr.status) ? nextMilestone(pr) : null;
      // Sem marco em aberto: a estação (lá se cria o marco ou se mexe nas tarefas).
      if (!pr || !m) return false;
      void setDone(pr.id, m, true).then(() => toast.show(t('park.live.milestoneDone', { title: m.title }), 'success', { label: t('notes.undo'), run: () => void setDone(pr.id, m, false).catch(fail) }), fail);
      return true;
    },
    title: (_k, ref) => {
      const pr = data.byId.get(ref);
      const m = pr ? nextMilestone(pr) : null;
      return m ? t('park.live.hintMilestone', { title: m.title }) : null;
    },
  });
  // Maquete na mesa da mesma sala: um bloco por projeto ativo, da altura do progresso real.
  const maq = useMemo((): MaquetteObj | null => {
    if (data.loading) return null;
    const rows = projectWall(data.projects, data.progressOf, 99).shown.slice(0, 6);
    return { blocks: rows.map((x) => ({ id: x.id, name: x.name, color: x.color, percent: x.percent })), empty: t('park.live.projectsEmpty') };
  }, [data, t]);
  useObjSend(maq, onObj, !!maq);
  useObjHandler(objHandler, {
    act: (k, ref) => {
      const pr = k === 'maq' ? data.byId.get(ref) : undefined;
      if (!pr || pr.deletedAt) return false;
      setPop(ref);
      return true;
    },
    title: (k, ref) => {
      const pr = k === 'maq' ? data.byId.get(ref) : undefined;
      return pr ? t('park.live.hintMaquette', { name: pr.name }) : null;
    },
  });
  const popPr = pop ? data.byId.get(pop) : undefined;
  if (!popPr) return null;
  const ms = milestoneList(popPr);
  /** Tocar no marco: conclui (ou reabre o já feito), com desfazer, como na parede. */
  const toggle = (m: Milestone) => {
    const to = !m.done;
    void setDone(popPr.id, m, to).then(() => toast.show(t(to ? 'park.live.milestoneDone' : 'park.live.milestoneReopened', { title: m.title }), 'success', { label: t('notes.undo'), run: () => void setDone(popPr.id, m, !to).catch(fail) }), fail);
  };
  return (
    <ObjectPop at={`maq:${popPr.id}`} project={project} title={t('park.live.milestonesOf', { name: popPr.name })} onClose={() => setPop(null)}>
      {ms.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-white/80">{t('park.live.noMilestones')}</p>
          <button
            type="button"
            className={cn(popBtn(), 'self-end')}
            onClick={() => {
              setPop(null);
              openRoom('studio', 'tracking');
            }}
          >
            {t('park.live.openStation')}
          </button>
        </div>
      ) : (
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {ms.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => toggle(m)} aria-pressed={m.done} className="flex w-full items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-left text-sm ring-1 ring-inset ring-white/15 hover:bg-white/10">
                <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[0.65rem]', m.done ? 'border-emerald-400 bg-emerald-400/30' : 'border-white/60')} aria-hidden>
                  {m.done ? '✓' : ''}
                </span>
                <span className={cn('min-w-0 flex-1 truncate', m.done && 'text-white/60 line-through')}>{m.title}</span>
                {m.date && <span className="shrink-0 text-xs text-white/60">{c.day(m.date)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </ObjectPop>
  );
}

/* ---------- Focus: o relógio da sessão compartilhada e as sessões de hoje ---------- */

function FocusWall({ onWall, handler, openRoom, onObj, objHandler }: WallProps) {
  const c = useWallCtx();
  const { t } = c;
  const toast = useToast();
  const focus = useFocus();
  const sessions = useLiveQuery(() => getDb().focusSessions.where('date').equals(c.today).filter((s) => !s.deletedAt).toArray(), [c.today]);
  const kind = WALL_KIND.focus!;
  const tap: FocusTap = focusTap(focus.timer, focus.ended);
  const tapLabel = (x: FocusTap) => (x === 'open' ? t(focus.timer ? 'park.live.focusTaps.save' : 'park.live.focusTaps.open') : t(`park.live.focusTaps.${x}`));
  const wall = useMemo((): WallLive | null => {
    if (!focus.ready || !sessions) return null;
    const list = [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const shown = list.length > 3 ? list.slice(0, 2) : list;
    const rows = shown.map((s) => row('', t(`focus.kinds.${s.kind}`), [t('park.live.minutes', { count: s.actualMin }), s.completed ? t('park.live.focusDone') : ''].filter(Boolean).join(' · '), '#818CF8'));
    if (list.length > shown.length) rows.push(row(`${kind}:`, t('park.live.more', { count: list.length - shown.length }), t('park.live.openStation'), '#64748B', { more: true }));
    return {
      title: t('park.live.focusTitle'),
      side: t('park.live.focusToday', { count: list.reduce((a, s) => a + s.actualMin, 0) }),
      rows,
      empty: t('park.live.focusEmpty'),
      accent: accentOf('focus'),
      clock: {
        id: `${kind}:clock`,
        timer: focus.timer,
        states: { idle: t('park.live.focusStates.idle'), running: t('park.live.focusStates.running'), paused: t('park.live.focusStates.paused'), waiting: t('park.live.focusStates.waiting') },
        tap: tapLabel(tap),
      },
    };
    // O relógio anda sozinho na parede: só o timer (não o `now` do Focus) muda o que é entregue.
  }, [focus.ready, focus.timer, focus.ended, sessions, t]);
  useWallSend(wall, onWall);
  useHandler(handler, {
    act: (_k, ref) => {
      if (ref !== 'clock') return false;
      // As mesmas ações do botão da estação e da pílula do Focus no parque.
      if (tap === 'pause') focus.pause();
      else if (tap === 'resume') focus.resume();
      else if (tap === 'next') focus.startNext();
      // Sem sessão (ou terminada): a estação do Focus, onde se escolhe o modo ou se salva.
      else openRoom('garden', null);
      return true;
    },
    title: (_k, ref) => (ref === 'clock' ? tapLabel(tap) : null),
  });
  // Luminárias das salas individuais e das cabines: acesas com a sessão correndo; tocar acende
  // (começa uma sessão), apaga (pausa) ou continua, pela mesma sessão compartilhada do relógio.
  const lamp: LampObj | null = focus.ready ? { state: lampState(focus.timer) } : null;
  useObjSend(lamp, onObj, !!lamp);
  const lampNow: LampTap = lampTap(focus.timer, focus.ended);
  const lampLabel = (x: LampTap) => t(`park.live.lampTaps.${x === 'open' ? (focus.timer ? 'save' : 'start') : x}`);
  useObjHandler(objHandler, {
    act: (k) => {
      if (k !== 'lamp') return false;
      if (lampNow === 'start') {
        // A mesma sessão que a estação começa com o padrão dela (Pomodoro de estudo, sem som).
        focus.start({ mode: 'pomodoro', kind: 'study', taskId: null, ref: null, environment: 'nature', sound: 'none' });
        toast.show(t('park.live.focusStarted'), 'success', { label: t('notes.undo'), run: () => focus.discard() });
      } else if (lampNow === 'pause') focus.pause();
      else if (lampNow === 'resume') focus.resume();
      else if (lampNow === 'next') focus.startNext();
      // Terminada, esperando ser salva: a estação (lá se salva ou descarta).
      else openRoom('garden', null);
      return true;
    },
    title: (k) => (k === 'lamp' ? lampLabel(lampNow) : null),
  });
  return null;
}

/* ---------- Inbox: as chegadas em aberto; tocar arquiva (com desfazer) ---------- */

function InboxWall({ onWall, handler, onObj, objHandler, project }: WallProps) {
  const c = useWallCtx();
  const { t } = c;
  const toast = useToast();
  const items = useLiveQuery(() => getDb().inbox.toArray(), []);
  const [pick, setPick] = useState<string | null>(null);
  const [convert, setConvert] = useState<{ item: InboxItem; type: 'task' | 'note' } | null>(null);
  const kind = WALL_KIND.inbox!;
  const tray = useMemo(() => (items ? inboxTray(items, c.today) : null), [items, c.today]);
  const wall = useMemo((): WallLive | null => {
    if (!tray) return null;
    return {
      title: t('park.live.inboxTitle'),
      side: t('park.live.openCount', { count: tray.shown.length + tray.more }),
      rows: rowsOf(
        tray,
        kind,
        (x) => row(`${kind}:${x.id}`, x.title || t('park.inbox.untitled'), c.day(dayOfIso(x.createdAt)), accentOf('inbox')),
        (n) => t('park.live.more', { count: n }),
        t('park.live.openStation'),
      ),
      empty: t('park.live.inboxEmpty'),
      accent: accentOf('inbox'),
      clock: null,
    };
  }, [tray, c.today, c.settings.locale, t]);
  useWallSend(wall, onWall);
  const titleOf = (ref: string) => {
    const x = tray?.shown.find((i) => i.id === ref);
    return x ? x.title || t('park.inbox.untitled') : null;
  };
  /** O mesmo "arquivar" da triagem; desfazer reabre o item. */
  const archiveItem = (ref: string, name: string) =>
    void archive(ref).then(
      () => toast.show(t('park.live.archived', { title: name }), 'success', { label: t('notes.undo'), run: () => void reopen(ref).catch(() => toast.show(t('errors.saveFailed'), 'error')) }),
      () => toast.show(t('errors.saveFailed'), 'error'),
    );
  useHandler(handler, {
    act: (_k, ref) => {
      const name = titleOf(ref);
      if (name === null) return false;
      archiveItem(ref, name);
      return true;
    },
    title: (_k, ref) => {
      const name = titleOf(ref);
      return name === null ? null : t('park.live.hintArchive', { title: name });
    },
  });
  // Bandeja de chegadas no balcão do térreo: um cartão por item em aberto; tocar escolhe o destino.
  const openItems = useMemo(() => (items ?? []).filter((i) => !i.deletedAt && i.status === 'open'), [items]);
  const nameOf = (i: InboxItem) => i.text || i.fileName || i.url || t('park.inbox.untitled');
  const trayObj = useMemo((): TrayObj | null => {
    if (!items) return null;
    const tr = inboxTray(items, c.today, 6);
    return {
      title: t('park.live.inboxTitle'),
      cards: tr.shown.map((x) => ({ id: x.id, title: x.title || t('park.inbox.untitled'), sub: c.day(dayOfIso(x.createdAt)) })),
      more: tr.more > 0 ? t('park.live.more', { count: tr.more }) : '',
      empty: t('park.live.inboxEmpty'),
    };
  }, [items, c.today, c.settings.locale, t]);
  useObjSend(trayObj, onObj, !!trayObj);
  useObjHandler(objHandler, {
    act: (k, ref) => {
      if (k !== 'tray' || !openItems.some((i) => i.id === ref)) return false;
      setPick(ref);
      return true;
    },
    title: (k, ref) => {
      const it = k === 'tray' ? openItems.find((i) => i.id === ref) : undefined;
      return it ? t('park.live.hintTray', { title: nameOf(it) }) : null;
    },
  });
  const picked = pick ? openItems.find((i) => i.id === pick) : undefined;
  return (
    <>
      {picked && (
        <ObjectPop at={`tray:${picked.id}`} project={project} title={t('park.live.trayChoose')} onClose={() => setPick(null)}>
          <p className="mb-2 line-clamp-2 text-xs text-white/80">{nameOf(picked)}</p>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              className={popBtn(true)}
              onClick={() => {
                setPick(null);
                setConvert({ item: picked, type: 'task' });
              }}
            >
              {t('park.live.toTask')}
            </button>
            <button
              type="button"
              className={popBtn(true)}
              onClick={() => {
                setPick(null);
                setConvert({ item: picked, type: 'note' });
              }}
            >
              {t('park.live.toNote')}
            </button>
            <button
              type="button"
              className={popBtn()}
              onClick={() => {
                setPick(null);
                archiveItem(picked.id, nameOf(picked));
              }}
            >
              {t('park.live.toArchive')}
            </button>
          </div>
          {(picked.fileId || picked.url) && (
            <button
              type="button"
              className={cn(popBtn(), 'mt-1.5 w-full')}
              onClick={() => {
                setPick(null);
                // O mesmo "guardar na Library" da página do Inbox (arquivo ou link).
                void convertToLibrary(picked.id).then(
                  (r) => toast.show(r.existed ? t('inbox.inLibraryAlready') : t('inbox.savedToLibrary'), 'success'),
                  () => toast.show(t('errors.saveFailed'), 'error'),
                );
              }}
            >
              {t('park.live.toLibrary')}
            </button>
          )}
        </ObjectPop>
      )}
      {/* A mesma conversão da página do Inbox (prévia, duplicados e confirmação). */}
      {convert && <ConvertDialog item={convert.item} suggestion={suggest(convert.item)} type={convert.type} openItems={openItems} onClose={() => setConvert(null)} />}
    </>
  );
}

/* ---------- Insights: só os indicadores reais (Finanças trancado não mostra número) ---------- */

function InsightsWall({ onWall, handler, financeLocked, onObj, objHandler, project, openRoom }: WallProps & { financeLocked: boolean }) {
  const c = useWallCtx();
  const { t } = c;
  const metrics = useInsightMetrics(financeLocked);
  const [orb, setOrb] = useState<string | null>(null);
  const kind = WALL_KIND.insights!;
  const wall = useMemo((): WallLive | null => {
    if (!metrics) return null;
    const m = metrics.length > 6 ? metrics.slice(0, 5) : metrics;
    const rows = m.map((x) =>
      row(
        `${kind}:${x.mod}`,
        t(`modules.${x.mod}`),
        x.locked ? t('park.floorBoards.lockedShort') : x.has ? [`${x.now} ${x.label}`, canCompare(x) ? t('park.live.lastWeek', { count: x.before }) : ''].filter(Boolean).join(' · ') : t('insights.noData'),
        x.locked ? '#475569' : accentOf(x.mod),
      ),
    );
    if (metrics.length > m.length) rows.push(row(`${kind}:`, t('park.live.more', { count: metrics.length - m.length }), t('park.live.openStation'), '#64748B', { more: true }));
    return { title: t('park.floorBoards.insights.thisWeek'), side: '', rows, empty: t('insights.allPrivate'), accent: accentOf('insights'), clock: null };
  }, [metrics, t]);
  useWallSend(wall, onWall);
  useHandler(handler, {
    // Indicador não tem ação própria: o toque abre a estação da sala (ParkPage).
    act: () => false,
    title: (_k, ref) => {
      const m = metrics?.find((x) => x.mod === ref);
      return m ? t('park.live.hintOpenItem', { name: t(`modules.${m.mod}`) }) : null;
    },
  });
  // Esferas em volta do núcleo: uma por indicador real (os escondidos já ficam de fora; Finanças
  // trancado aparece trancado, sem número); tocar mostra o detalhe.
  const orbObj = useMemo((): OrbObj | null => (metrics ? { orbs: metrics.map((x) => ({ id: x.mod, color: accentOf(x.mod), has: !x.locked && x.has, locked: !!x.locked })), still: c.settings.reduceMotion } : null), [metrics, c.settings.reduceMotion]);
  useObjSend(orbObj, onObj, !!orbObj);
  useObjHandler(objHandler, {
    act: (k, ref) => {
      if (k !== 'orb' || !metrics?.some((x) => x.mod === ref)) return false;
      setOrb(ref);
      return true;
    },
    title: (k, ref) => {
      const m = k === 'orb' ? metrics?.find((x) => x.mod === ref) : undefined;
      return m ? t('park.live.hintOrb', { name: t(`modules.${m.mod}`) }) : null;
    },
  });
  const om = orb ? metrics?.find((x) => x.mod === orb) : undefined;
  if (!om) return null;
  return (
    <ObjectPop at={`orb:${om.mod}`} project={project} title={t(`modules.${om.mod}`)} onClose={() => setOrb(null)}>
      {om.locked ? (
        <p className="text-sm text-white/80">{t('park.floorBoards.lockedShort')}</p>
      ) : !om.has ? (
        <p className="text-sm text-white/80">{t('insights.noData')}</p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-white/70">{t('park.live.orbThisWeek')}</p>
          <p className="text-2xl font-semibold tabular-nums">
            {om.now} <span className="text-sm font-normal text-white/70">{om.label}</span>
          </p>
          <p className="text-xs text-white/80">{canCompare(om) ? t('park.live.lastWeek', { count: om.before }) : t('park.floorBoards.insights.cantCompare')}</p>
        </div>
      )}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          className={popBtn()}
          onClick={() => {
            setOrb(null);
            openRoom('overview', null);
          }}
        >
          {t('park.live.openStation')}
        </button>
      </div>
    </ObjectPop>
  );
}

/* ---------- Academy: as sessões de estudo de hoje; tocar conclui (ou volta a planejada) ---------- */

function AcademyWall({ onWall, handler }: WallProps) {
  const c = useWallCtx();
  const { t } = c;
  const toast = useToast();
  const navigate = useNavigate();
  const data = useAcademyData();
  const sessions = useLiveQuery(() => getDb().studySessions.where('date').equals(c.today).toArray(), [c.today]);
  const kind = WALL_KIND.academy!;
  const study = useMemo(() => (sessions && !data.loading ? studyToday(sessions.filter((s) => data.subjectById.has(s.subjectId)), c.today) : null), [sessions, data, c.today]);
  const wall = useMemo((): WallLive | null => {
    if (!study) return null;
    return {
      title: t('park.live.studyTitle'),
      side: t('park.live.todayCount', { count: study.shown.length + study.more }),
      rows: rowsOf(
        study,
        kind,
        (s) => {
          const sub = data.subjectById.get(s.subjectId);
          // O nome da disciplina tem ação própria (abre a disciplina); o resto da linha conclui o estudo.
          return row(`${kind}:${s.id}`, sub?.name ?? '', [s.time ?? '', t('park.live.minutes', { count: s.min })].filter(Boolean).join(' · '), sub?.color ?? accentOf('academy'), { check: s.done, ...(sub ? { nameId: `${kind}:sub.${sub.id}` } : {}) });
        },
        (n) => t('park.live.more', { count: n }),
        t('park.live.openStation'),
      ),
      empty: t('park.live.studyEmpty'),
      accent: accentOf('academy'),
      clock: null,
    };
  }, [study, data, t]);
  useWallSend(wall, onWall);
  const find = (ref: string) => {
    const s = study?.shown.find((x) => x.id === ref);
    return s ? { s, name: data.subjectById.get(s.subjectId)?.name ?? '' } : null;
  };
  useHandler(handler, {
    act: (_k, ref) => {
      if (ref.startsWith('sub.')) {
        // A disciplina no módulo Academy (a mesma página que a estação abre).
        const id = ref.slice(4);
        if (!data.subjectById.has(id)) return false;
        navigate(`/academy/subjects/${id}`);
        return true;
      }
      const f = find(ref);
      if (!f) return false;
      const fail = () => toast.show(t('errors.saveFailed'), 'error');
      // O mesmo "concluir" / "voltar para planejada" do plano de estudos da estação.
      if (f.s.done) void setSessionStatus(ref, 'planned').catch(fail);
      else void setSessionStatus(ref, 'done').then(() => toast.show(t('park.live.studyDone', { name: f.name }), 'success', { label: t('notes.undo'), run: () => void setSessionStatus(ref, 'planned').catch(fail) }), fail);
      return true;
    },
    title: (_k, ref) => {
      if (ref.startsWith('sub.')) {
        const s = data.subjectById.get(ref.slice(4));
        return s ? t('park.live.hintOpenSubject', { name: s.name }) : null;
      }
      const f = find(ref);
      return f ? t(f.s.done ? 'park.live.hintStudyUndo' : 'park.live.hintStudyDone', { name: f.name }) : null;
    },
  });
  return null;
}

/* ---------- Notes: as notas mexidas por último; tocar abre a nota na mesa ---------- */

function NotesWall({ onWall, handler, openRoom, onObj, objHandler, project }: WallProps) {
  const c = useWallCtx();
  const { t } = c;
  const toast = useToast();
  const data = useNotesData();
  const [writing, setWriting] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteText, setNoteText] = useState('');
  const kind = WALL_KIND.notes!;
  const recent = useMemo(() => (data.loading ? null : recentNotes(data.notes)), [data]);
  const wall = useMemo((): WallLive | null => {
    if (!recent) return null;
    return {
      title: t('park.live.notesTitle'),
      side: '',
      rows: rowsOf(
        recent,
        kind,
        (n) => row(`${kind}:${n.id}`, n.title || t('park.live.untitled'), t('park.live.edited', { date: c.day(dayOfIso(n.updatedAt)) }), accentOf('notes')),
        (n) => t('park.live.more', { count: n }),
        t('park.live.openStation'),
      ),
      empty: t('park.live.notesEmpty'),
      accent: accentOf('notes'),
      clock: null,
    };
  }, [recent, c.today, c.settings.locale, t]);
  useWallSend(wall, onWall);
  useHandler(handler, {
    act: (_k, ref) => {
      if (!data.notes.some((n) => n.id === ref)) return false;
      // A nota abre no editor real da mesa (sala Organizar), o mesmo da estação.
      presetStationState('notes.open.organize', ref);
      openRoom('organize', 'organize', true);
      return true;
    },
    title: (_k, ref) => {
      const n = data.notes.find((x) => x.id === ref);
      return n ? t('park.live.hintOpen', { title: n.title || t('park.live.untitled') }) : null;
    },
  });
  // Caderno aberto no balcão de captura: tocar escreve uma nota rápida (título e texto).
  const last = recent?.shown[0];
  const nb: NotebookObj | null = recent ? { title: t('park.live.nbTitle'), hint: t('park.live.nbHint'), last: last ? t('park.live.nbLast', { title: last.title || t('park.live.untitled') }) : '' } : null;
  useObjSend(nb, onObj, !!nb);
  useObjHandler(objHandler, {
    act: (k) => {
      if (k !== 'nb') return false;
      setWriting(true);
      return true;
    },
    title: (k) => (k === 'nb' ? t('park.live.hintNotebook') : null),
  });
  if (!writing) return null;
  const save = async () => {
    if (!noteTitle.trim() && !noteText.trim()) return;
    try {
      // A mesma captura rápida da estação (título e o texto em blocos).
      const n = await createNote(emptyNoteInput({ title: noteTitle.trim(), blocks: textToBlocks(noteText) }));
      setNoteTitle('');
      setNoteText('');
      setWriting(false);
      toast.show(t('park.native.north.notes.captured'), 'success', { label: t('notes.undo'), run: () => void softDeleteNote(n.id).catch(() => toast.show(t('errors.saveFailed'), 'error')) });
    } catch {
      toast.show(t('errors.saveFailed'), 'error');
    }
  };
  return (
    <ObjectPop at="nb:new" project={project} title={t('park.live.nbTitle')} onClose={() => setWriting(false)}>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <input autoFocus className={popInput} aria-label={t('park.live.noteTitle')} placeholder={t('park.live.noteTitle')} value={noteTitle} maxLength={300} onChange={(e) => setNoteTitle(e.target.value)} />
        <textarea className={cn(popInput, 'h-28 resize-none py-2')} aria-label={t('park.live.noteText')} placeholder={t('park.live.noteText')} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={popBtn()} onClick={() => setWriting(false)}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={popBtn(true)} disabled={!noteTitle.trim() && !noteText.trim()}>
            {t('common.save')}
          </button>
        </div>
      </form>
    </ObjectPop>
  );
}

/* ---------- Library: os adicionados por último; tocar abre o material ---------- */

/** Cores das lombadas (o favorito fica dourado). */
const SPINE_COLORS = ['#065F46', '#1E40AF', '#7C2D12', '#5B21B6', '#0F766E', '#9F1239'] as const;

function LibraryWall({ onWall, handler, onObj, objHandler }: WallProps) {
  const c = useWallCtx();
  const { t } = c;
  const all = useLiveQuery(() => getDb().libraryItems.toArray(), []);
  const cols = useLiveQuery(() => getDb().libraryCollections.toArray(), []);
  const [editing, setEditing] = useState<LibraryItem | null>(null);
  const kind = WALL_KIND.library!;
  const live = useMemo(() => (all ?? []).filter((i) => !i.deletedAt), [all]);
  const recent = useMemo(() => (all ? recentLibrary(live) : null), [all, live]);
  const wall = useMemo((): WallLive | null => {
    if (!recent) return null;
    return {
      title: t('park.live.libraryTitle'),
      side: '',
      rows: rowsOf(
        recent,
        kind,
        (i) => row(`${kind}:${i.id}`, i.title || t('park.live.untitled'), [t(`library.kinds.${i.kind}`), t('park.live.added', { date: c.day(dayOfIso(i.createdAt)) })].join(' · '), i.favorite ? '#F59E0B' : accentOf('library')),
        (n) => t('park.live.more', { count: n }),
        t('park.live.openStation'),
      ),
      empty: t('park.live.libraryEmpty'),
      accent: accentOf('library'),
      clock: null,
    };
  }, [recent, c.today, c.settings.locale, t]);
  useWallSend(wall, onWall);
  useHandler(handler, {
    act: (_k, ref) => {
      const item = live.find((i) => i.id === ref);
      if (!item || !cols) return false;
      // O mesmo diálogo do material da estação (abrir o arquivo, editar, favoritar).
      setEditing(item);
      return true;
    },
    title: (_k, ref) => {
      const item = live.find((i) => i.id === ref);
      return item ? t('park.live.hintOpen', { title: item.title || t('park.live.untitled') }) : null;
    },
  });
  // Prateleira dos novos: uma lombada por material adicionado por último; tocar abre o mesmo diálogo.
  const shelfObj = useMemo((): ShelfObj | null => {
    if (!all) return null;
    const r = recentLibrary(live, 10);
    return {
      label: t('park.live.shelfLabel'),
      books: r.shown.map((i, k) => ({ id: i.id, title: i.title || t('park.live.untitled'), color: i.favorite ? '#B45309' : (SPINE_COLORS[k % SPINE_COLORS.length] ?? '#065F46') })),
      more: r.more > 0 ? t('park.live.more', { count: r.more }) : '',
      empty: t('park.live.libraryEmpty'),
    };
  }, [all, live, t]);
  useObjSend(shelfObj, onObj, !!shelfObj);
  useObjHandler(objHandler, {
    act: (k, ref) => {
      const item = k === 'spine' ? live.find((i) => i.id === ref) : undefined;
      if (!item || !cols) return false;
      setEditing(item);
      return true;
    },
    title: (k, ref) => {
      const item = k === 'spine' ? live.find((i) => i.id === ref) : undefined;
      return item ? t('park.live.hintOpen', { title: item.title || t('park.live.untitled') }) : null;
    },
  });
  if (!editing || !cols) return null;
  return <ItemDialog item={editing} collections={cols.filter((x) => !x.deletedAt).sort((a, b) => a.name.localeCompare(b.name))} folders={folderTree(live)} onClose={() => setEditing(null)} />;
}

/* ---------- Idiomas, Música e Esportes: a semana e o dia reais (o toque abre a estação) ---------- */

function LanguagesWall({ onWall, handler, onObj, objHandler }: WallProps) {
  const c = useWallCtx();
  const { t } = c;
  const toast = useToast();
  const data = useLanguages();
  const [flipped, setFlipped] = useState<string | null>(null);
  const [answered, setAnswered] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const vocab = useLiveQuery(() => getDb().vocab.where('srs.due').belowOrEqual(c.today).filter((v) => !v.deletedAt).toArray(), [c.today]);
  const kind = WALL_KIND.languages!;
  const wall = useMemo((): WallLive | null => {
    if (data.loading || !vocab) return null;
    const due = new Map<string, number>();
    for (const v of vocab) due.set(v.languageId, (due.get(v.languageId) ?? 0) + 1);
    const l = languagesWall(data.languages, data.sessions, (id) => due.get(id) ?? 0, c.weekFrom, c.today);
    return {
      title: t('park.live.languagesTitle'),
      side: '',
      rows: rowsOf(
        l,
        kind,
        (x) => row(`${kind}:${x.id}`, x.name, [t('park.live.wordsDue', { count: x.due }), t('park.live.minutes', { count: x.weekMin }), t('park.live.daysStudied', { count: x.days })].join(' · '), x.color),
        (n) => t('park.live.more', { count: n }),
        t('park.live.openStation'),
      ),
      empty: t('park.live.languagesEmpty'),
      accent: accentOf('languages'),
      clock: null,
    };
  }, [data, vocab, c.today, c.weekFrom, t]);
  useWallSend(wall, onWall);
  useHandler(handler, {
    act: () => false,
    title: (_k, ref) => {
      const l = data.byId.get(ref);
      return l ? t('park.live.hintOpenItem', { name: l.name }) : null;
    },
  });
  // Baralho na mesa de conversação: as palavras vencidas hoje, uma por vez; vira e responde com o
  // mesmo motor da revisão do módulo (as já respondidas nesta visita saem do monte).
  const queue = useMemo(() => (vocab && !data.loading ? deckQueue(vocab, data.languages, c.today).filter((v) => !answered.has(v.id)) : null), [vocab, data, c.today, answered]);
  const cur = queue?.[0];
  const deckObj = useMemo((): DeckObj | null => {
    if (!queue) return null;
    const lang = cur ? data.byId.get(cur.languageId) : undefined;
    return {
      title: cur ? [lang?.name ?? '', t('park.live.deckLeft', { count: queue.length })].filter(Boolean).join(' · ') : t('park.live.deckTitle'),
      card: cur ? { id: cur.id, term: displayTerm(cur), answer: flipped === cur.id ? cur.translation || cur.meaning || '' : null, color: lang?.color ?? accentOf('languages') } : null,
      flip: t('park.live.deckFlip'),
      again: t('park.live.deckAgain'),
      good: t('park.live.deckGood'),
      empty: t('park.live.deckEmpty'),
      still: c.settings.reduceMotion,
    };
  }, [queue, cur, flipped, data, t, c.settings.reduceMotion]);
  useObjSend(deckObj, onObj, !!deckObj);
  const answer = (id: string, rating: 'again' | 'good') => {
    if (busy) return;
    setBusy(true);
    void answerVocab(id, rating)
      .then(
        () => {
          setAnswered((s) => new Set(s).add(id));
          setFlipped(null);
        },
        () => toast.show(t('errors.saveFailed'), 'error'),
      )
      .finally(() => setBusy(false));
  };
  useObjHandler(objHandler, {
    act: (k, ref) => {
      const dot = ref.indexOf('.');
      if (k !== 'deck' || dot < 0 || !cur) return false;
      const what = ref.slice(0, dot);
      // Cartão que já saiu do monte (toque atrasado): não faz nada.
      if (ref.slice(dot + 1) !== cur.id) return true;
      if (what === 'flip') setFlipped(cur.id);
      else if ((what === 'again' || what === 'good') && flipped === cur.id) answer(cur.id, what);
      return true;
    },
    title: (k, ref) => {
      if (k !== 'deck' || !cur) return null;
      const what = ref.slice(0, Math.max(0, ref.indexOf('.')));
      const term = displayTerm(cur);
      return what === 'flip' ? t('park.live.hintDeckFlip', { term }) : what === 'again' ? t('park.live.hintDeckAgain', { term }) : what === 'good' ? t('park.live.hintDeckGood', { term }) : null;
    },
  });
  return null;
}

function MusicWall({ onWall, handler }: WallProps) {
  const c = useWallCtx();
  const { t } = c;
  const data = useMusic();
  const kind = WALL_KIND.music!;
  const wall = useMemo((): WallLive | null => {
    if (data.loading) return null;
    const m = musicWall(data.instruments, data.practiceOf, c.weekFrom, c.today);
    return {
      title: t('park.live.musicTitle'),
      side: t('park.live.minutes', { count: m.shown.reduce((a, x) => a + x.weekMin, 0) }),
      rows: rowsOf(
        m,
        kind,
        (x) => row(`${kind}:${x.id}`, x.name, [t('park.live.minutes', { count: x.weekMin }), x.last ? t('park.live.lastPractice', { date: c.day(x.last) }) : t('park.live.neverPracticed')].join(' · '), x.color),
        (n) => t('park.live.more', { count: n }),
        t('park.live.openStation'),
      ),
      empty: t('park.live.musicEmpty'),
      accent: accentOf('music'),
      clock: null,
    };
  }, [data, c.today, c.weekFrom, c.settings.locale, t]);
  useWallSend(wall, onWall);
  useHandler(handler, {
    act: () => false,
    title: (_k, ref) => {
      const i = data.byId.get(ref);
      return i ? t('park.live.hintOpenItem', { name: i.name }) : null;
    },
  });
  return null;
}

function SportsWall({ onWall, handler, onObj, objHandler, project }: WallProps) {
  const c = useWallCtx();
  const { t } = c;
  const toast = useToast();
  const data = useSports();
  const [logFor, setLogFor] = useState<string | null>(null);
  const [type, setType] = useState<ActivityType>('training');
  const [minutes, setMinutes] = useState('');
  const kind = WALL_KIND.sports!;
  const today = useMemo(() => (data.loading ? null : sportsToday(data.sports, data.activitiesOf, c.today)), [data, c.today]);
  const wall = useMemo((): WallLive | null => {
    if (!today) return null;
    return {
      title: t('park.live.sportsTitle'),
      side: t('park.live.todayCount', { count: today.shown.length + today.more }),
      rows: rowsOf(
        today,
        kind,
        (x) => row(`${kind}:${x.id}`, x.title || t(`sports.types.${x.type}`), [x.sport, x.min !== null ? t('park.live.minutes', { count: x.min }) : ''].filter(Boolean).join(' · '), x.color),
        (n) => t('park.live.more', { count: n }),
        t('park.live.openStation'),
      ),
      empty: t('park.live.sportsEmpty'),
      accent: accentOf('sports'),
      clock: null,
    };
  }, [today, t]);
  useWallSend(wall, onWall);
  useHandler(handler, {
    act: () => false,
    title: (_k, ref) => {
      const x = today?.shown.find((a) => a.id === ref);
      return x ? t('park.live.hintOpenItem', { name: x.title || t(`sports.types.${x.type}`) }) : null;
    },
  });
  // Faixas das modalidades atrás da quadra (a mesma lista e a mesma ordem das placas): tocar
  // registra a atividade de hoje daquela modalidade (o tipo e, se quiser, a duração).
  const courtObj = useMemo(() => (data.loading ? null : { ids: data.sports.map((s) => s.id) }), [data]);
  useObjSend(courtObj, onObj, !!courtObj);
  useObjHandler(objHandler, {
    act: (k, ref) => {
      if (k !== 'court' || !data.sports.some((s) => s.id === ref)) return false;
      setLogFor(ref);
      setType('training');
      setMinutes('');
      return true;
    },
    title: (k, ref) => {
      const s = k === 'court' ? data.sports.find((x) => x.id === ref) : undefined;
      return s ? t('park.live.hintCourt', { name: s.name }) : null;
    },
  });
  const sport = logFor ? data.sports.find((s) => s.id === logFor) : undefined;
  if (!sport) return null;
  const save = async () => {
    const n = minutes.trim() === '' ? null : Math.round(Number(minutes));
    if (n !== null && (!Number.isFinite(n) || n < 1 || n > 1440)) {
      toast.show(t('park.live.durationInvalid'), 'error');
      return;
    }
    try {
      // O mesmo registro rápido da estação de modalidades (hoje; no módulo a duração é opcional).
      const a = await saveActivity(null, { ...emptyActivityInput(sport.id, type, c.today), durationMin: n }, c.today);
      setLogFor(null);
      toast.show(t('park.live.activitySaved', { name: sport.name }), 'success', { label: t('notes.undo'), run: () => void softDeleteActivity(a.id).catch(() => toast.show(t('errors.saveFailed'), 'error')) });
    } catch {
      toast.show(t('errors.saveFailed'), 'error');
    }
  };
  return (
    <ObjectPop at={`court:${sport.id}`} project={project} title={t('park.live.courtTitle', { name: sport.name })} onClose={() => setLogFor(null)}>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('park.live.activityType')}>
          {ACTIVITY_TYPES.map((x) => (
            <button key={x} type="button" aria-pressed={type === x} onClick={() => setType(x)} className={popChip(type === x)}>
              {t(`sports.types.${x}`)}
            </button>
          ))}
        </div>
        <input type="number" inputMode="numeric" min={1} max={1440} className={popInput} aria-label={t('park.live.durationOptional')} placeholder={t('park.live.durationOptional')} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={popBtn()} onClick={() => setLogFor(null)}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={popBtn(true)}>
            {t('park.live.register')}
          </button>
        </div>
      </form>
    </ObjectPop>
  );
}

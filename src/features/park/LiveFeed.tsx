import { useEffect, useMemo, useState, type MutableRefObject } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ModuleId } from '@/app/modules';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { archive, reopen } from '@/data/inboxRepo';
import { projectInputOf, updateProject } from '@/data/projectsRepo';
import { setSessionStatus } from '@/data/studyPlanRepo';
import { formatDateKey, startOfWeek, toDateKey, todayKey, type DateKey } from '@/domain/dates';
import { isOpenGoal, type Goal } from '@/domain/goals';
import { folderTree, type LibraryItem } from '@/domain/library';
import { buildingById } from '@/domain/park';
import { isClosedProject, type Milestone } from '@/domain/projects';
import { useAcademyData } from '@/features/academy/useAcademyData';
import { useFocus } from '@/features/focus/FocusProvider';
import { CheckinDialog } from '@/features/goals/goalsUi';
import { useGoals } from '@/features/goals/useGoals';
import { useLanguages } from '@/features/languages/useLanguages';
import { ItemDialog } from '@/features/library/libraryUi';
import { useMusic } from '@/features/music/useMusic';
import { useNotesData } from '@/features/notes/useNotesData';
import { useProjectsData } from '@/features/projects/useProjectsData';
import { useSports } from '@/features/sports/useSports';
import { useToast } from '@/ui/toast';
import { useInsightMetrics } from './FloorFeed';
import { canCompare } from './interiors/boards';
import type { WallLive, WallRowView } from './interiors/live3d';
import { presetStationState } from './panels/north/station';
import {
  focusTap,
  goalWall,
  inboxTray,
  languagesWall,
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
} from './live';

/**
 * "3D de verdade" nos outros prédios (seção 28): os dados reais da parede de ação do prédio em que se
 * está (live3d.ts, `listWall`) e a ação de cada linha. Lê o mesmo que as estações (os mesmos hooks) e
 * age pelos mesmos repositórios: acompanhamento do objetivo (CheckinDialog), marco do projeto
 * (updateProject), relógio do Focus compartilhado (useFocus), arquivar do Inbox (com desfazer),
 * sessão de estudo (setSessionStatus), nota aberta na mesa do Notes e material no ItemDialog. As
 * paredes de Idiomas, Música, Esportes e Insights só mostram (o toque abre a estação da sala).
 * Só o prédio aberto lê os dados dele; a parede só é entregue de novo quando o texto muda.
 */

/** Ação de uma linha da parede (kind = prefixo de WALL_KIND, ref = id do registro). */
export interface WallHandler {
  /** Faz a ação real; false = não há o que fazer aqui (o ParkPage abre a estação da sala). */
  act: (kind: string, ref: string) => boolean;
  /** Texto da dica da linha; null = o genérico "abrir a estação". */
  title: (kind: string, ref: string) => string | null;
}

interface WallProps {
  onWall: (w: WallLive) => void;
  handler: MutableRefObject<WallHandler | null>;
  openRoom: (sector: string, zone: string | null, fresh?: boolean) => void;
}

export function LiveFeed({ id, financeLocked, ...p }: WallProps & { id: ModuleId; financeLocked: boolean }) {
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

function GoalsWall({ onWall, handler }: WallProps) {
  const c = useWallCtx();
  const { t } = c;
  const data = useGoals();
  const [checkin, setCheckin] = useState<Goal | null>(null);
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
  return checkin ? <CheckinDialog goal={checkin} onClose={() => setCheckin(null)} /> : null;
}

/* ---------- Projects: os ativos; tocar conclui o próximo marco ---------- */

function ProjectsWall({ onWall, handler }: WallProps) {
  const c = useWallCtx();
  const { t } = c;
  const toast = useToast();
  const data = useProjectsData();
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
  return null;
}

/* ---------- Focus: o relógio da sessão compartilhada e as sessões de hoje ---------- */

function FocusWall({ onWall, handler, openRoom }: WallProps) {
  const c = useWallCtx();
  const { t } = c;
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
  return null;
}

/* ---------- Inbox: as chegadas em aberto; tocar arquiva (com desfazer) ---------- */

function InboxWall({ onWall, handler }: WallProps) {
  const c = useWallCtx();
  const { t } = c;
  const toast = useToast();
  const items = useLiveQuery(() => getDb().inbox.toArray(), []);
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
  useHandler(handler, {
    act: (_k, ref) => {
      const name = titleOf(ref);
      if (name === null) return false;
      // O mesmo "arquivar" da triagem; desfazer reabre o item.
      void archive(ref).then(
        () => toast.show(t('park.live.archived', { title: name }), 'success', { label: t('notes.undo'), run: () => void reopen(ref).catch(() => toast.show(t('errors.saveFailed'), 'error')) }),
        () => toast.show(t('errors.saveFailed'), 'error'),
      );
      return true;
    },
    title: (_k, ref) => {
      const name = titleOf(ref);
      return name === null ? null : t('park.live.hintArchive', { title: name });
    },
  });
  return null;
}

/* ---------- Insights: só os indicadores reais (Finanças trancado não mostra número) ---------- */

function InsightsWall({ onWall, handler, financeLocked }: WallProps & { financeLocked: boolean }) {
  const c = useWallCtx();
  const { t } = c;
  const metrics = useInsightMetrics(financeLocked);
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
  return null;
}

/* ---------- Academy: as sessões de estudo de hoje; tocar conclui (ou volta a planejada) ---------- */

function AcademyWall({ onWall, handler }: WallProps) {
  const c = useWallCtx();
  const { t } = c;
  const toast = useToast();
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
          return row(`${kind}:${s.id}`, sub?.name ?? '', [s.time ?? '', t('park.live.minutes', { count: s.min })].filter(Boolean).join(' · '), sub?.color ?? accentOf('academy'), { check: s.done });
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
      const f = find(ref);
      if (!f) return false;
      const fail = () => toast.show(t('errors.saveFailed'), 'error');
      // O mesmo "concluir" / "voltar para planejada" do plano de estudos da estação.
      if (f.s.done) void setSessionStatus(ref, 'planned').catch(fail);
      else void setSessionStatus(ref, 'done').then(() => toast.show(t('park.live.studyDone', { name: f.name }), 'success', { label: t('notes.undo'), run: () => void setSessionStatus(ref, 'planned').catch(fail) }), fail);
      return true;
    },
    title: (_k, ref) => {
      const f = find(ref);
      return f ? t(f.s.done ? 'park.live.hintStudyUndo' : 'park.live.hintStudyDone', { name: f.name }) : null;
    },
  });
  return null;
}

/* ---------- Notes: as notas mexidas por último; tocar abre a nota na mesa ---------- */

function NotesWall({ onWall, handler, openRoom }: WallProps) {
  const c = useWallCtx();
  const { t } = c;
  const data = useNotesData();
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
  return null;
}

/* ---------- Library: os adicionados por último; tocar abre o material ---------- */

function LibraryWall({ onWall, handler }: WallProps) {
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
  if (!editing || !cols) return null;
  return <ItemDialog item={editing} collections={cols.filter((x) => !x.deletedAt).sort((a, b) => a.name.localeCompare(b.name))} folders={folderTree(live)} onClose={() => setEditing(null)} />;
}

/* ---------- Idiomas, Música e Esportes: a semana e o dia reais (o toque abre a estação) ---------- */

function LanguagesWall({ onWall, handler }: WallProps) {
  const c = useWallCtx();
  const { t } = c;
  const data = useLanguages();
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

function SportsWall({ onWall, handler }: WallProps) {
  const c = useWallCtx();
  const { t } = c;
  const data = useSports();
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
  return null;
}

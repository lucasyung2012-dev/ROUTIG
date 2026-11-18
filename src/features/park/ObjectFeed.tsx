import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { createEvent, EventRuleError, loadCalendarConfig, softDeleteEvent } from '@/data/eventsRepo';
import { savePractice, softDeletePractice } from '@/data/musicRepo';
import { createTask, softDeleteTask } from '@/data/tasksRepo';
import { addDays, todayKey } from '@/domain/dates';
import { emptyEventInput } from '@/domain/events';
import { CURRENCIES, formatMoney } from '@/domain/finance';
import { emptyPracticeInput } from '@/domain/music';
import { emptyTaskInput } from '@/domain/tasks';
import { useHideToggle } from '@/features/finance/FinancePage';
import { useFinance } from '@/features/finance/useFinance';
import { useMusic } from '@/features/music/useMusic';
import { cn } from '@/ui/cn';
import { useToast } from '@/ui/toast';
import type { SignObj, VaultObj } from './interiors/objects3d';
import { hourLabel, practiceInstrument, vaultLines } from './live';

/**
 * "3D de verdade" nos objetos (seção 28; o 3D em interiors/objects3d.ts): o que o objeto faz, com
 * os mesmos repositórios das estações. Aqui ficam as peças comuns (o campo preso ao objeto, a
 * entrega dos dados e da ação ao ParkPage) e os objetos dos prédios sem parede de ação: o balcão
 * de criação rápida do Tasks (createTask), a hora vazia da parede do dia do Calendar (createEvent),
 * os saldos dentro do cofre de Finanças (só leitura, só desbloqueado) e a prática depois de tocar
 * um instrumento do Estúdio da Música (savePractice). Os outros objetos ficam com a parede do
 * prédio, no LiveFeed (os mesmos dados e diálogos).
 */

/** Onde um objeto de ação aparece na tela agora (engine.projectAction). */
export type Projector = (id: string) => { x: number; y: number; visible: boolean } | null;

/** Ação de um objeto (kind = prefixo de OBJECT_KIND, ref = o resto do id). */
export interface ObjHandler {
  /** Faz a ação real; false = nada a fazer aqui (o ParkPage abre a estação do objeto). */
  act: (kind: string, ref: string) => boolean;
  /** Texto da dica; null = o genérico "abrir a estação". */
  title: (kind: string, ref: string) => string | null;
}

export interface ObjProps {
  onObj: (o: unknown) => void;
  objHandler: MutableRefObject<ObjHandler | null>;
  project: Projector;
}

/** Entrega os dados do objeto (null também é dado: apaga) só quando o texto muda. */
export function useObjSend(o: unknown, onObj: (o: unknown) => void, ready = true) {
  const key = ready ? JSON.stringify(o ?? null) : '';
  useEffect(() => {
    if (ready) onObj(o ?? null);
    // O texto (key) decide; a função muda a cada render do ParkPage.
  }, [key]);
}

/** Deixa a ação dos objetos deste prédio com o ParkPage (a de agora, com os dados de agora). */
export function useObjHandler(handler: MutableRefObject<ObjHandler | null>, h: ObjHandler) {
  useEffect(() => {
    handler.current = h;
    return () => {
      if (handler.current === h) handler.current = null;
    };
  });
}

/* ---------- O campo preso ao objeto ---------- */

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * Campo pequeno preso ao objeto do 3D (não é painel inteiro): fica em cima do objeto e o segue
 * quando a vista anda; com o objeto fora da vista, espera no pé da tela. Esc fecha.
 */
export function ObjectPop({ at, project, title, onClose, children }: { at: string; project: Projector; title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useSettings();
  const ref = useRef<HTMLDivElement>(null);
  const proj = useRef(project);
  proj.current = project;
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const el = ref.current;
      if (!el) return;
      const p = proj.current(at);
      const W = window.innerWidth;
      const H = window.innerHeight;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const on = !!p?.visible;
      const x = on ? p!.x - w / 2 : (W - w) / 2;
      const y = on ? p!.y - h - 18 : H - h - 96;
      el.style.transform = `translate(${Math.round(clamp(x, 12, Math.max(12, W - w - 12)))}px, ${Math.round(clamp(y, 12, Math.max(12, H - h - 12)))}px)`;
      el.style.visibility = 'visible';
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [at]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      close.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  return (
    <div ref={ref} role="dialog" aria-label={title} style={{ visibility: 'hidden' }} className="absolute left-0 top-0 z-30 w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl bg-black/80 p-3 text-white shadow-lift ring-1 ring-white/20 backdrop-blur-md">
      <div className="mb-2 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</p>
        <button type="button" onClick={onClose} aria-label={t('common.close')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {children}
    </div>
  );
}

/** Estilos do que vai dentro do campo (escuro, como o painel dos instrumentos). */
export const popInput = 'h-10 w-full rounded-xl bg-white/10 px-3 text-sm text-white ring-1 ring-inset ring-white/20 placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-accent';
export const popBtn = (primary = false) => cn('h-9 rounded-xl px-3 text-xs font-semibold ring-1 ring-inset disabled:opacity-50', primary ? 'bg-accent text-accent-fg ring-accent' : 'bg-white/10 text-white ring-white/20');
export const popChip = (on: boolean) => cn('h-8 rounded-lg px-3 text-xs font-medium ring-1 ring-inset', on ? 'bg-accent/30 text-white ring-accent' : 'text-white/80 ring-white/25');

/* ---------- Tasks: a tela "Nova tarefa" do balcão de criação rápida ---------- */

export function TasksObjects({ onObj, objHandler, project }: ObjProps) {
  const { t } = useSettings();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const sign: SignObj = { title: t('park.live.deskTitle'), sub: t('park.live.deskSub') };
  useObjSend(sign, onObj);
  useObjHandler(objHandler, {
    act: (kind) => {
      if (kind !== 'tnew') return false;
      setOpen(true);
      return true;
    },
    title: (kind) => (kind === 'tnew' ? t('park.live.hintDesk') : null),
  });
  if (!open) return null;
  const today = todayKey();
  const create = async () => {
    const name = title.trim();
    if (!name) return;
    try {
      // O mesmo "criar" da estação de criação rápida (título e prazo; o resto fica no padrão do módulo).
      const task = await createTask(emptyTaskInput({ title: name, dueDate: due || null }));
      setTitle('');
      setOpen(false);
      toast.show(t('tasks.added'), 'success', { label: t('notes.undo'), run: () => void softDeleteTask(task.id).catch(() => toast.show(t('errors.saveFailed'), 'error')) });
    } catch {
      toast.show(t('errors.saveFailed'), 'error');
    }
  };
  return (
    <ObjectPop at="tnew:new" project={project} title={t('park.live.deskTitle')} onClose={() => setOpen(false)}>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <input autoFocus className={popInput} aria-label={t('tasks.editor.titleLabel')} placeholder={t('tasks.editor.titlePlaceholder')} value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />
        <label className="flex flex-col gap-1 text-xs text-white/70">
          {t('tasks.editor.dueDate')}
          <input type="date" className={popInput} value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {(['today', 'tomorrow'] as const).map((d) => {
            const v = d === 'today' ? today : addDays(today, 1);
            return (
              <button key={d} type="button" aria-pressed={due === v} onClick={() => setDue(due === v ? '' : v)} className={popChip(due === v)}>
                {t(`tasks.due.${d}`)}
              </button>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={popBtn()} onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={popBtn(true)} disabled={!title.trim()}>
            {t('park.live.create')}
          </button>
        </div>
      </form>
    </ObjectPop>
  );
}

/* ---------- Calendar: tocar numa hora vazia da parede do dia cria um evento ali ---------- */

const EVENT_MINUTES = [30, 60, 90, 120] as const;

export function CalendarObjects({ objHandler, project }: ObjProps) {
  const { t } = useSettings();
  const toast = useToast();
  const [hour, setHour] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState<number>(60);
  useObjHandler(objHandler, {
    act: (kind, ref) => {
      const h = Number(ref);
      if (kind !== 'hour' || !Number.isInteger(h) || h < 0 || h > 23) return false;
      setHour(h);
      setTitle('');
      return true;
    },
    title: (kind, ref) => (kind === 'hour' && ref !== '' ? t('park.live.hintHour', { time: hourLabel(Number(ref)) }) : null),
  });
  if (hour === null) return null;
  const time = hourLabel(hour);
  const create = async () => {
    const name = title.trim();
    if (!name) return;
    try {
      // A mesma categoria padrão da agenda rápida da estação (ou a primeira que existir).
      const cfg = await loadCalendarConfig();
      const categoryId = cfg.categories.some((c) => c.id === 'appointment') ? 'appointment' : (cfg.categories[0]?.id ?? 'other');
      const today = todayKey();
      const ev = await createEvent(emptyEventInput({ title: name, start: today, endDate: today, allDay: false, startTime: time, durationMin: minutes, categoryId }));
      setHour(null);
      toast.show(t('calendar.editor.created'), 'success', { label: t('notes.undo'), run: () => void softDeleteEvent(ev.id).catch(() => toast.show(t('errors.saveFailed'), 'error')) });
    } catch (e) {
      toast.show(e instanceof EventRuleError ? t('calendar.editor.invalid') : t('errors.saveFailed'), 'error');
    }
  };
  return (
    <ObjectPop at={`hour:${hour}`} project={project} title={t('park.live.hourTitle', { time })} onClose={() => setHour(null)}>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <input autoFocus className={popInput} aria-label={t('calendar.editor.titleLabel')} placeholder={t('calendar.editor.titlePlaceholder')} value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('park.live.duration')}>
          {EVENT_MINUTES.map((m) => (
            <button key={m} type="button" aria-pressed={minutes === m} onClick={() => setMinutes(m)} className={popChip(minutes === m)}>
              {t('park.live.minutes', { count: m })}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={popBtn()} onClick={() => setHour(null)}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={popBtn(true)} disabled={!title.trim()}>
            {t('park.live.create')}
          </button>
        </div>
      </form>
    </ObjectPop>
  );
}

/* ---------- Finance: os saldos dentro do cofre (só leitura; só com Finanças desbloqueado) ---------- */

export function FinanceObjects({ financeLocked, ...p }: ObjProps & { financeLocked: boolean }) {
  // Trancado (ou ainda lendo o PIN): o quadro apaga e nada de Finanças é lido aqui.
  if (financeLocked) return <VaultLocked {...p} />;
  return <VaultBalances {...p} />;
}

function VaultLocked({ onObj, objHandler }: ObjProps) {
  useObjSend(null, onObj);
  useObjHandler(objHandler, { act: () => false, title: () => null });
  return null;
}

function VaultBalances({ onObj, objHandler }: ObjProps) {
  const { t, settings } = useSettings();
  const data = useFinance();
  // O mesmo "ocultar valores" das telas de Finanças (e a privacidade rápida).
  const { hide, toggle } = useHideToggle();
  // Ao sair (trancou, saiu do prédio): apaga o quadro também na cópia guardada do prédio, para
  // nenhum número aparecer de novo antes do bloqueio ser conferido.
  const send = useRef(onObj);
  send.current = onObj;
  useEffect(() => () => send.current(null), []);
  const vault = useMemo((): VaultObj => {
    if (data.loading) return null;
    const money = (v: number, cur: (typeof CURRENCIES)[number]) => (hide ? '•••••' : formatMoney(v, cur, settings.locale));
    const lines = vaultLines(data.assets, data.positionOf, CURRENCIES);
    return {
      title: t('park.live.vaultTitle'),
      rows: lines.map((l) => ({
        title: `${l.currency} · ${l.value === null ? t('park.live.vaultNoValue') : money(l.value, l.currency)}`,
        sub: [t('park.live.vaultInvested', { value: money(l.invested, l.currency) }), l.held && l.quoted < l.held ? t('park.live.vaultPartial', { n: l.quoted, total: l.held }) : ''].filter(Boolean).join(' · '),
      })),
      empty: t('park.live.vaultEmpty'),
      tap: t(hide ? 'park.live.vaultShow' : 'park.live.vaultHide'),
    };
  }, [data, hide, settings.locale, t]);
  useObjSend(vault, onObj, !data.loading);
  useObjHandler(objHandler, {
    act: (kind) => {
      if (kind !== 'bal') return false;
      // Só a forma de ver muda (mostrar ou ocultar os valores); nada de Finanças é gravado.
      toggle();
      return true;
    },
    title: (kind) => (kind === 'bal' ? t(hide ? 'park.live.vaultShow' : 'park.live.vaultHide') : null),
  });
  return null;
}

/* ---------- Música: registrar a prática depois de tocar um instrumento do Estúdio ---------- */

export function PracticeOffer({ kind, minutes, onClose }: { kind: 'piano' | 'drums' | 'guitar'; minutes: number; onClose: () => void }) {
  const { t } = useSettings();
  const toast = useToast();
  const data = useMusic();
  const live = useMemo(() => data.instruments.filter((i) => !i.deletedAt), [data.instruments]);
  const [pick, setPick] = useState<string | null>(null);
  const chosen = pick ?? practiceInstrument(kind, live) ?? live[0]?.id ?? '';
  const [min, setMin] = useState(minutes);
  if (data.loading) return null;
  const save = async () => {
    if (!chosen) return;
    try {
      // O mesmo registro de prática do módulo Música (o dia de hoje e os minutos tocados).
      const p = await savePractice(null, { ...emptyPracticeInput(chosen, todayKey()), durationMin: Math.max(1, Math.min(1440, Math.round(min))) });
      onClose();
      toast.show(t('park.live.practiceSaved', { count: p.durationMin }), 'success', { label: t('notes.undo'), run: () => void softDeletePractice(p.id).catch(() => toast.show(t('errors.saveFailed'), 'error')) });
    } catch {
      toast.show(t('errors.saveFailed'), 'error');
    }
  };
  return (
    <div role="dialog" aria-label={t('park.live.practiceTitle')} className="absolute inset-x-0 bottom-3 z-20 mx-auto w-[calc(100%-1.5rem)] max-w-sm rounded-2xl bg-black/80 p-3 text-white shadow-lift ring-1 ring-white/20 backdrop-blur-md">
      <div className="mb-2 flex items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold">{t('park.live.practiceTitle')}</p>
        <button type="button" onClick={onClose} aria-label={t('common.close')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <p className="mb-2 text-xs text-white/80">{t('park.live.practiceBody', { count: minutes, instrument: t(`park.instrument.${kind}`) })}</p>
      {live.length === 0 ? (
        <p className="text-xs text-white/70">{t('park.live.practiceNone')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs text-white/70">
            {t('park.live.practiceInstrument')}
            <select className={popInput} value={chosen} onChange={(e) => setPick(e.target.value)}>
              {live.map((i) => (
                <option key={i.id} value={i.id} className="text-black">
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-white/70">
            {t('park.live.practiceMinutes')}
            <input type="number" inputMode="numeric" min={1} max={1440} className={popInput} value={min} onChange={(e) => setMin(Number(e.target.value) || 1)} />
          </label>
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className={popBtn()} onClick={onClose}>
          {t('park.live.practiceSkip')}
        </button>
        {live.length > 0 && (
          <button type="button" className={popBtn(true)} onClick={() => void save()} disabled={!chosen}>
            {t('park.live.practiceSave')}
          </button>
        )}
      </div>
    </div>
  );
}

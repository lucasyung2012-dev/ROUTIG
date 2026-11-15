import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Play, Plus, Shuffle, SkipForward, Undo2 } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { AcademyRuleError } from '@/data/academyRepo';
import { getDb } from '@/data/db';
import { createSession, setSessionStatus } from '@/data/studyPlanRepo';
import type { Assessment, StudySession } from '@/domain/academy';
import { addDays, formatDateKey, todayKey } from '@/domain/dates';
import { currentPeriodId } from '@/features/academy/AcademyPage';
import { GradeBadge } from '@/features/academy/academyUi';
import { AssessmentDialog } from '@/features/academy/dialogs';
import { ReviewSession, useFlashcards } from '@/features/academy/flashcards';
import { useAcademyData, type AcademyData } from '@/features/academy/useAcademyData';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Input, Select } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { LoadingState } from '@/ui/States';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { ControlRoomLink, Empty, Pane, Station, Stat } from './station';

/** Estações do Centro de Aprendizagem: o ano letivo, as disciplinas, as revisões e o plano de estudos reais da Academy. */
export type AcademyStationId = 'hall' | 'rooms' | 'review' | 'plan';

const NEW_PER_SESSION = 20;

export function AcademyStation({ id }: { id: AcademyStationId }) {
  const { t } = useSettings();
  const data = useAcademyData();
  const label = t(`park.academy.sectors.${id}`);
  if (data.loading) return <LoadingState label={t('common.loading')} lines={3} />;
  return (
    <Station building="academy" label={label}>
      {id === 'review' ? (
        <ReviewDesk />
      ) : !data.year ? (
        <Empty>{t('park.native.north.academy.noYear')}</Empty>
      ) : id === 'hall' ? (
        <Hall data={data} />
      ) : id === 'rooms' ? (
        <Rooms data={data} />
      ) : (
        <PlanDesk data={data} />
      )}
      <ControlRoomLink to={id === 'review' ? '/academy/review' : id === 'plan' ? '/academy/plan' : '/academy'} />
    </Station>
  );
}

function useDayLabel() {
  const { t, settings } = useSettings();
  const today = todayKey();
  return (d: string) => (d === today ? t('tasks.due.today') : formatDateKey(d, settings.locale, { weekday: 'short', day: 'numeric', month: 'short' }));
}

/* ---------- Saguão de Estudos: o quadro do ano ---------- */

function Hall({ data }: { data: AcademyData }) {
  const { t } = useSettings();
  const today = todayKey();
  const dayLabel = useDayLabel();
  const [editing, setEditing] = useState<Assessment | null>(null);
  const ids = data.subjects.map((s) => s.id);
  const sessions = useLiveQuery(() => getDb().studySessions.where('subjectId').anyOf(ids).filter((s) => !s.deletedAt && s.date === today && s.status === 'planned').count(), [ids.join(','), today]);
  const upcoming = data.assessments.filter((a) => a.date && a.date >= today && a.date <= addDays(today, 30));
  const toGrade = data.assessments.filter((a) => a.date && a.date < today && a.score === null);
  const row = (a: Assessment, warn = false) => {
    const s = data.subjectById.get(a.subjectId);
    return (
      <li key={a.id}>
        <button type="button" onClick={() => setEditing(a)} className="flex w-full items-center gap-2 rounded-xl bg-surface/70 px-3 py-2 text-left ring-1 ring-inset ring-line/50 hover:bg-surface-3">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s?.color }} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-fg">{a.name}</span>
            <span className="block truncate text-xs text-muted">{s?.name}</span>
          </span>
          <span className={cn('shrink-0 text-xs', warn ? 'text-warning' : 'text-muted')}>{dayLabel(a.date!)}</span>
        </button>
      </li>
    );
  };
  return (
    <>
      <p className="text-sm text-muted">{[data.year!.label, data.year!.institution].filter(Boolean).join(' · ')}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat value={data.subjects.length} label={t('academy.dash.subjects')} />
        <Stat value={upcoming.length} label={t('park.native.north.academy.next30')} />
        <Stat value={toGrade.length} label={t('academy.dash.pending')} />
        <Stat value={sessions ?? '—'} label={t('park.native.north.academy.sessionsToday')} />
      </div>
      <Pane title={t('academy.dash.upcoming')}>
        {upcoming.length === 0 ? <Empty>{t('academy.dash.upcomingEmpty')}</Empty> : <ul className="flex flex-col gap-1.5">{upcoming.slice(0, 6).map((a) => row(a))}</ul>}
      </Pane>
      <Pane title={t('academy.dash.pending')}>
        {toGrade.length === 0 ? <Empty>{t('academy.dash.pendingEmpty')}</Empty> : <ul className="flex flex-col gap-1.5">{toGrade.slice(0, 6).map((a) => row(a, true))}</ul>}
      </Pane>
      {editing && <AssessmentDialog data={data} assessment={editing} subjectId={editing.subjectId} periodId={editing.periodId} onClose={() => setEditing(null)} />}
    </>
  );
}

/* ---------- Salas das Disciplinas ---------- */

function Rooms({ data }: { data: AcademyData }) {
  const { t, settings } = useSettings();
  const today = todayKey();
  const dayLabel = useDayLabel();
  const [newFor, setNewFor] = useState<string | null>(null);
  const periodId = currentPeriodId(data.year);
  const period = data.year?.periods.find((p) => p.id === periodId);
  if (data.subjects.length === 0) return <Empty>{t('park.academy.noSubjects')}</Empty>;
  return (
    <>
      {period && <p className="text-xs text-muted">{t('park.native.north.academy.periodGrades', { period: period.name })}</p>}
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {data.subjects.map((s) => {
          const next = data.assessments.find((a) => a.subjectId === s.id && a.date && a.date >= today);
          return (
            <li key={s.id} className="flex items-center gap-2 rounded-2xl bg-surface-2/70 p-3 ring-1 ring-inset ring-line/60">
              <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
              <Link to={`/academy/subjects/${s.id}`} className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-fg hover:underline">{s.name}</span>
                <span className="block truncate text-xs text-muted">{next ? t('academy.dash.next', { name: next.name, date: dayLabel(next.date!) }) : t('park.native.north.academy.noNext')}</span>
              </Link>
              {periodId && <GradeBadge result={data.gradeOf(s, periodId)} locale={settings.locale} />}
              <IconButton size="sm" label={t('park.native.north.academy.newAssessmentFor', { name: s.name })} icon={<Plus className="h-4 w-4" />} onClick={() => setNewFor(s.id)} />
            </li>
          );
        })}
      </ul>
      {newFor && <AssessmentDialog data={data} assessment={null} subjectId={newFor} periodId={periodId} onClose={() => setNewFor(null)} />}
    </>
  );
}

/* ---------- Sala de Revisão: flashcards com repetição espaçada ---------- */

function ReviewDesk() {
  const { t } = useSettings();
  const fc = useFlashcards();
  const [session, setSession] = useState<{ deckIds: string[]; manual: boolean } | null>(null);
  if (fc.loading) return <LoadingState label={t('common.loading')} lines={3} />;
  const today = todayKey();
  const due = (cards: typeof fc.cards) => cards.filter((c) => c.srs.due !== null && c.srs.due <= today).length;
  const fresh = (cards: typeof fc.cards) => cards.filter((c) => c.srs.due === null).length;
  const allDue = due(fc.cards);
  const allFresh = fresh(fc.cards);
  return (
    <>
      <Pane title={t('academy.review.today')}>
        <p className="text-sm text-fg">{t('academy.review.todayDetail', { due: allDue, fresh: Math.min(allFresh, NEW_PER_SESSION) })}</p>
        <Button variant="primary" size="sm" className="w-fit" icon={<Play className="h-4 w-4" />} disabled={allDue === 0 && allFresh === 0} onClick={() => setSession({ deckIds: fc.decks.map((d) => d.id), manual: false })}>
          {t('academy.review.start')}
        </Button>
      </Pane>
      {fc.decks.length === 0 ? (
        <Empty>{t('academy.review.empty')}</Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {fc.decks.map((d) => {
            const cards = fc.cardsOf(d.id);
            const dd = due(cards);
            const ff = fresh(cards);
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface-2/70 p-3 ring-1 ring-inset ring-line/60">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: d.color }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-fg">{d.name}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    <Badge>{t('academy.review.cards', { count: cards.length })}</Badge>
                    {dd > 0 && <Badge tone="warning">{t('academy.review.dueCount', { count: dd })}</Badge>}
                    {ff > 0 && <Badge tone="info">{t('academy.review.newCount', { count: ff })}</Badge>}
                  </span>
                </span>
                <Button size="sm" variant="primary" icon={<Play className="h-4 w-4" />} disabled={dd === 0 && ff === 0} onClick={() => setSession({ deckIds: [d.id], manual: false })}>
                  {t('academy.review.review')}
                </Button>
                <IconButton size="sm" label={t('academy.review.practice')} icon={<Shuffle className="h-4 w-4" />} disabled={cards.length === 0} onClick={() => setSession({ deckIds: [d.id], manual: true })} />
              </li>
            );
          })}
        </ul>
      )}
      {session && <ReviewSession deckIds={session.deckIds} manual={session.manual} onClose={() => setSession(null)} />}
    </>
  );
}

/* ---------- Plano de Estudos: sessões de hoje e da semana ---------- */

function PlanDesk({ data }: { data: AcademyData }) {
  const { t } = useSettings();
  const toast = useToast();
  const today = todayKey();
  const dayLabel = useDayLabel();
  const ids = data.subjects.map((s) => s.id);
  const all = useLiveQuery(() => getDb().studySessions.where('subjectId').anyOf(ids).toArray(), [ids.join(',')]);
  const [subjectId, setSubjectId] = useState(data.subjects[0]?.id ?? '');
  const [date, setDate] = useState(today);
  const [minutes, setMinutes] = useState(45);
  const [kind, setKind] = useState<StudySession['kind']>('study');
  if (data.subjects.length === 0) return <Empty>{t('park.academy.noSubjects')}</Empty>;
  if (!all) return <LoadingState label={t('common.loading')} lines={3} />;
  const live = all.filter((s) => !s.deletedAt).sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99'));
  const overdue = live.filter((s) => s.status === 'planned' && s.date < today);
  const week = live.filter((s) => s.date >= today && s.date <= addDays(today, 6));
  const add = async () => {
    try {
      await createSession({ subjectId, contentIds: [], assessmentId: null, kind, date, time: null, durationMin: minutes, priority: 'none', notes: '' });
      toast.show(t('park.native.north.academy.sessionAdded'));
    } catch (e) {
      toast.show(e instanceof AcademyRuleError && e.code === 'duplicate' ? t('academy.errors.duplicate') : t('academy.errors.invalid'), 'error');
    }
  };
  const status = (s: StudySession, next: StudySession['status']) => void setSessionStatus(s.id, next).catch(() => toast.show(t('errors.saveFailed'), 'error'));
  const row = (s: StudySession) => {
    const sub = data.subjectById.get(s.subjectId);
    return (
      <li key={s.id} className={cn('flex items-center gap-2 rounded-xl bg-surface/70 px-3 py-2 ring-1 ring-inset ring-line/50', s.status !== 'planned' && 'opacity-70')}>
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: sub?.color }} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-sm font-medium text-fg', s.status === 'done' && 'line-through')}>{sub?.name}</span>
          <span className="block truncate text-xs text-muted">
            {[dayLabel(s.date), s.time, t(`academy.plan.kinds.${s.kind}`), t('academy.plan.minutes', { min: s.status === 'done' ? (s.actualMin ?? s.durationMin) : s.durationMin }), s.status !== 'planned' ? t(`academy.plan.statuses.${s.status}`) : null].filter(Boolean).join(' · ')}
          </span>
        </span>
        {s.status === 'planned' ? (
          <>
            <IconButton size="sm" label={t('academy.plan.markDone')} icon={<Check className="h-4 w-4" />} onClick={() => status(s, 'done')} />
            <IconButton size="sm" label={t('academy.plan.skip')} icon={<SkipForward className="h-4 w-4" />} onClick={() => status(s, 'skipped')} />
          </>
        ) : (
          <IconButton size="sm" label={t('academy.plan.backToPlanned')} icon={<Undo2 className="h-4 w-4" />} onClick={() => status(s, 'planned')} />
        )}
      </li>
    );
  };
  return (
    <>
      {overdue.length > 0 && (
        <Pane title={t('academy.plan.overdue', { count: overdue.length })}>
          <ul className="flex flex-col gap-1.5">{overdue.slice(0, 6).map(row)}</ul>
        </Pane>
      )}
      <Pane title={t('park.native.north.academy.next7')}>{week.length === 0 ? <Empty>{t('academy.plan.panelEmpty')}</Empty> : <ul className="flex flex-col gap-1.5">{week.map(row)}</ul>}</Pane>
      <Pane title={t('academy.plan.new')}>
        <Select aria-label={t('park.native.north.academy.subject')} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          {data.subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-3 gap-2">
          <Input aria-label={t('park.native.north.date')} type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <Input aria-label={t('academy.plan.duration')} type="number" inputMode="numeric" min={5} max={600} step={5} value={minutes} onChange={(e) => setMinutes(Math.max(5, Math.min(600, Number(e.target.value) || 5)))} />
          <Select aria-label={t('academy.plan.kind')} value={kind} onChange={(e) => setKind(e.target.value as StudySession['kind'])}>
            <option value="study">{t('academy.plan.kinds.study')}</option>
            <option value="review">{t('academy.plan.kinds.review')}</option>
          </Select>
        </div>
        <Button variant="primary" size="sm" className="w-fit" icon={<Plus className="h-4 w-4" />} disabled={!subjectId} onClick={() => void add()}>
          {t('park.native.north.academy.plan')}
        </Button>
      </Pane>
    </>
  );
}

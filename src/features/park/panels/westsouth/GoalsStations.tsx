import { useState } from 'react';
import { CalendarClock, Check, ChevronDown, ChevronUp, NotebookPen, Plus, RotateCcw } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { setGoalStatus, toggleMilestone } from '@/data/goalsRepo';
import { formatDateKey, toDateKey, todayKey } from '@/domain/dates';
import { GOAL_STATUSES, goalProgress, isGoalOverdue, isOpenGoal, looksReached, type Goal, type GoalStatus } from '@/domain/goals';
import { goalsInsights } from '@/domain/insights';
import { CheckinDialog, GoalDialog, GoalProgressView, StatusBadge } from '@/features/goals/goalsUi';
import { useGoals, type GoalsData } from '@/features/goals/useGoals';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Select } from '@/ui/Field';
import { useToast } from '@/ui/toast';
import { cn } from '@/ui/cn';
import { PeriodSwitch, Readout, Row, Screen, SectionTitle, Station, usePeriodRange, type Period } from './station';

/*
 * Centro de Objetivos: os objetivos e acompanhamentos do Control Room (useGoals + goalsRepo). O
 * progresso é sempre o de goalProgress (indicadores, etapas ou nível registrados): nada é estimado.
 */

function Deadline({ goal }: { goal: Goal }) {
  const { t, settings } = useSettings();
  if (!goal.deadline) return null;
  const overdue = isGoalOverdue(goal, todayKey());
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', overdue ? 'font-medium text-danger' : 'text-muted')}>
      <CalendarClock className="h-3.5 w-3.5" aria-hidden />
      {overdue ? t('goals.overdue', { date: formatDateKey(goal.deadline, settings.locale) }) : t('goals.until', { date: formatDateKey(goal.deadline, settings.locale, { day: 'numeric', month: 'short', year: 'numeric' }) })}
    </span>
  );
}

/* ---------- Jardim das Metas: visão geral, acompanhamento e criação ---------- */

export function GoalsGardenStation() {
  const { t } = useSettings();
  const data = useGoals();
  const [creating, setCreating] = useState(false);
  const [checkin, setCheckin] = useState<Goal | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const today = todayKey();
  const open = data.goals.filter(isOpenGoal);

  return (
    <Station building="goals" name={t('park.native.westsouth.goals.station')} hint={t('park.native.westsouth.goals.realProgress')}>
      {data.loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : (
        <>
          <Screen building="goals" className="grid grid-cols-3 gap-2">
            <Readout value={open.length} label={t('park.native.westsouth.goals.open')} />
            <Readout value={open.filter((g) => g.status === 'active').length} label={t('goals.statuses.active')} />
            <Readout value={open.filter((g) => isGoalOverdue(g, today)).length} label={t('park.native.westsouth.goals.overdue')} />
          </Screen>
          {data.goals.length === 0 ? (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-fg">{t('goals.emptyTitle')}</p>
              <p className="text-sm text-muted">{t('goals.empty')}</p>
            </div>
          ) : open.length === 0 ? (
            <p className="text-sm text-muted">{t('park.native.westsouth.goals.noneOpen')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {open.map((g) => (
                <GoalCard key={g.id} goal={g} data={data} expanded={openId === g.id} onToggle={() => setOpenId(openId === g.id ? null : g.id)} onCheckin={() => setCheckin(g)} />
              ))}
            </ul>
          )}
          <Button variant="secondary" size="sm" className="self-start" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            {t('goals.new')}
          </Button>
        </>
      )}
      {creating && <GoalDialog onClose={() => setCreating(false)} />}
      {checkin && <CheckinDialog goal={checkin} onClose={() => setCheckin(null)} />}
    </Station>
  );
}

function GoalCard({ goal, data, expanded, onToggle, onCheckin }: { goal: Goal; data: GoalsData; expanded: boolean; onToggle: () => void; onCheckin: () => void }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const checkins = data.checkinsOf(goal.id);
  const reached = looksReached(goalProgress(goal, checkins));
  const last = checkins[0];
  const fail = () => toast.show(t('errors.saveFailed'), 'error');
  const status = (s: GoalStatus) => void setGoalStatus(goal.id, s).then(() => toast.show(t('goals.statusChanged')), fail);

  return (
    <li className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3 ring-1 ring-inset ring-line/60">
      <button type="button" className="flex items-start gap-2 text-left" aria-expanded={expanded} onClick={onToggle}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-fg">{goal.name}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={goal.status} />
            <Badge>{t(`goals.areas.${goal.area}`)}</Badge>
            <Deadline goal={goal} />
          </span>
        </span>
        {expanded ? <ChevronUp className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden /> : <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />}
      </button>
      <GoalProgressView goal={goal} checkins={checkins} compact={!expanded} />
      {reached && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-success/10 p-2 text-xs text-fg">
          <span className="min-w-0 flex-1">{t('goals.reachedHint')}</span>
          <Button size="sm" variant="primary" icon={<Check className="h-4 w-4" />} onClick={() => status('done')}>
            {t('goals.markDone')}
          </Button>
        </div>
      )}
      {expanded && (
        <div className="flex flex-col gap-2">
          {goal.milestones.length > 0 && (
            <ul className="flex flex-col gap-1" aria-label={goal.type === 'stages' ? t('goals.fields.stages') : t('goals.fields.milestones')}>
              {goal.milestones.map((m) => (
                <li key={m.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-sm text-fg hover:bg-surface-3">
                    <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={m.done} onChange={() => void toggleMilestone(goal.id, m.id).catch(fail)} />
                    <span className={cn('min-w-0 flex-1', m.done && 'text-muted line-through')}>{m.title}</span>
                    {m.date && <span className="text-xs text-muted">{formatDateKey(m.date, settings.locale)}</span>}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {last && <p className="text-xs text-muted">{t('goals.lastCheckin', { date: formatDateKey(last.date, settings.locale) })}</p>}
          <Select aria-label={t('goals.fields.status')} value={goal.status} onChange={(e) => status(e.target.value as GoalStatus)} className="h-9">
            {GOAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`goals.statuses.${s}`)}
              </option>
            ))}
          </Select>
        </div>
      )}
      <Button size="sm" variant="secondary" className="self-start" icon={<NotebookPen className="h-4 w-4" />} onClick={onCheckin}>
        {goal.type === 'measurable' ? t('goals.logValue') : goal.type === 'skill' ? t('goals.logLevel') : t('goals.logReflection')}
      </Button>
    </li>
  );
}

/* ---------- Conquistas: objetivos concluídos ---------- */

export function GoalsAchievedStation() {
  const { t, settings } = useSettings();
  const toast = useToast();
  const data = useGoals();
  const done = data.goals.filter((g) => g.status === 'done').sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
  return (
    <Station building="goals" name={t('park.native.westsouth.goals.achievedStation')}>
      {data.loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : done.length === 0 ? (
        <p className="text-sm text-muted">{t('park.goals.noneDone')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {done.map((g) => (
            <li key={g.id} className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3 ring-1 ring-inset ring-line/60">
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{g.name}</span>
                  <span className="text-xs text-muted">
                    {t(`goals.areas.${g.area}`)}
                    {g.doneAt && ` · ${t('park.native.westsouth.goals.doneOn', { date: formatDateKey(toDateKey(new Date(g.doneAt)), settings.locale, { day: 'numeric', month: 'short', year: 'numeric' }) })}`}
                  </span>
                </span>
                <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => void setGoalStatus(g.id, 'active').then(() => toast.show(t('goals.statusChanged')), () => toast.show(t('errors.saveFailed'), 'error'))}>
                  {t('park.native.westsouth.goals.reopen')}
                </Button>
              </div>
              <GoalProgressView goal={g} checkins={data.checkinsOf(g.id)} compact />
            </li>
          ))}
        </ul>
      )}
    </Station>
  );
}

/* ---------- Análise: o que aconteceu no período ---------- */

export function GoalsAnalysisStation() {
  const { t } = useSettings();
  const data = useGoals();
  const [period, setPeriod] = useState<Period>('month');
  const range = usePeriodRange(period);
  const today = todayKey();
  const checkins = data.goals.flatMap((g) => data.checkinsOf(g.id));
  const ins = goalsInsights(data.goals, checkins, range);
  const open = data.goals.filter(isOpenGoal);
  const overdue = open.filter((g) => isGoalOverdue(g, today));
  const byStatus = GOAL_STATUSES.map((s) => ({ s, n: data.goals.filter((g) => g.status === s).length })).filter((x) => x.n > 0);

  return (
    <Station building="goals" name={t('park.native.westsouth.goals.analysisStation')}>
      <PeriodSwitch value={period} onChange={setPeriod} />
      {data.loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : !ins.has ? (
        <p className="text-sm text-muted">{t('goals.empty')}</p>
      ) : (
        <>
          <Screen building="goals" className="grid grid-cols-3 gap-2">
            <Readout value={ins.done.length} label={t('park.native.westsouth.goals.doneInPeriod')} />
            <Readout value={ins.checkins} label={t('park.native.westsouth.goals.checkinsInPeriod')} />
            <Readout value={ins.milestones} label={t('park.native.westsouth.goals.milestonesInPeriod')} />
          </Screen>
          <SectionTitle>{t('park.native.westsouth.goals.byStatus')}</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {byStatus.map(({ s, n }) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <StatusBadge status={s} />
                <span className="text-sm tabular-nums text-fg">{n}</span>
              </span>
            ))}
          </div>
          <SectionTitle>{t('park.native.westsouth.goals.overdueTitle')}</SectionTitle>
          {overdue.length === 0 ? (
            <p className="text-sm text-muted">{t('park.native.westsouth.goals.noneOverdue')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {overdue.map((g) => (
                <Row key={g.id}>
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">{g.name}</span>
                  <Deadline goal={g} />
                </Row>
              ))}
            </ul>
          )}
          {ins.done.length > 0 && (
            <>
              <SectionTitle>{t('park.native.westsouth.goals.doneListTitle')}</SectionTitle>
              <ul className="flex flex-col gap-2">
                {ins.done.map((g) => (
                  <Row key={g.id}>
                    <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">{g.name}</span>
                  </Row>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Station>
  );
}

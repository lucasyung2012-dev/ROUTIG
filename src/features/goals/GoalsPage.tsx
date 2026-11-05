import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Plus, RotateCcw, Target } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { restoreGoal } from '@/data/goalsRepo';
import { formatDateKey, todayKey } from '@/domain/dates';
import { GOAL_AREAS, GOAL_HORIZONS, isGoalOverdue, isOpenGoal, type GoalArea, type GoalHorizon } from '@/domain/goals';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Select } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { Segmented } from '@/ui/Segmented';
import { EmptyState, LoadingState } from '@/ui/States';
import { Surface } from '@/ui/Surface';
import { cn } from '@/ui/cn';
import { GoalDialog, GoalProgressView, StatusBadge } from './goalsUi';
import { useGoals } from './useGoals';

type Show = 'open' | 'closed' | 'all';
const SHOW_KEY = 'routig.goals.show';

/** Goals (Parte 15): objetivos pessoais e acadêmicos, com progresso só quando ele é real. */
export function GoalsPage() {
  const { t, settings } = useSettings();
  const data = useGoals();
  const [show, setShow] = useState<Show>(() => {
    try {
      const v = localStorage.getItem(SHOW_KEY);
      return v === 'closed' || v === 'all' ? v : 'open';
    } catch {
      return 'open';
    }
  });
  const [area, setArea] = useState<GoalArea | ''>('');
  const [horizon, setHorizon] = useState<GoalHorizon | ''>('');
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(SHOW_KEY, show);
    } catch {
      /* preferência só desta sessão */
    }
  }, [show]);

  if (data.loading) return <LoadingState label={t('common.loading')} lines={5} />;
  const today = todayKey();
  const list = data.goals.filter((g) => (show === 'all' || (show === 'open') === isOpenGoal(g)) && (!area || g.area === area) && (!horizon || g.horizon === horizon));
  const openCount = data.goals.filter(isOpenGoal).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('modules.goals')}
        title={t('modules.goals')}
        description={t('moduleSummary.goals')}
        icon={<Target className="h-7 w-7" aria-hidden />}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            {t('goals.new')}
          </Button>
        }
      />

      {data.goals.length === 0 ? (
        <Surface tone="flat">
          <EmptyState
            icon={<Target className="h-6 w-6" />}
            title={t('goals.emptyTitle')}
            body={t('goals.empty')}
            action={
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
                {t('goals.new')}
              </Button>
            }
          />
        </Surface>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<Show>
              label={t('goals.show')}
              value={show}
              onChange={setShow}
              options={[
                { value: 'open', label: t('goals.showOpen', { count: openCount }) },
                { value: 'closed', label: t('goals.showClosed') },
                { value: 'all', label: t('goals.showAll') },
              ]}
            />
            <Select aria-label={t('goals.fields.area')} value={area} onChange={(e) => setArea(e.target.value as GoalArea | '')} className="h-10 w-auto">
              <option value="">{t('goals.anyArea')}</option>
              {GOAL_AREAS.map((a) => (
                <option key={a} value={a}>
                  {t(`goals.areas.${a}`)}
                </option>
              ))}
            </Select>
            <Select aria-label={t('goals.fields.horizon')} value={horizon} onChange={(e) => setHorizon(e.target.value as GoalHorizon | '')} className="h-10 w-auto">
              <option value="">{t('goals.anyHorizon')}</option>
              {GOAL_HORIZONS.map((h) => (
                <option key={h} value={h}>
                  {t(`goals.horizons.${h}`)}
                </option>
              ))}
            </Select>
          </div>

          {list.length === 0 ? (
            <Surface tone="flat">
              <EmptyState title={t('goals.noMatch')} />
            </Surface>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((g) => {
                const overdue = isGoalOverdue(g, today);
                return (
                  <li key={g.id}>
                    <Link to={`/goals/${g.id}`} className={cn('flex h-full flex-col gap-3 rounded-3xl bg-surface p-5 shadow-soft ring-1 ring-line/70 transition hover:-translate-y-0.5 hover:shadow-lift', !isOpenGoal(g) && 'opacity-75')}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={g.status} />
                        <Badge>{t(`goals.areas.${g.area}`)}</Badge>
                        {g.horizon && <Badge>{t(`goals.horizons.${g.horizon}`)}</Badge>}
                        {g.priority === 'high' || g.priority === 'urgent' ? <Badge tone="danger">{t(`tasks.priority.${g.priority}`)}</Badge> : null}
                      </div>
                      <div className="min-w-0">
                        <div className="line-clamp-2 text-lg font-semibold text-fg">{g.name}</div>
                        {g.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{g.description}</p>}
                      </div>
                      <div className="mt-auto flex flex-col gap-2">
                        <GoalProgressView goal={g} checkins={data.checkinsOf(g.id)} compact />
                        {g.deadline && (
                          <span className={cn('inline-flex items-center gap-1 text-xs', overdue ? 'font-medium text-danger' : 'text-muted')}>
                            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                            {overdue ? t('goals.overdue', { date: formatDateKey(g.deadline, settings.locale) }) : t('goals.until', { date: formatDateKey(g.deadline, settings.locale, { day: 'numeric', month: 'short', year: 'numeric' }) })}
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {data.trash.length > 0 && (
        <Surface tone="flat" className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-fg">{t('goals.trash')}</h2>
          {data.trash.map((g) => (
            <div key={g.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-muted">{g.name}</span>
              <Button size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => void restoreGoal(g.id)}>
                {t('academy.assessment.restore')}
              </Button>
            </div>
          ))}
        </Surface>
      )}

      {creating && <GoalDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

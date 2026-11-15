import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Lock } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSettings } from '@/app/SettingsProvider';
import { getDb } from '@/data/db';
import { CalendarPage, type CalendarView } from '@/features/calendar/CalendarPage';
import { EventsCard, TodayCard } from '@/features/dashboard/cards';
import { FinancePage } from '@/features/finance/FinancePage';
import { FinanceLock } from '@/features/finance/FinanceLock';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { LoadingState } from '@/ui/States';
import { ProjectsPage } from '@/features/projects/ProjectsPage';
import { TasksPage, type TasksView } from '@/features/tasks/TasksPage';
import type { CalendarSector, FinanceSector, ProjectsSector, TasksSector } from '../interiors/east';
import type { VaultState } from '../interiors/things';

/* ---------- Observatório Temporal (Calendar) ---------- */

const CALENDAR_VIEW: Record<Exclude<CalendarSector, 'atrium'>, CalendarView> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
  agenda: 'agenda',
  planning: 'week',
  calendars: 'year',
};

export function CalendarPanel({ id }: { id: CalendarSector }) {
  if (id === 'atrium')
    return (
      <div className="flex flex-col gap-4">
        <TodayCard />
        <EventsCard />
      </div>
    );
  // A chave recria a página ao trocar de sala, para abrir já na visão certa.
  return <CalendarPage key={id} initialView={CALENDAR_VIEW[id]} />;
}

/* ---------- Centro de Operações (Tasks) ---------- */

const TASKS_VIEW: Record<TasksSector, TasksView> = {
  atrium: 'due',
  capture: 'list',
  lists: 'category',
  kanban: 'board',
  planning: 'priority',
  recurrence: 'calendar',
  archive: 'list',
};

export function TasksPanel({ id }: { id: TasksSector }) {
  return <TasksPage key={id} initialView={TASKS_VIEW[id]} showClosed={id === 'archive'} />;
}

/* ---------- Projects ---------- */

export function ProjectsPanel({ id }: { id: ProjectsSector }) {
  const { t } = useSettings();
  const projects = useLiveQuery(async () => (await getDb().projects.toArray()).filter((p) => !p.deletedAt && p.status !== 'archived' && p.status !== 'cancelled'), []);
  if (id === 'studio') return <ProjectsPage />;
  if (!projects) return null;
  return projects.length === 0 ? (
    <p className="text-sm text-muted">{t('park.projects.none')}</p>
  ) : (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {projects.map((p) => (
        <li key={p.id}>
          <Link to={`/projects/${p.id}`} className="flex h-12 items-center gap-3 rounded-xl bg-surface-2 px-4 text-sm font-medium text-fg ring-1 ring-inset ring-line/60 hover:bg-surface-3">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
            <span className="truncate">{p.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Finanças ---------- */

export function FinancePanel({ id }: { id: FinanceSector }) {
  return <FinancePage key={id} initialArea={id} />;
}

/* ---------- Cofre de Finanças (térreo do prédio) ---------- */

/** Monta só quando o bloqueio de Finanças deixa passar (PIN certo, ou PIN removido em "Esqueci o PIN"). */
function VaultOpened({ onOpened }: { onOpened: () => void }) {
  useEffect(() => {
    onOpened();
  }, []);
  return null;
}

/**
 * Janela do cofre. Trancado: o mesmo bloqueio da tela de Finanças (FinanceLock: o mesmo PIN, as
 * mesmas esperas depois de erros, o mesmo "Esqueci o PIN"); passou, Finanças fica desbloqueado
 * nesta sessão exatamente como pela tela de Finanças. Aberto: oferece trancar de novo (o mesmo
 * "Bloquear agora" de Finanças). Sem PIN: diz onde ele é criado. Nada do PIN passa por aqui.
 */
export function FinanceVaultPanel({ state, onClose, onOpened, onLock, onGoToFinance }: { state: VaultState | 'loading'; onClose: () => void; onOpened: () => void; onLock: () => void; onGoToFinance: () => void }) {
  const { t } = useSettings();
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={t('common.close')}
      title={t('park.vault.title')}
      size="sm"
      description={state === 'open' ? t('park.vault.openBody') : state === 'none' ? t('park.vault.noPinBody') : state === 'locked' ? t('park.vault.lockedBody') : undefined}
      footer={
        state === 'open' ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('common.close')}
            </Button>
            <Button variant="primary" icon={<Lock className="h-4 w-4" />} onClick={onLock}>
              {t('park.vault.lockAgain')}
            </Button>
          </>
        ) : state === 'none' ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('common.close')}
            </Button>
            <Button variant="primary" icon={<KeyRound className="h-4 w-4" />} onClick={onGoToFinance}>
              {t('park.vault.goToFinance')}
            </Button>
          </>
        ) : undefined
      }
    >
      {state === 'loading' ? (
        <LoadingState label={t('common.loading')} lines={2} />
      ) : state === 'locked' ? (
        <FinanceLock>
          <VaultOpened onOpened={onOpened} />
        </FinanceLock>
      ) : null}
    </Dialog>
  );
}

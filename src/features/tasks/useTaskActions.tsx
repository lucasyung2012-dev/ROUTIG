import { useState, type ReactNode } from 'react';
import { useSettings } from '@/app/SettingsProvider';
import { TaskRuleError, toggleDone, type UpdateResult } from '@/data/tasksRepo';
import { formatDateKey } from '@/domain/dates';
import { blockers, isClosedKind, statusKind, type Task } from '@/domain/tasks';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { useToast } from '@/ui/toast';
import type { TasksData } from './useTasksData';

/** Concluir/reabrir com aviso de bloqueio e mensagem da próxima ocorrência. */
export function useTaskActions(data: TasksData): { toggle: (task: Task) => void; dialogs: ReactNode; reportResult: (r: UpdateResult) => void; reportError: (e: unknown) => void } {
  const { t, settings } = useSettings();
  const toast = useToast();
  const [pending, setPending] = useState<Task | null>(null);

  const reportResult = (r: UpdateResult) => {
    const occ = r.completedOccurrence;
    if (!occ) return;
    const date = formatDateKey(occ.date, settings.locale);
    if (occ.next) toast.show(t('tasks.occurrenceDone', { date, next: formatDateKey(occ.next, settings.locale, { weekday: 'short', day: 'numeric', month: 'short' }) }));
    else toast.show(t('tasks.seriesEnded', { date }));
  };

  const reportError = (e: unknown) => {
    if (e instanceof TaskRuleError && e.code === 'dependency_cycle') toast.show(t('tasks.editor.cycle'), 'error');
    else if (e instanceof TaskRuleError && e.code === 'invalid') toast.show(t('tasks.editor.invalid'), 'error');
    else toast.show(t('errors.saveFailed'), 'error');
  };

  const run = (task: Task) => toggleDone(task.id).then(reportResult, reportError);

  const toggle = (task: Task) => {
    const closed = isClosedKind(statusKind(data.config, task.statusId));
    if (!closed && blockers(task, data.byId, data.config).length > 0) setPending(task);
    else void run(task);
  };

  const dialogs = (
    <ConfirmDialog
      open={!!pending}
      title={t('tasks.blockedConfirmTitle')}
      body={pending ? t('tasks.blockedConfirmBody', { titles: blockers(pending, data.byId, data.config).map((b) => `"${b.title}"`).join(', ') }) : ''}
      confirmLabel={t('tasks.completeAnyway')}
      cancelLabel={t('common.cancel')}
      onCancel={() => setPending(null)}
      onConfirm={() => {
        if (pending) void run(pending);
        setPending(null);
      }}
    />
  );

  return { toggle, dialogs, reportResult, reportError };
}

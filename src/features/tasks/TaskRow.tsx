import { CalendarClock, Check, Flag, ListChecks, Lock, Paperclip, Repeat } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { formatDateKey, todayKey } from '@/domain/dates';
import { blockers, checklistProgress, isClosedKind, isOverdue, statusKind, type Priority, type Task } from '@/domain/tasks';
import { cn } from '@/ui/cn';
import type { TasksData } from './useTasksData';

export const PRIORITY_CLASS: Record<Priority, string> = {
  urgent: 'text-danger',
  high: 'text-rose',
  medium: 'text-amber',
  low: 'text-blue',
  none: 'text-subtle',
};

const PRIORITY_RING: Record<Priority, string> = {
  urgent: 'ring-danger',
  high: 'ring-rose',
  medium: 'ring-amber',
  low: 'ring-blue',
  none: 'ring-line',
};

interface TaskRowProps {
  task: Task;
  data: TasksData;
  onOpen: (id: string) => void;
  onToggle: (task: Task) => void;
  compact?: boolean;
}

/** Uma tarefa numa lista: círculo para concluir, título e os sinais que importam. */
export function TaskRow({ task, data, onOpen, onToggle, compact = false }: TaskRowProps) {
  const { t, settings } = useSettings();
  const today = todayKey();
  const closed = isClosedKind(statusKind(data.config, task.statusId));
  const overdue = isOverdue(task, today, data.config);
  const blocked = blockers(task, data.byId, data.config);
  const progress = checklistProgress(task);
  const children = data.active.filter((c) => c.parentId === task.id);
  const childrenDone = children.filter((c) => isClosedKind(statusKind(data.config, c.statusId))).length;
  const list = data.lists.find((l) => l.id === task.listId);

  return (
    <div className={cn('group flex items-start gap-3 rounded-xl px-2 py-2 transition hover:bg-surface-2/70', compact ? 'py-1.5' : 'sm:px-3')}>
      <button
        type="button"
        onClick={() => onToggle(task)}
        aria-label={closed ? t('tasks.reopen', { title: task.title }) : t('tasks.markDone', { title: task.title })}
        aria-pressed={closed}
        className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-2 transition',
          closed ? 'bg-success text-white ring-success' : cn(PRIORITY_RING[task.priority], 'hover:ring-accent'),
        )}
      >
        {closed && <Check className="h-3.5 w-3.5" aria-hidden />}
      </button>

      <button type="button" onClick={() => onOpen(task.id)} className="min-w-0 flex-1 text-left">
        <div className={cn('text-[0.9375rem] font-medium leading-snug', closed ? 'text-subtle line-through' : 'text-fg')}>{task.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {task.dueDate && (
            <span className={cn('inline-flex items-center gap-1', overdue && 'font-semibold text-danger')}>
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              {formatDateKey(task.dueDate, settings.locale, { day: 'numeric', month: 'short' })}
              {task.dueTime && ` · ${task.dueTime}`}
              {overdue && ` · ${t('tasks.overdueLabel')}`}
            </span>
          )}
          {task.recurrence && (
            <span className="inline-flex items-center gap-1" title={t('tasks.recurring')}>
              <Repeat className="h-3.5 w-3.5" aria-label={t('tasks.recurring')} />
            </span>
          )}
          {task.priority !== 'none' && (
            <span className={cn('inline-flex items-center gap-1', PRIORITY_CLASS[task.priority])}>
              <Flag className="h-3.5 w-3.5" aria-hidden />
              {t(`tasks.priority.${task.priority}`)}
            </span>
          )}
          {list && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: list.color }} aria-hidden />
              {list.name}
            </span>
          )}
          {progress && (
            <span className="inline-flex items-center gap-1 tabular">
              <ListChecks className="h-3.5 w-3.5" aria-hidden />
              {t('tasks.checklistCount', { done: progress.done, total: progress.total })}
            </span>
          )}
          {children.length > 0 && <span className="tabular">{t('tasks.subtasksCount', { done: childrenDone, total: children.length })}</span>}
          {task.attachments.length > 0 && <Paperclip className="h-3.5 w-3.5" aria-hidden />}
          {blocked.length > 0 && !closed && (
            <span className="inline-flex items-center gap-1 font-medium text-warning">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              {t('tasks.blockedBy', { title: blocked.map((b) => b.title).join(', ') })}
            </span>
          )}
          {!compact &&
            task.tags.map((tag) => (
              <span key={tag} className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[0.7rem] font-medium text-muted">
                #{tag}
              </span>
            ))}
        </div>
      </button>
    </div>
  );
}

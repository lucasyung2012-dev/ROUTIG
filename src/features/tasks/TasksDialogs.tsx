import { useState } from 'react';
import { Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useSettings } from '@/app/SettingsProvider';
import { addCategory, addStatus, createList, deleteList, purgeTask, removeStatus, renameStatus, restoreTask, saveTasksConfig, TaskRuleError, updateList } from '@/data/tasksRepo';
import { STATUS_KINDS, type StatusKind, type Task, type TaskList } from '@/domain/tasks';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Dialog } from '@/ui/Dialog';
import { Input, Select } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { EmptyState } from '@/ui/States';
import { useToast } from '@/ui/toast';
import { LIST_COLORS, useStatusName, type TasksData } from './useTasksData';

/* ---------- Lixeira ---------- */

export function TrashDialog({ open, onClose, data }: { open: boolean; onClose: () => void; data: TasksData }) {
  const { t, settings } = useSettings();
  const toast = useToast();
  const [purging, setPurging] = useState<Task | null>(null);
  const fmt = new Intl.DateTimeFormat(settings.locale, { dateStyle: 'medium', timeStyle: 'short' });
  // Mostra só as raízes: subtarefas excluídas junto com a mãe voltam com ela.
  const roots = data.trash.filter((x) => !x.parentId || !data.trash.some((p) => p.id === x.parentId));

  return (
    <>
      <Dialog open={open} onClose={onClose} title={t('tasks.trash.title')} description={t('tasks.trash.body')} closeLabel={t('common.close')}>
        {roots.length === 0 ? (
          <EmptyState icon={<Trash2 className="h-6 w-6" aria-hidden />} title={t('tasks.trash.empty')} />
        ) : (
          <ul className="flex flex-col divide-y divide-line/60">
            {roots.map((task) => (
              <li key={task.id} className="flex flex-wrap items-center gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[0.9375rem] font-medium text-fg">{task.title}</div>
                  <div className="text-xs text-subtle">{t('tasks.trash.deletedOn', { date: fmt.format(new Date(task.deletedAt!)) })}</div>
                </div>
                <Button
                  size="sm"
                  icon={<RotateCcw className="h-4 w-4" aria-hidden />}
                  onClick={() => void restoreTask(task.id).then(() => toast.show(t('tasks.trash.restored')))}
                >
                  {t('tasks.trash.restore')}
                </Button>
                <Button size="sm" variant="danger" onClick={() => setPurging(task)}>
                  {t('tasks.trash.purge')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!purging}
        danger
        title={purging ? t('tasks.trash.purgeTitle', { title: purging.title }) : ''}
        body={t('tasks.trash.purgeBody')}
        confirmLabel={t('tasks.trash.purge')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setPurging(null)}
        onConfirm={() => {
          const target = purging;
          setPurging(null);
          if (target) void purgeTask(target.id).then(() => toast.show(t('tasks.trash.purged')));
        }}
      />
    </>
  );
}

/* ---------- Configurar: status, listas e categorias ---------- */

export function TasksConfigDialog({ open, onClose, data }: { open: boolean; onClose: () => void; data: TasksData }) {
  const { t } = useSettings();
  const toast = useToast();
  const statusName = useStatusName();
  const [newStatus, setNewStatus] = useState('');
  const [newKind, setNewKind] = useState<StatusKind>('active');
  const [newList, setNewList] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [deleting, setDeleting] = useState<TaskList | null>(null);

  const fail = (e: unknown) =>
    toast.show(e instanceof TaskRuleError && e.code === 'status_in_use' ? t('tasks.config.statusInUse') : t('errors.saveFailed'), 'error');

  return (
    <>
      <Dialog open={open} onClose={onClose} size="lg" title={t('tasks.config.title')} closeLabel={t('common.close')} footer={<Button variant="primary" onClick={onClose}>{t('common.done')}</Button>}>
        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-semibold text-fg">{t('tasks.config.statuses')}</h3>
              <p className="mt-1 text-sm text-muted">{t('tasks.config.statusesHint')}</p>
            </div>
            <ul className="flex flex-col gap-2">
              {data.config.statuses.map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <Input
                    aria-label={t('tasks.config.rename')}
                    defaultValue={statusName(s)}
                    maxLength={40}
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      if (name && name !== statusName(s)) void renameStatus(s.id, name).catch(fail);
                    }}
                    className="min-w-0 flex-1"
                  />
                  <span className="w-28 shrink-0 text-xs text-subtle">{t(`tasks.kinds.${s.kind}`)}</span>
                  {s.builtin ? (
                    <span className="h-9 w-9" aria-hidden />
                  ) : (
                    <IconButton size="sm" label={t('tasks.config.removeStatus', { name: statusName(s) })} icon={<X className="h-4 w-4" />} onClick={() => void removeStatus(s.id).catch(fail)} />
                  )}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Input aria-label={t('tasks.config.statusName')} placeholder={t('tasks.config.statusName')} value={newStatus} maxLength={40} onChange={(e) => setNewStatus(e.target.value)} className="min-w-0 flex-1" />
              <Select aria-label={t('tasks.config.statusKind')} value={newKind} onChange={(e) => setNewKind(e.target.value as StatusKind)} className="w-44">
                {STATUS_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t('tasks.config.statusKind')}: {t(`tasks.kinds.${k}`)}
                  </option>
                ))}
              </Select>
              <Button
                icon={<Plus className="h-4 w-4" aria-hidden />}
                disabled={!newStatus.trim()}
                onClick={() =>
                  void addStatus(newStatus, newKind).then(() => setNewStatus(''), fail)
                }
              >
                {t('tasks.config.addStatus')}
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-fg">{t('tasks.config.lists')}</h3>
            <ul className="flex flex-col gap-2">
              {data.lists.map((l) => (
                <li key={l.id} className="flex items-center gap-2">
                  <div className="flex gap-1" role="radiogroup" aria-label={l.name}>
                    {LIST_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={l.color === c}
                        aria-label={c}
                        onClick={() => void updateList(l.id, { color: c })}
                        className="h-6 w-6 rounded-full ring-offset-2 ring-offset-surface transition aria-checked:ring-2 aria-checked:ring-fg"
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                  <Input
                    aria-label={t('tasks.config.rename')}
                    defaultValue={l.name}
                    maxLength={60}
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      if (name && name !== l.name) void updateList(l.id, { name });
                    }}
                    className="min-w-0 flex-1"
                  />
                  <IconButton size="sm" label={t('tasks.config.deleteList', { name: l.name })} icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleting(l)} />
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Input
                aria-label={t('tasks.config.listName')}
                placeholder={t('tasks.config.listName')}
                value={newList}
                maxLength={60}
                onChange={(e) => setNewList(e.target.value)}
                className="min-w-0 flex-1"
              />
              <Button
                icon={<Plus className="h-4 w-4" aria-hidden />}
                disabled={!newList.trim()}
                onClick={() => void createList(newList, LIST_COLORS[data.lists.length % LIST_COLORS.length]!).then(() => setNewList(''), fail)}
              >
                {t('tasks.config.addList')}
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-fg">{t('tasks.config.categories')}</h3>
            <div className="flex flex-wrap gap-1.5">
              {data.config.categories.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2.5 py-1 text-sm text-fg ring-1 ring-line">
                  {c}
                  <button
                    type="button"
                    aria-label={`${t('common.hide')}: ${c}`}
                    className="text-subtle hover:text-danger"
                    onClick={() => void saveTasksConfig({ ...data.config, categories: data.config.categories.filter((x) => x !== c) }).catch(fail)}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                aria-label={t('tasks.config.categoryName')}
                placeholder={t('tasks.config.categoryName')}
                value={newCategory}
                maxLength={60}
                onChange={(e) => setNewCategory(e.target.value)}
                className="min-w-0 flex-1"
              />
              <Button icon={<Plus className="h-4 w-4" aria-hidden />} disabled={!newCategory.trim()} onClick={() => void addCategory(newCategory).then(() => setNewCategory(''), fail)}>
                {t('tasks.config.addCategory')}
              </Button>
            </div>
          </section>
        </div>
      </Dialog>
      <ConfirmDialog
        open={!!deleting}
        danger
        title={deleting ? t('tasks.config.deleteListTitle', { name: deleting.name }) : ''}
        body={t('tasks.config.deleteListBody')}
        confirmLabel={deleting ? t('tasks.config.deleteList', { name: deleting.name }) : ''}
        cancelLabel={t('common.cancel')}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (target) void deleteList(target.id).catch(fail);
        }}
      />
    </>
  );
}

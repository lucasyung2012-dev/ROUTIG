import { useEffect, useRef, useState } from 'react';
import { CalendarPlus, FileUp, FolderKanban, ListTodo, NotebookPen, Plus, Repeat, Target, Timer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '@/app/SettingsProvider';
import { createNote, emptyNoteInput } from '@/data/notesRepo';
import { useEventEditor } from '@/features/calendar/EventEditor';
import { GoalDialog } from '@/features/goals/goalsUi';
import { HabitDialog } from '@/features/habits/habitsUi';
import { ImportDialog } from '@/features/library/libraryUi';
import { useTaskEditor } from '@/features/tasks/TaskEditor';

/**
 * Ações rápidas (Parte 4.4): criar tarefas, eventos, notas, projetos, objetivos, hábitos, materiais
 * e sessões de Focus de qualquer tela, com os mesmos formulários dos módulos.
 */
export function QuickCreate() {
  const { t } = useSettings();
  const tasks = useTaskEditor();
  const events = useEventEditor();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<'goal' | 'habit' | 'material' | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const items = [
    { key: 'task', label: t('quick.task'), icon: ListTodo, run: () => tasks.newTask() },
    { key: 'event', label: t('quick.event'), icon: CalendarPlus, run: () => events.newEvent() },
    { key: 'note', label: t('quick.note'), icon: NotebookPen, run: () => void createNote(emptyNoteInput()).then((n) => navigate(`/notes/${n.id}`)) },
    { key: 'project', label: t('quick.project'), icon: FolderKanban, run: () => navigate('/projects', { state: { create: true } }) },
    { key: 'goal', label: t('quick.goal'), icon: Target, run: () => setDialog('goal') },
    { key: 'habit', label: t('quick.habit'), icon: Repeat, run: () => setDialog('habit') },
    { key: 'material', label: t('quick.material'), icon: FileUp, run: () => setDialog('material') },
    { key: 'focus', label: t('quick.focus'), icon: Timer, run: () => navigate('/focus') },
  ];

  return (
    <div ref={box} className="relative mr-1">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-semibold text-white shadow-glow transition hover:brightness-110"
      >
        <Plus className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">{t('quick.create')}</span>
        <span className="sr-only sm:hidden">{t('quick.create')}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-40 w-52 animate-scale-in overflow-hidden rounded-2xl bg-surface p-1.5 shadow-lift ring-1 ring-line">
          {items.map(({ key, label, icon: Icon, run }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                run();
              }}
              className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[0.9375rem] font-medium text-fg hover:bg-surface-2"
            >
              <Icon className="h-[18px] w-[18px] text-accent" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      )}
      {dialog === 'goal' && <GoalDialog onClose={() => setDialog(null)} onSaved={(g) => navigate(`/goals/${g.id}`)} />}
      {dialog === 'habit' && <HabitDialog categories={[]} onClose={() => setDialog(null)} onSaved={(h) => navigate(`/habits/${h.id}`)} />}
      {dialog === 'material' && <ImportDialog collections={[]} folders={[]} onClose={() => setDialog(null)} />}
    </div>
  );
}

import { beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SettingsProvider } from '@/app/SettingsProvider';
import { RoutigDB, getDb, setDbForTests } from '@/data/db';
import { createEvent } from '@/data/eventsRepo';
import { createAsset } from '@/data/financeRepo';
import { loadPlanPrefs, saveBudgetCategory, savePlanPrefs, setFinancePin } from '@/data/financePlanRepo';
import { createProject } from '@/data/projectsRepo';
import { createTask } from '@/data/tasksRepo';
import { addDays, todayKey } from '@/domain/dates';
import { emptyEventInput } from '@/domain/events';
import { emptyAssetInput } from '@/domain/finance';
import { emptyProjectInput } from '@/domain/projects';
import { emptyTaskInput } from '@/domain/tasks';
import { EventEditorProvider } from '@/features/calendar/EventEditor';
import { lockFinanceNow } from '@/features/finance/FinanceLock';
import { TaskEditorProvider } from '@/features/tasks/TaskEditor';
import { clearStationMemory } from '@/features/park/panels/east/station';
import { CalendarPanel, FinancePanel, ProjectsPanel, TasksPanel } from '@/features/park/panels/EastPanels';
import { ToastProvider } from '@/ui/toast';

/** As estações do leste usam os mesmos repos do Control Room: o que se faz nelas aparece no banco de sempre. */

beforeEach(() => {
  setDbForTests(new RoutigDB(`test-east-${Math.random().toString(36).slice(2)}`));
  clearStationMemory();
  lockFinanceNow();
});

function show(ui: ReactNode) {
  return render(
    <SettingsProvider>
      <ToastProvider closeLabel="Fechar">
        <MemoryRouter>
          <TaskEditorProvider>
            <EventEditorProvider>{ui}</EventEditorProvider>
          </TaskEditorProvider>
        </MemoryRouter>
      </ToastProvider>
    </SettingsProvider>,
  );
}

describe('Centro de Operações (Tasks)', () => {
  it('a criação rápida grava no tasksRepo com prazo e prioridade', async () => {
    const user = userEvent.setup();
    show(<TasksPanel id="capture" />);
    await user.type(await screen.findByRole('textbox', { name: 'Título' }), 'Ler capítulo 3');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Prioridade' }), 'high');
    await user.click(screen.getByRole('button', { name: 'Hoje' }));
    await user.click(screen.getByRole('button', { name: 'Nova tarefa' }));
    await waitFor(async () => {
      const all = await getDb().tasks.toArray();
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({ title: 'Ler capítulo 3', priority: 'high', dueDate: todayKey(), originModule: 'tasks' });
    });
    expect(await screen.findByRole('checkbox', { name: 'Concluir: Ler capítulo 3' })).toBeInTheDocument();
  });

  it('a visão geral mostra hoje e atrasadas e conclui só com o toque', async () => {
    const user = userEvent.setup();
    await createTask(emptyTaskInput({ title: 'Atrasada', dueDate: addDays(todayKey(), -2) }));
    await createTask(emptyTaskInput({ title: 'Para hoje', dueDate: todayKey() }));
    await createTask(emptyTaskInput({ title: 'Semana que vem', dueDate: addDays(todayKey(), 7) }));
    show(<TasksPanel id="atrium" />);
    expect(await screen.findByRole('checkbox', { name: 'Concluir: Atrasada' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Concluir: Para hoje' })).toBeInTheDocument();
    expect(screen.queryByText('Semana que vem')).not.toBeInTheDocument();
    expect((await getDb().tasks.toArray()).every((x) => x.statusId === 'todo')).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: 'Concluir: Para hoje' }));
    await waitFor(async () => expect((await getDb().tasks.toArray()).find((x) => x.title === 'Para hoje')?.statusId).toBe('done'));
  });

  it('sem tarefas, diz isso (nada de exemplo)', async () => {
    show(<TasksPanel id="atrium" />);
    expect(await screen.findByText('Nenhuma tarefa para hoje nem atrasada.')).toBeInTheDocument();
  });
});

describe('Observatório Temporal (Calendar)', () => {
  it('a Sala Diária cria o evento no eventsRepo e só aponta o conflito, sem mexer no outro', async () => {
    const user = userEvent.setup();
    const today = todayKey();
    const aula = await createEvent(emptyEventInput({ title: 'Aula', start: today, endDate: today, startTime: '09:00', durationMin: 60 }));
    show(<CalendarPanel id="daily" />);
    expect(await screen.findByRole('button', { name: 'Aula' })).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Nome do evento' }), 'Dentista');
    await user.click(screen.getByRole('button', { name: 'Criar evento' }));
    await waitFor(async () => expect(await getDb().events.count()).toBe(2));
    const created = (await getDb().events.toArray()).find((e) => e.title === 'Dentista');
    expect(created).toMatchObject({ start: today, startTime: '09:00', durationMin: 60 });
    expect(await getDb().events.get(aula.id)).toMatchObject({ startTime: '09:00', durationMin: 60, rev: 1 });
    expect((await screen.findAllByText(/No mesmo horário: Aula/)).length).toBeGreaterThan(0);
  });
});

describe('Centro de Projetos (Projects)', () => {
  it('o estúdio cria o projeto no projectsRepo', async () => {
    const user = userEvent.setup();
    show(<ProjectsPanel id="studio" />);
    await user.type(await screen.findByRole('textbox', { name: 'Nome' }), 'Feira de ciências');
    await user.click(screen.getByRole('button', { name: 'Criar projeto' }));
    await waitFor(async () => expect((await getDb().projects.toArray()).map((p) => p.name)).toEqual(['Feira de ciências']));
  });

  it('a galeria marca um marco de verdade', async () => {
    const user = userEvent.setup();
    await createProject(emptyProjectInput({ name: 'Maquete', status: 'active', milestones: [{ id: 'm1', title: 'Entrega 1', date: null, done: false, doneAt: null }] }));
    show(<ProjectsPanel id="gallery" />);
    await user.click(await screen.findByRole('button', { name: /Maquete/ }));
    await user.click(await screen.findByRole('checkbox', { name: 'Marco alcançado: Entrega 1' }));
    await waitFor(async () => expect((await getDb().projects.toArray())[0]?.milestones[0]).toMatchObject({ done: true }));
  });
});

describe('Centro de Gestão Financeira (Finanças)', () => {
  it('com PIN, nada de Finanças aparece antes do mesmo bloqueio de Finanças', async () => {
    const user = userEvent.setup();
    await setFinancePin('2468');
    await createAsset({ ...emptyAssetInput(), name: 'Tesouro Selic' });
    show(<FinancePanel id="investments" />);
    expect(await screen.findByText('Finanças está protegida')).toBeInTheDocument();
    expect(screen.queryByText('Tesouro Selic')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('PIN'), '2468');
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(await screen.findByText('Tesouro Selic')).toBeInTheDocument();
  });

  it('o planejamento registra no orçamento do mês pelo financePlanRepo', async () => {
    const user = userEvent.setup();
    await savePlanPrefs({ ...(await loadPlanPrefs()), budgetEnabled: true });
    const cat = await saveBudgetCategory(null, 'Lanche', 'expense', 100);
    show(<FinancePanel id="planning" />);
    await user.type(await screen.findByRole('textbox', { name: 'Valor (BRL)' }), '25');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(async () => expect(await getDb().budgetEntries.toArray()).toMatchObject([{ categoryId: cat.id, amount: 25, date: todayKey() }]));
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SettingsProvider, useSettings } from '@/app/SettingsProvider';
import { getDb, RoutigDB, setDbForTests } from '@/data/db';
import { loadActiveTimer } from '@/data/focusRepo';
import { createGoal } from '@/data/goalsRepo';
import { createHabit } from '@/data/habitsRepo';
import { createInstrument } from '@/data/musicRepo';
import { createSport } from '@/data/sportsRepo';
import { todayKey } from '@/domain/dates';
import { emptyGoalInput } from '@/domain/goals';
import { emptyHabitInput } from '@/domain/habits';
import { GUITAR_PRESET } from '@/domain/music';
import { FocusProvider } from '@/features/focus/FocusProvider';
import { FocusPanel, GoalsPanel, HabitsPanel, MusicPanel, SportsPanel } from '@/features/park/panels/WestSouthPanels';
import { ToastProvider } from '@/ui/toast';

/*
 * Estações do setor oeste/sul do Campus: cada ação grava pelos mesmos repositórios do Control Room.
 * (Os textos das estações vêm de park.native.westsouth.*; os botões testados aqui usam chaves que já
 * existiam nos módulos, exceto o registro rápido de prática da Música.)
 */

beforeEach(() => {
  setDbForTests(new RoutigDB(`test-park-ws-${Math.random().toString(36).slice(2)}`));
  localStorage.clear();
  sessionStorage.clear();
});

function Toasts({ children }: { children: ReactNode }) {
  const { t } = useSettings();
  return <ToastProvider closeLabel={t('common.close')}>{children}</ToastProvider>;
}

/** Os mesmos provedores que o Campus recebe de App/AppProviders (um FocusProvider só para o app inteiro). */
function Campus({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <Toasts>
        <MemoryRouter>
          <FocusProvider>{children}</FocusProvider>
        </MemoryRouter>
      </Toasts>
    </SettingsProvider>
  );
}

describe('Campus · Jardim da Concentração (Focus)', () => {
  it('começar, pausar e encerrar na Estação Focus usa o timer do Focus e salva a sessão', async () => {
    const user = userEvent.setup();
    render(
      <Campus>
        <FocusPanel id="garden" />
      </Campus>,
    );
    await user.click(await screen.findByRole('button', { name: 'Começar' }));
    // O timer em andamento é o mesmo que o Control Room lê (focus.active no banco).
    await waitFor(async () => expect((await loadActiveTimer())?.kind).toBe('study'));
    await user.click(await screen.findByRole('button', { name: 'Pausar' }));
    await waitFor(async () => expect((await loadActiveTimer())?.runningSince).toBeNull());
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Encerrar' }));
    await user.click(await screen.findByRole('button', { name: 'Salvar sessão' }));
    await waitFor(async () => expect(await getDb().focusSessions.count()).toBe(1));
    expect(await loadActiveTimer()).toBeNull();
    expect(await screen.findByRole('button', { name: 'Começar' })).toBeInTheDocument();
  });

  it('a sessão continua ao sair e voltar para a estação', async () => {
    const user = userEvent.setup();
    const first = render(
      <Campus>
        <FocusPanel id="garden" />
      </Campus>,
    );
    await user.click(await screen.findByRole('button', { name: 'Começar' }));
    await waitFor(async () => expect(await loadActiveTimer()).not.toBeNull());
    first.unmount();
    render(
      <Campus>
        <FocusPanel id="garden" />
      </Campus>,
    );
    expect(await screen.findByRole('button', { name: 'Pausar' })).toBeInTheDocument();
  });
});

describe('Campus · Estufa de Hábitos', () => {
  it('concluir um hábito na estação de hoje grava o registro do dia em habitsRepo', async () => {
    const h = await createHabit({ ...emptyHabitInput(todayKey()), name: 'Ler' });
    const user = userEvent.setup();
    render(
      <Campus>
        <HabitsPanel id="atrium" />
      </Campus>,
    );
    expect(await screen.findByText('Ler')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Concluir' }));
    await waitFor(async () => expect((await getDb().habitLogs.where('[habitId+date]').equals([h.id, todayKey()]).first())?.value).toBe(1));
  });

  it('sem hábitos, a estação diz isso em vez de mostrar dados', async () => {
    render(
      <Campus>
        <HabitsPanel id="atrium" />
      </Campus>,
    );
    expect(await screen.findByText(/Escolha como acompanhar cada hábito/)).toBeInTheDocument();
  });
});

describe('Campus · Centro de Objetivos', () => {
  it('marcar a etapa na estação atualiza o objetivo real e permite concluir', async () => {
    const g = await createGoal(emptyGoalInput({ name: 'Meta X', type: 'stages', status: 'active', milestones: [{ id: 'm1', title: 'Etapa 1', date: null, done: false, doneAt: null }] }));
    const user = userEvent.setup();
    render(
      <Campus>
        <GoalsPanel id="garden" />
      </Campus>,
    );
    await user.click(await screen.findByRole('button', { name: /Meta X/ }));
    await user.click(await screen.findByRole('checkbox', { name: 'Etapa 1' }));
    await waitFor(async () => expect((await getDb().goals.get(g.id))?.milestones[0]?.done).toBe(true));
    await user.click(await screen.findByRole('button', { name: 'Marcar como concluído' }));
    await waitFor(async () => expect((await getDb().goals.get(g.id))?.status).toBe('done'));
  });
});

describe('Campus · Conservatório Musical', () => {
  it('o registro rápido de prática grava uma prática do instrumento em musicRepo', async () => {
    const ins = await createInstrument({ ...GUITAR_PRESET, startedOn: null, notes: '' });
    const user = userEvent.setup();
    render(
      <Campus>
        <MusicPanel id="atrium" />
      </Campus>,
    );
    await user.click(await screen.findByRole('button', { name: /Registrar 30 min de Violão/ }));
    await waitFor(async () => expect((await getDb().practiceSessions.toArray()).map((p) => [p.instrumentId, p.durationMin])).toEqual([[ins.id, 30]]));
  });
});

describe('Campus · Centro Esportivo', () => {
  it('o registro rápido grava um treino do esporte em sportsRepo', async () => {
    const sport = await createSport({ name: 'Tênis', kind: 'tennis', color: '#16B8A6', notes: '' });
    const user = userEvent.setup();
    render(
      <Campus>
        <SportsPanel id="atrium" />
      </Campus>,
    );
    await user.click(await screen.findByRole('button', { name: 'Registrar treino' }));
    await waitFor(async () => {
      const acts = await getDb().sportActivities.toArray();
      expect(acts.map((a) => [a.sportId, a.type, a.durationMin, a.date])).toEqual([[sport.id, 'training', 60, todayKey()]]);
    });
  });
});

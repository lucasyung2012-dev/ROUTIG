import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { RoutigDB, setDbForTests } from '@/data/db';
import { loadSettings, saveSettings } from '@/data/settingsRepo';
import { defaultSettings } from '@/domain/settings';

let dbName = '';

beforeEach(() => {
  dbName = `test-app-${Math.random().toString(36).slice(2)}`;
  setDbForTests(new RoutigDB(dbName));
  window.location.hash = '#/dashboard';
  document.documentElement.removeAttribute('data-theme');
  // Última tela do Control Room, favorita do Home e lugar do Campus não passam de um teste para o outro.
  localStorage.clear();
  sessionStorage.clear();
});

async function finishOnboarding() {
  const s = defaultSettings();
  s.onboarding.completed = true;
  await saveSettings(s);
}

describe('onboarding (Parte 29)', () => {
  it('começa pelas boas-vindas com logo e tagline', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Bem-vindo ao ROUTIG' })).toBeInTheDocument();
    expect(screen.getByText('Your route. Your progress.')).toBeInTheDocument();
  });

  it('se for interrompido, volta do passo onde parou', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await user.click(await screen.findByRole('button', { name: /Começar/ }));
    expect(await screen.findByRole('heading', { name: 'Em que idioma você quer usar?' })).toBeInTheDocument();
    unmount();

    setDbForTests(new RoutigDB(dbName));
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Em que idioma você quer usar?' })).toBeInTheDocument();
    expect((await loadSettings()).onboarding.step).toBe(1);
  });

  it('trocar o idioma no onboarding muda a interface na hora', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Começar/ }));
    await user.click(await screen.findByRole('radio', { name: 'English' }));
    expect(await screen.findByRole('heading', { name: 'Which language do you want to use?' })).toBeInTheDocument();
  });

  it('pular leva direto ao app', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Pular' }));
    expect(await screen.findByRole('navigation', { name: 'Menu principal' })).toBeInTheDocument();
  });
});

describe('navegação (Parte 4)', () => {
  it('a barra lateral do Control Room mostra os 16 módulos, o seletor para o Campus e o caminho para o Home', async () => {
    await finishOnboarding();
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Menu principal' });
    expect(within(nav).getAllByRole('link')).toHaveLength(16);
    // Perfil e Configurações ficam no Home: o Control Room leva até lá e mantém o atalho do perfil.
    expect(screen.getAllByRole('link', { name: 'ROUTIG Home' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Profile' }).length).toBeGreaterThan(0);
    const swap = screen.getByRole('navigation', { name: 'Trocar de ambiente' });
    expect(within(swap).getByRole('link', { name: /Campus/ })).toHaveAttribute('href', '#/campus');
    expect(within(swap).getByRole('link', { name: /Control Room/ })).toHaveAttribute('aria-current', 'page');
  });

  it('ocultar um módulo em Configurações (no Home) tira ele do menu do Control Room e a escolha fica gravada', async () => {
    await finishOnboarding();
    window.location.hash = '#/settings/navigation';
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Ocultar: Finanças' }));
    await waitFor(async () => expect((await loadSettings()).nav.hidden).toContain('finance'));
    window.location.hash = '#/tasks';
    const nav = await screen.findByRole('navigation', { name: 'Menu principal' });
    expect(within(nav).queryByRole('link', { name: /Finanças/ })).not.toBeInTheDocument();
    expect(within(nav).getAllByRole('link')).toHaveLength(15);
  });

  it('favoritar coloca o módulo no grupo Favoritos do Control Room', async () => {
    await finishOnboarding();
    window.location.hash = '#/settings/navigation';
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Favoritar: Academy' }));
    await waitFor(async () => expect((await loadSettings()).nav.favorites).toEqual(['academy']));
    window.location.hash = '#/tasks';
    const nav = await screen.findByRole('navigation', { name: 'Menu principal' });
    expect(within(nav).getByText('Favoritos')).toBeInTheDocument();
  });

  it('todos os módulos existem: Insights abre a análise real, sem página de "em breve"', async () => {
    await finishOnboarding();
    window.location.hash = '#/insights';
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Insights' })).toBeInTheDocument();
    expect(screen.queryByText(/chega na Etapa/)).not.toBeInTheDocument();
  });

  it('Academy sem ano letivo pede para criar o primeiro, sem dados inventados', async () => {
    await finishOnboarding();
    window.location.hash = '#/academy';
    render(<App />);
    expect(await screen.findByText('Nenhum ano letivo ainda')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Novo ano letivo' })).toBeInTheDocument();
  });
});

describe('Tasks (Parte 7)', () => {
  it('criação rápida: escrever e apertar Enter cria a tarefa e ela aparece na lista', async () => {
    await finishOnboarding();
    window.location.hash = '#/tasks';
    const user = userEvent.setup();
    render(<App />);
    const input = await screen.findByRole('textbox', { name: 'Adicionar tarefa e apertar Enter' });
    await user.type(input, 'Estudar vocabulário de alemão{Enter}');
    expect(await screen.findByRole('button', { name: 'Concluir: Estudar vocabulário de alemão' })).toBeInTheDocument();
  });

  it('concluir pela lista tira a tarefa das pendentes', async () => {
    await finishOnboarding();
    window.location.hash = '#/tasks';
    const user = userEvent.setup();
    render(<App />);
    const input = await screen.findByRole('textbox', { name: 'Adicionar tarefa e apertar Enter' });
    await user.type(input, 'Praticar violão{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Concluir: Praticar violão' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Concluir: Praticar violão' })).not.toBeInTheDocument());
  });
});

describe('Calendar (Parte 6)', () => {
  it('tarefa com prazo aparece na agenda sem ser copiada', async () => {
    await finishOnboarding();
    const { createTask } = await import('@/data/tasksRepo');
    const { emptyTaskInput } = await import('@/domain/tasks');
    const { todayKey } = await import('@/domain/dates');
    await createTask(emptyTaskInput({ title: 'Entregar redação', dueDate: todayKey() }));
    localStorage.setItem('routig.calendar.view', 'agenda');
    window.location.hash = '#/calendar';
    render(<App />);
    expect(await screen.findByText('Entregar redação')).toBeInTheDocument();
    const { getDb } = await import('@/data/db');
    expect(await getDb().events.count()).toBe(0);
  });
});

describe('Inbox (Parte 20)', () => {
  it('capturar com Enter guarda o item e mostra a sugestão', async () => {
    await finishOnboarding();
    window.location.hash = '#/inbox';
    const user = userEvent.setup();
    render(<App />);
    const box = await screen.findByRole('textbox', { name: /Jogue aqui/ });
    await user.type(box, 'estudar vocabulário #alemão{Enter}');
    expect(await screen.findByText('estudar vocabulário #alemão')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Virar tarefa/ })).toBeInTheDocument();
  });
});

describe('aparência (Parte 3.3)', () => {
  it('escolher tema escuro aplica no documento e grava', async () => {
    await finishOnboarding();
    window.location.hash = '#/settings/appearance';
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('radio', { name: 'Escuro' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect((await loadSettings()).theme).toBe('dark');
  });

  it('logo: o vetor aprovado é o oficial e a tela de comparação mostra a data', async () => {
    await finishOnboarding();
    window.location.hash = '#/settings/logo';
    render(<App />);
    expect(await screen.findByText(/Vetor aprovado em .*2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aprovar vetor/ })).not.toBeInTheDocument();
  });
});

describe('ROUTIG Home (V3): a entrada do ecossistema', () => {
  it('abre no Home: saudação, as três experiências e a navegação, sem dados de produtividade', async () => {
    await finishOnboarding();
    window.location.hash = '#/';
    const user = userEvent.setup();
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Navegação do ROUTIG' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Início', 'Control Room', 'Campus', 'District', 'Perfil', 'Configurações', 'Ajuda']);
    expect(await screen.findByRole('heading', { level: 1, name: /^(Bom dia|Boa tarde|Boa noite)!$/ })).toBeInTheDocument();
    for (const name of ['Control Room', 'Campus', 'District']) expect(screen.getByRole('heading', { level: 3, name })).toBeInTheDocument();
    // Nada de resumo de tarefas, cobranças ou números de produtividade na entrada.
    expect(screen.queryByText(/atrasad/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Menu principal' })).not.toBeInTheDocument();
    // Marcar uma favorita só destaca o cartão (e fica guardado).
    await user.click(screen.getByRole('button', { name: 'Marcar Campus como favorita' }));
    expect(screen.getByRole('button', { name: 'Tirar Campus das favoritas' })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('routig.home.favorite')).toBe('campus');
    // Entrar no Control Room leva às telas dos módulos.
    await user.click(screen.getAllByRole('button', { name: /^Entrar/ })[0]!);
    expect(await screen.findByRole('navigation', { name: 'Menu principal' })).toBeInTheDocument();
  });

  it('Perfil, Configurações e Ajuda ficam no Home; o District mostra o projeto sem fingir que há jogo', async () => {
    await finishOnboarding();
    window.location.hash = '#/help';
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Ajuda' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navegação do ROUTIG' })).toBeInTheDocument();
    window.location.hash = '#/district';
    expect(await screen.findByRole('heading', { level: 1, name: 'District' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Jogar/ })).not.toBeInTheDocument();
    window.location.hash = '#/profile';
    await waitFor(() => expect(window.location.hash).toBe('#/profile'));
    expect(await screen.findByRole('navigation', { name: 'Navegação do ROUTIG' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Menu principal' })).not.toBeInTheDocument();
  });
});

describe('ROUTIG Campus (o parque 3D)', () => {
  it('abre em /campus; sem 3D, todos os módulos continuam acessíveis', async () => {
    await finishOnboarding();
    window.location.hash = '#/campus';
    render(<App />);
    expect(await screen.findByRole('alert', {}, { timeout: 8000 })).toHaveTextContent('WebGL');
    const nav = screen.getByRole('navigation', { name: 'Menu' });
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '#/dashboard');
    expect(within(nav).getAllByRole('link').length).toBe(18);
  });
});

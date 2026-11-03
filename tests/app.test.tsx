import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { RoutigDB, setDbForTests } from '@/data/db';
import { loadSettings, saveSettings } from '@/data/settingsRepo';
import { defaultSettings } from '@/domain/settings';

let dbName = '';

beforeEach(() => {
  dbName = `test-app-${Math.random().toString(36).slice(2)}`;
  setDbForTests(new RoutigDB(dbName));
  window.location.hash = '#/';
  document.documentElement.removeAttribute('data-theme');
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
  it('a barra lateral mostra os 16 módulos do menu e o acesso a Profile e Settings', async () => {
    await finishOnboarding();
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Menu principal' });
    expect(within(nav).getAllByRole('link')).toHaveLength(16);
    expect(screen.getAllByRole('link', { name: 'Settings' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Profile' }).length).toBeGreaterThan(0);
  });

  it('ocultar um módulo em Settings tira ele do menu e a escolha fica gravada', async () => {
    await finishOnboarding();
    window.location.hash = '#/settings/navigation';
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Ocultar: Finanças' }));
    const nav = screen.getByRole('navigation', { name: 'Menu principal' });
    expect(within(nav).queryByRole('link', { name: /Finanças/ })).not.toBeInTheDocument();
    expect((await loadSettings()).nav.hidden).toContain('finance');
  });

  it('favoritar coloca o módulo no grupo Favoritos', async () => {
    await finishOnboarding();
    window.location.hash = '#/settings/navigation';
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Favoritar: Academy' }));
    expect(await screen.findByText('Favoritos')).toBeInTheDocument();
    expect((await loadSettings()).nav.favorites).toEqual(['academy']);
  });

  it('módulo ainda não construído mostra a etapa em que chega, sem fingir funcionar', async () => {
    await finishOnboarding();
    window.location.hash = '#/academy';
    render(<App />);
    expect(await screen.findByText('Academy chega na Etapa 2: Aprendizagem')).toBeInTheDocument();
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

  it('logo: o PNG original fica em uso até a aprovação do vetor', async () => {
    await finishOnboarding();
    window.location.hash = '#/settings/logo';
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Aprovar vetor/ }));
    const s = await loadSettings();
    expect(s.brand.vectorApproved).toBe(true);
    expect(s.brand.approvedAt).not.toBeNull();
  });
});

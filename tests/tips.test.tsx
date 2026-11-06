import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { RoutigDB, setDbForTests } from '@/data/db';
import { loadSettings, saveSettings } from '@/data/settingsRepo';
import { defaultSettings } from '@/domain/settings';
import { tipModuleFor } from '@/features/help/ModuleTip';

beforeEach(() => {
  setDbForTests(new RoutigDB(`test-tips-${Math.random().toString(36).slice(2)}`));
  window.location.hash = '#/tasks';
});

describe('dicas nas telas (Parte 29.4)', () => {
  it('só na tela inicial de cada módulo', () => {
    expect(tipModuleFor('/dashboard')).toBe('dashboard');
    expect(tipModuleFor('/')).toBeNull();
    expect(tipModuleFor('/tasks')).toBe('tasks');
    expect(tipModuleFor('/projects/abc')).toBeNull();
    expect(tipModuleFor('/settings/privacy')).toBeNull();
  });

  it('aparece, "Entendi" esconde e fica guardado; desligar some com todas', async () => {
    const s = defaultSettings();
    s.onboarding.completed = true;
    await saveSettings(s);
    const user = userEvent.setup();
    render(<App />);
    const tip = await screen.findByRole('complementary', { name: 'Dica' });
    expect(tip).toHaveTextContent('Crie com Enter ou com a tecla N.');
    await user.click(screen.getAllByRole('button', { name: 'Entendi' })[0]!);
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Dica' })).not.toBeInTheDocument());
    expect((await loadSettings()).tips.dismissed).toEqual(['tasks']);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { RoutigDB, setDbForTests } from '@/data/db';
import { loadDashboardConfig, saveDashboardConfig } from '@/data/dashboardRepo';
import { addCard, builtinProfiles, cycleSize, defaultDashboardConfig, isValidCardId, migrateDashboardConfig, moveCard, removeCard } from '@/domain/dashboard';

beforeEach(() => setDbForTests(new RoutigDB(`test-dashboard-${Math.random().toString(36).slice(2)}`)));

describe('perfis de painel (Parte 5.2)', () => {
  it('tem os três perfis de fábrica, sem cartões repetidos', () => {
    const profiles = builtinProfiles();
    expect(profiles.map((p) => p.id)).toEqual(['complete', 'studies', 'projects']);
    for (const p of profiles) expect(new Set(p.cards.map((c) => c.id)).size).toBe(p.cards.length);
  });

  it('só aceita cartões que existem', () => {
    expect(isValidCardId('tasks')).toBe(true);
    expect(isValidCardId('kpi:tasksOverdue')).toBe(true);
    expect(isValidCardId('kpi:inventado')).toBe(false);
    expect(isValidCardId('sports')).toBe(false); // módulo futuro: só "em breve"
    expect(isValidCardId('academy')).toBe(true);
  });

  it('migração limpa dados ruins e recria os perfis de fábrica', () => {
    const c = migrateDashboardConfig({
      activeId: 'naoexiste',
      profiles: [{ id: 'meu', name: 'Meu', cards: [{ id: 'tasks', size: 'lg' }, { id: 'tasks', size: 'sm' }, { id: 'x', size: 'sm' }, { id: 'notes', size: 'gigante' }] }],
    });
    expect(c.activeId).toBe('complete');
    expect(c.profiles.map((p) => p.id)).toEqual(['meu', 'complete', 'studies', 'projects']);
    expect(c.profiles[0]!.cards).toEqual([{ id: 'tasks', size: 'lg' }]);
    expect(migrateDashboardConfig(null)).toEqual(defaultDashboardConfig());
  });
});

describe('edição do painel', () => {
  const cards = [
    { id: 'today' as const, size: 'lg' as const },
    { id: 'tasks' as const, size: 'md' as const },
  ];

  it('move, muda tamanho, adiciona sem duplicar e remove', () => {
    expect(moveCard(cards, 'tasks', -1).map((c) => c.id)).toEqual(['tasks', 'today']);
    expect(moveCard(cards, 'today', -1)).toBe(cards);
    expect([cycleSize('sm'), cycleSize('md'), cycleSize('lg')]).toEqual(['md', 'lg', 'sm']);
    expect(addCard(cards, 'tasks')).toBe(cards);
    expect(addCard(cards, 'kpi:notesTotal').at(-1)).toEqual({ id: 'kpi:notesTotal', size: 'sm' });
    expect(removeCard(cards, 'today').map((c) => c.id)).toEqual(['tasks']);
  });

  it('grava e lê de volta o perfil ativo e os cartões', async () => {
    expect((await loadDashboardConfig()).activeId).toBe('complete');
    const c = defaultDashboardConfig();
    c.activeId = 'projects';
    c.profiles[2]!.cards = removeCard(c.profiles[2]!.cards, 'activity');
    await saveDashboardConfig(c);
    const back = await loadDashboardConfig();
    expect(back.activeId).toBe('projects');
    expect(back.profiles[2]!.cards.some((x) => x.id === 'activity')).toBe(false);
  });
});

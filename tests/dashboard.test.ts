import { beforeEach, describe, expect, it } from 'vitest';
import { RoutigDB, setDbForTests } from '@/data/db';
import { loadDashboardConfig, saveDashboardConfig } from '@/data/dashboardRepo';
import { addCard, builtinProfiles, cycleSize, defaultDashboardConfig, isActiveProject, isPendingInboxItem, isValidCardId, migrateDashboardConfig, moveCard, removeCard } from '@/domain/dashboard';

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
    expect(isValidCardId('inventado')).toBe(false);
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

describe('contagens do Dashboard com uma definição só', () => {
  it('Inbox: só itens abertos, fora da Lixeira e não adiados para depois de hoje', () => {
    const today = '2026-11-13';
    const item = (over: Partial<{ deletedAt: string | null; status: 'open' | 'processed' | 'archived'; snoozedUntil: string | null }>) => ({ deletedAt: null, status: 'open' as const, snoozedUntil: null, ...over });
    expect(isPendingInboxItem(item({}), today)).toBe(true);
    expect(isPendingInboxItem(item({ snoozedUntil: '2026-11-13' }), today)).toBe(true);
    expect(isPendingInboxItem(item({ snoozedUntil: '2026-11-14' }), today)).toBe(false);
    expect(isPendingInboxItem(item({ status: 'processed' }), today)).toBe(false);
    expect(isPendingInboxItem(item({ deletedAt: '2026-11-10T10:00:00.000Z' }), today)).toBe(false);
  });

  it('projeto ativo: status "Ativo" e fora da Lixeira', () => {
    expect(isActiveProject({ deletedAt: null, status: 'active' })).toBe(true);
    expect(isActiveProject({ deletedAt: null, status: 'planned' })).toBe(false);
    expect(isActiveProject({ deletedAt: null, status: 'paused' })).toBe(false);
    expect(isActiveProject({ deletedAt: null, status: 'idea' })).toBe(false);
    expect(isActiveProject({ deletedAt: '2026-11-10T10:00:00.000Z', status: 'active' })).toBe(false);
  });
});

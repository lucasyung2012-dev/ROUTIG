import { describe, expect, it } from 'vitest';
import { NAV_MODULE_IDS } from '@/app/modules';
import { defaultSettings, migrateSettings, moveModule, normalizeOrder, settingsSchema, toggleIn, visibleModules } from '@/domain/settings';

describe('configurações: padrões', () => {
  it('o padrão é válido e começa no tema automático (Parte 3.3)', () => {
    const s = defaultSettings();
    expect(settingsSchema.safeParse(s).success).toBe(true);
    expect(s.theme).toBe('auto');
    expect(s.locale).toBe('pt-BR');
    expect(s.onboarding.completed).toBe(false);
    expect(s.brand.vectorApproved).toBe(false);
  });

  it('a navegação padrão tem os 16 módulos do menu, sem repetição', () => {
    const s = defaultSettings();
    expect(s.nav.order).toHaveLength(16);
    expect(new Set(s.nav.order).size).toBe(16);
  });
});

describe('configurações: migração', () => {
  it('sem dados salvos, devolve o padrão', () => {
    expect(migrateSettings(undefined)).toEqual(defaultSettings());
    expect(migrateSettings('lixo')).toEqual(defaultSettings());
  });

  it('preserva o que é válido e troca só o que é inválido', () => {
    const s = migrateSettings({ theme: 'dark', locale: 'klingon', profile: { displayName: 'Lu' } });
    expect(s.theme).toBe('dark');
    expect(s.locale).toBe('pt-BR');
    expect(s.profile.displayName).toBe('Lu');
    expect(s.profile.bio).toBe('');
  });

  it('acrescenta módulos novos e remove ids desconhecidos da ordem salva', () => {
    const s = migrateSettings({ nav: { order: ['tasks', 'naoexiste', 'tasks', 'calendar'], hidden: ['dashboard', 'music', 'x'] } });
    expect(s.nav.order.slice(0, 2)).toEqual(['tasks', 'calendar']);
    expect(s.nav.order).toHaveLength(16);
    // Dashboard não pode ser ocultado.
    expect(s.nav.hidden).toEqual(['music']);
  });
});

describe('navegação', () => {
  it('normalizeOrder sempre devolve todos os módulos', () => {
    expect(normalizeOrder([])).toEqual([...NAV_MODULE_IDS]);
  });

  it('moveModule troca vizinhos e respeita as pontas', () => {
    const order = [...NAV_MODULE_IDS];
    expect(moveModule(order, 'calendar', -1).slice(0, 2)).toEqual(['calendar', 'dashboard']);
    expect(moveModule(order, 'dashboard', -1)).toBe(order);
    expect(moveModule(order, 'inbox', 1)).toBe(order);
  });

  it('visibleModules respeita ocultos e a ordem do usuário', () => {
    const s = defaultSettings();
    s.nav.order = moveModule(s.nav.order, 'tasks', -1);
    s.nav.hidden = ['finance'];
    const v = visibleModules(s);
    expect(v).not.toContain('finance');
    expect(v.indexOf('tasks')).toBeLessThan(v.indexOf('languages'));
  });

  it('toggleIn liga e desliga', () => {
    expect(toggleIn(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleIn(['a', 'b'], 'a')).toEqual(['b']);
  });
});

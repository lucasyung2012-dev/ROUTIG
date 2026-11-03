import { describe, expect, it } from 'vitest';
import { MODULES, NAV_MODULE_IDS, SYSTEM_MODULE_IDS } from '@/app/modules';
import { resolveTheme } from '@/services/theme';
import { greetingKey } from '@/features/dashboard/DashboardPage';
import { formatBytes } from '@/services/storage';

describe('módulos (Parte 2.2)', () => {
  it('existem os 18 módulos obrigatórios', () => {
    const all = [...NAV_MODULE_IDS, ...SYSTEM_MODULE_IDS];
    expect(all).toHaveLength(18);
    expect(new Set(all).size).toBe(18);
    for (const id of all) expect(MODULES[id].id).toBe(id);
  });

  it('o menu segue a ordem da Parte 4.1 e Profile e Settings ficam fora dele', () => {
    expect(NAV_MODULE_IDS[0]).toBe('dashboard');
    expect(NAV_MODULE_IDS[NAV_MODULE_IDS.length - 1]).toBe('inbox');
    expect(NAV_MODULE_IDS).not.toContain('profile' as never);
    expect(NAV_MODULE_IDS).not.toContain('settings' as never);
  });

  it('cada módulo tem rota própria', () => {
    const paths = Object.values(MODULES).map((m) => m.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('Dashboard, Profile e Settings não podem ser ocultados', () => {
    expect(MODULES.dashboard.hideable).toBe(false);
    expect(MODULES.profile.hideable).toBe(false);
    expect(MODULES.settings.hideable).toBe(false);
  });
});

describe('tema', () => {
  it('automático segue o sistema; manual ignora', () => {
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('auto', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('utilitários', () => {
  it('saudação por horário', () => {
    expect(greetingKey(7)).toBe('dashboard.morning');
    expect(greetingKey(13)).toBe('dashboard.afternoon');
    expect(greetingKey(22)).toBe('dashboard.evening');
    expect(greetingKey(3)).toBe('dashboard.evening');
  });

  it('formata bytes', () => {
    expect(formatBytes(null, 'pt-BR')).toBe('—');
    expect(formatBytes(512, 'en')).toBe('512 B');
    expect(formatBytes(1536, 'en')).toBe('1.5 KB');
  });
});
